/**
 * Portal endpoint.
 *
 * The only server-side write the portal system needs, and it is deliberately
 * the narrowest one possible:
 *
 *   GET   → reports the portal this device is currently on.
 *   POST  → { templateId } → validates, re-derives the portal server-side, and
 *           re-issues the httpOnly portal cookie.
 *
 * Hardening that applies to every request (mostly inherited from middleware,
 * restated in code so it cannot be lost in a refactor):
 *
 *   • CSRF — `x-csrf-token` must match the `dukaan.csrf` cookie (double submit),
 *     and the origin / fetch-metadata layers must pass. Enforced in
 *     `middleware.ts` for everything under `/api/`.
 *   • Rate limit — `/api/portal` has its own tight bucket (`policy.json →
 *     rateLimits.portal`), separate from the general API budget.
 *   • Validation — only a template id from the shipped list is accepted. The
 *     client never sends a portal id, and the server never echoes user input
 *     into the cookie: the value written is our own constant.
 *   • Authorisation — when this deployment has a real session (Supabase
 *     credentials configured and a signed-in user), the user must hold an
 *     owner/manager role. In local-first mode there is no session to consult;
 *     the cookie carries no data and grants no access, so the worst a forged
 *     value can do is show a module that business already has.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { getSessionUser } from '@/lib/security/guard';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { resolvePosture } from '@/lib/security/headers';
import { isKnownTemplateId, isPortalId, portalById, portalIdForTemplate } from '@/lib/portals/registry';
import { PORTAL_COOKIE } from '@/lib/portals/routes';
import type { PortalId } from '@/lib/portals/types';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Role names that may reshape the business console. */
const PORTAL_SWITCH_ROLES = new Set(['owner', 'manager']);

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: resolvePosture() === 'strict',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  };
}

/** Read the portal cookie, falling back to the safe default. */
async function currentPortalId(): Promise<PortalId> {
  const store = await cookies();
  const raw = store.get(PORTAL_COOKIE)?.value;
  return isPortalId(raw) ? raw : portalIdForTemplate(undefined);
}

export async function GET() {
  const portalId = await currentPortalId();
  return json({ ok: true, portalId, portal: portalById(portalId).name });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const templateId = (payload as { templateId?: unknown } | null)?.templateId;
  if (!isKnownTemplateId(templateId)) {
    // Deliberately vague: a client guessing ids learns nothing about the list.
    return json({ error: 'Unknown business type.' }, 422);
  }

  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    if (!user) return json({ error: 'Sign-in required.' }, 401);
    const allowed = await maySwitchPortal(user.id);
    if (!allowed) return json({ error: 'Your role cannot change the business type.' }, 403);
  }

  const portalId = portalIdForTemplate(templateId);
  const response = json({ ok: true, portalId, portal: portalById(portalId).name });
  response.cookies.set(PORTAL_COOKIE, portalId, cookieOptions());
  return response;
}

/**
 * Authorisation when a real session exists. The role lives in `business_members`
 * (see supabase/schema.sql); anything we cannot resolve is treated as "not an
 * owner" rather than assumed.
 */
async function maySwitchPortal(userId: string): Promise<boolean> {
  try {
    const { getGuardedServerClient } = await import('@/lib/security/guard');
    const client = await getGuardedServerClient();
    if (!client) return false;
    const { data, error } = await client
      .from('business_members')
      .select('role')
      .eq('user_id', userId)
      .limit(5);
    if (error || !data) return false;
    return data.some((row: { role?: string }) => PORTAL_SWITCH_ROLES.has(String(row.role)));
  } catch {
    return false;
  }
}

/** The portal must reflect the cookie on every request — never a cached body. */
export const dynamic = 'force-dynamic';
