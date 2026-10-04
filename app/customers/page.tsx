'use client';

import { useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

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
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader
          eyebrow="People"
          title="Customers"
          subtitle="Customer profiles with contact details and outstanding balances."
          actions={<Badge tone="brand" dot>{state.customers.length} customers</Badge>}
        />

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="animate-fade-up h-fit">
            <div className="mb-5"><CardTitle icon={<UserPlus size={17} />}>Add customer</CardTitle></div>
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className={inputClass} />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className={inputClass} />
            </div>
            {message ? (
              <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSubmit}><UserPlus size={16} /> Add customer</Button>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Outstanding customer balances total <strong className="tabular-nums">{formatCurrency(receivables)}</strong>. Follow up to convert receivables into cash.
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Users size={17} />}>Customer directory</CardTitle>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {state.customers.map((customer) => (
                <div key={customer.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">
                      {customer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{customer.name}</p>
                      <p className="truncate text-xs text-slate-500">{customer.phone ?? 'No phone on file'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-semibold ${customer.openingBalance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {customer.openingBalance > 0 ? `Owes ${formatCurrency(customer.openingBalance)}` : 'Settled'}
                    </span>
                    <span className="text-slate-500">since {new Date(customer.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
