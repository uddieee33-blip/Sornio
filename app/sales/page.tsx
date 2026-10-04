'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, type SaleLine } from '@/lib/store';
import type { PaymentMethod } from '@/lib/models/billing';

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];

export default function SalesPage() {
  const { state, actions } = useDukaanStore();
  const sellableProducts = state.products.filter((product) => product.status === 'Active');

  const [lines, setLines] = useState<SaleLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.rate, 0), [lines]);

  const addLine = () => {
    const first = sellableProducts[0];
    if (!first) return;
    setLines((current) => [...current, { productId: first.id, quantity: 1, rate: first.sellingPrice }]);
  };

  const updateLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = state.products.find((item) => item.id === productId);
    updateLine(index, { productId, rate: product ? product.sellingPrice : 0 });
  };

  const handleRecord = () => {
    const result = actions.recordSale({ lines, method, customerName });
    if (result.ok) {
      setMessage({ tone: 'ok', text: `Sale of ${formatCurrency(total)} recorded via ${method}.` });
      setLines([]);
      setCustomerName('');
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not record sale.' });
    }
  };

  const recentSales = [...state.transactions].filter((tx) => tx.type === 'sale').reverse().slice(0, 6);

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Sales</h1>
      <p className="mt-2 text-slate-600">Record multi-line sales. Revenue, cash, and inventory update everywhere automatically.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Record a sale</h2>
            <button onClick={addLine} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">+ Add line</button>
          </div>

          <div className="mt-5 space-y-4">
            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No lines yet — add one to start a sale.</p>
            ) : null}
            {lines.map((line, index) => {
              const product = state.products.find((item) => item.id === line.productId);
              return (
                <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1.4fr_0.5fr_0.8fr_auto]">
                  <select value={line.productId} onChange={(e) => handleProductChange(index, e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900">
                    {sellableProducts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}{item.itemType === 'product' ? ` (${item.stock} in stock)` : ''}
                      </option>
                    ))}
                  </select>
                  <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value || 0) })} className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" />
                  <input type="number" min={0} value={line.rate} onChange={(e) => updateLine(index, { rate: Number(e.target.value || 0) })} className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" />
                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <span className="text-sm font-medium text-slate-800">{formatCurrency(line.quantity * line.rate)}</span>
                    <button onClick={() => removeLine(index)} className="text-xs font-medium text-red-600">Remove</button>
                  </div>
                  {product && product.itemType === 'product' && line.quantity > product.stock ? (
                    <p className="text-xs font-medium text-red-600 md:col-span-4">Only {product.stock} in stock for {product.name}.</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4">
            <label className="block text-sm text-slate-700">
              <span className="mb-2 block font-medium">Customer (optional)</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900" />
            </label>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-3">
                {METHODS.map((option) => (
                  <button
                    key={option}
                    onClick={() => setMethod(option)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${method === option ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Sale total</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(total)}</p>
              </div>
            </div>
          </div>

          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button onClick={handleRecord} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Record sale</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Recent sales</h2>
          <div className="mt-4 space-y-3 text-sm">
            {recentSales.map((sale) => (
              <div key={sale.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-800">{sale.description}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{sale.date} · {sale.paymentMethod ?? '—'}</span>
                  <span className="font-semibold text-emerald-700">+{formatCurrency(sale.amount)}</span>
                </div>
              </div>
            ))}
            {recentSales.length === 0 ? <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500">No sales recorded yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
