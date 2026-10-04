/**
 * Server-side guards.
 *
 * The Supabase helpers used to build a client with empty strings, which turns
 * every request into a network call to nowhere and shows up to the owner as a
 * hung page. Everything server-side now goes through `getGuardedServerClient()`,
 * which returns `null` unless real credentials exist, so callers can take the
 * local-first path immediately instead of waiting on a timeout.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseConfigured, getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config';

export type GuardedUser = { id: string; email: string | null };

/** Returns a server client, or null when Supabase is not configured. */
export async function getGuardedServerClient() {
  if (!isSupabaseConfigured()) return null;
  try {
    // `cookies()` became async in Next.js 15, so it is awaited once here and
    // captured rather than called repeatedly inside the cookie adapters.
    const cookieStore = await cookies();
    return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a server component render — middleware handles cookie writes.
          }
        },
      },
    });
  } catch {
    return null;
  }
}

/** Resolve the signed-in user without ever throwing or hanging. */
export async function getSessionUser(): Promise<GuardedUser | null> {
  const client = await getGuardedServerClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/** Server-side permission check used by future route handlers. */
export function requireUser(user: GuardedUser | null): GuardedUser {
  if (!user) {
    const error = new Error('Sign-in required.');
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return user;
}

/** Constant-shape JSON error that never leaks internals. */
export function apiError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
