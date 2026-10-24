'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Banknote, Boxes, CalendarDays, Check, ChevronDown, Circle, Package, Receipt, Search, Users, Wallet } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { usePlan } from '@/components/billing/plan-provider';
import { checkPlanAccess } from '@/lib/plans/routes';
import { formatCurrency } from '@/lib/business-data';
import { formatInvoiceAmount } from '@/lib/invoices';
import { useI18n } from '@/lib/i18n';
import { DAILY_TASKS, shopkeeperSummary } from '@/lib/shopkeeper';
import { Badge } from '@/components/ui/Badge';
import { WorkspaceTools } from './workspace-tools';

const TASK_ICONS = { bill: Receipt, payment: Banknote, customers: Users, items: Package, stock: Boxes, expense: Wallet, members: Users, bookings: CalendarDays };
const panel = 'workspace-panel overflow-hidden rounded-xl border border-stone-200 bg-panel';

function AccessNotice() {
  const params = useSearchParams();
  if (!params.get('locked')) return null;
  return <p role="status" className="rounded-lg border border-stone-200 bg-panel p-4 text-sm text-stone-600">That tool is not enabled for this business. <Link href="/business" className="font-semibold underline">Review business details</Link></p>;
}

export function SimpleHome({ onDetails }: { onDetails: () => void }) {
  const { state, hydrated } = useDukaanStore();
  const { allows } = usePortal();
  const { entitlement } = usePlan();
  const { locale } = useI18n();
  const [toolsOpen, setToolsOpen] = useState(false);
  const summary = shopkeeperSummary(state);
  const canOpen = (href: string) => allows(href) && checkPlanAccess(entitlement, href).allowed;
  const tasks = DAILY_TASKS.filter(task => canOpen(task.href));
  const primary = tasks[0];
  const PrimaryIcon = primary ? TASK_ICONS[primary.icon] : Receipt;
  const recentBills = [...state.invoices].reverse().slice(0, 5);
  const billsOpen = canOpen('/billing');
  const setupSteps = [
    { label: 'Add your products or services', href: '/products', complete: state.products.length > 0 },
    { label: 'Create your first bill', href: '/billing/new', complete: state.invoices.length > 0 },
  ].filter(step => canOpen(step.href));
  const completed = setupSteps.filter(step => step.complete).length;
  const needsSetup = hydrated && setupSteps.length > 0 && completed < setupSteps.length;
  const attention = [
    { label: 'Customer balances to follow up', href: '/customers', value: formatCurrency(summary.customersOwe, locale), icon: Users },
    { label: 'Products at their reorder level', href: '/inventory', value: String(summary.lowStock), icon: Boxes },
  ].filter(item => canOpen(item.href));

  return <div className="workspace-home mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <Suspense fallback={null}><AccessNotice /></Suspense>
    <header className="workspace-hero flex flex-wrap items-center justify-between gap-4"><div className="workspace-hero-art" aria-hidden="true" />
      <div>
        <p className="workspace-eyebrow">TODAY, AT A GLANCE</p><h1 className="workspace-hero-title">Your business, in focus.</h1>
        <p className="workspace-hero-description">{hydrated ? state.profile.name || 'My Business' : 'Loading business…'}<span className="mx-2 text-stone-300" aria-hidden="true">/</span>Your business at a glance</p>
      </div>
      {primary ? <Link href={primary.href} className="workspace-primary-action inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"><PrimaryIcon size={16} aria-hidden="true" />{primary.label}</Link> : null}
    </header>

    <section aria-label="Business summary" className="workspace-summary">
      <div className="workspace-summary-heading flex items-center justify-between px-1 py-1"><h2 className="text-sm font-semibold text-stone-900">Business snapshot</h2><span className="rounded-md bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600">Saved records</span></div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: 'Received today', value: formatCurrency(summary.receivedToday, locale), detail: 'Cash, UPI, card and bank', icon: Banknote },
          { label: 'Customer balances', value: formatCurrency(summary.customersOwe, locale), detail: 'Outstanding across customers', icon: Users },
          { label: 'Saved bills', value: String(state.invoices.length), detail: 'All recorded bills', icon: Receipt },
          { label: 'Low stock', value: String(summary.lowStock), detail: 'Products at reorder level', icon: Boxes },
        ].map((item, index) => <div key={item.label} className={`workspace-metric workspace-metric-${index}`}><dt><span>{item.label}</span><item.icon size={17} strokeWidth={1.6} aria-hidden="true" /></dt><dd><strong data-sensitive="true" className="workspace-metric-number">{hydrated ? item.value : '—'}</strong><span className="workspace-metric-detail">{item.detail}</span></dd></div>)}
      </dl>
    </section>

    {needsSetup ? <section aria-labelledby="setup-heading" className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h2 id="setup-heading" className="text-sm font-semibold text-stone-900">Get your business ready</h2><p className="mt-1 text-xs text-stone-600">Start with your catalogue, then save a real customer bill.</p></div><span className="text-xs font-medium text-stone-600">{completed} / {setupSteps.length} complete</span></div>
      <div className="workspace-setup-progress h-1 bg-stone-100" role="progressbar" aria-label="Business setup" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={setupSteps.length}><div className="h-full bg-brand-500" style={{ width: `${completed / setupSteps.length * 100}%` }} /></div>
      <ul className="divide-y divide-stone-200">{setupSteps.map(step => <li key={step.href}><Link href={step.href} className="flex min-h-14 items-center gap-3 px-5 py-3 text-sm hover:bg-stone-50">{step.complete ? <Check size={17} className="text-emerald-700" aria-hidden="true" /> : <Circle size={17} className="text-stone-400" aria-hidden="true" />}<span className="flex-1 text-stone-800">{step.label}<span className="sr-only">{step.complete ? ' — complete' : ' — not complete'}</span></span><ArrowRight size={14} className="text-stone-400" aria-hidden="true" /></Link></li>)}</ul>
    </section> : null}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        {billsOpen ? <section aria-labelledby="recent-bills-heading" className={panel}>
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3"><h2 id="recent-bills-heading" className="text-sm font-semibold text-stone-900">Recent bills</h2><Link href="/billing" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-stone-600">View all<ArrowRight size={13} aria-hidden="true" /></Link></div>
          {!hydrated ? <p className="p-6 text-sm text-stone-600">Loading bills…</p> : recentBills.length ? <ul className="divide-y divide-stone-200">{recentBills.map(invoice => <li key={invoice.id}><Link href={`/billing?invoice=${encodeURIComponent(invoice.id)}`} className="flex min-h-20 items-center justify-between gap-3 px-5 py-3 hover:bg-stone-50"><span className="min-w-0"><span className="block truncate text-sm font-medium text-stone-900">{invoice.customerName}</span><span className="mt-1 block truncate text-xs text-stone-500">{invoice.id}</span></span><span className="shrink-0 text-right"><span data-sensitive="true" className="mb-1.5 block text-sm font-semibold tabular-nums text-stone-900">{formatInvoiceAmount(invoice.totalAmount)}</span><Badge tone={invoice.paymentStatus === 'paid' ? 'emerald' : 'amber'}>{invoice.paymentStatus}</Badge></span></Link></li>)}</ul> : <div className="workspace-empty-state px-6 py-12 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100"><Receipt size={25} strokeWidth={1.4} className="text-stone-500" aria-hidden="true" /></span><h3 className="mt-4 text-sm font-semibold text-stone-900">Your sales story starts here</h3><p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-stone-600">Create a bill to see customer purchases and payment status in one place.</p><Link href="/billing/new" className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-brand-600">Create a bill<ArrowRight size={14} aria-hidden="true" /></Link></div>}
        </section> : null}
        {attention.length ? <section aria-labelledby="attention-heading" className={panel}><h2 id="attention-heading" className="border-b border-stone-200 px-5 py-4 text-sm font-semibold text-stone-900">Needs attention</h2><ul className="divide-y divide-stone-200">{attention.map(item => { const Icon = item.icon; return <li key={item.href}><Link href={item.href} className="flex min-h-14 items-center gap-3 px-5 py-3 text-xs hover:bg-stone-50"><Icon size={16} className="shrink-0 text-stone-500" aria-hidden="true" /><span className="flex-1 leading-relaxed text-stone-700">{item.label}</span><span data-sensitive="true" className="font-semibold tabular-nums text-stone-900">{hydrated ? item.value : '—'}</span><ArrowRight size={13} className="shrink-0 text-stone-400" aria-hidden="true" /></Link></li>; })}</ul></section> : null}
      </div>
      <section aria-labelledby="daily-jobs-heading" className={panel}>
        <h2 id="daily-jobs-heading" className="border-b border-stone-200 px-5 py-4 text-sm font-semibold text-stone-900">Quick actions</h2>
        <ul className="divide-y divide-stone-200">{tasks.slice(1, 6).map(task => { const Icon = TASK_ICONS[task.icon]; return <li key={task.href}><Link href={task.href} className="workspace-action-row flex items-start gap-3 px-5 py-4 hover:bg-stone-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-50"><Icon size={16} strokeWidth={1.7} className="text-stone-600" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-stone-900">{task.label}</span><span className="mt-1.5 block text-[11px] leading-relaxed text-stone-500">{task.description}</span></span><ArrowRight size={13} className="mt-2 shrink-0 text-stone-400" aria-hidden="true" /></Link></li>; })}</ul>
        <button type="button" onClick={() => setToolsOpen(value => !value)} aria-expanded={toolsOpen} aria-controls="workspace-tools" className="flex min-h-12 w-full items-center gap-2 border-t border-stone-200 px-5 text-xs font-medium text-stone-600 hover:bg-stone-50"><Search size={14} aria-hidden="true" />Browse workspace tools<ChevronDown size={14} className={`ml-auto ${toolsOpen ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
      </section>
    </div>
    {toolsOpen ? <div id="workspace-tools"><WorkspaceTools /></div> : null}
    <footer className="flex flex-wrap items-center justify-center gap-2 pb-2 text-xs text-stone-500"><span>Looking for more detail?</span><button type="button" onClick={onDetails} className="min-h-11 font-medium text-stone-700 underline-offset-4 hover:underline">Open specialist overview</button></footer>
  </div>;
}
