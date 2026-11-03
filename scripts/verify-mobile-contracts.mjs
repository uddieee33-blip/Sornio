#!/usr/bin/env node
/**
 * Companion contract tests. Compiles packages/mobile-contracts with the
 * repository TypeScript and asserts Hybrid Sync V1 invariants.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function compiler() {
  try {
    return require.resolve('typescript/lib/tsc.js');
  } catch {
    return require.resolve('typescript/lib/tsc.js', { paths: [join(root, 'apps/mobile')] });
  }
}
const out = mkdtempSync(join(tmpdir(), 'sornio-mobile-'));
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
};

const files = [
  'money.ts',
  'errors.ts',
  'identity.ts',
  'session.ts',
  'sync.ts',
  'snapshot.ts',
  'validation.ts',
  'adapters.ts',
  'vocabulary.ts',
  'demo.ts',
  'production.ts',
  'capabilities.ts',
  'security.ts',
  'engine.ts',
  'query.ts',
  'index.ts',
].map((name) => join(root, 'packages/mobile-contracts/src', name));

try {
  execFileSync(
    process.execPath,
    [
      compiler(),
      ...files,
      '--outDir',
      out,
      '--module',
      'commonjs',
      '--target',
      'es2022',
      '--strict',
      '--skipLibCheck',
      '--ignoreConfig',
    ],
    { stdio: 'inherit' },
  );

  const {
    addPaise,
    formatInr,
    formatQuantity,
    parsePaise,
    parseQuantityMilli,
    paiseFromRupeeDecimal,
    quantityFromDecimal,
    NATIVE_MAX_UNITS,
    MoneyError,
  } = require(join(out, 'money.js'));
  const { parseCompanionSnapshot } = require(join(out, 'validation.js'));
  const { decideSnapshotApply } = require(join(out, 'sync.js'));
  const { demoSnapshot, demoSession, DemoAuth, DemoSnapshotAdapter, MemoryCache, DEMO_SPLIT_SALE } = require(join(out, 'demo.js'));
  const { ProductionAuth, ProductionSnapshotAdapter, parseLiveSnapshot } = require(join(out, 'production.js'));
  const { CompanionEngine, emptyEngineState } = require(join(out, 'engine.js'));
  const { screensFor, FEATURE_MATRIX, MODULE_KEYS, PORTAL_MODULES, isWriteBlocked } = require(join(out, 'capabilities.js'));
  const { CompanionError } = require(join(out, 'errors.js'));
  const { redact, wipeSecureSession, MemorySecureStore, THREAT_CONTROLS, THREATS } = require(join(out, 'security.js'));
  const { filterActivity, filterInventory, filterCustomers } = require(join(out, 'query.js'));
  const { PORTAL_IDS } = require(join(out, 'identity.js'));

  // Exact paise formatting
  check(formatInr(parsePaise('0')) === '₹0.00', 'zero rupees');
  check(formatInr(parsePaise('1')) === '₹0.01', 'one paise');
  check(formatInr(parsePaise('100000')) === '₹1,000.00', 'thousand with Indian grouping');
  check(formatInr(parsePaise('123456789')) === '₹12,34,567.89', 'lakh grouping');
  check(formatInr(parsePaise('-40000')) === '-₹400.00', 'negative credit');
  check(paiseFromRupeeDecimal('1000.00') === '100000', 'rupee decimal to paise');
  check(addPaise(parsePaise('60000'), parsePaise('40000')) === '100000', 'cash plus credit');

  // Large amounts stay on BigInt
  const large = `${NATIVE_MAX_UNITS}` ;
  check(formatInr(parsePaise(large)).startsWith('₹'), 'native max formats');
  assert.throws(() => parsePaise(`${NATIVE_MAX_UNITS + 1n}`), MoneyError);
  assert.throws(() => parsePaise('1.5'), MoneyError);
  assert.throws(() => parsePaise('1e3'), MoneyError);
  assert.throws(() => paiseFromRupeeDecimal('1.001'), MoneyError);
  checks += 4;

  // Fractional stock
  check(formatQuantity(parseQuantityMilli('1500')) === '1.5', '1.500 kg');
  check(formatQuantity(parseQuantityMilli('1')) === '0.001', 'milli unit');
  check(quantityFromDecimal('2.750') === '2750', 'three decimal quantity');
  assert.throws(() => quantityFromDecimal('1.2500'), MoneyError);
  checks += 1;

  const demo = demoSnapshot();
  check(demo.mode === 'demo' && demo.source === 'demo', 'explicit demo mode');
  check(demo.activity[0].id === DEMO_SPLIT_SALE.id, 'canonical 1000-rupee sale present');
  check(demo.activity[0].cashPaise === '60000' && demo.activity[0].creditPaise === '40000', 'cash/credit split');

  // Invalid payload
  const valid = JSON.parse(JSON.stringify(demo));
  assert.throws(() => parseCompanionSnapshot({ ...valid, overview: { ...valid.overview, todaySales: { totalPaise: 1000, cashPaise: '0', creditPaise: '0' } } }), CompanionError);
  assert.throws(() => parseCompanionSnapshot({ ...valid, mode: 'live', source: 'demo' }), CompanionError);
  assert.throws(() => parseCompanionSnapshot({ ...valid, schemaVersion: 2 }), CompanionError);
  checks += 3;
  const parsed = parseCompanionSnapshot(valid);
  check(parsed.businessId === demo.businessId, 'demo snapshot validates');

  // Duplicate / out of order / generation
  const current = {
    schemaVersion: 1,
    businessId: demo.businessId,
    restoreGeneration: demo.restoreGeneration,
    cursor: demo.cursor,
    serverTimeIso: demo.producedAtIso,
    source: 'demo',
    deviceId: 'demo-device',
    revoked: false,
  };
  check(decideSnapshotApply(current, current).kind === 'duplicate', 'duplicate cursor');
  const older = { ...current, cursor: '0' };
  check(decideSnapshotApply(current, older).ok === false && decideSnapshotApply(current, older).error.code === 'OUT_OF_ORDER_SYNC', 'out of order');
  const restored = { ...current, restoreGeneration: 'other-generation', cursor: '2' };
  check(decideSnapshotApply(current, restored).error.code === 'GENERATION_MISMATCH', 'generation mismatch');
  const otherBiz = { ...current, businessId: 'biz-other', cursor: '2' };
  check(decideSnapshotApply(current, otherBiz).error.code === 'BUSINESS_MISMATCH', 'business mismatch');

  // Engine: revoked, logout, stale overwrite, offline
  const engine = new CompanionEngine();
  const session = demoSession();
  engine.signIn(session, demo);
  const revokedSession = { ...session, device: { ...session.device, enrollmentStatus: 'revoked' } };
  const revoked = engine.signIn(revokedSession, demo);
  check(revoked.sync.phase === 'revoked' && revoked.snapshot === null, 'revoked device clears snapshot');

  const liveEngine = new CompanionEngine(emptyEngineState('live'));
  liveEngine.signIn(session, demo);
  const { token } = liveEngine.beginRefresh();
  liveEngine.applySnapshot(token, demo);
  let stale = false;
  try {
    liveEngine.applySnapshot(token - 1, { ...demo, cursor: '9' });
  } catch (error) {
    stale = error.code === 'STALE_SNAPSHOT';
  }
  check(stale, 'stale in-flight response cannot overwrite');

  const authCache = new MemoryCache();
  const auth = new DemoAuth(authCache);
  await auth.signInDemo();
  check((await auth.current())?.mode === 'demo', 'demo sign-in');
  await auth.signOut();
  check((await auth.current()) === null, 'logout cache invalidation');

  const switchEngine = new CompanionEngine();
  switchEngine.signIn(session, demo);
  let switched = false;
  try {
    switchEngine.switchBusiness('someone-else');
  } catch (error) {
    switched = error.code === 'BUSINESS_MISMATCH';
  }
  check(switched, 'unauthorized business switch');

  switchEngine.markOffline();
  check(switchEngine.getState().sync.connectivity === 'offline', 'missing network');
  check(switchEngine.getState().sync.freshnessLabel !== 'Synced' || session.mode === 'demo', 'offline not implied live');
  switchEngine.markOnline();
  const refresh = switchEngine.beginRefresh();
  switchEngine.applySnapshot(refresh.token, demo);
  check(switchEngine.getState().sync.phase === 'synced', 'refresh after reconnection');

  // Production never falls back to demo
  const prod = new ProductionSnapshotAdapter({ baseUrl: 'https://example.invalid', enabled: false });
  const liveSession = { ...session, mode: 'live', business: { ...session.business, businessId: 'biz-live' } };
  let disabled = false;
  try {
    await prod.load(liveSession);
  } catch (error) {
    disabled = error.code === 'PRODUCTION_DISABLED';
  }
  check(disabled, 'production adapter disabled');
  let demoBlocked = false;
  try {
    await prod.load(session);
  } catch (error) {
    demoBlocked = error.code === 'DEMO_FORBIDDEN';
  }
  check(demoBlocked, 'production adapter refuses demo session');
  const prodAuth = new ProductionAuth(new MemoryCache(), { baseUrl: 'https://example.invalid', enabled: false });
  let liveSignIn = false;
  try {
    await prodAuth.signInLive({ email: 'owner@example.com', secret: 'x' });
  } catch (error) {
    liveSignIn = error.code === 'PRODUCTION_DISABLED';
  }
  check(liveSignIn, 'live sign-in disabled');
  let demoOnProd = false;
  try {
    await prodAuth.signInDemo();
  } catch (error) {
    demoOnProd = error.code === 'DEMO_FORBIDDEN';
  }
  check(demoOnProd, 'production auth cannot open demo');

  let liveDemoRejected = false;
  try {
    parseLiveSnapshot(demo, 'biz-live');
  } catch (error) {
    liveDemoRejected = error.code === 'DEMO_FORBIDDEN';
  }
  check(liveDemoRejected, 'live parser rejects demo snapshot');

  // Role navigation
  check(screensFor('cashier', 'kirana').includes('home'), 'cashier home');
  check(screensFor('owner', 'gym').includes('inventory') === false, 'gym hides inventory tab');
  check(screensFor('owner', 'kirana').includes('inventory'), 'kirana shows inventory');
  check(isWriteBlocked('billing') && isWriteBlocked('sales'), 'financial writes blocked');

  // Empty states
  check(filterActivity(demo.activity, 'zzzz', 'all').length === 0, 'empty activity search');
  check(filterInventory(demo.inventory, '', true).every((row) => row.lowStock), 'low-stock filter');
  check(filterCustomers(demo.customers, 'Harpreet').length === 1, 'customer search');
  check(filterCustomers([], 'x').length === 0, 'empty customer list');

  // Redaction / secure wipe
  const secrets = redact({ accessToken: 'secret', customer: { phone: '999', name: 'A' } });
  check(secrets.accessToken === '[redacted]' && secrets.customer.phone === '[redacted]', 'redact tokens and phones');
  const store = new MemorySecureStore();
  await store.set('sornio.companion.session', '{"mode":"demo"}');
  await store.set('sornio.companion.accessToken', 'tok');
  await wipeSecureSession(store);
  check((await store.get('sornio.companion.session')) === null, 'secure session wiped');
  check((await store.get('sornio.companion.accessToken')) === null, 'token wiped');

  check(FEATURE_MATRIX.length === MODULE_KEYS.length, 'matrix covers every catalogue module');
  check(THREAT_CONTROLS.length === THREATS.length, 'threat model is complete');
  check(PORTAL_IDS.every((id) => PORTAL_MODULES[id].includes('cockpit')), 'every portal has a cockpit');
  check(demo.overview.todaySales.cashPaise !== undefined, 'overview uses paise strings');

  const demoAdapter = new DemoSnapshotAdapter();
  const loaded = await demoAdapter.load(session);
  check(loaded.mode === 'demo', 'demo adapter returns demo');
  let liveOnDemo = false;
  try {
    await demoAdapter.load(liveSession);
  } catch (error) {
    liveOnDemo = error.code === 'DEMO_FORBIDDEN';
  }
  check(liveOnDemo, 'demo adapter refuses live session');

  // Number rejection in money transport
  let numberRejected = false;
  try {
    parsePaise(100000);
  } catch (error) {
    numberRejected = error instanceof MoneyError;
  }
  check(numberRejected, 'JS number paise rejected');

  const app = JSON.parse(readFileSync(join(root, 'apps/mobile/app.json'), 'utf8'));
  check(app.expo.android.package === 'com.sornio.companion', 'Android application id');
  check(app.expo.ios.bundleIdentifier === 'com.sornio.companion', 'iOS bundle id');
  check(app.expo.ios.supportsTablet === true, 'iPad support');
  check(app.expo.extra.productionSyncEnabled === false, 'live sync flag off');
  check(app.expo.android.package !== 'com.sornio.app', 'companion id does not collide with WebView');

  console.log(`Mobile contracts: ${checks} checks passed (paise, sync, demo isolation, roles, cache, threats).`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
