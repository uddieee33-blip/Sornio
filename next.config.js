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

function buildCsp() {
  const strict = isLockdownDeployment();
  const directives = {
    ...policy.csp,
    'frame-ancestors': strict ? policy.framing.strict : policy.framing.embed,
  };

  if (!IS_PRODUCTION) {
    directives['script-src'] = [...directives['script-src'], "'unsafe-eval'"];
    directives['connect-src'] = [...directives['connect-src'], 'ws:', 'wss:'];
  } else {
    directives['upgrade-insecure-requests'] = [];
  }

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(' ')}` : key))
    .join('; ');
}

const CSP = buildCsp();

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  ...policy.headers,
  isLockdownDeployment()
    ? policy.hsts
    : { key: 'Strict-Transport-Security', value: 'max-age=0' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  // Ship fewer bytes and fewer requests to the browser.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Tree-shake icon and chart libraries down to what is actually imported.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
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
      // The console holds business records — never let a proxy or disk cache it.
      {
        source: '/(home|dashboard|products|inventory|sales|billing|payments|expenses|transactions|customers|suppliers|memberships|reminders|marketing|reports|comparisons|profitability|cashflow|insights|alerts|audit|team|settings|business)/:path*',
        headers: [policy.noStore],
      },
      // Immutable assets.
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

module.exports = nextConfig;
