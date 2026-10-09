/**
 * Plan lifecycle — the state machine, resolved from dates and nothing else.
 *
 * The rule that keeps this honest: **a plan is never stored as "active"**. A
 * record stores when a period ends; the state is derived against a `now` the
 * caller passes in. That means a stale cookie, a rolled-back device clock, or a
 * forgotten row in a database can never extend access — and it means the same
 * function decides the answer at the Edge and in the browser, so the two can
 * never disagree about what a business is entitled to.
 *
 *            ┌─ trialing ──── trial ends ──┐
 *   record ──┤                             ├──► free  (Starter limits, still a working shop)
 *            ├─ active ── period ends ──► grace ── 7 days ──► expired (Starter limits)
 *            └─ free ─────────────────────────────────────► free
 *
 * `grace` is a courtesy, not a loophole: a paid plan whose period ended keeps
 * every module for `graceDays` while the owner renews, because a shop should
 * never be cut off mid-Saturday because a payment cleared a day late.
 *
 * Pure: no network, no storage, no clock of its own.
 */

import { ALWAYS_OPEN_MODULES, GRACE_DAYS, planById } from './catalogue';
import type { ModuleKey } from '@/lib/portals/types';
import type { Entitlement, PlanId, PlanRecord, PlanState } from './types';

const DAY_SECONDS = 86_400;

function toEpoch(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** A record that has already lapsed, kept as the free plan. */
export function freeRecord(now = Date.now()): PlanRecord {
  return {
    planId: 'starter',
    since: Math.floor(now / 1000),
    renewsAt: 0,
    trialEndsAt: 0,
    activatedBy: 'self',
  };
}

/** The plan a lapsed business falls back to — free, and still a working shop. */
export function fallbackPlanId(): PlanId {
  return 'starter';
}

/**
 * Resolve a record into the entitlement that governs this request.
 *
 * `record === null` is not an error: it is a business that has never chosen,
 * and it gets the free plan (never a paid one, and never "no access at all").
 */
export function resolveEntitlement(record: PlanRecord | null | undefined, now = Date.now()): Entitlement {
  const nowSeconds = Math.floor(now / 1000);
  const safeRecord: PlanRecord | null = record && typeof record === 'object' ? record : null;

  if (!safeRecord) {
    return stamp(buildEntitlement('starter', 'free', nowSeconds, 0, 0, 0, 0), false, null);
  }

  const planId: PlanId = planById(safeRecord.planId).id;
  const trialEndsAt = toEpoch(safeRecord.trialEndsAt);
  const renewsAt = toEpoch(safeRecord.renewsAt);
  const priceLockedUntil = toEpoch(safeRecord.priceLockedUntil);
  const plan = planById(planId);
  const graceEndsAt = renewsAt > 0 ? renewsAt + (plan.graceDays || GRACE_DAYS) * DAY_SECONDS : 0;

  const trialUsed = Boolean(safeRecord.trialUsedAt && safeRecord.trialUsedAt > 0);

  if (planId === 'trial') {
    if (trialEndsAt > nowSeconds) {
      return stamp(
        buildEntitlement('trial', 'trialing', nowSeconds, renewsAt, graceEndsAt, trialEndsAt, priceLockedUntil),
        true,
        null,
      );
    }
    // The trial ran out. Everything recorded is still here; the automations are
    // what the owner is being asked to pay for, and they say so out loud.
    return stamp(
      buildEntitlement('starter', 'expired', nowSeconds, 0, 0, trialEndsAt, priceLockedUntil),
      true,
      'trial',
    );
  }

  if (plan.prices.every((price) => price.amount === 0)) {
    // The free plan: no period, no countdown, no expiry. It cannot lapse.
    return stamp(buildEntitlement(planId, 'free', nowSeconds, 0, 0, 0, priceLockedUntil), trialUsed, null);
  }

  if (renewsAt > nowSeconds) {
    return stamp(buildEntitlement(planId, 'active', nowSeconds, renewsAt, graceEndsAt, 0, priceLockedUntil), trialUsed, null);
  }

  if (graceEndsAt > nowSeconds) {
    return stamp(buildEntitlement(planId, 'grace', nowSeconds, renewsAt, graceEndsAt, 0, priceLockedUntil), trialUsed, null);
  }

  return stamp(
    buildEntitlement('starter', 'expired', nowSeconds, renewsAt, graceEndsAt, 0, priceLockedUntil),
    trialUsed,
    planId,
  );
}

/** Attach the two facts that describe *how* a plan got here, not what it opens. */
function stamp(entitlement: PartialEntitlement, trialUsed: boolean, lapsedFrom: PlanId | null): Entitlement {
  return { ...entitlement, trialUsed, lapsedFrom };
}

/** Everything except the two "how did we get here" facts, which `stamp` adds. */
type PartialEntitlement = Omit<Entitlement, 'trialUsed' | 'lapsedFrom'>;

function buildEntitlement(
  planId: PlanId,
  state: PlanState,
  nowSeconds: number,
  renewsAt: number,
  graceEndsAt: number,
  trialEndsAt: number,
  priceLockedUntil: number,
): PartialEntitlement {
  const plan = planById(planId);
  const fullAccess = state === 'trialing' || state === 'active' || state === 'grace';

  // A lapsed or trial-less business runs on the free plan's limits — a working
  // shop, not a locked door. This is the one place that decides it, so the
  // console, the edge, and the documentation cannot drift apart.
  const effective = fullAccess ? plan : planById(fallbackPlanId());

  const horizon = state === 'trialing' ? trialEndsAt : state === 'grace' ? graceEndsAt : renewsAt;
  const daysLeft = horizon > nowSeconds ? Math.ceil((horizon - nowSeconds) / DAY_SECONDS) : 0;

  return {
    planId,
    plan,
    state,
    fullAccess,
    modules: effective.modules,
    collectionsPerMonth: effective.collectionsPerMonth,
    products: effective.products,
    seats: effective.seats,
    branches: effective.branches,
    renewsAt,
    graceEndsAt,
    trialEndsAt,
    priceLockedUntil,
    daysLeft,
  };
}

export function entitlementHasModule(entitlement: Entitlement, module: ModuleKey | string): boolean {
  if (entitlement.modules === 'all') return true;
  if ((ALWAYS_OPEN_MODULES as string[]).includes(module)) return true;
  return (entitlement.modules as string[]).includes(module);
}

/** Human sentence for a state — used verbatim in the console and the emails. */
export function describeState(entitlement: Entitlement): string {
  switch (entitlement.state) {
    case 'trialing':
      return entitlement.daysLeft === 1
        ? 'Trial: last day. Every module, every feature, every limit removed — experience the full console.'
        : `Trial: ${entitlement.daysLeft} days left. Every module, every feature, every limit removed — experience the full console.`;
    case 'active':
      return `${entitlement.plan.name} is active — ${entitlement.daysLeft} day${entitlement.daysLeft === 1 ? '' : 's'} left in this period.`;
    case 'grace':
      return `${entitlement.plan.name} period ended. Everything still works for ${entitlement.daysLeft} more day${entitlement.daysLeft === 1 ? '' : 's'} while you renew.`;
    case 'expired':
      return 'Your paid period has ended. Your records are safe and the free plan is running — the Growth automations are paused.';
    case 'free':
    default:
      return 'Free plan — the full counter, billing, stock and ledger, at ₹0 forever.';
  }
}
