// INDEPENDENT VERIFICATION of the durable PostgreSQL replication path.
// Runs the ACTUAL SQL implementation against a REAL disposable PostgreSQL 16.2
// server. No mocks. Covers: cross-generation duplicates, new operations after
// restore, stream advancement, customer outstanding, retries, conflicting
// payloads, delayed acknowledgements, concurrent duplicate ingestion, rollback.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const OUT = process.argv[2];
const MIG = process.argv[3];
const CONN = { host: '127.0.0.1', port: 55432, user: 'verifyuser', database: 'sornio_verify' };
const M = await import(`${OUT}/replication-cloud/src/index.js`);
const { buildEnvelope, ingestDurable, enrollPrivileged, rotatePublisherGeneration,
        applyReplicationMigration, snapshotFromPostgres, hydrateFromPostgres } = M;
const digest = (v) => createHash('sha256').update(v).digest('hex');
const NOW = Date.parse('2026-11-26T10:00:00.000Z');
const ISO = '2026-11-26T10:00:00.000Z';
const BIZ = 'biz-verify-01';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`PASS: ${m}`); } else { fail++; console.log(`FAIL: ${m}`); } };
const eq = (a, b, m) => ok(String(a) === String(b), `${m} (got ${a}, want ${b})`);

// Real pooled Postgres adapter matching the SqlDatabase interface.
function adapter(client) {
  return {
    query: async (sql, params = []) => { const r = await client.query(sql, params); return { rows: r.rows }; },
    exec: async (sql) => client.query(sql),
  };
}
const newConn = async () => { const c = new pg.Client(CONN); await c.connect(); return c; };

