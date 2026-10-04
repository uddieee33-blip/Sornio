'use client';

import { Banknote, BarChart3, Receipt, TrendingUp } from 'lucide-react';
import { RevenueAreaChart, DualAreaChart } from '@/components/charts/RevenueAreaChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import { expenseSeries, expensesByCategory, paymentsByMethod, revenueSeries } from '@/lib/chart-data';
import { buildSeedState } from '@/lib/store';

export function LiveCharts() {
  const seed = buildSeedState();
  const financials = summarizeFinancials(seed.transactions);
  const revenue = revenueSeries(seed.transactions);
  const expenses = expenseSeries(seed.transactions);
  const byCategory = expensesByCategory(seed.transactions);
  const byMethod = paymentsByMethod(seed.transactions);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><TrendingUp size={16} className="text-brand-300" /> Revenue vs expenses · 14 days</h3>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">Live</span>
          </div>
          <DualAreaChart revenue={revenue} expenses={expenses} height={260} />
        </div>

        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><Banknote size={16} className="text-brand-300" /> Payment mix</h3>
          {byMethod.length > 0 ? <DonutChart data={byMethod} centerLabel="Collected" centerValue={formatCurrency(financials.cashIn)} height={190} /> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><BarChart3 size={16} className="text-brand-300" /> Revenue trend</h3>
          <RevenueAreaChart data={revenue} gradientId="landing-rev" height={190} />
        </div>
        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><Receipt size={16} className="text-brand-300" /> Expenses by category</h3>
          {byCategory.length > 0 ? <DonutChart data={byCategory} centerLabel="Spent" centerValue={formatCurrency(financials.operatingExpenses)} height={190} /> : null}
        </div>
      </div>
    </>
  );
}
