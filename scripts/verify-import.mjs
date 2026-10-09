#!/usr/bin/env node

/**
 * Verify the bulk import path.
 *
 * The migration story this protects: an owner has run another app for years,
 * exports a CSV there, and expects DukaanOS to take the whole catalogue and
 * the whole khata across — without re-scanning a single barcode and without
 * silently corrupting a record. This script compiles `lib/import` with the
 * project's own TypeScript and walks the scenarios an owner actually hits:
 *
 *   • DukaanOS's own product export opens in the importer unchanged;
 *   • the headers other apps print (`MRP`, `EAN`, `Qty`, `GST %`) map correctly;
 *   • shopkeeper-typed numbers (`₹1,299`, `12%`, `(50)`) parse;
 *   • a barcode with a wrong check digit is an error, never a silent save;
 *   • a code another item already carries marks the row a duplicate — the
 *     importer never overwrites an existing item;
 *   • a phone another customer already carries marks the row a duplicate;
 *   • opening stock and opening balances come across;
 *   • quoted cells, semicolon separators and a UTF-8 BOM all parse;
 *   • the downloadable templates parse back into one ready row each.
 *
 *   npm run verify:import
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
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-import-'));

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

console.log('Compiling the import engine…');

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
        rootDir: join(root, 'lib'),
        paths: { '@/*': [`${relative(outDir, root)}/*`] },
      },
      files: [join(root, 'lib/import/products.ts'), join(root, 'lib/import/customers.ts'), join(root, 'lib/export/headers.ts')],
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
const P = require(join(outDir, 'import/products.js'));
const C = require(join(outDir, 'import/customers.js'));
const CSV = require(join(outDir, 'import/csv.js'));
const H = require(join(outDir, 'export/headers.js'));

// ---------------------------------------------------------------- parser ----

check('quoted cells, embedded commas and newlines parse', () => {
  const table = P.parseProductsCsv('"Name","Notes"\r\n"Soap, handmade","line one\nline two"\r\n', []);
  assert(table.ok, 'should parse');
  assertEqual(table.rows.length, 1, 'one data row');
  assertEqual(table.rows[0].input.description, 'line one\nline two', 'newline inside quotes survives');
});

check('a UTF-8 BOM and semicolon separators parse', () => {
  const table = P.parseProductsCsv('\uFEFFName;Selling price\nSoap;120\n', []);
  assert(table.ok, 'should parse');
  assertEqual(table.rows[0].input.sellingPrice, 120, 'semicolon file maps price');
});

check('shopkeeper-typed numbers parse', () => {
  assertEqual(CSV.parseNumberCell('₹1,299'), 1299, 'rupee sign and grouping');
  assertEqual(CSV.parseNumberCell('12%'), 12, 'percent sign');
  assertEqual(CSV.parseNumberCell('(50)'), -50, 'accounting negative');
  assertEqual(CSV.parseNumberCell('abc'), null, 'garbage is null, not zero');
  assertEqual(CSV.parseNumberCell(''), null, 'empty is null');
});

// --------------------------------------------------------------- products ----

check("DukaanOS's own export format round-trips", () => {
  // The exact header row buildProductsCsv writes (lib/export/download.ts).
  const exported = [
    H.PRODUCT_CSV_HEADERS.join(','),
    'Handmade Soap,Personal Care,Product,120,80,50,10,Active',
  ].join('\r\n');
  const table = P.parseProductsCsv(exported, []);
  assert(table.ok, 'export parses');
  assertEqual(table.ready, 1, 'one ready row');
  assertEqual(table.rows[0].input.name, 'Handmade Soap', 'name survives');
  assertEqual(table.rows[0].input.sellingPrice, 120, 'price survives');
  assertEqual(table.rows[0].input.stock, 50, 'stock survives');
  assertEqual(table.rows[0].input.category, 'Personal Care', 'category survives');
  assertEqual(table.rows[0].input.status, 'Active', 'status survives');
});

check('other-app headers (Item Name, MRP, EAN, Qty, GST %) map', () => {
  const csv = ['Item Name,MRP,EAN,Qty,GST %,Category', 'Parle-G,20,8901234567890,500,5,Biscuits'].join('\n');
  const table = P.parseProductsCsv(csv, []);
  assert(table.ok, 'should parse');
  assertEqual(table.ready, 1, 'one ready row');
  const input = table.rows[0].input;
  assertEqual(input.name, 'Parle-G', 'name');
  assertEqual(input.sellingPrice, 20, 'MRP becomes selling price');
  assertEqual(input.barcode, '8901234567890', 'EAN becomes the barcode');
  assertEqual(input.stock, 500, 'Qty becomes stock');
  assertEqual(input.taxRate, 5, 'GST % becomes tax rate');
  assertEqual(input.category, 'Biscuits', 'category');
});

check('Vyapar-style stock, minimum and purchase-rate headers map', () => {
  const csv = [
    'Item Name,Sale Price,Purchase Rate,Opening Stock,Min Stock To Maintain,Barcode No.,GST %,Unit Name,Vendor Name',
    'Parle-G,20,15,500,25,8901234567890,5,pack,Local Foods',
  ].join('\n');
  const table = P.parseProductsCsv(csv, []);
  assert(table.ok, 'should parse');
  assertEqual(table.ready, 1, 'one ready row');
  const input = table.rows[0].input;
  assertEqual(input.sellingPrice, 20, 'sale price');
  assertEqual(input.cost, 15, 'purchase rate');
  assertEqual(input.stock, 500, 'opening stock');
  assertEqual(input.reorderLevel, 25, 'minimum stock');
  assertEqual(input.barcode, '8901234567890', 'barcode no');
  assertEqual(input.unit, 'pack', 'unit name');
  assertEqual(input.supplier, 'Local Foods', 'vendor name');
});

check('a retail barcode with a wrong check digit is an error, not a save', () => {
  // 8901234567890 is a valid EAN-13; …891 fails the check digit.
  const table = P.parseProductsCsv('Name,Barcode\nSoap,8901234567891\n', []);
  assert(table.ok, 'should parse');
  assertEqual(table.errors, 1, 'one error row');
  assertEqual(table.rows[0].status, 'error', 'row marked error');
  assert(/check digit/.test(table.rows[0].note), 'note names the check digit');
});

check('a DukaanOS internal code lands in the internal-code slot', () => {
  const table = P.parseProductsCsv('Name,Barcode\nSoap,DK000000018\n', []);
  assert(table.ok, 'should parse');
  assertEqual(table.rows[0].input.internalCode, 'DK000000018', 'internal code slot');
  assertEqual(table.rows[0].input.barcode, undefined, 'not treated as a retail barcode');
});

check('a code another item already carries is a duplicate, never an overwrite', () => {
  const existing = [{ name: 'Existing Soap', barcode: '8901234567890', internalCode: undefined }];
  const csv = ['Name,Barcode', 'New Soap,8901234567890', 'Other Soap,8901234567890'].join('\n');
  const table = P.parseProductsCsv(csv, existing);
  assert(table.ok, 'should parse');
  assertEqual(table.duplicates, 2, 'both clashing rows marked duplicate');
  assertEqual(table.ready, 0, 'nothing ready');
  assert(/Existing Soap already carries/.test(table.rows[0].note), 'note names the item that owns the code');
});

check('a row without a name is an error', () => {
  const table = P.parseProductsCsv('Name,Barcode\n,8901234567890\n', []);
  assert(table.ok, 'should parse');
  assertEqual(table.errors, 1, 'one error row');
  assertEqual(table.rows[0].note, 'Item name is required.', 'same message as the Add Item form');
});

check('duplicate SKUs are skipped against the catalogue and within the file', () => {
  const existing = [{ name: 'Existing shirt', sku: 'SHIRT-01' }];
  const csv = ['Name,SKU', 'New shirt,shirt-01', 'Other shirt,NEW-02', 'Another shirt,new-02'].join('\n');
  const table = P.parseProductsCsv(csv, existing);
  assert(table.ok, 'should parse');
  assertEqual(table.duplicates, 2, 'both duplicate SKU rows skipped');
  assertEqual(table.ready, 1, 'only the first unique SKU is ready');
  assert(/Existing shirt/.test(table.rows[0].note), 'catalogue collision is explained');
  assert(/Other shirt/.test(table.rows[2].note), 'within-file collision is explained');
});

check('a file without a Name column is a file-level error', () => {
  const table = P.parseProductsCsv('Foo,Bar\n1,2\n', []);
  assert(!table.ok, 'should refuse');
  assert(/Name/.test(table.error), 'error names the missing column');
});

check('the 5,000-row limit is enforced before import', () => {
  const csv = ['Name', ...Array.from({ length: 5001 }, (_, index) => `Item ${index + 1}`)].join('\n');
  const table = P.parseProductsCsv(csv, []);
  assert(!table.ok, 'oversized row count should be refused');
  assert(/5000/.test(table.error), 'error states the row limit');
});

check('the 2 MB file-size limit is enforced before parsing', () => {
  const csv = `Name\\n${'x'.repeat(CSV.IMPORT_MAX_BYTES + 1)}`;
  const table = P.parseProductsCsv(csv, []);
  assert(!table.ok, 'oversized file should be refused');
  assert(/2 MB/.test(table.error), 'error states the byte limit');
});

check('negative prices are rejected', () => {
  const table = P.parseProductsCsv('Name,Selling price\nSoap,-10\n', []);
  assert(table.ok, 'should parse');
  assertEqual(table.errors, 1, 'one error row');
  assertEqual(table.rows[0].note, 'One of the price, cost, stock, reorder or tax cells is not a valid number.', 'numeric errors have a clear preview note');
});

// -------------------------------------------------------------- customers ----

check('customers import with opening balances', () => {
  const csv = ['Name,Phone,Opening balance,Notes', 'Ramesh Kumar,9876543210,450,Owes for last month', 'Sita Devi,9123456789,-100,Shop owes her'].join('\n');
  const table = C.parseCustomersCsv(csv, []);
  assert(table.ok, 'should parse');
  assertEqual(table.ready, 2, 'two ready rows');
  assertEqual(table.rows[0].input.openingBalance, 450, 'balance comes across');
  assertEqual(table.rows[1].input.openingBalance, -100, 'a negative balance is allowed');
  assertEqual(table.rows[0].input.details, 'Owes for last month', 'notes come across');
});

check('a phone another customer already carries is a duplicate', () => {
  const existing = [{ name: 'Ramesh Kumar', phone: '9876543210' }];
  const csv = ['Name,Phone', 'Ramesh K,98765 43210', 'New Person,9000000001'].join('\n');
  const table = C.parseCustomersCsv(csv, existing);
  assert(table.ok, 'should parse');
  assertEqual(table.duplicates, 1, 'spacing in the phone still clashes');
  assertEqual(table.ready, 1, 'the new person is ready');
  assert(/Ramesh Kumar/.test(table.rows[0].note), 'note names the existing customer');
});

check('a customer row without a name or with a bad email is an error', () => {
  const csv = ['Name,Email', ',a@b.com', 'Good Name,not-an-email'].join('\n');
  const table = C.parseCustomersCsv(csv, []);
  assert(table.ok, 'should parse');
  assertEqual(table.errors, 2, 'both rows error');
  assertEqual(table.rows[0].note, 'Customer name is required.', 'same message as the Add Customer form');
  assertEqual(table.rows[1].note, 'Enter a valid email address.', 'same message as the Add Customer form');
  assertEqual(table.rows[1].input.name, '', 'invalid customer row cannot sneak into a bulk commit');
});

// -------------------------------------------------------------- templates ----

check('the products template reuses export columns and parses into one ready row', () => {
  assertEqual(
    JSON.stringify(P.PRODUCT_TEMPLATE_HEADERS.slice(0, H.PRODUCT_CSV_HEADERS.length)),
    JSON.stringify(H.PRODUCT_CSV_HEADERS),
    'the template begins with the exact product-export columns',
  );
  const table = P.parseProductsCsv(P.buildProductsTemplateCsv(), []);
  assert(table.ok, 'template parses');
  assertEqual(table.ready, 1, 'example row is ready');
  assertEqual(table.rows[0].input.barcode, '8901234567890', 'example barcode is a valid EAN-13');
});

check('the customers template reuses export columns and parses into one ready row', () => {
  assertEqual(
    JSON.stringify(C.CUSTOMER_TEMPLATE_HEADERS),
    JSON.stringify(H.CUSTOMER_CSV_HEADERS),
    'the customer template uses the exact customer-export columns',
  );
  const table = C.parseCustomersCsv(C.buildCustomersTemplateCsv(), []);
  assert(table.ok, 'template parses');
  assertEqual(table.ready, 1, 'example row is ready');
  assertEqual(table.rows[0].input.openingBalance, 450, 'example balance survives');
});

// ------------------------------------------------------------------ end ----

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log('The import path carries a catalogue and a khata across intact.');
