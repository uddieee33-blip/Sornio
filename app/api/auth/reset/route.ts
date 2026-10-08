/**
 * Password recovery.
 *
 *   POST { email } → an email with a single-use reset link, or a plain statement
 *   that this build has no mail to send.
 *
 * Two rules that matter more here than anywhere else in the API:
 *
 *   1. **One answer for every outcome.** Whether the address has an account, has
 *      none, or was just rate-limited by the provider, the response body is the
 *      same. A login form that says "no such user" is a signup form for other
 *      people's accounts; a *recovery* form is worse, because it hands an attacker
 *      a free, unauthenticated list of who banks with you. The message that goes
 *      to a real owner — "check your inbox, and check spam" — costs nothing.
 *   2. **Nothing is sent twice in a minute to the same address.** A forgotten
 *      password is exactly the moment a person hits "Send" three times, and each
 *      attempt is a real email against a real quota. A tight per-address bucket
 *      absorbs the double-tap; the edge's `auth` bucket absorbs a scripted run.
 *
 * In local-first mode there is no account to reset and no provider to mail, so
 * the endpoint says that, and points at the secret this device *does* have: the
 * counter PIN, set on the Security page.
 */

import { NextResponse } from 'next/server';

import { getGuardedServerClient } from '@/lib/security/guard';
import { cleanLine, isEmail } from '@/lib/security/validation';
import { clientFingerprint, consume } from '@/lib/security/rate-limit';
import { callbackUrl } from '@/lib/auth';

const MAX_BODY_BYTES = 4 * 1024;

/** Three requests an hour to one address is generous for a human, useless for a script. */
const RESET_RULE = { limit: 3, windowMs: 60 * 60_000 };

const SENT_MESSAGE = 'If that address has an account, a reset link is on its way. It expires in one hour.';

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

/** The identical shape for "sent" and for "we will not tell you either way". */
function indistinguishable(extra: Record<string, unknown> = {}): NextResponse {
  return json({ ok: true, message: SENT_MESSAGE, ...extra });
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

  const email = cleanLine((payload as { email?: unknown } | null)?.email, 254);
  if (!isEmail(email)) {
    // Not a valid address, so nothing could be mailed to it either way. The
    // refusal is about the format, never about whether an account exists.
    return json({ ok: false, error: 'Enter a valid email address.' }, 422);
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '';
  const fingerprint = clientFingerprint({ ip, userAgent: request.headers.get('user-agent') });
  const budget = consume(`auth-reset:${fingerprint}:${email.toLowerCase()}`, RESET_RULE);
  if (!budget.allowed) {
    const minutes = Math.max(1, Math.ceil(budget.retryAfter / 60));
    const response = json({ ok: false, error: `Too many requests. Try again in ${minutes} minutes.` }, 429);
    // Both spellings of the same sentence: `Retry-After` for a client that reads
    // headers, the message for the owner reading the screen.
    response.headers.set('retry-after', String(budget.retryAfter));
    return response;
  }

  const client = await getGuardedServerClient();
  if (!client) {
    // No provider means no account, so there is nothing to be discreet about:
    // saying so plainly is the only honest answer, and the flat "check your
    // inbox" line would be a lie. The enumeration rule above protects a real
    // deployment's users, not a demo build's imaginary ones.
    return json({
      ok: true,
      delivered: false,
      code: 'no-provider',
      message: 'This build has no auth provider, so there is no account to reset. The secret on this device is the counter PIN, which is set on the Security page.',
    });
  }

  try {
    // The provider's own answer is deliberately discarded. It distinguishes "no
    // such user" from "sent", and that distinction is exactly what must not reach
    // a browser. `redirectTo` is validated by the project's allow-list; the link
    // comes back to our callback, which mints the session and honours `next`.
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl('/security?reset=1', request),
    });
  } catch {
    // A provider we cannot reach has to look identical from the outside, or the
    // endpoint becomes an uptime probe with an email attached. Reporting failure
    // would also tell a real owner their address *is* registered.
  }

  return indistinguishable({ delivered: true });
}
