/**
 * Plans & entitlements — types.
 *
 * DukaanOS is sold, not given away, and the sale has to be enforced with the
 * same discipline as the rest of the security layer:
 *
 *   • **What a business may open** is decided once, here, as plain data, and
 *     then resolved twice — at the Edge (before a page renders) and in the UI
 *     (so the owner is told the truth about why something is locked).
 *   • **Nothing is decided by the client.** The browser may *ask* for a plan;
 *     only the server issues one, and only against a verifiable record.
 *   • **Nothing is destroyed when a plan lapses.** A lapsed business keeps its
 *     records, its ledger, and its ability to bill in cash. What it loses is
 *     the paid automation — never the shop, and never the data.
 *
 * Everything in this file is plain data so Edge middleware can import it
 * without pulling React, icons, or the store into the request path.
 */

import type { ModuleKey } from '@/lib/portals/types';

/** The plans a business can be on. `trial` is a full-access, time-boxed plan. */
export type PlanId = 'trial' | 'starter' | 'growth' | 'scale';

/** Paid plans are the ones a business actually chooses and renews. */
export type PaidPlanId = Exclude<PlanId, 'trial'>;

/** How a plan is billed. `forever` is the free plan; others are true periods. */
export type BillingInterval = 'forever' | 'month' | 'quarter' | 'year';

/** A price on one interval, in whole rupees (India bills in rupees, not cents). */
export type PricePoint = {
  interval: BillingInterval;
  amount: number;
  /** Months of access this price buys — 0 for the free plan. `quarter` = 3. */
  months: number;
};

/**
 * A plan, as sold.
 *
 * `modules` is the whole entitlement: either an explicit list or `'all'`.
 * A module that is not listed is not "hidden" — it is refused at the edge
 * (see `lib/plans/routes.ts`), exactly like a module the portal does not carry.
 */
export type PlanDefinition = {
  id: PlanId;
  name: string;
  /** One line an owner would repeat to a friend. */
  tagline: string;
  /** Who this plan is for, in the owner's own frame of reference. */
  for: string;
  prices: PricePoint[];
  /** Free trial length in days — 0 when the plan is not a trial. */
  trialDays: number;
  /** Days after a paid period ends during which everything still works. */
  graceDays: number;
  /** Modules this plan unlocks. `'all'` means every module in the catalogue. */
  modules: ModuleKey[] | 'all';
  /** UPI collections allowed per calendar month; `null` = unlimited. */
  collectionsPerMonth: number | null;
  /** Catalogue size cap; `null` = unlimited. */
  products: number | null;
  /** Team seats included; `null` = unlimited. */
  seats: number | null;
  /** Branches included; `null` = unlimited. */
  branches: number | null;
  /** Selling points, shown on the landing page and in the console. */
  highlights: string[];
  /** What this plan deliberately leaves out, and what unlocks it. */
  excluded: string[];
  /** The plan we recommend, marked once so the UI can never disagree. */
  popular?: true;
};

/**
 * The local, signed record of what this business is on.
 *
 * It is deliberately tiny: a plan id, the period it covers, and how it was
 * granted. It carries no money, no identity, and no permission of its own —
 * resolution (`resolveEntitlement`) turns it into an entitlement, and an
 * entitlement may only ever *remove* access, never add a permission the
 * security layer would otherwise refuse.
 */
export type PlanRecord = {
  planId: PlanId;
  /** Epoch seconds the current record began. */
  since: number;
  /** Epoch seconds the paid period ends. 0 = never (free plan, or a trial). */
  renewsAt: number;
  /** Epoch seconds the trial ends. 0 when this is not a trial. */
  trialEndsAt: number;
  /** How the plan was granted. `self` can only ever mean the free plan. */
  activatedBy: 'self' | 'activation-code' | 'provider';
  /** Opaque reference of the payment/activation this record came from. */
  reference?: string;
  /** Epoch seconds a trial was first started. Stops a second free trial. */
  trialUsedAt?: number;
  /** Epoch seconds the price is locked until (early-business promise). */
  priceLockedUntil?: number;
};

/** Where a plan currently stands, derived from dates only — never a flag. */
export type PlanState =
  | 'trialing'
  | 'active'
  | 'grace'
  | 'expired'
  | 'free';

/**
 * The resolved answer to "what may this business do right now?".
 *
 * Dates are recomputed on every request rather than stored, so a clock change
 * or a stale cookie cannot extend a plan: `now` is always passed in.
 */
export type Entitlement = {
  planId: PlanId;
  plan: PlanDefinition;
  state: PlanState;
  /** True when every module is open (trial, active, or in grace). */
  fullAccess: boolean;
  /** Modules this entitlement opens, resolved to the catalogue. */
  modules: ModuleKey[] | 'all';
  collectionsPerMonth: number | null;
  products: number | null;
  seats: number | null;
  branches: number | null;
  /** Epoch seconds. */
  renewsAt: number;
  graceEndsAt: number;
  trialEndsAt: number;
  priceLockedUntil: number;
  /** Whole days of access left (0 when lapsed). */
  daysLeft: number;
  /** True once a free trial has been started on this record — a trial is once. */
  trialUsed: boolean;
  /**
   * The plan the record named, when that plan has lapsed. Lets the console say
   * "your trial ended" or "your Growth period ended" instead of a vague
   * "something expired" — the owner deserves the specific truth.
   */
  lapsedFrom: PlanId | null;
};

/** How much of the free plan's collection allowance has been used this month. */
export type UsageSummary = {
  /** `YYYY-MM` in the business's own timezone. */
  monthKey: string;
  upiCollections: number;
  /** `null` when the plan is unlimited. */
  allowance: number | null;
  remaining: number | null;
  overAllowance: boolean;
};

/** The shape the store's actions return — kept structural to avoid a cycle. */
export type ActionResultLike = { ok: false; error: string };

/** The result of asking whether one more metered collection may be recorded. */
export type CollectionGate =
  | { allowed: true }
  | { allowed: false; error: string; upgradeHref: string; used: number; allowance: number };
