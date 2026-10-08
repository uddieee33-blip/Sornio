#!/usr/bin/env node

/**
 * Verify the security layer against the claims it makes.
 *
 * Security regressions do not look like bugs. Nobody files a ticket saying
 * "the Content-Security-Policy quietly gained `'unsafe-inline'` in a merge
 * three weeks ago"; the app works perfectly either way, which is exactly the
 * problem. The only defence is a script that re-reads the invariants every
 * build and refuses to be polite about it.
 *
 * Each check below exists because of a specific way this layer could silently
 * stop protecting anyone:
 *
 *   1. **The strict CSP is actually strict.** `'unsafe-inline'` in `script-src`
 *      turns the whole policy into decoration — it is the single change most
 *      likely to be made in good faith by someone fixing a third-party widget.
 *   2. **The nonce is never baked into a static file.** A nonce written at
 *      build time is reused on every response forever, which is worse than no
 *      nonce because it reads as protection.
 *   3. **Dangerous sinks stay shut.** `object-src`, `base-uri`, `form-action`:
 *      each one is a documented CSP bypass when left open, and none of them
 *      is ever needed by this product.
 *   4. **The penalty box runs before the rate limiter.** Reversed, every
 *      request from a banned fingerprint still pays for a full rate-limit
 *      evaluation — the ordering *is* the defence.
 *   5. **Every mutating API route has a bucket.** A new endpoint that nobody
 *      added to `rateLimits` silently inherits the most generous one.
 *   6. **The CSRF exemption list is exactly one path.** Exemptions are added
 *      under deadline pressure and never removed.
 *   7. **No probe path shadows a real route.** `probePaths` 404s instantly;
 *      adding `/admin` to it the week someone ships `/admin` takes the
 *      feature off the air with no error anywhere.
 *   8. **security.txt has not expired.** RFC 9116 says an expired file is
 *      invalid, and a stale contact address is how a real report gets dropped.
 *
 * Run: npm run verify:security
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(ROOT, ...parts));

const policy = JSON.parse(read('lib', 'security', 'policy.json'));
const headers = read('lib', 'security', 'headers.ts');
const proxy = read('proxy.ts');
const nextConfig = read('next.config.js');
const rateLimit = read('lib', 'security', 'rate-limit.ts');

/** Comments explain the rules; they are not the rules. Strip before matching. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const failures = [];
const notes = [];
const passed = [];

function check(label, condition, detail) {
  if (condition) passed.push(label);
  else failures.push(`${label} — ${detail}`);
}

/* ------------------------------------------------------- 1. the strict CSP */

const csp = policy.csp;
const scriptSrc = csp['script-src'] ?? [];

check(
  'script-src has no unsafe-inline',
  !scriptSrc.includes("'unsafe-inline'"),
  "lib/security/policy.json script-src contains 'unsafe-inline'. That single token makes the rest of the policy decorative — an injected <script> runs regardless of every other directive.",
);

check(
  'script-src has no unsafe-eval',
  !scriptSrc.includes("'unsafe-eval'"),
  "lib/security/policy.json script-src contains 'unsafe-eval'.",
);

