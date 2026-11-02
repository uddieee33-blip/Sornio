/**
 * Verify the scanning engine against published symbol tables.
 *
 * Barcodes are one of the few places in this product where "looks right" is not
 * good enough: a label that a scanner cannot read is worse than no label, and a
 * check digit that is not checked is a wrong bill waiting to happen. So the two
 * pure modules are verified against examples published in the symbology
 * specifications — not against themselves.
 *
 *   npm run verify:scanning
 *
 * The script compiles `lib/scanning/barcodes.ts` + `encoder.ts` with the
 * project's own TypeScript into a temp directory and asserts, among others:
 *
 *   • GTIN check digits for known EAN-13 / EAN-8 / UPC-A / ITF-14 codes;
 *   • the EAN-13 guard, parity and L/G/R structure, decoded back byte for byte;
 *   • Code 128's start, switch and stop patterns, and the worked example from
 *     the specification (`PJJ123C` → check symbol 54 under Start A);
 *   • the in-store weigh-label layout (build → validate → parse → reprint).
 *
 * No network, no build step, no test framework — the same idea as the rest of
 * this repository: verify reality, and never fabricate a pass.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-scanning-'));

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

console.log('Compiling the scanning engine…');

/**
 * Compile with the project's own path aliases so the scan *resolution* and
 * ticket logic can be exercised too — those are the modules that turn a read
 * into a bill, and they import the catalogue types through `@/`.
 */
const tsconfig = join(outDir, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'es2020',
        module: 'node16',
        moduleResolution: 'node16',
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        outDir,
        rootDir: root,
        paths: { '@/*': [`${relative(outDir, root)}/*`] },
      },
      files: [
        join(root, 'lib/scanning/barcodes.ts'),
        join(root, 'lib/scanning/encoder.ts'),
        join(root, 'lib/scanning/match.ts'),
        join(root, 'lib/scanning/counter.ts'),
        join(root, 'lib/scanning/device.ts'),
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
  stdio: ['ignore', 'inherit', 'inherit'],
});

const require = createRequire(import.meta.url);
const B = require(join(outDir, 'lib/scanning/barcodes.js'));
const E = require(join(outDir, 'lib/scanning/encoder.js'));
const M = require(join(outDir, 'lib/scanning/match.js'));
const C = require(join(outDir, 'lib/scanning/counter.js'));
const D = require(join(outDir, 'lib/scanning/device.js'));
const { demoProducts } = require(join(outDir, 'lib/business-data.js'));

// --- Published GTIN check digits -------------------------------------------
check('GTIN check digits match published retail codes', () => {
  assertEqual(B.gtinCheckDigit('400638133393'), 1, 'EAN-13 4006381333931');
  assertEqual(B.gtinCheckDigit('590123412345'), 7, 'EAN-13 5901234123457');
  assertEqual(B.gtinCheckDigit('9638507'), 4, 'EAN-8 96385074');
  assertEqual(B.gtinCheckDigit('03600029145'), 2, 'UPC-A 036000291452');
  assertEqual(B.gtinCheckDigit('1540014128876'), 3, 'ITF-14 15400141288763');
  assert(B.isValidGtin('4006381333931'), 'a valid code is accepted');
  assert(!B.isValidGtin('4006381333932'), 'a mistyped code is refused');
});

