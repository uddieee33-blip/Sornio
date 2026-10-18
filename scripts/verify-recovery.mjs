/**
 * Verify the recovery repairs: the money, the session secret, and the sync path.
 *
 * Each check here is a claim a shopkeeper or an auditor would act on:
 *
 *   • a trading loss is shown as a loss, not clamped to zero;
 *   • inventory value is stock on hand × cost, not cost of goods already sold;
 *   • a bank or UPI balance nets the money paid out of it;
 *   • a previous-period figure is never invented;
 *   • production refuses to sign sessions without a real secret;
 *   • the sync path no longer deletes records before writing them, and
 *     clients cannot write membership rows.
 *
 * The database half (RLS and the atomic push) runs in verify:database.
 *
 *   npm run verify:recovery
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-recovery-'));

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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertEqual = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

console.log('Compiling the money, session and sync modules…');

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
      files: [join(root, 'lib/business-data.ts'), join(root, 'lib/security/session.ts')],
    },
    null,
    2,
  ),
);

execFileSync(process.execPath, [compiler('api', root).file, '-p', tsconfig], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});

const require = createRequire(import.meta.url);
const nodeModule = require('node:module');
const resolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function aliased(request, ...rest) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    const mapped = request.slice(2).replace(/^lib\//, '');
    return resolveFilename.call(this, join(outDir, mapped), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

const money = require(join(outDir, 'business-data.js'));
const session = require(join(outDir, 'security/session.js'));

// ---------------------------------------------------------------- financials
const sale = (amount, account = 'revenue', paymentMethod = 'Cash') => ({
  id: `s${amount}`, type: 'sale', description: 'sale', amount, direction: 'in', account, paymentMethod, date: '2026-10-01',
});
const out = (type, amount, account, paymentMethod) => ({
  id: `o${amount}${type}`, type, description: type, amount, direction: 'out', account, paymentMethod, date: '2026-10-01',
});
const inflow = (amount, account, paymentMethod) => ({
  id: `i${amount}${account}`, type: 'payment', description: 'payment', amount, direction: 'in', account, paymentMethod, date: '2026-10-01',
});

console.log('\nMoney');

check('a trading loss shows as a negative operating profit, not zero', () => {
  const snap = money.summarizeFinancials(
    [sale(1000), out('stock_adjustment', 600, 'inventory'), out('expense', 3000, 'expense', 'Cash')],
    [],
  );
  assertEqual(snap.grossProfit, 400, 'gross profit');
  assertEqual(snap.operatingProfit, -2600, 'operating profit must keep the loss');
  assertEqual(snap.netProfit, -2600, 'net profit must keep the loss');
});

check('inventory value is on-hand × cost, not the cost of goods already sold', () => {
  const products = [
    { itemType: 'product', stock: 10, cost: 60 },
    { itemType: 'product', stock: 4, cost: 25 },
    { itemType: 'service', stock: 0, cost: 6500 },
  ];
  const snap = money.summarizeFinancials([out('stock_adjustment', 9999, 'inventory')], products);
  assertEqual(snap.inventoryValue, 700, 'inventory value');
});

check('bank balance nets money paid out of the bank', () => {
  const snap = money.summarizeFinancials(
    [inflow(5000, 'bank', 'Bank Transfer'), out('payment', 1200, 'bank', 'Bank Transfer')],
    [],
  );
  assertEqual(snap.bankBalance, 3800, 'bank balance');
});

check('UPI balance nets money paid out over UPI', () => {
  const snap = money.summarizeFinancials(
    [inflow(2000, 'upi', 'UPI'), out('payment', 750, 'upi', 'UPI')],
    [],
  );
  assertEqual(snap.upiBalance, 1250, 'UPI balance');
});

check('comparisons carry no invented previous-period figures', () => {
  const snap = money.summarizeFinancials([sale(1000), out('expense', 300, 'expense', 'Cash')], []);
  const rows = money.getComparisonData(snap);
  assert(rows.length === 4, 'four comparison rows');
  assert(rows.every((row) => row.previous === null), `previous must be null, got ${JSON.stringify(rows.map((r) => r.previous))}`);
});

check('insight sentences do not claim a trend the ledger cannot show', () => {
  const snap = money.summarizeFinancials([sale(1000)], []);
  const text = money.getInsights(snap).join(' ');
  assert(!/increased|decreased/i.test(text), `insight claims a trend: ${text}`);
});

// -------------------------------------------------------------------- session
console.log('\nSession secret');

const SAVED = { ...process.env };
function withEnv(patch, fn) {
  const before = { ...process.env };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    process.env = before;
  }
}

check('production refuses to sign sessions without DUKAANOS_SESSION_SECRET', () => {
  withEnv({ NODE_ENV: 'production', DUKAANOS_SESSION_SECRET: undefined }, () => {
    let threw = false;
    try {
      session.resolveSessionSecret();
    } catch {
      threw = true;
    }
    assert(threw, 'production must throw without a secret');
  });
});

check('production refuses a secret shorter than 32 characters', () => {
  withEnv({ NODE_ENV: 'production', DUKAANOS_SESSION_SECRET: 'too-short' }, () => {
    let threw = false;
    try {
      session.resolveSessionSecret();
    } catch {
      threw = true;
    }
    assert(threw, 'short secret must be refused in production');
  });
});

check('production accepts a 32+ character secret', () => {
  const secret = 'x'.repeat(40);
  withEnv({ NODE_ENV: 'production', DUKAANOS_SESSION_SECRET: secret }, () => {
    assertEqual(session.resolveSessionSecret(), secret, 'configured secret');
  });
});

check('development keeps a local fallback so `next dev` still works', () => {
  withEnv({ NODE_ENV: 'development', DUKAANOS_SESSION_SECRET: undefined }, () => {
    assert(session.resolveSessionSecret().startsWith('dukaanos-local::'), 'dev fallback');
  });
});

// Restore the environment exactly as it was.
for (const key of Object.keys(process.env)) if (!(key in SAVED)) delete process.env[key];
Object.assign(process.env, SAVED);

// ----------------------------------------------------------------- sync (static)
console.log('\nSync path (static guarantees)');

const syncSource = readFileSync(join(root, 'lib/sync/supabase-sync.ts'), 'utf8');
const schemaSource = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
const migrationSource = readFileSync(
  join(root, 'supabase/migrations/20261019000000_recovery_authorization_and_atomic_sync.sql'),
  'utf8',
);
const storeSource = readFileSync(join(root, 'lib/store.tsx'), 'utf8');

check('the push is one atomic database call, not delete-then-insert', () => {
  assert(syncSource.includes(".rpc('sync_tenant_snapshot'"), 'push must call sync_tenant_snapshot');
  assert(!/\.delete\(\)\.eq\('business_id'/.test(syncSource), 'client must not delete tenant rows directly');
});

check('clients never write membership rows', () => {
  assert(!/from\('business_members'\)\s*\.upsert/.test(syncSource), 'membership upsert is back');
  assert(!/from\('business_members'\)\s*\.insert/.test(syncSource), 'membership insert is back');
});

check('the restore path is wired into the store', () => {
  assert(syncSource.includes('export async function fetchCloudSnapshot'), 'fetchCloudSnapshot missing');
  assert(storeSource.includes("fetchCloudSnapshot()"), 'store does not call fetchCloudSnapshot');
});

check('the stock ledger is no longer cut at 2,000 rows', () => {
  assert(!/stockMovements\.slice\(0, 2000\)/.test(syncSource), 'movement cap of 2000 is back');
  assert(syncSource.includes('STOCK_LEDGER_LIMIT'), 'ledger limit not used');
});

check('sale line items are pushed with their transaction', () => {
  assert(/items:\s*tx\.items/.test(syncSource), 'transaction items not pushed');
});

check('the membership self-write policy is dropped after it is created', () => {
  // schema.sql keeps the original CREATE as history, so the test is ordering:
  // the last mention of the policy must be a DROP, not a CREATE.
  const name = '"User can manage own business membership records"';
  const created = schemaSource.lastIndexOf(`CREATE POLICY ${name}`);
  const dropped = schemaSource.lastIndexOf(`DROP POLICY IF EXISTS ${name}`);
  assert(dropped !== -1, 'schema.sql never drops the self-write membership policy');
  assert(dropped > created, 'schema.sql re-creates the self-write membership policy after dropping it');
  assert(migrationSource.includes(`DROP POLICY IF EXISTS ${name}`), 'migration does not drop it');
});

check('the RPC is revoked from anonymous callers and checks the role itself', () => {
  assert(/REVOKE ALL ON FUNCTION sync_tenant_snapshot[^;]*FROM PUBLIC, anon/.test(migrationSource), 'revoke missing');
  // SECURITY DEFINER is deliberate: under INVOKER a counter device's stock update
  // matches zero rows (RLS), so the function enforces roles and business ids itself.
  const body = migrationSource.slice(migrationSource.indexOf('FUNCTION sync_tenant_snapshot'));
  assert(/tenant_role\(p_business_id\)/.test(body), 'sync must check the caller role via tenant_role');
  assert(/SET search_path = public/.test(body), 'definer function must pin search_path');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
