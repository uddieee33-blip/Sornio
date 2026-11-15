/**
 * Phase 21B purchasing protocol acceptance — client side.
 *
 * These execute the REAL client modules (`purchasing-contract`,
 * `purchasing-outbox`, `src/purchasing/client`) against a reference hub that
 * obeys the documented `/v1/purchasing/*` contract. They are headless protocol
 * tests, not device acceptance: TLS, certificate pinning and the Rust hub are
 * covered elsewhere.
 *
 * The scenarios here are the ones the phase is judged on: offline draft
 * recovery, lost acknowledgement, hub restart, mobile restart, permission
 * revocation, conflicting revision, duplicate submission, and storage that is
 * unavailable.
 */
import { MemorySecureStore } from '@sornio/mobile-contracts';
import {
  draftPreview,
  parseDraft,
  purchasingDraftStore,
  purchasingOutbox,
  purchasingSnapshotStore,
} from '../../../packages/business-domain/src/purchasing-outbox';
import {
  REFUSAL_COPY,
  parseOutcome,
  parseWorkspace,
  refusalCopy,
} from '../../../packages/business-domain/src/purchasing-contract';
import { purchasingClient, newOperationId, operationStateCopy } from '../src/purchasing/client';
import {
  purchasingWireFor,
  referencePurchasingHub,
  type ReferencePurchasingHub,
} from './lan/reference-purchasing-hub';

const HUB_ID = 'hub-purchase';
const BUSINESS_ID = 'biz-purchase';
const DEVICE_ID = 'phone-1';
const PASSWORD = 'Synthetic purchasing password';

function hub(options: { dropNext?: number; loseNextResponse?: number } = {}) {
  const reference = referencePurchasingHub({
    hubId: HUB_ID,
    businessId: BUSINESS_ID,
    ...options,
  });
  reference.addEmployee('owner', PASSWORD, 'Owner', 'owner');
  reference.addEmployee('assistant', PASSWORD, 'Assistant', 'assistant_manager');
  reference.addEmployee('till', PASSWORD, 'Cashier', 'cashier');
  reference.addProduct('prod-rice', 'Rice', 'RICE', 'kg');
  reference.addProduct('prod-oil', 'Sunflower oil', 'OIL-1', 'litre');
  reference.addSupplier({ id: 'sup-1', name: 'Krishna Traders' });
  reference.addSupplier({ id: 'sup-2', name: 'Gupta Oils' });
  reference.pair(DEVICE_ID, 'a'.repeat(64), 'owner');
  reference.pair('assistant-phone', 'b'.repeat(64), 'assistant');
  reference.pair('till-phone', 'c'.repeat(64), 'till');
  return reference;
}

function signIn(reference: ReferencePurchasingHub, username = 'owner', deviceId = DEVICE_ID) {
  const credential = username === 'assistant' ? 'b'.repeat(64) : username === 'till' ? 'c'.repeat(64) : 'a'.repeat(64);
  return reference.signIn(deviceId, credential, username, PASSWORD);
}

function clientFor(
  reference: ReferencePurchasingHub,
  options: {
    store?: MemorySecureStore;
    username?: string;
    deviceId?: string;
    session?: () => { actorId: string; token: string; expires: number } | null;
  } = {},
) {
  const username = options.username ?? 'owner';
  const deviceId = options.deviceId ?? DEVICE_ID;
  const session = options.session ?? (() => signIn(reference, username, deviceId));
  return purchasingClient({
    secure: options.store ?? new MemorySecureStore(),
    identity: {
      origin: 'https://shop.local:8443',
      hubId: HUB_ID,
      businessId: BUSINESS_ID,
      deviceId,
      certificateSha256: 'a'.repeat(64),
    },
    session,
    wire: purchasingWireFor(reference),
  });
}

function orderRequest(operationId: string, quantityMilli = 10_000) {
  return {
    operationId,
    supplierId: 'sup-1',
    note: 'Weekly stock',
    lines: [{ productId: 'prod-rice', quantityMilli, unitCostPaise: 9000, taxBps: 0 }],
  };
}

async function approvedOrder(client: ReturnType<typeof clientFor>, seed: string) {
  const created = await client.submit('purchasing.purchase_order_created', orderRequest(`${seed}-po`));
  expect(created.pending.state).toBe('accepted');
  const order = (created.pending.result as { result: { id: string; revision: number } }).result;
  await client.acknowledge('purchasing.purchase_order_created');
  const submitted = await client.submit('purchasing.purchase_order_submitted', {
    operationId: `${seed}-submit`,
    id: order.id,
    expectedRevision: order.revision,
    reason: null,
  });
  expect(submitted.pending.state).toBe('accepted');
  await client.acknowledge('purchasing.purchase_order_submitted');
  const withRevision = (submitted.pending.result as { result: { revision: number } }).result.revision;
  const approved = await client.submit('purchasing.purchase_order_decided', {
    operationId: `${seed}-approve`,
    id: order.id,
    expectedRevision: withRevision,
    decision: 'approve',
    reason: null,
  });
  expect(approved.pending.state).toBe('accepted');
  await client.acknowledge('purchasing.purchase_order_decided');
  return order.id;
}