const actor = (gen, dev = 'device-verify-01') => ({
  businessId: BIZ, businessName: 'Verify Kirana', portalId: 'verify',
  deviceId: dev, displayName: 'verify desk', role: 'publisher',
  restoreGeneration: gen, expiresAtMs: NOW + 3600000, revoked: false,
});
const productRow = (n) => ({ stream: 'inventory', sequence: n, operationId: `v-prod-${n}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'product_added', operationId: `v-prod-${n}`,
    product: { id: 'atta', name: 'Atta', sku: 'ATTA', unit: 'bag', unitPricePaise: 42000, stockMilli: 50000, revision: 1, reorderMilli: 1000 } } });
const customerRow = (n) => ({ stream: 'customer', sequence: n, operationId: `v-cust-${n}`, occurredAtIso: ISO,
  payload: { version: 1, kind: 'customer.saved', operationId: `v-cust-${n}`,
    value: { id: 'ravi', name: 'Ravi', phone: '9876543210', creditLimitPaise: 500000, creditDays: 14, revision: 1, balancePaise: '0' } } });
const billRow = (n, id, total = 100000) => ({ stream: 'billing', sequence: n, operationId: id, occurredAtIso: ISO,
  payload: { version: 1, kind: 'invoice.posted', operationId: id,
    invoice: { id, createdAt: ISO, lines: [{ productId: 'atta', name: 'Atta', unit: 'bag', quantityMilli: 1000, unitPricePaise: total, totalPaise: total }],
      subtotalPaise: total, taxPaise: 0, totalPaise: total, taxBasisPoints: 0, tender: 'credit', customerId: 'ravi', customerName: 'Ravi' } } });
const creditRow = (n, id, amount, balance) => ({ stream: 'customer', sequence: n, operationId: id, occurredAtIso: ISO,
  payload: { version: 1, kind: 'credit.posted', operationId: id,
    value: { operationId: id, customerId: 'ravi', kind: 'sale', amountPaise: amount, balancePaise: String(balance) } } });

const main = await newConn();
const db = adapter(main);
await applyReplicationMigration(db, readFileSync(MIG, 'utf8'));
console.log('MIGRATION APPLIED to real PostgreSQL');
const ver = await main.query('SELECT version()');
console.log('SERVER:', ver.rows[0].version);

await main.query(`INSERT INTO native_replication.businesses (business_id, business_name, portal_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [BIZ, 'Verify Kirana', 'verify']);
const p1 = actor('gen-1');
await enrollPrivileged(db, p1);
const pub = async (row, p, conn = db) => ingestDurable(conn, p, buildEnvelope(p, row, digest), digest, NOW);

// --- Baseline generation 1 -------------------------------------------------
await pub(productRow(1), p1);
await pub(customerRow(1), p1);
const b1 = await pub(billRow(1, 'v-bill-1'), p1);
const b2 = await pub(billRow(2, 'v-bill-2'), p1);
await pub(creditRow(2, 'v-cred-1', 5000, 5000), p1);
eq(b1.duplicate, false, 'gen-1 first invoice is not a duplicate');
eq(b2.duplicate, false, 'gen-1 second invoice is not a duplicate');

const outstanding = async () => {
  const r = await main.query(`SELECT outstanding_paise FROM native_replication.customer_statements WHERE business_id=$1 AND customer_id='ravi' AND line_id='balance'`, [BIZ]);
  if (r.rows[0]) return r.rows[0].outstanding_paise;
  const all = await main.query(`SELECT line_id, outstanding_paise FROM native_replication.customer_statements WHERE business_id=$1 AND customer_id='ravi'`, [BIZ]);
  return JSON.stringify(all.rows);
};
const before = await outstanding();
console.log('gen-1 outstanding rows:', String(before));

// --- Same-generation retry (delayed ack redelivery) ------------------------
const retry = await pub(billRow(1, 'v-bill-1'), p1);
eq(retry.duplicate, true, 'same-generation redelivery is a duplicate (delayed ack)');
eq(retry.cursor, b1.cursor, 'retry returns the ORIGINAL cursor');
const headAfterRetry = await main.query(`SELECT last_sequence FROM native_replication.stream_heads WHERE business_id=$1 AND restore_generation='gen-1' AND stream='billing'`, [BIZ]);
eq(headAfterRetry.rows[0].last_sequence, 2, 'retry of a seen sequence does NOT advance the head');

// --- Conflicting payload reuse --------------------------------------------
let conflict = '';
try { await pub(billRow(3, 'v-bill-1', 999), p1); } catch (e) { conflict = e.code || String(e); }
eq(conflict, 'CONFLICT', 'reusing an operation id with a different payload is CONFLICT');
const afterConflict = await main.query(`SELECT count(*)::int AS n FROM native_replication.events WHERE business_id=$1`, [BIZ]);
console.log('events after conflict:', afterConflict.rows[0].n);

// --- RESTORE: rotate generation -------------------------------------------
await rotatePublisherGeneration(db, BIZ, 'gen-2');
const p2 = actor('gen-2');
await enrollPrivileged(db, p2);

// Stale generation must be fenced.
let stale = '';
try { await pub(billRow(1, 'v-bill-1'), { ...p1, restoreGeneration: 'gen-1' }); } catch (e) { stale = e.code || String(e); }
eq(stale, 'STALE_GENERATION', 'old generation envelope is fenced after restore');

// Replay the snapshot outbox under gen-2 (sidecar reset => sequences from 1).
const r1 = await pub(billRow(1, 'v-bill-1'), p2);
eq(r1.duplicate, true, 'CROSS-GENERATION replay of bill-1 is a duplicate (durable)');
eq(r1.cursor, b1.cursor, 'cross-generation duplicate returns the original business cursor');
const r2 = await pub(billRow(2, 'v-bill-2'), p2);
eq(r2.duplicate, true, 'CROSS-GENERATION replay of bill-2 is a duplicate (durable)');

// Stream head must have advanced for the NEW generation.
const h2 = await main.query(`SELECT last_sequence FROM native_replication.stream_heads WHERE business_id=$1 AND restore_generation='gen-2' AND stream='billing'`, [BIZ]);
eq(h2.rows[0].last_sequence, 2, 'duplicates ADVANCE the new generation stream head');

// The first genuinely NEW operation after restore must be accepted.
let newAck = null, newErr = '';
try { newAck = await pub(billRow(3, 'v-bill-3-NEW'), p2); } catch (e) { newErr = e.code || String(e); }
eq(newErr, '', 'first NEW post-restore operation is accepted (no GAP)');
eq(newAck && newAck.duplicate, false, 'new post-restore operation is not a duplicate');

// Credit replay must NOT double-count outstanding.
const rc = await pub(creditRow(2, 'v-cred-1', 5000, 5000), p2);
eq(rc.duplicate, true, 'replayed credit entry is a cross-generation duplicate (durable)');
const after = await outstanding();
console.log('gen-2 outstanding rows:', String(after));
eq(JSON.stringify(after), JSON.stringify(before), 'customer outstanding is NOT double-counted after restore replay');

// Per-generation ack bookkeeping must exist for the current generation.
const acks2 = await main.query(`SELECT operation_id, cursor FROM native_replication.acks WHERE business_id=$1 AND restore_generation='gen-2' ORDER BY operation_id`, [BIZ]);
ok(acks2.rows.length >= 3, `gen-2 has its own ack rows (${acks2.rows.length})`);
const ackCursors = acks2.rows.filter(r => r.operation_id === 'v-bill-1').map(r => String(r.cursor));
eq(ackCursors[0], b1.cursor, 'gen-2 ack points at the original cursor');

// Events must NOT be duplicated across generations.
const evCount = await main.query(`SELECT count(*)::int AS n FROM native_replication.events WHERE business_id=$1 AND operation_id='v-bill-1'`, [BIZ]);
eq(evCount.rows[0].n, 1, 'exactly ONE event row exists for a cross-generation duplicate');

// --- CONCURRENT duplicate ingestion (real parallel connections) -----------
await rotatePublisherGeneration(db, BIZ, 'gen-3');
const p3 = actor('gen-3');
await enrollPrivileged(db, p3);
const conns = await Promise.all([newConn(), newConn(), newConn(), newConn()]);
const results = await Promise.all(conns.map(async (c) => {
  const a = adapter(c);
  try { return await ingestDurable(a, p3, buildEnvelope(p3, billRow(1, 'v-bill-1'), digest), digest, NOW); }
  catch (e) { return { error: e.code || String(e) }; }
}));
console.log('CONCURRENT results:', JSON.stringify(results));
const okResults = results.filter(r => !r.error);
eq(okResults.length, 4, 'all 4 concurrent duplicate ingests succeed (no deadlock/serialization failure)');
ok(okResults.every(r => r.duplicate === true), 'all concurrent duplicates report duplicate=true');
ok(okResults.every(r => String(r.cursor) === String(b1.cursor)), 'all concurrent duplicates return the same original cursor');
const evAfterConc = await main.query(`SELECT count(*)::int AS n FROM native_replication.events WHERE business_id=$1 AND operation_id='v-bill-1'`, [BIZ]);
eq(evAfterConc.rows[0].n, 1, 'concurrent duplicates still produce exactly ONE event row');
const outConc = await outstanding();
eq(JSON.stringify(outConc), JSON.stringify(before), 'concurrent duplicate ingestion does not double-count outstanding');

// --- CONCURRENT NEW distinct operations (serialization) -------------------
const newResults = await Promise.all(conns.map(async (c, i) => {
  const a = adapter(c);
  try { return await ingestDurable(a, p3, buildEnvelope(p3, billRow(4 + i, `v-conc-${i}`), digest), digest, NOW); }
  catch (e) { return { error: e.code || String(e) }; }
}));
console.log('CONCURRENT NEW results:', JSON.stringify(newResults));
const accepted = newResults.filter(r => !r.error && r.duplicate === false);
ok(accepted.length >= 1, `at least one concurrent NEW operation commits (${accepted.length})`);
const rejected = newResults.filter(r => r.error);
ok(rejected.every(r => ['GAP','DUPLICATE_SEQUENCE','CONFLICT'].includes(r.error)), `rejected concurrent operations fail with ordering codes: ${JSON.stringify(rejected.map(r=>r.error))}`);

// --- ROLLBACK: a failed ingest must leave NO partial state ----------------
const preEvents = (await main.query(`SELECT count(*)::int AS n FROM native_replication.events WHERE business_id=$1`, [BIZ])).rows[0].n;
const preAcks = (await main.query(`SELECT count(*)::int AS n FROM native_replication.acks WHERE business_id=$1`, [BIZ])).rows[0].n;
const preHead = (await main.query(`SELECT last_sequence FROM native_replication.stream_heads WHERE business_id=$1 AND restore_generation='gen-3' AND stream='billing'`, [BIZ])).rows[0].last_sequence;
let gap = '';
try { await pub(billRow(99, 'v-gap-attempt'), p3); } catch (e) { gap = e.code || String(e); }
eq(gap, 'GAP', 'out-of-order new operation is rejected GAP');
const postEvents = (await main.query(`SELECT count(*)::int AS n FROM native_replication.events WHERE business_id=$1`, [BIZ])).rows[0].n;
const postAcks = (await main.query(`SELECT count(*)::int AS n FROM native_replication.acks WHERE business_id=$1`, [BIZ])).rows[0].n;
const postHead = (await main.query(`SELECT last_sequence FROM native_replication.stream_heads WHERE business_id=$1 AND restore_generation='gen-3' AND stream='billing'`, [BIZ])).rows[0].last_sequence;
eq(postEvents, preEvents, 'ROLLBACK leaves no partial event row');
eq(postAcks, preAcks, 'ROLLBACK leaves no partial ack row');
eq(postHead, preHead, 'ROLLBACK does not advance the stream head');
const txState = await main.query('SELECT txid_current_if_assigned() IS NULL AS clean');
ok(txState.rows[0].clean, 'connection is not left inside an aborted transaction');

// --- Hydration consistency: durable state vs projections ------------------
const hydrated = await hydrateFromPostgres(db, BIZ);
const hOut = hydrated.customers.get(`${BIZ}|ravi`);
console.log('hydrated outstanding:', hOut && String(hOut.outstandingPaise));
const snap = await snapshotFromPostgres(db, { ...p3, role: 'owner' });
ok(Array.isArray(snap.activity), 'snapshot from real Postgres returns activity');
const billIds = snap.activity.map(r => r.id).filter(id => String(id).startsWith('v-bill'));
console.log('snapshot billing ids:', JSON.stringify(billIds));
ok(billIds.includes('v-bill-1') && billIds.includes('v-bill-3-NEW'), 'snapshot contains both replayed and new post-restore invoices exactly once');
eq(billIds.filter(x => x === 'v-bill-1').length, 1, 'replayed invoice appears exactly once in the durable snapshot');

for (const c of conns) await c.end();
await main.end();
console.log(`\nDURABLE POSTGRES VERIFY: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
