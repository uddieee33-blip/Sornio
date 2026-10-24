import { getActiveFormattingLocale } from './locale';
import type { Invoice, PaymentRecord } from './models/billing';

export type InvoiceLine = { name: string; category: string; quantity: number; unitPrice: number };
export type InvoiceCalculation =
  | { ok: true; lines: (InvoiceLine & { total: number })[]; subtotal: number; tax: number; total: number }
  | { ok: false; error: string };

/** Money is summed as integer paise; displayed lines and the stored total agree. */
export function calculateInvoice(lines: readonly InvoiceLine[], taxRate: number): InvoiceCalculation {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { ok: false, error: 'Tax rate must be between 0 and 100.' };
  }
  if (lines.length === 0) return { ok: false, error: 'Add at least one invoice line.' };
  const prepared: (InvoiceLine & { total: number })[] = [];
  let subtotalPaise = 0;
  for (const [index, line] of lines.entries()) {
    if (!line.name.trim()) return { ok: false, error: `Enter an item name on line ${index + 1}.` };
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      return { ok: false, error: `Enter a quantity greater than zero on line ${index + 1}.` };
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      return { ok: false, error: `Enter a valid price on line ${index + 1}.` };
    }
    if (Math.abs(Math.round(line.unitPrice * 100) / 100 - line.unitPrice) > 0.0000001) {
      return { ok: false, error: 'Enter a price with no more than two decimal places.' };
    }
    const linePaise = Math.round((line.quantity * line.unitPrice + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(linePaise) || !Number.isSafeInteger(subtotalPaise + linePaise)) {
      return { ok: false, error: 'This invoice amount is too large. Check the quantity and price.' };
    }
    subtotalPaise += linePaise;
    prepared.push({ name: line.name.trim(), category: line.category.trim() || 'General', quantity: line.quantity, unitPrice: line.unitPrice, total: linePaise / 100 });
  }
  if (subtotalPaise <= 0) return { ok: false, error: 'Invoice total must be greater than zero.' };
  const taxPaise = Math.round(subtotalPaise * taxRate / 100);
  if (!Number.isSafeInteger(subtotalPaise + taxPaise)) {
    return { ok: false, error: 'This invoice amount is too large. Check the quantity and price.' };
  }
  return { ok: true, lines: prepared, subtotal: subtotalPaise / 100, tax: taxPaise / 100, total: (subtotalPaise + taxPaise) / 100 };
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
