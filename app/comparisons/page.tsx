import { demoTransactions, formatCurrency, getComparisonData, summarizeFinancials } from '@/lib/business-data';

const snapshot = summarizeFinancials(demoTransactions);
const comparison = getComparisonData(snapshot);

export default function ComparisonsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Comparisons</h1>
      <p className="mt-2 text-slate-600">Compare current period against previous period using real recorded activity.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {comparison.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900">{item.label}</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Current</span><strong>{formatCurrency(item.current)}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Previous</span><strong>{formatCurrency(item.previous)}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
