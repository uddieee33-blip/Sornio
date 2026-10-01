'use client';

import { useMemo, useState } from 'react';

const starterProducts = [
  { id: 1, name: 'Organic Soap', category: 'Personal Care', sellingPrice: 280, cost: 130, stock: 18, status: 'Active' },
  { id: 2, name: 'Signature Tea', category: 'Food', sellingPrice: 120, cost: 56, stock: 32, status: 'Active' },
  { id: 3, name: 'Website Setup', category: 'Services', sellingPrice: 15000, cost: 6500, stock: 0, status: 'Active' },
  { id: 4, name: 'Bamboo Mug', category: 'Home', sellingPrice: 499, cost: 260, stock: 12, status: 'Inactive' },
];

export function SalesForm() {
  const [items, setItems] = useState([
    { product: 'Organic Soap', quantity: 2, rate: 280 },
    { product: 'Signature Tea', quantity: 3, rate: 120 },
  ]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.rate, 0),
    [items],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <h2 className="text-lg font-semibold text-slate-900">Add Sale</h2>

      <div className="mt-5 space-y-4">
        {items.map((item, index) => (
          <div key={`${item.product}-${index}`} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1.4fr_0.6fr_0.8fr]">
            <select
              value={item.product}
              onChange={(e) => {
                const next = [...items];
                next[index].product = e.target.value;
                setItems(next);
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            >
              {starterProducts.map((product) => (
                <option key={product.id} value={product.name}>{product.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={item.quantity}
              onChange={(e) => {
                const next = [...items];
                next[index].quantity = Number(e.target.value || 0);
                setItems(next);
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            />
            <input
              type="number"
              value={item.rate}
              onChange={(e) => {
                const next = [...items];
                next[index].rate = Number(e.target.value || 0);
                setItems(next);
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            />
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
          <p className="text-2xl font-bold text-slate-900">₹{total}</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Record sale</button>
      </div>
    </div>
  );
}
