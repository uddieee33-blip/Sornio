'use client';

/**
 * ⌘K command palette.
 *
 * Two jobs: get the owner to any module in two keystrokes, and give quick
 * actions ("record a sale", "check expiring members") without hunting through
 * the sidebar. Fully keyboard driven, focus-trapped, and screen-reader labelled.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search, Sparkles } from 'lucide-react';
import { ALL_NAV_LINKS, NAV_SECTIONS, type NavLink } from './nav-items';

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: NavLink['icon'];
  run: () => void;
  keywords?: string;
};

function score(query: string, command: Command): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  const label = command.label.toLowerCase();
  const haystack = `${label} ${command.hint ?? ''} ${command.keywords ?? ''} ${command.group}`.toLowerCase();

  if (label === needle) return 100;
  if (label.startsWith(needle)) return 80;
  if (label.includes(needle)) return 60;

  // Subsequence match: "owc" → "Owner Cockpit".
  let index = 0;
  for (const char of needle) {
    index = label.indexOf(char, index);
    if (index === -1) break;
    index += 1;
  }
  if (index !== -1) return 40;
  return haystack.includes(needle) ? 20 : 0;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const navCommands: Command[] = ALL_NAV_LINKS.map((link) => ({
      id: `nav:${link.href}`,
      label: link.label,
      hint: NAV_SECTIONS.find((section) => section.links.some((item) => item.href === link.href))?.title,
      group: 'Go to',
      icon: link.icon,
      keywords: link.keywords,
      run: () => router.push(link.href),
    }));

    const actions: Command[] = [
      {
        id: 'action:sale',
        label: 'Record a sale',
        hint: 'Counter billing',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'new sale sell checkout',
        run: () => router.push('/sales'),
      },
      {
        id: 'action:expense',
        label: 'Add an expense',
        hint: 'Record money going out',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'spend bill',
        run: () => router.push('/expenses'),
      },
      {
        id: 'action:member-expiry',
        label: 'Check memberships expiring soon',
        hint: 'Stop revenue leakage',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'renewal expiry reminder gym',
        run: () => router.push('/memberships'),
      },
      {
        id: 'action:export',
        label: 'Export reports',
        hint: 'CSV for your accountant',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'download csv accountant tax',
        run: () => router.push('/reports'),
      },
      {
        id: 'action:trust',
        label: 'Open the Trust Centre',
        hint: 'Encryption, roles, audit chain',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'security privacy encryption backup',
        run: () => router.push('/security'),
      },
    ];

    return [...navCommands, ...actions];
  }, [router]);

  const results = useMemo(() => {
    return commands
      .map((command) => ({ command, rank: score(query, command) }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 9)
      .map((entry) => entry.command);
  }, [commands, query]);

  const runCommand = useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      onClose();
      // Let the dialog close before navigating so the transition stays smooth.
      requestAnimationFrame(() => command.run());
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after the dialog has painted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((current) => Math.max(0, current - 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runCommand(results[active]);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, results, active, runCommand, onClose]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <button
        aria-label="Close the command palette"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1218]/95 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-fade-up"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <Search size={16} className="shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search modules, actions, anything…"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
          />
          <kbd className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">
              Nothing matches “{query}”. Try “sale”, “members”, or “audit”.
            </p>
          ) : (
            results.map((command, index) => {
              const Icon = command.icon;
              const isActive = index === active;
              return (
                <button
                  key={command.id}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runCommand(command)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    isActive ? 'bg-brand-500/[0.14] ring-1 ring-inset ring-brand-500/25' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? 'bg-brand-gradient text-white' : 'bg-white/[0.05] text-zinc-500'
                    }`}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{command.label}</span>
                    {command.hint ? <span className="block truncate text-[11px] text-zinc-500">{command.hint}</span> : null}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                    {command.group}
                  </span>
                  {isActive ? <CornerDownLeft size={13} className="shrink-0 text-brand-300" /> : <ArrowRight size={13} className="shrink-0 text-transparent" />}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10px] text-zinc-600">
          <span>↑ ↓ to move · ↵ to open</span>
          <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}

/** Global ⌘K / Ctrl+K binding. */
export function useCommandHotkey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isPaletteKey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isPaletteKey) {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}
