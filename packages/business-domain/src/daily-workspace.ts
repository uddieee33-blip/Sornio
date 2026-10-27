import type { PortalId } from './business-types';

type TaskIcon = 'bill' | 'payment' | 'customers' | 'items' | 'stock' | 'expense' | 'members' | 'bookings' | 'checkin';
export type DailyTask = { href: string; label: string; description: string; icon: TaskIcon };
export type Metric = 'received' | 'dues' | 'bills' | 'lowStock' | 'salesToday' | 'billsToday' | 'activeMembers' | 'renewals' | 'checkins' | 'appointments' | 'clients' | 'pendingBills';
type MetricDefinition = { metric: Metric; label: string; detail: string; icon: TaskIcon };
type SetupStep = { label: string; href: string; collection: 'products' | 'invoices' | 'plans' | 'members' | 'appointments' };
export type DailyWorkspace = {
  title: string; description: string; tasks: readonly DailyTask[]; metrics: readonly MetricDefinition[];
  focus: 'bills' | 'renewals' | 'appointments' | 'dues'; setup: readonly SetupStep[];
};
const received: MetricDefinition = { metric: 'received', label: 'Received today', detail: 'Cash, UPI, card and bank', icon: 'payment' };
const bills: MetricDefinition = { metric: 'bills', label: 'Saved bills', detail: 'All recorded bills', icon: 'bill' };
const lowStock: MetricDefinition = { metric: 'lowStock', label: 'Low stock', detail: 'Products at reorder level', icon: 'stock' };
const dues: MetricDefinition = { metric: 'dues', label: 'Udhaar outstanding', detail: 'Current customer balances', icon: 'customers' };
const sales: MetricDefinition = { metric: 'salesToday', label: 'Sales today', detail: 'Sales recorded in your ledger', icon: 'bill' };
const appointments: MetricDefinition = { metric: 'appointments', label: 'Appointments today', detail: 'Excludes cancelled bookings', icon: 'bookings' };
const clients: MetricDefinition = { metric: 'clients', label: 'Clients on file', detail: 'Saved client records', icon: 'customers' };
const pending: MetricDefinition = { metric: 'pendingBills', label: 'Open bills', detail: 'Pending or partly paid', icon: 'bill' };
const makeBill: DailyTask = { href: '/billing/new', label: 'Make a bill', description: 'Add items, print a bill and record payment.', icon: 'bill' };
const collect: DailyTask = { href: '/payments', label: 'Collect payment', description: 'Record cash or UPI received from a customer.', icon: 'payment' };
const expense: DailyTask = { href: '/expenses', label: 'Add an expense', description: 'Record rent, purchases and other spending.', icon: 'expense' };
const retailSetup: SetupStep[] = [{ label: 'Add your products or services', href: '/products', collection: 'products' }, { label: 'Create your first bill', href: '/billing/new', collection: 'invoices' }];
const retailTasks: DailyTask[] = [makeBill, collect, { href: '/products', label: 'Items & prices', description: 'Add what you sell and change prices.', icon: 'items' }, { href: '/inventory', label: 'Check stock', description: 'See what is left and what needs restocking.', icon: 'stock' }, expense];

