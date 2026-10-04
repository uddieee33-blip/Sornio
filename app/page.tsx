'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Bell,
  Brain,
  Dumbbell,
  Gauge,
  QrCode,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { RevenueAreaChart, DualAreaChart } from '@/components/charts/RevenueAreaChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import { expenseSeries, expensesByCategory, paymentsByMethod, revenueSeries } from '@/lib/chart-data';
import { buildSeedState } from '@/lib/store';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Live Charts', href: '#charts' },
  { label: 'UPI QR', href: '#upi' },
  { label: 'Pricing', href: '#pricing' },
];

const features = [
  { icon: Receipt, title: 'Billing & Receipts', desc: 'Invoices, digital and printed receipts, and a payment flow your customers actually enjoy.' },
  { icon: BarChart3, title: 'Live Ledger Reports', desc: 'Revenue, expenses, and profit recomputed from real transactions — never hardcoded.' },
  { icon: Dumbbell, title: 'Memberships & Renewals', desc: 'Plans, subscriptions, auto reminders, and one-tap renewals that stop revenue leakage.' },
  { icon: QrCode, title: 'Direct UPI QR', desc: 'A unique QR per customer that pays straight into their bank. You are never the middleman.' },
  { icon: Brain, title: 'AI Insights', desc: 'A health score, growth tips, and anomaly alerts generated from your own numbers.' },
  { icon: Bell, title: 'Smart Alerts', desc: 'Low stock, expiring members, and cash-flow dips surfaced before they cost you money.' },
];

const steps = [
  { icon: Users, title: 'Capture details', desc: 'Add name, phone, and bank or UPI details in seconds.' },
  { icon: QrCode, title: 'Generate a unique QR', desc: 'DukaanOS builds a UPI deep-link QR from the customer’s own UPI ID.' },
  { icon: Banknote, title: 'Get paid directly', desc: 'Scan it in any UPI app — money lands in their bank, no middleman, no fees.' },
];

