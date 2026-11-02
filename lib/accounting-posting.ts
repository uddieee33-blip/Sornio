import type { Product, Transaction } from './business-data';
import type { StockMovement } from './inventory';
import { buildMovement, pushMovements, unitFor } from './inventory';
import { money } from './accounting';
import { validateSaleStock, type SaleStockLine } from './sale-stock';
import { exactLinePaise, parseFixedDecimal } from '../packages/business-domain/src/fixed-decimal';
import { calculateNativeInvoice } from '../packages/business-domain/src/native-invoice';
export type SoldLine = {
  productId?: string;
  name?: string;
  quantity: number;
  rate: number;
};
export const operationId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
/** One posting path for counter sales and product-backed invoices. */
export function postSale(
  current: {
    products: Product[];
    transactions: Transaction[];
    stockMovements: StockMovement[];
  },
  input: {
    lines: SoldLine[];
    method: Transaction['paymentMethod'];
    customerId?: string;
    invoiceId?: string;
    description: string;
    date: string;
    taxRate?: number;
    credit?: boolean;
  },
) {
  if (
    !input.lines.length ||
    input.lines.length > 100 ||
    input.lines.some((l) => !Number.isFinite(l.quantity) || !Number.isFinite(l.rate) || l.quantity <= 0 || l.rate < 0)
  )
    throw new Error('Every line needs a valid quantity and price.');
  const fixedLines: { quantityMilli: number; unitPricePaise: number }[] = [];
  for (const l of input.lines) {
    const quantityMilli = parseFixedDecimal(String(l.quantity), 3);
    const unitPricePaise = parseFixedDecimal(String(l.rate), 2);
    if (quantityMilli === null || quantityMilli <= 0 || unitPricePaise === null)
      throw new Error('Every line needs a valid quantity and price.');
    fixedLines.push({ quantityMilli, unitPricePaise });
  }
  const stockLines = input.lines.filter((line): line is SaleStockLine => Boolean(line.productId));
  const validation = stockLines.length ? validateSaleStock(stockLines, current.products) : null;
  if (validation && !validation.ok) throw new Error(validation.error);
  const quantities = validation?.ok ? validation.quantities : new Map<string, number>();
  for (const [id, quantity] of quantities) {
    const p = current.products.find((p) => p.id === id);
    if (!p || p.status !== 'Active') throw new Error('Select an active item on every line.');
    if (p.itemType === 'product' && quantity > p.stock + 0.000001)
      throw new Error(`Not enough stock for ${p.name} (${p.stock} left).`);
  }
  const rate = input.taxRate ?? 0;
  const taxBasisPoints = Number.isFinite(rate) ? parseFixedDecimal(String(rate), 2) : null;
  if (taxBasisPoints === null || taxBasisPoints > 10000) throw new Error('Tax rate must be between 0 and 100.');
  if (fixedLines.every((l) => l.unitPricePaise === 0)) throw new Error('Sale total must be greater than zero.');
  let calculated: ReturnType<typeof calculateNativeInvoice>;
  try {
    calculated = calculateNativeInvoice(fixedLines, taxBasisPoints);
  } catch {
    throw new Error('Every line needs a valid quantity and price.');
  }
  const subtotal = calculated.subtotalPaise / 100,
    tax = calculated.taxPaise / 100,
    total = calculated.totalPaise / 100;
  if (subtotal <= 0) throw new Error('Sale total must be greater than zero.');
  const reference = input.invoiceId ?? operationId('sale'),
    at = new Date().toISOString();
  const tx = (over: Partial<Transaction>): Transaction => ({
    id: operationId('t'),
    type: 'payment',
    description: input.description,
    amount: 0,
    direction: 'in',
    account: 'revenue',
    date: input.date,
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    operationId: reference,
    ...over,
  });
  const entries: Transaction[] = [
    tx({
      type: 'sale',
      amount: subtotal,
      paymentMethod: input.method,
      items: input.lines
        .filter((l) => l.productId)
        .map((l) => {
          const p = current.products.find((p) => p.id === l.productId)!;
          return {
            productId: p.id,
            name: p.name,
            quantity: l.quantity,
            rate: l.rate,
            cost: p.cost,
          };
        }),
    }),
  ];
  if (tax) entries.push(tx({ amount: tax, account: 'tax' }));
  const account = input.credit
    ? 'receivables'
    : input.method === 'Cash'
      ? 'cash'
      : input.method === 'UPI'
        ? 'upi'
        : input.method === 'Card'
          ? 'card'
          : input.method === 'Bank Transfer'
            ? 'bank'
            : 'receivables';
  entries.push(tx({ amount: total, account, paymentMethod: input.method }));
  const stockChanges: StockMovement[] = [];
  for (const [id, quantity] of quantities) {
    const p = current.products.find((p) => p.id === id)!;
    if (p.itemType === 'service') continue;
    if (p.cost > 0) {
      const costPaise = exactLinePaise(quantity, p.cost);
      entries.push(
        tx({
          type: 'stock_adjustment',
          amount: costPaise !== null ? costPaise / 100 : money(quantity * p.cost),
          direction: 'out',
          account: 'inventory',
        }),
      );
    }
    const movement = buildMovement({
      id: operationId('mv'),
      productId: p.id,
      productName: p.name,
      at,
      reason: 'sale',
      delta: -quantity,
      balanceBefore: p.stock,
      note: `Sold — ${quantity} × ${p.name}`,
      reference,
      unit: unitFor(p.itemType, p.unit),
    });
    if (movement) stockChanges.push(movement);
  }
  return {
    subtotal,
    tax,
    total,
    stockChanges,
    transactions: [...current.transactions, ...entries],
    stockMovements: pushMovements(current.stockMovements, stockChanges),
    products: current.products.map((p) =>
      p.itemType === 'product' && quantities.has(p.id)
        ? {
            ...p,
            stock: Math.round((p.stock - quantities.get(p.id)!) * 1000) / 1000,
          }
        : p,
    ),
  };
}
