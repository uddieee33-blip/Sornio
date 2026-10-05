'use client';

import { RefreshCw } from 'lucide-react';
import { BrandIcon } from '@/components/ui/BrandLogo';

/**
 * Global error boundary — if anything ever fails client-side, the owner sees
 * a clean recovery screen with retry, never a blank "unable to load" page.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-card backdrop-blur">
        <BrandIcon size={56} className="mx-auto h-14 w-14 rounded-2xl shadow-glow" />
        <h1 className="mt-5 font-display text-xl font-bold text-white">Something tripped on our side</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Your data is safe on this device. Tap retry and you&apos;ll be right back where you were.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
        >
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    </div>
  );
}
