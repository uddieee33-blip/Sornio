import type { Product, Transaction } from './business-data';
import type { StockMovement } from './inventory';
import { buildMovement, pushMovements, unitFor } from './inventory';
import { validateSaleStock, type SaleStockLine } from './sale-stock';
import { parseFixedDecimal } from '../packages/business-domain/src/fixed-decimal';
import { calculateNativeInvoice, NATIVE_INVOICE_MAX } from '../packages/business-domain/src/native-invoice';

export type SoldLine = {
  productId?: string;
  name?: string;
  quantity: number;
  rate: number;
};

export const operationId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function exactMilliPaise(quantityMilli: number, unitPaise: number): number | null {
  if (
    !Number.isSafeInteger(quantityMilli) ||
    !Number.isSafeInteger(unitPaise) ||
    quantityMilli <= 0 ||
    quantityMilli > NATIVE_INVOICE_MAX ||
    unitPaise < 0 ||
    unitPaise > NATIVE_INVOICE_MAX
  ) {
    return null;
  }
  const total = (BigInt(quantityMilli) * BigInt(unitPaise) + 500n) / 1000n;
  if (total > BigInt(NATIVE_INVOICE_MAX)) return null;
  return Number(total);
}

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
    operationId?: string;
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

  const fixedLines: { productId?: string; quantityMilli: number; unitPricePaise: number }[] = [];
  for (const l of input.lines) {
    const quantityMilli = parseFixedDecimal(String(l.quantity), 3);
    const unitPricePaise = parseFixedDecimal(String(l.rate), 2);
    if (quantityMilli === null || quantityMilli <= 0 || unitPricePaise === null)
      throw new Error('Every line needs a valid quantity and price.');
    fixedLines.push({ productId: l.productId, quantityMilli, unitPricePaise });
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
  if (calculated.subtotalPaise <= 0) throw new Error('Sale total must be greater than zero.');

  const subtotal = calculated.subtotalPaise / 100,
    tax = calculated.taxPaise / 100,
    total = calculated.totalPaise / 100;
  const account: Transaction['account'] = input.credit
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

  const explicitOperationId = input.operationId !== undefined ? input.operationId.trim() : undefined;
  if (explicitOperationId === '') throw new Error('Every line needs a valid quantity and price.');
  const reference = explicitOperationId ?? input.invoiceId ?? operationId('sale');

  const existing = current.transactions.filter((t) => t.operationId === reference);
  if (existing.length > 0) {
    const saleEntry = existing.find((t) => t.type === 'sale' && t.account === 'revenue' && t.direction === 'in');
    const taxEntry = existing.find((t) => t.type === 'payment' && t.account === 'tax' && t.direction === 'in');
    const settlementEntry = existing.find((t) => t.type === 'payment' && t.account === account && t.direction === 'in');
    const expectedProductLines = fixedLines.filter((l): l is { productId: string; quantityMilli: number; unitPricePaise: number } => Boolean(l.productId));
    const itemsMatch =
      (saleEntry?.items?.length ?? 0) === expectedProductLines.length &&
      expectedProductLines.every((expected, index) => {
        const recorded = saleEntry?.items?.[index];
        return (
          recorded !== undefined &&
          recorded.productId === expected.productId &&
          parseFixedDecimal(String(recorded.quantity), 3) === expected.quantityMilli &&
          parseFixedDecimal(String(recorded.rate), 2) === expected.unitPricePaise
        );
      });
    const matchesReplay =
      saleEntry !== undefined &&
      settlementEntry !== undefined &&
      itemsMatch &&
      parseFixedDecimal(String(saleEntry.amount), 2) === calculated.subtotalPaise &&
      (calculated.taxPaise > 0
        ? taxEntry !== undefined && parseFixedDecimal(String(taxEntry.amount), 2) === calculated.taxPaise
        : taxEntry === undefined) &&
      parseFixedDecimal(String(settlementEntry.amount), 2) === calculated.totalPaise &&
      saleEntry.paymentMethod === input.method &&
      (saleEntry.customerId ?? undefined) === input.customerId &&
      (saleEntry.invoiceId ?? undefined) === input.invoiceId;
    if (!matchesReplay) throw new Error('Every line needs a valid quantity and price.');
    return {
      subtotal,
      tax,
      total,
      stockChanges: current.stockMovements.filter((m) => m.reference === reference && m.reason === 'sale'),
      transactions: current.transactions,
      stockMovements: current.stockMovements,
      products: current.products,
    };
  }

  const stockLines = input.lines.filter((line): line is SaleStockLine => Boolean(line.productId));
  const validation = stockLines.length ? validateSaleStock(stockLines, current.products) : null;
  if (validation && !validation.ok) throw new Error(validation.error);
  const quantitiesMilli = validation?.ok ? validation.quantitiesMilli : new Map<string, number>();
  const remainingStockMilli = new Map<string, number>();
  const stockCostsPaise = new Map<string, number>();

  for (const [id, quantityMilli] of quantitiesMilli) {
    const p = current.products.find((item) => item.id === id);
    if (!p || p.status !== 'Active') throw new Error('Select an active item on every line.');
    if (p.itemType === 'product') {
      const onHandMilli = parseFixedDecimal(String(p.stock), 3, true);
      if (onHandMilli === null) throw new Error('Select an active item on every line.');
      if (quantityMilli > onHandMilli)
        throw new Error(`Not enough stock for ${p.name} (${p.stock} left).`);
      remainingStockMilli.set(id, onHandMilli - quantityMilli);
      if (!Number.isFinite(p.cost) || p.cost < 0)
        throw new Error('Every line needs a valid quantity and price.');
      const costUnitPaise = parseFixedDecimal(String(p.cost), 2);
      if (costUnitPaise === null)
        throw new Error('Every line needs a valid quantity and price.');
      if (costUnitPaise > 0) {
        const costPaise = exactMilliPaise(quantityMilli, costUnitPaise);
        if (costPaise === null)
          throw new Error('Every line needs a valid quantity and price.');
        if (costPaise > 0) stockCostsPaise.set(id, costPaise);
      }
    }
  }

  const at = new Date().toISOString();
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
          const p = current.products.find((item) => item.id === l.productId)!;
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
  if (calculated.taxPaise > 0) entries.push(tx({ amount: tax, account: 'tax' }));
  entries.push(tx({ amount: total, account, paymentMethod: input.method }));

  const stockChanges: StockMovement[] = [];
  for (const [id, quantityMilli] of quantitiesMilli) {
    const p = current.products.find((item) => item.id === id)!;
    if (p.itemType === 'service') continue;
    const costPaise = stockCostsPaise.get(id);
    if (costPaise !== undefined) {
      entries.push(
        tx({
          type: 'stock_adjustment',
          amount: costPaise / 100,
          direction: 'out',
          account: 'inventory',
        }),
      );
    }
    const quantity = quantityMilli / 1000;
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
      p.itemType === 'product' && remainingStockMilli.has(p.id)
        ? {
            ...p,
            stock: remainingStockMilli.get(p.id)! / 1000,
          }
        : p,
    ),
  };
}
