'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlaskConical, Sprout, X } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';

/**
 * Makes the zero-start / demo-data separation explicit everywhere in the console:
 * - Demo business loaded  → amber bar, clearly flagged sample data.
 * - Fresh real business   → quiet invitation to load the demo or start recording.
 */
export function DemoBanner() {
  const { state, actions } = useDukaanStore();
  const [dismissed, setDismissed] = useState(false);

  if (state.demoMode) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-2 text-xs text-amber-300 md:px-8">
        <p className="flex items-center gap-2 font-semibold">
          <FlaskConical size={14} className="shrink-0" />
          <span className="truncate">DEMO BUSINESS — sample data for exploration, clearly separated from real records.</span>
        </p>
        <button
          onClick={() => {
            if (window.confirm('Leave the demo business and start a fresh real business at ₹0?')) {
              actions.startFreshBusiness();
            }
          }}
          className="shrink-0 rounded-lg bg-amber-500/15 px-3 py-1.5 font-bold ring-1 ring-inset ring-amber-500/30 transition hover:bg-amber-500/25"
        >
          Start fresh business
        </button>
      </div>
    );
  }

  const isFresh = state.transactions.length === 0 && state.products.length === 0;
  if (!isFresh || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-brand-500/20 bg-brand-500/[0.07] px-4 py-2 text-xs text-brand-200 md:px-8">
      <p className="flex items-center gap-2 font-semibold">
        <Sprout size={14} className="shrink-0" />
        <span className="truncate">Your business starts at ₹0 — record real activity, or load the sample business to explore.</span>
      </p>
      <span className="flex shrink-0 items-center gap-2">
        <Link href="/products" className="hidden rounded-lg bg-white/[0.06] px-3 py-1.5 font-bold text-zinc-200 ring-1 ring-inset ring-white/[0.09] transition hover:bg-white/[0.1] sm:block">
          Add first product
        </Link>
        <button
          onClick={() => actions.loadDemoBusiness()}
          className="rounded-lg bg-brand-500/20 px-3 py-1.5 font-bold ring-1 ring-inset ring-brand-400/30 transition hover:bg-brand-500/30"
        >
          Load demo business
        </button>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300">
          <X size={13} />
        </button>
      </span>
    </div>
  );
}
