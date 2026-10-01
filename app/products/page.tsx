import { ProductForm } from '@/components/products/product-form';

export default function ProductsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Products & Services</h1>
          <p className="mt-2 text-slate-600">Add items, manage inventory, and track profit by product or service.</p>
        </div>
        <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">Export</button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <ProductForm />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Product list</h2>
          <div className="mt-4 space-y-3">
            {[
              { name: 'Organic Soap', category: 'Personal Care', sellingPrice: 280, cost: 130, stock: 18, status: 'Active', margin: 54 },
              { name: 'Signature Tea', category: 'Food', sellingPrice: 120, cost: 56, stock: 32, status: 'Active', margin: 53 },
              { name: 'Website Setup', category: 'Services', sellingPrice: 15000, cost: 6500, stock: 0, status: 'Active', margin: 57 },
            ].map((product) => (
              <div key={product.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.category}</p>
                </div>
                <div className="text-right text-sm text-slate-600">
                  <p>₹{product.sellingPrice}</p>
                  <p className="text-xs">Margin {product.margin}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
