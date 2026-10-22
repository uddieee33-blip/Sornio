/**
 * The team endpoint — who works at this business, and who is allowed to.
 *
 *   GET   → the member list and pending invites, owner only. Other callers get
 *           a *state* (`local`, `unscoped`, `readonly`) so the screen can tell
 *           the truth instead of faking an empty team.
 *   POST  → owner actions: `invite`, `revoke`, `remove`, `role`.
 *
 * Authorisation is decided from the database, not the session cookie. The
 * cookie says what the console renders; this route re-reads the caller's
 * membership row through the service client before touching anything, so a
 * demotion takes effect immediately instead of when the cookie happens to
 * rotate. The service client (`lib/supabase/admin.ts`) is the execution arm —
 * every write below has already been justified by that re-read.
 *
 * Hardening inherited from the edge (restated so a refactor cannot drop it):
 * CSRF double-submit on POST, a dedicated `team` rate bucket
 * (`policy.json → rateLimits.team`), and schema bounds on every field before
 * any query runs. The plaintext invite code crosses this API exactly once — in
 * the response that creates it; the table keeps only its hash.
 */

import { NextResponse } from 'next/server';

import {
  AUTH_COOKIE,
  actorNameFor,
  currentIdentity,
  ownerSessionCookie,
  resolveMembership,
  sealOwnerSession,
  getSessionUser,
  type ConsoleIdentity,
} from '@/lib/auth';
import { transportForRequest } from '@/lib/security/transport';
import { sessionVerificationSecret } from '@/lib/security/session';
import { cleanLine } from '@/lib/security/validation';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { mintInviteCode } from '@/lib/team/codes';
import { appRoleForMembership, isInvitableRole, membershipRoleForApp } from '@/lib/team/roles';
import { ROLE_LABELS } from '@/lib/security/rbac';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_LABEL = 60;
const MAX_MEMBERS_SHOWN = 100;
const MAX_PENDING_INVITES = 25;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // three days at the counter

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

/**
 * The identity, healed if the cookie is behind the database. A brand-new owner
 * signs in *before* their business row exists, so their first cookie is
 * unscoped; the browser sync then creates the business (and, with the schema
 * trigger, their owner membership). Without this reconciliation the console
 * would keep treating them as unscoped until the cookie rotated — the "the app
 * doesn't know I'm the owner" report. One extra lookup, only when unscoped.
 */
async function healedIdentity(): Promise<{ identity: ConsoleIdentity; refreshed: ReturnType<typeof sealOwnerSession> extends Promise<infer T> ? T : never } | { identity: ConsoleIdentity; refreshed: null } | null> {
  const identity = await currentIdentity();
  if (!identity) return null;
  if (identity.tenantId || identity.provider === 'local') return { identity, refreshed: null };

  const user = await getSessionUser();
  if (!user) return { identity, refreshed: null };
  const membership = await resolveMembership(user.id);
  if (!membership) return { identity, refreshed: null };

  // No usable signing key means the heal cannot complete — but the team screen
  // still can. Return the identity as it stands rather than letting the mint
  // throw: the configuration gap is reported at sign-in, at start-up, and on
  // /api/health, not as a 500 on a page that was working.
  if (sessionVerificationSecret() === null) return { identity, refreshed: null };

  const issued = await sealOwnerSession({
    userId: user.id,
    tenantId: membership.tenantId,
    role: membership.role,
    displayName: actorNameFor(user.email),
    remember: true,
  });
  return {
    identity: {
      provider: 'supabase',
      userId: user.id,
      tenantId: membership.tenantId,
      role: membership.role,
      displayName: actorNameFor(user.email),
      expiresAt: issued.claims.exp,
      remember: true,
    },
    refreshed: issued,
  };
}

