import { parseFixedDecimal } from '../packages/business-domain/src/fixed-decimal';
import { NATIVE_INVOICE_MAX } from '../packages/business-domain/src/native-invoice';

/** The checkout's shared, pure stock guard. No financial mutation until the whole basket passes. */
export type SaleStockLine = { productId: string; quantity: number; rate: number };
export type SaleStockProduct = { id: string; name: string; itemType: 'product' | 'service'; stock: number };

export function validateSaleStock(
  lines: readonly SaleStockLine[],
  products: readonly SaleStockProduct[],
): { ok: true; quantities: Map<string, number>; quantitiesMilli: Map<string, number> } | { ok: false; error: string } {
  if (lines.length === 0) return { ok: false, error: 'Add at least one line with a quantity.' };

  const quantitiesMilli = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0)
      return { ok: false, error: 'Add at least one line with a quantity.' };
    if (!Number.isFinite(line.rate) || line.rate < 0)
      return { ok: false, error: 'Sale total must be greater than zero.' };

    const lineMilli = parseFixedDecimal(String(line.quantity), 3);
    const ratePaise = parseFixedDecimal(String(line.rate), 2);
    if (lineMilli === null || lineMilli <= 0 || ratePaise === null)
      return { ok: false, error: 'Add at least one line with a quantity.' };

    const product = products.find((item) => item.id === line.productId);
    if (!product) return { ok: false, error: 'Select a valid item on every line.' };
    const totalMilli = (quantitiesMilli.get(product.id) ?? 0) + lineMilli;
    if (!Number.isSafeInteger(totalMilli) || totalMilli > NATIVE_INVOICE_MAX)
      return { ok: false, error: 'Add at least one line with a quantity.' };
    quantitiesMilli.set(product.id, totalMilli);
  }

  const quantities = new Map<string, number>();
  for (const [productId, quantityMilli] of quantitiesMilli) {
    const product = products.find((item) => item.id === productId)!;
    if (product.itemType === 'product') {
      if (!Number.isFinite(product.stock)) return { ok: false, error: 'Select a valid item on every line.' };
      const stockMilli = parseFixedDecimal(String(product.stock), 3, true);
      if (stockMilli === null) return { ok: false, error: 'Select a valid item on every line.' };
      if (quantityMilli > stockMilli)
        return { ok: false, error: `Not enough stock for ${product.name} (${product.stock} left).` };
    }
    quantities.set(productId, quantityMilli / 1000);
  }
  return { ok: true, quantities, quantitiesMilli };
}
