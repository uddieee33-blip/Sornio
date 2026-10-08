'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { useState } from 'react';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Layers, Package, Receipt, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';

/**
 * Filter tabs are built from the console this business runs: a plans tab only
 * exists where plans exist, and a stock tab only where stock does.
 */
const BASE_FILTERS = ['all', 'sales', 'payments', 'expenses'] as const;
type FilterId = (typeof BASE_FILTERS)[number] | 'memberships' | 'adjustments';

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
  membership_revenue: { label: 'Plan', tone: 'violet' },
  membership_payment: { label: 'Plan paid', tone: 'sky' },
  stock_adjustment: { label: 'Stock', tone: 'slate' },
  transfer: { label: 'Transfer', tone: 'amber' },
};

const accountLabels: Record<string, string> = { cash: 'Cash', bank: 'Bank', revenue: 'Revenue', inventory: 'Inventory', accounts_receivable: 'Receivables', accounts_payable: 'Payables' };

export default function TransactionsPage() {
  useLocaleRefresh();
  const { state } = useDukaanStore();
  const { allows } = usePortal();
  const [filter, setFilter] = useState<FilterId>('all');
  const [account, setAccount] = useState('all');

  // Only offer the tabs this console has records for.
  const filters: FilterId[] = [
    ...BASE_FILTERS,
    ...(allows('/memberships') ? (['memberships'] as const) : []),
    ...(allows('/inventory') ? (['adjustments'] as const) : []),
  ];

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
    <div className="p-4 sm:p-6 md:p-8">
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
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${filter === item ? 'bg-brand-500/15 text-brand-600 ring-brand-400/30' : 'text-stone-600 ring-stone-200 hover:bg-stone-50 hover:text-stone-700'}`}
          >
            {filterLabels[item]}
          </button>
        ))}
        <select
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          className="ml-auto rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 outline-hidden focus:border-portal/50"
        >
          <option value="all">All accounts</option>
          {Object.entries(accountLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <Card className="animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600">
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
                  <tr key={tx.id} className="border-b border-stone-100 transition hover:bg-stone-50">
                    <td className="whitespace-nowrap px-5 py-3.5 text-stone-600 tabular-nums">{tx.date}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tx.direction === 'in' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>
                          {tx.type === 'payment' ? <Wallet size={13} /> : tx.type === 'sale' ? <Receipt size={13} /> : tx.type.startsWith('membership') ? <Layers size={13} /> : tx.type === 'transfer' ? <ArrowLeftRight size={13} /> : <Package size={13} />}
                        </span>
                        <span className="max-w-[280px] truncate font-medium text-stone-700">{tx.description}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td className="px-5 py-3.5 text-stone-600">{accountLabels[tx.account] ?? tx.account}</td>
                    <td className={`whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums ${tx.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {tx.direction === 'in' ? '+' : '−'}{formatCurrency(tx.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-600">No transactions match the current filter.</div>
        ) : null}
      </Card>

      <div className="mt-4 flex items-center gap-4 text-xs text-stone-600">
        <span className="flex items-center gap-1.5"><ArrowUpRight size={13} className="text-emerald-700" /> money in</span>
        <span className="flex items-center gap-1.5"><ArrowDownRight size={13} className="text-red-700" /> money out</span>
        <span className="ml-auto">Showing {Math.min(visible.length, 60)} of {visible.length}</span>
      </div>
    </div>
  );
}
