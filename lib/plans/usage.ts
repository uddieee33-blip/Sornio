/**
 * Usage metering — counted from the ledger, never from a counter we own.
 *
 * The free plan's one real limit is **25 UPI collections a month**. That number
 * has to be honest: it is not "entries", not "clicks", not "sessions". It is
 * money that actually arrived into the business's own bank account through its
 * own collection QR, and it is counted by reading the same transactions the
 * ledger already holds.
 *
 * Three consequences, all deliberate:
 *
 *   1. **Cash is never metered.** A shop that runs out of free UPI collections
 *      can still bill in cash, record the sale, print the bill, and keep the
 *      books. We slow down the *paid* path; we never stop the shop.
 *   2. **The count is derived, not stored.** Resetting it is not a feature we
 *      had to write — a new month simply has no transactions in it yet.
 *   3. **A tampered ledger is a tampered business.** Somebody who deletes their
 *      own sales to avoid a ₹499 plan is lying to their own books, not to us.
 *
 * Pure: a list of transactions and a `now` in, a number out.
 */

import type { Transaction } from '@/lib/business-data';
import type { CollectionGate, Entitlement, UsageSummary } from './types';
import { UPGRADE_PATH } from './routes';

/** Methods that count against the collection allowance. */
const METERED_ACCOUNTS = new Set(['upi', 'bank']);
const UNMETERED_METHODS = new Set(['Cash', 'Card', 'Other']);

export function isMeteredMethod(method: string | undefined): boolean {
  if (!method) return false;
  return !UNMETERED_METHODS.has(method);
}

/** `YYYY-MM` for a date in a given IANA timezone (the business's own clock). */
export function monthKey(date: Date, timeZone = 'Asia/Kolkata'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    return `${year}-${month}`;
  } catch {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}

/**
 * Count collections in a month.
 *
 * A collection is money *in* to a real payment account (UPI or bank), not a
 * revenue accrual and not a stock movement. Only incoming, metered-method
 * transactions are counted — one sale that produced both a revenue line and a
 * cash line is therefore counted once, and only on the money line.
 */
export function countCollections(
  transactions: Transaction[],
  options: { now?: Date; timeZone?: string } = {},
): number {
  const now = options.now ?? new Date();
  const key = monthKey(now, options.timeZone);
  let count = 0;
  for (const tx of transactions) {
    if (tx.direction !== 'in') continue;
    if (!METERED_ACCOUNTS.has(tx.account)) continue;
    if (!isMeteredMethod(tx.paymentMethod)) continue;
    const when = new Date(tx.date);
    if (Number.isNaN(when.getTime())) continue;
    if (monthKey(when, options.timeZone) !== key) continue;
    count += 1;
  }
  return count;
}

export function summarizeUsage(
  transactions: Transaction[],
  entitlement: Entitlement,
  options: { now?: Date; timeZone?: string } = {},
): UsageSummary {
  const now = options.now ?? new Date();
  const used = countCollections(transactions, { now, timeZone: options.timeZone });
  const allowance = entitlement.collectionsPerMonth;
  return {
    monthKey: monthKey(now, options.timeZone),
    upiCollections: used,
    allowance,
    remaining: allowance === null ? null : Math.max(allowance - used, 0),
    overAllowance: allowance !== null && used >= allowance,
  };
}

/**
 * May one more collection be recorded?
 *
 * Returns a sentence that names the limit, the plan that removes it, and the
 * promise that nothing the owner recorded is at stake — then the UI shows it
 * verbatim. Called on every collection path so the rule is enforced where the
 * money is recorded, not only where the button is drawn.
 */
export function collectionGate(
  entitlement: Entitlement,
  usedThisMonth: number,
  method: string | undefined,
): CollectionGate {
  if (!isMeteredMethod(method)) return { allowed: true };
  const allowance = entitlement.collectionsPerMonth;
  if (allowance === null) return { allowed: true };
  if (usedThisMonth < allowance) return { allowed: true };
  return {
    allowed: false,
    used: usedThisMonth,
    allowance,
    upgradeHref: UPGRADE_PATH,
    error:
      `You have used all ${allowance} UPI collections on the free plan this month. ` +
      `Cash and card entries still work, nothing you recorded is locked — ` +
      `Growth removes the limit entirely (₹499/month). Open Your Plan to continue.`,
  };
}
