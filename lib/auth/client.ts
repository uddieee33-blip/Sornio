'use client';

/**
 * The browser side of sign-in.
 *
 * Four calls, all to `app/api/auth/*`, and none of them is fatal:
 *
 *   • `fetchIdentity()` — who is at this console. Called once after hydration by
 *     the store, which is what decides whether sync may run and what name appears
 *     on every audit entry.
 *   • `submitCredentials()` — sign in or sign up. The password goes to *this
 *     origin*; the origin hands it to Supabase. A browser that talked to the
 *     provider directly would hold the resulting tokens in reach of page script.
 *   • `signOut()` — clears the app session, then the provider session.
 *   • `requestPasswordReset()` / `setNewPassword()` — recovery, in two halves.
 *
 * Each one carries the double-submit CSRF token the edge requires for a mutating
 * request, and retries exactly once after refreshing that token, because the
 * cookie rotates on any response and a form that loses that race is a form that
 * tells an owner their password is wrong when it is not.
 */

import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';
import type { RenderedIdentity } from './identity';
import type { AuthMode } from './types';

export type { RenderedIdentity };

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export type SignInResult = {
  ok: boolean;
  error?: string;
  /** Where to send the owner next — validated on the server, never here. */
  next?: string;
  /** `email-confirmation` means the account exists and the session does not yet. */
  pending?: string;
  identity?: RenderedIdentity | null;
  mode?: AuthMode;
};

export type IdentityResponse = {
  /** `null` when the request could not be made at all — never "signed out". */
  identity: RenderedIdentity | null;
  signedIn: boolean;
  mode: AuthMode;
  error?: string;
};

/** `unknown` vs `signed out` has to stay distinguishable, or offline = logged out. */
export async function fetchIdentity(): Promise<IdentityResponse | null> {
  if (typeof window === 'undefined') return null;
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => ({}))) as {
      signedIn?: unknown;
      mode?: unknown;
      identity?: RenderedIdentity | null;
    };
    const mode: AuthMode = payload.mode === 'supabase' ? 'supabase' : 'local';
    const identity = payload.identity && typeof payload.identity === 'object' ? payload.identity : null;
    return { identity, signedIn: Boolean(payload.signedIn) && identity !== null, mode };
  } catch {
    return null;
  }
}

/** POST or DELETE with the CSRF token attached, retrying once on rotation. */
async function send(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<Response | null> {
  if (typeof window === 'undefined') return null;

  const attempt = async (token: string | null) =>
    fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { [CSRF_HEADER]: token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  try {
    let token = readCookie(CSRF_COOKIE);
    if (!token) {
      // The edge mints the token on any response; one safe GET is enough to get it.
      await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      token = readCookie(CSRF_COOKIE);
    }
    let response = await attempt(token);
    if (response.status === 403 && token) {
      await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      response = await attempt(readCookie(CSRF_COOKIE));
    }
    return response;
  } catch {
    return null;
  }
}

async function submit<T>(path: string, body: unknown, fallback: string, method: 'POST' | 'DELETE' = 'POST'): Promise<T & { ok: boolean; error?: string }> {
  const response = await send(path, method, body);
  if (!response) {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' } as T & {
      ok: boolean;
      error?: string;
    };
  }
  const payload = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  const ok = Boolean(payload?.ok) && response.ok;
  return { ...payload, ok, error: payload?.error ?? (ok ? undefined : fallback) } as T & { ok: boolean; error?: string };
}

export type SignInInput = {
  action: 'sign-in' | 'sign-up';
  email: string;
  password: string;
  remember: boolean;
  /** A validated destination the server already knows how to refuse. */
  next?: string;
};

export async function submitCredentials(input: SignInInput): Promise<SignInResult> {
  const result = await submit<SignInResult>(
    '/api/auth/session',
    input,
    'That did not work. Check the email and password and try again.',
  );
  // An empty `error` with `ok: false` is a server bug, not a message; never show
  // a red box that says nothing.
  return { ...result, error: result.ok ? undefined : result.error };
}

/**
 * End the session and put the sign-in screen on screen — with a full document
 * load rather than a router push.
 *
 * The lint rule is right about `location.assign` for ordinary navigation: it
 * throws away the router cache, the scroll position, and every prefetch. Ending a
 * session is the case that earns the exception, for one reason: the store lives in
 * the root layout, so it survives a soft route change. A push to `/auth` would
 * leave the day's takings in memory behind the sign-in form — one Back gesture from
 * being on screen again in front of whoever taps next. A new document cannot be
 * scrolled back into.
 */
export function leaveToSignIn(): void {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/auth');
}

/** The same exit, after the request that earns it. */
export async function signOutAndLeave(): Promise<void> {
  await signOut();
  leaveToSignIn();
}

export async function signOut(): Promise<{ ok: boolean; error?: string }> {
  const response = await send('/api/auth/session', 'DELETE');
  if (!response) return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  // The route handler clears the app cookie before it does anything else, so a
  // reply of any kind — even an error — means this console is signed out. Only a
  // request that never arrived leaves the owner where they were.
  return { ok: true };
}

export type ResetResult = { ok: boolean; error?: string; message?: string; delivered?: boolean; note?: string };

export async function requestPasswordReset(email: string): Promise<ResetResult> {
  return submit<ResetResult>('/api/auth/reset', { email }, 'The reset link could not be sent. Try again in a minute.');
}

export async function setNewPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  return submit<{ ok: boolean }>('/api/auth/password', { password }, 'The password could not be changed. Try again.');
}
