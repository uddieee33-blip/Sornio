'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Bell,
  Brain,
  Building2,
  Dumbbell,
  Gauge,
  Lock,
  Menu,
  QrCode,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { LanguagePicker } from '@/components/ui/LanguagePicker';

// Charts are the heaviest dependency on this page — load them after first paint.
const LiveCharts = dynamic(() => import('@/components/landing/live-charts').then((mod) => mod.LiveCharts), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex h-[360px] animate-pulse items-center justify-center rounded-3xl border border-white/[0.07] bg-white/[0.02] text-sm text-zinc-600 lg:col-span-2">Loading live charts…</div>
      <div className="hidden h-[360px] animate-pulse rounded-3xl border border-white/[0.07] bg-white/[0.02] lg:block" />
    </div>
  ),
});

const navLinks = [
  { key: 'nav.charts', label: 'Charts', href: '#charts' },
  { key: 'nav.upi', label: 'UPI QR', href: '#upi' },
  { key: 'nav.features', label: 'Modules', href: '#features' },
  { key: 'nav.security', label: 'Security', href: '#security' },
  { key: 'nav.pricing', label: 'Pricing', href: '#pricing' },
] as const;

const features = [
  { icon: Receipt, title: 'Billing & Receipts', desc: 'Invoices, digital receipts over SMS/WhatsApp, and printed bills handed over the counter.' },
  { icon: BarChart3, title: 'Live Ledger Reports', desc: 'Revenue, expenses, and profit recomputed from real transactions — never hardcoded.' },
  { icon: Dumbbell, title: 'Memberships & Renewals', desc: 'Monthly to annual plans with personalized expiry reminders that stop revenue leakage.' },
  { icon: QrCode, title: 'Your own UPI QR', desc: 'Generated from your own bank details. Customers pay you directly — no gateway, no middleman, no fees.' },
  { icon: Brain, title: 'AI Insights', desc: 'A health score, growth tips, and anomaly alerts generated from your own numbers.' },
  { icon: Bell, title: 'Smart Alerts', desc: 'Low stock, expiring members, and cash-flow dips surfaced before they cost you money.' },
];

const steps = [
  { icon: UserRound, title: 'Sign in & tell us about you', desc: 'Your name, phone, and business details — set up in under three minutes.' },
  { icon: QrCode, title: 'Add your bank & UPI', desc: 'Your collection QR is generated instantly from your own UPI ID and bank account.' },
  { icon: Banknote, title: 'Get paid directly', desc: 'Customers scan your QR in any UPI app. Money lands straight in your bank — we never touch it.' },
];

const heroSteps = [
  { icon: UserRound, title: 'Sign in', desc: 'Your details, your business name, your phone.' },
  { icon: Building2, title: 'Add your business', desc: 'Pick your type — gym, café, salon, shop, anything.' },
  { icon: QrCode, title: 'Get your QR', desc: 'From your own bank. Collect payments from day one.' },
];

const securityItems = [
  { icon: ShieldCheck, title: 'Locked-down responses', desc: 'Every page ships with Content-Security-Policy, HSTS, nosniff, and frame protection.' },
  { icon: Lock, title: 'Zero fund custody', desc: 'Your UPI collections settle directly into your own bank account. We never hold or route money — so no liability can ever fall on us.' },
  { icon: Smartphone, title: 'Your data, your device', desc: 'Your customers’ database lives on your device first. Optional Supabase sync is there when you want it.' },
  { icon: Gauge, title: 'No secrets, ever', desc: 'We never ask for UPI PINs, OTPs, card PINs, or passwords — only the details needed to build your QR.' },
];

