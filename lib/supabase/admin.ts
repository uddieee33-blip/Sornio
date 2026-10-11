/**
 * The service-role client — the only Supabase client that answers to no RLS
 * policy.
 *
 * It exists for exactly one job: the team API. Enrolling a teammate means
 * writing a `business_members` row *for somebody else*, and reading their auth
 * record to show the owner their email — two things a member's own session
 * must never be able to do, and therefore two things no policy may allow.
 * The route handlers that use this client enforce their own authorisation
 * (owner role, tenant match) *before* touching the database; this client is
 * the execution arm, never the decision maker.
 *
 * Three guards keep the key honest:
 *
 *   1. **Server only.** The module refuses to exist in a browser, and the env
 *      var has no `NEXT_PUBLIC_` prefix, so Next.js strips it from the client
 *      bundle by construction.
 *   2. **Absent = disabled.** Like the guarded publishable client, a missing
 *      or placeholder key returns `null` and the caller takes its local-first
 *      path instead of timing out on a network call to nowhere.
 *   3. **No session machinery.** A service client that persists or refreshes
 *      sessions would leak an all-powerful credential into storage; this one
 *      keeps nothing.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseUrl, isSupabaseConfigured } from './config';

const KEY_PLACEHOLDERS = ['your-service-role-key', 'your_service_role_key', ''];

export function isServiceRoleConfigured(): boolean {
  if (typeof window !== 'undefined') return false;
  if (!isSupabaseConfigured()) return false;
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return key.length >= 20 && !KEY_PLACEHOLDERS.some((p) => key === p);
}

/** The service-role client, or `null` when this deployment cannot have one. */
export function getServiceRoleClient(): SupabaseClient | null {
  if (!isServiceRoleConfigured()) return null;
  try {
    return createClient(getSupabaseUrl(), (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}
