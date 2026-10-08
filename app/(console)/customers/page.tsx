'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { useMemo, useState } from 'react';
import { IndianRupee, QrCode, Search, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/stat-card';
import { CustomerDetailModal } from '@/components/customers/customer-detail-modal';
import { formatCurrency } from '@/lib/business-data';
import { isValidUpiId, upiAccentColor } from '@/lib/upi';
import { ExportButton } from '@/components/export/export-button';
import { useDukaanStore, type Customer } from '@/lib/store';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  details: '',
};

export default function CustomersPage() {
  useLocaleRefresh();
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);

  const receivables = state.customers.reduce((sum, customer) => sum + customer.openingBalance, 0);
  const upiReadyCount = state.customers.filter((customer) => isValidUpiId(customer.bank?.upiId)).length;

  const visibleCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.customers;
    return state.customers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.bank?.upiId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [state.customers, query]);

  const handleSubmit = () => {
    const result = actions.addCustomer({ name: form.name, phone: form.phone, email: form.email, details: form.details });
    if (result.ok) {
      setMessage({ tone: 'ok', text: `Customer "${form.name.trim()}" added.` });
      setForm(emptyForm);
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not add customer.' });
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="People"
        title="Customers"
        subtitle="Customer profiles, contacts and outstanding balances."
        actions={
          <>
            <Badge tone="brand" dot>
              {upiReadyCount}/{state.customers.length} QR-ready
            </Badge>
            <ExportButton kinds={['customers', 'everything']} label="Export list" />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3 animate-fade-up">
        <StatCard index={0} label="Customers" value={String(state.customers.length)} icon={Users} tone="brand" />
        <StatCard index={1} label="UPI QR ready" value={String(upiReadyCount)} icon={QrCode} tone="emerald" delta="Direct-to-bank collections" />
        <StatCard index={2} label="Outstanding" value={formatCurrency(receivables)} numeric={receivables} format={formatCurrency} sensitive icon={IndianRupee} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        {/* Add customer */}
        <Card className="animate-fade-up h-fit">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<UserPlus size={17} />}>Add customer</CardTitle>
          </div>

          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">Details</p>
          <div className="space-y-3">
            <div>
              <span className={labelClass}>Full name *</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kiran Malhotra" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={labelClass}>Phone</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" className={inputClass} />
              </div>
              <div>
                <span className={labelClass}>Email</span>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@mail.com" className={inputClass} />
              </div>
            </div>
            <div>
              <span className={labelClass}>Notes / details</span>
              <input value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Preferences, billing cycle…" className={inputClass} />
            </div>
          </div>

          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <Button onClick={handleSubmit}><UserPlus size={16} /> Save customer</Button>
          </div>
        </Card>

        {/* Directory */}
        <Card className="animate-fade-up">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <CardTitle icon={<Users size={17} />}>Directory</CardTitle>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-600" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, UPI…" className="w-56 rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus" />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {visibleCustomers.map((customer) => {
              const hasUpi = isValidUpiId(customer.bank?.upiId);
              const accent = upiAccentColor(customer.bank?.upiId);
              return (
                <button
                  key={customer.id}
                  onClick={() => setSelected(customer)}
                  className="group rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-brand-400/30 hover:bg-stone-100 hover:shadow-card-hover"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white shadow-glow-sm">
                      {customer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-stone-900">{customer.name}</p>
                      <p className="truncate text-xs text-stone-600">{customer.phone ?? 'No phone'} {customer.email ? `· ${customer.email}` : ''}</p>
                    </div>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${hasUpi ? 'text-black' : 'bg-stone-100 text-stone-600'}`} style={hasUpi ? { background: accent } : undefined} title={hasUpi ? 'UPI QR ready' : 'No UPI ID yet'}>
                      <QrCode size={17} />
                    </span>
                  </div>
                  <div className="mt-3.5 flex items-center justify-between gap-2 text-xs">
                    {hasUpi ? (
                      <span className="rounded-full px-2.5 py-1 font-semibold ring-1 ring-inset" style={{ color: accent, background: `${accent}14`, borderColor: `${accent}40`, boxShadow: `inset 0 0 0 1px ${accent}40` }}>
                        {customer.bank?.upiId}
                      </span>
                    ) : (
                      <span className="rounded-full bg-stone-50 px-2.5 py-1 font-medium text-stone-600 ring-1 ring-inset ring-stone-200">UPI not set</span>
                    )}
                    <span className={`rounded-full px-2.5 py-1 font-semibold ring-1 ring-inset ${customer.openingBalance > 0 ? 'bg-amber-500/10 text-amber-700 ring-amber-500/25' : 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25'}`}>
                      {customer.openingBalance > 0 ? `${formatCurrency(customer.openingBalance)} due` : 'Settled'}
                    </span>
                  </div>
                  <p className="mt-3 hidden items-center gap-1 text-xs font-semibold text-brand-600 transition group-hover:flex">
                    Open QR & bank details →
                  </p>
                </button>
              );
            })}
            {visibleCustomers.length === 0 ? (
              <p className="rounded-2xl bg-stone-50 p-6 text-sm text-stone-600 xl:col-span-2">No customers match “{query}”.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {selected ? <CustomerDetailModal key={selected.id} customer={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
