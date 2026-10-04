/**
 * Tenant isolation.
 *
 * DukaanOS is multi-tenant: many businesses share one deployment. The rule
 * that keeps them apart is simple and total — **every persisted record carries
 * a `tenantId`, and no record is ever read, aggregated, or written without a
 * scope check**. This module is the enforcement point.
 *
 * `assertTenant` is called at every boundary (imports, sync, exports, merges),
 * and `scopeState` is what a synced payload passes through before it reaches a
 * database or another device.
 */

import type { Role } from './rbac';
import { dominantRole, PermissionError, can, type Permission } from './rbac';

export type TenantScope = {
  tenantId: string;
  userId: string;
  role: Role;
};

export type TenantRecord = {
  /** Owning business. Absent only for legacy records, which are adopted on read. */
  tenantId?: string;
};

export class TenantViolationError extends Error {
  constructor(message = 'This record belongs to a different business.') {
    super(message);
    this.name = 'TenantViolationError';
  }
}

export function isValidTenantId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{6,80}$/.test(value);
}

/** Hard gate: reads and writes both pass through here. */
export function assertTenant(record: TenantRecord | null | undefined, scope: TenantScope): void {
  if (!record) return;
  if (record.tenantId === undefined) return; // legacy record, adopted on write
  if (record.tenantId !== scope.tenantId) {
    throw new TenantViolationError();
  }
}

/** Gate + permission in one call — the shape used by store actions. */
export function guard(scope: TenantScope, permission: Permission, record?: TenantRecord | null): void {
  if (!can(scope.role, permission)) throw new PermissionError(permission);
  assertTenant(record, scope);
}

/** Attach the current tenant to new records. */
export function stampTenant<T extends object>(record: T, scope: TenantScope): T & { tenantId: string } {
  return { ...record, tenantId: scope.tenantId };
}

/** Filter a mixed collection down to one tenant (used on import / sync pull). */
export function filterByTenant<T extends TenantRecord>(records: T[], scope: TenantScope): T[] {
  return records.filter((record) => record.tenantId === undefined || record.tenantId === scope.tenantId);
}

/** Adopt legacy (unscoped) records into the current tenant, once. */
export function adoptTenant<T extends TenantRecord>(records: T[], scope: TenantScope): (T & { tenantId: string })[] {
  return records.map((record) => (record.tenantId ? (record as T & { tenantId: string }) : { ...record, tenantId: scope.tenantId }));
}

/** A tenant-scoped store snapshot, tagged with who produced it. */
export type ScopedPayload<T> = {
  tenantId: string;
  producedBy: string;
  role: Role;
  producedAt: string;
  payload: T;
};

export function scopePayload<T>(payload: T, scope: TenantScope): ScopedPayload<T> {
  return {
    tenantId: scope.tenantId,
    producedBy: scope.userId,
    role: scope.role,
    producedAt: new Date().toISOString(),
    payload,
  };
}

/** Reject a payload that was produced for someone else before we trust it. */
export function verifyScopedPayload<T>(scoped: ScopedPayload<T>, scope: TenantScope): T {
  if (!isValidTenantId(scoped.tenantId) || scoped.tenantId !== scope.tenantId) {
    throw new TenantViolationError('Synced payload was produced for a different business.');
  }
  if (dominantRole([scope.role]) !== scope.role) {
    throw new TenantViolationError('Session role is not recognised.');
  }
  return scoped.payload;
}

/** Per-tenant storage key so two businesses on one device never collide. */
export function tenantStorageKey(base: string, tenantId: string): string {
  const safe = tenantId.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 60);
  return `${base}.${safe}`;
}
