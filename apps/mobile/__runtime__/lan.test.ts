/**
 * LAN restaurant and kitchen protocol acceptance.
 *
 * These execute the REAL client code from `packages/business-domain` — the
 * durable outbox, the operation-status lookup, the same-operation resend, the
 * revision compare-and-set, and the recovery resume — against a reference hub
 * (`__runtime__/lan/reference-hub.ts`).
 *
 * Evidence level: this is headless execution of client protocol logic. It is NOT
 * TLS, NOT certificate pinning, NOT the Rust desktop hub, and NOT an end-to-end
 * LAN run. Those remain BLOCKED and are reported as such.
 */
import {
  hubOutbox,
  hubWorkspace,
  type HubPair,
  type HubSession,
  type HubSubmission,
} from '../../../packages/business-domain/src/restaurant-lan';
import {
  kitchenCommand,
  kitchenOutbox,
  nextKitchenState,
  type KitchenCommand,
} from '../../../packages/business-domain/src/restaurant-kitchen';
import { kitchenQueue, defaultKitchenFilter } from '../../../packages/business-domain/src/kitchen-queue';
import type { RestaurantSnapshot } from '../../../packages/business-domain/src/restaurant-operations';
import { MemorySecureStore } from '@sornio/mobile-contracts';
import { referenceHub, wireFor, type ReferenceHub } from './lan/reference-hub';

const HUB_ID = 'hub-1';
const BUSINESS_ID = 'biz-1';

function memoryStore() {
  return new MemorySecureStore();
}

function pairFor(overrides: Partial<HubPair> = {}): HubPair {
  return {
    version: 1,
    origin: 'https://127.0.0.1:8765',
    hub: { version: 1, hubId: HUB_ID, businessId: BUSINESS_ID, businessName: 'Sornio Test Kitchen' },
    deviceId: 'device-1',
    name: 'Kitchen phone',
    credential: 'a'.repeat(64),
    certificateSha256: 'b'.repeat(64),
    certificateConfirmedAt: '2026-11-13T08:00:00.000Z',
    ...overrides,
  };
}

function sessionFor(actorId = 'chef-1'): HubSession {
  return { token: 't'.repeat(64), expires: Math.floor(Date.now() / 1000) + 3600, actorId, displayName: 'Chef One' };
}

/** Pairs, signs in, and returns the live wire for a reference hub. */
async function connected(actorId = 'chef-1', password = 'pw-1') {
  const hub = referenceHub({ hubId: HUB_ID, businessId: BUSINESS_ID, businessName: 'Sornio Test Kitchen' });
  hub.addEmployee(actorId, password, 'Chef One');
  const pair = pairFor();
  await hub.handle('/v1/enrol', { deviceId: pair.deviceId, credential: pair.credential, name: pair.name }, '');
  const reply = (await hub.handle('/v1/session', { deviceId: pair.deviceId, credential: pair.credential, username: actorId, password }, '')) as {
    body: { token: string; expires: number; actorId: string; displayName: string };
  };
  const session = reply.body;
  return { hub, pair, session, wire: wireFor(hub, { onRequest: (path) => requests.push(path) }), store: memoryStore() };
}

const requests: string[] = [];

function submissionFor(orderId: string, operationId: string, expectedRevision: number): HubSubmission {
  return {
    version: 1,
    hubId: HUB_ID,
    businessId: BUSINESS_ID,
    operationId,
    actorId: 'chef-1',
    orderId,
    tableId: orderId === 'order-1' ? 'table-1' : null,
    expectedRevision,
    items: [{ menuId: 'menu-paneer', quantity: 1, expectedPricePaise: 28000, note: 'Less spice' }],
  };
}

function kitchenFor(ticketId: string, operationId: string, expectedRevision: number, state: KitchenCommand['state']): KitchenCommand {
  return { version: 1, hubId: HUB_ID, businessId: BUSINESS_ID, actorId: 'chef-1', operationId, ticketId, expectedRevision, state };
}

beforeEach(() => {
  requests.length = 0;
});