const plans = [
  {
    name: 'Starter',
    price: '₹0',
    period: '/forever',
    desc: 'For a single shop getting started.',
    features: ['Billing & receipts', 'Live ledger reports', 'Up to 50 products', 'UPI QR collections'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '₹499',
    period: '/month',
    desc: 'For stores that want automation.',
    features: ['Everything in Starter', 'Memberships & renewals', 'AI insights & alerts', 'Unlimited products', 'Priority support'],
    cta: 'Start 14-day trial',
    highlight: true,
  },
  {
    name: 'Scale',
    price: '₹1,499',
    period: '/month',
    desc: 'For multi-branch operations.',
    features: ['Everything in Growth', 'Multi-branch ledger', 'Advanced comparisons', 'Dedicated onboarding', 'API access'],
    cta: 'Talk to sales',
    highlight: false,
  },
];

export default function LandingPage() {
  // Build the same seeded ledger the console uses, so the landing previews real data.
  const seed = useMemo(() => buildSeedState(), []);
  const financials = useMemo(() => summarizeFinancials(seed.transactions), [seed]);
  const revenue = useMemo(() => revenueSeries(seed.transactions), [seed]);
  const expenses = useMemo(() => expenseSeries(seed.transactions), [seed]);
  const byCategory = useMemo(() => expensesByCategory(seed.transactions), [seed]);
  const byMethod = useMemo(() => paymentsByMethod(seed.transactions), [seed]);

  return (
    <div className="relative overflow-hidden">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-[38rem] h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />

      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0B0D12]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow-sm"><Store size={18} className="text-white" /></span>
            <span className="font-display text-lg font-bold tracking-tight text-white">DukaanOS</span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-medium text-zinc-400 transition hover:text-white">{link.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth" className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:text-white sm:block">Sign in</Link>
            <Link href="/home" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110">
              Open console <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 text-center md:pt-28">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-300 animate-fade-up">
          <Sparkles size={14} /> Built for Indian shops, gyms, salons & cafés
        </div>
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl animate-fade-up">
          Run your entire business<br className="hidden md:block" /> from <span className="bg-brand-gradient bg-clip-text text-transparent">one console</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg animate-fade-up">
          Billing, inventory, memberships, and AI insights — all powered by a live ledger.
          Collect payments with a unique UPI QR per customer, straight to their bank. No middleman.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up">
          <Link href="/home" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
            Launch the live console <ArrowRight size={16} />
          </Link>
          <a href="#charts" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:border-brand-400/40 hover:bg-white/[0.07]">
            See live charts
          </a>
        </div>

        {/* hero stat strip */}
        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4 animate-fade-up">
          {[
            { icon: TrendingUp, label: 'Revenue (14d)', value: formatCurrency(financials.revenue) },
            { icon: Banknote, label: 'Net cash flow', value: formatCurrency(financials.netCashFlow) },
            { icon: Gauge, label: 'Gross margin', value: `${financials.grossMargin.toFixed(0)}%` },
            { icon: Users, label: 'QR-ready customers', value: '100%' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur">
              <stat.icon size={17} className="mx-auto text-brand-300" />
              <p className="mt-2 font-display text-lg font-bold tabular-nums text-white">{stat.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LIVE CHARTS PREVIEW */}
      <section id="charts" className="relative mx-auto max-w-7xl scroll-mt-24 px-6 pb-24">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300">Live from the ledger</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">Charts that move when your business moves</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 md:text-base">Every graph below is computed from the same seeded transactions that power the console — record a sale and watch it change.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><TrendingUp size={16} className="text-brand-300" /> Revenue vs expenses · 14 days</h3>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">Live</span>
            </div>
            <DualAreaChart revenue={revenue} expenses={expenses} height={260} />
          </div>

          <div className="grid gap-6">
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><Banknote size={16} className="text-brand-300" /> Payment mix</h3>
              {byMethod.length > 0 ? <DonutChart data={byMethod} centerLabel="Collected" centerValue={formatCurrency(financials.cashIn)} height={190} /> : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><BarChart3 size={16} className="text-brand-300" /> Revenue trend</h3>
            <RevenueAreaChart data={revenue} gradientId="landing-rev" height={190} />
          </div>
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><Receipt size={16} className="text-brand-300" /> Expenses by category</h3>
            {byCategory.length > 0 ? <DonutChart data={byCategory} centerLabel="Spent" centerValue={formatCurrency(financials.operatingExpenses)} height={190} /> : null}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative mx-auto max-w-7xl scroll-mt-24 px-6 pb-24">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300">Everything a dukaan needs</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">One console. Every module.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="group rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 transition hover:border-brand-400/30 hover:bg-white/[0.04] hover:shadow-card-hover">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-500/20 transition group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-glow-sm">
                <feature.icon size={20} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* UPI QR */}
      <section id="upi" className="relative mx-auto max-w-7xl scroll-mt-24 px-6 pb-24">
        <div className="overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.08] via-transparent to-violet-500/[0.06] p-8 md:p-12">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300">No middleman. Ever.</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">A unique UPI QR for every customer</h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400 md:text-base">
                Capture a customer&apos;s UPI ID and bank details once. DukaanOS generates a personal
                <span className="font-semibold text-brand-300"> upi://pay</span> QR code that any UPI app can scan.
                The money settles <span className="font-semibold text-white">directly into their bank</span> — you never hold or route it, and you pay no aggregator fees.
              </p>
              <div className="mt-6 space-y-4">
                {steps.map((step, index) => (
                  <div key={step.title} className="flex items-start gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-500/25">
                      <step.icon size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{index + 1}. {step.title}</p>
                      <p className="mt-0.5 text-sm text-zinc-400">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/customers" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
                Try the Customers page <ArrowRight size={15} />
              </Link>
            </div>

            <div className="flex justify-center">
              <div className="relative">
                <div className="pointer-events-none absolute inset-0 -m-8 rounded-full bg-brand-500/20 blur-3xl" />
                <div className="relative w-fit rounded-3xl bg-white p-5 shadow-glow">
                  {/* decorative QR grid */}
                  <div className="grid h-56 w-56 grid-cols-8 gap-1">
                    {Array.from({ length: 64 }).map((_, i) => {
                      const on = [0, 1, 2, 5, 7, 8, 10, 13, 15, 16, 18, 21, 23, 24, 27, 29, 31, 32, 34, 37, 39, 40, 42, 45, 47, 48, 50, 53, 55, 56, 58, 61, 63].includes(i);
                      return <span key={i} className={`rounded-[3px] ${on ? 'bg-[#0B0D12]' : 'bg-transparent'}`} />;
                    })}
                  </div>
                  <p className="mt-4 text-center text-xs font-semibold tracking-wide text-zinc-700">riya.sharma@okhdfcbank</p>
                </div>
                <div className="absolute -right-4 -top-4 rounded-2xl border border-white/10 bg-[#161a23]/95 px-3.5 py-2.5 text-xs font-semibold text-emerald-400 shadow-2xl backdrop-blur">
                  <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Settles direct to bank</span>
                </div>
                <div className="absolute -bottom-4 -left-4 rounded-2xl border border-white/10 bg-[#161a23]/95 px-3.5 py-2.5 text-xs font-semibold text-brand-300 shadow-2xl backdrop-blur">
                  <span className="flex items-center gap-1.5"><Smartphone size={13} /> Works in any UPI app</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative mx-auto max-w-7xl scroll-mt-24 px-6 pb-24">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300">Simple pricing</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">Start free. Scale when you grow.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl border p-7 transition ${plan.highlight ? 'border-brand-400/40 bg-brand-500/[0.06] shadow-glow' : 'border-white/[0.07] bg-white/[0.02] hover:border-brand-400/25'}`}
            >
              {plan.highlight ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-3.5 py-1 text-[11px] font-bold text-white shadow-glow-sm">Most popular</span>
              ) : null}
              <h3 className="text-base font-semibold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-zinc-500">{plan.desc}</p>
              <p className="mt-5"><span className="font-display text-4xl font-bold text-white">{plan.price}</span><span className="ml-1 text-sm text-zinc-500">{plan.period}</span></p>
              <ul className="mt-6 space-y-2.5">
                {plan.features.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-zinc-300">
                    <Zap size={15} className="shrink-0 text-brand-300" /> {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/home"
                className={`mt-7 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${plan.highlight ? 'bg-brand-gradient text-white shadow-glow hover:brightness-110' : 'border border-white/10 bg-white/[0.04] text-zinc-200 hover:border-brand-400/40 hover:bg-white/[0.07]'}`}
              >
                {plan.cta} <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative mx-auto max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.12] to-violet-500/[0.08] p-10 text-center md:p-14">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
          <h2 className="relative font-display text-3xl font-bold tracking-tight text-white md:text-4xl">Your business, finally in one place.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-sm text-zinc-400 md:text-base">Jump into the live console — seeded with a real 14-day ledger so every chart, alert, and QR is already working.</p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/home" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-7 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
              Open the console <ArrowRight size={16} />
            </Link>
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-zinc-200 transition hover:border-brand-400/40 hover:bg-white/[0.07]">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06] bg-[#0a0c11]/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient"><Store size={16} className="text-white" /></span>
            <span className="font-display text-sm font-bold text-white">DukaanOS</span>
          </div>
          <p className="text-xs text-zinc-500">Billing · Inventory · Memberships · UPI QR · AI insights — for Indian businesses.</p>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <Link href="/home" className="transition hover:text-white">Console</Link>
            <Link href="/auth" className="transition hover:text-white">Sign in</Link>
            <a href="#features" className="transition hover:text-white">Features</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
