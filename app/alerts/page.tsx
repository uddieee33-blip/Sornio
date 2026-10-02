import { demoCustomers, demoProducts, demoSuppliers, getAlerts, summarizeFinancials, demoTransactions, formatCurrency } from '@/lib/business-data';

const snapshot = summarizeFinancials(demoTransactions);
const alerts = getAlerts(snapshot, demoProducts);

export default function AlertsPage() {
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
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Customer balances</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {demoCustomers.map((customer) => (
              <div key={customer.name} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span>{customer.name}</span>
                <strong>{formatCurrency(customer.balance)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Supplier payables</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {demoSuppliers.map((supplier) => (
              <div key={supplier.name} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span>{supplier.name}</span>
                <strong>{formatCurrency(supplier.payable)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
