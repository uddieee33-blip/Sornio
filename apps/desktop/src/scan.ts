import type { Product } from './billing-types';

// Codes are strings: converting them to numbers destroys leading zeroes.
export function findCode(products: Product[], input: string): Product[] {
  const code = input.trim().toLowerCase();
  return code ? products.filter(product => product.sku.trim() && product.sku.trim().toLowerCase() === code) : [];
}

export function scanNeedsQuantity(product: Product): boolean {
  return product.unit !== 'pcs';
}
