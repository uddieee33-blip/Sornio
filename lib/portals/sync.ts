'use client';

/**
 * Server-side portal publication.
 *
 * The chosen portal has to reach the server, because the Edge middleware makes
 * the routing decision before any client code runs. That is done through a
 * single narrowly-scoped endpoint (`POST /api/portal`) which:
 *
 *   • is CSRF-protected by the double-submit token the middleware already mints
 *     (`x-csrf-token`, readable cookie `dukaan.csrf`);
 *   • accepts only a template id from the known list — the server re-derives
 *     the portal itself and never trusts a client-supplied portal id;
 *   • answers with an httpOnly, SameSite=Lax cookie, so no script can rewrite
 *     the portal a business is on.
 *
 * Failure is returned to the caller. Hosted onboarding must retain the form
 * and offer a retry before navigating; other callers may keep their current
 * workspace while the existing in-app gate remains in force.
 */

import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';
import { templateIdForPortal, isPortalId } from './registry';
import type { PortalId } from './types';

export type PublishResult = { ok: boolean; portalId?: PortalId; error?: string };

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function post(body: unknown, token: string | null): Promise<PublishResult> {
  const response = await fetch('/api/portal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { [CSRF_HEADER]: token } : {}),
    },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    return { ok: false, error: `Portal could not be saved (${response.status}).` };
  }
  const payload = (await response.json().catch(() => ({}))) as { portalId?: unknown };
  return { ok: true, portalId: isPortalId(payload.portalId) ? payload.portalId : undefined };
}

/**
 * Tell the server which portal this business is on.
 *
 * `templateIdForPortal` is applied first, so callers pass a portal id and the
 * wire format stays a template id — one less thing that can drift.
 */
export async function publishPortal(portalOrTemplateId: string): Promise<PublishResult> {
  if (typeof window === 'undefined') return { ok: false, error: 'Not in a browser.' };
  const templateId = portalOrTemplateId.startsWith('template-')
    ? portalOrTemplateId
    : templateIdForPortal(portalOrTemplateId);

  try {
    let token = readCookie(CSRF_COOKIE);
    if (!token) {
      // The middleware mints the token on any response; one safe GET is enough.
      await fetch('/api/portal', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      token = readCookie(CSRF_COOKIE);
    }
    const result = await post({ templateId }, token);
    if (!result.ok && token) {
      // The token may have rotated mid-session; refresh and retry exactly once.
      await fetch('/api/portal', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      return post({ templateId }, readCookie(CSRF_COOKIE));
    }
    return result;
  } catch {
    return { ok: false, error: 'Portal could not be saved offline.' };
  }
}
