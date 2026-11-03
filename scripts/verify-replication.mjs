#!/usr/bin/env node
/**
 * Phase 2 desktop-to-cloud replication tests.
 * Compiles packages/replication-cloud with companion snapshot contracts.
 * Does not talk to production and does not enable live mobile sync.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
  'payments.ts',
  'store.ts',
  'project.ts',
  'ingest.ts',
  'snapshot.ts',
  'publisher.ts',
  'postgres.ts',
  'https.ts',
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
      '--esModuleInterop',
      '--types',
      'node',
      '--typeRoots',
      join(root, 'node_modules/@types'),
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
    classifyPayments,
    ingestEnvelope,
    requirePublisher,
    requirePublisherRole,
    requireReader,
    toSyncEnvelope,
    checkoutProceedsIfCloudDown,
    applyReplicationMigration,
    enrollSql,
    enrollPrivileged,
    revokePrivileged,
    setJwtClaims,
    ingestDurable,
    hydrateFromPostgres,
    issueStagingToken,
    verifyStagingToken,
    listenStagingIngest,
    postStagingIngest,
  } = require(join(out, 'replication-cloud/src/index.js'));
  const { parseCompanionSnapshot } = require(join(out, 'mobile-contracts/src/validation.js'));
  const { decideSnapshotApply } = require(join(out, 'mobile-contracts/src/sync.js'));

  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const NOW = Date.parse('2026-11-03T10:00:00.000Z');
  const ISO = '2026-11-03T10:00:00.000Z';
  const TOTAL = 100000;

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
      assert.fail(`expected ${code} but no error`);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      check(
        error instanceof ReplicationError && error.code === code,
        `error ${code} (got ${error && error.name}:${error && error.code})`,
      );
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
        lines: extra.lines === undefined
          ? [
              {
                productId: 'atta-001',
                name: 'Atta 10kg',
                unit: 'bag',
                quantityMilli: 1000,
                unitPricePaise: TOTAL,
                totalPaise: extra.totalPaise || TOTAL,
              },
            ]
          : extra.lines,
        subtotalPaise: extra.totalPaise || TOTAL,
        taxPaise: 0,
        totalPaise: extra.totalPaise || TOTAL,
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
          invoice: { id: invoiceId, totalPaise: TOTAL, customerId: payments.some((p) => p.method === 'credit') ? 'cust-ravi' : null },
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

  const snapshotOf = (store, principal) => {
    const snap = buildCompanionSnapshot(store, principal, ISO, NOW);
    return parseCompanionSnapshot(snap);
  };

  check(STREAMS.join(',') === 'billing,customer,retail,inventory', 'four independent streams');
  const productionSrc = readFileSync(join(root, 'packages/mobile-contracts/src/production.ts'), 'utf8');
  check(productionSrc.includes("PRODUCTION_SYNC_PATH = '/v1/mobile/snapshot'"), 'production path unchanged');
  const productionFlag = readFileSync(join(root, 'apps/mobile/app.json'), 'utf8');
  check(productionFlag.includes('"productionSyncEnabled": false'), 'companion production sync stays disabled');
  const schema = readFileSync(join(root, 'packages/local-store/src/lib.rs'), 'utf8');
  check(/const SCHEMA_VERSION: i64 = 12;/.test(schema), 'financial schema remains 12');
  check(schema.includes('pub mod replication;'), 'sidecar publisher module is declared');
  const rust = readFileSync(join(root, 'packages/local-store/src/replication.rs'), 'utf8');
  check(rust.includes('unpublished_replication'), 'native unpublished outbox reader is wired');
  check(rust.includes('never opens a network socket'), 'native reader does not take the network lock');
  check(rust.includes('ReplicationSidecar'), 'native sidecar is durable SQLCipher state');
  check(rust.includes('payload_text'), 'native envelope carries outbox TEXT');
  check(rust.includes('does not open sockets'), 'native publisher crate does not open sockets');
  check(!rust.includes('map.get(*key)'), 'timestamp walk borrows map keys');
  check(rust.includes('validate_ack'), 'native publisher validates cloud acknowledgements');
  const desktopMain = readFileSync(join(root, 'apps/desktop/src-tauri/src/main.rs'), 'utf8');
  check(desktopMain.includes('reset_sidecar_file'), 'desktop restore discards sidecar acks');

  const classified = classifyPayments(
    [
      { id: 'pay-cash', method: 'cash', amountPaise: 60000 },
      { id: 'pay-upi', method: 'upi', amountPaise: 40000 },
    ],
    100000,
    null,
  );
  check(classified.cashPaise === 60000n && classified.digitalPaise === 40000n && classified.customerCreditPaise === 0n, 'UPI is digital not credit');

  const nativeText = '{ "kind": "invoice.posted", "invoice": { "id": "bill-hash", "createdAt": "2026-11-03T10:00:00.000Z", "totalPaise": 100000, "tender": "cash", "customerId": null, "customerName": "Walk-in", "lines": [], "subtotalPaise": 100000, "taxPaise": 0, "taxBasisPoints": 0 } }';
  const hashed = buildEnvelope(
    actor('publisher'),
    {
      stream: 'billing',
      sequence: 1,
      operationId: 'bill-hash',
      occurredAtIso: ISO,
      payload: JSON.parse(nativeText),
      payloadText: nativeText,
    },
    digest,
  );
  check(hashed.payloadSha256 === digest(nativeText), 'envelope digest is native outbox TEXT');
  check(hashed.payloadSha256 !== digest(JSON.stringify(JSON.parse(nativeText))), 'envelope digest is not JSON.stringify of the parsed object');

  try {
    const unexpected = classifyPayments([{ id: 'pay-x', method: 'cheque', amountPaise: 100000 }], 100000, null);
    assert.fail(`cheque was classified ${JSON.stringify(unexpected, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
  } catch (error) {
    check(error instanceof ReplicationError && error.code === 'INVALID_ENVELOPE', `cheque rejected (${error && error.message})`);
  }
  expectCode('INVALID_ENVELOPE', () =>
    classifyPayments(
      [
        { id: 'dup', method: 'cash', amountPaise: 50000 },
        { id: 'dup', method: 'upi', amountPaise: 50000 },
      ],
      100000,
      null,
    ),
  );
  expectCode('INVALID_ENVELOPE', () => classifyPayments([{ id: 'pay-x', method: 'cash', amountPaise: 1 }], 100000, null));
  expectCode('INVALID_ENVELOPE', () =>
    classifyPayments([{ id: 'pay-x', method: 'credit', amountPaise: 100000 }], 100000, null),
  );

  const publisher = actor('publisher');
  const owner = actor('owner');
  const manager = actor('manager');
  const cashier = actor('cashier');
  const auditor = actor('auditor');
  expectCode('FORBIDDEN', () => requirePublisherRole(owner, NOW));
  expectCode('FORBIDDEN', () => requirePublisherRole(cashier, NOW));
  check(requirePublisherRole(publisher, NOW).role === 'publisher', 'publisher role may flush locally');

  function setup(name) {
    const store = new CloudStore();
    enroll(store, actor('publisher', { deviceId: `device-publisher-${name}` }));
    enroll(store, actor('owner', { deviceId: `device-owner-${name}` }));
    enroll(store, actor('manager', { deviceId: `device-manager-${name}` }));
    enroll(store, actor('cashier', { deviceId: `device-cashier-${name}` }));
    enroll(store, actor('auditor', { deviceId: `device-auditor-${name}` }));
    const pub = actor('publisher', { deviceId: `device-publisher-${name}` });
    const own = actor('owner', { deviceId: `device-owner-${name}` });
    const cashr = actor('cashier', { deviceId: `device-cashier-${name}` });
    publish(store, pub, productRow(1));
    publish(store, pub, customerRow(1));
    return { store, pub, own, cashr };
  }

  const cashOnly = setup('cash');
  publish(cashOnly.store, cashOnly.pub, invoiceRow(1, { id: 'bill-cash', tender: 'cash', customerId: null, customerName: 'Walk-in' }));
  let parsed = snapshotOf(cashOnly.store, cashOnly.own);
  check(parsed.schemaVersion === 2, 'live snapshot is schema v2');
  check(parsed.overview.todaySales.cashPaise === '100000', 'full cash');
  check(parsed.overview.todaySales.creditPaise === '0', 'full cash has no customer credit');
  check(parsed.overview.todaySales.digitalPaise === '0', 'full cash has no digital');
  check(parsed.projectionComplete === true, 'cash invoice is complete without retail');

  const upiOnly = setup('upi');
  publish(upiOnly.store, upiOnly.pub, invoiceRow(1, { id: 'bill-upi', tender: 'retail', customerId: null, customerName: 'Walk-in' }));
  publish(upiOnly.store, upiOnly.pub, retailSale(1, 'bill-upi', [{ id: 'p-upi', method: 'upi', amountPaise: TOTAL }]));
  parsed = snapshotOf(upiOnly.store, upiOnly.own);
  check(parsed.overview.todaySales.digitalPaise === '100000', 'full UPI is digital');
  check(parsed.overview.todaySales.creditPaise === '0', 'UPI is not customer credit');
  check(parsed.overview.todaySales.cashPaise === '0', 'UPI is not cash');
  check(parsed.overview.todayCollectionsPaise === '0', 'UPI is not a cash collection');
  check(parsed.activity[0].digitalPaise === '100000', 'activity keeps UPI as digital');

  const cardOnly = setup('card');
  publish(cardOnly.store, cardOnly.pub, invoiceRow(1, { id: 'bill-card', tender: 'retail', customerId: null, customerName: 'Walk-in' }));
  publish(cardOnly.store, cardOnly.pub, retailSale(1, 'bill-card', [{ id: 'p-card', method: 'card', amountPaise: TOTAL }]));
  parsed = snapshotOf(cardOnly.store, cardOnly.own);
  check(parsed.overview.todaySales.digitalPaise === '100000' && parsed.overview.todaySales.creditPaise === '0', 'card is digital not credit');

  const creditOnly = setup('credit');
  publish(creditOnly.store, creditOnly.pub, invoiceRow(1, { id: 'bill-credit', tender: 'credit', customerId: 'cust-ravi' }));
  parsed = snapshotOf(creditOnly.store, creditOnly.own);
  check(parsed.overview.todaySales.creditPaise === '100000', 'full customer credit');
  check(parsed.overview.todaySales.digitalPaise === '0', 'credit tender is not digital');

  const splitCashCredit = setup('split-cc');
  publish(splitCashCredit.store, splitCashCredit.pub, invoiceRow(1, { id: 'bill-split-1', tender: 'retail' }));
  publish(
    splitCashCredit.store,
    splitCashCredit.pub,
    retailSale(1, 'bill-split-1', [
      { id: 'pay-cash', method: 'cash', amountPaise: 60000 },
      { id: 'pay-credit', method: 'credit', amountPaise: 40000 },
    ]),
  );
  publish(splitCashCredit.store, splitCashCredit.pub, creditLinked(2, 40000));
  parsed = snapshotOf(splitCashCredit.store, splitCashCredit.own);
  check(parsed.overview.todaySales.totalPaise === '100000', '₹1,000 total');
  check(parsed.overview.todaySales.cashPaise === '60000', '₹600 cash');
  check(parsed.overview.todaySales.creditPaise === '40000', '₹400 customer credit');
  check(parsed.overview.todaySales.digitalPaise === '0', 'split cash/credit has no digital');
  // This synthetic credit.linked event is *not* emitted by a native split
  // sale. It tests explicit linking only; native-sale debt is audited in the
  // separate release-risk gate, not inferred from this fixture.
  check(parsed.customers[0].outstandingPaise === '40000', 'outstanding from explicit credit.linked');
  const applied = decideSnapshotApply(null, toSyncEnvelope(parsed, splitCashCredit.own.deviceId));
  check(applied.ok === true && applied.kind === 'applied', 'v2 snapshot applies');

  // Native retail and billing outboxes use the *same* operation ID. The
  // idempotency key must include the stream; a retry must additionally use
  // the original stream sequence, not just the original payload digest.
  const nativeId = setup('native-id');
  const nativeBill = invoiceRow(1, { id: 'bill-native-id', tender: 'retail', customerId: null, customerName: 'Walk-in', lines: [] });
  const nativeSale = retailSale(1, 'bill-native-id', [{ id: 'pay-native-cash', method: 'cash', amountPaise: TOTAL }]);
  nativeSale.operationId = 'bill-native-id';
  nativeSale.payload.receipt.operationId = 'bill-native-id';
  publish(nativeId.store, nativeId.pub, nativeBill);
  const nativeAck = publish(nativeId.store, nativeId.pub, nativeSale);
  check(nativeAck.duplicate === false, 'same native ID on billing and retail commits two distinct stream events');
  check(snapshotOf(nativeId.store, nativeId.own).activity.length === 1, 'both native streams produce one posted invoice');
  const replayAck = publish(nativeId.store, nativeId.pub, nativeSale);
  check(replayAck.duplicate === true && replayAck.cursor === nativeAck.cursor, 'exact retail retry returns its own cursor');
  expectCode('CONFLICT', () => publish(nativeId.store, nativeId.pub, { ...nativeSale, sequence: 9 }));
  check(nativeId.store.events.length === 4, 'wrong-sequence retry leaves both outbox streams unchanged');

  const splitUpiCredit = setup('split-uc');
  publish(splitUpiCredit.store, splitUpiCredit.pub, invoiceRow(1, { id: 'bill-upi-credit', tender: 'retail' }));
  publish(
    splitUpiCredit.store,
    splitUpiCredit.pub,
    retailSale(1, 'bill-upi-credit', [
      { id: 'pay-upi', method: 'upi', amountPaise: 60000 },
      { id: 'pay-credit', method: 'credit', amountPaise: 40000 },
    ]),
  );
  parsed = snapshotOf(splitUpiCredit.store, splitUpiCredit.own);
  check(parsed.overview.todaySales.digitalPaise === '60000', 'UPI share stays digital');
  check(parsed.overview.todaySales.creditPaise === '40000', 'credit share stays customer credit');
  check(parsed.overview.todaySales.cashPaise === '0', 'UPI+credit has no cash');

  const mixedCardCash = setup('mix');
  publish(mixedCardCash.store, mixedCardCash.pub, invoiceRow(1, { id: 'bill-mix', tender: 'retail', customerId: null, customerName: 'Walk-in' }));
  publish(
    mixedCardCash.store,
    mixedCardCash.pub,
    retailSale(1, 'bill-mix', [
      { id: 'pay-cash', method: 'cash', amountPaise: 25000 },
      { id: 'pay-card', method: 'card', amountPaise: 75000 },
    ]),
  );
  parsed = snapshotOf(mixedCardCash.store, mixedCardCash.own);
  check(parsed.overview.todaySales.cashPaise === '25000', 'mixed cash');
  check(parsed.overview.todaySales.digitalPaise === '75000', 'mixed card');
  check(parsed.overview.todaySales.creditPaise === '0', 'mixed card is not credit');

  const cashierSnap = snapshotOf(splitCashCredit.store, splitCashCredit.cashr);
  check(cashierSnap.customers.length === 0, 'cashier snapshot omits customers');
  check(cashierSnap.overview.outstandingCreditPaise === '0', 'cashier outstanding withheld');

  const store = new CloudStore();
  enroll(store, publisher);
  enroll(store, owner);
  enroll(store, manager);
  enroll(store, cashier);
  enroll(store, auditor);
  expectCode('FORBIDDEN', () => requirePublisher(store, owner, NOW));
  expectCode('FORBIDDEN', () => requireReader(store, publisher, NOW));
  check(requireReader(store, owner, NOW).role === 'owner', 'owner may read after enrollment');

  const cursorBefore = store.cursor('biz-kirana-01');
  expectCode('INVALID_ENVELOPE', () =>
    publish(store, publisher, invoiceRow(1, { id: 'bill-float', tender: 'cash', customerId: null, totalPaise: 10.5, lines: [] })),
  );
  check(store.cursor('biz-kirana-01') === cursorBefore, 'invalid event does not advance cursor');
  check(store.invoices.size === 0, 'invalid event does not create an invoice');

  publish(store, publisher, productRow(1));
  publish(store, publisher, customerRow(1));
  publish(store, publisher, retailSale(1, 'bill-later', [{ id: 'p-cash', method: 'cash', amountPaise: TOTAL }]));
  let incomplete = snapshotOf(store, owner);
  check(incomplete.activity.length === 0, 'retail without billing is not visible');
  check(incomplete.projectionComplete === false, 'incomplete allocation is not marked complete');
  publish(store, publisher, invoiceRow(1, { id: 'bill-later', tender: 'retail', customerId: null, customerName: 'Walk-in' }));
  parsed = snapshotOf(store, owner);
  check(parsed.activity.length === 1 && parsed.activity[0].id === 'bill-later', 'billing after retail completes the invoice');
  check(parsed.projectionComplete === true, 'correlated sale becomes complete');
  check(parsed.activity[0].id !== 'sale-1', 'activity id is the invoice id not the retail operation');

  const again = publish(store, publisher, invoiceRow(1, { id: 'bill-later', tender: 'retail', customerId: null, customerName: 'Walk-in' }));
  check(again.duplicate === true, 'identical replay is idempotent');
  expectCode('CONFLICT', () => publish(store, publisher, invoiceRow(9, { id: 'bill-later', tender: 'cash', customerId: null, totalPaise: 1, lines: [] })));

  expectCode('GAP', () => publish(store, publisher, invoiceRow(3, { id: 'bill-gap', tender: 'cash', customerId: null, lines: [] })));
  publish(store, publisher, invoiceRow(2, { id: 'bill-cash-2', tender: 'cash', customerId: null, customerName: 'Walk-in', lines: [] }));

  store.revoke(publisher.deviceId);
  expectCode('REVOKED', () =>
    publish(store, { ...publisher, revoked: false }, invoiceRow(3, { id: 'bill-revoked', tender: 'cash', customerId: null, lines: [] })),
  );
  store.devices.get(publisher.deviceId).revoked = false;

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
  publish(store, other, invoiceRow(1, { id: 'bill-salon-1', tender: 'cash', customerId: null, customerName: 'Walk-in', lines: [] }));
  const salon = snapshotOf(store, otherOwner);
  check(salon.activity.every((row) => row.id.startsWith('bill-salon')), 'business B cannot see business A');

  expectCode('STALE_GENERATION', () =>
    ingestEnvelope(
      store,
      { ...publisher, restoreGeneration: 'gen-old', revoked: false },
      buildEnvelope({ ...publisher, restoreGeneration: 'gen-old' }, invoiceRow(4, { id: 'bill-old' }), digest),
      digest,
      NOW,
    ),
  );

  const sidecar = new CloudStore();
  const pub = enroll(sidecar, actor('publisher', { deviceId: 'device-publisher-flush' }));
  enroll(sidecar, actor('owner', { deviceId: 'device-owner-flush' }));
  const transport = new InMemoryTransport(sidecar, pub, digest, () => NOW);
  const persistedAcks = [];
  const desktop = new DesktopPublisher(pub, digest, transport, 'gen-1', {
    persist(ack) {
      persistedAcks.push({ restoreGeneration: ack.restoreGeneration, lastSequence: { ...ack.lastSequence } });
    },
  });
  desktop.noteCommit(productRow(1));
  desktop.noteCommit(invoiceRow(1, { id: 'bill-off', tender: 'cash', customerId: null, customerName: 'Walk-in', lines: [] }));
  desktop.writerLocked = true;
  let lockedDuringSend = false;
  const originalSend = transport.send.bind(transport);
  transport.send = async (envelope) => {
    lockedDuringSend = desktop.writerLocked;
    return originalSend(envelope);
  };
  await desktop.flush(NOW);
  check(lockedDuringSend === false, 'network flush does not hold the writer lock');
  check(persistedAcks.length >= 1, 'sidecar ack is persisted only after a successful send');
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

  const sqlPath = join(root, 'packages/replication-cloud/sql/20261103000000_native_financial_replication.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  check(sql.includes('REVIEW ONLY'), 'SQL migration is review-only');
  check(sql.includes('digital_paise'), 'schema stores digital tenders separately');
  check(sql.includes("allocation_status = 'pending'"), 'incomplete invoices are explicit');
  check(sql.includes('sornio_cashier'), 'cashier is a distinct database role');
  check(!sql.includes('GRANT SELECT ON native_replication.customers TO sornio_cashier'), 'cashier is not granted customer ledger');
  check(sql.includes('security_invoker'), 'posted invoice view uses invoker rights');
  check(sql.includes('customer_statements'), 'customer statements persist in SQL');
  const postgresSrc = readFileSync(join(root, 'packages/replication-cloud/src/postgres.ts'), 'utf8');
  check(postgresSrc.includes("set_config('request.jwt.claims'"), 'JWT claims are set through set_config');
  check(postgresSrc.includes(', true)'), 'JWT claims are transaction-local');
  check(postgresSrc.includes('hydrateFromPostgres'), 'projections hydrate from PostgreSQL');
  check(postgresSrc.includes('persistProjections'), 'all stream projections persist in the ingest transaction');

  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await applyReplicationMigration(pg, sql);
  const tables = await pg.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'native_replication' ORDER BY table_name`,
  );
  check(tables.rows.some((row) => row.table_name === 'invoices'), 'migration created invoices');
  check(tables.rows.some((row) => row.table_name === 'events'), 'migration created events');

  await enrollSql(pg, publisher);
  await setJwtClaims(pg, { business_id: 'biz-kirana-01', role: 'owner' });
  await pg.query(
    `INSERT INTO native_replication.invoices (
       business_id, invoice_id, billing_operation_id, occurred_at, counterparty, tender,
       total_paise, cash_paise, digital_paise, customer_credit_paise, allocation_status
     ) VALUES ($1,'inv-posted','bill-posted',$2,'Walk-in','cash',100000,100000,0,0,'posted')`,
    ['biz-kirana-01', ISO],
  );
  let postedOk = false;
  try {
    await pg.query(
      `INSERT INTO native_replication.invoices (
         business_id, invoice_id, billing_operation_id, occurred_at, counterparty, tender,
         total_paise, cash_paise, digital_paise, customer_credit_paise, allocation_status
       ) VALUES ($1,'inv-bad','bill-bad',$2,'Walk-in','retail',100000,60000,0,0,'posted')`,
      ['biz-kirana-01', ISO],
    );
  } catch {
    postedOk = true;
  }
  check(postedOk, 'posted invoice must have cash+digital+credit = total');

  await pg.query(
    `INSERT INTO native_replication.invoices (
       business_id, invoice_id, billing_operation_id, occurred_at, counterparty, tender,
       total_paise, cash_paise, digital_paise, customer_credit_paise, allocation_status
     ) VALUES ($1,'inv-pend','bill-pend',$2,'Walk-in','retail',100000,0,0,0,'pending')`,
    ['biz-kirana-01', ISO],
  );
  const pending = await pg.query(`SELECT COUNT(*)::int AS n FROM native_replication.invoices WHERE allocation_status = 'pending'`);
  check(pending.rows[0].n >= 1, 'pending incomplete invoices are allowed');

  await pg.exec('BEGIN');
  await pg.query(
    `INSERT INTO native_replication.events (
       business_id, device_id, restore_generation, stream, stream_sequence, operation_id,
       event_type, payload, payload_sha256, occurred_at
     ) VALUES ($1,$2,'gen-1','billing',1,'op-tx','invoice.posted','{}','${'ab'.repeat(32)}',$3::timestamptz)`,
    ['biz-kirana-01', publisher.deviceId, ISO],
  );
  await pg.exec('ROLLBACK');
  const rolled = await pg.query(`SELECT COUNT(*)::int AS n FROM native_replication.events WHERE operation_id = 'op-tx'`);
  check(rolled.rows[0].n === 0, 'rolled-back ingest leaves no event');

  await pg.query(
    `INSERT INTO native_replication.customers (business_id, customer_id, name, outstanding_paise)
     VALUES ('biz-kirana-01','cust-ravi','Ravi Singh',40000)`,
  );
  await pg.exec('CREATE ROLE sornio_cashier_login LOGIN IN ROLE sornio_cashier');
  await pg.exec('CREATE ROLE sornio_owner_login LOGIN IN ROLE sornio_owner');
  await pg.exec('BEGIN');
  await setJwtClaims(pg, { business_id: 'biz-kirana-01', role: 'cashier' });
  await pg.exec('SET ROLE sornio_cashier_login');
  let cashierBlocked = false;
  try {
    await pg.query('SELECT * FROM native_replication.customers');
  } catch {
    cashierBlocked = true;
  }
  try {
    await pg.exec('ROLLBACK');
  } catch {
    // aborted
  }
  check(cashierBlocked, 'cashier database role cannot read customer ledger');

  await pg.exec('BEGIN');
  await setJwtClaims(pg, { business_id: 'biz-salon-99', role: 'owner' });
  await pg.exec('SET ROLE sornio_owner_login');
  const isolated = await pg.query(`SELECT COUNT(*)::int AS n FROM native_replication.invoices WHERE allocation_status = 'posted'`);
  await pg.exec('RESET ROLE');
  await pg.exec('COMMIT');
  check(isolated.rows[0].n === 0, 'owner of another business sees zero posted invoices under RLS');

  const durablePub = actor('publisher', { businessId: 'biz-durable-01', deviceId: 'device-publisher-dur' });
  const durableOwn = actor('owner', { businessId: 'biz-durable-01', deviceId: 'device-owner-dur' });
  const durableCash = actor('cashier', { businessId: 'biz-durable-01', deviceId: 'device-cashier-dur' });
  await enrollPrivileged(pg, durablePub);
  await enrollPrivileged(pg, durableOwn);
  await enrollPrivileged(pg, durableCash);
  await enrollPrivileged(pg, { ...durableOwn, role: 'publisher' });
  const roleHeld = await pg.query(`SELECT role FROM native_replication.devices WHERE device_id = $1`, [durableOwn.deviceId]);
  check(roleHeld.rows[0].role === 'owner', 'privileged enroll does not let a device change its own role');
  await revokePrivileged(pg, durablePub.deviceId);
  let unrevoke = false;
  try {
    await enrollPrivileged(pg, { ...durablePub, revoked: false });
  } catch (error) {
    unrevoke = error instanceof ReplicationError && error.code === 'REVOKED';
  }
  check(unrevoke, 'a revoked publisher cannot re-enroll or un-revoke itself');
  await pg.query(`UPDATE native_replication.devices SET revoked = FALSE WHERE device_id = $1`, [durablePub.deviceId]);

  await ingestDurable(pg, durablePub, buildEnvelope(durablePub, productRow(1), digest), digest, NOW);
  await ingestDurable(pg, durablePub, buildEnvelope(durablePub, customerRow(1), digest), digest, NOW);
  await ingestDurable(
    pg,
    durablePub,
    buildEnvelope(durablePub, invoiceRow(1, { id: 'bill-durable', tender: 'cash', customerId: null, customerName: 'Walk-in' }), digest),
    digest,
    NOW,
  );
  const stock = await pg.query(`SELECT quantity_milli::text AS qty FROM native_replication.inventory WHERE business_id = $1`, [
    durablePub.businessId,
  ]);
  check(stock.rows[0] && stock.rows[0].qty === '4000', 'inventory projection is written in the ingest transaction');
  const customersSql = await pg.query(`SELECT name FROM native_replication.customers WHERE business_id = $1`, [durablePub.businessId]);
  check(customersSql.rows.some((row) => row.name === 'Ravi Singh'), 'customer projection is written in the ingest transaction');
  const acked = await pg.query(
    `SELECT cursor FROM native_replication.acks WHERE business_id = $1 AND operation_id = $2`,
    [durablePub.businessId, 'bill-durable'],
  );
  check(acked.rows[0] && acked.rows[0].cursor, 'ack is written only with the committed projection');

  let gapAcked = true;
  try {
    await ingestDurable(
      pg,
      durablePub,
      buildEnvelope(durablePub, invoiceRow(3, { id: 'bill-gap-durable', tender: 'cash', customerId: null, lines: [] }), digest),
      digest,
      NOW,
    );
    gapAcked = true;
  } catch (error) {
    gapAcked = false;
    check(error instanceof ReplicationError && error.code === 'GAP', 'gapped durable ingest is rejected');
  }
  const gapRow = await pg.query(`SELECT COUNT(*)::int AS n FROM native_replication.acks WHERE operation_id = 'bill-gap-durable'`);
  check(!gapAcked && gapRow.rows[0].n === 0, 'rejected ingest does not write an ack');

  const restarted = await hydrateFromPostgres(pg, durablePub.businessId);
  const restartedSnap = parseCompanionSnapshot(buildCompanionSnapshot(restarted, durableOwn, ISO, NOW));
  check(restartedSnap.overview.todaySales.cashPaise === '100000', 'projections survive a process restart from PostgreSQL');
  check(restartedSnap.inventory.some((item) => item.id === 'atta-001'), 'inventory survives restart');
  check(restartedSnap.projectionComplete === true, 'restarted projection is complete');

  // A same-digest response with a different sequence would make the native
  // sidecar skip uncommitted entries. Do not acknowledge it as a duplicate.
  const durableInvoice = invoiceRow(1, { id: 'bill-durable', tender: 'cash', customerId: null, customerName: 'Walk-in' });
  const durableWrongSeq = buildEnvelope(durablePub, { ...durableInvoice, sequence: 9 }, digest);
  let rejectedWrongSeq = false;
  try {
    await ingestDurable(pg, durablePub, durableWrongSeq, digest, NOW);
  } catch (error) {
    rejectedWrongSeq = error instanceof ReplicationError && error.code === 'CONFLICT';
  }
  check(rejectedWrongSeq, 'durable ingest rejects same operation and digest at a different sequence');
  const durableRows = await pg.query(`SELECT COUNT(*)::int AS n FROM native_replication.events WHERE business_id = $1 AND operation_id = 'bill-durable'`, [durablePub.businessId]);
  check(durableRows.rows[0].n === 1, 'wrong-sequence retry did not insert a second event');

  // An older backup can omit sales already accepted by this cloud projection.
  // Generation rotation must block publication until explicitly reconciled.
  await pg.query(`UPDATE native_replication.devices SET restore_generation = 'gen-2' WHERE device_id = $1`, [durablePub.deviceId]);
  const restoredPublisher = { ...durablePub, restoreGeneration: 'gen-2' };
  let blockedRestore = false;
  try {
    await ingestDurable(pg, restoredPublisher, buildEnvelope(restoredPublisher, durableInvoice, digest), digest, NOW);
  } catch (error) {
    blockedRestore = error instanceof ReplicationError && error.code === 'STALE_GENERATION';
  }
  check(blockedRestore, 're-export after restore cannot mix database generations');
  const restoredRows = await pg.query(`SELECT COUNT(*)::int AS n FROM native_replication.events WHERE business_id = $1 AND restore_generation = 'gen-2'`, [durablePub.businessId]);
  check(restoredRows.rows[0].n === 0, 'blocked restore wrote neither a new event nor a cloud ack');
  const restoreCursor = await pg.query(`SELECT restore_generation FROM native_replication.projection_cursor WHERE business_id = $1`, [durablePub.businessId]);
  check(restoreCursor.rows[0].restore_generation === 'gen-1', 'blocked restore preserved the authoritative projection generation');
  await pg.query(`UPDATE native_replication.devices SET restore_generation = 'gen-1' WHERE device_id = $1`, [durablePub.deviceId]);

  const tlsDir = mkdtempSync(join(tmpdir(), 'sornio-tls-'));
  const keyPath = join(tlsDir, 'key.pem');
  const certPath = join(tlsDir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '1',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'pipe' },
  );
  const secret = randomBytes(32).toString('hex');
  const token = issueStagingToken(secret, durablePub);
  check(verifyStagingToken(secret)(token).deviceId === durablePub.deviceId, 'staging issuer verifies its own token');
  const server = await listenStagingIngest({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    ingest: (principal, body) => ingestDurable(pg, principal, body, digest, NOW),
    verify: verifyStagingToken(secret),
    nowMs: () => NOW,
  });
  try {
    const httpsAck = await postStagingIngest({
      hostname: '127.0.0.1',
      port: server.port,
      ca: readFileSync(certPath),
      token,
      body: buildEnvelope(
        durablePub,
        invoiceRow(2, { id: 'bill-https', tender: 'cash', customerId: null, customerName: 'Walk-in', lines: [] }),
        digest,
      ),
    });
    check(httpsAck.duplicate === false, 'HTTPS ingest commits over TLS');
    const httpsInvoice = await pg.query(
      `SELECT allocation_status FROM native_replication.invoices WHERE invoice_id = 'bill-https'`,
    );
    check(httpsInvoice.rows[0] && httpsInvoice.rows[0].allocation_status === 'posted', 'HTTPS ingest persisted the invoice');
    let stolen = false;
    try {
      await postStagingIngest({
        hostname: '127.0.0.1',
        port: server.port,
        ca: readFileSync(certPath),
        token: issueStagingToken(secret, durableOwn),
        body: buildEnvelope(
          durablePub,
          invoiceRow(3, { id: 'bill-stolen', tender: 'cash', customerId: null, lines: [] }),
          digest,
        ),
      });
    } catch (error) {
      stolen = error instanceof ReplicationError && error.code === 'FORBIDDEN';
    }
    check(stolen, 'owner token cannot ingest on the HTTPS publisher path');
  } finally {
    await server.close();
    rmSync(tlsDir, { recursive: true, force: true });
  }

  const docs = readFileSync(join(root, 'docs/mobile/PHASE-2-DESKTOP-CLOUD-REPLICATION.md'), 'utf8');
  check(docs.includes('#143') || docs.includes('PR #143'), 'Phase 1 PR dependency is documented');

  console.log(`verify-replication: ${checks} checks passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
