'use client';

import { IndianRupee, Package, Truck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { demoSuppliers, formatCurrency } from '@/lib/business-data';

export default function SuppliersPage() {
  const totalPayable = demoSuppliers.reduce((sum, supplier) => sum + supplier.payable, 0);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        eyebrow="People"
        title="Suppliers"
        subtitle="Supplier profiles, products supplied, purchase history, and outstanding payables."
        actions={<Badge tone="brand" dot>{demoSuppliers.length} suppliers</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {demoSuppliers.map((supplier) => (
          <Card key={supplier.name} className="animate-fade-up" hover>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow-sm"><Truck size={20} /></span>
              <div>
                <p className="font-semibold text-white">{supplier.name}</p>
                <p className="text-xs text-zinc-500">{supplier.orders} order{supplier.orders === 1 ? '' : 's'} placed</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Package size={12} /> Orders</p>
                <p className="mt-1 font-display text-xl font-bold text-white tabular-nums">{supplier.orders}</p>
              </div>
              <div className={`rounded-2xl p-3.5 ${supplier.payable > 0 ? 'bg-amber-500/[0.08]' : 'bg-emerald-500/[0.07]'}`}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><IndianRupee size={12} /> Payable</p>
                <p className={`mt-1 font-display text-xl font-bold tabular-nums ${supplier.payable > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatCurrency(supplier.payable)}</p>
              </div>
            </div>
            {supplier.payable > 0 ? (
              <p className="mt-3.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/25">
                Outstanding — schedule a payout to keep supply flowing.
              </p>
            ) : (
              <p className="mt-3.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                Fully settled — no dues with this supplier.
              </p>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
        <p className="text-sm text-zinc-400">Total payable across all suppliers</p>
        <p className="font-display text-2xl font-bold text-white tabular-nums">{formatCurrency(totalPayable)}</p>
      </div>
    </div>
  );
}
