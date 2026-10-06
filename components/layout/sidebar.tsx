'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
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
export function Sidebar() {
  const pathname = usePathname();
  const { state, hydrated, persistence } = useDukaanStore();
  const { portal, nav } = usePortal();

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

      <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
        {nav.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-600">{section.title}</p>
            <div className="space-y-1">
              {section.links.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-portal/10 text-portal ring-1 ring-inset ring-portal/25'
                        : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                    }`}
                  >
                    {active ? (
                      <span className="bg-portal-gradient absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full shadow-glow-sm" />
                    ) : null}
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                        active
                          ? 'bg-portal-gradient text-white shadow-glow-sm'
                          : 'bg-stone-50 text-stone-600 group-hover:text-stone-700'
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
