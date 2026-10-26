/**
 * Verify the stock ledger.
 *
 * A stock figure is the one number a shopkeeper will check with their own eyes,
 * so it cannot be a promise — it has to be arithmetic that runs, in front of
 * them, on the same code the counter uses. This script compiles `lib/inventory`
 * with the project's own TypeScript and walks the exact scenario an owner
 * describes when they are deciding whether to trust the software:
 *
 *   • 108 packets of kidney beans on the shelf, three sold → the screen says 105;
 *   • a delivery raises it, and the ledger says how much and from whom;
 *   • a re-count that finds a shortage records the difference, not a new truth;
 *   • nothing leaves the ledger without a reason, and no movement is written
 *     for a change of zero units;
 *   • the shelf can never go negative, whatever arrives out of order;
 *   • every movement's running balance is the number the item shows;
 *   • a figure edited outside the ledger is *reported*, never silently accepted.
 *
 *   npm run verify:inventory
 *
 * No network, no test framework, no mocks: it imports the real module.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-inventory-'));

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

console.log('Compiling the inventory engine…');

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
      files: [join(root, 'lib/inventory/index.ts')],
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
const I = require(join(outDir, 'lib/inventory/index.js'));

/** A tiny clock so the test reads like the shop's day, not like a machine. */
let tick = 0;
const at = (minutes) => new Date(Date.UTC(2026, 9, 6, 9, minutes)).toISOString();
const nextId = () => `mv-${(tick += 1)}`;

// --- The scenario the owner actually described -------------------------------
check('108 packets of kidney beans, three sold, becomes 105', () => {
  const opening = I.buildMovement({
    id: nextId(),
    productId: 'p-kidney',
    productName: 'Kidney beans — 1 kg',
    at: at(0),
    reason: 'opening',
    delta: 108,
    balanceBefore: 0,
    note: 'Opening count 108 packets',
    unit: 'packet',
  });
  assert(opening, 'the opening count writes a movement');
  assertEqual(opening.balance, 108, 'the shelf starts at 108');

  const sale = I.buildMovement({
    id: nextId(),
    productId: 'p-kidney',
    productName: 'Kidney beans — 1 kg',
    at: at(30),
    reason: 'sale',
    delta: -3,
    balanceBefore: opening.balance,
    note: 'Sold — 3 × Kidney beans',
    reference: 'sale-1',
    unit: 'packet',
  });
  assert(sale, 'the sale writes a movement');
  assertEqual(sale.delta, -3, 'three packets left the shelf');
  assertEqual(sale.balance, 105, 'the shelf says 105');
  assertEqual(
    I.describeStockChange(sale),
    'Kidney beans — 1 kg: 108 → 105 packets',
    'and the counter can say so in one sentence',
  );
  assertEqual(
    I.describeStockChange({ ...sale, delta: -1, balance: 107 }),
    'Kidney beans — 1 kg: 108 → 107 packet',
    'one packet is not "one packets"',
  );
});

