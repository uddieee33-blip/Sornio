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
import { auditLogsInsertNote, inviteLooksLive, type TeamInviteRow } from '@/lib/team/redeem-helpers';
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

  const { data: inviteRow, error: inviteError } = await admin.from('team_invites').select('*').eq('code_hash', hash).maybeSingle();
  // An unavailable invitation store is a service failure, not a wrong code.
  if (inviteError) return json({ ok: false, error: 'Could not join the business. Please try again.' }, 503);
  const invite = (inviteRow ?? null) as TeamInviteRow | null;
  if (!inviteLooksLive(invite)) return json({ ok: false, error: BAD_CODE }, 404);
  const live = invite;

  // One person, one business. A second membership would make "whose data am I
  // seeing" ambiguous everywhere downstream, so the answer is no — the owner
  // of the other business must remove them first.
  const { data: existing, error: existingError } = await admin.from('business_members').select('business_id').eq('user_id', user.id).limit(1);
  // Never treat a failed membership read as proof that a user is unassigned.
  if (existingError || !Array.isArray(existing)) {
    return json({ ok: false, error: 'Could not join the business. Please try again.' }, 503);
  }
  if (existing.length > 0) {
    const same = (existing[0] as { business_id?: unknown }).business_id === live.business_id;
    return json(
      { ok: false, error: same ? 'This account is already on that team — just sign in.' : 'This account already belongs to a business. Leave it (ask that owner to remove you) before joining another.' },
      409,
    );
  }

  const { error: joinError } = await admin
    .from('business_members')
    .insert({ business_id: live.business_id, user_id: user.id, role: live.role });
  if (joinError) {
    // The UNIQUE(business_id, user_id) constraint is the only failure with a
    // friendly answer; anything else is ours, not theirs.
    if (/duplicate|unique/i.test(joinError.message)) return json({ ok: false, error: 'This account is already on that team — just sign in.' }, 409);
    return json({ ok: false, error: 'Could not join the business. Please try again.' }, 500);
  }

  await admin
    .from('team_invites')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', live.id)
    .is('used_at', null);

  const role = appRoleForMembership(live.role);
  await auditLogsInsertNote(admin, {
    tenantId: live.business_id,
    actorUserId: user.id,
    action: 'team.member.joined',
    entityId: live.id,
    details: { role },
  });

  const { data: business } = await admin.from('businesses').select('name').eq('id', live.business_id).maybeSingle();
  const businessName = typeof (business as { name?: unknown } | null)?.name === 'string' ? String((business as { name?: unknown }).name) : null;

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
