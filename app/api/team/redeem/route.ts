/**
 * Invite redemption — the teammate's side of the handshake.
 *
 * The owner generated a code on the Team screen; the person holding it has
 * signed up with their *own* email and typed the code here. On success three
 * things happen, atomically in effect:
 *
 *   1. one `business_members` row links their account to the business with the
 *      role the owner baked into the invite — from this moment every device
 *      they sign into resolves that role (`lib/auth/identity.ts`);
 *   2. the invite is burned (single use), so a forwarded code cannot enrol a
 *      second person;
 *   3. their DukaanOS session cookie is re-minted with the tenant and role, so
 *      the console knows who they are *now*, not after the next sign-in.
 *
 * Anti-enumeration: a wrong code, a used code, a revoked code and an expired
 * code all produce the same answer, and the whole route sits on the tight
 * `auth` rate bucket — this is a credential attempt in every meaningful sense
 * and is budgeted like one.
 */

import { NextResponse } from 'next/server';

import {
  AUTH_COOKIE,
  actorNameFor,
  ownerSessionCookie,
  resolveMembership,
  sealOwnerSession,
  getSessionUser,
} from '@/lib/auth';
import { sessionSecretConfigError, sessionVerificationSecret } from '@/lib/security/session';
import { transportForRequest } from '@/lib/security/transport';
import { getGuardedServerClient } from '@/lib/security/guard';
import { cleanLine } from '@/lib/security/validation';
import { inviteCodeHash } from '@/lib/team/codes';
import { appRoleForMembership } from '@/lib/team/roles';
import { ROLE_LABELS } from '@/lib/security/rbac';

const MAX_BODY_BYTES = 4 * 1024;

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

/** One refusal for every way a code can fail, so nothing is enumerable. */
const BAD_CODE = 'That invite code is not valid. Check the spelling with the owner, or ask for a fresh one.';

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'Request body is too large.' }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return json({ ok: false, error: 'Expected a JSON body.' }, 400);
  }

  // Refused before the invite is spent or a membership row is written: joining
  // a team ends by re-minting this device's session, and a deployment that
  // cannot sign it must not half-join the teammate and then explain nothing.
  if (sessionVerificationSecret() === null) {
    return json({ ok: false, code: 'sessions-disabled', error: sessionSecretConfigError() }, 503);
  }

  const codeText = cleanLine((payload as { code?: unknown } | null)?.code, 32);
  const hash = await inviteCodeHash(codeText);
  if (!hash) return json({ ok: false, error: BAD_CODE }, 422);

  const user = await getSessionUser();
  if (!user)
    return json({ ok: false, error: 'Sign in first — your own email and password — then enter the code.' }, 401);

  const client = await getGuardedServerClient();
  if (!client) return json({ ok: false, error: 'Sign in required.' }, 401);
  const { data, error: redeemError } = await client.rpc('redeem_team_invite', {
    p_hash: hash,
  });
  if (redeemError || !data) return json({ ok: false, error: BAD_CODE }, 409);
  const live = {
    business_id: String(data.businessId),
    role: String(data.role),
    id: null,
  };

  const role = appRoleForMembership(live.role);
  const businessName = typeof data.businessName === 'string' ? data.businessName : null;

  // Fresh cookie, fresh truth: tenant and role come from the row just written,
  // re-read through the same function every other request will use.
  const membership = await resolveMembership(user.id);
  const issued = await sealOwnerSession({
    userId: user.id,
    tenantId: membership?.tenantId ?? live.business_id,
    role: membership?.role ?? role,
    displayName: actorNameFor(user.email),
    remember: true,
  });

  const response = json({ ok: true, businessName, role, roleLabel: ROLE_LABELS[role] });
  response.cookies.set(AUTH_COOKIE, issued.value, ownerSessionCookie(transportForRequest(request), issued.maxAge));
  return response;
}
