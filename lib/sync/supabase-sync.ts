/**
 * Supabase persistence adapter.
 *
 * Bridges the live in-memory store to the multi-tenant Postgres schema
 * (supabase/schema.sql). Local-first by design:
 *  - With placeholder credentials → never touches the network.
 *  - With real credentials + a signed-in user → syncs tenant-scoped rows.
 *
 * The adapter is deliberately conservative: push is debounced from the
 * store provider, pull is explicit (owner-triggered), and every failure is
 * reported as a status rather than crashing the app.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import type { StoreState } from '@/lib/store';
import type { StockMovementReason } from '@/lib/inventory';

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'synced' | 'error';

/**
 * The schema's own vocabulary for a stock movement. The console's reasons are
 * finer-grained than the table's (`goods-inward` vs `count`), so the mapping is
 * stated once here rather than guessed at each call site.
 */
const SYNC_MOVEMENT_TYPE: Record<StockMovementReason, 'purchase' | 'sale' | 'adjustment' | 'return' | 'opening'> = {
  opening: 'opening',
  sale: 'sale',
  'goods-inward': 'purchase',
  count: 'adjustment',
  return: 'return',
};

export type SyncResult = { ok: boolean; error?: string };

const BUSINESS_ID_KEY = 'dukaanos-business-id';

export function getCachedBusinessId(): string | null {
  try {
    return window.localStorage.getItem(BUSINESS_ID_KEY);
  } catch {
    return null;
  }
}

function cacheBusinessId(id: string) {
  try {
    window.localStorage.setItem(BUSINESS_ID_KEY, id);
  } catch {
    // Ignore storage errors.
  }
}

/** Ensure a business row + owner membership exist for the signed-in user. */
export async function ensureBusiness(businessName = 'My Business'): Promise<{ id: string } | { error: string }> {
  const supabase = getBrowserSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: 'Not signed in.' };

  const cached = getCachedBusinessId();
  if (cached) {
    const { data: existing } = await supabase.from('businesses').select('id').eq('id', cached).maybeSingle();
    if (existing) return { id: existing.id as string };
  }

  // Reuse a business already owned by this user, else create one.
  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membership?.business_id) {
    cacheBusinessId(String(membership.business_id));
    return { id: String(membership.business_id) };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .insert({ name: businessName, owner_id: user.id, currency: 'INR' })
    .select('id')
    .single();
  if (businessError || !business) return { error: businessError?.message ?? 'Could not create business.' };

  const { error: memberError } = await supabase
    .from('business_members')
    .insert({ business_id: business.id, user_id: user.id, role: 'owner' });
  if (memberError) return { error: memberError.message };

  cacheBusinessId(String(business.id));
  return { id: String(business.id) };
}

