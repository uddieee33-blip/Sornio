import type { NativeInvoiceRequest } from '../../../packages/business-domain/src/native-invoice';
import type { Invoice } from './billing-types';
export type CheckoutRequest = Omit<NativeInvoiceRequest, 'tender'> & { tender: 'cash' | 'credit' | 'retail' };
// 'credit' is the customer-credit part of a split sale; the native store is
// the only authority that accepts it and books the receivable.
export type PaymentPart = { id: string; method: 'cash' | 'upi' | 'card' | 'credit'; amountPaise: number; reference: string };
export type ReturnDisposition = 'sellable' | 'damaged' | 'no_restock';
export type ReturnLine = { lineIndex: number; quantityMilli: number; disposition?: ReturnDisposition };
export type RefundPart = { paymentId: string; amountPaise: number };
export type RetailAction =
 | { kind: 'sale'; invoice: CheckoutRequest; payments: PaymentPart[] }
 | { kind: 'match'; paymentId: string; expectedRevision: number; reference: string; statementAmountPaise: number; evidence: string }
 | { kind: 'reverse_match'; paymentId: string; expectedRevision: number; reason: string }
 | { kind: 'return'; invoiceId: string; expectedRevision: number; lines: ReturnLine[]; refunds: RefundPart[]; reason: string }
 | { kind: 'match_refund'; refundId: string; expectedRevision: number; reference: string; statementAmountPaise: number; evidence: string }
 | { kind: 'float'; day: string; username: string; amountPaise: number }
 | { kind: 'correct_float'; openingId: string; amountPaise: number; reason: string }
 | { kind: 'close'; day: string; username: string; through: number; countedPaise: number }
 | { kind: 'correct_close'; closingId: string; countedPaise: number; reason: string }
 | { kind: 'reopen'; closingId: string; reason: string };
export type RetailRequest = { operationId: string; action: RetailAction };
export type RetailReceipt = { operationId: string; kind: string; data: { invoice?: Invoice; [key: string]: unknown } };
export type RetailPending = { request: RetailRequest; receipt: RetailReceipt | null };
export type Payment = { id: string; invoiceId: string; method: string; amountPaise: number; refundablePaise: number; status: string; revision: number; reference: string; externallyVerified: false };
export type Refund = { id: string; invoiceId: string; method: string; amountPaise: number; status: string; revision: number; reference: string; externallyVerified: false };
export type DaySummary = { day: string; username: string; actorId: string; through: number; openingFloatPaise: number; openingFloatId: string | null; netCashPaise: string; expectedCashPaise: string; countedCashPaise: number | null; variancePaise: string | null; cashRecordedPaise: string; digitalRecordedPaise: string; digitalPendingPaise: string; manuallyMatchedPaise: string; externallyVerifiedPaise: string; refundPendingPaise: string; unattributedCashPaise: string; closingId: string | null; state: string };
export type RetailView = { summary: DaySummary; pending: RetailPending | null; invoice: Invoice | null; payments: Payment[]; refunds: Refund[] };
export type ReturnQuote = { invoice: Invoice; revision: number; subtotalPaise: number; taxPaise: number; totalPaise: number; suggestedRefunds: RefundPart[]; cashOutPaise: number; creditReductionPaise: number; pendingDigitalRefundPaise: number; canceledDigitalPaise: number };
export function indianDay() { const d = new Date(); const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d); return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-'); }
export function statusLabel(status: string) { return ({ recorded: 'Cash recorded', credit_due: 'Credit due', pending: 'Pending — unverified', manually_reconciled: 'Manually matched — not externally verified', canceled: 'Pending payment canceled', cash_refund_recorded: 'Cash refund recorded', credit_returned: 'Credit returned', refund_pending: 'Digital refund pending', refund_manually_reconciled: 'Refund manually matched — not externally verified' } as Record<string, string>)[status] ?? status; }
