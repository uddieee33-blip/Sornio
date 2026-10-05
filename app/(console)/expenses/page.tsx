'use client';

import { useState } from 'react';
import { PieChart, Plus, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatCurrency } from '@/lib/business-data';
import { expensesByCategory } from '@/lib/chart-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore } from '@/lib/store';

const CATEGORIES = ['Rent', 'Electricity', 'Marketing', 'Salaries', 'Supplies', 'Software', 'Transport', 'Other'];
const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

export default function ExpensesPage() {
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState({ category: 'Rent', amount: '', method: 'Cash' as PaymentMethod });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const expenseLedger = state.transactions.filter((tx) => tx.type === 'expense').reverse();
  const totalExpenses = expenseLedger.reduce((sum, tx) => sum + tx.amount, 0);
  const byCategory = expensesByCategory(state.transactions);

  const handleSubmit = () => {
    const result = actions.recordExpense({ category: form.category, amount: Number(form.amount || 0), method: form.method });
    if (result.ok) {
      setMessage({ tone: 'ok', text: `${form.category} expense of ${formatCurrency(Number(form.amount))} recorded via ${form.method}.` });
      setForm({ ...form, amount: '' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not record expense.' });
    }
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader eyebrow="Operations" title="Expenses" subtitle="Record operating expenses — they immediately reduce profit and cash in every report." />

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="animate-fade-up h-fit">
          <div className="mb-5"><CardTitle icon={<Wallet size={17} />}>Record expense</CardTitle></div>
          <div className="space-y-4">
            <div><span className={labelClass}>Category</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
            <div><span className={labelClass}>Amount (₹)</span>
              <input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} placeholder="0" />
            </div>
            <div><span className={labelClass}>Paid via</span>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className={inputClass}>
                {METHODS.map((method) => <option key={method}>{method}</option>)}
              </select>
            </div>
          </div>
          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button onClick={handleSubmit}><Plus size={16} /> Record expense</Button>
          </div>
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<PieChart size={17} />}>Where the money goes</CardTitle>
            <Badge tone="red">Total {formatCurrency(totalExpenses)}</Badge>
          </div>
          {byCategory.length > 0 ? (
            <DonutChart data={byCategory} centerLabel="Spent" centerValue={formatCurrency(totalExpenses)} height={200} />
          ) : (
            <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">No expenses recorded yet.</p>
          )}

          <h3 className="mt-6 text-sm font-semibold text-stone-700">Recent entries</h3>
          <div className="mt-2 space-y-2">
            {expenseLedger.slice(0, 6).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-xl border border-stone-200 p-3 text-sm transition hover:border-red-400/25">
                <div>
                  <p className="font-medium text-stone-800">{tx.description}</p>
                  <p className="text-xs text-stone-600">{tx.date} · {tx.paymentMethod ?? '—'}</p>
                </div>
                <span className="font-bold text-red-700 tabular-nums">−{formatCurrency(tx.amount)}</span>
              </div>
            ))}
            {expenseLedger.length === 0 ? <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">Nothing yet.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
