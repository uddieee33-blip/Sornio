/**
 * The plan catalogue — what DukaanOS costs and what each plan opens.
 *
 * One source of truth, read by three surfaces that must never disagree:
 *
 *   1. the **landing page** (`app/page.tsx`) — what a buyer is promised,
 *   2. the **console** (`/subscription`) — what the owner was actually sold,
 *   3. the **edge** (`middleware.ts`) — what the server will actually serve.
 *
 * Prices are whole rupees. DukaanOS never takes a cut of a business's
 * collections and never holds its money, so a plan price is the *only* rupee
 * figure the platform itself ever charges.
 *
 * Pure data: safe to import from Edge middleware.
 */

import { ALL_MODULES } from '@/lib/portals/catalogue';
import type { ModuleKey } from '@/lib/portals/types';
import type { PlanDefinition, PlanId, PaidPlanId } from './types';

/**
 * The paid automations. Everything else — billing, stock, the counter, the
 * ledger, the audit chain, the collection QR — is in the free plan forever,
 * because a business that cannot record a sale is not a customer, it is a
 * hostage. A store that cannot run is not a store worth paying for.
 */
export const GROWTH_MODULES: ModuleKey[] = [
  'memberships',
  'reminders',
  'checkins',
  'appointments',
  'marketing',
  'profitability',
  'comparisons',
];

/**
 * Modules that are never subject to a plan. A lapsed business must always be
 * able to read its own ledger, see its own audit history, reach its own
 * settings, and pay us — locking those would be extortion, not pricing.
 */
export const ALWAYS_OPEN_MODULES: ModuleKey[] = [
  'cockpit',
  'business',
  'team',
  'audit',
  'security',
  'settings',
  'subscription',
];

const STARTER_MODULES: ModuleKey[] = ALL_MODULES.filter(
  (module) => !GROWTH_MODULES.includes(module) && !ALWAYS_OPEN_MODULES.includes(module),
).concat(ALWAYS_OPEN_MODULES);

/** Shown wherever a plan is described, in the owner's terms. */
export const TRIAL_DAYS = 7;

/** How long everything keeps working after a paid period ends. */
export const GRACE_DAYS = 7;

/** Early-business promise: a paid price is locked for this many months. */
export const PRICE_LOCK_MONTHS = 12;

