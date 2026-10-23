'use client';

/**
 * The portal cockpit — the first screen of every business type.
 *
 * This is where "one app for everyone" usually falls apart: a generic dashboard
 * full of numbers nobody asked for. Here the blueprint decides everything:
 *
 *   • the question in the headline,
 *   • the four figures that answer it,
 *   • the list that needs action today (renewals, day book, reorder, udhaar),
 *   • and the quick actions this trade performs all day.
 *
 * Every value is read from records the owner entered. Empty is shown as an
 * empty state with a next step, never as fake data.
 */

import Link from 'next/link';
import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock,
  Info,
  PackageSearch,
  PlusCircle,
  Receipt,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { formatCurrency } from '@/lib/business-data';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Reveal } from '@/components/motion/reveal';
import { revenueSeries } from '@/lib/chart-data';
import { daysUntil } from '@/lib/models/membership';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { resolveMetric, type CockpitContext } from '@/lib/portals/metrics';
import { PORTALS } from '@/lib/portals/registry';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import { LOCKED_PARAM } from '@/lib/portals/routes';
import type { FocusKey } from '@/lib/portals/types';
import { useI18n } from '@/lib/i18n';

function greeting(hour: number) {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const dateLabel = (iso: string, locale: string) =>
  new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

const dayLabel = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

/** Why is a module missing? The answer the owner actually deserves. */
function LockedNotice() {
  const params = useSearchParams();
  const locked = params.get(LOCKED_PARAM);
  const { portal } = usePortal();
  if (!locked) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-500/[0.08] p-4 ring-1 ring-inset ring-amber-500/25 animate-fade-in">
      <Info size={17} className="mt-0.5 shrink-0 text-amber-700" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-amber-800">
          {portal.name} does not include that module — that is deliberate, not a bug.
        </p>
        <p className="mt-0.5 leading-relaxed text-amber-800/80">
          {portal.excluded}{' '}
          <Link href="/business" className="font-semibold underline underline-offset-4">
            Open Business Setup
          </Link>{' '}
          to switch it on, or pick a business type that fits better.
        </p>
      </div>
    </div>
  );
}

/** A portrait of what this portal deliberately does not carry. */
function PortalIdentity() {
  const { portal, nav } = usePortal();
  const Icon = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;
  const moduleCount = nav.flatMap((section) => section.links).length;

  return (
    <div className="mt-6 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200 md:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="bg-portal-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow-sm">
            <Icon size={19} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900">
              You are on the {portal.name} console
              <span className="ml-2 rounded-full bg-portal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-portal ring-1 ring-inset ring-portal/20">
                {moduleCount} modules
              </span>
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-600">{portal.promise}</p>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-stone-500">{portal.excluded}</p>
          </div>
        </div>
        <Link
          href="/business"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100"
        >
          Reshape for another business type <ArrowUpRight size={13} />
        </Link>
      </div>
    </div>
  );
}

