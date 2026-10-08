'use client';

import { useEffect, useRef } from 'react';
import { usePresence } from '@/lib/motion/presence';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, X } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { usePortal } from '@/lib/portals/portal-provider';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { AccountRow } from '@/components/layout/account-menu';
import type { RenderedIdentity } from '@/lib/auth/identity';

export function MobileNav({
  open,
  onClose,
  identity = null,
}: {
  open: boolean;
  onClose: () => void;
  identity?: RenderedIdentity | null;
}) {
  const pathname = usePathname();
  const { state, hydrated, persistence } = useDukaanStore();
  const { portal, nav } = usePortal();
  const PortalIcon = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // The drawer used to vanish on close — mounted, animated in, then deleted
  // mid-frame. On a phone that reads as the app losing its place. It is now
  // held for one exit so it slides back out the way it came in.
  const { mounted, leaving } = usePresence(open, 180);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      const focusable = panel?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!panel || !focusable?.length) {
        event.preventDefault();
        panel?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeys);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleDialogKeys);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const businessName = state.profile.name?.trim() || 'My Business';
  const statusLine = !hydrated
    ? 'Loading business…'
    : state.demoMode
      ? 'Sample business · separate from your records'
      : persistence.mode === 'encrypted'
        ? 'Encrypted on this device'
        : 'Stored on this device';

  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-stone-900/40 backdrop-blur-xs ${leaving ? 'animate-fade-out' : 'animate-fade-in'}`}
      />
      <aside
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        ref={panelRef}
        tabIndex={-1}
        className={`absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-stone-200 bg-panel shadow-float ${leaving ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <Link href="/home" onClick={onClose} className="flex items-center gap-3">
            <BrandIcon size={40} className="h-10 w-10 shrink-0 rounded-xl shadow-glow-sm" />
            <span>
              <span id="mobile-navigation-title" className="block font-display text-sm font-bold text-stone-900">
                DukaanOS
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-portal">
                {portal.name}
              </span>
            </span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="touch-manipulation flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mx-4 mt-4 flex items-start gap-3 rounded-2xl bg-portal/[0.07] p-3.5 ring-1 ring-inset ring-portal/20">
          <span className="bg-portal-gradient mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
            <PortalIcon size={17} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-stone-900">{businessName}</p>
            <p className="truncate text-[11px] leading-snug text-stone-600">{portal.tagline}</p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          {nav.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-600">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.links.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? 'bg-portal/10 text-portal ring-1 ring-inset ring-portal/25'
                          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                      }`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-portal-gradient text-white shadow-glow-sm' : 'bg-stone-50 text-stone-600 group-hover:text-stone-700'}`}>
                        <Icon size={16} strokeWidth={2.1} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {active ? <span className="h-1.5 w-1.5 rounded-full bg-portal" /> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="space-y-2 border-t border-stone-200 p-4">
          {/* The drawer is the only menu there is on a phone, so appearance
              has to be in it rather than four taps away in Settings. */}
          <AppearanceMenu variant="row" placement="above" />

          <AccountRow identity={identity} />

          <Link
            href="/security"
            onClick={onClose}
            className="block rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100"
            title="Open the Trust Centre"
          >
            <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-stone-900">
              <Lock size={12} className="shrink-0 text-emerald-700" />
              {businessName}
            </p>
            <p className="mt-1 truncate text-[11px] text-stone-600">{statusLine}</p>
          </Link>
        </div>
      </aside>
    </div>
  );
}
