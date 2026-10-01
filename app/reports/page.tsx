import { formatCurrency, summarizeFinancials } from '@/lib/financial-engine';
import { demoTransactions } from '@/lib/demo-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function ReportsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Reports</h1>
      <p className="mt-2 text-slate-600">Reports are generated from recorded business activity and calculated in the financial engine.</p>

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
    </div>
  );
}
