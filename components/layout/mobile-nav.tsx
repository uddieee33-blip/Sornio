'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, Store, X } from 'lucide-react';
import { NAV_SECTIONS } from './nav-items';
import { useDukaanStore } from '@/lib/store';

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { state, hydrated, persistence } = useDukaanStore();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

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
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm animate-fade-in"
      />
      <aside
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col border-r border-white/10 bg-[#0d1017] shadow-float animate-fade-in"
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <Link href="/home" onClick={onClose} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient shadow-glow-sm">
              <Store size={19} className="text-white" />
            </span>
            <span>
              <span id="mobile-navigation-title" className="block font-display text-sm font-bold text-white">
                DukaanOS
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">
                Owner Console
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          {NAV_SECTIONS.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
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
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? 'bg-brand-500/10 text-white ring-1 ring-inset ring-brand-500/25'
                          : 'text-zinc-400 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-brand-gradient text-white shadow-glow-sm' : 'bg-white/[0.04] text-zinc-500 group-hover:text-zinc-300'}`}>
                        <Icon size={16} strokeWidth={2.1} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {active ? <span className="h-1.5 w-1.5 rounded-full bg-brand-300" /> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="border-t border-white/[0.07] p-4">
          <Link
            href="/security"
            onClick={onClose}
            className="block rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.05]"
            title="Open the Trust Centre"
          >
            <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-white">
              <Lock size={12} className="shrink-0 text-emerald-400" />
              {businessName}
            </p>
            <p className="mt-1 truncate text-[11px] text-zinc-500">{statusLine}</p>
          </Link>
        </div>
      </aside>
    </div>
  );
}
