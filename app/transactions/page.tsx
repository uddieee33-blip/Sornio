'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Layers, Package, Receipt, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

const filters = ['all', 'sales', 'payments', 'expenses', 'memberships', 'adjustments'] as const;
type FilterId = (typeof filters)[number];

const filterLabels: Record<FilterId, string> = {
  all: 'Everything',
  sales: 'Sales',
  payments: 'Payments',
  expenses: 'Expenses',
  memberships: 'Memberships',
  adjustments: 'Stock',
};

const typeMeta: Record<string, { label: string; tone: BadgeTone }> = {
  sale: { label: 'Sale', tone: 'emerald' },
  payment: { label: 'Payment', tone: 'brand' },
  expense: { label: 'Expense', tone: 'red' },
  membership_revenue: { label: 'Membership', tone: 'violet' },
  membership_payment: { label: 'Membership paid', tone: 'sky' },
  stock_adjustment: { label: 'Stock', tone: 'slate' },
  transfer: { label: 'Transfer', tone: 'amber' },
};

const accountLabels: Record<string, string> = { cash: 'Cash', bank: 'Bank', revenue: 'Revenue', inventory: 'Inventory', accounts_receivable: 'Receivables', accounts_payable: 'Payables' };

export default function TransactionsPage() {
  const { state } = useDukaanStore();
  const [filter, setFilter] = useState<FilterId>('all');
  const [account, setAccount] = useState('all');

  const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const visible = sorted.filter((tx) => {
    if (filter === 'sales' && tx.type !== 'sale') return false;
    if (filter === 'payments' && tx.type !== 'payment') return false;
    if (filter === 'expenses' && tx.type !== 'expense') return false;
    if (filter === 'memberships' && !tx.type.startsWith('membership')) return false;
    if (filter === 'adjustments' && tx.type !== 'stock_adjustment') return false;
    if (account !== 'all' && tx.account !== account) return false;
    return true;
  });

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        subtitle={`${state.transactions.length} entries across ${new Set(state.transactions.map((tx) => tx.account)).size} accounts`}
        actions={<Badge tone="brand" dot>Live ledger</Badge>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 animate-fade-up">
        {filters.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${filter === item ? 'bg-brand-500/15 text-brand-300 ring-brand-400/30' : 'text-zinc-500 ring-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-300'}`}
          >
            {filterLabels[item]}
          </button>
        ))}
        <select
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          className="ml-auto rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 outline-none focus:border-brand-400/60"
        >
          <option value="all">All accounts</option>
          {Object.entries(accountLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <Card className="animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/[0.07] bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Date</th>
                <th className="px-5 py-3.5 font-semibold">Description</th>
                <th className="px-5 py-3.5 font-semibold">Type</th>
                <th className="px-5 py-3.5 font-semibold">Account</th>
                <th className="px-5 py-3.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 60).map((tx) => {
                const meta = typeMeta[tx.type] ?? { label: tx.type, tone: 'slate' as BadgeTone };
                return (
                  <tr key={tx.id} className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-5 py-3.5 text-zinc-500 tabular-nums">{tx.date}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tx.direction === 'in' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {tx.type === 'payment' ? <Wallet size={13} /> : tx.type === 'sale' ? <Receipt size={13} /> : tx.type.startsWith('membership') ? <Layers size={13} /> : tx.type === 'transfer' ? <ArrowLeftRight size={13} /> : <Package size={13} />}
                        </span>
                        <span className="max-w-[280px] truncate font-medium text-zinc-300">{tx.description}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td className="px-5 py-3.5 text-zinc-500">{accountLabels[tx.account] ?? tx.account}</td>
                    <td className={`whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums ${tx.direction === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tx.direction === 'in' ? '+' : '−'}{formatCurrency(tx.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">No transactions match the current filter.</div>
        ) : null}
      </Card>

      <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><ArrowUpRight size={13} className="text-emerald-400" /> money in</span>
        <span className="flex items-center gap-1.5"><ArrowDownRight size={13} className="text-red-400" /> money out</span>
        <span className="ml-auto">Showing {Math.min(visible.length, 60)} of {visible.length}</span>
      </div>
    </div>
  );
}
