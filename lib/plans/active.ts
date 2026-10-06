'use client';

/**
 * The entitlement the console is currently running on.
 *
 * The edge is the enforcement point (middleware refuses a module the plan does
 * not carry), but the *recording* gate has to live where money is recorded —
 * inside the store, synchronously, at the moment a collection is entered. The
 * store cannot await a fetch to decide whether a sale may be saved, so the
 * resolved entitlement is published here once (by `PlanProvider`, from the
 * server-issued cookie) and read synchronously by the store's actions.
 *
 * Deliberately not exported from `lib/plans/index.ts`: this is client-only
 * mutable state, and middleware must never be able to import it.
 *
 * Default is the free plan. A console that has not heard from the server yet
 * behaves exactly like an unentitled one — never more generously.
 */

import type { Transaction } from '@/lib/business-data';
import { resolveEntitlement } from './lifecycle';
import { collectionGate, countCollections, summarizeUsage } from './usage';
import type { ActionResultLike, Entitlement, PlanRecord } from './types';

let activeEntitlement: Entitlement = resolveEntitlement(null);

export function setActivePlanRecord(record: PlanRecord | null, now = Date.now()): Entitlement {
  activeEntitlement = resolveEntitlement(record, now);
  return activeEntitlement;
}

export function getActiveEntitlement(): Entitlement {
  return activeEntitlement;
}

/**
 * Gate one collection at the point of recording.
 *
 * Returns `null` when the collection may go ahead, or the refusal the store
 * should hand back to the caller. Only metered (non-cash) money is affected, so
 * a shop at its free allowance can always keep billing in cash.
 */
export function authorizeCollection(
  method: string | undefined,
  transactions: Transaction[],
  timeZone = 'Asia/Kolkata',
): ActionResultLike | null {
  const used = countCollections(transactions, { timeZone });
  const verdict = collectionGate(activeEntitlement, used, method);
  return verdict.allowed ? null : { ok: false, error: verdict.error };
}

export function currentUsage(transactions: Transaction[], timeZone = 'Asia/Kolkata') {
  return summarizeUsage(transactions, activeEntitlement, { timeZone });
}
