/** Adopt identifiers used by the previous relational adapter without breaking links. */
import type { StoreState } from '@/lib/store';
async function id(business: string, kind: string, value: string): Promise<string> {
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return value.toLowerCase();
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dukaanos:${business}:${kind}:${value}`)),
  );
  const hex = Array.from(bytes.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function normalizeLegacyState(state: StoreState, business: string): Promise<StoreState> {
  const productIds = new Map(
    await Promise.all(state.products.map(async (p) => [p.id, await id(business, 'product', p.id)] as const)),
  );
  const customerIds = new Map(
    await Promise.all(state.customers.map(async (c) => [c.id, await id(business, 'customer', c.id)] as const)),
  );
  return {
    ...state,
    products: state.products.map((p) => ({ ...p, id: productIds.get(p.id)! })),
    customers: state.customers.map((c) => ({
      ...c,
      id: customerIds.get(c.id)!,
    })),
    transactions: await Promise.all(
      state.transactions.map(async (t) => ({
        ...t,
        id: await id(business, 'transaction', t.id),
        customerId: t.customerId ? (customerIds.get(t.customerId) ?? t.customerId) : undefined,
        items: t.items?.map((i) => ({
          ...i,
          productId: productIds.get(i.productId) ?? i.productId,
        })),
      })),
    ),
    stockMovements: await Promise.all(
      state.stockMovements.map(async (m) => ({
        ...m,
        id: await id(business, 'movement', m.id),
        productId: productIds.get(m.productId) ?? m.productId,
      })),
    ),
    invoices: state.invoices.map((i) => ({
      ...i,
      customerId: i.customerId ? (customerIds.get(i.customerId) ?? i.customerId) : undefined,
      items: i.items.map((item) => ({
        ...item,
        productId: item.productId ? (productIds.get(item.productId) ?? item.productId) : undefined,
      })),
    })),
    paymentRecords: state.paymentRecords.map((p) => ({
      ...p,
      customerId: p.customerId ? (customerIds.get(p.customerId) ?? p.customerId) : undefined,
    })),
    scanEvents: state.scanEvents.map((e) => ({
      ...e,
      productId: e.productId ? (productIds.get(e.productId) ?? e.productId) : undefined,
    })),
  };
}
