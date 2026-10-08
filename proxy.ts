/**
 * Edge security proxy (the Next.js 16 name for `middleware`).
 *
 * Order of operations matters — the cheapest, most decisive checks run first:
 *
 *   1. Request id          → every response is traceable to one line in a log.
 *   2. Abuse probes        → known scanner paths answered with 404, no detail.
 *   3. Penalty box         → a fingerprint that keeps earning 429s is refused
 *                            before any work at all is done for it.
 *   4. Rate limit          → per-fingerprint sliding window.
 *   5. CSRF                → fetch-metadata + origin + double-submit token.
 *   6. Session gate        → a business's console is not a public page. An
 *                            HMAC-verified app session, or a provider cookie on a
 *                            deployment that has a provider, is what gets a page
 *                            served; anything else is sent to sign-in with the
 *                            path it asked for attached.
 *   7. Portal policy       → a business type never renders a module it does not
 *                            carry (inventory in a gym, memberships in a
 *                            kirana), unless the signed Everything On switch is
 *                            live.
 *   8. Plan policy         → a plan that is not being paid for does not render
 *                            the paid automations; expiry drops a business to
 *                            the free plan, never to a locked door. This step
 *                            deliberately cannot see the Everything On value.
 *   9. Session refresh     → Supabase only when real credentials are present,
 *                            lazily imported, best-effort, never blocking.
 *  10. Security headers    → posture-aware CSP (nonce + strict-dynamic in
 *                            production), HSTS, framing, permissions, reporting.
 *
 * Everything here is Edge-safe (Web Crypto, no Node built-ins) and every
 * failure path degrades to "serve the page" rather than "show an error".
 */

import { NextRequest, NextResponse } from 'next/server';

import policy from '@/lib/security/policy.json';
import { checkPortalAccess, PORTAL_COOKIE } from '@/lib/portals/routes';
import { MASTER_COOKIE, masterRevealActive, openMasterRecord } from '@/lib/portals/master';
import {
  buildBaselineHeaders,
  buildFramingHeaders,
  buildStaticAssetHeaders,
  cacheHeaderFor,
  resolvePosture,
  type HeaderPair,
} from '@/lib/security/headers';
import {
  clientFingerprint,
  consume,
  penaltyRemainingMs,
  rateLimitHeaders,
  recordThrottle,
  ruleForPath,
  type AbuseRule,
  type RateLimitRule,
} from '@/lib/security/rate-limit';
import { CSRF_COOKIE, checkDoubleSubmit, checkFetchMetadata, checkOrigin, isPrefetchRequest, isSafeMethod, issueCsrfToken } from '@/lib/security/csrf';
import { transportForRequest } from '@/lib/security/transport';
import { randomToken } from '@/lib/security/crypto';
import { PLAN_COOKIE, checkPlanAccess, openPlanRecord, resolveEntitlement } from '@/lib/plans';
// The auth *halves*, deliberately: `@/lib/auth` is the server surface and pulls
// in `next/headers` through the identity module, which has no place in an Edge
// bundle. The gate and the cookie policy are pure, so those two are what the
// middleware is allowed to know about.
import { checkAuthAccess, isPublicPath, isSupabaseAuthCookieName } from '@/lib/auth/routes';
import { AUTH_COOKIE, openOwnerSession } from '@/lib/auth/cookie';

const REQUEST_ID_HEADER = 'x-request-id';
const NONCE_HEADER = 'x-nonce';

/**
 * The only paths allowed to skip the double-submit CSRF token.
 *
 * Kept as a named constant rather than an inline condition so that adding one
 * is a visible, reviewable act — `npm run verify:security` fails the build if
 * this list ever grows beyond the single entry below. Exemptions are the kind
 * of thing that get added at 7pm under a deadline and are never removed.
 *
 * `/api/report` qualifies because the *browser* posts violation reports, by
 * itself, with no token it could carry and no origin we control. Requiring one
 * would not make the endpoint safer; it would mean never hearing about a CSP
 * violation again. It is compensated for elsewhere: its own tight bucket, a
 * hard body limit, and a handler that writes nothing.
 */
const CSRF_EXEMPT_PATHS = ['/api/report'] as const;
const RATE_TABLE = policy.rateLimits as unknown as Record<string, RateLimitRule>;
const ABUSE_RULE = policy.abuse as unknown as AbuseRule;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Real Supabase credentials only — placeholders must never trigger network calls. */
const supabaseConfigured =
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project') &&
  supabaseKey.length >= 20 &&
  !supabaseKey.includes('your-anon-key') &&
  !supabaseKey.includes('your-publishable-key');

