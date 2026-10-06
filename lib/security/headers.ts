/**
 * Security header composition.
 *
 * Single source of truth: `lib/security/policy.json`. Both the Next.js config
 * (static responses, assets) and the Edge middleware (per-request, embed-aware)
 * build from that file, so the policy can never drift between the two.
 *
 * Two postures:
 *  - **strict** (production, real domain configured): no framing by anyone,
 *    HSTS on, upgrade-insecure-requests on.
 *  - **embed** (local dev, sandbox/preview hosts): framing allowed for the
 *    known preview origins, HSTS off over plain HTTP, no upgrade-insecure
 *    so localhost stays reachable.
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

/** Build the CSP string. `nonceless` keeps static rendering intact. */
export function buildContentSecurityPolicy(posture: SecurityPosture = resolvePosture()): string {
  const directives: Record<string, string[]> = {
    ...policy.csp,
    'frame-ancestors': posture === 'strict' ? policy.framing.strict : policy.framing.embed,
  };

  if (process.env.NODE_ENV !== 'production') {
    directives['script-src'] = [...directives['script-src'], "'unsafe-eval'"];
    directives['connect-src'] = [...directives['connect-src'], 'ws:', 'wss:'];
  } else {
    directives['upgrade-insecure-requests'] = [];
  }

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(' ')}` : key))
    .join('; ');
}

/** Framing headers, posture-aware. */
export function buildFramingHeaders(posture: SecurityPosture = resolvePosture()): HeaderPair[] {
  if (posture === 'strict') {
    return [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(posture) },
    ];
  }
  // Previews are embedded in an iframe from the platform's own host, which is
  // cross-origin to this app. `X-Frame-Options: SAMEORIGIN` would silently
  // blank the preview — and browsers apply it *in addition to* CSP, so sending
  // it would override the permissive policy. Omit it entirely and let
  // `frame-ancestors` (permissive here, locked down in strict posture) decide.
  return [{ key: 'Content-Security-Policy', value: buildContentSecurityPolicy(posture) }];
}

/**
 * Permissions-Policy, composed from the feature list in `policy.json`.
 *
 * Every feature is denied by default. A few screens genuinely need the camera
 * (barcode scanning) or the platform authenticator (fingerprint check-in), and
 * those are granted *only on their own routes* by the `capture` rules. The rest
 * of the console — reports, cash flow, customer records — stays locked, so a
 * scanner is never a reason for the whole app to hold camera access.
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
  ];
  if (posture === 'strict') {
    headers.push(policy.hsts);
  } else {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=0' });
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
