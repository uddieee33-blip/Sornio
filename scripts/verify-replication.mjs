#!/usr/bin/env node
/**
 * Phase 2 desktop-to-cloud replication tests.
 * Compiles packages/replication-cloud with companion snapshot contracts.
 * Does not talk to production and does not enable live mobile sync.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function compiler() {
  try {
    return require.resolve('typescript/lib/tsc.js');
  } catch {
    return require.resolve('typescript/lib/tsc.js', { paths: [join(root, 'apps/mobile')] });
  }
}

const out = mkdtempSync(join(tmpdir(), 'sornio-replication-'));
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
};

const replicationFiles = [
  'types.ts',
  'auth.ts',
  'envelope.ts',
  'store.ts',
  'project.ts',
  'ingest.ts',
  'snapshot.ts',
  'publisher.ts',
  'index.ts',
].map((name) => join(root, 'packages/replication-cloud/src', name));

const contractFiles = [
  'money.ts',
  'errors.ts',
  'identity.ts',
  'session.ts',
  'sync.ts',
  'snapshot.ts',
  'validation.ts',
].map((name) => join(root, 'packages/mobile-contracts/src', name));

try {
  execFileSync(
    process.execPath,
    [
      compiler(),
      ...replicationFiles,
      ...contractFiles,
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
    ],
    { stdio: 'inherit' },
  );

  const {
    CloudStore,
    DesktopPublisher,
    InMemoryTransport,
    ReplicationError,
    STREAMS,
    buildCompanionSnapshot,
    buildEnvelope,
    ingestEnvelope,
    parseEnvelope,
    requirePublisher,
    requireReader,
    toSyncEnvelope,
    checkoutProceedsIfCloudDown,
  } = require(join(out, 'replication-cloud/src/index.js'));
  const { parseCompanionSnapshot } = require(join(out, 'mobile-contracts/src/validation.js'));
  const { decideSnapshotApply } = require(join(out, 'mobile-contracts/src/sync.js'));

  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const NOW = Date.parse('2026-11-03T10:00:00.000Z');
  const ISO = '2026-11-03T10:00:00.000Z';

  const actor = (role, extra = {}) => ({
    businessId: extra.businessId || 'biz-kirana-01',
    businessName: extra.businessName || 'Jalandhar Kirana',
    portalId: extra.portalId || 'kirana',
    deviceId: extra.deviceId || `device-${role}-01`,
    displayName: extra.displayName || `${role} desk`,
    role,
    restoreGeneration: extra.restoreGeneration || 'gen-1',
    expiresAtMs: extra.expiresAtMs ?? NOW + 3_600_000,
    revoked: extra.revoked === true,
  });

  const enroll = (store, principal) => {
    store.registerDevice(principal);
    return principal;
  };

  const publish = (store, publisher, row) =>
    ingestEnvelope(store, publisher, buildEnvelope(publisher, row, digest), digest, NOW);

  const expectCode = (code, run) => {
    try {
      run();
      assert.fail(`expected ${code}`);
    } catch (error) {
      check(error instanceof ReplicationError && error.code === code, `error ${code}`);
    }
  };

  const productRow = (sequence = 1) => ({
    stream: 'inventory',
    sequence,
    operationId: `invn-${sequence}`,
    occurredAtIso: ISO,
    payload: {
      version: 1,
      kind: 'product_added',
      operationId: `invn-${sequence}`,
      product: {
        id: 'atta-001',
        name: 'Atta 10kg',
        sku: 'ATTA10',
        unit: 'bag',
        unitPricePaise: 42000,
        stockMilli: 5000,
        revision: 1,
        reorderMilli: 1000,
      },
    },
  });

  const customerRow = (sequence = 1) => ({
    stream: 'customer',
    sequence,
    operationId: `cust-${sequence}`,
    occurredAtIso: ISO,
    payload: {
      version: 1,
      kind: 'customer.saved',
      operationId: `cust-${sequence}`,
      value: {
        id: 'cust-ravi',
        name: 'Ravi Singh',
        phone: '9876543210',
        creditLimitPaise: 200000,
        creditDays: 14,
        revision: 1,
        balancePaise: '0',
      },
    },
  });

  const invoiceRow = (sequence, extra = {}) => ({
    stream: 'billing',
    sequence,
    operationId: extra.id || `bill-${sequence}`,
    occurredAtIso: extra.occurredAtIso || ISO,
    payload: {
      version: 1,
      kind: 'invoice.posted',
      operationId: extra.id || `bill-${sequence}`,
      invoice: {
        id: extra.id || `bill-${sequence}`,
        createdAt: extra.occurredAtIso || ISO,
        lines: extra.lines || [
          {
            productId: 'atta-001',
            name: 'Atta 10kg',
            unit: 'bag',
            quantityMilli: 1000,
            unitPricePaise: 100000,
            totalPaise: 100000,
          },
        ],
        subtotalPaise: extra.totalPaise || 100000,
        taxPaise: 0,
        totalPaise: extra.totalPaise || 100000,
        taxBasisPoints: 0,
        tender: extra.tender || 'retail',
        customerId: extra.customerId === undefined ? 'cust-ravi' : extra.customerId,
        customerName: extra.customerName || 'Ravi Singh',
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
          invoice: { id: invoiceId },
          payments,
        },
      },
    },
  });

  const creditLinked = (sequence, amount) => ({
    stream: 'customer',
    sequence,
    operationId: `cred-${sequence}`,
    occurredAtIso: ISO,
    payload: {
      version: 1,
      kind: 'credit.linked',
      operationId: `cred-${sequence}`,
      value: {
        operationId: `cred-${sequence}`,
        customerId: 'cust-ravi',
        kind: 'sale',
        amountPaise: amount,
        balancePaise: String(amount),
      },
    },
  });

  check(STREAMS.join(',') === 'billing,customer,retail,inventory', 'four independent streams');
  const productionSrc = readFileSync(join(root, 'packages/mobile-contracts/src/production.ts'), 'utf8');
  check(productionSrc.includes("PRODUCTION_SYNC_PATH = '/v1/mobile/snapshot'"), 'production path unchanged');

  const productionFlag = readFileSync(join(root, 'apps/mobile/app.json'), 'utf8');
  check(productionFlag.includes('"productionSyncEnabled": false'), 'companion production sync stays disabled');

  const schema = readFileSync(join(root, 'packages/local-store/src/lib.rs'), 'utf8');
  check(/const SCHEMA_VERSION: i64 = 12;/.test(schema), 'financial schema remains 12');
  check(schema.includes('pub mod replication;'), 'sidecar publisher module is declared');

  const sql = readFileSync(
    join(root, 'packages/replication-cloud/sql/20261103000000_native_financial_replication.sql'),
    'utf8',
  );
  check(sql.includes('REVIEW ONLY'), 'SQL migration is review-only');
  check(!sql.includes('AUTO APPLY') && !sql.includes('auto-apply'), 'SQL is not auto-applied');
  check(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS is required');
  check(sql.includes('sornio_publisher'), 'publisher role is separate from readers');
  check(!sql.includes('service_role'), 'no service-role credential in migration');

  const replicationRs = readFileSync(join(root, 'packages/local-store/src/replication.rs'), 'utf8');
  check(replicationRs.includes('outside the financial'), 'sidecar is outside financial schema');
  check(replicationRs.includes('restore generation'), 'acks key by restore generation');

  const publisher = actor('publisher');
  const owner = actor('owner');
  const manager = actor('manager');
  const cashier = actor('cashier');
  const auditor = actor('auditor');

  expectCode('FORBIDDEN', () => requirePublisher(owner, NOW));
  expectCode('FORBIDDEN', () => requirePublisher(manager, NOW));
  expectCode('FORBIDDEN', () => requirePublisher(cashier, NOW));
  expectCode('FORBIDDEN', () => requirePublisher(auditor, NOW));
  check(requirePublisher(publisher, NOW).role === 'publisher', 'publisher may ingest');
  expectCode('FORBIDDEN', () => requireReader(publisher, NOW));
  check(requireReader(owner, NOW).role === 'owner', 'owner may read');

  const store = new CloudStore();
  enroll(store, publisher);
  enroll(store, owner);
  enroll(store, manager);
  enroll(store, cashier);
  enroll(store, auditor);

  publish(store, publisher, productRow(1));
  publish(store, publisher, customerRow(1));
  publish(
    store,
    publisher,
    invoiceRow(1, { id: 'bill-split-1', tender: 'retail', customerId: 'cust-ravi', totalPaise: 100000 }),
  );
  publish(
    store,
    publisher,
    retailSale(1, 'bill-split-1', [
      { id: 'pay-cash', method: 'cash', amountPaise: 60000, reference: '' },
      { id: 'pay-credit', method: 'credit', amountPaise: 40000, reference: '' },
    ]),
  );
  publish(store, publisher, creditLinked(2, 40000));

  const ownerSnap = buildCompanionSnapshot(store, owner, ISO, NOW);
  const parsed = parseCompanionSnapshot(ownerSnap);
  check(parsed.overview.todaySales.totalPaise === '100000', '₹1,000 total as integer paise');
  check(parsed.overview.todaySales.cashPaise === '60000', '₹600 cash');
  check(parsed.overview.todaySales.creditPaise === '40000', '₹400 credit');
  check(parsed.activity[0].amountPaise === '100000', 'activity total paise');
  check(parsed.activity[0].cashPaise === '60000' && parsed.activity[0].creditPaise === '40000', 'activity split');
  check(parsed.customers[0].outstandingPaise === '40000', 'customer outstanding from credit.linked');
  check(parsed.inventory[0].quantityMilli === '4000', 'sale decrements projected stock');
  check(typeof parsed.overview.todaySales.totalPaise === 'string', 'money is a string');
  check(!parsed.overview.todaySales.totalPaise.includes('.'), 'no decimal money');
  check(parsed.mode === 'live' && parsed.source === 'desktop-outbox', 'live desktop-outbox snapshot');
  check(parsed.cursor === '5', 'canonical cursor after five events');

  const decision = decideSnapshotApply(null, toSyncEnvelope(parsed, owner.deviceId));
  check(decision.ok === true && decision.kind === 'applied', 'first snapshot applies');
  const duplicate = decideSnapshotApply(toSyncEnvelope(parsed, owner.deviceId), toSyncEnvelope(parsed, owner.deviceId));
  check(duplicate.ok === true && duplicate.kind === 'duplicate', 'same cursor is duplicate');

  const cashierSnap = buildCompanionSnapshot(store, cashier, ISO, NOW);
  parseCompanionSnapshot(cashierSnap);
  check(cashierSnap.customers.length === 0, 'cashier does not receive customer ledger');
  check(cashierSnap.overview.outstandingCreditPaise === '0', 'cashier outstanding is withheld');
  check(JSON.stringify(cashierSnap.customers) !== JSON.stringify(ownerSnap.customers), 'roles are not identical');

  const managerSnap = buildCompanionSnapshot(store, manager, ISO, NOW);
  parseCompanionSnapshot(managerSnap);
  check(managerSnap.customers.length === 1, 'manager receives customers');

  expectCode('FORBIDDEN', () => buildCompanionSnapshot(store, publisher, ISO, NOW));

  const other = actor('publisher', {
    businessId: 'biz-salon-99',
    businessName: 'Model Town Salon',
    portalId: 'salon',
    deviceId: 'device-publisher-99',
  });
  const otherOwner = actor('owner', {
    businessId: 'biz-salon-99',
    businessName: 'Model Town Salon',
    portalId: 'salon',
    deviceId: 'device-owner-99',
    displayName: 'salon owner',
  });
  enroll(store, other);
  enroll(store, otherOwner);
  publish(
    store,
    other,
    invoiceRow(1, {
      id: 'bill-salon-1',
      tender: 'cash',
      customerId: null,
      customerName: 'Walk-in',
      totalPaise: 25000,
      lines: [],
    }),
  );
  const salonSnap = buildCompanionSnapshot(store, otherOwner, ISO, NOW);
  parseCompanionSnapshot(salonSnap);
  check(salonSnap.activity.every((row) => row.id.startsWith('bill-salon')), 'business B cannot see business A sales');
  check(ownerSnap.activity.every((row) => row.id.startsWith('bill-split')), 'business A cannot see business B sales');

  const staleIncoming = toSyncEnvelope(
    { ...parsed, restoreGeneration: 'gen-restored', cursor: '6' },
    owner.deviceId,
  );
  const generationDecision = decideSnapshotApply(toSyncEnvelope(parsed, owner.deviceId), staleIncoming);
  check(generationDecision.ok === false, 'restore generation mismatch fails closed');

  expectCode('STALE_GENERATION', () =>
    ingestEnvelope(
      store,
      { ...publisher, restoreGeneration: 'gen-old' },
      buildEnvelope({ ...publisher, restoreGeneration: 'gen-old' }, invoiceRow(2, { id: 'bill-old' }), digest),
      digest,
      NOW,
    ),
  );

  const again = publish(
    store,
    publisher,
    invoiceRow(1, { id: 'bill-split-1', tender: 'retail', customerId: 'cust-ravi', totalPaise: 100000 }),
  );
  check(again.duplicate === true && again.cursor === '3', 'idempotent ingest returns original cursor');

  expectCode('CONFLICT', () =>
    publish(store, publisher, invoiceRow(9, { id: 'bill-split-1', tender: 'cash', totalPaise: 1 })),
  );

  expectCode('GAP', () => publish(store, publisher, invoiceRow(3, { id: 'bill-gap' })));
  const billingTwo = publish(store, publisher, invoiceRow(2, { id: 'bill-cash-2', tender: 'cash', customerId: null, customerName: 'Walk-in', lines: [] }));
  check(billingTwo.duplicate === false, 'next billing sequence after 1 is 2');

  expectCode('FORBIDDEN', () =>
    ingestEnvelope(store, owner, buildEnvelope(publisher, invoiceRow(4, { id: 'bill-owner' }), digest), digest, NOW),
  );
  expectCode('REVOKED', () =>
    ingestEnvelope(
      store,
      { ...publisher, revoked: true },
      buildEnvelope(publisher, invoiceRow(4, { id: 'bill-revoked' }), digest),
      digest,
      NOW,
    ),
  );
  expectCode('EXPIRED', () =>
    ingestEnvelope(
      store,
      { ...publisher, expiresAtMs: NOW - 1 },
      buildEnvelope(publisher, invoiceRow(4, { id: 'bill-expired' }), digest),
      digest,
      NOW,
    ),
  );
  expectCode('WRONG_BUSINESS', () => {
    const env = buildEnvelope(publisher, invoiceRow(4, { id: 'bill-wrong' }), digest);
    env.businessId = 'biz-salon-99';
    ingestEnvelope(store, publisher, env, digest, NOW);
  });

  const badHash = buildEnvelope(publisher, invoiceRow(4, { id: 'bill-hash' }), digest);
  badHash.payloadSha256 = 'aa'.repeat(32);
  expectCode('INVALID_ENVELOPE', () => parseEnvelope(badHash, digest));

  const floatMoney = buildEnvelope(
    publisher,
    {
      ...invoiceRow(3, { id: 'bill-float' }),
      payload: {
        version: 1,
        kind: 'invoice.posted',
        operationId: 'bill-float',
        invoice: {
          id: 'bill-float',
          createdAt: ISO,
          lines: [],
          subtotalPaise: 10.5,
          taxPaise: 0,
          totalPaise: 10.5,
          taxBasisPoints: 0,
          tender: 'cash',
          customerId: null,
        },
      },
    },
    digest,
  );
  expectCode('INVALID_ENVELOPE', () => ingestEnvelope(store, publisher, floatMoney, digest, NOW));

  const sidecar = new CloudStore();
  const pub = enroll(sidecar, actor('publisher', { deviceId: 'device-publisher-flush' }));
  enroll(sidecar, actor('owner', { deviceId: 'device-owner-flush' }));
  const transport = new InMemoryTransport(sidecar, pub, digest, () => NOW);
  const desktop = new DesktopPublisher(pub, digest, transport, 'gen-1');
  desktop.noteCommit(productRow(1));
  desktop.noteCommit(customerRow(1));
  desktop.noteCommit(invoiceRow(1, { id: 'bill-split-1', tender: 'retail' }));
  desktop.noteCommit(
    retailSale(1, 'bill-split-1', [
      { id: 'pay-cash', method: 'cash', amountPaise: 60000, reference: '' },
      { id: 'pay-credit', method: 'credit', amountPaise: 40000, reference: '' },
    ]),
  );
  desktop.writerLocked = true;
  let lockedDuringSend = false;
  const originalSend = transport.send.bind(transport);
  transport.send = async (envelope) => {
    lockedDuringSend = desktop.writerLocked;
    return originalSend(envelope);
  };
  await desktop.flush(NOW);
  check(lockedDuringSend === false, 'network flush does not hold the writer lock');
  check(desktop.ack.lastSequence.billing === 1, 'sidecar acked billing');
  check(desktop.pending.length === 0, 'acked rows leave the pending sidecar');

  transport.failure = 'network';
  desktop.noteCommit(invoiceRow(2, { id: 'bill-offline', tender: 'cash', customerId: null, customerName: 'Walk-in', lines: [] }));
  try {
    await desktop.flush(NOW);
    assert.fail('network should fail');
  } catch (error) {
    check(checkoutProceedsIfCloudDown(error), 'checkout continues when cloud is down');
    check(desktop.pending.some((row) => row.operationId === 'bill-offline'), 'failed publish stays pending');
  }
  transport.failure = 'none';
  await desktop.flush(NOW);
  check(!desktop.pending.some((row) => row.operationId === 'bill-offline'), 'retry after network success');

  desktop.onRestore('gen-2');
  check(desktop.ack.lastSequence.billing === 0, 'restore generation resets publish cursor');
  const restored = actor('publisher', { deviceId: 'device-publisher-flush', restoreGeneration: 'gen-2' });
  sidecar.rotateGeneration('biz-kirana-01', 'gen-2');
  const restoredPublisher = new DesktopPublisher(restored, digest, new InMemoryTransport(sidecar, restored, digest, () => NOW), 'gen-1');
  restoredPublisher.onRestore('gen-2');
  restoredPublisher.noteCommit(invoiceRow(1, { id: 'bill-restored', tender: 'cash', customerId: null, customerName: 'Walk-in', lines: [] }));
  const restoredAcks = await restoredPublisher.flush(NOW);
  check(restoredAcks[0].duplicate === false, 'restored outbox is republished from sequence 1');

  const sources = [
    readFileSync(join(root, 'packages/replication-cloud/src/ingest.ts'), 'utf8'),
    readFileSync(join(root, 'packages/replication-cloud/src/auth.ts'), 'utf8'),
    readFileSync(join(root, 'packages/replication-cloud/sql/20261103000000_native_financial_replication.sql'), 'utf8'),
    readFileSync(join(root, 'docs/mobile/PHASE-2-DESKTOP-CLOUD-REPLICATION.md'), 'utf8'),
  ].join('\n');
  check(!/eyJ[A-Za-z0-9_-]{20,}/.test(sources), 'no embedded JWT secrets');
  check(!sources.includes('SERVICE_ROLE'), 'no service role secret');
  check(sources.includes('PR #143') || sources.includes('#143'), 'Phase 1 PR dependency is documented');

  console.log(`verify-replication: ${checks} checks passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