// --- EAN-13 structure ------------------------------------------------------
check('EAN-13 guard bars, parity and digits survive a round-trip decode', () => {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map((pattern) => pattern.replace(/[01]/g, (bit) => (bit === '1' ? '0' : '1')));
  const G = R.map((pattern) => [...pattern].reverse().join(''));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  for (const value of ['4006381333931', '5901234123457', '8901030865183', '1234567890128']) {
    const symbol = E.encodeEan13(value);
    const bits = symbol.modules.slice(symbol.barStart, symbol.barEnd).join('');
    assertEqual(bits.length, 95, `${value}: 95 modules`);
    assertEqual(bits.slice(0, 3), '101', `${value}: left guard`);
    assertEqual(bits.slice(45, 50), '01010', `${value}: centre guard`);
    assertEqual(bits.slice(92), '101', `${value}: right guard`);

    const parity = [];
    let left = '';
    for (let index = 0; index < 6; index += 1) {
      const chunk = bits.slice(3 + index * 7, 10 + index * 7);
      if (L.includes(chunk)) {
        parity.push('L');
        left += L.indexOf(chunk);
      } else if (G.includes(chunk)) {
        parity.push('G');
        left += G.indexOf(chunk);
      } else {
        throw new Error(`${value}: left digit ${index} is not a valid L/G element set`);
      }
    }
    let right = '';
    for (let index = 0; index < 6; index += 1) {
      const chunk = bits.slice(50 + index * 7, 57 + index * 7);
      if (!R.includes(chunk)) throw new Error(`${value}: right digit ${index} is not a valid R element set`);
      right += R.indexOf(chunk);
    }
    const first = PARITY.indexOf(parity.join(''));
    assert(first >= 0, `${value}: parity ${parity.join('')} is a valid EAN-13 parity`);
    assertEqual(`${first}${left}${right}`, value, `${value}: decodes back to the input`);
  }
});

check('EAN-13 refuses a wrong check digit; EAN-8 and UPC-A encode correctly', () => {
  let threw = false;
  try {
    E.encodeEan13('4006381333932');
  } catch {
    threw = true;
  }
  assert(threw, 'a bad check digit must not be printable');

  assertEqual(E.encodeEan8('96385074').value, '96385074', 'EAN-8 value');
  assertEqual(E.encodeEan8('96385074').barEnd - E.encodeEan8('96385074').barStart, 67, 'EAN-8 is 67 modules');
  const upc = E.encodeUpcA('036000291452');
  assertEqual(upc.value, '036000291452', 'UPC-A value');
  assertEqual(upc.barEnd - upc.barStart, 95, 'UPC-A is drawn as a 95-module EAN-13');
});

// --- Code 128 --------------------------------------------------------------
check('Code 128 start, switch and stop patterns match the specification', () => {
  assertEqual(E.encodeCode128('A').modules.slice(10, 21).join(''), '11010010000', 'START B');
  assertEqual(E.encodeCode128('0018').modules.slice(10, 21).join(''), '11010011100', 'START C');
  const single = E.encodeCode128('A');
  assertEqual(single.modules.slice(single.barEnd - 13, single.barEnd).join(''), '1100011101011', 'stop pattern');

  // Published symbols: value 33 (A) = 10100011000, value 4 ($) = 10010001100,
  // value 58 (Z) = 11101100010 — START B, then A, $, Z, check, stop.
  const symbols = E.encodeCode128('A$Z');
  const body = symbols.modules.slice(symbols.barStart, symbols.barEnd);
  assertEqual(body.slice(11, 22).join(''), '10100011000', 'value 33 (A)');
  assertEqual(body.slice(22, 33).join(''), '10010001100', 'value 4 ($)');
  assertEqual(body.slice(33, 44).join(''), '11101100010', 'value 58 (Z)');

  const mixed = E.encodeCode128('X0012345678Y');
  const mixedBody = mixed.modules.slice(mixed.barStart, mixed.barEnd);
  assertEqual(mixedBody.slice(22, 33).join(''), '10111011110', 'CODE C switch (value 99)');
  assertEqual(mixedBody.slice(88, 99).join(''), '10111101110', 'CODE B switch (value 100)');
});

check('Code 128 check symbol matches the published worked example', () => {
  // The specification's example: Start A + P J J 1 2 3 C ⇒ check value 54.
  // With Start B (value 104) the same data yields 55 — the difference is the
  // start symbol itself, which is exactly what the calculation must capture.
  const widths = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232'];

  const symbol = E.encodeCode128('PJJ123C');
  const modules = symbol.modules.slice(symbol.barStart, symbol.barEnd);
  const values = [];
  for (let index = 0; index < (modules.length - 13) / 11; index += 1) {
    const bits = modules.slice(index * 11, index * 11 + 11).join('');
    const runs = [];
    let run = 1;
    for (let position = 1; position < bits.length; position += 1) {
      if (bits[position] === bits[position - 1]) run += 1;
      else {
        runs.push(run);
        run = 1;
      }
    }
    runs.push(run);
    const found = widths.indexOf(runs.join(''));
    assert(found >= 0, `unknown symbol widths ${runs.join('')}`);
    values.push(found);
  }
  assertEqual(values.join(','), '104,48,42,42,17,18,19,35,55', 'symbol sequence and check symbol');
});

