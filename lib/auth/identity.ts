/**
 * Who is at this console.
 *
 * One function, `currentIdentity()`, answers the question for every server-side
 * caller — the console layout that labels the top bar, the audit trail that needs
 * an actor, and any route handler that wants a tenant. It is the only place that
 * knows the precedence, which is why nothing else reads `dukaan.session` by hand:
 *
 *   1. a **verified app session** wins. It already carries the tenant, the role
 *      and the display name, and verifying it is one HMAC with no network;
 *   2. otherwise, when real Supabase credentials exist, the **provider session**
 *      is consulted and the identity is re-derived from it (including the role,
 *      which lives in `business_members`, never in the client);
 *   3. otherwise there is no identity, and the caller treats the request as
 *      anonymous.
 *
 * Note what is *not* here: no role is ever taken from a request body or from
 * browser storage, and a failure at any step resolves to "anonymous" rather than
 * to a guess. Assuming `owner` because a lookup threw is how a read-only staff
 * account ends up owning the business.
 */

import { isSupabaseConfigured } from '@/lib/supabase/config';
import { cookies } from 'next/headers';

import { getGuardedServerClient, getSessionUser } from '@/lib/security/guard';
import { dominantRole, type Role } from '@/lib/security/rbac';
import { appRoleForMembership } from '@/lib/team/roles';
import { SESSION_COOKIE, SESSION_IDLE_SECONDS, actorLabel, type SessionClaims } from '@/lib/security/session';
import { openOwnerSession, providerForClaims, type SessionProvider } from './cookie';

export type ConsoleIdentity = {
  provider: SessionProvider;
  userId: string;
  tenantId: string;
  role: Role;
  /** Already redacted — see `actorNameFor`. Never a full address. */
  displayName: string;
  /** Epoch seconds, or `null` for a provider session this app has not wrapped. */
  expiresAt: number | null;
  /** Whether the owner asked to stay signed in after the browser closes. */
  remember: boolean;
};

/**
 * The human label for an actor — in the audit trail, on the top bar, in a toast.
 *
 * The address itself never appears anywhere in a record: the local part is
 * truncated and marked, which is enough for a shopkeeper reading their own trail
 * ("wh••• changed the tax rate") and useless to anyone who steals the file.
 */
export function actorNameFor(email: string | null | undefined): string {
  if (!email) return 'Local owner (this device)';
  const [local] = email.split('@');
  return local ? local.slice(0, 2) + '•••' : 'Signed-in owner';
}

/**
 * The roles `supabase/schema.sql` allows in `business_members`, mapped onto the
 * four the app enforces. The table now lives in `lib/team/roles.ts` — the same
 * module the team API writes with — so the sign-in path and the management
 * path can never disagree about what a seat means. Anything unrecognised is
 * not upgraded to the nearest neighbour — it drops to the least powerful role.
 */
const membershipRole = appRoleForMembership;

/**
 * The owner's strongest membership: which business this is, and in what capacity.
 *
 * `null` when there is no Supabase here, no session, or no membership row — all
 * three mean "we cannot tell", and the caller decides what that costs. It is
 * never `owner` by default.
 */
export async function resolveMembership(userId: string): Promise<{ tenantId: string; role: Role } | null> {
  try {
    const client = await getGuardedServerClient();
    if (!client) return null;
    const { data, error } = await client
      .from('business_members')
      .select('business_id, role')
      .eq('user_id', userId)
      .limit(20);
    if (error || !Array.isArray(data) || data.length === 0) return null;

    const rows = data as { business_id?: unknown; role?: unknown }[];
    const strength: Role[] = ['owner', 'manager', 'cashier', 'auditor'];
    let best: { tenantId: string; role: Role } | null = null;
    for (const row of rows) {
      const tenantId = typeof row.business_id === 'string' ? row.business_id : '';
      if (!tenantId) continue;
      const role = membershipRole(row.role);
      if (!best || strength.indexOf(role) < strength.indexOf(best.role)) best = { tenantId, role };
    }
    if (!best) return null;
    // `dominantRole` re-checks the ordering so the two ways of asking the same
    // question cannot disagree if the matrix is ever widened.
    return { tenantId: best.tenantId, role: dominantRole([best.role]) };
  } catch {
    return null;
  }
}

function identityFromClaims(claims: SessionClaims): ConsoleIdentity {
  // The only way to be issued a window longer than the idle one is to have asked
  // to stay signed in, so the token says which promise was made — no extra claim
  // field, and nothing the client can relabel.
  const remember = claims.exp - claims.iat > SESSION_IDLE_SECONDS;
  return {
    provider: providerForClaims(claims),
    userId: claims.userId,
    tenantId: claims.tenantId,
    role: claims.role,
    displayName: actorLabel(claims.displayName),
    expiresAt: claims.exp,
    remember,
  };
}

/** The identity this request carries, or `null`. Never throws, never hangs. */
export async function currentIdentity(): Promise<ConsoleIdentity | null> {
  const store = await cookies();

  const claims = await openOwnerSession(store.get(SESSION_COOKIE)?.value);
  if (claims && !isSupabaseConfigured()) return identityFromClaims(claims);

  const user = await getSessionUser();
  if (!user || (claims && claims.userId !== user.id)) return null;

  const membership = await resolveMembership(user.id);
  if (claims?.tenantId && !membership) return null;
  return {
    provider: 'supabase',
    userId: user.id,
    // With no membership row there is no tenant to scope to. The empty string is
    // what `lib/security/tenant.ts` reads as "unscoped", which is exactly the
    // truth here, and the console's own records stay on this device.
    tenantId: membership?.tenantId ?? '',
    role: membership?.role ?? 'owner',
    displayName: actorNameFor(user.email),
    expiresAt: null,
    remember: true,
  };
}

/**
 * The shape handed to a client component.
 *
 * It is `ConsoleIdentity` minus the tenant. `tenantId` stays server-side because
 * nothing in the browser may scope a query with it; `userId` comes along because
 * the audit trail needs a stable subject for an entry, and an opaque id — a
 * Supabase uuid or a device-bound `local_…` digest — is not a person's address.
 * A display name and an expiry are what the top bar renders.
 */
export type RenderedIdentity = Pick<
  ConsoleIdentity,
  'userId' | 'displayName' | 'role' | 'provider' | 'expiresAt' | 'remember'
> & { businessId?: string };

export function renderable(identity: ConsoleIdentity | null): RenderedIdentity | null {
  if (!identity) return null;
  return {
    userId: identity.userId,
    businessId: identity.tenantId || undefined,
    displayName: identity.displayName,
    role: identity.role,
    provider: identity.provider,
    expiresAt: identity.expiresAt,
    remember: identity.remember,
  };
}
