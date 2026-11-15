/**
 * Mobile purchasing wire contract (Phase 21B).
 *
 * This module is the single place that knows the shape of `/v1/purchasing/*`.
 * It is deliberately strict in the same way `restaurant-lan.ts` is: every
 * payload is re-validated on the way *in* from the hub, because a phone must
 * never render a number the hub did not stand behind.
 *
 * Money is integer paise. The client never computes a tax rounding of its own:
 * a purchase-order draft preview may show a naive subtotal for the person typing
 * quantities, but the totals that are *saved or displayed as authoritative* are
 * the integers the hub returned.
 */
import type { SecurePort } from './restaurant-mobile.ts';

export const PURCHASING_PROTOCOL_VERSION = 1;

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);

const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);

const integer = (v: unknown, min = 0, max = 9_000_000_000_000): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

const timestamp = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));

const array = (v: unknown, max: number): v is unknown[] =>
  Array.isArray(v) && v.length <= max;

/** The hub's action matrix, as the native guard resolved it for this employee. */
export type PurchasingCapabilities = {
  supplierRead: boolean;
  manageSuppliers: boolean;
  managePurchaseOrders: boolean;
  approvePurchaseOrders: boolean;
  receiveStock: boolean;
  paySuppliers: boolean;
  correctPayables: boolean;
  refund: boolean;
};

export type PurchasingSupplier = {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  paymentTermsDays: number;
  notes: string;
  archived: boolean;
  revision: number;
  /** Payable balance in paise, as a decimal string (it can be negative). */
  balancePaise: string;
  overduePaise: string;
};

export type PurchasingOrderLine = {
  lineIndex: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantityMilli: number;
  receivedMilli: number;
  unitCostPaise: number;
  taxBps: number;
  lineSubtotalPaise: number;
  taxPaise: number;
  lineTotalPaise: number;
};

export const ORDER_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
  'partial',
  'received',
  'closed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PurchasingOrderSummary = {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  totalPaise: number;
  revision: number;
  itemCount: number;
  updatedAt: string;
};

export type PurchasingOrder = {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  note: string;
  lines: PurchasingOrderLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

export type PurchasingProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  revision: number;
};

export type PurchasingReceipt = {
  id: string;
  orderId: string;
  orderNumber: number;
  supplierId: string;
  reference: string | null;
  note: string;
  goodsTotalPaise: number;
  damagedTotalPaise: number;
  createdAt: string;
};

export type PurchasingInvoice = {
  id: string;
  supplierId: string;
  receiptId: string | null;
  reference: string;
  totalPaise: number;
  outstandingPaise: number;
  dueOn: string | null;
  createdAt: string;
};

export type PurchasingPayment = {
  id: string;
  supplierId: string;
  invoiceId: string | null;
  method: string;
  amountPaise: number;
  reference: string;
  paidOn: string | null;
  createdAt: string;
};

export type PurchasingReturn = {
  id: string;
  supplierId: string;
  receiptId: string;
  disposition: string;
  refundMethod: string | null;
  totalPaise: number;
  reason: string;
  createdAt: string;
};

/** One authenticated read of the whole purchasing workspace. */
export type PurchasingWorkspace = {
  version: number;
  businessId: string;
  generatedAt: string;
  actorId: string;
  displayName: string;
  role: string;
  capabilities: PurchasingCapabilities;
  suppliers: PurchasingSupplier[];
  purchaseOrders: PurchasingOrderSummary[];
  receipts: PurchasingReceipt[];
  invoices: PurchasingInvoice[];
  payments: PurchasingPayment[];
  returns: PurchasingReturn[];
  products: PurchasingProduct[];
};

export type PurchasingReceiptDetailLine = {
  lineIndex: number;
  productId: string;
  quantityMilli: number;
  damagedMilli: number;
  unitCostPaise: number;
  lineTotalPaise: number;
  note: string;
};

