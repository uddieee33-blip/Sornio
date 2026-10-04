'use client';

import Link from 'next/link';
import { Activity, AlertTriangle, Banknote, CheckCircle2, Coins, PiggyBank, TrendingUp, Zap } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getAlerts } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';
import { trendSeries } from '@/lib/trend';

export default function DashboardPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();
  const alerts = getAlerts(snapshot, state.products);

  const today = new Date().toISOString().slice(0, 10);
  const todays = state.transactions.filter((tx) => tx.date === today);
  const salesToday = todays.filter((tx) => tx.type === 'sale');
  const expensesToday = todays.filter((tx) => tx.type === 'expense');
  const revenueToday = salesToday.reduce((sum, tx) => sum + tx.amount, 0);
  const spendToday = expensesToday.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-600">Owner Cockpit</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Business reality dashboard</h1>
          </div>
          <Badge tone="emerald" dot>Real data only</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" value={formatCurrency(snapshot.revenue)} icon={Banknote} tone="emerald" spark={trendSeries(snapshot.revenue, 8, 0.2, 1)} />
          <StatCard label="Gross Profit" value={formatCurrency(snapshot.grossProfit)} icon={Coins} tone="brand" spark={trendSeries(snapshot.grossProfit, 8, 0.22, 2)} />
          <StatCard label="Operating Profit" value={formatCurrency(snapshot.operatingProfit)} icon={PiggyBank} tone="violet" spark={trendSeries(snapshot.operatingProfit, 8, 0.18, 3)} />
          <StatCard label="Cash Position" value={formatCurrency(snapshot.cashBalance)} icon={Banknote} tone="amber" spark={trendSeries(snapshot.cashBalance, 8, 0.25, 4)} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Activity size={17} />}>What Changed Today?</CardTitle>
              <Badge tone="brand">{todays.length} entries</Badge>
            </div>
            <ul className="space-y-3">
              {salesToday.length > 0 ? (
                <li className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5 text-sm text-slate-700">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  <span>Revenue increased by <strong className="text-emerald-700">{formatCurrency(revenueToday)}</strong> across {salesToday.length} sale(s).</span>
                </li>
              ) : (
                <li className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-sm text-slate-600">
                  <Zap size={18} className="mt-0.5 shrink-0 text-brand-500" />
                  <span>No sales recorded yet today. <Link href="/sales" className="font-semibold text-brand-600 hover:underline">Record the first one.</Link></span>
                </li>
              )}
              {expensesToday.length > 0 ? (
                <li className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/50 p-3.5 text-sm text-slate-700">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
                  <span>Cash decreased by <strong className="text-red-600">{formatCurrency(spendToday)}</strong> across {expensesToday.length} expense(s).</span>
                </li>
              ) : (
                <li className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-sm text-slate-600">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>No expenses recorded today.</span>
                </li>
              )}
              {todays.some((tx) => tx.type === 'stock_adjustment') ? (
                <li className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-sm text-slate-600">
                  <Activity size={18} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>Inventory decreased because sales consumed stock.</span>
                </li>
              ) : null}
              <li className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-3.5 text-sm text-slate-700">
                <TrendingUp size={18} className="mt-0.5 shrink-0 text-brand-600" />
                <span>Cash position is <strong>{formatCurrency(snapshot.cashBalance)}</strong> and inventory value is <strong>{formatCurrency(snapshot.inventoryValue)}</strong>.</span>
              </li>
            </ul>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<AlertTriangle size={17} />}>Alerts</CardTitle>
              <Badge tone={alerts.length ? 'amber' : 'emerald'} dot>{alerts.length ? `${alerts.length} active` : 'All clear'}</Badge>
            </div>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.type}
                  className={`rounded-2xl border p-3.5 text-sm ${
                    alert.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' :
                    alert.tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' :
                    'border-sky-200 bg-sky-50 text-sky-800'
                  }`}
                >
                  {alert.message}
                </div>
              ))}
              {alerts.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                  Nothing needs attention right now.
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
