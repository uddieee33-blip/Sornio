'use client';

import { useState } from 'react';
import { Banknote, ChartPie, PieChart, CreditCard, Landmark, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/stat-card';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatCurrency } from '@/lib/business-data';
import { paymentsByMethod } from '@/lib/chart-data';
import { useDukaanStore } from '@/lib/store';

const MODES: Array<{ id: string; label: string; note: string; icon: typeof Banknote }> = [
  { id: 'cash', label: 'Cash', note: 'Zero fees. Count the drawer at the end of every shift and sweep excess cash to the bank.', icon: Banknote },
  { id: 'upi', label: 'UPI', note: 'QR or phone number. Money lands in your bank in minutes with no gateway fee for typical dues.', icon: Smartphone },
  { id: 'card', label: 'Card', note: 'Swipe or tap on a PoS machine. Expect ~1–2% MDR and a 1–2 day settlement window.', icon: CreditCard },
  { id: 'bank', label: 'Bank transfer', note: 'NEFT/IMPS/UPI transfer from the customer. Best for large B2B invoices — keep a payment link ready.', icon: Landmark },
];

export default function PaymentsPage() {
  const { state } = useDukaanStore();
  const [mode, setMode] = useState('upi');

  const received = state.paymentRecords.filter((record) => record.status === 'paid' || record.status === 'partial').reduce((sum, record) => sum + record.amount, 0);
  const pendingAmount = state.paymentRecords.filter((record) => record.status === 'pending').reduce((sum, record) => sum + record.amount, 0);
  const upiShare = received > 0 ? Math.round((state.paymentRecords.filter((record) => record.paymentMethod === 'UPI' && (record.status === 'paid' || record.status === 'partial')).reduce((sum, record) => sum + record.amount, 0) / received) * 100) : 0;

  const byMethod = paymentsByMethod(state.transactions);

  return (
    <div className="p-6 md:p-8">
      <PageHeader eyebrow="Billing" title="Payment methods" subtitle="How money actually moves in and out — recorded per transaction." />

      <div className="grid gap-4 sm:grid-cols-3 animate-fade-up">
        <StatCard label="Received" value={formatCurrency(received)} icon={Banknote} tone="brand" />
        <StatCard label="Pending (card/online)" value={formatCurrency(pendingAmount)} icon={CreditCard} tone="amber" />
        <StatCard label="UPI share of receipts" value={`${upiShare}%`} icon={Smartphone} tone="emerald" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="animate-fade-up">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<ChartPie size={17} />}>Collection mix</CardTitle>
            <Badge tone="brand" dot>By payment method</Badge>
          </div>
          {byMethod.length > 0 ? (
            <DonutChart data={byMethod} centerLabel="Received" centerValue={formatCurrency(received)} height={220} />
          ) : (
            <p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-zinc-500">No payments recorded yet.</p>
          )}
          <p className="mt-4 rounded-2xl border border-brand-500/20 bg-brand-500/[0.08] p-3.5 text-sm text-brand-200">
            Every sale, membership, and invoice payment is recorded with its method — the chart above is computed from the live ledger.
          </p>
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-5"><CardTitle icon={<PieChart size={17} />}>How your shop collects money</CardTitle></div>
          <div className="grid gap-3 md:grid-cols-2">
            {MODES.map((item) => {
              const Icon = item.icon;
              const isActive = mode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={`rounded-2xl border p-4 text-left transition ${isActive ? 'border-brand-400/40 bg-brand-500/[0.08] shadow-glow-sm' : 'border-white/[0.07] bg-white/[0.03] hover:border-brand-400/25 hover:bg-white/[0.05]'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isActive ? 'bg-brand-500/20 text-brand-300' : 'bg-white/[0.06] text-zinc-400'}`}><Icon size={16} /></span>
                    <span className="font-semibold text-white">{item.label}</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-zinc-500">{item.note}</p>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
