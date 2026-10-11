'use client';

/**
 * The browser's half of profile persistence — two calls, both to `/api/profile`.
 *
 * Deliberately *not* a direct Supabase call, even though `lib/supabase/client.ts`
 * is right there. The endpoint resolves the tenant from the session, validates
 * the payload with an allow-list, and derives `setup_complete` itself; a browser
 * that wrote the row directly would be trusted with all three, and the tenant id
 * would come from `localStorage` — a value any script on the page can rewrite.
 *
 * Failure is never fatal, and never silent in a way that matters. The console
 * keeps working on the local vault copy; the sync status in Settings says which
 * happened. A shop that cannot reach its database still has to be able to bill a
 * customer standing at the counter.
 */

import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';
import { snapshotFromRow, type ProfileSnapshot } from './profile';

export type ProfileMode = 'local' | 'supabase';

export type ProfileReadResult = {
  ok: boolean;
  profile: ProfileSnapshot | null;
  mode?: ProfileMode;
  error?: string;
};

export type ProfileWriteResult = {
  ok: boolean;
  mode?: ProfileMode;
  error?: string;
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

type WireResponse = {
  ok?: unknown;
  mode?: unknown;
  profile?: unknown;
  error?: unknown;
};

function modeOf(payload: WireResponse): ProfileMode {
  return payload.mode === 'local' ? 'local' : 'supabase';
}

/** GET, with no credentials of its own — the session cookie is the credential. */
async function read(): Promise<ProfileReadResult> {
  const response = await fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store' });
  const payload = (await response.json().catch(() => ({}))) as WireResponse;
  if (!response.ok || !payload.ok) {
    return {
      ok: false,
      profile: null,
      mode: modeOf(payload),
      // Both fallbacks are catalogue phrases: a message that only exists in
              // English is a message 22 languages silently render in English.
              error:
                typeof payload.error === 'string'
                  ? payload.error
                  : `Profile could not be read (${response.status}).`,
    };
  }
  // `snapshotFromRow` is the same reader the server used, so a row this build
  // does not understand arrives as `null` rather than as a half-filled form.
  const profile = payload.profile ? snapshotFromRow(payload.profile) : null;
  return { ok: true, profile, mode: modeOf(payload) };
}

async function write(snapshot: ProfileSnapshot, token: string | null): Promise<ProfileWriteResult> {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(token ? { [CSRF_HEADER]: token } : {}),
    },
    body: JSON.stringify(snapshot),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as WireResponse;
  if (!response.ok || !payload.ok) {
    return {
      ok: false,
      mode: modeOf(payload),
      error: typeof payload.error === 'string' ? payload.error : `Profile could not be saved (${response.status}).`,
    };
  }
  return { ok: true, mode: modeOf(payload) };
}

/**
 * The profile this owner last saved, from any device.
 *
 * `null` with `ok: true` is a real answer and not a failure: it means signed in
 * with nothing stored yet, or a local-first build where the device's own vault
 * is the only record there is.
 */
export async function fetchStoredProfile(): Promise<ProfileReadResult> {
  if (typeof window === 'undefined') return { ok: false, profile: null, error: 'Not in a browser.' };
  try {
    return await read();
  } catch {
    return { ok: false, profile: null, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

/**
 * Save the profile to this owner's account.
 *
 * Carries the double-submit CSRF token the edge mints, and retries exactly once
 * after refreshing it, because that cookie rotates on any response and losing
 * that race would tell an owner their details did not save when they would have.
 */
export async function saveStoredProfile(snapshot: ProfileSnapshot): Promise<ProfileWriteResult> {
  if (typeof window === 'undefined') return { ok: false, error: 'Not in a browser.' };
  try {
    let token = readCookie(CSRF_COOKIE);
    if (!token) {
      // One safe GET is enough to be issued the token.
      await fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      token = readCookie(CSRF_COOKIE);
    }
    const result = await write(snapshot, token);
    if (!result.ok) {
      // Same single retry as `lib/portals/sync.ts`: the token rotates on any
      // response, so the first attempt can fail on a stale token rather than on
      // the profile. One retry costs a request; a false "could not save" costs
      // the owner's trust in the save button.
      await fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      return write(snapshot, readCookie(CSRF_COOKIE));
    }
    return result;
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again — nothing was lost.' };
  }
}
