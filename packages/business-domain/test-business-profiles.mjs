import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_PROFILES, hasCapability, reorderItems } from './src/business-profiles.ts';
test('profiles expose implemented capabilities without enabling planned verticals', () => {
  for (const p of Object.values(BUSINESS_PROFILES)) assert.equal(p.available.some(c => p.planned.includes(c)), false);
  assert.equal(hasCapability('kirana', 'stockReview'), true);
  assert.equal(hasCapability('cafe', 'tables'), false);
  assert.equal(hasCapability('gym', 'attendance'), false);
});
test('grocery stock review isolates units and preserves source inventory', () => {
  const rows = [{ id:'a', name:'Rice', sku:'001', unit:'kg', stockMilli:1250 }, { id:'b', name:'Cycles', sku:'002', unit:'pcs', stockMilli:1000 }];
  assert.deepEqual(reorderItems(rows, 'kg', 1250).map(r => r.id), ['a']);
  assert.equal(rows.length, 2); assert.equal(reorderItems(rows, 'kg', 1249).length, 0);
  assert.throws(() => reorderItems(rows, 'kg', 1.25)); assert.throws(() => reorderItems(rows, 'unknown', 1000));
});
