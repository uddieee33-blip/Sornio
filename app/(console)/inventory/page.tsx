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
    <div className="p-6 md:p-8">
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
          const pct = Math.min(100, (product.stock / Math.max(product.reorderLevel * 3, 1)) * 100);
          return (
            <div key={product.id} className={`animate-fade-up relative overflow-hidden rounded-2xl border bg-white/[0.03] p-5 ring-1 ring-white/[0.07] transition hover:-translate-y-0.5 hover:bg-white/[0.05] hover:shadow-card-hover ${low ? 'border-amber-500/40' : 'border-transparent'}`}>
              {low ? <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" /> : <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient opacity-70" />}
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-400"><Package size={17} /></span>
                {low ? <Badge tone="amber" dot>Reorder</Badge> : <Badge tone="emerald" dot>In stock</Badge>}
              </div>
              <p className="mt-3 truncate text-sm font-medium text-zinc-400">{product.name}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-white">{product.stock}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full transition-all duration-700 ${low ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-brand-gradient'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 space-y-1 text-xs text-zinc-500">
                <p>Reorder at {product.reorderLevel} · cost {formatCurrency(product.cost)}</p>
                <p>On-hand value <span className="font-semibold text-zinc-300 tabular-nums">{formatCurrency(product.stock * product.cost)}</span></p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4 text-sm text-zinc-400">
        <Boxes size={18} className="shrink-0 text-brand-300" />
        <p>Stock moves when you <Link href="/sales" className="font-semibold text-brand-300 hover:underline">record sales</Link> and new items appear from <Link href="/products" className="font-semibold text-brand-300 hover:underline">the catalog</Link>.</p>
      </div>
    </div>
  );
}
