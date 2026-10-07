'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, Sparkles } from 'lucide-react';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { usePortal } from '@/lib/portals/portal-provider';
import { PORTAL_ICONS } from '@/lib/portals/icons';
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
function useActiveIndicator(pathname: string | null, deps: unknown) {
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
  }, [pathname, deps]);

  return { navRef, box };
}

export function Sidebar() {
  const pathname = usePathname();
  const { state, hydrated, persistence } = useDukaanStore();
  const { portal, nav, revealAll } = usePortal();
  const { navRef, box } = useActiveIndicator(pathname, nav);

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
    <aside className="portal-transition hidden w-72 shrink-0 border-r border-stone-200 bg-panel/90 backdrop-blur md:flex md:flex-col">
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

      <nav ref={navRef} aria-label="Main navigation" className="relative flex-1 space-y-6 overflow-y-auto px-4 pb-6">
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
        {nav.map((section) => (
          <div key={section.title}>
            <p className="flex items-center gap-1.5 px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-600">
              {section.title}
              {revealAll && section.title === 'Everything else' ? (
                <Sparkles size={10} className="text-portal" aria-label="Revealed by Everything On" />
              ) : null}
            </p>
            <div className="space-y-1">
              {section.links.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    data-nav-active={active ? 'true' : undefined}
                    data-press="soft"
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-base ease-settle ${
                      active
                        ? 'bg-portal/10 text-portal ring-1 ring-inset ring-portal/25'
                        : 'text-stone-600 hover:translate-x-0.5 hover:bg-stone-50 hover:text-stone-900'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-base ease-spring ${
                        active
                          ? 'bg-portal-gradient scale-105 text-white shadow-glow-sm'
                          : 'bg-stone-50 text-stone-600 group-hover:scale-105 group-hover:text-stone-700'
                      }`}
                    >
                      <Icon size={15} strokeWidth={2.2} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-stone-200 p-4">
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
