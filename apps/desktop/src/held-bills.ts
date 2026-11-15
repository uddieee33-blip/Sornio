import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal.ts';
import { paymentMethods } from './payment-allocation.ts';
import type { PaymentAmounts } from './payment-allocation.ts';
import type { Product } from './billing-types';
import type { Customer } from './customer-types';
import type { CheckoutRequest, PaymentPart } from './retail-types';
export type HeldDraftInput = {
  lines: { productId: string; quantityMilli: number }[]; taxBasisPoints: number;
  tender: CheckoutRequest['tender']; customerId: string | null;
  payments: { method: PaymentPart['method']; amountPaise: number; reference: string }[]; note: string;
};
export type HeldBill = { id: string; revision: number; state: 'held' | 'active' | 'checkout' | 'completed' | 'discarded'; updatedAt: string;
  draft: { version: number; input: HeldDraftInput; products: Product[]; customer: Customer | null; totalPaise: number } };
export type ResumedBill = { bill: HeldBill; warnings: string[]; currentTotalPaise: number | null };
export type HeldMutation = { id: string; expectedRevision: number; action: { kind: 'save'; draft: HeldDraftInput } | { kind: 'resume' } | { kind: 'discard' } };
export type HeldPrepare = { id: string; expectedRevision: number; invoice: CheckoutRequest; payments: PaymentPart[] | null };

/** A draft can be underallocated, but invalid numeric input is never silently lost. */
export function heldDraftInput(cart: { productId: string; typedQuantity: string }[], tax: string,
  tender: CheckoutRequest['tender'], customer: string, amounts: PaymentAmounts,
  references: { upi: string; card: string }, note: string): HeldDraftInput {
  const taxBasisPoints = parseFixedDecimal(tax, 2);
  if (taxBasisPoints === null || taxBasisPoints > 10000) throw new Error('Enter a valid tax percentage before holding this bill.');
  if (!cart.length || cart.length > 100) throw new Error('Add at least one item before holding this bill.');
  if (note.length > 80 || /[\u0000-\u001f\u007f]/.test(note)) throw new Error('Use a short note of up to 80 characters.');
  const lines = cart.map(l => {
    const quantityMilli = parseFixedDecimal(l.typedQuantity, 3);
    if (quantityMilli === null || quantityMilli <= 0) throw new Error('Check item quantities before holding this bill.');
    return { productId: l.productId, quantityMilli };
  });
  const payments = tender === 'retail' ? paymentMethods.flatMap(method => {
    const amountPaise = parseFixedDecimal(amounts[method] || '0', 2);
    if (amountPaise === null) throw new Error('Check payment amounts before holding this bill.');
    return amountPaise > 0 ? [{ method, amountPaise, reference: method === 'cash' || method === 'credit' ? '' : references[method].trim() }] : [];
  }) : [];
  return { lines, taxBasisPoints, tender, customerId: customer || null, payments, note: note.trim() };
}