describe('LAN · pairing and session', () => {
  it('refuses a staff sign-in before the device is enrolled', async () => {
    const hub = referenceHub({ hubId: HUB_ID, businessId: BUSINESS_ID, businessName: 'Shop' });
    hub.addEmployee('chef-1', 'pw-1', 'Chef One');
    const reply = await hub.handle('/v1/session', { deviceId: 'device-9', credential: 'a'.repeat(64), username: 'chef-1', password: 'pw-1' }, '');
    expect(reply.status).toBe(403);
    expect(reply.body).toEqual({ error: 'access_refused' });
  });

  it('refuses a wrong employee password', async () => {
    const hub = referenceHub({ hubId: HUB_ID, businessId: BUSINESS_ID, businessName: 'Shop' });
    hub.addEmployee('chef-1', 'pw-1', 'Chef One');
    await hub.handle('/v1/enrol', { deviceId: 'd1', credential: 'a'.repeat(64) }, '');
    const reply = await hub.handle('/v1/session', { deviceId: 'd1', credential: 'a'.repeat(64), username: 'chef-1', password: 'wrong' }, '');
    expect(reply.status).toBe(403);
  });

  it('refuses a workspace read from another business', async () => {
    const { hub, session } = await connected();
    const reply = await hub.handle('/v1/workspace', { hubId: HUB_ID, businessId: 'other-business' }, session.token);
    expect(reply.status).toBe(403);
    expect(reply.body).toEqual({ error: 'wrong_shop' });
  });

  it('accepts an enrolled employee and returns a validated workspace', async () => {
    const { pair, session, wire } = await connected();
    const snapshot = hubWorkspace(await wire('/v1/workspace', { version: 1, hubId: HUB_ID, businessId: BUSINESS_ID }, session.token), pair);
    expect(snapshot.businessId).toBe(BUSINESS_ID);
    expect(snapshot.tables).toHaveLength(2);
    expect(snapshot.tickets.map((t) => t.id).sort()).toEqual(['ticket-1', 'ticket-2']);
  });
});

describe('LAN · order submission and durable recovery', () => {
  it('accepts one submission and returns a revision receipt', async () => {
    const { wire, store, pair, session } = await connected();
    const outbox = hubOutbox(store, pair, 'chef-1');
    await outbox.queue(submissionFor('order-2', 'op-submit-1', 1));
    const result = await outbox.recover(wire, session.token);
    expect(result.state).toBe('accepted');
    expect(result.result).toMatchObject({ status: 'accepted', revision: 2, kitchenDispatched: false });
  });

  it('resolves an unknown outcome by status lookup instead of minting a new operation', async () => {
    const { hub, wire, store, pair, session } = await connected();
    hub.loseNextResponses(1);

    const outbox = hubOutbox(store, pair, 'chef-1');
    await outbox.queue(submissionFor('order-2', 'op-submit-2', 1));

    // First attempt reaches the hub and commits, but the reply is lost.
    await expect(outbox.recover(wire, session.token)).rejects.toBeTruthy();
    const afterLoss = await outbox.load();
    expect(afterLoss?.state).toBe('unknown');

    // The hub really did commit.
    expect(hub.order('order-2')?.revision).toBe(2);

    // Recovery must consult status first and adopt the committed result.
    requests.length = 0;
    const recovered = await outbox.recover(wire, session.token);
    expect(recovered.state).toBe('accepted');
    expect(recovered.result).toMatchObject({ revision: 2 });
    expect(requests[0]).toBe('/v1/operation');
    // Critically: the order advanced exactly once, never twice.
    expect(hub.order('order-2')?.revision).toBe(2);
  });

  it('replants the same operation when the hub has no record of it', async () => {
    const { hub, wire, store, pair, session } = await connected();
    hub.dropNextRequests(1);
    const outbox = hubOutbox(store, pair, 'chef-1');
    await outbox.queue(submissionFor('order-2', 'op-submit-3', 1));

    await expect(outbox.recover(wire, session.token)).rejects.toBeTruthy();
    requests.length = 0;
    const settled = await outbox.recover(wire, session.token);
    expect(settled.state).toBe('accepted');
    // Status first, then the identical payload — never a new id.
    expect(requests).toEqual(['/v1/operation', '/v1/submit']);
    expect(hub.order('order-2')?.revision).toBe(2);
  });

  it('records a refusal durably without advancing the order', async () => {
    const { hub, wire, store, pair, session } = await connected();
    const outbox = hubOutbox(store, pair, 'chef-1');
    // Revision 7 does not exist yet, so the hub refuses with a conflict.
    await outbox.queue(submissionFor('order-2', 'op-submit-4', 7));
    const result = await outbox.recover(wire, session.token);
    expect(result.state).toBe('refused');
    expect(result.result).toMatchObject({ reason: 'revision_conflict' });
    expect(hub.order('order-2')?.revision).toBe(1);
  });

  it('refuses a second, different operation while one is unresolved', async () => {
    const { store, pair } = await connected();
    const outbox = hubOutbox(store, pair, 'chef-1');
    await outbox.queue(submissionFor('order-2', 'op-a', 1));
    await expect(outbox.queue(submissionFor('order-2', 'op-b', 1))).rejects.toThrow(/already exists/i);
  });

  it('keeps one employee out of another employee\'s queue', async () => {
    const { store, pair } = await connected();
    const chef = hubOutbox(store, pair, 'chef-1');
    await chef.queue(submissionFor('order-2', 'op-chef', 1));
    const other = hubOutbox(store, pair, 'chef-2');
    expect(await other.load()).toBeNull();
  });

  it('survives a process restart by reloading the queued operation', async () => {
    const { wire, store, pair, session } = await connected();
    await hubOutbox(store, pair, 'chef-1').queue(submissionFor('order-2', 'op-restart', 1));

    // New object graph, same device storage — as after an app termination.
    const reopened = hubOutbox(store, pair, 'chef-1');
    const loaded = await reopened.load();
    expect(loaded?.state).toBe('queued');
    expect(loaded?.request.operationId).toBe('op-restart');
    const result = await reopened.recover(wire, session.token);
    expect(result.state).toBe('accepted');
  });
});

