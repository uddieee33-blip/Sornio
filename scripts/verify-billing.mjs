/**
 * Verify the paid product — the lifecycle, the locks, and the money.
 *
 * A paywall is a security control, and an unverified security control is a
 * story. So this script compiles the pure plan modules with the project's own
 * TypeScript and asserts the things a business would be furious to discover we
 * got wrong:
 *
 *   • a lapsed plan **never** locks a shop out of its own records;
 *   • a plan never grants a module the catalogue does not contain;
 *   • expiry is computed from dates, so a rolled-back clock or a stale cookie
 *     cannot extend anything;
 *   • a tampered plan cookie or activation code is worth absolutely nothing;
 *   • the free allowance counts real UPI collections and never counts cash;
 *   • renewals stack, upgrades start today, and a price lock is really 12 months.
 *
 *   npm run verify:billing
 *
 * No network, no mocks, no test framework: it runs the same functions the edge
 * middleware and the console run.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-billing-'));

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
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

console.log('Compiling the plans layer…');

const tsconfig = join(outDir, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'es2020',
        // The app targets the browser and the edge; the verifier runs in Node,
        // so it compiles the same sources with the DOM + Node globals available.
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
      files: [join(root, 'lib/plans/index.ts')],
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

/**
 * TypeScript rewrites `paths` for type-checking but not for emit, so the
 * compiled CommonJS still asks for `@/lib/…`. Resolve that alias into the temp
 * output directory — the same mapping `tsconfig.json` declares, applied once,
 * loudly, instead of sprinkling relative paths through the source.
 */