export type PurchasingReceiptDetail = {
  id: string;
  orderId: string;
  orderNumber: number;
  supplierId: string;
  reference: string | null;
  note: string;
  lines: PurchasingReceiptDetailLine[];
  goodsTotalPaise: number;
  damagedTotalPaise: number;
  orderStatus: string;
  createdAt: string;
};

export type PurchasingOrderDetail = {
  version: number;
  order: PurchasingOrder;
  receipts: PurchasingReceiptDetail[];
  returns: PurchasingReturn[];
};

export type StatementLine = {
  sequence: number;
  operationId: string;
  kind: string;
  amountPaise: string;
  runningBalancePaise: string;
  createdAt: string;
  dueOn: string | null;
  reference: string | null;
  purchaseOrderId: string | null;
  receiptId: string | null;
  invoiceId: string | null;
  reverseOf: string | null;
  reason: string;
};

export type SupplierStatement = {
  supplier: PurchasingSupplier;
  through: number;
  nextAfter: number;
  hasMore: boolean;
  openingBalancePaise: string;
  closingBalancePaise: string;
  aging: {
    currentPaise: string;
    days1To30Paise: string;
    days31To60Paise: string;
    days61To90Paise: string;
    days90PlusPaise: string;
  };
  entries: StatementLine[];
};

/**
 * A committed answer from the hub.
 *
 * `refused` is a *final* answer: the hub decided, stored that decision against
 * the operation identity, and will keep returning it. It is never a transport
 * failure, and the UI must never present it as "still trying".
 */
export type PurchasingOutcome =
  | { status: 'accepted'; kind: string; result: unknown }
  | { status: 'refused'; reason: string; revision: number | null };

export function isAccepted(outcome: PurchasingOutcome): outcome is {
  status: 'accepted';
  kind: string;
  result: unknown;
} {
  return outcome.status === 'accepted';
}

const CAPABILITY_KEYS: (keyof PurchasingCapabilities)[] = [
  'supplierRead',
  'manageSuppliers',
  'managePurchaseOrders',
  'approvePurchaseOrders',
  'receiveStock',
  'paySuppliers',
  'correctPayables',
  'refund',
];

function capabilities(value: unknown): PurchasingCapabilities {
  if (!object(value)) throw new Error('This hub did not report purchasing permissions.');
  for (const key of CAPABILITY_KEYS) {
    if (typeof value[key] !== 'boolean') {
      throw new Error('This hub reported an unrecognised permission document.');
    }
  }
  return value as PurchasingCapabilities;
}

function supplier(value: unknown): PurchasingSupplier {
  if (
    !object(value) ||
    !id(value.id) ||
    !text(value.name, 160) ||
    !(value.phone === null || text(value.phone, 40)) ||
    !(value.gstin === null || text(value.gstin, 15)) ||
    !(value.address === null || text(value.address, 500)) ||
    !integer(value.paymentTermsDays, 0, 3650) ||
    !text(value.notes, 800) ||
    typeof value.archived !== 'boolean' ||
    !integer(value.revision, 1) ||
    typeof value.balancePaise !== 'string' ||
    !/^-?\d{1,16}$/.test(value.balancePaise) ||
    typeof value.overduePaise !== 'string' ||
    !/^-?\d{1,16}$/.test(value.overduePaise)
  ) {
    throw new Error('The hub returned an invalid supplier record.');
  }
  return value as PurchasingSupplier;
}

function orderSummary(value: unknown): PurchasingOrderSummary {
  if (
    !object(value) ||
    !id(value.id) ||
    !integer(value.number, 1) ||
    !id(value.supplierId) ||
    !text(value.supplierName, 160) ||
    !ORDER_STATUSES.includes(value.status as OrderStatus) ||
    !integer(value.totalPaise) ||
    !integer(value.revision, 1) ||
    !integer(value.itemCount) ||
    !timestamp(value.updatedAt)
  ) {
    throw new Error('The hub returned an invalid purchase order summary.');
  }
  return value as PurchasingOrderSummary;
}

