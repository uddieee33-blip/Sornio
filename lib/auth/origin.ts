/**
 * The origin our own outbound links should come back to.
 *
 * Three consumers, one answer: the email-confirmation link, the password-recovery
 * link, and the CSP/`Permissions-Policy` decisions in `lib/security/headers.ts`
 * all have to agree on who this deployment *is*. If they do not, a confirmation
 * link lands on the wrong host, the code is already spent, and the only symptom
 * is an owner who cannot get in — the kind of failure that reads as a Supabase
 * bug and is really a configuration one.
 *
 * `NEXT_PUBLIC_APP_URL` wins when it is set and well-formed, because Supabase
 * validates a redirect against the project's allow-list and only the canonical
 * origin is on it. Otherwise the request's own origin is used, which is what makes
 * a preview deployment work without touching anybody's config. A `localhost`
 * default keeps `npm run dev` honest rather than throwing at the first sign-in.
 */

const PLACEHOLDER_ORIGINS = ['your-project', 'your_project'];

function usable(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (PLACEHOLDER_ORIGINS.some((placeholder) => trimmed.includes(placeholder))) return null;
  return trimmed;
}

export function appOrigin(request?: { url: string | URL } | null): string {
  const configured = usable(process.env.NEXT_PUBLIC_APP_URL ?? '');
  if (configured) return configured;
  if (request) {
    try {
      const fromRequest = usable(new URL(request.url).origin);
      if (fromRequest) return fromRequest;
    } catch {
      // A relative or malformed URL simply means "no opinion"; fall through.
    }
  }
  return 'http://localhost:3000';
}

/**
 * Where a provider link should land.
 *
 * Always the callback route, never the destination itself: the single-use code
 * has to be redeemed by the server (see `app/api/auth/callback/route.ts`), and the
 * destination travels with it as a validated `next`.
 */
export function callbackUrl(next: string, request?: { url: string | URL } | null): string {
  const target = new URL('/api/auth/callback', appOrigin(request));
  // Assembled with `URL` rather than a template literal: a half-built link reads
  // to a phrase extractor exactly like a sentence does, and this one is not copy.
  target.searchParams.set('next', next);
  return target.toString();
}
