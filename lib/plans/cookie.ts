/**
 * The plan cookie — signed, httpOnly, and deliberately boring.
 *
 * Why a cookie and not a client store: the edge has to know what a business is
 * entitled to *before* a page renders. A value read from `localStorage` arrives
 * too late, and a value read from the DOM is a value the owner's own browser
 * could rewrite. So the server issues this, the server verifies it, and the
 * client is told the result.
 *
 * Format: `base64url(json).base64url(hmacSha256(json))` — the same shape as the
 * session token, signed with the deployment's session secret, so no additional
 * key has to be managed. Anything that does not verify is treated as **no
 * record**, which resolves to the free plan. Tampering can therefore never
 * unlock a paid module; the worst it can do is drop a paying business to the
 * free plan, which is why a verified record is refreshed by the server on every
 * successful `/api/subscription` call.
 *
 * Pure and Edge-safe: Web Crypto only.
 */

import { base64UrlDecode, base64UrlEncode, constantTimeEqual, hmacSha256Base64Url } from '@/lib/security/crypto';
import { resolveSessionSecret } from '@/lib/security/session';
import { isPlanId } from './catalogue';
import type { PlanRecord } from './types';
import type { CookieTransport } from '@/lib/security/cookies';

export const PLAN_COOKIE = 'dukaan.plan';

/** One year: a plan record outlives any single period, its dates decide access. */
export const PLAN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type Wire = {
  p?: unknown; // planId
  s?: unknown; // since
  r?: unknown; // renewsAt
  t?: unknown; // trialEndsAt
  u?: unknown; // trialUsedAt
  l?: unknown; // priceLockedUntil
  b?: unknown; // activatedBy
  f?: unknown; // reference
};

const ACTIVATORS = new Set(['self', 'activation-code', 'provider']);

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Compact wire form — short keys keep the cookie well under any header limit. */
export function encodePlanRecord(record: PlanRecord): string {
  const wire: Wire = {
    p: record.planId,
    s: numberOrZero(record.since),
    r: numberOrZero(record.renewsAt),
    t: numberOrZero(record.trialEndsAt),
    u: numberOrZero(record.trialUsedAt),
    l: numberOrZero(record.priceLockedUntil),
    b: record.activatedBy,
    f: record.reference,
  };
  return base64UrlEncode(JSON.stringify(wire));
}

export function decodePlanRecord(payloadSegment: string): PlanRecord | null {
  let wire: Wire;
  try {
    wire = JSON.parse(base64UrlDecode(payloadSegment)) as Wire;
  } catch {
    return null;
  }
  if (!isPlanId(wire.p)) return null;
  const activatedBy = typeof wire.b === 'string' && ACTIVATORS.has(wire.b) ? (wire.b as PlanRecord['activatedBy']) : 'self';
  const reference = typeof wire.f === 'string' && wire.f.length <= 120 ? wire.f : undefined;
  return {
    planId: wire.p,
    since: numberOrZero(wire.s),
    renewsAt: numberOrZero(wire.r),
    trialEndsAt: numberOrZero(wire.t),
    trialUsedAt: numberOrZero(wire.u) || undefined,
    priceLockedUntil: numberOrZero(wire.l) || undefined,
    activatedBy,
    reference,
  };
}

/** Sign a record into the cookie value the server will accept back. */
export async function sealPlanRecord(record: PlanRecord, secret = resolveSessionSecret()): Promise<string> {
  const payload = encodePlanRecord(record);
  const signature = await hmacSha256Base64Url(secret, payload);
  return `${payload}.${signature}`;
}

/**
 * Verify a cookie value.
 *
 * Returns `null` for a missing token, a malformed one, or a signature that does
 * not match this deployment's key — the caller then falls back to the free
 * plan. It never throws: a broken cookie must not break a page.
 */
export async function openPlanRecord(
  token: string | undefined | null,
  secret = resolveSessionSecret(),
): Promise<PlanRecord | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;
  const expected = await hmacSha256Base64Url(secret, payload);
  if (!constantTimeEqual(expected, signature)) return null;
  return decodePlanRecord(payload);
}

/** Cookie attributes. httpOnly: no script on the page may rewrite a plan. */
export function planCookieOptions(transport: CookieTransport) {
  return {
    httpOnly: true,
    sameSite: transport.sameSite,
    secure: transport.secure,
    partitioned: transport.partitioned,
    path: '/',
    maxAge: PLAN_COOKIE_MAX_AGE,
  };
}
