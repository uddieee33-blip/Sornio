'use client';

import { useState } from 'react';
import { daysUntil } from '@/lib/models/membership';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore } from '@/lib/store';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  paused: 'bg-slate-200 text-slate-600',
};

const statusLabels: Record<string, string> = {
  active: 'Active',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  paused: 'Paused',
};

const channelLabels: Record<string, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  both: 'SMS + WhatsApp',
};

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MembershipsPage() {
  const { state, actions } = useDukaanStore();
  const membersById = new Map(state.members.map((member) => [member.id, member]));
  const plansById = new Map(state.plans.map((plan) => [plan.id, plan]));

  const [planForm, setPlanForm] = useState({ name: '', type: 'monthly', durationMonths: '1', price: '' });
  const [memberForm, setMemberForm] = useState({ name: '', phone: '', preferredChannel: 'both' });
  const [enroll, setEnroll] = useState({ memberId: '', planId: '', method: 'UPI' as PaymentMethod });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

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

  const handleEnroll = () => {
    const result = actions.enrollMember({
      memberId: enroll.memberId || state.members[0]?.id,
      planId: enroll.planId || state.plans[0]?.id,
      method: enroll.method,
    });
    const member = membersById.get(enroll.memberId || state.members[0]?.id);
    const plan = plansById.get(enroll.planId || state.plans[0]?.id);
    setMessage(result.ok ? { tone: 'ok', text: `${member?.name} enrolled in ${plan?.name}. Revenue recorded via ${enroll.method}.` } : { tone: 'error', text: result.error ?? 'Could not enroll member.' });
  };

  const handleRenew = (subscriptionId: string) => {
    const subscription = state.subscriptions.find((item) => item.id === subscriptionId);
    const member = subscription ? membersById.get(subscription.memberId) : undefined;
    const plan = subscription ? plansById.get(subscription.planId) : undefined;
    const result = actions.renewSubscription({ subscriptionId, method: 'UPI' });
    setMessage(result.ok ? { tone: 'ok', text: `${member?.name}'s ${plan?.name} renewed for ${plan?.durationMonths} month(s).` } : { tone: 'error', text: result.error ?? 'Could not renew.' });
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900';

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">memberships</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Subscriptions and renewals</h1>
            <p className="mt-2 text-sm text-slate-600">{activeCount} active member{activeCount === 1 ? '' : 's'} · {state.plans.filter((plan) => plan.isActive).length} plans on sale</p>
          </div>
        </div>

        {message ? (
          <p className={`mb-6 rounded-xl px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Membership plans</h2>
              <div className="mt-4 space-y-3">
                {state.plans.map((plan) => (
                  <div key={plan.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="font-medium text-slate-800">{plan.name}</p>
                      <p className="text-sm text-slate-500">{plan.durationMonths} month{plan.durationMonths === 1 ? '' : 's'}{plan.description ? ` · ${plan.description}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">₹{plan.price.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-emerald-700">{plan.isActive ? 'Active' : 'Inactive'}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-sm font-medium text-slate-800">Add plan</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Plan name" className={inputClass} />
                  <select value={planForm.type} onChange={(e) => setPlanForm({ ...planForm, type: e.target.value })} className={inputClass}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half yearly</option>
                    <option value="annual">Annual</option>
                  </select>
                  <input type="number" min={1} value={planForm.durationMonths} onChange={(e) => setPlanForm({ ...planForm, durationMonths: e.target.value })} placeholder="Months" className={inputClass} />
                  <input type="number" min={0} value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} placeholder="Price ₹" className={inputClass} />
                </div>
                <div className="mt-3 flex justify-end">
                  <button onClick={handleAddPlan} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add plan</button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Subscriptions</h2>
              <div className="mt-4 space-y-3">
                {state.subscriptions.map((subscription) => {
                  const member = membersById.get(subscription.memberId);
                  const plan = plansById.get(subscription.planId);
                  const days = daysUntil(subscription.expiryDate);
                  return (
                    <div key={subscription.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{member?.name ?? 'Unknown member'}</p>
                          <p className="text-sm text-slate-500">{plan?.name ?? 'Custom plan'} · started {formatDate(subscription.startDate)}</p>
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyles[subscription.status]}`}>
                            {statusLabels[subscription.status]}
                          </span>
                          <p className="mt-1 text-xs text-slate-500">
                            {days >= 0 ? 'Expires' : 'Expired'} {formatDate(subscription.expiryDate)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{subscription.autoRenew ? 'Auto-renew on' : 'Auto-renew off'} · {member ? channelLabels[member.preferredChannel] : ''}</span>
                        {(subscription.status === 'expiring_soon' || subscription.status === 'expired') ? (
                          <button onClick={() => handleRenew(subscription.id)} className="rounded-full bg-emerald-600 px-3 py-1 font-medium text-white">
                            Renew {plan ? `· ₹${plan.price.toLocaleString('en-IN')}` : ''}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Enroll a member</h2>
              <div className="mt-4 space-y-3">
                <select value={enroll.memberId} onChange={(e) => setEnroll({ ...enroll, memberId: e.target.value })} className={inputClass}>
                  <option value="">Choose member…</option>
                  {state.members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name} · {member.phone}</option>
                  ))}
                </select>
                <select value={enroll.planId} onChange={(e) => setEnroll({ ...enroll, planId: e.target.value })} className={inputClass}>
                  <option value="">Choose plan…</option>
                  {state.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name} · ₹{plan.price.toLocaleString('en-IN')}</option>
                  ))}
                </select>
                <select value={enroll.method} onChange={(e) => setEnroll({ ...enroll, method: e.target.value as PaymentMethod })} className={inputClass}>
                  {METHODS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <button onClick={handleEnroll} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Enroll & collect payment</button>
              </div>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="mb-3 text-sm font-medium text-slate-800">Add member</p>
                <div className="space-y-3">
                  <input value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} placeholder="Full name" className={inputClass} />
                  <input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} placeholder="Phone" className={inputClass} />
                  <select value={memberForm.preferredChannel} onChange={(e) => setMemberForm({ ...memberForm, preferredChannel: e.target.value })} className={inputClass}>
                    <option value="both">SMS + WhatsApp</option>
                    <option value="whatsapp">WhatsApp only</option>
                    <option value="sms">SMS only</option>
                  </select>
                  <button onClick={handleAddMember} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">Add member</button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Renewal reminders</h2>
              <div className="mt-4 space-y-3 text-sm">
                {renewalQueue.map((subscription) => {
                  const member = membersById.get(subscription.memberId);
                  const days = daysUntil(subscription.expiryDate);
                  return (
                    <div key={subscription.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="font-medium text-slate-800">{member?.name ?? 'Unknown member'}</p>
                      <p className="mt-1 text-slate-600">{plansById.get(subscription.planId)?.name ?? 'Membership'}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className={`rounded-full px-2 py-1 ${days < 0 ? 'bg-red-100 text-red-700' : days <= 1 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`}
                        </span>
                        <span className="text-slate-500">{member ? channelLabels[member.preferredChannel] : ''}</span>
                      </div>
                    </div>
                  );
                })}
                {renewalQueue.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500">No renewals due in the next 7 days.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
