/**
 * The session endpoint — the only place a DukaanOS session is created or ended.
 *
 *   GET    → who is at this console, if anybody. Safe to call anonymously.
 *   POST   → `sign-in` / `sign-up` / `confirm`, and an `httpOnly` session cookie
 *            on success. `confirm` is the welcome door's "it is me": a password
 *            against the session this request already arrived with, no email.
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

import { getGuardedServerClient, getSessionUser } from '@/lib/security/guard';
import { sessionSecretConfigError, sessionVerificationSecret } from '@/lib/security/session';
import { transportForRequest } from '@/lib/security/transport';
import type { CookieTransport } from '@/lib/security/cookies';
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
  signInFallback,
} from '@/lib/auth';
import { PLAN_COOKIE, planCookieOptions, sealPlanRecord, type PlanRecord } from '@/lib/plans';
import { storedSetupComplete } from '@/lib/sync/profile-server';

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

/**
 * The confirmation door's own wording for a provider refusal.
 *
 * It differs from `signInMessage` in one place, and the reason is the field the
 * owner is looking at: this door has no email box, so "Email or password is
 * incorrect" would send them hunting for a half of the form that does not exist.
 * Everything else — a rate limit, an unconfirmed address — is the same sentence
 * the sign-in form uses, because it is the same provider saying it.
 */
function confirmMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That password did not match this account.';
  return signInMessage(message);
}

/**
 * `confirm` — the welcome door's "it is me".
 *
 * The door can prove the *browser* was signed in; it cannot prove who is reading
 * it. On a counter tablet left open overnight those are two different people, and
 * a bare "Continue" hands the second one the day's takings, the customer list and
 * the khata. So the door asks for the account password before it opens — the same
 * distinction the counter PIN and the owner-password gate in Settings are built
 * on, applied at the one moment it matters most.
 *
 * Two things this deliberately does not do:
 *
 *   • **It does not take an email.** The address is read from the provider
 *     session inside this request, so it never has to travel to the browser (the
 *     door shows `ki•••`, and that is all it has ever shown), and so this
 *     endpoint cannot be pointed at somebody else's account to test a password
 *     against it. What it confirms is always *this* session's owner.
 *   • **It does not re-decide the role.** A membership row that fails to load
 *     mid-request must not turn a cashier into an owner, which is what the
 *     `?? 'owner'` on the sign-in path would do here. Confirming refreshes the
 *     window on the session that already exists; anything it cannot re-read stays
 *     exactly as it was.
 *
 * On success the session is re-minted from the verified credentials, so the door
 * is not a ceremony: the cookie that opens the console was issued *after* the
 * password was checked, and the idle clock starts again from there.
 */
