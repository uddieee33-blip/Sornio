'use client';

/**
 * Portal provider.
 *
 * One hook — `usePortal()` — that every screen reads to know which business it
 * is inside: the blueprint, the navigation, the vocabulary, the accent, and
 * whether a module is part of this console at all.
 *
 * Two details that matter:
 *
 *  1. **No flicker.** The portal is resolved on the server from the portal
 *     cookie and passed in as `initialPortalId`, so the first paint already
 *     shows the right console. When the store hydrates, the live template
 *     id wins — and the cookie is reconciled to match.
 *  2. **The cookie follows the truth.** Every change posts to `/api/portal`,
 *     which validates the id against the whitelist and re-issues an httpOnly
 *     cookie. Edge middleware then enforces it on the next request.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { portalById, portalForTemplate } from './registry';
import { DEFAULT_PORTAL_ID } from './blueprints';
import { resolveNav, type ResolvedNavSection } from './nav';
import { checkPortalAccess, moduleForPath, PORTAL_COOKIE } from './routes';
import { publishPortal } from './sync';
import { revealedNavSection, useMasterSwitchOptional } from './master-client';
import { useDukaanStore } from '@/lib/store';
import { usePlan } from '@/components/billing/plan-provider';
import { useAppearance } from '@/lib/theme/appearance-provider';
import type { ModuleKey, PortalBlueprint, PortalId, PortalVocabulary } from './types';

export type PortalContextValue = {
  /** The blueprint for the business currently loaded. */
  portal: PortalBlueprint;
  /** Navigation, already labelled and iconised for this trade. */
  nav: ResolvedNavSection[];
  /**
   * True when Everything On is live: the navigation carries all 27 modules and
   * `allows` stops refusing the ones this trade does not use. The plan layer is
   * untouched — see `lib/portals/master.ts`.
   */
  revealAll: boolean;
  /** The trade's own navigation, without the revealed extras. */
  portalNav: ResolvedNavSection[];
  /** This trade's words, resolved to full sentences. */
  terms: PortalVocabulary;
  /** True while the business has not yet committed to a portal. */
  needsChoice: boolean;
  /** Is this route part of the console this business is on? */
  allows: (href: string) => boolean;
  /** True when the portal cookie is known to match the live store value. */
  cookieSynced: boolean;
  /** CSS custom properties that recolour the console for this trade. */
  accentStyle: CSSProperties;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({
  children,
  initialPortalId,
}: {
  children: ReactNode;
  /** Resolved on the server from the portal cookie (SSR-stable first paint). */
  initialPortalId?: PortalId | null;
}) {
  const { state, hydrated } = useDukaanStore();
  const { entitlement } = usePlan();
  const { resolved } = useAppearance();
  const useSornioAccent = resolved.id === 'monsoon' || resolved.id === 'graphite';

  // Which portal are we on? Before hydration, trust the cookie the server read.
  // After hydration, the store is authoritative and the cookie is reconciled.
  const templateId = state.profile.templateId;
  const [cookiePortalId, setCookiePortalId] = useState<PortalId | null>(initialPortalId ?? null);

  const portal = useMemo(() => {
    if (hydrated) return portalForTemplate(templateId);
    return portalById(cookiePortalId ?? DEFAULT_PORTAL_ID);
  }, [hydrated, templateId, cookiePortalId]);

  const needsChoice = hydrated && templateId === '';

  // Keep the enforcement cookie in step with the store. An empty template is
  // published too: the server maps it back to the general portal, so a stale
  // value can never strand an owner in a console they no longer run.
  //
  // Failure is harmless — the in-app gate still holds, only the edge prerender
  // lags. The state update lands in the promise callback rather than the effect
  // body, so this cannot cascade a render.
  useEffect(() => {
    if (!hydrated || cookiePortalId === portal.id) return;
    let cancelled = false;
    publishPortal(templateId)
      .then((result) => {
        if (cancelled || !result.ok || !result.portalId) return;
        setCookiePortalId(result.portalId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hydrated, templateId, portal.id, cookiePortalId]);

  // Everything On, when the console shell is above us. `null` means there is
  // no shell (the public site, a test) and therefore nothing to reveal.
  const master = useMasterSwitchOptional();
  // A genuine, currently running full trial reveals all modules. The signed
  // entitlement was validated by the plan API and remains separately enforced
  // by the server; this only controls the visible portal navigation and gate.
  const revealAll = (master?.on ?? false) || entitlement.state === 'trialing';

  const portalNav = useMemo(() => resolveNav(portal), [portal]);

  // The revealed modules arrive as their *own* section rather than merged into
  // the trade's menu, so an owner can still see at a glance which screens are
  // theirs and which are the rest of DukaanOS.
  const nav = useMemo(() => {
    if (!revealAll) return portalNav;
    const extra = revealedNavSection(portal, portalNav);
    return extra ? [...portalNav, extra] : portalNav;
  }, [revealAll, portal, portalNav]);

  const allows = useCallback(
    (href: string) => checkPortalAccess(portal.id, href, { revealAll }).allowed,
    [portal.id, revealAll],
  );

  const accentStyle = useMemo(
    () =>
      ({
        '--portal-accent': useSornioAccent ? 'var(--c-brand-500)' : portal.accent.rgb,
        '--portal-accent-deep': useSornioAccent ? 'var(--c-brand-700)' : portal.accent.deepRgb,
      }) as CSSProperties,
    [useSornioAccent, portal.accent.rgb, portal.accent.deepRgb],
  );

  const value = useMemo<PortalContextValue>(
    () => ({
      portal,
      nav,
      portalNav,
      revealAll,
      terms: portal.terms,
      needsChoice,
      allows,
      cookieSynced: cookiePortalId === portal.id,
      accentStyle,
    }),
    [portal, nav, portalNav, revealAll, needsChoice, allows, cookiePortalId, accentStyle],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const context = useContext(PortalContext);
  if (!context) throw new Error('usePortal must be used inside PortalProvider');
  return context;
}

/** The module a pathname belongs to, for screens that gate their own content. */
export function usePortalModule(href: string): ModuleKey | null {
  const { portal } = usePortal();
  return moduleForPath(href) ?? (portal ? null : null);
}

export { PORTAL_COOKIE };
