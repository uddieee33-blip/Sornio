'use client';

import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { demoSuppliers, formatCurrency } from '@/lib/business-data';

export default function SuppliersPage() {
  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
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
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient text-white"><Truck size={20} /></span>
                <div>
                  <p className="font-semibold text-slate-900">{supplier.name}</p>
                  <p className="text-xs text-slate-500">{supplier.orders} order{supplier.orders === 1 ? '' : 's'} placed</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3.5 text-sm">
                <span className="text-slate-600">Payable</span>
                <strong className={`tabular-nums ${supplier.payable > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatCurrency(supplier.payable)}</strong>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