describe('supplier workspace read', () => {
  it('reads authoritative suppliers and capabilities', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const read = await client.workspace();
    expect(read.offline).toBe(false);
    expect(read.workspace.suppliers.map((s) => s.name)).toEqual(['Krishna Traders', 'Gupta Oils']);
    expect(read.workspace.capabilities.paySuppliers).toBe(true);
    expect(read.workspace.products.map((p) => p.sku)).toContain('RICE');
    expect(Date.parse(read.hubGeneratedAtIso)).toBeGreaterThan(0);
  });

  it('serves the last authorised copy offline and reports how old it is', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const online = await client.workspace();
    // Network gone entirely.
    reference.dropNextRequests(99);
    const offline = await client.workspace();
    expect(offline.offline).toBe(true);
    expect(offline.hubGeneratedAtIso).toBe(online.hubGeneratedAtIso);
    expect(offline.workspace.suppliers).toHaveLength(2);
  });

  it('never shows one employee another employee saved copy', async () => {
    const reference = hub();
    const store = new MemorySecureStore();
    const owner = clientFor(reference, { store });
    await owner.workspace();
    // The same device signs in as a different employee and the network is down.
    const assistant = clientFor(reference, {
      store,
      username: 'assistant',
      deviceId: 'assistant-phone',
    });
    reference.dropNextRequests(99);
    await expect(assistant.workspace()).rejects.toThrow();
  });

  it('refuses a workspace document that names another shop', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const forged = { ...(await client.workspace()) };
    expect(() => parseWorkspace({ ...forged, businessId: 'someone-else' }, BUSINESS_ID)).toThrow(
      /does not match this shop/,
    );
  });

  it('refuses a cashier the supplier workspace at the hub', async () => {
    const reference = hub();
    const client = clientFor(reference, { username: 'till', deviceId: 'till-phone' });
    await expect(client.workspace()).rejects.toMatchObject({ code: 'access_refused' });
  });
});

