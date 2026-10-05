'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { NAV_SECTIONS } from './nav-items';
import { useDukaanStore } from '@/lib/store';
import { BrandIcon } from '@/components/ui/BrandLogo';

/**
 * Primary navigation.
 *
 * Reads its structure from `nav-items.ts` so the sidebar, the mobile nav, the
 * command palette, and the route warmer can never disagree. The footer reports
 * the *real* business currently loaded and whether its data is encrypted on
 * this device — no placeholder text.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { state, hydrated, persistence } = useDukaanStore();

  const businessName = state.profile.name?.trim() || 'My Business';
  const statusLine = !hydrated
    ? 'Loading…'
    : state.demoMode
      ? 'Sample business · separate from your records'
      : persistence.mode === 'encrypted'
        ? 'Encrypted on this device'
        : 'Stored on this device';

  return (
    <aside className="hidden w-72 shrink-0 border-r border-stone-200 bg-panel/90 backdrop-blur md:flex md:flex-col">
      <div className="flex items-center gap-3 px-6 py-6">
        <BrandIcon size={44} className="h-11 w-11 shrink-0 rounded-2xl shadow-glow" />
        <div>
          <p className="font-display text-base font-bold tracking-tight text-stone-900">DukaanOS</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600">Owner Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
        {NAV_SECTIONS.map((section) => (
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
                        ? 'bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/25'
                        : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                    }`}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-gradient shadow-glow-sm" />
                    ) : null}
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                        active
                          ? 'bg-brand-gradient text-white shadow-glow-sm'
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