function orderLine(value: unknown): PurchasingOrderLine {
  if (
    !object(value) ||
    !integer(value.lineIndex, 0, 499) ||
    !id(value.productId) ||
    !text(value.name, 160) ||
    !text(value.sku, 80) ||
    !text(value.unit, 16) ||
    !integer(value.quantityMilli, 1) ||
    !integer(value.receivedMilli) ||
    !integer(value.unitCostPaise) ||
    !integer(value.taxBps, 0, 10000) ||
    !integer(value.lineSubtotalPaise) ||
    !integer(value.taxPaise) ||
    !integer(value.lineTotalPaise)
  ) {
    throw new Error('The hub returned an invalid purchase order line.');
  }
  return value as PurchasingOrderLine;
}

export function parseOrder(value: unknown): PurchasingOrder {
  if (
    !object(value) ||
    !id(value.id) ||
    !integer(value.number, 1) ||
    !id(value.supplierId) ||
    !text(value.supplierName, 160) ||
    !ORDER_STATUSES.includes(value.status as OrderStatus) ||
    !text(value.note, 800) ||
    !array(value.lines, 500) ||
    !integer(value.subtotalPaise) ||
    !integer(value.taxPaise) ||
    !integer(value.totalPaise) ||
    !integer(value.revision, 1) ||
    !timestamp(value.createdAt) ||
    !timestamp(value.updatedAt) ||
    !(value.approvedAt === null || timestamp(value.approvedAt))
  ) {
    throw new Error('The hub returned an invalid purchase order.');
  }
  return { ...(value as PurchasingOrder), lines: value.lines.map(orderLine) };
}

function product(value: unknown): PurchasingProduct {
  if (
    !object(value) ||
    !id(value.id) ||
    !text(value.name, 160) ||
    !text(value.sku, 80) ||
    !text(value.unit, 16) ||
    !integer(value.revision, 1)
  ) {
    throw new Error('The hub returned an invalid catalogue entry.');
  }
  return value as PurchasingProduct;
}

function receipt(value: unknown): PurchasingReceipt {
  if (
    !object(value) ||
    !id(value.id) ||
    !id(value.orderId) ||
    !integer(value.orderNumber, 1) ||
    !id(value.supplierId) ||
    !(value.reference === null || text(value.reference, 120)) ||
    !text(value.note, 800) ||
    !integer(value.goodsTotalPaise) ||
    !integer(value.damagedTotalPaise) ||
    !timestamp(value.createdAt)
  ) {
    throw new Error('The hub returned an invalid goods receipt.');
  }
  return value as PurchasingReceipt;
}

function invoice(value: unknown): PurchasingInvoice {
  if (
    !object(value) ||
    !id(value.id) ||
    !id(value.supplierId) ||
    !(value.receiptId === null || id(value.receiptId)) ||
    !text(value.reference, 120) ||
    !integer(value.totalPaise) ||
    !integer(value.outstandingPaise) ||
    !(value.dueOn === null || /^\d{4}-\d{2}-\d{2}$/.test(String(value.dueOn))) ||
    !timestamp(value.createdAt)
  ) {
    throw new Error('The hub returned an invalid supplier invoice.');
  }
  return value as PurchasingInvoice;
}

function payment(value: unknown): PurchasingPayment {
  if (
    !object(value) ||
    !id(value.id) ||
    !id(value.supplierId) ||
    !(value.invoiceId === null || id(value.invoiceId)) ||
    !text(value.method, 16) ||
    !integer(value.amountPaise, 1) ||
    !text(value.reference, 120) ||
    !(value.paidOn === null || /^\d{4}-\d{2}-\d{2}$/.test(String(value.paidOn))) ||
    !timestamp(value.createdAt)
  ) {
    throw new Error('The hub returned an invalid supplier payment.');
  }
  return value as PurchasingPayment;
}

