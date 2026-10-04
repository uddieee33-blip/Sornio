'use client';

/**
 * The console frame: sidebar, top bar, command palette, and the offline-first
 * status it all reports. Kept as a client component so the palette and hotkeys
 * live next to the layout they belong to, while the pages inside stay server
 * components wherever possible.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { Topbar } from './topbar';
import { CommandPalette, useCommandHotkey } from './command-palette';
import { DemoBanner } from './demo-banner';
import { RouteWarmup } from '@/components/perf/route-warmup';

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useCommandHotkey(openPalette);

  return (
    <div className="relative flex min-h-screen flex-col md:flex-row">
      <RouteWarmup />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenCommand={openPalette} />
        <DemoBanner />
        <MobileNav />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
