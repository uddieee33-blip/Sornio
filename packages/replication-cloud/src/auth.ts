import { ReplicationError, type DeviceRole, type Principal, type TokenVerifier } from './types';
import type { CloudStore } from './store';

const ID = /^[A-Za-z0-9_-]{8,80}$/;
const GENERATION = /^[A-Za-z0-9_-]{1,128}$/;

export function assertPrincipal(principal: Principal, nowMs: number): Principal {
  if (!ID.test(principal.businessId) || !ID.test(principal.deviceId)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Device or business identity is invalid.');
  }
  if (!GENERATION.test(principal.restoreGeneration)) {
    throw new ReplicationError('INVALID_ENVELOPE', 'Restore generation is invalid.');
  }
  if (principal.revoked) throw new ReplicationError('REVOKED', 'This device has been revoked.');
  if (principal.expiresAtMs <= nowMs) throw new ReplicationError('EXPIRED', 'Device credential has expired.');
  return principal;
}

export function resolveEnrolled(store: CloudStore, presented: Principal, nowMs: number): Principal {
  const token = assertPrincipal(presented, nowMs);
  const enrolled = store.devices.get(token.deviceId);
  if (!enrolled) throw new ReplicationError('UNAUTHENTICATED', 'This device is not enrolled.');
  if (enrolled.revoked) throw new ReplicationError('REVOKED', 'This device has been revoked.');
  if (enrolled.businessId !== token.businessId) {
    throw new ReplicationError('WRONG_BUSINESS', 'Device is not enrolled for this business.');
  }
  if (enrolled.role !== token.role) {
    throw new ReplicationError('FORBIDDEN', 'Credential role does not match enrollment.');
  }
  if (enrolled.restoreGeneration !== token.restoreGeneration) {
    throw new ReplicationError('STALE_GENERATION', 'Restore generation does not match the enrolled device.');
  }
  return {
    ...enrolled,
    expiresAtMs: token.expiresAtMs,
    displayName: token.displayName || enrolled.displayName,
  };
}

export function requirePublisherRole(principal: Principal, nowMs: number): Principal {
  const ok = assertPrincipal(principal, nowMs);
  if (ok.role !== 'publisher') {
    throw new ReplicationError('FORBIDDEN', 'Only a desktop publisher may ingest financial events.');
  }
  return ok;
}

export function requirePublisher(store: CloudStore, principal: Principal, nowMs: number): Principal {
  const ok = resolveEnrolled(store, principal, nowMs);
  if (ok.role !== 'publisher') {
    throw new ReplicationError('FORBIDDEN', 'Only a desktop publisher may ingest financial events.');
  }
  return ok;
}

export function requireReader(store: CloudStore, principal: Principal, nowMs: number): Principal {
  const ok = resolveEnrolled(store, principal, nowMs);
  if (ok.role === 'publisher') {
    throw new ReplicationError('FORBIDDEN', 'Publisher credentials cannot read companion snapshots.');
  }
  return ok;
}

export function verifyToken(verifier: TokenVerifier, token: string, nowMs: number): Principal {
  if (!token || token.length > 4096) throw new ReplicationError('UNAUTHENTICATED', 'Missing credential.');
  try {
    return assertPrincipal(verifier(token), nowMs);
  } catch (error) {
    if (error instanceof ReplicationError) throw error;
    throw new ReplicationError('UNAUTHENTICATED', 'Credential could not be verified.');
  }
}

export function canSeeCustomers(role: DeviceRole): boolean {
  return role === 'owner' || role === 'manager' || role === 'auditor';
}
