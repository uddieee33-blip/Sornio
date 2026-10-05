'use client';

import { ArrowDownRight, ArrowUpRight, Landmark, QrCode, Wallet, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DualAreaChart } from '@/components/charts/RevenueAreaChart';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import { cashInSeries, cashOutSeries } from '@/lib/chart-data';
import { useDukaanStore } from '@/lib/store';

export default function CashFlowPage() {
  const { state } = useDukaanStore();
  const financials = summarizeFinancials(state.transactions);
  const inflows = cashInSeries(state.transactions);
  const outflows = cashOutSeries(state.transactions);

  const accounts = [
    { label: 'Cash in hand', value: financials.cashBalance, icon: Wallet, note: 'Net cash movements recorded' },
    { label: 'Bank', value: financials.bankBalance, icon: Landmark, note: 'Bank transfers received' },
    { label: 'UPI', value: financials.upiBalance, icon: QrCode, note: 'UPI settlements received' },
    { label: 'Card receivables', value: financials.cardReceivables, icon: CreditCard, note: 'Awaiting gateway settlement' },
  ];

  const movements = [...state.transactions]
    .filter((tx) => ['cash', 'bank', 'upi', 'card'].includes(tx.account))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 12);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        eyebrow="Money"
        title="Cash Flow"
        subtitle="Cash in, cash out, and where the money sits — calculated only from recorded movements."
        actions={<Badge tone={financials.netCashFlow >= 0 ? 'emerald' : 'red'} dot>Net {formatCurrency(financials.netCashFlow)}</Badge>}
      />

      {state.transactions.length === 0 ? (
        <EmptyState icon={Wallet} title="No cash movements yet" description="Your business starts at ₹0. Record a sale or an expense and the cash-flow story begins here — nothing is invented before that." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-fade-up">
            {accounts.map((account) => (
              <Card key={account.label}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/20"><account.icon size={18} /></span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{account.label}</p>
                    <p className="font-display text-xl font-bold text-stone-900 tabular-nums">{formatCurrency(account.value)}</p>
                  </div>
                </div>
                <p className="mt-2.5 text-xs text-stone-600">{account.note}</p>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className="animate-fade-up">
              <div className="mb-5 flex items-center justify-between">
                <CardTitle icon={<Landmark size={17} />}>Inflows vs outflows · 14 days</CardTitle>
                <Badge tone="brand" dot>From the ledger</Badge>
              </div>
              <DualAreaChart revenue={inflows} expenses={outflows} height={260} />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                  <ArrowUpRight size={17} className="text-emerald-700" />
                  <div><p className="text-xs text-stone-600">Cash in</p><p className="font-display text-lg font-bold text-emerald-700 tabular-nums">{formatCurrency(financials.cashIn)}</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4">
                  <ArrowDownRight size={17} className="text-red-700" />
                  <div><p className="text-xs text-stone-600">Cash out</p><p className="font-display text-lg font-bold text-red-700 tabular-nums">{formatCurrency(financials.cashOut)}</p></div>
                </div>
              </div>
            </Card>

            <Card className="animate-fade-up">
              <div className="mb-5"><CardTitle icon={<Wallet size={17} />}>Recent movements</CardTitle></div>
              <div className="space-y-2.5">
                {movements.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-700">{tx.description}</p>
                      <p className="text-[11px] text-stone-600">{tx.date} · {tx.account.toUpperCase()} · {tx.paymentMethod ?? '—'}</p>
                    </div>
                    <span className={`shrink-0 font-bold tabular-nums ${tx.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {tx.direction === 'in' ? '+' : '−'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
                {movements.length === 0 ? <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No account movements recorded yet.</p> : null}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
