import { demoTransactions, formatCurrency, summarizeFinancials } from '@/lib/business-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function ExpensesPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Expenses</h1>
      <p className="mt-2 text-slate-600">Record and categorize operating expenses so they affect profit and cash flow appropriately.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Rent', value: 28000 },
          { label: 'Electricity', value: 4200 },
          { label: 'Marketing', value: 12000 },
          { label: 'Software', value: 5600 },
        ].map((expense) => (
          <div key={expense.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-500">{expense.label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(expense.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold text-slate-900">Expense ledger</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Rent</span><strong>{formatCurrency(snapshot.operatingExpenses / 2)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Electricity</span><strong>{formatCurrency(4200)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Marketing</span><strong>{formatCurrency(12000)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Operating expenses total</span><strong>{formatCurrency(snapshot.operatingExpenses)}</strong></div>
        </div>
      </div>
    </div>
  );
}
