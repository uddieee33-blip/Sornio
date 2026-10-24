'use client';

import { getActiveFormattingLocale } from '@/lib/locale';

import { useLocaleRefresh } from '@/lib/i18n';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HandCoins, Plus, Printer, Receipt, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { CollectPaymentModal } from '@/components/payments/collect-payment';
import { formatInvoiceAmount as formatCurrency, invoiceBalance } from '@/lib/invoices';
import { useDukaanStore } from '@/lib/store';

const statusTone: Record<string, BadgeTone> = { paid: 'emerald', pending: 'amber', partial: 'sky', failed: 'red' };
const inputClass = 'min-h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-brand-500 focus:ring-2 focus:ring-focus';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(getActiveFormattingLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
}

function BillingWorkspace() {
  const params = useSearchParams();
  useLocaleRefresh();
  const { state } = useDukaanStore();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const selected = state.invoices.find((invoice) => invoice.id === (selectedId ?? params.get('invoice')));

  const selectedDue = selected ? invoiceBalance(selected, state.paymentRecords) : 0;
  const search = query.trim().toLocaleLowerCase();
  const searchPhone = query.replace(/\D/g, '');
  const matchingInvoices = [...state.invoices].filter((invoice) => !search ||
    `${invoice.id} ${invoice.customerName} ${invoice.customerPhone ?? ''}`.toLocaleLowerCase().includes(search) ||
    (searchPhone.length > 0 && /^[+\d\s()-]+$/.test(query) && invoice.customerPhone?.replace(/\D/g, '').includes(searchPhone)));
  const invoices = matchingInvoices.filter(invoice => status === 'all' || (status === 'unpaid' ? invoiceBalance(invoice, state.paymentRecords) > 0 : invoiceBalance(invoice, state.paymentRecords) <= 0))
    .sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * (sort === 'newest' ? 1 : -1));
  const tabs = [
    { id: 'all', label: 'All bills', count: matchingInvoices.length },
    { id: 'unpaid', label: 'Unpaid', count: matchingInvoices.filter(invoice => invoiceBalance(invoice, state.paymentRecords) > 0).length },
    { id: 'paid', label: 'Paid', count: matchingInvoices.filter(invoice => invoiceBalance(invoice, state.paymentRecords) <= 0).length },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Sales"
        title="Bills & receipts"
        subtitle="Find a saved bill, check its balance, collect payment or print a receipt."
        actions={
          <Link href="/billing/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm"><Plus size={15} /> New bill</Link>
        }
      />

      {message ? (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mb-6 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
      ) : null}

      <div className="space-y-6">
        <div className="min-w-0 space-y-6">
          {selected ? (
            <Card className="print-area invoice-print-area animate-fade-up relative overflow-hidden">
              <div className="no-print pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
              <div className="invoice-watermark" aria-hidden="true">
                <span className="invoice-watermark-mark">S</span>
                <span className="invoice-watermark-name">Sornio</span>
              </div>
              <div id="invoice-preview" className="mb-5 flex scroll-mt-24 flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-stone-900 print:text-2xl">{state.profile.name}</p>
                  {state.profile.gstin ? <p className="text-xs font-semibold text-stone-700">GSTIN: {state.profile.gstin}</p> : null}
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-600">Invoice · {selected.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone[selected.paymentStatus]} dot>{selected.paymentStatus}</Badge>
                  {selectedDue > 0 ? (
                    <>
                      <button onClick={() => setCollectingId(selected.id)} className="no-print inline-flex items-center gap-1.5 rounded-full min-h-11 bg-brand-gradient px-3.5 py-2.5 text-xs font-semibold text-white shadow-glow-sm transition hover:brightness-110 active:scale-95">
                        <HandCoins size={13} /> Collect payment
                      </button>

                    </>
                  ) : null}
                  <button
                    onClick={() => window.print()}
                    className="no-print inline-flex min-h-11 items-center gap-1.5 rounded-full bg-stone-100 px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200"
                    title="Print this bill as a physical receipt"
                  >
                    <Printer size={13} /> Print bill
                  </button>
                </div>
              </div>

              <div className="mb-6 grid gap-3 text-sm text-stone-600 md:grid-cols-2">
                <div><span className="font-semibold text-stone-800">Customer:</span> {selected.customerName}</div>
                <div><span className="font-semibold text-stone-800">Phone:</span> {selected.customerPhone ?? '—'}</div>
                <div><span className="font-semibold text-stone-800">Date:</span> {formatDate(selected.createdAt)}</div>
                <div><span className="font-semibold text-stone-800">Payment:</span> {selected.paymentMethod}</div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-stone-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold">Qty</th>
                      <th className="px-4 py-3 font-semibold">Price</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.id} className="border-t border-stone-200">
                        <td className="px-4 py-3">
                          <p className="font-medium text-stone-800">{item.name}</p>
                          <p className="text-xs text-stone-600">{item.category}</p>
                        </td>
                        <td className="px-4 py-3 text-stone-600 tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 text-stone-600 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-3 font-semibold text-stone-900 tabular-nums">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 ml-auto max-w-xs space-y-2 text-sm text-stone-600">
                <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(selected.subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{formatCurrency(selected.tax)}</span></div>
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-900"><span>Total</span><span className="tabular-nums">{formatCurrency(selected.totalAmount)}</span></div>
                <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{formatCurrency(selected.totalAmount - selectedDue)}</span></div>
                <div className="flex justify-between font-bold text-stone-900"><span>Amount due</span><span className="tabular-nums">{formatCurrency(selectedDue)}</span></div>
              </div>

              {state.profile.upiId ? (
                <p className="mt-6 hidden border-t border-dashed border-stone-300 pt-4 text-center text-xs text-stone-600 print:block">
                  Pay via UPI: {state.profile.upiId} · Thank you for your business!
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card className="animate-fade-up overflow-hidden" padded={false}>
            <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 px-4 py-2" role="group" aria-label="Filter bills by payment status">
              {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={status === tab.id} onClick={() => setStatus(tab.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs ${status === tab.id ? 'bg-stone-100 font-semibold text-stone-900' : 'font-medium text-stone-600 hover:bg-stone-50'}`}>{tab.label}<span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] tabular-nums">{tab.count}</span></button>)}
            </div>
            <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="sr-only">Find a bill</span>
              <span className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice number, customer or phone" className={`${inputClass} pl-10`} />
              </span>
            </label>
            <label className="block sm:w-40"><span className="sr-only">Sort bills</span><select value={sort} onChange={event => setSort(event.target.value as 'newest' | 'oldest')} className={inputClass}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
            </div>
            {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className={`border-t border-stone-200 transition ${invoice.id === selected?.id ? 'bg-brand-500/[0.07]' : 'hover:bg-stone-50'}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelectedId(invoice.id); requestAnimationFrame(() => document.getElementById('invoice-preview')?.scrollIntoView({ block: 'start' })); }} className="font-semibold text-brand-600 underline-offset-2 hover:underline">{invoice.id}</button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-stone-600">{formatDate(invoice.createdAt)}</td>
                      <td className="px-4 py-3 text-stone-700">{invoice.customerName}</td>
                      <td className="px-4 py-3 font-semibold text-stone-900 tabular-nums">{formatCurrency(invoice.totalAmount)}
                        {invoice.paymentStatus !== 'paid' ? <p className="mt-1 text-xs font-normal text-stone-600">Due: {formatCurrency(invoiceBalance(invoice, state.paymentRecords))}</p> : null}
                      </td>
                      <td className="px-4 py-3"><Badge tone={statusTone[invoice.paymentStatus]} dot>{invoice.paymentStatus}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        {invoiceBalance(invoice, state.paymentRecords) > 0 ? (
                          <button onClick={() => { setSelectedId(invoice.id); setCollectingId(invoice.id); }} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/30 transition hover:bg-emerald-500/25 active:scale-95">
                            <HandCoins size={12} /> Collect
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : <div className="px-6 py-12 text-center"><Receipt size={28} strokeWidth={1.5} className="mx-auto text-stone-400" aria-hidden="true" /><h2 className="mt-4 text-sm font-semibold text-stone-900">{search || status !== 'all' ? 'No matching bills' : 'Your bills will appear here'}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-600">{search || status !== 'all' ? 'Try another search or payment status.' : 'Create a bill, then track its balance and collect payment when the money arrives.'}</p>{!search && status === 'all' ? <Link href="/billing/new" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-4 text-xs font-semibold text-stone-800"><Plus size={14} aria-hidden="true" />Create a bill</Link> : <button type="button" onClick={() => { setQuery(''); setStatus('all'); }} className="mt-4 min-h-11 px-3 text-xs font-semibold text-brand-600">Clear filters</button>}</div>}
          </Card>


        </div>


      </div>

      {collectingId ? (
        (() => {
          const collecting = state.invoices.find((invoice) => invoice.id === collectingId);
          return collecting ? <CollectPaymentModal invoice={collecting} onClose={() => {
            setCollectingId(null);
            if (collecting.paymentStatus === 'paid') setMessage({ tone: 'ok', text: `Invoice ${collecting.id} settled — revenue and cash updated.` });
          }} /> : null;
        })()
      ) : null}
    </div>
  );
}


export default function BillingPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-stone-600">Loading bills…</p>}><BillingWorkspace /></Suspense>;
}
