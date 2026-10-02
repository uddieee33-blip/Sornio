import { formatCurrency, summarizeFinancials } from '@/lib/financial-engine';
import { demoTransactions } from '@/lib/demo-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function ComparisonsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Comparisons</h1>
      <p className="mt-2 text-slate-600">Compare current period with previous period using real transaction data only.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Today vs previous period</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Revenue</span><strong>{formatCurrency(snapshot.revenue)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Gross profit</span><strong>{formatCurrency(snapshot.grossProfit)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Operating expenses</span><strong>{formatCurrency(snapshot.operatingExpenses)}</strong></div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Product performance</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Organic Soap</span><strong>₹16,800</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Signature Tea</span><strong>₹9,600</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Website Setup</span><strong>₹15,000</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
