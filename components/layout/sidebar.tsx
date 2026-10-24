'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { usePortal } from '@/lib/portals/portal-provider';
import { ArrowDownToLine, Store } from 'lucide-react';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { AccountRow } from '@/components/layout/account-menu';
import { NavigationSections } from '@/components/layout/navigation-sections';
import type { RenderedIdentity } from '@/lib/auth/identity';
import { useDukaanStore } from '@/lib/store';

/** A stable admin frame over the business portal's already-granted tools. */
export function Sidebar({ identity = null }: { identity?: RenderedIdentity | null }) {
  const pathname = usePathname();
  const { state } = useDukaanStore();
  const { portal, nav, revealAll } = usePortal();

  const businessName = state.profile.name?.trim() || 'My Business';
  return (
    <aside className="console-sidebar portal-transition sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-stone-200 lg:flex">
      <Link href="/home" aria-label="Sornio home" className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <BrandIcon size={34} className="h-[34px] w-[34px] shrink-0 rounded-lg" />
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight text-stone-900">Sornio</p>
        </div>
      </Link>

      {/* Which console am I in, and why does it look like this? */}
      <div className="mx-3 mb-5 flex items-center gap-2.5 rounded-lg border border-stone-200 bg-panel p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-700">
          <Store size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-stone-900">{businessName}</p>
          <p className="mt-1 truncate text-[11px] text-stone-500">{portal.name}</p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <NavigationSections
          key={portal.id}
          sections={nav}
          activePath={pathname}
          variant="sidebar"
          idPrefix="sidebar-navigation"
          revealAll={revealAll}
        />
      </nav>

      <div className="shrink-0 space-y-1 border-t border-stone-200 p-3">
        <Link href="/install" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-xs font-medium text-stone-700 hover:bg-panel"><ArrowDownToLine size={16} aria-hidden="true" />Install app</Link>
        {/* Appearance lives in the menu, not in Settings: repainting the
            console is a thing an owner does in the middle of a shift, from
            wherever they happen to be standing. */}
        <AppearanceMenu variant="row" placement="above" />

        {/* Name and sign-out, from the session the server verified — not from
            anything in this tab's storage. */}
        <AccountRow identity={identity} />


      </div>
    </aside>
  );
}

