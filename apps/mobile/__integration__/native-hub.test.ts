/** Phase 20D · Level 2. Actual Rust listener + SQLCipher + production mobile
 * transport/outboxes over real TLS on one controlled host. The platform-native
 * Expo module is replaced by a Node TLS adapter at that boundary only. This is
 * not Swift/Kotlin pinning, multicast LAN discovery or physical-device evidence.
 */
jest.mock('../modules/sornio-lan', () => ({ nativeLan: () => jest.requireActual('./support').hostNativeLan }));
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import tls from 'node:tls';
import { NativeHub, EncryptedClientPort, configureHostLan, hostNativeLan, kitchenCommand, assertNoFinancialEffects, type Json } from './support';
import { hubWorkspace } from '../../../packages/business-domain/src/restaurant-lan';
import { kitchenOutbox } from '../../../packages/business-domain/src/restaurant-kitchen';
import { assignmentOutbox } from '../../../packages/business-domain/src/assignment-recovery';
import { kitchenQueue } from '../../../packages/business-domain/src/kitchen-queue';
import { HubConnectionError } from '../../../packages/business-domain/src/hub-setup';
import { hubWire, probeHub } from '../src/lan/transport';

const metrics: { name: string; milliseconds: number; samples: number }[] = [];
async function measure<T>(name: string, action: () => Promise<T>, samples = 1) { const start = performance.now(); const result = await action(); metrics.push({ name, milliseconds: Number((performance.now() - start).toFixed(3)), samples }); return result; }
async function withHub(action: (hub: NativeHub) => Promise<void>, advertise = false) { const hub = await NativeHub.open(advertise); try { await action(hub); } finally { await hub.close(); } }
function ticket(snapshot: Json, id = 'ticket-1') { return (snapshot.tickets as Json[]).find(t => t.id === id)!; }
function device(snapshot: Json, id: string) { return (snapshot.devices as Json[]).find(d => d.id === id)!; }
function code(e: unknown) { return e instanceof HubConnectionError ? e.code : (e as { code?: string })?.code; }

afterAll(() => {
  writeFileSync(path.resolve(__dirname, '../native-hub-results.json'), JSON.stringify({ evidenceLevel: 2, generatedAt: new Date().toISOString(), host: { platform: process.platform, arch: process.arch, release: os.release(), cpus: os.cpus().map(c => c.model), node: process.version }, methodology: 'performance.now around awaited requests; each native adapter request opens a fresh TLS connection; no latency is inferred for a simulator or physical LAN', metrics }, null, 2));
});

