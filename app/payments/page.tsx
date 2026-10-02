import { demoTransactions, formatCurrency, summarizeFinancials } from '@/lib/business-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function PaymentsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Payments</h1>
      <p className="mt-2 text-slate-600">Record payments captured accurately across cash, UPI, card, bank transfer, and other methods without storing sensitive financial credentials.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Cash', value: 30000 },
          { label: 'UPI', value: 12000 },
          { label: 'Card', value: 9000 },
          { label: 'Bank Transfer', value: 15000 },
          { label: 'Other', value: 5000 },
        ].map((payment) => (
          <div key={payment.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-500">{payment.label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(payment.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold text-slate-900">Payment summary</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Cash in</span><strong>{formatCurrency(snapshot.cashIn)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Cash out</span><strong>{formatCurrency(snapshot.cashOut)}</strong></div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Net cash flow</span><strong>{formatCurrency(snapshot.netCashFlow)}</strong></div>
        </div>
      </div>
    </div>
  );
}