function purchaseReturn(value: unknown): PurchasingReturn {
  if (
    !object(value) ||
    !id(value.id) ||
    !id(value.supplierId) ||
    !id(value.receiptId) ||
    !['supplier_credit', 'refund'].includes(String(value.disposition)) ||
    !(value.refundMethod === null || ['cash', 'bank', 'upi'].includes(String(value.refundMethod))) ||
    !integer(value.totalPaise, 1) ||
    !text(value.reason, 500) ||
    !timestamp(value.createdAt)
  ) {
    throw new Error('The hub returned an invalid purchase return.');
  }
  return value as PurchasingReturn;
}

/** Validates the whole workspace document. Nothing is coerced. */
export function parseWorkspace(value: unknown, businessId: string): PurchasingWorkspace {
  if (
    !object(value) ||
    value.version !== PURCHASING_PROTOCOL_VERSION ||
    value.businessId !== businessId ||
    !timestamp(value.generatedAt) ||
    !id(value.actorId) ||
    !text(value.displayName, 80) ||
    !['owner', 'manager', 'assistant_manager', 'cashier'].includes(String(value.role)) ||
    !array(value.suppliers, 500) ||
    !array(value.purchaseOrders, 250) ||
    !array(value.receipts, 250) ||
    !array(value.invoices, 250) ||
    !array(value.payments, 250) ||
    !array(value.returns, 250) ||
    !array(value.products, 5000)
  ) {
    throw new Error('The hub returned a purchasing workspace that does not match this shop.');
  }
  return {
    version: value.version,
    businessId: value.businessId,
    generatedAt: value.generatedAt,
    actorId: value.actorId,
    displayName: value.displayName as string,
    role: value.role as string,
    capabilities: capabilities(value.capabilities),
    suppliers: value.suppliers.map(supplier),
    purchaseOrders: value.purchaseOrders.map(orderSummary),
    receipts: value.receipts.map(receipt),
    invoices: value.invoices.map(invoice),
    payments: value.payments.map(payment),
    returns: value.returns.map(purchaseReturn),
    products: value.products.map(product),
  };
}

export function parseOrderDetail(value: unknown): PurchasingOrderDetail {
  if (!object(value) || value.version !== PURCHASING_PROTOCOL_VERSION) {
    throw new Error('The hub returned an unreadable purchase order.');
  }
  if (!array(value.receipts, 200) || !array(value.returns, 200)) {
    throw new Error('The hub returned unreadable receiving history.');
  }
  return {
    version: PURCHASING_PROTOCOL_VERSION,
    order: parseOrder(value.order),
    receipts: value.receipts.map(receiptDetail),
    returns: value.returns.map(purchaseReturn),
  };
}

function receiptDetail(value: unknown): PurchasingReceiptDetail {
  if (
    !object(value) ||
    !id(value.id) ||
    !id(value.orderId) ||
    !integer(value.orderNumber, 1) ||
    !id(value.supplierId) ||
    !(value.reference === null || text(value.reference, 120)) ||
    !text(value.note, 800) ||
    !array(value.lines, 500) ||
    !integer(value.goodsTotalPaise) ||
    !integer(value.damagedTotalPaise) ||
    !text(value.orderStatus, 24) ||
    !timestamp(value.createdAt)
  ) {
    throw new Error('The hub returned an invalid goods receipt.');
  }
  const lines = value.lines.map((line) => {
    if (
      !object(line) ||
      !integer(line.lineIndex, 0, 499) ||
      !id(line.productId) ||
      !integer(line.quantityMilli, 1) ||
      !integer(line.damagedMilli) ||
      !integer(line.unitCostPaise) ||
      !integer(line.lineTotalPaise) ||
      !text(line.note, 400)
    ) {
      throw new Error('The hub returned an invalid goods receipt line.');
    }
    return line as PurchasingReceiptDetailLine;
  });
  return { ...(value as PurchasingReceiptDetail), lines };
}