/** The nudge a brand-new business sees: choose a type, get a console. */
function ChooseTypeBanner() {
  const { terms } = usePortal();
  const { actions } = useDukaanStore();
  const { applyTemplate } = actions;

  return (
    <div className="mb-6 rounded-3xl bg-portal/[0.06] p-5 ring-1 ring-inset ring-portal/20 animate-fade-up md:p-6">
      <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
        <Sparkles size={16} className="text-portal" /> Pick your business type — this whole console reshapes around it
      </p>
      <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-stone-600">
        A gym should not be shown inventory, and a {terms.desk.toLowerCase()} should not be chased for memberships. Choose a type and the
        navigation, the words, and every screen change with it. You can switch whenever you like — nothing is lost.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {PORTALS.map((option) => {
          const OptionIcon = PORTAL_ICONS[option.icon] ?? PORTAL_ICONS.general;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => applyTemplate(option.templateId)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100"
              title={option.promise}
            >
              <OptionIcon size={14} /> {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The one live list that matters most to this trade. */
function FocusPanel() {
  const { locale } = useI18n();
  const { state, actions } = useDukaanStore();
  const { portal } = usePortal();
  const { focus } = portal.cockpit;
  const { endCheckIn } = actions;

  const membersById = useMemo(() => new Map(state.members.map((member) => [member.id, member])), [state.members]);
  const plansById = useMemo(() => new Map(state.plans.map((plan) => [plan.id, plan])), [state.plans]);

  const rows = useMemo(() => {
    switch (focus.kind as FocusKey) {
      case 'renewals':
        return state.subscriptions
          .map((subscription) => ({ subscription, days: daysUntil(subscription.expiryDate) }))
          .filter(({ days }) => days <= 7)
          .sort((a, b) => a.days - b.days)
          .slice(0, 5)
          .map(({ subscription, days }) => {
            const member = membersById.get(subscription.memberId);
            const plan = plansById.get(subscription.planId);
            return {
              id: subscription.id,
              title: member?.name ?? 'Member',
              meta: `${plan?.name ?? 'Plan'} · ${days < 0 ? `lapsed ${Math.abs(days)}d ago` : days === 0 ? 'expires today' : `expires in ${days}d`}`,
              value: plan ? formatCurrency(plan.price, locale) : undefined,
              urgent: days <= 2,
              href: '/memberships',
            };
          });

      case 'appointments':
        return state.appointments
          .filter((appointment) => appointment.startAt.slice(0, 10) === new Date().toISOString().slice(0, 10) && appointment.status !== 'cancelled')
          .slice(0, 5)
          .map((appointment) => ({
            id: appointment.id,
            title: `${appointment.customerName}`,
            meta: `${dateLabel(appointment.startAt, locale)} · ${appointment.service ?? 'Service'}${appointment.staff ? ` · ${appointment.staff}` : ''}`,
            value: appointment.amount ? formatCurrency(appointment.amount, locale) : undefined,
            urgent: appointment.status === 'booked' && new Date(appointment.startAt).getTime() < new Date().getTime(),
            href: '/appointments',
          }));

      case 'reorder':
        return state.products
          .filter((product) => product.itemType === 'product' && product.status === 'Active' && product.stock <= product.reorderLevel)
          .slice(0, 5)
          .map((product) => ({
            id: product.id,
            title: product.name,
            meta: `${product.stock} left · reorder at ${product.reorderLevel}${product.supplier ? ` · ${product.supplier}` : ''}`,
            value: formatCurrency(product.cost * Math.max(1, product.reorderLevel), locale),
            urgent: product.stock === 0,
            href: '/inventory',
          }));

      case 'udhaar':
        return state.customers
          .filter((customer) => customer.openingBalance > 0)
          .sort((a, b) => b.openingBalance - a.openingBalance)
          .slice(0, 5)
          .map((customer) => ({
            id: customer.id,
            title: customer.name,
            meta: customer.phone ? `Open khata · ${customer.phone}` : 'Open khata',
            value: formatCurrency(customer.openingBalance, locale),
            urgent: customer.openingBalance >= 5000,
            href: '/customers',
          }));

      case 'checkins':
        return state.checkIns
          .filter((entry) => entry.at.slice(0, 10) === new Date().toISOString().slice(0, 10))
          .slice(0, 5)
          .map((entry) => ({
            id: entry.id,
            title: entry.name,
            meta: entry.outAt ? `${dateLabel(entry.at, locale)} → ${dateLabel(entry.outAt, locale)}` : `In at ${dateLabel(entry.at, locale)} · on the floor`,
            value: entry.outAt ? undefined : 'active',
            urgent: !entry.outAt,
            href: '/check-ins',
          }));

      default:
        return [...state.transactions]
          .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
          .slice(0, 5)
          .map((tx) => ({
            id: tx.id,
            title: tx.description,
            meta: `${dayLabel(tx.date, locale)} · ${tx.paymentMethod ?? tx.account}`,
            value: `${tx.direction === 'in' ? '+' : '−'}${formatCurrency(tx.amount, locale)}`,
            urgent: false,
            href: '/transactions',
          }));
    }
  }, [focus.kind, state.subscriptions, state.appointments, state.products, state.customers, state.checkIns, state.transactions, membersById, plansById, locale]);

  const icons: Record<FocusKey, typeof BellRing> = {
    renewals: BellRing,
    appointments: CalendarClock,
    reorder: PackageSearch,
    udhaar: Users,
    checkins: UserCheck,
    recent: Receipt,
  };
  const FocusIcon = icons[focus.kind];

  return (
    <Card className="animate-fade-up">
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle icon={<FocusIcon size={17} />}>{focus.title}</CardTitle>
        <Link href={focus.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-portal hover:underline">
          {focus.cta} <ArrowUpRight size={12} />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-500/[0.07] p-3.5 text-xs leading-relaxed text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {focus.empty}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.urgent ? 'bg-amber-500' : 'bg-stone-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-900">{row.title}</p>
                <p className="truncate text-[11px] text-stone-600">{row.meta}</p>
              </div>
              {row.value === 'active' ? (
                <button
                  type="button"
                  onClick={() => endCheckIn(row.id)}
                  className="shrink-0 rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200"
                >
                  Check out
                </button>
              ) : row.value ? (
                <span className="shrink-0 text-xs font-bold tabular-nums text-stone-700">{row.value}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && focus.kind === 'checkins' ? (
        <p className="mt-3 text-[11px] text-stone-500">One tap closes a visit — the record stays attached to the member.</p>
      ) : null}
    </Card>
  );
}

export function PortalCockpit() {
  const { locale } = useI18n();
  const snapshot = useFinancialSnapshot();
  const { state, hydrated } = useDukaanStore();
  const { portal, terms, needsChoice } = usePortal();

  const now = new Date();
  const ownerName = state.profile.ownerName?.trim();
  const revenue = revenueSeries(state.transactions, 14, locale);

  const context: CockpitContext = {
    transactions: state.transactions,
    products: state.products,
    customers: state.customers,
    subscriptions: state.subscriptions,
    invoices: state.invoices,
    checkIns: state.checkIns,
    appointments: state.appointments,
    netProfit: snapshot.netProfit,
    cashBalance: snapshot.cashBalance,
    now,
    formatCurrency: (value) => formatCurrency(value, locale),
  };

  const tiles = portal.cockpit.tiles.map((tile) => ({ ...tile, reading: resolveMetric(tile.metric, context) }));

  return (
    <div className="relative p-4 sm:p-6 md:p-8">
      <Suspense fallback={null}>
        <LockedNotice />
      </Suspense>

      {needsChoice ? <ChooseTypeBanner /> : null}

      {/* Hero — this business's own colour, question, and words. */}
      <div className="animate-fade-up portal-transition relative overflow-hidden rounded-3xl border border-stone-200 bg-panel shadow-card">
        <div className="portal-wash absolute inset-0" />
        <div className="relative p-4 sm:p-6 md:p-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-portal/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-portal ring-1 ring-inset ring-portal/25">
                <Sparkles size={13} />
                {hydrated ? `${greeting(now.getHours())}${ownerName ? `, ${ownerName}` : ''}` : 'Welcome back'} ·{' '}
                {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-stone-900 md:text-[2.4rem]">
                {portal.cockpit.headline}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{portal.cockpit.blurb}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                {portal.cockpit.actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className={
                      action.primary
                        ? 'bg-portal-gradient portal-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110'
                        : 'inline-flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-900 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200'
                    }
                  >
                    {action.primary ? <PlusCircle size={16} /> : <Clock size={15} />} {action.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-3 xl:w-[420px]">
              {tiles.map((tile, tileIndex) => (
                <Reveal
                  key={tile.label}
                  index={tileIndex}
                  className="rounded-2xl bg-white/95 p-4 ring-1 ring-inset ring-stone-200 transition-[box-shadow] duration-slow ease-settle hover:ring-portal/30"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{tile.label}</p>
                  {/*
                    The figure counts up on arrival when there is a number
                    behind it. Money is marked sensitive: this tile sits on the
                    cockpit of a device that faces the shop floor, and the
                    day's takings is the one number a stranger reads first.
                  */}
                  {typeof tile.reading.numeric === 'number' ? (
                    <AnimatedNumber
                      value={tile.reading.numeric}
                      format={
                        tile.reading.kind === 'currency'
                          ? (value) => formatCurrency(value, locale)
                          : (value) => String(Math.round(value))
                      }
                      sensitive={tile.reading.kind === 'currency'}
                      className="mt-1.5 block font-display text-xl font-bold tabular-nums text-stone-900"
                    />
                  ) : (
                    <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-stone-900">
                      {tile.reading.value}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] leading-snug text-stone-600">{tile.reading.sub ?? tile.caption ?? ''}</p>
                </Reveal>
              ))}
            </div>
          </div>

          <PortalIdentity />
        </div>
      </div>

      {/* The live list this trade acts on, plus the numbers behind it. */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <FocusPanel />

        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<TrendingUp size={17} />}>Revenue — last 14 days</CardTitle>
            <Badge tone="emerald" dot>
              Live from the ledger
            </Badge>
          </div>
          <RevenueAreaChart data={revenue} gradientId="portalCockpitRevenue" height={190} color="rgb(var(--portal-accent))" />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-stone-100 pt-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{terms.sale} recorded</p>
              <AnimatedNumber
                value={state.transactions.filter((tx) => tx.type === 'sale' && tx.direction === 'in').length}
                format={(value) => String(Math.round(value))}
                className="mt-1 block font-display text-lg font-bold tabular-nums text-stone-900"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Net profit</p>
              <AnimatedNumber
                value={snapshot.netProfit}
                format={(value) => formatCurrency(value, locale)}
                sensitive
                className="mt-1 block font-display text-lg font-bold tabular-nums text-stone-900"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Cash in hand</p>
              <AnimatedNumber
                value={snapshot.cashBalance}
                format={(value) => formatCurrency(value, locale)}
                sensitive
                className="mt-1 block font-display text-lg font-bold tabular-nums text-stone-900"
              />
            </div>
          </div>
        </Card>
      </div>

      {!hydrated ? <p className="mt-6 text-center text-xs text-stone-500">Reading your records from this device…</p> : null}
    </div>
  );
}

