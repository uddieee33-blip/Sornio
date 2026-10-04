'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

export default function ProductsPage() {
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState({
    name: '',
    itemType: 'product',
    category: 'General',
    sellingPrice: '0',
    cost: '0',
    stock: '0',
    reorderLevel: '0',
    supplier: '',
  });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const handleSubmit = () => {
    const result = actions.addProduct({
      name: form.name,
      category: form.category || 'General',
      itemType: form.itemType === 'service' ? 'service' : 'product',
      sellingPrice: Number(form.sellingPrice || 0),
      cost: Number(form.cost || 0),
      stock: form.itemType === 'service' ? 0 : Number(form.stock || 0),
      reorderLevel: form.itemType === 'service' ? 0 : Number(form.reorderLevel || 0),
      status: 'Active',
      supplier: form.supplier.trim() || undefined,
    });
    if (result.ok) {
      setMessage({ tone: 'ok', text: `${form.name.trim()} added to the catalog.` });
      setForm({ name: '', itemType: 'product', category: 'General', sellingPrice: '0', cost: '0', stock: '0', reorderLevel: '0', supplier: '' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not add item.' });
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900';

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Products & Services</h1>
          <p className="mt-2 text-slate-600">Add items and make them available across sales, inventory, profitability, and reports.</p>
        </div>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">{state.products.length} items</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Add Item</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Item Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Handmade Soap" />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Item Type</span>
              <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} className={inputClass}>
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Category</span>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Supplier</span>
              <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={inputClass} placeholder="Optional" />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Selling Price</span>
              <input type="number" min={0} value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} className={inputClass} />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Cost Price</span>
              <input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={inputClass} />
            </label>
            {form.itemType === 'product' ? (
              <>
                <label className="text-sm text-slate-700">
                  <span className="mb-2 block font-medium">Opening Stock</span>
                  <input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className={inputClass} />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-2 block font-medium">Reorder Level</span>
                  <input type="number" min={0} value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} className={inputClass} />
                </label>
              </>
            ) : null}
          </div>

          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button onClick={handleSubmit} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save item</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Product list</h2>
          <div className="mt-4 space-y-3">
            {state.products.map((product) => {
              const margin = product.sellingPrice > 0 ? ((product.sellingPrice - product.cost) / product.sellingPrice) * 100 : 0;
              const lowStock = product.itemType === 'product' && product.stock <= product.reorderLevel;
              return (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.category}{product.supplier ? ` · ${product.supplier}` : ''}</p>
                    {lowStock ? <p className="mt-1 text-xs font-medium text-amber-600">Low stock — reorder</p> : null}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm text-slate-600">
                      <p>{formatCurrency(product.sellingPrice)}</p>
                      <p className="text-xs">Margin {margin.toFixed(0)}%</p>
                      <p className="text-xs">{product.itemType === 'service' ? 'Service' : `Stock ${product.stock}`}</p>
                    </div>
                    <button
                      onClick={() => actions.toggleProductStatus(product.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${product.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {product.status}
                    </button>
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