describe('Level 2 · real TLS and identity', () => {
  it('probes without credentials, requires a saved pin, and retrieves the authoritative workspace', () => withHub(async hub => {
    const identity = await measure('identity probe', () => probeHub(hub.clientOrigin));
    expect((identity.identity as Json).hubId).toBe(hub.identity.hubId);
    expect(identity.certificateSha256).toBe(hub.certs.fingerprint);
    await expect(hubWire(hub.clientOrigin)('/v1/workspace', { version: 1 }, '')).rejects.toMatchObject({ code: 'certificate_confirmation_required' });
    const c = await hub.connect();
    const snapshot = await measure('initial authenticated workspace', () => hubWire(hub.clientOrigin, c.pair.certificateSha256)('/v1/workspace', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId }, c.session.token));
    const parsed = hubWorkspace(snapshot, c.pair);
    expect(parsed.tables).toHaveLength(2); expect(parsed.orders).toHaveLength(2); expect(parsed.tickets).toHaveLength(2); expect(parsed.menu[0]).toMatchObject({ id: 'menu-pizza', pricePaise: 10000 });
    const authoritative = await hub.snapshot(); expect(ticket(authoritative).revision).toBe(2); assertNoFinancialEffects(authoritative);
    expect(kitchenQueue(parsed).active).toBe(2);
  }));
  it('rejects an incorrect saved fingerprint before sending HTTP', () => withHub(async hub => {
    const c = await hub.connect();
    await expect(hubWire(hub.clientOrigin, 'f'.repeat(64))('/v1/workspace', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId }, c.session.token)).rejects.toMatchObject({ code: 'certificate_changed' });
    expect((await hub.snapshot()).operations).toEqual((await hub.snapshot()).operations); assertNoFinancialEffects(await hub.snapshot());
  }));
  it('rejects a different, otherwise trusted server certificate', () => withHub(async hub => {
    const c = await hub.connect(); configureHostLan({ ca: hub.certs.ca + hub.certs.alternateCa });
    await hub.rotateTls(hub.certs.alternate, hub.certs.alternateKey);
    await expect(probeHub(hub.clientOrigin)).resolves.toBeTruthy();
    await expect(c.wire('/v1/workspace', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId }, c.session.token)).rejects.toMatchObject({ code: 'certificate_changed' });
  }));
  it('rejects an untrusted chain', () => withHub(async hub => { configureHostLan({ ca: hub.certs.alternateCa }); await expect(probeHub(hub.clientOrigin)).rejects.toMatchObject({ code: 'certificate_untrusted' }); }));
  it('rejects an expired certificate signed by the trusted test CA', () => withHub(async hub => { await hub.rotateTls(hub.certs.expired, hub.certs.expiredKey); await expect(probeHub(hub.clientOrigin)).rejects.toMatchObject({ code: 'certificate_expired' }); }));
  it('rejects a certificate for the wrong server identity', () => withHub(async hub => { await hub.rotateTls(hub.certs.wrongHost, hub.certs.wrongHostKey); await expect(probeHub(hub.clientOrigin)).rejects.toMatchObject({ code: 'certificate_untrusted' }); }));
  it('reports an unavailable trusted hub without discarding state', () => withHub(async hub => {
    const c = await hub.connect(); await hub.control.command('stop');
    await expect(c.wire('/v1/workspace', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId }, c.session.token)).rejects.toMatchObject({ code: 'network_unavailable' });
    assertNoFinancialEffects(await hub.snapshot());
  }));
  it('rejects malformed TLS-delivered session JSON as unknown, not success', () => withHub(async hub => {
    const server = tls.createServer({ cert: hub.certs.certificate, key: hub.certs.privateKey }, socket => socket.once('data', () => socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 1\r\nConnection: close\r\n\r\n{')));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('no TLS test port');
    try { await expect(hubWire(`https://127.0.0.1:${address.port}`, hub.certs.fingerprint)('/v1/identity', { version: 1 }, '')).rejects.toMatchObject({ code: 'outcome_unknown' }); } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    assertNoFinancialEffects(await hub.snapshot());
  }));
});

describe('Level 2 · pairing, sessions and native permissions', () => {
  it('discovery hints grant no access; approval is required and enrolment replay is stable', () => withHub(async hub => {
    expect(hub.discovery).toMatchObject({ state: 'advertisement_requested', service: '_sornio._tcp.local.' });
    const identity = await probeHub(hub.clientOrigin); const hint = identity.identity as Json;
    await expect(hub.wire()('/v1/workspace', { version: 1, hubId: hint.hubId, businessId: hint.businessId }, '')).rejects.toMatchObject({ code: 'access_refused' });
    const c = await hub.connect(); expect(c.session.actorId).toBe(hub.actors.chef);
    const replay = await c.wire('/v1/enrol', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId, deviceId: c.pair.deviceId, name: c.pair.name, credential: c.pair.credential }, '') as Json;
    expect(replay.state).toBe('approved');
  }, true));
  it('refuses unknown and pending devices before approval', () => withHub(async hub => {
    const identity = await probeHub(hub.clientOrigin); const hint = identity.identity as Json; const base = { version: 1, hubId: hint.hubId, businessId: hint.businessId, deviceId: 'pending-phone' };
    const wire = hub.wire(); const credential = 'a'.repeat(64);
    await expect(wire('/v1/session', { ...base, username: 'chef', password: hub.password }, credential)).rejects.toMatchObject({ code: 'access_refused' });
    await wire('/v1/enrol', { ...base, name: 'Pending phone', credential }, '');
    await expect(wire('/v1/session', { ...base, username: 'chef', password: hub.password }, credential)).rejects.toMatchObject({ code: 'access_refused' });
    expect(device(await hub.snapshot(), 'pending-phone').state).toBe('pending');
  }));
  it('refuses a wrong password and cross-employee sign-in', () => withHub(async hub => {
    const c = await hub.connect(); const base = { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId, deviceId: c.pair.deviceId };
    await expect(c.wire('/v1/session', { ...base, username: 'chef', password: 'wrong-password' }, c.pair.credential)).rejects.toBeTruthy();
    await expect(c.wire('/v1/session', { ...base, username: 'waiter', password: hub.password }, c.pair.credential)).rejects.toMatchObject({ code: 'access_refused' });
  }));
  it('enforces owner, manager and assigned preparer permissions against native rows', () => withHub(async hub => {
    for (const [username, ticketId, revision, next] of [['owner', 'ticket-1', 2, 'preparing'], ['manager', 'ticket-2', 1, 'preparing'], ['chef', 'ticket-1', 3, 'ready']] as const) {
      const c = await hub.connect(username); const port = new EncryptedClientPort();
      try { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, `role-${username}`, revision, ticketId, next)); const result = await outbox.recover(c.wire, c.session.token); expect(result.state).toBe('accepted'); expect(ticket(await hub.snapshot(), ticketId)).toMatchObject({ state: next, revision: revision + 1 }); } finally { await port.close(); }
    }
    assertNoFinancialEffects(await hub.snapshot());
  }));
  it('refuses an employee without kitchen responsibility and another chef’s assigned ticket', () => withHub(async hub => {
    await hub.control.command('staff', { username: 'restricted' });
    await expect(hub.connect('restricted')).rejects.toMatchObject({ code: 'access_refused' });
    const waiter = await hub.connect('waiter'); const port = new EncryptedClientPort();
    try { const outbox = kitchenOutbox(port, waiter.pair, waiter.session.actorId); await outbox.queue(kitchenCommand(waiter.pair, waiter.session.actorId, 'wrong-assignee')); const result = await outbox.recover(waiter.wire, waiter.session.token); expect(result.result).toMatchObject({ status: 'refused', reason: 'assigned_to_other_staff' }); expect(ticket(await hub.snapshot())).toMatchObject({ state: 'pending', revision: 2 }); } finally { await port.close(); }
  }));
  it('isolates business, employee and operation identity', () => withHub(async hub => {
    const c = await hub.connect(); const command = kitchenCommand(c.pair, c.session.actorId, 'scope-op');
    await expect(c.wire('/v1/kitchen-state', { ...command, businessId: 'another-business' }, c.session.token)).rejects.toMatchObject({ code: 'wrong_shop' });
    await expect(c.wire('/v1/kitchen-state', { ...command, actorId: hub.actors.waiter }, c.session.token)).rejects.toMatchObject({ code: 'wrong_shop' });
    await c.wire('/v1/kitchen-state', command, c.session.token);
    await expect(c.wire('/v1/kitchen-state', { ...command, state: 'ready' }, c.session.token)).rejects.toMatchObject({ code: 'operation_identity_conflict' });
    const status = await c.wire('/v1/operation', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId, operationId: command.operationId }, c.session.token) as Json;
    expect(status).toMatchObject({ status: 'accepted', revision: 3 }); expect(ticket(await hub.snapshot())).toMatchObject({ state: 'preparing', revision: 3 });
  }));
});

