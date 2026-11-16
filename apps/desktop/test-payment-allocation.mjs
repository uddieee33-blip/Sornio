import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationPreview, remainingForMethod, originalCreditDue } from './src/payment-allocation.ts';
const empty = { cash: '', upi: '', card: '', credit: '' };
for (const [name, amounts, due] of [
  ['cash', { cash: '1000' }, 0], ['UPI', { upi: '1000' }, 0],
  ['cash and UPI', { cash: '600', upi: '400' }, 0],
  ['cash and card', { cash: '600', card: '400' }, 0],
  ['UPI and card', { upi: '600', card: '400' }, 0],
  ['cash and credit', { cash: '600', credit: '400' }, 40000],
  ['UPI and credit', { upi: '600', credit: '400' }, 40000],
  ['cash, UPI and credit', { cash: '600', upi: '150', credit: '250' }, 25000],
  ['credit only', { credit: '1000' }, 100000],
]) test(`₹1000 ${name} allocation and original receipt due`, () => {
  const preview = allocationPreview(100000, { ...empty, ...amounts });
  assert.equal(preview.invalidMethod, null);
  assert.equal(preview.remainingPaise, 0);
  assert.equal(preview.creditPaise, due);
  const parts = preview.parts.filter(p => p.amountPaise > 0).map(p => ({ ...p, id: p.method }));
  assert.equal(originalCreditDue('retail', 100000, due ? 'c1' : null, parts), due);
});
test('underpayment and overpayment stay explicit in paise', () => {
  assert.equal(allocationPreview(100000, { ...empty, cash: '999.99' }).remainingPaise, 1);
  assert.equal(allocationPreview(100000, { ...empty, cash: '1000.01' }).remainingPaise, -1);
});
test('invalid precision, negative, exponent and oversized amounts cannot become payments', () => {
  for (const cash of ['600.001', '-600', '1e3', 'NaN', '90000000000.01']) {
    assert.equal(allocationPreview(100000, { ...empty, cash }).invalidMethod, 'cash');
  }
});
test('use remaining replaces the chosen amount, preserving all other tenders', () => {
  assert.equal(remainingForMethod(100000, { ...empty, cash: '600', credit: '100' }, 'credit'), 40000);
  assert.equal(remainingForMethod(100000, { ...empty, cash: '600', upi: '150' }, 'credit'), 25000);
  assert.equal(remainingForMethod(100000, { ...empty, cash: '1001' }, 'credit'), null);
  assert.equal(remainingForMethod(100000, { ...empty, cash: 'bad' }, 'credit'), null);
});
test('receipt refuses missing or inconsistent financial breakdowns', () => {
  assert.equal(originalCreditDue('retail', 100000, 'c1'), null);
  const part = { id: 'p1', method: 'credit', amountPaise: 100000 };
  assert.equal(originalCreditDue('retail', 100000, null, [part]), null);
  assert.equal(originalCreditDue('retail', 100000, 'c1', [{ ...part, amountPaise: 40000 }]), null);
  assert.equal(originalCreditDue('retail', 200000, 'c1', [part, part]), null);
  assert.equal(originalCreditDue('retail', 100000, null, [{ ...part, method: 'provider_success' }]), null);
  assert.equal(originalCreditDue('cash', 100000, null), 0);
  assert.equal(originalCreditDue('credit', 100000, 'c1'), 100000);
});
test('large but valid allocations retain exact integer differences', () => {
  const p = allocationPreview(9000000000000, { ...empty, cash: '89999999999.99', credit: '0.01' });
  assert.equal(p.remainingPaise, 0);
  assert.equal(p.creditPaise, 1);
});
