import { formatCurrency, summarizeFinancials } from '@/lib/financial-engine';
import { demoTransactions } from '@/lib/demo-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function TransactionsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Transactions</h1>
      <p className="mt-2 text-slate-600">Every sale, payment, expense, stock movement, refund, and transfer is traceable.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Revenue', value: snapshot.revenue },
          { label: 'Cash In', value: snapshot.cashIn },
          { label: 'Cash Out', value: snapshot.cashOut },
          { label: 'Net Cash Flow', value: snapshot.netCashFlow },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold text-slate-900">Audit trail</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          {[
            'Sale recorded for ₹12,500 with cash payment',
            'Expense recorded for ₹28,000 from rent',
            'UPI payment posted for ₹12,000',
            'Inventory adjustment recorded for stock reduction',
          ].map((entry) => (
            <div key={entry} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {entry}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