export const PLAN_CATALOGUE: PlanDefinition[] = [
  {
    id: 'trial',
    name: 'Full trial',
    tagline: `Every module, every feature, ${TRIAL_DAYS} days, no card, no UPI mandate.`,
    for: 'Owners deciding whether DukaanOS fits how they actually work.',
    prices: [{ interval: 'forever', amount: 0, months: 0 }],
    trialDays: TRIAL_DAYS,
    graceDays: GRACE_DAYS,
    modules: 'all',
    collectionsPerMonth: null,
    products: null,
    seats: null,
    branches: 1,
    highlights: [
      `Every module unlocked for ${TRIAL_DAYS} days — the paid console, not a demo`,
      'Unlimited UPI collections and entries while it lasts',
      'No card, no mandate, no auto-debit — it simply ends',
      'Nothing is deleted when it ends: your records stay, and the free plan takes over',
    ],
    excluded: [`Lasts ${TRIAL_DAYS} days by design — after that, keep what you recorded on the free plan or pick a paid plan`],
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Run the whole shop at ₹0. Forever, not "free for now".',
    for: 'A single-counter business finding its feet, or a shop that only needs a clean set of books.',
    prices: [{ interval: 'forever', amount: 0, months: 0 }],
    trialDays: 0,
    graceDays: 0,
    modules: STARTER_MODULES,
    collectionsPerMonth: 25,
    products: 200,
    seats: 2,
    branches: 1,
    highlights: [
      'Counter billing, printed bills and digital receipts',
      'Your own UPI collection QR — paid straight into your bank, we never touch it',
      'Stock, suppliers, udhaar khata and customer records',
      'Live ledger: revenue, expenses, cash flow, profit — computed from real entries only',
      'Scan Station: barcode, weigh-label and internal codes',
      'Audit history with a tamper-evident hash chain, encrypted at rest on your device',
      'Free forever — not a 14-day countdown',
    ],
    excluded: [
      `25 UPI collections a month — unlimited on Growth`,
      'Memberships & renewals, check-ins, day book, marketing, margins — these are the Growth automations',
      '200 catalogue items, 2 team seats',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'The automations that find money you are already losing.',
    for: 'Gyms, salons, cafés and shops with renewals to chase and margins to protect.',
    prices: [
      { interval: 'month', amount: 499, months: 1 },
      { interval: 'quarter', amount: 999, months: 3 },
      { interval: 'year', amount: 4990, months: 12 },
    ],
    trialDays: TRIAL_DAYS,
    graceDays: GRACE_DAYS,
    modules: 'all',
    collectionsPerMonth: null,
    products: null,
    seats: 10,
    branches: 1,
    popular: true,
    highlights: [
      'Everything in Starter, with no collection limit at all',
      'Memberships, renewals and expiry reminders — one SMS/WhatsApp draft per lapsed member, personalised',
      'Check-ins and day book for gyms, salons and studios',
      'Profitability by item and month-over-month comparisons',
      'Campaign tracking where the spend is booked as a real expense',
      'Unlimited catalogue, 10 team seats',
      'Your price is locked for 12 months from activation',
    ],
    excluded: [
      'One branch — multi-branch ledgers are Scale',
      'No auto-debit: plans renew when you pay, never by silent mandate',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'Several counters, several branches, one set of books.',
    for: 'Owners running more than one counter or looking over more than one shop.',
    prices: [
      { interval: 'quarter', amount: 1999, months: 3 },
      { interval: 'year', amount: 6999, months: 12 },
    ],
    trialDays: TRIAL_DAYS,
    graceDays: GRACE_DAYS,
    modules: 'all',
    collectionsPerMonth: null,
    products: null,
    seats: null,
    branches: null,
    highlights: [
      'Everything in Growth, unlimited',
      'Multi-branch ledger and branch comparisons',
      'Unlimited team seats for counter staff and managers',
      'Guided onboarding: your catalogue and opening balances entered with you',
      'Priority support on WhatsApp',
    ],
    excluded: ['Only difference from Growth is scale and support — no feature is held back from Growth'],
  },
];

const BY_ID = new Map<PlanId, PlanDefinition>(PLAN_CATALOGUE.map((plan) => [plan.id, plan]));

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && BY_ID.has(value as PlanId);
}

/** The paid plans, in the order they should be shown. */
export function paidPlans(): PlanDefinition[] {
  return PLAN_CATALOGUE.filter((plan) => plan.id !== 'trial' && plan.id !== 'starter');
}

/** Every plan a business can actually choose (the trial is started, not chosen). */
export function choosablePlans(): PlanDefinition[] {
  return PLAN_CATALOGUE.filter((plan) => plan.id !== 'trial');
}

export function planById(id: unknown): PlanDefinition {
  return (isPlanId(id) ? BY_ID.get(id) : undefined) ?? BY_ID.get('starter')!;
}

/** The interval a plan is sold on by default (used for the landing headline). */
export function headlinePrice(plan: PlanDefinition) {
  return plan.prices[plan.prices.length - 1];
}

export function monthlyEquivalent(plan: PlanDefinition, priceIndex = 0): number | null {
  const price = plan.prices[priceIndex];
  if (!price || price.months === 0) return null;
  return Math.round(price.amount / price.months);
}

/** Rupees saved by paying for the longest interval up front. */
export function savingsOn(plan: PlanDefinition, interval: string): number {
  const monthly = plan.prices.find((price) => price.interval === 'month');
  const target = plan.prices.find((price) => price.interval === interval);
  if (!monthly || !target || target.months === 0) return 0;
  return Math.max(monthly.amount * target.months - target.amount, 0);
}

export function intervalLabel(interval: string): string {
  switch (interval) {
    case 'forever':
      return 'forever';
    case 'month':
      return 'month';
    case 'quarter':
      return 'quarter';
    case 'year':
      return 'year';
    default:
      return interval;
  }
}

export const PAID_PLAN_IDS: PaidPlanId[] = ['starter', 'growth', 'scale'];
