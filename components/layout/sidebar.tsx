'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { usePortal } from '@/lib/portals/portal-provider';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { AccountRow } from '@/components/layout/account-menu';
import { NavigationSections } from '@/components/layout/navigation-sections';
import type { RenderedIdentity } from '@/lib/auth/identity';
import { useDukaanStore } from '@/lib/store';

/**
 * Primary navigation.
 *
 * There is no static menu list any more: the sections come from the portal
 * blueprint for the loaded business type, in that trade's own words. A gym sees
 * "Plans & Members" and "Renewals" where a kirana sees "Items" and "Udhaar
 * Khata", and neither is shown a module the other needs.
 *
 * The footer reports the *real* business currently loaded and how its data is
 * held on this device — no placeholder text.
 */
/**
 * The active-item indicator.
 *
 * One element that *moves* between items rather than a background that
 * disappears here and appears there. The difference matters on a sidebar with
 * twenty-seven entries: a bar that slides tells the eye where it went, so the
 * owner keeps their place in the list. A bar that blinks makes them re-read it.
 *
 * It is measured from the DOM in a layout effect — before paint, so there is
 * never a frame of the indicator at the wrong height — and driven entirely by
 * `transform`, which keeps it on the compositor. When nothing is active (a
 * route outside the menu) it fades out in place instead of jumping to zero.
 */
function useActiveIndicator(pathname: string | null, nav: unknown, layoutRevision: number) {
  const navRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const container = navRef.current;
    if (!container) return;
    const active = container.querySelector('[data-nav-active="true"]') as HTMLElement | null;
    if (!active) {
      setBox(null);
      return;
    }
    setBox({ top: active.offsetTop, height: active.offsetHeight });
  }, [pathname, nav, layoutRevision]);

  return { navRef, box };
}

export function Sidebar({ identity = null }: { identity?: RenderedIdentity | null }) {
  const pathname = usePathname();
  const [layoutRevision, setLayoutRevision] = useState(0);
  const { state, hydrated, persistence } = useDukaanStore();
  const { portal, nav, revealAll } = usePortal();
  const onNavigationLayoutChange = useCallback(() => setLayoutRevision((revision) => revision + 1), []);
  const { navRef, box } = useActiveIndicator(pathname, nav, layoutRevision);

  const businessName = state.profile.name?.trim() || 'My Business';
  const statusLine = !hydrated
    ? 'Loading…'
    : state.demoMode
      ? 'Sample business · separate from your records'
      : persistence.mode === 'encrypted'
        ? 'Encrypted on this device'
        : 'Stored on this device';

  const PortalIcon = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;

  return (
    <aside className="portal-transition hidden w-72 shrink-0 border-r border-stone-200 bg-panel/95 md:flex md:flex-col">
      <div className="flex items-center gap-3 px-6 py-6">
        <BrandIcon size={44} className="h-11 w-11 shrink-0 rounded-2xl shadow-glow" />
        <div className="min-w-0">
          <p className="font-display text-base font-bold tracking-tight text-stone-900">DukaanOS</p>
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-portal">{portal.name}</p>
        </div>
      </div>

      {/* Which console am I in, and why does it look like this? */}
      <div className="mx-4 mb-4 flex items-start gap-3 rounded-2xl bg-portal/[0.07] p-3.5 ring-1 ring-inset ring-portal/20">
        <span className="bg-portal-gradient mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-glow-sm">
          <PortalIcon size={17} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-stone-900">{businessName}</p>
          <p className="truncate text-[11px] leading-snug text-stone-600">{portal.tagline}</p>
        </div>
      </div>

      <nav ref={navRef} aria-label="Main navigation" className="relative flex-1 overflow-y-auto px-4 pb-6">
        {/* The travelling indicator. `aria-hidden` because the current page is
            already announced by `aria-current` on the link itself — this is
            the visual half of the same fact, not a second one. */}
        <span
          aria-hidden
          className="nav-indicator bg-portal-gradient pointer-events-none absolute left-4 w-[3px] rounded-r-full shadow-glow-sm"
          style={{
            opacity: box ? 1 : 0,
            height: box ? `${box.height - 20}px` : 0,
            transform: `translateY(${(box?.top ?? 0) + 10}px)`,
            top: 0,
          }}
        />
        <NavigationSections
          key={portal.id}
          sections={nav}
          activePath={pathname}
          variant="sidebar"
          idPrefix="sidebar-navigation"
          revealAll={revealAll}
          onLayoutChange={onNavigationLayoutChange}
        />
      </nav>

      <div className="space-y-2 border-t border-stone-200 p-4">
        {/* Appearance lives in the menu, not in Settings: repainting the
            console is a thing an owner does in the middle of a shift, from
            wherever they happen to be standing. */}
        <AppearanceMenu variant="row" placement="above" />

        {/* Name and sign-out, from the session the server verified — not from
            anything in this tab's storage. */}
        <AccountRow identity={identity} />

        <Link
          href="/security"
          className="block rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100"
          title="Open the Trust Centre"
        >
          <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-stone-900">
            <Lock size={11} className="shrink-0 text-emerald-700" />
            {businessName}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-stone-600">{statusLine}</p>
        </Link>
      </div>
    </aside>
  );
}
