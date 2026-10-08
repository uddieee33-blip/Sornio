/**
 * The DukaanOS session cookie — issued at sign-in, read at the edge.
 *
 * Why an app cookie at all when Supabase already sets one: three things the
 * console needs are not in a provider token. The **tenant** this device is
 * working on, the **role** that decides whether a change asks for the owner
 * password, and the **display name** every audit entry is attributed to. Reading
 * those out of a JWT would mean trusting a client-held blob; minting them here
 * means the server said them.
 *
 * The token itself is `lib/security/session.ts` — HMAC-SHA256 over the claims,
 * expiring, constant-time verified, per-deployment key. This module is only the
 * policy around it: which attributes, which lifetime, and the two questions
 * nobody should have to re-decide at every call site.
 *
 * `remember` is the one genuinely interesting choice. An owner who checked "Keep
 * me signed in" gets the full window (two weeks, capped by the absolute ceiling).
 * An owner who did not gets a cookie with **no expiry attribute at all**, so it
 * dies when the browser closes — and a token whose own expiry is the idle window,
 * so a tab left open overnight over a shop counter is not a signed-in console in
 * the morning. Two independent clocks, each honest about what it promises.
 *
 * Pure and Edge-safe: no `next/headers` in here, so the middleware verifies a
 * token with the same function the route handlers use.
 */

import {
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  localUserId,
  resolveSessionSecret,
  verifySession,
  type SessionClaims,
} from '@/lib/security/session';
import type { Role } from '@/lib/security/rbac';
import type { CookieTransport } from '@/lib/security/cookies';

/**
 * The cookie's name, under the name this layer calls it. `SESSION_COOKIE` stays
 * the one definition (in `lib/security/session.ts`); this alias exists so a
 * caller in the auth flow does not have to reach past its own layer for it.
 */
export const AUTH_COOKIE = SESSION_COOKIE;

/** Where this session came from. `local` means "this device, no provider". */
export type SessionProvider = 'supabase' | 'local';

export type OwnerSession = {
  /** Supabase uuid, or a device-bound id in local-first mode. */
  userId: string;
  tenantId: string;
  role: Role;
  displayName: string;
  remember: boolean;
};

export type IssuedSession = {
  name: typeof SESSION_COOKIE;
  value: string;
  claims: SessionClaims;
  /** `null` means "no expiry attribute": the cookie dies with the browser. */
  maxAge: number | null;
};

/** The lifetime an owner was promised, in seconds. */
export function sessionTtlSeconds(remember: boolean): number {
  return remember ? SESSION_MAX_AGE_SECONDS : SESSION_IDLE_SECONDS;
}

/**
 * Mint a session for this owner.
 *
 * `secure` is passed in rather than sniffed: the caller already knows the
 * posture, and this module has to stay importable by a verifier that has no
 * request to inspect.
 */
export async function sealOwnerSession(
  session: OwnerSession,
  options: { secure?: boolean; secret?: string } = {},
): Promise<IssuedSession> {
  const ttl = sessionTtlSeconds(session.remember);
  const { token, claims } = await createSession(
    {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      displayName: session.displayName,
      ttlSeconds: ttl,
    },
    options.secret ?? resolveSessionSecret(),
  );
  return {
    name: SESSION_COOKIE,
    value: token,
    claims,
    // A remembered session carries its own expiry; an unremembered one is a
    // browser-session cookie, and the token's `exp` is the real limit either way.
    maxAge: session.remember ? ttl : null,
  };
}

/**
 * Open a session cookie.
 *
 * `null` for missing, malformed, forged, or expired — never a thrown error and
 * never a partial identity. "Cannot verify" and "not signed in" get the same
 * answer, because both mean the caller should proceed as anonymous.
 */
export async function openOwnerSession(token: string | undefined | null): Promise<SessionClaims | null> {
  const result = await verifySession(token);
  return result.valid ? result.claims : null;
}

/** For a middleware or layout that has a cookie store rather than a value. */
export async function sessionFromCookies(cookies: {
  get: (name: string) => { value: string } | undefined;
}): Promise<SessionClaims | null> {
  return openOwnerSession(cookies.get(SESSION_COOKIE)?.value);
}

/**
 * Which identity a session belongs to.
 *
 * Derived rather than stored: `localUserId` prefixes a device-bound id with
 * `local_`, so the claims stay exactly the shape `lib/security/session.ts`
 * declares and a forged cookie cannot relabel itself as provider-backed.
 */
export function providerForClaims(claims: Pick<SessionClaims, 'userId'>): SessionProvider {
  return claims.userId.startsWith('local_') ? 'local' : 'supabase';
}

/**
 * Cookie attributes for a session.
 *
 * `httpOnly` is not negotiable: this cookie is what says "the owner is at this
 * console", and a value a script can read is a value a script can send.
 *
 * The rest comes from the transport, because it is a fact about the request
 * rather than a preference: the preview is framed cross-site, where a
 * `SameSite=Lax` cookie is refused by the browser outright. See
 * `lib/security/cookies.ts` for the measurements.
 */
export function ownerSessionCookie(transport: CookieTransport, maxAge: number | null) {
  return {
    httpOnly: true as const,
    sameSite: transport.sameSite,
    secure: transport.secure,
    partitioned: transport.partitioned,
    path: '/',
    ...(maxAge === null ? {} : { maxAge }),
  };
}

/** Attributes that delete the cookie — the same shape, with the lifetime zeroed. */
export function clearedOwnerSession(transport: CookieTransport) {
  return ownerSessionCookie(transport, 0);
}

/**
 * The device-bound session for local-first mode.
 *
 * There is no user id to speak of when nothing is hosted, but the session still
 * needs a subject: without one, "who did this" in the audit trail can only ever
 * be the word "Owner". `localUserId` hashes the address the owner typed with the
 * host, so the same person on the same device gets the same id across sign-ins,
 * and nothing reversible about the address is stored.
 */
export async function localOwnerSession(
  email: string,
  displayName: string,
  options: { remember: boolean; role?: Role },
): Promise<IssuedSession> {
  const normalized = email.trim().toLowerCase();
  const userId = await localUserId(normalized || 'owner');
  return sealOwnerSession({
    userId,
    // One business per local install (see `lib/security/tenant.ts`), so the
    // tenant is this device. A hosted install gets the real row id at sign-in.
    tenantId: userId,
    role: options.role ?? 'owner',
    displayName,
    remember: options.remember,
  });
}
