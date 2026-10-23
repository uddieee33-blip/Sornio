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
 *   • `/manifest.webmanifest` — the browser fetches the install manifest
 *     from the landing page, before anyone signs in. A redirect to `/auth`
 *     here does not just slow the install prompt down; Chrome treats the
 *     redirect as a failed fetch and the prompt never appears.
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
  '/manifest.webmanifest',
] as const;

/** Where a signed-in owner lands when they have not said otherwise. */
export const DEFAULT_NEXT = '/onboarding';

/** Where an owner who has already finished setup lands. */
export const CONSOLE_HOME = '/home';

/**
 * The fallback a sign-in ends at, given what the account already knows.
 *
 * One owner in two used to land here: `/onboarding` was the only fallback, so a
 * returning shopkeeper was greeted by name and then walked through the three
 * steps they had already filled in. The setup screen is now what it always
 * should have been — the door for an owner who has not finished, and a
 * "we remembered you" screen for one who has — but the redirect is decided
 * *before* the page loads, because a page that has to correct itself is a flicker
 * this app refuses everywhere else.
 *
 * Only an answer the server can vouch for counts as finished: see
 * `storedSetupComplete`, which derives it from the stored fields rather than
 * trusting a flag, and returns `false` for every kind of "we cannot tell".
 */
export function signInFallback(setupComplete: boolean): string {
  return setupComplete ? CONSOLE_HOME : DEFAULT_NEXT;
}

/** Hosted owners must finish account setup before following a console link. */
export function hostedSignInDestination(requested: unknown, setupComplete: boolean, role: string = 'owner'): string {
  if (role === 'owner' && !setupComplete) return DEFAULT_NEXT;
  return safeNext(requested, CONSOLE_HOME);
}

/**
 * What the sign-in screen knows about where this owner is going.
 *
 * Two of the three answers come from different places and neither can replace
 * the other:
 *
 *   • `requested` is the owner's own — a bookmarked `?next=/audit`, or a price
 *     they clicked. It has already been through `safeNext`, and it wins;
 *   • `accountSetupComplete` is the server's, from the stored profile row. It is
 *     the only answer that exists on a second phone or after a reinstall;
 *   • `deviceSetupComplete` is this browser's, from the encrypted vault. It is
 *     the only answer a local-first build has, because there is no row to read.
 *
 * Either "finished" counts, and both are needed: the server cannot see a local
 * install's vault, and the vault cannot see an account this device forgot.
 */
export type DestinationInput = {
  requested: string | null;
  accountSetupComplete: boolean;
  deviceSetupComplete: boolean;
};

/**
 * Where the "Welcome back" door goes.
 *
 * It used to go to `/onboarding` unconditionally — the page's own default — so
 * an owner who had filled in all three steps, bank details and collection QR
 * included, was greeted by name and then handed their own phone number to type
 * again. The door now opens into the console for anybody either record says is
 * set up, and into setup only for an owner who genuinely has not finished.
 */
export function welcomeDestination(input: DestinationInput): string {
  if (input.requested) return input.requested;
  return input.accountSetupComplete || input.deviceSetupComplete ? CONSOLE_HOME : DEFAULT_NEXT;
}

/**
 * What the form sends as `next`, or `undefined` for "you decide".
 *
 * Omitting it is the point. The endpoint re-answers the question *after* the
 * credentials are verified, from the account row it can now read — so a
 * returning owner signing in on a device that has forgotten them still lands in
 * the console, even though this browser's vault was empty when the page
 * rendered. A form that always sent its own guess would overwrite that answer
 * with the stale one, which is exactly how the bug this replaces survived a fix
 * to the endpoint.
 */
export function signInNextParam(input: DestinationInput): string | undefined {
  if (input.requested) return input.requested;
  return input.deviceSetupComplete ? CONSOLE_HOME : undefined;
}

/**
 * Does the door have to be earned before it opens?
 *
 * A door into the console does: behind it are the day's takings, the customer
 * list and the khata, on a tablet that sits on a counter anybody can reach. A
 * session cookie proves the *browser* was signed in, not that the person now
 * tapping Continue is the owner who signed it in — which is the same distinction
 * the counter PIN and the owner-password gate in Settings are built on.
 *
 * A door into setup does not. There is nothing behind it but a form the owner
 * has not filled in yet, and asking a brand-new sign-up for the password they
 * typed thirty seconds ago teaches them that the app does not know what it just
 * did.
 */
export function doorNeedsConfirmation(destination: string): boolean {
  return destination !== DEFAULT_NEXT;
}

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

