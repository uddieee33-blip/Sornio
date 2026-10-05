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
      <div className="flex items-center justify-between gap-3 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-2 text-xs text-amber-700 md:px-8">
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
    <div className="flex items-center justify-between gap-3 border-b border-brand-500/20 bg-brand-500/[0.07] px-4 py-2 text-xs text-brand-700 md:px-8">
      <p className="flex items-center gap-2 font-semibold">
        <Sprout size={14} className="shrink-0" />
        <span className="truncate">Your business starts at ₹0 — record real activity, or load the sample business to explore.</span>
      </p>
      <span className="flex shrink-0 items-center gap-2">
        <Link href="/products" className="hidden rounded-lg bg-stone-100 px-3 py-1.5 font-bold text-stone-800 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200 sm:block">
          Add first product
        </Link>
        <button
          onClick={() => actions.loadDemoBusiness()}
          className="rounded-lg bg-brand-500/20 px-3 py-1.5 font-bold ring-1 ring-inset ring-brand-400/30 transition hover:bg-brand-500/30"
        >
          Load demo business
        </button>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded-lg p-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-700">
          <X size={13} />
        </button>
      </span>
    </div>
  );
}
