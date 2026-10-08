/**
 * The cookie shape for a request, decided once, near where the request arrives.
 *
 * Kept apart from `lib/security/cookies.ts` on purpose: that module holds the
 * shapes and imports nothing, so the plans layer can take its *type* without
 * pulling `lib/security/headers.ts` — and `policy.json` — into the standalone
 * compile `verify:billing` runs over that layer.
 */

import { resolvePosture } from './headers';
import { cookieTransport, requestIsHttps, type CookieTransport } from './cookies';

/** The transport for a request: posture from the environment, HTTPS from the request. */
export function transportForRequest(request: { headers: Headers; url: string }): CookieTransport {
  let protocol: string | null = null;
  try {
    protocol = new URL(request.url).protocol;
  } catch {
    // A request with an unparseable URL is not a reason to hand out a cookie
    // shape we cannot justify; fall back to the headers alone.
    protocol = null;
  }
  return cookieTransport({ posture: resolvePosture(), https: requestIsHttps(request.headers, protocol) });
}
