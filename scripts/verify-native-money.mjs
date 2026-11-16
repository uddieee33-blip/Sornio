#!/usr/bin/env node
/**
 * Money arithmetic at the counter, tested twice over.
 *
 * The cashier's screen and the native writer must agree to the paise, because the
 * screen shows a total before the sale is posted. They are separate
 * implementations: Rust `billing::line_total`/`tax_total` in
 * packages/local-store/src/billing.rs and `calculateNativeInvoice` in
 * packages/business-domain/src/native-invoice.ts. The shared fixtures cover the
 * agreement at sampled values; this script covers what fixtures cannot:
 *
 *   * a deterministic property sweep across the whole supported magnitude range,
 *     comparing the renderer against a BigInt reference of the Rust formula,
 *   * rounding edges where half-up and half-even, or per-line and per-invoice
 *     rounding, would diverge,
 *   * typed money parsing (`parseFixedDecimal`) refusing exponents, extra
 *     decimals and out-of-range input instead of silently rounding,
 *   * display helpers that must never turn a cumulative paise balance into a JS
 *     Number, where amounts above 2^53 would drift.
 *
 * It re-reads the Rust constants so that changing native rounding without
 * revisiting the renderer fails here rather than at a busy counter.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MAX = 9_000_000_000_000;
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
};

// --- 1. The renderer's rounding must still describe the native formula -------
const billing = readFileSync('packages/local-store/src/billing.rs', 'utf8');
check(/\{[\s\S]*?amount\(\(quantity as i128 \* price as i128 \+ 500\) \/ 1000\)/.test(billing)
  || /amount\(\(quantity as i128 \* price as i128 \+ 500\) \/ 1000\)/.test(billing),
  'native line_total still rounds half up at +500/1000');
check(/amount\(\(subtotal as i128 \* bps as i128 \+ 5000\) \/ 10000\)/.test(billing),
  'native tax_total still rounds half up at +5000/10000');
check(/\(0\.\.=MAX_VALUE as i128\)\.contains\(&n\)/.test(billing),
  'native still refuses amounts above MAX_VALUE');
console.log('ok   native rounding constants found in billing.rs');

const out = mkdtempSync(join(tmpdir(), 'sornio-money-'));
try {
  // The sources import one another with explicit `.ts` extensions (the mobile
  // and desktop projects set `allowImportingTsExtensions`, and Metro/Vite both
  // resolve those). This one-off emit therefore has to ask for the same
  // treatment, plus `--rewriteRelativeImportExtensions`, because TypeScript
  // refuses `allowImportingTsExtensions` unless one of `noEmit`,
  // `emitDeclarationOnly` or that rewrite is set — and this script needs real
  // JavaScript output to load. Without both flags the gate died with TS5097 on
  // `held-bills.ts`/`payment-allocation.ts` before running a single assertion.
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'),
    'packages/business-domain/src/native-invoice.ts',
    'packages/business-domain/src/fixed-decimal.ts',
    'apps/desktop/src/billing-types.ts',
    '--outDir', out, '--target', 'es2022', '--module', 'commonjs',
    '--strict', '--skipLibCheck', '--ignoreConfig',
    '--allowImportingTsExtensions', '--rewriteRelativeImportExtensions'], { stdio: 'inherit' });
  const { calculateNativeInvoice } = require(join(out, 'packages/business-domain/src/native-invoice.js'));
  const { parseFixedDecimal } = require(join(out, 'packages/business-domain/src/fixed-decimal.js'));
  const { formatPaiseInput, money, quantity } = require(join(out, 'apps/desktop/src/billing-types.js'));

  // The Rust contract, transcribed into BigInt exactly once.
  const reference = (lines, bps) => {
    let subtotal = 0n;
    const lineTotals = lines.map(line => {
      const total = (BigInt(line.quantityMilli) * BigInt(line.unitPricePaise) + 500n) / 1000n;
      subtotal += total;
      return total;
    });
    const tax = (subtotal * BigInt(bps) + 5000n) / 10000n;
    return { lineTotals, subtotal, tax, total: subtotal + tax };
  };

  // Deterministic PRNG so a failure is reproducible with the same seed.
  let state = 0x5eed1e;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const between = (low, high) => Math.floor(random() * (high - low + 1)) + low;

  let compared = 0;
  let overflowRefusals = 0;
  for (let round = 0; round < 5_000; round += 1) {
    const lines = Array.from({ length: between(1, 5) }, () => {
      // Magnitudes from a single packet up to the whole supported range, so the
      // product crosses 2^53 in some rounds and must still be exact.
      const scale = 10 ** between(0, 13);
      return {
        quantityMilli: between(1, Math.max(1, Math.min(MAX / scale, 9_000_000))),
        unitPricePaise: between(0, Math.max(0, Math.min(MAX / scale, 9_000_000))),
      };
    });
    const bps = between(0, 10000);
    const expected = reference(lines, bps);
    let actual;
    try {
      actual = calculateNativeInvoice(lines, bps);
    } catch {
      // The renderer may only refuse where the native writer would refuse:
      // subtotal zero (`billing::post_into`) or any part above MAX_VALUE.
      const nativelyRefused = expected.subtotal === 0n
        || expected.subtotal > BigInt(MAX)
        || expected.total > BigInt(MAX);
      assert.ok(nativelyRefused,
        `renderer refused an invoice the native writer accepts: ${JSON.stringify({ lines, bps })}`);
      overflowRefusals += 1;
      continue;
    }
    assert.ok(expected.total <= BigInt(MAX) && expected.subtotal !== 0n,
      `renderer accepted an invoice the native writer refuses: ${JSON.stringify({ lines, bps })}`);
    assert.deepEqual(
      actual.lineTotalsPaise.map(String),
      expected.lineTotals.map(String),
      `line totals diverged: ${JSON.stringify({ lines, bps })}`,
    );
    assert.equal(String(actual.subtotalPaise), String(expected.subtotal), `subtotal diverged: ${JSON.stringify({ lines, bps })}`);
    assert.equal(String(actual.taxPaise), String(expected.tax), `tax diverged: ${JSON.stringify({ lines, bps })}`);
    assert.equal(String(actual.totalPaise), String(expected.total), `total diverged: ${JSON.stringify({ lines, bps })}`);
    for (const value of [actual.subtotalPaise, actual.taxPaise, actual.totalPaise]) {
      assert.ok(Number.isSafeInteger(value), `renderer returned an unsafe integer: ${value}`);
    }
    compared += 1;
  }
  check(compared > 4_000, `renderer matched the native formula on ${compared} random invoices`);
  console.log(`ok   renderer matched the native formula on ${compared} random invoices (${overflowRefusals} overflow refusals)`);

  // --- rounding edges ------------------------------------------------------
  // A paise remainder of exactly half a paise must round up, not to even.
  const edges = [
    // 1500 milli at 1 paise = 1.5 paise -> 2; at 3 paise = 4.5 -> 5
    { lines: [{ quantityMilli: 1500, unitPricePaise: 1 }], bps: 0, line: 2n },
    { lines: [{ quantityMilli: 1500, unitPricePaise: 3 }], bps: 0, line: 5n },
    // A sub-paise line rounds to zero, and a zero subtotal is refused by both
    // sides (`billing::post_into` and `calculateNativeInvoice`).
    { lines: [{ quantityMilli: 1, unitPricePaise: 499 }], bps: 0, line: 0n, refuses: true },
    { lines: [{ quantityMilli: 1, unitPricePaise: 500 }], bps: 0, line: 1n },
    { lines: [{ quantityMilli: 1, unitPricePaise: 501 }], bps: 0, line: 1n },
  ];
  for (const edge of edges) {
    if (edge.refuses) {
      assert.throws(() => calculateNativeInvoice(edge.lines, edge.bps), Error, 'a zero subtotal must be refused');
      continue;
    }
    const actual = calculateNativeInvoice(edge.lines, edge.bps);
    assert.equal(String(actual.lineTotalsPaise[0]), String(edge.line), `half-up rounding: ${edge.lines[0].quantityMilli}x${edge.lines[0].unitPricePaise} expected ${edge.line}`);
    const expected = reference(edge.lines, edge.bps);
    assert.equal(String(actual.taxPaise), String(expected.tax), `edge tax: ${edge.lines[0].quantityMilli}x${edge.lines[0].unitPricePaise}`);
  }
  check(true, 'half-paise and sub-paise line rounding matches the native contract');

  // Tax rounds once per invoice on the subtotal, never per line.
  const twoLines = [{ quantityMilli: 1000, unitPricePaise: 1 }, { quantityMilli: 1000, unitPricePaise: 1 }];
  const taxOnTwoPaise = calculateNativeInvoice(twoLines, 5000);
  assert.equal(String(taxOnTwoPaise.taxPaise), '1', 'invoice-level tax rounds 1.00 to 1');
  const perLineWouldBe = twoLines.length * Math.round((1 * 5000) / 10000 + 0.5);
  check(taxOnTwoPaise.taxPaise !== perLineWouldBe || perLineWouldBe === 1, 'tax is applied once to the invoice subtotal, not per line');

  // --- typed money parsing -------------------------------------------------
  const accepted = [
    ['0', 2, 0], ['0.00', 2, 0], ['44.51', 2, 4451], ['44.5', 2, 4450],
    // The cap applies to scaled paise: 90,00,00,00,000.00 rupees is the ceiling.
    ['90000000000', 2, MAX], ['90000000000.00', 2, MAX], ['0.001', 3, 1], ['1.5', 3, 1500], ['000012.50', 2, 1250],
  ];
  for (const [input, scale, expected] of accepted) {
    assert.equal(parseFixedDecimal(input, scale), expected, `parseFixedDecimal(${JSON.stringify(input)}, ${scale})`);
  }
  const refused = [
    // Unsafe or ambiguous syntax, at either scale.
    ...['1e3', '1E3', 'abc', '', ' ', '-5', '+5', '.5', '5.', '1,000', 'NaN', 'Infinity',
      '90000000000000', '90000000000.01', ' 1 2 ', '١٢٣', '1.2.3']
      .map(input => [input, 2]),
    // Precision beyond the field's scale: prices allow 2 decimals, quantities 3.
    ['1.234', 2], ['0.001', 2], ['1.2345', 3], ['0.0001', 3],
  ];
  for (const [input, scale] of refused) {
    assert.equal(parseFixedDecimal(input, scale), null,
      `parseFixedDecimal must refuse ${JSON.stringify(input)} at scale ${scale}`);
  }
  check(true, `parseFixedDecimal accepts ${accepted.length} exact forms and refuses ${refused.length} unsafe ones`);

  // --- display of cumulative balances --------------------------------------
  const displays = [
    [4451, '₹44.51'], [0, '₹0.00'], [-201, '-₹2.01'], [100, '₹1.00'],
    [100000000, '₹10,00,000.00'],
    [123456789, '₹12,34,567.89'],
  ];
  for (const [input, expected] of displays) {
    assert.equal(money(input), expected, `money(${input})`);
  }
  // Beyond 2^53 a Number would drift; money() must accept the exact string.
  assert.equal(money('9007199254740993'), '₹9,00,71,99,25,47,409.93');
  assert.equal(money('9000000000000'), '₹90,00,00,00,000.00');
  check(true, 'money() formats exact paise, including balances beyond 2^53');

  const quantities = [[1000, '1'], [1250, '1.25'], [1, '0.001'], [999, '0.999'], [1234567, '1234.567']];
  for (const [input, expected] of quantities) {
    assert.equal(quantity(input), expected, `quantity(${input})`);
  }
  assert.ok(!/e\+/.test(quantity(9_000_000_000_000)), 'quantity() never renders exponent notation');
  check(true, 'quantity() renders whole, fractional and large millis exactly');

  // --- recovery display: paise -> the typed field a cashier sees again ------
  // CheckoutPanel restores a pending sale's split by dividing stored paise by
  // 100 and putting the result back into the amount inputs. A float artefact
  // there would show the cashier a different figure than the saved request.
  // The invariant that matters is a round trip through the same parser the
  // input uses: what the cashier is shown must re-parse to the saved paise.
  let recoveryChecked = 0;
  const roundTrips = (paise) => {
    const shown = formatPaiseInput(paise, '0');
    if (/e/i.test(shown)) throw new Error(`recovered amount ${paise} renders in exponent form: ${shown}`);
    if (String(parseFixedDecimal(shown, 2)) !== String(paise)) {
      throw new Error(`recovered amount ${paise} shows as ${shown} and re-parses to ${parseFixedDecimal(shown, 2)}`);
    }
    recoveryChecked += 1;
  };
  for (let paise = 0; paise <= 200_000; paise += 1) roundTrips(paise);
  for (const paise of [999_999, 1_234_567, 90_000_000_000, 899_999_999_999, 4_499_999_999_999, 8_999_999_999_999, MAX]) roundTrips(paise);
  assert.equal(formatPaiseInput(0), '', 'formatPaiseInput(0) clears empty split slots');
  assert.equal(formatPaiseInput(0, '0'), '0', 'formatPaiseInput(0, "0") preserves explicit zero credit limits');
  assert.equal(formatPaiseInput(1050), '10.50', 'formatPaiseInput pads trailing zero paise');
  assert.equal(formatPaiseInput('9007199254740993'), '90071992547409.93', 'formatPaiseInput preserves >2^53 paise without float division');
  check(true, `formatPaiseInput round-trips saved paise through BigInt for ${recoveryChecked} values up to MAX`);

  // --- pilot split-payment invariant: ₹1,000 = ₹600 Cash + ₹400 Credit ------
  const splitInvoice = calculateNativeInvoice([{ quantityMilli: 1000, unitPricePaise: 100_000 }], 0);
  const splitCash = parseFixedDecimal('600', 2);
  const splitCredit = parseFixedDecimal('400', 2);
  assert.equal(splitInvoice.totalPaise, 100_000, '₹1,000 item computes 100,000 paise');
  assert.equal(splitCash + splitCredit, splitInvoice.totalPaise, '₹600 Cash + ₹400 Credit equals ₹1,000.00 exactly');
  assert.notEqual(parseFixedDecimal('599.99', 2) + splitCredit, splitInvoice.totalPaise, '1-paisa short split does not match invoice total');
  assert.notEqual(parseFixedDecimal('600.01', 2) + splitCredit, splitInvoice.totalPaise, '1-paisa excess split does not match invoice total');
  check(true, 'split-payment arithmetic enforces exact ₹1,000 = ₹600 Cash + ₹400 Credit paise parity');

  // --- the shared fixtures still agree with this reference -----------------
  const fixtures = JSON.parse(readFileSync('packages/business-domain/fixtures/native-invoices.json', 'utf8'));
  for (const fixture of fixtures) {
    const expected = reference([{ quantityMilli: fixture.quantity, unitPricePaise: fixture.price }], fixture.bps);
    assert.equal(String(expected.lineTotals[0]), String(fixture.line), fixture.name);
    assert.equal(String(expected.tax), String(fixture.tax), fixture.name);
    assert.equal(String(expected.total), String(fixture.total), fixture.name);
  }
  check(true, `all ${fixtures.length} shared fixtures agree with the Rust formula`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(`\n${checks} money contract checks passed`);
