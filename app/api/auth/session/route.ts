/**
 * The session endpoint — the only place a DukaanOS session is created or ended.
 *
 *   GET    → who is at this console, if anybody. Safe to call anonymously.
 *   POST   → `sign-in` / `sign-up`, and an `httpOnly` session cookie on success.
 *   DELETE → sign out: the provider session on this device, then the app cookie.
 *
 * What is deliberately *not* here, and why:
 *
 *   • **No token, ever.** The response carries a display name, a role, and an
 *     expiry — the three things the console renders. Supabase's access and
 *     refresh tokens stay in the cookies the provider set. A page that can read
 *     a refresh token is a page where one XSS payload is a persistent account
 *     takeover; a page that can read a display name is a page that can show it.
 *   • **No credential logging.** `password` is read out of the body once, handed
 *     to the provider inside this function, and never written to a log, a toast,
 *     an audit entry, or an error message. Nothing here calls `console.log` with
 *     the payload, and `lib/security/redact.ts` would scrub it anyway — the
 *     reason it is *also* never interpolated is that a scrubber is a safety net,
 *     not a plan.
 *   • **No local password store.** In local-first mode there is no provider to
 *     ask, and pretending to check a password against a hash in this browser
 *     would sell a guarantee the app cannot keep — the whole device is the
 *     attacker's in that scenario, which is what the counter PIN and the vault in
 *     `lib/security/` are for. So the endpoint says what it did: it opened a
 *     session on this device. The sign-in screen labels it demo mode, and the
 *     README says it plainly.
 *
 * Hardening inherited from the edge (restated so a refactor cannot drop it):
 * CSRF double-submit on POST/DELETE, a dedicated `auth` bucket (12 a minute per
 * client, `lib/security/policy.json`), and the credential-stuffing penalty box
 * behind it. The client-side throttle on the sign-in screen is courtesy; this is
 * the limit.
 */

import { NextResponse } from 'next/server';

import { getGuardedServerClient } from '@/lib/security/guard';
import { transportForRequest } from '@/lib/security/transport';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { LIMITS, cleanLine, isEmail, passwordStrength } from '@/lib/security/validation';
import {
  AUTH_COOKIE,
  actorNameFor,
  clearedOwnerSession,
  currentIdentity,
  callbackUrl,
  localOwnerSession,
  ownerSessionCookie,
  renderable,
  resolveMembership,
  safeNext,
  sealOwnerSession,
} from '@/lib/auth';

/** An email is capped at 254 by RFC 5321; a password longer than this is a bug. */
const MAX_BODY_BYTES = 8 * 1024;

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

/**
 * Supabase's words, ours to say.
 *
 * The provider's `Invalid login credentials` is correct but reads like a log
 * line, and it is the one message that must never be more specific than "these
 * two do not match" — naming which half is wrong is how a login form turns into an
 * account enumerator. Anything unrecognised is passed through, because a project
 * with email confirmation or a lockout policy has something real to report.
 */
function signInMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first — the link was sent to that address.';
  return message;
}

/** Sign-up shares the same flat refusal, so a taken address is not an oracle. */
function signUpMessage(message: string): string {
  if (/already been registered|already exists|user already/i.test(message)) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  return signInMessage(message);
}

/** Everything the fields have to survive before any network call is made. */
function readCredentials(payload: unknown): { email: string; password: string; remember: boolean } | string {
  const body = payload as { email?: unknown; password?: unknown; remember?: unknown } | null;
  const email = cleanLine(body?.email, 254);
  if (!isEmail(email)) return 'Enter a valid email address.';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < LIMITS.minPassword) return `Password must be at least ${LIMITS.minPassword} characters.`;
  return { email, password, remember: body?.remember !== false };
}

/** GET — report the identity, mutate nothing. */
export async function GET() {
  const identity = await currentIdentity();
  return json({
    ok: true,
    signedIn: identity !== null,
    mode: isSupabaseConfigured() ? 'supabase' : 'local',
    identity: renderable(identity),
  });
}

