'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

export default function CustomersPage() {
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const receivables = state.customers.reduce((sum, customer) => sum + customer.openingBalance, 0);

  const handleSubmit = () => {
    const result = actions.addCustomer(form);
    if (result.ok) {
      setMessage({ tone: 'ok', text: `${form.name.trim()} added to customers.` });
      setForm({ name: '', phone: '' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not add customer.' });
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="mt-2 text-slate-600">Customer profiles with contact details and outstanding balances.</p>
        </div>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">{state.customers.length} customers</span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Add customer</h2>
          <div className="mt-4 space-y-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" />
          </div>
          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button onClick={handleSubmit} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add customer</button>
          </div>

          <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Outstanding customer balances total <strong>{formatCurrency(receivables)}</strong>. Follow up to convert receivables into cash.
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Customer directory</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {state.customers.map((customer) => (
              <div key={customer.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">{customer.name}</p>
                <p className="mt-1 text-sm text-slate-500">{customer.phone ?? 'No phone on file'}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={`rounded-full px-2 py-1 ${customer.openingBalance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {customer.openingBalance > 0 ? `Owes ${formatCurrency(customer.openingBalance)}` : 'Settled'}
                  </span>
                  <span className="text-slate-500">since {new Date(customer.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
