'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Banknote, Boxes, CalendarDays, Check, ChevronDown, Circle, Package, Receipt, Search, SlidersHorizontal, UserCheck, Users, Wallet } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { usePlan } from '@/components/billing/plan-provider';
import { checkPlanAccess } from '@/lib/plans/routes';
import { formatCurrency } from '@/lib/business-data';
import { formatInvoiceAmount } from '@/lib/invoices';
import { useI18n } from '@/lib/i18n';
import { dailyWorkspaceSnapshot, type DailyFocus } from '@/lib/portals/daily-workspace';
import { portalHasModule } from '@/lib/portals/registry';
import { Badge } from '@/components/ui/Badge';
import { WorkspaceTools } from './workspace-tools';

const TASK_ICONS = { bill: Receipt, payment: Banknote, customers: Users, items: Package, stock: Boxes, expense: Wallet, members: Users, bookings: CalendarDays, checkin: UserCheck };

function AccessNotice() {
  const params = useSearchParams();
  if (!params.get('locked')) return null;
  return (
    <p role="status" className="home-access-notice">
      That tool is not enabled for this business.{' '}
      <Link href="/business">Review business details</Link>
    </p>
  );
}

/** The daily home: a quiet working surface, with real records and existing access rules. */
export function SimpleHome({ onDetails }: { onDetails: () => void }) {
  const { state, hydrated } = useDukaanStore();
  const { allows, portal } = usePortal();
  const { entitlement } = usePlan();
  const { locale } = useI18n();
  const [toolsOpen, setToolsOpen] = useState(false);
  const snapshot = dailyWorkspaceSnapshot(portal.id, state, new Date(), locale);
  const { config, summary } = snapshot;
  const canOpen = (href: string) => allows(href) && checkPlanAccess(entitlement, href).allowed;
  const tasks = config.tasks.filter(task => canOpen(task.href));
  const primary = tasks[0];
  const PrimaryIcon = primary ? TASK_ICONS[primary.icon] : Receipt;
  const recentBills = [...state.invoices].reverse().slice(0, 5);
  const billsOpen = portalHasModule(portal.id, 'billing') && canOpen('/billing');
  const focus = snapshot.focus && canOpen(snapshot.focus.href) ? snapshot.focus : null;
  const setupSteps = config.setup.map(step => ({ ...step, complete: state[step.collection].length > 0 })).filter(step => canOpen(step.href));
  const completed = setupSteps.filter(step => step.complete).length;
  const needsSetup = hydrated && setupSteps.length > 0 && completed < setupSteps.length;
  const attention = [
    { label: 'Customer balances to follow up', href: '/customers', value: formatCurrency(summary.customersOwe, locale), count: summary.customersOwe, icon: Users },
    { label: 'Products at their reorder level', href: '/inventory', value: String(summary.lowStock), count: summary.lowStock, icon: Boxes },
  ].filter(item => canOpen(item.href) && (item.href === '/customers' ? portal.id === 'kirana' || portal.id === 'general' : portalHasModule(portal.id, 'inventory')));
  const hasAttention = attention.some(item => item.count > 0);
  const metrics = snapshot.metrics.map(metric => ({ ...metric, value: metric.currency ? formatCurrency(metric.value, locale) : String(metric.value) }));

  return (
    <div className="workspace-home sornio-home" data-business={portal.id}>
      <Suspense fallback={null}><AccessNotice /></Suspense>
      <header className="home-heading">
        <div>
          <p className="home-eyebrow">YOUR WORKSPACE</p>
          <h1>{config.title}</h1>
          <p className="home-subtitle">
            <strong>{hydrated ? state.profile.name || 'My Business' : 'Loading business…'}</strong>
            <span aria-hidden="true">·</span>{config.description}
          </p>
        </div>
        <div className="home-heading-actions">
          <button type="button" onClick={onDetails} className="home-secondary-button">
            <SlidersHorizontal size={15} aria-hidden="true" />Detailed overview
          </button>
          {primary ? (
            <Link href={primary.href} className="home-primary-button">
              <PrimaryIcon size={16} aria-hidden="true" />{primary.label}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </header>

      {needsSetup ? (
        <section aria-labelledby="setup-heading" className="home-setup home-panel">
          <div className="home-setup-intro">
            <span className="home-setup-symbol" aria-hidden="true"><PrimaryIcon size={21} strokeWidth={1.5} /></span>
            <div><h2 id="setup-heading">Get your business ready</h2><p>Start with the essentials for your business.</p></div>
            <span className="home-setup-count">{completed} / {setupSteps.length} complete</span>
          </div>
          <div className="home-setup-progress" role="progressbar" aria-label="Business setup" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={setupSteps.length}>
            <div style={{ width: `${completed / setupSteps.length * 100}%` }} />
          </div>
          <ul className="home-setup-steps">
            {setupSteps.map(step => (
              <li key={step.collection}>
                <Link href={step.href}>
                  {step.complete ? <Check size={17} aria-hidden="true" /> : <Circle size={17} aria-hidden="true" />}
                  <span>{step.label}<span className="sr-only">{step.complete ? ' — complete' : ' — not complete'}</span></span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="home-summary-heading" className="home-summary">
        <div className="home-section-label"><h2 id="home-summary-heading">Business snapshot</h2><span>Saved records</span></div>
        <dl className="home-metrics home-panel">
          {metrics.map(item => {
            const Icon = TASK_ICONS[item.icon];
            return <div key={item.label}>
              <dt><span>{item.label}</span><Icon size={16} strokeWidth={1.5} aria-hidden="true" /></dt>
              <dd><strong data-sensitive="true">{hydrated ? item.value : '—'}</strong><span>{item.detail}</span></dd>
            </div>;
          })}
        </dl>
      </section>

      <div className={`home-work-grid ${billsOpen || focus ? '' : 'home-work-grid-single'}`}>
        <div className="home-main-column">
        {focus ? <BusinessFocusPanel focus={focus} hydrated={hydrated} locale={locale} /> : null}
        {billsOpen ? (
          <section aria-labelledby="recent-bills-heading" className="home-panel home-recent">
            <div className="home-panel-heading">
              <div><h2 id="recent-bills-heading">Recent bills</h2><p>The latest activity at your counter.</p></div>
              <Link href="/billing" className="home-text-action">View all<ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            {!hydrated ? <p className="home-loading" role="status">Loading bills…</p> : recentBills.length ? (
              <ul className="home-bills-list">
                {recentBills.map(invoice => (
                  <li key={invoice.id}>
                    <Link href={`/billing?invoice=${encodeURIComponent(invoice.id)}`}>
                      <span className="home-bill-icon" aria-hidden="true"><Receipt size={18} strokeWidth={1.5} /></span>
                      <span className="home-bill-customer"><strong>{invoice.customerName}</strong><small>{invoice.id}</small></span>
                      <span className="home-bill-amount"><strong data-sensitive="true">{formatInvoiceAmount(invoice.totalAmount)}</strong><Badge tone={invoice.paymentStatus === 'paid' ? 'emerald' : 'amber'}>{invoice.paymentStatus}</Badge></span>
                      <ArrowUpRight size={15} className="home-row-arrow" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="home-empty">
                <span className="home-empty-illustration" aria-hidden="true"><span /><Receipt size={36} strokeWidth={1.1} /><span /></span>
                <h3>Your first bill starts a clearer day.</h3>
                <p>Create a bill to see customer purchases and payment status in one place.</p>
                {canOpen('/billing/new') ? <Link href="/billing/new" className="home-secondary-button">Create a bill<ArrowRight size={14} aria-hidden="true" /></Link> : null}
              </div>
            )}
            <div className="home-record-note"><Receipt size={13} aria-hidden="true" /><span>Only saved bills appear here.</span></div>
          </section>
        ) : null}

        </div>
        <div className="home-side-column">
          <section aria-labelledby="daily-jobs-heading" className="home-panel home-daily">
            <div className="home-panel-heading"><div><h2 id="daily-jobs-heading">Daily work</h2><p>Pick up where business needs you.</p></div></div>
            <ul className="home-task-list">
              {tasks.slice(1, 5).map(task => {
                const Icon = TASK_ICONS[task.icon];
                return (
                  <li key={task.href}>
                    <Link href={task.href}>
                      <span className="home-task-icon"><Icon size={18} strokeWidth={1.5} aria-hidden="true" /></span>
                      <span><strong>{task.label}</strong><small>{task.description}</small></span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setToolsOpen(value => !value)} aria-expanded={toolsOpen} aria-controls="workspace-tools" className="home-browse-tools">
              <Search size={15} aria-hidden="true" />Browse workspace tools<ChevronDown size={14} aria-hidden="true" />
            </button>
          </section>

          {attention.length ? (
            <section aria-labelledby="attention-heading" className="home-attention">
              <div className="home-section-label"><h2 id="attention-heading">Worth a look</h2><span>{hydrated ? hasAttention ? 'Review when ready' : 'Nothing pending here' : 'Loading…'}</span></div>
              <ul>
                {attention.map(item => (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <item.icon size={17} strokeWidth={1.5} aria-hidden="true" />
                      <span>{item.label}</span>
                      <strong data-sensitive="true">{hydrated ? item.value : '—'}</strong>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
      <div id="workspace-tools">{toolsOpen ? <WorkspaceTools /> : null}</div>
    </div>
  );
}

function BusinessFocusPanel({ focus, hydrated, locale }: { focus: DailyFocus; hydrated: boolean; locale: string }) {
  return <section className="home-panel" aria-labelledby="business-focus-title">
    <div className="home-panel-heading"><div><h2 id="business-focus-title">{focus.title}</h2><p>{focus.description}</p></div><Link href={focus.href} className="home-text-action">View all<ArrowRight size={14} aria-hidden="true" /></Link></div>
    {!hydrated ? <p className="home-loading" role="status">Loading records…</p> : focus.rows.length ? <ul className="home-focus-list">{focus.rows.map(row => <li key={row.id}><Link href={row.href}><span><strong>{row.title}</strong><small>{row.detail}</small></span>{row.amount !== undefined ? <strong data-sensitive="true">{formatCurrency(row.amount, locale)}</strong> : null}<ArrowUpRight size={15} aria-hidden="true" /></Link></li>)}</ul> : <div className="home-focus-empty"><Check size={25} strokeWidth={1.5} aria-hidden="true" /><p>{focus.empty}</p><Link href={focus.href} className="home-secondary-button">{focus.cta}<ArrowRight size={14} aria-hidden="true" /></Link></div>}
  </section>;
}
