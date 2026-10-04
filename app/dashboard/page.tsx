'use client';

import Link from 'next/link';
import { formatCurrency, getAlerts } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

export default function DashboardPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();
  const alerts = getAlerts(snapshot, state.products);

  const cards = [
    { label: 'Revenue', value: snapshot.revenue, tone: 'emerald' },
    { label: 'Gross Profit', value: snapshot.grossProfit, tone: 'blue' },
    { label: 'Operating Profit', value: snapshot.operatingProfit, tone: 'violet' },
    { label: 'Cash Position', value: snapshot.cashBalance, tone: 'amber' },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const todays = state.transactions.filter((tx) => tx.date === today);
  const salesToday = todays.filter((tx) => tx.type === 'sale');
  const expensesToday = todays.filter((tx) => tx.type === 'expense');
  const revenueToday = salesToday.reduce((sum, tx) => sum + tx.amount, 0);
  const spendToday = expensesToday.reduce((sum, tx) => sum + tx.amount, 0);

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
            {salesToday.length > 0 ? (
              <li>• Revenue increased by <strong className="text-emerald-700">{formatCurrency(revenueToday)}</strong> across {salesToday.length} sale(s).</li>
            ) : (
              <li>• No sales recorded yet today. <Link href="/sales" className="font-medium text-slate-900">Record the first one.</Link></li>
            )}
            {expensesToday.length > 0 ? (
              <li>• Cash decreased by <strong className="text-red-700">{formatCurrency(spendToday)}</strong> across {expensesToday.length} expense(s).</li>
            ) : (
              <li>• No expenses recorded today.</li>
            )}
            {todays.some((tx) => tx.type === 'stock_adjustment') ? (
              <li>• Inventory decreased because sales consumed stock.</li>
            ) : null}
            <li>• Cash position is {formatCurrency(snapshot.cashBalance)} and inventory value is {formatCurrency(snapshot.inventoryValue)}.</li>
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
            {alerts.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">Nothing needs attention right now.</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
