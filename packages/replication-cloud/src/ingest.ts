import { requirePublisher } from './auth';
import { parseEnvelope } from './envelope';
import { projectEvent } from './project';
import { CloudStore } from './store';
import {
  ReplicationError,
  type DigestFn,
  type Envelope,
  type IngestAck,
  type Principal,
} from './types';

export function ingestEnvelope(
  store: CloudStore,
  principal: Principal,
  raw: unknown,
  digest: DigestFn,
  nowMs: number,
): IngestAck {
  const publisher = requirePublisher(store, principal, nowMs);
  const envelope = parseEnvelope(raw, digest);
  if (envelope.businessId !== publisher.businessId || envelope.deviceId !== publisher.deviceId) {
    throw new ReplicationError('WRONG_BUSINESS', 'Envelope identity does not match the enrolled publisher.');
  }
  if (envelope.restoreGeneration !== publisher.restoreGeneration) {
    throw new ReplicationError('STALE_GENERATION', 'Restore generation does not match the enrolled publisher.');
  }
  const sequence = BigInt(envelope.streamSequence);
  const headKey = store.headKey(publisher.businessId, publisher.restoreGeneration, envelope.stream);
  const last = store.streamHead.get(headKey) ?? 0n;
  // Operation identity is (business, stream, operation) and generation-independent:
  // a restore generation is a transport epoch, not part of business identity.
  // Dedup is therefore cross-generation, so republishing a snapshot's rows after
  // a restore can never re-project them (which would double-count credit deltas).
  // The stream belongs in the key because one native commit legitimately emits
  // the same operationId on several streams (a desktop retail sale is both a
  // `retail` and a `billing` envelope); omitting it rejected the second envelope
  // of every such sale as a CONFLICT.
  const duplicate = store.byOperation.get(
    store.operationKey(publisher.businessId, envelope.stream, envelope.operationId),
  );
  if (duplicate) {
    if (duplicate.payloadSha256 !== envelope.payloadSha256) {
      throw new ReplicationError('CONFLICT', 'Operation identity was reused with a different payload.');
    }
    // A restore resets the publisher's sidecar, so the new generation replays
    // its outbox from sequence 1. Those replays are duplicates, but they must
    // still advance THIS generation's stream head, otherwise the first new
    // operation after the restore would be rejected as a gap and could never be
    // published. A plain retry of an already-seen sequence leaves the head alone.
    if (sequence === last + 1n) {
      const draft = store.clone();
      draft.streamHead.set(headKey, sequence);
      store.adopt(draft);
    }
    return { operationId: envelope.operationId, cursor: duplicate.cursor, duplicate: true };
  }
  if (sequence !== last + 1n) {
    if (sequence <= last) throw new ReplicationError('DUPLICATE_SEQUENCE', 'Stream sequence already committed.');
    throw new ReplicationError('GAP', 'Stream sequence skipped a gap.');
  }
  const draft = store.clone();
  try {
    const cursor = draft.nextCursor(publisher.businessId);
    const stored: Envelope & { cursor: string } = { ...envelope, cursor };
    projectEvent(draft, envelope);
    draft.events.push(stored);
    draft.byOperation.set(
      draft.operationKey(publisher.businessId, envelope.stream, envelope.operationId),
      stored,
    );
    draft.streamHead.set(headKey, sequence);
    store.adopt(draft);
    return { operationId: envelope.operationId, cursor, duplicate: false };
  } catch (error) {
    throw error;
  }
}
