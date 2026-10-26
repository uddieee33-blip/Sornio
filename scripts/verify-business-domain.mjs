import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const out = mkdtempSync(join(tmpdir(), 'sornio-domain-'));
try {
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'),
    'packages/business-domain/src/invoice-calculation.ts',
    'packages/business-domain/src/daily-workspace.ts',
    '--outDir', out, '--module', 'commonjs', '--target', 'es2022',
    '--strict', '--skipLibCheck', '--ignoreConfig'], { stdio: 'inherit' });
  const { calculateInvoice } = require(join(out, 'invoice-calculation.js'));
  const { DAILY_WORKSPACES, dailyWorkspace } = require(join(out, 'daily-workspace.js'));
  const line = { name: ' Rice ', category: '', quantity: 1.25, unitPrice: 42.50 };
  const result = calculateInvoice([line], 5);
  assert.deepEqual(result, { ok: true, lines: [{ ...line, name: 'Rice', category: 'General', total: 53.13 }], subtotal: 53.13, tax: 2.66, total: 55.79 });
  assert.equal(line.name, ' Rice ');
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
