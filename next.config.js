/**
 * Next.js build/runtime configuration.
 *
 * Two things matter here:
 *
 *  1. **Security headers for static responses.** Edge middleware cannot run for
 *     `/_next/static` assets, so those (and any response that bypasses
 *     middleware) get hardened here instead. The directive list lives in
 *     `lib/security/policy.json` — the same file middleware reads — so the two
 *     can never disagree.
 *
 *  2. **Performance defaults that keep the console feeling instant**: modern
 *     image formats, package-import optimisation for the icon/chart libraries,
 *     and compression left on.
 */

const path = require('path');
const policy = require('./lib/security/policy.json');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Mirror of lib/security/headers.ts `resolvePosture()` for build-time use. */
function isLockdownDeployment() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().toLowerCase();
  if (!appUrl) return false;
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(appUrl)) return false;
  if (appUrl.endsWith('.e2b.app') || appUrl.endsWith('.arena.ai')) return false;
  return true;
}

/**
 * The *fallback* CSP.
 *
 * Every HTML response goes through middleware, which mints a per-request nonce
 * and sends a strict `script-src 'nonce-…' 'strict-dynamic'`. This config
 * cannot do that — a static header is written once at build time and a nonce
 * that is reused is a nonce that is worthless.
 *
 * So this header exists for the responses middleware does not reach, and it is
 * deliberately the weaker of the two: it keeps `'unsafe-inline'` for scripts
 * because without a nonce there is no other way for the app's own bootstrap to
 * run. Middleware's header overwrites this one on every page, so the weaker
 * policy is never what a browser actually enforces on a console screen.
 *
 * Trusted Types are left out here for the same reason they are left out in
 * dev: enforcing them on a response we cannot nonce would break the page
 * rather than protect it.
 */
function buildCsp() {
  const strict = isLockdownDeployment();
  const directives = {
    ...policy.csp,
    'frame-ancestors': strict ? policy.framing.strict : policy.framing.embed,
  };

  directives['script-src'] = [...directives['script-src'], "'unsafe-inline'"];

  if (!IS_PRODUCTION) {
    directives['script-src'] = [...directives['script-src'], "'unsafe-eval'"];
    directives['connect-src'] = [...directives['connect-src'], 'ws:', 'wss:'];
    delete directives['require-trusted-types-for'];
    delete directives['trusted-types'];
  } else {
    directives['upgrade-insecure-requests'] = [];
  }

  // Violations reach the same endpoint whichever layer set the policy.
  directives['report-uri'] = [policy.reporting.endpoint];
  directives['report-to'] = [policy.reporting.group];

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(' ')}` : key))
    .join('; ');
}

const CSP = buildCsp();

/**
 * Permissions-Policy for a set of capture surfaces, from `policy.json`.
 *
 * Static responses bypass middleware, so the same rules have to be expressed
 * here as path patterns — otherwise `/scan` would be granted the camera by the
 * middleware and then have it stripped again by this config, in whichever order
 * the two layers happen to apply.
 */
function permissionsPolicyFor(surfaces) {
  const grants = {};
  for (const rule of policy.permissions.capture) {
    if (!rule.surfaces.some((surface) => surfaces.includes(surface))) continue;
    Object.assign(grants, rule.grants);
  }
  return Object.entries(policy.permissions.features)
    .map(([feature, allowlist]) => `${feature}=(${(grants[feature] ?? allowlist).join(' ')})`)
    .join(', ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Permissions-Policy', value: permissionsPolicyFor([]) },
  ...policy.headers,
  { key: 'Reporting-Endpoints', value: `${policy.reporting.group}="${policy.reporting.endpoint}"` },
  isLockdownDeployment()
    ? policy.hsts
    : { key: 'Strict-Transport-Security', value: 'max-age=0' },
  isLockdownDeployment()
    ? { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }
    : { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
];

/** One entry per capture surface, with sub-paths, so the grant is exact. */
const captureHeaders = policy.permissions.capture.flatMap((rule) =>
  rule.surfaces.flatMap((surface) => [
    { source: surface, headers: [{ key: 'Permissions-Policy', value: permissionsPolicyFor([surface]) }] },
    { source: `${surface}/:path*`, headers: [{ key: 'Permissions-Policy', value: permissionsPolicyFor([surface]) }] },
  ]),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  // Ship fewer bytes and fewer requests to the browser. SWC minification is
  // always on from Next.js 15 onwards, so the old `swcMinify` flag is gone.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Tree-shake icon and chart libraries down to what is actually imported.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },

  /**
   * Next.js 16 builds with Turbopack by default, and Turbopack refuses to run
   * when a `webpack` config is present without a matching `turbopack` config.
   *
   * Nothing needs porting:
   *   - the `@/` alias is already declared in tsconfig `paths`, which both
   *     bundlers honour natively (the webpack alias below was redundant);
   *   - `resolve.fallback` only existed to keep Node built-ins out of the
   *     client bundle, which Turbopack already refuses to do.
   *
   * The block is declared explicitly so the intent is visible and so a future
   * alias change has an obvious home.
   */
  turbopack: {
    resolveAlias: {
      '@': path.resolve(__dirname),
    },
  },

  // Keep the client bundle honest: fail loudly on accidental Node imports.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    };
    return config;
  },

  async headers() {
    return [
      // Everything.
      { source: '/:path*', headers: securityHeaders },
      // Capture surfaces re-grant only what they need. Declared after the
      // blanket rule so it wins for the paths above.
      ...captureHeaders,
      // The console holds business records — never let a proxy or disk cache it.
      {
        source: '/(home|dashboard|products|inventory|sales|billing|payments|expenses|transactions|customers|suppliers|memberships|reminders|marketing|reports|comparisons|profitability|cashflow|insights|alerts|audit|team|settings|business|subscription|check-ins|appointments|scan)/:path*',
        headers: [policy.noStore],
      },
      // Immutable assets.
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // RFC 9116. A security contact that a researcher cannot find is a
      // security contact that does not exist, so it is served as plain text,
      // cached briefly, and indexable.
      {
        source: '/.well-known/security.txt',
        headers: [
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
          { key: 'X-Robots-Tag', value: 'index, follow' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
