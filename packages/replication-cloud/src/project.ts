import { allocationForTender, classifyPayments, parsePaymentParts } from './payments';
import { ReplicationError, type Envelope } from './types';
import { CloudStore, tenantKey, type CustomerRow, type InventoryRow, type InvoiceRow, type PendingRetail } from './store';

const MAX = 9_000_000_000_000n;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, label: string, signed = false): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new ReplicationError('INVALID_ENVELOPE', `${label} must be an integer.`);
    const parsed = BigInt(value);
    if (parsed > MAX || parsed < (signed ? -MAX : 0n)) {
      throw new ReplicationError('INVALID_ENVELOPE', `${label} exceeds native bounds.`);
    }
    return parsed;
  }
  if (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed > MAX || parsed < (signed ? -MAX : 0n)) {
      throw new ReplicationError('INVALID_ENVELOPE', `${label} exceeds native bounds.`);
    }
    return parsed;
  }
  throw new ReplicationError('INVALID_ENVELOPE', `${label} must be an integer.`);
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 120) : fallback;
}

function completeInvoice(row: InvoiceRow, cash: bigint, digital: bigint, credit: bigint, retailOperationId: string | null): void {
  if (cash + digital + credit !== row.totalPaise) {
    throw new ReplicationError('CONFLICT', 'Linked payment totals disagree with the invoice.');
  }
  row.cashPaise = cash;
  row.digitalPaise = digital;
  row.customerCreditPaise = credit;
  row.retailOperationId = retailOperationId;
  row.allocation = 'posted';
}

function applyPendingToInvoice(store: CloudStore, envelope: Envelope, row: InvoiceRow): void {
  const pending = store.pendingRetail.get(tenantKey(envelope.businessId, row.invoiceId));
  if (!pending) return;
  const classified = classifyPayments(pending.payments, row.totalPaise, row.customerId);
  completeInvoice(row, classified.cashPaise, classified.digitalPaise, classified.customerCreditPaise, pending.retailOperationId);
  store.pendingRetail.delete(tenantKey(envelope.businessId, row.invoiceId));
}

function applyInvoice(store: CloudStore, envelope: Envelope): void {
  const payload = record(envelope.payload) ? envelope.payload : {};
  const invoice = record(payload.invoice) ? payload.invoice : payload;
  const total = integer(invoice.totalPaise, 'Invoice total');
  const customerId = typeof invoice.customerId === 'string' ? invoice.customerId : null;
  const invoiceId = typeof invoice.id === 'string' ? invoice.id : envelope.operationId;
  if (invoiceId !== envelope.operationId) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Billing operation identity must equal the invoice identity.');
  }
  const tender = invoice.tender;
  const seed = allocationForTender(tender, total, customerId);
  if (!seed) throw new ReplicationError('INVALID_ENVELOPE', 'Unknown invoice tender.');
  const row: InvoiceRow = {
    invoiceId,
    billingOperationId: envelope.operationId,
    retailOperationId: null,
    occurredAtIso: envelope.occurredAtIso,
    counterparty: text(invoice.customerName, customerId ?? 'Walk-in'),
    totalPaise: total,
    cashPaise: seed.cashPaise,
    digitalPaise: seed.digitalPaise,
    customerCreditPaise: seed.customerCreditPaise,
    allocation: seed.complete ? 'posted' : 'pending',
    customerId,
    tender: tender as InvoiceRow['tender'],
  };
  store.invoices.set(tenantKey(envelope.businessId, invoiceId), row);
  if (!seed.complete) applyPendingToInvoice(store, envelope, row);
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

function retailInvoiceId(payload: Record<string, unknown>, envelope: Envelope): string {
  const receipt = record(payload.receipt) ? payload.receipt : payload;
  const data = record(receipt.data) ? receipt.data : {};
  const invoice = record(data.invoice) ? data.invoice : null;
  const invoiceId =
    (invoice && typeof invoice.id === 'string' && invoice.id) ||
    (typeof data.invoiceId === 'string' && data.invoiceId) ||
    null;
  if (!invoiceId) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Retail sale is missing the invoice identity.');
  }
  // Native Action::Sale uses the invoice id as the retail operation id.
  // Activity identity is still the invoice id from the payload. Billing and
  // retail uniqueness is per stream, so the same operation id may exist on both.
  return invoiceId;
}

