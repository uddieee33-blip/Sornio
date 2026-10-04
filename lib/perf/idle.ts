'use client';

/**
 * Main-thread etiquette.
 *
 * A console that stutters feels cheap no matter how good the numbers are.
 * Every background task in DukaanOS (prefetching, hashing, vault writes,
 * chart aggregation) is scheduled through this module so it runs when the
 * browser is actually idle, never in the middle of an interaction.
 *
 * - `onIdle`         runs after paint, using requestIdleCallback when available
 * - `debounce`       trailing-edge debounce with a cancel handle
 * - `throttleRaf`    at most one call per animation frame
 * - `chunked`        splits heavy loops across frames so nothing blocks >50 ms
 * - `afterPaint`     double-rAF, guarantees the browser has painted first
 */

type IdleHandle = { cancel: () => void };

const ric =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (window as unknown as { requestIdleCallback: (cb: (deadline: { timeRemaining: () => number }) => void, opts?: { timeout: number }) => number }).requestIdleCallback
    : null;

const cic =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? (window as unknown as { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback
    : null;

/** Run work when the browser has spare capacity. */
export function onIdle(task: () => void, timeoutMs = 2000): IdleHandle {
  if (typeof window === 'undefined') return { cancel: () => {} };
  if (ric) {
    const handle = ric(() => task(), { timeout: timeoutMs });
    return { cancel: () => cic?.(handle) };
  }
  const handle = window.setTimeout(task, 1);
  return { cancel: () => window.clearTimeout(handle) };
}

/** Guarantee a paint happened before doing work the user must not see hitch. */
export function afterPaint(task: () => void): void {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => onIdle(task).cancel));
}

export type Cancelable = { cancel: () => void };

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs = 200,
): ((...args: Args) => void) & Cancelable {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

export function throttleRaf<Args extends unknown[]>(fn: (...args: Args) => void): ((...args: Args) => void) & Cancelable {
  let frame: number | null = null;
  let latest: Args;
  const wrapped = (...args: Args) => {
    latest = args;
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      fn(...latest);
    });
  };
  wrapped.cancel = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };
  return wrapped;
}

/**
 * Process a large list in time-sliced batches so a 10 000-row ledger never
 * freezes the tab. Resolves with the accumulated results.
 */
export async function chunked<T, R>(
  items: T[],
  worker: (item: T, index: number) => R,
  options: { batchSize?: number; budgetMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<R[]> {
  const { batchSize = 250, budgetMs = 8, onProgress } = options;
  const results: R[] = new Array(items.length);
  let index = 0;

  while (index < items.length) {
    const started = performance.now();
    let processed = 0;
    while (index < items.length && processed < batchSize) {
      results[index] = worker(items[index], index);
      index += 1;
      processed += 1;
      if (performance.now() - started > budgetMs) break;
    }
    onProgress?.(index, items.length);
    if (index < items.length) {
      await new Promise<void>((resolve) => {
        const frame = window.requestAnimationFrame(() => resolve());
        void frame;
      });
    }
  }
  return results;
}

/** True when the user has asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
