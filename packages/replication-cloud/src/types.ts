export const REPLICATION_SCHEMA_VERSION = 1 as const;
export const STREAMS = ['billing', 'customer', 'retail', 'inventory'] as const;
export type StreamName = (typeof STREAMS)[number];

export const PUBLISHER_ROLE = 'publisher' as const;
export type DeviceRole = 'publisher' | 'owner' | 'manager' | 'cashier' | 'auditor';

export type Principal = {
  businessId: string;
  businessName: string;
  portalId: 'gym' | 'cafe' | 'kirana' | 'salon' | 'electronics' | 'boutique' | 'service' | 'general';
  deviceId: string;
  displayName: string;
  role: DeviceRole;
  restoreGeneration: string;
  expiresAtMs: number;
  revoked: boolean;
};

export type NativeOutboxRow = {
  stream: StreamName;
  sequence: number;
  operationId: string;
  payload: unknown;
  /** Native outbox TEXT. Digest this, never a re-serialized object. */
  payloadText?: string;
  occurredAtIso: string;
};

export type Envelope = {
  schemaVersion: typeof REPLICATION_SCHEMA_VERSION;
  businessId: string;
  deviceId: string;
  restoreGeneration: string;
  stream: StreamName;
  streamSequence: string;
  operationId: string;
  eventType: string;
  payload: unknown;
  /** Exact native outbox TEXT when provided. Digest is of this string. */
  payloadText?: string;
  occurredAtIso: string;
  payloadSha256: string;
};

export type IngestAck = {
  operationId: string;
  cursor: string;
  duplicate: boolean;
};

export type ReplicationErrorCode =
  | 'UNAUTHENTICATED'
  | 'REVOKED'
  | 'FORBIDDEN'
  | 'WRONG_BUSINESS'
  | 'STALE_GENERATION'
  | 'SCHEMA'
  | 'INVALID_ENVELOPE'
  | 'CONFLICT'
  | 'GAP'
  | 'DUPLICATE_SEQUENCE'
  | 'EXPIRED';

export class ReplicationError extends Error {
  readonly code: ReplicationErrorCode;
  constructor(code: ReplicationErrorCode, message: string) {
    super(message);
    this.name = 'ReplicationError';
    this.code = code;
  }
}

export type DigestFn = (value: string) => string;
export type ClockFn = () => number;
export type TokenVerifier = (token: string) => Principal;
