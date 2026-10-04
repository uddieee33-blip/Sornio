'use client';

import { Banknote, BarChart3, Coins, FileText, Receipt, TrendingUp, Users, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';
import { trendSeries } from '@/lib/trend';

export default function ReportsPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();

  const paidInvoices = state.invoices.filter((invoice) => invoice.paymentStatus === 'paid').length;
  const activeMembers = state.subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'expiring_soon').length;

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader eyebrow="Analysis" title="Reports" subtitle="Reports are generated live from recorded business activity in the financial engine." />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Sales revenue" value={formatCurrency(snapshot.revenue)} icon={Banknote} tone="emerald" spark={trendSeries(snapshot.revenue, 8, 0.2, 1)} />
          <StatCard label="Gross profit" value={formatCurrency(snapshot.grossProfit)} icon={Coins} tone="brand" spark={trendSeries(snapshot.grossProfit, 8, 0.22, 2)} />
          <StatCard label="Net cash flow" value={formatCurrency(snapshot.netCashFlow)} icon={Wallet} tone="violet" spark={trendSeries(snapshot.netCashFlow, 8, 0.25, 3)} />
          <StatCard label="Inventory value" value={formatCurrency(snapshot.inventoryValue)} icon={TrendingUp} tone="amber" spark={trendSeries(snapshot.inventoryValue, 8, 0.18, 4)} />
        </div>

        <Card className="mt-6 animate-fade-up">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<FileText size={17} />}>Statement of activity</CardTitle>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5"><span>Revenue</span><strong className="tabular-nums text-slate-900">{formatCurrency(snapshot.revenue)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5"><span>Cost of goods sold</span><strong className="tabular-nums text-red-600">−{formatCurrency(snapshot.cogs)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5"><span>Gross profit ({snapshot.grossMargin.toFixed(1)}% margin)</span><strong className="tabular-nums text-slate-900">{formatCurrency(snapshot.grossProfit)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5"><span>Operating expenses</span><strong className="tabular-nums text-red-600">−{formatCurrency(snapshot.operatingExpenses)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3.5 font-semibold ring-1 ring-inset ring-emerald-200"><span>Net profit</span><strong className="tabular-nums text-emerald-700">{formatCurrency(snapshot.netProfit)}</strong></div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              { label: 'Ledger entries', value: state.transactions.length, icon: BarChart3 },
              { label: 'Invoices paid', value: `${paidInvoices} of ${state.invoices.length}`, icon: Receipt },
              { label: 'Active members', value: activeMembers, icon: Users },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600"><Icon size={18} /></span>
                  <div>
                    <p className="text-xs font-medium text-slate-500">{m.label}</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{m.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
