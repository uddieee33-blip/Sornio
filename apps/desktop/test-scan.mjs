import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCode,
  isRapidDuplicateScan,
  matchesBarcodeSuffix,
  normalizeScannedBarcode,
  scanNeedsQuantity,
} from './src/scan.ts';

const products = [
  { id: 'one', sku: '001234', unit: 'pcs' },
  { id: 'two', sku: '01234', unit: 'kg' },
  { id: 'three', sku: 'ABC', unit: 'litre' },
  { id: 'four', sku: 'abc', unit: 'metre' },
  { id: 'five', sku: '', unit: 'pcs' },
];

test('codes retain leading zeros and never match partial or product id', () => {
  assert.deepEqual(findCode(products, '001234').map(p => p.id), ['one']);
  assert.deepEqual(findCode(products, '1234'), []);
  assert.deepEqual(findCode(products, 'one'), []);
  assert.deepEqual(findCode(products, ''), []);
});

test('HID barcode normalization strips CR/LF/control chars while preserving leading zeroes', () => {
  assert.equal(normalizeScannedBarcode('  001234\r\n\t'), '001234');
  assert.deepEqual(findCode(products, '001234\r\n').map(p => p.id), ['one']);
});

test('barcode suffix matching respects configured Enter/Tab modes', () => {
  assert.equal(matchesBarcodeSuffix('Enter', 'enter'), true);
  assert.equal(matchesBarcodeSuffix('Tab', 'enter'), false);
  assert.equal(matchesBarcodeSuffix('Tab', 'tab'), true);
  assert.equal(matchesBarcodeSuffix('Enter', 'tab'), false);
  assert.equal(matchesBarcodeSuffix('Enter', 'enter_or_tab'), true);
  assert.equal(matchesBarcodeSuffix('Tab', 'enter_or_tab'), true);
  assert.equal(matchesBarcodeSuffix('Escape', 'enter_or_tab'), false);
});

test('rapid duplicate scan guard blocks hardware bounce while permitting deliberate repeated scans', () => {
  assert.equal(isRapidDuplicateScan('001234', 1000, '001234', 1120), true);
  assert.equal(isRapidDuplicateScan('001234', 1000, '001234', 1300), false);
  assert.equal(isRapidDuplicateScan('001234', 1000, '01234', 1050), false);
});

test('duplicates are exposed rather than silently selected', () => {
  assert.deepEqual(findCode(products, 'AbC').map(p => p.id), ['three', 'four']);
});

test('only pieces auto-increment; all other units ask for quantity', () => {
  assert.equal(scanNeedsQuantity(products[0]), false);
  for (const product of products.slice(1, 4)) assert.equal(scanNeedsQuantity(product), true);
});
