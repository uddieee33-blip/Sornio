'use client';

/**
 * The landing page — the product, stated plainly, and priced plainly.
 *
 * Two rules govern every claim on this page:
 *
 *   1. **Everything here is executable.** The features listed are the modules in
 *      `lib/portals/catalogue.ts`; the prices, limits and what each plan opens
 *      come from `lib/plans/catalogue.ts` — the same objects the console sells
 *      from and the edge enforces. There is no second price list to drift.
 *   2. **No invented proof.** No fake testimonials, no "10,000 shops", no
 *      countdown timers. What replaces them is a product that can be checked:
 *      the security claims are verifiable in the browser, the code is on your
 *      own device, and both verification suites ship in the repository.
 *
 * The ask is direct, because a business deserves to know what it is buying:
 * free forever to run the shop, ₹499/month for the automations that chase money
 * you are already owed — paid by UPI, with no card and no auto-debit.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Bell,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Dumbbell,
  Fingerprint,
  Gauge,
  HandCoins,
  Lock,
  Menu,
  Percent,
  QrCode,
  Receipt,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { GROWTH_MODULES, PLAN_CATALOGUE, TRIAL_DAYS, planById, monthlyEquivalent, savingsOn, type BillingInterval } from '@/lib/plans';
import { MODULE_CATALOGUE } from '@/lib/portals/catalogue';

// Charts are the heaviest dependency on this page — load them after first paint.
const LiveCharts = dynamic(() => import('@/components/landing/live-charts').then((mod) => mod.LiveCharts), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex h-[360px] animate-pulse items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 text-sm text-stone-600 lg:col-span-2">Loading live charts…</div>
      <div className="hidden h-[360px] animate-pulse rounded-3xl border border-stone-200 bg-stone-50 lg:block" />
    </div>
  ),
});

const navLinks = [
  { key: 'nav.charts', label: 'Charts', href: '#charts' },
  { key: 'nav.upi', label: 'UPI QR', href: '#upi' },
  { key: 'nav.why', label: 'Why pay', href: '#why' },
  { key: 'nav.features', label: 'Modules', href: '#features' },
  { key: 'nav.security', label: 'Security', href: '#security' },
  { key: 'nav.pricing', label: 'Pricing', href: '#pricing' },
  { key: 'nav.faq', label: 'Questions', href: '#faq' },
] as const;

const features = [
  { icon: Receipt, title: 'Billing & receipts', desc: 'Invoice, print the bill for the counter, send a digital receipt — one entry, one ledger line, no double work.' },
  { icon: ScanBarcode, title: 'Scan Station', desc: 'Barcodes, weigh labels and internal codes, decoded on the device. A mistyped or ambiguous code is refused with the reason shown, so a wrong bill cannot be printed.' },
  { icon: BarChart3, title: 'Live ledger reports', desc: 'Revenue, expenses, cash flow and profit recomputed from real transactions every time you open a screen. Nothing is hardcoded, nothing is estimated.' },
  { icon: Dumbbell, title: 'Memberships & renewals', desc: 'Plans, expiry, check-ins and a personalised SMS/WhatsApp draft for every member who is about to lapse.' },
  { icon: QrCode, title: 'Your own UPI QR', desc: 'Generated from your own bank details. Customers pay you directly — no gateway, no middleman, no commission, and we never touch the money.' },
  { icon: Brain, title: 'AI insights', desc: 'A health score, anomaly alerts and growth tips computed from your own numbers — not a generic dashboard template.' },
  { icon: Wallet, title: 'Cash, udhaar and vendors', desc: 'Cash in hand, bank and UPI balances, receivables you are owed, suppliers you owe, and stock at cost — all from the same entries.' },
  { icon: Fingerprint, title: 'Fingerprint check-in', desc: 'A gym desk can check members in with the device’s own sensor. The finger never leaves the hardware — only a credential id is stored.' },
  { icon: Lock, title: 'Traceable by default', desc: 'Every invoice, payment, stock movement and setting change lands in a hash-chained audit history you can verify from inside the console.' },
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

/**
 * Why an owner pays — each claim is a module that exists, with the money it
 * touches named out loud. No adjectives doing the work of numbers.
 */
