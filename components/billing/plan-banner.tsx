'use client';

/**
 * The one banner that is allowed to talk about money inside the console.
 *
 * It appears only when there is something true to say, and it says it once:
 *
 *   • trial ending inside two days       → amber, with the days left
 *   • paid period in grace               → amber, everything still works
 *   • period ended, automations paused   → red, and the promise that nothing was deleted
 *   • free plan nearly at its allowance  → quiet, only when 5 collections are left
 *
 * Silence the rest of the time. A shop that is happily paid up should never be
 * interrupted by its own software.
 */

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ArrowRight, Sparkles, X } from 'lucide-react';
import { usePlan } from '@/components/billing/plan-provider';
import { UPGRADE_PATH, planById } from '@/lib/plans';

export function PlanBanner() {
  const { entitlement, usage, loading } = usePlan();
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed) return null;

  const remaining = usage.allowance === null ? null : Math.max(usage.allowance - usage.upiCollections, 0);

  let tone: 'amber' | 'red' | 'brand' | null = null;
  let text = '';
  let cta = 'See plans';

  if (entitlement.state === 'expired') {
    tone = 'red';
    text = `Your paid period has ended, so the ${planById('growth').name} automations are paused. Nothing you recorded was deleted — you are on the free plan, and the whole ledger, counter and audit history still work.`;
    cta = 'Turn them back on';
  } else if (entitlement.state === 'grace') {
    tone = 'amber';
    text = `Your period ended and everything keeps working for ${entitlement.daysLeft} more day${entitlement.daysLeft === 1 ? '' : 's'}. Renew to keep the automations without a gap.`;
    cta = 'Renew now';
  } else if (entitlement.state === 'trialing' && entitlement.daysLeft <= 2) {
    tone = 'amber';
    text =
      entitlement.daysLeft <= 1
        ? 'Your full trial ends today — you have experienced every module and every feature. Pick a plan to keep them all — your records stay either way.'
        : `Your full trial ends in ${entitlement.daysLeft} days — every module, every limit removed. Pick a plan to keep the full console.`;
    cta = 'Pick a plan';
  } else if (entitlement.state === 'free' && remaining !== null && remaining <= 5) {
    tone = 'brand';
    text =
      remaining === 0
        ? `You have used all ${usage.allowance} UPI collections on the free plan this month. Cash and card keep working — nothing is locked — and the limit resets on the 1st. Growth removes it entirely.`
        : `${remaining} of ${usage.allowance} free UPI collections left this month. Cash is never limited, and nothing recorded is ever locked.`;
    cta = 'Remove the limit';
  }

  if (!tone) return null;

  const palette = {
    amber: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-800',
    red: 'border-red-500/25 bg-red-500/[0.07] text-red-800',
    brand: 'border-brand-500/25 bg-brand-500/[0.07] text-brand-800',
  }[tone];

  const icon =
    tone === 'brand' ? <Sparkles size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />;

  return (
    <div
      className={`flex flex-col gap-2.5 border-b px-4 py-3 text-xs font-semibold leading-relaxed sm:flex-row sm:items-center sm:justify-between md:px-8 ${palette}`}
    >
      <p className="flex min-w-0 items-start gap-2">
        {icon}
        <span>{text}</span>
      </p>
      <span className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
        <Link
          href={UPGRADE_PATH}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-stone-900/90 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-stone-900 sm:flex-none"
        >
          {cta} <ArrowRight size={12} />
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss this notice"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-current/70 transition hover:bg-black/5"
        >
          <X size={14} />
        </button>
      </span>
    </div>
  );
}
