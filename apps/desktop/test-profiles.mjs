import test from 'node:test';
import assert from 'node:assert/strict';
import { stockAlerts } from '../../packages/business-domain/src/stock-alerts.ts';
import { BUSINESS_PROFILES, profileForPortal, supports } from '../../packages/business-domain/src/business-profiles.ts';
test('profiles expose implemented capabilities separately from planned work', () => {
  assert.equal(profileForPortal('kirana').id, 'grocery');
  assert.equal(profileForPortal('cafe').id, 'restaurant');
  assert.equal(supports(BUSINESS_PROFILES.restaurant, 'tables'), false);
  for (const profile of Object.values(BUSINESS_PROFILES)) {
    assert(profile.onboarding.length > 0);
    for (const feature of profile.planned) assert.equal(supports(profile, feature), false);
  }
});
test('restock planning respects selling units and exact measured quantities', () => {
  const items = [
    { id:'rice', name:'Rice', sku:'001', unit:'kg', stockMilli:1250 },
    { id:'salt', name:'Salt', sku:'002', unit:'kg', stockMilli:0 },
    { id:'soap', name:'Soap', sku:'003', unit:'pcs', stockMilli:1000 },
    { id:'flour', name:'Flour', sku:'004', unit:'kg', stockMilli:5000 },
  ];
  const original = structuredClone(items);
  const alerts = stockAlerts(items, 'kg', 5000);
  assert.deepEqual(alerts.map(a => [a.product.id,a.missingMilli,a.status]), [['salt',5000,'empty'],['rice',3750,'low']]);
  assert.deepEqual(items, original);
  for (const invalid of [0,-1,1.2,NaN,Infinity,9_000_000_000_001]) assert.throws(() => stockAlerts(items,'kg',invalid));
});
