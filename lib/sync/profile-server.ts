/**
 * Server-side reads of the stored owner profile.
 *
 * Two callers, one question each:
 *
 *   • `GET /api/profile` — the whole profile, to hand to a device that has
 *     forgotten it;
 *   • the sign-in endpoint — one boolean, to decide whether "Welcome back" ends
 *     at the console or at the setup screen.
 *
 * Both go through here so the tenant is resolved the same way in both, from
 * `business_members` and `auth.uid()`. The business id is never a parameter: a
 * caller that could pass one could read another business's owner.
 *
 * `mode: 'local'` means "there is no database here" (local-first build) and is
 * distinct from "signed in, nothing stored yet", which is `{ profile: null }`.
 */

import { getGuardedServerClient, getSessionUser } from '@/lib/security/guard';
import { snapshotFromRow, type ProfileSnapshot } from './profile';

export type StoredProfileRead = {
  /** `local` when this deployment has no account storage to read from. */
  mode: 'local' | 'supabase';
  businessId: string | null;
  profile: ProfileSnapshot | null;
};

/**
 * The signed-in owner's stored profile, or why there is not one.
 *
 * `userId` is for the one caller that has just proved who the owner is inside
 * this same request — the sign-in endpoint, which holds the provider's user
 * straight out of `signInWithPassword` and cannot rely on a cookie written
 * moments earlier being readable again. Every other caller omits it and the id
 * is resolved from the session, so a request can only ever read its own.
 */
export async function readStoredProfile(userId?: string): Promise<StoredProfileRead> {
  const client = await getGuardedServerClient();
  if (!client) return { mode: 'local', businessId: null, profile: null };

  // The provider's user id, never the app session's claims: every policy in the
  // schema keys off `auth.uid()`, and a locally minted id is not one.
  const user = userId ? { id: userId } : await getSessionUser();
  if (!user) return { mode: 'supabase', businessId: null, profile: null };

  const { data: membership } = await client
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const businessId = membership?.business_id ? String(membership.business_id) : null;
  if (!businessId) return { mode: 'supabase', businessId: null, profile: null };

  const { data: row, error } = await client
    .from('owner_profiles')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) return { mode: 'supabase', businessId, profile: null };

  return { mode: 'supabase', businessId, profile: snapshotFromRow(row ?? null) };
}

/**
 * Has this owner finished setting up?
 *
 * Deliberately derived from the stored fields by `isSetupComplete` (inside
 * `snapshotFromRow`) rather than read from the `setup_complete` column: the
 * column is a convenience for a SQL query, and a row that says "complete" while
 * missing required owner/business details must still complete setup. UPI and
 * bank details are optional for cash-only businesses.
 *
 * `false` is the answer for every kind of "we cannot tell" — no database, no
 * session, no business, no row, an unreadable row. Sending an owner who is
 * already set up through setup once more is an inconvenience; an unreadable row
 * must never be treated as proof that setup completed.
 */
export async function storedSetupComplete(userId?: string): Promise<boolean> {
  try {
    const stored = await readStoredProfile(userId);
    return stored.profile?.setupComplete === true;
  } catch {
    return false;
  }
}
