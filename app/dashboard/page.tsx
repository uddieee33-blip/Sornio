import { demoProducts, demoTransactions, formatCurrency, getAlerts, summarizeFinancials } from '@/lib/business-data';

const snapshot = summarizeFinancials(demoTransactions);
const alerts = getAlerts(snapshot, demoProducts);

export default function DashboardPage() {
  const cards = [
    { label: 'Revenue', value: snapshot.revenue, tone: 'emerald' },
    { label: 'Gross Profit', value: snapshot.grossProfit, tone: 'blue' },
    { label: 'Operating Profit', value: snapshot.operatingProfit, tone: 'violet' },
    { label: 'Cash Position', value: snapshot.cashBalance, tone: 'amber' },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Owner Cockpit</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Business reality dashboard</h1>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          Real data only
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
              card.tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' :
              card.tone === 'blue' ? 'bg-blue-50 text-blue-700' :
              card.tone === 'violet' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {card.label}
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-900">{formatCurrency(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">What Changed Today?</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>• Revenue increased because recorded sales were posted.</li>
            <li>• Cash balance decreased because recorded expenses were paid from cash.</li>
            <li>• Inventory decreased because sales reduced stock.</li>
            <li>• Receivables increased because a sale was recorded as unpaid.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Alerts</h2>
          <div className="mt-4 space-y-3 text-sm">
            {alerts.map((alert) => (
              <div key={alert.type} className={
                alert.tone === 'amber' ? 'rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800' :
                alert.tone === 'red' ? 'rounded-xl border border-red-200 bg-red-50 p-3 text-red-800' :
                'rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-800'
              }>{alert.message}</div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
