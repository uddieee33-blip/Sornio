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
  const duplicate = store.byOperation.get(`${publisher.businessId}|${envelope.operationId}`);
  if (duplicate) {
    if (duplicate.payloadSha256 !== envelope.payloadSha256) {
      throw new ReplicationError('CONFLICT', 'Operation identity was reused with a different payload.');
    }
    return { operationId: envelope.operationId, cursor: duplicate.cursor, duplicate: true };
  }
  const sequence = BigInt(envelope.streamSequence);
  const headKey = store.headKey(publisher.businessId, publisher.restoreGeneration, envelope.stream);
  const last = store.streamHead.get(headKey) ?? 0n;
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
    draft.byOperation.set(`${publisher.businessId}|${envelope.operationId}`, stored);
    draft.streamHead.set(headKey, sequence);
    store.adopt(draft);
    return { operationId: envelope.operationId, cursor, duplicate: false };
  } catch (error) {
    throw error;
  }
}
