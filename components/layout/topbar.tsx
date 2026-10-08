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
import { ChevronRight, Command, Database, Lock, Menu, Search, UserRound, WifiOff, X } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { PlanBadge } from '@/components/billing/plan-badge';
import { useCounterLock } from '@/components/security/counter-lock';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { AccountChip } from '@/components/layout/account-menu';
import type { RenderedIdentity } from '@/lib/auth/identity';


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
  mobileMenuOpen,
  identity,
}: {
  onOpenCommand: () => void;
  onOpenMobileMenu: () => void;
  mobileMenuOpen: boolean;
  /** The server-verified session, threaded down from the console layout. */
  identity: RenderedIdentity | null;
}) {
  const pathname = usePathname();
  const online = useOnline();
  const { state, syncStatus } = useDukaanStore();
  const { portal, nav } = usePortal();
  const lock = useCounterLock();

  // The breadcrumb speaks this trade's language: "Plans & Members" in a gym,
  // "Udhaar Khata" in a kirana — the same route, the owner's own words.
  const title =
    nav.flatMap((section) => section.links).find((link) => link.href === pathname)?.label ??
    nav[0]?.links[0]?.label ??
    'Console';

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
    <header className="mobile-topbar-safe sticky top-0 z-40 border-b border-stone-200 bg-panel/85 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
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

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm md:flex">
          <Link href="/home" className="inline-flex shrink-0 items-center gap-1.5 text-stone-600 transition hover:text-stone-700">
            DukaanOS
            <span className="rounded-full bg-portal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-portal ring-1 ring-inset ring-portal/20">
              {portal.name}
            </span>
          </Link>
          <ChevronRight size={14} className="shrink-0 text-stone-600" />
          <span className="truncate font-semibold text-stone-900">{title}</span>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {!online ? (
            <span
              className="hidden items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-500/25 sm:flex"
              title="You are offline. Everything still works — your data stays on this device."
            >
              <WifiOff size={12} /> Offline — still working
            </span>
          ) : null}

          <span
            className="hidden items-center gap-1.5 rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-600 ring-1 ring-inset ring-stone-200 lg:flex"
            title="Your records are stored on this device; sync turns on automatically when Supabase is connected."
          >
            <Database size={12} className={syncStatus === 'error' ? 'text-amber-700' : 'text-emerald-700'} />
            {syncLabel}
          </span>

          <Link
            href="/security"
            className="hidden items-center gap-1.5 rounded-full bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/20 transition hover:bg-emerald-500/[0.14] sm:flex"
            title="Open the Trust Centre"
          >
            <Lock size={12} /> Encrypted
          </Link>

          {/* Locking the counter is one tap and always reachable, because the
              moment a shopkeeper wants to lock up they are already walking
              away — they will not go hunting through settings. */}
          {lock.enabled ? (
            <button
              type="button"
              onClick={lock.lockNow}
              title="Lock the console now — the PIN will be needed to open it again"
              aria-label="Lock the console now"
              className="touch-manipulation flex h-11 w-11 items-center justify-center gap-1.5 rounded-xl bg-stone-50 text-[11px] font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900 md:h-auto md:w-auto md:px-2.5 md:py-1.5"
            >
              <Lock size={13} />
              <span className="hidden md:inline">Lock</span>
            </button>
          ) : null}

          {/* The sun goes down every day; repainting the console for it should
              never be four taps through Settings. The left half flips between
              this device's last light and last dark paint, the right half
              opens every dial. */}
          <AppearanceMenu />

          {/* Language belongs in the console too, not only on the marketing page. */}
          <LanguagePicker compact />

          {/* Which plan this console runs on, and how long it has left. */}
          <PlanBadge className="hidden sm:inline-flex" />

          {/* Who is sitting at this console — one tap to hand it over. */}
          <Link
            href="/settings"
            title="Who is using this app? Switch role in Settings."
            className="hidden items-center gap-1.5 rounded-full bg-brand-500/[0.08] px-2.5 py-1 text-[11px] font-bold text-brand-600 ring-1 ring-inset ring-brand-500/20 transition hover:bg-brand-500/[0.14] sm:flex"
          >
            <UserRound size={12} />
            {state.settings.activeRole === 'manager' ? 'Manager' : state.settings.activeRole === 'desk' ? 'Front desk' : 'Owner'}
          </Link>

          {/* And the button that ends it. `Sign out` sits beside the role chip on
              purpose: handing the console over is one gesture, and it is the role
              change *plus* the session ending, not either alone. */}
          <AccountChip identity={identity} />

          <button
            type="button"
            onClick={onOpenCommand}
            className="touch-manipulation group flex h-11 w-11 items-center justify-center gap-2 rounded-xl bg-stone-50 text-xs font-medium text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900 md:h-auto md:w-auto md:justify-start md:px-2.5 md:py-1.5"
            aria-label="Open the command palette"
          >
            <Search size={14} />
            <span className="hidden md:inline">Search or jump to…</span>
            <span className="hidden items-center gap-0.5 rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600 md:flex">
              <Command size={9} />K
            </span>
          </button>

          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-portal-gradient text-[11px] font-bold text-white shadow-glow-sm"
            title={`${state.profile.ownerName ?? 'Owner'} · ${state.demoMode ? 'Demo business' : 'Live business'}`}
          >
            {(state.profile.ownerName ?? state.profile.name ?? 'O').slice(0, 1).toUpperCase()}
          </span>
        </div>
      </div>

    </header>
  );
}
