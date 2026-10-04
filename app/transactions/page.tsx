'use client';

import { ArrowLeftRight, ArrowUpCircle, Banknote, Coins, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

export default function TransactionsPage() {
  const { state } = useDukaanStore();
  const snapshot = useFinancialSnapshot();
  const ledger = [...state.transactions].reverse();

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader eyebrow="Operations" title="Transactions" subtitle="Every recorded sale, payment, expense, stock movement, refund, and transfer is traceable." />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" value={formatCurrency(snapshot.revenue)} icon={ArrowUpCircle} tone="emerald" />
          <StatCard label="COGS" value={formatCurrency(snapshot.cogs)} icon={Coins} tone="amber" />
          <StatCard label="Cash In" value={formatCurrency(snapshot.cashIn)} icon={Banknote} tone="brand" />
          <StatCard label="Net Cash Flow" value={formatCurrency(snapshot.netCashFlow)} icon={Wallet} tone="violet" />
        </div>

        <Card className="mt-6 animate-fade-up" padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><ArrowLeftRight size={17} className="text-brand-600" /> Ledger</h2>
            <Badge tone="brand" dot>{ledger.length} entries</Badge>
          </div>
          <div className="max-h-[600px] overflow-auto">
            <table className="min-w-full text-left text-sm text-slate-700">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Description</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 transition hover:bg-slate-50/60">
                    <td className="px-5 py-3"><Badge tone={item.direction === 'in' ? 'emerald' : 'red'}>{item.type}</Badge></td>
                    <td className="px-5 py-3">{item.description}</td>
                    <td className={`px-5 py-3 font-semibold tabular-nums ${item.direction === 'in' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {item.direction === 'in' ? '+' : '-'} {formatCurrency(item.amount)}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{item.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
