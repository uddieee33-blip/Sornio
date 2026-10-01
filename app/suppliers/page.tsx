export default function SuppliersPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Suppliers</h1>
      <p className="mt-2 text-slate-600">Supplier profiles, products supplied, purchase history, and outstanding payables.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          { name: 'Urban Goods Co.', payable: 18000, orders: 4 },
          { name: 'Fresh Harvest', payable: 6500, orders: 2 },
          { name: 'Daily Needs Supply', payable: 0, orders: 1 },
        ].map((supplier) => (
          <div key={supplier.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="font-medium text-slate-900">{supplier.name}</p>
            <p className="mt-3 text-sm text-slate-500">Payable: ₹{supplier.payable}</p>
            <p className="mt-1 text-xs text-slate-500">Orders: {supplier.orders}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
