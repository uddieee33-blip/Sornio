#!/usr/bin/env node
/**
 * Native SQLCipher outbox TEXT -> TLS ingest -> real PostgreSQL.
 * Requires DATABASE_URL and SORNIO_NATIVE_OUTBOX_DIR from the Rust export.
 * Node-built envelopes are not used as the financial payload.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL || process.env.SORNIO_PG_URL;
const outboxDir = process.env.SORNIO_NATIVE_OUTBOX_DIR;

function failClosed(message) {
  const line = message.replace(/\r?\n/g, ' | ');
  console.error(`::error file=scripts/verify-replication-native-https.mjs,line=1::native-https ${line}`);
  if (outboxDir) {
    try {
      writeFileSync(join(outboxDir, 'https-error.txt'), `${message}\n`);
    } catch {
      // best-effort
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`, { flag: 'a' });
    } catch {
      // best-effort
    }
  }
  process.exit(process.env.CI ? 1 : 2);
}

if (!url) {
  failClosed('DATABASE_URL is required for native-to-PostgreSQL HTTPS proof.');
}
if (!outboxDir || !existsSync(join(outboxDir, 'manifest.json'))) {
  failClosed(
    `SORNIO_NATIVE_OUTBOX_DIR must contain native SQLCipher export files (dir=${outboxDir || '<unset>'}).`,
  );
}

function compiler() {
  try {
    return require.resolve('typescript/lib/tsc.js');
  } catch {
    return require.resolve('typescript/lib/tsc.js', { paths: [join(root, 'apps/mobile')] });
  }
}

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

const compiled = mkdtempSync(join(tmpdir(), 'sornio-native-https-'));
let checks = 0;
let lastCheck = 'startup';
const check = (condition, label) => {
  lastCheck = label;
  assert.ok(condition, label);
  checks += 1;
};

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
      compiled,
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
    ingestDurable,
    hydrateFromPostgres,
    enrollPrivileged,
    issueStagingToken,
    verifyStagingToken,
    listenStagingIngest,
    postStagingIngest,
    buildCompanionSnapshot,
  } = require(join(compiled, 'replication-cloud/src/index.js'));
  const { parseCompanionSnapshot } = require(join(compiled, 'mobile-contracts/src/validation.js'));

  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const NOW = Date.parse('2026-11-03T12:00:00.000Z');
  const ISO = '2026-11-03T12:00:00.000Z';
  const sql = readFileSync(
    join(root, 'packages/replication-cloud/sql/20261103000000_native_financial_replication.sql'),
    'utf8',
  );
  const identity = JSON.parse(readFileSync(join(outboxDir, 'identity.json'), 'utf8'));
  const ledger = JSON.parse(readFileSync(join(outboxDir, 'native_ledger.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(outboxDir, 'manifest.json'), 'utf8'));
  check(Array.isArray(manifest.rows) && manifest.rows.length > 0, 'native export listed unpublished rows');
  check(ledger.invoiceCount === 7, 'native ledger has seven invoices');

  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const db = asDb(admin);
  for (const stmt of statements(sql)) {
    try {
      await admin.query(stmt);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      if (code !== '42P07' && code !== '42710') throw error;
    }
  }

  const pub = {
    businessId: identity.businessId,
    businessName: identity.businessName || 'Replication shop',
    portalId: identity.portalId || 'kirana',
    deviceId: identity.deviceId,
    displayName: 'publisher desk',
    role: 'publisher',
    restoreGeneration: identity.restoreGeneration,
    expiresAtMs: NOW + 3_600_000,
    revoked: false,
  };
  const owner = {
    ...pub,
    deviceId: 'device-owner-native-e2e',
    role: 'owner',
    displayName: 'owner desk',
  };
  await enrollPrivileged(db, pub);
  await enrollPrivileged(db, owner);

  const tlsDir = mkdtempSync(join(tmpdir(), 'sornio-native-tls-'));
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
  const otherCert = join(tlsDir, 'other.pem');
  const otherKey = join(tlsDir, 'other-key.pem');
  execFileSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes',
      '-keyout', otherKey, '-out', otherCert, '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'pipe' },
  );

  const httpsDb = new pg.Client({ connectionString: url });
  await httpsDb.connect();
  const secret = randomBytes(32).toString('hex');
  const server = await listenStagingIngest({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    ingest: (principal, body) => ingestDurable(asDb(httpsDb), principal, body, digest, NOW),
    verify: verifyStagingToken(secret),
    nowMs: () => NOW,
  });
  const token = issueStagingToken(secret, pub);
  const postRaw = (auth, bodyText, ca = readFileSync(certPath)) =>
    postStagingIngest({
      hostname: '127.0.0.1',
      port: server.port,
      ca,
      token: auth,
      bodyText,
    });

  const first = manifest.rows[0];
  const firstText = readFileSync(join(outboxDir, first.envelopeFile), 'utf8');
  let expired = false;
  try {
    await postRaw(issueStagingToken(secret, { ...pub, expiresAtMs: NOW - 1 }), firstText);
  } catch (error) {
    expired = error instanceof ReplicationError && error.code === 'EXPIRED';
  }
  check(expired, 'expired token fails before native envelope commit');

  let stolen = false;
  try {
    await postRaw(issueStagingToken(secret, owner), firstText);
  } catch (error) {
    stolen = error instanceof ReplicationError && error.code === 'FORBIDDEN';
  }
  check(stolen, 'owner token cannot ingest a publisher envelope');

  let badTls = false;
  try {
    await postRaw(token, firstText, readFileSync(otherCert));
  } catch {
    badTls = true;
  }
  check(badTls, 'wrong TLS certificate fails closed');

  const flipped = first.digest.slice(-1) === 'a' ? 'b' : 'a';
  const tampered = firstText.replace(first.digest, `${first.digest.slice(0, 63)}${flipped}`);
  let badDigest = false;
  try {
    await postRaw(token, tampered);
  } catch (error) {
    badDigest = error instanceof ReplicationError && error.code === 'INVALID_ENVELOPE';
  }
  check(badDigest, 'tampered digest is rejected');

  const parsedFirst = JSON.parse(firstText);
  const mutated = {
    ...parsedFirst,
    payloadText: `${parsedFirst.payloadText.slice(0, -1)} `,
  };
  let tamperedPayload = false;
  try {
    await postRaw(token, JSON.stringify(mutated));
  } catch (error) {
    tamperedPayload = error instanceof ReplicationError && error.code === 'INVALID_ENVELOPE';
  }
  check(tamperedPayload, 'payload TEXT mutation fails the native digest');

  let malformed = false;
  try {
    await postRaw(token, '{');
  } catch {
    malformed = true;
  }
  check(malformed, 'malformed envelope fails closed');

  const acks = [];
  for (const row of manifest.rows) {
    const payloadText = readFileSync(join(outboxDir, row.payloadFile), 'utf8');
    const envelopeText = readFileSync(join(outboxDir, row.envelopeFile), 'utf8');
    const digestName = row.envelopeFile.replace('envelopes/', 'digests/').replace(/\.json$/, '.sha256');
    const fileDigest = readFileSync(join(outboxDir, digestName), 'utf8').trim();
    const hashed = digest(payloadText);
    const envelope = JSON.parse(envelopeText);
    check(payloadText === envelope.payloadText, `${row.operationId} envelope payloadText is SQLCipher TEXT`);
    check(hashed === row.digest && hashed === fileDigest && hashed === envelope.payloadSha256, `${row.operationId} SHA-256 is stable across export files`);
    const ack = await postRaw(token, envelopeText);
    check(ack.duplicate === false, `${row.operationId} first HTTPS ingest commits`);
    const retry = await postRaw(token, envelopeText);
    check(retry.duplicate === true && retry.cursor === ack.cursor, `${row.operationId} lost-ack retry is idempotent`);
    const stored = await admin.query(
      `SELECT payload_sha256 FROM native_replication.events
        WHERE business_id = $1 AND operation_id = $2 AND stream = $3`,
      [pub.businessId, row.operationId, row.stream],
    );
    check(stored.rows.length === 1 && stored.rows[0].payload_sha256 === hashed, `${row.operationId} PostgreSQL digest matches SQLCipher TEXT`);
    acks.push({
      stream: row.stream,
      sequence: row.sequence,
      operationId: row.operationId,
      ack: { operationId: ack.operationId, cursor: ack.cursor, duplicate: ack.duplicate, businessId: pub.businessId },
    });
  }
  writeFileSync(join(outboxDir, 'acks.jsonl'), acks.map((row) => JSON.stringify(row)).join('\n'));

  // Keep the mutated TEXT valid JSON: appending `x` tests only JSON parsing,
  // not idempotency. A real digest-valid conflicting operation must reach the
  // committed-event identity check and return CONFLICT specifically.
  const changedPayload = { ...JSON.parse(parsedFirst.payloadText), auditMarker: 'changed-value' };
  const changedText = JSON.stringify(changedPayload);
  let conflicted = false;
  try {
    await postRaw(token, JSON.stringify({
      ...parsedFirst,
      payload: changedPayload,
      payloadText: changedText,
      payloadSha256: digest(changedText),
    }));
  } catch (error) {
    conflicted = error instanceof ReplicationError && error.code === 'CONFLICT';
  }
  check(conflicted, 'digest-valid reused operation id with different payload is CONFLICT');

  let wrongSequence = false;
  try {
    await postRaw(token, JSON.stringify({
      ...parsedFirst,
      streamSequence: (BigInt(parsedFirst.streamSequence) + 1n).toString(),
    }));
  } catch (error) {
    wrongSequence = error instanceof ReplicationError && error.code === 'CONFLICT';
  }
  check(wrongSequence, 'same native payload and operation id at another sequence is CONFLICT');
  const stillOne = await admin.query(
    `SELECT COUNT(*)::int AS n FROM native_replication.events
     WHERE business_id = $1 AND restore_generation = $2 AND stream = $3 AND operation_id = $4`,
    [pub.businessId, pub.restoreGeneration, parsedFirst.stream, parsedFirst.operationId],
  );
  check(stillOne.rows[0].n === 1, 'conflicts leave exactly the original durable event');

  const otherPub = {
    ...pub,
    businessId: 'biz-native-other',
    deviceId: 'device-publisher-other',
    businessName: 'Other shop',
  };
  await enrollPrivileged(db, otherPub);
  let crossTenant = false;
  try {
    await postRaw(issueStagingToken(secret, otherPub), firstText);
  } catch (error) {
    crossTenant = error instanceof ReplicationError && (error.code === 'WRONG_BUSINESS' || error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED');
  }
  check(crossTenant, 'cross-tenant native envelope is rejected');

  let missingAuth = false;
  try {
    await postStagingIngest({
      hostname: '127.0.0.1',
      port: server.port,
      ca: readFileSync(certPath),
      token: '',
      bodyText: firstText,
    });
  } catch (error) {
    missingAuth = error instanceof ReplicationError && error.code === 'UNAUTHENTICATED';
  }
  check(missingAuth, 'missing authentication token fails closed');

  let oversized = false;
  try {
    await postRaw(token, JSON.stringify({ pad: 'a'.repeat(256 * 1024) }));
  } catch (error) {
    oversized = error instanceof ReplicationError && error.code === 'INVALID_ENVELOPE';
  }
  check(oversized, 'oversized request body is rejected before ingest');

  let refused = false;
  try {
    await postStagingIngest({
      hostname: '127.0.0.1',
      port: 1,
      ca: readFileSync(certPath),
      token,
      bodyText: firstText,
    });
  } catch {
    refused = true;
  }
  check(refused, 'connection refused fails closed');

  let plaintext = false;
  try {
    await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.port,
          method: 'POST',
          path: '/v1/replication/ingest',
          timeout: 1500,
        },
        () => resolve(undefined),
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });
      req.end(firstText);
    });
  } catch {
    plaintext = true;
  }
  check(plaintext, 'plaintext HTTP to the TLS ingest port fails closed');

  await admin.query('BEGIN');
  try {
    await admin.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ business_id: pub.businessId, role: 'cashier' }),
    ]);
    await admin.query('SET LOCAL ROLE sornio_cashier');
    const seen = await admin.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.invoices WHERE allocation_status = 'posted'`,
    );
    check(seen.rows[0].n === 7, 'cashier of this business sees the seven posted native invoices');
    let cashierCustomers = false;
    try {
      await admin.query('SELECT customer_id FROM native_replication.customers');
    } catch {
      cashierCustomers = true;
    }
    check(cashierCustomers, 'cashier role cannot read the native customer ledger');
  } finally {
    await admin.query('ROLLBACK');
  }

  await admin.query('BEGIN');
  try {
    await admin.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ business_id: otherPub.businessId, role: 'owner' }),
    ]);
    await admin.query('SET LOCAL ROLE sornio_owner');
    const isolated = await admin.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.invoices WHERE allocation_status = 'posted'`,
    );
    check(isolated.rows[0].n === 0, 'owner of another business sees zero native invoices under RLS');
    const stolenMixed = await admin.query(
      `SELECT COUNT(*)::int AS n FROM native_replication.invoices WHERE invoice_id = 'bill-cash-credit'`,
    );
    check(stolenMixed.rows[0].n === 0, 'cross-business owner cannot read the mixed cash+credit invoice');
  } finally {
    await admin.query('ROLLBACK');
  }

  await admin.query('BEGIN');
  try {
    await admin.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ business_id: pub.businessId, role: 'owner' }),
    ]);
    await admin.query('SET LOCAL ROLE sornio_owner');
    const own = await admin.query(
      `SELECT cash_paise::text AS cash, customer_credit_paise::text AS credit
         FROM native_replication.invoices WHERE invoice_id = 'bill-cash-credit'`,
    );
    check(
      own.rows.length === 1 && own.rows[0].cash === '60000' && own.rows[0].credit === '40000',
      'owner of this business reads mixed sale as cash 60000 + credit 40000',
    );
  } finally {
    await admin.query('ROLLBACK');
  }

  await server.close();
  let unavailable = false;
  try {
    await postRaw(token, firstText);
  } catch {
    unavailable = true;
  }
  check(unavailable, 'ingest after the TLS server closes fails closed');
  await httpsDb.end();

  const restarted = new pg.Client({ connectionString: url });
  await restarted.connect();
  const hydrated = await hydrateFromPostgres(asDb(restarted), pub.businessId);
  const snap = parseCompanionSnapshot(buildCompanionSnapshot(hydrated, owner, ISO, NOW));
  check(snap.activity.length === 7, 'restart hydrate reconstructs seven posted invoices');
  for (const expected of ledger.invoices) {
    const row = snap.activity.find((item) => item.id === expected.id);
    check(!!row, `${expected.id} is in the cloud snapshot`);
    check(row.cashPaise === expected.cash, `${expected.id} cash matches native`);
    check(row.digitalPaise === expected.digital, `${expected.id} digital matches native`);
    check(row.creditPaise === expected.credit, `${expected.id} credit matches native`);
  }
  const mixed = snap.activity.find((item) => item.id === 'bill-cash-credit');
  check(mixed.cashPaise === '60000' && mixed.creditPaise === '40000' && mixed.digitalPaise === '0', 'mixed cash+credit stays split after restart');
  const upi = snap.activity.find((item) => item.id === 'bill-upi-1000');
  check(upi.digitalPaise === '100000' && upi.creditPaise === '0', 'UPI is digital, not customer credit');
  const cloudCash = snap.activity.reduce((sum, row) => sum + BigInt(row.cashPaise), 0n);
  const cloudCredit = snap.activity.reduce((sum, row) => sum + BigInt(row.creditPaise), 0n);
  check(cloudCash.toString() === ledger.cashPaise, 'cloud cash sum matches native cashier cash');
  check(cloudCredit.toString() === ledger.creditPaise, 'cloud credit sum matches native cashier credit');
  await restarted.end();
  await admin.end();
  rmSync(tlsDir, { recursive: true, force: true });
  console.log(`verify-replication-native-https: ${checks} checks passed on SQLCipher TEXT -> TLS -> PostgreSQL`);
} catch (error) {
  const message = `after ${lastCheck} :: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
  const stack = error instanceof Error ? error.stack || '' : '';
  console.error(`::error::native-https ${message.replace(/\r?\n/g, ' | ')}`);
  if (outboxDir) {
    writeFileSync(join(outboxDir, 'https-error.txt'), `${message}\n${stack}\n`);
  }
  process.exitCode = 1;
} finally {
  rmSync(compiled, { recursive: true, force: true });
}
