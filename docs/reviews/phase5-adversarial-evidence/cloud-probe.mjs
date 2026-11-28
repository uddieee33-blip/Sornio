// INDEPENDENT AUDIT PROBE — cloud replication dedup / generation fencing.
// Audit investigation only; exercises the compiled candidate cloud module.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const M = '/home/user/phase5-audit/cloud-out/replication-cloud/src/index.js';
const { CloudStore, ReplicationError, buildEnvelope, ingestEnvelope } = await import(M);
const digest = (v) => createHash('sha256').update(v).digest('hex');
const NOW = Date.parse('2026-11-03T10:00:00.000Z');
const ISO = '2026-11-03T10:00:00.000Z';
const actor = (role, extra = {}) => ({
  businessId: extra.businessId || 'biz-kirana-01', businessName: 'Jalandhar Kirana',
  portalId: 'kirana', deviceId: extra.deviceId || `device-${role}-01`,
  displayName: `${role} desk`, role, restoreGeneration: extra.restoreGeneration || 'gen-1',
  expiresAtMs: NOW + 3_600_000, revoked: false,
});
const invoiceRow = (sequence, id) => ({
  stream: 'billing', sequence, operationId: id, occurredAtIso: ISO,
  payload: { version: 1, kind: 'invoice.posted', operationId: id,
    invoice: { id, createdAt: ISO,
      lines: [{ productId: 'atta-001', name: 'Atta 10kg', unit: 'bag', quantityMilli: 1000, unitPricePaise: 100000, totalPaise: 100000 }],
      subtotalPaise: 100000, taxPaise: 0, totalPaise: 100000, taxBasisPoints: 0,
      tender: 'retail', customerId: 'cust-ravi', customerName: 'Ravi Singh' } },
});
const productRow = (sequence) => ({
  stream: 'inventory', sequence, operationId: `invn-${sequence}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'product_added', operationId: `invn-${sequence}`,
    product: { id: 'atta-001', name: 'Atta 10kg', sku: 'ATTA10', unit: 'bag', unitPricePaise: 42000, stockMilli: 5000, revision: 1, reorderMilli: 1000 } },
});
const customerRow = (sequence) => ({
  stream: 'customer', sequence, operationId: `cust-${sequence}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'customer.saved', operationId: `cust-${sequence}`,
    value: { id: 'cust-ravi', name: 'Ravi Singh', phone: '9876543210', creditLimitPaise: 200000, creditDays: 14, revision: 1, balancePaise: '0' } },
});
let pass = 0; const ok = (c, l) => { assert.ok(c, l); pass++; console.log('PASS:', l); };
const code = (c, run) => { try { run(); assert.fail('expected ' + c); } catch (e) { ok(e instanceof ReplicationError && e.code === c, `error ${c} (got ${e.code})`); } };

const store = new CloudStore();
const pub = actor('publisher'); store.registerDevice(pub);
const publish = (row, p = pub) => ingestEnvelope(store, p, buildEnvelope(p, row, digest), digest, NOW);
// Seed prerequisite catalogue/customer streams so the invoice projects.
publish(productRow(1)); publish(customerRow(1));
const a1 = publish(invoiceRow(1, 'bill-1'));
ok(a1.duplicate === false, 'first invoice ingest is not a duplicate');
const a2 = publish(invoiceRow(1, 'bill-1'));
ok(a2.duplicate === true && a2.cursor === a1.cursor, 'same-generation redelivery is idempotent (duplicate=true, same cursor)');
// Payload conflict on reused operation identity.
const conflictRow = invoiceRow(1, 'bill-1'); conflictRow.payload.invoice.totalPaise = 999; conflictRow.payload.invoice.subtotalPaise = 999; conflictRow.payload.invoice.lines[0].totalPaise = 999;
code('CONFLICT', () => publish(conflictRow));
// Stale generation rejected: envelope claims gen-OLD but the enrolled publisher
// (same deviceId) is gen-1. Do NOT re-register, so the enrollment stays gen-1.
const stale = actor('publisher', { restoreGeneration: 'gen-OLD' });
code('STALE_GENERATION', () => publish(invoiceRow(1, 'bill-1'), stale));
// Cross-generation: rotate the enrolled publisher to gen-2 and re-publish bill-1.
const pub2 = actor('publisher', { restoreGeneration: 'gen-2' }); store.registerDevice(pub2);
const g2 = publish(invoiceRow(1, 'bill-1'), pub2);
console.log('CROSS-GENERATION re-publish of bill-1 =>', JSON.stringify(g2));
ok(g2.duplicate === true, 'in-memory dedup is CROSS-generation (businessId|operationId): gen-2 redelivery of bill-1 returns duplicate=true');
console.log(`\nAUDIT PROBE COMPLETE: ${pass} assertions passed.`);
