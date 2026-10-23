/**
 * Invite redemption — the teammate's side of the handshake.
 *
 * The owner generated a code on the Team screen; the person holding it has
 * signed up with their *own* email and typed the code here. On success the
 * membership and single-use code consumption happen in ONE DB transaction:
 *
 *   1. one `business_members` row links their account to the business with the
 *      role the owner baked into the invite — from this moment every device
 *      they sign into resolves that role (`lib/auth/identity.ts`);
 *   2. the invite is burned (single use), so a forwarded code cannot enrol a
 *      second person;
 *   3. after the database commits, their DukaanOS session is re-minted, so
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
import { auditLogsInsertNote } from '@/lib/team/redeem-helpers';
import { cleanLine } from '@/lib/security/validation';
import { getServiceRoleClient } from '@/lib/supabase/admin';
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

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: false, state: 'local', error: 'Invite codes need sync. This deployment is running device-local, so there is nothing to join yet.' }, 503);
  }

  const user = await getSessionUser();
  if (!user) return json({ ok: false, error: 'Sign in first — your own email and password — then enter the code.' }, 401);

  // Only the server-side service role can call this RPC. The actor id comes
  // from Supabase Auth (getSessionUser), never from the submitted request.
  // The database locks the invite row and consumes it in the same transaction
  // as membership creation. No browser-accessible direct RPC is granted.
  const { data: redeemed, error: redeemError } = await admin.rpc('redeem_team_invite_atomic', {
    p_code_hash: hash,
    p_user_id: user.id,
  });
  if (redeemError) {
    return json({ ok: false, error: 'Could not join the business. Please try again.' }, 503);
  }

  const outcome = (redeemed && typeof redeemed === 'object' && !Array.isArray(redeemed)
    ? redeemed : null) as { status?: unknown; businessId?: unknown; role?: unknown } | null;

  if (outcome?.status === 'invalid') return json({ ok: false, error: BAD_CODE }, 404);
  if (outcome?.status === 'already-member') {
    return json({ ok: false, error: 'This account is already on that team — just sign in.' }, 409);
  }
  if (outcome?.status === 'already-assigned') {
    return json({ ok: false, error: 'This account already belongs to a business. Leave it (ask that owner to remove you) before joining another.' }, 409);
  }
  if (outcome?.status !== 'joined' || typeof outcome.businessId !== 'string' ||
      typeof outcome.role !== 'string') {
    return json({ ok: false, error: 'Could not join the business. Please try again.' }, 503);
  }
  const businessId = outcome.businessId;
  const role = appRoleForMembership(outcome.role);

  await auditLogsInsertNote(admin, {
    tenantId: businessId,
    actorUserId: user.id,
    action: 'team.member.joined',
    details: { role },
  });

  const { data: business } = await admin.from('businesses').select('name').eq('id', businessId).maybeSingle();
  const businessName = typeof (business as { name?: unknown } | null)?.name === 'string' ? String((business as { name?: unknown }).name) : null;

  // Re-read the new membership through the signed-in user's provider client.
  // The atomic RPC result is the trusted fallback if that read is delayed.
  const membership = await resolveMembership(user.id);
  const issued = await sealOwnerSession({
    userId: user.id,
    tenantId: membership?.tenantId ?? businessId,
    role: membership?.role ?? role,
    displayName: actorNameFor(user.email),
    remember: true,
  });

  const response = json({ ok: true, businessName, role, roleLabel: ROLE_LABELS[role] });
  response.cookies.set(AUTH_COOKIE, issued.value, ownerSessionCookie(transportForRequest(request), issued.maxAge));
  return response;
}
