import { demoProducts } from '@/lib/business-data';

export default function SalesPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Sales</h1>
      <p className="mt-2 text-slate-600">Record multi-line sales and assign the payment method without collecting sensitive credentials.</p>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="space-y-4">
          {[
            { product: 'Organic Soap', quantity: 2, rate: 280 },
            { product: 'Signature Tea', quantity: 3, rate: 120 },
            { product: 'Web Design Package', quantity: 1, rate: 15000 },
          ].map((line) => (
            <div key={line.product} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1.4fr_0.5fr_0.8fr]">
              <select defaultValue={line.product} className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900">
                {demoProducts.map((product) => (
                  <option key={product.id} value={product.name}>{product.name}</option>
                ))}
              </select>
              <input type="number" defaultValue={line.quantity} className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" />
              <input type="number" defaultValue={line.rate} className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" />
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-xl bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-3">
            {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].map((method) => (
              <button key={method} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                {method}
              </button>
            ))}
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Sale total</p>
            <p className="text-2xl font-bold text-slate-900">₹16,240</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Record sale</button>
        </div>
      </div>
    </div>
  );
}
