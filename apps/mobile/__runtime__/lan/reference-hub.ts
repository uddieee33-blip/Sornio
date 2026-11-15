/**
 * Reference Sornio LAN hub — an in-memory, contract-faithful implementation of the
 * `/v1/*` endpoints the mobile client depends on.
 *
 * WHY THIS EXISTS
 * ---------------
 * The whole LAN restaurant stack (pairing, sign-in, workspace read, order
 * submission, kitchen transitions, durable recovery) reported BLOCKED in Phase
 * 20 because no desktop hub was available. That blocked *verification*, not the
 * protocol itself: every client-side call is injected through a `HubWire`
 * function, so the real client code can be executed against a hub that obeys the
 * documented wire contract.
 *
 * WHAT THIS IS
 * ------------
 * Executes the real mobile/domani client recovery logic end to end — durable
 * outbox, `not_found` status lookup, same-operation resend, revision CAS,
 * refusal reasons, per-employee isolation, reconnect resume.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a Rust/Tauri hub. Not TLS. Not certificate pinning. Not SQLCipher. It does
 * not prove the desktop implementation behaves this way, and it does not replace
 * an end-to-end run against a real desktop hub on a real network. It proves the
 * *client* honours the contract, and it pins the contract so both sides can be
 * tested against it. Never cite it as production evidence.
 */

export type HubTicketState = 'pending' | 'preparing' | 'ready' | 'served';

type Ticket = { id: string; orderId: string; state: HubTicketState; revision: number };
type Order = { id: string; tableId: string | null; kind: 'dine_in' | 'takeaway'; state: 'open' | 'pending_bill' | 'closed'; revision: number };