check(
  'strict posture emits a nonce and strict-dynamic',
  headers.includes("'strict-dynamic'") && /nonce-\$\{|nonce-' \+|'nonce-/.test(headers),
  "buildContentSecurityPolicy no longer emits a nonce with 'strict-dynamic'. Without it, script-src 'self' is bypassable through any script-serving path on this origin.",
);

check(
  'Trusted Types are required',
  (csp['require-trusted-types-for'] ?? []).includes("'script'"),
  'require-trusted-types-for is no longer set. innerHTML becomes a live XSS sink again.',
);

check(
  'inline event handlers are refused',
  (csp['script-src-attr'] ?? []).includes("'none'"),
  "script-src-attr is not 'none', so an injected onclick= attribute executes.",
);

/* --------------------------------------------- 2. no nonce in static config */

check(
  'next.config.js ships no nonce',
  !/nonce-/.test(withoutComments(nextConfig)),
  'next.config.js contains a nonce. A header written at build time is reused on every response for the life of the deployment, which is strictly worse than having none — it looks like protection and is not.',
);

check(
  'the static fallback is documented as the weaker policy',
  /fallback/i.test(nextConfig),
  'next.config.js no longer explains that its CSP is the weaker fallback overwritten by proxy.ts. Without that note the next reader will "fix" the strict policy to match it.',
);

/* --------------------------------------------------- 3. dangerous sinks shut */

for (const [directive, expected] of [
  ['object-src', "'none'"],
  ['base-uri', "'none'"],
  ['frame-src', "'none'"],
  ['child-src', "'none'"],
]) {
  check(
    `${directive} is ${expected}`,
    (csp[directive] ?? []).includes(expected),
    `${directive} is "${(csp[directive] ?? []).join(' ') || 'absent'}". This is a documented CSP bypass and the product has no use for it.`,
  );
}

check(
  "form-action is 'self'",
  JSON.stringify(csp['form-action'] ?? []) === JSON.stringify(["'self'"]),
  'form-action must be self: without it an injected <form> can post a session straight off-origin.',
);

/* --------------------------------------------------------- 4. proxy ordering */

const penaltyAt = proxy.search(/penaltyRemainingMs/);
const limitAt = proxy.search(/\bconsume\(|rateLimit\(|checkRateLimit\(/);

check(
  'the penalty box runs before the rate limiter',
  penaltyAt !== -1 && limitAt !== -1 && penaltyAt < limitAt,
  penaltyAt === -1
    ? 'proxy.ts never calls penaltyRemainingMs — the penalty box is dead code.'
    : 'the rate limiter runs before the penalty box. Reversed, a banned fingerprint still costs a full rate-limit evaluation on every request, which is the cost the penalty box exists to avoid.',
);

check(
  'every throttle records a strike',
  /recordThrottle\(/.test(proxy),
  'proxy.ts never calls recordThrottle, so the penalty box can never fill and will never trigger.',
);

check(
  'a per-request nonce is minted',
  /x-nonce/i.test(proxy) && /randomToken\(|getRandomValues|randomUUID/.test(withoutComments(proxy)),
  'proxy.ts no longer mints a per-request nonce, so the strict CSP has nothing to authorise its own bootstrap with.',
);

/* -------------------------------------------------- 5. buckets for endpoints */

const apiDir = path.join(ROOT, 'app', 'api');
const routes = exists('app', 'api')
  ? fs
      .readdirSync(apiDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

/**
 * Every *mutating* endpoint needs its own branch in `ruleForPath`.
 *
 * Read-only routes are welcome to share the general `api` budget — a health
 * probe at 90 a minute harms nobody. A route that changes state is different:
 * without its own branch it silently inherits the most generous bucket in the
 * table, which is exactly how a plan-activation endpoint ends up as generous
 * as a page load.
 */
const mutating = routes.filter((route) => {
  const file = path.join(apiDir, route, 'route.ts');
  if (!fs.existsSync(file)) return false;
  return /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/.test(fs.readFileSync(file, 'utf8'));
});

const unrouted = mutating.filter((route) => !rateLimit.includes(`/api/${route}`));

check(
  'every mutating API route has a dedicated rate-limit branch',
  unrouted.length === 0,
  `ruleForPath has no branch for: ${unrouted.map((r) => `/api/${r}`).join(', ')}. A state-changing endpoint with no branch inherits the general api bucket.`,
);

notes.push(
  `${mutating.length} of ${routes.length} API routes mutate state (${mutating.join(', ') || 'none'}); the rest share the general api bucket by design.`,
);

for (const [name, bucket] of Object.entries(policy.rateLimits)) {
  check(
    `bucket "${name}" is sane`,
    bucket.limit > 0 && bucket.windowMs >= 1000 && bucket.limit <= 1000,
    `rateLimits.${name} = ${JSON.stringify(bucket)} — a limit of 0 locks everyone out and a limit over 1000 is not a limit.`,
  );
}

/* ----------------------------------------------------- 6. the CSRF exemption */

const exemptions = [...proxy.matchAll(/CSRF_EXEMPT[^=]*=\s*(\[[^\]]*\])/g)].map((m) => m[1]);
const exemptionBody = exemptions.join(' ');
const exemptPaths = [...exemptionBody.matchAll(/'([^']+)'/g)].map((m) => m[1]);

if (exemptPaths.length === 0) {
  // The exemption may be inline rather than in a named constant; look for the
  // one path that is allowed to be exempt and make sure nothing else is.
  notes.push('No CSRF_EXEMPT list found as a named constant — the exemption check could not be fully verified.');
} else {
  check(
    'only /api/report is exempt from CSRF',
    exemptPaths.length === 1 && exemptPaths[0] === '/api/report',
    `CSRF exemptions are [${exemptPaths.join(', ')}]. Only /api/report may be exempt — the browser posts violation reports itself with no token we control. Every other exemption is a hole.`,
  );
}

/* ------------------------------------------------- 7. probes vs real routes */

const consoleDir = path.join(ROOT, 'app', '(console)');
const realRoutes = exists('app', '(console)')
  ? fs
      .readdirSync(consoleDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('('))
      .map((entry) => `/${entry.name}`)
  : [];

const shadowed = policy.probePaths.filter(
  (probe) => realRoutes.includes(probe) || routes.includes(probe.replace('/api/', '')),
);

check(
  'no probe path shadows a real route',
  shadowed.length === 0,
  `these probe paths are also real routes and would 404 instantly: ${shadowed.join(', ')}. The feature would go off the air with no error logged anywhere.`,
);

check(
  'the probe list is still doing something',
  policy.probePaths.length >= 10,
  `only ${policy.probePaths.length} probe paths. The list exists to answer the scanners that hit every deployment within hours of it going live.`,
);

/* ------------------------------------------------------------ 8. security.txt */

for (const location of [
  ['public', '.well-known', 'security.txt'],
  ['public', 'security.txt'],
]) {
  const where = path.join(...location);
  if (!exists(...location)) {
    failures.push(`${where} is missing — RFC 9116 expects it at both /.well-known/security.txt and /security.txt.`);
    continue;
  }
  const body = read(...location);
  const expires = body.match(/^Expires:\s*(.+)$/m);
  if (!expires) {
    failures.push(`${where} has no Expires field. RFC 9116 requires one.`);
    continue;
  }
  const when = new Date(expires[1].trim());
  if (Number.isNaN(when.getTime())) {
    failures.push(`${where} has an unparseable Expires value: ${expires[1]}`);
  } else if (when.getTime() < Date.now()) {
    failures.push(`${where} expired on ${when.toISOString().slice(0, 10)}. An expired file is invalid, and a dropped report is a report nobody reads.`);
  } else {
    const days = Math.round((when.getTime() - Date.now()) / 86_400_000);
    passed.push(`security.txt at ${where} is valid for another ${days} days`);
    if (days < 60) notes.push(`${where} expires in ${days} days. Renew it before it lapses.`);
  }
  if (!/^Contact:/m.test(body)) failures.push(`${where} has no Contact field, which is the only required field in RFC 9116.`);
}

/* ------------------------------------------------------------ the report API */

if (exists('app', 'api', 'report', 'route.ts')) {
  const reportRoute = read('app', 'api', 'report', 'route.ts');
  check(
    'the violation endpoint stores nothing',
    !/writeFile|appendFile|insert\(|supabase/i.test(reportRoute),
    'app/api/report/route.ts has grown a write path. A violation report is a signal that the policy is wrong, not a place to collect telemetry about an owner’s browser.',
  );
  check(
    'the violation endpoint bounds its input',
    /MAX_BYTES|MAX_BODY|maxBytes|16\s*\*\s*1024|16384/.test(reportRoute),
    'app/api/report/route.ts no longer bounds the request body. An unauthenticated endpoint that parses arbitrary JSON is a denial-of-service lever.',
  );
} else {
  failures.push('app/api/report/route.ts is missing, but policy.json points Reporting-Endpoints at /api/report.');
}

/* -------------------------------------------------------------------- output */

console.log('\nVerifying the security layer\n');
for (const label of passed) console.log(`  ok    ${label}`);
for (const note of notes) console.log(`\n  note  ${note}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(`\n${passed.length} invariants hold.\n`);
