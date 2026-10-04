'use client';

/**
 * Per-route transition wrapper.
 *
 * A 180 ms fade-and-lift on each navigation is the difference between "the app
 * blinked" and "the app moved". It runs on the compositor (opacity + transform
 * only), so it costs nothing on the main thread, and it is disabled entirely
 * for people who asked their system to reduce motion.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { prefersReducedMotion } from '@/lib/perf/idle';

export default function ConsoleTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    // Guard the Web Animations API: a handful of older browsers lack it, and a
    // missing animation must never break a navigation.
    if (!node || typeof node.animate !== 'function' || prefersReducedMotion()) return;
    node.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
    );
    // Scroll restoration on route change — instant, not smooth, so the new page
    // is readable the moment it appears.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}
