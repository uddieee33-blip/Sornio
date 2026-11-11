import test from 'node:test';
import assert from 'node:assert/strict';
import { countDraft, countStorageKey, displayCount, validateCount } from './src/stock-count-draft.ts';
import { stockCounts } from '../../apps/mobile/src/storage/stockCounts.ts';
const scope = { businessId:'shop', actorId:'owner', mode:'demo' };
test('offline counts preserve measured quantities without float arithmetic', () => {
  const d = countDraft(scope, 'rice', '10000', '1.255', '2026-11-12T00:00:00Z');
  assert.equal(d.countedMilli, '1255'); assert.equal(displayCount(d.countedMilli), '1.255');
  for (const bad of ['-1', '1e3', '1.0001', 'NaN']) assert.throws(() => countDraft(scope, 'rice', '10000', bad, d.snapshotAt));
});
test('storage keys isolate mode, user, business and product without punctuation collisions', () => {
  const a = countStorageKey(scope, 'a.b');
  assert.notEqual(a, countStorageKey(scope, 'a-b'));
  assert.notEqual(a, countStorageKey({ ...scope, mode:'live' }, 'a.b'));
  assert.notEqual(a, countStorageKey({ ...scope, actorId:'cashier' }, 'a.b'));
  assert.notEqual(a, countStorageKey({ ...scope, businessId:'other' }, 'a.b'));
});
test('persistent port reopens drafts, rejects corrupt or foreign data, and propagates save failure', async () => {
  const data = new Map(); const port = { get: async k => data.get(k) ?? null, set: async (k,v) => { data.set(k,v); }, delete: async k => { data.delete(k); } };
  const d = countDraft(scope, 'rice', '1000', '0', '2026-11-12T00:00:00Z');
  await stockCounts(port, scope).save(d); assert.deepEqual(await stockCounts(port, scope).read('rice'), d);
  assert.throws(() => validateCount(d, { ...scope, actorId:'other' }, 'rice'));
  data.set(countStorageKey(scope,'rice'), '{}'); await assert.rejects(stockCounts(port,scope).read('rice'));
  await assert.rejects(stockCounts({ ...port, set: async () => { throw new Error('Device full'); } },scope).save(d));
  await stockCounts(port,scope).remove('rice'); assert.equal(await stockCounts(port,scope).read('rice'), null);
});
test('oversized secure records are rejected before JSON parsing', async () => {
  const port = { get: async () => ' '.repeat(601), set: async () => {}, delete: async () => {} };
  await assert.rejects(stockCounts(port,scope).read('rice'), /too large/);
});
