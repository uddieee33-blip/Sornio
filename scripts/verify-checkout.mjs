import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Shared source now imports siblings with explicit `.ts` extensions (desktop and
// mobile set `allowImportingTsExtensions`, and Vite/Metro both resolve them).
// These one-off emits must ask for the same treatment, and for
// `rewriteRelativeImportExtensions`, because TypeScript refuses
// `allowImportingTsExtensions` unless `noEmit`, `emitDeclarationOnly` or that
// rewrite is set — and this script needs real JavaScript to load.
const T_EXT = ['--allowImportingTsExtensions', '--rewriteRelativeImportExtensions'];

const require = createRequire(import.meta.url);
const out = mkdtempSync(join(tmpdir(), 'sornio-receipt-format-'));
try {
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'), 'apps/desktop/src/billing-types.ts',
    '--rootDir', '.', '--outDir', out, '--target', 'es2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--ignoreConfig', ...T_EXT], { stdio: 'inherit' });
  const { money, quantity } = require(join(out, 'apps/desktop/src/billing-types.js'));
  assert.equal(money(4250), '₹42.50');
  assert.equal(money('10000000000000001'), '₹10,00,00,00,00,00,000.01');
  assert.equal(money('-1'), '-₹0.01');
  assert.equal(money('0'), '₹0.00');
  assert.equal(quantity(1250), '1.25');
  assert.equal(quantity(1), '0.001');
  console.log('Checkout display checks passed: exact paise including balances beyond JS safe integers, negative/zero balances and fractional units.');
} finally { rmSync(out, { recursive: true, force: true }); }
