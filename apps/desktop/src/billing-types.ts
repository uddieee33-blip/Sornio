import type { CheckoutRequest, RetailRequest } from './retail-types';
export type Product = { id: string; name: string; sku: string; unit: string; unitPricePaise: number; stockMilli: number; revision: number };
export type Invoice = {
  id: string; invoiceNumber?: string; businessId?: string; businessName?: string; createdAt: string;
  lines: { productId: string; name: string; unit: string; quantityMilli: number; unitPricePaise: number; totalPaise: number }[];
  subtotalPaise: number; taxPaise: number; totalPaise: number; taxBasisPoints: number;
  tender: 'cash' | 'credit' | 'retail'; customerId: string | null;
};
export type CashierState = {
  activeHeldBill?: import('./held-bills').ResumedBill | null;
  products: Product[];
  checkout: { request: CheckoutRequest; invoice: Invoice | null; retailRequest?: RetailRequest } | null;
  reportsAllowed: boolean;
  balances: { cashPaise: string; creditPaise: string };
};
export const quantity = (milli: number) => (milli / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3, useGrouping: false });
const wholeRupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** Formatting only: never convert a cumulative native balance to a JS number. */
export function money(paise: number | string) {
  const value = BigInt(paise), absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}₹${wholeRupees.format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function formatPaiseInput(paise: number | string, zeroText = ''): string {
  const value = BigInt(paise);
  if (value < 0n) return '';
  if (value === 0n) return zeroText;
  const rupees = value / 100n, remainder = value % 100n;
  return remainder === 0n ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}
