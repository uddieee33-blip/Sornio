'use client';

/**
 * Warms the console routes during idle time so the first click on any sidebar
 * item is instant. Mounted once, inside the console layout.
 *
 * It warms **only the routes this portal carries**, in the order the sidebar
 * shows them — a gym has a dozen routes, not thirty, so the same idle budget
 * goes further and the first tap on any of them is already warm. Warming still
 * stops entirely when the connection is metered or slow: a "premium" app that
 * burns a customer's mobile data to feel fast is not premium.
 */

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { warmRoutes } from '@/lib/perf/prefetch';
import { installMonitor } from '@/lib/security/monitor';
import { usePortal } from '@/lib/portals/portal-provider';
import { routeHrefsFor } from '@/lib/portals/routes';
import { usePlan } from '@/components/billing/plan-provider';
import { checkPlanAccess } from '@/lib/plans/routes';

export function RouteWarmup() {
  const router = useRouter();
  const { portal } = usePortal();
  const { entitlement } = usePlan();

  // Recompute only when the portal or the plan changes, so the queue is not
  // rebuilt on every unrelated render.
  //
  // A route this plan cannot open is left out on purpose. Warming a locked
  // module costs two requests — the module and the redirect it is answered
  // with — and fetches a page the owner is going to see anyway. On a free plan
  // that is most of the menu, on every single page view.
  const routes = useMemo(
    () => routeHrefsFor(portal.id).filter((href) => checkPlanAccess(entitlement, href).allowed),
    [portal.id, entitlement],
  );

  useEffect(() => {
    // Client telemetry is installed once, after the page is interactive.
    installMonitor();

    const warmup = warmRoutes((href) => {
      try {
        router.prefetch(href);
      } catch {
        // Prefetch is best-effort and must never surface an error.
      }
    }, routes);

    return () => warmup.cancel();
  }, [router, routes]);

  return null;
}