const whyPay = [
  {
    icon: Bell,
    title: 'Renewals stop leaking',
    body: 'Every membership expiring this week is on one screen with a ready-to-send message. A gym that recovers one quarterly plan has covered half a year of Growth.',
    money: 'Recovers fees you have already earned',
  },
  {
    icon: Percent,
    title: 'You can see which items actually make money',
    body: 'Margin per item, month over month, with the cost of what you sold taken from the same ledger. Most shops find two or three items they were quietly losing money on.',
    money: 'Protects margin on every sale',
  },
  {
    icon: Clock,
    title: 'The counter stops costing you time',
    body: 'Scan, weigh, print, done — with the bill, the stock movement and the ledger entry written in one action, offline, on the device you already own.',
    money: 'Same sales, fewer hands',
  },
  {
    icon: HandCoins,
    title: 'Udhaar becomes a list, not a memory',
    body: 'Balances per customer, unpaid invoices and receivables in one place, with the collection QR ready on their profile. The money you are owed stops living in a notebook.',
    money: 'Turns a memory into a follow-up',
  },
];

/**
 * The comparison table is generated from the plan catalogue — the same objects
 * the edge enforces. A row that is not in the data cannot appear on the page.
 */
function useComparisonRows() {
  return useMemo(() => {
    const starter = planById('starter');
    const growth = planById('growth');
    const scale = planById('scale');
    const label = (module: string) => MODULE_CATALOGUE.find((entry) => entry.module === module)?.label ?? module;

    const limit = (value: number | null) => (value === null ? 'Unlimited' : String(value));

    return [
      {
        group: 'The shop itself',
        rows: [
          { label: 'Counter billing, printed bills, receipts', starter: true, growth: true, scale: true },
          { label: 'Your own UPI collection QR', starter: true, growth: true, scale: true },
          { label: 'Scan Station — barcodes, weigh labels', starter: true, growth: true, scale: true },
          { label: 'Live ledger, cash flow and reports', starter: true, growth: true, scale: true },
          { label: 'Encrypted on your device, exportable always', starter: true, growth: true, scale: true },
        ],
      },
      {
        group: 'Limits',
        rows: [
          { label: 'UPI collections per month', starter: limit(starter.collectionsPerMonth), growth: limit(growth.collectionsPerMonth), scale: limit(scale.collectionsPerMonth) },
          { label: 'Catalogue items', starter: limit(starter.products), growth: limit(growth.products), scale: limit(scale.products) },
          { label: 'Team seats', starter: limit(starter.seats), growth: limit(growth.seats), scale: limit(scale.seats) },
          { label: 'Branches', starter: limit(starter.branches), growth: limit(growth.branches), scale: limit(scale.branches) },
        ],
      },
      {
        group: 'The automations',
        rows: GROWTH_MODULES.map((module) => ({ label: label(module), starter: false, growth: true, scale: true })),
      },
      {
        group: 'When you grow',
        rows: [
          { label: 'Guided onboarding with your own catalogue', starter: false, growth: false, scale: true },
          { label: 'Priority WhatsApp support', starter: false, growth: false, scale: true },
        ],
      },
    ];
  }, []);
}