export function parseStatement(value: unknown): SupplierStatement {
  if (
    !object(value) ||
    value.version !== PURCHASING_PROTOCOL_VERSION ||
    !object(value.statement) ||
    !array(value.statement.entries, 200)
  ) {
    throw new Error('The hub returned an unreadable supplier statement.');
  }
  const statement = value.statement as Record<string, unknown>;
  const entries = statement.entries as unknown[];
  for (const entry of entries) {
    if (
      !object(entry) ||
      !integer(entry.sequence, 1) ||
      !id(entry.operationId) ||
      !text(entry.kind, 40) ||
      typeof entry.amountPaise !== 'string' ||
      typeof entry.runningBalancePaise !== 'string' ||
      !timestamp(entry.createdAt) ||
      !text(entry.reason, 500)
    ) {
      throw new Error('The hub returned an invalid statement line.');
    }
  }
  return {
    supplier: supplier(statement.supplier),
    through: statement.through as number,
    nextAfter: statement.nextAfter as number,
    hasMore: statement.hasMore === true,
    openingBalancePaise: String(statement.openingBalancePaise),
    closingBalancePaise: String(statement.closingBalancePaise),
    aging: statement.aging as SupplierStatement['aging'],
    entries: entries as StatementLine[],
  };
}

/**
 * Validates one committed outcome.
 *
 * `not_found` is handled by the caller: for a *status* lookup it means "resend
 * the same request"; for a submission it can never happen.
 */
export function parseOutcome(value: unknown, expectedKind: string): PurchasingOutcome {
  if (!object(value)) throw new Error('Unrecognised hub result; recover the same operation.');
  if (value.status === 'accepted') {
    if (value.kind !== expectedKind) {
      throw new Error('The hub accepted a different operation; recover the same one.');
    }
    return { status: 'accepted', kind: expectedKind, result: value.result };
  }
  if (value.status === 'refused') {
    if (!text(value.reason, 120)) {
      throw new Error('The hub refused this operation without a reason.');
    }
    if (!(value.revision === null || integer(value.revision))) {
      throw new Error('The hub returned an unreadable revision.');
    }
    return { status: 'refused', reason: value.reason, revision: value.revision as number | null };
  }
  throw new Error('Unrecognised hub result; recover the same operation.');
}

export function parseStatusLookup(
  value: unknown,
  expectedKind: string,
): PurchasingOutcome | { status: 'not_found' } {
  if (object(value) && value.status === 'not_found') return { status: 'not_found' };
  return parseOutcome(value, expectedKind);
}

/** Human copy for a durable refusal. The reason codes are a wire contract. */
export const REFUSAL_COPY: Record<string, string> = {
  revision_conflict:
    'Another device changed this record first. Refresh it, review the newer version, then decide whether to try again.',
  order_state_refused: 'This order moved on and no longer allows that action. Refresh it to see its state.',
  order_missing: 'That purchase order is no longer on this hub. Refresh the workspace.',
  supplier_missing: 'That supplier is no longer on this hub. Refresh the workspace.',
  supplier_revision_conflict: 'These supplier details changed on another device. Refresh before saving again.',
  invalid_supplier: 'Check the supplier name, phone, tax identity and payment terms.',
  invalid_purchase_order: 'Check the order lines, quantities and purchase costs.',
  invalid_receipt: 'Check the received and damaged quantities against what was ordered.',
  invalid_return: 'Check the returned quantities and choose a disposition.',
  invalid_payable: 'Check the payment amount, method and reference.',
  overpayment: 'That payment is larger than the invoice still owed.',
  product_missing: 'An item in this order is no longer in the catalogue.',
  not_permitted: 'Your role cannot perform this action. Ask the owner if it is required.',
  wrong_shop: 'This request belongs to another shop.',
  operation_identity_conflict:
    'This saved request was already used for different content. Refresh and start a new operation.',
  unknown_refusal: 'The hub refused this operation. Refresh before trying again.',
};

export function refusalCopy(reason: string): string {
  return REFUSAL_COPY[reason] ?? REFUSAL_COPY.unknown_refusal!;
}
