import type { Transaction } from '@/lib/business-data';

export type TimePoint = { date: string; label: string; value: number };
export type Slice = { name: string; value: number };

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Sum an amount per day for matching transactions, zero-filled across the window. */
function dailyTotals(transactions: Transaction[], match: (tx: Transaction) => boolean, days = 14): TimePoint[] {
  const windowDays = lastNDays(days);
  const byDate = new Map<string, number>(windowDays.map((d) => [d, 0]));
  for (const tx of transactions) {
    if (match(tx) && byDate.has(tx.date)) {
      byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + tx.amount);
    }
  }
  return windowDays.map((date) => ({ date, label: dayLabel(date), value: byDate.get(date) ?? 0 }));
}

export function revenueSeries(transactions: Transaction[], days = 14): TimePoint[] {
  return dailyTotals(transactions, (tx) => tx.type === 'sale' && tx.direction === 'in', days);
}

export function expenseSeries(transactions: Transaction[], days = 14): TimePoint[] {
  return dailyTotals(transactions, (tx) => tx.type === 'expense' && tx.direction === 'out', days);
}

/** Daily money arriving in cash/bank/UPI/card accounts (payment receipts). */
export function cashInSeries(transactions: Transaction[], days = 14): TimePoint[] {
  return dailyTotals(
    transactions,
    (tx) => tx.type === 'payment' && tx.direction === 'in' && ['cash', 'upi', 'bank', 'card'].includes(tx.account),
    days,
  );
}

/** Daily money leaving cash/bank/UPI/card accounts (expense payouts, sweeps). */
export function cashOutSeries(transactions: Transaction[], days = 14): TimePoint[] {
  return dailyTotals(
    transactions,
    (tx) => tx.type === 'payment' && tx.direction === 'out' && ['cash', 'upi', 'bank', 'card'].includes(tx.account),
    days,
  );
}

export function cashflowSeries(transactions: Transaction[], days = 14): TimePoint[] {
  return dailyTotals(
    transactions,
    (tx) => tx.type === 'payment' && ['cash', 'upi', 'bank', 'card'].includes(tx.account),
    days,
  ).map((point, index, all) => {
    // Convert per-day signed flow into a running balance shape for the chart.
    const signed = transactions
      .filter((tx) => tx.type === 'payment' && ['cash', 'upi', 'bank', 'card'].includes(tx.account) && tx.date === point.date)
      .reduce((sum, tx) => sum + (tx.direction === 'in' ? tx.amount : -tx.amount), 0);
    const prior = all.slice(0, index).reduce((sum, p) => sum + (p as TimePoint & { signed?: number }).value, 0);
    return { ...point, value: prior + signed };
  });
}

export function expensesByCategory(transactions: Transaction[]): Slice[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.direction !== 'out') continue;
    const category = tx.description.replace(/ expense$/, '');
    totals.set(category, (totals.get(category) ?? 0) + tx.amount);
  }
  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function paymentsByMethod(transactions: Transaction[]): Slice[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'payment' || tx.direction !== 'in') continue;
    const method = tx.paymentMethod ?? 'Other';
    totals.set(method, (totals.get(method) ?? 0) + tx.amount);
  }
  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function revenueByCategoryHint(transactions: Transaction[]): Slice[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'sale' || tx.direction !== 'in') continue;
    const category = tx.description.includes('membership') || tx.description.includes('Membership')
      ? 'Memberships'
      : tx.description.replace(/^(Retail sale|Sale of \d+ item\(s\)) — /, '').replace(/^Sale of \d+ item\(s\)$/, 'Retail');
    totals.set(category, (totals.get(category) ?? 0) + tx.amount);
  }
  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}
