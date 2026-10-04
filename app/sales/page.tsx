'use client';

import { useMemo, useState } from 'react';
import { Plus, ShoppingCart, Trash2, Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, type SaleLine } from '@/lib/store';
import type { PaymentMethod } from '@/lib/models/billing';

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];
const inputClass = 'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

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

  const removeLine = (index: number) => setLines((current) => current.filter((_, i) => i !== index));

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
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader eyebrow="Operations" title="Sales" subtitle="Record multi-line sales. Revenue, cash, and inventory update everywhere automatically." />

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="animate-fade-up h-fit">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<ShoppingCart size={17} />}>Record a sale</CardTitle>
              <Button variant="secondary" onClick={addLine}><Plus size={15} /> Add line</Button>
            </div>

            <div className="space-y-4">
              {lines.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
                  <ShoppingCart size={28} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">No lines yet — add one to start a sale.</p>
                </div>
              ) : null}
              {lines.map((line, index) => {
                const product = state.products.find((item) => item.id === line.productId);
                return (
                  <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3.5">
                    <div className="grid gap-3 md:grid-cols-[1.5fr_0.5fr_0.8fr_auto]">
                      <select value={line.productId} onChange={(e) => handleProductChange(index, e.target.value)} className={inputClass}>
                        {sellableProducts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}{item.itemType === 'product' ? ` (${item.stock} in stock)` : ''}
                          </option>
                        ))}
                      </select>
                      <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value || 0) })} className={inputClass} />
                      <input type="number" min={0} value={line.rate} onChange={(e) => updateLine(index, { rate: Number(e.target.value || 0) })} className={inputClass} />
                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <span className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(line.quantity * line.rate)}</span>
                        <button onClick={() => removeLine(index)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    {product && product.itemType === 'product' && line.quantity > product.stock ? (
                      <p className="mt-2 text-xs font-semibold text-red-600">Only {product.stock} in stock for {product.name}.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 space-y-4 rounded-2xl bg-slate-50 p-4">
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Customer (optional)</span>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" className={`${inputClass} w-full`} />
              </div>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {METHODS.map((option) => (
                    <button key={option} onClick={() => setMethod(option)} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${method === option ? 'bg-brand-gradient text-white shadow-glow' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:ring-brand-300'}`}>
                      {option}
                    </button>
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500">Sale total</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">{formatCurrency(total)}</p>
                </div>
              </div>
            </div>

            {message ? (
              <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
            ) : null}

            <div className="mt-5 flex justify-end">
              <Button onClick={handleRecord}><Zap size={16} /> Record sale</Button>
            </div>
          </Card>

          <Card className="animate-fade-up h-fit">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Zap size={17} />}>Recent sales</CardTitle>
              <Badge tone="emerald" dot>{recentSales.length}</Badge>
            </div>
            <div className="space-y-3">
              {recentSales.map((sale) => (
                <div key={sale.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:border-emerald-200 hover:bg-white hover:shadow-card">
                  <p className="text-sm font-semibold text-slate-800">{sale.description}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span>{sale.date} · {sale.paymentMethod ?? '—'}</span>
                    <span className="font-bold tabular-nums text-emerald-700">+{formatCurrency(sale.amount)}</span>
                  </div>
                </div>
              ))}
              {recentSales.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No sales recorded yet.</p> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
