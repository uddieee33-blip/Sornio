/**
 * Supabase persistence adapter.
 *
 * Bridges the live in-memory store to the multi-tenant Postgres schema
 * (supabase/schema.sql). Local-first by design:
 *  - With placeholder credentials → never touches the network.
 *  - With real credentials + a signed-in user → syncs tenant-scoped rows.
 *
 * Repairs in this file (see the recovery plan, October 2026):
 *  - A push is ONE database call (`push_tenant_snapshot`). The old code deleted
 *    every table and then inserted, so a failure midway left the cloud empty.
 *    A function runs in a single transaction: all of it, or none of it.
 *  - Row ids are stable. The same local record always maps to the same uuid,
 *    so a re-sync replaces rather than duplicates, and history keeps its links.
 *  - The database refuses an empty snapshot over a populated business, so a
 *    device that has not restored yet cannot wipe the shop.
 *  - `fetchCloudSnapshot` restores the catalogue, ledger, customers and stock
 *    ledger onto an empty device. It used to return a text summary and nothing
 *    reached the screen.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import type { StoreState, Customer } from '@/lib/store';
import type { Product, Transaction } from '@/lib/business-data';
import { STOCK_LEDGER_LIMIT, type StockMovement, type StockMovementReason } from '@/lib/inventory';

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

const REASON_FROM_TYPE: Record<string, StockMovementReason> = {
  opening: 'opening',
  sale: 'sale',
  purchase: 'goods-inward',
  adjustment: 'count',
  return: 'return',
};

export type SyncResult = { ok: boolean; error?: string };

const BUSINESS_ID_KEY = 'dukaanos-business-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * A deterministic uuid for a local record, scoped to its business. Local ids
 * like `p1` or `t-8f2c…` are not uuids, and a fresh random uuid per push would
 * make every sync a new set of rows. A uuid that is already a uuid (a record
 * restored from the cloud) is kept as it is.
 */
