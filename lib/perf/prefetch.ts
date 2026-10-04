'use client';

/**
 * Route warm-up.
 *
 * The single biggest cause of a console feeling slow is the first click on each
 * sidebar item: the route chunk is fetched, parsed, and only then rendered.
 * We fix that by warming routes **in the order a shop owner actually uses
 * them**, during idle time, at one route per idle slice so warming never
 * competes with the page the owner is already reading.
 *
 * Caveat handled honestly: warming 29 routes at once would itself be wasteful
 * on a slow connection, so we stop when the browser reports the connection is
 * metered (`saveData`) or slow (`2g`/`slow-2g`).
 */

import { onIdle } from './idle';

export type NavigatorConnection = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
};

export function connection(): NavigatorConnection | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { connection?: NavigatorConnection }).connection ?? null;
}

/** Should we avoid speculative network work? */
export function isMeteredOrSlow(): boolean {
  const conn = connection();
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
}

/** Priority order: the routes an owner opens most first. */
export const WARM_ORDER = [
  '/home',
  '/sales',
  '/products',
  '/billing',
  '/dashboard',
  '/customers',
  '/insights',
  '/reports',
  '/transactions',
  '/expenses',
  '/memberships',
  '/alerts',
  '/payments',
  '/inventory',
  '/profitability',
  '/cashflow',
  '/reminders',
  '/marketing',
  '/suppliers',
  '/comparisons',
  '/audit',
  '/settings',
  '/business',
  '/team',
] as const;

export type PrefetchFn = (href: string) => void;

/**
 * Warm routes one per idle slice. Returns a cancel handle so a component can
 * stop the queue on unmount.
 */
export function warmRoutes(prefetch: PrefetchFn, routes: readonly string[] = WARM_ORDER): { cancel: () => void } {
  let cancelled = false;
  let index = 0;
  const handles: { cancel: () => void }[] = [];

  const step = () => {
    if (cancelled || index >= routes.length) return;
    if (isMeteredOrSlow()) return;
    prefetch(routes[index]);
    index += 1;
    handles.push(onIdle(step, 1200));
  };

  handles.push(onIdle(step, 1200));
  return {
    cancel: () => {
      cancelled = true;
      handles.forEach((handle) => handle.cancel());
    },
  };
}
