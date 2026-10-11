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
import { CounterLockProvider, CounterLockScreen, useCounterLock } from '@/components/security/counter-lock';
import { PortalProvider, usePortal } from '@/lib/portals/portal-provider';
import { MasterSwitchProvider } from '@/lib/portals/master-client';
import type { PortalId } from '@/lib/portals/types';
import type { RenderedIdentity } from '@/lib/auth/identity';

function ConsoleFrame({ children, identity }: { children: ReactNode; identity: RenderedIdentity | null }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { portal, accentStyle } = usePortal();
  const lock = useCounterLock();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  useCommandHotkey(openPalette);

  // The lock replaces the console rather than covering it: while it is on, the
  // takings, the khata and the customer list are not in the DOM at all. This
  // sits after every hook so the order of hooks never depends on the lock.
  if (lock.locked) return <CounterLockScreen />;

  return (
    <div
      className="portal-transition relative flex min-h-screen flex-col md:flex-row"
      style={accentStyle}
      data-portal={portal.id}
    >
      <RouteWarmup />
      <Sidebar identity={identity} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenCommand={openPalette}
          onOpenMobileMenu={openMobileMenu}
          mobileMenuOpen={mobileMenuOpen}
        />
        <DemoBanner />
        <PlanBanner />
        <MobileNav open={mobileMenuOpen} onClose={closeMobileMenu} identity={identity} />
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
  initialRevealAll = false,
  initialRevealDaysLeft = 0,
  initialIdentity = null,
}: {
  children: ReactNode;
  initialPortalId?: PortalId | null;
  /** Everything On, resolved from the signed cookie on the server. */
  initialRevealAll?: boolean;
  initialRevealDaysLeft?: number;
  /**
   * Who is at this console, resolved and verified on the server. It arrives here
   * already checked — which is why the top bar can name the owner on the first
   * paint instead of waiting for the store to hydrate and then correcting itself.
   */
  initialIdentity?: RenderedIdentity | null;
}) {
  return (
    // Everything On sits *outside* the portal, because it changes what the
    // portal offers. The portal still decides the words, the accent and the
    // cockpit; the switch only decides how much of the catalogue is on the
    // menu — and the plan layer below is deliberately not told about it.
    <MasterSwitchProvider initialOn={initialRevealAll} initialDaysLeft={initialRevealDaysLeft}>
      <PortalProvider initialPortalId={initialPortalId ?? null}>
        {/* The lock wraps the frame so the whole console — navigation included —
            is behind it, and the PIN is checked before any of it renders. */}
        <CounterLockProvider>
          <PlanProvider>
            <ConsoleFrame identity={initialIdentity}>{children}</ConsoleFrame>
          </PlanProvider>
        </CounterLockProvider>
      </PortalProvider>
    </MasterSwitchProvider>
  );
}
