'use client';

import { formatCurrency } from '@/lib/business-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

const METHOD_ORDER: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];

export default function PaymentsPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();

  const inflowByMethod = state.transactions
    .filter((tx) => tx.type === 'payment' && tx.direction === 'in')
    .reduce<Record<string, number>>((acc, tx) => {
      const method = tx.paymentMethod ?? 'Other';
      acc[method] = (acc[method] ?? 0) + tx.amount;
      return acc;
    }, {});

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Payments</h1>
      <p className="mt-2 text-slate-600">Collections captured across cash, UPI, card, bank transfer, and other methods — no sensitive credentials stored.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        {METHOD_ORDER.map((method) => (
          <div key={method} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-500">{method}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(inflowByMethod[method] ?? 0)}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Payment summary</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Cash in</span><strong>{formatCurrency(snapshot.cashIn)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Cash out</span><strong>{formatCurrency(snapshot.cashOut)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Net cash flow</span><strong>{formatCurrency(snapshot.netCashFlow)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>Bank balance</span><strong>{formatCurrency(snapshot.bankBalance)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>UPI balance</span><strong>{formatCurrency(snapshot.upiBalance)}</strong></div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Gateway records</h2>
          <div className="mt-4 space-y-3 text-sm">
            {[...state.paymentRecords].reverse().slice(0, 8).map((record) => (
              <div key={record.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="font-medium text-slate-800">{record.customerName}</p>
                  <p className="text-xs text-slate-500">{record.paymentMethod} · {record.gateway} · {new Date(record.paymentDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{formatCurrency(record.amount)}</p>
                  <p className={`text-xs capitalize ${record.status === 'paid' ? 'text-emerald-700' : record.status === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>{record.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
