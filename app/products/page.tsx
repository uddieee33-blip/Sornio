import { demoProducts, formatCurrency } from '@/lib/business-data';

export default function ProductsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Products & Services</h1>
          <p className="mt-2 text-slate-600">Add items and make them available across sales, inventory, profitability, and reports.</p>
        </div>
        <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">Export</button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Add Item</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Item Name</span>
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="e.g. Handmade Soap" />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Item Type</span>
              <select className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900">
                <option>Product</option>
                <option>Service</option>
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Category</span>
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue="General" />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Unit</span>
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue="pcs" />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Selling Price</span>
              <input type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue={0} />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Cost Price</span>
              <input type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue={0} />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Opening Stock</span>
              <input type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue={0} />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Reorder Level</span>
              <input type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue={0} />
            </label>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" defaultChecked />
              Active
            </label>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save item</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Product list</h2>
          <div className="mt-4 space-y-3">
            {demoProducts.map((product) => {
              const margin = product.sellingPrice > 0 ? ((product.sellingPrice - product.cost) / product.sellingPrice) * 100 : 0;
              return (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.category}</p>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>{formatCurrency(product.sellingPrice)}</p>
                    <p className="text-xs">Margin {margin.toFixed(0)}%</p>
                    <p className="text-xs">Stock {product.stock}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
