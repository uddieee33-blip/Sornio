/**
 * Team role vocabulary — the single source of truth between the database and
 * the app.
 *
 * Two vocabularies describe the same seat at the counter, and they differ on
 * purpose:
 *
 *   • **Membership roles** are what `supabase/schema.sql` allows in
 *     `business_members.role` — its CHECK constraint is a database contract,
 *     and widening it is a migration, not an edit.
 *   • **App roles** are the four the permission matrix in
 *     `lib/security/rbac.ts` enforces across the console.
 *
 * The mapping is deliberate: the database remembers finer shades
 * (`accountant`, `viewer`) than the matrix needs, and every unrecognised value
 * collapses to the *least* powerful role rather than the nearest neighbour —
 * never the other way round.
 *
 * `lib/auth/identity.ts` maps membership → app when it resolves who signed in;
 * `app/api/team` maps app → membership when the owner writes a seat. Both read
 * this module so the two directions can never disagree.
 */

import type { Role } from '@/lib/security/rbac';

/** membership `role` (schema CHECK) → console `Role` (RBAC matrix). */
export const MEMBERSHIP_TO_APP_ROLE: Record<string, Role> = {
  owner: 'owner',
  manager: 'manager',
  accountant: 'auditor',
  auditor: 'auditor',
  staff: 'cashier',
  cashier: 'cashier',
  viewer: 'auditor',
};

/** console `Role` → the membership role the schema accepts for it. */
export const APP_TO_MEMBERSHIP_ROLE: Record<Role, 'owner' | 'manager' | 'staff' | 'viewer'> = {
  owner: 'owner',
  manager: 'manager',
  cashier: 'staff',
  auditor: 'viewer',
};

/**
 * The roles an owner may hand out with an invite. `owner` is never invitable:
 * a second owner is an ownership transfer, which deserves its own deliberate
 * flow — not a code typed at the counter.
 */
export const INVITABLE_ROLES: readonly Role[] = ['manager', 'cashier', 'auditor'];

/** Any membership string → app role, downgrading anything unrecognised. */
export function appRoleForMembership(value: unknown): Role {
  const mapped = typeof value === 'string' ? MEMBERSHIP_TO_APP_ROLE[value.trim().toLowerCase()] : undefined;
  return mapped ?? 'auditor';
}

/** App role → membership string. */
export function membershipRoleForApp(role: Role): 'owner' | 'manager' | 'staff' | 'viewer' {
  return APP_TO_MEMBERSHIP_ROLE[role];
}

/** Is this a role an owner may grant through the team API? */
export function isInvitableRole(value: unknown): value is Role {
  return typeof value === 'string' && (INVITABLE_ROLES as readonly string[]).includes(value);
}
