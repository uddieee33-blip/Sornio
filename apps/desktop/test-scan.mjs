import test from 'node:test';
import assert from 'node:assert/strict';
import { findCode, scanNeedsQuantity } from './src/scan.ts';

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
test('duplicates are exposed rather than silently selected', () => {
  assert.deepEqual(findCode(products, 'AbC').map(p => p.id), ['three', 'four']);
});
test('only pieces auto-increment; all other units ask for quantity', () => {
  assert.equal(scanNeedsQuantity(products[0]), false);
  for (const product of products.slice(1, 4)) assert.equal(scanNeedsQuantity(product), true);
});
