export type StockItem = { id: string; name: string; sku: string; unit: string; stockMilli: number };
export type StockAlert<T extends StockItem> = { product: T; missingMilli: number; status: 'empty' | 'low' };
/** A unit-specific target prevents comparing kilograms with piece counts. Never changes stock. */
export function stockAlerts<T extends StockItem>(products: readonly T[], unit: string, targetMilli: number): StockAlert<T>[] {
  if (!Number.isSafeInteger(targetMilli) || targetMilli <= 0 || targetMilli > 9_000_000_000_000) throw new Error('Enter a positive restock target with up to three decimals.');
  return products.filter(p => p.unit === unit && Number.isSafeInteger(p.stockMilli) && p.stockMilli >= 0 && p.stockMilli < targetMilli)
    .map(product => ({ product, missingMilli: targetMilli - product.stockMilli, status: product.stockMilli === 0 ? 'empty' as const : 'low' as const }))
    .sort((a,b) => a.product.stockMilli - b.product.stockMilli || a.product.name.localeCompare(b.product.name));
}
