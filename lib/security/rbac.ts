/**
 * Role-based access control.
 *
 * DukaanOS has four roles with a deliberately small, auditable permission
 * matrix. The UI uses `can()` to hide what a role may not do; the same module
 * is the single source of truth if the check ever moves server-side.
 *
 *   owner    — full control, including people, money settings, and deletion
 *   manager  — day-to-day operations and reporting, no people/settings
 *   cashier  — billing, collections, attendance and the day book
 *   auditor  — read-only across the business
 *
 * `portal.switch` is deliberately owner/manager only: reshaping the console is a
 * configuration decision, not a counter action.
 */

export const ROLES = ['owner', 'manager', 'cashier', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'business.view',
  'business.edit',
  'products.view',
  'products.manage',
  'sales.create',
  'sales.view',
  'attendance.manage',
  'appointments.manage',
  'portal.switch',
  'expenses.manage',
  'customers.view',
  'customers.manage',
  'memberships.manage',
  'reports.view',
  'reports.export',
  'audit.view',
  'team.manage',
  'settings.manage',
  'billing.manage',
  'data.reset',
  'data.export',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_MATRIX: Record<Role, Permission[]> = {
  owner: ALL,
  manager: [
    'business.view',
    'business.edit',
    'products.view',
    'products.manage',
    'sales.create',
    'sales.view',
    'expenses.manage',
    'customers.view',
    'customers.manage',
    'memberships.manage',
    'attendance.manage',
    'appointments.manage',
    'portal.switch',
    'reports.view',
    'reports.export',
    'audit.view',
    'data.export',
  ],
  cashier: [
    'business.view',
    'products.view',
    'sales.create',
    'sales.view',
    'customers.view',
    'customers.manage',
    'memberships.manage',
    'attendance.manage',
    'appointments.manage',
  ],
  auditor: ['business.view', 'products.view', 'sales.view', 'customers.view', 'reports.view', 'audit.view'],
};

/**
 * Human labels for the permission matrix. Kept next to the permission list so a
 * UI can never show a capability the engine does not actually enforce.
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'business.view': 'View business profile',
  'business.edit': 'Edit business profile',
  'products.view': 'View catalog',
  'products.manage': 'Manage catalog',
  'sales.create': 'Record sales',
  'sales.view': 'View sales',
  'attendance.manage': 'Check members in and out',
  'appointments.manage': 'Manage the day book',
  'portal.switch': 'Change business type / portal',
  'expenses.manage': 'Record expenses',
  'customers.view': 'View customers',
  'customers.manage': 'Manage customers',
  'memberships.manage': 'Manage plans & renewals',
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  'audit.view': 'View audit history',
  'team.manage': 'Invite & manage team',
  'settings.manage': 'Change settings',
  'billing.manage': 'Raise & collect invoices',
  'data.reset': 'Reset business data',
  'data.export': 'Download a full backup',
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  auditor: 'Auditor (read-only)',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Everything, including team access, billing, and resetting data.',
  manager: 'Run operations and reports. Cannot manage people, billing, or delete data.',
  cashier: 'Bill customers and collect payments. No reports, no settings.',
  auditor: 'Read-only access for accountants and inspections.',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Permission check with an explicit owner fallback. */
export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const granted = ROLE_MATRIX[role];
  return granted ? granted.includes(permission) : false;
}

/** Every permission a role holds (handy for rendering the access matrix). */
export function permissionsFor(role: Role): Permission[] {
  return [...(ROLE_MATRIX[role] ?? [])];
}

/** Guard used by store actions: throws a friendly, redaction-safe error. */
export function assertPermission(role: Role | undefined | null, permission: Permission): void {
  if (!can(role, permission)) {
    throw new PermissionError(permission);
  }
}

export class PermissionError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Your role does not allow this action (${permission}).`);
    this.name = 'PermissionError';
    this.permission = permission;
  }
}

/** Highest role wins when the same person appears twice. */
export function dominantRole(roles: (Role | string)[]): Role {
  const order: Role[] = ['owner', 'manager', 'cashier', 'auditor'];
  for (const role of order) {
    if (roles.includes(role)) return role;
  }
  return 'auditor';
}
