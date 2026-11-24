import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProductCatalogCsv } from './src/csv-import.ts';

test('parses valid bicycle and spare-parts catalog CSV with exact integer paise and leading zeroes', () => {
  const csv = [
    'name,sku,unit,price_rupees,opening_stock',
    '"Atlas Goldline 26T, Black",0089011122233,pcs,6500.50,5',
    'Loose Brake Cable,,metre,45.25,50.500',
  ].join('\n');
  const result = parseProductCatalogCsv(csv);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], {
    lineNumber: 2,
    name: 'Atlas Goldline 26T, Black',
    sku: '0089011122233',
    unit: 'pcs',
    unitPricePaise: 650050,
    openingStockMilli: 5000,
  });
  assert.deepEqual(result.rows[1], {
    lineNumber: 3,
    name: 'Loose Brake Cable',
    sku: '',
    unit: 'metre',
    unitPricePaise: 4525,
    openingStockMilli: 50500,
  });
});

test('rejects duplicate SKUs, bad units, and malformed amounts with exact line numbers', () => {
  const csv = [
    'name,sku,unit,price_rupees,opening_stock',
    'Tube A,SKU-1,pcs,140.00,10',
    'Tube B,sku-1,pcs,150.00,10',
    'Bad Price,SKU-2,pcs,0,10',
    'Bad Unit,SKU-3,buckets,100.00,5',
  ].join('\n');
  const result = parseProductCatalogCsv(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 3);
  assert.equal(result.errors[0].lineNumber, 3);
  assert.equal(result.errors[1].lineNumber, 4);
  assert.equal(result.errors[2].lineNumber, 5);
});
