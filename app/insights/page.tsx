import { formatCurrency, summarizeFinancials } from '@/lib/financial-engine';
import { demoTransactions } from '@/lib/demo-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function InsightsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Business Insights</h1>
      <p className="mt-2 text-slate-600">Insights are written from actual transaction data and explain business reality.</p>

      <div className="mt-8 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="font-medium text-slate-900">Revenue trend</p>
          <p className="mt-2 text-sm text-slate-600">Revenue increased by {formatCurrency(snapshot.revenue)} because sales were recorded during the current period.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="font-medium text-slate-900">Cash position</p>
          <p className="mt-2 text-sm text-slate-600">Cash balance is {formatCurrency(snapshot.cashBalance)} after accounting for inflows and outflows.</p>
        </div>
      </div>
    </div>
  );
}
