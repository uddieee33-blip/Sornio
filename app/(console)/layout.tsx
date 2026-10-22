import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { storedSetupComplete } from '@/lib/sync/profile-server';
import Link from 'next/link';
import { ShieldQuestion } from 'lucide-react';
import { ConsoleShell } from '@/components/layout/console-shell';
import { isPortalId } from '@/lib/portals/registry';
import { PORTAL_COOKIE } from '@/lib/portals/routes';
import { MASTER_COOKIE, masterDaysLeft, masterRevealActive, openMasterRecord } from '@/lib/portals/master';
import { currentIdentity, renderable } from '@/lib/auth/identity';
import type { PortalId } from '@/lib/portals/types';

/**
 * Console layout.
 *
 * Three things are decided *here*, on the server, before a single number is
 * rendered:
 *
 *   1. **Whether this request may see a console at all.** `proxy.ts` already
 *      refused the anonymous case at the edge, cheaply, from the cookie alone.
 *      This is the second look, and the *authoritative* one: it verifies the app
 *      session against this deployment's key and, when real Supabase credentials
 *      exist, asks the provider whether that session is still a session. A page
 *      whose cookies were valid at the edge and stale by the render — an expired
 *      provider token is the ordinary case — lands on "session ended" instead of
 *      a console full of somebody else's yesterday.
 *   2. **No flicker and no layout shift.** The first paint already carries the
 *      right navigation and the right name in the top bar, instead of showing a
 *      full menu and then collapsing it once the store hydrates.
 *   3. **A single source of truth** — the same validated cookies decide which
 *      routes the edge will serve (see `lib/portals/routes.ts`,
 *      `lib/portals/master.ts`, `lib/plans/routes.ts` and `lib/auth/routes.ts`),
 *      so what the owner sees and what the server enforces cannot drift apart.
 *
 * The failure screen is a screen, not a redirect. A layout has no pathname to
 * attach to `?next=`, and a redirect from here would be the second one on the same
 * navigation — the shape that turns into a loop the day the sign-in page grows.
 *
 * The portal cookie is read as a plain value because it can only ever *hide* a
 * module. The Everything On cookie is opened through its HMAC, because it reveals
 * — and an unverifiable reveal is treated as no reveal at all.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();

  const identity = renderable(await currentIdentity());
  if (!identity) return <SessionEnded />;

  // A bookmark can reach this layout without passing through the sign-in form.
  // Staff join an existing business; only owners complete business setup.
  if (identity.provider === 'supabase' && identity.role === 'owner' && !(await storedSetupComplete(identity.userId))) {
    redirect('/onboarding');
  }

  const raw = cookieStore.get(PORTAL_COOKIE)?.value;
  const initialPortalId: PortalId | null = isPortalId(raw) ? raw : null;

  const master = await openMasterRecord(cookieStore.get(MASTER_COOKIE)?.value);
  const revealAll = masterRevealActive(master);

  return (
    <ConsoleShell
      initialPortalId={initialPortalId}
      initialRevealAll={revealAll}
      initialRevealDaysLeft={masterDaysLeft(master)}
      initialIdentity={identity}
    >
      {children}
    </ConsoleShell>
  );
}

/**
 * The one honest answer to a session that has gone away: the console is not
 * available, and here is the door back. Nothing about the business is rendered —
 * not a shell, not a skeleton, not a count of records.
 */
function SessionEnded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel p-6">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-stone-50 p-7 text-center shadow-card">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25">
          <ShieldQuestion size={20} />
        </span>
        <h1 className="mt-3 font-display text-lg font-bold text-stone-900">Session ended</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
          This device is no longer signed in, so the business records stay closed. Sign in again to open them.
        </p>
        <Link
          href="/auth"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

