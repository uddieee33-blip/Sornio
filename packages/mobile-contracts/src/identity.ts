/** Mobile identity aligns with hosted RBAC. Desktop assistant_manager maps to manager. */

export const PORTAL_IDS = [
  'gym',
  'cafe',
  'kirana',
  'salon',
  'electronics',
  'boutique',
  'service',
  'general',
] as const;
export type PortalId = (typeof PORTAL_IDS)[number];

export const ROLES = ['owner', 'manager', 'cashier', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export const DESKTOP_ROLES = ['owner', 'manager', 'assistant_manager', 'cashier'] as const;
export type DesktopRole = (typeof DESKTOP_ROLES)[number];

export const PERMISSIONS = [
  'business.view',
  'products.view',
  'sales.view',
  'customers.view',
  'reports.view',
  'audit.view',
  'settings.manage',
  'cache.manage',
  'sync.refresh',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [
    'business.view',
    'products.view',
    'sales.view',
    'customers.view',
    'reports.view',
    'audit.view',
    'sync.refresh',
    'cache.manage',
  ],
  cashier: ['business.view', 'products.view', 'sales.view', 'customers.view', 'sync.refresh'],
  auditor: ['business.view', 'products.view', 'sales.view', 'customers.view', 'reports.view', 'audit.view', 'sync.refresh'],
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  auditor: 'Auditor',
};

export function isPortalId(value: unknown): value is PortalId {
  return typeof value === 'string' && (PORTAL_IDS as readonly string[]).includes(value);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function mapDesktopRole(value: unknown): Role | null {
  if (isRole(value)) return value;
  if (value === 'assistant_manager') return 'manager';
  return null;
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_MATRIX[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_MATRIX[role]];
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function isStableId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export type BusinessIdentity = {
  businessId: string;
  businessName: string;
  portalId: PortalId;
};

export type DeviceIdentity = {
  deviceId: string;
  displayName: string;
  platform: 'android' | 'ios' | 'unknown';
  enrollmentStatus: DeviceEnrollmentStatus;
};

export const DEVICE_ENROLLMENT_STATUSES = [
  'unregistered',
  'pending_approval',
  'granted',
  'revoked',
] as const;
export type DeviceEnrollmentStatus = (typeof DEVICE_ENROLLMENT_STATUSES)[number];

export function isDeviceEnrollmentStatus(value: unknown): value is DeviceEnrollmentStatus {
  return typeof value === 'string' && (DEVICE_ENROLLMENT_STATUSES as readonly string[]).includes(value);
}
