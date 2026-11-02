import { ReplicationError, type Envelope } from './types';
import { CloudStore, tenantKey, type CustomerRow, type InventoryRow, type InvoiceRow } from './store';

const MAX = 9_000_000_000_000n;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new ReplicationError('INVALID_ENVELOPE', `${label} must be an integer.`);
    const parsed = BigInt(value);
    if (parsed > MAX || parsed < -MAX) throw new ReplicationError('INVALID_ENVELOPE', `${label} exceeds native bounds.`);
    return parsed;
  }
  if (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed > MAX || parsed < -MAX) throw new ReplicationError('INVALID_ENVELOPE', `${label} exceeds native bounds.`);
    return parsed;
  }
  throw new ReplicationError('INVALID_ENVELOPE', `${label} must be an integer.`);
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 120) : fallback;
}

function applyInvoice(store: CloudStore, envelope: Envelope): void {
  const payload = record(envelope.payload) ? envelope.payload : {};
  const invoice = record(payload.invoice) ? payload.invoice : payload;
  const total = integer(invoice.totalPaise, 'Invoice total');
  const tender = invoice.tender;
  const customerId = typeof invoice.customerId === 'string' ? invoice.customerId : null;
  const counterparty = text(invoice.customerName, customerId ?? 'Walk-in');
  let cash = 0n;
  let credit = 0n;
  let splitComplete = false;
  if (tender === 'cash') {
    cash = total;
    splitComplete = true;
  } else if (tender === 'credit') {
    credit = total;
    splitComplete = true;
  }
  const row: InvoiceRow = {
    operationId: envelope.operationId,
    occurredAtIso: envelope.occurredAtIso,
    counterparty,
    totalPaise: total,
    cashPaise: cash,
    creditPaise: credit,
    splitComplete,
    customerId,
  };
  store.invoices.set(tenantKey(envelope.businessId, envelope.operationId), row);
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  for (const line of lines) {
    if (!record(line) || typeof line.productId !== 'string') continue;
    const qty = integer(line.quantityMilli, 'Line quantity');
    const existing = store.inventory.get(tenantKey(envelope.businessId, line.productId));
    if (!existing) continue;
    const next = existing.quantityMilli - qty;
    if (next < 0n) throw new ReplicationError('INVALID_ENVELOPE', 'Inventory projection would go negative.');
    existing.quantityMilli = next;
    existing.updatedAtIso = envelope.occurredAtIso;
  }
}

function applyRetailSale(store: CloudStore, envelope: Envelope): void {
  const payload = record(envelope.payload) ? envelope.payload : {};
  const receipt = record(payload.receipt) ? payload.receipt : payload;
  const data = record(receipt.data) ? receipt.data : {};
  const invoice = record(data.invoice) ? data.invoice : null;
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const invoiceId =
    (invoice && typeof invoice.id === 'string' && invoice.id) ||
    (typeof data.invoiceId === 'string' && data.invoiceId) ||
    envelope.operationId;
  const row = store.invoices.get(tenantKey(envelope.businessId, invoiceId));
  if (!row || payments.length === 0) return;
  let cash = 0n;
  let other = 0n;
  for (const part of payments) {
    if (!record(part)) continue;
    const amount = integer(part.amountPaise, 'Payment part');
    if (part.method === 'cash') cash += amount;
    else other += amount;
  }
  if (cash + other !== row.totalPaise) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Retail payments must equal the invoice total.');
  }
  row.cashPaise = cash;
  row.creditPaise = other;
  row.splitComplete = true;
}

function applyCustomer(store: CloudStore, envelope: Envelope): void {
  const payload = record(envelope.payload) ? envelope.payload : {};
  const kind = typeof payload.kind === 'string' ? payload.kind : envelope.eventType;
  const value = record(payload.value) ? payload.value : payload;
  if (kind === 'customer.saved') {
    const id = typeof value.id === 'string' ? value.id : envelope.operationId;
    const existing = store.customers.get(tenantKey(envelope.businessId, id));
    const outstanding = typeof value.balancePaise === 'string' ? integer(value.balancePaise, 'Balance') : existing?.outstandingPaise ?? 0n;
    const row: CustomerRow = {
      customerId: id,
      name: text(value.name, existing?.name ?? id),
      phone: typeof value.phone === 'string' ? value.phone : existing?.phone ?? null,
      outstandingPaise: outstanding,
      creditLimitPaise: value.creditLimitPaise == null ? existing?.creditLimitPaise ?? null : integer(value.creditLimitPaise, 'Credit limit'),
      lastActivityIso: envelope.occurredAtIso,
    };
    store.customers.set(tenantKey(envelope.businessId, id), row);
    return;
  }
  if (kind === 'credit.posted' || kind === 'credit.linked') {
    const customerId = typeof value.customerId === 'string' ? value.customerId : '';
    if (!customerId) return;
    const amount = integer(value.amountPaise, 'Credit amount');
    const creditKind = typeof value.kind === 'string' ? value.kind : kind;
    const delta =
      creditKind === 'repayment' || creditKind === 'write_off' ? -amount : amount;
    const direction: 'debit' | 'credit' = delta < 0n ? 'credit' : 'debit';
    bumpCustomer(
      store,
      envelope.businessId,
      customerId,
      text(value.name, customerId),
      delta,
      envelope.occurredAtIso,
      direction,
      creditKind,
      typeof value.balancePaise === 'string' ? integer(value.balancePaise, 'Balance') : null,
    );
  }
}

function applyInventory(store: CloudStore, envelope: Envelope): void {
  const payload = record(envelope.payload) ? envelope.payload : {};
  const product = record(payload.product) ? payload.product : payload;
  if (typeof product.id !== 'string') return;
  const qty = integer(product.stockMilli ?? product.quantityMilli ?? 0, 'Stock');
  const row: InventoryRow = {
    productId: product.id,
    name: text(product.name, product.id),
    sku: text(product.sku, product.id).slice(0, 40),
    quantityMilli: qty < 0n ? 0n : qty,
    reorderMilli: integer(product.reorderMilli ?? 0, 'Reorder'),
    updatedAtIso: envelope.occurredAtIso,
  };
  store.inventory.set(tenantKey(envelope.businessId, product.id), row);
}

function bumpCustomer(
  store: CloudStore,
  businessId: string,
  customerId: string,
  name: string,
  delta: bigint,
  at: string,
  direction: 'debit' | 'credit',
  narrative: string,
  absolute: bigint | null,
): void {
  const key = tenantKey(businessId, customerId);
  const current = store.customers.get(key) ?? {
    customerId,
    name,
    phone: null,
    outstandingPaise: 0n,
    creditLimitPaise: null,
    lastActivityIso: at,
  };
  current.outstandingPaise = absolute ?? current.outstandingPaise + delta;
  current.lastActivityIso = at;
  if (name && name !== customerId) current.name = name;
  store.customers.set(key, current);
  const lines = store.statements.get(key) ?? [];
  lines.push({
    id: `${customerId}-stmt-${lines.length + 1}`,
    occurredAtIso: at,
    narrative,
    amountPaise: delta < 0n ? -delta : delta,
    direction,
  });
  store.statements.set(key, lines);
}

export function projectEvent(store: CloudStore, envelope: Envelope): void {
  if (envelope.eventType === 'invoice.posted' || envelope.stream === 'billing') applyInvoice(store, envelope);
  else if (envelope.stream === 'retail') applyRetailSale(store, envelope);
  else if (envelope.stream === 'customer') applyCustomer(store, envelope);
  else if (envelope.stream === 'inventory') applyInventory(store, envelope);
}
