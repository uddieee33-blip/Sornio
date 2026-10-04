'use client';

import { formatCurrency, getComparisonData } from '@/lib/business-data';
import { useFinancialSnapshot } from '@/lib/store';

export default function ComparisonsPage() {
  const snapshot = useFinancialSnapshot();
  const comparison = getComparisonData(snapshot);

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Comparisons</h1>
      <p className="mt-2 text-slate-600">Compare current period against previous period using real recorded activity.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {comparison.map((item) => {
          const change = item.previous > 0 ? ((item.current - item.previous) / item.previous) * 100 : 0;
          const improving = item.label === 'Operating Expenses' ? change <= 0 : change >= 0;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{item.label}</h2>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${improving ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Current</span><strong>{formatCurrency(item.current)}</strong></div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Previous</span><strong>{formatCurrency(item.previous)}</strong></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