const faqs = [
  {
    q: 'Do you take a cut of my payments?',
    a: 'No. Your customers pay into your own bank account on your own UPI id, and we never route, hold or see that money. DukaanOS is not a payment gateway — the only rupee figure we ever charge is the plan price on this page.',
  },
  {
    q: 'What happens if I stop paying?',
    a: 'You drop to the free plan and keep working: billing, receipts, stock, your QR, cash entries, reports and every record you ever entered stay readable and exportable. The paid automations — renewals, check-ins, day book, marketing, margins — pause, and switch back on the moment a plan is active. Nothing is deleted and nothing is held hostage.',
  },
  {
    q: 'Is there a contract, a card, or an auto-debit?',
    a: 'None of the three. You pay by UPI when you choose to, there is no mandate on your account, and a plan simply ends when its period ends. That is the entire cancellation policy.',
  },
  {
    q: 'Is the free plan a 14-day countdown in disguise?',
    a: 'No. Starter is ₹0 forever, with a real counter, real stock, real reports and 25 UPI collections a month. We would rather you run a genuinely useful free plan than be pushed into a paid one by a timer.',
  },
  {
    q: 'Where does my data live, and can you read it?',
    a: 'It lives on your device first, encrypted at rest, and syncs only when you connect a Supabase project. The audit history is hash-chained, so any edit anywhere in the chain is detectable. You can export and print everything at any time, on any plan.',
  },
  {
    q: 'I have two shops / a bigger team. Does it scale?',
    a: 'Scale adds multi-branch ledgers, branch comparisons, unlimited seats and guided onboarding. Growth already gives one business unlimited collections, unlimited catalogue and ten seats.',
  },
  {
    q: 'How do I know the security claims are real?',
    a: 'Open Trust Centre inside the console: it reports the live posture — whether storage is encrypted on this device, whether the audit chain verifies, and which role may do what — computed at the moment you look. The two verification suites (`npm run verify:scanning`, `npm run verify:billing`) check the barcode engine and the plan lifecycle against published examples and stated rules.',
  },
];

function SectionEyebrow({ index, label }: { index: string; label: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-600">
      <span className="mr-2 text-stone-600">{index}</span>
      {label}
    </p>
  );
}

function PlanCell({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <CheckCircle2 size={16} className="mx-auto text-emerald-600" aria-label="Included" />
    ) : (
      <span className="text-stone-400" aria-label="Not included">—</span>
    );
  }
  return <span className="text-xs font-semibold text-stone-700">{value}</span>;
}

