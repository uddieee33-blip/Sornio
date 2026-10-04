'use client';

import Link from 'next/link';
import { ArrowUpRight, Banknote, Coins, PiggyBank, PlusCircle, Receipt, Sparkles, TrendingUp, Users, Wallet, Zap } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatCurrency } from '@/lib/business-data';
import { paymentsByMethod, revenueSeries } from '@/lib/chart-data';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';
import { trendSeries } from '@/lib/trend';

export default function HomePage() {
  const snapshot = useFinancialSnapshot();
  const { state } = useDukaanStore();

  const activeMembers = state.subscriptions.filter((s) => s.status === 'active' || s.status === 'expiring_soon').length;
  const revenue = revenueSeries(state.transactions);
  const methods = paymentsByMethod(state.transactions);

  return (
    <div className="relative p-6 md:p-8">
      {/* Hero */}
      <div className="animate-fade-up relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#10131c] p-6 shadow-card md:p-9">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-48 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300 ring-1 ring-inset ring-brand-500/25">
              <Sparkles size={13} /> DukaanOS
            </p>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-white md:text-[2.6rem]">
              Small Business.{' '}
              <span className="bg-brand-gradient bg-clip-text text-transparent">Big Business Thinking.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Every number recalculates the moment you record real activity. Billing, inventory, memberships, and AI insights — one glowing console.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/sales" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110">
                <PlusCircle size={17} /> Record a sale
              </Link>
              <Link href="/insights" className="inline-flex items-center gap-2 rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 transition hover:bg-white/10">
                <TrendingUp size={17} /> View insights
              </Link>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3 lg:w-[380px]">
            {[
              { label: 'Net Profit', value: formatCurrency(snapshot.netProfit), accent: true },
              { label: 'Gross Margin', value: `${snapshot.grossMargin.toFixed(1)}%` },
              { label: 'Transactions', value: state.transactions.length },
              { label: 'Active Members', value: activeMembers },
            ].map((tile) => (
              <div key={tile.label} className={`rounded-2xl p-4 ring-1 ring-inset ${tile.accent ? 'bg-brand-500/10 ring-brand-500/30' : 'bg-white/[0.03] ring-white/[0.07]'}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{tile.label}</p>
                <p className={`mt-1.5 font-display text-xl font-bold tabular-nums ${tile.accent ? 'text-brand-200' : 'text-white'}`}>{tile.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatCurrency(snapshot.revenue)} icon={Banknote} tone="emerald" delta="12.4%" spark={trendSeries(snapshot.revenue, 8, 0.2, 1)} />
        <StatCard label="Gross Profit" value={formatCurrency(snapshot.grossProfit)} icon={Coins} tone="brand" delta="8.1%" spark={trendSeries(snapshot.grossProfit, 8, 0.22, 2)} />
        <StatCard label="Operating Profit" value={formatCurrency(snapshot.operatingProfit)} icon={PiggyBank} tone="violet" delta="5.6%" spark={trendSeries(snapshot.operatingProfit, 8, 0.18, 3)} />
        <StatCard label="Cash Position" value={formatCurrency(snapshot.cashBalance)} icon={Wallet} tone="amber" delta="3.2%" spark={trendSeries(snapshot.cashBalance, 8, 0.25, 4)} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<TrendingUp size={17} />}>Revenue — last 14 days</CardTitle>
            <Badge tone="emerald" dot>Live from ledger</Badge>
          </div>
          <RevenueAreaChart data={revenue} gradientId="homeRevenue" height={260} />
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<Banknote size={17} />}>Collections by method</CardTitle>
          </div>
          <DonutChart data={methods} centerLabel="Collected" centerValue={formatCurrency(methods.reduce((sum, slice) => sum + slice.value, 0))} />
        </Card>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { href: '/sales', title: 'Record a sale', desc: 'Grow revenue and cash instantly.', icon: Zap },
          { href: '/expenses', title: 'Log an expense', desc: 'Keep profit honest.', icon: Wallet },
          { href: '/memberships', title: 'Enroll a member', desc: 'Build recurring income.', icon: Users },
          { href: '/billing', title: 'Raise an invoice', desc: 'Collect what you are owed.', icon: Receipt },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group animate-fade-up flex items-center gap-4 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.07] shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.05] hover:ring-brand-400/30 hover:shadow-card-hover">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/20 transition group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-glow-sm">
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{item.title}</span>
                <span className="block truncate text-xs text-zinc-500">{item.desc}</span>
              </span>
              <ArrowUpRight size={16} className="text-zinc-600 transition group-hover:text-brand-300" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
