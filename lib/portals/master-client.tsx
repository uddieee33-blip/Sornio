'use client';

/**
 * Everything On, as the console experiences it.
 *
 * The edge already decides whether a *request* for a hidden module is served
 * (`middleware.ts`, step 5). This provider decides whether the module is
 * *offered* — whether it appears in the sidebar, in ⌘K, and in the cockpit's
 * quick actions. The two have to agree, so both read the same signed record:
 * the server resolves it for the first paint and hands it down, and the client
 * only ever changes it by asking the server to re-sign it.
 *
 * The client therefore cannot widen its own console by editing React state.
 * It can render a wider menu — and every link in that menu would be refused at
 * the edge on the next navigation. Which is the correct failure mode: the UI
 * is a suggestion, the cookie is the decision.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';
import { MODULE_CATALOGUE } from './catalogue';
import { PORTAL_ICONS } from './icons';
import type { PortalBlueprint } from './types';
import type { ResolvedNavSection } from './nav';

export type MasterState = {
  /** Is every module currently revealed? */
  on: boolean;
  /** Days before the reveal lapses back to the trade's own shape. */
  daysLeft: number;
  /** A request is in flight. */
  busy: boolean;
  /** The last failure, in words an owner can act on. */
  error: string | null;
  set: (on: boolean) => Promise<boolean>;
};

const MasterContext = createContext<MasterState | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function MasterSwitchProvider({
  children,
  initialOn,
  initialDaysLeft,
}: {
  children: ReactNode;
  initialOn: boolean;
  initialDaysLeft: number;
}) {
  const [on, setOn] = useState(initialOn);
  const [daysLeft, setDaysLeft] = useState(initialDaysLeft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      // The middleware mints the CSRF token on any response; if this tab has
      // not seen one yet, one safe GET to the same endpoint is enough.
      let token = readCookie(CSRF_COOKIE);
      if (!token) {
        await fetch('/api/master', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
        token = readCookie(CSRF_COOKIE);
      }

      const response = await fetch('/api/master', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { [CSRF_HEADER]: token } : {}) },
        body: JSON.stringify({ on: next }),
        credentials: 'same-origin',
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as {
        on?: boolean;
        daysLeft?: number;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? `That did not save (${response.status}).`);
        return false;
      }

      // Trust the server's answer, not the request. If the endpoint decided
      // something different from what was asked, the console shows what the
      // edge will actually enforce.
      setOn(Boolean(payload.on));
      setDaysLeft(Number(payload.daysLeft ?? 0));
      return true;
    } catch {
      setError('No connection. The console stays exactly as it is.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<MasterState>(() => ({ on, daysLeft, busy, error, set }), [on, daysLeft, busy, error, set]);

  return <MasterContext.Provider value={value}>{children}</MasterContext.Provider>;
}

export function useMasterSwitch(): MasterState {
  const context = useContext(MasterContext);
  if (!context) throw new Error('useMasterSwitch must be used inside MasterSwitchProvider');
  return context;
}

/**
 * The same state, but `null` when there is no provider above.
 *
 * `PortalProvider` uses this so the portal system keeps working on its own —
 * in a test, on the public site, in any tree that has no console shell — while
 * still widening its navigation when the shell *is* there. A provider that
 * throws would make the portal layer depend on the console frame, which is
 * backwards: the frame is built out of the portal, not the other way round.
 */
export function useMasterSwitchOptional(): MasterState | null {
  return useContext(MasterContext);
}

/**
 * The extra navigation section that appears when Everything On is live.
 *
 * It is a *separate section*, labelled plainly, rather than modules quietly
 * merged into the trade's own menu. A salon owner who switched this on should
 * still be able to see at a glance which five screens are theirs and which
 * twenty-two are the rest of DukaanOS — otherwise the switch has not widened
 * their console, it has flooded it.
 *
 * Labels here are the canonical ones from the catalogue, not the trade's
 * vocabulary, for the same reason: these modules were never written in this
 * trade's words, and inventing words for them would be a worse lie than
 * showing the plain ones.
 */
export function revealedNavSection(
  portal: PortalBlueprint,
  nav: ResolvedNavSection[],
): ResolvedNavSection | null {
  const already = new Set(nav.flatMap((section) => section.links).map((link) => link.href));
  const extra = MODULE_CATALOGUE.filter((entry) => !already.has(entry.href));
  if (extra.length === 0) return null;

  return {
    title: 'Everything else',
    links: extra.map((entry) => ({
      href: entry.href,
      label: entry.label,
      module: entry.module,
      icon: PORTAL_ICONS[entry.icon] ?? PORTAL_ICONS.general,
      keywords: `${entry.keywords} everything on revealed ${portal.name}`,
    })),
  };
}
