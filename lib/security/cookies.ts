/**
 * How a response is allowed to carry a cookie.
 *
 * Two things decide it, and both are facts about the request rather than
 * preferences:
 *
 *   1. **Can this deployment be framed by another site?** The preview is loaded
 *      inside a cross-site frame. A `SameSite=Lax` cookie is refused outright in
 *      that context — the browser stores nothing at all, not even for the origin
 *      that set it — so the console's CSRF cookie never existed, the sign-in POST
 *      arrived without its token, and the owner was told "Missing CSRF cookie."
 *   2. **Is the connection actually secure?** `SameSite=None` must be paired with
 *      `Secure`, and a `Secure` cookie is refused over plain HTTP. Local
 *      development is plain HTTP on a loopback address, which the browser treats
 *      as trustworthy but the cookie rules do not, so the local case keeps the
 *      same-origin shape it has always had.
 *
 * Measured in a cross-site frame over HTTPS, not assumed:
 *
 *   SameSite=Lax                       → refused
 *   SameSite=None (no Secure)          → refused
 *   SameSite=None; Secure              → stored
 *   SameSite=None; Secure; Partitioned → stored, partitioned to the embedder
 *
 * So the preview gets the third shape. `Partitioned` (CHIPS) is preferred over a
 * bare `SameSite=None` because it costs nothing here and is where browsers are
 * going: the cookie stays keyed to the site that framed us, so one embedder
 * cannot read a cookie another embedder set, and it survives the browsers that
 * block third-party cookies outright.
 *
 * Strict posture is deliberately excluded from all of this. A real deployment
 * refuses framing (`frame-ancestors 'self'`), nothing cross-site can reach it,
 * and `SameSite=Lax` is the tighter answer there.
 */

/**
 * This module deliberately imports nothing. The plans layer imports only its
 * *type*, and `verify:billing` compiles that layer standalone with a minimal
 * tsconfig — so anything imported here would have to compile there too, and
 * `lib/security/headers.ts` reads `policy.json`, which that tsconfig has no
 * `resolveJsonModule` for. The request-level decision lives in
 * `lib/security/transport.ts`.
 */
export type CookieTransport = {
  secure: boolean;
  sameSite: 'lax' | 'none';
  /**
   * Always present, never optional: `exactOptionalPropertyTypes` would let an
   * `undefined` slip past the cookie serializer as "absent", and "absent" here
   * means a cookie a framing-hostile browser throws away.
   */
  partitioned: boolean;
};

/** A real deployment: HTTPS, never framed, same-site navigation only. */
const STRICT_TRANSPORT: CookieTransport = { secure: true, sameSite: 'lax', partitioned: false };
/** A preview: HTTPS, possibly framed — works framed *and* top-level. */
const PREVIEW_TRANSPORT: CookieTransport = { secure: true, sameSite: 'none', partitioned: true };
/** Plain-HTTP local development, where `Secure` would be refused outright. */
const LOCAL_TRANSPORT: CookieTransport = { secure: false, sameSite: 'lax', partitioned: false };

/**
 * Hosts that are only ever reached over TLS, whatever this process sees.
 *
 * The preview platform terminates TLS at its edge and speaks plain HTTP to the
 * sandbox, so `x-forwarded-proto` is the honest answer when it is present. These
 * are the fallback for when it is not: nobody browses to a bare-`http://`
 * `.e2b.app` or `.arena.ai` address, and getting this wrong is not cosmetic — it
 * is the difference between a console that signs in and one that reports a
 * missing CSRF cookie.
 */
const ALWAYS_TLS_HOSTS = ['.e2b.app', '.arena.ai'];

/** `host` or `x-forwarded-host`, lowercased and stripped of its port. */
export function hostnameOf(headers: Headers): string {
  const raw = headers.get('x-forwarded-host') ?? headers.get('host') ?? '';
  return raw.split(',')[0]?.trim().toLowerCase().replace(/:\d+$/, '') ?? '';
}

export function isAlwaysTlsHost(hostname: string): boolean {
  return ALWAYS_TLS_HOSTS.some((suffix) => hostname.endsWith(suffix));
}

/** Did this request come from a browser that is talking HTTPS? */
export function requestIsHttps(headers: Headers, protocol?: string | null): boolean {
  // The host settles it first, and deliberately so. Measured: when a proxy in
  // front stays silent about the scheme, Next.js fills in
  // `x-forwarded-proto: http` on its own — so "the header says http" cannot be
  // told apart from "nobody said anything", and trusting it produced
  // `SameSite=Lax` cookies behind a TLS terminator, which is the exact failure
  // this module exists to prevent. A host that is only ever reachable over TLS
  // is the more truthful signal.
  if (isAlwaysTlsHost(hostnameOf(headers))) return true;
  // Otherwise a TLS terminator may sit in front of the app (a load balancer,
  // `next start` behind nginx), and its word beats ours.
  const forwarded = (headers.get('x-forwarded-proto') ?? '').split(',')[0]?.trim().toLowerCase();
  if (forwarded === 'https') return true;
  if (forwarded === 'http') return false;
  return protocol === 'https:';
}

/**
 * Structural on purpose: `'strict' | 'embed'` is the same union
 * `SecurityPosture` is, without importing the module that declares it.
 */
export type PostureName = 'strict' | 'embed';

export function cookieTransport(input: { posture: PostureName; https: boolean }): CookieTransport {
  if (input.posture === 'strict') return STRICT_TRANSPORT;
  return input.https ? PREVIEW_TRANSPORT : LOCAL_TRANSPORT;
}
