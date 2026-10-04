'use client';

import { Bell, PackageX, ReceiptText, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getAlerts } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

export default function AlertsPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();
  const alerts = getAlerts(snapshot, state.products);

  const lowStock = state.products.filter((product) => product.status === 'Active' && product.itemType === 'product' && product.stock <= product.reorderLevel);
  const pendingInvoices = state.invoices.filter((invoice) => invoice.paymentStatus !== 'paid');

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader eyebrow="Overview" title="Alerts" subtitle="Only meaningful business alerts are shown when the condition actually exists." />

        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.type} className={`flex items-start gap-3 rounded-2xl border p-4 text-sm shadow-card ${
              alert.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' :
              alert.tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' :
              'border-sky-200 bg-sky-50 text-sky-800'
            }`}>
              <Bell size={17} className="mt-0.5 shrink-0" />
              {alert.message}
            </div>
          ))}
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-card">
              Nothing needs attention right now.
            </div>
          ) : null}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Card className="animate-fade-up h-fit">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle icon={<PackageX size={17} />}>Low stock items</CardTitle>
              {lowStock.length > 0 ? <Badge tone="amber" dot>{lowStock.length}</Badge> : null}
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              {lowStock.map((product) => (
                <div key={product.id} className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
                  <span className="font-medium">{product.name}</span>
                  <strong className="tabular-nums text-amber-700">{product.stock} left</strong>
                </div>
              ))}
              {lowStock.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-slate-500">All items above reorder level.</p> : null}
            </div>
          </Card>

          <Card className="animate-fade-up h-fit">
            <div className="mb-4"><CardTitle icon={<Users size={17} />}>Customer balances</CardTitle></div>
            <div className="space-y-3 text-sm text-slate-600">
              {state.customers.map((customer) => (
                <div key={customer.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <span className="font-medium">{customer.name}</span>
                  <strong className="tabular-nums text-slate-900">{formatCurrency(customer.openingBalance)}</strong>
                </div>
              ))}
            </div>
          </Card>

          <Card className="animate-fade-up h-fit">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle icon={<ReceiptText size={17} />}>Pending invoices</CardTitle>
              {pendingInvoices.length > 0 ? <Badge tone="amber" dot>{pendingInvoices.length}</Badge> : null}
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              {pendingInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <span className="font-medium">{invoice.id} · {invoice.customerName}</span>
                  <strong className="tabular-nums text-amber-700">{formatCurrency(invoice.totalAmount)}</strong>
                </div>
              ))}
              {pendingInvoices.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-slate-500">All invoices collected.</p> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
