import { demoTransactions, formatCurrency, summarizeFinancials } from '@/lib/business-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function TransactionsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Transactions</h1>
      <p className="mt-2 text-slate-600">Every recorded sale, payment, expense, stock movement, refund, and transfer is traceable.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Revenue', value: snapshot.revenue },
          { label: 'COGS', value: snapshot.cogs },
          { label: 'Cash In', value: snapshot.cashIn },
          { label: 'Net Cash Flow', value: snapshot.netCashFlow },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {demoTransactions.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3 font-medium text-slate-900">{item.type}</td>
                <td className="px-4 py-3">{item.description}</td>
                <td className={`px-4 py-3 ${item.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {item.direction === 'in' ? '+' : '-'} {formatCurrency(item.amount)}
                </td>
                <td className="px-4 py-3">{item.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
