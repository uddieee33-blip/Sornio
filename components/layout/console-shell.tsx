'use client';

/**
 * The console frame: sidebar, top bar, command palette, and the offline-first
 * status it all reports.
 *
 * It also owns the *portal*: the blueprint for the business type currently
 * loaded. Everything inside inherits it through `usePortal()` — navigation,
 * vocabulary, accent colour, and which modules exist at all — so a module can
 * never appear in one place and be missing in another.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { Topbar } from './topbar';
import { CommandPalette, useCommandHotkey } from './command-palette';
import { DemoBanner } from './demo-banner';
import { PortalGate } from './portal-gate';
import { RouteWarmup } from '@/components/perf/route-warmup';
import { PortalProvider, usePortal } from '@/lib/portals/portal-provider';
import type { PortalId } from '@/lib/portals/types';

function ConsoleFrame({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { portal, accentStyle } = usePortal();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  useCommandHotkey(openPalette);

  return (
    <div
      className="portal-transition relative flex min-h-screen flex-col md:flex-row"
      style={accentStyle}
      data-portal={portal.id}
    >
      <RouteWarmup />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenCommand={openPalette} onOpenMobileMenu={openMobileMenu} />
        <DemoBanner />
        <MobileNav open={mobileMenuOpen} onClose={closeMobileMenu} />
        <main id="main" className="flex-1">
          <PortalGate>{children}</PortalGate>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}

export function ConsoleShell({
  children,
  initialPortalId,
}: {
  children: ReactNode;
  initialPortalId?: PortalId | null;
}) {
  return (
    <PortalProvider initialPortalId={initialPortalId ?? null}>
      <ConsoleFrame>{children}</ConsoleFrame>
    </PortalProvider>
  );
}
