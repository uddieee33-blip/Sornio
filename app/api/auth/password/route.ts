/**
 * Setting a new password on an account.
 *
 *   POST { password } → the provider updates it, and the session is rotated.
 *
 * This endpoint exists because a recovery link that only *signs you back in* is
 * not a recovery. If the link alone were enough, whoever read the mail would keep
 * the old password working — and the owner would have no reason, ever, to change
 * the thing that was actually compromised. So the flow this app generates is
 * "confirm the code → land on the Security page with a password field in front of
 * you → the account is only usable again once that field is filled".
 *
 * Two things happen on success, in this order:
 *
 *   1. the provider changes the password — the only place a password is written;
 *   2. the DukaanOS session is re-minted with a fresh `sid`. A password change is
 *      precisely the moment to stop trusting the token that was in circulation
 *      beforehand, even though the old one still *verifies* (an HMAC cannot be
 *      "unsaid"). The old cookie is replaced here, on the same response, so the
 *      rotation is not a promise about the next page load — it is this one.
 *
 * What is required first, in order: a live provider session (checked against the
 * provider, not against a cookie's existence), a password that clears the same
 * strength bar the signup form asks for, and the CSRF token the edge enforces for
 * every mutating request on `/api/*`.
 */

import { NextResponse } from 'next/server';

import { getGuardedServerClient } from '@/lib/security/guard';
import { resolvePosture } from '@/lib/security/headers';
import { LIMITS, passwordStrength } from '@/lib/security/validation';
import {
  AUTH_COOKIE,
  actorNameFor,
  ownerSessionCookie,
  resolveMembership,
  sealOwnerSession,
} from '@/lib/auth';

const MAX_BODY_BYTES = 4 * 1024;

/** A changed password should not inherit the session that came in with it. */
const NEW_SESSION_TTL_REMEMBER = true;

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
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

  const password = typeof (payload as { password?: unknown } | null)?.password === 'string'
    ? String((payload as { password: string }).password)
    : '';

  // The same bar as the sign-up form, checked here too — a client that skips the
  // form must not be able to set `password123` on a business's account.
  if (password.length < LIMITS.minPassword) {
    return json({ ok: false, error: `Password must be at least ${LIMITS.minPassword} characters.` }, 422);
  }
  if (passwordStrength(password).score < 2) {
    return json({ ok: false, error: 'Choose something stronger. Mix upper case, a number, and a symbol.' }, 422);
  }

  const client = await getGuardedServerClient();
  if (!client) {
    return json({
      ok: false,
      code: 'no-provider',
      error: 'This build has no account to change. The secret on this device is the counter PIN, which is set below.',
    }, 409);
  }

  try {
    const { data, error } = await client.auth.updateUser({ password });
    if (error) {
      return json({ ok: false, error: 'The password could not be changed. Request a fresh reset link and try again.' }, 400);
    }

    const userId = data.user?.id;
    if (!userId) return json({ ok: false, error: 'The password could not be changed. Request a fresh reset link and try again.' }, 400);

    const membership = await resolveMembership(userId);
    const issued = await sealOwnerSession({
      userId,
      tenantId: membership?.tenantId ?? '',
      role: membership?.role ?? 'owner',
      displayName: actorNameFor(data.user?.email),
      remember: NEW_SESSION_TTL_REMEMBER,
    });

    const response = json({ ok: true, changed: true });
    response.cookies.set(AUTH_COOKIE, issued.value, ownerSessionCookie(resolvePosture() === 'strict', issued.maxAge));
    return response;
  } catch {
    return json({ ok: false, code: 'unreachable', error: 'Could not reach the authentication service. Please try again.' }, 503);
  }
}
