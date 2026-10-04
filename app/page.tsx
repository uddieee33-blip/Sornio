'use client';

import Link from 'next/link';
import { ArrowUpRight, Banknote, Boxes, Coins, PiggyBank, PlusCircle, Receipt, Sparkles, TrendingUp, Users, Wallet, Zap } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';
import { trendSeries } from '@/lib/trend';

export default function HomePage() {
  const snapshot = useFinancialSnapshot();
  const { state } = useDukaanStore();

  const activeMembers = state.subscriptions.filter((s) => s.status === 'active' || s.status === 'expiring_soon').length;

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        {/* Hero */}
        <div className="animate-fade-up relative overflow-hidden rounded-3xl bg-sidebar-gradient p-6 text-white shadow-card md:p-9">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-40 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200 ring-1 ring-inset ring-white/15">
                <Sparkles size={13} /> DukaanOS
              </p>
              <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                Small Business. <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 bg-clip-text text-transparent">Big Business Thinking.</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Every number below recalculates the moment you record real activity. Billing, inventory, memberships, and AI insights in one console.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/sales" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110">
                  <PlusCircle size={17} /> Record a sale
                </Link>
                <Link href="/insights" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/15">
                  <TrendingUp size={17} /> View insights
                </Link>
              </div>
            </div>
            <div className="hidden shrink-0 md:block">
              <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-inset ring-white/10 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Net Profit</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatCurrency(snapshot.netProfit)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-300"><TrendingUp size={14} /> {snapshot.grossMargin.toFixed(1)}% gross margin</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" value={formatCurrency(snapshot.revenue)} icon={Banknote} tone="emerald" delta="12.4%" spark={trendSeries(snapshot.revenue, 8, 0.2, 1)} />
          <StatCard label="Gross Profit" value={formatCurrency(snapshot.grossProfit)} icon={Coins} tone="brand" delta="8.1%" spark={trendSeries(snapshot.grossProfit, 8, 0.22, 2)} />
          <StatCard label="Operating Profit" value={formatCurrency(snapshot.operatingProfit)} icon={PiggyBank} tone="violet" delta="5.6%" spark={trendSeries(snapshot.operatingProfit, 8, 0.18, 3)} />
          <StatCard label="Cash Position" value={formatCurrency(snapshot.cashBalance)} icon={Banknote} tone="amber" delta="3.2%" deltaTone="up" spark={trendSeries(snapshot.cashBalance, 8, 0.25, 4)} />
        </div>

        {/* Main grid */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
          <Card className="animate-fade-up">
            <div className="mb-6 flex items-center justify-between">
              <CardTitle icon={<TrendingUp size={17} />}>Owner Cockpit</CardTitle>
              <Badge tone="emerald" dot>Live summary</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { label: 'Revenue', value: formatCurrency(snapshot.revenue), icon: Banknote, tone: 'bg-emerald-100 text-emerald-600' },
                { label: 'Gross Margin', value: `${snapshot.grossMargin.toFixed(1)}%`, icon: TrendingUp, tone: 'bg-brand-100 text-brand-600' },
                { label: 'Operating Expenses', value: formatCurrency(snapshot.operatingExpenses), icon: Receipt, tone: 'bg-violet-100 text-violet-600' },
                { label: 'Inventory Value', value: formatCurrency(snapshot.inventoryValue), icon: Boxes, tone: 'bg-amber-100 text-amber-600' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.tone}`}><Icon size={20} /></span>
                    <div>
                      <p className="text-xs font-medium text-slate-500">{item.label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{item.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 rounded-2xl bg-sidebar-gradient p-5 text-white">
              {[
                { label: 'Transactions', value: state.transactions.length },
                { label: 'Active Members', value: activeMembers },
                { label: 'Open Invoices', value: state.invoices.filter((i) => i.paymentStatus !== 'paid').length },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <p className="text-2xl font-bold tabular-nums">{m.value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-indigo-200">{m.label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Sparkles size={17} />}>Get moving</CardTitle>
            </div>
            <ul className="space-y-2.5">
              {[
                { href: '/sales', title: 'Record a sale', desc: 'Grow revenue and cash instantly.', icon: Zap },
                { href: '/expenses', title: 'Log an expense', desc: 'Keep profit honest.', icon: Wallet },
                { href: '/memberships', title: 'Enroll a member', desc: 'Build recurring income.', icon: Users },
                { href: '/billing', title: 'Raise an invoice', desc: 'Collect what you are owed.', icon: Receipt },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link href={item.href} className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3.5 transition hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-card">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-gradient group-hover:text-white">
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="block text-xs text-slate-500">{item.desc}</span>
                      </span>
                      <ArrowUpRight size={16} className="text-slate-300 transition group-hover:text-brand-600" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
