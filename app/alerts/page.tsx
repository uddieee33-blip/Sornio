'use client';

import { formatCurrency, getAlerts } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

export default function AlertsPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();
  const alerts = getAlerts(snapshot, state.products);

  const lowStock = state.products.filter((product) => product.status === 'Active' && product.itemType === 'product' && product.stock <= product.reorderLevel);

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Alerts</h1>
      <p className="mt-2 text-slate-600">Only meaningful business alerts are shown when the condition actually exists.</p>

      <div className="mt-8 space-y-4">
        {alerts.map((alert) => (
          <div key={alert.type} className={
            alert.tone === 'amber' ? 'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800' :
            alert.tone === 'red' ? 'rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800' :
            'rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-800'
          }>{alert.message}</div>
        ))}
        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">Nothing needs attention right now.</div>
        ) : null}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Low stock items</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {lowStock.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
                <span>{product.name}</span>
                <strong className="text-amber-700">{product.stock} left</strong>
              </div>
            ))}
            {lowStock.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-slate-500">All items above reorder level.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Customer balances</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {state.customers.map((customer) => (
              <div key={customer.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span>{customer.name}</span>
                <strong>{formatCurrency(customer.openingBalance)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Pending invoices</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {state.invoices.filter((invoice) => invoice.paymentStatus !== 'paid').map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span>{invoice.id} · {invoice.customerName}</span>
                <strong className="text-amber-700">{formatCurrency(invoice.totalAmount)}</strong>
              </div>
            ))}
            {state.invoices.every((invoice) => invoice.paymentStatus === 'paid') ? (
              <p className="rounded-xl bg-slate-50 p-3 text-slate-500">All invoices collected.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