function applyHeaders(response: NextResponse, pairs: HeaderPair[]): NextResponse {
  for (const { key, value } of pairs) response.headers.set(key, value);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? randomToken(8);
  const posture = resolvePosture();

  /**
   * One nonce per response, minted here because this is the only place that
   * runs before the HTML exists. In strict posture it replaces
   * `script-src 'unsafe-inline'` entirely: Next.js reads the CSP off the
   * *request* headers and stamps this value onto every script tag it emits,
   * so the browser runs our bundle and nothing else. An injected script has no
   * nonce and cannot learn one — the header that carried it is long gone by
   * the time an XSS payload executes.
   */
  const nonce = randomToken(16);

  /**
   * How this response may carry a cookie. Decided once, here, because the
   * answer depends on the request: the preview is framed cross-site, where a
   * `SameSite=Lax` cookie is refused outright, and everything below that sets a
   * cookie has to agree. See `lib/security/cookies.ts`.
   */
  const transport = transportForRequest(request);

  // ---- 1. Static assets: long-lived cache, minimal headers, no work. ----
  if (pathname.startsWith('/_next/static') || pathname.startsWith('/_next/image') || pathname === '/favicon.ico') {
    return applyHeaders(NextResponse.next(), buildStaticAssetHeaders());
  }

  // ---- 2. Known scanner probes: refuse without describing why. ----
  const probe = policy.probePaths.find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  if (probe) {
    return applyHeaders(new NextResponse(null, { status: 404 }), [
      ...buildBaselineHeaders(posture, pathname),
      { key: REQUEST_ID_HEADER, value: requestId },
      policy.noStore,
    ]);
  }

  const ip =
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    (request as unknown as { ip?: string }).ip ??
    '';
  const fingerprint = clientFingerprint({
    ip,
    userAgent: request.headers.get('user-agent'),
    sessionHint: request.cookies.get(CSRF_COOKIE)?.value?.slice(0, 24),
  });

  // ---- 3. Penalty box: refuse a known-abusive fingerprint up front. ----
  // This is before the rate limiter on purpose. Once a client has proved it
  // ignores `Retry-After`, the cheapest possible answer is the right one —
  // a map lookup and a 429, with no window arithmetic and no cookie parsing.
  const penalty = penaltyRemainingMs(fingerprint);
  if (penalty > 0) {
    return applyHeaders(
      new NextResponse('Too many requests. Please wait and try again.', {
        status: 429,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'retry-after': String(Math.ceil(penalty / 1000)),
        },
      }),
      [
        ...buildBaselineHeaders(posture, pathname),
        ...buildFramingHeaders(posture, nonce),
        { key: REQUEST_ID_HEADER, value: requestId },
        policy.noStore,
      ],
    );
  }

  // ---- 4. Rate limiting, per scope + client fingerprint. ----
  //
  // Reads and writes are budgeted separately, and only a write can earn a
  // strike. That split is the fix for a real failure: a console page view costs
  // one document plus a few read-only API calls, so an owner clicking through
  // screens at ordinary speed was collecting 429s on their own identity and
  // portal reads — and four throttles bought them a penalty box that refused
  // *every* page for the next two minutes, doubling on each further attempt.
  // A shop that gets busy is not an attack, and the app's own reads are not
  // credential stuffing. Reads keep a hard ceiling; the tight buckets stay on
  // writes, credential attempts and the money endpoints.
  //
  // Speculative traffic is budgeted apart from navigation for the same reason.
  // The console warms its own sidebar routes on idle and the sidebar's links
  // prefetch as they scroll into view: a single visit to /home is 45 prefetch
  // requests against 12 real ones, and every one of them used to be charged to
  // the page budget a human's click draws on. The owner then opened a screen
  // they actually asked for and got "Too many requests". Prefetches keep a
  // ceiling — a script should not get an unlimited pass by setting a header —
  // but that ceiling can no longer be spent by, or spent on, navigation.
  const safe = isSafeMethod(method);
  const speculative = safe && isPrefetchRequest(request.headers);
  const routed = ruleForPath(pathname, RATE_TABLE);
  const readBucket = pathname.startsWith('/api/') ? { scope: 'apiRead', rule: RATE_TABLE.apiRead } : null;
  const { scope, rule } = speculative
    ? { scope: 'prefetch', rule: RATE_TABLE.prefetch }
    : safe && readBucket
      ? readBucket
      : routed;
  const decision = consume(`${scope}:${fingerprint}`, rule);

  // A second, shorter-window guard sits on top of the per-scope budget. It is
  // deliberately generous for page traffic: the app prefetches its own routes,
  // and throttling our own navigation would be self-inflicted. Writes get the
  // tight budget, where it actually protects something (credential stuffing,
  // scripted writes); reads get one a person cannot reach.
  const burstRuleName = speculative
    ? 'burstPrefetch'
    : !safe
      ? 'burstApi'
      : pathname.startsWith('/api/')
        ? 'burstApiRead'
        : 'burstPage';
  const burst = consume(`${burstRuleName}:${fingerprint}`, RATE_TABLE[burstRuleName]);

  if (!decision.allowed || !burst.allowed) {
    const throttled = decision.allowed ? burst : decision;
    // Count the strike — but only for a request that changes something. A shop
    // reads its own books all day; the penalty box exists for clients that keep
    // writing after being told to slow down.
    const served = safe ? 0 : recordThrottle(fingerprint, ABUSE_RULE);
    const retryAfter = served > 0 ? Math.ceil(served / 1000) : throttled.retryAfter;

    const isApi = pathname.startsWith('/api/');
    const body = isApi
      ? JSON.stringify({ error: 'Too many requests. Please slow down.', requestId })
      : 'Too many requests. Please wait a moment and try again.';
    return applyHeaders(
      new NextResponse(body, {
        status: 429,
        headers: {
          'content-type': isApi ? 'application/json' : 'text/plain; charset=utf-8',
          'retry-after': String(retryAfter),
        },
      }),
      [
        ...buildBaselineHeaders(posture, pathname),
        ...buildFramingHeaders(posture, nonce),
        ...Object.entries(rateLimitHeaders(throttled)).map(([key, value]) => ({ key, value })),
        { key: REQUEST_ID_HEADER, value: requestId },
        policy.noStore,
      ],
    );
  }

  // ---- 5. CSRF on mutating requests. ----
  const csrfToken = request.cookies.get(CSRF_COOKIE)?.value ?? issueCsrfToken();
  if (!isSafeMethod(method)) {
    const allowedHosts = [request.headers.get('host') ?? '', 'localhost', '127.0.0.1'];
    const verdicts = [
      checkFetchMetadata(request.headers),
      checkOrigin(request.headers, allowedHosts.filter(Boolean)),
      // The double-submit token is enforced for API routes; page-level form
      // posts are covered by the origin + fetch-metadata layers above. The
      // violation-report endpoint is the one exception: a browser posts those
      // itself, with no token and no origin we control, so requiring one would
      // simply mean never hearing about a CSP violation. It is unauthenticated
      // by nature, which is why it has its own tight bucket and writes nothing.
      pathname.startsWith('/api/') && !CSRF_EXEMPT_PATHS.some((exempt) => pathname.startsWith(exempt))
        ? checkDoubleSubmit(request.headers, request.cookies.get(CSRF_COOKIE)?.value)
        : { ok: true as const },
    ];
    const failed = verdicts.find((verdict) => !verdict.ok);
    if (failed && !failed.ok) {
      return applyHeaders(
        new NextResponse(JSON.stringify({ error: failed.reason, requestId }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
        [
          ...buildBaselineHeaders(posture, pathname),
          ...buildFramingHeaders(posture, nonce),
          { key: REQUEST_ID_HEADER, value: requestId },
          policy.noStore,
        ],
      );
    }
  }

  // ---- 6. Session gate: a shop's records are not a public page. ----
  //
  // Two arms, and neither one makes a network call. Either this request carries
  // a DukaanOS session that verifies against this deployment's key — one HMAC,
  // microseconds — or this is a hosted deployment and a Supabase auth cookie came
  // with it, which the console layout then verifies properly before it renders a
  // single number. Checking the provider here instead would put a round trip in
  // front of every page the owner opens, which is the trade the ordering makes on
  // purpose.
  //
  // Read-only navigation only, exactly like the two policies after it: a write is
  // never redirected, so a refused action stays a refused action. And it runs
  // *before* them, because an anonymous request has no portal and no plan to be
  // told about — answering one with `?locked=inventory` would leak which modules
  // this business runs, and start a redirect chain that only ends at sign-in.
  if (isSafeMethod(method) && !isPublicPath(pathname)) {
    const claims = await openOwnerSession(request.cookies.get(AUTH_COOKIE)?.value);
    const providerCookiePresent =
      supabaseConfigured && request.cookies.getAll().some((cookie) => isSupabaseAuthCookieName(cookie.name));
    const verdict = checkAuthAccess({
      pathname,
      search: `${request.nextUrl.search ?? ''}`,
      sessionValid: claims !== null,
      providerCookiePresent,
      supabaseConfigured,
    });
    if (!verdict.allowed) {
      const target = new URL(verdict.redirectTo, request.url);
      return applyHeaders(NextResponse.redirect(target, 307), [
        ...buildBaselineHeaders(posture, pathname),
        ...buildFramingHeaders(posture, nonce),
        { key: REQUEST_ID_HEADER, value: requestId },
        policy.noStore,
      ]);
    }
  }

  // ---- 7. Portal policy: the module this route belongs to must be live. ----
  // Read-only navigation only: an API call or a write is never redirected, so
  // this can never mask a failed action or turn into a loop.
  //
  // Everything On (`lib/portals/master.ts`) is read here and *only* here. It is
  // signed, it expires, and it is deliberately out of scope for step 7 — so it
  // can reveal a module the trade's portal hid, and can never reveal one the
  // business has not paid for.
  if (isSafeMethod(method)) {
    const master = await openMasterRecord(request.cookies.get(MASTER_COOKIE)?.value);
    const revealAll = masterRevealActive(master);
    const verdict = checkPortalAccess(request.cookies.get(PORTAL_COOKIE)?.value, pathname, { revealAll });
    if (!verdict.allowed) {
      const target = new URL(verdict.redirectTo, request.url);
      return applyHeaders(NextResponse.redirect(target, 307), [
        ...buildBaselineHeaders(posture, pathname),
        ...buildFramingHeaders(posture, nonce),
        { key: REQUEST_ID_HEADER, value: requestId },
        { key: 'x-dukaan-portal-blocked', value: verdict.module },
        policy.noStore,
      ]);
    }
  }

  // ---- 8. Plan policy: the paid modules need a plan that is currently paid. ----
  // Same shape and the same safety rules as the portal check above: read-only
  // navigation only (a write is never redirected), and the always-open modules
  // (ledger, audit, trust centre, settings, and Your Plan itself) are added on
  // top of whatever the plan carries — so a lapsed business can always read its
  // own books and always reach the page that fixes it.
  if (isSafeMethod(method)) {
    const record = await openPlanRecord(request.cookies.get(PLAN_COOKIE)?.value);
    const entitlement = resolveEntitlement(record, Date.now());
    const verdict = checkPlanAccess(entitlement, pathname);
    if (!verdict.allowed) {
      const target = new URL(verdict.redirectTo, request.url);
      return applyHeaders(NextResponse.redirect(target, 307), [
        ...buildBaselineHeaders(posture, pathname),
        ...buildFramingHeaders(posture, nonce),
        { key: REQUEST_ID_HEADER, value: requestId },
        { key: 'x-dukaan-plan-blocked', value: verdict.module },
        { key: 'x-dukaan-plan-state', value: entitlement.state },
        policy.noStore,
      ]);
    }
  }

  // ---- 9. Session refresh (only with real credentials; never blocking). ----
  //
  // The nonce is pushed onto the *request* headers as well as the response.
  // That is how Next.js learns about it: the framework reads the inbound CSP
  // and stamps the matching nonce onto every script tag it renders. Without
  // this line a strict policy would block the app's own bundle.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  const framing = buildFramingHeaders(posture, nonce);
  const csp = framing.find((header) => header.key === 'Content-Security-Policy');
  if (csp) requestHeaders.set('content-security-policy', csp.value);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (supabaseConfigured) {
    try {
      // Loaded lazily: the Supabase SDK is ~700 kB of Edge code and must not
      // sit on the critical path for deployments that do not use it.
      const { createServerClient } = await import('@supabase/ssr');
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set({ name, value, ...options });
              response.cookies.set({
                name,
                value,
                ...options,
                httpOnly: true,
                sameSite: transport.sameSite,
                secure: transport.secure,
                partitioned: transport.partitioned,
              });
            });
          },
        },
      });
      await supabase.auth.getUser();
    } catch {
      // Auth refresh is best-effort — the page must always load.
    }
  }

  // ---- 10. Response hardening. ----
  applyHeaders(response, [
    ...buildBaselineHeaders(posture, pathname),
    ...framing,
    cacheHeaderFor(pathname),
    { key: REQUEST_ID_HEADER, value: requestId },
    { key: NONCE_HEADER, value: nonce },
    { key: 'Vary', value: 'Accept-Encoding' },
    // Transparent throttling: clients can see the budget they have left.
    ...Object.entries(rateLimitHeaders(decision)).map(([key, value]) => ({ key, value })),
  ]);

  // Mint (or refresh) the CSRF cookie. Readable by JS on purpose: the client
  // must be able to echo it back in a header — that is the whole mechanism.
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: transport.sameSite,
    secure: transport.secure,
    partitioned: transport.partitioned,
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return response;
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff|woff2|ttf|otf|map)$).*)'],
};
