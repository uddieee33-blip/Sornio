import test from 'node:test';
import assert from 'node:assert/strict';
import { heldDraftInput } from './src/held-bills.ts';
const amounts = { cash: '600', upi: '', card: '', credit: '400' };
const draft = (quantity = '1.25', overrides = {}) => heldDraftInput([{ productId: 'rice', typedQuantity: quantity }], '0', 'retail', 'customer', { ...amounts, ...overrides }, { upi: '', card: '' }, 'Waiting');
test('held measured quantity and partial tender remain exact', () => {
  const result = draft(); assert.equal(result.lines[0].quantityMilli, 1250);
  assert.deepEqual(result.payments.map(p => p.amountPaise), [60000, 40000]);
});
test('underallocated unfinished bills may be held', () => assert.equal(draft('1', { credit: '' }).payments.length, 1));
test('malformed amounts and quantities are refused before persistence', () => {
  for (const input of ['-1', '1e3', '0', '1.0001', 'NaN']) assert.throws(() => draft(input));
  assert.throws(() => draft('1', { cash: '600.001' }));
});
