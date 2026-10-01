'use client';

import { useState } from 'react';

export function ProductForm() {
  const [form, setForm] = useState({
    name: '',
    itemType: 'product',
    category: 'General',
    sellingPrice: '0',
    costPrice: '0',
    stock: '0',
    reorderLevel: '0',
    active: true,
  });

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <h2 className="text-lg font-semibold text-slate-900">Add Item</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Item Name</span>
          <input
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="e.g. Handmade Soap"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Item Type</span>
          <select
            value={form.itemType}
            onChange={(e) => handleChange('itemType', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Category</span>
          <input
            value={form.category}
            onChange={(e) => handleChange('category', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Unit</span>
          <input
            defaultValue="pcs"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Selling Price</span>
          <input
            type="number"
            value={form.sellingPrice}
            onChange={(e) => handleChange('sellingPrice', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Cost Price</span>
          <input
            type="number"
            value={form.costPrice}
            onChange={(e) => handleChange('costPrice', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Opening Stock</span>
          <input
            type="number"
            value={form.stock}
            onChange={(e) => handleChange('stock', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-2 block font-medium">Reorder Level</span>
          <input
            type="number"
            value={form.reorderLevel}
            onChange={(e) => handleChange('reorderLevel', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => handleChange('active', e.target.checked)}
          />
          Active
        </label>

        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Save item
        </button>
      </div>
    </div>
  );
}
