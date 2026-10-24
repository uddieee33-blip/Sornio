import { can, type Permission, type Role } from '@/lib/security/rbac';

// These are action affordances, not route authorization. Read-only workspace
// links remain available; the store/API still enforce every write permission.
const TASK_PERMISSIONS: Record<string, Permission> = {
  '/billing/new': 'sales.create',
  '/payments': 'sales.create',
  '/products': 'products.manage',
  '/inventory': 'products.view',
  '/customers': 'customers.view',
  '/expenses': 'expenses.manage',
  '/check-ins': 'attendance.manage',
  '/memberships': 'memberships.manage',
  '/reminders': 'memberships.manage',
  '/appointments': 'appointments.manage',
};

const SETUP_PERMISSIONS: Record<string, Permission> = {
  products: 'products.manage',
  invoices: 'sales.create',
  plans: 'memberships.manage',
  members: 'memberships.manage',
  appointments: 'appointments.manage',
};

export function canUseDailyTask(role: Role | null | undefined, href: string): boolean {
  const permission = TASK_PERMISSIONS[href];
  return Boolean(permission && can(role, permission));
}

export function canUseDailySetup(role: Role | null | undefined, collection: string): boolean {
  const permission = SETUP_PERMISSIONS[collection];
  return Boolean(permission && can(role, permission));
}
