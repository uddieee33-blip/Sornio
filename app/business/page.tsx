import { formatCurrency, summarizeFinancials } from '@/lib/financial-engine';
import { demoTransactions } from '@/lib/demo-data';

const snapshot = summarizeFinancials(demoTransactions);

export default function BusinessPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Business setup</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Create your business profile</h1>
          <p className="mt-2 text-slate-600">The initial financial state starts at zero until actual business activity is recorded.</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <form className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Business name</span>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="e.g. Saffron Studio" />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Business type</span>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="Retail, services, manufacturing" />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Currency</span>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue="INR" />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Time zone</span>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue="Asia/Kolkata" />
              </label>
            </div>

            <label className="block text-sm text-slate-700">
              <span className="mb-2 block font-medium">Description</span>
              <textarea className="min-h-[110px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="Describe the business and how it operates." />
            </label>

            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              Initial balances remain zero until real business activity is recorded. No financial data is fabricated.
            </div>

            <div className="flex justify-end">
              <button type="button" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">Create business</button>
            </div>
          </form>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900">Starting financial state</h2>
            <div className="space-y-3 text-sm text-slate-600">
              {[
                ['Opening cash', 0],
                ['Opening bank', 0],
                ['Opening UPI', 0],
                ['Opening card receivables', 0],
                ['Revenue', 0],
                ['COGS', 0],
                ['Gross profit', 0],
                ['Expenses', 0],
                ['Net profit', 0],
                ['Cash in', 0],
                ['Cash out', 0],
                ['Net cash flow', 0],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>{label}</span>
                  <strong className="text-slate-900">{formatCurrency(Number(value))}</strong>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Current live summary: {formatCurrency(snapshot.revenue)} revenue, {formatCurrency(snapshot.grossProfit)} gross profit.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
