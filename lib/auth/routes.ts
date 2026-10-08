/**
 * The auth gate: which paths may be seen anonymously, and where a request that
 * cannot be answered anonymously is sent instead.
 *
 * This is a pure function of `(pathname, cookie state)`, deliberately shaped
 * like `checkPortalAccess` and `checkPlanAccess` so that one table drives both
 * the edge middleware and the server render — what the owner sees and what the
 * server enforces cannot drift apart — and so `npm run verify:auth` can execute
 * the real decision without a browser or a server.
 *
 * Two things count as "signed in", because a deployment can have either:
 *
 *   • a **DukaanOS session** — the HMAC-signed, expiring cookie written by
 *     `lib/security/session.ts`, carrying the tenant, the role and the display
 *     name the audit trail attributes work to; and
 *   • a **provider session** — Supabase's own `sb-*-auth-token` cookie, present
 *     whenever real credentials are configured and the owner signed in there.
 *
 * The provider arm exists so a live Supabase session is never bounced by an app
 * cookie that lapsed: the console layout verifies that session properly and
 * re-derives the identity from it. At the edge it costs one cookie-name test,
 * which is the whole point — the edge must never make a network call to decide
 * whether to serve a page.
 */

import { isSupabaseConfigured } from '@/lib/supabase/config';

/** Pages that work with no session at all. */
const PUBLIC_PATHS = ['/', '/auth', '/onboarding'] as const;

/**
 * Public *prefixes*.
 *
 * Each one is here for a reason, and none of them is a console route:
 *
 *   • `/locales` — the 22 catalogues are fetched before anyone signs in, and a
 *     redirected `fetch` silently degrades every non-English screen to English.
 *   • `/api/auth` — sign-in itself. Gating it would be a door that locks itself.
 *   • `/api/health` — the environment readout exists for a deployment that is
 *     mid-setup, which is precisely before anybody is signed in.
 *   • `/api/report` — CSP violation reports arrive from the browser with no
 *     session to offer, which is also why it is the one CSRF exemption.
 *   • `/security.txt` and `/.well-known` — RFC 9116 says a researcher must be
 *     able to reach the contact file. A 307 to a sign-in page is how a real
 *     report gets dropped.
 */
const PUBLIC_PREFIXES = [
  '/auth',
  '/onboarding',
  '/locales',
  '/api/auth',
  '/api/health',
  '/api/report',
  '/security.txt',
  '/.well-known',
] as const;

/** Where a signed-in owner lands when they have not said otherwise. */
export const DEFAULT_NEXT = '/onboarding';

/** Targets `safeNext` refuses because redirecting there would loop. */
const NEVER_TARGETS = ['/auth', '/api', '/_next'] as const;

/**
 * Supabase's SSR client writes `sb-<project-ref>-auth-token`, chunked as
 * `sb-<ref>-auth-token.0`, `.1`, … plus a `-counter` cookie. Only the token
 * chunks carry a session; the counter does not, and must not count as one.
 */
const SUPABASE_COOKIE = /^sb-[A-Za-z0-9_-]{6,64}-auth-token(?:\.\d+)?$/;

export function isSupabaseAuthCookieName(name: string): boolean {
  return SUPABASE_COOKIE.test(name);
}

export function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_PATHS as readonly string[]).includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * A `next` target the app may redirect to.
 *
 * Open-redirect helpers fail in the same three ways every time, so all three are
 * refused here: an absolute URL (`https://evil.example`), a protocol-relative one
 * (`//evil.example`, which browsers read as a host), and a backslash variant
 * (`/\evil.example`, which some browsers also read as a host). Control characters
 * are refused because that is how a header gets split.
 *
 * Anything left is a same-origin path. The query is preserved so a
 * `?locked=inventory` or `?reset=1` survives a trip through sign-in, and the
 * sign-in page itself is refused so a stale bookmark cannot loop.
 */
export function safeNext(value: unknown, fallback: string = DEFAULT_NEXT): string {
  if (typeof value !== 'string') return fallback;
  const target = value.trim();
  if (!target || target.length > 240) return fallback;
  if (!target.startsWith('/')) return fallback;
  if (target.startsWith('//') || target.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001F\u007F<>"]/.test(target)) return fallback;
  // Judged on the path alone: `/auth?next=/audit` is an open redirect wearing a
  // query, and blocking only the bare `/auth` would let it through.
  const [pathname] = target.split('?');
  if (NEVER_TARGETS.some((blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`))) return fallback;
  return target;
}

export type AuthGateInput = {
  pathname: string;
  /** Raw `location.search`, kept on the redirect so a deep link lands intact. */
  search?: string;
  /** The app session opened and is inside its validity window. */
  sessionValid: boolean;
  /** A Supabase auth cookie came with the request — name only, never its value. */
  providerCookiePresent?: boolean;
  /** Defaults to this process's own configuration, so a test can pin it. */
  supabaseConfigured?: boolean;
};

export type AuthGateVerdict = { allowed: true } | { allowed: false; redirectTo: string };

/**
 * Decide whether this request may be served.
 *
 * Only ever called for read-only navigation of page routes, exactly like the
 * portal and plan checks beside it: a write is never redirected, because a 307
 * in front of a failed action teaches an owner to distrust the console.
 */
export function checkAuthAccess(input: AuthGateInput): AuthGateVerdict {
  if (input.sessionValid) return { allowed: true };
  if (isPublicPath(input.pathname)) return { allowed: true };
  const configured = input.supabaseConfigured ?? isSupabaseConfigured();
  if (configured) {
    if (input.providerCookiePresent) return { allowed: true };
  }
  const search = typeof input.search === 'string' ? input.search : '';
  const target = safeNext(`${input.pathname}${search}`, '');
  const redirectTo = target ? `/auth?next=${encodeURIComponent(target)}` : '/auth';
  return { allowed: false, redirectTo };
}

/**
 * The sign-in page's own exit ramp.
 *
 * A `next` that a caller would accept, or the onboarding default. Kept separate
 * from `safeNext` so the two places that choose a destination — the gate, and
 * the form after a successful sign-in — agree by construction rather than by
 * somebody remembering to copy a literal.
 */
export function signInDestination(next: unknown): string {
  const target = typeof next === 'string' && next.trim() ? next : '';
  return target ? safeNext(target, DEFAULT_NEXT) : DEFAULT_NEXT;
}