describe('purchase orders', () => {
  it('creates a draft, edits it, and never moves stock or money', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const created = await client.submit('purchasing.purchase_order_created', orderRequest('po-1'));
    expect(created.pending.state).toBe('accepted');
    const order = (created.pending.result as { result: { id: string; revision: number; totalPaise: number; status: string } })
      .result;
    expect(order.status).toBe('draft');
    expect(order.totalPaise).toBe(90_000);
    await client.acknowledge('purchasing.purchase_order_created');

    const updated = await client.submit('purchasing.purchase_order_updated', {
      operationId: 'po-1-edit',
      id: order.id,
      expectedRevision: order.revision,
      note: 'Two sacks',
      lines: [{ productId: 'prod-rice', quantityMilli: 20_000, unitCostPaise: 9000, taxBps: 500 }],
    });
    const edited = (updated.pending.result as { result: { totalPaise: number; revision: number } }).result;
    // 20,000 milli (20 kg) at 900 paise/kg = 180,000 paise, plus 5% tax (9,000).
    expect(edited.totalPaise).toBe(189_000);
    expect(edited.revision).toBe(order.revision + 1);
    expect(reference.receipts()).toHaveLength(0);
    expect(reference.payments()).toHaveLength(0);
  });

  it('refuses a stale edit, reports the current revision and keeps the newer value', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const created = await client.submit('purchasing.purchase_order_created', orderRequest('po-stale'));
    const order = (created.pending.result as { result: { id: string; revision: number } }).result;
    await client.acknowledge('purchasing.purchase_order_created');
    // The desktop edits first.
    const desktop = await client.submit('purchasing.purchase_order_updated', {
      operationId: 'po-stale-desktop',
      id: order.id,
      expectedRevision: order.revision,
      note: 'Desktop edit',
      lines: [{ productId: 'prod-rice', quantityMilli: 15_000, unitCostPaise: 9000, taxBps: 0 }],
    });
    expect(desktop.pending.state).toBe('accepted');
    await client.acknowledge('purchasing.purchase_order_updated');

    const phone = await client.submit('purchasing.purchase_order_updated', {
      operationId: 'po-stale-phone',
      id: order.id,
      expectedRevision: order.revision,
      note: 'Phone edit',
      lines: [{ productId: 'prod-rice', quantityMilli: 30_000, unitCostPaise: 9000, taxBps: 0 }],
    });
    expect(phone.pending.state).toBe('refused');
    const outcome = phone.pending.result as { status: string; reason: string; revision: number };
    expect(outcome.reason).toBe('revision_conflict');
    expect(outcome.revision).toBe(order.revision + 1);
    expect(reference.order(order.id)?.note).toBe('Desktop edit');
  });

  it('refuses approval without the approval permission', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const orderId = await approvedOrder(client, 'perm');

    // An assistant manager drafts and submits, but cannot approve.
    const assistant = clientFor(reference, { username: 'assistant', deviceId: 'assistant-phone' });
    const draft = await assistant.submit('purchasing.purchase_order_created', orderRequest('perm-2'));
    const order = (draft.pending.result as { result: { id: string; revision: number } }).result;
    await assistant.acknowledge('purchasing.purchase_order_created');
    const submitted = await assistant.submit('purchasing.purchase_order_submitted', {
      operationId: 'perm-2-submit',
      id: order.id,
      expectedRevision: order.revision,
      reason: null,
    });
    expect(submitted.pending.state).toBe('accepted');
    await assistant.acknowledge('purchasing.purchase_order_submitted');
    const revision = (submitted.pending.result as { result: { revision: number } }).result.revision;
    const refused = await assistant.submit('purchasing.purchase_order_decided', {
      operationId: 'perm-2-approve',
      id: order.id,
      expectedRevision: revision,
      decision: 'approve',
      reason: null,
    });
    expect(refused.pending.state).toBe('refused');
    expect((refused.pending.result as { reason: string }).reason).toBe('not_permitted');
    // The order is untouched by the refusal.
    expect(reference.order(order.id)?.status).toBe('submitted');
    // The owner's order is still approved and independent.
    expect(reference.order(orderId)?.status).toBe('approved');
  });

  it('offers refusal copy for every reason the hub can return', () => {
    const reasons = [
      'revision_conflict',
      'order_state_refused',
      'order_missing',
      'supplier_missing',
      'supplier_revision_conflict',
      'invalid_purchase_order',
      'invalid_receipt',
      'invalid_return',
      'invalid_payable',
      'overpayment',
      'product_missing',
      'not_permitted',
      'wrong_shop',
      'operation_identity_conflict',
      'unknown_refusal',
    ];
    for (const reason of reasons) {
      expect(REFUSAL_COPY[reason]).toEqual(expect.any(String));
      expect(refusalCopy(reason)).not.toBe('');
    }
    // An unknown code still says something a person can act on.
    expect(refusalCopy('a_new_reason_from_a_newer_hub')).toBe(REFUSAL_COPY.unknown_relief ?? REFUSAL_COPY.unknown_refusal);
  });
});

describe('goods receiving', () => {
  it('records damaged stock separately and only credits the good units', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const orderId = await approvedOrder(client, 'recv');
    const received = await client.submit('purchasing.goods_received', {
      operationId: 'recv-1',
      orderId,
      reference: 'CH-1',
      note: 'Delivery',
      lines: [
        { lineIndex: 0, productId: 'prod-rice', quantityMilli: 4000, damagedMilli: 1000, note: 'Torn sack' },
      ],
    });
    expect(received.pending.state).toBe('accepted');
    const receipt = (received.pending.result as {
      result: { damagedTotalPaise: number; goodsTotalPaise: number; orderStatus: string };
    }).result;
    // 3,000 good units at 9 paise/milli = 27,000 paise; 1,000 damaged = 9,000 paise.
    expect(receipt.goodsTotalPaise).toBe(27_000);
    expect(receipt.damagedTotalPaise).toBe(9_000);
    expect(receipt.orderStatus).toBe('partial');
    expect(reference.order(orderId)?.lines[0]?.receivedMilli).toBe(4000);
  });

  it('refuses an over-receipt and leaves the order untouched', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const orderId = await approvedOrder(client, 'over');
    const refused = await client.submit('purchasing.goods_received', {
      operationId: 'over-1',
      orderId,
      reference: null,
      note: '',
      lines: [{ lineIndex: 0, productId: 'prod-rice', quantityMilli: 20_000, damagedMilli: 0, note: null }],
    });
    expect(refused.pending.state).toBe('refused');
    expect((refused.pending.result as { reason: string }).reason).toBe('invalid_receipt');
    expect(reference.receipts()).toHaveLength(0);
    expect(reference.order(orderId)?.status).toBe('approved');
  });

  it('refuses to receive against a draft order', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const created = await client.submit('purchasing.purchase_order_created', orderRequest('draft-recv'));
    const order = (created.pending.result as { result: { id: string } }).result;
    await client.acknowledge('purchasing.purchase_order_created');
    const refused = await client.submit('purchasing.goods_received', {
      operationId: 'draft-recv-1',
      orderId: order.id,
      reference: null,
      note: '',
      lines: [{ lineIndex: 0, productId: 'prod-rice', quantityMilli: 1000, damagedMilli: 0, note: null }],
    });
    expect(refused.pending.state).toBe('refused');
    expect((refused.pending.result as { reason: string }).reason).toBe('order_state_refused');
  });

  it('reports the order detail needed to plan the next receipt', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const orderId = await approvedOrder(client, 'detail');
    await client.submit('purchasing.goods_received', {
      operationId: 'detail-1',
      orderId,
      reference: 'CH-9',
      note: '',
      lines: [{ lineIndex: 0, productId: 'prod-rice', quantityMilli: 4000, damagedMilli: 0, note: null }],
    });
    const detail = await client.order(orderId);
    expect(detail.order.lines[0]?.quantityMilli).toBe(10_000);
    expect(detail.order.lines[0]?.receivedMilli).toBe(4_000);
    expect(detail.receipts).toHaveLength(1);
    expect(detail.receipts[0]?.reference).toBe('CH-9');
  });
});