/** Business identity drives the daily jobs, not the subscription's module count. */
export const DAILY_WORKSPACES: Record<PortalId, DailyWorkspace> = {
  gym: {
    title: 'Front desk', description: 'Members, check-ins and upcoming renewals.', focus: 'renewals',
    tasks: [
      { href: '/check-ins', label: 'Check in a member', description: 'Record a member arriving at your front desk.', icon: 'checkin' },
      { href: '/memberships', label: 'Plans & members', description: 'Add a member, sell a plan or record a renewal.', icon: 'members' },
      { href: '/reminders', label: 'Renewal follow-ups', description: 'Prepare reminders for upcoming renewals.', icon: 'members' }, collect, expense,
    ],
    metrics: [
      { metric: 'activeMembers', label: 'Active members', detail: 'Distinct members with a current plan', icon: 'members' },
      { metric: 'checkins', label: 'Check-ins today', detail: 'Entries recorded at your front desk', icon: 'checkin' },
      { metric: 'renewals', label: 'Renewals due in 7 days', detail: 'Current plans nearing their expiry', icon: 'members' }, received,
    ],
    setup: [{ label: 'Create your membership plans', href: '/memberships', collection: 'plans' }, { label: 'Add your first member', href: '/memberships', collection: 'members' }],
  },
  cafe: {
    title: 'Service desk', description: 'Counter bills, collections and the pantry.', focus: 'bills',
    tasks: [{ ...makeBill, label: 'New customer bill', description: 'Choose menu items and record the customer bill.' }, { href: '/products', label: 'Update the menu', description: 'Manage menu items and prices.', icon: 'items' }, { href: '/inventory', label: 'Check the pantry', description: 'Review stock and items running low.', icon: 'stock' }, collect, expense],
    metrics: [sales, received, { metric: 'billsToday', label: 'Bills today', detail: 'Customer bills recorded today', icon: 'bill' }, { ...lowStock, label: 'Pantry items running low' }],
    setup: [{ label: 'Add your menu items', href: '/products', collection: 'products' }, retailSetup[1]],
  },
  kirana: {
    title: 'Shop counter', description: 'Billing, stock and your udhaar khata.', focus: 'dues',
    tasks: [makeBill, { href: '/customers', label: 'Udhaar khata', description: 'Review customer balances and record collections.', icon: 'customers' }, retailTasks[2], retailTasks[3], collect, expense],
    metrics: [received, dues, lowStock, bills], setup: retailSetup,
  },
  salon: {
    title: 'Appointments', description: 'Your appointment book, clients and collections.', focus: 'appointments',
    tasks: [{ href: '/appointments', label: 'Add a booking', description: 'Book a service and assign a time.', icon: 'bookings' }, { href: '/products', label: 'Services & prices', description: 'Manage the services your salon offers.', icon: 'items' }, { href: '/customers', label: 'Clients', description: 'Find a client and their contact details.', icon: 'customers' }, { href: '/memberships', label: 'Packages', description: 'Manage prepaid service packages.', icon: 'members' }, { ...makeBill, label: 'Bill a service' }, collect],
    metrics: [appointments, received, clients, pending],
    setup: [{ label: 'Add your services', href: '/products', collection: 'products' }, { label: 'Add your first booking', href: '/appointments', collection: 'appointments' }],
  },
  electronics: { title: 'Sales desk', description: 'Invoices, item prices and stock on hand.', focus: 'bills', tasks: retailTasks, metrics: [sales, received, pending, lowStock], setup: retailSetup },
  boutique: { title: 'Shop floor', description: 'Your collections, customer bills and stock.', focus: 'bills', tasks: [{ ...makeBill, label: 'New customer bill' }, { ...retailTasks[2], label: 'Collections & prices' }, retailTasks[3], collect, expense], metrics: [sales, received, lowStock, bills], setup: retailSetup },
  service: {
    title: 'Workday', description: 'Bookings, clients and invoices in one place.', focus: 'appointments',
    tasks: [{ href: '/appointments', label: 'Add a booking', description: 'Record the next customer appointment.', icon: 'bookings' }, { href: '/products', label: 'Services & prices', description: 'Manage your service list and rates.', icon: 'items' }, { ...makeBill, label: 'Create an invoice' }, collect, expense],
    metrics: [appointments, received, pending, clients],
    setup: [{ label: 'Add your services', href: '/products', collection: 'products' }, { label: 'Add your first booking', href: '/appointments', collection: 'appointments' }],
  },
  general: { title: 'Home', description: 'Your day, in one place.', focus: 'bills', tasks: retailTasks, metrics: [received, { ...dues, label: 'Customer balances' }, bills, lowStock], setup: retailSetup },
};

export function dailyWorkspace(id: PortalId): DailyWorkspace { return DAILY_WORKSPACES[id]; }

