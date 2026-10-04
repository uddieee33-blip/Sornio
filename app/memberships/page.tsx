import {
  buildSampleSubscriptions,
  daysUntil,
  defaultMembers,
  defaultMembershipPlans,
  defaultReminderTemplates,
} from '@/lib/models/membership';

const subscriptions = buildSampleSubscriptions();
const membersById = new Map(defaultMembers.map((member) => [member.id, member]));
const plansById = new Map(defaultMembershipPlans.map((plan) => [plan.id, plan]));

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

function reminderLabel(days: number) {
  if (days < 0) return `Expired ${Math.abs(days)} day(s) ago`;
  if (days === 0) return 'Expired today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export default function MembershipsPage() {
  const activeMembers = subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'expiring_soon').length;
  const renewalQueue = subscriptions
    .filter((subscription) => daysUntil(subscription.expiryDate) <= 7)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">memberships</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Subscriptions and renewals</h1>
            <p className="mt-2 text-sm text-slate-600">{activeMembers} active member{activeMembers === 1 ? '' : 's'} · {defaultMembershipPlans.filter((plan) => plan.isActive).length} plans on sale</p>
          </div>
          <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Add plan</button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Membership plans</h2>
              <div className="mt-4 space-y-3">
                {defaultMembershipPlans.map((plan) => (
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
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Subscriptions</h2>
              <div className="mt-4 space-y-3">
                {subscriptions.map((subscription) => {
                  const member = membersById.get(subscription.memberId);
                  const plan = plansById.get(subscription.planId);
                  const days = daysUntil(subscription.expiryDate);
                  return (
                    <div key={subscription.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{member?.name ?? 'Unknown member'}</p>
                          <p className="text-sm text-slate-500">{plan?.name ?? 'Custom plan'} · started {new Date(subscription.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyles[subscription.status]}`}>
                            {statusLabels[subscription.status]}
                          </span>
                          <p className="mt-1 text-xs text-slate-500">
                            {days >= 0 ? `Expires ${new Date(subscription.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : `Expired ${new Date(subscription.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{subscription.autoRenew ? 'Auto-renew on' : 'Auto-renew off'}</span>
                        <span>{member ? channelLabels[member.preferredChannel] : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
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
                          {reminderLabel(days)}
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

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Reminder templates</h2>
              <div className="mt-4 space-y-3">
                {defaultReminderTemplates.map((template) => (
                  <div key={template.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <p className="font-medium text-slate-800">{template.name}</p>
                      <span className="text-slate-500">{channelLabels[template.channel]} · {template.daysBeforeExpiry === 0 ? 'expiry day' : `${template.daysBeforeExpiry} days before`}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{template.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
