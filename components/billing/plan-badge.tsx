'use client';

/**
 * The plan chip in the top bar.
 *
 * One thing, always visible, never a nag: which plan this console is on and how
 * long it has left. Colour carries the urgency (calm on free, amber when a
 * period is running out, red when the paid automations have paused) and the
 * whole chip is the link to the page that changes it.
 */

import Link from 'next/link';
import { BadgeIndianRupee, Sparkles } from 'lucide-react';
import { usePlan } from '@/components/billing/plan-provider';
import { UPGRADE_PATH } from '@/lib/plans';

const TONE: Record<string, string> = {
  free: 'bg-stone-50 text-stone-600 ring-stone-200 hover:bg-stone-100',
  trialing: 'bg-brand-500/10 text-brand-700 ring-brand-500/25 hover:bg-brand-500/20',
  active: 'bg-emerald-500/[0.08] text-emerald-700 ring-emerald-500/20 hover:bg-emerald-500/[0.14]',
  grace: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 hover:bg-amber-500/20',
  expired: 'bg-red-500/10 text-red-700 ring-red-500/25 hover:bg-red-500/20',
};

export function PlanBadge({ className = '' }: { className?: string }) {
  const { entitlement, usage } = usePlan();
  const tone = TONE[entitlement.state] ?? TONE.free;

  const label =
    entitlement.state === 'free'
      ? usage.allowance !== null
        ? `Free · ${Math.max(usage.allowance - usage.upiCollections, 0)} UPI left`
        : 'Free plan'
      : entitlement.state === 'trialing'
        ? `Trial · ${entitlement.daysLeft}d left`
        : entitlement.state === 'grace'
          ? `${entitlement.plan.name} · renew in ${entitlement.daysLeft}d`
          : entitlement.state === 'expired'
            ? 'Free plan · automations paused'
            : `${entitlement.plan.name} · ${entitlement.daysLeft}d`;

  const title =
    entitlement.state === 'free'
      ? 'You are on the free plan: the whole counter, ledger and audit chain, at ₹0. Tap to see what the paid automations add.'
      : entitlement.state === 'trialing'
        ? 'Trial running — every module is unlocked. Tap to pick a plan before it ends.'
        : entitlement.state === 'grace'
          ? 'Your period has ended and everything keeps working for a few more days. Renew to keep the automations.'
          : entitlement.state === 'expired'
            ? 'Your paid period ended. Nothing was deleted — the free plan is running. Tap to renew.'
            : 'Your plan and the days left in this period. Tap to renew or change plan.';

  return (
    <Link
      href={UPGRADE_PATH}
      title={title}
      aria-label={`Plan: ${label}. Open Your Plan.`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset transition ${tone} ${className}`}
    >
      {entitlement.state === 'trialing' ? <Sparkles size={12} /> : <BadgeIndianRupee size={12} />}
      {label}
    </Link>
  );
}
