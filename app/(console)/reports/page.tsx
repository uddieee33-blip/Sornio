'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { BarChart3, Landmark, Percent, PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/stat-card';
import { DualAreaChart, RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { HBarList } from '@/components/charts/HBarList';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import { expenseSeries, expensesByCategory, paymentsByMethod, revenueByCategoryHint, revenueSeries } from '@/lib/chart-data';
import { useDukaanStore } from '@/lib/store';
import { ExportButton } from '@/components/export/export-button';

export default function ReportsPage() {
  useLocaleRefresh();
  const { state } = useDukaanStore();
  const financials = summarizeFinancials(state.transactions, state.products, state.customers);
  const revenueByCategory = revenueByCategoryHint(state.transactions);
  const expenseByCategory = expensesByCategory(state.transactions);
  const byMethod = paymentsByMethod(state.transactions);

  const balances = [
    { label: 'Cash in hand', value: financials.cashBalance },
    { label: 'Bank', value: financials.bankBalance },
    { label: 'UPI', value: financials.upiBalance },
    { label: 'Card receivables', value: financials.cardReceivables },
    { label: 'Customer receivables', value: financials.customerReceivables },
    { label: 'Inventory value', value: financials.inventoryValue },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Performance"
        title="Reports"
        subtitle="Financials computed live from the ledger — change a transaction and every number below moves."
        actions={<ExportButton />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-fade-up">
        <StatCard index={0} label="Revenue" value={formatCurrency(financials.revenue)} numeric={financials.revenue} format={formatCurrency} sensitive icon={TrendingUp} tone="brand" />
        <StatCard index={1} label="Operating expenses" value={formatCurrency(financials.operatingExpenses)} numeric={financials.operatingExpenses} format={formatCurrency} sensitive icon={PiggyBank} tone="amber" />
        <StatCard index={2} label="Gross profit" value={formatCurrency(financials.grossProfit)} numeric={financials.grossProfit} format={formatCurrency} sensitive icon={BarChart3} tone="emerald" delta={`${financials.grossMargin.toFixed(1)}% margin`} />
        <StatCard index={3} label="Net cash flow" value={formatCurrency(financials.netCashFlow)} numeric={financials.netCashFlow} format={formatCurrency} sensitive icon={Wallet} tone="blue" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="animate-fade-up">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<TrendingUp size={17} />}>Revenue · last 14 days</CardTitle>
            <Badge tone="brand" dot>{formatCurrency(financials.revenue)}</Badge>
          </div>
          <RevenueAreaChart data={revenueSeries(state.transactions)} gradientId="report-rev" height={240} />
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<PiggyBank size={17} />}>Expenses · last 14 days</CardTitle>
            <Badge tone="red" dot>{formatCurrency(financials.operatingExpenses)}</Badge>
          </div>
          <RevenueAreaChart data={expenseSeries(state.transactions)} gradientId="report-exp" color="#b84c58" height={240} />
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-5"><CardTitle icon={<Landmark size={17} />}>Cash flow in vs out</CardTitle></div>
          <DualAreaChart revenue={revenueSeries(state.transactions)} expenses={expenseSeries(state.transactions)} height={240} />
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <span className="text-sm text-stone-600">Net profit after expenses</span>
            <span className={`font-display text-xl font-bold tabular-nums ${financials.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(financials.netProfit)}
            </span>
          </div>
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-5"><CardTitle icon={<BarChart3 size={17} />}>Breakdowns</CardTitle></div>
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">Revenue by category</p>
              {revenueByCategory.length > 0 ? <HBarList data={revenueByCategory} /> : <p className="text-sm text-stone-600">No revenue yet.</p>}
            </div>
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">Expenses by category</p>
              {expenseByCategory.length > 0 ? <HBarList data={expenseByCategory} /> : <p className="text-sm text-stone-600">No expenses yet.</p>}
            </div>
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">Payments by method</p>
              {byMethod.length > 0 ? <HBarList data={byMethod} /> : <p className="text-sm text-stone-600">No payments yet.</p>}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6 animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <CardTitle icon={<Percent size={17} />}>Where the money sits</CardTitle>
          <Badge tone="slate" dot>{state.transactions.length} ledger entries</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map((item) => (
            <div key={item.label} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-brand-400/30 hover:bg-stone-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{item.label}</p>
              <p className={`mt-1.5 font-display text-xl font-bold tabular-nums ${item.value >= 0 ? 'text-stone-900' : 'text-red-700'}`}>{formatCurrency(item.value)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