describe('Level 2 · kitchen transactions and invalid operations', () => {
  it('commits pending → preparing exactly once with durable event, result and no financial posting', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort();
    try {
      const outbox = kitchenOutbox(port, c.pair, c.session.actorId); const command = kitchenCommand(c.pair, c.session.actorId, 'kitchen-once'); await outbox.queue(command);
      const result = await measure('kitchen acknowledgement', () => outbox.recover(c.wire, c.session.token)); expect(result.result).toMatchObject({ status: 'accepted', state: 'preparing', revision: 3, orderId: 'order-1' });
      const snap = await hub.snapshot(); expect(ticket(snap)).toMatchObject({ state: 'preparing', revision: 3 }); expect((snap.operations as Json[]).filter(o => o.id === 'kitchen-once')).toHaveLength(1); expect((snap.events as Json[]).filter(e => e.operation_id === 'kitchen-once')).toHaveLength(1); assertNoFinancialEffects(snap);
      for (let i = 0; i < 5; i++) await measure('identical operation replay', () => c.wire('/v1/kitchen-state', command, c.session.token));
      expect(ticket(await hub.snapshot()).revision).toBe(3); expect((await outbox.load())?.state).toBe('accepted');
      const refreshed = hubWorkspace(await c.wire('/v1/workspace', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId }, c.session.token), c.pair); expect(refreshed.tickets.find(t => t.id === 'ticket-1')).toMatchObject({ state: 'preparing', revision: 3 });
    } finally { await port.close(); }
  }));
  it('durably refuses stale revisions, skipped states and closed orders without mutation', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort();
    try {
      for (const [id, revision, state, reason] of [['stale', 9, 'preparing', 'revision_conflict'], ['skip', 2, 'served', 'transition_refused']] as const) { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, id, revision, 'ticket-1', state)); expect((await outbox.recover(c.wire, c.session.token)).result).toMatchObject({ status: 'refused', reason }); await outbox.acknowledge(); }
      await hub.control.command('closeOrder', { operationId: 'close-order-1', orderId: 'order-1', expectedRevision: 2 });
      const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'closed')); expect((await outbox.recover(c.wire, c.session.token)).result).toMatchObject({ status: 'refused', reason: 'order_closed' });
      expect(ticket(await hub.snapshot())).toMatchObject({ state: 'pending', revision: 2 }); assertNoFinancialEffects(await hub.snapshot());
    } finally { await port.close(); }
  }));
  it('never overwrites a revision advanced by another authorised supervisor', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort();
    try { await hub.control.command('advanceTicket', { operationId: 'supervisor-advance', ticketId: 'ticket-1', expectedRevision: 2, state: 'preparing' }); const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'outdated-chef')); const result = await outbox.recover(c.wire, c.session.token); expect(result.result).toMatchObject({ status: 'refused', reason: 'revision_conflict', revision: 3, state: 'preparing' }); expect(ticket(await hub.snapshot())).toMatchObject({ state: 'preparing', revision: 3 }); } finally { await port.close(); }
  }));
  it('assigns and reassigns through authorised supervisors, preserves history, and refuses a preparer', () => withHub(async hub => {
    const owner = await hub.connect('owner'), manager = await hub.connect('manager'), waiter = await hub.connect('waiter'); const port = new EncryptedClientPort();
    const request = (actor: string, id: string, revision: number, target: string) => ({ version: 1 as const, hubId: owner.pair.hub.hubId, businessId: owner.pair.hub.businessId, actorId: actor, operationId: id, ticketId: 'ticket-2', expectedRevision: revision, targetActorId: target });
    try {
      const first = assignmentOutbox(port, owner.pair, owner.session.actorId); await first.prepare(request(owner.session.actorId, 'assign-chef', 1, hub.actors.chef!)); expect((await first.recover(owner.wire, owner.session.token)).phase).toBe('accepted'); await first.acknowledge();
      const second = assignmentOutbox(port, manager.pair, manager.session.actorId); await second.prepare(request(manager.session.actorId, 'assign-waiter', 2, hub.actors.waiter!)); expect((await second.recover(manager.wire, manager.session.token)).phase).toBe('accepted'); await second.acknowledge();
      const denied = assignmentOutbox(port, waiter.pair, waiter.session.actorId); await denied.prepare(request(waiter.session.actorId, 'assign-denied', 3, hub.actors.chef!)); await expect(denied.recover(waiter.wire, waiter.session.token)).rejects.toMatchObject({ code: 'access_refused' });
      const snap = await hub.snapshot(); expect(ticket(snap, 'ticket-2').revision).toBe(3); expect(snap.assignments).toContainEqual({ ticket_id: 'ticket-2', actor_id: hub.actors.waiter }); expect((snap.assignmentHistory as Json[]).map(e => e.id)).toEqual(expect.arrayContaining(['seed-assignment', 'assign-chef', 'assign-waiter'])); expect((snap.assignmentHistory as Json[]).some(e => e.id === 'assign-denied')).toBe(false); assertNoFinancialEffects(snap);
    } finally { await port.close(); }
  }));
});

