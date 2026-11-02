import { CompanionError } from './errors';
import {
  type BusinessIdentity,
  type DeviceIdentity,
  type Role,
  isPortalId,
  isRole,
  isStableId,
} from './identity';

export const DATA_MODES = ['demo', 'live'] as const;
export type DataMode = (typeof DATA_MODES)[number];

export type CompanionSession = {
  mode: DataMode;
  userId: string;
  displayName: string;
  role: Role;
  business: BusinessIdentity;
  device: DeviceIdentity;
  accessTokenPresent: boolean;
  expiresAtIso: string | null;
};

export type AuthState =
  | { status: 'signed_out' }
  | { status: 'demo'; session: CompanionSession }
  | { status: 'authenticated'; session: CompanionSession }
  | { status: 'reauth_required'; reason: string }
  | { status: 'revoked'; reason: string };

export function isDataMode(value: unknown): value is DataMode {
  return value === 'demo' || value === 'live';
}

export function assertLiveNeverUsesDemo(session: CompanionSession): void {
  if (session.mode === 'live' && session.business.businessId.startsWith('demo-')) {
    throw new CompanionError('DEMO_FORBIDDEN', 'A live session cannot carry demo business identity.');
  }
}

export function parseIsoTimestamp(value: unknown, label = 'Timestamp'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new CompanionError('INVALID_PAYLOAD', `${label} must be an RFC 3339 UTC timestamp.`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new CompanionError('INVALID_PAYLOAD', `${label} is not a valid instant.`);
  }
  return value;
}

export function sessionFromUnknown(value: unknown): CompanionSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Session payload is not an object.');
  }
  const row = value as Record<string, unknown>;
  if (!isDataMode(row.mode)) throw new CompanionError('INVALID_PAYLOAD', 'Unknown session mode.');
  if (!isStableId(row.userId)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid user id.');
  if (typeof row.displayName !== 'string' || row.displayName.length < 1 || row.displayName.length > 80) {
    throw new CompanionError('INVALID_PAYLOAD', 'Invalid display name.');
  }
  if (!isRole(row.role)) throw new CompanionError('INVALID_PAYLOAD', 'Unknown role.');
  if (!row.business || typeof row.business !== 'object' || Array.isArray(row.business)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Missing business identity.');
  }
  const business = row.business as Record<string, unknown>;
  if (!isStableId(business.businessId)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid business id.');
  if (typeof business.businessName !== 'string' || business.businessName.length < 1 || business.businessName.length > 120) {
    throw new CompanionError('INVALID_PAYLOAD', 'Invalid business name.');
  }
  if (!isPortalId(business.portalId)) throw new CompanionError('INVALID_PAYLOAD', 'Unknown business type.');
  if (!row.device || typeof row.device !== 'object' || Array.isArray(row.device)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Missing device identity.');
  }
  const device = row.device as Record<string, unknown>;
  if (!isStableId(device.deviceId)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid device id.');
  if (typeof device.displayName !== 'string' || device.displayName.length < 1 || device.displayName.length > 80) {
    throw new CompanionError('INVALID_PAYLOAD', 'Invalid device name.');
  }
  if (device.platform !== 'android' && device.platform !== 'ios' && device.platform !== 'unknown') {
    throw new CompanionError('INVALID_PAYLOAD', 'Unknown device platform.');
  }
  if (
    device.enrollmentStatus !== 'unregistered' &&
    device.enrollmentStatus !== 'pending_approval' &&
    device.enrollmentStatus !== 'granted' &&
    device.enrollmentStatus !== 'revoked'
  ) {
    throw new CompanionError('INVALID_PAYLOAD', 'Unknown enrollment status.');
  }
  const session: CompanionSession = {
    mode: row.mode,
    userId: row.userId,
    displayName: row.displayName,
    role: row.role,
    business: {
      businessId: business.businessId,
      businessName: business.businessName,
      portalId: business.portalId,
    },
    device: {
      deviceId: device.deviceId,
      displayName: device.displayName,
      platform: device.platform,
      enrollmentStatus: device.enrollmentStatus,
    },
    accessTokenPresent: row.accessTokenPresent === true,
    expiresAtIso: row.expiresAtIso == null ? null : parseIsoTimestamp(row.expiresAtIso, 'Session expiry'),
  };
  assertLiveNeverUsesDemo(session);
  return session;
}
