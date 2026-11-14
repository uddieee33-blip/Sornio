import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// Shared source now imports siblings with explicit `.ts` extensions (desktop and
// mobile set `allowImportingTsExtensions`, and Vite/Metro both resolve them).
// These one-off emits must ask for the same treatment, and for
// `rewriteRelativeImportExtensions`, because TypeScript refuses
// `allowImportingTsExtensions` unless `noEmit`, `emitDeclarationOnly` or that
// rewrite is set — and this script needs real JavaScript to load.
const T_EXT = ['--allowImportingTsExtensions', '--rewriteRelativeImportExtensions'];

const require = createRequire(import.meta.url);
const out = mkdtempSync(join(tmpdir(), 'sornio-domain-'));
try {
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'),
    'packages/business-domain/src/invoice-calculation.ts',
    'packages/business-domain/src/daily-workspace.ts',
    'packages/business-domain/src/fixed-decimal.ts',
    '--outDir', out, '--module', 'commonjs', '--target', 'es2022',
    '--strict', '--skipLibCheck', '--ignoreConfig', ...T_EXT], { stdio: 'inherit' });
  const { calculateInvoice } = require(join(out, 'invoice-calculation.js'));
  const { DAILY_WORKSPACES, dailyWorkspace } = require(join(out, 'daily-workspace.js'));
  const { parseFixedDecimal } = require(join(out, 'fixed-decimal.js'));
  assert.equal(parseFixedDecimal('42.50', 2), 4250);
  assert.equal(parseFixedDecimal('1.250', 3), 1250);
  assert.equal(parseFixedDecimal('-2.750', 3, true), -2750);
  assert.equal(parseFixedDecimal('9000000000.000', 3), 9000000000000);
  for (const value of ['', '-1', '1e3', 'Infinity', '1.001', '90000000000.01', '0x10']) assert.equal(parseFixedDecimal(value, 2), null);
  assert.equal(parseFixedDecimal('0', 2), 0);
  const line = { name: ' Rice ', category: '', quantity: 1.25, unitPrice: 42.50 };
  const result = calculateInvoice([line], 5);
  assert.deepEqual(result, { ok: true, lines: [{ ...line, name: 'Rice', category: 'General', total: 53.13 }], subtotal: 53.13, tax: 2.66, total: 55.79 });
  assert.equal(line.name, ' Rice ');
  const { calculateNativeInvoice } = require(join(out, 'native-invoice.js'));
  for (const [quantity, unitPrice] of [[4.85,0.50],[4.85,0.70],[2.9,0.75],[4.265,1],[4.395,1]]) {
    const result = calculateInvoice([{ ...line, quantity, unitPrice }], 0);
    assert.equal(result.ok, true); assert.equal(result.total, calculateNativeInvoice([{quantityMilli:Math.round(quantity*1000),unitPricePaise:Math.round(unitPrice*100)}],0).totalPaise/100);
  }
  for (let price = 1; price < 200; price += 7) for (let milli = 500; milli < 5000; milli += 137) {
    const expected=calculateNativeInvoice([{quantityMilli:milli,unitPricePaise:price}],525);
    const result=calculateInvoice([{ ...line, quantity:milli/1000, unitPrice:price/100 }],5.25);
    assert.equal(result.ok,true); assert.equal(result.total,expected.totalPaise/100);
  }
  assert.equal(calculateInvoice([{...line,quantity:0.0001}],0).ok,false);
  assert.equal(calculateInvoice([line],5.001).ok,false);

  assert.equal(calculateInvoice([{ ...line, quantity: 3, unitPrice: 0.1 }], 0).total, 0.3);
  for (const tax of [-1, 101, NaN, Infinity]) assert.equal(calculateInvoice([line], tax).ok, false);
  for (const quantity of [0, -1, NaN, Infinity, Number.MAX_VALUE]) assert.equal(calculateInvoice([{ ...line, quantity }], 0).ok, false);
  for (const unitPrice of [-1, NaN, Infinity, 1.001]) assert.equal(calculateInvoice([{ ...line, unitPrice }], 0).ok, false);
  assert.equal(calculateInvoice([], 0).ok, false);
  assert.equal(calculateInvoice([{ ...line, name: '  ' }], 0).ok, false);
  assert.equal(calculateInvoice([{ ...line, unitPrice: 0 }], 0).ok, false);
  const ids = ['gym', 'cafe', 'kirana', 'salon', 'electronics', 'boutique', 'service', 'general'];
  assert.deepEqual(Object.keys(DAILY_WORKSPACES).sort(), ids.sort());
  for (const id of ids) {
    const workspace = dailyWorkspace(id);
    assert(workspace.tasks.length > 0 && workspace.setup.length > 0);
    assert.equal(workspace.tasks.some(t => t.label === 'Plans & members'), id === 'gym');
    assert.equal(workspace.focus === 'dues', id === 'kirana');
    assert.equal(workspace.focus === 'renewals', id === 'gym');
    assert.equal(new Set(workspace.tasks.map(t => t.href)).size, workspace.tasks.length);
  }
  assert(dailyWorkspace('salon').tasks.some(t => t.label === 'Packages'));
  console.log('Shared domain checks passed: invoice rounding, invalid/overflow amounts, immutable inputs and eight business workspaces.');
} finally { rmSync(out, { recursive: true, force: true }); }