/** Push the core financial records for the tenant to Supabase. */
export async function pushStateToSupabase(state: StoreState): Promise<SyncResult> {
  const supabase = getBrowserSupabaseClient();
  const business = await ensureBusiness(state.profile.name || 'My Business');
  if ('error' in business) return { ok: false, error: business.error };
  const businessId = business.id;

  // Keep the tenant row's name in sync with the live business profile.
  await supabase.from('businesses').update({ name: state.profile.name || 'My Business' }).eq('id', businessId);

  // ---- Products (with category lookup/creation by name) ----
  const categoryNames = Array.from(new Set(state.products.map((p) => p.category))).filter(Boolean);
  const categoryIdByName = new Map<string, string>();
  for (const name of categoryNames) {
    const { data: existing } = await supabase.from('categories').select('id').eq('business_id', businessId).eq('name', name).maybeSingle();
    if (existing) {
      categoryIdByName.set(name, String(existing.id));
    } else {
      const { data: created } = await supabase.from('categories').insert({ business_id: businessId, name }).select('id').single();
      if (created) categoryIdByName.set(name, String(created.id));
    }
  }

  const { error: productDeleteError } = await supabase.from('products').delete().eq('business_id', businessId);
  if (productDeleteError) return { ok: false, error: `products: ${productDeleteError.message}` };
  if (state.products.length > 0) {
    const rows = state.products.map((product) => ({
      business_id: businessId,
      name: product.name,
      item_type: product.itemType,
      description: product.description ?? product.category,
      category_id: categoryIdByName.get(product.category) ?? null,
      selling_price: product.sellingPrice,
      cost_price: product.cost,
      tax_rate: product.taxRate ?? 0,
      current_stock: product.stock,
      reorder_level: product.reorderLevel,
      sku: product.sku ?? null,
      unit: product.unit ?? null,
      // The codes a counter scanner reads, and how a loose item is weighed.
      barcode: product.barcode ?? null,
      internal_code: product.internalCode ?? null,
      loose_mode: product.looseMode ?? null,
      scale_number: product.scaleNumber ?? null,
      active: product.status === 'Active',
    }));
    const { error } = await supabase.from('products').insert(rows);
    if (error) return { ok: false, error: `products: ${error.message}` };
  }

  // ---- Transactions (the ledger) ----
  const { error: txDeleteError } = await supabase.from('transactions').delete().eq('business_id', businessId);
  if (txDeleteError) return { ok: false, error: `transactions: ${txDeleteError.message}` };
  if (state.transactions.length > 0) {
    const txRows = state.transactions.map((tx) => ({
      business_id: businessId,
      type: tx.type,
      amount: tx.amount,
      account_type: tx.account,
      direction: tx.direction,
      subtype: tx.paymentMethod ?? null,
      notes: tx.description,
      created_at: `${tx.date}T12:00:00.000Z`,
    }));
    const { error } = await supabase.from('transactions').insert(txRows);
    if (error) return { ok: false, error: `transactions: ${error.message}` };
  }

  // ---- Customers ----
  const { error: customerDeleteError } = await supabase.from('customers').delete().eq('business_id', businessId);
  if (customerDeleteError) return { ok: false, error: `customers: ${customerDeleteError.message}` };
  if (state.customers.length > 0) {
    const customerRows = state.customers.map((customer) => ({
      business_id: businessId,
      name: customer.name,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      notes: customer.details ?? null,
      active: true,
    }));
    const { error } = await supabase.from('customers').insert(customerRows);
    if (error) return { ok: false, error: `customers: ${error.message}` };
  }

  // ---- Marketing campaigns ----
  const { error: campaignDeleteError } = await supabase.from('marketing_campaigns').delete().eq('business_id', businessId);
  if (campaignDeleteError) return { ok: false, error: `marketing_campaigns: ${campaignDeleteError.message}` };
  if (state.campaigns.length > 0) {
    const campaignRows = state.campaigns.map((campaign) => ({
      business_id: businessId,
      name: campaign.name,
      channel: campaign.channel,
      spend: campaign.spend,
      notes: campaign.notes ?? null,
      start_date: campaign.startDate,
    }));
    const { error } = await supabase.from('marketing_campaigns').insert(campaignRows);
    if (error) return { ok: false, error: `marketing_campaigns: ${error.message}` };
  }

  // ---- Scan events (the counter's read log, including unmatched codes) ----
  const { error: scanDeleteError } = await supabase.from('scan_events').delete().eq('business_id', businessId);
  if (scanDeleteError) return { ok: false, error: `scan_events: ${scanDeleteError.message}` };
  if (state.scanEvents.length > 0) {
    const scanRows = state.scanEvents.slice(0, 500).map((event) => ({
      business_id: businessId,
      code: event.code,
      symbology: event.symbology,
      source: event.source,
      context: event.context,
      outcome: event.outcome,
      // Product ids are minted client-side and re-created on push, so the
      // readable name travels with the row; the link is best-effort.
      product_id: null,
      product_name: event.productName ?? null,
      quantity: event.quantity ?? null,
      scanned_by: event.by ?? null,
      created_at: event.at,
    }));
    const { error } = await supabase.from('scan_events').insert(scanRows);
    if (error) return { ok: false, error: `scan_events: ${error.message}` };
  }

  // ---- Stock ledger (see lib/inventory) ----
  // The movement history is the shop's proof for every on-hand figure, so it
  // travels with the data: same signed delta, same balance it produced. Keyed by
  // the device's movement id, and matched to the item by name (the same way the
  // rest of this push resolves products) so a re-sync updates rather than
  // duplicates.
  const { error: movementDeleteError } = await supabase.from('inventory_movements').delete().eq('business_id', businessId);
  if (movementDeleteError) return { ok: false, error: `inventory_movements: ${movementDeleteError.message}` };
  if (state.stockMovements.length > 0) {
    const productRows = await supabase.from('products').select('id, name').eq('business_id', businessId);
    const productIdByName = new Map<string, string>((productRows.data ?? []).map((row) => [String(row.name), String(row.id)]));
    const movementRows = state.stockMovements.slice(0, 2000).flatMap((movement) => {
      const productId = productIdByName.get(movement.productName);
      if (!productId) return [];
      return [
        {
          business_id: businessId,
          product_id: productId,
          movement_type: SYNC_MOVEMENT_TYPE[movement.reason],
          quantity: Math.abs(movement.delta),
          delta: movement.delta,
          balance_after: movement.balance,
          reference_text: movement.reference ?? null,
          movement_key: movement.id,
          unit: movement.unit ?? null,
          notes: movement.note,
          created_at: movement.at,
        },
      ];
    });
    if (movementRows.length > 0) {
      const { error } = await supabase.from('inventory_movements').insert(movementRows);
      if (error) return { ok: false, error: `inventory_movements: ${error.message}` };
    }
  }

  // ---- Fingerprint enrolments (credential ids only — never biometric data) ----
  const { error: biometricDeleteError } = await supabase.from('biometric_credentials').delete().eq('business_id', businessId);
  if (biometricDeleteError) return { ok: false, error: `biometric_credentials: ${biometricDeleteError.message}` };
  if (state.biometricCredentials.length > 0) {
    const memberRows = await supabase.from('members').select('id, name').eq('business_id', businessId);
    const memberIdByName = new Map<string, string>(
      (memberRows.data ?? []).map((row) => [String(row.name), String(row.id)]),
    );
    const biometricRows = state.biometricCredentials.flatMap((credential) => {
      const memberId = memberIdByName.get(credential.memberName);
      if (!memberId) return [];
      return [
        {
          business_id: businessId,
          member_id: memberId,
          credential_id: credential.credentialId,
          attachment: credential.attachment,
          label: credential.label,
          use_count: credential.useCount,
          last_used_at: credential.lastUsedAt ?? null,
          created_at: credential.createdAt,
        },
      ];
    });
    if (biometricRows.length > 0) {
      const { error } = await supabase.from('biometric_credentials').insert(biometricRows);
      if (error) return { ok: false, error: `biometric_credentials: ${error.message}` };
    }
  }

  // ---- Audit log (append-only) ----
  if (state.audit.length > 0) {
    const auditRows = state.audit.slice(0, 50).map((entry) => ({
      business_id: businessId,
      actor_user_id: null,
      entity_type: entry.type,
      action: entry.type,
      details: { summary: entry.summary, actor: entry.actor, reference: entry.reference ?? null, at: entry.createdAt },
      created_at: entry.createdAt,
    }));
    await supabase.from('audit_logs').insert(auditRows);
  }

  // ---- Business settings ----
  const { data: settingsRow } = await supabase.from('business_settings').select('id').eq('business_id', businessId).maybeSingle();
  const settingsPayload = {
    receipt_mode: state.settings.receiptMode,
    send_sms_reminders: state.settings.sendSmsReminders,
    send_whatsapp_reminders: state.settings.sendWhatsappReminders,
    auto_generate_invoice_number: state.settings.autoGenerateInvoiceNumber,
    tax_rate: state.settings.taxRate,
    allow_memberships: state.settings.allowMemberships,
    allow_inventory: state.settings.allowInventory,
    allow_appointments: state.settings.allowAppointments,
    allow_digital_receipts: state.settings.allowDigitalReceipts,
    allow_physical_receipts: state.settings.allowPhysicalReceipts,
  };
  if (settingsRow) {
    await supabase.from('business_settings').update(settingsPayload).eq('business_id', businessId);
  } else {
    await supabase.from('business_settings').insert({ business_id: businessId, ...settingsPayload });
  }

  return { ok: true };
}