describe('payments and returns', () => {
  it('pays an invoice once, never beyond the outstanding amount', async () => {
    const reference = hub();
    reference.addInvoice({
      id: 'inv-1',
      supplierId: 'sup-1',
      receiptId: null,
      reference: 'SUP-11',
      totalPaise: 50_000,
      outstandingPaise: 50_000,
      dueOn: null,
      createdAt: '2026-11-15T09:00:00Z',
    });
    const client = clientFor(reference);
    const paid = await client.submit('purchasing.supplier_payment', {
      operationId: 'pay-1',
      supplierId: 'sup-1',
      invoiceId: 'inv-1',
      method: 'upi',
      amountPaise: 20_000,
      reference: 'UPI-1',
      paidOn: null,
    });
    expect(paid.pending.state).toBe('accepted');
    expect(reference.payments()).toHaveLength(1);
    await client.acknowledge('purchasing.supplier_payment');

    const tooMuch = await client.submit('purchasing.supplier_payment', {
      operationId: 'pay-2',
      supplierId: 'sup-1',
      invoiceId: 'inv-1',
      method: 'cash',
      amountPaise: 40_000,
      reference: 'CASH-1',
      paidOn: null,
    });
    expect(tooMuch.pending.state).toBe('refused');
    expect((tooMuch.pending.result as { reason: string }).reason).toBe('overpayment');
    expect(reference.payments()).toHaveLength(1);
  });

  it('shows the statement the hub computed, including its running balance', async () => {
    const reference = hub();
    const client = clientFor(reference);
    await client.submit('purchasing.supplier_payment', {
      operationId: 'stmt-pay',
      supplierId: 'sup-1',
      invoiceId: null,
      method: 'bank',
      amountPaise: 12_500,
      reference: 'NEFT-77',
      paidOn: null,
    });
    const statement = await client.statement('sup-1');
    expect(statement.supplier.id).toBe('sup-1');
    expect(statement.entries).toHaveLength(1);
    expect(statement.entries[0]?.amountPaise).toBe('-12500');
    expect(statement.closingBalancePaise).toBe('-12500');
  });

  it('refuses a return larger than the good units received', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const orderId = await approvedOrder(client, 'ret');
    const received = await client.submit('purchasing.goods_received', {
      operationId: 'ret-receipt',
      orderId,
      reference: 'CH-R',
      note: '',
      lines: [{ lineIndex: 0, productId: 'prod-rice', quantityMilli: 4000, damagedMilli: 1000, note: 'Dented' }],
    });
    const receiptId = (received.pending.result as { result: { id: string } }).result.id;
    await client.acknowledge('purchasing.goods_received');

    const refused = await client.submit('purchasing.purchase_return', {
      operationId: 'ret-over',
      receiptId,
      disposition: 'supplier_credit',
      refundMethod: null,
      reason: 'Not wanted',
      lines: [{ receiptLine: 0, productId: 'prod-rice', quantityMilli: 3000 }],
    });
    // 4,000 received of which 1,000 damaged: only 3,000 is returnable, so 3,000 is
    // allowed and 4,000 is not. Prove the boundary rather than the easy case.
    expect(refused.pending.state).toBe('accepted');
    await client.acknowledge('purchasing.purchase_return');

    const again = await client.submit('purchasing.purchase_return', {
      operationId: 'ret-again',
      receiptId,
      disposition: 'refund',
      refundMethod: 'cash',
      reason: 'Also not wanted',
      lines: [{ receiptLine: 0, productId: 'prod-rice', quantityMilli: 1 }],
    });
    expect(again.pending.state).toBe('refused');
    expect((again.pending.result as { reason: string }).reason).toBe('invalid_return');
    expect(reference.returns()).toHaveLength(1);
  });
});

