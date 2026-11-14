import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal.ts';

export const paymentMethods = ['cash', 'upi', 'card', 'credit'] as const;
export type PaymentMethod = typeof paymentMethods[number];
export type PaymentAmounts = Record<PaymentMethod, string>;

/** UI preview only. Posting always revalidates the native price and allocation. */
export function allocationPreview(totalPaise: number, amounts: PaymentAmounts) {
  const parts = paymentMethods.map(method => ({ method, amountPaise: parseFixedDecimal(amounts[method] || '0', 2) }));
  const invalidMethod = parts.find(part => part.amountPaise === null)?.method ?? null;
  // Four bounded integer values remain below Number.MAX_SAFE_INTEGER.
  const allocatedPaise = parts.reduce((sum, part) => sum + (part.amountPaise ?? 0), 0);
  return { parts, invalidMethod, allocatedPaise, remainingPaise: totalPaise - allocatedPaise,
    creditPaise: parts.find(part => part.method === 'credit')!.amountPaise ?? 0 };
}

/** Replace one amount with the remainder after all the other tenders. */
export function remainingForMethod(totalPaise: number, amounts: PaymentAmounts, method: PaymentMethod): number | null {
  const allocation = allocationPreview(totalPaise, { ...amounts, [method]: '' });
  return allocation.invalidMethod || allocation.remainingPaise < 0 ? null : allocation.remainingPaise;
}

/** This is original invoice debt, never the customer's current account balance. */
export function originalCreditDue(tender: string, totalPaise: number, customerId: string | null,
  payments?: readonly { id: string; method: string; amountPaise: number }[]): number | null {
  if (tender === 'cash') return 0;
  if (tender === 'credit') return customerId ? totalPaise : null;
  if (!payments?.length || payments.length > 8) return null;
  const ids = new Set<string>();
  let total = 0, credit = 0, creditParts = 0;
  for (const part of payments) {
    if (ids.has(part.id) || !paymentMethods.includes(part.method as PaymentMethod)
      || !Number.isSafeInteger(part.amountPaise) || part.amountPaise <= 0 || part.amountPaise > 9_000_000_000_000) return null;
    ids.add(part.id);
    total += part.amountPaise;
    if (part.method === 'credit') { credit += part.amountPaise; creditParts++; }
  }
  return total === totalPaise && creditParts <= 1 && Boolean(creditParts) === Boolean(customerId) ? credit : null;
}
