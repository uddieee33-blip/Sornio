'use client';

/**
 * Cockpit metrics.
 *
 * The cockpit shows four figures, and *which* four is the difference between a
 * console that feels like someone else's software and one that feels like it was
 * built for this shop. A gym opens on check-ins and renewals; a kirana opens on
 * the counter and udhaar; a salon opens on the day book.
 *
 * Every number here is computed from records the owner actually entered. There
 * is no sample data, no rounding up, and no placeholder — an empty ledger shows
 * an honest zero with the reason next to it.
 */

import { daysUntil } from '@/lib/models/membership';
import type { Invoice } from '@/lib/models/billing';
import type { MembershipSubscription } from '@/lib/models/membership';
import type { Product, Transaction } from '@/lib/business-data';
import type { Appointment, CheckIn, Customer } from '@/lib/store';
import type { MetricKey } from './types';

export type CockpitContext = {
  transactions: Transaction[];
  products: Product[];
  customers: Customer[];
  subscriptions: MembershipSubscription[];
  invoices: Invoice[];
  checkIns: CheckIn[];
  appointments: Appointment[];
  /** Net profit and cash balance, already summed by the financial engine. */
  netProfit: number;
  cashBalance: number;
  now: Date;
  formatCurrency: (value: number) => string;
};

export type MetricReading = { value: string; sub?: string };

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const monthKey = (date: Date) => date.toISOString().slice(0, 7);

function sum(transactions: Transaction[], predicate: (tx: Transaction) => boolean): number {
  return transactions.filter(predicate).reduce((total, tx) => total + tx.amount, 0);
}

function isSale(tx: Transaction) {
  return tx.type === 'sale' && tx.direction === 'in';
}

export function resolveMetric(key: MetricKey, ctx: CockpitContext): MetricReading {
  const today = dayKey(ctx.now);
  const thisMonth = monthKey(ctx.now);
  const { transactions, products, customers, subscriptions, invoices, checkIns, appointments, formatCurrency } = ctx;

  switch (key) {
    case 'todaySales': {
      const value = sum(transactions, (tx) => isSale(tx) && tx.date === today);
      const orders = transactions.filter((tx) => isSale(tx) && tx.date === today).length;
      return { value: formatCurrency(value), sub: orders > 0 ? `${orders} entr${orders === 1 ? 'y' : 'ies'} recorded` : undefined };
    }

    case 'todayCollected': {
      const value = sum(transactions, (tx) => tx.type === 'payment' && tx.direction === 'in' && tx.date === today);
      return { value: formatCurrency(value) };
    }

    case 'monthRevenue': {
      const value = sum(transactions, (tx) => isSale(tx) && tx.date.startsWith(thisMonth));
      return { value: formatCurrency(value) };
    }

    case 'expensesThisMonth': {
      const value = sum(transactions, (tx) => tx.type === 'expense' && tx.direction === 'out' && tx.date.startsWith(thisMonth));
      return { value: formatCurrency(value) };
    }

    case 'netProfit':
      return { value: formatCurrency(ctx.netProfit) };

    case 'cashPosition':
      return { value: formatCurrency(ctx.cashBalance) };

    case 'activeMembers': {
      const value = subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'expiring_soon').length;
      return { value: String(value), sub: subscriptions.length > 0 ? `of ${subscriptions.length} on record` : 'no plans sold yet' };
    }

    case 'renewalsDue7': {
      const due = subscriptions.filter((subscription) => {
        const days = daysUntil(subscription.expiryDate, ctx.now);
        return days >= 0 && days <= 7;
      }).length;
      const overdue = subscriptions.filter((subscription) => daysUntil(subscription.expiryDate, ctx.now) < 0).length;
      return { value: String(due), sub: overdue > 0 ? `${overdue} already lapsed` : undefined };
    }

    case 'checkedInToday': {
      const value = checkIns.filter((entry) => entry.at.slice(0, 10) === today).length;
      const inGym = checkIns.filter((entry) => entry.at.slice(0, 10) === today && !entry.outAt).length;
      return { value: String(value), sub: inGym > 0 ? `${inGym} still on the floor` : undefined };
    }

    case 'membersOnFile':
      return { value: String(customers.length) };

    case 'clientsOnFile': {
      const value = customers.filter((customer) => Boolean(customer.phone?.trim())).length;
      return { value: String(value), sub: `${customers.length} total on file` };
    }

    case 'stockValue': {
      const value = products
        .filter((product) => product.itemType === 'product')
        .reduce((total, product) => total + product.stock * product.cost, 0);
      const units = products.filter((product) => product.itemType === 'product').reduce((total, product) => total + product.stock, 0);
      return { value: formatCurrency(value), sub: `${units} units on hand` };
    }

    case 'reorderCount': {
      const low = products.filter(
        (product) => product.itemType === 'product' && product.status === 'Active' && product.stock <= product.reorderLevel,
      );
      return { value: String(low.length), sub: low.length === 0 ? 'all above reorder level' : low.slice(0, 2).map((product) => product.name).join(', ') };
    }

    case 'udhaarOutstanding': {
      const open = customers.filter((customer) => customer.openingBalance > 0);
      const value = open.reduce((total, customer) => total + customer.openingBalance, 0);
      return { value: formatCurrency(value), sub: open.length > 0 ? `${open.length} khata${open.length === 1 ? '' : 's'} open` : 'all settled' };
    }

    case 'appointmentsToday': {
      const todays = appointments.filter(
        (appointment) => appointment.startAt.slice(0, 10) === today && appointment.status !== 'cancelled',
      );
      const done = todays.filter((appointment) => appointment.status === 'done').length;
      return { value: String(todays.length), sub: todays.length > 0 ? `${done} completed` : undefined };
    }

    case 'avgBill': {
      const recent = transactions.filter((tx) => isSale(tx) && tx.date >= dayKey(new Date(ctx.now.getTime() - 29 * 864e5)));
      if (recent.length === 0) return { value: formatCurrency(0), sub: 'no sales recorded yet' };
      const total = recent.reduce((running, tx) => running + tx.amount, 0);
      return { value: formatCurrency(Math.round(total / recent.length)), sub: `across ${recent.length} sales (30 days)` };
    }

    case 'pendingInvoices': {
      const pending = invoices.filter((invoice) => invoice.paymentStatus === 'pending' || invoice.paymentStatus === 'partial');
      const value = pending.reduce((total, invoice) => total + invoice.totalAmount, 0);
      return { value: String(pending.length), sub: pending.length > 0 ? `${formatCurrency(value)} to collect` : 'nothing outstanding' };
    }

    default:
      return { value: '—' };
  }
}
