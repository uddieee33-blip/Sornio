'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlaskConical, Sprout, X } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';
import { portalForTemplate } from '@/lib/portals/registry';

/**
 * Makes the zero-start / demo-data separation explicit everywhere in the console:
 * - Demo business loaded  → amber bar, clearly flagged sample data.
 * - Fresh real business   → quiet invitation to load the demo or start recording.
 */
export function DemoBanner() {
  const { state, actions } = useDukaanStore();
  const [dismissed, setDismissed] = useState(false);
  // The sample business is a gym, so exploring it switches the console to the
  // Gym portal. Say so out loud rather than letting an owner wonder where their
  // modules went.
  const demoPortal = portalForTemplate(`template-gym`);

  if (state.demoMode) {
    return (
      <div className="flex flex-col gap-2.5 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-xs text-amber-700 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <p className="flex min-w-0 items-start gap-2 font-semibold leading-relaxed">
          <FlaskConical size={14} className="mt-0.5 shrink-0" />
          <span>
            DEMO BUSINESS — sample data in the {demoPortal.name} console, clearly separated from real records.
          </span>
        </p>
        <button
          onClick={() => {
            actions.leaveDemo();
          }}
          className="touch-manipulation min-h-10 self-start rounded-lg bg-amber-500/15 px-3 py-2 font-bold ring-1 ring-inset ring-amber-500/30 transition hover:bg-amber-500/25 sm:shrink-0"
        >
          Return to your business
        </button>
      </div>
    );
  }

  const isFresh = state.transactions.length === 0 && state.products.length === 0;
  if (!isFresh || dismissed) return null;

  return (
    <div className="flex flex-col gap-2.5 border-b border-brand-500/20 bg-brand-500/[0.07] px-4 py-3 text-xs text-brand-700 sm:flex-row sm:items-center sm:justify-between md:px-8">
      <p className="flex min-w-0 items-start gap-2 font-semibold leading-relaxed">
        <Sprout size={14} className="mt-0.5 shrink-0" />
        <span>Your business starts at ₹0 — record real activity, or load the sample business to explore.</span>
      </p>
      <span className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
        <Link href="/products" className="hidden min-h-10 items-center rounded-lg bg-stone-100 px-3 py-2 font-bold text-stone-800 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200 sm:inline-flex">
          Add first product
        </Link>
        <button
          onClick={() => actions.loadDemoBusiness()}
          className="touch-manipulation min-h-10 flex-1 rounded-lg bg-brand-500/20 px-3 py-2 font-bold ring-1 ring-inset ring-brand-400/30 transition hover:bg-brand-500/30 sm:flex-none"
        >
          Load demo business
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="touch-manipulation flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
        >
          <X size={15} />
        </button>
      </span>
    </div>
  );
}
