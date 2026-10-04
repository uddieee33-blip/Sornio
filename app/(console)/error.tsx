'use client';

/**
 * Console error boundary.
 *
 * If a module throws, the owner keeps their navigation, their session, and
 * their data — only the broken panel is replaced. The error is reported
 * through the redacting telemetry layer, so what we log never contains a
 * customer's phone number or a UPI id.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { captureError } from '@/lib/security/monitor';

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, 'console-error-boundary');
  }, [error]);

  const reference = error.digest ?? 'local';

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl bg-white/[0.03] p-6 ring-1 ring-inset ring-white/[0.07] md:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/25">
          <AlertTriangle size={20} />
        </span>

        <h1 className="mt-4 font-display text-xl font-bold text-white">This module hit a problem</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Your records are untouched — nothing was written or lost. The rest of the console is still usable; try again, or
          head back to the cockpit.
        </p>

        <p className="mt-4 rounded-xl bg-black/30 px-3 py-2 font-mono text-[11px] text-zinc-500 ring-1 ring-inset ring-white/[0.05]">
          Reference: {reference}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
          >
            <RefreshCw size={15} /> Try again
          </button>
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            <ArrowLeft size={15} /> Back to cockpit
          </Link>
        </div>
      </div>
    </div>
  );
}
