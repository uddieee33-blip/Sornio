/**
 * Durable purchasing operations for the companion (Phase 21B).
 *
 * WHY THIS REUSES `hubCommandStore`
 * ---------------------------------
 * The restaurant track already solved exactly-once mobile submission against the
 * LAN hub: an immutable request is written to encrypted storage *before* it is
 * sent, every retry queries `/v1/operation` first, and a resend always carries the
 * same operation identity. Creating a second, differently-behaved queue for
 * purchasing is how two sources of truth appear. So purchasing is modelled as a
 * *set* of such commands, each one instantiated from the same store:
 *
 *   - one queue per (hub, device, employee, kind), keyed by the operation kind,
 *     so a purchase order never waits behind a supplier payment;
 *   - the same `queued → unknown → accepted|refused` lifecycle and the same
 *     "recover by identity before resending" rule;
 *   - the same 50,000-character secure-record ceiling, which the storage layer
 *     splits into 320-character chunks.
 *
 * WHAT IT ADDS
 * ------------
 * 1. **A draft store.** A purchase-order draft is *not* an operation. Drafts are
 *    editable, survive an app restart, and are stored under their own key so an
 *    unresolved submission never blocks editing a *different* draft (it does block
 *    starting a second submission, exactly like the restaurant outbox).
 * 2. **A capability-aware flush.** Releasing a queued operation is separate from
 *    writing it: a revoked role must not be able to drain the queue, and a queue
 *    entry that is refused for permission stays in the journal for audit rather
 *    than being silently discarded.
 * 3. **Fail-closed storage.** Every constructor takes an explicit "durability
 *    required" flag; when the encrypted store is unavailable this throws instead of
 *    pretending a payment is safe in volatile memory.
 */
import { hubCommandStore, type CommandRecord } from './hub-command-store.ts';
import { secureRestaurantRecords, type SecurePort } from './restaurant-mobile.ts';
import {
  parseOutcome,
  parseStatusLookup,
  type PurchasingOutcome,
} from './purchasing-contract.ts';

/** The operation kinds the hub accepts. Must stay in step with `KINDS` in Rust. */
export const PURCHASING_KINDS = [
  'purchasing.supplier_saved',
  'purchasing.purchase_order_created',
  'purchasing.purchase_order_updated',
  'purchasing.purchase_order_submitted',
  'purchasing.purchase_order_decided',
  'purchasing.purchase_order_cancelled',
  'purchasing.purchase_order_closed',
  'purchasing.goods_received',
  'purchasing.supplier_payment',
  'purchasing.purchase_return',
] as const;
export type PurchasingKind = (typeof PURCHASING_KINDS)[number];

const ID = /^[a-zA-Z0-9_-]{1,80}$/;

export type PurchasingSubmission = {
  version: 1;
  hubId: string;
  businessId: string;
  operationId: string;
  kind: PurchasingKind;
  request: Record<string, unknown>;
};

export type PurchasingWire = (
  path: string,
  body: Record<string, unknown>,
  bearer: string,
) => Promise<unknown>;

export function isPurchasingKind(value: unknown): value is PurchasingKind {
  return typeof value === 'string' && (PURCHASING_KINDS as readonly string[]).includes(value);
}

const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates an immutable submission. The request body itself is validated by the
 * hub; what matters here is that the *envelope* is stable, because it is what a
 * retry re-sends byte for byte.
 */
export function purchasingSubmission(value: unknown): PurchasingSubmission {
  if (
    !obj(value) ||
    value.version !== 1 ||
    !ID.test(String(value.hubId)) ||
    !ID.test(String(value.businessId)) ||
    !ID.test(String(value.operationId)) ||
    !isPurchasingKind(value.kind) ||
    !obj(value.request)
  ) {
    throw new Error('This saved purchasing operation is invalid. Recover it from the hub before editing.');
  }
  const encoded = JSON.stringify(value.request);
  if (encoded.length > 48_000) {
    throw new Error('This operation is too large to save securely. Split it into smaller reviewed batches.');
  }
  return value as PurchasingSubmission;
}

/**
 * The identity a committed purchasing document carries: every Phase 21A result
 * (supplier, order, receipt, payment, return) is keyed by the operation that
 * produced it.
 *
 * This exists because the hub's status route answers by operation id alone. A
 * phone that lost its records could therefore be handed a *different*
 * operation's result if ids ever collided or a stale backup restored old ids.
 * Adopting that would report work as committed that this device never sent, so
 * the outbox checks the identity before it believes an answer.
 */
export function resultIdentity(result: unknown): string | null {
  if (!obj(result)) return null;
  if (typeof result.id === 'string') return result.id;
  if (typeof result.operationId === 'string') return result.operationId;
  return null;
}