export async function POST(request: Request) {
  // Bounded before parsing: this endpoint is reachable anonymously by design, and
  // a 40 MB body is a denial of service even when the answer is 401.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'Request body is too large.' }, 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return json({ ok: false, error: 'Expected a JSON body.' }, 400);
  }

  const action = (payload as { action?: unknown } | null)?.action;
  if (action !== 'sign-in' && action !== 'sign-up') {
    return json({ ok: false, error: 'Unknown action.' }, 422);
  }

  const credentials = readCredentials(payload);
  if (typeof credentials === 'string') return json({ ok: false, error: credentials }, 422);

  const { email, password, remember } = credentials;
  const requested = (payload as { next?: unknown } | null)?.next;
  const transport = transportForRequest(request);
  const client = await getGuardedServerClient();

  // ---- Local-first: no provider, so the session is the device's own. ----
  if (!client) {
    // A password is checked for *shape* here and nothing more, because there is
    // nothing to check it against. A weak one is refused so the demo does not
    // teach an owner a habit that will fail them on a real deployment.
    if (action === 'sign-up' && passwordStrength(password).score < 2) {
      return json({ ok: false, error: 'Choose a stronger password. Mix upper case, a number, and a symbol.' }, 422);
    }
    const issued = await localOwnerSession(email, actorNameFor(email), { remember });
    const response = json({
      ok: true,
      action,
      mode: 'local',
      provider: 'local',
      next: safeNext(requested, '/onboarding'),
      identity: renderable({
        provider: 'local',
        userId: issued.claims.userId,
        tenantId: issued.claims.tenantId,
        role: issued.claims.role,
        displayName: issued.claims.displayName,
        expiresAt: issued.claims.exp,
        remember,
      }),
    });
    response.cookies.set(AUTH_COOKIE, issued.value, ownerSessionCookie(transport, issued.maxAge));
    return response;
  }

  // ---- Hosted: the provider decides, and only the provider sees the password. ----
  try {
    let user: { id: string; email?: string | null } | null = null;

    if (action === 'sign-up') {
      // The confirmation link comes back to our callback, which redeems the code
      // and mints the session. Without `emailRedirectTo` the owner lands on the
      // project's site URL with a spent code in the query string and no idea why
      // nothing happened.
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl(safeNext(requested, '/onboarding'), request) },
      });
      if (error) return json({ ok: false, code: 'sign-up-failed', error: signUpMessage(error.message) }, 401);

      // Email confirmation on means there is no session yet. Say so rather than
      // signing the owner in and letting them discover the difference later; the
      // confirm link comes back through `/api/auth/callback`, which mints the
      // session the same way this does.
      if (!data.session) {
        return json({ ok: true, action, mode: 'supabase', pending: 'email-confirmation' }, 202);
      }
      user = data.user ? { id: data.user.id, email: data.user.email } : null;
    } else {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return json({ ok: false, code: 'sign-in-failed', error: signInMessage(error.message) }, 401);
      user = data.user ? { id: data.user.id, email: data.user.email } : null;
    }

    if (!user) return json({ ok: false, code: 'sign-in-failed', error: 'Email or password is incorrect.' }, 401);

    // Tenant and role come from the database, never from the request. No
    // membership row is normal for a brand-new owner, and means "this device's
    // own business", which is why it resolves to owner rather than to nothing.
    const membership = await resolveMembership(user.id);
    const issued = await sealOwnerSession({
      userId: user.id,
      tenantId: membership?.tenantId ?? '',
      role: membership?.role ?? 'owner',
      displayName: actorNameFor(user.email ?? email),
      remember,
    });

    const response = json({
      ok: true,
      action,
      mode: 'supabase',
      provider: 'supabase',
      next: safeNext(requested, '/onboarding'),
      scoped: Boolean(membership?.tenantId),
      identity: renderable({
        provider: 'supabase',
        userId: user.id,
        tenantId: membership?.tenantId ?? '',
        role: issued.claims.role,
        displayName: issued.claims.displayName,
        expiresAt: issued.claims.exp,
        remember,
      }),
    });
    response.cookies.set(AUTH_COOKIE, issued.value, ownerSessionCookie(transport, issued.maxAge));
    return response;
  } catch {
    // No connection, a revoked project, an expired JWT signing key — the owner
    // needs to know the console is unusable *right now*, and the app must not
    // imply their password was wrong when nothing was checked.
    return json({ ok: false, code: 'unreachable', error: 'Could not reach the authentication service. Please try again.' }, 503);
  }
}

export async function DELETE(request: Request) {
  const response = json({ ok: true, signedIn: false, identity: null });
  response.cookies.set(AUTH_COOKIE, '', clearedOwnerSession(transportForRequest(request)));

  // The app cookie is cleared unconditionally, before anything else: an owner
  // pressing Sign out must never stay signed in because a network call failed.
  const client = await getGuardedServerClient();
  if (client) {
    try {
      // `local` scope: this device forgets the session, other devices keep theirs.
      // A shop that signs out of the counter tablet should not log the owner's
      // phone out of their own business.
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // Best-effort. The app cookie is already gone, which is the part that
      // decides whether this console still serves records.
    }
  }
  return response;
}