describe('offline and exactly-once recovery', () => {
  it('A — keeps an offline draft across an app restart', async () => {
    const store = new MemorySecureStore();
    const drafts = purchasingDraftStore({ port: store, businessId: BUSINESS_ID, actorId: 'owner' });
    const saved = await drafts.save({
      version: 1,
      businessId: BUSINESS_ID,
      actorId: 'owner',
      savedAtIso: new Date().toISOString(),
      orderId: null,
      expectedRevision: null,
      supplierId: 'sup-1',
      note: 'Written with no network',
      lines: [{ productId: 'prod-rice', quantityMilli: 5000, unitCostPaise: 9000, taxBps: 0 }],
    });
    expect(saved.lines).toHaveLength(1);

    // "Restart": a brand-new store object over the same encrypted records.
    const afterRestart = purchasingDraftStore({ port: store, businessId: BUSINESS_ID, actorId: 'owner' });
    const recovered = await afterRestart.load();
    expect(recovered?.note).toBe('Written with no network');
    expect(recovered?.lines[0]?.quantityMilli).toBe(5000);
    // A different employee must not read it.
    const other = purchasingDraftStore({ port: store, businessId: BUSINESS_ID, actorId: 'assistant' });
    expect(await other.load()).toBeNull();
  });

  it('A — a draft is not an operation and cannot be mistaken for one', async () => {
    const store = new MemorySecureStore();
    const drafts = purchasingDraftStore({ port: store, businessId: BUSINESS_ID, actorId: 'owner' });
    await drafts.save({
      version: 1,
      businessId: BUSINESS_ID,
      actorId: 'owner',
      savedAtIso: new Date().toISOString(),
      orderId: null,
      expectedRevision: null,
      supplierId: 'sup-1',
      note: '',
      lines: [],
    });
    const outbox = purchasingOutbox({
      port: store,
      hubId: HUB_ID,
      businessId: BUSINESS_ID,
      deviceId: DEVICE_ID,
      actorId: 'owner',
      kind: 'purchasing.purchase_order_created',
    });
    expect(await outbox.load()).toBeNull();
  });

  it('B — a lost acknowledgement is recovered by identity, never re-posted', async () => {
    const reference = hub();
    const client = clientFor(reference);
    reference.loseNextResponses(1);
    const attempt = await client.submit(
      'purchasing.purchase_order_created',
      orderRequest('po-lost'),
      'po-lost',
    );
    // The reply was lost: the local record says unknown, never "accepted".
    expect(attempt.pending.state).toBe('unknown');
    expect(operationStateCopy(attempt.pending).final).toBe(false);
    expect(reference.orders()).toHaveLength(1);

    const recovered = await client.recover('purchasing.purchase_order_created');
    expect(recovered.state).toBe('accepted');
    // Still exactly one order, and its identity is the one the phone chose.
    expect(reference.orders()).toHaveLength(1);
    expect(reference.orders()[0]?.id).toBe('po-lost');
  });

  it('B — recovery asks the hub for the result before sending anything', async () => {
    const reference = hub();
    const client = clientFor(reference);
    reference.loseNextResponses(1);
    await client.submit('purchasing.purchase_order_created', orderRequest('po-order'), 'po-order');
    const paths: string[] = [];
    const original = purchasingWireFor(reference);
    const wire = async (path: string, body: Record<string, unknown>, bearer: string) => {
      paths.push(path);
      return original(path, body, bearer);
    };
    // Reuse the same client surface but with a recording transport.
    const recording = purchasingClient({
      secure: new MemorySecureStore(),
      identity: {
        origin: 'https://shop.local:8443',
        hubId: HUB_ID,
        businessId: BUSINESS_ID,
        deviceId: DEVICE_ID,
        certificateSha256: 'a'.repeat(64),
      },
      session: () => signIn(reference),
      wire,
    });
    // Reproduce the interrupted operation on the recording client's own queue.
    reference.loseNextResponses(1);
    await recording.submit('purchasing.purchase_order_created', orderRequest('po-order-2'), 'po-order-2');
    paths.length = 0;
    await recording.recover('purchasing.purchase_order_created');
    // The lookup is what comes first; the submit only follows a `not_found`.
    expect(paths[0]).toBe('/v1/purchasing/operation');
    expect(paths.filter((p) => p === '/v1/purchasing/submit')).toHaveLength(0);
    expect(reference.orders()).toHaveLength(2);
  });

  it('C — a hub restart between queueing and sending still converges', async () => {
    const store = new MemorySecureStore();
    const reference = hub();
    reference.dropNextRequests(99);
    const client = clientFor(reference, { store });
    const attempt = await client.submit('purchasing.purchase_order_created', orderRequest('po-restart'), 'po-restart');
    // The request reached the transport attempt, so its outcome is genuinely
    // unknown — not "queued" and certainly not "done".
    expect(attempt.pending.state).toBe('unknown');
    expect(operationStateCopy(attempt.pending).final).toBe(false);
    // The "restart" is the hub accepting requests again; the phone still holds the
    // same immutable identity and payload.
    reference.dropNextRequests(0);
    const recovered = await client.recover('purchasing.purchase_order_created');
    expect(recovered.state).toBe('accepted');
    expect(reference.orders()).toHaveLength(1);
    expect(reference.orders()[0]?.id).toBe('po-restart');
  });

  it('D — pending operations survive an app restart', async () => {
    const store = new MemorySecureStore();
    const reference = hub();
    reference.dropNextRequests(99);
    const before = clientFor(reference, { store });
    await before.submit('purchasing.supplier_payment', {
      operationId: 'pay-restart',
      supplierId: 'sup-1',
      invoiceId: null,
      method: 'cash',
      amountPaise: 500,
      reference: 'CASH-9',
      paidOn: null,
    });
    // New process, same encrypted storage.
    reference.dropNextRequests(0);
    const after = clientFor(reference, { store });
    const restored = await after.pending('purchasing.supplier_payment');
    expect(restored).not.toBeNull();
    expect(restored?.state).toBe('unknown');
    expect(operationStateCopy(restored).final).toBe(false);
    expect(restored?.request.operationId).toBe('pay-restart');
    const recovered = await after.recover('purchasing.supplier_payment');
    expect(recovered.state).toBe('accepted');
    expect(reference.payments()).toHaveLength(1);
  });

  it('E — a revoked permission refuses the queued command server-side', async () => {
    const store = new MemorySecureStore();
    const reference = hub();
    reference.addInvoice({
      id: 'inv-revoke',
      supplierId: 'sup-1',
      receiptId: null,
      reference: 'SUP-REVOKE',
      totalPaise: 10_000,
      outstandingPaise: 10_000,
      dueOn: null,
      createdAt: '2026-11-15T09:00:00Z',
    });
    const session = signIn(reference, 'assistant', 'assistant-phone');
    const client = clientFor(reference, {
      store,
      username: 'assistant',
      deviceId: 'assistant-phone',
      session: () => session,
    });
    reference.dropNextRequests(99);
    const queued = await client.submit('purchasing.supplier_payment', {
      operationId: 'pay-revoked',
      supplierId: 'sup-1',
      invoiceId: 'inv-revoke',
      method: 'cash',
      amountPaise: 1000,
      reference: 'CASH-R',
      paidOn: null,
    });
    expect(queued.pending.state).toBe('unknown');

    // The network returns; the queued command is now sent. The hub — not the UI —
    // decides, and this role never held the permission.
    reference.dropNextRequests(0);
    const recovered = await client.recover('purchasing.supplier_payment');
    expect(recovered.state).toBe('refused');
    expect((recovered.result as { reason: string }).reason).toBe('not_permitted');
    expect(reference.payments()).toHaveLength(0);
  });

  it('F — a conflicting revision is reported, never silently resolved', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const created = await client.submit('purchasing.purchase_order_created', orderRequest('po-conflict'));
    const order = (created.pending.result as { result: { id: string; revision: number } }).result;
    await client.acknowledge('purchasing.purchase_order_created');
    reference.dropNextRequests(99);
    await client.submit('purchasing.purchase_order_updated', {
      operationId: 'po-conflict-phone',
      id: order.id,
      expectedRevision: order.revision,
      note: 'Phone edit',
      lines: [{ productId: 'prod-rice', quantityMilli: 20_000, unitCostPaise: 9000, taxBps: 0 }],
    });
    // Meanwhile the desktop approves and then edits nothing; the revision moved.
    reference.updateOrder(order.id, (row) => {
      row.status = 'submitted';
      row.revision += 1;
    });
    reference.dropNextRequests(0);
    const recovered = await client.recover('purchasing.purchase_order_updated');
    expect(recovered.state).toBe('refused');
    expect((recovered.result as { reason: string }).reason).toBe('order_state_refused');
    expect(reference.order(order.id)?.note).toBe('Weekly stock');
  });

  it('G — repeated taps produce one payment', async () => {
    const reference = hub();
    const client = clientFor(reference);
    const request = {
      operationId: 'pay-once',
      supplierId: 'sup-1',
      invoiceId: null,
      method: 'cash',
      amountPaise: 700,
      reference: 'CASH-ONCE',
      paidOn: null,
    };
    const first = await client.submit('purchasing.supplier_payment', request, 'pay-once');
    expect(first.pending.state).toBe('accepted');
    // A second tap while the first result is unacknowledged must not queue a
    // second operation; the outbox holds one unresolved request per kind.
    await expect(
      client.submit(
        'purchasing.supplier_payment',
        { ...request, amountPaise: 800, operationId: 'pay-once-2' },
        'pay-once-2',
      ),
    ).rejects.toThrow(/already exists|Recover/i);
    expect(reference.payments()).toHaveLength(1);

    // And a replay of the same identity is the same answer.
    await client.acknowledge('purchasing.supplier_payment');
    const replay = await client.submit('purchasing.supplier_payment', request, 'pay-once');
    expect(replay.pending.state).toBe('accepted');
    expect(reference.payments()).toHaveLength(1);
  });

  it('G — an identity reused for different content is a conflict', async () => {
    const reference = hub();
    const client = clientFor(reference);
    await client.submit('purchasing.supplier_payment', {
      operationId: 'pay-clash',
      supplierId: 'sup-1',
      invoiceId: null,
      method: 'cash',
      amountPaise: 100,
      reference: 'A',
      paidOn: null,
    }, 'pay-clash');
    await client.acknowledge('purchasing.supplier_payment');
    // A phone that lost its local records still has the identity in hand. The
    // guard is the hub: it must answer 409 rather than replay the old payment.
    const fresh = clientFor(reference, { store: new MemorySecureStore() });
    await expect(
      fresh.submit('purchasing.supplier_payment', {
        operationId: 'pay-clash',
        supplierId: 'sup-1',
        invoiceId: null,
        method: 'cash',
        amountPaise: 999,
        reference: 'B',
        paidOn: null,
      }, 'pay-clash'),
    ).rejects.toMatchObject({ code: 'operation_identity_conflict' });
    // The original payment is intact and no second one exists.
    expect(reference.payments()).toHaveLength(1);
    expect(reference.payments()[0]?.amountPaise).toBe(100);
  });

  it('H — protected work fails closed when secure storage is unavailable', async () => {
    const failing = {
      get: async () => {
        throw new Error('Encrypted device storage is unavailable.');
      },
      set: async () => {
        throw new Error('Encrypted device storage is unavailable.');
      },
      delete: async () => {
        throw new Error('Encrypted device storage is unavailable.');
      },
    };
    const reference = hub();
    const outbox = purchasingOutbox({
      port: failing,
      hubId: HUB_ID,
      businessId: BUSINESS_ID,
      deviceId: DEVICE_ID,
      actorId: 'owner',
      kind: 'purchasing.supplier_payment',
    });
    await expect(
      outbox.queue(
        {
          operationId: 'pay-nostore',
          supplierId: 'sup-1',
          invoiceId: null,
          method: 'cash',
          amountPaise: 500,
          reference: 'X',
          paidOn: null,
        },
        'pay-nostore',
      ),
    ).rejects.toThrow(/unavailable/);
    // Nothing was sent, and nothing claims to be saved.
    expect(reference.payments()).toHaveLength(0);
  });

  it('H — an oversized payload is refused instead of being truncated', async () => {
    const store = new MemorySecureStore();
    const outbox = purchasingOutbox({
      port: store,
      hubId: HUB_ID,
      businessId: BUSINESS_ID,
      deviceId: DEVICE_ID,
      actorId: 'owner',
      kind: 'purchasing.purchase_order_created',
    });
    const huge = {
      operationId: 'po-huge',
      supplierId: 'sup-1',
      note: 'x'.repeat(50_000),
      lines: [{ productId: 'prod-rice', quantityMilli: 1000, unitCostPaise: 1, taxBps: 0 }],
    };
    await expect(outbox.queue(huge, 'po-huge')).rejects.toThrow();
  });
});