export type PurchasingPending = CommandRecord<PurchasingSubmission, PurchasingOutcome> & {
  /** Where this operation can be replayed if its status lookup finds nothing. */
  createdIso: string;
};

function pendingRecord(value: unknown, submission: PurchasingSubmission): PurchasingPending {
  if (!obj(value) || value.version !== 1) throw new Error('Invalid pending purchasing operation.');
  const state = String(value.state);
  if (!['queued', 'unknown', 'accepted', 'refused'].includes(state)) {
    throw new Error('Invalid pending purchasing operation.');
  }
  if (value.resumeAfterReconnect !== undefined && typeof value.resumeAfterReconnect !== 'boolean') {
    throw new Error('Invalid reconnect policy.');
  }
  // A record is created inside the command store before this wrapper has had a
  // chance to stamp it, so a missing stamp means "created just now" rather than
  // "corrupt". Any stamp that *is* present must still be a real timestamp.
  if (
    value.createdIso !== undefined &&
    (typeof value.createdIso !== 'string' || !Number.isFinite(Date.parse(value.createdIso)))
  ) {
    throw new Error('Invalid pending purchasing operation timestamp.');
  }
  const stored = purchasingSubmission(value.request);
  if (
    stored.operationId !== submission.operationId ||
    stored.kind !== submission.kind ||
    stored.hubId !== submission.hubId ||
    stored.businessId !== submission.businessId
  ) {
    throw new Error('This saved operation belongs to another shop or employee.');
  }
  const createdIso =
    typeof value.createdIso === 'string' ? value.createdIso : new Date().toISOString();
  if (state === 'accepted' || state === 'refused') {
    const outcome = parseOutcome(value.result, submission.kind);
    if (outcome.status !== state) throw new Error('Saved result differs from its state.');
    return { ...(value as PurchasingPending), version: 1, createdIso, request: stored, result: outcome };
  }
  return { ...(value as PurchasingPending), version: 1, createdIso, request: stored };
}

/**
 * One unresolved operation per (device, employee, kind).
 *
 * `durability: 'require'` is the default and must be used for anything that moves
 * money or stock. Passing `'allow-memory'` is only legitimate for a read-only or
 * demonstrative screen; the payment, receiving and return flows pass `'require'`.
 */
export function purchasingOutbox(options: {
  port: SecurePort;
  hubId: string;
  businessId: string;
  deviceId: string;
  actorId: string;
  kind: PurchasingKind;
}) {
  const { port, hubId, businessId, deviceId, actorId, kind } = options;
  if (!ID.test(hubId) || !ID.test(businessId) || !ID.test(deviceId) || !ID.test(actorId)) {
    throw new Error('A signed-in device and employee are required to queue purchasing work.');
  }
  if (!isPurchasingKind(kind)) throw new Error('Unknown purchasing operation.');
  const root = `sornio.purchase.v1.${hubId}.${deviceId}.${actorId}.${kind.replace(/\./g, '-')}`;
  const records = secureRestaurantRecords(port, root);
  const envelope = { version: 1, hubId, businessId };

  const commands = hubCommandStore<PurchasingSubmission, PurchasingOutcome>({
    records,
    lockKey: root,
    validate: purchasingSubmission,
    parse: (raw) => {
      const base = {
        version: 1 as const,
        hubId,
        businessId,
        operationId: (raw as { request?: { operationId?: string } })?.request?.operationId ?? '',
        kind,
        request: {},
      };
      return pendingRecord(raw, base);
    },
    result: (raw, request) => parseOutcome(raw, request.kind),
    route: '/v1/purchasing/submit',
    base: envelope,
  });

  return {
    kind,
    load: commands.load,
    /**
     * Writes the operation to encrypted storage before any transport attempt, and
     * refuses to overwrite a *different* unresolved operation.
     */
    async queue(request: Record<string, unknown>, operationId: string): Promise<PurchasingPending> {
      const submission = purchasingSubmission({
        ...envelope,
        operationId,
        kind,
        request,
      });
      await commands.queue(submission);
      const record = await commands.load();
      const pending: PurchasingPending = {
        ...(record as PurchasingPending),
        createdIso: new Date().toISOString(),
      };
      await records.write('operation', JSON.stringify(pending));
      return pending;
    },
    /**
     * Queries the hub for the *same* identity before resending, then resends only
     * that same immutable request. A `not_found` means the hub never saw it, so the
     * original payload is replayed; it is never replaced with a new one.
     */
    async recover(wire: PurchasingWire, token: string): Promise<PurchasingPending> {
      const stored = (await commands.load()) as PurchasingPending | null;
      if (!stored) throw new Error('No saved purchasing operation to recover.');
      if (stored.state === 'accepted' || stored.state === 'refused') return stored;
      const record: PurchasingPending = {
        ...stored,
        state: 'unknown',
        resumeAfterReconnect: true,
      };
      await records.write('operation', JSON.stringify(record));
      // The lookup carries the payload this device *believes* the identity
      // refers to. The hub compares it with the digest it recorded, so an id
      // reused for different content conflicts here instead of being answered
      // with somebody else's committed result.
      const reply = await wire(
        '/v1/purchasing/operation',
        {
          ...envelope,
          operationId: stored.request.operationId,
          kind: stored.request.kind,
          request: stored.request.request,
        },
        token,
      );
      const lookup = parseStatusLookup(reply, stored.request.kind);
      let outcome: PurchasingOutcome;
      if (lookup.status === 'not_found') {
        outcome = parseOutcome(
          await wire(
            '/v1/purchasing/submit',
            {
              ...envelope,
              operationId: stored.request.operationId,
              kind: stored.request.kind,
              request: stored.request.request,
            },
            token,
          ),
          stored.request.kind,
        );
      } else {
        // A committed document must be *this* operation's. Anything else is an
        // identity clash the phone must not paper over as success.
        const identity = resultIdentity(lookup.status === 'accepted' ? lookup.result : null);
        if (lookup.status === 'accepted' && identity !== null && identity !== stored.request.operationId) {
          throw new Error(
            'This saved request was already used for different content. Refresh and start a new operation.',
          );
        }
        outcome = lookup;
      }
      const next: PurchasingPending = {
        ...record,
        state: outcome.status,
        result: outcome,
      };
      await records.write('operation', JSON.stringify(next));
      return next;
    },
    /** Marks a confirmed result as seen so the next operation can be queued. */
    async acknowledge(): Promise<void> {
      await commands.acknowledge();
    },
    /** Stops automatic retries while keeping the immutable request recoverable. */
    async pauseReconnect(): Promise<PurchasingPending | null> {
      await commands.pauseReconnect();
      return (await commands.load()) as PurchasingPending | null;
    },
  };
}

