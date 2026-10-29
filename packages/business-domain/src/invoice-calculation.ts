import { calculateNativeInvoice } from './native-invoice';
import { parseFixedDecimal } from './fixed-decimal';
export type InvoiceLine = { productId?: string; name: string; category: string; quantity: number; unitPrice: number };
export type InvoiceCalculation =
  | { ok: true; lines: (InvoiceLine & { total: number })[]; subtotal: number; tax: number; total: number }
  | { ok: false; error: string };

/** Presentation adapter for the same exact decimal contract as native checkout.
 * Quantities have at most 3 decimals, prices 2, and percentage rates 2.
 * This is arithmetic, not a GST classification or compliance engine.
 */
export function calculateInvoice(lines: readonly InvoiceLine[], taxRate: number): InvoiceCalculation {
  const taxBasisPoints = parseFixedDecimal(String(taxRate), 2);
  if (!Number.isFinite(taxRate) || taxBasisPoints === null || taxBasisPoints > 10000) {
    return { ok: false, error: 'Tax rate must be between 0 and 100.' };
  }
  if (!lines.length) return { ok: false, error: 'Add at least one invoice line.' };
  if (lines.length > 100) return { ok: false, error: 'This invoice amount is too large. Check the quantity and price.' };
  const fixed: { quantityMilli: number; unitPricePaise: number }[] = [];
  for (const [index, line] of lines.entries()) {
    if (!line.name.trim()) return { ok: false, error: `Enter an item name on line ${index + 1}.` };
    const quantityMilli = parseFixedDecimal(String(line.quantity), 3);
    if (quantityMilli === null || quantityMilli <= 0) return { ok: false, error: `Enter a quantity greater than zero on line ${index + 1}.` };
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) return { ok: false, error: `Enter a valid price on line ${index + 1}.` };
    const unitPricePaise = parseFixedDecimal(String(line.unitPrice), 2);
    if (unitPricePaise === null) return { ok: false, error: 'Enter a price with no more than two decimal places.' };
    fixed.push({ quantityMilli, unitPricePaise });
  }
  if (fixed.every(line => line.unitPricePaise === 0)) return { ok: false, error: 'Invoice total must be greater than zero.' };
  try {
    const result = calculateNativeInvoice(fixed, taxBasisPoints);
    const prepared = lines.map((line, index) => ({ ...(line.productId ? { productId: line.productId } : {}), name: line.name.trim(), category: line.category.trim() || 'General', quantity: line.quantity, unitPrice: line.unitPrice, total: result.lineTotalsPaise[index] / 100 }));
    return { ok: true, lines: prepared, subtotal: result.subtotalPaise / 100, tax: result.taxPaise / 100, total: result.totalPaise / 100 };
  } catch {
    return { ok: false, error: 'This invoice amount is too large. Check the quantity and price.' };
  }
}
