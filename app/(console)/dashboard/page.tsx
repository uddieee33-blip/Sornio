'use client';

import Link from 'next/link';
import { Activity, AlertTriangle, Banknote, CheckCircle2, Coins, PiggyBank, TrendingUp, Wallet, Zap } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DualAreaChart } from '@/components/charts/RevenueAreaChart';
import { HBarList } from '@/components/charts/HBarList';
import { formatCurrency, getAlerts } from '@/lib/business-data';
import { expensesByCategory, expenseSeries, revenueSeries } from '@/lib/chart-data';
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
    <div className="p-6 md:p-8">
      <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-600">Owner Cockpit</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">Business reality dashboard</h1>
        </div>
        <Badge tone="emerald" dot>Real data only</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatCurrency(snapshot.revenue)} icon={Banknote} tone="emerald" spark={trendSeries(snapshot.revenue, 8, 0.2, 1)} />
        <StatCard label="Gross Profit" value={formatCurrency(snapshot.grossProfit)} icon={Coins} tone="brand" spark={trendSeries(snapshot.grossProfit, 8, 0.22, 2)} />
        <StatCard label="Operating Profit" value={formatCurrency(snapshot.operatingProfit)} icon={PiggyBank} tone="violet" spark={trendSeries(snapshot.operatingProfit, 8, 0.18, 3)} />
        <StatCard label="Cash Position" value={formatCurrency(snapshot.cashBalance)} icon={Wallet} tone="amber" spark={trendSeries(snapshot.cashBalance, 8, 0.25, 4)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<Activity size={17} />}>Revenue vs Expenses</CardTitle>
            <div className="flex items-center gap-3 text-xs text-stone-600">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-400" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> Expenses</span>
            </div>
          </div>
          <DualAreaChart revenue={revenueSeries(state.transactions)} expenses={expenseSeries(state.transactions)} height={260} />
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<Zap size={17} />}>Expenses by category</CardTitle>
            <Badge tone="red">{formatCurrency(snapshot.operatingExpenses)}</Badge>
          </div>
          <HBarList data={expensesByCategory(state.transactions)} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="animate-fade-up">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<Activity size={17} />}>What Changed Today?</CardTitle>
            <Badge tone="brand">{todays.length} entries</Badge>
          </div>
          <ul className="space-y-3">
            {salesToday.length > 0 ? (
              <li className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] p-3.5 text-sm text-stone-700">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" />
                <span>Revenue increased by <strong className="text-emerald-700">{formatCurrency(revenueToday)}</strong> across {salesToday.length} sale(s).</span>
              </li>
            ) : (
              <li className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5 text-sm text-stone-600">
                <Zap size={18} className="mt-0.5 shrink-0 text-brand-400" />
                <span>No sales recorded yet today. <Link href="/sales" className="font-semibold text-brand-600 hover:underline">Record the first one.</Link></span>
              </li>
            )}
            {expensesToday.length > 0 ? (
              <li className="flex items-start gap-3 rounded-2xl border border-red-500/15 bg-red-500/[0.06] p-3.5 text-sm text-stone-700">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" />
                <span>Cash decreased by <strong className="text-red-700">{formatCurrency(spendToday)}</strong> across {expensesToday.length} expense(s).</span>
              </li>
            ) : null}
            {todays.some((tx) => tx.type === 'stock_adjustment') ? (
              <li className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5 text-sm text-stone-600">
                <Activity size={18} className="mt-0.5 shrink-0 text-stone-600" />
                <span>Inventory decreased because sales consumed stock.</span>
              </li>
            ) : null}
            <li className="flex items-start gap-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.07] p-3.5 text-sm text-stone-700">
              <TrendingUp size={18} className="mt-0.5 shrink-0 text-brand-600" />
              <span>Cash position is <strong className="text-stone-900">{formatCurrency(snapshot.cashBalance)}</strong> and inventory value is <strong className="text-stone-900">{formatCurrency(snapshot.inventoryValue)}</strong>.</span>
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
                  alert.tone === 'amber' ? 'border-amber-500/20 bg-amber-500/[0.07] text-amber-700' :
                  alert.tone === 'red' ? 'border-red-500/20 bg-red-500/[0.07] text-red-700' :
                  'border-sky-500/20 bg-sky-500/[0.07] text-sky-700'
                }`}
              >
                {alert.message}
              </div>
            ))}
            {alerts.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-sm text-emerald-700">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-700" />
                Nothing needs attention right now.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