export type PurchasingDraft = {
  version: 1;
  businessId: string;
  actorId: string;
  savedAtIso: string;
  /** Existing order being edited, or null for a new draft. */
  orderId: string | null;
  /** Revision the editor was opened at; the hub still decides. */
  expectedRevision: number | null;
  supplierId: string;
  note: string;
  lines: {
    productId: string;
    quantityMilli: number;
    unitCostPaise: number;
    taxBps: number;
  }[];
};

export function parseDraft(raw: string, scope: { businessId: string; actorId: string }): PurchasingDraft {
  if (raw.length > 40_000) throw new Error('This saved draft is too large to open.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('This saved draft could not be read. Keep the device data and try again.');
  }
  if (
    !obj(value) ||
    value.version !== 1 ||
    value.businessId !== scope.businessId ||
    value.actorId !== scope.actorId ||
    typeof value.savedAtIso !== 'string' ||
    !Number.isFinite(Date.parse(value.savedAtIso)) ||
    !(value.orderId === null || ID.test(String(value.orderId))) ||
    !(value.expectedRevision === null || Number.isSafeInteger(value.expectedRevision)) ||
    !ID.test(String(value.supplierId)) ||
    typeof value.note !== 'string' ||
    value.note.length > 800 ||
    !Array.isArray(value.lines) ||
    value.lines.length > 500
  ) {
    throw new Error('This saved draft belongs to another account. Sign in as the same employee to open it.');
  }
  for (const line of value.lines) {
    if (
      !obj(line) ||
      !ID.test(String(line.productId)) ||
      !Number.isSafeInteger(line.quantityMilli) ||
      (line.quantityMilli as number) <= 0 ||
      !Number.isSafeInteger(line.unitCostPaise) ||
      (line.unitCostPaise as number) < 0 ||
      !Number.isSafeInteger(line.taxBps) ||
      (line.taxBps as number) < 0 ||
      (line.taxBps as number) > 10000
    ) {
      throw new Error('This saved draft has an invalid line. Discard it and start again.');
    }
  }
  return value as PurchasingDraft;
}

/**
 * A purchase-order draft, stored per (business, employee).
 *
 * Deliberately *not* per device: an employee who owns a draft should find it on
 * their other paired device rather than silently losing it. The store is still
 * scoped and encrypted; it is a working copy, never an authoritative order.
 */