check('Code 128 packs long digit runs and leaves short ones alone', () => {
  const packed = E.encodeCode128('0018500410');
  assertEqual((packed.barEnd - packed.barStart - 13) / 11, 7, 'START C + five pairs + check');
  assertEqual(packed.modules.slice(packed.barStart, packed.barStart + 11).join(''), '11010011100', 'starts in Code C');
  const short = E.encodeCode128('12');
  assertEqual((short.barEnd - short.barStart - 13) / 11, 3, 'START C + one pair + check');
});

// --- In-store labels -------------------------------------------------------
check('Internal codes carry a Luhn check digit and stay scannable', () => {
  const internal = B.buildInternalCode(12345);
  assertEqual(internal, 'DK000123455', 'internal code layout');
  assert(B.isInternalCode(internal), 'minted code validates');
  assert(!B.isInternalCode('DK000123456'), 'a mistyped internal code is refused');
  assertEqual(E.encodeForLabel(internal).symbology, 'CODE128', 'internal codes print as Code 128');
  assertEqual(E.encodeForLabel('4006381333931').symbology, 'EAN-13', 'GTINs print as EAN-13');
});

check('In-store weigh labels build, validate, parse and reprint', () => {
  const weight = B.buildLooseCode({ mode: 'weight', itemNumber: 42, value: 1750 });
  assertEqual(weight.length, 13, 'a loose label is a real EAN-13');
  assert(B.isValidGtin(weight), 'the loose label carries a valid check digit');
  assertEqual(B.parseLooseCode(weight).grams, 1750, 'grams survive the round trip');
  assertEqual(B.parseLooseCode(weight).itemNumber, '00042', 'item number survives the round trip');
  const priced = B.buildLooseCode({ mode: 'price', itemNumber: 7, value: 240 });
  assertEqual(B.parseLooseCode(priced).price, 240, 'price labels round-trip too');
  assertEqual(B.parseLooseCode('4006381333931'), null, 'a retail GTIN is not a loose label');
  assertEqual(E.encodeForLabel(weight).symbology, 'EAN-13', 'loose labels print as in-store EAN-13');
});

// --- Reading rules ---------------------------------------------------------
check('The code profiler names what it read and flags a misread', () => {
  assertEqual(B.describeCode('4006381333931').kind, 'retail', 'a GTIN is a retail code');
  assertEqual(B.describeCode('4006381333932').valid, false, 'a bad check digit is invalid');
  assertEqual(B.guessSymbology('036000291452'), 'UPC-A', '12 digits with a valid check digit is UPC-A');
  assertEqual(B.guessSymbology('96385074'), 'EAN-8', '8 digits is EAN-8');
  assertEqual(B.describeCode(']C14006381333931').code, '4006381333931', 'AIM prefix stripped');
  assertEqual(B.describeCode('   ').valid, false, 'an empty read is invalid');
  assert(B.looksLikeCode('8901030865185'), 'a plausible code is accepted');
  assert(!B.looksLikeCode('a'), 'a stray keystroke is not a code');
});

check('Duplicate codes are reported rather than silently billed', () => {
  const report = B.duplicateCodeReport([
    { id: 'a', name: 'Item A', barcode: '4006381333931' },
    { id: 'b', name: 'Item B', barcode: '4006381333931' },
    { id: 'c', name: 'Item C', barcode: '5901234123457' },
  ]);
  assertEqual(report.length, 1, 'one duplicated code found');
  assertEqual(report[0].items.length, 2, 'both claimants listed');
});