describe('drafts and previews', () => {
  it('rejects a draft saved for another employee', () => {
    const raw = JSON.stringify({
      version: 1,
      businessId: BUSINESS_ID,
      actorId: 'someone-else',
      savedAtIso: new Date().toISOString(),
      orderId: null,
      expectedRevision: null,
      supplierId: 'sup-1',
      note: '',
      lines: [],
    });
    expect(() => parseDraft(raw, { businessId: BUSINESS_ID, actorId: 'owner' })).toThrow(
      /another account/,
    );
  });

  it('keeps the preview an integer and honest about what it is', () => {
    const preview = draftPreview([
      { productId: 'prod-rice', quantityMilli: 10_000, unitCostPaise: 9000, taxBps: 0 },
      { productId: 'prod-oil', quantityMilli: 1500, unitCostPaise: 12_000, taxBps: 500 },
    ]);
    // 10 kg × ₹90 = ₹900 = 90,000 paise; 1.5 l × ₹120 = ₹180 = 18,000 paise.
    expect(preview.subtotalPaise).toBe(108_000);
    // 5% of 18,000 = 900 paise (half-up on integer maths, not floating point).
    expect(preview.taxPaise).toBe(900);
    expect(preview.totalPaise).toBe(108_900);
    for (const value of Object.values(preview)) expect(Number.isInteger(value)).toBe(true);
  });

  it('refuses a preview line that is not a valid quantity or cost', () => {
    expect(() =>
      draftPreview([{ productId: 'prod-rice', quantityMilli: 0, unitCostPaise: 100, taxBps: 0 }]),
    ).toThrow();
    expect(() =>
      draftPreview([{ productId: 'prod-rice', quantityMilli: 1.5, unitCostPaise: 100, taxBps: 0 }]),
    ).toThrow();
    expect(() =>
      draftPreview([{ productId: 'prod-rice', quantityMilli: 1000, unitCostPaise: -1, taxBps: 0 }]),
    ).toThrow();
  });
});

