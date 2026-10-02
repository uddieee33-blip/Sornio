import { demoTransactions, formatCurrency, getInsights, summarizeFinancials } from '@/lib/business-data';

const snapshot = summarizeFinancials(demoTransactions);
const insights = getInsights(snapshot);

export default function InsightsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Business Insights</h1>
      <p className="mt-2 text-slate-600">Insights are derived from the transaction ledger and explain actual business reality.</p>

      <div className="mt-8 space-y-4">
        {insights.map((insight, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-600">{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
