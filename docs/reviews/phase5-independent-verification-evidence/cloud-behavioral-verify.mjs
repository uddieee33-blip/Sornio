// INDEPENDENT cloud behavioral verification (in-memory path), written from the
// documented 9-clause contract rather than reusing the author's probe.
import { createHash } from 'node:crypto';
const OUT = process.argv[2];
const M = await import(`${OUT}/replication-cloud/src/index.js`);
const { CloudStore, buildEnvelope, ingestEnvelope } = M;
const digest = (v) => createHash('sha256').update(v).digest('hex');
const NOW = Date.parse('2026-11-26T10:00:00.000Z'), ISO = '2026-11-26T10:00:00.000Z';
const BIZ = 'biz-cloud-01';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`PASS: ${m}`); } else { fail++; console.log(`FAIL: ${m}`); } };
const eq = (a, b, m) => ok(String(a) === String(b), `${m} (got ${a}, want ${b})`);
const code = (fn) => { try { fn(); return ''; } catch (e) { return e.code || String(e); } };

const actor = (gen) => ({ businessId: BIZ, businessName: 'Cloud Kirana', portalId: 'kirana',
  deviceId: 'device-cloud-01', displayName: 'cloud', role: 'publisher',
  restoreGeneration: gen, expiresAtMs: NOW + 3600000, revoked: false });
const prod = (n) => ({ stream: 'inventory', sequence: n, operationId: `c-prod-${n}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'product_added', operationId: `c-prod-${n}`,
    product: { id: 'atta', name: 'Atta', sku: 'ATTA', unit: 'bag', unitPricePaise: 42000, stockMilli: 50000, revision: 1, reorderMilli: 1000 } } });
const cust = (n) => ({ stream: 'customer', sequence: n, operationId: `c-cust-${n}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'customer.saved', operationId: `c-cust-${n}`,
    value: { id: 'ravi', name: 'Ravi', phone: '9876543210', creditLimitPaise: 500000, creditDays: 14, revision: 1, balancePaise: '0' } } });
const bill = (n, id, total = 100000) => ({ stream: 'billing', sequence: n, operationId: id, occurredAtIso: ISO,
  payload: { version: 1, kind: 'invoice.posted', operationId: id,
    invoice: { id, createdAt: ISO, lines: [{ productId: 'atta', name: 'Atta', unit: 'bag', quantityMilli: 1000, unitPricePaise: total, totalPaise: total }],
      subtotalPaise: total, taxPaise: 0, totalPaise: total, taxBasisPoints: 0, tender: 'credit', customerId: 'ravi', customerName: 'Ravi' } } });
const credit = (n, id, amt) => ({ stream: 'customer', sequence: n, operationId: id, occurredAtIso: ISO,
  payload: { version: 1, kind: 'credit.posted', operationId: id,
    value: { operationId: id, customerId: 'ravi', kind: 'sale', amountPaise: amt, balancePaise: String(amt) } } });

const s = new CloudStore();
const p1 = actor('gen-1'); s.registerDevice(p1);
const pub = (row, p) => ingestEnvelope(s, p, buildEnvelope(p, row, digest), digest, NOW);
pub(prod(1), p1); pub(cust(1), p1);
const b1 = pub(bill(1, 'c-bill-1'), p1);
pub(bill(2, 'c-bill-2'), p1);
pub(credit(2, 'c-cred-1', 5000), p1);
const key = `${BIZ}|ravi`;
const before = String(s.customers.get(key).outstandingPaise);
eq(b1.duplicate, false, 'clause 9: first new operation is not a duplicate');
eq(before, '5000', 'baseline outstanding is 5000');

// clause 6: retry idempotent, original cursor, head unchanged
const headKey = s.headKey(BIZ, 'gen-1', 'billing');
const headBefore = s.streamHead.get(headKey);
const retry = pub(bill(1, 'c-bill-1'), p1);
eq(retry.duplicate, true, 'clause 6: retry is a duplicate');
eq(retry.cursor, b1.cursor, 'clause 6: retry keeps the ORIGINAL cursor');
eq(s.streamHead.get(headKey), headBefore, 'clause 6: retry does not advance the head');

// clause 4: conflicting payload
eq(code(() => pub(bill(3, 'c-bill-1', 999), p1)), 'CONFLICT', 'clause 4: payload reuse is CONFLICT');

// clause 2: generation fence
eq(code(() => pub(bill(9, 'c-stale'), { ...p1, restoreGeneration: 'gen-0' })), 'STALE_GENERATION', 'clause 2: stale generation fenced');

// RESTORE
const p2 = actor('gen-2'); s.registerDevice(p2);
const r1 = pub(bill(1, 'c-bill-1'), p2);
eq(r1.duplicate, true, 'clause 3: cross-generation replay is a duplicate');
eq(r1.cursor, b1.cursor, 'clause 7: cursor is business-scoped across generations');
const r2 = pub(bill(2, 'c-bill-2'), p2);
eq(r2.duplicate, true, 'clause 3: every replayed row is a duplicate');
eq(s.streamHead.get(s.headKey(BIZ, 'gen-2', 'billing')), 2n, 'clause 5: duplicates advance the new generation head');
const fresh = pub(bill(3, 'c-bill-3-NEW'), p2);
eq(fresh.duplicate, false, 'clause 5: first NEW post-restore operation is accepted');
const rc = pub(credit(2, 'c-cred-1', 5000), p2);
eq(rc.duplicate, true, 'clause 3: replayed credit entry is a duplicate');
eq(String(s.customers.get(key).outstandingPaise), before, 'clause 3: outstanding NOT double-counted');
const retry2 = pub(bill(1, 'c-bill-1'), p2);
eq(retry2.cursor, r1.cursor, 'clause 6: post-restore retry keeps the original cursor');
eq(code(() => pub(bill(99, 'c-gap'), p2)), 'GAP', 'clause 9: out-of-order new operation is GAP');

// Full ordered outbox replay from sequence 1 (real sidecar reset) must be idempotent.
const s2 = new CloudStore();
const q1 = actor('gen-1'); s2.registerDevice(q1);
const pub2 = (row, p) => ingestEnvelope(s2, p, buildEnvelope(p, row, digest), digest, NOW);
const OUTBOX = [prod(1), cust(1), bill(1, 'c-bill-1'), credit(2, 'c-cred-1', 5000)];
for (const row of OUTBOX) pub2(row, q1);
const b4 = String(s2.customers.get(key).outstandingPaise);
const q2 = actor('gen-2'); s2.registerDevice(q2);
const acks = OUTBOX.map(row => { const a = pub2(row, q2); return a.duplicate; });
ok(acks.every(x => x === true), 'full ordered outbox replay is entirely duplicates');
eq(String(s2.customers.get(key).outstandingPaise), b4, 'full replay does not double-count outstanding');

console.log(`\nCLOUD BEHAVIORAL VERIFY: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
