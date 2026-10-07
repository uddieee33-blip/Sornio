'use client';

/**
 * Keep a thing mounted long enough for it to leave.
 *
 * `{open && <Sheet />}` is the most common pattern in React and it is the
 * reason almost every drawer in almost every app enters gracefully and then
 * disappears like a dropped frame. Entering is free — the element mounts and
 * a CSS animation plays. Leaving is not: by the time the state says "closed"
 * the element is already gone, and there is nothing left to animate.
 *
 * This hook holds the unmount back for exactly the length of the exit, and
 * reports which phase we are in so the component can swap its classes.
 *
 * Three details that matter more than they look:
 *
 *   • **It reads the owner's motion setting.** At Off (`--motion-scale: 0`)
 *     the exit collapses to nothing and the element unmounts in the same
 *     commit — no artificial delay imposed on somebody who explicitly asked
 *     for no animation, where a held-back unmount would read as lag.
 *   • **Re-opening during an exit cancels it.** A double-tapped menu button
 *     must not queue a close behind an open.
 *   • **The transition is started during render, not in an effect.** React
 *     supports adjusting state while rendering in response to a changed prop,
 *     and it is the correct tool here: the exit has to begin in the same
 *     commit that `open` flipped, or the element paints one frame in its
 *     entered state after the user already asked for it to go.
 */

import { useEffect, useRef, useState } from 'react';
import { useMotionScale } from '@/lib/theme/appearance-provider';
import { DURATION } from './tokens';

export type PresencePhase = 'entering' | 'leaving';

export function usePresence(open: boolean, exitMs: number = DURATION.quick) {
  const scale = useMotionScale();
  const [leaving, setLeaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const timer = useRef<number | null>(null);

  if (wasOpen !== open) {
    setWasOpen(open);
    // Closing with motion on: hold the element for one exit. Closing with
    // motion off, or opening: nothing to hold.
    setLeaving(!open && exitMs * scale > 0);
  }

  useEffect(() => {
    if (!leaving) return;
    timer.current = window.setTimeout(() => {
      setLeaving(false);
      timer.current = null;
    }, exitMs * scale);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [exitMs, leaving, scale]);

  return {
    /** Render the element while this is true. */
    mounted: open || leaving,
    phase: (open ? 'entering' : 'leaving') as PresencePhase,
    leaving: !open && leaving,
  };
}