/**
 * Pull the tenant's persisted records back into the app.
 * Owner-triggered only — never overwrites local work silently.
 */
export async function pullStateFromSupabase(): Promise<{ ok: boolean; error?: string; summary?: string }> {
  const supabase = getBrowserSupabaseClient();
  const cached = getCachedBusinessId();
  if (!cached) return { ok: false, error: 'No business connected on this device yet.' };

  const [{ data: productRows }, { data: txRows }, { data: customerRows }, { data: scanRows }, { data: credentialRows }] =
    await Promise.all([
      supabase.from('products').select('*').eq('business_id', cached),
      supabase.from('transactions').select('*').eq('business_id', cached).order('created_at', { ascending: true }),
      supabase.from('customers').select('*').eq('business_id', cached),
      // Capture records: the scan log and the enrolled credential ids. Both are
      // additive to the catalogue above, so a missing table (an older project
      // that has not run Increment 8 yet) must not turn the whole pull into an
      // error — the summary simply says they are not there.
      supabase.from('scan_events').select('code, outcome').eq('business_id', cached),
      supabase.from('biometric_credentials').select('member_id, credential_id, use_count').eq('business_id', cached),
    ]);

  const products = productRows ?? [];
  const coded = products.filter(
    (row) => (typeof row.barcode === 'string' && row.barcode !== '') || (typeof row.internal_code === 'string' && row.internal_code !== ''),
  ).length;
  const unmatched = (scanRows ?? []).filter((row) => row.outcome === 'unmatched').length;

  const capture: string[] = [];
  if (coded > 0) capture.push(`, ${coded} carrying a scannable code`);
  if (scanRows) capture.push(`, ${scanRows.length} scans on record${unmatched > 0 ? ` (${unmatched} still waiting for a code)` : ''}`);
  if (credentialRows) capture.push(`, ${credentialRows.length} fingerprint enrolment${credentialRows.length === 1 ? '' : 's'}`);
  if (scanRows === null && credentialRows === null) capture.push('; no capture tables found — run the scanning section of supabase/schema.sql');

  return {
    ok: true,
    summary: `Found ${products.length} products${capture.join('')}, ${(txRows?.length ?? 0)} ledger entries, ${(customerRows?.length ?? 0)} customers for this business.`,
  };
}