export async function stableId(businessId: string, kind: string, localId: string): Promise<string> {
  if (UUID_RE.test(localId)) return localId.toLowerCase();
  const bytes = new TextEncoder().encode(`dukaanos:${businessId}:${kind}:${localId}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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

  // Reuse a business this user already belongs to, else create one.
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

  /*
   * The id is minted here rather than read back from the insert: a RETURNING
   * row is served through the table's SELECT policies, which ask for a
   * membership that cannot exist before the business it points at.
   */
  const businessId = crypto.randomUUID();

  const { error: businessError } = await supabase
    .from('businesses')
    .insert({ id: businessId, name: businessName, owner_id: user.id, currency: 'INR' });
  if (businessError) return { error: businessError.message };

  // The owner membership is written by the database trigger `on_business_created`
  // (SECURITY DEFINER). Clients cannot insert membership rows any more: that
  // policy let any signed-in user seat themselves as owner of any business.
  cacheBusinessId(businessId);
  return { id: businessId };
}

/** Build the one payload the database replaces a business's records with. */
// (See pushStateToSupabase for the single atomic call that consumes it.)
async function buildSnapshot(state: StoreState, businessId: string) {
  const supabase = getBrowserSupabaseClient();

  // Categories: one per distinct name, stable per business.
  const categoryNames = Array.from(new Set(state.products.map((p) => p.category))).filter(Boolean);
  const categoryIdByName = new Map<string, string>();
  for (const name of categoryNames) categoryIdByName.set(name, await stableId(businessId, 'category', name));
  const categories = categoryNames.map((name) => ({ id: categoryIdByName.get(name), name }));

  const productIdByLocal = new Map<string, string>();
  for (const product of state.products) {
    productIdByLocal.set(product.id, await stableId(businessId, 'product', product.id));
  }

  const products = state.products.map((product) => ({
    id: productIdByLocal.get(product.id),
    name: product.name,
    item_type: product.itemType,
    category_id: categoryIdByName.get(product.category) ?? null,
    // Description falls back to the category, as it always has.
    description: product.description ?? product.category,
    selling_price: product.sellingPrice,
    cost_price: product.cost,
    tax_rate: product.taxRate ?? 0,
    current_stock: product.stock,
    reorder_level: product.reorderLevel,
    sku: product.sku ?? null,
    unit: product.unit ?? null,
    barcode: product.barcode ?? null,
    internal_code: product.internalCode ?? null,
    loose_mode: product.looseMode ?? null,
    scale_number: product.scaleNumber ?? null,
    active: product.status === 'Active',
  }));

  const transactions = await Promise.all(
    state.transactions.map(async (tx) => ({
      id: await stableId(businessId, 'transaction', tx.id),
      type: tx.type,
      subtype: tx.paymentMethod ?? null,
      amount: tx.amount,
      account_type: tx.account,
      direction: tx.direction,
      notes: tx.description,
      // The line items of a sale, so product profitability and history survive a
      // reinstall. Product ids are rewritten to the same stable ids as the catalogue.
      items: tx.items
        ? tx.items.map((item) => ({ ...item, productId: productIdByLocal.get(item.productId) ?? item.productId }))
        : null,
      created_at: `${tx.date}T12:00:00.000Z`,
    })),
  );

  const customers = await Promise.all(
    state.customers.map(async (customer) => ({
      id: await stableId(businessId, 'customer', customer.id),
      name: customer.name,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      notes: customer.details ?? null,
      active: true,
    })),
  );

  const campaigns = await Promise.all(
    state.campaigns.map(async (campaign) => ({
      id: await stableId(businessId, 'campaign', campaign.id),
      name: campaign.name,
      channel: campaign.channel,
      spend: campaign.spend,
      notes: campaign.notes ?? null,
      start_date: campaign.startDate,
    })),
  );

  // The counter's read log, including codes that matched nothing.
  const scanEvents = await Promise.all(
    state.scanEvents.slice(0, 2000).map(async (event) => ({
      id: await stableId(businessId, 'scan', event.id),
      code: event.code,
      symbology: event.symbology,
      source: event.source,
      context: event.context,
      outcome: event.outcome,
      product_id: event.productId ? (productIdByLocal.get(event.productId) ?? null) : null,
      product_name: event.productName ?? null,
      quantity: event.quantity ?? null,
      scanned_by: event.by ?? null,
      created_at: event.at,
    })),
  );

  // The stock ledger is the proof behind every on-hand figure, so it is sent in
  // full up to the local ledger limit (it used to stop at 2,000 silently).
  const stockMovements = await Promise.all(
    state.stockMovements.slice(0, STOCK_LEDGER_LIMIT).flatMap((movement) => {
      const productId = productIdByLocal.get(movement.productId);
      if (!productId) return [];
      return [
        (async () => ({
          id: await stableId(businessId, 'movement', movement.id),
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
        }))(),
      ];
    }),
  );

  // Fingerprint enrolments: credential ids only, never biometric data. Members
  // are matched by name, as products always were; the member table is not rewritten.
  let biometricCredentials: Record<string, unknown>[] = [];
  if (state.biometricCredentials.length > 0) {
    const { data: memberRows } = await supabase.from('members').select('id, name').eq('business_id', businessId);
    const memberIdByName = new Map<string, string>((memberRows ?? []).map((row) => [String(row.name), String(row.id)]));
    biometricCredentials = await Promise.all(
      state.biometricCredentials.flatMap((credential) => {
        const memberId = memberIdByName.get(credential.memberName);
        if (!memberId) return [];
        return [
          (async () => ({
            id: await stableId(businessId, 'biometric', credential.credentialId),
            member_id: memberId,
            credential_id: credential.credentialId,
            attachment: credential.attachment,
            label: credential.label,
            use_count: credential.useCount,
            last_used_at: credential.lastUsedAt ?? null,
            created_at: credential.createdAt,
          }))(),
        ];
      }),
    );
  }

  return {
    categories,
    products,
    transactions,
    customers,
    campaigns,
    scanEvents,
    stockMovements,
    biometricCredentials,
  };
}

/** Push the tenant's records to Supabase in one atomic database call. */
export async function pushStateToSupabase(state: StoreState): Promise<SyncResult> {
  const supabase = getBrowserSupabaseClient();
  const business = await ensureBusiness(state.profile.name || 'My Business');
  if ('error' in business) return { ok: false, error: business.error };
  const businessId = business.id;

  // Keep the tenant row's name in sync with the live business profile.
  await supabase.from('businesses').update({ name: state.profile.name || 'My Business' }).eq('id', businessId);

  const snapshot = await buildSnapshot(state, businessId);
  const { error } = await supabase.rpc('push_tenant_snapshot', {
    p_business_id: businessId,
    p_snapshot: snapshot,
    p_allow_empty: false,
  });
  if (error) {
    // P0001: this device has nothing but the cloud has records. Nothing was written.
    if (error.code === 'P0001') {
      return { ok: false, error: 'This device has no records yet, but the cloud copy does. Restore from the cloud before syncing.' };
    }
    return { ok: false, error: `sync: ${error.message}` };
  }

  // Audit trail: append-only, deduplicated by a stable id so each push only adds
  // entries the cloud has not seen. (It used to re-insert the same 50 every push.)
  if (state.audit.length > 0) {
    const auditRows = await Promise.all(
      state.audit.slice(0, 300).map(async (entry) => ({
        id: await stableId(businessId, 'audit', `${entry.createdAt}|${entry.type}|${entry.summary}`),
        business_id: businessId,
        actor_user_id: null,
        entity_type: entry.type,
        action: entry.type,
        details: { summary: entry.summary, actor: entry.actor, reference: entry.reference ?? null, at: entry.createdAt },
        created_at: entry.createdAt,
      })),
    );
    await supabase.from('audit_logs').upsert(auditRows, { onConflict: 'id', ignoreDuplicates: true });
  }

  // Business settings: one row per business, updated in place.
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

export type CloudSnapshot = {
  products: Product[];
  transactions: Transaction[];
  customers: Customer[];
  stockMovements: StockMovement[];
};

/**
 * Read the tenant's records back in the console's own shapes, for restoring an
 * empty device. Read-only: it never writes to the cloud or to local state. The
 * caller decides whether to apply it.
 *
 * Not carried by the cloud schema (so not restored): a customer's opening balance
 * and bank/UPI details, and the audit chain's hashes.
 */
export async function fetchCloudSnapshot(): Promise<
  { ok: true; empty: boolean; snapshot: CloudSnapshot } | { ok: false; error: string }
> {
  const supabase = getBrowserSupabaseClient();
  // A brand-new device has no cached business yet: find the one this user belongs to.
  let businessId = getCachedBusinessId();
  if (!businessId) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return { ok: false, error: 'Not signed in.' };
    const { data: membership } = await supabase
      .from('business_members')
      .select('business_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!membership?.business_id) return { ok: false, error: 'No business connected to this account yet.' };
    businessId = String(membership.business_id);
    cacheBusinessId(businessId);
  }

  const [productRes, txRes, customerRes, movementRes] = await Promise.all([
    supabase.from('products').select('*, categories(name)').eq('business_id', businessId),
    supabase.from('transactions').select('*').eq('business_id', businessId).order('created_at', { ascending: true }),
    supabase.from('customers').select('*').eq('business_id', businessId),
    supabase.from('inventory_movements').select('*').eq('business_id', businessId).order('created_at', { ascending: true }),
  ]);
  const failed = [productRes, txRes, customerRes, movementRes].find((res) => res.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  const productRows = productRes.data ?? [];
  const nameById = new Map<string, string>(productRows.map((row) => [String(row.id), String(row.name)]));

  const products: Product[] = productRows.map((row) => {
    const category = (row.categories as { name?: string } | null)?.name ?? String(row.description ?? 'General');
    return {
      id: String(row.id),
      name: String(row.name),
      category,
      itemType: row.item_type === 'service' ? 'service' : 'product',
      sellingPrice: Number(row.selling_price),
      cost: Number(row.cost_price),
      stock: Number(row.current_stock),
      reorderLevel: Number(row.reorder_level),
      status: row.active === false ? 'Inactive' : 'Active',
      taxRate: Number(row.tax_rate) || undefined,
      description: (row.description as string | null) ?? undefined,
      sku: (row.sku as string | null) ?? undefined,
      unit: (row.unit as string | null) ?? undefined,
      barcode: (row.barcode as string | null) ?? undefined,
      internalCode: (row.internal_code as string | null) ?? undefined,
      looseMode: (row.loose_mode as Product['looseMode']) ?? undefined,
      scaleNumber: (row.scale_number as number | null) ?? undefined,
    };
  });

  const transactions: Transaction[] = (txRes.data ?? []).map((row) => ({
    id: String(row.id),
    type: row.type as Transaction['type'],
    description: String(row.notes ?? ''),
    amount: Number(row.amount),
    direction: row.direction as Transaction['direction'],
    account: row.account_type as Transaction['account'],
    paymentMethod: (row.subtype as Transaction['paymentMethod']) ?? undefined,
    date: String(row.created_at).slice(0, 10),
    items: (row.items as Transaction['items']) ?? undefined,
  }));

  const customers: Customer[] = (customerRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    phone: (row.phone as string | null) ?? undefined,
    email: (row.email as string | null) ?? undefined,
    details: (row.notes as string | null) ?? undefined,
    openingBalance: 0,
    createdAt: String(row.created_at),
  }));

  const stockMovements: StockMovement[] = (movementRes.data ?? []).map((row) => ({
    id: String(row.movement_key ?? row.id),
    productId: String(row.product_id),
    productName: nameById.get(String(row.product_id)) ?? 'Item',
    at: String(row.created_at),
    reason: REASON_FROM_TYPE[String(row.movement_type)] ?? 'count',
    delta: Number(row.delta ?? 0),
    balance: Number(row.balance_after ?? 0),
    note: String(row.notes ?? ''),
    reference: (row.reference_text as string | null) ?? undefined,
    unit: (row.unit as string | null) ?? undefined,
  }));

  return {
    ok: true,
    empty: products.length === 0 && transactions.length === 0 && customers.length === 0,
    snapshot: { products, transactions, customers, stockMovements },
  };
}