// --- Scan resolution against the shipped catalogue -------------------------
check('A scanned packet resolves to the item that carries its barcode', () => {
  const soap = demoProducts.find((product) => product.barcode === '8901234567890');
  assert(soap, 'the demo catalogue ships a coded item');

  const packet = M.resolveScan('8901234567890', demoProducts);
  assertEqual(packet.status, 'matched', 'a printed barcode matches');
  assertEqual(packet.product.id, soap.id, 'the right item is billed');
  assertEqual(packet.via, 'barcode', 'matched on the barcode');
  assertEqual(packet.quantity, 1, 'a packet is one unit');

  const internal = M.resolveScan('dk000000042', demoProducts);
  assertEqual(internal.status, 'matched', 'the internal code matches case-insensitively');
  assertEqual(internal.via, 'internal', 'matched on the shop’s own code');
  assertEqual(internal.product.looseMode, 'weight', 'the loose item is the one found');
});

check('A weigh-scale label bills the weight it carries, not a typed guess', () => {
  const almonds = demoProducts.find((product) => product.id === 'p5');
  const label = B.buildLooseCode({ mode: 'weight', itemNumber: 1, value: 3000 });
  assertEqual(label, '2100001030001', 'the printed label');

  const weighed = M.resolveScan(label, demoProducts);
  assertEqual(weighed.status, 'matched', 'the scale label matches its item');
  assertEqual(weighed.product.id, almonds.id, 'the loose item is the one found');
  assertEqual(weighed.via, 'loose', 'matched through the scale number');
  assertEqual(weighed.quantity, 3, 'three kilograms');
  assertEqual(weighed.unit, 'kg', 'billed in kilograms');
  assert(/3 kg/.test(weighed.reason), 'the counter is told why');

  // The scale number is the *label’s* item number. Reading it out of the
  // internal code instead (its digits happen to be 00000004 here) would make a
  // label the shop just printed for item 1 unresolvable — so the fallback must
  // only ever apply to records that predate scale numbers, and must never
  // silently pick the wrong item.
  const legacy = { ...almonds, scaleNumber: undefined };
  assertEqual(M.resolveScan(label, [legacy]).status, 'unmatched', 'a label is not guessed from the code digits');
  assertEqual(M.resolveScan(label, [{ ...legacy, scaleNumber: 1 }]).status, 'matched', 'the scale number is what names the item');
});

check('A misread, a duplicate and a stranger are all refused honestly', () => {
  const mistyped = M.resolveScan('8901234567891', demoProducts);
  assertEqual(mistyped.status, 'invalid', 'a failed check digit is refused');
  assert(mistyped.reason.includes('never become a wrong bill'), 'and the counter is told why');

  const twins = [
    { id: 'x1', name: 'Duplicate A', category: 'Test', itemType: 'product', sellingPrice: 10, cost: 5, stock: 1, reorderLevel: 0, status: 'Active', barcode: '8905678901234' },
    { id: 'x2', name: 'Duplicate B', category: 'Test', itemType: 'product', sellingPrice: 10, cost: 5, stock: 1, reorderLevel: 0, status: 'Active', barcode: '8905678901234' },
  ];
  const ambiguous = M.resolveScan('8905678901234', twins);
  assertEqual(ambiguous.status, 'ambiguous', 'two claimants are refused, not guessed');
  assertEqual(ambiguous.candidates.length, 2, 'both claimants are named');

  const unknown = M.resolveScan('8906789012345', demoProducts);
  assertEqual(unknown.status, 'unmatched', 'an unknown code is a question, not a sale');
  assert(unknown.reason.includes('No item'), 'the reason is plain language');

  const archived = M.resolveScan('8903456789012', demoProducts);
  assertEqual(archived.status, 'unmatched', 'an inactive item cannot be billed by scan');
  assertEqual(M.resolveScan('8903456789012', demoProducts, { includeInactive: true }).status, 'matched', 'unless the caller asks for it');
});