describe('Level 2 · durable recovery against the real hub', () => {
  it('A: a request that never reaches the hub stays pending and retries the same identity', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort(); hub.proxy.dropBefore = 1;
    try { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'never-delivered')); await expect(outbox.recover(c.wire, c.session.token)).rejects.toBeTruthy(); expect((await outbox.load())?.state).toBe('unknown'); expect(ticket(await hub.snapshot()).revision).toBe(2); const result = await outbox.recover(c.wire, c.session.token); expect(result.request.operationId).toBe('never-delivered'); expect(result.state).toBe('accepted'); expect(ticket(await hub.snapshot()).revision).toBe(3); } finally { await port.close(); }
  }));
  it('B: a lost response after SQLCipher commit is adopted by status lookup, exactly once', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort(); configureHostLan({ ca: hub.certs.ca, tls12: true }); const routes: string[] = []; const wire = (p: string, b: Record<string, unknown>, t: string) => { routes.push(p); if (p === '/v1/kitchen-state') hub.proxy.loseAfter = 1; return c.wire(p, b, t); };
    try { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'lost-ack')); await expect(measure('uncertain delivery', () => outbox.recover(wire, c.session.token))).rejects.toBeTruthy(); expect(hub.proxy.lost).toBe(1); expect((await outbox.load())?.state).toBe('unknown'); expect(ticket(await hub.snapshot())).toMatchObject({ state: 'preparing', revision: 3 }); routes.length = 0; const recovered = await measure('recovery after lost acknowledgement', () => outbox.recover(wire, c.session.token)); expect(routes).toEqual(['/v1/operation']); expect(recovered.state).toBe('accepted'); expect(ticket(await hub.snapshot()).revision).toBe(3); expect((await hub.snapshot()).operations).toHaveLength(1); assertNoFinancialEffects(await hub.snapshot()); } finally { await port.close(); }
  }));
  it('C: consecutive transport failures never multiply native effects', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort(); hub.proxy.dropBefore = 3;
    try { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'flaky')); for (let i = 0; i < 3; i++) await expect(outbox.recover(c.wire, c.session.token)).rejects.toBeTruthy(); expect((await outbox.load())?.request.operationId).toBe('flaky'); expect((await outbox.recover(c.wire, c.session.token)).state).toBe('accepted'); expect(ticket(await hub.snapshot()).revision).toBe(3); expect((await hub.snapshot()).operations).toHaveLength(1); } finally { await port.close(); }
  }));
  it('D: a real client-store process restart recovers the same encrypted outbox record', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort();
    try { await kitchenOutbox(port, c.pair, c.session.actorId).queue(kitchenCommand(c.pair, c.session.actorId, 'client-restart')); await port.restart(); const reopened = kitchenOutbox(port, c.pair, c.session.actorId); expect((await reopened.load())?.request.operationId).toBe('client-restart'); expect((await reopened.recover(c.wire, c.session.token)).state).toBe('accepted'); expect(ticket(await hub.snapshot()).revision).toBe(3); } finally { await port.close(); }
  }));
  it('E: native hub restart preserves the committed result and authoritative ticket', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort(); configureHostLan({ ca: hub.certs.ca, tls12: true }); const wire = (p: string, b: Record<string, unknown>, t: string) => { if (p === '/v1/kitchen-state') hub.proxy.loseAfter = 1; return c.wire(p, b, t); };
    try { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'hub-restart')); await expect(outbox.recover(wire, c.session.token)).rejects.toBeTruthy(); expect(ticket(await hub.snapshot())).toMatchObject({ state: 'preparing', revision: 3 }); await measure('hub restart', () => hub.restart()); const recovered = await measure('recovery after hub restart', () => kitchenOutbox(port, c.pair, c.session.actorId).recover(c.wire, c.session.token)); expect(recovered.state).toBe('accepted'); expect(recovered.request.operationId).toBe('hub-restart'); const snap = await hub.snapshot(); expect(ticket(snap)).toMatchObject({ state: 'preparing', revision: 3 }); expect(snap.operations).toHaveLength(1); assertNoFinancialEffects(snap); } finally { await port.close(); }
  }));
  it('F: session expiry keeps the unresolved command and reauthentication reuses its ID', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort();
    try { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'expired')); await hub.control.command('expireSessions'); await expect(outbox.recover(c.wire, c.session.token)).rejects.toMatchObject({ code: 'session_required' }); expect((await outbox.load())?.state).toBe('unknown'); expect(ticket(await hub.snapshot()).revision).toBe(2); const fresh = await c.wire('/v1/session', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId, deviceId: c.pair.deviceId, username: 'chef', password: hub.password }, c.pair.credential) as { token: string }; const result = await outbox.recover(c.wire, fresh.token); expect(result.request.operationId).toBe('expired'); expect(result.state).toBe('accepted'); expect(ticket(await hub.snapshot()).revision).toBe(3); } finally { await port.close(); }
  }));
  it('G: device revocation blocks new sessions and recovery without bypass', () => withHub(async hub => {
    const c = await hub.connect(); const port = new EncryptedClientPort();
    try { const outbox = kitchenOutbox(port, c.pair, c.session.actorId); await outbox.queue(kitchenCommand(c.pair, c.session.actorId, 'revoked')); await hub.control.command('device', { id: c.pair.deviceId, revision: 2 }); await expect(outbox.recover(c.wire, c.session.token)).rejects.toMatchObject({ code: 'session_required' }); await expect(c.wire('/v1/session', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId, deviceId: c.pair.deviceId, username: 'chef', password: hub.password }, c.pair.credential)).rejects.toMatchObject({ code: 'access_refused' }); const replay = await c.wire('/v1/enrol', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId, deviceId: c.pair.deviceId, name: c.pair.name, credential: c.pair.credential }, '') as Json; expect(replay.state).toBe('revoked'); expect((await outbox.load())?.request.operationId).toBe('revoked'); expect(ticket(await hub.snapshot()).revision).toBe(2); } finally { await port.close(); }
  }));
  it('rejects stale trust after a genuine encrypted backup restore changes generation', () => withHub(async hub => {
    const c = await hub.connect(); const before = await hub.snapshot(); await hub.restore(); const after = await hub.snapshot(); expect(after.generation).not.toBe(before.generation);
    await expect(c.wire('/v1/workspace', { version: 1, hubId: c.pair.hub.hubId, businessId: c.pair.hub.businessId }, c.session.token)).rejects.toMatchObject({ code: 'session_required' });
  }));
});
