'use client';

/**
 * Console top bar.
 *
 * Carries the three things an owner wants visible at all times:
 *  1. where they are (breadcrumb),
 *  2. whether their data is safe (sync + encryption status),
 *  3. a fast way to get anywhere (⌘K).
 *
 * It is sticky and translucent rather than fixed, so it costs no layout shift
 * and scrolling stays on the compositor thread.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { ChevronRight, Command, Database, Lock, Menu, Search, Store, WifiOff } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';

const TITLES: Record<string, string> = {
  '/home': 'Owner Cockpit',
  '/dashboard': 'Dashboard',
  '/insights': 'AI Insights',
  '/alerts': 'Alerts',
  '/business': 'Business Setup',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/sales': 'Sales',
  '/billing': 'Billing',
  '/payments': 'Payments',
  '/expenses': 'Expenses',
  '/transactions': 'Transactions',
  '/marketing': 'Marketing',
  '/memberships': 'Memberships',
  '/reminders': 'Reminders',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/team': 'Team & Roles',
  '/cashflow': 'Cash Flow',
  '/profitability': 'Profitability',
  '/reports': 'Reports',
  '/comparisons': 'Comparisons',
  '/audit': 'Audit History',
  '/security': 'Trust Centre',
  '/settings': 'Settings',
};

/**
 * Browser connectivity, read as an external store.
 *
 * `navigator.onLine` is owned by the browser and `online`/`offline` are its
 * subscription API — exactly the shape `useSyncExternalStore` exists for.
 * Compared with the old effect this drops a wasted render (mount assuming
 * `true`, then re-render with the real value) and gives the server a stable
 * snapshot, so hydration cannot mismatch.
 */
function subscribeToConnectivity(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getConnectivitySnapshot(): boolean {
  return navigator.onLine;
}

/** There is no connectivity to observe during SSR; assume online. */
function getConnectivityServerSnapshot(): boolean {
  return true;
}

function useOnline(): boolean {
  return useSyncExternalStore(subscribeToConnectivity, getConnectivitySnapshot, getConnectivityServerSnapshot);
}

export function Topbar({
  onOpenCommand,
  onOpenMobileMenu,
}: {
  onOpenCommand: () => void;
  onOpenMobileMenu: () => void;
}) {
  const pathname = usePathname();
  const online = useOnline();
  const { state, syncStatus } = useDukaanStore();
  const title = TITLES[pathname] ?? 'Console';

  const syncLabel =
    syncStatus === 'local'
      ? 'On this device'
      : syncStatus === 'syncing'
        ? 'Syncing…'
        : syncStatus === 'synced'
          ? 'Synced'
          : syncStatus === 'error'
            ? 'Sync issue'
            : 'Local-first';

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b0d12]/85 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <Link href="/home" aria-label="DukaanOS home" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow-sm">
              <Store size={17} className="text-white" />
            </span>
            <span className="font-display text-sm font-bold tracking-tight text-white">DukaanOS</span>
          </Link>
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-controls="mobile-navigation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            <Menu size={17} />
          </button>
        </div>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm md:flex">
          <Link href="/home" className="shrink-0 text-zinc-500 transition hover:text-zinc-300">
            DukaanOS
          </Link>
          <ChevronRight size={14} className="shrink-0 text-zinc-700" />
          <span className="truncate font-semibold text-white">{title}</span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {!online ? (
            <span
              className="hidden items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 ring-1 ring-inset ring-amber-500/25 sm:flex"
              title="You are offline. Everything still works — your data stays on this device."
            >
              <WifiOff size={12} /> Offline — still working
            </span>
          ) : null}

          <span
            className="hidden items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-400 ring-1 ring-inset ring-white/[0.07] lg:flex"
            title="Your records are stored on this device; sync turns on automatically when Supabase is connected."
          >
            <Database size={12} className={syncStatus === 'error' ? 'text-amber-400' : 'text-emerald-400'} />
            {syncLabel}
          </span>

          <Link
            href="/security"
            className="hidden items-center gap-1.5 rounded-full bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/20 transition hover:bg-emerald-500/[0.14] sm:flex"
            title="Open the Trust Centre"
          >
            <Lock size={12} /> Encrypted
          </Link>

          <button
            onClick={onOpenCommand}
            className="group flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-400 ring-1 ring-inset ring-white/[0.07] transition hover:bg-white/[0.07] hover:text-zinc-200"
            aria-label="Open the command palette"
          >
            <Search size={14} />
            <span className="hidden md:inline">Search or jump to…</span>
            <span className="hidden items-center gap-0.5 rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 md:flex">
              <Command size={9} />K
            </span>
          </button>

          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gradient text-[11px] font-bold text-white shadow-glow-sm"
            title={`${state.profile.ownerName ?? 'Owner'} · ${state.demoMode ? 'Demo business' : 'Live business'}`}
          >
            {(state.profile.ownerName ?? state.profile.name ?? 'O').slice(0, 1).toUpperCase()}
          </span>
        </div>
      </div>

    </header>
  );
}
