/**
 * Everything On — the master switch.
 *
 * A portal is an opinion: a gym console does not carry a stock shelf, and that
 * is the product working, not a feature missing. But an opinion an owner cannot
 * override is a cage. Some businesses genuinely are two businesses — a cafe
 * that sells beans by the kilo, a salon with a retail counter, a gym with a
 * supplement shelf — and telling them "switch your business type and lose the
 * words your staff already learned" is the wrong answer.
 *
 * So: one deliberate switch that reveals all 27 modules at once, kept honest by
 * four rules.
 *
 *   1. **It can only reveal what the portal hid.** It is read *beside* the
 *      portal check, never instead of the plan check. A module the business has
 *      not paid for stays locked; the paid tier is enforced one step later in
 *      the middleware and this value is not in scope there.
 *   2. **It is signed.** Portal hiding is cosmetic, so the portal cookie is
 *      unsigned — tampering with it can only hide things. *Un*-hiding is the
 *      opposite direction, so this cookie carries an HMAC over the same
 *      deployment secret as the plan and session cookies. An unverifiable value
 *      is treated as "off", which is the safe direction.
 *   3. **It expires.** Ninety days, then the console goes back to the shape the
 *      trade actually chose. A switch that silently stays on forever becomes
 *      the new default, and then the portal system is decoration.
 *   4. **It is recorded.** The record carries who turned it on and when, so the
 *      audit trail can say so.
 *
 * Pure and Edge-safe: Web Crypto only, no Node built-ins, no imports that pull
 * a bundler into the middleware.
 */

import { base64UrlDecode, base64UrlEncode, constantTimeEqual, hmacSha256Base64Url } from '@/lib/security/crypto';
import { resolveSessionSecret, sessionVerificationSecret } from '@/lib/security/session';
import type { CookieTransport } from '@/lib/security/cookies';

export const MASTER_COOKIE = 'dukaan.everything';

/** Ninety days. Long enough to be useful, short enough to stay a decision. */
export const MASTER_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type MasterRecord = {
  /** Is every module revealed? */
  on: boolean;
  /** When it was switched on (epoch ms). */
  since: number;
  /** When the reveal lapses back to the portal's own shape (epoch ms). */
  until: number;
  /** Which role turned it on — recorded, not trusted. */
  by: 'owner' | 'manager' | 'local';
};

export const MASTER_OFF: MasterRecord = { on: false, since: 0, until: 0, by: 'local' };

type Wire = { o?: unknown; s?: unknown; u?: unknown; b?: unknown };

const ACTORS = new Set<MasterRecord['by']>(['owner', 'manager', 'local']);

function positiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function encodeMasterRecord(record: MasterRecord): string {
  const wire: Wire = {
    o: record.on ? 1 : 0,
    s: positiveInt(record.since),
    u: positiveInt(record.until),
    b: record.by,
  };
  return base64UrlEncode(JSON.stringify(wire));
}

export function decodeMasterRecord(payload: string): MasterRecord | null {
  let wire: Wire;
  try {
    wire = JSON.parse(base64UrlDecode(payload)) as Wire;
  } catch {
    return null;
  }
  const by = ACTORS.has(wire.b as MasterRecord['by']) ? (wire.b as MasterRecord['by']) : 'local';
  return {
    on: wire.o === 1,
    since: positiveInt(wire.s),
    until: positiveInt(wire.u),
    by,
  };
}

/** Sign a record into the cookie value the edge will accept back. */
export async function sealMasterRecord(
  record: MasterRecord,
  secret = resolveSessionSecret(),
): Promise<string> {
  const payload = encodeMasterRecord(record);
  const signature = await hmacSha256Base64Url(secret, payload);
  return `${payload}.${signature}`;
}

/**
 * Verify a cookie value.
 *
 * Returns `null` for anything missing, malformed, or signed with a key that is
 * not this deployment's — and the caller treats `null` as *off*. Every failure
 * mode therefore lands on "show the portal's own shape", which is the state the
 * owner explicitly chose. Never throws: a broken cookie must not break a page.
 */
export async function openMasterRecord(
  token: string | undefined | null,
  secret: string | null = sessionVerificationSecret(),
): Promise<MasterRecord | null> {
  // A deployment that can verify nothing treats every cookie as off — never a
  // throw. The proxy runs this on every request, so a resolver that throws
  // takes the whole site down over one missing environment variable.
  if (!token || secret === null) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;
  const expected = await hmacSha256Base64Url(secret, payload);
  if (!constantTimeEqual(expected, signature)) return null;
  return decodeMasterRecord(payload);
}

/**
 * Is the reveal live *right now*?
 *
 * Expiry is derived from the record's own dates rather than stored as a flag,
 * for the same reason the plan lifecycle is: a value that says "on" is a value
 * that stays on when the clock disagrees with it.
 */
export function masterRevealActive(record: MasterRecord | null, now = Date.now()): boolean {
  if (!record || !record.on) return false;
  if (record.until > 0 && now >= record.until) return false;
  return true;
}

/** Days left before the reveal lapses, for the UI to state plainly. */
export function masterDaysLeft(record: MasterRecord | null, now = Date.now()): number {
  if (!masterRevealActive(record, now) || !record?.until) return 0;
  return Math.max(0, Math.ceil((record.until - now) / 86_400_000));
}

/** Build a fresh "on" record starting now. */
export function startMasterReveal(by: MasterRecord['by'], now = Date.now()): MasterRecord {
  return { on: true, since: now, until: now + MASTER_MAX_AGE_SECONDS * 1000, by };
}

/** Cookie attributes. httpOnly: no script on the page may widen its own console. */
export function masterCookieOptions(transport: CookieTransport) {
  return {
    httpOnly: true,
    sameSite: transport.sameSite,
    secure: transport.secure,
    partitioned: transport.partitioned,
    path: '/',
    maxAge: MASTER_MAX_AGE_SECONDS,
  };
}