/** The caller's role *in this business*, from the database — never the cookie. */
async function callerRoleIn(admin: SupabaseClient, tenantId: string, userId: string): Promise<ReturnType<typeof appRoleForMembership> | null> {
  if (!UUID_RE.test(userId)) return null;
  const { data, error } = await admin
    .from('business_members')
    .select('role')
    .eq('business_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return appRoleForMembership((data as { role?: unknown }).role);
}

/** Best-effort audit note: the owner reads *who did what* on the Audit screen. */
async function audit(admin: SupabaseClient, entry: { tenantId: string; actorUserId: string; action: string; entityId?: string | null; details?: Record<string, unknown> }) {
  try {
    await admin.from('audit_logs').insert({
      business_id: entry.tenantId,
      actor_user_id: UUID_RE.test(entry.actorUserId) ? entry.actorUserId : null,
      entity_type: 'team',
      entity_id: entry.entityId && UUID_RE.test(entry.entityId) ? entry.entityId : null,
      action: entry.action,
      details: entry.details ?? null,
    });
  } catch {
    // The audit trail must never break the action it is describing.
  }
}

export async function GET(request: Request) {
  const healed = await healedIdentity();
  if (!healed) return json({ ok: false, error: 'Sign-in required.' }, 401);
  const { identity, refreshed } = healed;

  const respond = (body: unknown, status = 200): NextResponse => {
    const response = json(body, status);
    if (refreshed) {
      response.cookies.set(AUTH_COOKIE, refreshed.value, ownerSessionCookie(transportForRequest(request), refreshed.maxAge));
    }
    return response;
  };

  const admin = getServiceRoleClient();
  if (!admin) {
    return respond({
      ok: true,
      state: 'local',
      message: 'Team accounts need sync. Connect Supabase in Settings → Environment setup, then each teammate signs in with their own email.',
    });
  }
  if (!identity.tenantId) {
    return respond({
      ok: true,
      state: 'unscoped',
      message: 'This account is not part of a business yet.',
    });
  }

  const role = await callerRoleIn(admin, identity.tenantId, identity.userId);
  if (role !== 'owner') {
    return respond({ ok: true, state: 'readonly', role: role ?? identity.role, roleLabel: ROLE_LABELS[role ?? identity.role] });
  }

  const [businessResult, memberResult, inviteResult] = await Promise.all([
    admin.from('businesses').select('name').eq('id', identity.tenantId).maybeSingle(),
    admin
      .from('business_members')
      .select('user_id, role, created_at')
      .eq('business_id', identity.tenantId)
      .order('created_at', { ascending: true })
      .limit(MAX_MEMBERS_SHOWN),
    admin
      .from('team_invites')
      .select('id, label, role, expires_at, created_at')
      .eq('business_id', identity.tenantId)
      .is('used_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_PENDING_INVITES),
  ]);

  // An unavailable table is not an empty roster. In particular, a deployment
  // missing team_invites must not claim that invitations are ready to use.
  if (businessResult.error || memberResult.error || inviteResult.error || !businessResult.data ||
      !Array.isArray(memberResult.data) || !Array.isArray(inviteResult.data)) {
    return respond({ ok: false, code: 'team-data-unavailable', error: 'Could not read the team. Please try again.' }, 503);
  }

  const business = businessResult.data;
  const members = memberResult.data;
  const invites = inviteResult.data;
  const memberRows = members;
  const renderedMembers = await Promise.all(
    memberRows.slice(0, MAX_MEMBERS_SHOWN).map(async (row) => {
      const record = row as { user_id?: unknown; role?: unknown; created_at?: unknown };
      const userId = typeof record.user_id === 'string' ? record.user_id : '';
      let email: string | null = null;
      if (UUID_RE.test(userId)) {
        try {
          const { data } = await admin.auth.admin.getUserById(userId);
          email = data?.user?.email ?? null;
        } catch {
          email = null; // a missing auth record hides rather than breaks the list
        }
      }
      const appRole = appRoleForMembership(record.role);
      return {
        userId,
        email,
        role: appRole,
        roleLabel: ROLE_LABELS[appRole],
        you: userId === identity.userId,
        addedAt: typeof record.created_at === 'string' ? record.created_at : null,
      };
    }),
  );

  return respond({
    ok: true,
    state: 'ready',
    business: { name: (business as { name?: unknown } | null)?.name ?? null },
    members: renderedMembers,
    invites: (Array.isArray(invites) ? invites : []).map((row) => {
      const invite = row as { id?: unknown; label?: unknown; role?: unknown; expires_at?: unknown; created_at?: unknown };
      const appRole = appRoleForMembership(invite.role);
      return {
        id: typeof invite.id === 'string' ? invite.id : '',
        label: typeof invite.label === 'string' ? invite.label : null,
        role: appRole,
        roleLabel: ROLE_LABELS[appRole],
        expiresAt: typeof invite.expires_at === 'string' ? invite.expires_at : null,
        createdAt: typeof invite.created_at === 'string' ? invite.created_at : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'Request body is too large.' }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return json({ ok: false, error: 'Expected a JSON body.' }, 400);
  }
  const body = payload as { action?: unknown; role?: unknown; label?: unknown; inviteId?: unknown; userId?: unknown } | null;

  const healed = await healedIdentity();
  if (!healed) return json({ ok: false, error: 'Sign-in required.' }, 401);
  const { identity, refreshed } = healed;

  const respond = (out: unknown, status = 200): NextResponse => {
    const response = json(out, status);
    if (refreshed) {
      response.cookies.set(AUTH_COOKIE, refreshed.value, ownerSessionCookie(transportForRequest(request), refreshed.maxAge));
    }
    return response;
  };

  const admin = getServiceRoleClient();
  if (!admin) return respond({ ok: false, state: 'local', error: 'Team accounts need sync. Connect Supabase in Settings → Environment setup first.' }, 503);
  if (!identity.tenantId) return respond({ ok: false, error: 'Finish setting up your business first (open the console once while online).' }, 409);

  // The decision that matters: owner, per the database, in this business.
  const callerRole = await callerRoleIn(admin, identity.tenantId, identity.userId);
  if (callerRole !== 'owner') return respond({ ok: false, error: 'Only the owner can manage the team.' }, 403);

  switch (body?.action) {
    case 'invite': {
      if (!isInvitableRole(body.role)) {
        return respond({ ok: false, error: 'Invites can grant Manager, Cashier, or Auditor — a second Owner is an ownership transfer, not an invite.' }, 422);
      }
      const label = cleanLine(body.label, MAX_LABEL);

      // A busy shop holds a handful of pending codes; a hundred means a loop.
      const { count, error: countError } = await admin
        .from('team_invites')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', identity.tenantId)
        .is('used_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString());
      if (countError || count === null) return respond({ ok: false, code: 'team-data-unavailable', error: 'Could not create the invite. Please try again.' }, 503);
      if (count >= MAX_PENDING_INVITES) {
        return respond({ ok: false, error: 'Too many open invites. Revoke one you no longer need first.' }, 429);
      }

      const { code, hash } = await mintInviteCode();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
      const { data: created, error } = await admin
        .from('team_invites')
        .insert({
          business_id: identity.tenantId,
          role: membershipRoleForApp(body.role),
          code_hash: hash,
          label: label || null,
          created_by: UUID_RE.test(identity.userId) ? identity.userId : null,
          expires_at: expiresAt,
        })
        .select('id')
        .single();
      if (error || !created) return respond({ ok: false, error: 'Could not create the invite. Please try again.' }, 500);

      const inviteId = String((created as { id?: unknown }).id ?? '');
      await audit(admin, {
        tenantId: identity.tenantId,
        actorUserId: identity.userId,
        action: 'team.invite.created',
        entityId: inviteId,
        details: { role: body.role, label: label || undefined },
      });
      return respond({ ok: true, invite: { id: inviteId, code, role: body.role, roleLabel: ROLE_LABELS[body.role], label: label || null, expiresAt } });
    }

    case 'revoke': {
      const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';
      if (!UUID_RE.test(inviteId)) return respond({ ok: false, error: 'Unknown invite.' }, 422);
      const { data: revoked, error } = await admin
        .from('team_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId)
        .eq('business_id', identity.tenantId)
        .is('used_at', null)
        .is('revoked_at', null)
        .select('id')
        .maybeSingle();
      if (error) return respond({ ok: false, error: 'Could not revoke the invite.' }, 500);
      if (!revoked) return respond({ ok: false, error: 'Unknown invite.' }, 404);
      await audit(admin, { tenantId: identity.tenantId, actorUserId: identity.userId, action: 'team.invite.revoked', entityId: inviteId });
      return respond({ ok: true, inviteId });
    }

    case 'remove': {
      const userId = typeof body.userId === 'string' ? body.userId : '';
      if (!UUID_RE.test(userId)) return respond({ ok: false, error: 'Unknown teammate.' }, 422);
      if (userId === identity.userId) return respond({ ok: false, error: 'You cannot remove yourself. Transfer ownership first, or use a second owner account.' }, 422);

      const targetRole = await callerRoleIn(admin, identity.tenantId, userId);
      if (targetRole === null) return respond({ ok: false, error: 'That person is not on your team.' }, 404);
      if (targetRole === 'owner') return respond({ ok: false, error: 'The owner cannot be removed from their own business here.' }, 422);

      const { data: removed, error } = await admin.from('business_members')
        .delete()
        .eq('business_id', identity.tenantId)
        .eq('user_id', userId)
        // The preflight role check is not atomic with a deletion. The query
        // itself must preserve an Owner if roles changed in the meantime.
        .neq('role', 'owner')
        .select('user_id')
        .maybeSingle();
      if (error) return respond({ ok: false, error: 'Could not remove the teammate.' }, 500);
      if (!removed) return respond({ ok: false, error: 'That person is not on your team.' }, 409);
      await audit(admin, {
        tenantId: identity.tenantId,
        actorUserId: identity.userId,
        action: 'team.member.removed',
        details: { removedUserId: userId, removedRole: targetRole },
      });
      return respond({ ok: true, userId });
    }

    case 'role': {
      const userId = typeof body.userId === 'string' ? body.userId : '';
      if (!UUID_RE.test(userId)) return respond({ ok: false, error: 'Unknown teammate.' }, 422);
      if (userId === identity.userId) return respond({ ok: false, error: 'You cannot change your own role.' }, 422);
      if (!isInvitableRole(body.role)) return respond({ ok: false, error: 'Roles can be Manager, Cashier, or Auditor. Ownership transfer is a separate, deliberate step.' }, 422);
      const targetRole = await callerRoleIn(admin, identity.tenantId, userId);
      if (targetRole === null) return respond({ ok: false, error: 'That person is not on your team.' }, 404);
      if (targetRole === 'owner') return respond({ ok: false, error: 'Roles can be Manager, Cashier, or Auditor. Ownership transfer is a separate, deliberate step.' }, 422);

      const { data: updated, error } = await admin
        .from('business_members')
        .update({ role: membershipRoleForApp(body.role), updated_at: new Date().toISOString() })
        .eq('business_id', identity.tenantId)
        .eq('user_id', userId)
        .neq('role', 'owner')
        .select('user_id')
        .maybeSingle();
      if (error) return respond({ ok: false, error: 'Could not change the role.' }, 500);
      if (!updated) return respond({ ok: false, error: 'That person is not on your team.' }, 409);
      await audit(admin, {
        tenantId: identity.tenantId,
        actorUserId: identity.userId,
        action: 'team.member.role_changed',
        details: { userId, role: body.role },
      });
      return respond({ ok: true, userId, role: body.role, roleLabel: ROLE_LABELS[body.role] });
    }

    default:
      return respond({ ok: false, error: 'Unknown action.' }, 422);
  }
}
