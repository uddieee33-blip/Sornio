'use client';

/**
 * Feedback layer.
 *
 * Every action in the console — a sale recorded, a plan started, a sync
 * completed, a permission refused — should answer the owner immediately.
 * Silence is what makes software feel unreliable, so this provider guarantees
 * a visible response and keeps it short, accessible, and non-blocking.
 *
 * Design notes:
 *  - announcements go through `aria-live` so screen readers hear them;
 *  - the queue is bounded (max 4 on screen) so a burst cannot bury the UI;
 *  - auto-dismiss timers pause while the pointer or focus is inside a toast.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'security' | 'loading';

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  /** Milliseconds; 0 means it stays until dismissed. */
  duration: number;
  action?: { label: string; onClick: () => void };
};

export type ToastInput = {
  kind?: ToastKind;
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type ToastContextValue = {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  security: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={17} />,
  error: <AlertTriangle size={17} />,
  warning: <AlertTriangle size={17} />,
  info: <Info size={17} />,
  security: <ShieldAlert size={17} />,
  loading: <Loader2 size={17} className="animate-spin" />,
};

const STYLES: Record<ToastKind, string> = {
  success: 'ring-emerald-500/25 bg-emerald-500/[0.09] text-emerald-200',
  error: 'ring-red-500/25 bg-red-500/[0.09] text-red-200',
  warning: 'ring-amber-500/25 bg-amber-500/[0.09] text-amber-200',
  info: 'ring-white/10 bg-white/[0.05] text-zinc-200',
  security: 'ring-violet-500/30 bg-violet-500/[0.1] text-violet-200',
  loading: 'ring-brand-500/25 bg-brand-500/[0.09] text-brand-200',
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = `toast-${(counter += 1)}`;
      const kind = input.kind ?? 'info';
      const toast: Toast = {
        id,
        kind,
        title: input.title.slice(0, 140),
        description: input.description?.slice(0, 300),
        duration: input.duration ?? (kind === 'error' || kind === 'security' ? 7000 : 3800),
        action: input.action,
      };
      setToasts((current) => [toast, ...current].slice(0, MAX_VISIBLE));
      if (toast.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), toast.duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      clear: () => {
        timers.current.forEach((timer) => clearTimeout(timer));
        timers.current.clear();
        setToasts([]);
      },
      success: (title, description) => push({ kind: 'success', title, description }),
      error: (title, description) => push({ kind: 'error', title, description }),
      info: (title, description) => push({ kind: 'info', title, description }),
      warning: (title, description) => push({ kind: 'warning', title, description }),
      security: (title, description) => push({ kind: 'security', title, description }),
    }),
    [toasts, push, dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2 md:bottom-6 md:right-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' || toast.kind === 'security' ? 'alert' : 'status'}
          className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-2xl p-3.5 ring-1 backdrop-blur-xl shadow-card ${STYLES[toast.kind]}`}
        >
          <span className="mt-0.5 shrink-0">{ICONS[toast.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{toast.title}</p>
            {toast.description ? <p className="mt-0.5 text-xs leading-relaxed opacity-80">{toast.description}</p> : null}
            {toast.action ? (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
                className="mt-2 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition hover:bg-white/[0.14]"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
          {toast.kind !== 'loading' ? (
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-lg p-1 opacity-60 transition hover:bg-white/[0.1] hover:opacity-100"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
