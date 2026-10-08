/**
 * Cross-site request forgery defence (defence in depth, three layers):
 *
 *  1. `Sec-Fetch-Site` — browsers label the relationship between the initiator
 *     and our origin. A cross-site write is refused outright.
 *  2. `Origin` / `Referer` allow-list — a write must come from an origin we
 *     recognise (our own host, plus the preview host when embedding is on).
 *  3. Double-submit token — a random token lives in a readable cookie and must
 *     be echoed in the `x-csrf-token` header on every mutating API call.
 *
 * All three are pure functions so middleware stays testable and Edge-safe.
 */

import { randomToken } from './crypto';

export const CSRF_COOKIE = 'dukaan.csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_MAX_AGE_SECONDS = 60 * 60 * 12;
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

export type OriginVerdict = { ok: true } | { ok: false; reason: string };

export function isSafeMethod(method: string): boolean {
  return (SAFE_METHODS as readonly string[]).includes(method.toUpperCase());
}

/**
 * Is this request a speculative prefetch rather than something a person asked
 * for?
 *
 * Next.js marks the App Router's route prefetches with `next-router-prefetch`
 * (and `x-middleware-prefetch`) so middleware can answer them cheaply. That
 * distinction matters to the rate limiter: the console warms its own sidebar
 * routes on idle — dozens of requests per page view, and the sidebar's links
 * prefetch too — so charging them to the same budget a human's *navigation*
 * draws on means an owner who simply clicks through their own screens reaches
 * the ceiling and gets a 429 on the next page they open.
 *
 * A speculative request is still a request, so it is still budgeted; it is
 * budgeted *apart*, where its ceiling cannot be spent by, or spent on,
 * navigation.
 */
export function isPrefetchRequest(headers: Headers): boolean {
  const marked = headers.get('next-router-prefetch') ?? headers.get('x-middleware-prefetch');
  // `Purpose: prefetch` / `Sec-Purpose: prefetch` are the platform-level
  // spelling of the same intent, sent by browsers that prefetch on our behalf.
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''}`.toLowerCase();
  return marked === '1' || purpose.includes('prefetch');
}

/** Is this request obviously browser-initiated from another site? */
export function checkFetchMetadata(headers: Headers): OriginVerdict {
  const site = headers.get('sec-fetch-site');
  // Older browsers omit the header entirely — fall through to the next layer.
  if (!site) return { ok: true };
  if (site === 'cross-site') {
    return { ok: false, reason: 'Cross-site request refused.' };
  }
  return { ok: true };
}

/**
 * Same-origin check. `allowedHosts` should contain the request host (and any
 * preview/alias hosts). A missing Origin and Referer is allowed only for
 * non-browser clients that already passed the fetch-metadata layer.
 */
export function checkOrigin(headers: Headers, allowedHosts: string[]): OriginVerdict {
  const origin = headers.get('origin');
  const referer = headers.get('referer');
  const candidate = origin ?? (referer ? safeOriginOf(referer) : null);
  if (!candidate) return { ok: true };

  const normalised = safeOriginOf(candidate);
  if (!normalised) return { ok: false, reason: 'Unparseable origin.' };

  const host = normalised.replace(/^https?:\/\//, '').toLowerCase();
  const hosts = allowedHosts.map((entry) => entry.toLowerCase());
  const allowed = hosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
  return allowed ? { ok: true } : { ok: false, reason: `Origin ${host} is not allowed.` };
}

function safeOriginOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Compare the header token with the cookie token without early exits. */
export function checkDoubleSubmit(headers: Headers, cookieToken: string | undefined): OriginVerdict {
  const headerToken = headers.get(CSRF_HEADER);
  if (!cookieToken) return { ok: false, reason: 'Missing CSRF cookie.' };
  if (!headerToken) return { ok: false, reason: 'Missing CSRF header.' };
  if (headerToken.length !== cookieToken.length) return { ok: false, reason: 'CSRF token mismatch.' };
  let diff = 0;
  for (let i = 0; i < headerToken.length; i += 1) {
    diff |= headerToken.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }
  return diff === 0 ? { ok: true } : { ok: false, reason: 'CSRF token mismatch.' };
}

/** Mint a fresh token (called by middleware when the cookie is absent). */
export function issueCsrfToken(): string {
  return randomToken(16);
}

export type CsrfPolicy = {
  /** Paths that require the double-submit token. */
  protectedPrefixes: string[];
  allowedHosts: string[];
};

export const DEFAULT_CSRF_POLICY: CsrfPolicy = {
  protectedPrefixes: ['/api/'],
  allowedHosts: [],
};
