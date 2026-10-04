'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

export default function InventoryPage() {
  const { state } = useDukaanStore();
  const products = state.products.filter((product) => product.itemType === 'product');
  const stockValue = products.reduce((sum, product) => sum + product.stock * product.cost, 0);
  const lowStockCount = products.filter((product) => product.status === 'Active' && product.stock <= product.reorderLevel).length;

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Inventory</h1>
          <p className="mt-2 text-slate-600">Stock levels update automatically when sales are recorded.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Value {formatCurrency(stockValue)}</span>
          {lowStockCount > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">{lowStockCount} low</span>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {products.map((product) => {
          const low = product.status === 'Active' && product.stock <= product.reorderLevel;
          return (
            <div key={product.id} className={`rounded-2xl border bg-white p-5 shadow-card ${low ? 'border-amber-300' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{product.name}</p>
                {low ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Reorder</span> : null}
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900">{product.stock}</p>
              <p className="mt-1 text-xs text-slate-500">Reorder at {product.reorderLevel} · cost {formatCurrency(product.cost)}</p>
              <p className="mt-2 text-xs text-slate-500">On-hand value {formatCurrency(product.stock * product.cost)}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Stock moves when you <Link href="/sales" className="font-medium text-slate-900">record sales</Link> and new items appear from <Link href="/products" className="font-medium text-slate-900">the catalog</Link>.
      </p>
    </div>
  );
}
