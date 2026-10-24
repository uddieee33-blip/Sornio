'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Banknote, Boxes, CalendarDays, Download, Package, Receipt, Users, Wallet } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { usePlan } from '@/components/billing/plan-provider';
import { checkPlanAccess } from '@/lib/plans/routes';
import { formatCurrency } from '@/lib/business-data';
import { useI18n } from '@/lib/i18n';
import { DAILY_TASKS, shopkeeperSummary } from '@/lib/shopkeeper';

const TASK_ICONS = { bill: Receipt, payment: Banknote, customers: Users, items: Package, stock: Boxes, expense: Wallet, members: Users, bookings: CalendarDays };

function AccessNotice() {
  const params = useSearchParams();
  if (!params.get('locked')) return null;
  return <p role="status" className="mb-5 rounded-2xl bg-amber-500/10 p-4 text-sm text-stone-700">That section is not available for your business type. <Link href="/business" className="font-bold underline">Review business details</Link></p>;
}

export function SimpleHome({ onDetails }: { onDetails: () => void }) {
  const { state, hydrated } = useDukaanStore();
  const { allows } = usePortal();
  const { entitlement } = usePlan();
  const { locale } = useI18n();
  const summary = shopkeeperSummary(state);
  const tasks = DAILY_TASKS.filter((task) => allows(task.href) && checkPlanAccess(entitlement, task.href).allowed);
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <Suspense fallback={null}><AccessNotice /></Suspense>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-stone-600">{hydrated ? state.profile.name || 'My Business' : 'Loading…'}</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-stone-900">What would you like to do?</h1>
          <p className="mt-2 text-sm text-stone-600">Choose a job below. Your reports are here when you need them.</p>
        </div>
        <Link href="/install" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-panel px-4 py-2 text-sm font-semibold text-stone-700"><Download size={17} /> Install app</Link>
      </header>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Money received today', value: formatCurrency(summary.receivedToday, locale) },
          { label: 'Customers owe you', value: formatCurrency(summary.customersOwe, locale) },
          { label: 'Items running low', value: String(summary.lowStock) },
        ].map((item) => <div key={item.label} className="rounded-2xl border border-stone-200 bg-panel p-5"><p className="text-sm text-stone-600">{item.label}</p><p data-sensitive="true" className="mt-2 text-2xl font-bold tabular-nums text-stone-900">{hydrated ? item.value : '—'}</p></div>)}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => {
          const Icon = TASK_ICONS[task.icon];
          return <Link key={task.href} href={task.href} className="group flex min-h-36 flex-col rounded-2xl border border-stone-200 bg-panel p-5 transition hover:border-portal/40 hover:bg-portal/[0.04] focus-visible:ring-2 focus-visible:ring-focus"><Icon size={25} className="text-portal" /><span className="mt-3 flex items-center justify-between gap-3 text-lg font-bold text-stone-900">{task.label}<ArrowRight size={18} /></span><span className="mt-1 text-sm leading-relaxed text-stone-600">{task.description}</span></Link>;
        })}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onDetails} className="min-h-11 rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700">View detailed overview</button>
        <Link href="/onboarding" className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-stone-700 underline">Review owner, business & bank details</Link>
        {allows('/customers') && checkPlanAccess(entitlement, '/customers').allowed ? <Link href="/customers#customer-reminders" className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-stone-700 underline">Payment reminders</Link> : null}
        {allows('/reminders') && checkPlanAccess(entitlement, '/reminders').allowed ? <Link href="/reminders" className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-stone-700 underline">SMS & WhatsApp reminders</Link> : null}
      </div>
    </div>
  );
}
