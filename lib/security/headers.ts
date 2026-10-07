/**
 * Security header composition.
 *
 * Single source of truth: `lib/security/policy.json`. Both the Next.js config
 * (static responses, assets) and the Edge middleware (per-request, embed-aware)
 * build from that file, so the policy can never drift between the two.
 *
 * Two postures:
 *  - **strict** (production, real domain configured): no framing by anyone,
 *    HSTS on, upgrade-insecure-requests on, a per-request **nonce** instead of
 *    `script-src 'unsafe-inline'`, Trusted Types enforced, and a cross-origin
 *    isolation posture that assumes nothing third-party needs to reach in.
 *  - **embed** (local dev, sandbox/preview hosts): framing allowed for the
 *    known preview origins, HSTS off over plain HTTP, no upgrade-insecure so
 *    localhost stays reachable, and the inline allowances a dev server needs.
 *
 * The posture split is not "security off in dev". It is an honest statement
 * that a preview host *is* a different threat model: it is framed by the
 * platform, served over a shared domain, and reached only by the person
 * building it. Every control that can hold in both postures holds in both.
 */

import policy from './policy.json';

export type HeaderPair = { key: string; value: string };
export type SecurityPosture = 'strict' | 'embed';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];

/** Are we running somewhere that is not a real, HTTPS deployment? */
export function isLocalOrPreviewEnvironment(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().toLowerCase();
  if (!appUrl) return true; // Nothing configured → treat as a preview, never lock ourselves out.
  if (LOCAL_HOSTS.some((host) => appUrl.includes(host))) return true;
  if (appUrl.endsWith('.e2b.app') || appUrl.endsWith('.arena.ai')) return true;
  return false;
}

export function resolvePosture(): SecurityPosture {
  return isLocalOrPreviewEnvironment() ? 'embed' : 'strict';
}

/**
 * Build the CSP string.
 *
 * `nonce` is the hardening that matters most here. With it, `script-src`
 * becomes `'nonce-…' 'strict-dynamic'`: the browser runs only the scripts the
 * server vouched for in this one response, and anything those scripts load in
 * turn. An injected `<script>` has no nonce (the attacker cannot read the
 * header that minted it) and `'strict-dynamic'` makes host allowlists
 * irrelevant, which removes the usual bypass of finding a sloppy CDN on the
 * list. Without a nonce — in dev, where the bundler injects inline code we do
 * not control — the policy falls back to `'unsafe-inline'` and says so.
 *
 * `require-trusted-types-for 'script'` closes the other half: it makes DOM
 * sinks like `innerHTML` throw unless the value went through a registered
 * policy, so a future bug cannot turn a customer name into script.
 */
