const plans = [
  { name: 'Monthly Access', price: 1999, duration: '1 month', status: 'Active' },
  { name: 'Quarterly Plus', price: 4999, duration: '3 months', status: 'Active' },
  { name: 'Half Year Fitness', price: 8999, duration: '6 months', status: 'Active' },
  { name: 'Annual Elite', price: 15999, duration: '12 months', status: 'Active' },
];

const reminders = [
  { customer: 'John Wilson', business: 'Cult Fitness', time: '3 days left', channel: 'SMS + WhatsApp' },
  { customer: 'Aisha Khan', business: 'Cult Fitness', time: '1 day left', channel: 'WhatsApp' },
  { customer: 'Rahul Mehta', business: 'Cult Fitness', time: 'Expired today', channel: 'SMS' },
];

export default function MembershipsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">memberships</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Subscriptions and renewals</h1>
          </div>
          <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Add plan</button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900">Membership plans</h2>
            <div className="mt-4 space-y-3">
              {plans.map((plan) => (
                <div key={plan.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="font-medium text-slate-800">{plan.name}</p>
                    <p className="text-sm text-slate-500">{plan.duration}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">₹{plan.price.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-emerald-700">{plan.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900">Renewal reminders</h2>
            <div className="mt-4 space-y-3 text-sm">
              {reminders.map((item) => (
                <div key={`${item.customer}-${item.time}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">{item.customer}</p>
                  <p className="mt-1 text-slate-600">{item.business}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">{item.time}</span>
                    <span className="text-slate-500">{item.channel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

