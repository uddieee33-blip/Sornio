#!/usr/bin/env node

/**
 * Verify the auth setup — the session, the gate, and the four doors around it.
 *
 * Auth regressions are the quietest kind this codebase can have. Delete one
 * `await` and the console still opens; drop `httpOnly` and every page looks
 * identical; widen a public prefix by one path and only an owner who deep-links a
 * bookmark ever notices. The app cannot tell the difference, so this script does,
 * by running the real modules — the same `createSession` that runs at sign-in and
 * the same `checkAuthAccess` that runs at the edge.
 *
 * Each block exists because of a specific way this layer could silently stop
 * protecting a business:
 *
 *   1. **A session is a session.** Mint, reopen, and compare. A claims blob that
 *      loses the tenant or the role on the round trip is a session that grants
 *      the wrong thing, and nobody sees it in the UI.
 *   2. **A token from another deployment, or a hand-edited one, is worth nothing.**
 *      Same bytes, one character changed, or signed with a different key — all
 *      three must verify to `null`, never to "close enough".
 *   3. **Expiry and role are enforced by the verifier, not the mint.** A past
 *      `exp` and a role that is not in the RBAC matrix are both rejected on read,
 *      which is what makes an edited cookie and a forged one equally useless.
 *   4. **"Keep me signed in" has to mean what it says.** Two clocks: the cookie's
 *      own lifetime, and the token's. Unchecked, the cookie must carry no expiry
 *      at all and the token must be the short one.
 *   5. **The gate keeps the console closed and the public things open.** Every
 *      route in `app/(console)` must be refused to an anonymous request, and the
 *      catalogues, the health probe, sign-in itself, the install manifest, and
 *      `security.txt` must not be — a redirected `/locales/hi.json` is how 22
 *      languages quietly stop working, a redirected manifest is how the
 *      install prompt never appears, and a redirected `security.txt` is how
 *      a report gets dropped.
 *   6. **A `next` parameter is not a redirect permission.** The absolute, the
 *      protocol-relative, and the backslash form are all refused.
 *   7. **The door into the console is earned, and it opens where the owner
 *      belongs.** A session cookie proves the browser was authenticated, not that
 *      the owner is the one now tapping Continue — so a console-bound door asks
 *      for the account password, or this device's own owner password on a build
 *      with no provider, and a setup-bound door does not. Where it goes is decided
 *      from the account row and the vault rather than from a hardcoded
 *      `/onboarding`, which is how a shopkeeper who had already given us their bank
 *      details kept being handed their own phone number to type again.
 *   8. **A provider cookie only counts when there is a provider.** On a
 *      local-first build, `sb-…-auth-token` in a request is somebody's guess.
 *   9. **The password is read and forgotten.** No log call anywhere in the auth
 *      routes, and no branch of the recovery endpoint that leaks whether an
 *      address has an account.
 *  10. **The edge imports the pure halves.** `@/lib/auth` pulls in
 *      `next/headers`; a middleware that reaches for it grows a Node dependency
 *      and fails at runtime in the one place that must never fail.
 *  11. **The unguarded Supabase clients stay deleted.** `lib/supabase/user.ts`
 *      and `server.ts` built a client from whatever env said, including the
 *      placeholders, and hung. They are gone; this fails if they come back.
 *
 *   npm run verify:auth
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-auth-'));

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') throw new Error(`${label} is async — await it with checkAsync`);
    passed += 1;
    console.log(`  ok    ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label}\n        ${error.message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label}\n        ${error.message}`);
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertEqual = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

console.log('Compiling the auth layer…');

const tsconfig = join(outDir, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'es2020',
        lib: ['dom', 'dom.iterable', 'esnext'],
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        module: 'node16',
        moduleResolution: 'node16',
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        outDir,
        rootDir: join(root, 'lib'),
        paths: { '@/*': [`${relative(outDir, root)}/*`] },
      },
      // Entry points only — TypeScript follows the imports from here.
      files: [
        join(root, 'lib/auth/routes.ts'),
        join(root, 'lib/auth/cookie.ts'),
        join(root, 'lib/auth/origin.ts'),
      ],
    },
    null,
    2,
  ),
);

// The API compiler by package path, not `npx tsc`: both TypeScript
// packages ship a `tsc`, so the one on PATH is whichever npm linked last.
execFileSync(process.execPath, [compiler('api', root).file, '-p', tsconfig], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});

/** See `verify-billing.mjs`: `paths` is a type-checking map, not an emit map. */
const require = createRequire(import.meta.url);
// (named `nodeModule` rather than `module`: the Next.js lint rule reserves that
// identifier, and a verifier that fails lint is a verifier nobody runs)
const nodeModule = require('node:module');
const resolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function aliased(request, ...rest) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    const mapped = request.slice(2).replace(/^lib\//, '');
    return resolveFilename.call(this, join(outDir, mapped), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

const gate = require(join(outDir, 'auth/routes.js'));
const cookie = require(join(outDir, 'auth/cookie.js'));
const origin = require(join(outDir, 'auth/origin.js'));
const session = require(join(outDir, 'security/session.js'));

const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

const SECRET = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const CLAIMS = {
  tenantId: 'biz_0123456789abcdef',
  userId: 'local_0123456789abcdef01234567',
  role: 'owner',
  displayName: 'ki•••',
};

// ---------------------------------------------------------------------------
// 1. a session is a session
// ---------------------------------------------------------------------------

await checkAsync('a minted session reopens to the same claims', async () => {
  const issued = await cookie.sealOwnerSession({ ...CLAIMS, remember: true }, { secret: SECRET });
  const opened = await session.verifySession(issued.value, SECRET);
  assertEqual(opened.valid, true, 'verified');
  assertEqual(opened.claims.tenantId, CLAIMS.tenantId, 'the tenant survives the round trip');
  assertEqual(opened.claims.role, CLAIMS.role, 'the role survives the round trip');
  assertEqual(opened.claims.displayName, CLAIMS.displayName, 'the display name survives the round trip');
  assert(opened.claims.sid && opened.claims.sid.length >= 16, 'a rotation id is present');
});

await checkAsync('a local session is scoped to the device that made it', async () => {
  const issued = await cookie.localOwnerSession('Kiran@Business.com ', 'ki•••', { remember: false });
  const opened = await cookie.openOwnerSession(issued.value);
  assert(opened, 'a locally minted session reopens with this deployment\'s own key');
  assertEqual(opened.tenantId, opened.userId, 'one business per local install, so the tenant is the device');
  assertEqual(cookie.providerForClaims(opened), 'local', 'and it can never claim to be provider-backed');
  const stable = await cookie.localOwnerSession('kiran@business.com', 'ki•••', { remember: false });
  assertEqual(stable.claims.userId, opened.userId, 'the same owner on the same device gets the same id');
  assert(opened.userId.startsWith('local_'), 'the id says what it is');
  assert(!opened.userId.includes('kiran'), 'and no part of the address is in it');
});

// ---------------------------------------------------------------------------
// 2. a token that is not ours
// ---------------------------------------------------------------------------

await checkAsync('a token signed with another key is worth nothing', async () => {
  const issued = await cookie.sealOwnerSession({ ...CLAIMS, remember: true }, { secret: SECRET });
  const forged = await session.verifySession(issued.value, OTHER);
  assertEqual(forged.valid, false, 'a session from another deployment must not open this one');
  assert(forged.reason === 'bad-signature' || forged.reason === 'unknown-key', `reason should name the signature, got ${forged.reason}`);
});

await checkAsync('one edited character in the payload kills it', async () => {
  const issued = await cookie.sealOwnerSession({ ...CLAIMS, remember: true }, { secret: SECRET });
  const [payload, signature] = issued.value.split('.');
  const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  decoded.role = 'auditor';
  const edited = Buffer.from(JSON.stringify(decoded)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const opened = await session.verifySession(`${edited}.${signature}`, SECRET);
  assertEqual(opened.valid, false, 'a payload edited in devtools must not verify against the old signature');
});

await checkAsync('a role outside the RBAC matrix is rejected on read', async () => {
  const issued = await cookie.sealOwnerSession({ ...CLAIMS, role: 'root', remember: true }, { secret: SECRET });
  const opened = await session.verifySession(issued.value, SECRET);
  assertEqual(opened.valid, false, 'verifySession, not createSession, is the enforcement point');
  assertEqual(opened.reason, 'malformed', 'and it says so');
});

// ---------------------------------------------------------------------------
// 3. time
// ---------------------------------------------------------------------------

await checkAsync('an expired token is refused, however well it is signed', async () => {
  const issued = await session.createSession({ ...CLAIMS, ttlSeconds: 1 }, SECRET);
  await new Promise((resolve) => setTimeout(resolve, 1_300));
  const opened = await session.verifySession(issued.token, SECRET);
  assertEqual(opened.valid, false, 'one second past the window is past it');
  assertEqual(opened.reason, 'expired', 'and says expired');
});

await checkAsync('a re-issued token cannot outlive the absolute ceiling', async () => {
  const issued = await session.createSession({ ...CLAIMS, ttlSeconds: 60 * 60 * 24 * 365 }, SECRET);
  assert(
    issued.claims.exp - issued.claims.iat <= session.SESSION_ABSOLUTE_SECONDS,
    'a year-long session was minted; the ceiling exists so a long `remember` cannot become permanent',
  );
});

// ---------------------------------------------------------------------------
// 4. what "keep me signed in" promises
// ---------------------------------------------------------------------------

check('remembered sessions get the long window, unremembered get the idle one', () => {
  assertEqual(cookie.sessionTtlSeconds(true), session.SESSION_MAX_AGE_SECONDS, 'remember = two weeks');
  assertEqual(cookie.sessionTtlSeconds(false), session.SESSION_IDLE_SECONDS, 'not remembered = the idle window');
  assert(session.SESSION_IDLE_SECONDS < session.SESSION_MAX_AGE_SECONDS, 'and the idle window is genuinely shorter');
});

await checkAsync('an unremembered cookie carries no expiry, so the browser ends it', async () => {
  const unremembered = await cookie.sealOwnerSession({ ...CLAIMS, remember: false }, { secret: SECRET });
  assertEqual(unremembered.maxAge, null, 'no maxAge means a browser-session cookie');
  const remembered = await cookie.sealOwnerSession({ ...CLAIMS, remember: true }, { secret: SECRET });
  assert(remembered.maxAge === session.SESSION_MAX_AGE_SECONDS, 'a remembered one does carry its lifetime');
});

check('the session cookie is out of reach of page script', () => {
  // The shape comes from the transport (lib/security/cookies.ts): a real
  // deployment, a framed preview, and plain-http local development.
  const deployment = { secure: true, sameSite: 'lax', partitioned: false };
  const preview = { secure: true, sameSite: 'none', partitioned: true };
  const local = { secure: false, sameSite: 'lax', partitioned: false };

  const options = cookie.ownerSessionCookie(deployment, 120);
  assertEqual(options.httpOnly, true, 'httpOnly');
  assertEqual(options.sameSite, 'lax', 'SameSite=Lax on a real deployment');
  assertEqual(options.secure, true, 'Secure on a real origin');
  assertEqual(options.path, '/', 'scoped to the whole app');
  assertEqual(options.partitioned, false, 'and not partitioned where nothing frames it');
  assertEqual(cookie.ownerSessionCookie(local, 120).secure, false, 'and not forced on plain-http local development');

  // Without this the browser refuses the session cookie inside the preview's
  // frame, so nobody can stay signed in there.
  const framed = cookie.ownerSessionCookie(preview, 120);
  assertEqual(framed.sameSite, 'none', 'SameSite=None in a framed preview');
  assertEqual(framed.secure, true, 'Secure in a framed preview');
  assertEqual(framed.partitioned, true, 'Partitioned in a framed preview');
  assertEqual(framed.httpOnly, true, 'still out of reach of page script when framed');

  assertEqual(cookie.clearedOwnerSession(deployment).maxAge, 0, 'the clearing shape expires immediately');
});

check('a display name is truncated to what a top bar can show', () => {
  assertEqual(session.actorLabel('kiran.malhotra@business.com').length <= 80, true, 'actorLabel caps at 80');
  assertEqual(session.actorLabel('   '), 'Owner', 'and never renders as nothing');
});

// ---------------------------------------------------------------------------
// 5. the gate
// ---------------------------------------------------------------------------

check('public things stay public to an anonymous request', () => {
  const anonymous = { sessionValid: false, providerCookiePresent: false, supabaseConfigured: false };
  for (const pathname of [
    '/',
    '/auth',
    '/onboarding',
    '/locales/hi.json',
    '/locales/ta.json',
    '/api/auth/session',
    '/api/auth/callback',
    '/api/health',
    '/api/report',
    '/security.txt',
    '/.well-known/security.txt',
  ]) {
    const verdict = gate.checkAuthAccess({ pathname, ...anonymous });
    assertEqual(verdict.allowed, true, `${pathname} must be reachable signed out`);
  }
});

check('every console route is closed to an anonymous request', () => {
  const consoleDir = join(root, 'app', '(console)');
  const routes = fs
    .readdirSync(consoleDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/${entry.name}`);
  assert(routes.length >= 20, `only ${routes.length} console routes found — the check would pass vacuously`);
  for (const pathname of routes) {
    const verdict = gate.checkAuthAccess({ pathname, sessionValid: false, providerCookiePresent: false, supabaseConfigured: false });
    assertEqual(verdict.allowed, false, `${pathname} was served to an anonymous request`);
    assert(
      verdict.redirectTo.startsWith('/auth'),
      `${pathname} must be sent to sign-in, not to ${verdict.redirectTo}`,
    );
  }
});

check('a refused deep link comes back with the path attached', () => {
  const verdict = gate.checkAuthAccess({
    pathname: '/audit',
    search: '?from=2026-10-01',
    sessionValid: false,
    supabaseConfigured: false,
  });
  assertEqual(verdict.allowed, false, 'refused');
  assertEqual(verdict.redirectTo, `/auth?next=${encodeURIComponent('/audit?from=2026-10-01')}`, 'and the deep link survives');
});

check('a verified session opens everything, including the console', () => {
  const verdict = gate.checkAuthAccess({ pathname: '/sales', sessionValid: true, supabaseConfigured: false });
  assertEqual(verdict.allowed, true, 'a good session is a signed-in request');
});

check('a provider cookie counts only when there is a provider', () => {
  const hosted = gate.checkAuthAccess({ pathname: '/sales', sessionValid: false, providerCookiePresent: true, supabaseConfigured: true });
  assertEqual(hosted.allowed, true, 'a hosted deployment lets the layout do the authoritative check');
  const local = gate.checkAuthAccess({ pathname: '/sales', sessionValid: false, providerCookiePresent: true, supabaseConfigured: false });
  assertEqual(local.allowed, false, 'and a local-first build does not treat a stray cookie as an identity');
});

check('only Supabase auth cookies are read as a provider session', () => {
  assertEqual(gate.isSupabaseAuthCookieName('sb-abcdefghijklmnopqrstuvwx-auth-token'), true, 'the chunk Supabase writes');
  assertEqual(gate.isSupabaseAuthCookieName('sb-abcdefghijklmnopqrstuvwx-auth-token.1'), true, 'and its continuation chunks');
  assertEqual(gate.isSupabaseAuthCookieName('sb-abcdefghijklmnopqrstuvwx-auth-token-counter'), false, 'not its counter');
  assertEqual(gate.isSupabaseAuthCookieName('dukaan.session'), false, 'never the app session');
  assertEqual(gate.isSupabaseAuthCookieName('sb-short'), false, 'and never anything else');
});

// ---------------------------------------------------------------------------
// 6. the `next` parameter
// ---------------------------------------------------------------------------

check('no open-redirect shape survives safeNext', () => {
  for (const candidate of [
    'https://evil.example/x',
    'http://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/auth?next=/audit',
    '/api/auth/session',
    '  ',
    'x'.repeat(400),
    '/audit\nSet-Cookie: a=b',
  ]) {
    assertEqual(gate.safeNext(candidate, '/onboarding'), '/onboarding', `${JSON.stringify(candidate.slice(0, 30))} must fall back`);
  }
  assertEqual(gate.safeNext('/audit?locked=1', '/onboarding'), '/audit?locked=1', 'a real same-origin path passes');
  assertEqual(gate.safeNext('/onboarding', '/onboarding'), '/onboarding', 'including to onboarding');
  assertEqual(gate.signInDestination(undefined), '/onboarding', 'no intent means setup');
  assertEqual(gate.signInDestination('https://evil.example'), '/onboarding', 'and a hostile intent means setup anyway');
});

// ---------------------------------------------------------------------------
// 7. where the door goes, and what it costs to walk through
// ---------------------------------------------------------------------------

check('a requested destination outranks both records', () => {
  const doors = { requested: '/audit?locked=1', accountSetupComplete: false, deviceSetupComplete: false };
  assertEqual(gate.welcomeDestination(doors), '/audit?locked=1', 'a bookmark is an instruction, not a suggestion');
  assertEqual(gate.signInNextParam(doors), '/audit?locked=1', 'and the endpoint is told the same thing');
});

check('either record saying "finished" sends the door to the console', () => {
  const none = { requested: null, accountSetupComplete: false, deviceSetupComplete: false };
  assertEqual(gate.welcomeDestination({ ...none, accountSetupComplete: true }), gate.CONSOLE_HOME, 'the account row is the only answer a second phone has');
  assertEqual(gate.welcomeDestination({ ...none, deviceSetupComplete: true }), gate.CONSOLE_HOME, 'and the vault is the only answer a local-first build has');
  assertEqual(gate.welcomeDestination(none), gate.DEFAULT_NEXT, 'an owner who has not finished still gets setup');
  assertEqual(gate.signInFallback(true), gate.CONSOLE_HOME, 'the endpoint applies the same rule after it has verified credentials');
});

check('the form stays quiet when only the server can answer', () => {
  assertEqual(
    gate.signInNextParam({ requested: null, accountSetupComplete: true, deviceSetupComplete: false }),
    undefined,
    'a browser guess would overwrite the answer the endpoint reads from the account row',
  );
  assertEqual(
    gate.signInNextParam({ requested: null, accountSetupComplete: false, deviceSetupComplete: true }),
    gate.CONSOLE_HOME,
    'a vault that says finished is worth sending',
  );
  assertEqual(
    gate.signInNextParam({ requested: null, accountSetupComplete: false, deviceSetupComplete: false }),
    undefined,
    'and neither knowing means the endpoint decides',
  );
});


check('hosted sign-in ignores a completed profile cached on this device', () => {
  const hosted = { requested: null, accountSetupComplete: false, deviceSetupComplete: true, accountBacked: true };
  assertEqual(gate.welcomeDestination(hosted), gate.DEFAULT_NEXT, 'an incomplete account must see setup even on a previously used device');
  assertEqual(gate.signInNextParam(hosted), undefined, 'cached completion must not manufacture a next=/home override');
  assertEqual(gate.welcomeDestination({ ...hosted, accountSetupComplete: true }), gate.CONSOLE_HOME, 'a complete account still opens the console');
  assertEqual(gate.signInNextParam({ ...hosted, accountSetupComplete: true }), undefined, 'the endpoint rechecks the newly authenticated account');
});

check('local-first completion and explicit destinations remain available', () => {
  const local = { requested: null, accountSetupComplete: false, deviceSetupComplete: true, accountBacked: false };
  assertEqual(gate.welcomeDestination(local), gate.CONSOLE_HOME, 'local builds can still use their device profile');
  assertEqual(gate.signInNextParam(local), gate.CONSOLE_HOME, 'local sign-in keeps its device fallback');
  const explicit = { ...local, accountBacked: true, requested: '/onboarding' };
  assertEqual(gate.welcomeDestination(explicit), '/onboarding', 'an explicit setup request is preserved');
  assertEqual(gate.signInNextParam(explicit), '/onboarding', 'the endpoint receives that explicit request');
});

check('the auth form identifies hosted accounts to the shared destination rule', () => {
  const form = read('components', 'auth', 'auth-form.tsx');
  assert(/accountBacked: supabaseReady/.test(form), 'the provider configuration must reach both destination helpers');
});

check('a door into the console is earned, a door into setup is not', () => {
  assertEqual(gate.doorNeedsConfirmation(gate.CONSOLE_HOME), true, 'behind it are the takings, the khata and the customer list');
  assertEqual(gate.doorNeedsConfirmation('/audit?locked=1'), true, 'a deep link is still a console route');
  assertEqual(gate.doorNeedsConfirmation(gate.DEFAULT_NEXT), false, 'setup holds nothing worth guarding yet');
});

check('the sign-in screen asks before it opens the console', () => {
  const form = read('components', 'auth', 'auth-form.tsx');
  assert(/doorNeedsConfirmation\(/.test(form), 'the gate comes from the shared rule, not from a literal in the markup');
  assert(/confirmConsoleAccess\(/.test(form), 'a hosted door confirms against the provider, through this origin');
  assert(/verifyPin\(/.test(form), 'and a local-first door against the owner password this device owns');
  assert(/markUnlocked\(/.test(form), 'asked once: the console must not demand the same passcode a second time');
  assert(/readLockRecord\(\)/.test(form), 'read at click time — a value that only arrives with an effect is one a fast tap can beat');
});

check('the confirmation sends a password and nothing that identifies anybody', () => {
  const client = read('lib', 'auth', 'client.ts');
  assert(/action: 'confirm'/.test(client), 'the browser calls one action, on this origin');
  assert(!/action: 'confirm'[\s\S]{0,140}email/.test(client), 'no address travels with it: the endpoint reads the session it arrived with');
  const source = read('app', 'api', 'auth', 'session', 'route.ts');
  assert(/action !== 'confirm'/.test(source), 'and the endpoint answers it');
  assert(/getSessionUser\(\)/.test(source), 'the address is resolved server-side');
  assert(/signInWithPassword\(\{ email: user\.email, password \}\)/.test(source), 'then checked by the provider, not by this app');
  assert(/code: 'confirm-session-ended'/.test(source), 'a session with nothing behind it says so instead of pretending to verify');
  assert(/code: 'confirm-unavailable'/.test(source), 'and a build with no provider says that too, rather than inventing a hash to compare');
});

check('no landing walks a finished owner back through setup', () => {
  const page = read('app', 'auth', 'page.tsx');
  assert(!/safeNext\(params\.next, '\/onboarding'\)/.test(page), "the door's default is decided from the account, not hardcoded");
  assert(/storedSetupComplete\(\)/.test(page), 'the page asks the stored profile before the first paint');
  const callback = read('app', 'api', 'auth', 'callback', 'route.ts');
  assert(/signInFallback\(await storedSetupComplete\(/.test(callback), 'a recovery or confirmation link lands where the account says the owner belongs');
  assert(!/get\('next'\), '\/onboarding'\)/.test(callback), 'and the hardcoded setup default is gone from the callback too');
  const setup = read('app', 'onboarding', 'page.tsx');
  assert(/snapshotFromProfile\(profile\)\.setupComplete/.test(setup), 'one definition of "finished", the same one the endpoint derives');
  assert(/showSummary/.test(setup), 'a finished owner is shown what is on file before being shown a form to fill it in with');
});

// ---------------------------------------------------------------------------
// 8. where a provider link comes back to
// ---------------------------------------------------------------------------

check('the callback url is built on the canonical origin, never a placeholder', () => {
  const saved = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://shop.example';
  assertEqual(origin.appOrigin(), 'https://shop.example', 'the configured origin wins');
  assertEqual(origin.callbackUrl('/onboarding'), 'https://shop.example/api/auth/callback?next=%2Fonboarding', 'and the code lands on the callback');
  process.env.NEXT_PUBLIC_APP_URL = 'https://your-project.supabase.co';
  assertEqual(origin.appOrigin({ url: 'https://preview.example/http://x:3000/' }), 'https://preview.example', 'a placeholder config falls back to the request origin');
  if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = saved;
});

// ---------------------------------------------------------------------------
// 9. what the routes around it must keep doing
// ---------------------------------------------------------------------------

for (const name of ['session', 'reset', 'callback', 'password']) {
  const file = join(root, 'app', 'api', 'auth', name, 'route.ts');
  const where = `app/api/auth/${name}/route.ts`;
  check(`${where} exists`, () => assert(fs.existsSync(file), 'the endpoint vanished — sign-in, recovery, or the callback is off the air'));
  if (fs.existsSync(file)) {
    check(`${where} never logs`, () => {
      const source = fs.readFileSync(file, 'utf8');
      assert(
        !/console\.(log|info|warn|error|debug)\(/.test(source),
        'a console call in an auth route is one refactor away from writing a password into stdout',
      );
    });
    check(`${where} bounds any body it parses`, () => {
      const source = fs.readFileSync(file, 'utf8');
      const parsesBody = /request\.(json|text|formData|arrayBuffer)\(/.test(source);
      if (!parsesBody) {
        // A GET with no body has nothing to bound; saying so is better than a
        // check that passes for the wrong reason.
        return;
      }
      assert(/MAX_BODY_BYTES/.test(source), 'an anonymously reachable endpoint that parses an unbounded body is a denial-of-service lever');
    });
  }
}

check('the sign-in route mints a session in both modes', () => {
  const source = read('app', 'api', 'auth', 'session', 'route.ts');
  assert(/localOwnerSession\(/.test(source), 'local-first mode must still create a session, or "Keep me signed in" is a decoration');
  assert(/sealOwnerSession\(/.test(source), 'and hosted mode must mint one from the verified provider user');
  assert(/ownerSessionCookie\(/.test(source), 'set with the hardened attributes');
});

check('the recovery endpoint cannot tell anybody whether an account exists', () => {
  const source = read('app', 'api', 'auth', 'reset', 'route.ts');
  assert(!/const \{ error \} = await client\.auth\.resetPasswordForEmail/.test(source), 'the provider answer must be discarded, not returned');
  assert(/resetPasswordForEmail/.test(source), 'and the mail still has to be sent');
  assert(/clientFingerprint\(/.test(source), 'per-client, so one address cannot be mailed repeatedly');
});

check('the callback redeems the code and never trusts `next` blindly', () => {
  const source = read('app', 'api', 'auth', 'callback', 'route.ts');
  assert(/exchangeCodeForSession\(/.test(source), 'the single-use code is spent on the server');
  assert(/safeNext\(/.test(source), 'the destination goes through the same validator the gate uses');
  assert(!/console\./.test(source), 'nothing is logged from a URL query');
});

check('the edge imports only the pure halves of the auth layer', () => {
  const proxy = read('proxy.ts');
  assert(!/from '@\/lib\/auth'/.test(proxy), "`@/lib/auth` pulls in next/headers through the identity module — it cannot live in the middleware bundle");
  assert(/from '@\/lib\/auth\/routes'/.test(proxy), 'the gate itself is what the edge needs');
  assert(/from '@\/lib\/auth\/cookie'/.test(proxy), 'and the session opener');
});

check('the gate runs before the portal and plan policies', () => {
  const proxy = read('proxy.ts');
  const at = (needle) => proxy.indexOf(needle);
  assert(at('Session gate') > -1, 'the step is missing from proxy.ts');
  assert(at('Session gate') < at('Portal policy'), 'an anonymous request must not be told which module this business runs');
  assert(at('Portal policy') < at('Plan policy'), 'the rest of the ordering is unchanged');
});

check('the unguarded Supabase clients stay deleted', () => {
  assert(!exists('lib', 'supabase', 'user.ts'), 'lib/supabase/user.ts built a client from placeholder credentials and hung every page on it');
  assert(!exists('lib', 'supabase', 'server.ts'), 'lib/supabase/server.ts was the same bug with a different name; lib/security/guard.ts is the guarded path');
});

check('sign-in has a rate-limit bucket and it is tight', () => {
  const table = JSON.parse(read('lib', 'security', 'policy.json')).rateLimits;
  assert(table.auth && table.auth.limit > 0 && table.auth.limit <= 20, `policy.json rateLimits.auth = ${JSON.stringify(table.auth)}`);
  assert(read('lib', 'security', 'rate-limit.ts').includes("'/api/auth'"), 'ruleForPath must route /api/auth into that bucket');
});

check('the demo path is still labelled as a demo', () => {
  const form = read('components', 'auth', 'auth-form.tsx');
  assert(/Demo mode — Supabase credentials are not set/.test(form), 'a sign-in screen that looks real when it is not teaches an owner to trust the wrong thing');
  const layout = read('app', 'auth', 'page.tsx');
  assert(/isSupabaseConfigured\(\)/.test(layout), 'and the label has to come from the same check the server uses');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
