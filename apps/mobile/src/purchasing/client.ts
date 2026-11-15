/**
 * The companion's purchasing client (Phase 21B).
 *
 * This is the only module the React Native screens talk to. It owns:
 *  - the authenticated read of `/v1/purchasing/workspace` and its secure offline
 *    copy, so supplier information stays readable without a network;
 *  - the optimistic "can this employee do it" check, which is *advisory only* —
 *    the hub re-authorises every write, and a capability revoked on the desktop
 *    refuses the queued operation;
 *  - draft persistence and the durable operation queues.
 *
 * It deliberately contains no purchasing arithmetic beyond the labelled draft
 * preview: totals, tax and balances are the hub's.
 */
import type { SecurePort } from '../../../../packages/business-domain/src/restaurant-mobile.ts';
import {
  parseOrderDetail,
  parseStatement,
  parseWorkspace,
  type PurchasingOrderDetail,
  type PurchasingWorkspace,
  type SupplierStatement,
} from '../../../../packages/business-domain/src/purchasing-contract.ts';
import {
  purchasingDraftStore,
  purchasingOutbox,
  purchasingSnapshotStore,
  type PurchasingDraft,
  type PurchasingKind,
  type PurchasingPending,
  type PurchasingSubmission,
  type PurchasingWire,
} from '../../../../packages/business-domain/src/purchasing-outbox.ts';

export type PurchasingIdentity = {
  /** The TLS origin the pinned certificate belongs to. */
  origin: string;
  hubId: string;
  businessId: string;
  deviceId: string;
  certificateSha256: string;
};

export type PurchasingSession = {
  actorId: string;
  token: string;
  /** Epoch seconds, exactly as the hub issued it. */
  expires: number;
};

export type PurchasingRead = {
  workspace: PurchasingWorkspace;
  /** True when this document came from encrypted storage, not the network. */
  offline: boolean;
  /** When the hub produced the document the person is looking at. */
  hubGeneratedAtIso: string;
};

export class PurchasingUnavailable extends Error {
  constructor(
    readonly code:
      | 'not_paired'
      | 'session_expired'
      | 'storage_unavailable'
      | 'network'
      | 'refused',
    message: string,
  ) {
    super(message);
  }
}

function envelope(identity: PurchasingIdentity, extra: Record<string, unknown>) {
  return { version: 1, hubId: identity.hubId, businessId: identity.businessId, ...extra };
}

/** A short, collision-resistant operation id the hub accepts. */
export function newOperationId(now = Date.now(), random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 0x100000000)
    .toString(36)
    .padStart(6, '0');
  return `op-${now.toString(36)}-${suffix}`;
}

export type PurchasingClient = ReturnType<typeof purchasingClient>;

/**
 * `secure` must be the fail-closed handle (`createSecureStore(true)`); this
 * factory has no memory fallback, because a queued payment that is not actually
 * persisted is worse than an error.
 */
