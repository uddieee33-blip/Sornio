/**
 * Where every provider link lands: `GET /api/auth/callback?code=…`
 *
 * Email confirmation, password recovery, and any hosted sign-in all arrive here
 * as a single-use authorisation code, because the flow is PKCE — Supabase's SSR
 * client fixes `flowType: 'pkce'`, so there is no implicit token in a URL fragment
 * to catch and no token for the browser to hold.
 *
 * Redeeming it *here* rather than in the page is the point:
 *
 *   • the code is single-use, so whoever spends it owns the session. On the
 *     server, that means the auth cookie is set by the server with the server's
 *     attributes, and an attacker who phished the link still cannot read the
 *     cookies it produced;
 *   • the DukaanOS session is minted in the same response, so a confirmed owner
 *     lands *inside* the console instead of at a sign-in form asking for a
 *     password they just set;
 *   • `next` is validated through `safeNext` before it becomes a redirect. A
 *     callback endpoint that forwards its own query parameter anywhere is the
 *     classic open redirect, and it is the one redirect in this app that an
 *     attacker can make a victim follow by email.
 *
 * Every failure path ends at `/auth` with a fixed code — `link`, `local`, or
 * `unavailable` — never with provider text echoed into a query string. The
 * sign-in screen owns the wording; this route owns the honesty.
 */

import { NextResponse } from 'next/server';

import { getGuardedServerClient } from '@/lib/security/guard';
import { sessionVerificationSecret } from '@/lib/security/session';
import { transportForRequest } from '@/lib/security/transport';
import {
  AUTH_COOKIE,
  actorNameFor,
  ownerSessionCookie,
  resolveMembership,
  safeNext,
  sealOwnerSession,
  signInFallback,
} from '@/lib/auth';
import { storedSetupComplete } from '@/lib/sync/profile-server';

/** Codes `/auth` knows how to phrase. Adding one means adding the copy for it. */
const FAILURE_NOTICES = new Set(['link', 'local', 'unavailable', 'config']);

function toSignIn(code: string, from: URL): NextResponse {
  const safe = FAILURE_NOTICES.has(code) ? code : 'unavailable';
  const response = NextResponse.redirect(new URL(`/auth?error=${safe}`, from), 307);
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (code: string) => toSignIn(code, url);
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');
  // Held as the raw parameter until the owner is known: where a clicked link
  // lands depends on whether this account has anything left to set up, and that
  // answer only exists after the code is redeemed.
  const requested = url.searchParams.get('next');

  if (providerError) return fail('link');
  if (!code) return fail('link');

  // Refused before the code is spent: `exchangeCodeForSession` is single-use,
  // and a deployment that cannot sign the session that follows must not burn
  // the owner's one recovery link on a reply that hides the reason why. The
  // `config` notice carries the same sentence the sign-in door would.
  if (sessionVerificationSecret() === null) return fail('config');

  const client = await getGuardedServerClient();
  if (!client) return fail('local');

  try {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return fail('link');

    // Re-read the session rather than trusting that the exchange "must have"
    // worked: the cookies that carry it have to be on this response before the
    // app session is minted, or the owner is signed in for exactly one page view.
    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data?.user) return fail('link');

    const membership = await resolveMembership(data.user.id);
    const remember = true; // a clicked email link is an explicit "this is my device"
    const issued = await sealOwnerSession({
      userId: data.user.id,
      tenantId: membership?.tenantId ?? '',
      role: membership?.role ?? 'owner',
      displayName: actorNameFor(data.user.email),
      remember,
    });

    /*
     * Where the link lands, decided now that the owner is known.
     *
     * Recovery and confirmation are the two links a returning owner clicks most,
     * and both used to end at setup — so the shopkeeper who reset a password was
     * walked back through the three steps they had already filled in, bank
     * details and collection QR included, on the way to a console they had
     * already set up. The fallback is the same rule the sign-in endpoint applies:
     * an account whose stored profile is finished goes to the console, and only
     * an unfinished one goes to setup.
     */
    const target = safeNext(requested, signInFallback(await storedSetupComplete(data.user.id)));

    const response = NextResponse.redirect(new URL(target, url), 307);
    response.cookies.set(AUTH_COOKIE, issued.value, ownerSessionCookie(transportForRequest(request), issued.maxAge));
    response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    // A redirect that carries a session must never be cached by an intermediary:
    // one shared response would hand the next visitor somebody else's cookies.
    response.headers.set('vary', 'Cookie');
    return response;
  } catch {
    return fail('unavailable');
  }
}
