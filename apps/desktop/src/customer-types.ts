export type Customer = { id: string; name: string; phone: string | null; creditLimitPaise: number | null; creditDays: number; revision: number; balancePaise: string; overduePaise: string; availableCreditPaise: string | null };
export type CreditKind = 'repayment' | 'opening_due' | 'write_off' | 'reversal';
export type CreditRequest = { operationId: string; customerId: string; expectedRevision: number; kind: CreditKind; amountPaise: number; reason: string; dueOn: string | null; reverseOf: string | null };
export type CreditReceipt = { operationId: string; customerId: string; kind: string; amountPaise: number; balancePaise: string; revision: number; createdAt: string };
export type PendingCredit = { request: CreditRequest; receipt: CreditReceipt | null };
export type StatementLine = { sequence: number; operationId: string; kind: string; amountPaise: string; runningBalancePaise: string; createdAt: string; dueOn: string | null; invoiceId: string | null; reverseOf: string | null; reason: string };
export type Statement = { customer: Customer; through: number; nextAfter: number; hasMore: boolean; openingBalancePaise: string; closingBalancePaise: string; entries: StatementLine[] };