export function purchasingClient(options: {
  secure: SecurePort;
  identity: PurchasingIdentity;
  session: () => PurchasingSession | null;
  wire: PurchasingWire;
}) {
  const { secure, identity } = options;

  function session(): PurchasingSession {
    const current = options.session();
    if (!current) {
      throw new PurchasingUnavailable('not_paired', 'Sign in to the approved shop hub to continue.');
    }
    if (current.expires * 1000 <= Date.now()) {
      throw new PurchasingUnavailable(
        'session_expired',
        'Your staff session ended. Sign in again — saved requests are kept and will recover.',
      );
    }
    return current;
  }

  const snapshots = purchasingSnapshotStore({
    port: secure,
    hubId: identity.hubId,
    deviceId: identity.deviceId,
    actorId: options.session()?.actorId ?? 'unsigned',
  });

  async function read(auth: PurchasingSession): Promise<PurchasingRead> {
    const reply = await options.wire(
      '/v1/purchasing/workspace',
      envelope(identity, {}),
      auth.token,
    );
    const workspace = parseWorkspace(reply, identity.businessId);
    // Cache *after* validation, so a malformed or foreign document is never
    // written to encrypted storage and later trusted offline.
    await purchasingSnapshotStore({
      port: secure,
      hubId: identity.hubId,
      deviceId: identity.deviceId,
      actorId: auth.actorId,
    }).save(reply, workspace.generatedAt);
    return { workspace, offline: false, hubGeneratedAtIso: workspace.generatedAt };
  }

  return {
    identity,

    /** The authoritative read, or the last authorised copy when offline. */
    async workspace(): Promise<PurchasingRead> {
      const auth = session();
      try {
        return await read(auth);
      } catch (error) {
        const cached = await purchasingSnapshotStore({
          port: secure,
          hubId: identity.hubId,
          deviceId: identity.deviceId,
          actorId: auth.actorId,
        }).load();
        if (!cached) throw error;
        // The copy was produced by this hub for this employee and was validated
        // before it was written; re-validate anyway, because the storage layer is
        // the only thing between it and the renderer.
        const workspace = parseWorkspace(cached.document, identity.businessId);
        if (workspace.actorId !== auth.actorId) {
          throw new PurchasingUnavailable(
            'refused',
            'The saved copy belongs to another employee. Sign in again to read this shop.',
          );
        }
        return { workspace, offline: true, hubGeneratedAtIso: cached.hubGeneratedAtIso };
      }
    },

    async order(orderId: string): Promise<PurchasingOrderDetail> {
      const auth = session();
      return parseOrderDetail(
        await options.wire('/v1/purchasing/order', envelope(identity, { orderId }), auth.token),
      );
    },

    async statement(supplierId: string, after = 0): Promise<SupplierStatement> {
      const auth = session();
      return parseStatement(
        await options.wire(
          '/v1/purchasing/statement',
          envelope(identity, { supplierId, after, through: null }),
          auth.token,
        ),
      );
    },

    /** A durable queue for one operation kind. Fails closed on storage loss. */
    queue(kind: PurchasingKind) {
      return purchasingOutbox({
        port: secure,
        hubId: identity.hubId,
        businessId: identity.businessId,
        deviceId: identity.deviceId,
        actorId: session().actorId,
        kind,
      });
    },

    /**
     * Writes an operation durably, then tries to submit it. Returns the local
     * record in every case; a transport failure leaves it `queued`/`unknown`,
     * never "done".
     */
    async submit(
      kind: PurchasingKind,
      request: Record<string, unknown>,
      operationId?: string,
    ): Promise<{ operationId: string; pending: PurchasingPending }> {
      // One identity, chosen once. The Phase 21A request types carry the
      // operation id inside the payload (the native hub uses it as the row id),
      // so that id *is* the identity — inventing a second one here would journal
      // the operation under an id the write rows never heard of.
      const embedded = typeof request.operationId === 'string' ? request.operationId : null;
      if (operationId !== undefined && embedded !== null && operationId !== embedded) {
        throw new Error(
          'This request carries two different operation identities. Use one id for the whole submission.',
        );
      }
      const resolved = operationId ?? embedded ?? newOperationId();
      const auth = session();
      const outbox = purchasingOutbox({
        port: secure,
        hubId: identity.hubId,
        businessId: identity.businessId,
        deviceId: identity.deviceId,
        actorId: auth.actorId,
        kind,
      });
      // The operation id is authoritative in exactly one place: the envelope the
      // hub receives. Screens pass the id inside their payload too, because the
      // Phase 21A request types carry it; this merge makes that optional rather
      // than a way to accidentally send an empty id.
      await outbox.queue({ ...request, operationId: resolved }, resolved);
      try {
        const pending = await outbox.recover(options.wire, auth.token);
        return { operationId: resolved, pending };
      } catch (error) {
        // An identity conflict is a *decided* answer, not a transport problem: the
        // hub has already used this id for different content, so the queued request
        // can never succeed. Surface it, and drop the unusable local record so the
        // screen is not left showing "awaiting confirmation" forever.
        if ((error as { code?: string }).code === 'operation_identity_conflict') {
          await outbox.acknowledge().catch(() => {});
          throw error;
        }
        // A refusal is stored by the hub and will come back from the lookup; a
        // transport failure is genuinely unknown, and the record already says so.
        // Either way the caller must not claim success.
        const pending = (await outbox.load()) as PurchasingPending | null;
        if (pending) return { operationId: resolved, pending };
        throw error;
      }
    },

    /** Recovers whatever this employee has outstanding for one kind. */
    recover(kind: PurchasingKind): Promise<PurchasingPending> {
      const auth = session();
      return purchasingOutbox({
        port: secure,
        hubId: identity.hubId,
        businessId: identity.businessId,
        deviceId: identity.deviceId,
        actorId: auth.actorId,
        kind,
      }).recover(options.wire, auth.token);
    },

    pending(kind: PurchasingKind): Promise<PurchasingPending | null> {
      return purchasingOutbox({
        port: secure,
        hubId: identity.hubId,
        businessId: identity.businessId,
        deviceId: identity.deviceId,
        actorId: session().actorId,
        kind,
      }).load() as Promise<PurchasingPending | null>;
    },

    async acknowledge(kind: PurchasingKind): Promise<void> {
      await purchasingOutbox({
        port: secure,
        hubId: identity.hubId,
        businessId: identity.businessId,
        deviceId: identity.deviceId,
        actorId: session().actorId,
        kind,
      }).acknowledge();
    },

    drafts() {
      return purchasingDraftStore({
        port: secure,
        businessId: identity.businessId,
        actorId: session().actorId,
      });
    },
  };
}

