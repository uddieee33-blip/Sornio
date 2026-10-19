/**
 * Server start-up — the first place a broken deployment is told what is wrong,
 * before an owner has to discover it at the sign-in door.
 *
 * `register()` runs once per server instance: `next dev`, `next start`, and
 * each Node boot on the deployment host. The check it runs is the one the
 * runtime enforces everywhere else — `DUKAANOS_SESSION_SECRET`, at least 32
 * characters, read from the server-side environment only
 * (`lib/security/session.ts` is the single definition).
 *
 * A misconfiguration is **logged, never thrown**, and that is deliberate: a
 * boot-time throw turns one missing variable into a site-wide 500 that serves
 * no HTML, no `/api/health`, and no sign-in screen — the three surfaces that
 * can tell the owner exactly what to fix. The runtime already fails closed
 * where it matters: nothing is minted or verified without the key, and every
 * session door answers with the same sentence this log line carries. What is
 * logged is the *state* and the fix — never a secret value, not a length, not
 * a hash.
 */

import { sessionSecretConfigError, sessionSecretState } from '@/lib/security/session';

export async function register(): Promise<void> {
  // Both runtimes load this module; the secret is only ever read by Node
  // handlers and the request proxy, so one diagnostic per Node process is
  // exactly one too few rather than one per runtime bundle.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const state = sessionSecretState();
  if (state === 'missing' || state === 'short') {
    console.error(`[dukaanos] ${sessionSecretConfigError()}`);
    console.error(
      '[dukaanos] Generate one with `openssl rand -hex 32`, set DUKAANOS_SESSION_SECRET in the host’s environment (on Vercel: Settings → Environment Variables — checked for Production *and* Preview), then redeploy.',
    );
  } else if (state === 'fallback') {
    console.warn(
      '[dukaanos] DUKAANOS_SESSION_SECRET is not set; development is signing sessions with a per-host fallback key. Production refuses to open sessions without a 32+ character secret.',
    );
  }
}
