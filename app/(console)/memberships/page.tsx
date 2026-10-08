'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { getActiveFormattingLocale } from '@/lib/locale';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, BellRing, CalendarClock, CreditCard, Crown, Dumbbell, Plus, RefreshCcw, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePlan } from '@/components/billing/plan-provider';
import { daysUntil } from '@/lib/models/membership';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore } from '@/lib/store';

const statusMeta: Record<string, { tone: BadgeTone; label: string }> = {
  active: { tone: 'emerald', label: 'Active' },
  expiring_soon: { tone: 'amber', label: 'Expiring soon' },
  expired: { tone: 'red', label: 'Expired' },
  paused: { tone: 'slate', label: 'Paused' },
};

const channelLabels: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp', both: 'SMS + WhatsApp' };
const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(getActiveFormattingLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MembershipsPage() {
  useLocaleRefresh();
  const { state, actions } = useDukaanStore();
  const { usage } = usePlan();
  const membersById = new Map(state.members.map((member) => [member.id, member]));
  const plansById = new Map(state.plans.map((plan) => [plan.id, plan]));

  const [planForm, setPlanForm] = useState({ name: '', type: 'monthly', durationMonths: '1', price: '' });
  const [memberForm, setMemberForm] = useState({ name: '', phone: '', preferredChannel: 'both' });
  const [enroll, setEnroll] = useState({ memberId: '', planId: '', method: 'UPI' as PaymentMethod });
  const [renewMethod, setRenewMethod] = useState<PaymentMethod>('UPI');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  /** When the free UPI allowance runs out mid-collection, this offers the way out instead of a dead end. */
  const [gateOffer, setGateOffer] = useState<null | { kind: 'enroll'; memberId: string; planId: string; amount: number } | { kind: 'renew'; subscriptionId: string; amount: number }>(null);

  const activeCount = state.subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'expiring_soon').length;
  const renewalQueue = state.subscriptions
    .filter((subscription) => daysUntil(subscription.expiryDate) <= 7)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  const handleAddPlan = () => {
    const result = actions.addPlan({
      name: planForm.name,
      type: planForm.type as 'monthly' | 'quarterly' | 'half_yearly' | 'annual',
      durationMonths: Number(planForm.durationMonths || 0),
      price: Number(planForm.price || 0),
    });
    setMessage(result.ok ? { tone: 'ok', text: `Plan "${planForm.name.trim()}" is now on sale.` } : { tone: 'error', text: result.error ?? 'Could not add plan.' });
    if (result.ok) setPlanForm({ name: '', type: 'monthly', durationMonths: '1', price: '' });
  };

  const handleAddMember = () => {
    const result = actions.addMember({
      name: memberForm.name,
      phone: memberForm.phone,
      preferredChannel: memberForm.preferredChannel as 'sms' | 'whatsapp' | 'both',
    });
    setMessage(result.ok ? { tone: 'ok', text: `${memberForm.name.trim()} added to the member directory.` } : { tone: 'error', text: result.error ?? 'Could not add member.' });
    if (result.ok) setMemberForm({ name: '', phone: '', preferredChannel: 'both' });
  };

  const handleEnroll = (methodOverride?: PaymentMethod) => {
    const memberId = enroll.memberId || state.members[0]?.id;
    const planId = enroll.planId || state.plans[0]?.id;
    const method = methodOverride ?? enroll.method;
    const result = actions.enrollMember({ memberId, planId, method });
    const member = membersById.get(memberId);
    const plan = plansById.get(planId);
    if (result.ok) {
      setGateOffer(null);
      setMessage({ tone: 'ok', text: `${member?.name} enrolled in ${plan?.name}. Revenue recorded via ${method}.` });
      return;
    }
    if (result.code === 'collection-limit') {
      setGateOffer({ kind: 'enroll', memberId, planId, amount: plan?.price ?? 0 });
      setMessage({ tone: 'error', text: result.error ?? 'The free UPI allowance for this month is used up.' });
      return;
    }
    setMessage({ tone: 'error', text: result.error ?? 'Could not enroll member.' });
  };

  const handleRenew = (subscriptionId: string, methodOverride?: PaymentMethod) => {
    const subscription = state.subscriptions.find((item) => item.id === subscriptionId);
    const member = subscription ? membersById.get(subscription.memberId) : undefined;
    const plan = subscription ? plansById.get(subscription.planId) : undefined;
    const method = methodOverride ?? renewMethod;
    const result = actions.renewSubscription({ subscriptionId, method });
    if (result.ok) {
      setGateOffer(null);
      setMessage({ tone: 'ok', text: `${member?.name}'s ${plan?.name} renewed for ${plan?.durationMonths} month(s) — paid via ${method}.` });
      return;
    }
    if (result.code === 'collection-limit') {
      setGateOffer({ kind: 'renew', subscriptionId, amount: plan?.price ?? 0 });
      setMessage({ tone: 'error', text: result.error ?? 'The free UPI allowance for this month is used up.' });
      return;
    }
    setMessage({ tone: 'error', text: result.error ?? 'Could not renew.' });
  };

  const retryGateOfferInCash = () => {
    if (!gateOffer) return;
    if (gateOffer.kind === 'enroll') {
      setEnroll((current) => ({ ...current, memberId: gateOffer.memberId, planId: gateOffer.planId, method: 'Cash' }));
      const result = actions.enrollMember({ memberId: gateOffer.memberId, planId: gateOffer.planId, method: 'Cash' });
      const member = membersById.get(gateOffer.memberId);
      const plan = plansById.get(gateOffer.planId);
      if (result.ok) {
        setGateOffer(null);
        setMessage({ tone: 'ok', text: `${member?.name} enrolled in ${plan?.name} — collected in cash.` });
      } else {
        setMessage({ tone: 'error', text: result.error ?? 'Could not enroll member.' });
      }
      return;
    }
    const result = actions.renewSubscription({ subscriptionId: gateOffer.subscriptionId, method: 'Cash' });
    const subscription = state.subscriptions.find((item) => item.id === gateOffer.subscriptionId);
    const member = subscription ? membersById.get(subscription.memberId) : undefined;
    const plan = subscription ? plansById.get(subscription.planId) : undefined;
    if (result.ok) {
      setGateOffer(null);
      setRenewMethod('Cash');
      setMessage({ tone: 'ok', text: `${member?.name}'s ${plan?.name} renewed — collected in cash.` });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not renew.' });
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Memberships"
        title="Subscriptions and renewals"
        subtitle={`${activeCount} active member${activeCount === 1 ? '' : 's'} · ${state.plans.filter((plan) => plan.isActive).length} plans on sale`}
      />

      {message ? (
        <p className={`mb-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
      ) : null}

      {gateOffer ? (
        <div className="animate-collect-panel mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25">
              <Banknote size={17} />
            </span>
            <div>
              <p className="text-sm font-bold text-stone-900">The member is here — don&apos;t send them away</p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                UPI is capped for this month{gateOffer.amount > 0 ? `, but the ₹${gateOffer.amount.toLocaleString(getActiveFormattingLocale())} can still be collected in cash right now` : ', but cash still works right now'} — nothing is lost either way.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button onClick={retryGateOfferInCash}><Banknote size={15} /> Collect in cash</Button>
            <Link
              href="/subscription"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-brand-400/40 hover:bg-stone-50"
            >
              See plans <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : null}

      {usage.allowance !== null ? (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold text-stone-700">
            Free UPI collections this month: <span className="font-bold text-stone-900 tabular-nums">{usage.upiCollections} of {usage.allowance} used</span>
          </p>
          <div className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${usage.overAllowance ? 'bg-amber-500' : 'bg-brand-gradient'}`}
              style={{ width: `${Math.min(100, Math.round((usage.upiCollections / Math.max(usage.allowance, 1)) * 100))}%` }}
            />
          </div>
          <Link href="/subscription" className="text-xs font-semibold text-brand-600 hover:underline">Remove the limit</Link>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Crown size={17} />}>Membership plans</CardTitle>
              <Badge tone="brand">{state.plans.length} plans</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {state.plans.map((plan) => (
                <div key={plan.id} className="relative overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-50 to-brand-500/[0.06] p-4 transition hover:border-brand-400/30 hover:shadow-card-hover">
                  <div className="flex items-start justify-between">
                    <p className="font-semibold text-stone-900">{plan.name}</p>
                    <Badge tone={plan.isActive ? 'emerald' : 'slate'} dot>{plan.isActive ? 'Active' : 'Off'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">{plan.durationMonths} month{plan.durationMonths === 1 ? '' : 's'}{plan.description ? ` · ${plan.description}` : ''}</p>
                  <p className="mt-3 font-display text-2xl font-bold text-stone-900 tabular-nums">₹{plan.price.toLocaleString(getActiveFormattingLocale())}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-stone-300 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800"><Plus size={15} className="text-brand-600" /> Add plan</p>
              <div className="grid gap-3 md:grid-cols-4">
                <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Plan name" className={inputClass} />
                <select value={planForm.type} onChange={(e) => setPlanForm({ ...planForm, type: e.target.value })} className={inputClass}>
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
                  <option value="half_yearly">Half yearly</option><option value="annual">Annual</option>
                </select>
                <input type="number" min={1} value={planForm.durationMonths} onChange={(e) => setPlanForm({ ...planForm, durationMonths: e.target.value })} placeholder="Months" className={inputClass} />
                <input type="number" min={0} value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} placeholder="Price ₹" className={inputClass} />
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={handleAddPlan}><Plus size={15} /> Add plan</Button>
              </div>
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <CardTitle icon={<Dumbbell size={17} />}>Subscriptions</CardTitle>
              <div className="flex items-center gap-2">
                <Badge tone="violet" dot>{state.subscriptions.length}</Badge>
                <select
                  value={renewMethod}
                  onChange={(e) => setRenewMethod(e.target.value as PaymentMethod)}
                  title="How renewal payments arrive"
                  className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus"
                >
                  {METHODS.map((option) => <option key={option} value={option}>Renew via {option}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {state.subscriptions.map((subscription) => {
                const member = membersById.get(subscription.memberId);
                const plan = plansById.get(subscription.planId);
                const days = daysUntil(subscription.expiryDate);
                const meta = statusMeta[subscription.status] ?? statusMeta.active;
                return (
                  <div key={subscription.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-brand-400/30 hover:bg-stone-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-stone-900">{member?.name ?? 'Unknown member'}</p>
                        <p className="text-xs text-stone-600">{plan?.name ?? 'Custom plan'} · started {formatDate(subscription.startDate)}</p>
                      </div>
                      <div className="text-right">
                        <Badge tone={meta.tone} dot>{meta.label}</Badge>
                        <p className="mt-1.5 text-xs text-stone-600">{days >= 0 ? 'Expires' : 'Expired'} {formatDate(subscription.expiryDate)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-stone-600">
                      <span>{subscription.autoRenew ? 'Auto-renew on' : 'Auto-renew off'} · {member ? channelLabels[member.preferredChannel] : ''}</span>
                      {(subscription.status === 'expiring_soon' || subscription.status === 'expired') ? (
                        <button onClick={() => handleRenew(subscription.id)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-3.5 py-1.5 font-semibold text-white shadow-glow-sm transition hover:brightness-110">
                          <RefreshCcw size={12} /> Renew {plan ? `· ₹${plan.price.toLocaleString(getActiveFormattingLocale())}` : ''}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="animate-fade-up">
            <div className="mb-5"><CardTitle icon={<UserPlus size={17} />}>Enroll a member</CardTitle></div>
            <div className="space-y-3">
              <div><span className={labelClass}>Member</span>
                <select value={enroll.memberId} onChange={(e) => setEnroll({ ...enroll, memberId: e.target.value })} className={inputClass}>
                  <option value="">Choose member…</option>
                  {state.members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.phone}</option>)}
                </select>
              </div>
              <div><span className={labelClass}>Plan</span>
                <select value={enroll.planId} onChange={(e) => setEnroll({ ...enroll, planId: e.target.value })} className={inputClass}>
                  <option value="">Choose plan…</option>
                  {state.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ₹{plan.price.toLocaleString(getActiveFormattingLocale())}</option>)}
                </select>
              </div>
              <div><span className={labelClass}>Payment method</span>
                <select value={enroll.method} onChange={(e) => setEnroll({ ...enroll, method: e.target.value as PaymentMethod })} className={inputClass}>
                  {METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <Button className="w-full" onClick={() => handleEnroll()}><CreditCard size={16} /> Enroll & collect payment</Button>
            </div>

            <div className="mt-6 border-t border-stone-200 pt-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800"><Users size={15} className="text-brand-600" /> Add member</p>
              <div className="space-y-3">
                <input value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} placeholder="Full name" className={inputClass} />
                <input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} placeholder="Phone" className={inputClass} />
                <select value={memberForm.preferredChannel} onChange={(e) => setMemberForm({ ...memberForm, preferredChannel: e.target.value })} className={inputClass}>
                  <option value="both">SMS + WhatsApp</option><option value="whatsapp">WhatsApp only</option><option value="sms">SMS only</option>
                </select>
                <Button variant="secondary" className="w-full" onClick={handleAddMember}><UserPlus size={15} /> Add member</Button>
              </div>
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<BellRing size={17} />}>Renewal reminders</CardTitle>
              <Badge tone={renewalQueue.length ? 'amber' : 'emerald'} dot>{renewalQueue.length ? `${renewalQueue.length} due` : 'Clear'}</Badge>
            </div>
            <div className="space-y-3">
              {renewalQueue.map((subscription) => {
                const member = membersById.get(subscription.memberId);
                const days = daysUntil(subscription.expiryDate);
                return (
                  <div key={subscription.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                    <p className="font-semibold text-stone-800">{member?.name ?? 'Unknown member'}</p>
                    <p className="mt-0.5 text-xs text-stone-600">{plansById.get(subscription.planId)?.name ?? 'Membership'}</p>
                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className={`rounded-full px-2.5 py-1 font-semibold ring-1 ring-inset ${days < 0 ? 'bg-red-500/10 text-red-700 ring-red-500/25' : days <= 1 ? 'bg-amber-500/10 text-amber-700 ring-amber-500/25' : 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25'}`}>
                        {days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`}
                      </span>
                      <span className="flex items-center gap-1 text-stone-600"><CalendarClock size={12} /> {member ? channelLabels[member.preferredChannel] : ''}</span>
                    </div>
                  </div>
                );
              })}
              {renewalQueue.length === 0 ? <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">No renewals due in the next 7 days.</p> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