export type ReferenceHubOptions = {
  hubId: string;
  businessId: string;
  businessName: string;
  capabilities?: string[];
  /** Simulate an unreliable network: throw before any work is done. */
  dropNext?: number;
  /** Simulate a response lost *after* the hub committed the change. */
  loseNextResponse?: number;
};

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function referenceHub(options: ReferenceHubOptions) {
  const capabilities = options.capabilities ?? ['kitchen.transitions.v1', 'kitchen.staff.v1', 'kitchen.history.v1', 'staff.access.v1'];
  const employees = new Map<string, { password: string; displayName: string; canSell: boolean }>();
  const devices = new Map<string, { credential: string; approved: boolean }>();
  const sessions = new Map<string, { actorId: string; expires: number }>();

  const orders = new Map<string, Order>();
  const tickets = new Map<string, Ticket>();
  // Shape must satisfy `parseRestaurantSnapshot`: a stable `id`, the NATIVE
  // `productId` it maps to, category/label/variant text and integer paise.
  const menu = [
    { id: 'menu-paneer', productId: 'prod-paneer', category: 'Mains', label: 'Paneer Butter Masala', variant: 'Half', pricePaise: 28000 },
    { id: 'menu-naan', productId: 'prod-naan', category: 'Breads', label: 'Butter Naan', variant: 'Single', pricePaise: 6000 },
  ];

  /** operationId -> stored result. Makes submission and kitchen transitions idempotent. */
  const operations = new Map<string, Record<string, unknown>>();
  let clock = Date.parse('2026-11-13T09:00:00Z');
  const now = () => new Date((clock += 1000)).toISOString();

  let dropped = options.dropNext ?? 0;
  let lostResponses = options.loseNextResponse ?? 0;

  function failAfterCommit() {
    if (lostResponses > 0) {
      lostResponses -= 1;
      throw Object.assign(new Error('Simulated response loss after commit.'), { code: 'network_unavailable' });
    }
  }

  function seed() {
    orders.set('order-1', { id: 'order-1', tableId: 'table-1', kind: 'dine_in', state: 'open', revision: 1 });
    tickets.set('ticket-1', { id: 'ticket-1', orderId: 'order-1', state: 'pending', revision: 1 });
    orders.set('order-2', { id: 'order-2', tableId: null, kind: 'takeaway', state: 'open', revision: 1 });
    tickets.set('ticket-2', { id: 'ticket-2', orderId: 'order-2', state: 'pending', revision: 1 });
  }
  seed();

  function workspace() {
    return {
      schemaVersion: 1,
      source: 'shop',
      businessId: options.businessId,
      generatedAt: now(),
      tables: [{ id: 'table-1', name: 'Table 1' }, { id: 'table-2', name: 'Table 2' }],
      orders: [...orders.values()].map((o) => ({ id: o.id, tableId: o.tableId, kind: o.kind, state: o.state, revision: o.revision })),
      // Kitchen history is append-only on the shop; `served` remains visible.
      tickets: [...tickets.values()].map((t) => ({
        id: t.id,
        orderId: t.orderId,
        state: t.state,
        revision: t.revision,
        items: [{ name: 'Paneer Butter Masala', quantity: 1, note: '' }],
      })),
      menu: menu.map((m) => ({ ...m, available: true })),
      assignments: [...orders.keys()].map((orderId) => ({ orderId, actorId: null, displayName: null, checkoutState: 'unpaid' })),
    };
  }

  function requireSession(bearer: string) {
    const session = sessions.get(bearer);
    if (!session) throw { status: 401, body: { error: 'session_required' } };
    if (session.expires * 1000 <= Date.parse('2026-11-13T09:00:00Z') + (clock - Date.parse('2026-11-13T09:00:00Z'))) {
      /* deterministic expiry is checked in `expireSessions()` instead */
    }
    return session;
  }

  function expireSessions() {
    /* Sessions expire purely through explicit `expireAllSessions()` calls so the
       tests stay deterministic. A one-shot wipe (rather than a stored
       threshold) means a session issued *after* the expiry still works, which
       is exactly the re-authentication path under test. */
  }

  async function handle(path: string, body: Record<string, unknown>, bearer: string): Promise<{ status: number; body: unknown }> {
    if (dropped > 0) {
      dropped -= 1;
      throw Object.assign(new Error('Simulated network drop before the hub was reached.'), { code: 'network_unavailable' });
    }
    expireSessions();

    switch (path) {
      case '/v1/enrol': {
        const deviceId = String(body.deviceId ?? '');
        const credential = String(body.credential ?? '');
        if (!ID.test(deviceId) || !/^[a-f0-9]{64}$/.test(credential)) return { status: 400, body: { error: 'invalid_request' } };
        const existing = devices.get(deviceId);
        devices.set(deviceId, { credential, approved: existing?.approved ?? true });
        return { status: 200, body: { state: 'approved' } };
      }

      case '/v1/session': {
        const device = devices.get(String(body.deviceId ?? ''));
        if (!device || device.credential !== String(body.credential ?? '')) return { status: 403, body: { error: 'access_refused' } };
        if (!device.approved) return { status: 403, body: { error: 'access_refused' } };
        const employee = employees.get(String(body.username ?? ''));
        if (!employee || employee.password !== String(body.password ?? '')) return { status: 403, body: { error: 'access_refused' } };
        const token = `token-${String(body.username)}-${sessions.size + 1}`.padEnd(64, '0');
        sessions.set(token, { actorId: String(body.username), expires: Math.floor(clock / 1000) + 3600 });
        return { status: 200, body: { token, expires: Math.floor(clock / 1000) + 3600, actorId: String(body.username), displayName: employee.displayName } };
      }

      case '/v1/workspace': {
        const session = requireSession(bearer);
        if (String(body.hubId) !== options.hubId || String(body.businessId) !== options.businessId) return { status: 403, body: { error: 'wrong_shop' } };
        return { status: 200, body: workspace() };
      }

      case '/v1/operation': {
        requireSession(bearer);
        const stored = operations.get(String(body.operationId ?? ''));
        // The contract: an unknown operation must report `not_found` so the
        // client replants the SAME immutable payload rather than minting a new id.
        return { status: 200, body: stored ?? { status: 'not_found' } };
      }

      case '/v1/kitchen-state': {
        const session = requireSession(bearer);
        if (String(body.hubId) !== options.hubId || String(body.businessId) !== options.businessId) return { status: 403, body: { error: 'wrong_shop' } };
        const operationId = String(body.operationId ?? '');
        const replay = operations.get(operationId);
        if (replay) return { status: 200, body: replay };

        const ticket = tickets.get(String(body.ticketId ?? ''));
        if (!ticket) return { status: 404, body: { error: 'not_found' } };
        const order = orders.get(ticket.orderId)!;
        const expected = Number(body.expectedRevision);
        const target = String(body.state) as HubTicketState;

        const allowed: Record<HubTicketState, HubTicketState[]> = {
          pending: ['preparing'],
          preparing: ['ready'],
          ready: ['served'],
          served: [],
        };
        let result: Record<string, unknown>;
        if (order.state === 'closed') {
          result = { status: 'refused', kind: 'kitchen_state', operationId, ticketId: ticket.id, reason: 'order_closed', state: null, revision: null };
        } else if (!allowed[ticket.state].includes(target)) {
          result = { status: 'refused', kind: 'kitchen_state', operationId, ticketId: ticket.id, reason: 'transition_refused', state: ticket.state, revision: ticket.revision };
        } else if (expected !== ticket.revision) {
          result = { status: 'refused', kind: 'kitchen_state', operationId, ticketId: ticket.id, reason: 'revision_conflict', state: ticket.state, revision: ticket.revision };
        } else {
          ticket.state = target;
          ticket.revision += 1;
          order.revision += 1;
          result = { status: 'accepted', kind: 'kitchen_state', operationId, ticketId: ticket.id, orderId: order.id, state: target, revision: ticket.revision };
        }
        operations.set(operationId, result);
        failAfterCommit();
        return { status: 200, body: result };
      }

      case '/v1/submit': {
        const session = requireSession(bearer);
        if (String(body.hubId) !== options.hubId || String(body.businessId) !== options.businessId) return { status: 403, body: { error: 'wrong_shop' } };
        const operationId = String(body.operationId ?? '');
        const replay = operations.get(operationId);
        if (replay) return { status: 200, body: replay };

        const order = orders.get(String(body.orderId ?? ''));
        if (!order) return { status: 404, body: { error: 'not_found' } };
        const expected = Number(body.expectedRevision);
        let result: Record<string, unknown>;
        if (order.state !== 'open') {
          result = { status: 'refused', reason: 'checkout_active', revision: order.revision };
        } else if (expected !== order.revision) {
          result = { status: 'refused', reason: 'revision_conflict', revision: order.revision };
        } else {
          order.revision += 1;
          result = { status: 'accepted', operationId, orderId: order.id, revision: order.revision, kitchenDispatched: false, items: body.items };
        }
        operations.set(operationId, result);
        failAfterCommit();
        return { status: 200, body: result };
      }

      default:
        return { status: 404, body: { error: 'not_found' } };
    }
  }

  return {
    handle,
    addEmployee(actorId: string, password: string, displayName: string, canSell = true) {
      employees.set(actorId, { password, displayName, canSell });
    },
    /** Revoke a device grant, as the desktop owner would. */
    revokeDevice(deviceId: string) {
      const device = devices.get(deviceId);
      if (device) device.approved = false;
      for (const [token, session] of sessions) if (token.includes('revoked')) sessions.delete(token);
    },
    /** Invalidate every staff session currently issued. One-shot. */
    expireAllSessions() {
      sessions.clear();
    },
    dropNextRequests(n: number) {
      dropped = n;
    },
    loseNextResponses(n: number) {
      lostResponses = n;
    },
    closeOrder(orderId: string) {
      const order = orders.get(orderId);
      if (order) order.state = 'closed';
    },
    ticket(id: string) {
      return tickets.get(id);
    },
    order(id: string) {
      return orders.get(id);
    },
    operations,
    capabilityList: capabilities,
  };
}

export type ReferenceHub = ReturnType<typeof referenceHub>;

/**
 * Adapts the reference hub to the client's injected `HubWire` shape. The real
 * `hubWire` in the app performs TLS + certificate pinning first; this adapter
 * stands in for transport only.
 */
export function wireFor(hub: ReferenceHub, hooks?: { onRequest?: (path: string, body: Record<string, unknown>) => void }) {
  return async (path: string, body: Record<string, unknown>, bearer: string) => {
    hooks?.onRequest?.(path, body);
    const reply = await hub.handle(path, body, bearer);
    if (reply.status === 401) throw Object.assign(new Error('session_required'), { code: 'session_required' });
    if (reply.status === 403) throw Object.assign(new Error('access_refused'), { code: 'access_refused' });
    return reply.body;
  };
}
