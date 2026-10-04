'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/business-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore } from '@/lib/store';

const CATEGORIES = ['Rent', 'Electricity', 'Marketing', 'Software', 'Salaries', 'Supplies', 'Other'];
const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

export default function ExpensesPage() {
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState({ category: 'Rent', amount: '', method: 'Cash' as PaymentMethod });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const expenseLedger = state.transactions
    .filter((tx) => tx.type === 'expense')
    .reverse();

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

  const inputClass = 'rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900';

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Expenses</h1>
      <p className="mt-2 text-slate-600">Record operating expenses — they immediately reduce profit and cash in every report.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Record expense</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-slate-700">
              <span className="mb-2 block font-medium">Category</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${inputClass} w-full`}>
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-2 block font-medium">Amount (₹)</span>
              <input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${inputClass} w-full`} placeholder="0" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-2 block font-medium">Paid via</span>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className={`${inputClass} w-full`}>
                {METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
          </div>
          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <button onClick={handleSubmit} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Record expense</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Expense ledger</h2>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">Total {formatCurrency(totalExpenses)}</span>
          </div>

          <div className="mt-4 space-y-2">
            {Object.entries(byCategory).map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <span>{category}</span>
                <strong className="text-slate-900">{formatCurrency(amount)}</strong>
              </div>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold text-slate-700">Recent entries</h3>
          <div className="mt-2 space-y-2">
            {expenseLedger.slice(0, 8).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                <div>
                  <p className="text-slate-800">{tx.description}</p>
                  <p className="text-xs text-slate-500">{tx.date} · {tx.paymentMethod ?? '—'}</p>
                </div>
                <span className="font-medium text-red-700">−{formatCurrency(tx.amount)}</span>
              </div>
            ))}
            {expenseLedger.length === 0 ? <p className="rounded-xl border border-slate-200 p-3 text-sm text-slate-500">No expenses recorded yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
