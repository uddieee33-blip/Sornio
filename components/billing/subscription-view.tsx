'use client';

/**
 * Your Plan — the page that asks for money, and the only one that may.
 *
 * It is written to be *worth paying for and free of tricks*:
 *
 *   • it shows the plan from the server-issued record, not from local state, so
 *     what the owner reads here is what the edge will actually serve;
 *   • it shows the value **computed from the business's own records** — renewals
 *     due this week, unpaid invoices, revenue already recorded this month —
 *     instead of an invented statistic;
 *   • it states the prices, the limits, and exactly what a lapsed plan does;
 *   • and it says out loud what DukaanOS will never do: no auto-debit, no cut of
 *     collections, no holding records hostage.
 *
 * Payment is direct UPI to the platform, with a reference in the note, and the
 * plan switches on when a signed activation code is redeemed. Nothing here
 * charges anybody automatically.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Copy,
  HandCoins,
  Lock,
  MessageCircle,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePlan } from '@/components/billing/plan-provider';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { useNow } from '@/lib/perf/clock';
import { formatCurrency } from '@/lib/business-data';
import {
  PLAN_CATALOGUE,
  lockedModulesFor,
  lockedModuleFromParam,
  monthKey,
  monthlyEquivalent,
  planById,
  savingsOn,
  type BillingInterval,
  type PaidPlanId,
  type PlanDefinition,
} from '@/lib/plans';

const DAY = 86_400_000;

function formatDate(ms: number) {
  if (!ms) return '—';
  return new Date(ms * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function priceLabel(plan: PlanDefinition, index: number) {
  const price = plan.prices[index];
  if (!price) return '';
  if (price.amount === 0) return '₹0';
  return `₹${price.amount.toLocaleString('en-IN')}`;
}

function periodLabel(interval: BillingInterval) {
  switch (interval) {
    case 'month':
      return '/month';
    case 'quarter':
      return '/3 months';
    case 'year':
      return '/year';
    default:
      return '';
  }
}

export function SubscriptionView({ lockedModule }: { lockedModule?: string | null }) {
  const { entitlement, statusLine, usage, busy, notice, dismissNotice, payment, loading, synced, startTrial, choosePlan, requestActivation, activate, refresh } = usePlan();
  const { state } = useDukaanStore();
  const { portal, nav } = usePortal();
  const [intervals, setIntervals] = useState<Record<string, number>>({ growth: 0, scale: 0 });
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const timezone = state.profile.timezone || 'Asia/Kolkata';
  const locked = useMemo(() => lockedModulesFor(entitlement, portal.id), [entitlement, portal.id]);
  // Handed in by the route, which resolves `?locked=` on the server: the notice
  // is in the first paint instead of appearing after hydration.
  const lockedFromUrl = lockedModuleFromParam(lockedModule);

  // ---- The value case, computed from this business's own records ------------
  // One clock read, through the shared ticking store: render stays pure and the
  // panel is a plain function of the ledger plus a timestamp.
  const now = useNow(60_000);

  const value = useMemo(() => {
    const thisMonth = monthKey(new Date(now), timezone);
    const revenueThisMonth = state.transactions
      .filter((tx) => tx.type === 'sale' && tx.direction === 'in')
      .filter((tx) => monthKey(new Date(tx.date), timezone) === thisMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const renewalsSoon = state.subscriptions.filter((subscription) => {
      const expiry = new Date(subscription.expiryDate).getTime();
      return Number.isFinite(expiry) && expiry >= now && expiry <= now + 7 * DAY;
    });
    const renewalValue = renewalsSoon.reduce((sum, subscription) => {
      const plan = state.plans.find((item) => item.id === subscription.planId);
      return sum + (plan?.price ?? 0);
    }, 0);

    const unpaid = state.invoices
      .filter((invoice) => invoice.paymentStatus !== 'paid')
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    return {
      revenueThisMonth,
      renewalsSoon: renewalsSoon.length,
      renewalValue,
      unpaid,
      hasData: state.transactions.length > 0 || state.subscriptions.length > 0 || state.invoices.length > 0,
    };
  }, [state.transactions, state.subscriptions, state.invoices, state.plans, now, timezone]);

  const activePlan = planById(entitlement.planId);
  const trialUsed = entitlement.trialUsed;

  const handleCopy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const portalLabelFor = (module: string) =>
    nav.flatMap((section) => section.links).find((link) => link.module === module)?.label ?? module;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Your Plan"
        title="What DukaanOS costs — and what it gives back"
        subtitle="One price, paid directly by UPI. No auto-debit, no commission on your collections, and nothing you have recorded is ever locked away."
        actions={
          <>
            <Button variant="secondary" onClick={() => void refresh()} disabled={busy || loading}>
              <Clock size={15} /> {loading ? 'Checking…' : 'Refresh status'}
            </Button>
            <Link
              href="#plans"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
            >
              See the plans <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      {notice ? (
        <div
          className={`mb-5 flex items-start justify-between gap-3 rounded-xl px-3.5 py-3 text-sm ${
            notice.tone === 'ok'
              ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20'
              : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'
          }`}
        >
          <span className="flex items-start gap-2">
            {notice.tone === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
            {notice.text}
          </span>
          <button onClick={dismissNotice} className="text-xs font-bold underline decoration-dotted">Dismiss</button>
        </div>
      ) : null}

      {lockedFromUrl ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-500/[0.08] px-3.5 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-500/25">
          <Lock size={15} className="mt-0.5 shrink-0" />
          <span>
            <strong>{portalLabelFor(lockedFromUrl)}</strong> is part of {planById('growth').name}, so it is paused on your current plan. Your records for it are untouched — everything reappears the moment a plan is active.
          </span>
        </div>
      ) : null}

      {/* ---- Where you stand ---- */}
      <Card className="mb-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle icon={<BadgeCheck size={16} />}>You are on {activePlan.name}</CardTitle>
              <Badge tone={entitlement.state === 'active' ? 'emerald' : entitlement.state === 'expired' ? 'red' : entitlement.state === 'free' ? 'slate' : 'amber'} dot>
                {entitlement.state === 'trialing' ? 'trial' : entitlement.state}
              </Badge>
              {!synced ? <Badge tone="slate">unverified copy</Badge> : null}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-700">{statusLine}</p>
            <dl className="mt-4 grid gap-x-8 gap-y-2 text-xs text-stone-600 sm:grid-cols-2">
              {entitlement.renewsAt ? (
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-stone-500" />
                  <span>
                    {entitlement.state === 'grace' ? 'Grace ends' : 'Renews on'} <strong className="text-stone-800">{formatDate(entitlement.graceEndsAt || entitlement.renewsAt)}</strong>
                  </span>
                </div>
              ) : null}
              {entitlement.priceLockedUntil ? (
                <div className="flex items-center gap-2">
                  <ShieldCheck size={13} className="text-emerald-700" />
                  <span>Price locked until <strong className="text-stone-800">{formatDate(entitlement.priceLockedUntil)}</strong></span>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <HandCoins size={13} className="text-stone-500" />
                <span>
                  UPI collections this month: <strong className="text-stone-800">{usage.upiCollections}</strong>
                  {usage.allowance === null ? ' · unlimited on your plan' : ` of ${usage.allowance}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Receipt size={13} className="text-stone-500" />
                <span>Plan changes are written to your <Link href="/audit" className="font-semibold text-brand-600 underline decoration-dotted">audit history</Link></span>
              </div>
            </dl>
          </div>

          <div className="shrink-0 space-y-2 md:w-56">
            {entitlement.state === 'free' || entitlement.state === 'expired' ? (
              trialUsed ? (
                <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-xs text-stone-600 ring-1 ring-inset ring-stone-200">
                  The free trial has already been used on this device. A paid plan is the only way to unlock the automations — and the first one starts the day you pay.
                </p>
              ) : (
                <Button className="w-full" onClick={() => void startTrial()} disabled={busy}>
                  <Sparkles size={15} /> Start 3-day full trial
                </Button>
              )
            ) : null}
            {entitlement.state !== 'free' && entitlement.state !== 'expired' ? (
              <Link
                href="#plans"
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Renew or change plan
              </Link>
            ) : null}
            {entitlement.state !== 'free' ? (
              <Button variant="ghost" className="w-full" onClick={() => void choosePlan('starter')} disabled={busy}>
                Move to the free plan
              </Button>
            ) : null}
          </div>
        </div>

        {usage.allowance !== null ? (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-stone-600">
              <span>Free plan allowance — this month</span>
              <span>{Math.max(usage.allowance - usage.upiCollections, 0)} left of {usage.allowance}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full transition-all ${usage.overAllowance ? 'bg-red-500' : 'bg-brand-gradient'}`}
                style={{ width: `${Math.min((usage.upiCollections / usage.allowance) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-stone-600">
              Cash and card are never counted or limited. Nothing already recorded is ever blocked, and the count resets on the 1st.
            </p>
          </div>
        ) : null}
      </Card>

      {/* ---- It pays for itself, from your own books ---- */}
      <Card className="mb-6">
        <CardTitle icon={<Wallet size={16} />}>What your own records say</CardTitle>
        {value.hasData ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Renewals due this week</p>
                <p className="mt-1 font-display text-xl font-bold text-stone-900">{value.renewalsSoon}</p>
                <p className="mt-0.5 text-xs text-stone-600">{value.renewalValue > 0 ? `${formatCurrency(value.renewalValue)} of fees due` : 'nothing expiring in 7 days'}</p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Unpaid invoices</p>
                <p className="mt-1 font-display text-xl font-bold text-stone-900">{formatCurrency(value.unpaid)}</p>
                <p className="mt-0.5 text-xs text-stone-600">sitting in receivables right now</p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Revenue recorded this month</p>
                <p className="mt-1 font-display text-xl font-bold text-stone-900">{formatCurrency(value.revenueThisMonth)}</p>
                <p className="mt-0.5 text-xs text-stone-600">from the ledger, not an estimate</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-stone-700">
              Growth costs <strong>₹499/month</strong>. Recovering{' '}
              {value.renewalsSoon > 0 ? (
                <>
                  the <strong>{value.renewalsSoon} renewal{value.renewalsSoon === 1 ? '' : 's'}</strong> expiring this week
                </>
              ) : (
                <>even one lapsed member</>
              )}{' '}
              pays for the year. That is the entire argument — made with your numbers, not ours.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-stone-700">
            Your console starts at zero, so there is nothing to compute yet. Record a sale, a member or a bill and this panel fills itself in from your own ledger — the same discipline as every other number in DukaanOS.
          </p>
        )}
      </Card>

      {/* ---- What is locked, in this trade's words ---- */}
      {locked.length > 0 ? (
        <Card className="mb-6">
          <CardTitle icon={<Lock size={16} />}>Paused on your current plan</CardTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {locked.map((item) => (
              <span key={item.module} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200">
                <Lock size={11} /> {item.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-stone-600">
            These are the {planById('growth').name} automations for a {portal.name.toLowerCase()} console. Every record they hold is still on this device, still in your exports, and still in the audit chain — a paused module is a door, not a deletion.
          </p>
        </Card>
      ) : null}

      {/* ---- Payment in flight ---- */}
      {payment ? (
        <Card className="mb-6 ring-2 ring-brand-400/40">
          <CardTitle icon={<HandCoins size={16} />}>Pay {formatCurrency(payment.amount)} — then paste your code</CardTitle>
          <ol className="mt-4 space-y-3 text-sm text-stone-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">1</span>
              <span>
                Pay <strong>{formatCurrency(payment.amount)}</strong> for <strong>{payment.planName}</strong> ({payment.interval}). Quote the reference{' '}
                <strong className="font-mono text-stone-900">{payment.reference}</strong> in the note — that is how your money is matched to your business.
                {payment.amount >= 499 && (
                  <span className="mt-1 block text-xs text-stone-600">Prefer quarterly? ₹999 covers three months, and the reference stays the same.</span>
                )}
              </span>
            </li>
            {payment.upiId ? (
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">2</span>
                <span>
                  Pay to <strong className="font-mono text-stone-900">{payment.upiId}</strong>
                  {payment.payeeName ? ` (${payment.payeeName})` : ''} in any UPI app.
                  <span className="mt-2 flex flex-wrap gap-2">
                    {payment.upiIntent ? (
                      <a
                        href={payment.upiIntent}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-bold text-white shadow-glow-sm"
                      >
                        Open in a UPI app <ArrowRight size={12} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleCopy('upi', payment.upiId ?? '')}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
                    >
                      <Copy size={12} /> {copied === 'upi' ? 'Copied' : 'Copy UPI id'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopy('ref', payment.reference)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
                    >
                      <Copy size={12} /> {copied === 'ref' ? 'Copied' : 'Copy reference'}
                    </button>
                  </span>
                </span>
              </li>
            ) : null}
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">{payment.upiId ? 3 : 2}</span>
              <span>
                We send you a one-time activation code as soon as the payment lands, usually within the hour. Paste it here:
                <span className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="DKS1-…"
                    aria-label="Activation code"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-sm text-stone-900 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <Button onClick={() => void activate(code.trim())} disabled={busy || code.trim().length < 8}>
                    <CheckCircle2 size={15} /> Activate
                  </Button>
                </span>
              </span>
            </li>
            {payment.whatsappHref ? (
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">
                  <MessageCircle size={12} />
                </span>
                <span>
                  Already paid?{' '}
                  <a href={payment.whatsappHref} className="font-bold text-emerald-700 underline decoration-dotted" target="_blank" rel="noreferrer">
                    Send us the reference on WhatsApp
                  </a>{' '}
                  and we will activate it for you.
                </span>
              </li>
            ) : null}
          </ol>
          <p className="mt-4 rounded-xl bg-stone-50 px-3.5 py-3 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
            Nothing is charged automatically — no mandate, no card saved, no recurring debit. When this period ends you either pay again or drop to the free plan, and the free plan keeps every record.
          </p>
        </Card>
      ) : null}

      {/* ---- The plans ---- */}
      <section id="plans" className="scroll-mt-24">
        <h2 className="font-display text-lg font-bold tracking-tight text-stone-900">Plans</h2>
        <p className="mt-1 text-sm text-stone-600">
          Prices are per business — not per counter, per bill, or per rupee collected. A paid plan locks its price for 12 months from activation.
        </p>

        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          {PLAN_CATALOGUE.filter((plan) => plan.id !== 'trial').map((plan) => {
            const isCurrent = entitlement.planId === plan.id && entitlement.state !== 'expired';
            const isFree = plan.prices.every((price) => price.amount === 0);
            const selected = intervals[plan.id] ?? 0;
            const monthly = monthlyEquivalent(plan, selected);
            const saved = plan.prices[selected] ? savingsOn(plan, plan.prices[selected].interval) : 0;

            return (
              <Card key={plan.id} className={`flex flex-col ${plan.popular ? 'ring-2 ring-brand-400/40' : ''}`} hover>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-stone-900">{plan.name}</h3>
                  {plan.popular ? (
                    <span className="rounded-full bg-brand-gradient px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Most chosen</span>
                  ) : null}
                  {isCurrent ? <Badge tone="emerald" dot>current</Badge> : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">{plan.for}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {plan.prices.map((price, index) => (
                    <button
                      key={price.interval}
                      type="button"
                      onClick={() => setIntervals((current) => ({ ...current, [plan.id]: index }))}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 ring-inset transition ${
                        index === selected ? 'bg-brand-500/15 text-brand-700 ring-brand-400/30' : 'bg-stone-50 text-stone-600 ring-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {price.amount === 0 ? 'Free' : `₹${price.amount.toLocaleString('en-IN')}`} {periodLabel(price.interval)}
                    </button>
                  ))}
                </div>

                <p className="mt-4">
                  <span className="font-display text-3xl font-bold text-stone-900">{priceLabel(plan, selected)}</span>
                  <span className="ml-1 text-sm text-stone-600">{periodLabel(plan.prices[selected]?.interval ?? 'forever')}</span>
                </p>
                {monthly && monthly > 0 ? <p className="text-xs text-stone-600">≈ ₹{monthly}/month{saved > 0 ? ` · saves ₹${saved.toLocaleString('en-IN')}` : ''}</p> : null}
                {isFree ? <p className="text-xs font-semibold text-emerald-700">Forever — not a countdown</p> : null}

                <ul className="mt-4 flex-1 space-y-2">
                  {plan.highlights.slice(0, 6).map((item) => (
                    <li key={item} className="flex gap-2 text-xs leading-relaxed text-stone-700">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" /> {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 space-y-1.5">
                  {plan.excluded.map((item) => (
                    <p key={item} className="text-[11px] leading-relaxed text-stone-500">— {item}</p>
                  ))}
                </div>

                <div className="mt-5">
                  {isFree ? (
                    isCurrent ? (
                      <Button variant="secondary" className="w-full" disabled>
                        You are on this
                      </Button>
                    ) : (
                      <Button variant="secondary" className="w-full" onClick={() => void choosePlan('starter')} disabled={busy}>
                        Move to the free plan
                      </Button>
                    )
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => void requestActivation(plan.id as PaidPlanId, plan.prices[selected]?.interval ?? 'month')}
                      disabled={busy}
                    >
                      {isCurrent && entitlement.state === 'active' ? 'Renew for another period' : `Continue with ${plan.name}`}{' '}
                      <ArrowRight size={15} />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---- The fine print, said plainly ---- */}
      <Card className="mt-6">
        <CardTitle icon={<ShieldCheck size={16} />}>What happens if you stop paying</CardTitle>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-stone-700">
          <li className="flex gap-2.5">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <span><strong>Nothing is deleted, and nothing is held hostage.</strong> Your ledger, customers, products, bills and audit chain stay readable, exportable and printable forever.</span>
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <span><strong>The counter keeps working.</strong> You drop to the free plan: billing, receipts, stock, your collection QR and cash entries all continue. Only the paid automations pause, and they come back the instant a plan is active.</span>
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <span><strong>No auto-debit, ever.</strong> There is no mandate and no card on file. A plan ends when its period ends — that is the whole cancellation policy.</span>
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <span><strong>We never take a cut of your collections.</strong> Customers pay you directly on your own UPI id; our only rupee figure is the plan price on this page.</span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-stone-600">
          Paid by UPI and need it activated right now? Send the reference to support — activation is a human on our side, and it is recorded in your audit history when it happens. Questions before paying? Every claim on this page can be checked in <Link href="/security" className="font-semibold text-brand-600 underline decoration-dotted">Trust Centre</Link>.
        </p>
      </Card>
    </div>
  );
}
