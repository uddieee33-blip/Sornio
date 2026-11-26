// RULE 5 probe: post-restore dedup + stream ordering contract.
import { createHash } from 'node:crypto';
const M = process.argv[2];
const { CloudStore, buildEnvelope, ingestEnvelope } = await import(M);
const digest = (v) => createHash('sha256').update(v).digest('hex');
const NOW = Date.parse('2026-11-03T10:00:00.000Z');
const ISO = '2026-11-03T10:00:00.000Z';
const actor = (gen) => ({
  businessId: 'biz-kirana-01', businessName: 'Kirana', portalId: 'kirana',
  deviceId: 'device-publisher-01', displayName: 'desk', role: 'publisher',
  restoreGeneration: gen, expiresAtMs: NOW + 3600000, revoked: false,
});
const inv = (n) => ({ stream: 'inventory', sequence: n, operationId: `invn-${n}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'product_added', operationId: `invn-${n}`,
    product: { id: 'atta', name: 'Atta', sku: 'ATTA', unit: 'bag', unitPricePaise: 42000, stockMilli: 5000, revision: 1, reorderMilli: 1000 } } });
const cust = (n) => ({ stream: 'customer', sequence: n, operationId: `cust-${n}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'customer.saved', operationId: `cust-${n}`,
    value: { id: 'ravi', name: 'Ravi', phone: '9876543210', creditLimitPaise: 200000, creditDays: 14, revision: 1, balancePaise: '0' } } });
const bill = (n, id) => ({ stream: 'billing', sequence: n, operationId: id, occurredAtIso: ISO,
  payload: { version: 1, kind: 'invoice.posted', operationId: id,
    invoice: { id, createdAt: ISO, lines: [{ productId: 'atta', name: 'Atta', unit: 'bag', quantityMilli: 1000, unitPricePaise: 100000, totalPaise: 100000 }],
      subtotalPaise: 100000, taxPaise: 0, totalPaise: 100000, taxBasisPoints: 0, tender: 'retail', customerId: 'ravi', customerName: 'Ravi' } } });
const credit = (n, id, amount) => ({ stream: 'customer', sequence: n, operationId: id, occurredAtIso: ISO,
  payload: { version: 1, kind: 'credit.posted', operationId: id,
    value: { operationId: id, customerId: 'ravi', kind: 'sale', amountPaise: amount, balancePaise: String(amount) } } });

const store = new CloudStore();
const p1 = actor('gen-1'); store.registerDevice(p1);
const pub = (row, p) => ingestEnvelope(store, p, buildEnvelope(p, row, digest), digest, NOW);
pub(inv(1), p1); pub(cust(1), p1);
pub(bill(1, 'bill-1'), p1); pub(bill(2, 'bill-2'), p1);
pub(credit(2, 'cred-1', 5000), p1);
const outstanding1 = store.customers.get('biz-kirana-01|ravi')?.outstandingPaise;
console.log('gen-1 outstanding:', String(outstanding1));

// Restore: generation rotates, sidecar acks reset, outbox republishes from 1.
const p2 = actor('gen-2'); store.registerDevice(p2);
const r1 = pub(bill(1, 'bill-1'), p2);
console.log('gen-2 billing seq1 (bill-1) =>', JSON.stringify(r1));
try {
  const r2 = pub(bill(2, 'bill-2'), p2);
  console.log('gen-2 billing seq2 (bill-2, duplicate) =>', JSON.stringify(r2));
} catch (e) {
  console.log('gen-2 billing seq2 (bill-2) => ERROR', e.code, '-', e.message);
}
// The realistic post-restore case: the snapshot's rows are duplicates, then a
// NEW sale made after the restore arrives at the next sequence number.
try {
  const r3 = pub(bill(3, 'bill-3-NEW'), p2);
  console.log('gen-2 billing seq3 (bill-3-NEW) =>', JSON.stringify(r3));
} catch (e) {
  console.log('gen-2 billing seq3 (bill-3-NEW) => ERROR', e.code, '-', e.message);
}
// Credit republish: must not double-count outstanding.
const c1 = pub(credit(2, 'cred-1', 5000), p2);
console.log('gen-2 customer seq2 (cred-1) =>', JSON.stringify(c1));
const outstanding2 = store.customers.get('biz-kirana-01|ravi')?.outstandingPaise;
console.log('gen-2 outstanding:', String(outstanding2));
console.log('OUTSTANDING_PRESERVED:', String(outstanding1) === String(outstanding2));
