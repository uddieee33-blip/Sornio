'use client';

import { useMemo, useState } from 'react';
import { IndianRupee, Landmark, QrCode, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/stat-card';
import { CustomerDetailModal } from '@/components/customers/customer-detail-modal';
import { formatCurrency } from '@/lib/business-data';
import { isValidUpiId, normalizeUpiId, upiAccentColor, type BankDetails } from '@/lib/upi';
import { ExportButton } from '@/components/export/export-button';
import { useDukaanStore, type Customer } from '@/lib/store';

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  details: '',
  upiId: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  accountHolder: '',
};

export default function CustomersPage() {
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

  const upiTouched = form.upiId.length > 0;
  const upiOk = isValidUpiId(form.upiId);

  const handleSubmit = () => {
    const bank: BankDetails | undefined =
      form.upiId || form.bankName || form.accountNumber || form.ifsc
        ? {
            upiId: form.upiId || undefined,
            bankName: form.bankName || undefined,
            accountNumber: form.accountNumber || undefined,
            ifsc: form.ifsc || undefined,
            accountHolder: form.accountHolder || form.name || undefined,
          }
        : undefined;
    const result = actions.addCustomer({ name: form.name, phone: form.phone, email: form.email, details: form.details, bank });
    if (result.ok) {
      setMessage({
        tone: 'ok',
        text: upiOk
          ? `${form.name.trim()} added — their unique UPI QR is ready. Money lands directly in their account.`
          : `${form.name.trim()} added. Add a UPI ID later to generate their payment QR.`,
      });
      setForm(emptyForm);
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not add customer.' });
    }
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        eyebrow="People"
        title="Customers"
        subtitle="Profiles with bank & UPI details — each customer gets a unique payment QR, no middleman."
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
        <StatCard label="Customers" value={String(state.customers.length)} icon={Users} tone="brand" />
        <StatCard label="UPI QR ready" value={String(upiReadyCount)} icon={QrCode} tone="emerald" delta="Direct-to-bank collections" />
        <StatCard label="Outstanding" value={formatCurrency(receivables)} icon={IndianRupee} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        {/* Add customer */}
        <Card className="animate-fade-up h-fit">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<UserPlus size={17} />}>Add customer</CardTitle>
          </div>

          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Details</p>
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

          <p className="mb-4 mt-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            <Landmark size={13} /> Bank & UPI — powers their unique QR
          </p>
          <div className="space-y-3">
            <div>
              <span className={labelClass}>UPI ID</span>
              <input value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="name@okhdfcbank" className={`${inputClass} ${upiTouched ? (upiOk ? 'border-emerald-500/50 focus:border-emerald-400' : 'border-amber-500/50 focus:border-amber-400') : ''}`} />
              {upiTouched ? (
                <p className={`mt-1.5 text-xs font-semibold ${upiOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {upiOk ? `✓ Valid — QR will pay ${normalizeUpiId(form.upiId)} directly` : 'Expected format: name@bank'}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={labelClass}>Bank name</span>
                <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="HDFC Bank" className={inputClass} />
              </div>
              <div>
                <span className={labelClass}>IFSC</span>
                <input value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={labelClass}>Account number</span>
                <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="XXXXXXXXXXXX" className={inputClass} />
              </div>
              <div>
                <span className={labelClass}>Account holder</span>
                <input value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} placeholder="Defaults to name" className={inputClass} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5 text-xs leading-relaxed text-emerald-300">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
            <span>Payments via this QR settle <strong>directly into the customer&apos;s bank</strong>. DukaanOS never holds or routes the money.</span>
          </div>

          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
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
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, UPI…" className="w-56 rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20" />
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
                  className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition hover:border-brand-400/30 hover:bg-white/[0.05] hover:shadow-card-hover"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white shadow-glow-sm">
                      {customer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{customer.name}</p>
                      <p className="truncate text-xs text-zinc-500">{customer.phone ?? 'No phone'} {customer.email ? `· ${customer.email}` : ''}</p>
                    </div>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${hasUpi ? 'text-black' : 'bg-white/[0.05] text-zinc-600'}`} style={hasUpi ? { background: accent } : undefined} title={hasUpi ? 'UPI QR ready' : 'No UPI ID yet'}>
                      <QrCode size={17} />
                    </span>
                  </div>
                  <div className="mt-3.5 flex items-center justify-between gap-2 text-xs">
                    {hasUpi ? (
                      <span className="rounded-full px-2.5 py-1 font-semibold ring-1 ring-inset" style={{ color: accent, background: `${accent}14`, borderColor: `${accent}40`, boxShadow: `inset 0 0 0 1px ${accent}40` }}>
                        {customer.bank?.upiId}
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/[0.04] px-2.5 py-1 font-medium text-zinc-500 ring-1 ring-inset ring-white/[0.08]">UPI not set</span>
                    )}
                    <span className={`rounded-full px-2.5 py-1 font-semibold ring-1 ring-inset ${customer.openingBalance > 0 ? 'bg-amber-500/10 text-amber-400 ring-amber-500/25' : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25'}`}>
                      {customer.openingBalance > 0 ? `${formatCurrency(customer.openingBalance)} due` : 'Settled'}
                    </span>
                  </div>
                  <p className="mt-3 hidden items-center gap-1 text-xs font-semibold text-brand-300 transition group-hover:flex">
                    Open QR & bank details →
                  </p>
                </button>
              );
            })}
            {visibleCustomers.length === 0 ? (
              <p className="rounded-2xl bg-white/[0.03] p-6 text-sm text-zinc-500 xl:col-span-2">No customers match “{query}”.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {selected ? <CustomerDetailModal key={selected.id} customer={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
