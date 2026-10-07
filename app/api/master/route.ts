/**
 * Everything On endpoint.
 *
 * The only place the master reveal can be switched, and it is the narrowest
 * endpoint in the product:
 *
 *   GET   → reports whether the reveal is live and how many days it has left.
 *   POST  → { on: boolean } → seals a signed record and re-issues the cookie.
 *
 * There is no other input. The body cannot name a module, a portal, a plan or
 * a duration — the server decides all four — so there is nothing in the
 * request for an attacker to aim at beyond a boolean.
 *
 * Inherited from middleware, restated here so a refactor cannot quietly drop it:
 *
 *   • CSRF — `x-csrf-token` must match the `dukaan.csrf` cookie, and the
 *     origin / fetch-metadata layers must pass (`middleware.ts`, step 4).
 *   • Rate limit — its own tight bucket (`policy.json → rateLimits.master`),
 *     separate from the general API budget, because this is a switch an owner
 *     flips twice a year and a script would flip continuously.
 *   • Authorisation — with a real session, owner or manager only. In
 *     local-first mode there is no session to consult and no server-side data
 *     to protect: the console, the records and the device are all the owner's.
 *
 * What the reveal cannot do, stated here because it is the whole safety
 * argument: it is read in step 5 of the middleware (portal policy) and is not
 * in scope in step 6 (plan policy). Turning it on reveals the modules this
 * *trade* does not use. It cannot reveal a module this *business has not paid
 * for* — that check runs afterwards, against a separately signed cookie, and
 * never sees this value.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { getSessionUser } from '@/lib/security/guard';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { resolvePosture } from '@/lib/security/headers';
import {
  MASTER_COOKIE,
  MASTER_OFF,
  masterCookieOptions,
  masterDaysLeft,
  masterRevealActive,
  openMasterRecord,
  sealMasterRecord,
  startMasterReveal,
  type MasterRecord,
} from '@/lib/portals/master';

/** Roles that may widen their own console. */
const REVEAL_ROLES = new Set(['owner', 'manager']);

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

function describe(record: MasterRecord | null) {
  const active = masterRevealActive(record);
  return {
    ok: true,
    on: active,
    daysLeft: masterDaysLeft(record),
    since: active ? (record?.since ?? 0) : 0,
    until: active ? (record?.until ?? 0) : 0,
    by: active ? (record?.by ?? 'local') : null,
  };
}

export async function GET() {
  const store = await cookies();
  const record = await openMasterRecord(store.get(MASTER_COOKIE)?.value);
  return json(describe(record));
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const on = (payload as { on?: unknown } | null)?.on;
  if (typeof on !== 'boolean') {
    return json({ error: 'Expected { on: true } or { on: false }.' }, 422);
  }

  let actor: MasterRecord['by'] = 'local';

  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    if (!user) return json({ error: 'Sign-in required.' }, 401);
    const role = await roleFor(user.id);
    if (!role || !REVEAL_ROLES.has(role)) {
      return json({ error: 'Your role cannot change which modules this console shows.' }, 403);
    }
    actor = role === 'manager' ? 'manager' : 'owner';
  }

  // Switching *off* clears the cookie outright rather than writing a signed
  // "off" record: the absence of a cookie and an unverifiable one already mean
  // the same thing, and the fewer states this has, the fewer ways it can lie.
  if (!on) {
    const response = json(describe(MASTER_OFF));
    response.cookies.set(MASTER_COOKIE, '', { ...masterCookieOptions(resolvePosture() === 'strict'), maxAge: 0 });
    return response;
  }

  const record = startMasterReveal(actor);
  const sealed = await sealMasterRecord(record);
  const response = json(describe(record));
  response.cookies.set(MASTER_COOKIE, sealed, masterCookieOptions(resolvePosture() === 'strict'));
  return response;
}

/** The caller's role, from `business_members`. Anything unresolved is "no role". */
async function roleFor(userId: string): Promise<string | null> {
  try {
    const { getGuardedServerClient } = await import('@/lib/security/guard');
    const client = await getGuardedServerClient();
    if (!client) return null;
    const { data, error } = await client.from('business_members').select('role').eq('user_id', userId).limit(5);
    if (error || !data) return null;
    const match = data.find((row: { role?: string }) => REVEAL_ROLES.has(String(row.role)));
    return match ? String(match.role) : null;
  } catch {
    return null;
  }
}

export const dynamic = 'force-dynamic';