/** The kinds the mobile flows raise, so the screens do not spell them by hand. */
export const MOBILE_KINDS = {
  supplier: 'purchasing.supplier_saved',
  draftCreated: 'purchasing.purchase_order_created',
  draftUpdated: 'purchasing.purchase_order_updated',
  submitted: 'purchasing.purchase_order_submitted',
  decided: 'purchasing.purchase_order_decided',
  cancelled: 'purchasing.purchase_order_cancelled',
  closed: 'purchasing.purchase_order_closed',
  received: 'purchasing.goods_received',
  paid: 'purchasing.supplier_payment',
  returned: 'purchasing.purchase_return',
} as const satisfies Record<string, PurchasingKind>;

export type MobileKind = (typeof MOBILE_KINDS)[keyof typeof MOBILE_KINDS];

/**
 * A refusal the hub has *already committed*. The UI shows this as a final state,
 * never as "retrying", and offers the current revision so the person can choose.
 */
export function operationStateCopy(pending: PurchasingPending | null): {
  label: string;
  detail: string;
  final: boolean;
} {
  if (!pending) {
    return { label: 'Nothing queued', detail: 'No purchasing operation is waiting on this device.', final: true };
  }
  switch (pending.state) {
    case 'queued':
      return {
        label: 'Saved on this device',
        detail: 'Not sent to the shop yet. This is not a completed operation.',
        final: false,
      };
    case 'unknown':
      return {
        label: 'Awaiting confirmation',
        detail:
          pending.resumeAfterReconnect === false
            ? 'Automatic retries are paused. Recover this same request before editing.'
            : 'The outcome is unknown. Sornio will look this same request up when the shop is reachable.',
        final: false,
      };
    case 'accepted':
      return {
        label: 'Committed by the shop',
        detail: 'The hub confirmed this operation. Its result is authoritative.',
        final: true,
      };
    case 'refused':
    default:
      return {
        label: 'Refused by the shop',
        detail: 'The hub recorded a decision and will keep returning it. Nothing was changed.',
        final: true,
      };
  }
}

/** Convenience for a screen that only needs the wire payload shape. */
export function submissionBody(
  identity: PurchasingIdentity,
  submission: PurchasingSubmission,
): Record<string, unknown> {
  return envelope(identity, {
    operationId: submission.operationId,
    kind: submission.kind,
    request: submission.request,
  });
}
