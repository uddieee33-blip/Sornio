'use client';

import Link from 'next/link';
import { ArrowUpRight, Banknote, Bell, CalendarClock, Coins, Package, PiggyBank, PlusCircle, QrCode, Receipt, Sparkles, TrendingUp, Users, Wallet, Zap } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatCurrency } from '@/lib/business-data';
import { paymentsByMethod, revenueSeries } from '@/lib/chart-data';
import { daysUntil } from '@/lib/models/membership';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';
import { trendSeries } from '@/lib/trend';

function greeting(hour: number) {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const snapshot = useFinancialSnapshot();
  const { state, hydrated } = useDukaanStore();

  const now = new Date();
  const ownerName = state.profile.ownerName?.trim();
  const activeMembers = state.subscriptions.filter((s) => s.status === 'active' || s.status === 'expiring_soon').length;
  const revenue = revenueSeries(state.transactions);
  const methods = paymentsByMethod(state.transactions);

  // Today vs yesterday, straight from the ledger.
  const isoOf = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const salesOn = (offsetDays: number) =>
    state.transactions
      .filter((tx) => tx.type === 'sale' && tx.direction === 'in' && tx.date === isoOf(offsetDays))
      .reduce((sum, tx) => sum + tx.amount, 0);
  const todaySales = salesOn(0);
  const yesterdaySales = salesOn(1);

  const membersById = new Map(state.members.map((member) => [member.id, member]));
  const plansById = new Map(state.plans.map((plan) => [plan.id, plan]));
  const renewalsDue = state.subscriptions
    .map((subscription) => ({ subscription, days: daysUntil(subscription.expiryDate) }))
    .filter(({ days }) => days <= 7)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4);

  const lowStock = state.products
    .filter((product) => product.itemType === 'product' && product.status === 'Active' && product.stock <= product.reorderLevel)
    .slice(0, 4);

  const recentActivity = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 6);

  return (
    <div className="relative p-6 md:p-8">
      {/* Hero */}
      <div className="animate-fade-up relative overflow-hidden rounded-3xl border border-stone-200 bg-panel p-6 shadow-card md:p-9">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600 ring-1 ring-inset ring-brand-500/25">
              <Sparkles size={13} /> {hydrated ? `${greeting(now.getHours())}${ownerName ? `, ${ownerName}` : ''}` : 'Welcome back'} · {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-stone-900 md:text-[2.6rem]">
              Small Business.{' '}
              <span className="bg-brand-gradient bg-clip-text text-transparent">Big Business Thinking.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Every number recalculates the moment you record real activity. Billing, inventory, memberships, UPI QR collections, and AI insights — one console.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/sales" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110">
                <PlusCircle size={17} /> Record a sale
              </Link>
              <Link href="/customers" className="inline-flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-900 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200">
                <QrCode size={17} /> Customer QR codes
              </Link>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3 lg:w-[380px]">
            {[
              { label: 'Today so far', value: formatCurrency(todaySales), accent: true, sub: yesterdaySales > 0 ? `${todaySales >= yesterdaySales ? '+' : ''}${Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)}% vs yesterday` : 'vs yesterday' },
              { label: 'Net Profit', value: formatCurrency(snapshot.netProfit), sub: `${snapshot.grossMargin.toFixed(0)}% margin` },
              { label: 'Transactions', value: String(state.transactions.length), sub: 'in the ledger' },
              { label: 'Active Members', value: String(activeMembers), sub: `${state.customers.length} customers on file` },
            ].map((tile) => (
              <div key={tile.label} className={`rounded-2xl p-4 ring-1 ring-inset ${tile.accent ? 'bg-brand-500/10 ring-brand-500/30' : 'bg-stone-50 ring-stone-200'}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{tile.label}</p>
                <p className={`mt-1.5 font-display text-xl font-bold tabular-nums ${tile.accent ? 'text-brand-600' : 'text-stone-900'}`}>{tile.value}</p>
                <p className="mt-0.5 text-[11px] text-stone-600">{tile.sub}</p>
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

      {/* Today at your store */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<Receipt size={17} />}>Recent activity</CardTitle>
            <Link href="/transactions" className="text-xs font-semibold text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2.5">
            {recentActivity.map((tx) => (
              <Link key={tx.id} href="/transactions" className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:border-brand-400/25 hover:bg-stone-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800">{tx.description}</p>
                  <p className="text-[11px] text-stone-600">{tx.date} · {tx.account}</p>
                </div>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${tx.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {tx.direction === 'in' ? '+' : '−'}{formatCurrency(tx.amount)}
                </span>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<CalendarClock size={17} />}>Renewals due</CardTitle>
            <Link href="/memberships" className="text-xs font-semibold text-brand-600 hover:underline">Manage</Link>
          </div>
          <div className="space-y-2.5">
            {renewalsDue.map(({ subscription, days }) => {
              const member = membersById.get(subscription.memberId);
              const plan = plansById.get(subscription.planId);
              return (
                <Link key={subscription.id} href="/memberships" className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:border-brand-400/25 hover:bg-stone-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800">{member?.name ?? 'Member'}</p>
                    <p className="truncate text-[11px] text-stone-600">{plan?.name ?? 'Plan'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${days < 0 ? 'bg-red-500/10 text-red-700 ring-red-500/25' : days <= 1 ? 'bg-amber-500/10 text-amber-700 ring-amber-500/25' : 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25'}`}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
                  </span>
                </Link>
              );
            })}
            {renewalsDue.length === 0 ? <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No renewals due in the next 7 days. 🎉</p> : null}
          </div>
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<Package size={17} />}>Low stock watch</CardTitle>
            <Link href="/inventory" className="text-xs font-semibold text-brand-600 hover:underline">Inventory</Link>
          </div>
          <div className="space-y-2.5">
            {lowStock.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800">{product.name}</p>
                  <p className="text-[11px] text-stone-600">Reorder at {product.reorderLevel}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-500/25">
                  {product.stock} left
                </span>
              </div>
            ))}
            {lowStock.length === 0 ? <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">All products above reorder levels.</p> : null}
          </div>
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
            <Link key={item.href} href={item.href} className="group animate-fade-up flex items-center gap-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:bg-stone-100 hover:ring-brand-400/30 hover:shadow-card-hover">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/20 transition group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-glow-sm">
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-stone-900">{item.title}</span>
                <span className="block truncate text-xs text-stone-600">{item.desc}</span>
              </span>
              <ArrowUpRight size={16} className="text-stone-600 transition group-hover:text-brand-600" />
            </Link>
          );
        })}
      </div>

      {/* Alerts teaser */}
      <div className="mt-6">
        <Link href="/alerts" className="group flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-brand-400/30 hover:bg-stone-50">
          <span className="flex items-center gap-3 text-sm text-stone-600">
            <Bell size={16} className="text-brand-600" />
            {renewalsDue.length + lowStock.length > 0
              ? `${renewalsDue.length + lowStock.length} item${renewalsDue.length + lowStock.length === 1 ? '' : 's'} need attention — renewals and low stock.`
              : 'Everything looks healthy. Open alerts to see the full picture.'}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-brand-600">Review alerts <ArrowUpRight size={13} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
        </Link>
      </div>
    </div>
  );
}
