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
  let wrongSequence = false;
  try {
    await ingestDurable(
      dbB, pub,
      buildEnvelope(pub, invoiceRow(9, { id: 'bill-lost-ack', tender: 'cash', lines: [] }), digest),
      digest, NOW,
    );
  } catch (error) {
    wrongSequence = error instanceof ReplicationError && error.code === 'CONFLICT';
  }
  check(wrongSequence, 'same digest at a new stream sequence cannot reuse an old durable ack');
  const afterWrongSequence = await admin.query(
    `SELECT COUNT(*)::int AS n FROM native_replication.events WHERE operation_id = 'bill-lost-ack'`,
  );
  check(afterWrongSequence.rows[0].n === 1, 'wrong-sequence retry made no second financial event');

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
      buildEnvelope(pub, invoiceRow(4, { id: 'bill-kirana-iso', tender: 'cash', lines: [] }), digest),
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

  // Without reconciliation, republishing an older backup alongside projected
  // invoices from the old generation misstates stock. Keep the native outbox
  // pending rather than acknowledging a mixed-generation projection.
  await admin.query(`UPDATE native_replication.devices SET restore_generation = 'gen-2' WHERE device_id = $1`, [pub.deviceId]);
  const restoredPub = { ...pub, restoreGeneration: 'gen-2' };
  let blockedRestore = false;
  try {
    await ingestDurable(
      dbA, restoredPub,
      buildEnvelope(restoredPub, invoiceRow(1, { id: 'bill-race-same', tender: 'cash', lines: [] }), digest),
      digest, NOW,
    );
  } catch (error) {
    blockedRestore = error instanceof ReplicationError && error.code === 'STALE_GENERATION';
  }
  check(blockedRestore, 'older-generation re-export is blocked before a new event or ack');
  const genTwo = await admin.query(
    `SELECT COUNT(*)::int AS n FROM native_replication.events WHERE business_id = $1 AND restore_generation = 'gen-2'`,
    [pub.businessId],
  );
  check(genTwo.rows[0].n === 0, 'restore rejection leaves the PostgreSQL event log unchanged');
  const genTwoAcks = await admin.query(
    `SELECT COUNT(*)::int AS n FROM native_replication.acks WHERE business_id = $1 AND restore_generation = 'gen-2'`,
    [pub.businessId],
  );
  check(genTwoAcks.rows[0].n === 0, 'restore rejection did not acknowledge an unseen sale');
  await admin.query(`UPDATE native_replication.devices SET restore_generation = 'gen-1' WHERE device_id = $1`, [pub.deviceId]);

  await workerA.end();
  await workerB.end();
  const restarted = new pg.Client({ connectionString: url });
  await restarted.connect();
  const hydrated = await hydrateFromPostgres(asDb(restarted), pub.businessId);
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
      body: buildEnvelope(pub, invoiceRow(5, { id: 'bill-https-pg', tender: 'cash', lines: [] }), digest),
    });
    check(httpsAck.duplicate === false, 'HTTPS ingest against real PostgreSQL commits');
    let stolen = false;
    try {
      await postStagingIngest({
        hostname: '127.0.0.1',
        port: server.port,
        ca: readFileSync(certPath),
        token: issueStagingToken(secret, owner),
        body: buildEnvelope(pub, invoiceRow(6, { id: 'bill-https-stolen', tender: 'cash', lines: [] }), digest),
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
        body: buildEnvelope(pub, invoiceRow(6, { id: 'bill-https-exp', tender: 'cash', lines: [] }), digest),
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

  await admin.end();
  console.log(`verify-replication-postgres: ${checks} checks passed on server PostgreSQL`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
