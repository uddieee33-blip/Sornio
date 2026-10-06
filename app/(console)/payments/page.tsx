'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, ChartPie, CreditCard, FilePlus2, HandCoins, Landmark, PieChart, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/stat-card';
import { DonutChart } from '@/components/charts/DonutChart';
import { CollectPaymentPanel } from '@/components/payments/collect-payment';
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

  const unpaidInvoices = state.invoices.filter((invoice) => invoice.paymentStatus !== 'paid');
  const [collectId, setCollectId] = useState<string | undefined>(undefined);
  const collectInvoice = unpaidInvoices.find((invoice) => invoice.id === collectId) ?? unpaidInvoices[0];

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader eyebrow="Billing" title="Payment methods" subtitle="How money actually moves in and out — recorded per transaction." />

      {/* Front-desk collection: pick who pays, pick how, follow the panel. */}
      <Card className="animate-fade-up mb-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <CardTitle icon={<HandCoins size={17} />}>Desk collection</CardTitle>
          <Badge tone={unpaidInvoices.length > 0 ? 'amber' : 'emerald'} dot>
            {unpaidInvoices.length > 0 ? `${unpaidInvoices.length} awaiting payment` : 'Nothing due'}
          </Badge>
        </div>

        {unpaidInvoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
            <Banknote size={26} className="mx-auto text-stone-500" />
            <p className="mt-3 text-sm font-semibold text-stone-800">Every invoice is settled</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-stone-600">
              When a customer has to pay, raise their bill first — then come back here, pick the bill, pick the method, and the desk panel does the rest.
            </p>
            <Link
              href="/billing"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 active:scale-[0.98]"
            >
              <FilePlus2 size={15} /> Raise an invoice <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.6fr]">
            {/* Who is paying */}
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">Who is paying?</p>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {unpaidInvoices.map((invoice) => {
                  const isActive = collectInvoice?.id === invoice.id;
                  return (
                    <button
                      key={invoice.id}
                      onClick={() => setCollectId(invoice.id)}
                      className={`w-full rounded-2xl border p-3.5 text-left transition-all duration-200 active:scale-[0.98] ${
                        isActive
                          ? 'border-brand-500/50 bg-brand-500/[0.08] shadow-glow-sm'
                          : 'border-stone-200 bg-stone-50 hover:border-brand-400/30 hover:bg-stone-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-stone-900">{invoice.customerName}</p>
                        <p className="shrink-0 text-sm font-bold text-stone-900 tabular-nums">{formatCurrency(invoice.totalAmount)}</p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-stone-600">
                        <span>{invoice.id}</span>
                        <Badge tone={invoice.paymentStatus === 'partial' ? 'sky' : 'amber'} dot>{invoice.paymentStatus}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* How the money arrives */}
            <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 md:p-5">
              {collectInvoice ? (
                <CollectPaymentPanel
                  key={collectInvoice.id}
                  invoice={collectInvoice}
                  onDone={() => setCollectId(undefined)}
                />
              ) : null}
            </div>
          </div>
        )}
      </Card>

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
            <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">No payments recorded yet.</p>
          )}
          <p className="mt-4 rounded-2xl border border-brand-500/20 bg-brand-500/[0.08] p-3.5 text-sm text-brand-700">
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
                  className={`rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${isActive ? 'border-brand-400/40 bg-brand-500/[0.08] shadow-glow-sm' : 'border-stone-200 bg-stone-50 hover:-translate-y-0.5 hover:border-brand-400/25 hover:bg-stone-100 hover:shadow-card-hover'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${isActive ? 'bg-brand-500/20 text-brand-600' : 'bg-stone-100 text-stone-600'}`}><Icon size={16} /></span>
                    <span className="font-semibold text-stone-900">{item.label}</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-stone-600">{item.note}</p>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
