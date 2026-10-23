'use client';

/**
 * A deliberately quiet console header: the current destination, connectivity
 * only when it needs attention, and the few actions worth keeping one tap away.
 * Account, appearance, plans and detailed sync information live in their
 * respective navigation/settings surfaces instead of competing for this row.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { ChevronRight, Command, Lock, Menu, Search, WifiOff, X } from 'lucide-react';
import { usePortal } from '@/lib/portals/portal-provider';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { useCounterLock } from '@/components/security/counter-lock';
import { LanguagePicker } from '@/components/ui/LanguagePicker';

/** Browser connectivity, read as an external store to avoid a hydration mismatch. */
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
  mobileMenuOpen,
}: {
  onOpenCommand: () => void;
  onOpenMobileMenu: () => void;
  mobileMenuOpen: boolean;
}) {
  const pathname = usePathname();
  const online = useOnline();
  const { portal, nav } = usePortal();
  const lock = useCounterLock();

  // The breadcrumb speaks this trade's language: "Plans & Members" in a gym,
  // "Udhaar Khata" in a kirana — the same route, the owner's own words.
  const title =
    nav.flatMap((section) => section.links).find((link) => link.href === pathname)?.label ??
    nav[0]?.links[0]?.label ??
    'Console';

  return (
    <header className="console-topbar mobile-topbar-safe sticky top-0 z-40 border-b border-stone-200 bg-panel/95">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
          <Link href="/home" aria-label="DukaanOS home" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <BrandIcon size={36} className="h-9 w-9 rounded-xl shadow-glow-sm" />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-portal">{portal.name}</p>
            <p className="truncate font-display text-sm font-bold tracking-tight text-stone-900">{title}</p>
          </div>
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-haspopup="dialog"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            className="touch-manipulation flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 transition hover:bg-stone-100 hover:text-stone-900"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center gap-2 overflow-hidden text-sm lg:flex">
          <Link href="/home" className="inline-flex shrink-0 items-center gap-1.5 text-stone-600 transition hover:text-stone-900">
            <span className="font-semibold">DukaanOS</span>
            <span className="rounded-full bg-portal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-portal ring-1 ring-inset ring-portal/20">
              {portal.name}
            </span>
          </Link>
          <ChevronRight size={14} className="shrink-0 text-stone-400" aria-hidden="true" />
          <span className="truncate font-semibold text-stone-900">{title}</span>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {!online ? (
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/25 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:text-[11px] sm:font-bold"
              title="You are offline. Everything still works — your data stays on this device."
            >
              <WifiOff size={13} />
              <span className="hidden sm:inline">Offline — still working</span>
            </span>
          ) : null}

          {/* Locking the counter stays one tap away; everyday status belongs in
              Settings and the Trust Centre, not in a row of permanent badges. */}
          {lock.enabled ? (
            <button
              type="button"
              onClick={lock.lockNow}
              title="Lock the console now — the PIN will be needed to open it again"
              aria-label="Lock the console now"
              className="touch-manipulation flex h-11 w-11 items-center justify-center rounded-xl bg-stone-50 text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900 lg:h-9 lg:w-9"
            >
              <Lock size={14} />
            </button>
          ) : null}

          <LanguagePicker compact />

          <button
            type="button"
            onClick={onOpenCommand}
            className="touch-manipulation group flex h-11 w-11 items-center justify-center gap-2 rounded-xl bg-stone-50 text-xs font-medium text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900 lg:h-9 lg:w-auto lg:justify-start lg:px-3"
            aria-label="Open the command palette"
          >
            <Search size={15} />
            <span className="hidden lg:inline">Search or jump to…</span>
            <span className="hidden items-center gap-0.5 rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600 lg:flex">
              <Command size={9} />K
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

