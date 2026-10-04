'use client';

/**
 * Warms the console routes during idle time so the first click on any sidebar
 * item is instant. Mounted once, inside the console layout.
 *
 * Deliberately skips work when the connection is metered — a "premium" app
 * that burns a customer's mobile data to feel fast is not premium.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { warmRoutes } from '@/lib/perf/prefetch';
import { installMonitor } from '@/lib/security/monitor';

export function RouteWarmup() {
  const router = useRouter();

  useEffect(() => {
    // Client telemetry is installed once, after the page is interactive.
    installMonitor();

    const warmup = warmRoutes((href) => {
      try {
        router.prefetch(href);
      } catch {
        // Prefetch is best-effort and must never surface an error.
      }
    });

    return () => warmup.cancel();
  }, [router]);

  return null;
}
