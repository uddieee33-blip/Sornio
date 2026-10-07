/**
 * Portal route policy — the enforcement half of the portal system.
 *
 * A portal must be real, not a coat of paint. If a gym portal is active, then
 * `/inventory` is not merely missing from the sidebar: the request never
 * reaches the page. That decision is made once, in this Edge-safe module, and
 * applied in two places that cannot disagree with each other:
 *
 *   • `middleware.ts`  — before the route renders, using the portal cookie.
 *   • `PortalGate`     — after hydration, using the live store value.
 *
 * Security note: the portal cookie can only ever *hide* modules. It carries no
 * data and grants no permission, so a tampered cookie cannot unlock anything —
 * it can only show a business a module it already had access to.
 */

import { entryForHref, MODULE_CATALOGUE } from './catalogue';
import { portalById, portalHasModule } from './registry';
import type { ModuleKey } from './types';

/** The portal a business is on, as chosen at onboarding / Business Setup. */
export const PORTAL_COOKIE = 'dukaan.portal';

/** Query flag used when a link points at a module this portal does not carry. */
export const LOCKED_PARAM = 'locked';

/** Every console route the portal system governs, longest path first. */
export const GOVERNED_ROUTES: string[] = MODULE_CATALOGUE.map((entry) => entry.href).sort(
  (a, b) => b.length - a.length,
);

const ROUTE_MODULE = new Map<string, ModuleKey>(MODULE_CATALOGUE.map((entry) => [entry.href, entry.module]));

/** Normalise a pathname: strip query/hash, trailing slash, keep it absolute. */
export function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0].split('#')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) return withoutQuery.slice(0, -1);
  return withoutQuery;
}

/** Which module owns this path? `null` for routes outside the console. */
export function moduleForPath(pathname: string): ModuleKey | null {
  const path = normalizePath(pathname);
  const direct = ROUTE_MODULE.get(path);
  if (direct) return direct;
  for (const route of GOVERNED_ROUTES) {
    if (path.startsWith(`${route}/`)) return ROUTE_MODULE.get(route) ?? null;
  }
  return null;
}

export type PortalAccessVerdict =
  | { allowed: true }
  | { allowed: false; module: ModuleKey; redirectTo: string };

/**
 * Is this path within what the portal carries?
 *
 * Blocked links land on the cockpit (which explains what happened) rather than
 * a bare 404 — an owner who taps a stale bookmark should be told why, not left
 * staring at an error page.
 *
 * `revealAll` is the Everything On switch (`lib/portals/master.ts`). It is a
 * second, *signed* input precisely because it moves in the opposite direction
 * to the portal cookie: the portal cookie can only ever hide a module, so it
 * needs no integrity; revealing one does. The caller is responsible for having
 * verified the signature — this function only applies the decision, and it
 * applies it to the portal layer alone. The plan check is a separate step in
 * the middleware and does not see this flag, which is what keeps "show me
 * everything" from ever meaning "give me everything".
 */
export function checkPortalAccess(
  portalId: unknown,
  pathname: string,
  options: { revealAll?: boolean } = {},
): PortalAccessVerdict {
  const moduleKey = moduleForPath(pathname);
  if (!moduleKey) return { allowed: true };
  if (options.revealAll) return { allowed: true };
  if (portalHasModule(portalId, moduleKey)) return { allowed: true };
  return { allowed: false, module: moduleKey, redirectTo: `/home?${LOCKED_PARAM}=${moduleKey}` };
}

/** Console routes this portal carries — the router warm-up order. */
export function routeHrefsFor(portalId: unknown): string[] {
  const portal = portalById(portalId);
  const hrefs: string[] = [];
  for (const section of portal.nav) {
    for (const link of section.links) {
      if (!hrefs.includes(link.href)) hrefs.push(link.href);
    }
  }
  return hrefs;
}

/** Every governed route, for warm-up when Everything On is live. */
export function allRouteHrefs(): string[] {
  return MODULE_CATALOGUE.map((entry) => entry.href);
}

/** The module label a portal uses in its own words (for the blocked notice). */
export function moduleLabelFor(portalId: unknown, moduleKey: ModuleKey): string {
  const portal = portalById(portalId);
  for (const section of portal.nav) {
    for (const link of section.links) {
      if (entryForHref(link.href)?.module === moduleKey) {
        return link.label ?? entryForHref(link.href)?.label ?? moduleKey;
      }
    }
  }
  return entryForHref(MODULE_CATALOGUE.find((entry) => entry.module === moduleKey)?.href ?? '')?.label ?? moduleKey;
}