describe('snapshot storage', () => {
  it('records when the hub produced the copy we are showing', async () => {
    const store = new MemorySecureStore();
    const snapshots = purchasingSnapshotStore({
      port: store,
      hubId: HUB_ID,
      deviceId: DEVICE_ID,
      actorId: 'owner',
    });
    const saved = await snapshots.save({ suppliers: [] }, '2026-11-15T09:00:00Z');
    expect(saved.hubGeneratedAtIso).toBe('2026-11-15T09:00:00Z');
    const loaded = await purchasingSnapshotStore({
      port: store,
      hubId: HUB_ID,
      deviceId: DEVICE_ID,
      actorId: 'owner',
    }).load();
    expect(loaded?.hubGeneratedAtIso).toBe('2026-11-15T09:00:00Z');
    // A different device on the same shop keeps its own copy.
    expect(
      await purchasingSnapshotStore({
        port: store,
        hubId: HUB_ID,
        deviceId: 'phone-2',
        actorId: 'owner',
      }).load(),
    ).toBeNull();
  });
});

describe('operation state copy', () => {
  it('never calls a queued or unknown payment successful', () => {
    const base = {
      version: 1 as const,
      state: 'queued' as const,
      request: {
        version: 1 as const,
        hubId: HUB_ID,
        businessId: BUSINESS_ID,
        operationId: 'x',
        kind: 'purchasing.supplier_payment' as const,
        request: {},
      },
      createdIso: '2026-11-15T09:00:00Z',
    };
    expect(operationStateCopy(null).final).toBe(true);
    expect(operationStateCopy(base).final).toBe(false);
    expect(operationStateCopy({ ...base, state: 'unknown' }).final).toBe(false);
    expect(operationStateCopy({ ...base, state: 'accepted', result: { status: 'accepted', kind: 'k', result: {} } }).final).toBe(true);
    expect(
      operationStateCopy({
        ...base,
        state: 'refused',
        result: { status: 'refused', reason: 'not_permitted', revision: null },
      }).final,
    ).toBe(true);
  });
});

describe('outcome parsing', () => {
  it('rejects an acceptance for a different kind', () => {
    expect(() => parseOutcome({ status: 'accepted', kind: 'purchasing.other', result: {} }, 'purchasing.goods_received')).toThrow(
      /different operation/,
    );
  });

  it('rejects a refusal without a reason or with a bad revision', () => {
    expect(() => parseOutcome({ status: 'refused' }, 'purchasing.goods_received')).toThrow();
    expect(() =>
      parseOutcome({ status: 'refused', reason: 'x', revision: 'four' }, 'purchasing.goods_received'),
    ).toThrow();
  });

  it('generates distinct operation identities', () => {
    const ids = new Set(Array.from({ length: 200 }, (_, i) => newOperationId(1_700_000_000_000 + i, () => Math.random())));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^op-[a-z0-9]+-[a-z0-9]+$/);
  });
});
