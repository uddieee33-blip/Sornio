import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import AuthForm from '@/components/auth/auth-form';
import { BrandWordmark } from '@/components/ui/BrandLogo';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { currentIdentity, renderable } from '@/lib/auth/identity';
import { safeNext } from '@/lib/auth/routes';
import { isPlanId } from '@/lib/plans';
import type { BillingInterval } from '@/lib/plans';
import type { AuthFailureNotice } from '@/lib/auth/types';

/**
 * Sign-in, decided on the server.
 *
 * Three questions have answers that only exist before the first paint, which is
 * why this is a server component with a client form inside it rather than one
 * client page:
 *
 *   1. **Is somebody already signed in?** If they are, the screen is a door
 *      ("Welcome back — Continue"), not a password request. Asking for
 *      credentials you have already verified is how a session looks optional.
 *   2. **Where does a successful sign-in go?** `?next=/audit` from a bookmark, or
 *      `/onboarding` for a new owner. The value is run through `safeNext` *here*,
 *      on the way in, so the form never has to be trusted to refuse an open
 *      redirect — and the endpoint that actually redirects validates it again,
 *      because a page argument is not a security boundary.
 *   3. **Is there a plan intent to carry?** The pricing table links
 *      `?plan=growth&interval=year`. Honouring it means an owner who came from a
 *      price lands on Your Plan; dropping it sends them to bank details while the
 *      thing they asked about evaporates.
 *
 * A failure the edge sent them here with (`?error=link`) arrives as a fixed code,
 * never as provider text: the copy belongs to this app, and a query parameter is
 * somebody else's input.
 */

const INTERVALS: BillingInterval[] = ['forever', 'month', 'quarter', 'year'];
const NOTICES: AuthFailureNotice[] = ['link', 'local', 'unavailable'];

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** The destination a signed-in owner is sent to, if they asked for one. */
function resolveDestination(params: Record<string, string | string[] | undefined>): string {
  const plan = param(params.plan);
  const interval = param(params.interval);
  if (isPlanId(plan) && plan !== 'trial' && INTERVALS.includes(interval as BillingInterval)) {
    return `/subscription?plan=${plan}&interval=${interval}`;
  }
  return safeNext(params.next, '/onboarding');
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const identity = renderable(await currentIdentity());
  const destination = resolveDestination(params);
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
          destination={destination}
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
