import { getActiveFormattingLocale } from './locale';
import type { Invoice, PaymentRecord } from './models/billing';

export { calculateInvoice } from '../packages/business-domain/src/invoice-calculation';
export type { InvoiceLine, InvoiceCalculation } from '../packages/business-domain/src/invoice-calculation';

/** A deterministic, non-mutating bill history, even when sync/import inserts
 * records out of arrival order. Invalid timestamps always come last; a tie is
 * ordered by invoice ID so two shop devices agree on the same bill sequence.
 */
export function invoicesByCreation<T extends Pick<Invoice, 'id' | 'createdAt'>>(
  invoices: readonly T[],
  order: 'newest' | 'oldest' = 'newest',
): T[] {
  const direction = order === 'newest' ? -1 : 1;
  return invoices.map(invoice => {
    const stamp = Date.parse(invoice.createdAt);
    return { invoice, timestamp: Number.isFinite(stamp) ? stamp : null };
  }).sort((a, b) => {
    if (a.timestamp === null && b.timestamp !== null) return 1;
    if (a.timestamp !== null && b.timestamp === null) return -1;
    if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
      return direction * (a.timestamp - b.timestamp);
    }
    if (a.invoice.id === b.invoice.id) return 0;
    return direction * (a.invoice.id < b.invoice.id ? -1 : 1);
  }).map(entry => entry.invoice);
}

/** Fast counter summary with the same date semantics as the billing ledger. */
export function newestInvoices<T extends Pick<Invoice, 'id' | 'createdAt'>>(invoices: readonly T[], limit = 5): T[] {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  return invoicesByCreation(invoices, 'newest').slice(0, count);
}

export function nextInvoiceId(invoices: readonly Pick<Invoice, 'id'>[], lastNumber = 1000): string {
  let latest = lastNumber;
  for (const invoice of invoices) {
    const match = /^INV-(\d+)$/.exec(invoice.id);
    const value = match ? Number(match[1]) : 0;
    if (Number.isSafeInteger(value) && value < Number.MAX_SAFE_INTEGER - 1) latest = Math.max(latest, value);
  }
  return `INV-${latest + 1}`;
}

/** Failed/pending attempts and records belonging to another business do not settle a bill. */
export function invoiceBalance(invoice: Invoice, records: readonly PaymentRecord[]): number {
  if (invoice.paymentStatus === 'paid') return 0;
  const paidPaise = records
    .filter((record) => record.invoiceId === invoice.id && record.businessId === invoice.businessId &&
      (record.status === 'paid' || record.status === 'partial') && Number.isFinite(record.amount) && record.amount > 0)
    .reduce((sum, record) => sum + Math.round(record.amount * 100), 0);
  return Math.max(0, Math.round(invoice.totalAmount * 100) - paidPaise) / 100;
}

/** Bills and collection confirmations show paise, even when dashboards use whole rupees. */
export function formatInvoiceAmount(value: number, locale = getActiveFormattingLocale()): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

