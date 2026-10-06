/**
 * Activation codes — how money turns into a plan without a payment gateway.
 *
 * DukaanOS's whole stance is that it never holds a business's money: collections
 * settle into the owner's own bank account and the platform never touches them.
 * The same rule applies in reverse — **the platform's own ₹499 is collected on
 * its own UPI, and nothing is charged automatically.** No mandate, no card on
 * file, no silent auto-debit. So the bridge from "I paid" to "my plan is on" has
 * to be explicit, verifiable, and impossible to forge:
 *
 *   ```bash
 *   npm run mint:activation -- --plan growth --months 3 --reference UPI-XX1234
 *   # → DKS1-eyJ...e.9f2c...  (send this to the owner; they paste it in Your Plan)
 *   ```
 *
 * The code is an HMAC-SHA256 signature over the plan, the months paid for, the
 * payment reference, and an expiry. It is verified on the server with
 * `DUKAANOS_ACTIVATION_SECRET`, which is **server-only** — it is never shipped
 * to the browser, so no owner can mint their own plan no matter what they
 * change in devtools.
 *
 * Honest limits, stated rather than hidden:
 *   • With no `DUKAANOS_ACTIVATION_SECRET` configured, activation is disabled
 *     and the API says so. It never falls back to something guessable.
 *   • A code is bearer-style: whoever holds it can redeem it once. Redeeming it
 *     is what the record's `reference` is for — support can see which payment a
 *     plan came from, and re-issuing is a deliberate human act, not a default.
 *
 * Pure and Edge-safe: Web Crypto only.
 */

import { base64UrlDecode, base64UrlEncode, constantTimeEqual, hmacSha256Base64Url } from '@/lib/security/crypto';
import { isPlanId } from './catalogue';
import type { PaidPlanId, PlanRecord } from './types';

/** Prefix so a pasted code is recognisable in a WhatsApp message. */
export const ACTIVATION_PREFIX = 'DKS1';

/** How long an unused code stays valid. Long enough for a bank transfer to land. */
export const ACTIVATION_VALID_DAYS = 30;

const DAY_SECONDS = 86_400;

type CodePayload = {
  /** Paid plan this code grants. */
  p: PaidPlanId;
  /** Months of access it buys. */
  m: number;
  /** Human payment reference (UPI txn id, bank UTR, receipt number). */
  r: string;
  /** Issued-at / expires-at, epoch seconds. */
  i: number;
  e: number;
};

export function activationSecret(): string {
  return (process.env.DUKAANOS_ACTIVATION_SECRET ?? '').trim();
}

/** Activation is a deliberate capability: absent secret means "off", never "open". */
export function isActivationConfigured(): boolean {
  return activationSecret().length >= 32;
}

function normalizePayload(value: unknown): CodePayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CodePayload>;
  if (!isPlanId(candidate.p)) return null;
  if ((candidate.p as string) === 'trial') return null; // a trial is never purchasable
  if (typeof candidate.m !== 'number' || !Number.isFinite(candidate.m) || candidate.m < 1 || candidate.m > 36) return null;
  if (typeof candidate.r !== 'string' || candidate.r.trim().length < 2 || candidate.r.length > 80) return null;
  if (typeof candidate.i !== 'number' || typeof candidate.e !== 'number') return null;
  return { p: candidate.p, m: Math.floor(candidate.m), r: candidate.r.trim(), i: Math.floor(candidate.i), e: Math.floor(candidate.e) };
}

/** `DKS1-<payload>.<signature>` — the string an owner pastes into Your Plan. */
export async function mintActivationCode(
  input: { planId: PaidPlanId; months: number; reference: string; validDays?: number },
  secret = activationSecret(),
  now = Date.now(),
): Promise<string> {
  if (secret.length < 32) throw new Error('DUKAANOS_ACTIVATION_SECRET is not configured (32+ characters required).');
  const payload: CodePayload = {
    p: input.planId,
    m: Math.floor(input.months),
    r: input.reference.trim(),
    i: Math.floor(now / 1000),
    e: Math.floor(now / 1000) + (input.validDays ?? ACTIVATION_VALID_DAYS) * DAY_SECONDS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256Base64Url(secret, encoded);
  return `${ACTIVATION_PREFIX}-${encoded}.${signature}`;
}

export type ActivationVerdict =
  | { valid: true; planId: PaidPlanId; months: number; reference: string }
  | { valid: false; reason: 'not-configured' | 'malformed' | 'bad-signature' | 'expired' };

export async function verifyActivationCode(
  code: string | undefined | null,
  secret = activationSecret(),
  now = Date.now(),
): Promise<ActivationVerdict> {
  if (secret.length < 32) return { valid: false, reason: 'not-configured' };
  if (!code || typeof code !== 'string') return { valid: false, reason: 'malformed' };

  const trimmed = code.trim().replace(/\s+/g, '');
  const body = trimmed.startsWith(`${ACTIVATION_PREFIX}-`) ? trimmed.slice(ACTIVATION_PREFIX.length + 1) : trimmed;
  const parts = body.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };

  const [encoded, signature] = parts;
  const expected = await hmacSha256Base64Url(secret, encoded);
  if (!constantTimeEqual(expected, signature)) return { valid: false, reason: 'bad-signature' };

  let payload: CodePayload | null = null;
  try {
    payload = normalizePayload(JSON.parse(base64UrlDecode(encoded)));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!payload) return { valid: false, reason: 'malformed' };

  if (payload.e * 1000 < now) return { valid: false, reason: 'expired' };

  return { valid: true, planId: payload.p, months: payload.m, reference: payload.r };
}

/** Add calendar months to an epoch-seconds instant, clamping short months. */
export function addMonths(epochSeconds: number, months: number): number {
  const date = new Date(epochSeconds * 1000);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return Math.floor(date.getTime() / 1000);
}

/**
 * Turn a verified activation into the record the server will sign.
 *
 * Renewals stack (an owner who pays early loses nothing), plan changes start
 * from today (an upgrade should not inherit a cheaper plan's remaining days),
 * and the price lock starts its own clock from the moment of activation.
 */
export function recordFromActivation(
  current: PlanRecord | null,
  planId: PaidPlanId,
  months: number,
  reference: string,
  now = Date.now(),
): PlanRecord {
  const nowSeconds = Math.floor(now / 1000);
  const samePlan = current?.planId === planId;
  const base = samePlan && current && current.renewsAt > nowSeconds ? current.renewsAt : nowSeconds;
  return {
    planId,
    since: samePlan && current ? current.since || nowSeconds : nowSeconds,
    renewsAt: addMonths(base, months),
    trialEndsAt: 0,
    activatedBy: 'activation-code',
    reference,
    trialUsedAt: current?.trialUsedAt,
    priceLockedUntil: addMonths(nowSeconds, Math.max(months, 12)),
  };
}