const plans = [
  {
    name: 'Starter',
    price: '₹0',
    period: '/forever',
    desc: 'Try everything free for 3 days, then keep collecting at no cost.',
    features: ['3-day full trial of every feature', 'Up to 25 UPI QR collections / month', 'Billing & receipts', 'Live ledger reports'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '₹499',
    period: '/month · or ₹999 quarterly',
    desc: 'For businesses that want unlimited collections and automation.',
    features: ['Everything in Starter', 'Unlimited UPI QR collections', 'Memberships & renewal reminders', 'AI insights & smart alerts', 'Unlimited products'],
    cta: 'Start 3-day trial',
    highlight: true,
  },
  {
    name: 'Scale',
    price: '₹1,999',
    period: '/quarter',
    desc: 'For multi-branch operations that outgrow a single counter.',
    features: ['Everything in Growth', 'Multi-branch ledger', 'Advanced comparisons', 'Dedicated onboarding', 'Priority support'],
    cta: 'Start 3-day trial',
    highlight: false,
  },
];

function SectionEyebrow({ index, label }: { index: string; label: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300">
      <span className="mr-2 text-zinc-600">{index}</span>
      {label}
    </p>
  );
}

export default function LandingPage() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <div className="relative overflow-hidden">
      {/* single ambient glow — cheap radial gradient, no blur filters */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-page-glow" />

      {/* Brand-first header with the page sections tucked into a clear menu. */}
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/25"
        />
      ) : null}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="relative mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0d1017]/90 px-3.5 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Link href="/" aria-label="DukaanOS home" className="flex shrink-0 items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow-sm ring-1 ring-white/20"><Store size={18} className="text-white" /></span>
                <span className="font-display text-lg font-bold tracking-tight text-white">
                  Dukaan<span className="bg-brand-gradient bg-clip-text text-transparent">OS</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
                aria-controls="landing-navigation"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                className={`ml-1 inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${menuOpen ? 'border-brand-400/30 bg-brand-500/10 text-white' : 'border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07] hover:text-white'}`}
              >
                {menuOpen ? <X size={15} /> : <Menu size={15} />}
                <span className="hidden sm:inline">Menu</span>
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <div className="hidden sm:block"><LanguagePicker /></div>
              <Link href="/auth" className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-300 transition hover:text-white md:block">{t('nav.signIn')}</Link>
              <Link href="/home" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-3.5 py-2 text-xs font-bold text-white shadow-glow-sm ring-1 ring-white/20 transition hover:brightness-110 sm:px-4 sm:text-sm">
                <span className="hidden sm:inline">{t('nav.openConsole')}</span>
                <span className="sm:hidden">Console</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          <nav
            id="landing-navigation"
            aria-label="Explore DukaanOS"
            aria-hidden={!menuOpen}
            className={`absolute left-0 right-0 top-full mt-2 rounded-2xl border border-white/[0.08] bg-[#10131c]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-200 sm:p-4 ${menuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Explore DukaanOS</span>
              <span className="text-[11px] text-zinc-600">Jump to a section</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  tabIndex={menuOpen ? 0 : -1}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-brand-400/25 hover:bg-brand-500/[0.08] hover:text-white"
                >
                  {t(link.key)}
                  <ArrowRight size={14} className="shrink-0 text-zinc-600" />
                </a>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-32 text-center md:pt-40">
        <div className="mx-auto mb-6 inline-flex max-w-2xl items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-300 animate-fade-up">
          <Sparkles size={14} /> {t('hero.badge')}
        </div>
        <h1 className="mx-auto max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-tighter text-white md:text-7xl animate-fade-up">
          {t('hero.titleA')}<br className="hidden md:block" /> <span className="bg-brand-gradient bg-clip-text text-transparent">{t('hero.titleB')}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg animate-fade-up">
          {t('hero.sub')}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up">
          <Link href="/auth" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
            {t('hero.ctaStart')} <ArrowRight size={16} />
          </Link>
          <Link href="/home" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:border-brand-400/40 hover:bg-white/[0.07]">
            {t('hero.ctaConsole')}
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-zinc-500 animate-fade-up">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-400" /> No payment gateway — ever</span>
          <span className="inline-flex items-center gap-1.5"><Smartphone size={13} className="text-brand-300" /> Customer data stays on your device</span>
          <span className="inline-flex items-center gap-1.5"><Gauge size={13} className="text-brand-300" /> Set up in 3 minutes</span>
        </div>

        {/* how it works — the direct path */}
        <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3 animate-fade-up">
          {heroSteps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-left backdrop-blur">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-500/25"><step.icon size={15} /></span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">Step {index + 1}</span>
              </div>
              <p className="mt-3 text-sm font-bold text-white">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* the zero-start promise — no fabricated numbers, ever */}
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4 animate-fade-up">
          {[
            { icon: Banknote, label: 'Opening cash', value: '₹0' },
            { icon: QrCode, label: 'Opening UPI', value: '₹0' },
            { icon: ShieldCheck, label: 'Fabricated data', value: '0' },
            { icon: Gauge, label: 'Middleman fees', value: '₹0' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur">
              <stat.icon size={17} className="mx-auto text-brand-300" />
              <p className="mt-2 font-display text-lg font-bold tabular-nums text-white">{stat.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-zinc-600">
          {t('zeroStart.line')}
        </p>
      </section>

      {/* 01 — LIVE CHARTS */}
      <section id="charts" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="mb-10 text-center">
          <SectionEyebrow index="01" label="Sample preview" />
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">This is what your dashboard looks like</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 md:text-base">
            The charts below run on clearly-labelled <span className="font-semibold text-zinc-200">sample data</span> so you can see the product working.
            Your own business starts at ₹0 — only the sales and expenses you record will ever move your charts.
          </p>
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-400">
            <Gauge size={13} /> {t('charts.sample')}
          </p>
        </div>
        <LiveCharts />
      </section>

      {/* 02 — UPI QR */}
      <section id="upi" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.08] via-transparent to-amber-500/[0.06] p-8 md:p-12">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionEyebrow index="02" label="No middleman. Ever." />
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">Your own UPI QR, from your own bank</h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400 md:text-base">
                During setup you add your own UPI ID and bank account. DukaanOS generates your
                <span className="font-semibold text-brand-300"> upi://pay</span> collection QR instantly.
                Every payment settles <span className="font-semibold text-white">directly into your bank account</span> —
                we never touch your money, so nothing you do can ever land on us.
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
              <Link href="/auth" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
                Get your QR — start free <ArrowRight size={15} />
              </Link>
            </div>

            <div className="flex justify-center">
              <div className="relative">
                <div className="pointer-events-none absolute inset-0 -m-8 rounded-full bg-brand-500/15 blur-3xl" />
                <div className="relative w-fit rounded-3xl bg-white p-5 shadow-glow">
                  <div className="grid h-56 w-56 grid-cols-8 gap-1">
                    {Array.from({ length: 64 }).map((_, i) => {
                      const on = [0, 1, 2, 5, 7, 8, 10, 13, 15, 16, 18, 21, 23, 24, 27, 29, 31, 32, 34, 37, 39, 40, 42, 45, 47, 48, 50, 53, 55, 56, 58, 61, 63].includes(i);
                      return <span key={i} className={`rounded-[3px] ${on ? 'bg-brand-900' : 'bg-transparent'}`} />;
                    })}
                  </div>
                  <p className="mt-4 text-center text-xs font-semibold tracking-wide text-zinc-700">yourbusiness@okhdfcbank</p>
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

      {/* 03 — MODULES */}
      <section id="features" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="mb-10 text-center">
          <SectionEyebrow index="03" label="Everything a dukaan needs" />
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

      {/* 04 — SECURITY */}
      <section id="security" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[0.03] p-8 md:p-12">
          <div className="mb-10 text-center">
            <SectionEyebrow index="04" label="Security you can verify" />
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">Hardened by default</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 md:text-base">Inspect the response headers yourself — every protection below ships on every page.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {securityItems.map((item) => (
              <div key={item.title} className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition hover:border-emerald-400/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                  <item.icon size={18} />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — PRICING */}
      <section id="pricing" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="mb-10 text-center">
          <SectionEyebrow index="05" label="Simple pricing" />
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">Free to start. Fair when you grow.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 md:text-base">Every plan starts with a <span className="font-semibold text-zinc-200">3-day full trial</span> — and free accounts keep up to <span className="font-semibold text-zinc-200">25 UPI QR collections every month</span>, forever.</p>
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
                href="/auth"
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
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.12] to-amber-500/[0.08] p-10 text-center md:p-14">
          <h2 className="relative font-display text-3xl font-bold tracking-tight text-white md:text-4xl">Your business, finally in one place.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-sm text-zinc-400 md:text-base">Sign in, add your business and your bank, and start collecting payments today — or jump straight into the live console.</p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-7 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
              Start your business — free <ArrowRight size={16} />
            </Link>
            <Link href="/home" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-zinc-200 transition hover:border-brand-400/40 hover:bg-white/[0.07]">
              Open the console
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06] bg-[#0a0c11]/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient"><Store size={16} className="text-white" /></span>
            <div>
              <span className="font-display text-sm font-bold text-white">DukaanOS</span>
              <p className="text-[11px] text-zinc-600">Available in 22 Indian languages · हिन्दी · ਪੰਜਾਬੀ · मराठी · বাংলা · தமிழ்…</p>
            </div>
          </div>
          <p className="text-xs text-zinc-500">Billing · Inventory · Memberships · UPI QR · AI insights — for Indian businesses.</p>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <Link href="/home" className="transition hover:text-white">{t('nav.openConsole')}</Link>
            <Link href="/auth" className="transition hover:text-white">{t('nav.signIn')}</Link>
            <LanguagePicker />
          </div>
        </div>
      </footer>
    </div>
  );
}
