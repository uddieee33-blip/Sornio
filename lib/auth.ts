/**
 * Server-side auth access.
 *
 * This module used to build a Supabase client unconditionally, which produced
 * dead network calls (and slow, hanging pages) whenever the deployment ran in
 * local-first mode with placeholder credentials. It now delegates to the
 * guarded client: `null` means "no Supabase here", and callers take the
 * local-first path immediately.
 */

import { getGuardedServerClient, getSessionUser as guardedSessionUser, type GuardedUser } from '@/lib/security/guard';

export type { GuardedUser };

/**
 * The signed-in user, or `null`.
 *
 * Returns `null` (never throws, never hangs) when Supabase is unconfigured,
 * unreachable, or the session has expired.
 */
export async function getSessionUser(): Promise<GuardedUser | null> {
  return guardedSessionUser();
}

/** True when this deployment can authenticate against Supabase at all. */
export async function authAvailable(): Promise<boolean> {
  return (await getGuardedServerClient()) !== null;
}

/** Human label for audit entries — never the raw email address. */
export function actorNameFor(user: GuardedUser | null): string {
  if (!user) return 'Local owner (this device)';
  const [local] = (user.email ?? '').split('@');
  return local ? local.slice(0, 2) + '•••' : 'Signed-in owner';
}