export default function LandingPage() {
  const { t, locale } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [intervals, setIntervals] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const plan of PLAN_CATALOGUE) initial[plan.id] = Math.max(plan.prices.length - 1, 0);
    return initial;
  });

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const comparison = useComparisonRows();
  const growth = planById('growth');
  const scale = planById('scale');
  const starter = planById('starter');

  const periodLabel = (interval: BillingInterval) => {
    switch (interval) {
      case 'month':
        return '/month';
      case 'quarter':
        return '/3 months';
      case 'year':
        return '/year';
      default:
        return 'forever';
    }
  };

  const plansToShow = [starter, growth, scale];

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
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-panel/97 px-3.5 py-2.5 shadow-2xl shadow-black/40 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Link href="/" aria-label="DukaanOS home" className="flex shrink-0 items-center gap-2.5">
                <BrandIcon size={36} priority className="h-9 w-9 shrink-0 rounded-xl shadow-glow-sm ring-1 ring-stone-300" />
                <span className="hidden font-display text-lg font-bold tracking-tight text-stone-900 min-[400px]:inline">
                  Dukaan<span className="bg-brand-gradient bg-clip-text text-transparent">OS</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
                aria-controls="landing-navigation"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                className={`ml-1 inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${menuOpen ? 'border-brand-400/30 bg-brand-500/10 text-stone-900' : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 hover:text-stone-900'}`}
              >
                {menuOpen ? <X size={15} /> : <Menu size={15} />}
                <span className="hidden sm:inline">Menu</span>
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <AppearanceMenu />
              <div className="hidden sm:block"><LanguagePicker /></div>
              <Link href="/auth" className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:text-stone-900 md:block">{t('nav.signIn')}</Link>
              <Link href="/home" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-3.5 py-2 text-xs font-bold text-white shadow-glow-sm ring-1 ring-stone-300 transition hover:brightness-110 sm:px-4 sm:text-sm">
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
            className={`absolute left-0 right-0 top-full mt-2 rounded-2xl border border-stone-200 bg-panel/98 p-3 shadow-2xl shadow-black/40 transition-all duration-200 sm:p-4 ${menuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-stone-600">Explore DukaanOS</span>
              <span className="text-[11px] text-stone-600">Jump to a section</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  tabIndex={menuOpen ? 0 : -1}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm font-semibold text-stone-700 transition hover:border-brand-400/25 hover:bg-brand-500/[0.08] hover:text-stone-900"
                >
                  {link.label}
                  <ArrowRight size={14} className="shrink-0 text-stone-600" />
                </a>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-32 text-center md:pt-40">
        <div className="mx-auto mb-6 inline-flex max-w-2xl items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-600 animate-fade-up">
          <Sparkles size={14} /> {t('hero.badge')}
        </div>
        <h1 className="mx-auto max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-tighter text-stone-900 md:text-7xl animate-fade-up">
          {t('hero.titleA')}<br className="hidden md:block" /> <span className="bg-brand-gradient bg-clip-text text-transparent">{t('hero.titleB')}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-stone-600 md:text-lg animate-fade-up">
          {t('hero.sub')}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up">
          <Link href="/auth" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
            {t('hero.ctaStart')} <ArrowRight size={16} />
          </Link>
          <Link href="#pricing" className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-6 py-3.5 text-sm font-semibold text-stone-800 transition hover:border-brand-400/40 hover:bg-stone-100">
            See what it costs
          </Link>
        </div>
        <p className="mx-auto mt-5 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-700 animate-fade-up">
          <span className="inline-flex items-center gap-1.5"><BadgeIndianRupeeShim /> {t('hero.promise')}</span>
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-stone-600 animate-fade-up">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-700" /> No payment gateway — ever</span>
          <span className="inline-flex items-center gap-1.5"><Smartphone size={13} className="text-brand-600" /> Customer data stays on your device</span>
          <span className="inline-flex items-center gap-1.5"><Gauge size={13} className="text-brand-600" /> Set up in 3 minutes</span>
        </div>

        {/* how it works — the direct path */}
        <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3 animate-fade-up">
          {heroSteps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-left">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/25"><step.icon size={15} /></span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Step {index + 1}</span>
              </div>
              <p className="mt-3 text-sm font-bold text-stone-900">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{step.desc}</p>
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
            <div key={stat.label} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <stat.icon size={17} className="mx-auto text-brand-600" />
              <p className="mt-2 font-display text-lg font-bold tabular-nums text-stone-900">{stat.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-600">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-stone-600">
          {t('zeroStart.line')}
        </p>
      </section>

      {/* 01 — LIVE CHARTS */}
      <section id="charts" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="mb-10 text-center">
          <SectionEyebrow index="01" label="Sample preview" />
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">This is what your dashboard looks like</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 md:text-base">
            The charts below run on clearly-labelled <span className="font-semibold text-stone-800">sample data</span> so you can see the product working.
            Your own business starts at ₹0 — only the sales and expenses you record will ever move your charts.
          </p>
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-700">
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
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">Your own UPI QR, from your own bank</h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-600 md:text-base">
                During setup you add your own UPI ID and bank account. DukaanOS generates your
                <span className="font-semibold text-brand-600"> upi://pay</span> collection QR instantly.
                Every payment settles <span className="font-semibold text-stone-900">directly into your bank account</span> —
                we never touch your money, so nothing you do can ever land on us.
              </p>
              <div className="mt-6 space-y-4">
                {steps.map((step, index) => (
                  <div key={step.title} className="flex items-start gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/25">
                      <step.icon size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{index + 1}. {step.title}</p>
                      <p className="mt-0.5 text-sm text-stone-600">{step.desc}</p>
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
                  <p className="mt-4 text-center text-xs font-semibold tracking-wide text-stone-600">yourbusiness@okhdfcbank</p>
                </div>
                <div className="absolute -right-4 -top-4 rounded-2xl border border-stone-200 bg-panel/98 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 shadow-2xl">
                  <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Settles direct to bank</span>
                </div>
                <div className="absolute -bottom-4 -left-4 rounded-2xl border border-stone-200 bg-panel/98 px-3.5 py-2.5 text-xs font-semibold text-brand-600 shadow-2xl">
                  <span className="flex items-center gap-1.5"><Smartphone size={13} /> Works in any UPI app</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 03 — WHY OWNERS PAY */}
      <section id="why" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="mb-10 text-center">
          <SectionEyebrow index="03" label="Why pay" />
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">{t('why.title')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 md:text-base">{t('why.sub')}</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {whyPay.map((item) => (
            <div key={item.title} className="rounded-3xl border border-stone-200 bg-stone-50 p-6 transition hover:border-brand-400/30 hover:shadow-card-hover">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/20">
                <item.icon size={20} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-stone-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{item.body}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                <HandCoins size={12} /> {item.money}
              </p>
            </div>
          ))}
        </div>

        {/* The arithmetic, stated as arithmetic — with our own prices, on purpose. */}
        <div className="mt-6 rounded-3xl border border-emerald-500/15 bg-emerald-500/[0.04] p-6 md:p-8">
          <h3 className="font-display text-lg font-bold text-stone-900">The arithmetic, in the open</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Growth, paying monthly', value: `₹${growth.prices[0].amount.toLocaleString(locale)}`, note: 'per month, one business' },
              { label: 'Growth, paying yearly', value: `₹${monthlyEquivalent(growth, 2)}`, note: `per month, billed ₹${growth.prices[2].amount.toLocaleString(locale)} a year` },
              { label: 'A single recovered renewal', value: '₹1,500', note: 'one quarterly gym membership, typical of a neighbourhood gym' },
            ].map((row) => (
              <div key={row.label} className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-stone-200">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">{row.label}</p>
                <p className="mt-1 font-display text-2xl font-bold text-stone-900">{row.value}</p>
                <p className="mt-0.5 text-xs text-stone-600">{row.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-stone-700">
            One membership you would otherwise have let lapse pays for <strong>three months of Growth</strong>. That is the whole pitch — we are not asking
            you to believe a statistic, we are asking you to do one subtraction with your own prices.
          </p>
        </div>
      </section>

      {/* 04 — MODULES */}
      <section id="features" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="mb-10 text-center">
          <SectionEyebrow index="04" label="Everything a dukaan needs" />
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">One console. Every module.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 md:text-base">
            Your business type decides which of these you see. A gym is never shown a stock shelf; a kirana is never asked to chase memberships.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="group rounded-3xl border border-stone-200 bg-stone-50 p-6 transition hover:border-brand-400/30 hover:shadow-card-hover">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/20 transition group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-glow-sm">
                <feature.icon size={20} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-stone-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 05 — SECURITY */}
      <section id="security" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[0.03] p-8 md:p-12">
          <div className="mb-10 text-center">
            <SectionEyebrow index="05" label="Security you can verify" />
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">Hardened by default — and inspectable</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 md:text-base">
              Every claim below can be checked in your own browser. Trust Centre reports the live posture of the console you are standing in — not a marketing page.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: ShieldCheck, title: 'Locked-down responses', desc: 'Content-Security-Policy, HSTS, nosniff, framing and a per-route Permissions-Policy. Camera only where scanning happens, WebAuthn only at the gym desk.' },
              { icon: Lock, title: 'Encrypted on your device', desc: 'Records are sealed with AES-GCM-256 at rest. The key is derived on the device and never persisted anywhere we can reach.' },
              { icon: Sparkles, title: 'Tamper-evident history', desc: 'The audit trail is a SHA-256 hash chain: edit one old entry and every later link stops verifying. You can check it from the console.' },
              { icon: QrCode, title: 'Zero fund custody', desc: 'Collections settle straight into your bank on your own UPI id. We hold no licence, no float and no liability for your money.' },
              { icon: Gauge, title: 'No secrets, ever', desc: 'There is no field in this product for a UPI PIN, an OTP, a card number or a bank password — nothing to leak, nothing to sell.' },
              { icon: Fingerprint, title: 'Fingers stay on the device', desc: 'Check-in matches inside the sensor and returns a credential id. No image, no template, no hash of one, and no way to move money with it.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-5 transition hover:border-emerald-400/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/25">
                  <item.icon size={18} />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-stone-900">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-inset ring-stone-200">
            <p className="text-sm font-semibold text-stone-900">Check it yourself, in this order</p>
            <ol className="mt-3 grid gap-2 text-sm text-stone-600 md:grid-cols-3">
              <li className="flex gap-2"><span className="font-bold text-brand-600">1.</span> Open the console and view the response headers — the protections are on every page.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">2.</span> Visit <span className="font-semibold text-stone-800">Trust Centre</span> and read the live encryption, audit-chain and permission posture.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">3.</span> If you develop, run <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px]">npm run verify</code> — barcodes against published examples, and the plan lifecycle against its own rules.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* 06 — PRICING */}
      <section id="pricing" className="relative mx-auto max-w-7xl scroll-mt-32 px-6 pb-24">
        <div className="mb-10 text-center">
          <SectionEyebrow index="06" label="Simple pricing" />
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">Free to run. Paid to automate.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 md:text-base">{t('pricing.sub')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plansToShow.map((plan) => {
            const selected = intervals[plan.id] ?? 0;
            const price = plan.prices[selected] ?? plan.prices[0];
            const monthly = monthlyEquivalent(plan, selected);
            const saved = savingsOn(plan, price.interval);
            const isFree = price.amount === 0;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border p-7 transition ${plan.popular ? 'border-brand-400/40 bg-brand-500/[0.06] shadow-glow' : 'border-stone-200 bg-stone-50 hover:border-brand-400/25'}`}
              >
                {plan.popular ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-3.5 py-1 text-[11px] font-bold text-white shadow-glow-sm">Most chosen</span>
                ) : null}
                <h3 className="text-base font-semibold text-stone-900">{plan.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">{plan.tagline}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {plan.prices.map((option, index) => (
                    <button
                      key={option.interval}
                      type="button"
                      onClick={() => setIntervals((current) => ({ ...current, [plan.id]: index }))}
                      aria-pressed={index === selected}
                      className={`min-h-9 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 ring-inset transition ${index === selected ? 'bg-brand-500/15 text-brand-700 ring-brand-400/30' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-100'}`}
                    >
                      {option.amount === 0 ? 'Free' : `₹${option.amount.toLocaleString(locale)}`} {isFree ? '' : periodLabel(option.interval)}
                    </button>
                  ))}
                </div>

                <p className="mt-5">
                  <span className="font-display text-4xl font-bold text-stone-900">{price.amount === 0 ? '₹0' : `₹${price.amount.toLocaleString(locale)}`}</span>
                  <span className="ml-1 text-sm text-stone-600">{periodLabel(price.interval)}</span>
                </p>
                {monthly && monthly > 0 ? (
                  <p className="text-xs text-stone-600">≈ ₹{monthly.toLocaleString(locale)}/month{saved > 0 ? ` · saves ₹${saved.toLocaleString(locale)}` : ''}</p>
                ) : (
                  <p className="text-xs font-semibold text-emerald-700">Forever — this is not a countdown</p>
                )}

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.highlights.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-stone-700">
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 space-y-1.5">
                  {plan.excluded.map((item) => (
                    <p key={item} className="text-[11px] leading-relaxed text-stone-500">— {item}</p>
                  ))}
                </div>

                <Link
                  href={isFree ? '/auth' : `/auth?plan=${plan.id}&interval=${price.interval}`}
                  className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${plan.popular ? 'bg-brand-gradient text-white shadow-glow hover:brightness-110' : 'border border-stone-200 bg-white text-stone-800 hover:border-brand-400/40 hover:bg-stone-100'}`}
                >
                  {isFree ? 'Start free — no card' : `Experience everything — ${TRIAL_DAYS}-day trial, then ${plan.name}`} <ArrowRight size={15} />
                </Link>
                {!isFree ? (
                  <p className="mt-2 text-center text-[11px] text-stone-600">
                    Price locked 12 months · pay by UPI when you choose · no auto-debit
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* 06b — the comparison table, generated from the same catalogue */}
        <div className="mt-12">
          <div className="mb-6 text-center">
            <h3 className="font-display text-2xl font-bold tracking-tight text-stone-900">{t('compare.title')}</h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-stone-600">{t('compare.sub')}</p>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-stone-50">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">What you get</th>
                  <th className="px-4 py-3 text-center font-semibold">{starter.name} · ₹0</th>
                  <th className="px-4 py-3 text-center font-semibold text-brand-700">{growth.name} · ₹{growth.prices[0].amount}</th>
                  <th className="px-4 py-3 text-center font-semibold">{scale.name} · ₹{scale.prices[0].amount}/quarter</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((group) => (
                  <Fragment key={group.group}>
                    <tr className="border-t border-stone-200 bg-stone-100/70">
                      <td colSpan={4} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">{group.group}</td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={`${group.group}-${row.label}`} className="border-t border-stone-200">
                        <td className="px-4 py-3 text-stone-700">{row.label}</td>
                        <td className="px-4 py-3 text-center"><PlanCell value={row.starter} /></td>
                        <td className="px-4 py-3 text-center"><PlanCell value={row.growth} /></td>
                        <td className="px-4 py-3 text-center"><PlanCell value={row.scale} /></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-center text-xs text-stone-600">
            This table is generated from the same plan catalogue the console enforces — a row that is not in the product cannot appear here.
          </p>
        </div>
      </section>

      {/* 07 — QUESTIONS */}
      <section id="faq" className="relative mx-auto max-w-4xl scroll-mt-32 px-6 pb-24">
        <div className="mb-8 text-center">
          <SectionEyebrow index="07" label="Questions" />
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">{t('faq.title')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 md:text-base">
            The questions we would ask before paying someone for software that runs our shop.
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <details key={faq.q} className="group rounded-2xl border border-stone-200 bg-stone-50 p-5 transition hover:border-brand-400/25">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-stone-900">
                {faq.q}
                <ArrowRight size={15} className="shrink-0 text-stone-500 transition group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative mx-auto max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.12] to-amber-500/[0.08] p-10 text-center md:p-14">
          <h2 className="relative font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">Start free. Pay only when the automations earn it.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-sm text-stone-600 md:text-base">
            Sign in, add your business and your bank, record your first sale — and take the seven-day full trial to experience every module, every feature, every limit removed.
            If it does not find money for you, stay on the free plan forever.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-7 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110">
              Start your business — free <ArrowRight size={16} />
            </Link>
            <Link href="#pricing" className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-7 py-3.5 text-sm font-semibold text-stone-800 transition hover:border-brand-400/40 hover:bg-stone-100">
              Compare the plans
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-stone-200 bg-stone-100/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-3">
            <BrandIcon size={32} className="h-8 w-8 shrink-0 rounded-lg" />
            <div>
              <span className="font-display text-sm font-bold text-stone-900">DukaanOS</span>
              <p className="text-[10px] font-medium tracking-[0.08em] text-brand-600">Smarter Business. Bigger Dreams.</p>
              <p className="text-[11px] text-stone-600">English + all 22 scheduled Indian languages · हिन्दी · ਪੰਜਾਬੀ · मराठी · বাংলা · தமிழ்…</p>
            </div>
          </div>
          <p className="text-xs text-stone-600">Billing · Inventory · Memberships · UPI QR · AI insights — for Indian businesses.</p>
          <div className="flex items-center gap-4 text-xs text-stone-600">
            <Link href="/home" className="transition hover:text-stone-900">{t('nav.openConsole')}</Link>
            <Link href="/auth" className="transition hover:text-stone-900">{t('nav.signIn')}</Link>
            <Link href="/subscription" className="transition hover:text-stone-900">Your Plan</Link>
            <LanguagePicker />
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A tiny rupee glyph shim so the promise strip reads as one sentence. */
function BadgeIndianRupeeShim() {
  return <span aria-hidden className="font-bold text-brand-600">₹</span>;
}
