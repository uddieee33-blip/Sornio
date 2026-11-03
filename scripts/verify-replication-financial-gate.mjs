#!/usr/bin/env node
/**
 * P0 release gate for native-shaped outbox projections. No real shop data,
 * SQLCipher, production service or remote PostgreSQL is used: this compiles the
 * cloud code and checks an isolated PGlite database after persistence/reload.
 * Deliberately fails until native credit and return effects are faithfully
 * projected. A green generic replication check is NOT a release approval.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compiled = mkdtempSync(join(tmpdir(), 'sornio-financial-gate-'));
const ISO = '2026-11-03T10:00:00.000Z';
const NOW = Date.parse(ISO);
const digest = (text) => createHash('sha256').update(text).digest('hex');
let db;

function principal(businessId, role) {
  return {
    businessId,
    businessName: 'Synthetic release gate shop',
    portalId: 'kirana',
    deviceId: `device-${role}-${businessId}`,
    displayName: role,
    role,
    restoreGeneration: 'gen-1',
    expiresAtMs: NOW + 3_600_000,
    revoked: false,
  };
}

function outbox(stream, sequence, operationId, payload) {
  return { stream, sequence, operationId, occurredAtIso: ISO, payload };
}

function customer(sequence, operationId, balancePaise) {
  return outbox('customer', sequence, operationId, {
    version: 1, kind: 'customer.saved', operationId,
    value: { id: 'customer-one', name: 'Synthetic customer', balancePaise, creditLimitPaise: 500000, revision: sequence },
  });
}

function invoice(id, tender, sequence, lines = [], customerId = 'customer-one') {
  return outbox('billing', sequence, id, {
    version: 1, kind: 'invoice.posted', operationId: id,
    invoice: { id, createdAt: ISO, lines, subtotalPaise: 100000, taxPaise: 0, totalPaise: 100000, tender, customerId },
  });
}

function retail(id, sequence, kind, data) {
  return outbox('retail', sequence, id, {
    version: 1, actorId: 'synthetic-owner',
    receipt: { operationId: id, kind, data },
  });
}

try {
  const compiler = require.resolve('typescript/lib/tsc.js');
  execFileSync(process.execPath, [
    compiler,
    ...['types', 'auth', 'envelope', 'payments', 'store', 'project', 'ingest', 'snapshot', 'publisher', 'postgres', 'https', 'index']
      .map((name) => join(root, 'packages/replication-cloud/src', `${name}.ts`)),
    ...['money', 'errors', 'identity', 'session', 'sync', 'snapshot', 'validation']
      .map((name) => join(root, 'packages/mobile-contracts/src', `${name}.ts`)),
    '--outDir', compiled, '--rootDir', join(root, 'packages'), '--module', 'commonjs',
    '--target', 'es2022', '--strict', '--skipLibCheck', '--ignoreConfig',
    '--esModuleInterop', '--types', 'node', '--typeRoots', join(root, 'node_modules/@types'),
  ], { stdio: 'inherit' });
  const {
    applyReplicationMigration, enrollPrivileged, ingestDurable, buildEnvelope,
    hydrateFromPostgres, buildCompanionSnapshot,
  } = require(join(compiled, 'replication-cloud/src/index.js'));

  db = new PGlite();
  await applyReplicationMigration(
    db,
    readFileSync(join(root, 'packages/replication-cloud/sql/20261103000000_native_financial_replication.sql'), 'utf8'),
  );
  const findings = [];
  const check = (id, actual, expected, description) => {
    if (actual !== expected) {
      findings.push(`${id}: expected ${expected}, observed ${actual} — ${description}`);
      console.error(`FAIL ${findings.at(-1)}`);
    } else {
      console.log(`PASS ${id}: ${description} (${actual})`);
    }
  };
  const openShop = async (businessId) => {
    const publisher = principal(businessId, 'publisher');
    const owner = principal(businessId, 'owner');
    await enrollPrivileged(db, publisher);
    await enrollPrivileged(db, owner);
    return {
      publisher, owner,
      publish: (row) => ingestDurable(db, publisher, buildEnvelope(publisher, row, digest), digest, NOW),
      snapshot: async () => buildCompanionSnapshot(await hydrateFromPostgres(db, businessId), owner, ISO, NOW),
    };
  };

  const shop = await openShop('biz-gate-first');
  await shop.publish(customer(1, 'customer-created', '0'));
  await shop.publish(invoice('full-credit', 'credit', 1));
  await shop.publish(invoice('split-credit', 'retail', 2));
  await shop.publish(retail('split-credit', 1, 'sale', {
    invoice: { id: 'split-credit', totalPaise: 100000, customerId: 'customer-one' },
    payments: [
      { id: 'cash-600', method: 'cash', amountPaise: 60000 },
      { id: 'credit-400', method: 'credit', amountPaise: 40000 },
    ],
    externallyVerified: false,
  }));
  // Native post_sale/post_split_credit write local_credit_entries, not a
  // credit.posted or credit.linked outbox event. A synthetic link would hide
  // this discrepancy. Customer.saved was emitted before both sales.
  const nativeShaped = await shop.snapshot();
  const split = nativeShaped.activity.find((row) => row.id === 'split-credit');
  check('CREDIT-ALLOC', `${split?.cashPaise}/${split?.creditPaise}`, '60000/40000', 'split allocation is retained');
  check('CREDIT-CUSTOMER', nativeShaped.customers[0]?.outstandingPaise, '140000', 'full + split sales update customer debt');
  check('CREDIT-OVERVIEW', nativeShaped.overview.outstandingCreditPaise, '140000', 'overview equals native sale credit without an invented link event');
  const durable = await db.query(
    `SELECT outstanding_paise::text AS balance FROM native_replication.customers WHERE business_id = $1`,
    [shop.publisher.businessId],
  );
  check('CREDIT-PG', durable.rows[0]?.balance, '140000', 'PostgreSQL persisted customer projection matches the native sale ledger');

  const returnShop = await openShop('biz-gate-return');
  await returnShop.publish(outbox('inventory', 1, 'rice-created', {
    version: 1, kind: 'product_added', operationId: 'rice-created',
    product: { id: 'rice', name: 'Rice', sku: 'RICE', stockMilli: 2000, reorderMilli: 0 },
  }));
  await returnShop.publish(invoice('cash-returned', 'cash', 1, [{ productId: 'rice', quantityMilli: 1000 }], null));
  await returnShop.publish(retail('return-cash', 1, 'return', {
    invoiceId: 'cash-returned', subtotalPaise: 100000, taxPaise: 0, totalPaise: 100000,
    cashOutPaise: 100000, pendingRefundIds: [], stockRestored: true,
    returnLines: [{ lineIndex: 0, quantityMilli: 1000, disposition: 'sellable' }],
  }));
  const returned = await returnShop.snapshot();
  check('RETURN-STOCK', returned.inventory.find((row) => row.id === 'rice')?.quantityMilli, '2000', 'sellable native return restores projected inventory after restart');

  // The customer.saved stream can run ahead of billing during backlog flush.
  // Future projection fixes must not double-count a later saved balance that
  // already includes the native credit entries.
  const backlogged = await openShop('biz-gate-backlog');
  await backlogged.publish(customer(1, 'customer-created', '0'));
  await backlogged.publish(customer(2, 'customer-renamed', '140000'));
  await backlogged.publish(invoice('full-credit', 'credit', 1));
  await backlogged.publish(invoice('split-credit', 'retail', 2));
  await backlogged.publish(retail('split-credit', 1, 'sale', {
    invoice: { id: 'split-credit', totalPaise: 100000, customerId: 'customer-one' },
    payments: [
      { id: 'cash-600', method: 'cash', amountPaise: 60000 },
      { id: 'credit-400', method: 'credit', amountPaise: 40000 },
    ],
    externallyVerified: false,
  }));
  check('BACKLOG-REPLAY', (await backlogged.snapshot()).customers[0]?.outstandingPaise, '140000', 'later saved balance is not doubled by reordered outboxes');

  if (findings.length > 0) {
    console.error(`verify-replication-financial-gate: ${findings.length} release-blocking invariant(s) FAILED. No production sync.`);
    process.exitCode = 1;
  } else {
    console.log('verify-replication-financial-gate: all six independent checks passed.');
  }
} catch (error) {
  console.error('verify-replication-financial-gate: execution error (not a pass):', error);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
  rmSync(compiled, { recursive: true, force: true });
}
