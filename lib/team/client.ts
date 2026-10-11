/**
 * Browser-side calls to the team API.
 *
 * Same discipline as `lib/auth/client.ts` and `lib/plans/client.ts`: every
 * mutating call carries the double-submit CSRF token, retries once when the
 * edge rotates it, and a dead network resolves to a friendly message rather
 * than a rejection the screen has to know about.
 */

import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';
import type { Role } from '@/lib/security/rbac';

export type TeamMember = {
  userId: string;
  email: string | null;
  role: Role;
  roleLabel: string;
  you: boolean;
  addedAt: string | null;
};

export type TeamInvite = {
  id: string;
  label: string | null;
  role: Role;
  roleLabel: string;
  expiresAt: string | null;
  createdAt: string | null;
};

export type TeamState =
  | { ok: true; state: 'local'; message: string }
  | { ok: true; state: 'unscoped'; message: string }
  | { ok: true; state: 'readonly'; role: Role; roleLabel: string }
  | { ok: true; state: 'ready'; business: { name: string | null }; members: TeamMember[]; invites: TeamInvite[] }
  | { ok: false; error: string };

export type MintedInvite = { id: string; code: string; role: Role; roleLabel: string; label: string | null; expiresAt: string };

function readCookie(name: string): string | null {
  try {
    const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`));
    return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

/** POST with the CSRF token attached, retrying once on rotation. */
async function send(path: string, body: unknown): Promise<Response | null> {
  if (typeof window === 'undefined') return null;

  const attempt = async (token: string | null) =>
    fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(token ? { [CSRF_HEADER]: token } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });

  try {
    let token = readCookie(CSRF_COOKIE);
    if (!token) {
      // The edge mints the token on any response; one safe GET is enough.
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

async function submit<T>(path: string, body: unknown, fallback: string): Promise<T & { ok: boolean; error?: string }> {
  const response = await send(path, body);
  if (!response) return { ok: false, error: 'Could not reach the server. Check your connection and try again.' } as T & { ok: boolean; error?: string };
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const result = (payload ?? {}) as T & { ok: boolean; error?: string };
  if (!result.error && !response.ok && !result.ok) result.error = fallback;
  return result;
}

/** Load the team view — members, invites, or the state that stands in for them. */
export async function loadTeam(): Promise<TeamState> {
  try {
    const response = await fetch('/api/team', { credentials: 'same-origin', cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as TeamState | null;
    if (!payload) return { ok: false, error: 'Could not read the team. Please try again.' };
    return payload;
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

export async function createInvite(input: { role: Role; label?: string }) {
  return submit<{ invite?: MintedInvite }>('/api/team', { action: 'invite', role: input.role, label: input.label ?? '' }, 'Could not create the invite.');
}

export async function revokeInvite(inviteId: string) {
  return submit('/api/team', { action: 'revoke', inviteId }, 'Could not revoke the invite.');
}

export async function removeMember(userId: string) {
  return submit('/api/team', { action: 'remove', userId }, 'Could not remove the teammate.');
}

export async function changeMemberRole(userId: string, role: Role) {
  return submit('/api/team', { action: 'role', userId, role }, 'Could not change the role.');
}

export type RedeemResult = { ok: boolean; error?: string; businessName?: string | null; role?: Role; roleLabel?: string };

export async function redeemInviteCode(code: string): Promise<RedeemResult> {
  return submit<RedeemResult>('/api/team/redeem', { code }, 'Could not redeem the code.');
}
