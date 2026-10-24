/** Shared money and party-account selectors. Amounts are rounded in paise. */
import type { Transaction } from './business-data';
export const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
export function businessDate(now = new Date(), timeZone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function customerBalance(
  customer: { id: string; openingBalance?: number },
  transactions: Transaction[],
): number {
  return money(
    (customer.openingBalance ?? 0) +
      transactions
        .filter((t) => t.customerId === customer.id && t.account === 'receivables')
        .reduce((sum, t) => sum + (t.direction === 'in' ? t.amount : -t.amount), 0),
  );
}
export function paymentReferenceRequired(method: string, reference?: string): boolean {
  return ['UPI', 'Card', 'Bank Transfer'].includes(method) && !reference?.trim();
}
