/**
 * Session handling: signed, expiring, rotating.
 *
 * Two identities can exist in DukaanOS:
 *  - a **Supabase user** (when real credentials are configured), and
 *  - a **local owner session** for the local-first mode, which still deserves
 *    a tamper-proof cookie so that audit entries, roles, and tenant ids cannot
 *    be forged by editing storage in devtools.
 *
 * The token format is `base64url(payload).base64url(hmacSha256(payload))`.
 * Verification is constant-time, checks the issued-at / not-after window, and
 * rejects a token whose signature was produced with any previous key.
 */

import { base64ToUtf8, constantTimeEqual, randomToken, sha256Hex, utf8ToBase64 } from './crypto';
import { isRole, type Role } from './rbac';
import type { CookieTransport } from './cookies';

export const SESSION_COOKIE = 'dukaan.session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // two weeks
export const SESSION_IDLE_SECONDS = 60 * 60 * 12; // twelve hours of inactivity
export const SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 30; // hard ceiling

export type SessionClaims = {
  /** Tenant (business) this session is scoped to. */
  tenantId: string;
  /** Stable user id — Supabase uuid, or a local device-bound id. */
  userId: string;
  role: Role;
  displayName: string;
  /** Issued-at and expiry, epoch seconds. */
  iat: number;
  exp: number;
  /** Rotating session id, used to invalidate a specific device. */
  sid: string;
  /** Schema marker for future migrations. */
  v: 1;
};

export type SessionResult =
  | { valid: true; claims: SessionClaims }
  | { valid: false; reason: 'missing' | 'malformed' | 'bad-signature' | 'expired' | 'unknown-key' };

const encoder = new TextEncoder();

function base64UrlEncode(input: string): string {
  return utf8ToBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return base64ToUtf8(padded + pad);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(payloadSegment: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payloadSegment));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The per-host development key. One definition, so minting and opening agree. */
function localFallbackSecret(): string {
  return `dukaanos-local::${process.env.NEXT_PUBLIC_APP_URL ?? 'sandbox'}::v1`;
}

/** The signing secret is per-deployment; sessions from another key are rejected. */
export function resolveSessionSecret(): string {
  const configured = (process.env.DUKAANOS_SESSION_SECRET ?? '').trim();
  if (configured.length >= 32) return configured;
  // Production fails closed. The old fallback was derived from a public URL, so
  // anyone could forge a session for any tenant on a deployment that forgot the
  // secret. Local development keeps a fixed fallback so `next dev` still works.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DUKAANOS_SESSION_SECRET (32+ characters) is required in production. Refusing to sign sessions without it.');
  }
  return localFallbackSecret();
}

/**
 * The verification-side answer to `resolveSessionSecret`.
 *
 * Opening a cookie must never throw — the edge proxy calls this on every
 * request, so a resolver that throws turns one missing environment variable
 * into a site-wide 500 ("DUKAANOS_SESSION_SECRET … is required in production"
 * from the middleware, every path, every verb). `null` means "this deployment
 * can verify nothing": no cookie opens, no session is honoured, and
 * `resolveSessionSecret` still refuses to *mint* anything. Same fail-closed
 * posture as a throw, without failing *down*.
 */
export function sessionVerificationSecret(): string | null {
  const configured = (process.env.DUKAANOS_SESSION_SECRET ?? '').trim();
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') return null;
  return localFallbackSecret();
}

export async function createSession(
  claims: Omit<SessionClaims, 'iat' | 'exp' | 'sid' | 'v'> & { ttlSeconds?: number },
  secret: string = resolveSessionSecret(),
): Promise<{ token: string; claims: SessionClaims }> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(claims.ttlSeconds ?? SESSION_MAX_AGE_SECONDS, SESSION_ABSOLUTE_SECONDS);
  const full: SessionClaims = {
    tenantId: claims.tenantId,
    userId: claims.userId,
    role: claims.role,
    displayName: claims.displayName.slice(0, 80),
    iat: now,
    exp: now + ttl,
    sid: randomToken(12),
    v: 1,
  };
  const payload = base64UrlEncode(JSON.stringify(full));
  const token = `${payload}.${await sign(payload, secret)}`;
  return { token, claims: full };
}

export async function verifySession(
  token: string | undefined | null,
  secret: string | null = sessionVerificationSecret(),
): Promise<SessionResult> {
  if (!token) return { valid: false, reason: 'missing' };
  // No verification key means no token can be verified — including this one.
  // That is a deployment problem, not a forgery, but the caller's answer is the
  // same either way: not signed in.
  if (secret === null) return { valid: false, reason: 'unknown-key' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };

  const [payload, signature] = parts;
  const expected = await sign(payload, secret);
  if (!constantTimeEqual(expected, signature)) {
    return { valid: false, reason: 'bad-signature' };
  }

  let claims: SessionClaims;
  try {
    claims = JSON.parse(base64UrlDecode(payload)) as SessionClaims;
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (claims.v !== 1 || !claims.tenantId || !claims.userId || !isRole(claims.role)) {
    return { valid: false, reason: 'malformed' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    return { valid: false, reason: 'expired' };
  }
  // Absolute ceiling: even a "fresh" token cannot outlive 30 days from issue.
  if (typeof claims.iat !== 'number' || now - claims.iat > SESSION_ABSOLUTE_SECONDS) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, claims };
}

/**
 * Cookie attributes. `httpOnly` is on for the session itself so a script
 * injected into the page cannot read or exfiltrate it, and the transport
 * decides the framing and HTTP-vs-HTTPS shape — see
 * `lib/security/cookies.ts`.
 */
export function sessionCookieOptions(transport: CookieTransport, maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: transport.sameSite,
    secure: transport.secure,
    partitioned: transport.partitioned,
    path: '/',
    maxAge,
  };
}

/** Stable, non-reversible device/user id for the local-first mode. */
export async function localUserId(seed: string): Promise<string> {
  const digest = await sha256Hex(`dukaanos-local-user::${seed}`);
  return `local_${digest.slice(0, 24)}`;
}

/** Human label for the audit trail — never the raw email or phone. */
export function actorLabel(displayName: string): string {
  return displayName.trim().slice(0, 80) || 'Owner';
}
