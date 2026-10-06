/**
 * Plans & entitlements — public surface.
 *
 * The paid product, layered the same way as the security layer, so a caller
 * picks the narrowest tool it needs:
 *
 *   ┌ catalogue ──── catalogue.ts   plans, prices, what each one unlocks
 *   │ lifecycle ──── lifecycle.ts    trialing → active → grace → expired, from dates
 *   │ policy ─────── routes.ts       which route a plan may open (Edge-safe)
 *   │ usage ──────── usage.ts        the free plan's collection allowance, from the ledger
 *   │ proof ──────── activation.ts   signed activation codes (money → plan)
 *   │ transport ──── cookie.ts       signed, httpOnly, server-issued plan cookie
 *   └ client ─────── active.ts       what the console believes right now
 *
 * Import from `@/lib/plans` rather than reaching into single files.
 */

export type {
  BillingInterval,
  CollectionGate,
  Entitlement,
  PaidPlanId,
  PlanDefinition,
  PlanId,
  PlanRecord,
  PlanState,
  PricePoint,
  UsageSummary,
} from './types';

export {
  ALWAYS_OPEN_MODULES,
  GRACE_DAYS,
  GROWTH_MODULES,
  PAID_PLAN_IDS,
  PLAN_CATALOGUE,
  PRICE_LOCK_MONTHS,
  TRIAL_DAYS,
  choosablePlans,
  headlinePrice,
  intervalLabel,
  isPlanId,
  monthlyEquivalent,
  paidPlans,
  planById,
  savingsOn,
} from './catalogue';

export {
  describeState,
  entitlementHasModule,
  fallbackPlanId,
  freeRecord,
  resolveEntitlement,
} from './lifecycle';

export {
  PLAN_LOCKED_PARAM,
  UPGRADE_PATH,
  checkPlanAccess,
  lockedModuleFromParam,
  lockedModulesFor,
  type PlanAccessVerdict,
} from './routes';

export { collectionGate, countCollections, isMeteredMethod, monthKey, summarizeUsage } from './usage';

export {
  PLAN_COOKIE,
  PLAN_COOKIE_MAX_AGE,
  openPlanRecord,
  planCookieOptions,
  sealPlanRecord,
} from './cookie';

export {
  ACTIVATION_VALID_DAYS,
  addMonths,
  isActivationConfigured,
  mintActivationCode,
  recordFromActivation,
  verifyActivationCode,
  type ActivationVerdict,
} from './activation';
