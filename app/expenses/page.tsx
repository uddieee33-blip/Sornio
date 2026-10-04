'use client';

import { useState } from 'react';
import { PieChart, Plus, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore } from '@/lib/store';

const CATEGORIES = ['Rent', 'Electricity', 'Marketing', 'Software', 'Salaries', 'Supplies', 'Other'];
const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function ExpensesPage() {
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState({ category: 'Rent', amount: '', method: 'Cash' as PaymentMethod });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const expenseLedger = state.transactions.filter((tx) => tx.type === 'expense').reverse();
  const totalExpenses = expenseLedger.reduce((sum, tx) => sum + tx.amount, 0);

  const byCategory = expenseLedger.reduce<Record<string, number>>((acc, tx) => {
    const category = tx.description.replace(/ expense$/, '');
    acc[category] = (acc[category] ?? 0) + tx.amount;
    return acc;
  }, {});

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
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader eyebrow="Operations" title="Expenses" subtitle="Record operating expenses — they immediately reduce profit and cash in every report." />

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
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
              <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
            ) : null}
            <div className="mt-5 flex justify-end">
              <Button onClick={handleSubmit}><Plus size={16} /> Record expense</Button>
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<PieChart size={17} />}>Expense ledger</CardTitle>
              <Badge tone="red">Total {formatCurrency(totalExpenses)}</Badge>
            </div>

            <div className="space-y-2">
              {Object.entries(byCategory).map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  <span className="font-medium">{category}</span>
                  <strong className="tabular-nums text-slate-900">{formatCurrency(amount)}</strong>
                </div>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-semibold text-slate-700">Recent entries</h3>
            <div className="mt-2 space-y-2">
              {expenseLedger.slice(0, 8).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm transition hover:border-red-200 hover:shadow-card">
                  <div>
                    <p className="font-medium text-slate-800">{tx.description}</p>
                    <p className="text-xs text-slate-500">{tx.date} · {tx.paymentMethod ?? '—'}</p>
                  </div>
                  <span className="font-bold tabular-nums text-red-600">−{formatCurrency(tx.amount)}</span>
                </div>
              ))}
              {expenseLedger.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No expenses recorded yet.</p> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