const require = createRequire(import.meta.url);
// (named `nodeModule` rather than `module`: the Next.js lint rule reserves
// that identifier, and a verifier that fails lint is a verifier nobody runs)
const nodeModule = require('node:module');
const resolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function aliased(request, ...rest) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    const mapped = request.slice(2).replace(/^lib\//, '');
    return resolveFilename.call(this, join(outDir, mapped), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

const plans = require(join(outDir, 'plans/index.js'));
const lifecycle = require(join(outDir, 'plans/lifecycle.js'));
const routes = require(join(outDir, 'plans/routes.js'));
const usage = require(join(outDir, 'plans/usage.js'));
const cookie = require(join(outDir, 'plans/cookie.js'));
const activation = require(join(outDir, 'plans/activation.js'));
const portalCatalogue = require(join(outDir, 'portals/catalogue.js'));

const DAY = 86_400;
const NOW = Date.UTC(2026, 9, 6, 9, 0, 0); // 6 Oct 2026, 09:00 UTC
const NOW_SECONDS = Math.floor(NOW / 1000);
const ALL_MODULE_KEYS = portalCatalogue.ALL_MODULES;

// ---------------------------------------------------------------------------
// 1. The catalogue is coherent
// ---------------------------------------------------------------------------

check('every plan sells something, and only the free plan is free', () => {
  for (const plan of plans.PLAN_CATALOGUE) {
    assert(plan.prices.length > 0, `${plan.id} has no price`);
    const cheapest = Math.min(...plan.prices.map((price) => price.amount));
    // Two plans are free by design: the free plan itself, and the time-boxed
    // trial. Every other plan must cost money, or the product has no revenue.
    if (plan.id === 'starter' || plan.id === 'trial') assertEqual(cheapest, 0, `${plan.id} is free by design`);
    else assert(cheapest > 0, `${plan.id} must cost money`);
    for (const price of plan.prices) {
      assert(Number.isInteger(price.amount), `${plan.id}: prices are whole rupees`);
      if (price.interval === 'forever') assertEqual(price.amount, 0, 'only the free plan is priced "forever"');
    }
  }
});

check('every plan only ever names modules the catalogue actually has', () => {
  for (const plan of plans.PLAN_CATALOGUE) {
    if (plan.modules === 'all') continue;
    for (const moduleKey of plan.modules) {
      assert(ALL_MODULE_KEYS.includes(moduleKey), `${plan.id} names an unknown module: ${moduleKey}`);
    }
  }
});

check('the free plan keeps the shop running and withholds only the automations', () => {
  const starter = plans.planById('starter');
  assert(starter.modules !== 'all', 'starter must be an explicit list');
  for (const moduleKey of ['sales', 'billing', 'payments', 'catalog', 'inventory', 'reports', 'transactions']) {
    assert(starter.modules.includes(moduleKey), `the free plan must keep ${moduleKey}`);
  }
  for (const moduleKey of plans.GROWTH_MODULES) {
    assert(!starter.modules.includes(moduleKey), `${moduleKey} is a paid automation and must not be free`);
  }
  assertEqual(starter.collectionsPerMonth, 25, 'the free collection allowance is 25');
});

check('the always-open modules can never be taken away by a plan', () => {
  const starter = plans.planById('starter');
  for (const moduleKey of plans.ALWAYS_OPEN_MODULES) {
    assert(ALL_MODULE_KEYS.includes(moduleKey), `always-open module not in the catalogue: ${moduleKey}`);
    assert(starter.modules.includes(moduleKey), `${moduleKey} must be in the free plan — a lapsed business must never be locked out`);
  }
  assert(plans.ALWAYS_OPEN_MODULES.includes('subscription'), 'the page that fixes the plan must always be reachable');
  assert(plans.ALWAYS_OPEN_MODULES.includes('audit'), 'the audit chain must always be reachable');
});

check('paying for a longer period really is cheaper per month', () => {
  for (const plan of plans.paidPlans()) {
    const monthly = plan.prices.find((price) => price.interval === 'month');
    for (const price of plan.prices) {
      if (price.interval === 'month' || !monthly) continue;
      const equivalent = Math.round(price.amount / price.months);
      assert(equivalent <= monthly.amount, `${plan.id} ${price.interval} is not cheaper per month`);
    }
  }
});

check('one plan is marked most-chosen, and it is a paid one', () => {
  const popular = plans.PLAN_CATALOGUE.filter((plan) => plan.popular);
  assertEqual(popular.length, 1, 'exactly one plan may be marked popular');
  assert(popular[0].prices.some((price) => price.amount > 0), 'the recommended plan must not be the free one');
});

check('what the landing page promises and what the console sells are the same objects', () => {
  // Both surfaces render `PLAN_CATALOGUE`; this asserts there is nothing else to
  // drift from — a second hard-coded price list would fail here.
  const growth = plans.planById('growth');
  assertEqual(plans.headlinePrice(growth).amount, 4990, 'Growth yearly price');
  assertEqual(plans.monthlyEquivalent(growth, 0), 499, 'Growth monthly equivalent');
  assert(plans.savingsOn(growth, 'year') > 0, 'the yearly Growth price must save money');
});

// ---------------------------------------------------------------------------
// 2. The lifecycle, at its boundaries
// ---------------------------------------------------------------------------

check('a business that never chose anything gets the free plan, not a paywall', () => {
  const entitlement = lifecycle.resolveEntitlement(null, NOW);
  assertEqual(entitlement.state, 'free', 'new console state');
  assertEqual(entitlement.planId, 'starter', 'new console plan');
  assertEqual(entitlement.collectionsPerMonth, 25, 'new console allowance');
  assert(routes.checkPlanAccess(entitlement, '/sales').allowed, 'a new console can record sales immediately');
});

check('a running trial has everything, and reports its days left', () => {
  const record = { planId: 'trial', since: NOW_SECONDS, renewsAt: 0, trialEndsAt: NOW_SECONDS + 2 * DAY + 60, activatedBy: 'self', trialUsedAt: NOW_SECONDS };
  const entitlement = lifecycle.resolveEntitlement(record, NOW);
  assertEqual(entitlement.state, 'trialing', 'state');
  assertEqual(entitlement.daysLeft, 3, 'a trial ending in 2 days and a minute has 3 days on the calendar');
  assertEqual(entitlement.collectionsPerMonth, null, 'a trial has no collection limit');
  assert(routes.checkPlanAccess(entitlement, '/memberships').allowed, 'a trial opens the paid automations');
});

check('full-trial portal access follows the signed subscription, with an independent plan gate', () => {
  const proxy = readFileSync(join(root, 'proxy.ts'), 'utf8');
  const portal = readFileSync(join(root, 'lib/portals/portal-provider.tsx'), 'utf8');
  const shell = readFileSync(join(root, 'components/layout/console-shell.tsx'), 'utf8');
  const gate = readFileSync(join(root, 'components/layout/portal-gate.tsx'), 'utf8');
  const planNotice = readFileSync(join(root, 'components/billing/subscription-view.tsx'), 'utf8');
  assert(/record\.businessId !== account\?\.tenantId/.test(proxy), 'the signed plan must stay bound to the authenticated tenant');
  assert(/masterRevealActive\(master\) \|\| planEntitlement\.state === 'trialing'/.test(proxy), 'a running trial must reveal modules on the server');
  assert(/checkPlanAccess\(planEntitlement, pathname\)/.test(proxy), 'independent plan enforcement must remain on the server');
  assert(/entitlement\.state === 'trialing'/.test(portal), 'a running trial must reveal modules in the client navigation');
  assert(shell.indexOf('<PlanProvider>') < shell.indexOf('<PortalProvider'), 'the portal must receive the verified plan from its provider');
  assert(/!revealAll && Boolean\(needsChoice/.test(gate), 'a trial must not be blocked by the old business type gate');
  assert(/!entitlementHasModule\(entitlement, requestedLockedModule\)/.test(planNotice), 'a stale locked link must not show a paywall for an unlocked module');
});

check('a trial that has run out drops to the free plan and says why', () => {
  const record = { planId: 'trial', since: NOW_SECONDS - 5 * DAY, renewsAt: 0, trialEndsAt: NOW_SECONDS - 1, activatedBy: 'self', trialUsedAt: NOW_SECONDS - 5 * DAY };
  const entitlement = lifecycle.resolveEntitlement(record, NOW);
  assertEqual(entitlement.state, 'expired', 'state');
  assertEqual(entitlement.lapsedFrom, 'trial', 'the console must be able to say "your trial ended"');
  assertEqual(entitlement.trialUsed, true, 'a trial is once');
  assertEqual(entitlement.collectionsPerMonth, 25, 'it falls back to the free allowance');
  assert(routes.checkPlanAccess(entitlement, '/sales').allowed, 'the shop still bills after a trial');
  assert(!routes.checkPlanAccess(entitlement, '/memberships').allowed, 'the automations pause after a trial');
  assert(routes.checkPlanAccess(entitlement, '/subscription').allowed, 'and the fix is always reachable');
});

check('a paid period ends into grace, then into the free plan — never into a locked door', () => {
  const base = { planId: 'growth', since: NOW_SECONDS - 31 * DAY, activatedBy: 'activation-code', reference: 'UPI-1' };

  const active = lifecycle.resolveEntitlement({ ...base, renewsAt: NOW_SECONDS + 3 * DAY, trialEndsAt: 0 }, NOW);
  assertEqual(active.state, 'active', 'inside the period');
  assertEqual(active.daysLeft, 3, 'days left in the period');

  const grace = lifecycle.resolveEntitlement({ ...base, renewsAt: NOW_SECONDS - DAY, trialEndsAt: 0 }, NOW);
  assertEqual(grace.state, 'grace', 'one day past the period is still grace');
  assertEqual(grace.fullAccess, true, 'grace keeps every module — a payment must never be late enough to hurt a shop');
  assertEqual(grace.graceEndsAt, NOW_SECONDS - DAY + 7 * DAY, 'grace is seven days');

  const expired = lifecycle.resolveEntitlement({ ...base, renewsAt: NOW_SECONDS - 8 * DAY, trialEndsAt: 0 }, NOW);
  assertEqual(expired.state, 'expired', 'past grace the period is over');
  assertEqual(expired.lapsedFrom, 'growth', 'the console can name the plan that ended');
  assertEqual(expired.collectionsPerMonth, 25, 'and it is back on the free allowance');
  for (const moduleKey of ['cockpit', 'dashboard', 'sales', 'payments', 'audit', 'security', 'settings', 'subscription', 'reports']) {
    assert(routes.checkPlanAccess(expired, portalCatalogue.entryForModule(moduleKey).href).allowed, `${moduleKey} must survive expiry`);
  }
  for (const moduleKey of plans.GROWTH_MODULES) {
    assert(!routes.checkPlanAccess(expired, portalCatalogue.entryForModule(moduleKey).href).allowed, `${moduleKey} must pause after expiry`);
  }
});

check('expiry is derived from dates alone — a stale record cannot extend itself', () => {
  const stale = { planId: 'scale', since: NOW_SECONDS - 400 * DAY, renewsAt: NOW_SECONDS - 300 * DAY, trialEndsAt: 0, activatedBy: 'activation-code' };
  assertEqual(lifecycle.resolveEntitlement(stale, NOW).state, 'expired', 'an ancient record stays expired');
  const sameRecordLater = lifecycle.resolveEntitlement(stale, NOW + 1000 * DAY);
  assertEqual(sameRecordLater.state, 'expired', 'and it never recovers by waiting');
  // And the reverse: a record that is not due yet is active whatever the app thinks.
  const future = { planId: 'growth', since: NOW_SECONDS, renewsAt: NOW_SECONDS + 365 * DAY, trialEndsAt: 0, activatedBy: 'activation-code' };
  assertEqual(lifecycle.resolveEntitlement(future, NOW).state, 'active', 'a paid year is active');
});

// ---------------------------------------------------------------------------
// 3. The edge policy
// ---------------------------------------------------------------------------

check('a locked module redirects to the page that unlocks it, and to nothing else', () => {
  const free = lifecycle.resolveEntitlement(null, NOW);
  const verdict = routes.checkPlanAccess(free, '/memberships');
  assertEqual(verdict.allowed, false, 'memberships is paid');
  assertEqual(verdict.redirectTo, '/subscription?locked=memberships', 'the redirect names the module');
  assertEqual(routes.lockedModuleFromParam('memberships'), 'memberships', 'and the flag round-trips');
  assertEqual(routes.lockedModuleFromParam('../../etc/passwd'), null, 'a bogus flag is ignored');
  assertEqual(routes.lockedModuleFromParam(null), null, 'an absent flag is fine');
});

check('the plan policy never touches routes outside the console', () => {
  const free = lifecycle.resolveEntitlement(null, NOW);
  for (const path of ['/', '/auth', '/onboarding', '/api/subscription', '/api/portal', '/anything-else']) {
    assert(routes.checkPlanAccess(free, path).allowed, `${path} must never be gated by a plan`);
  }
});

check('sub-paths of a locked module are locked too', () => {
  const free = lifecycle.resolveEntitlement(null, NOW);
  assert(!routes.checkPlanAccess(free, '/memberships/anything').allowed, 'a deep link is not a loophole');
  assert(!routes.checkPlanAccess(free, '/check-ins').allowed, 'check-ins are a paid automation');
});

check('the console is told which modules are paused, in its own trade words', () => {
  const free = lifecycle.resolveEntitlement(null, NOW);
  const gymLocked = routes.lockedModulesFor(free, 'gym').map((item) => item.module);
  assert(gymLocked.includes('memberships'), 'a gym is told its plans are paused');
  assert(!gymLocked.includes('inventory'), 'a gym is not told about a module it never had');
  const kiranaLocked = routes.lockedModulesFor(free, 'kirana').map((item) => item.module);
  assert(!kiranaLocked.includes('memberships'), 'a kirana does not miss memberships');
  assertEqual(routes.lockedModulesFor(lifecycle.resolveEntitlement({ planId: 'growth', since: NOW_SECONDS, renewsAt: NOW_SECONDS + DAY, trialEndsAt: 0, activatedBy: 'activation-code' }, NOW), 'gym').length, 0, 'a paid console sees nothing paused');
});

// ---------------------------------------------------------------------------
// 4. The allowance, counted from the ledger
// ---------------------------------------------------------------------------

const tx = (over) => ({
  id: `t${Math.random().toString(16).slice(2)}`,
  type: 'sale',
  description: 'sale',
  amount: 100,
  direction: 'in',
  account: 'upi',
  paymentMethod: 'UPI',
  date: '2026-10-06',
  ...over,
});

check('the free allowance counts UPI money in — and nothing else', () => {
  const transactions = [
    tx({ account: 'revenue', paymentMethod: 'UPI' }), // the accrual half of a UPI sale
    tx({ account: 'upi', paymentMethod: 'UPI' }), // the money half — this is the one that counts
    tx({ account: 'cash', paymentMethod: 'Cash' }), // cash is never metered
    tx({ account: 'card', paymentMethod: 'Card' }), // nor is card
    tx({ account: 'upi', paymentMethod: 'UPI', direction: 'out', type: 'expense' }), // money out is not a collection
    tx({ account: 'upi', paymentMethod: 'UPI', date: '2026-09-30' }), // last month does not count
    tx({ account: 'bank', paymentMethod: 'Bank Transfer' }), // bank transfer is a collection
  ];
  const counted = usage.countCollections(transactions, { now: new Date(NOW), timeZone: 'Asia/Kolkata' });
  assertEqual(counted, 2, 'one UPI collection and one bank transfer');
  assertEqual(usage.monthKey(new Date(Date.UTC(2026, 9, 31, 20, 0, 0)), 'Asia/Kolkata'), '2026-11', 'the month boundary follows the business timezone');
  assertEqual(usage.monthKey(new Date(Date.UTC(2026, 9, 31, 20, 0, 0)), 'UTC'), '2026-10', 'and it follows whatever timezone the business is in');
});

check('the gate refuses the metered path at the allowance, and nothing else', () => {
  const free = lifecycle.resolveEntitlement(null, NOW);
  assert(usage.collectionGate(free, 24, 'UPI').allowed, 'the 25th collection is allowed');
  const refused = usage.collectionGate(free, 25, 'UPI');
  assertEqual(refused.allowed, false, 'the 26th is refused');
  assert(refused.error.includes('25'), 'the refusal names the limit');
  assert(refused.error.includes('Cash'), 'the refusal says cash still works');
  assertEqual(refused.upgradeHref, '/subscription', 'and points at the upgrade');
  assert(usage.collectionGate(free, 1000, 'Cash').allowed, 'cash is never refused');
  assert(usage.collectionGate(free, 1000, 'Card').allowed, 'card is never refused');
  const paid = lifecycle.resolveEntitlement({ planId: 'growth', since: NOW_SECONDS, renewsAt: NOW_SECONDS + 30 * DAY, trialEndsAt: 0, activatedBy: 'activation-code' }, NOW);
  assert(usage.collectionGate(paid, 100000, 'UPI').allowed, 'a paid plan has no ceiling');
  assertEqual(usage.summarizeUsage([tx({}), tx({})], paid, { now: new Date(NOW), timeZone: 'Asia/Kolkata' }).allowance, null, 'and reports no allowance');
});

// ---------------------------------------------------------------------------
// 5. The cookie and the activation code — both are untrusted input
// ---------------------------------------------------------------------------

await checkAsync('a plan cookie round-trips, and a tampered one is worth nothing', async () => {
  const record = { planId: 'growth', since: NOW_SECONDS, renewsAt: NOW_SECONDS + 30 * DAY, trialEndsAt: 0, activatedBy: 'activation-code', reference: 'UPI-42', priceLockedUntil: NOW_SECONDS + 365 * DAY };
  const token = await cookie.sealPlanRecord(record, 'test-secret-that-is-long-enough-to-sign');
  const opened = await cookie.openPlanRecord(token, 'test-secret-that-is-long-enough-to-sign');
  assertEqual(opened.planId, 'growth', 'plan survives the round trip');
  assertEqual(opened.renewsAt, record.renewsAt, 'dates survive the round trip');
  assertEqual(opened.reference, 'UPI-42', 'the payment reference survives');

  const [payload, signature] = token.split('.');
  const flipped = `${payload.slice(0, -2)}${payload.slice(-2) === 'AA' ? 'BB' : 'AA'}.${signature}`;
  assertEqual(await cookie.openPlanRecord(flipped, 'test-secret-that-is-long-enough-to-sign'), null, 'an edited payload fails the signature');
  assertEqual(await cookie.openPlanRecord(`${payload}.${signature}x`, 'test-secret-that-is-long-enough-to-sign'), null, 'an edited signature fails');
  assertEqual(await cookie.openPlanRecord(token, 'some-other-deployment-secret-32-chars'), null, 'another deployment cannot read our plans');
  assertEqual(await cookie.openPlanRecord(payload, 'test-secret-that-is-long-enough-to-sign'), null, 'an unsigned payload is refused');
  assertEqual(await cookie.openPlanRecord('', 'test-secret-that-is-long-enough-to-sign'), null, 'an empty cookie is refused');
  assertEqual(await cookie.openPlanRecord(`not-base64!.${signature}`, 'test-secret-that-is-long-enough-to-sign'), null, 'garbage is refused without throwing');
});

await checkAsync('a forged plan record still cannot unlock a module', async () => {
  // Even a perfectly signed record is only ever resolved through the lifecycle:
  // the free plan's own "growth" claim is refused by the route policy rules.
  const free = lifecycle.resolveEntitlement(null, NOW);
  assert(!routes.checkPlanAccess(free, '/memberships').allowed, 'no record, no automations');
  // And a record naming a plan that does not exist falls back to the free plan.
  const nonsense = lifecycle.resolveEntitlement({ planId: 'enterprise-unlimited', since: 0, renewsAt: NOW_SECONDS + 10 ** 6, trialEndsAt: 0, activatedBy: 'self' }, NOW);
  assertEqual(nonsense.planId, 'starter', 'an unknown plan id resolves to the free plan');
  assert(!routes.checkPlanAccess(nonsense, '/memberships').allowed, 'and unlocks nothing');
});

await checkAsync('activation codes are signed, single-purpose, and expire', async () => {
  const secret = 'test-activation-secret-with-32-plus-characters';
  const code = await activation.mintActivationCode({ planId: 'growth', months: 3, reference: 'UPI-9001' }, secret, NOW);

  const verdict = await activation.verifyActivationCode(code, secret, NOW);
  assertEqual(verdict.valid, true, 'a real code verifies');
  assertEqual(verdict.planId, 'growth', 'and carries the plan that was paid for');
  assertEqual(verdict.months, 3, 'and the months that were paid for');
  assertEqual(verdict.reference, 'UPI-9001', 'and the payment it came from');

  assertEqual((await activation.verifyActivationCode(code, secret, NOW + 31 * DAY * 1000)).reason, 'expired', 'an unused code expires');
  assertEqual((await activation.verifyActivationCode(code, 'a-different-activation-secret-32-chars')).reason, 'bad-signature', 'another deployment cannot redeem it');
  assertEqual((await activation.verifyActivationCode(`${code}x`, secret, NOW)).valid, false, 'a one-character edit fails');
  assertEqual((await activation.verifyActivationCode('', secret, NOW)).valid, false, 'an empty code fails');
  assertEqual((await activation.verifyActivationCode(code, 'short', NOW)).reason, 'not-configured', 'activation is off, never open, without a real secret');
  assertEqual((await activation.verifyActivationCode(code, '', NOW)).reason, 'not-configured', 'and says so rather than guessing');

  // A trial can never be bought — even if somebody signs one themselves.
  const forgedTrialPayload = Buffer.from(JSON.stringify({ p: 'trial', m: 12, r: 'X', i: NOW_SECONDS, e: NOW_SECONDS + 3600 })).toString('base64url');
  const crypto = require('node:crypto');
  const forgedSignature = crypto.createHmac('sha256', secret).update(forgedTrialPayload).digest('base64url');
  assertEqual((await activation.verifyActivationCode(`${forgedTrialPayload}.${forgedSignature}`, secret, NOW)).valid, false, 'a signed trial payload is still refused');

  const nonsenseMonths = Buffer.from(JSON.stringify({ p: 'growth', m: 0, r: 'X', i: NOW_SECONDS, e: NOW_SECONDS + 3600 })).toString('base64url');
  const nonsenseSignature = crypto.createHmac('sha256', secret).update(nonsenseMonths).digest('base64url');
  assertEqual((await activation.verifyActivationCode(`${nonsenseMonths}.${nonsenseSignature}`, secret, NOW)).valid, false, 'zero months is not a plan');
});

check('a renewal stacks, an upgrade starts today, and the price lock is real', () => {
  const active = { planId: 'growth', since: NOW_SECONDS - 10 * DAY, renewsAt: NOW_SECONDS + 20 * DAY, trialEndsAt: 0, activatedBy: 'activation-code', trialUsedAt: NOW_SECONDS - 40 * DAY };
  const renewed = activation.recordFromActivation(active, 'growth', 1, 'UPI-2', NOW);
  assertEqual(renewed.renewsAt, NOW_SECONDS + 20 * DAY + activation.addMonths(active.renewsAt, 1) - active.renewsAt, 'a renewal adds to what is left');
  assert(renewed.renewsAt > active.renewsAt, 'paying early never loses days');

  const upgraded = activation.recordFromActivation(active, 'scale', 3, 'UPI-3', NOW);
  assertEqual(upgraded.renewsAt, activation.addMonths(NOW_SECONDS, 3), 'an upgrade starts its own period today');
  assertEqual(upgraded.trialUsedAt, active.trialUsedAt, 'and never resurrects the free trial');

  assert(upgraded.priceLockedUntil >= activation.addMonths(NOW_SECONDS, 12), 'the price is locked for at least a year');
  assertEqual(activation.addMonths(Date.UTC(2026, 0, 31) / 1000, 1), Date.UTC(2026, 1, 28) / 1000, 'month arithmetic clamps short months');
});

await checkAsync('a hosted plan cookie retains its business scope', async () => {
  const record = { planId: 'starter', since: 1, renewsAt: 0, trialEndsAt: 0, activatedBy: 'self', businessId: 'business-one' };
  const token = await cookie.sealPlanRecord(record, 'test-secret-that-is-long-enough-to-sign');
  assertEqual((await cookie.openPlanRecord(token, 'test-secret-that-is-long-enough-to-sign')).businessId, 'business-one', 'business scope survives signing');
});

check('the plan cookie is httpOnly and can never be rewritten by a script', () => {
  // The shape comes from the transport now — see lib/security/cookies.ts. The
  // three cases are the three places this app actually runs.
  const deployment = { secure: true, sameSite: 'lax', partitioned: false };
  const preview = { secure: true, sameSite: 'none', partitioned: true };
  const local = { secure: false, sameSite: 'lax', partitioned: false };

  const options = cookie.planCookieOptions(deployment);
  assertEqual(options.httpOnly, true, 'httpOnly');
  assertEqual(options.sameSite, 'lax', 'SameSite=Lax on a real deployment');
  assertEqual(options.secure, true, 'secure on a real domain');
  assertEqual(options.path, '/', 'scoped to the whole console');
  assertEqual(options.partitioned, false, 'and not partitioned where nothing frames it');

  assertEqual(cookie.planCookieOptions(local).secure, false, 'and not forced on plain-http local development');

  // A framed preview must be None + Partitioned or the browser refuses the
  // cookie outright — which is how a preview console signed nobody in and
  // reported a missing CSRF cookie.
  const framed = cookie.planCookieOptions(preview);
  assertEqual(framed.sameSite, 'none', 'SameSite=None in a framed preview');
  assertEqual(framed.secure, true, 'Secure in a framed preview');
  assertEqual(framed.partitioned, true, 'Partitioned in a framed preview');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
