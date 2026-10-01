import { demoProducts } from '@/lib/demo-data';

export default function InventoryPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Inventory</h1>
      <p className="mt-2 text-slate-600">Track stock value, movement, reorder levels, and trace purchases and sales.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {demoProducts.map((product) => (
          <div key={product.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-sm text-slate-500">{product.name}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{product.stock}</p>
            <p className="mt-1 text-xs text-slate-500">Reorder: {Math.max(product.stock / 3, 5)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
