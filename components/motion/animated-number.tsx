'use client';

/**
 * A figure that counts to its new value instead of swapping to it.
 *
 * This is the one piece of motion in the console that carries information
 * rather than polish. When a sale is recorded, four numbers on the cockpit
 * change at once; if they all snap, the owner has no idea which one moved or
 * by how much. Counting makes the *delta* visible — a figure that rolls a long
 * way moved a long way.
 *
 * Three rules it follows, because a counting number is very easy to get wrong:
 *
 *   1. **The first value never animates.** A page that loads by spinning every
 *      figure up from zero is a slot machine, not a ledger. Counting only ever
 *      happens on a *change*, after the owner has already seen a starting
 *      number.
 *   2. **It lands exactly.** The final frame is assigned the target value
 *      directly rather than being the last step of an interpolation, so a
 *      rounding error can never leave ₹1,24,999 on screen when the books say
 *      ₹1,25,000.
 *   3. **It respects the motion dial.** At Calm it is halved; at Off, and for
 *      `prefers-reduced-motion`, there is no animation at all and the number
 *      simply changes. The *text* is always the true value at every frame, so
 *      a screen reader reads a figure, never a blur.
 */

import { useEffect, useRef, useState } from 'react';
import { useMotionScale } from '@/lib/theme/appearance-provider';
import { DURATION } from '@/lib/motion/tokens';

/** Ease-out cubic: fast at first, so most of the distance is covered early. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({
  value,
  format,
  duration = DURATION.lazy,
  className = '',
  sensitive = false,
}: {
  value: number;
  /** How to render it — currency, a count, a percentage. */
  format: (value: number) => string;
  duration?: number;
  className?: string;
  /** Mark as a figure the privacy screen should blur. */
  sensitive?: boolean;
}) {
  const scale = useMotionScale();
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  const frame = useRef<number | null>(null);

  const ms = duration * scale;
  // At Calm-off, or under `prefers-reduced-motion`, the scale is 0. The figure
  // is then *derived* rather than animated — no interpolation state at all,
  // so there is nothing to set and no frame where the old number is still on
  // screen. Deriving beats setting: a setState inside an effect to say "do not
  // animate" is a re-render spent announcing that nothing happened.
  const settled = ms <= 0;

  useEffect(() => {
    const from = previous.current;
    const to = value;
    previous.current = value;

    if (from === to || ms <= 0) return;

    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / ms);
      if (progress >= 1) {
        // Land exactly on the target — never on the last interpolated step.
        setDisplay(to);
        frame.current = null;
        return;
      }
      setDisplay(from + (to - from) * easeOut(progress));
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [value, ms]);

  return (
    <span
      className={`tabular ${className}`}
      {...(sensitive ? { 'data-sensitive': '' } : {})}
      // The live region is the *settled* value, so assistive tech announces a
      // figure once rather than narrating every frame of the count.
      aria-label={format(value)}
    >
      <span aria-hidden>{format(settled ? value : display)}</span>
    </span>
  );
}
