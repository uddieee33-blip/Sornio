// INDEPENDENT probe: does a full ordered post-restore outbox replay double-count
// customer outstanding on the DURABLE path? Runs against real PostgreSQL.
// A real sidecar reset replays EVERY stream from sequence 1, in order.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const OUT = process.argv[2], MIG = process.argv[3], LABEL = process.argv[4] || 'build';
const CONN = { host: '127.0.0.1', port: 55432, user: 'verifyuser', database: 'sornio_verify' };
const M = await import(`${OUT}/replication-cloud/src/index.js`);
const PG = await import(`${OUT}/replication-cloud/src/postgres.js`);
const digest = (v) => createHash('sha256').update(v).digest('hex');
const NOW = Date.parse('2026-11-26T10:00:00.000Z'), ISO = '2026-11-26T10:00:00.000Z';
const BIZ = 'biz-replay-01';
const c = new pg.Client(CONN); await c.connect();
const db = { query: async (s, p = []) => ({ rows: (await c.query(s, p)).rows }), exec: async (s) => c.query(s) };
await M.applyReplicationMigration(db, readFileSync(MIG, 'utf8'));
await c.query(`INSERT INTO native_replication.businesses (business_id,business_name,portal_id) VALUES ($1,'Replay Kirana','kirana')`, [BIZ]);
const actor = (gen) => ({ businessId: BIZ, businessName: 'Replay Kirana', portalId: 'kirana',
  deviceId: 'device-replay-01', displayName: 'replay', role: 'publisher',
  restoreGeneration: gen, expiresAtMs: NOW + 3600000, revoked: false });
const prod = { stream: 'inventory', sequence: 1, operationId: 'rp-prod', occurredAtIso: ISO,
  payload: { version: 1, kind: 'product_added', operationId: 'rp-prod',
    product: { id: 'atta', name: 'Atta', sku: 'ATTA', unit: 'bag', unitPricePaise: 42000, stockMilli: 50000, revision: 1, reorderMilli: 1000 } } };
const cust = { stream: 'customer', sequence: 1, operationId: 'rp-cust', occurredAtIso: ISO,
  payload: { version: 1, kind: 'customer.saved', operationId: 'rp-cust',
    value: { id: 'ravi', name: 'Ravi', phone: '9876543210', creditLimitPaise: 500000, creditDays: 14, revision: 1, balancePaise: '0' } } };
const cred = { stream: 'customer', sequence: 2, operationId: 'rp-cred', occurredAtIso: ISO,
  payload: { version: 1, kind: 'credit.posted', operationId: 'rp-cred',
    value: { operationId: 'rp-cred', customerId: 'ravi', kind: 'sale', amountPaise: 5000, balancePaise: '5000' } } };
const bill = { stream: 'billing', sequence: 1, operationId: 'rp-bill', occurredAtIso: ISO,
  payload: { version: 1, kind: 'invoice.posted', operationId: 'rp-bill',
    invoice: { id: 'rp-bill', createdAt: ISO, lines: [{ productId: 'atta', name: 'Atta', unit: 'bag', quantityMilli: 1000, unitPricePaise: 100000, totalPaise: 100000 }],
      subtotalPaise: 100000, taxPaise: 0, totalPaise: 100000, taxBasisPoints: 0, tender: 'credit', customerId: 'ravi', customerName: 'Ravi' } } };
const p1 = actor('gen-1'); await M.enrollPrivileged(db, p1);
const pub = async (row, p) => M.ingestDurable(db, p, M.buildEnvelope(p, row, digest), digest, NOW);
const measure = async () => {
  const r = await c.query(`SELECT line_id, amount_paise, direction FROM native_replication.customer_statements WHERE business_id=$1 AND customer_id='ravi' ORDER BY line_id`, [BIZ]);
  let net = 0n; for (const x of r.rows) net += (x.direction === 'debit' ? 1n : -1n) * BigInt(x.amount_paise);
  const h = await M.hydrateFromPostgres(db, BIZ);
  const cu = h.customers.get(`${BIZ}|ravi`);
  return { net: net.toString(), lines: r.rows.length, hydrated: cu ? String(cu.outstandingPaise) : null };
};
// Ordered outbox as the desktop would republish it after a sidecar reset.
const OUTBOX = [prod, cust, bill, cred];
for (const row of OUTBOX) await pub(row, p1);
const before = await measure();
console.log(`[${LABEL}] gen-1 outstanding:`, JSON.stringify(before));

await PG.rotatePublisherGeneration(db, BIZ, 'gen-2');
const p2 = actor('gen-2'); await M.enrollPrivileged(db, p2);
console.log(`[${LABEL}] --- restore: replaying FULL ordered outbox under gen-2 ---`);
const acks = [];
for (const row of OUTBOX) {
  try { const a = await pub(row, p2); acks.push({ op: row.operationId, dup: a.duplicate, cursor: String(a.cursor) }); }
  catch (e) { acks.push({ op: row.operationId, error: e.code || String(e) }); }
}
console.log(`[${LABEL}] replay acks:`, JSON.stringify(acks));
const after = await measure();
console.log(`[${LABEL}] gen-2 outstanding:`, JSON.stringify(after));
const evDup = (await c.query(`SELECT operation_id, count(*)::int AS n FROM native_replication.events WHERE business_id=$1 GROUP BY operation_id HAVING count(*)>1`, [BIZ])).rows;
console.log(`[${LABEL}] operations with MORE THAN ONE event row:`, JSON.stringify(evDup));
const doubled = BigInt(after.net) !== BigInt(before.net);
console.log(`[${LABEL}] OUTSTANDING_DOUBLE_COUNTED: ${doubled} (before=${before.net} after=${after.net})`);
console.log(`[${LABEL}] EXPECTED_AFTER_FIX: before=5000 after=5000 doubled=false`);
await c.end();
