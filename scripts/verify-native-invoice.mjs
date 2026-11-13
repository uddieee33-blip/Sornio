import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
const out = mkdtempSync(join(tmpdir(), 'sornio-native-money-'));
const fixture = name => JSON.parse(readFileSync(`packages/business-domain/fixtures/${name}.json`, 'utf8'));
try {
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'),
    'packages/business-domain/src/native-invoice.ts', '--outDir', out, '--target', 'es2022',
    '--module', 'commonjs', '--strict', '--skipLibCheck', '--ignoreConfig', ...T_EXT], { stdio: 'inherit' });
  const { calculateNativeInvoice: calculate, validateNativeInvoiceRequest: validate } = require(join(out, 'native-invoice.js'));
  for (const f of fixture('native-invoices')) {
    assert.deepEqual(calculate([{ quantityMilli: f.quantity, unitPricePaise: f.price }], f.bps), {
      lineTotalsPaise: [f.line], subtotalPaise: f.line, taxPaise: f.tax, totalPaise: f.total,
    });
  }
  const contract = fixture('native-invoice-contract');
  for (const f of contract.requests) {
    if (f.valid) assert.doesNotThrow(() => validate(f.input), f.name);
    else assert.throws(() => validate(f.input), Error, f.name);
  }
  for (const f of contract.calculations) {
    if (f.result) assert.deepEqual(calculate(f.lines, f.taxBasisPoints), f.result, f.name);
    else assert.throws(() => calculate(f.lines, f.taxBasisPoints), Error, f.name);
  }
  const base = contract.requests[0].input;
  const hundred = { ...base, lines: Array.from({ length: 100 }, () => ({ ...base.lines[0] })) };
  assert.doesNotThrow(() => validate(hundred));
  assert.throws(() => validate({ ...hundred, lines: [...hundred.lines, base.lines[0]] }));
  assert.equal(calculate(hundred.lines.map(() => ({ quantityMilli: 1000, unitPricePaise: 1 })), 0).totalPaise, 100);
  assert.throws(() => calculate(Array.from({ length: 101 }, () => ({ quantityMilli: 1000, unitPricePaise: 1 })), 0));
  for (const bad of [NaN, Infinity, -Infinity, 0.1, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => calculate([{ quantityMilli: bad, unitPricePaise: 100 }], 0));
    assert.throws(() => calculate([{ quantityMilli: 1000, unitPricePaise: bad }], 0));
    assert.throws(() => calculate([{ quantityMilli: 1000, unitPricePaise: 1 }], bad));
    assert.throws(() => validate({ ...base, taxBasisPoints: bad }));
    assert.throws(() => validate({ ...base, lines: [{ ...base.lines[0], quantityMilli: bad }] }));
  }
  for (const bad of [null, [], 'invoice', 1]) assert.throws(() => validate(bad));
  assert.throws(() => calculate([], 0));
  console.log(`Native invoice contract passed: ${contract.requests.length} request fixtures, ${contract.calculations.length + 5} money fixtures, line limits and invalid numeric inputs.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