function applyRetailSale(store: CloudStore, envelope: Envelope): void {
  const payload = record(envelope.payload) ? envelope.payload : {};
  const receipt = record(payload.receipt) ? payload.receipt : payload;
  const kind = typeof receipt.kind === 'string' ? receipt.kind : envelope.eventType;
  if (kind !== 'sale' && kind !== 'retail.sale') return;
  const data = record(receipt.data) ? receipt.data : {};
  const invoiceId = retailInvoiceId(payload, envelope);
  const payments = data.payments;
  parsePaymentParts(payments);
  const existing = store.invoices.get(tenantKey(envelope.businessId, invoiceId));
  const pending: PendingRetail = {
    retailOperationId: envelope.operationId,
    invoiceId,
    occurredAtIso: envelope.occurredAtIso,
    payloadSha256: envelope.payloadSha256,
    payments,
  };
  if (!existing) {
    const prior = store.pendingRetail.get(tenantKey(envelope.businessId, invoiceId));
    if (prior && prior.payloadSha256 !== envelope.payloadSha256) {
      throw new ReplicationError('CONFLICT', 'A different retail receipt already targets this invoice.');
    }
    store.pendingRetail.set(tenantKey(envelope.businessId, invoiceId), pending);
    return;
  }
  if (existing.tender !== 'retail') {
    throw new ReplicationError('CONFLICT', 'A non-retail invoice cannot take retail payment parts.');
  }
  const classified = classifyPayments(payments, existing.totalPaise, existing.customerId);
  if (existing.allocation === 'posted') {
    if (
      existing.cashPaise !== classified.cashPaise ||
      existing.digitalPaise !== classified.digitalPaise ||
      existing.customerCreditPaise !== classified.customerCreditPaise
    ) {
      throw new ReplicationError('CONFLICT', 'Linked payment totals disagree with the invoice.');
    }
    return;
  }
  completeInvoice(existing, classified.cashPaise, classified.digitalPaise, classified.customerCreditPaise, envelope.operationId);
}

function applyCustomer(store: CloudStore, envelope: Envelope): void {
  const payload = record(envelope.payload) ? envelope.payload : {};
  const kind = typeof payload.kind === 'string' ? payload.kind : envelope.eventType;
  const value = record(payload.value) ? payload.value : payload;
  if (kind === 'customer.saved') {
    const id = typeof value.id === 'string' ? value.id : envelope.operationId;
    const existing = store.customers.get(tenantKey(envelope.businessId, id));
    const outstanding =
      typeof value.balancePaise === 'string' ? integer(value.balancePaise, 'Balance', true) : existing?.outstandingPaise ?? 0n;
    const row: CustomerRow = {
      customerId: id,
      name: text(value.name, existing?.name ?? id),
      phone: typeof value.phone === 'string' ? value.phone : existing?.phone ?? null,
      outstandingPaise: outstanding,
      creditLimitPaise:
        value.creditLimitPaise == null ? existing?.creditLimitPaise ?? null : integer(value.creditLimitPaise, 'Credit limit'),
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
    const delta = creditKind === 'repayment' || creditKind === 'write_off' ? -amount : amount;
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
      typeof value.balancePaise === 'string' ? integer(value.balancePaise, 'Balance', true) : null,
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
    quantityMilli: qty,
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
  if (envelope.stream === 'billing') applyInvoice(store, envelope);
  else if (envelope.stream === 'retail') applyRetailSale(store, envelope);
  else if (envelope.stream === 'customer') applyCustomer(store, envelope);
  else if (envelope.stream === 'inventory') applyInventory(store, envelope);
  else throw new ReplicationError('INVALID_ENVELOPE', 'Unknown stream identity.');
}