check('Repeat scans stack on the ticket; weighed lines never merge', () => {
  const soap = demoProducts.find((product) => product.barcode === '8901234567890');
  const almonds = demoProducts.find((product) => product.id === 'p5');

  let ticket = C.applyScanToTicket([], C.lineFromProduct(soap, 1));
  assertEqual(ticket.length, 1, 'one line after one scan');
  ticket = C.applyScanToTicket(ticket, C.lineFromProduct(soap, 1));
  assertEqual(ticket.length, 1, 'the same packet does not add a second line');
  assertEqual(ticket[0].quantity, 2, 'it stacks to two');
  ticket = C.applyScanToTicket(ticket, C.lineFromProduct(soap, 1));
  assertEqual(ticket[0].quantity, 3, 'and to three');

  const weighed = { ...C.lineFromProduct(almonds, 3), mergeable: false };
  ticket = C.applyScanToTicket(ticket, weighed);
  const twoWeighings = C.applyScanToTicket(ticket, { ...C.lineFromProduct(almonds, 1.5), mergeable: false });
  assertEqual(twoWeighings.length, 3, 'two weighings are two lines, not 4.5 kg of almonds');
  assertEqual(C.ticketUnits(twoWeighings), 3 + 3 + 1.5, 'units add up across the ticket');

  assertEqual(C.ticketTotal(ticket), 280 * 3 + 900 * 3, 'the ticket adds up');
  assertEqual(C.ticketTotal([{ quantity: 4.85, rate: 0.50 }]), 2.43, '4.85 x 0.50 rounds half-paise up to 2.43 like native billing');
  assertEqual(
    C.ticketTotal([
      { quantity: 1.5, rate: 0.01 },
      { quantity: 1.5, rate: 0.01 },
    ]),
    0.04,
    'ticketTotal sums rounded line paise instead of unrounded floats',
  );
  const corrected = C.setTicketQuantity(ticket, ticket[0].id, 1);
  assertEqual(corrected[0].quantity, 1, 'a cashier can correct the count');
  assertEqual(C.removeTicketLine(corrected, ticket[0].id).length, 1, 'and remove a line');
});

// --- The device test on the Devices tab --------------------------------------
check('a scanner is told apart from a person by the gaps between keystrokes', () => {
  // A keyboard-wedge scanner: ~3 ms between characters.
  const machine = D.readWedgeBurst('8901234567890', Array.from({ length: 12 }, () => 3));
  assertEqual(machine.verdict, 'machine', 'a fast, even burst is a scanner');
  assertEqual(machine.length, 13, 'every character is counted');
  assert(machine.summary.includes('That was a scanner'), 'and the owner is told plainly');

  // A person typing a 13-digit code: 150 ms apart.
  const human = D.readWedgeBurst('8901234567890', Array.from({ length: 12 }, () => 150));
  assertEqual(human.verdict, 'human', 'a slow burst is a person');
  assert(human.summary.includes('typed by hand'), 'and says so rather than claiming a fault');

  // A Bluetooth scanner on a weak link, or a shop PC under load.
  const unclear = D.readWedgeBurst('12345', [45, 50, 48, 52]);
  assertEqual(unclear.verdict, 'unclear', 'in-between speeds are reported as unclear, not rounded to a verdict');

  assertEqual(D.classifyKeystrokes([]), 'unclear', 'no gaps is not evidence of anything');
  assertEqual(D.WEDGE_MAX_GAP_MS < D.HUMAN_MIN_GAP_MS, true, 'the two thresholds leave room to be uncertain');
});

check('the scanner test reports the code the way the counter would read it', () => {
  const machine = D.readWedgeBurst('8901234567890', Array.from({ length: 12 }, () => 2));
  assertEqual(machine.elapsedMs, 24, 'total time is the sum of the gaps');
  assertEqual(machine.averageGapMs, 2, 'the average is what decides the verdict');
  assertEqual(machine.code, '8901234567890', 'the raw code comes back untouched for inspection');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} verification group${passed === 1 ? '' : 's'} passed${failed > 0 ? `, ${failed} failed` : ''}.`);
if (failed > 0) process.exit(1);
