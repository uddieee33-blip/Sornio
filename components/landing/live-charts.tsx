'use client';

import { Banknote, BarChart3, FlaskConical, Receipt, TrendingUp } from 'lucide-react';
import { RevenueAreaChart, DualAreaChart } from '@/components/charts/RevenueAreaChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import { expenseSeries, expensesByCategory, paymentsByMethod, revenueSeries } from '@/lib/chart-data';
import { buildSeedState } from '@/lib/store';

/** Marks every showcase chart as sample data — never real business numbers. */
function SampleTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-400 ring-1 ring-inset ring-amber-500/25">
      <FlaskConical size={11} /> Sample
    </span>
  );
}

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
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><TrendingUp size={16} className="text-brand-300" /> Revenue vs expenses · 14 days</h3>
            <SampleTag />
          </div>
          <DualAreaChart revenue={revenue} expenses={expenses} height={260} />
        </div>

        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><Banknote size={16} className="text-brand-300" /> Payment mix</h3>
            <SampleTag />
          </div>
          {byMethod.length > 0 ? <DonutChart data={byMethod} centerLabel="Collected" centerValue={formatCurrency(financials.cashIn)} height={190} /> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><BarChart3 size={16} className="text-brand-300" /> Revenue trend</h3>
            <SampleTag />
          </div>
          <RevenueAreaChart data={revenue} gradientId="landing-rev" height={190} />
        </div>
        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><Receipt size={16} className="text-brand-300" /> Expenses by category</h3>
            <SampleTag />
          </div>
          {byCategory.length > 0 ? <DonutChart data={byCategory} centerLabel="Spent" centerValue={formatCurrency(financials.operatingExpenses)} height={190} /> : null}
        </div>
      </div>
    </>
  );
}
