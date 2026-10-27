import type { NativeInvoiceRequest } from '../../../packages/business-domain/src/native-invoice';
export type Product = { id: string; name: string; sku: string; unit: string; unitPricePaise: number; stockMilli: number; revision: number };
export type Invoice = {
  id: string; createdAt: string;
  lines: { productId: string; name: string; unit: string; quantityMilli: number; unitPricePaise: number; totalPaise: number }[];
  subtotalPaise: number; taxPaise: number; totalPaise: number; taxBasisPoints: number;
  tender: 'cash' | 'credit'; customerId: string | null;
};
export type CashierState = {
  products: Product[];
  checkout: { request: NativeInvoiceRequest; invoice: Invoice | null } | null;
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
