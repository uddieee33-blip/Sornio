'use client';

/**
 * Error + performance telemetry with a privacy floor.
 *
 * What we collect: error type, a redacted message, a component label, the
 * route, a coarse timing bucket, and a random session id. What we never
 * collect: names, phone numbers, UPI ids, amounts, bank details, tokens, or
 * anything that identifies a customer. `redact()` runs on the way in, and the
 * payload is capped before it is buffered or sent.
 *
 * Buffers are bounded ring buffers — a render loop that throws 10k times a
 * second cannot grow memory or flood the network.
 */

import { randomToken } from './crypto';
import { redact } from './redact';

export type TelemetryEvent = {
  id: string;
  kind: 'error' | 'unhandled-rejection' | 'resource' | 'web-vital' | 'long-task';
  at: string;
  route: string;
  message: string;
  label?: string;
  severity: 'warning' | 'critical';
  /** Coarse bucket, never an exact number that could be fingerprinted. */
  value?: string;
  count: number;
};

const MAX_BUFFER = 40;
const MAX_MESSAGE = 300;
const DEDUPE_WINDOW_MS = 5000;

const buffer: TelemetryEvent[] = [];
const recent = new Map<string, number>();
/** Random per-tab id: correlates events without identifying a person. */
export const sessionId = typeof window === 'undefined' ? 'ssr' : randomToken(8);

let installed = false;
let onEvent: ((event: TelemetryEvent) => void) | null = null;

function currentRoute(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

function bucket(value: number): string {
  if (value < 100) return '<100ms';
  if (value < 250) return '100-250ms';
  if (value < 500) return '250-500ms';
  if (value < 1000) return '500ms-1s';
  if (value < 2500) return '1-2.5s';
  if (value < 5000) return '2.5-5s';
  return '>5s';
}

function dedupeKey(kind: string, message: string, label?: string): string {
  return `${kind}::${label ?? ''}::${message.slice(0, 120)}`;
}

function push(event: Omit<TelemetryEvent, 'id' | 'at' | 'route' | 'count' | 'message'> & { message: string }): void {
  if (typeof window === 'undefined') return;

  const key = dedupeKey(event.kind, event.message, event.label);
  const now = Date.now();
  const lastSeen = recent.get(key);
  if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
    const existing = buffer.find((item) => dedupeKey(item.kind, item.message, item.label) === key);
    if (existing) existing.count += 1;
    return;
  }
  recent.set(key, now);
  if (recent.size > 200) {
    // Bound the dedupe map as well.
    for (const [entry] of recent) {
      if (now - (recent.get(entry) ?? 0) > DEDUPE_WINDOW_MS * 4) recent.delete(entry);
    }
  }

  const record: TelemetryEvent = {
    id: randomToken(6),
    at: new Date().toISOString(),
    kind: event.kind,
    route: currentRoute(),
    message: redact(event.message).slice(0, MAX_MESSAGE),
    label: event.label?.slice(0, 80),
    severity: event.severity,
    value: event.value,
    count: 1,
  };

  buffer.unshift(record);
  if (buffer.length > MAX_BUFFER) buffer.length = MAX_BUFFER;

  onEvent?.(record);
  if (process.env.NODE_ENV !== 'production') {
    // Local diagnostics only — never in the production console.
    console.debug(`[dukaanos:${record.kind}]`, record.label ?? '', record.message);
  }
}

/** Report an error from anywhere in the client app. */
export function captureError(error: unknown, label?: string): TelemetryEvent | null {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : 'Unknown error';
  push({ kind: 'error', message, label, severity: 'critical' });
  return buffer[0] ?? null;
}

export function captureWarning(message: string, label?: string): void {
  push({ kind: 'error', message, label, severity: 'warning' });
}

/** Approximate Web Vitals → coarse buckets, no exact fingerprints. */
export function reportVital(name: 'LCP' | 'CLS' | 'INP' | 'TTFB' | 'FCP', value: number): void {
  push({
    kind: 'web-vital',
    message: `${name} rendered`,
    label: name,
    severity: 'warning',
    value: name === 'CLS' ? (value < 0.1 ? 'good' : value < 0.25 ? 'ok' : 'poor') : bucket(value),
  });
}

export function reportLongTask(durationMs: number): void {
  push({
    kind: 'long-task',
    message: 'Main thread blocked',
    label: 'long-task',
    severity: 'warning',
    value: bucket(durationMs),
  });
}

export function telemetrySnapshot(): TelemetryEvent[] {
  return [...buffer];
}

export function onTelemetry(listener: (event: TelemetryEvent) => void): () => void {
  onEvent = listener;
  return () => {
    onEvent = null;
  };
}

/** Install global handlers + performance observers exactly once. */
export function installMonitor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && target !== (window as unknown as HTMLElement) && (target as HTMLImageElement).src) {
      push({ kind: 'resource', message: 'A resource failed to load', label: (target as HTMLImageElement).src.split('/').pop(), severity: 'warning' });
      return;
    }
    captureError(event.error ?? event.message, 'window.onerror');
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, 'unhandledrejection');
  });

  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) reportLongTask(entry.duration);
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask is not supported everywhere (Safari) — silently skip.
  }

  try {
    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') reportVital('FCP', entry.startTime);
      }
    });
    paintObserver.observe({ entryTypes: ['paint'] });
  } catch {
    // Optional.
  }

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) reportVital('LCP', last.startTime);
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch {
    // Optional.
  }
}
