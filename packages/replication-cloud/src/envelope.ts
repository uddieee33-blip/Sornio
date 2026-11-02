import {
  REPLICATION_SCHEMA_VERSION,
  ReplicationError,
  STREAMS,
  type DigestFn,
  type Envelope,
  type NativeOutboxRow,
  type Principal,
  type StreamName,
} from './types';

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const SEQ = /^[1-9]\d{0,18}$/;
const SHA = /^[a-f0-9]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalPayload(payload: unknown): string {
  return JSON.stringify(payload);
}

export function eventTypeOf(payload: unknown): string {
  if (!record(payload)) return 'unknown';
  if (typeof payload.kind === 'string') return payload.kind;
  if (record(payload.receipt) && typeof payload.receipt.kind === 'string') {
    return `retail.${payload.receipt.kind}`;
  }
  return 'unknown';
}

export function buildEnvelope(
  principal: Principal,
  row: NativeOutboxRow,
  digest: DigestFn,
): Envelope {
  if (!STREAMS.includes(row.stream)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Unknown native outbox stream.');
  }
  if (!Number.isInteger(row.sequence) || row.sequence < 1) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Stream sequence must be a positive integer.');
  }
  if (!ID.test(row.operationId)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Operation identity is invalid.');
  }
  const payloadText = canonicalPayload(row.payload);
  return {
    schemaVersion: REPLICATION_SCHEMA_VERSION,
    businessId: principal.businessId,
    deviceId: principal.deviceId,
    restoreGeneration: principal.restoreGeneration,
    stream: row.stream,
    streamSequence: String(row.sequence),
    operationId: row.operationId,
    eventType: eventTypeOf(row.payload),
    payload: row.payload,
    occurredAtIso: row.occurredAtIso,
    payloadSha256: digest(payloadText),
  };
}

export function parseEnvelope(value: unknown, digest: DigestFn): Envelope {
  if (!record(value)) throw new ReplicationError('INVALID_ENVELOPE', 'Envelope is missing.');
  if (value.schemaVersion !== REPLICATION_SCHEMA_VERSION) {
    throw new ReplicationError('SCHEMA', 'Unsupported replication schema version.');
  }
  const stream = value.stream;
  if (typeof stream !== 'string' || !(STREAMS as readonly string[]).includes(stream)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Unknown stream identity.');
  }
  if (typeof value.streamSequence !== 'string' || !SEQ.test(value.streamSequence)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Stream sequence must be a positive integer string.');
  }
  if (typeof value.operationId !== 'string' || !ID.test(value.operationId)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Operation identity is invalid.');
  }
  if (typeof value.eventType !== 'string' || value.eventType.length < 1 || value.eventType.length > 80) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Event type is invalid.');
  }
  if (typeof value.occurredAtIso !== 'string' || !TIME.test(value.occurredAtIso)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Event timestamp is invalid.');
  }
  if (typeof value.payloadSha256 !== 'string' || !SHA.test(value.payloadSha256)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Payload digest is invalid.');
  }
  const expected = digest(canonicalPayload(value.payload));
  if (expected !== value.payloadSha256) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Payload digest does not match the payload.');
  }
  if (typeof value.businessId !== 'string' || typeof value.deviceId !== 'string' || typeof value.restoreGeneration !== 'string') {
    throw new ReplicationError('INVALID_ENVELOPE', 'Envelope identity fields are missing.');
  }
  return {
    schemaVersion: REPLICATION_SCHEMA_VERSION,
    businessId: value.businessId,
    deviceId: value.deviceId,
    restoreGeneration: value.restoreGeneration,
    stream: stream as StreamName,
    streamSequence: value.streamSequence,
    operationId: value.operationId,
    eventType: value.eventType,
    payload: value.payload,
    occurredAtIso: value.occurredAtIso,
    payloadSha256: value.payloadSha256,
  };
}