export function buildContentSecurityPolicy(
  posture: SecurityPosture = resolvePosture(),
  nonce?: string,
): string {
  const directives: Record<string, string[]> = {
    ...policy.csp,
    'frame-ancestors': posture === 'strict' ? policy.framing.strict : policy.framing.embed,
  };

  if (nonce && posture === 'strict') {
    // 'strict-dynamic' deliberately drops the host allowlist for scripts: the
    // nonce is the whole authorisation, and a propagated trust chain is much
    // harder to subvert than a list of domains someone may one day widen.
    directives['script-src'] = [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'"];
  } else {
    // Dev and preview: Turbopack injects inline bootstrap and uses eval for
    // hot reload. Stating that plainly is better than shipping a policy that
    // is quietly violated on every page load.
    directives['script-src'] = [...policy.csp['script-src'], "'unsafe-inline'"];
  }

  if (process.env.NODE_ENV !== 'production') {
    directives['script-src'] = [...directives['script-src'], "'unsafe-eval'"];
    directives['connect-src'] = [...directives['connect-src'], 'ws:', 'wss:'];
    // Trusted Types would reject the bundler's own DOM writes in dev. It is a
    // production control; pretending otherwise would just train us to ignore
    // a console full of violations.
    delete directives['require-trusted-types-for'];
    delete directives['trusted-types'];
  } else {
    directives['upgrade-insecure-requests'] = [];
  }

  // Where a violation should be sent. Both spellings: `report-uri` is
  // deprecated and universally supported, `report-to` is the replacement and
  // is not. Sending both is the only way to actually hear about a violation.
  directives['report-uri'] = [policy.reporting.endpoint];
  directives['report-to'] = [policy.reporting.group];

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(' ')}` : key))
    .join('; ');
}

/** The `Reporting-Endpoints` header that gives `report-to` somewhere to go. */
export function buildReportingHeader(): HeaderPair {
  return {
    key: 'Reporting-Endpoints',
    value: `${policy.reporting.group}="${policy.reporting.endpoint}"`,
  };
}

/** Framing headers, posture-aware. */
export function buildFramingHeaders(
  posture: SecurityPosture = resolvePosture(),
  nonce?: string,
): HeaderPair[] {
  if (posture === 'strict') {
    return [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(posture, nonce) },
    ];
  }
  // Previews are embedded in an iframe from the platform's own host, which is
  // cross-origin to this app. `X-Frame-Options: SAMEORIGIN` would silently
  // blank the preview — and browsers apply it *in addition to* CSP, so sending
  // it would override the permissive policy. Omit it entirely and let
  // `frame-ancestors` (permissive here, locked down in strict posture) decide.
  return [{ key: 'Content-Security-Policy', value: buildContentSecurityPolicy(posture, nonce) }];
}

/**
 * Permissions-Policy, composed from the feature list in `policy.json`.
 *
 * Every feature is denied by default. A few screens genuinely need the camera
 * (barcode scanning) or the platform authenticator (fingerprint check-in), and
 * those are granted *only on their own routes* by the `capture` rules. The rest
 * of the console — reports, cash flow, customer records — stays locked, so a
 * scanner is never a reason for the whole app to hold camera access.
 *
 * One feature is granted globally, deliberately:
 * `publickey-credentials-get=(self)`. The counter lock screen *replaces* the
 * console wherever the owner happened to be when it engaged, so a passkey
 * unlock has to be callable from every route — route-scoping it would mean the
 * sensor works on some screens and not others, which is worse than useless on
 * a till. It stays `self`, so only our own top-level document can ask; an
 * embedded third party still cannot. Enrolment (`-create`) remains pinned to
 * `/security`, because minting a credential should happen in exactly one
 * place the owner navigated to on purpose.
 */
export function buildPermissionsPolicy(pathname?: string): string {
  const features: Record<string, string[]> = policy.permissions.features;
  const grants = permissionGrantsFor(pathname);
  return Object.entries(features)
    .map(([feature, allowlist]) => `${feature}=(${(grants[feature] ?? allowlist).join(' ')})`)
    .join(', ');
}

/** Features granted on this path, over and above the deny-by-default list. */
export function permissionGrantsFor(pathname?: string): Record<string, string[]> {
  const grants: Record<string, string[]> = {};
  if (!pathname) return grants;
  const path = normalizePathname(pathname);
  for (const rule of policy.permissions.capture) {
    const applies = rule.surfaces.some((surface) => path === surface || path.startsWith(`${surface}/`));
    if (!applies) continue;
    for (const [feature, allowlist] of Object.entries(rule.grants)) grants[feature] = allowlist;
  }
  return grants;
}

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split('?')[0].split('#')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) return withoutQuery.slice(0, -1);
  return withoutQuery;
}

/** Everything that goes on literally every response. */
export function buildBaselineHeaders(
  posture: SecurityPosture = resolvePosture(),
  pathname?: string,
): HeaderPair[] {
  const headers: HeaderPair[] = [
    ...policy.headers,
    { key: 'Permissions-Policy', value: buildPermissionsPolicy(pathname) },
    buildReportingHeader(),
  ];

  if (posture === 'strict') {
    headers.push(policy.hsts);
    // Cross-origin isolation, but `credentialless` rather than `require-corp`:
    // it gives the same isolation guarantees without demanding a CORP header
    // from every image a shop might one day embed. `require-corp` is stricter
    // and would break the first owner who pastes in a logo URL.
    headers.push({ key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' });
  } else {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=0' });
  }

  // The console is a business's private ledger. It should never be in an index,
  // a cache, or an AI crawl — and the public marketing page says the opposite,
  // so this is decided per path rather than globally.
  const path = normalizePathname(pathname ?? '/');
  const isPublic = path === '/' || path.startsWith('/auth') || path.startsWith('/onboarding');
  if (isPublic) {
    headers.push({ key: 'X-Robots-Tag', value: 'index, follow' });
  }

  return headers;
}

export function buildStaticAssetHeaders(): HeaderPair[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
  ];
}

/** Marketing pages get a short shared cache; the console must never be cached. */
export function cacheHeaderFor(pathname: string): HeaderPair {
  const isPublic = pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/onboarding');
  if (isPublic) return { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' };
  return policy.noStore;
}

export function headerMap(headers: HeaderPair[]): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header) => {
    acc[header.key] = header.value;
    return acc;
  }, {});
}

export { policy };
