'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { IndianRupee, Package, Truck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { demoSuppliers, formatCurrency } from '@/lib/business-data';

export default function SuppliersPage() {
  useLocaleRefresh();
  const totalPayable = demoSuppliers.reduce((sum, supplier) => sum + supplier.payable, 0);

  return (
    <div className="p-4 sm:p-6 md:p-8">
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
                <p className="font-semibold text-stone-900">{supplier.name}</p>
                <p className="text-xs text-stone-600">{supplier.orders} order{supplier.orders === 1 ? '' : 's'} placed</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-stone-50 p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600"><Package size={12} /> Orders</p>
                <p className="mt-1 font-display text-xl font-bold text-stone-900 tabular-nums">{supplier.orders}</p>
              </div>
              <div className={`rounded-2xl p-3.5 ${supplier.payable > 0 ? 'bg-amber-500/[0.08]' : 'bg-emerald-500/[0.07]'}`}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600"><IndianRupee size={12} /> Payable</p>
                <p className={`mt-1 font-display text-xl font-bold tabular-nums ${supplier.payable > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatCurrency(supplier.payable)}</p>
              </div>
            </div>
            {supplier.payable > 0 ? (
              <p className="mt-3.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-500/25">
                Outstanding — schedule a payout to keep supply flowing.
              </p>
            ) : (
              <p className="mt-3.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-500/25">
                Fully settled — no dues with this supplier.
              </p>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm text-stone-600">Total payable across all suppliers</p>
        <p className="font-display text-2xl font-bold text-stone-900 tabular-nums">{formatCurrency(totalPayable)}</p>
      </div>
    </div>
  );
}
