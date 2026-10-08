/**
 * DukaanOS auth — public surface.
 *
 * Sign-in has two shapes and the app must be correct in both, because both are
 * real deployments:
 *
 *   • **Hosted** (real Supabase credentials): the password goes from the browser
 *     to *this* origin, one time, over TLS, and `POST /api/auth/session` performs
 *     the exchange with a server-bound client. Supabase's own auth cookie is
 *     therefore set by the server with the server's attributes, and the
 *     DukaanOS session cookie beside it is `httpOnly`. The page never holds a
 *     token, and the console can still say who is at the counter after a reload.
 *   • **Local-first** (placeholder credentials): there is no provider to ask. The
 *     session is still minted, still signed, still `httpOnly` — it is the
 *     device's own record that somebody opened this console, which is what the
 *     audit trail and the idle window need. What it is *not* is a password check,
 *     and every screen that can see the difference says so out loud.
 *
 * Import from `@/lib/auth` rather than reaching into single files.
 */

export {
  checkAuthAccess,
  isPublicPath,
  isSupabaseAuthCookieName,
  safeNext,
  signInDestination,
  DEFAULT_NEXT,
  type AuthGateInput,
  type AuthGateVerdict,
} from './routes';

export {
  AUTH_COOKIE,
  clearedOwnerSession,
  localOwnerSession,
  openOwnerSession,
  ownerSessionCookie,
  providerForClaims,
  sealOwnerSession,
  sessionFromCookies,
  sessionTtlSeconds,
  type IssuedSession,
  type OwnerSession,
  type SessionProvider,
} from './cookie';

export {
  actorNameFor,
  currentIdentity,
  renderable,
  resolveMembership,
  type ConsoleIdentity,
  type RenderedIdentity,
} from './identity';

export { appOrigin, callbackUrl } from './origin';

export type { AuthMode, AuthFailureNotice } from './types';

/**
 * The guarded provider access, re-exported so a caller that only wants "is
 * anybody signed in" does not have to know which guard module answers it.
 * `requireUser` throws a `status: 401` error for a route handler that has no
 * business serving a record to an anonymous request.
 */
export { getSessionUser, requireUser, type GuardedUser } from '@/lib/security/guard';

import { getGuardedServerClient } from '@/lib/security/guard';

/** True when this deployment can authenticate against Supabase at all. */
export async function authAvailable(): Promise<boolean> {
  return (await getGuardedServerClient()) !== null;
}
