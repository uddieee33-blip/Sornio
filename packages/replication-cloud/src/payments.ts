import { ReplicationError } from './types';

const MAX = 9_000_000_000_000n;
export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ClassifiedPayments = {
  cashPaise: bigint;
  digitalPaise: bigint;
  customerCreditPaise: bigint;
  parts: { id: string; method: PaymentMethod; amountPaise: bigint }[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new ReplicationError('INVALID_ENVELOPE', `${label} must be an integer.`);
    const parsed = BigInt(value);
    if (parsed < 1n || parsed > MAX) throw new ReplicationError('INVALID_ENVELOPE', `${label} is outside native bounds.`);
    return parsed;
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed < 1n || parsed > MAX) throw new ReplicationError('INVALID_ENVELOPE', `${label} is outside native bounds.`);
    return parsed;
  }
  throw new ReplicationError('INVALID_ENVELOPE', `${label} must be an integer.`);
}

/**
 * Native PaymentPart methods: cash | upi | card | credit.
 * Cash is collected immediately.
 * UPI and card stay in digital receivables until statement match — not customer credit.
 * Credit is customer debt and requires a customer on the invoice.
 */
export function parsePaymentParts(parts: unknown): ClassifiedPayments {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 8) {
    throw new ReplicationError('INVALID_ENVELOPE', 'A sale needs between 1 and 8 payment parts.');
  }
  const ids = new Set<string>();
  let cashPaise = 0n;
  let digitalPaise = 0n;
  let customerCreditPaise = 0n;
  let creditParts = 0;
  const classified: ClassifiedPayments['parts'] = [];
  for (const part of parts) {
    if (!record(part)) throw new ReplicationError('INVALID_ENVELOPE', 'Payment part is missing.');
    if (typeof part.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(part.id) || ids.has(part.id)) {
      throw new ReplicationError('INVALID_ENVELOPE', 'Payment part identity is missing or duplicated.');
    }
    ids.add(part.id);
    const amountPaise = integer(part.amountPaise, 'Payment amount');
    if (part.method === 'cash') cashPaise += amountPaise;
    else if (part.method === 'upi' || part.method === 'card') digitalPaise += amountPaise;
    else if (part.method === 'credit') {
      creditParts += 1;
      customerCreditPaise += amountPaise;
    } else {
      throw new ReplicationError('INVALID_ENVELOPE', 'Unsupported payment method.');
    }
    classified.push({ id: part.id, method: part.method as PaymentMethod, amountPaise });
  }
  if (creditParts > 1) {
    throw new ReplicationError('INVALID_ENVELOPE', 'A sale may carry at most one customer-credit part.');
  }
  return { cashPaise, digitalPaise, customerCreditPaise, parts: classified };
}

export function classifyPayments(parts: unknown, expectedTotal: bigint, customerId: string | null): ClassifiedPayments {
  const classified = parsePaymentParts(parts);
  const creditParts = classified.parts.filter((part) => part.method === 'credit').length;
  if ((creditParts === 1) !== Boolean(customerId)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Customer credit requires a customer, and a customer requires a credit part.');
  }
  if (classified.cashPaise + classified.digitalPaise + classified.customerCreditPaise !== BigInt(expectedTotal)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Payment parts must equal the invoice total.');
  }
  return classified;
}

export function allocationForTender(
  tender: unknown,
  totalPaise: bigint,
  customerId: string | null,
): { cashPaise: bigint; digitalPaise: bigint; customerCreditPaise: bigint; complete: boolean } | null {
  if (tender === 'cash') {
    // An identified cash customer is not a customer-credit allocation.
    return { cashPaise: totalPaise, digitalPaise: 0n, customerCreditPaise: 0n, complete: true };
  }
  if (tender === 'credit') {
    if (!customerId) throw new ReplicationError('INVALID_ENVELOPE', 'A credit tender requires a customer.');
    return { cashPaise: 0n, digitalPaise: 0n, customerCreditPaise: totalPaise, complete: true };
  }
  if (tender === 'retail') {
    return { cashPaise: 0n, digitalPaise: 0n, customerCreditPaise: 0n, complete: false };
  }
  throw new ReplicationError('INVALID_ENVELOPE', 'Unknown invoice tender.');
}
