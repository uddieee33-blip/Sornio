/**
 * Edge security middleware.
 *
 * Order of operations matters — the cheapest, most decisive checks run first:
 *
 *   1. Request id          → every response is traceable to one line in a log.
 *   2. Abuse probes        → known scanner paths answered with 404, no detail.
 *   3. Rate limit          → per-fingerprint sliding window, before any work.
 *   4. CSRF                → fetch-metadata + origin + double-submit token.
 *   5. Security headers    → posture-aware CSP/HSTS/framing on the response.
 *   6. Session refresh     → Supabase only when real credentials are present.
 *
 * Everything here is Edge-safe (Web Crypto, no Node built-ins) and every
 * failure path degrades to "serve the page" rather than "show an error".
 */

import { NextRequest, NextResponse } from 'next/server';

import policy from '@/lib/security/policy.json';
import {
  buildBaselineHeaders,
  buildFramingHeaders,
  buildStaticAssetHeaders,
  cacheHeaderFor,
  resolvePosture,
  type HeaderPair,
} from '@/lib/security/headers';
import { clientFingerprint, consume, rateLimitHeaders, ruleForPath, type RateLimitRule } from '@/lib/security/rate-limit';
import { CSRF_COOKIE, CSRF_HEADER, checkDoubleSubmit, checkFetchMetadata, checkOrigin, isSafeMethod, issueCsrfToken } from '@/lib/security/csrf';
import { randomToken } from '@/lib/security/crypto';

const REQUEST_ID_HEADER = 'x-request-id';
const RATE_TABLE = policy.rateLimits as unknown as Record<string, RateLimitRule>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Real Supabase credentials only — placeholders must never trigger network calls. */
const supabaseConfigured =
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project') &&
  supabaseKey.length >= 20 &&
  !supabaseKey.includes('your-anon-key') &&
  !supabaseKey.includes('your-publishable-key');

function requestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : '';
}

function applyHeaders(response: NextResponse, pairs: HeaderPair[]): NextResponse {
  for (const { key, value } of pairs) response.headers.set(key, value);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? randomToken(8);
  const posture = resolvePosture();

  // ---- 1. Static assets: long-lived cache, minimal headers, no work. ----
  if (pathname.startsWith('/_next/static') || pathname.startsWith('/_next/image') || pathname === '/favicon.ico') {
    return applyHeaders(NextResponse.next(), buildStaticAssetHeaders());
  }

  // ---- 2. Known scanner probes: refuse without describing why. ----
  const probe = policy.probePaths.find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  if (probe) {
    return applyHeaders(new NextResponse(null, { status: 404 }), [
      ...buildBaselineHeaders(posture),
      { key: REQUEST_ID_HEADER, value: requestId },
      policy.noStore,
    ]);
  }

  // ---- 3. Rate limiting, per scope + client fingerprint. ----
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

  const { scope, rule } = ruleForPath(pathname, RATE_TABLE);
  const decision = consume(`${scope}:${fingerprint}`, rule);
  // Cheap burst guard sits on top of the per-scope budget.
  const burst = consume(`burst:${fingerprint}`, RATE_TABLE.burst);

  if (!decision.allowed || !burst.allowed) {
    const throttled = decision.allowed ? burst : decision;
    const isApi = pathname.startsWith('/api/');
    const body = isApi
      ? JSON.stringify({ error: 'Too many requests. Please slow down.', requestId })
      : 'Too many requests. Please wait a moment and try again.';
    return applyHeaders(
      new NextResponse(body, {
        status: 429,
        headers: {
          'content-type': isApi ? 'application/json' : 'text/plain; charset=utf-8',
          'retry-after': String(throttled.retryAfter),
        },
      }),
      [
        ...buildBaselineHeaders(posture),
        ...buildFramingHeaders(posture),
        ...Object.entries(rateLimitHeaders(throttled)).map(([key, value]) => ({ key, value })),
        { key: REQUEST_ID_HEADER, value: requestId },
        policy.noStore,
      ],
    );
  }

  // ---- 4. CSRF on mutating requests. ----
  const csrfToken = request.cookies.get(CSRF_COOKIE)?.value ?? issueCsrfToken();
  if (!isSafeMethod(method)) {
    const allowedHosts = [request.headers.get('host') ?? '', 'localhost', '127.0.0.1'];
    const verdicts = [
      checkFetchMetadata(request.headers),
      checkOrigin(request.headers, allowedHosts.filter(Boolean)),
      // The double-submit token is enforced for API routes; page-level form
      // posts are covered by the origin + fetch-metadata layers above.
      pathname.startsWith('/api/') ? checkDoubleSubmit(request.headers, request.cookies.get(CSRF_COOKIE)?.value) : { ok: true as const },
    ];
    const failed = verdicts.find((verdict) => !verdict.ok);
    if (failed && !failed.ok) {
      return applyHeaders(
        new NextResponse(JSON.stringify({ error: failed.reason, requestId }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
        [
          ...buildBaselineHeaders(posture),
          ...buildFramingHeaders(posture),
          { key: REQUEST_ID_HEADER, value: requestId },
          policy.noStore,
        ],
      );
    }
  }

  // ---- 5. Session refresh (only with real credentials; never blocking). ----
  const response = NextResponse.next({ request: { headers: request.headers } });

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
              response.cookies.set({ name, value, ...options, httpOnly: true, sameSite: 'lax' });
            });
          },
        },
      });
      await supabase.auth.getUser();
    } catch {
      // Auth refresh is best-effort — the page must always load.
    }
  }

  // ---- 6. Response hardening. ----
  applyHeaders(response, [
    ...buildBaselineHeaders(posture),
    ...buildFramingHeaders(posture),
    cacheHeaderFor(pathname),
    { key: REQUEST_ID_HEADER, value: requestId },
    { key: 'Vary', value: 'Accept-Encoding' },
  ]);

  // Mint (or refresh) the CSRF cookie. Readable by JS on purpose: the client
  // must be able to echo it back in a header — that is the whole mechanism.
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: posture === 'strict',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return response;
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff|woff2|ttf|otf|map)$).*)'],
};
