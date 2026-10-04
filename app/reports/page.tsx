'use client';

import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

export default function ReportsPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();

  const paidInvoices = state.invoices.filter((invoice) => invoice.paymentStatus === 'paid').length;
  const activeMembers = state.subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'expiring_soon').length;

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Reports</h1>
      <p className="mt-2 text-slate-600">Reports are generated live from recorded business activity in the financial engine.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="text-sm text-slate-500">Sales revenue</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(snapshot.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="text-sm text-slate-500">Gross profit</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(snapshot.grossProfit)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="text-sm text-slate-500">Net cash flow</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(snapshot.netCashFlow)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="text-sm text-slate-500">Inventory value</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(snapshot.inventoryValue)}</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold text-slate-900">Statement of activity</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Revenue</span><strong className="text-slate-900">{formatCurrency(snapshot.revenue)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Cost of goods sold</span><strong className="text-red-700">−{formatCurrency(snapshot.cogs)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Gross profit ({snapshot.grossMargin.toFixed(1)}% margin)</span><strong className="text-slate-900">{formatCurrency(snapshot.grossProfit)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Operating expenses</span><strong className="text-red-700">−{formatCurrency(snapshot.operatingExpenses)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 font-medium"><span>Net profit</span><strong className="text-emerald-700">{formatCurrency(snapshot.netProfit)}</strong></div>
        </div>

        <div className="mt-6 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Ledger entries</p><p className="mt-1 font-semibold text-slate-900">{state.transactions.length}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Invoices paid</p><p className="mt-1 font-semibold text-slate-900">{paidInvoices} of {state.invoices.length}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Active members</p><p className="mt-1 font-semibold text-slate-900">{activeMembers}</p></div>
        </div>
      </div>
    </div>
  );
}
