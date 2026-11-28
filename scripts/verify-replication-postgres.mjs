#!/usr/bin/env node
/**
 * Real PostgreSQL concurrency tests for Phase 2 ingest.
 * Requires DATABASE_URL. Fails closed in CI when it is missing.
 * Distinguishes from PGlite unit checks in verify-replication.mjs.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL || process.env.SORNIO_PG_URL;
if (!url) {
  if (process.env.CI) {
    console.error('DATABASE_URL is required in CI for real PostgreSQL replication tests.');
    process.exit(1);
  }
  console.error('verify-replication-postgres: BLOCKED — no DATABASE_URL (not a pass).');
  process.exit(2);
}

function compiler() {
  try {
    return require.resolve('typescript/lib/tsc.js');
  } catch {
    return require.resolve('typescript/lib/tsc.js', { paths: [join(root, 'apps/mobile')] });
  }
}

const out = mkdtempSync(join(tmpdir(), 'sornio-pg-replication-'));
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
};

function statements(sql) {
  const outStmts = [];
  let buf = '';
  let dollar = null;
  for (let i = 0; i < sql.length; i += 1) {
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        buf += dollar;
        i += dollar.length - 1;
        dollar = null;
      } else {
        buf += sql[i];
      }
      continue;
    }
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      buf += '\n';
      continue;
    }
    if (sql[i] === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollar = match[0];
        buf += match[0];
        i += match[0].length - 1;
        continue;
      }
    }
    if (sql[i] === ';') {
      const stmt = buf.trim();
      if (stmt) outStmts.push(stmt);
      buf = '';
      continue;
    }
    buf += sql[i];
  }
  const tail = buf.trim();
  if (tail) outStmts.push(tail);
  return outStmts;
}

function asDb(client) {
  return {
    async query(sql, params = []) {
      const result = await client.query(sql, params);
      return { rows: result.rows };
    },
    async exec(sql) {
      await client.query(sql);
    },
  };
}

try {
  execFileSync(
    process.execPath,
    [
      compiler(),
      join(root, 'packages/replication-cloud/src/types.ts'),
      join(root, 'packages/replication-cloud/src/auth.ts'),
      join(root, 'packages/replication-cloud/src/envelope.ts'),
      join(root, 'packages/replication-cloud/src/payments.ts'),
      join(root, 'packages/replication-cloud/src/store.ts'),
      join(root, 'packages/replication-cloud/src/project.ts'),
      join(root, 'packages/replication-cloud/src/ingest.ts'),
      join(root, 'packages/replication-cloud/src/snapshot.ts'),
      join(root, 'packages/replication-cloud/src/publisher.ts'),
      join(root, 'packages/replication-cloud/src/postgres.ts'),
      join(root, 'packages/replication-cloud/src/https.ts'),
      join(root, 'packages/replication-cloud/src/index.ts'),
      join(root, 'packages/mobile-contracts/src/money.ts'),
      join(root, 'packages/mobile-contracts/src/errors.ts'),
      join(root, 'packages/mobile-contracts/src/identity.ts'),
      join(root, 'packages/mobile-contracts/src/session.ts'),
      join(root, 'packages/mobile-contracts/src/sync.ts'),
      join(root, 'packages/mobile-contracts/src/snapshot.ts'),
      join(root, 'packages/mobile-contracts/src/validation.ts'),
      '--outDir',
      out,
      '--rootDir',
      join(root, 'packages'),
      '--module',
      'commonjs',
      '--target',
      'es2022',
      '--strict',
      '--skipLibCheck',
      '--ignoreConfig',
      '--esModuleInterop',
      '--types',
      'node',
      '--typeRoots',
      join(root, 'node_modules/@types'),
    ],
    { stdio: 'inherit' },
  );

  const {
    ReplicationError,
    buildEnvelope,
    buildCompanionSnapshot,
    ingestDurable,
    hydrateFromPostgres,
    enrollPrivileged,
    revokePrivileged,
    rotatePublisherGeneration,
    issueStagingToken,
    verifyStagingToken,
    listenStagingIngest,
    postStagingIngest,
  } = require(join(out, 'replication-cloud/src/index.js'));
  const { parseCompanionSnapshot } = require(join(out, 'mobile-contracts/src/validation.js'));

  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const NOW = Date.parse('2026-11-03T10:00:00.000Z');
  const ISO = '2026-11-03T10:00:00.000Z';
  const sql = readFileSync(
    join(root, 'packages/replication-cloud/sql/20261103000000_native_financial_replication.sql'),
    'utf8',
  );

  const actor = (role, extra = {}) => ({
    businessId: extra.businessId || 'biz-pg-worker1',
    businessName: extra.businessName || 'Jalandhar Kirana',
    portalId: extra.portalId || 'kirana',
    deviceId: extra.deviceId || `device-${role}-pg01`,
    displayName: extra.displayName || `${role} desk`,
    role,
    restoreGeneration: extra.restoreGeneration || 'gen-1',
    expiresAtMs: extra.expiresAtMs ?? NOW + 3_600_000,
    revoked: extra.revoked === true,
  });

  const invoiceRow = (sequence, extra = {}) => ({
    stream: 'billing',
    sequence,
    operationId: extra.id || `bill-${sequence}`,
    occurredAtIso: ISO,
    payload: {
      version: 1,
      kind: 'invoice.posted',
      operationId: extra.id || `bill-${sequence}`,
      invoice: {
        id: extra.id || `bill-${sequence}`,
        createdAt: ISO,
        lines: extra.lines === undefined
          ? [{ productId: 'atta-001', name: 'Atta 10kg', unit: 'bag', quantityMilli: 1000, unitPricePaise: 100000, totalPaise: 100000 }]
          : extra.lines,
        subtotalPaise: extra.totalPaise || 100000,
        taxPaise: 0,
        totalPaise: extra.totalPaise || 100000,
        taxBasisPoints: 0,
        tender: extra.tender || 'cash',
        customerId: extra.customerId === undefined ? null : extra.customerId,
        customerName: extra.customerName || 'Walk-in',
      },
    },
  });

  const retailSale = (sequence, invoiceId, payments) => ({
    stream: 'retail',
    sequence,
    operationId: `sale-${sequence}`,
    occurredAtIso: ISO,
    payload: {
      version: 1,
      actorId: 'owner-1',
      receipt: {
        operationId: `sale-${sequence}`,
        kind: 'sale',
        data: {
          invoice: { id: invoiceId, totalPaise: 100000, customerId: payments.some((p) => p.method === 'credit') ? 'cust-ravi' : null },
          payments,
        },
      },
    },
  });

  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const db = asDb(admin);
  for (const stmt of statements(sql)) {
    await admin.query(stmt);
  }
  check(true, 'migration applied on server PostgreSQL');

  const pub = actor('publisher');
  const owner = actor('owner');
  await enrollPrivileged(db, pub);
  await enrollPrivileged(db, owner);

  const workerA = new pg.Client({ connectionString: url });
  const workerB = new pg.Client({ connectionString: url });
  await workerA.connect();
  await workerB.connect();
  const dbA = asDb(workerA);
  const dbB = asDb(workerB);

  const envSame = buildEnvelope(pub, invoiceRow(1, { id: 'bill-race-same', tender: 'cash', lines: [] }), digest);
  const raced = await Promise.allSettled([
    ingestDurable(dbA, pub, envSame, digest, NOW),
    ingestDurable(dbB, pub, envSame, digest, NOW),
  ]);
  const fulfilled = raced.filter((row) => row.status === 'fulfilled').map((row) => row.value);
  const rejected = raced.filter((row) => row.status === 'rejected');
  check(fulfilled.length + rejected.length === 2, 'both workers returned');
  check(fulfilled.some((row) => row.duplicate === false), 'exactly one worker committed a new event');
  check(
    fulfilled.every((row) => row.operationId === 'bill-race-same'),
    'acks name the sent operation',
  );
  if (fulfilled.length === 2) {
    check(fulfilled.filter((row) => row.duplicate).length === 1, 'identical retry is duplicate, not a second row');
  } else {
    const err = rejected[0].reason;
    check(
      err instanceof ReplicationError && (err.code === 'DUPLICATE_SEQUENCE' || err.code === 'CONFLICT' || err.code === 'GAP'),
      'loser failed closed with a replication error',
    );
  }
  const sameCount = await admin.query(
    `SELECT COUNT(*)::int AS n FROM native_replication.events WHERE operation_id = 'bill-race-same'`,
  );
  check(sameCount.rows[0].n === 1, 'same event committed at most once');

  const envConflict = {
    ...buildEnvelope(pub, invoiceRow(1, { id: 'bill-race-same', tender: 'cash', totalPaise: 1, lines: [] }), digest),
    streamSequence: '99',
  };
  let conflicted = false;
  try {
    await ingestDurable(dbA, pub, envConflict, digest, NOW);
  } catch (error) {
    conflicted = error instanceof ReplicationError && error.code === 'CONFLICT';
  }
  check(conflicted, 'same operation id with a different payload is rejected');

  const billingRetail = await Promise.allSettled([
    ingestDurable(
      dbA,
      pub,
      buildEnvelope(pub, invoiceRow(2, { id: 'bill-later-retail', tender: 'retail', customerId: null, customerName: 'Walk-in' }), digest),
      digest,
      NOW,
    ),
    ingestDurable(
      dbB,
      pub,
      buildEnvelope(
        pub,
        retailSale(1, 'bill-later-retail', [{ id: 'p-upi', method: 'upi', amountPaise: 100000 }]),
        digest,
      ),
      digest,
      NOW,
    ),
  ]);
  check(
    billingRetail.every((row) => row.status === 'fulfilled'),
    'concurrent billing and retail both commit',
  );
  const posted = await admin.query(
    `SELECT cash_paise::text AS cash, digital_paise::text AS digital, customer_credit_paise::text AS credit, allocation_status
     FROM native_replication.invoices WHERE invoice_id = 'bill-later-retail'`,
  );
  check(posted.rows[0].allocation_status === 'posted', 'concurrent billing then retail posts the invoice');
  check(posted.rows[0].digital === '100000' && posted.rows[0].credit === '0' && posted.rows[0].cash === '0', 'UPI is digital not credit');

  const envGap = buildEnvelope(pub, invoiceRow(9, { id: 'bill-gap', tender: 'cash', lines: [] }), digest);
  let gapped = false;
  try {
    await ingestDurable(dbA, pub, envGap, digest, NOW);
  } catch (error) {
    gapped = error instanceof ReplicationError && error.code === 'GAP';
  }
  const gapAck = await admin.query(`SELECT COUNT(*)::int AS n FROM native_replication.acks WHERE operation_id = 'bill-gap'`);
  check(gapped && gapAck.rows[0].n === 0, 'out-of-order stream does not write an ack');

  await workerA.query('BEGIN');
  await workerA.query(
    `INSERT INTO native_replication.events (
       business_id, device_id, restore_generation, stream, stream_sequence, operation_id,
       event_type, payload, payload_sha256, occurred_at
     ) VALUES ($1,$2,'gen-1','billing',80,'bill-aborted','invoice.posted','{}',$3,$4::timestamptz)`,
    [pub.businessId, pub.deviceId, 'ab'.repeat(32), ISO],
  );
  await workerA.query('ROLLBACK');
  const aborted = await admin.query(`SELECT COUNT(*)::int AS n FROM native_replication.events WHERE operation_id = 'bill-aborted'`);
  check(aborted.rows[0].n === 0, 'worker abort before COMMIT leaves no event');

  const committed = await ingestDurable(
    dbA,
    pub,
    buildEnvelope(pub, invoiceRow(3, { id: 'bill-lost-ack', tender: 'cash', lines: [] }), digest),
    digest,
    NOW,
  );
  check(committed.duplicate === false, 'COMMIT succeeded before the lost response');
  const retry = await ingestDurable(
    dbB,
    pub,
    buildEnvelope(pub, invoiceRow(3, { id: 'bill-lost-ack', tender: 'cash', lines: [] }), digest),
    digest,
    NOW,
  );
  check(retry.duplicate === true && retry.cursor === committed.cursor, 'lost ack retry is idempotent');
  const lostCount = await admin.query(`SELECT COUNT(*)::int AS n FROM native_replication.events WHERE operation_id = 'bill-lost-ack'`);
  check(lostCount.rows[0].n === 1, 'retry after lost ack does not duplicate the event');

  const dropped = new pg.Client({ connectionString: url });
  await dropped.connect();
  const dbDropped = asDb(dropped);
  await dropped.end();
  let lostConnection = false;
  try {
    await ingestDurable(
      dbDropped,
      pub,
      buildEnvelope(pub, invoiceRow(4, { id: 'bill-conn-lost', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    );
  } catch {
    lostConnection = true;
  }
  check(lostConnection, 'connection loss is an error, not a fabricated ack');
  const connLost = await admin.query(`SELECT COUNT(*)::int AS n FROM native_replication.events WHERE operation_id = 'bill-conn-lost'`);
  check(connLost.rows[0].n === 0, 'connection loss does not commit an event');

  // A desktop retail checkout writes ONE operation id to two outbox streams: the
  // `retail` envelope (payments/receipt) and the `billing` envelope (the invoice).
  // Durable identity is (business, stream, operation) — the durable path must
  // accept both, dedup each one independently, and never collapse them.
  const sharedOp = 'checkout-shared-op';
  const headRows = await admin.query(
    `SELECT stream, last_sequence FROM native_replication.stream_heads
     WHERE business_id = $1 AND restore_generation = 'gen-1'`,
    [pub.businessId],
  );
  const nextFor = (stream) => {
    const row = headRows.rows.find((r) => r.stream === stream);
    return Number(row ? row.last_sequence : 0) + 1;
  };
  const retailSeq = nextFor('retail');
  const billingSeq = nextFor('billing');
  const sharedRetail = await ingestDurable(
    dbA,
    pub,
    buildEnvelope(
      pub,
      {
        stream: 'retail',
        sequence: retailSeq,
        operationId: sharedOp,
        occurredAtIso: ISO,
        payload: {
          version: 1,
          actorId: 'owner-1',
          receipt: {
            operationId: sharedOp,
            kind: 'sale',
            data: {
              invoice: { id: sharedOp, totalPaise: 100000, customerId: null },
              payments: [{ id: 'p-shared-cash', method: 'cash', amountPaise: 100000 }],
            },
          },
        },
      },
      digest,
    ),
    digest,
    NOW,
  );
  check(sharedRetail.duplicate === false, 'durable: shared operation id accepted on the retail stream');
  const sharedBilling = await ingestDurable(
    dbA,
    pub,
    buildEnvelope(pub, invoiceRow(billingSeq, { id: sharedOp, tender: 'retail', customerId: null, customerName: 'Walk-in' }), digest),
    digest,
    NOW,
  );
  check(sharedBilling.duplicate === false, 'durable: the same id on the billing stream is a distinct operation');
  const sharedRows = await admin.query(
    `SELECT stream, operation_id FROM native_replication.events WHERE operation_id = $1 ORDER BY stream`,
    [sharedOp],
  );
  check(
    sharedRows.rows.length === 2 &&
      sharedRows.rows[0].stream === 'billing' &&
      sharedRows.rows[1].stream === 'retail',
    'durable: both stream rows of one checkout commit are stored',
  );
  const sharedRetailRetry = await ingestDurable(
    dbB,
    pub,
    buildEnvelope(
      pub,
      {
        stream: 'retail',
        sequence: retailSeq,
        operationId: sharedOp,
        occurredAtIso: ISO,
        payload: {
          version: 1,
          actorId: 'owner-1',
          receipt: {
            operationId: sharedOp,
            kind: 'sale',
            data: {
              invoice: { id: sharedOp, totalPaise: 100000, customerId: null },
              payments: [{ id: 'p-shared-cash', method: 'cash', amountPaise: 100000 }],
            },
          },
        },
      },
      digest,
    ),
    digest,
    NOW,
  );
  check(
    sharedRetailRetry.duplicate === true && sharedRetailRetry.cursor === sharedRetail.cursor,
    'durable: the retail stream retry keeps its own cursor',
  );
  const sharedBillingRetry = await ingestDurable(
    dbB,
    pub,
    buildEnvelope(pub, invoiceRow(billingSeq, { id: sharedOp, tender: 'retail', customerId: null, customerName: 'Walk-in' }), digest),
    digest,
    NOW,
  );
  check(
    sharedBillingRetry.duplicate === true && sharedBillingRetry.cursor === sharedBilling.cursor,
    'durable: the billing stream retry keeps its own cursor',
  );
  let sharedConflict = false;
  try {
    await ingestDurable(
      dbA,
      pub,
      buildEnvelope(pub, invoiceRow(billingSeq, { id: sharedOp, tender: 'cash', customerId: null, lines: [] }), digest),
      digest,
      NOW,
    );
  } catch (error) {
    sharedConflict = error instanceof ReplicationError && error.code === 'CONFLICT';
  }
  check(sharedConflict, 'durable: a different payload on the same stream is still a CONFLICT');

  await revokePrivileged(db, pub.deviceId);
  let revoked = false;
  try {
    await ingestDurable(
      dbA,
      { ...pub, revoked: false },
      buildEnvelope(pub, invoiceRow(4, { id: 'bill-revoked', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    );
  } catch (error) {
    revoked = error instanceof ReplicationError && error.code === 'REVOKED';
  }
  check(revoked, 'revoked device cannot ingest');
  await admin.query(`UPDATE native_replication.devices SET revoked = FALSE WHERE device_id = $1`, [pub.deviceId]);

  const otherPub = actor('publisher', {
    businessId: 'biz-pg-salon99',
    businessName: 'Model Town Salon',
    portalId: 'salon',
    deviceId: 'device-publisher-salon',
  });
  const otherOwner = actor('owner', {
    businessId: 'biz-pg-salon99',
    businessName: 'Model Town Salon',
    portalId: 'salon',
    deviceId: 'device-owner-salon',
  });
  await enrollPrivileged(db, otherPub);
  await enrollPrivileged(db, otherOwner);
  await Promise.all([
    ingestDurable(
      dbA,
      pub,
      buildEnvelope(pub, invoiceRow(billingSeq + 1, { id: 'bill-kirana-iso', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    ),
    ingestDurable(
      dbB,
      otherPub,
      buildEnvelope(otherPub, invoiceRow(1, { id: 'bill-salon-iso', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    ),
  ]);
  const isoA = await admin.query(
    `SELECT COUNT(*)::int AS n FROM native_replication.invoices WHERE business_id = $1 AND invoice_id = 'bill-salon-iso'`,
    [pub.businessId],
  );
  const isoB = await admin.query(
    `SELECT COUNT(*)::int AS n FROM native_replication.invoices WHERE business_id = $1 AND invoice_id = 'bill-kirana-iso'`,
    [otherPub.businessId],
  );
  check(isoA.rows[0].n === 0 && isoB.rows[0].n === 0, 'tenants cannot see each other invoices');

  let cashierBlocked = false;
  await admin.query('BEGIN');
  try {
    await admin.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ business_id: pub.businessId, role: 'cashier' }),
    ]);
    await admin.query('SET LOCAL ROLE sornio_cashier');
    try {
      await admin.query('SELECT * FROM native_replication.customers');
    } catch {
      cashierBlocked = true;
    }
  } finally {
    await admin.query('ROLLBACK');
  }
  check(cashierBlocked, 'cashier role cannot read customer ledger on server PostgreSQL');

  await workerA.end();
  await workerB.end();
  const restarted = new pg.Client({ connectionString: url });
  await restarted.connect();
  const hydrated = await hydrateFromPostgres(asDb(restarted), pub.businessId);
  // `byOperation` is keyed by (business, stream, operation). Hydration used to
  // collapse one checkout commit's retail and billing envelopes into a single
  // entry, so a post-restart duplicate check could compare a billing payload
  // against a retail envelope. Both keys must exist and point at their own row.
  check(
    hydrated.byOperation.size >= 2 &&
      [...hydrated.byOperation.entries()].some(
        ([key, event]) => key.endsWith(`|retail|${sharedOp}`) && event.stream === 'retail',
      ) &&
      [...hydrated.byOperation.entries()].some(
        ([key, event]) => key.endsWith(`|billing|${sharedOp}`) && event.stream === 'billing',
      ),
    'restart hydrate keeps both stream identities of a shared operation id',
  );
  check(
    [...hydrated.byOperation.entries()].every(
      ([key, event]) =>
        key === `${event.businessId}|${event.stream}|${event.operationId}`,
    ),
    'every hydrated operation key carries its own stream',
  );
  const snap = parseCompanionSnapshot(buildCompanionSnapshot(hydrated, owner, ISO, NOW));
  check(snap.activity.some((row) => row.id === 'bill-later-retail'), 'restart hydrate reconstructs posted invoices');
  check(snap.activity.find((row) => row.id === 'bill-later-retail').digitalPaise === '100000', 'restarted UPI stays digital');
  await restarted.end();

  const matrixPub = actor('publisher', {
    businessId: 'biz-pg-matrix',
    businessName: 'Matrix Kirana',
    deviceId: 'device-publisher-matrix',
  });
  const matrixOwner = actor('owner', {
    businessId: 'biz-pg-matrix',
    businessName: 'Matrix Kirana',
    deviceId: 'device-owner-matrix',
  });
  await enrollPrivileged(db, matrixPub);
  await enrollPrivileged(db, matrixOwner);

  const secret = randomBytes(32).toString('hex');
  const tlsDir = mkdtempSync(join(tmpdir(), 'sornio-pg-tls-'));
  const keyPath = join(tlsDir, 'key.pem');
  const certPath = join(tlsDir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'pipe' },
  );
  const httpsDb = new pg.Client({ connectionString: url });
  await httpsDb.connect();
  const server = await listenStagingIngest({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    ingest: (principal, body) => ingestDurable(asDb(httpsDb), principal, body, digest, NOW),
    verify: verifyStagingToken(secret),
    nowMs: () => NOW,
  });
  try {
    const token = issueStagingToken(secret, pub);
    const httpsAck = await postStagingIngest({
      hostname: '127.0.0.1',
      port: server.port,
      ca: readFileSync(certPath),
      token,
      body: buildEnvelope(pub, invoiceRow(billingSeq + 2, { id: 'bill-https-pg', tender: 'cash', lines: [] }), digest),
    });
    check(httpsAck.duplicate === false, 'HTTPS ingest against real PostgreSQL commits');
    let stolen = false;
    try {
      await postStagingIngest({
        hostname: '127.0.0.1',
        port: server.port,
        ca: readFileSync(certPath),
        token: issueStagingToken(secret, owner),
        body: buildEnvelope(pub, invoiceRow(billingSeq + 3, { id: 'bill-https-stolen', tender: 'cash', lines: [] }), digest),
      });
    } catch (error) {
      stolen = error instanceof ReplicationError && error.code === 'FORBIDDEN';
    }
    check(stolen, 'owner token cannot ingest on HTTPS');
    let expired = false;
    try {
      await postStagingIngest({
        hostname: '127.0.0.1',
        port: server.port,
        ca: readFileSync(certPath),
        token: issueStagingToken(secret, { ...pub, expiresAtMs: NOW - 1 }),
        body: buildEnvelope(pub, invoiceRow(billingSeq + 3, { id: 'bill-https-exp', tender: 'cash', lines: [] }), digest),
      });
    } catch (error) {
      expired = error instanceof ReplicationError && error.code === 'EXPIRED';
    }
    check(expired, 'expired staging token fails closed');

    const matrixToken = issueStagingToken(secret, matrixPub);
    const failedToken = issueStagingToken(secret, { ...matrixPub, expiresAtMs: NOW - 1 });
    const nativeInvoice = (id, tender, customerId = null) => ({
      stream: 'billing',
      sequence: 0,
      operationId: id,
      occurredAtIso: ISO,
      payload: {
        version: 1,
        kind: 'invoice.posted',
        operationId: id,
        invoice: {
          id,
          createdAt: ISO,
          lines: [
            {
              productId: 'rice',
              name: 'Rice',
              unit: 'kg',
              quantityMilli: 1000,
              unitPricePaise: 100000,
              totalPaise: 100000,
            },
          ],
          subtotalPaise: 100000,
          taxPaise: 0,
          totalPaise: 100000,
          taxBasisPoints: 0,
          tender,
          customerId,
        },
      },
    });
    const nativeRetail = (invoiceId, payments, customerId = null) => ({
      stream: 'retail',
      sequence: 0,
      operationId: invoiceId,
      occurredAtIso: ISO,
      payload: {
        version: 1,
        actorId: 'owner-1',
        receipt: {
          operationId: invoiceId,
          kind: 'sale',
          data: {
            invoice: { id: invoiceId, totalPaise: 100000, tender: 'retail', customerId },
            payments,
            externallyVerified: false,
          },
        },
      },
    });
    const postHttps = (token, row) =>
      postStagingIngest({
        hostname: '127.0.0.1',
        port: server.port,
        ca: readFileSync(certPath),
        token,
        body: buildEnvelope(matrixPub, row, digest),
      });
    const failThenCommit = async (row, label) => {
      let failed = false;
      try {
        await postHttps(failedToken, row);
      } catch (error) {
        failed = error instanceof ReplicationError && error.code === 'EXPIRED';
      }
      check(failed, `${label} delivery failure fails closed`);
      const ack = await postHttps(matrixToken, row);
      check(ack.duplicate === false, `${label} recovered over TLS against PostgreSQL`);
      const retry = await postHttps(matrixToken, row);
      check(retry.duplicate === true && retry.cursor === ack.cursor, `${label} lost-ack retry is idempotent`);
    };
    const matrix = [
      { billingSeq: 1, retailSeq: null, id: 'bill-cash-1000', tender: 'cash', customerId: null, payments: null, cash: '100000', digital: '0', credit: '0' },
      { billingSeq: 2, retailSeq: 1, id: 'bill-upi-1000', tender: 'retail', customerId: null, payments: [{ id: 'p-upi', method: 'upi', amountPaise: 100000 }], cash: '0', digital: '100000', credit: '0' },
      { billingSeq: 3, retailSeq: 2, id: 'bill-card-1000', tender: 'retail', customerId: null, payments: [{ id: 'p-card', method: 'card', amountPaise: 100000 }], cash: '0', digital: '100000', credit: '0' },
      { billingSeq: 4, retailSeq: null, id: 'bill-credit-1000', tender: 'credit', customerId: 'cust-ravi', payments: null, cash: '0', digital: '0', credit: '100000' },
      { billingSeq: 5, retailSeq: 3, id: 'bill-cash-upi', tender: 'retail', customerId: null, payments: [{ id: 'p-cu-cash', method: 'cash', amountPaise: 60000 }, { id: 'p-cu-upi', method: 'upi', amountPaise: 40000 }], cash: '60000', digital: '40000', credit: '0' },
      { billingSeq: 6, retailSeq: 4, id: 'bill-cash-card', tender: 'retail', customerId: null, payments: [{ id: 'p-cc-cash', method: 'cash', amountPaise: 25000 }, { id: 'p-cc-card', method: 'card', amountPaise: 75000 }], cash: '25000', digital: '75000', credit: '0' },
      { billingSeq: 7, retailSeq: 5, id: 'bill-cash-credit', tender: 'retail', customerId: 'cust-ravi', payments: [{ id: 'p-cr-cash', method: 'cash', amountPaise: 60000 }, { id: 'p-cr-credit', method: 'credit', amountPaise: 40000 }], cash: '60000', digital: '0', credit: '40000' },
    ];
    for (const sale of matrix) {
      const billing = { ...nativeInvoice(sale.id, sale.tender, sale.customerId), sequence: sale.billingSeq };
      await failThenCommit(billing, `${sale.id} billing`);
      if (sale.payments) {
        const retail = { ...nativeRetail(sale.id, sale.payments, sale.customerId), sequence: sale.retailSeq };
        await failThenCommit(retail, `${sale.id} retail`);
      }
    }
    const postedMatrix = await admin.query(
      `SELECT invoice_id, cash_paise::text AS cash, digital_paise::text AS digital,
              customer_credit_paise::text AS credit, allocation_status, tender
         FROM native_replication.invoices
        WHERE business_id = $1
        ORDER BY invoice_id`,
      [matrixPub.businessId],
    );
    check(postedMatrix.rows.length === 7, 'seven native-shaped sales persisted on PostgreSQL');
    for (const sale of matrix) {
      const row = postedMatrix.rows.find((item) => item.invoice_id === sale.id);
      check(
        row
          && row.allocation_status === 'posted'
          && row.cash === sale.cash
          && row.digital === sale.digital
          && row.credit === sale.credit,
        `${sale.id} allocation matches the native tender`,
      );
    }
    const mixed = postedMatrix.rows.find((item) => item.invoice_id === 'bill-cash-credit');
    check(mixed && mixed.cash === '60000' && mixed.credit === '40000' && mixed.digital === '0', 'mixed cash+credit is posted, not blocked');
    const upi = postedMatrix.rows.find((item) => item.invoice_id === 'bill-upi-1000');
    check(upi && upi.digital === '100000' && upi.credit === '0', 'UPI stays digital after HTTPS recovery');
  } finally {
    await server.close();
    await httpsDb.end();
    rmSync(tlsDir, { recursive: true, force: true });
  }

  // --- IV2-003: the restore-generation rotation, through the PUBLIC API and on
  // a real server. Enrollment, revocation and rotation are the three privileged
  // server-side operations; only the first two were exported and tested. This
  // block drives a complete restore lifecycle and every refusal that keeps the
  // operation safe.
  {
    const rotPub = actor('publisher', {
      businessId: 'biz-pg-rotate',
      businessName: 'Rotation Kirana',
      deviceId: 'device-rotate-pub',
      restoreGeneration: 'gen-1',
    });
    await enrollPrivileged(db, rotPub);

    const codeOf = async (fn) => {
      try {
        await fn();
        return 'NO_ERROR';
      } catch (error) {
        return error instanceof ReplicationError ? error.code : 'UNEXPECTED';
      }
    };

    // Invalid transitions are refused before anything moves.
    check(
      (await codeOf(() => rotatePublisherGeneration(db, rotPub.businessId, ''))) === 'INVALID_ENVELOPE',
      'rotation refuses an empty generation',
    );
    check(
      (await codeOf(() => rotatePublisherGeneration(db, rotPub.businessId, 'has space'))) === 'INVALID_ENVELOPE',
      'rotation refuses whitespace in a generation',
    );
    check(
      (await codeOf(() => rotatePublisherGeneration(db, rotPub.businessId, 'x'.repeat(129)))) ===
        'INVALID_ENVELOPE',
      'rotation refuses a generation longer than the column allows',
    );
    check(
      (await codeOf(() => rotatePublisherGeneration(db, 'biz-unknown-rotate', 'gen-2'))) ===
        'UNAUTHENTICATED',
      'rotation refuses an unenrolled business',
    );

    // A revoked-only business has no active publisher.
    await enrollPrivileged(db, {
      ...rotPub,
      businessId: 'biz-pg-rotate-revoked',
      deviceId: 'device-rotate-revoked',
    });
    await revokePrivileged(db, 'device-rotate-revoked');
    check(
      (await codeOf(() => rotatePublisherGeneration(db, 'biz-pg-rotate-revoked', 'gen-2'))) ===
        'FORBIDDEN',
      'rotation refuses a business whose only publisher is revoked',
    );

    // Re-issuing the current generation is a conflict, not a silent no-op.
    check(
      (await codeOf(() => rotatePublisherGeneration(db, rotPub.businessId, 'gen-1'))) === 'CONFLICT',
      'rotation refuses re-issuing the generation already in force',
    );

    // The legitimate transition.
    const rotated = await rotatePublisherGeneration(db, rotPub.businessId, 'gen-2');
    check(
      rotated.previousGeneration === 'gen-1' && rotated.generation === 'gen-2',
      'rotation reports the transition it performed',
    );
    check(rotated.deviceId === rotPub.deviceId, 'rotation reports the device it moved');
    const deviceRow = await admin.query(
      `SELECT restore_generation FROM native_replication.devices WHERE device_id = $1`,
      [rotPub.deviceId],
    );
    check(deviceRow.rows[0].restore_generation === 'gen-2', 'the enrolled device carries gen-2');
    const untouched = await admin.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events WHERE business_id = $1`,
      [rotPub.businessId],
    );
    check(untouched.rows[0].n === 0, 'rotation itself writes no events');

    // The publisher must now send under gen-2, and a stale generation is refused.
    const g2Pub = { ...rotPub, restoreGeneration: 'gen-2' };
    check(
      (await codeOf(async () =>
        ingestDurable(
          db,
          rotPub,
          buildEnvelope(rotPub, invoiceRow(1, { id: 'rot-stale', tender: 'cash', lines: [] }), digest),
          digest,
          NOW,
        ),
      )) === 'STALE_GENERATION',
      'the pre-restore generation can no longer publish',
    );
    const firstAfterRestore = await ingestDurable(
      db,
      g2Pub,
      buildEnvelope(g2Pub, invoiceRow(1, { id: 'rot-new-1', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    );
    check(firstAfterRestore.duplicate === false, 'the first new post-restore operation is accepted');

    // A restore replays the snapshot under the new generation: still duplicates.
    const replay = await ingestDurable(
      db,
      g2Pub,
      buildEnvelope(g2Pub, invoiceRow(1, { id: 'rot-new-1', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    );
    check(
      replay.duplicate === true && replay.cursor === firstAfterRestore.cursor,
      'a replay after rotation keeps its original cursor',
    );

    // A SECOND restore rotates again, and the first restore's events stay deduped.
    const rotated2 = await rotatePublisherGeneration(db, rotPub.businessId, 'gen-3');
    check(rotated2.previousGeneration === 'gen-2', 'a second rotation reports gen-2 -> gen-3');
    const g3Pub = { ...rotPub, restoreGeneration: 'gen-3' };
    const replayAgain = await ingestDurable(
      db,
      g3Pub,
      buildEnvelope(g3Pub, invoiceRow(1, { id: 'rot-new-1', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    );
    check(
      replayAgain.duplicate === true,
      'an operation from an earlier generation is still a duplicate after a second restore',
    );

    // Ordering still restarts per generation, and gaps are still refused.
    const freshG3 = await ingestDurable(
      db,
      g3Pub,
      buildEnvelope(g3Pub, invoiceRow(2, { id: 'rot-new-2', tender: 'cash', lines: [] }), digest),
      digest,
      NOW,
    );
    check(freshG3.duplicate === false, 'the new generation continues from its own sequence');
    check(
      (await codeOf(async () =>
        ingestDurable(
          db,
          g3Pub,
          buildEnvelope(g3Pub, invoiceRow(5, { id: 'rot-gap', tender: 'cash', lines: [] }), digest),
          digest,
          NOW,
        ),
      )) === 'GAP',
      'a skipped sequence under the new generation is still a gap',
    );

    // Payload conflicts survive rotation.
    check(
      (await codeOf(async () =>
        ingestDurable(
          db,
          g3Pub,
          buildEnvelope(g3Pub, invoiceRow(3, { id: 'rot-new-1', tender: 'cash', totalPaise: 7, lines: [] }), digest),
          digest,
          NOW,
        ),
      )) === 'CONFLICT',
      'a reused operation id with a different payload is still a conflict after rotation',
    );

    // An event records the generation that carried it, and rotation never
    // rewrites history: the operation committed before the restore stays on the
    // generation that carried it, and only a genuinely new operation is written
    // under the current one. (Duplicates create an ack for the new generation but
    // deliberately do not insert a second event.)
    const generations = await admin.query(
      `SELECT operation_id, restore_generation FROM native_replication.events
       WHERE business_id = $1 ORDER BY operation_id`,
      [rotPub.businessId],
    );
    const carriedBy = Object.fromEntries(
      generations.rows.map((row) => [row.operation_id, row.restore_generation]),
    );
    check(
      carriedBy['rot-new-1'] === 'gen-2' && carriedBy['rot-new-2'] === 'gen-3',
      'each event keeps the generation that carried it; rotation rewrites no history',
    );
    const rotAcks = await admin.query(
      `SELECT restore_generation, COUNT(*)::int AS n FROM native_replication.acks
       WHERE business_id = $1 GROUP BY 1 ORDER BY 1`,
      [rotPub.businessId],
    );
    check(
      rotAcks.rows.some((row) => row.restore_generation === 'gen-3' && row.n >= 1),
      'a replay after rotation is acked against the new generation',
    );
    const hydratedRot = await hydrateFromPostgres(db, rotPub.businessId);
    check(
      [...hydratedRot.byOperation.keys()].every((k) => k.split('|').length === 3),
      'hydration after rotation keeps the stream-scoped identity',
    );
  }

  // --- IV2-003 concurrency: rotation must be atomic, not merely sequential.
  // Each worker gets its OWN pg.Client: sharing one connection would serialize
  // the statements and prove nothing. Every assertion below is about what two
  // real, separate backends did to each other.
  {
    const mk = (gen, extra = {}) => ({
      businessId: 'biz-pg-rotate-race',
      businessName: 'Race Kirana',
      portalId: 'kirana',
      deviceId: 'device-rotate-race',
      displayName: 'Counter',
      role: 'publisher',
      restoreGeneration: gen,
      expiresAtMs: NOW + 3_600_000,
      revoked: false,
      ...extra,
    });
    const c1 = new pg.Client({ connectionString: url });
    const c2 = new pg.Client({ connectionString: url });
    const c3 = new pg.Client({ connectionString: url });
    await c1.connect();
    await c2.connect();
    await c3.connect();
    const w1 = asDb(c1);
    const w2 = asDb(c2);
    const w3 = asDb(c3);
    const base = mk('race-gen-0');
    await enrollPrivileged(w1, base);

    const readGeneration = async () => {
      const row = await w3.query(
        `SELECT restore_generation FROM native_replication.devices WHERE device_id = $1`,
        [base.deviceId],
      );
      return row.rows[0].restore_generation;
    };
    const outcome = async (promise) => {
      try {
        return { ok: true, value: await promise };
      } catch (error) {
        return { ok: false, code: error instanceof ReplicationError ? error.code : `RAW:${error.code ?? error.message}` };
      }
    };
    const resetGeneration = async (generation) => {
      await w3.query(
        `UPDATE native_replication.devices SET restore_generation = $2 WHERE device_id = $1`,
        [base.deviceId, generation],
      );
    };

    // 1. Two concurrent rotations to the SAME target generation.
    const sameTarget = await Promise.all([
      outcome(rotatePublisherGeneration(w1, base.businessId, 'race-gen-A')),
      outcome(rotatePublisherGeneration(w2, base.businessId, 'race-gen-A')),
    ]);
    const sameWins = sameTarget.filter((r) => r.ok);
    const sameLosses = sameTarget.filter((r) => !r.ok);
    check(sameWins.length === 1, `exactly one concurrent rotation to the same generation commits (${sameWins.length} of 2)`);
    check(
      sameLosses.length === 1 && sameLosses[0].code === 'CONFLICT',
      `the losing rotation reports CONFLICT, not a second transition (${sameLosses[0]?.code})`,
    );
    check(
      sameWins[0]?.value?.previousGeneration === 'race-gen-0',
      `the winner reports the real predecessor (${sameWins[0]?.value?.previousGeneration})`,
    );
    check((await readGeneration()) === 'race-gen-A', 'the device ended on the single committed generation');

    // 2. Two concurrent rotations to DIFFERENT generations: both may succeed,
    //    and each must report the generation that actually preceded it.
    await resetGeneration('race-gen-A');
    const diffTarget = await Promise.all([
      outcome(rotatePublisherGeneration(w1, base.businessId, 'race-gen-B')),
      outcome(rotatePublisherGeneration(w2, base.businessId, 'race-gen-C')),
    ]);
    const diffOk = diffTarget.filter((r) => r.ok);
    const diffFail = diffTarget.filter((r) => !r.ok);
    check(diffOk.length + diffFail.length === 2, 'both different-target rotations returned');
    if (diffOk.length === 2) {
      // The commit order of two racing rotations is not deterministic (the
      // backend that wins the row lock is not necessarily the one issued
      // first). What must hold regardless of order is that the two reports
      // form a TRUE chain from the starting generation: the predecessor of one
      // transition is the starting generation, and the predecessor of the other
      // is the first transition's target. A stale read would make both report
      // the starting generation.
      const byPrev = new Map(diffOk.map((r) => [r.value.previousGeneration, r.value.generation]));
      const chain = [];
      let cursor = 'race-gen-A';
      for (let step = 0; step < 3 && byPrev.has(cursor); step += 1) {
        cursor = byPrev.get(cursor);
        chain.push(cursor);
      }
      check(
        chain.length === 2 && new Set(chain).size === 2,
        `the two transitions form a real chain from the start (${JSON.stringify(chain)})`,
      );
      check(
        chain.includes('race-gen-B') && chain.includes('race-gen-C'),
        'each rotation reports the generation that actually immediately preceded it',
      );
      check(
        new Set(diffOk.map((r) => r.value.previousGeneration)).size === 2,
        'no two transitions report the same predecessor (that would be a stale read)',
      );
      check((await readGeneration()) === chain[1], `the row ends on the last committed transition (${await readGeneration()})`);
    } else {
      // A loser must fail closed with a replication error, never a raw driver error.
      check(
        diffOk.length === 1 && diffFail.every((r) => r.code === 'CONFLICT'),
        `a serialized rotation fails CONFLICT rather than a raw error (${diffFail.map((r) => r.code).join(',')})`,
      );
      check(
        diffOk[0].value.previousGeneration === 'race-gen-A',
        'the surviving transition still reports a true predecessor',
      );
    }

    // 3. A failed rotation leaves no partial transition: after a CONFLICT the
    //    row still carries the previous generation and history is untouched.
    await resetGeneration('race-gen-D');
    const eventsBefore = await w3.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events WHERE business_id = $1`,
      [base.businessId],
    );
    const conflictRound = await outcome(rotatePublisherGeneration(w1, base.businessId, 'race-gen-D'));
    check(conflictRound.code === 'CONFLICT', 'rotating to the current generation is refused');
    check((await readGeneration()) === 'race-gen-D', 'a failed rotation leaves the generation unchanged');
    const eventsAfter = await w3.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events WHERE business_id = $1`,
      [base.businessId],
    );
    check(eventsBefore.rows[0].n === eventsAfter.rows[0].n, 'a failed rotation writes no event');

    // 3b. A failure AFTER the lock is taken must roll back, not half-apply.
    //     Force the UPDATE to fail with a CHECK violation by rotating to a value
    //     the format gate accepts but the column rejects is impossible by
    //     design; instead a concurrent third connection re-points a SECOND
    //     publisher row so the conditional UPDATE loses its row.
    await resetGeneration('race-gen-E');
    const otherPub = {
      ...mk('race-gen-E'),
      deviceId: 'device-rotate-race-2',
      role: 'owner',
    };
    await enrollPrivileged(w3, otherPub);
    const loser = await outcome(rotatePublisherGeneration(w1, base.businessId, 'race-gen-F'));
    check(loser.ok === true, 'rotation still succeeds while a second, non-publisher device exists');
    check((await readGeneration()) === 'race-gen-F', 'only the publisher row moved');

    // 4. Rotation racing with an INGEST transaction. The ingest locks the
    //    business row first and then its device row; the rotation takes the same
    //    two locks in the same order, so one waits for the other instead of
    //    deadlocking. Which one wins is a race, so both outcomes are legitimate
    //    and both are asserted:
    //      * ingest wins  -> it commits under race-gen-G, the rotation reports
    //                        exactly race-gen-G as the generation it replaced;
    //      * rotation wins -> the envelope's generation is no longer enrolled,
    //                        so the ingest fails STALE_GENERATION and commits
    //                        nothing (fail-closed, never a reordered write).
    await resetGeneration('race-gen-G');
    const ingestPub = mk('race-gen-G');
    const preRaceEvents = (await w3.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events
       WHERE business_id = $1 AND operation_id = 'race-bill-1'`,
      [base.businessId],
    )).rows[0].n;
    const [ingestResult, rotateResult] = await Promise.all([
      outcome(ingestDurable(w2, ingestPub,
        buildEnvelope(ingestPub, invoiceRow(1, { id: 'race-bill-1', tender: 'cash', lines: [] }), digest), digest, NOW)),
      outcome(rotatePublisherGeneration(w1, base.businessId, 'race-gen-H')),
    ]);
    check(rotateResult.ok === true, `rotation completes against a live ingest (${rotateResult.code ?? 'ok'})`);
    check(
      rotateResult.ok && rotateResult.value.previousGeneration === 'race-gen-G',
      `the rotation reports the generation it replaced (${rotateResult.value?.previousGeneration})`,
    );
    if (ingestResult.ok) {
      check(true, 'the racing ingest committed before the rotation took the lock');
    } else {
      check(
        ingestResult.code === 'STALE_GENERATION',
        `an ingest that lost the race fails closed as STALE_GENERATION (${ingestResult.code})`,
      );
    }
    const postRaceEvents = (await w3.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events
       WHERE business_id = $1 AND operation_id = 'race-bill-1'`,
      [base.businessId],
    )).rows[0].n;
    check(
      ingestResult.ok ? postRaceEvents === preRaceEvents + 1 : postRaceEvents === preRaceEvents,
      ingestResult.ok
        ? 'the winning ingest committed exactly one event'
        : 'the losing ingest committed nothing (no partial write across the rotation)',
    );
    check((await readGeneration()) === 'race-gen-H', 'the device carries the post-rotation generation');
    // Whichever won, a commit and a rollback never both happened.
    check(
      !(ingestResult.ok === false && postRaceEvents > preRaceEvents),
      'a reported ingest failure never leaves a committed event',
    );

    // 5. The classic lock-order-inversion probe: rotation and ingest issued at
    //    the same instant, in the opposite order to case 4. Whichever wins, the
    //    outcome must be an explicit, atomically-committed effect or a documented
    //    ReplicationError — never a raw driver error (40P01 escaping the API) and
    //    never a committed event alongside a reported failure.
    //
    //    A GAP here is CORRECT fail-closed behaviour, not a defect: if the
    //    rotation commits first, the new generation's stream head is 0, so the
    //    in-flight envelope at sequence 2 is refused rather than reordered.
    await resetGeneration('race-gen-I');
    const gI = mk('race-gen-I');
    const committedEventsBefore = (await w3.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events
       WHERE business_id = $1 AND operation_id = 'race-bill-2'`,
      [base.businessId],
    )).rows[0].n;
    const [a, b] = await Promise.all([
      outcome(ingestDurable(w1, gI, buildEnvelope(gI, invoiceRow(2, { id: 'race-bill-2', tender: 'cash', lines: [] }), digest), digest, NOW)),
      outcome(rotatePublisherGeneration(w2, base.businessId, 'race-gen-J')),
    ]);
    const DOCUMENTED = new Set(['GAP', 'STALE_GENERATION', 'DUPLICATE_SEQUENCE', 'CONFLICT']);
    check(
      a.ok === true || DOCUMENTED.has(a.code),
      `racing ingest ends in a commit or a documented replication error (${a.code ?? 'ok'})`,
    );
    check(
      b.ok === true || DOCUMENTED.has(b.code),
      `racing rotation ends in a commit or a documented replication error (${b.code ?? 'ok'})`,
    );
    check(
      !String(a.code ?? '').startsWith('RAW:') && !String(b.code ?? '').startsWith('RAW:'),
      'no raw driver error (deadlock/serialization) escapes either API',
    );
    const committedEventsAfter = (await w3.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events
       WHERE business_id = $1 AND operation_id = 'race-bill-2'`,
      [base.businessId],
    )).rows[0].n;
    check(
      a.ok === true ? committedEventsAfter === committedEventsBefore + 1 : committedEventsAfter === committedEventsBefore,
      a.ok === true
        ? 'a successful racing ingest committed exactly its own event'
        : 'a refused racing ingest committed nothing (atomic rollback)',
    );
    const finalGen = await readGeneration();
    check(
      ['race-gen-I', 'race-gen-J'].includes(finalGen),
      `the row is on a generation both operations agree on (${finalGen})`,
    );

    await c1.end();
    await c2.end();
    await c3.end();
  }

  // ---------------------------------------------------------------------
  // IV2-004 regression proof: the durable duplicate-operation lookup must be
  // served by the shipped additive index, and by THAT index specifically.
  //
  // A timing threshold alone would be flaky, so this asserts the plan and the
  // causal link: identify the index the planner actually used, drop exactly
  // that index, and require the plan to degrade and then recover. The probe
  // rows are inserted and the index is dropped inside ONE transaction that is
  // always rolled back on a dedicated connection, so the durable schema the
  // earlier checks share is never touched.
  // ---------------------------------------------------------------------
  {
    const LOOKUP = `SELECT e.payload_sha256, a.cursor
      FROM native_replication.events e
      LEFT JOIN native_replication.acks a
        ON a.business_id = e.business_id AND a.restore_generation = e.restore_generation
       AND a.stream = e.stream AND a.operation_id = e.operation_id
      WHERE e.business_id = $1 AND e.stream = $2 AND e.operation_id = $3
      ORDER BY e.event_pk ASC
      LIMIT 1`;

    const probe = new pg.Client({ connectionString: url });
    await probe.connect();
    try {
      // No savepoints are available through this driver, so every statement in
      // the transaction must succeed. Verify the premise BEFORE opening it.
      const idx = (await probe.query(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'native_replication' AND tablename = 'events'
           AND indexname = 'events_operation_identity'`,
      )).rows;
      check(idx.length === 1, 'the shipped events_operation_identity index exists');
      check(
        /\(business_id, stream, operation_id, event_pk\)/.test(idx[0]?.indexdef ?? ''),
        'events_operation_identity keys on the semantic identity and ends in event_pk (satisfies ORDER BY ... LIMIT 1)',
      );
      check(
        !/restore_generation/.test(idx[0]?.indexdef ?? ''),
        'events_operation_identity does not key on restore_generation (the identity deliberately excludes it)',
      );

      // Why the additive index is needed at all: both physical UNIQUE
      // constraints lead with restore_generation, so neither can serve a lookup
      // that omits it. If a future schema change makes one of them usable, this
      // gate should be reconsidered rather than silently keep its premise.
      const unique = (await probe.query(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'native_replication' AND tablename = 'events'
           AND indexdef LIKE 'CREATE UNIQUE INDEX%'
           AND indexname <> 'events_pkey'
         ORDER BY indexname`,
      )).rows;
      check(
        unique.length === 2,
        `events has exactly two composite uniqueness constraints besides the primary key (${unique.map((r) => r.indexname).join(', ')})`,
      );
      check(
        unique.every((row) => /\(business_id, restore_generation, /.test(row.indexdef)),
        'both composite uniqueness constraints lead with business_id, restore_generation, so neither serves a lookup that omits it',
      );

      const survey = async (target) => {
        const envelope = (await probe.query(
          `EXPLAIN (ANALYZE, COSTS OFF, FORMAT JSON) ${LOOKUP}`,
          [target.businessId, target.stream, target.operationId],
        )).rows[0]['QUERY PLAN'][0];
        const found = { nodeTypes: [], indexes: [], indexed: [], rowsExamined: {} };
        const walk = (node) => {
          found.nodeTypes.push(node['Node Type']);
          if (node['Index Name']) found.indexes.push(node['Index Name']);
          const relation = node['Relation Name'];
          if (relation) {
            if (String(node['Node Type']).includes('Index')) found.indexed.push(relation);
            // Rows the executor had to look at on this relation: rows returned
            // plus rows the filter threw away. This is the cost an index removes.
            const seen = ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0))
              * (node['Actual Loops'] ?? 1);
            found.rowsExamined[relation] = (found.rowsExamined[relation] ?? 0) + seen;
          }
          for (const child of node.Plans ?? []) walk(child);
        };
        walk(envelope.Plan);
        return { ms: envelope['Execution Time'], ...found };
      };

      await probe.query('BEGIN');
      // A backlog on a stream the earlier checks do not query, so the probe
      // cannot collide with their sequence numbers or operation ids.
      await probe.query(
        `INSERT INTO native_replication.events
           (business_id, device_id, restore_generation, stream, stream_sequence, operation_id,
            event_type, payload, payload_sha256, occurred_at)
         SELECT $1, $2, 'gen-1', 'inventory', 100000 + g, 'probe-' || g,
                'invoice.posted', '{}'::jsonb, repeat('a', 64), now()
         FROM generate_series(1, 40000) AS g`,
        [pub.businessId, pub.deviceId],
      );
      // The probe targets an operation ingested BEHIND the whole backlog: a
      // duplicate check that is only cheap when the row sits at the start of
      // event_pk order would still be a full scan in production.
      const backlogProbe = { businessId: pub.businessId, stream: 'inventory', operationId: 'probe-40000' };

      const withIndex = await survey(backlogProbe);
      check(
        withIndex.indexed.includes('events') && withIndex.indexes.includes('events_operation_identity'),
        `the lookup is served by events_operation_identity (indexes: ${withIndex.indexes.join(', ') || 'none'})`,
      );
      const examinedWith = withIndex.rowsExamined.events ?? 0;
      check(
        examinedWith <= 4,
        `with the index the lookup reads the matching row only (${examinedWith} row(s) examined)`,
      );

      await probe.query('DROP INDEX native_replication.events_operation_identity');
      const withoutIndex = await survey(backlogProbe);
      check(
        !withoutIndex.indexes.includes('events_operation_identity'),
        'dropping the index removes it from the plan (the dependency is real, not incidental)',
      );
      const examinedWithout = withoutIndex.rowsExamined.events ?? 0;
      check(
        examinedWithout >= 10000 && examinedWithout > examinedWith * 100,
        `without the index the same lookup must examine O(table) rows (${examinedWithout} row(s) examined)`,
      );
      check(
        withoutIndex.ms > withIndex.ms,
        `the degraded lookup is slower (${withoutIndex.ms} ms vs ${withIndex.ms} ms)`,
      );

      // Restorability: re-apply the shipped migration inside the same
      // transaction. IF NOT EXISTS makes it idempotent, which is also the
      // "migration is re-runnable" guarantee.
      for (const stmt of statements(sql)) await probe.query(stmt);
      const restored = await survey(backlogProbe);
      check(
        restored.indexes.includes('events_operation_identity') && restored.indexed.includes('events'),
        're-applying the shipped migration restores the index and the index plan',
      );
      check(
        (restored.rowsExamined.events ?? 0) <= 4,
        `the restored plan reads the matching row only again (${restored.rowsExamined.events ?? 0} row(s) examined)`,
      );
    } finally {
      // Always release the connection: whatever happened above, the probe rows
      // and the index drop must never survive this block.
      try {
        await probe.query('ROLLBACK');
      } catch {
        // A failed ROLLBACK leaves nothing durable: the connection is closed and
        // PostgreSQL rolls the transaction back when the session ends.
      }
      await probe.end();
    }

    const leftover = (await admin.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.events
       WHERE business_id = $1 AND operation_id LIKE 'probe\_%'`,
      [pub.businessId],
    )).rows[0].n;
    check(leftover === 0, 'the 40k probe rows were rolled back and never became durable');
    const indexAfter = (await admin.query(
      `SELECT COUNT(*)::int AS n FROM pg_indexes
       WHERE schemaname = 'native_replication' AND indexname = 'events_operation_identity'`,
    )).rows[0].n;
    check(indexAfter === 1, 'the shipped index is present on the durable schema after the probe');
  }

  await admin.end();
  console.log(`verify-replication-postgres: ${checks} checks passed on server PostgreSQL`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