// --- A full, realistic history ------------------------------------------------
check('a delivery, a sale and a re-count all land as one running balance', () => {
  let ledger = [];
  const add = (movement) => {
    ledger = I.pushMovements(ledger, [movement]);
    return ledger[0];
  };

  add(I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Kidney beans', at: at(0), reason: 'opening', delta: 108, balanceBefore: 0, note: 'Opening count 108', unit: 'packet' }));
  add(I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Kidney beans', at: at(30), reason: 'sale', delta: -3, balanceBefore: 108, note: 'Sold 3', reference: 'sale-1', unit: 'packet' }));
  const inward = add(I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Kidney beans', at: at(120), reason: 'goods-inward', delta: 24, balanceBefore: 105, note: 'Goods received from Sharma Traders — 24 packets', reference: 'Sharma Traders', unit: 'packet' }));
  assertEqual(inward.balance, 129, 'the delivery raises 105 to 129');
  const count = add(I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Kidney beans', at: at(180), reason: 'count', delta: -1, balanceBefore: 129, note: 'Shelf re-counted — one packet torn', reference: 'Owner correction', unit: 'packet' }));
  assertEqual(count.balance, 128, 'the re-count settles at 128');

  assertEqual(ledger.length, 4, 'four movements, no more and no fewer');
  assertEqual(ledger[0].id, count.id, 'newest movement first');

  const history = I.movementsForProduct(ledger, 'p1');
  assertEqual(history.length, 4, 'the item keeps its whole history');
  assertEqual(I.movementsForProduct(ledger, 'p2').length, 0, 'and another item sees none of it');

  // The ledger must agree with the item's own on-hand figure.
  const reconciled = I.reconcileLedger([{ id: 'p1', name: 'Kidney beans', itemType: 'product', stock: 128 }], ledger);
  assert(reconciled.ok, 'the shelf and the ledger agree');
  assertEqual(reconciled.movements, 4, 'all four movements were checked');
  assertEqual(reconciled.unchained.length, 0, 'nothing is left unexplained');
});

// --- The ledger cannot be padded ---------------------------------------------
check('a change of zero units writes no movement at all', () => {
  assertEqual(
    I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Soap', at: at(5), reason: 'count', delta: 0, balanceBefore: 12, note: 'nothing happened' }),
    null,
    'an empty line is not a movement',
  );
  const untouched = I.pushMovements([], [null, undefined]);
  assertEqual(untouched.length, 0, 'and it never reaches the ledger');
});

// --- Loose goods ---------------------------------------------------------------
check('weighed goods keep three decimals without float dust', () => {
  const weighed = I.buildMovement({ id: nextId(), productId: 'p5', productName: 'Loose almonds', at: at(10), reason: 'sale', delta: -1.505, balanceBefore: 12, note: 'Sold 1.505 kg', unit: 'kg' });
  assertEqual(weighed.balance, 10.495, '12 kg minus 1.505 kg is 10.495 kg');
  assertEqual(I.balanceAfter(10.495, 0.1 + 0.2), 10.795, 'binary float dust never reaches the shelf');
  assertEqual(I.formatUnits(105), '105', 'whole packets read as whole numbers');
  assertEqual(I.formatUnits(10.5), '10.5', 'weighed goods keep their decimals');
});

// --- The shelf can never go negative ------------------------------------------
check('stock never goes below zero, whatever arrives out of order', () => {
  assertEqual(I.balanceAfter(2, -5), 0, 'selling more than the shelf holds clamps at zero');
  assertEqual(I.balanceAfter(-4, 10), 6, 'a corrupt reading repairs to a real number');
  assertEqual(I.balanceAfter(5, Number.NaN), 5, 'a non-number cannot destroy the count');
});

// --- Disagreement is reported, never hidden -----------------------------------
check('a figure edited outside the ledger is named, not swallowed', () => {
  const ledger = [
    I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Kidney beans', at: at(0), reason: 'opening', delta: 108, balanceBefore: 0, note: 'Opening 108' }),
    I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Kidney beans', at: at(30), reason: 'sale', delta: -3, balanceBefore: 108, note: 'Sold 3' }),
  ];
  const tampered = I.reconcileLedger([{ id: 'p1', name: 'Kidney beans', itemType: 'product', stock: 90 }], ledger);
  assert(!tampered.ok, 'a shelf figure with no movement behind it fails the check');
  assertEqual(tampered.mismatches.length, 1, 'the item is reported');
  assertEqual(tampered.mismatches[0].onHand, 90, 'with the figure on screen');
  assertEqual(tampered.mismatches[0].ledgerBalance, 105, 'and the figure the ledger can account for');

  const legacy = I.reconcileLedger([{ id: 'p9', name: 'Old stock', itemType: 'product', stock: 40 }], []);
  assert(legacy.ok, 'an item with no history is not called corrupt');
  assertEqual(legacy.unchained.length, 1, 'it is listed as unchecked instead — legacy data is admitted, not invented');

  const services = I.reconcileLedger([{ id: 's1', name: 'Web design', itemType: 'service', stock: 0 }], []);
  assertEqual(services.items, 0, 'a service has no shelf, so it is not counted as an item');
});

// --- Reorder, valuation, and the ledger limit ---------------------------------
check('reorder flags, valuation and the ledger cap behave', () => {
  const products = [
    { id: 'p1', name: 'Beans', itemType: 'product', status: 'Active', stock: 5, reorderLevel: 5, cost: 100 },
    { id: 'p2', name: 'Rice', itemType: 'product', status: 'Active', stock: 60, reorderLevel: 10, cost: 50 },
    { id: 'p3', name: 'Inactive gum', itemType: 'product', status: 'Inactive', stock: 0, reorderLevel: 4, cost: 20 },
    { id: 's1', name: 'Haircut', itemType: 'service', status: 'Active', stock: 0, reorderLevel: 0, cost: 0 },
  ];
  assertEqual(I.lowStockItems(products).length, 1, 'only the item at or below its reorder level is flagged');
  assertEqual(I.lowStockItems(products)[0].id, 'p1', 'and it is the right one');
  assertEqual(I.stockValueAtCost(products), 5 * 100 + 60 * 50, 'shelf value counts stock at cost, and never a service');

  const total = I.STOCK_LEDGER_LIMIT + 25;
  const flood = Array.from({ length: total }, (_, index) =>
    I.buildMovement({
      id: `mv-${index}`,
      productId: 'p1',
      productName: 'Beans',
      at: new Date(Date.UTC(2026, 9, 6, 9, 0) + index * 60_000).toISOString(),
      reason: 'sale',
      delta: -1,
      balanceBefore: total,
      note: 'Sold 1',
    }),
  );
  const capped = I.pushMovements([], flood);
  assertEqual(capped.length, I.STOCK_LEDGER_LIMIT, 'the ledger is capped so one device cannot fill the shop’s storage');
  assertEqual(capped[0].id, `mv-${total - 1}`, 'and the newest movement is kept');
  assertEqual(capped[capped.length - 1].id, 'mv-25', 'the oldest are the ones dropped');

  // A device that syncs an old movement must not push it to the top.
  const outOfOrder = I.pushMovements(
    [I.buildMovement({ id: 'mv-new', productId: 'p1', productName: 'Beans', at: at(600), reason: 'sale', delta: -1, balanceBefore: 10, note: 'now' })],
    [I.buildMovement({ id: 'mv-old', productId: 'p1', productName: 'Beans', at: at(0), reason: 'opening', delta: 11, balanceBefore: 0, note: 'then' })],
  );
  assertEqual(outOfOrder[0].id, 'mv-new', 'the ledger stays in time order, not arrival order');
});

// --- The counter's sentence ----------------------------------------------------
check('the sale confirmation reads like a shopkeeper talking', () => {
  const sale = I.buildMovement({ id: nextId(), productId: 'p1', productName: 'Kidney beans', at: at(30), reason: 'sale', delta: -3, balanceBefore: 108, note: 'Sold 3', unit: 'packet' });
  assertEqual(I.describeStockChange(sale), 'Kidney beans: 108 → 105 packets', 'in and out in one line');
});

// --- Wording the owner reads ---------------------------------------------------
check('every reason has owner-facing wording, and units are never invented', () => {
  const reasons = ['opening', 'sale', 'goods-inward', 'count', 'return'];
  for (const reason of reasons) {
    assert(typeof I.MOVEMENT_LABEL[reason] === 'string' && I.MOVEMENT_LABEL[reason].length > 2, `${reason} has a label`);
  }
  assertEqual(I.unitFor('product', '  kg '), 'kg', 'a unit is trimmed');
  assertEqual(I.unitFor('product', ''), undefined, 'an empty unit is not a unit');
  assertEqual(I.unitFor('service', 'hour'), undefined, 'a service has no stock unit');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} verification group${passed === 1 ? '' : 's'} passed${failed > 0 ? `, ${failed} failed` : ''}.`);
if (failed > 0) process.exit(1);