async function confirmSession(payload: unknown, requested: unknown, transport: CookieTransport): Promise<NextResponse> {
  const password = typeof (payload as { password?: unknown } | null)?.password === 'string' ? (payload as { password: string }).password : '';
  if (password.length < LIMITS.minPassword) {
    return json({ ok: false, error: `Password must be at least ${LIMITS.minPassword} characters.` }, 422);
  }

  const identity = await currentIdentity();
  if (!identity) {
    return json(
      { ok: false, code: 'confirm-session-ended', error: 'This device is signed out of the account. Sign in with your email and password to open the console.' },
      401,
    );
  }

  const client = await getGuardedServerClient();
  if (!client) {
    /*
     * Local-first: there is no provider to ask and nothing to compare against.
     * Inventing a password hash in the browser would sell a guarantee this app
     * refuses to sell — see the note at the top of this file — so the door falls
     * back to the console passcode this device owns, and the reply says plainly
     * that nothing was checked here. A misconfigured deployment must not look
     * like a wrong password.
     */
    return json(
      { ok: false, code: 'confirm-unavailable', error: 'This build has no account password to confirm. Use the console passcode set on this device.' },
      422,
    );
  }

  const user = await getSessionUser();
  // An app session with no provider session behind it is a session the provider
  // has already ended. Nothing can be confirmed against it, and the honest door
  // is the full sign-in form — which is what this code tells the screen to show.
  if (!user?.email) {
    return json(
      { ok: false, code: 'confirm-session-ended', error: 'This device is signed out of the account. Sign in with your email and password to open the console.' },
      401,
    );
  }

  try {
    const { error } = await client.auth.signInWithPassword({ email: user.email, password });
    if (error) return json({ ok: false, code: 'confirm-failed', error: confirmMessage(error.message) }, 401);

    const membership = await resolveMembership(user.id);
    // A provider-backed identity already carries a tenant and a role this
    // deployment vouched for; keep them if the row cannot be re-read right now.
    const carried = identity.provider === 'supabase';
    const tenantId = membership?.tenantId ?? (carried ? identity.tenantId : '');
    const role = membership?.role ?? (carried ? identity.role : 'owner');
    // `remember` is not re-asked: the promise this session was issued under is
    // the promise it keeps. Confirming who is typing must not quietly turn a
    // browser-session cookie into a two-week one.
    const remember = identity.remember;
    const issued = await sealOwnerSession({
      userId: user.id,
      tenantId,
      role,
      displayName: actorNameFor(user.email),
      remember,
    });

    const response = json({
      ok: true,
      action: 'confirm',
      mode: 'supabase',
      provider: 'supabase',
      confirmed: true,
      // Re-answered here, after the password was checked, for the same reason
      // the sign-in path answers it: the account row says whether this owner has
      // anything left to set up, and an owner who has finished goes to the
      // console rather than back through their own bank details.
      next: safeNext(requested, signInFallback(await storedSetupComplete(user.id))),
      scoped: Boolean(tenantId),
      identity: renderable({
        provider: 'supabase',
        userId: user.id,
        tenantId,
        role: issued.claims.role,
        displayName: issued.claims.displayName,
        expiresAt: issued.claims.exp,
        remember,
      }),
    });
    response.cookies.set(AUTH_COOKIE, issued.value, ownerSessionCookie(transport, issued.maxAge));

    return response;
  } catch {
    return json({ ok: false, code: 'unreachable', error: 'Could not reach the authentication service. Please try again.' }, 503);
  }
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
  if (action !== 'sign-in' && action !== 'sign-up' && action !== 'confirm') {
    return json({ ok: false, error: 'Unknown action.' }, 422);
  }

  // Minting is the fail-closed half of the session secret: a production
  // deployment without a usable DUKAANOS_SESSION_SECRET must not open sessions.
  // Say so in words — this is the one door an owner walks up to, and a bare 500
  // here (or the "could not reach the authentication service" catch below)
  // hides a configuration gap behind what looks like a network fault. The
  // sentence is shared with every other minting door and the start-up log
  // (`sessionSecretConfigError`), so the fix reads the same wherever it is met.
  if (sessionVerificationSecret() === null) {
    return json(
      {
        ok: false,
        code: 'sessions-disabled',
        error: sessionSecretConfigError(),
      },
      503,
    );
  }

  const requested = (payload as { next?: unknown } | null)?.next;
  const transport = transportForRequest(request);

  // Confirmation has no email to read, so it branches before the field check
  // rather than borrowing a validation that would refuse every request to it.
  if (action === 'confirm') return confirmSession(payload, requested, transport);

  const credentials = readCredentials(payload);
  if (typeof credentials === 'string') return json({ ok: false, error: credentials }, 422);

  const { email, password, remember } = credentials;
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
      // There is no account storage here to ask whether this owner is already
      // set up, so setup is the only honest destination — and on a local build
      // the screen it opens has the device's own vault to prefill from.
      next: safeNext(requested, signInFallback(false)),
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
    response.cookies.set(PLAN_COOKIE, '', { ...planCookieOptions(transport), maxAge: 0 });
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
        options: { emailRedirectTo: callbackUrl(safeNext(requested, signInFallback(false)), request) },
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

    // "Welcome back" has to mean something. An owner whose profile the account
    // already holds goes straight to the console; only an owner who has never
    // finished setup is sent to the setup screen. The answer comes from the
    // stored fields themselves, so a row that claims to be complete while
    // missing the UPI id every collection QR needs still gets setup.
    const fallback = signInFallback(await storedSetupComplete(user.id));
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
      next: safeNext(requested, fallback),
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
    response.cookies.set(PLAN_COOKIE, '', { ...planCookieOptions(transport), maxAge: 0 });
    if (membership) {
      try {
        const plan = await client.rpc('read_business_plan');
        if (!plan.error && plan.data) {
          const record = { ...plan.data, businessId: membership.tenantId } as PlanRecord;
          response.cookies.set(PLAN_COOKIE, await sealPlanRecord(record), planCookieOptions(transport));
        }
      } catch {
        // Login remains usable; /api/subscription restores the cache on retry.
      }
    }
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
  response.cookies.set(PLAN_COOKIE, '', { ...planCookieOptions(transportForRequest(request)), maxAge: 0 });

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
