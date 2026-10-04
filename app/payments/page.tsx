'use client';

import { CreditCard, Landmark, Smartphone, Wallet, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/business-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

const METHOD_META: { key: PaymentMethod; icon: LucideIcon; tone: string }[] = [
  { key: 'Cash', icon: Wallet, tone: 'bg-emerald-100 text-emerald-600' },
  { key: 'UPI', icon: Smartphone, tone: 'bg-brand-100 text-brand-600' },
  { key: 'Card', icon: CreditCard, tone: 'bg-violet-100 text-violet-600' },
  { key: 'Bank Transfer', icon: Landmark, tone: 'bg-sky-100 text-sky-600' },
  { key: 'Other', icon: CreditCard, tone: 'bg-slate-100 text-slate-500' },
];

export default function PaymentsPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();

  const inflowByMethod = state.transactions
    .filter((tx) => tx.type === 'payment' && tx.direction === 'in')
    .reduce<Record<string, number>>((acc, tx) => {
      const method = tx.paymentMethod ?? 'Other';
      acc[method] = (acc[method] ?? 0) + tx.amount;
      return acc;
    }, {});

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader eyebrow="Operations" title="Payments" subtitle="Collections captured across cash, UPI, card, bank transfer, and other methods — no sensitive credentials stored." />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {METHOD_META.map(({ key, icon: Icon, tone }) => (
            <div key={key} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></span>
              <p className="mt-3 text-xs font-medium text-slate-500">{key}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatCurrency(inflowByMethod[key] ?? 0)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="animate-fade-up h-fit">
            <div className="mb-5"><CardTitle icon={<Wallet size={17} />}>Payment summary</CardTitle></div>
            <div className="space-y-3 text-sm text-slate-600">
              {[
                { label: 'Cash in', value: snapshot.cashIn },
                { label: 'Cash out', value: snapshot.cashOut },
                { label: 'Net cash flow', value: snapshot.netCashFlow },
                { label: 'Bank balance', value: snapshot.bankBalance },
                { label: 'UPI balance', value: snapshot.upiBalance },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <span className="font-medium">{row.label}</span>
                  <strong className="tabular-nums text-slate-900">{formatCurrency(row.value)}</strong>
                </div>
              ))}
            </div>
          </Card>

          <Card className="animate-fade-up h-fit">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<CreditCard size={17} />}>Gateway records</CardTitle>
              <Badge tone="brand" dot>{state.paymentRecords.length}</Badge>
            </div>
            <div className="space-y-3">
              {[...state.paymentRecords].reverse().slice(0, 8).map((record) => (
                <div key={record.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{record.customerName}</p>
                    <p className="text-xs text-slate-500">{record.paymentMethod} · {record.gateway} · {new Date(record.paymentDate).toLocaleDateString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(record.amount)}</p>
                    <p className={`text-xs capitalize font-medium ${record.status === 'paid' ? 'text-emerald-700' : record.status === 'failed' ? 'text-red-600' : 'text-amber-700'}`}>{record.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
