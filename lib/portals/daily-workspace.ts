import { businessDate, customerBalance } from '@/lib/accounting';
import { shopkeeperSummary } from '@/lib/shopkeeper';
import type { StoreState } from '@/lib/store';
import type { PortalId } from './types';

import { dailyWorkspace, type Metric } from '../../packages/business-domain/src/daily-workspace';
export { dailyWorkspace, DAILY_WORKSPACES } from '../../packages/business-domain/src/daily-workspace';
export type { DailyTask, DailyWorkspace } from '../../packages/business-domain/src/daily-workspace';

type DailyRecords = Pick<StoreState, 'profile' | 'transactions' | 'products' | 'customers' | 'invoices' | 'members' | 'plans' | 'subscriptions' | 'checkIns' | 'appointments'>;
export type FocusRow = { id: string; title: string; detail: string; href: string; amount?: number };
export type DailyFocus = { title: string; description: string; empty: string; href: string; cta: string; rows: FocusRow[] };
const dateAfter = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** A read-only projection; all dates use the business timezone and all dues use the ledger. */
export function dailyWorkspaceSnapshot(id: PortalId, state: DailyRecords, now = new Date(), locale = 'en-IN') {
  const config = dailyWorkspace(id);
  const timezone = state.profile.timezone || 'Asia/Kolkata';
  const today = businessDate(now, timezone);
  const stampDay = (value: string) => Number.isFinite(Date.parse(value)) ? businessDate(new Date(value), timezone) : '';
  const summary = shopkeeperSummary(state, now);
  const current = state.subscriptions.filter(s => (s.status === 'active' || s.status === 'expiring_soon') && s.startDate <= today && s.expiryDate >= today);
  const renewals = current.filter(s => s.expiryDate <= dateAfter(today, 7)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const bookings = state.appointments.filter(a => a.status !== 'cancelled' && stampDay(a.startAt) === today).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const balances = state.customers.map(customer => ({ customer, balance: customerBalance(customer, state.transactions) })).filter(row => row.balance > 0).sort((a, b) => b.balance - a.balance);
  const values: Record<Metric, number> = {
    received: summary.receivedToday, dues: summary.customersOwe, lowStock: summary.lowStock, bills: state.invoices.length,
    salesToday: state.transactions.filter(t => t.type === 'sale' && t.direction === 'in' && t.date === today).reduce((n, t) => n + t.amount, 0),
    billsToday: state.invoices.filter(i => stampDay(i.createdAt) === today).length,
    activeMembers: new Set(current.map(s => s.memberId)).size, renewals: renewals.length,
    checkins: state.checkIns.filter(c => stampDay(c.at) === today).length,
    appointments: bookings.length, clients: state.customers.length,
    pendingBills: state.invoices.filter(i => i.paymentStatus === 'pending' || i.paymentStatus === 'partial').length,
  };
  const currency = new Set<Metric>(['received', 'dues', 'salesToday']);
  const metrics = config.metrics.map(metric => ({ ...metric, value: values[metric.metric], currency: currency.has(metric.metric) }));
  const members = new Map(state.members.map(m => [m.id, m.name]));
  let focus: DailyFocus | null = null;
  if (config.focus === 'renewals') focus = {
    title: 'Upcoming renewals', description: 'Current memberships expiring in the next 7 days.', empty: 'No current membership expires in the next 7 days.', href: '/memberships', cta: 'Open plans & members',
    rows: renewals.slice(0, 5).map(s => ({ id: s.id, title: members.get(s.memberId) ?? 'Member', detail: `Expires ${s.expiryDate}`, href: '/memberships' })),
  };
  if (config.focus === 'appointments') focus = {
    title: 'Today’s appointments', description: 'Your saved bookings, in time order.', empty: 'No appointments are booked for today.', href: '/appointments', cta: 'Open appointment book',
    rows: bookings.slice(0, 5).map(a => ({ id: a.id, title: a.customerName, detail: `${new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(a.startAt))} · ${a.service || 'Service'}`, href: '/appointments', amount: a.amount })),
  };
  if (config.focus === 'dues') focus = {
    title: 'Udhaar khata', description: 'Current customer balances, with the largest first.', empty: 'There are no outstanding customer balances.', href: '/customers', cta: 'Open udhaar khata',
    rows: balances.slice(0, 5).map(({ customer, balance }) => ({ id: customer.id, title: customer.name, detail: 'Outstanding balance', href: '/customers', amount: balance })),
  };
  return { config, metrics, focus, summary };
}