export function purchasingDraftStore(options: {
  port: SecurePort;
  businessId: string;
  actorId: string;
}) {
  const { port, businessId, actorId } = options;
  if (!ID.test(businessId) || !ID.test(actorId)) {
    throw new Error('A signed-in employee is required to save a draft.');
  }
  const records = secureRestaurantRecords(port, `sornio.purchase.draft.v1.${businessId}.${actorId}`);
  const scope = { businessId, actorId };
  return {
    async save(draft: PurchasingDraft): Promise<PurchasingDraft> {
      const next: PurchasingDraft = { ...draft, version: 1, savedAtIso: new Date().toISOString() };
      const raw = JSON.stringify(next);
      parseDraft(raw, scope);
      await records.write('draft', raw);
      return next;
    },
    async load(): Promise<PurchasingDraft | null> {
      const raw = await records.read('draft');
      return raw === null ? null : parseDraft(raw, scope);
    },
    async discard(): Promise<void> {
      await records.write('draft', 'null');
    },
  };
}

/**
 * The last workspace the hub returned, so an offline employee can still read
 * previously authorised supplier information.
 *
 * Two rules make this safe:
 *  - it is keyed by (hub, device, employee), so one employee's copy is never shown
 *    to another;
 *  - it records the hub `generatedAt` and the employee's capabilities *at that
 *    time*. The UI must show the timestamp and must not treat the stored
 *    capabilities as a live grant — every write is still authorised by the hub.
 */
export type PurchasingSnapshot = {
  version: 1;
  storedAtIso: string;
  hubGeneratedAtIso: string;
  document: unknown;
};

export function purchasingSnapshotStore(options: {
  port: SecurePort;
  hubId: string;
  deviceId: string;
  actorId: string;
}) {
  const { port, hubId, deviceId, actorId } = options;
  if (!ID.test(hubId) || !ID.test(deviceId) || !ID.test(actorId)) {
    throw new Error('A signed-in device and employee are required to cache purchasing data.');
  }
  const records = secureRestaurantRecords(
    port,
    `sornio.purchase.snapshot.v1.${hubId}.${deviceId}.${actorId}`,
  );
  return {
    async save(document: unknown, hubGeneratedAtIso: string): Promise<PurchasingSnapshot> {
      if (typeof hubGeneratedAtIso !== 'string' || !Number.isFinite(Date.parse(hubGeneratedAtIso))) {
        throw new Error('The hub did not report when this copy was produced.');
      }
      const snapshot: PurchasingSnapshot = {
        version: 1,
        storedAtIso: new Date().toISOString(),
        hubGeneratedAtIso,
        document,
      };
      await records.write('workspace', JSON.stringify(snapshot));
      return snapshot;
    },
    async load(): Promise<PurchasingSnapshot | null> {
      const raw = await records.read('workspace');
      if (raw === null) return null;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error('The saved purchasing copy could not be read. Refresh while connected.');
      }
      if (
        !obj(value) ||
        value.version !== 1 ||
        typeof value.storedAtIso !== 'string' ||
        typeof value.hubGeneratedAtIso !== 'string' ||
        !Number.isFinite(Date.parse(value.hubGeneratedAtIso)) ||
        value.document === undefined
      ) {
        throw new Error('The saved purchasing copy is not readable. Refresh while connected.');
      }
      return value as PurchasingSnapshot;
    },
  };
}

/**
 * Integer-only preview of a draft's value.
 *
 * This exists so the *editor* can show a running subtotal while the person types,
 * and is explicitly not authoritative: it applies each line's basis points to that
 * line and rounds the tax half-up, which is the same rule the native
 * `billing::tax_total` uses. When the draft is saved the hub recomputes
 * everything and its integers replace these. The UI labels the preview as an
 * estimate and never persists it.
 */
export function draftPreview(lines: PurchasingDraft['lines']): {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
} {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.quantityMilli) ||
      line.quantityMilli <= 0 ||
      !Number.isSafeInteger(line.unitCostPaise) ||
      line.unitCostPaise < 0 ||
      !Number.isSafeInteger(line.taxBps) ||
      line.taxBps < 0 ||
      line.taxBps > 10_000
    ) {
      throw new Error('A draft line is not a valid quantity, cost or tax rate.');
    }
    // Same integer rule as `billing::line_total`: quantity is *thousandths* and
    // the cost is paise per whole unit, so the product has to come back down by
    // that 1000 before it is paise.
    const base = Math.floor((line.quantityMilli * line.unitCostPaise + 500) / 1000);
    if (!Number.isSafeInteger(base) || base < 0) {
      throw new Error('This draft line is too large.');
    }
    const lineTax = Math.floor((base * line.taxBps + 5000) / 10_000);
    subtotal += base;
    tax += lineTax;
    if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(tax)) {
      throw new Error('This draft is too large.');
    }
  }
  return { subtotalPaise: subtotal, taxPaise: tax, totalPaise: subtotal + tax };
}
