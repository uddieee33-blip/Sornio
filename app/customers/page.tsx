export default function CustomersPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
      <p className="mt-2 text-slate-600">Customer profiles, sales history, balances, and receivables.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          { name: 'Riya Sharma', balance: 12500, sales: 3 },
          { name: 'Amit Verma', balance: 7800, sales: 2 },
          { name: 'Nisha Patel', balance: 0, sales: 5 },
        ].map((customer) => (
          <div key={customer.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="font-medium text-slate-900">{customer.name}</p>
            <p className="mt-3 text-sm text-slate-500">Outstanding: ₹{customer.balance}</p>
            <p className="mt-1 text-xs text-slate-500">Sales: {customer.sales}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
