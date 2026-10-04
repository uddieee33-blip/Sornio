'use client';

import Link from 'next/link';
import { Boxes, Package } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

export default function InventoryPage() {
  const { state } = useDukaanStore();
  const products = state.products.filter((product) => product.itemType === 'product');
  const stockValue = products.reduce((sum, product) => sum + product.stock * product.cost, 0);
  const lowStockCount = products.filter((product) => product.status === 'Active' && product.stock <= product.reorderLevel).length;

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader
          eyebrow="Operations"
          title="Inventory"
          subtitle="Stock levels update automatically when sales are recorded."
          actions={
            <>
              <Badge tone="brand">Value {formatCurrency(stockValue)}</Badge>
              {lowStockCount > 0 ? <Badge tone="amber" dot>{lowStockCount} low</Badge> : null}
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => {
            const low = product.status === 'Active' && product.stock <= product.reorderLevel;
            return (
              <div key={product.id} className={`animate-fade-up relative overflow-hidden rounded-2xl border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover ${low ? 'border-amber-300' : 'border-slate-200/80'}`}>
                {low ? <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 to-orange-400" /> : <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient opacity-60" />}
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Package size={17} /></span>
                  {low ? <Badge tone="amber" dot>Reorder</Badge> : <Badge tone="emerald" dot>In stock</Badge>}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-500">{product.name}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{product.stock}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>Reorder at {product.reorderLevel} · cost {formatCurrency(product.cost)}</p>
                  <p>On-hand value <span className="font-semibold text-slate-700 tabular-nums">{formatCurrency(product.stock * product.cost)}</span></p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/50 p-4 text-sm text-slate-600">
          <Boxes size={18} className="shrink-0 text-brand-600" />
          <p>Stock moves when you <Link href="/sales" className="font-semibold text-brand-600 hover:underline">record sales</Link> and new items appear from <Link href="/products" className="font-semibold text-brand-600 hover:underline">the catalog</Link>.</p>
        </div>
      </div>
    </div>
  );
}
