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

test('parses realistic bicycle, toys, tricycles, walkers and accessories pilot catalog CSV', () => {
  const csv = [
    'name,sku,unit,price_rupees,opening_stock',
    'Hero Ranger 26T Mountain Bicycle,0089011100001,pcs,7450.00,4',
    'Kids Steel Tricycle with Canopy & Bell,0089011100002,pcs,2499.00,6',
    'Musical Folding Baby Walker (8-Wheel),0089011100003,pcs,1850.50,8',
    'Battery Ride-On Toy Jeep 12V,0089011100004,pcs,9200.00,2',
    'Alloy Bicycle Bell & LED Tail Light Combo,0089011100005,pcs,320.00,25',
    'Loose Galvanised Spokes Bundle,,pcs,8.50,200',
  ].join('\n');
  const result = parseProductCatalogCsv(csv);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 6);
  assert.equal(result.rows[0].sku, '0089011100001');
  assert.equal(result.rows[0].unitPricePaise, 745000);
  assert.equal(result.rows[1].unitPricePaise, 249900);
  assert.equal(result.rows[2].unitPricePaise, 185050);
  assert.equal(result.rows[3].unitPricePaise, 920000);
  assert.equal(result.rows[4].unitPricePaise, 32000);
  assert.equal(result.rows[5].sku, '');
  assert.equal(result.rows[5].unitPricePaise, 850);
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
