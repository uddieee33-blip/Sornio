'use client';

import Link from 'next/link';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/business-data';
import { useFinancialSnapshot } from '@/lib/store';

export default function HomePage() {
  const snapshot = useFinancialSnapshot();

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">DukaanOS</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Small Business. Big Business Thinking.</h1>
          <p className="mt-2 text-sm text-slate-500">Every number below recalculates the moment you record activity.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/auth" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Sign in
          </Link>
          <Link href="/business" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">
            Create business
          </Link>
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatCurrency(snapshot.revenue)} tone="emerald" />
        <StatCard label="Gross Profit" value={formatCurrency(snapshot.grossProfit)} tone="blue" />
        <StatCard label="Operating Profit" value={formatCurrency(snapshot.operatingProfit)} tone="violet" />
        <StatCard label="Cash Position" value={formatCurrency(snapshot.cashBalance)} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Owner Cockpit</h2>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Live summary</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Revenue</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(snapshot.revenue)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Gross Margin</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.grossMargin.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Operating Expenses</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(snapshot.operatingExpenses)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Inventory Value</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(snapshot.inventoryValue)}</p>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Get moving</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>• <Link href="/sales" className="font-medium text-slate-900">Record a sale</Link> to grow revenue and cash.</li>
            <li>• <Link href="/expenses" className="font-medium text-slate-900">Log an expense</Link> to keep profit honest.</li>
            <li>• <Link href="/memberships" className="font-medium text-slate-900">Enroll a member</Link> for recurring income.</li>
            <li>• <Link href="/billing" className="font-medium text-slate-900">Raise an invoice</Link> and collect it.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
