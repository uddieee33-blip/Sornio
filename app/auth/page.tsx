import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import AuthForm from '@/components/auth/auth-form';
import { BrandWordmark } from '@/components/ui/BrandLogo';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { currentIdentity, renderable } from '@/lib/auth/identity';
import { safeNext } from '@/lib/auth/routes';
import { storedSetupComplete } from '@/lib/sync/profile-server';
import { isPlanId } from '@/lib/plans';
import type { BillingInterval } from '@/lib/plans';
import type { AuthFailureNotice } from '@/lib/auth/types';

/**
 * Sign-in, decided on the server.
 *
 * Four questions have answers that only exist before the first paint, which is
 * why this is a server component with a client form inside it rather than one
 * client page:
 *
 *   1. **Is somebody already signed in?** If they are, the screen is a door — but
 *      a door that still has to be earned. The session proves this *browser* was
 *      authenticated; it says nothing about who is standing at the counter now,
 *      and behind the door are the day's takings. So a door into the console asks
 *      for the account password (or this device's console passcode on a
 *      local-first build) before it opens, and a door into setup — an owner who
 *      has not finished — opens on its own, because there is nothing behind it to
 *      guard and asking for the password they typed a minute ago is theatre.
 *   2. **Where does that door go?** Not to setup, for an owner who has already
 *      finished it. The account's stored profile answers that here, before the
 *      paint, so the owner is never greeted by name and then walked back through
 *      their own bank details. `welcomeDestination` holds the rule; the endpoint
 *      re-applies it after credentials are verified.
 *   3. **Where does a successful sign-in go?** `?next=/audit` from a bookmark, or
 *      whatever question 2 answered. The value is run through `safeNext` *here*,
 *      on the way in, so the form never has to be trusted to refuse an open
 *      redirect — and the endpoint that actually redirects validates it again,
 *      because a page argument is not a security boundary.
 *   4. **Is there a plan intent to carry?** The pricing table links
 *      `?plan=growth&interval=year`. Honouring it means an owner who came from a
 *      price lands on Your Plan; dropping it sends them to bank details while the
 *      thing they asked about evaporates.
 *
 * A failure the edge sent them here with (`?error=link`) arrives as a fixed code,
 * never as provider text: the copy belongs to this app, and a query parameter is
 * somebody else's input.
 */

const INTERVALS: BillingInterval[] = ['forever', 'month', 'quarter', 'year'];
const NOTICES: AuthFailureNotice[] = ['link', 'local', 'unavailable', 'config'];

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * The destination the *caller* asked for, or `null` when they did not.
 *
 * `null` is the interesting answer. It means the page has no opinion, so the
 * question is answered from what the account knows — and the sign-in endpoint
 * gets to answer it again after the credentials are verified, which is the only
 * moment the stored profile can be read for an owner this device had forgotten.
 * A page that always handed the form a literal `/onboarding` would overwrite that
 * with a guess made before anybody was authenticated.
 */
function explicitDestination(params: Record<string, string | string[] | undefined>): string | null {
  const plan = param(params.plan);
  const interval = param(params.interval);
  if (isPlanId(plan) && plan !== 'trial' && INTERVALS.includes(interval as BillingInterval)) {
    return `/subscription?plan=${plan}&interval=${interval}`;
  }
  const next = param(params.next);
  if (!next.trim()) return null;
  // `''` as the fallback so a refused value comes back as "nobody asked", not as
  // a destination this page invented.
  return safeNext(next, '') || null;
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const identity = renderable(await currentIdentity());
  const requested = explicitDestination(params);
  /*
   * Only worth asking when somebody is signed in: `storedSetupComplete` resolves
   * the business from the provider session, so an anonymous request would spend a
   * database round trip to be told `false` — the answer it already had.
   *
   * This is the server's half of where the door goes. The form supplies the half
   * only the browser can answer (a local-first build has no row to read, only the
   * vault on this device), and the endpoint answers the whole question again once
   * credentials are verified — so a returning owner on a phone that has forgotten
   * them still lands in the console instead of back in setup.
   */
  const accountSetupComplete = identity ? await storedSetupComplete() : false;
  const notice = NOTICES.includes(param(params.error) as AuthFailureNotice)
    ? (param(params.error) as AuthFailureNotice)
    : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      {/* Appearance and language are offered before sign-in, not only inside
          the console: the first thing a new owner sees should already be
          readable on their own screen and in their own script. */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
        <AppearanceMenu />
        <LanguagePicker />
      </div>

      <div className="animate-fade-up relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandWordmark width={190} priority className="h-auto w-[190px]" />
          <h1 className="mt-2 font-display text-2xl font-bold text-stone-900">Business access</h1>
          <p className="mt-1.5 text-sm text-stone-600">Sign in to manage your store, sales, and insights.</p>
        </div>

        <AuthForm
          supabaseReady={isSupabaseConfigured()}
          requested={requested}
          accountSetupComplete={accountSetupComplete}
          notice={notice}
          identity={identity}
        />

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-stone-600">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>Locked-down CSP, nosniff &amp; strict referrer policy · records encrypted on your device</span>
        </div>

        <p className="mt-4 text-center text-xs">
          <Link href="/" className="text-stone-600 transition hover:text-stone-700">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
