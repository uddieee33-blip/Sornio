import { CompanionError } from './errors';
import { isStableId } from './identity';

/** Hybrid Sync V1 schema. Demo snapshots stay on 1. */
export const MOBILE_SYNC_SCHEMA_VERSION = 1 as const;
/** Live desktop-outbox snapshots may use 2 to carry digital (UPI/card) paise. */
export const MOBILE_SYNC_SCHEMA_VERSION_V2 = 2 as const;
export const MOBILE_SYNC_SCHEMA_VERSIONS = [1, 2] as const;
export type MobileSyncSchemaVersion = (typeof MOBILE_SYNC_SCHEMA_VERSIONS)[number];

export function isMobileSyncSchemaVersion(value: unknown): value is MobileSyncSchemaVersion {
  return value === 1 || value === 2;
}

export const SYNC_PHASES = [
  'never_synced',
  'syncing',
  'synced',
  'pending',
  'interrupted',
  'stale',
  'reauth_required',
  'revoked',
] as const;
export type SyncPhase = (typeof SYNC_PHASES)[number];

export type Connectivity = 'online' | 'offline' | 'unknown';

export type SyncCursor = string & { readonly __brand: 'syncCursor' };
export type RestoreGeneration = string & { readonly __brand: 'restoreGeneration' };

const CURSOR_PATTERN = /^(0|[1-9]\d{0,38})$/;
const GENERATION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type SyncStatus = {
  connectivity: Connectivity;
  phase: SyncPhase;
  schemaVersion: MobileSyncSchemaVersion;
  cursor: SyncCursor | null;
  restoreGeneration: RestoreGeneration | null;
  lastSuccessIso: string | null;
  lastAttemptIso: string | null;
  message: string;
  /** Cached financial figures must never be labelled live. */
  freshnessLabel: 'DEMO' | 'Synced' | 'Cached' | 'Out of date' | 'Unavailable';
};

export function parseSyncCursor(value: unknown): SyncCursor {
  if (typeof value !== 'string' || !CURSOR_PATTERN.test(value)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Sync cursor must be a non-negative integer string.');
  }
  return value as SyncCursor;
}

export function parseRestoreGeneration(value: unknown): RestoreGeneration {
  if (typeof value !== 'string' || !GENERATION_PATTERN.test(value)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Restore generation is missing or invalid.');
  }
  return value as RestoreGeneration;
}

export function compareCursor(a: SyncCursor, b: SyncCursor): -1 | 0 | 1 {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export type SyncEnvelope = {
  schemaVersion: MobileSyncSchemaVersion;
  businessId: string;
  restoreGeneration: RestoreGeneration;
  cursor: SyncCursor;
  serverTimeIso: string;
  source: 'desktop-outbox' | 'demo';
  deviceId: string | null;
  revoked: boolean;
};

export type AppliedSnapshotDecision =
  | { ok: true; kind: 'applied' }
  | { ok: true; kind: 'duplicate' }
  | { ok: false; error: CompanionError };

export function decideSnapshotApply(current: SyncEnvelope | null, incoming: SyncEnvelope): AppliedSnapshotDecision {
  if (!isMobileSyncSchemaVersion(incoming.schemaVersion)) {
    return {
      ok: false,
      error: new CompanionError('INVALID_PAYLOAD', 'Unsupported companion schema version.'),
    };
  }
  if (incoming.revoked) {
    return { ok: false, error: new CompanionError('ACCESS_REVOKED', 'This device is no longer authorised.') };
  }
  if (!isStableId(incoming.businessId)) {
    return { ok: false, error: new CompanionError('INVALID_PAYLOAD', 'Invalid business id on the snapshot.') };
  }
  if (!current) return { ok: true, kind: 'applied' };
  if (current.businessId !== incoming.businessId) {
    return {
      ok: false,
      error: new CompanionError('BUSINESS_MISMATCH', 'The snapshot belongs to a different business.'),
    };
  }
  if (current.restoreGeneration !== incoming.restoreGeneration) {
    return {
      ok: false,
      error: new CompanionError(
        'GENERATION_MISMATCH',
        'The desktop workspace was restored. Discard this cache and recover from a new snapshot.',
      ),
    };
  }
  const order = compareCursor(incoming.cursor, current.cursor);
  if (order === 0) return { ok: true, kind: 'duplicate' };
  if (order < 0) {
    return {
      ok: false,
      error: new CompanionError('OUT_OF_ORDER_SYNC', 'An older snapshot cannot replace a newer one.'),
    };
  }
  return { ok: true, kind: 'applied' };
}

export function freshnessFor(phase: SyncPhase, mode: 'demo' | 'live'): SyncStatus['freshnessLabel'] {
  if (mode === 'demo') return 'DEMO';
  switch (phase) {
    case 'synced':
      return 'Synced';
    case 'stale':
    case 'interrupted':
    case 'pending':
      return 'Out of date';
    case 'never_synced':
    case 'reauth_required':
    case 'revoked':
      return 'Unavailable';
    case 'syncing':
      return 'Cached';
  }
}

export function describeSync(status: SyncStatus): string {
  if (status.freshnessLabel === 'DEMO') return 'Demonstration figures. Not a live business record.';
  if (status.connectivity === 'offline') {
    return status.lastSuccessIso
      ? `Offline. Last synced ${status.lastSuccessIso}. These figures may be out of date.`
      : 'Offline. No synchronized copy is available on this device.';
  }
  switch (status.phase) {
    case 'synced':
      return status.lastSuccessIso ? `Last synced ${status.lastSuccessIso}.` : 'Synchronized.';
    case 'syncing':
      return 'Refreshing a server-authorized copy.';
    case 'pending':
      return 'A refresh is waiting for a connection.';
    case 'interrupted':
      return 'Refresh interrupted. Cached figures may be out of date.';
    case 'stale':
      return 'These figures may be out of date.';
    case 'reauth_required':
      return 'Sign in again to refresh business records.';
    case 'revoked':
      return 'This device can no longer read this business.';
    case 'never_synced':
      return 'No synchronized copy has been downloaded.';
  }
}

export function initialSyncStatus(mode: 'demo' | 'live'): SyncStatus {
  const phase: SyncPhase = mode === 'demo' ? 'synced' : 'never_synced';
  return {
    connectivity: mode === 'demo' ? 'online' : 'unknown',
    phase,
    schemaVersion: MOBILE_SYNC_SCHEMA_VERSION,
    cursor: mode === 'demo' ? ('0' as SyncCursor) : null,
    restoreGeneration: mode === 'demo' ? ('demo-generation' as RestoreGeneration) : null,
    lastSuccessIso: null,
    lastAttemptIso: null,
    message: mode === 'demo' ? 'Demonstration figures. Not a live business record.' : 'No synchronized copy has been downloaded.',
    freshnessLabel: freshnessFor(phase, mode),
  };
}
