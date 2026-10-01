import { OverviewGrid } from '@/components/dashboard/overview-grid';
import { formatCurrency, summarizeFinancials } from '@/lib/financial-engine';

const demoTransactions = [
  { type: 'sale', category: 'Revenue', amount: 125000, direction: 'in', account: 'revenue' },
  { type: 'sale', category: 'Revenue', amount: 35000, direction: 'in', account: 'revenue' },
  { type: 'expense', category: 'Rent', amount: 28000, direction: 'out', account: 'expense' },
  { type: 'expense', category: 'Electricity', amount: 4200, direction: 'out', account: 'expense' },
  { type: 'payment', category: 'Cash', amount: 30000, direction: 'in', account: 'cash' },
  { type: 'payment', category: 'UPI', amount: 12000, direction: 'in', account: 'upi' },
  { type: 'stock_adjustment', category: 'Inventory', amount: 6000, direction: 'out', account: 'inventory' },
];

const snapshot = summarizeFinancials(demoTransactions);

export default function DashboardPage() {
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

      <OverviewGrid snapshot={snapshot} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">What Changed Today?</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>• Revenue increased because recorded sales were posted.</li>
            <li>• Cash balance decreased because recorded expenses were paid from cash.</li>
            <li>• Inventory decreased because sales reduced stock.</li>
            <li>• Customer receivables increased because a sale was recorded as unpaid.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Financial engine</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span>Cash position</span>
              <strong>{formatCurrency(snapshot.cashBalance)}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span>Gross profit</span>
              <strong>{formatCurrency(snapshot.grossProfit)}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span>Net cash flow</span>
              <strong>{formatCurrency(snapshot.netCashFlow)}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
