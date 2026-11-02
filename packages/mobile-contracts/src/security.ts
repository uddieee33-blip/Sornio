import { CompanionError } from './errors';
import type { SecureStorePort } from './adapters';
import type { CompanionSession } from './session';

export const SECURE_KEYS = {
  session: 'sornio.companion.session',
  deviceId: 'sornio.companion.deviceId',
  accessToken: 'sornio.companion.accessToken',
} as const;

export const THREATS = [
  'stolen_phone',
  'lost_device',
  'compromised_token',
  'revoked_staff',
  'former_owner_cache',
  'cross_business_exposure',
  'tampered_snapshot',
  'malicious_network',
  'replay',
  'duplicate_event',
  'restore_generation',
  'stale_operation',
  'inconsistent_projection',
  'offline_cache_exposure',
  'customer_data_logging',
  'unauthorized_business_switch',
] as const;
export type ThreatId = (typeof THREATS)[number];

export type ThreatControl = {
  id: ThreatId;
  phase1: 'implemented' | 'documented';
  summary: string;
};

export const THREAT_CONTROLS: ThreatControl[] = [
  { id: 'stolen_phone', phase1: 'implemented', summary: 'Session tokens live only in the secure-store port; logout wipes them. OS lock is recommended, not claimed as gym biometrics.' },
  { id: 'lost_device', phase1: 'documented', summary: 'Owner revocation is a server control. Phase 1 has the contract and treats revoked as a terminal state.' },
  { id: 'compromised_token', phase1: 'documented', summary: 'Short-lived credentials are required by the contract. Phase 1 does not issue live tokens.' },
  { id: 'revoked_staff', phase1: 'implemented', summary: 'Role is never trusted from the client for authorization of writes; Phase 1 has no financial writes.' },
  { id: 'former_owner_cache', phase1: 'implemented', summary: 'Sign-out clears the memory snapshot and secure session keys.' },
  { id: 'cross_business_exposure', phase1: 'implemented', summary: 'Snapshots are rejected when businessId does not match the session.' },
  { id: 'tampered_snapshot', phase1: 'implemented', summary: 'Runtime validation rejects unknown fields of money, mismatched splits and unsafe numbers.' },
  { id: 'malicious_network', phase1: 'documented', summary: 'TLS is required. Production adapter is disabled so no host is contacted in Phase 1.' },
  { id: 'replay', phase1: 'implemented', summary: 'Monotonic cursor rejects older snapshots.' },
  { id: 'duplicate_event', phase1: 'implemented', summary: 'Equal cursor is treated as an idempotent duplicate.' },
  { id: 'restore_generation', phase1: 'implemented', summary: 'Generation mismatch refuses to overwrite the cache.' },
  { id: 'stale_operation', phase1: 'implemented', summary: 'Mobile cannot submit financial operations in Phase 1.' },
  { id: 'inconsistent_projection', phase1: 'implemented', summary: 'Cash + credit must equal invoice totals at the boundary.' },
  { id: 'offline_cache_exposure', phase1: 'implemented', summary: 'Phase 1 does not persist business records. Memory cache only. Not claimed as encrypted offline storage.' },
  { id: 'customer_data_logging', phase1: 'implemented', summary: 'Redact helper strips names, phones and tokens before any diagnostic string.' },
  { id: 'unauthorized_business_switch', phase1: 'implemented', summary: 'Selecting another business without a new grant is rejected.' },
];

const SECRET_KEYS = ['accessToken', 'refreshToken', 'password', 'secret', 'authorization'];

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEYS.includes(key) || /phone|token|password|secret/i.test(key) ? '[redacted]' : redact(item);
  }
  return output;
}

export function diagnosticMessage(error: unknown): string {
  if (error instanceof CompanionError) return `${error.code}: ${error.message}`;
  return 'An unexpected companion error occurred.';
}

export async function wipeSecureSession(store: SecureStorePort): Promise<void> {
  await store.delete(SECURE_KEYS.session);
  await store.delete(SECURE_KEYS.accessToken);
}

export async function persistSessionRecord(store: SecureStorePort, session: CompanionSession): Promise<void> {
  if (session.mode === 'live' && session.accessTokenPresent === false) {
    throw new CompanionError('UNAUTHENTICATED', 'A live session cannot be stored without an access grant.');
  }
  const record = {
    ...session,
    accessTokenPresent: session.accessTokenPresent,
  };
  await store.set(SECURE_KEYS.session, JSON.stringify(record));
}

export class MemorySecureStore implements SecureStorePort {
  private readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}
