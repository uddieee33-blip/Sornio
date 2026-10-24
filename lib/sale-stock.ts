/** The checkout's shared, pure stock guard. No financial mutation until the whole basket passes. */
export type SaleStockLine = { productId: string; quantity: number; rate: number };
export type SaleStockProduct = { id: string; name: string; itemType: 'product' | 'service'; stock: number };

export function validateSaleStock(
  lines: readonly SaleStockLine[],
  products: readonly SaleStockProduct[],
): { ok: true; quantities: Map<string, number> } | { ok: false; error: string } {
  if (lines.length === 0) return { ok: false, error: 'Add at least one line with a quantity.' };

  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0)
      return { ok: false, error: 'Add at least one line with a quantity.' };
    if (!Number.isFinite(line.rate) || line.rate < 0)
      return { ok: false, error: 'Sale total must be greater than zero.' };

    const product = products.find((item) => item.id === line.productId);
    if (!product) return { ok: false, error: 'Select a valid item on every line.' };
    const quantity = (quantities.get(product.id) ?? 0) + line.quantity;
    if (!Number.isFinite(quantity)) return { ok: false, error: 'Add at least one line with a quantity.' };
    quantities.set(product.id, quantity);
  }

  for (const [productId, quantity] of quantities) {
    const product = products.find((item) => item.id === productId)!;
    if (product.itemType !== 'product') continue;
    if (!Number.isFinite(product.stock)) return { ok: false, error: 'Select a valid item on every line.' };
    if (quantity > product.stock + 0.000001)
      return { ok: false, error: `Not enough stock for ${product.name} (${product.stock} left).` };
  }
  return { ok: true, quantities };
}