describe('LAN · kitchen transitions', () => {
  it('walks pending → preparing → ready → served with a revision each time', async () => {
    const { hub, wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');

    const steps: [number, KitchenCommand['state'], number][] = [
      [1, 'preparing', 2],
      [2, 'ready', 3],
      [3, 'served', 4],
    ];
    for (const [revision, state, next] of steps) {
      await outbox.queue(kitchenFor('ticket-1', `op-kitchen-${state}`, revision, state));
      const result = await outbox.recover(wire, session.token);
      expect(result.state).toBe('accepted');
      expect(result.result).toMatchObject({ state, revision: next });
      await outbox.acknowledge();
    }
    expect(hub.ticket('ticket-1')).toMatchObject({ state: 'served', revision: 4 });
  });

  it('refuses a stale revision with a revision conflict', async () => {
    const { wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-stale', 5, 'preparing'));
    const result = await outbox.recover(wire, session.token);
    expect(result.state).toBe('refused');
    expect(result.result).toMatchObject({ reason: 'revision_conflict' });
  });

  it('refuses skipping a preparation state', async () => {
    const { wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    // pending straight to served is not a legal jump.
    await outbox.queue(kitchenFor('ticket-1', 'op-skip', 1, 'served'));
    const result = await outbox.recover(wire, session.token);
    expect(result.state).toBe('refused');
    expect(result.result).toMatchObject({ reason: 'transition_refused' });
  });

  it('refuses a kitchen change on a closed order', async () => {
    const { hub, wire, store, pair, session } = await connected();
    hub.closeOrder('order-1');
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-closed', 1, 'preparing'));
    const result = await outbox.recover(wire, session.token);
    expect(result.state).toBe('refused');
    expect(result.result).toMatchObject({ reason: 'order_closed' });
    expect(hub.ticket('ticket-1')?.state).toBe('pending');
  });

  it('recovers a kitchen transition whose response was lost, without double-advancing', async () => {
    const { hub, wire, store, pair, session } = await connected();
    hub.loseNextResponses(1);
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-kitchen-loss', 1, 'preparing'));

    await expect(outbox.recover(wire, session.token)).rejects.toBeTruthy();
    expect(hub.ticket('ticket-1')).toMatchObject({ state: 'preparing', revision: 2 });

    const recovered = await outbox.recover(wire, session.token);
    expect(recovered.state).toBe('accepted');
    expect(recovered.result).toMatchObject({ revision: 2 });
    // The ticket advanced exactly once.
    expect(hub.ticket('ticket-1')).toMatchObject({ state: 'preparing', revision: 2 });
  });

  it('keeps a kitchen command scoped to its own shop and employee', async () => {
    const { store, pair } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-scope', 1, 'preparing'));
    const impostor = kitchenOutbox(store, pair, 'chef-2');
    expect(await impostor.load()).toBeNull();
    await expect(impostor.recover(async () => ({}), sessionFor().token)).rejects.toThrow(/No saved submission/);
  });

  it('acknowledges a final result and then accepts the next transition', async () => {
    const { wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-1', 1, 'preparing'));
    expect((await outbox.recover(wire, session.token)).state).toBe('accepted');
    await expect(outbox.queue(kitchenFor('ticket-1', 'op-2', 2, 'ready'))).rejects.toThrow(/already exists/i);
    await outbox.acknowledge();
    await outbox.queue(kitchenFor('ticket-1', 'op-2', 2, 'ready'));
    const second = await outbox.recover(wire, session.token);
    expect(second.result).toMatchObject({ state: 'ready', revision: 3 });
  });
});

describe('LAN · validation guards', () => {
  it('rejects malformed kitchen commands', () => {
    expect(() => kitchenCommand({ version: 2 })).toThrow();
    expect(() => kitchenCommand({ ...kitchenFor('ticket-1', 'op', 1, 'preparing'), state: 'teleported' })).toThrow();
    expect(() => kitchenCommand({ ...kitchenFor('ticket-1', 'op', 0, 'preparing') })).toThrow();
  });

  it('never advances past served', () => {
    expect(nextKitchenState('pending')).toBe('preparing');
    expect(nextKitchenState('preparing')).toBe('ready');
    expect(nextKitchenState('ready')).toBe('served');
    expect(nextKitchenState('served')).toBeNull();
  });
});

describe('LAN · interrupted sessions during recovery', () => {
  it('keeps the saved operation when the staff session has expired', async () => {
    const { hub, wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-expired', 1, 'preparing'));

    // Every session is now invalid, as after a long background sleep.
    hub.expireAllSessions();
    await expect(outbox.recover(wire, session.token)).rejects.toBeTruthy();

    // The unresolved command is NOT destroyed and NOT duplicated.
    const kept = await outbox.load();
    expect(kept?.request.operationId).toBe('op-expired');
    expect(['queued', 'unknown']).toContain(kept?.state);
    expect(hub.ticket('ticket-1')?.state).toBe('pending');
  });

  it('resumes the same operation after the employee signs in again', async () => {
    const { hub, wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-resume', 1, 'preparing'));
    hub.expireAllSessions();
    await expect(outbox.recover(wire, session.token)).rejects.toBeTruthy();

    // Re-authenticate the same employee on the same device.
    const fresh = (await hub.handle('/v1/session', { deviceId: pair.deviceId, credential: pair.credential, username: 'chef-1', password: 'pw-1' }, '')) as {
      body: { token: string };
    };
    const resumed = await kitchenOutbox(store, pair, 'chef-1').recover(wire, fresh.body.token);
    expect(resumed.state).toBe('accepted');
    expect(resumed.request.operationId).toBe('op-resume');
    expect(hub.ticket('ticket-1')).toMatchObject({ state: 'preparing', revision: 2 });
  });

  it('reports a revoked device as a refusal to act, and still keeps the command', async () => {
    const { hub, wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-revoked', 1, 'preparing'));

    hub.revokeDevice(pair.deviceId);
    // A revoked device cannot obtain a session at all.
    const denied = await hub.handle('/v1/session', { deviceId: pair.deviceId, credential: pair.credential, username: 'chef-1', password: 'pw-1' }, '');
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'access_refused' });

    // The previously issued session is independently expired by the shop.
    hub.expireAllSessions();
    await expect(outbox.recover(wire, session.token)).rejects.toBeTruthy();
    expect((await outbox.load())?.request.operationId).toBe('op-revoked');
    expect(hub.ticket('ticket-1')?.state).toBe('pending');
  });

  it('does not lose a queued command across a burst of dropped connections', async () => {
    const { hub, wire, store, pair, session } = await connected();
    const outbox = kitchenOutbox(store, pair, 'chef-1');
    await outbox.queue(kitchenFor('ticket-1', 'op-flaky', 1, 'preparing'));

    hub.dropNextRequests(3);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(outbox.recover(wire, session.token)).rejects.toBeTruthy();
    }
    const settled = await outbox.recover(wire, session.token);
    expect(settled.state).toBe('accepted');
    expect(hub.ticket('ticket-1')).toMatchObject({ state: 'preparing', revision: 2 });
  });
});

describe('LAN · kitchen queue projection against a real snapshot', () => {
  async function snapshotFrom(): Promise<RestaurantSnapshot> {
    const { pair, session, wire } = await connected();
    return hubWorkspace(await wire('/v1/workspace', { version: 1, hubId: HUB_ID, businessId: BUSINESS_ID }, session.token), pair);
  }

  it('projects open tickets into an active queue with counts', async () => {
    const queue = kitchenQueue(await snapshotFrom());
    expect(queue.active).toBe(2);
    expect(queue.counts).toMatchObject({ pending: 2, preparing: 0, ready: 0, served: 0 });
    expect(queue.tickets.map((t) => t.kind).sort()).toEqual(['dine_in', 'takeaway']);
  });

  it('filters by service state and drops served work from the active view', async () => {
    const snapshot = await snapshotFrom();
    snapshot.tickets[0]!.state = 'served';
    const queue = kitchenQueue(snapshot, { ...defaultKitchenFilter, state: 'active' });
    expect(queue.tickets).toHaveLength(1);
    expect(queue.counts.served).toBe(1);
  });

  it('prioritises ready tickets for service', async () => {
    const snapshot = await snapshotFrom();
    snapshot.tickets[0]!.state = 'ready';
    snapshot.tickets[1]!.state = 'preparing';
    const queue = kitchenQueue(snapshot);
    expect(queue.tickets[0]!.state).toBe('ready');
  });
});
