export default function PaymentsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Payments</h1>
      <p className="mt-2 text-slate-600">Record and reconcile cash, UPI, card, bank transfer, and other payment methods without collecting sensitive credentials.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].map((method) => (
          <div key={method} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-500">{method}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">₹0</p>
          </div>
        ))}
      </div>
    </div>
  );
}
