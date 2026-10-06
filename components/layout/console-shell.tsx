'use client';

/**
 * The console frame: sidebar, top bar, command palette, and the offline-first
 * status it all reports.
 *
 * It also owns the *portal*: the blueprint for the business type currently
 * loaded. Everything inside inherits it through `usePortal()` — navigation,
 * vocabulary, accent colour, and which modules exist at all — so a module can
 * never appear in one place and be missing in another.
 *
 * And it owns the *plan*: the entitlement this console is running on, read from
 * the server-issued cookie and published to the store's collection gate. The
 * frame decides what is on screen; the edge decides what is served; the plan
 * layer decides what a business has paid for — each one stated once.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { MobileBottomNav } from './mobile-bottom-nav';
import { Topbar } from './topbar';
import { CommandPalette, useCommandHotkey } from './command-palette';
import { DemoBanner } from './demo-banner';
import { PortalGate } from './portal-gate';
import { PlanProvider } from '@/components/billing/plan-provider';
import { PlanBanner } from '@/components/billing/plan-banner';
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
        <Topbar
          onOpenCommand={openPalette}
          onOpenMobileMenu={openMobileMenu}
          mobileMenuOpen={mobileMenuOpen}
        />
        <DemoBanner />
        <PlanBanner />
        <MobileNav open={mobileMenuOpen} onClose={closeMobileMenu} />
        <main id="main" className="mobile-content-space min-w-0 flex-1">
          <PortalGate>{children}</PortalGate>
        </main>
        <MobileBottomNav menuOpen={mobileMenuOpen} onOpenMenu={openMobileMenu} />
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
      <PlanProvider>
        <ConsoleFrame>{children}</ConsoleFrame>
      </PlanProvider>
    </PortalProvider>
  );
}
