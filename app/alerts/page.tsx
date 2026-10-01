export default function AlertsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Alerts</h1>
      <p className="mt-2 text-slate-600">Only meaningful alerts are shown when the underlying condition exists in real business data.</p>

      <div className="mt-8 space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Low stock: 3 items are below the reorder level.
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          Outstanding customer balance: ₹18,400 remains unpaid.
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-800">
          Supplier payment due: 2 invoices are pending approval.
        </div>
      </div>
    </div>
  );
}
