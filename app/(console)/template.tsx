'use client';

/**
 * Per-route transition wrapper.
 *
 * The difference between "the app blinked" and "the app moved" is about
 * 200ms of opacity and eight pixels of travel. This does that, and nothing
 * more, on two paths:
 *
 *   1. **View Transitions**, where the browser has them. The whole document
 *      cross-fades in a single compositor pass — the outgoing frame is a
 *      snapshot, so nothing re-renders to animate and the cost is one GPU
 *      composite rather than a React tree's worth of work. The keyframes live
 *      in `globals.css` under `::view-transition-*`.
 *   2. **The Web Animations API** everywhere else, animating this wrapper's
 *      opacity and transform only — both compositor properties, so a cheap
 *      till PC never re-layouts mid-navigation.
 *
 * Three things it is careful about:
 *
 *   • **Motion is a setting, not a guess.** The duration comes from the
 *     owner's Appearance dial via `useMotionScale()`, which already folds in
 *     `prefers-reduced-motion`. At zero, nothing animates — the page just
 *     appears, which is the correct behaviour, not a degraded one.
 *   • **A missing API never breaks a navigation.** Every capability is probed
 *     and every path falls through to "show the page".
 *   • **Scroll is restored instantly, not smoothly.** `html { scroll-behavior:
 *     smooth }` is right for in-page anchors and wrong for route changes: an
 *     owner who taps Reports wants to be at the top of Reports now, not to
 *     watch the previous page scroll away first.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useMotionScale } from '@/lib/theme/appearance-provider';
import { DURATION, EASE, ENTER_UP } from '@/lib/motion/tokens';

/** Does this browser do document-level view transitions? */
function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

export default function ConsoleTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scale = useMotionScale();
  const ref = useRef<HTMLDivElement>(null);
  // The very first render is a page load, not a navigation. Animating it would
  // delay the only paint the owner is actually waiting for.
  const firstRender = useRef(true);

  useEffect(() => {
    const node = ref.current;

    // Jump to the top before anything animates, so the new page is readable
    // the moment it appears rather than after a scroll.
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (!node || scale <= 0) return;

    // Where the browser owns the transition, let it: a second animation on top
    // of a view transition is two animations fighting over the same frames.
    if (supportsViewTransitions()) return;

    if (typeof node.animate !== 'function') return;
    node.animate(ENTER_UP, {
      duration: DURATION.base * scale,
      easing: EASE.settle,
      fill: 'both',
    });
  }, [pathname, scale]);

  return <div ref={ref}>{children}</div>;
}
