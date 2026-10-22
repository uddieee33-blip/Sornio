'use client';

/**
 * Portal gate.
 *
 * The client half of the portal policy (the Edge half lives in `middleware.ts`).
 * It covers the two cases the edge cannot see:
 *
 *   • a portal changed in this tab but not yet re-issued as a cookie, and
 *   • a business that has not chosen a type yet.
 *
 * What it never does is silently rewrite a URL or drop the owner somewhere
 * confusing. A blocked module gets a plain explanation, the list of what this
 * console does carry, and one tap to change it — because a hidden feature the
 * owner cannot switch back on is worse than no feature at all.
 */

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Lock, Settings2 } from 'lucide-react';
import { usePortal } from '@/lib/portals/portal-provider';
import { moduleForPath } from '@/lib/portals/routes';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import { disabledModules } from '@/lib/portals/registry';
import type { ModuleKey } from '@/lib/portals/types';
import { useDukaanStore } from '@/lib/store';

/**
 * Before a business has chosen a type, only the modules whose whole meaning
 * depends on that choice are held back (a check-in desk, a day book, prepaid
 * plans). Everything an owner can use to start recording today — billing,
 * products, expenses, customers — stays open, because a first sale must never
 * wait on a setup question.
 */
const CHOICE_GATED: ModuleKey[] = ['checkins', 'appointments', 'memberships'];

export function PortalGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { portal, nav, terms, needsChoice, allows, revealAll } = usePortal();
  const { hydrated } = useDukaanStore();

  const moduleKey = moduleForPath(pathname ?? '');
  const entry = moduleKey ? nav.flatMap((section) => section.links).find((link) => link.module === moduleKey) : null;
  const blocked = Boolean(moduleKey) && hydrated && !allows(pathname ?? '');
  const mustChooseType = !revealAll && Boolean(needsChoice && moduleKey && CHOICE_GATED.includes(moduleKey));

  // Before hydration the server has already resolved the portal from the cookie,
  // so the first paint is trustworthy — only the "no choice yet" case waits.
  if (!blocked && !mustChooseType) return <>{children}</>;

  const Icon = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;
  const heading = mustChooseType
    ? 'Choose your business type to open this module'
    : `${entry?.label ?? 'This module'} is not part of your ${portal.name} portal`;

  const body = mustChooseType
    ? 'You are on the general console. Pick the type that matches your business and DukaanOS reshapes itself — the navigation, the words, and what each screen asks for.'
    : portal.excluded;

  const missing = disabledModules(portal.id);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 md:p-10">
      <div className="animate-fade-up overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200 shadow-card">
        <div className="portal-surface relative px-4 py-6 text-white sm:px-6 md:px-9 md:py-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25">
              <Icon size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">{portal.tagline}</p>
              <h1 className="font-display text-xl font-bold md:text-2xl">{heading}</h1>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-4 sm:p-6 md:p-9">
          <p className="text-sm leading-relaxed text-stone-600">{body}</p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/business"
              className="touch-manipulation bg-portal-gradient portal-glow inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              <Settings2 size={16} /> {mustChooseType ? 'Choose your business type' : 'Open Business Setup'}
            </Link>
            <button
              type="button"
              onClick={() => router.push('/home')}
              className="touch-manipulation inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-900 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200"
            >
              <Lock size={15} /> Back to {nav[0]?.links[0]?.label ?? 'the cockpit'}
            </button>
            <Link href="/security" className="text-xs font-semibold text-stone-500 underline-offset-4 hover:underline">
              How module scoping is enforced
            </Link>
          </div>

          {!mustChooseType && missing.length > 0 ? (
            <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Left out of this portal on purpose</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {missing.map((item) => (
                  <span
                    key={item.module}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500 ring-1 ring-inset ring-stone-200"
                    title={`${item.label} — switched off for ${portal.name}`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-stone-500">
                Any of these can be switched on in seconds from Business Setup. Nothing is deleted, and switching back keeps every record
                exactly where it is.
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-dashed border-stone-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">What this portal carries</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {nav.flatMap((section) => section.links).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-full bg-portal/10 px-3 py-1 text-xs font-semibold text-portal ring-1 ring-inset ring-portal/25 transition hover:bg-portal/15"
                >
                  <link.icon size={12} /> {link.label}
                </Link>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-stone-500">
              In this console your {terms.customers.toLowerCase()} are called “{terms.customers}”, the counter is the “{terms.desk}”, and
              every receipt, reminder and export uses those same words.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-stone-500">
        Your records stay on this device <ArrowRight size={12} /> switch business type any time, lose nothing.
      </p>
    </div>
  );
}
