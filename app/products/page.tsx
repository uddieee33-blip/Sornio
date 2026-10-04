'use client';

import { useState } from 'react';
import { Package, PackagePlus, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function ProductsPage() {
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState({
    name: '', itemType: 'product', category: 'General', sellingPrice: '0', cost: '0', stock: '0', reorderLevel: '0', supplier: '',
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

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader
          eyebrow="Catalog"
          title="Products & Services"
          subtitle="Add items and make them available across sales, inventory, profitability, and reports."
          actions={<Badge tone="brand" dot>{state.products.length} items</Badge>}
        />

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="animate-fade-up h-fit">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<PackagePlus size={17} />}>Add Item</CardTitle>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><span className={labelClass}>Item Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Handmade Soap" /></div>
              <div><span className={labelClass}>Item Type</span>
                <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} className={inputClass}>
                  <option value="product">Product</option><option value="service">Service</option>
                </select>
              </div>
              <div><span className={labelClass}>Category</span><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} /></div>
              <div><span className={labelClass}>Supplier</span><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={inputClass} placeholder="Optional" /></div>
              <div><span className={labelClass}>Selling Price</span><input type="number" min={0} value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} className={inputClass} /></div>
              <div><span className={labelClass}>Cost Price</span><input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={inputClass} /></div>
              {form.itemType === 'product' ? (
                <>
                  <div><span className={labelClass}>Opening Stock</span><input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className={inputClass} /></div>
                  <div><span className={labelClass}>Reorder Level</span><input type="number" min={0} value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} className={inputClass} /></div>
                </>
              ) : null}
            </div>

            {message ? (
              <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
            ) : null}

            <div className="mt-5 flex justify-end">
              <Button onClick={handleSubmit}><Plus size={16} /> Save item</Button>
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Package size={17} />}>Product list</CardTitle>
            </div>
            <div className="space-y-3">
              {state.products.map((product) => {
                const margin = product.sellingPrice > 0 ? ((product.sellingPrice - product.cost) / product.sellingPrice) * 100 : 0;
                const lowStock = product.itemType === 'product' && product.stock <= product.reorderLevel;
                return (
                  <div key={product.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{product.name}</p>
                      <p className="truncate text-xs text-slate-500">{product.category}{product.supplier ? ` · ${product.supplier}` : ''}</p>
                      {lowStock ? <p className="mt-1 text-xs font-semibold text-amber-600">Low stock — reorder</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right text-sm">
                        <p className="font-bold tabular-nums text-slate-900">{formatCurrency(product.sellingPrice)}</p>
                        <p className="text-xs text-slate-500">Margin {margin.toFixed(0)}%</p>
                        <p className="text-xs text-slate-500">{product.itemType === 'service' ? 'Service' : `Stock ${product.stock}`}</p>
                      </div>
                      <button
                        onClick={() => actions.toggleProductStatus(product.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${product.status === 'Active' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {product.status}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
