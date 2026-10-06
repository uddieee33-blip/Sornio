'use client';

/**
 * A ticking clock, as an external store.
 *
 * Plan countdowns ("3 days left", "grace ends Sunday") depend on the wall
 * clock, which is *external mutable state* — reading it during render makes a
 * component impure, breaks hydration, and produces exactly the class of bug the
 * React team warns about. `useSyncExternalStore` is the sanctioned way to read
 * it, and the console already uses that pattern for connectivity in the topbar.
 *
 * Two details that matter:
 *
 *   • the snapshot is **bucketed** (`Math.floor(now / resolution)`), so it is a
 *     stable primitive between ticks and cannot cause a render loop;
 *   • the server snapshot is `0` — one deterministic value — so server-rendered
 *     HTML and the first hydrated paint always agree. Callers treat `0` as
 *     "clock not read yet" and show nothing time-dependent until the first tick,
 *     which arrives immediately after hydration.
 *
 * One module-level interval is shared by every subscriber and torn down when the
 * last one unmounts.
 */

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(() => {
      for (const notify of listeners) notify();
    }, 15_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * Current time in epoch milliseconds, refreshed at `resolutionMs`.
 * `0` means the clock has not been read yet (server render / first hydration).
 */
export function useNow(resolutionMs = 60_000): number {
  const snapshot = () => Math.floor(Date.now() / resolutionMs) * resolutionMs;
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
