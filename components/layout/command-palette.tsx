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
import { ArrowRight, CornerDownLeft, ScanBarcode, Search, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePortal } from '@/lib/portals/portal-provider';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import { PORTALS } from '@/lib/portals/registry';
import { useDukaanActions } from '@/lib/store';

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
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
  const { portal, nav, allows } = usePortal();
  const { applyTemplate } = useDukaanActions();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    // Only this business's modules — a gym should never be able to search its
    // way into an inventory screen it does not have.
    const navCommands: Command[] = nav.flatMap((section) =>
      section.links.map((link) => ({
        id: `nav:${link.href}`,
        label: link.label,
        hint: section.title,
        group: 'Go to',
        icon: link.icon,
        keywords: `${link.keywords} ${portal.name} ${portal.tagline}`,
        run: () => router.push(link.href),
      })),
    );

    // The cockpit's own quick actions come first: they are the jobs this trade
    // does all day, in the words this trade uses for them.
    const portalActions: Command[] = portal.cockpit.actions.map((action) => ({
      id: `portal:${action.href}`,
      label: action.label,
      hint: portal.cockpit.eyebrow,
      group: 'This business',
      icon: PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general,
      keywords: `${portal.name} ${action.label}`,
      run: () => router.push(action.href),
    }));

    // Cross-business quick actions. Each one is filtered against the portal, so
    // "Check memberships expiring soon" simply does not exist for a café.
    const quickActions: (Command & { href: string })[] = [
      {
        id: 'action:sale',
        href: '/sales',
        label: `Record a ${portal.terms.saleOne.toLowerCase()}`,
        hint: portal.terms.sale,
        group: 'Actions',
        icon: Sparkles,
        keywords: 'new sale sell checkout counter',
        run: () => router.push('/sales'),
      },
      {
        // Only exists for a trade whose desk actually scans — the portal filter
        // below drops it from a gym or a salon without a word.
        id: 'action:scan',
        href: '/scan',
        label: `Scan at the ${portal.capture.label.toLowerCase()}`,
        hint: portal.capture.what,
        group: 'Actions',
        icon: ScanBarcode,
        keywords: 'scan barcode scanner packet label weigh loose qr imei counter',
        run: () => router.push('/scan'),
      },
      {
        id: 'action:expense',
        href: '/expenses',
        label: 'Add an expense',
        hint: 'Record money going out',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'spend bill rent salary',
        run: () => router.push('/expenses'),
      },
      {
        id: 'action:renewals',
        href: '/reminders',
        label: 'Chase upcoming renewals',
        hint: 'Stop revenue leakage',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'renewal expiry reminder package',
        run: () => router.push('/memberships'),
      },
      {
        id: 'action:export',
        href: '/reports',
        label: 'Export reports',
        hint: 'CSV for your accountant',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'download csv accountant tax gst',
        run: () => router.push('/reports'),
      },
      {
        id: 'action:trust',
        href: '/security',
        label: 'Open the Trust Centre',
        hint: 'Encryption, roles, audit chain',
        group: 'Actions',
        icon: Sparkles,
        keywords: 'security privacy encryption backup',
        run: () => router.push('/security'),
      },
    ];
    const liveActions: Command[] = quickActions.filter((action) => allows(action.href));

    // Switching console is itself a command: two keystrokes and the app
    // reshapes around the business the owner actually runs.
    const portalCommands: Command[] = PORTALS.filter((other) => other.id !== portal.id).map((other) => ({
      id: `portal-switch:${other.id}`,
      label: `Switch to ${other.name}`,
      hint: other.tagline,
      group: 'Business type',
      icon: PORTAL_ICONS[other.icon] ?? PORTAL_ICONS.general,
      keywords: `change portal business type ${other.name} ${other.examples.join(' ')}`,
      run: () => {
        applyTemplate(other.templateId);
        router.push('/home');
      },
    }));

    return [...navCommands, ...portalActions, ...liveActions, ...portalCommands];
  }, [router, nav, portal, allows, applyTemplate]);

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

  // Clear the query and the highlighted row each time the palette opens. This
  // uses React's documented "adjust state when a prop changes" pattern during
  // render, so the reset lands in the same commit as the open instead of
  // triggering a second render pass from an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }

  // Focusing the input is a genuine external side effect, so it stays in an
  // effect — and the frame is now cancelled on unmount rather than leaking.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

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
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-stone-200 bg-panel/95 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-fade-up"
      >
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3.5">
          <Search size={16} className="shrink-0 text-stone-600" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // A new query invalidates the highlighted row. Resetting it here
              // rather than in an effect keyed on `query` avoids an extra render.
              setActive(0);
            }}
            placeholder="Search modules, actions, anything…"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-600"
          />
          <kbd className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-stone-600">
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
                    isActive ? 'bg-brand-500/[0.14] ring-1 ring-inset ring-brand-500/25' : 'hover:bg-stone-50'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? 'bg-brand-gradient text-white' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-900">{command.label}</span>
                    {command.hint ? <span className="block truncate text-[11px] text-stone-600">{command.hint}</span> : null}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                    {command.group}
                  </span>
                  {isActive ? <CornerDownLeft size={13} className="shrink-0 text-brand-600" /> : <ArrowRight size={13} className="shrink-0 text-transparent" />}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-stone-200 px-4 py-2 text-[10px] text-stone-600">
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
