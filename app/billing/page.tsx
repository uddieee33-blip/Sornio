'use client';

import { useState } from 'react';
import { CheckCircle2, CreditCard, FilePlus2, Plus, Receipt, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore, type InvoiceLine } from '@/lib/store';

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
const statusTone: Record<string, BadgeTone> = { paid: 'emerald', pending: 'amber', partial: 'sky', failed: 'red' };
const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function BillingPage() {
  const { state, actions } = useDukaanStore();
  const [selectedId, setSelectedId] = useState(state.invoices[0]?.id);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', method: 'UPI' as PaymentMethod, taxRate: '0' });
  const [lines, setLines] = useState<InvoiceLine[]>([{ name: '', category: 'General', quantity: 1, unitPrice: 0 }]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const selected = state.invoices.find((invoice) => invoice.id === selectedId) ?? state.invoices[0];

  const updateLine = (index: number, patch: Partial<InvoiceLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleCreate = () => {
    const result = actions.createInvoice({ customerName: form.customerName, customerPhone: form.customerPhone, lines, method: form.method, taxRate: Number(form.taxRate || 0) });
    if (result.ok) {
      setMessage({ tone: 'ok', text: `Invoice created for ${form.customerName.trim()} — mark it paid when the money lands.` });
      setForm({ customerName: '', customerPhone: '', method: 'UPI', taxRate: '0' });
      setLines([{ name: '', category: 'General', quantity: 1, unitPrice: 0 }]);
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not create invoice.' });
    }
  };

  const handleMarkPaid = (invoiceId: string) => {
    const result = actions.markInvoicePaid(invoiceId);
    setMessage(result.ok ? { tone: 'ok', text: `Invoice ${invoiceId} settled — revenue and cash updated.` } : { tone: 'error', text: result.error ?? 'Could not update invoice.' });
  };

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <PageHeader eyebrow="Billing" title="Bills, receipts, and payment flow" />

      {message ? (
        <p className={`mb-6 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {selected ? (
            <Card className="animate-fade-up relative overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Invoice</p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-white">{selected.id}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone[selected.paymentStatus]} dot>{selected.paymentStatus}</Badge>
                  {selected.paymentStatus !== 'paid' ? (
                    <button onClick={() => handleMarkPaid(selected.id)} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30 transition hover:bg-emerald-500/25">
                      <CheckCircle2 size={13} /> Mark paid
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mb-6 grid gap-3 text-sm text-zinc-400 md:grid-cols-2">
                <div><span className="font-semibold text-zinc-200">Customer:</span> {selected.customerName}</div>
                <div><span className="font-semibold text-zinc-200">Phone:</span> {selected.customerPhone ?? '—'}</div>
                <div><span className="font-semibold text-zinc-200">Date:</span> {formatDate(selected.createdAt)}</div>
                <div><span className="font-semibold text-zinc-200">Payment:</span> {selected.paymentMethod}</div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold">Qty</th>
                      <th className="px-4 py-3 font-semibold">Price</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.id} className="border-t border-white/[0.05]">
                        <td className="px-4 py-3">
                          <p className="font-medium text-zinc-200">{item.name}</p>
                          <p className="text-xs text-zinc-500">{item.category}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 text-zinc-400 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-3 font-semibold text-white tabular-nums">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 ml-auto max-w-xs space-y-2 text-sm text-zinc-400">
                <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(selected.subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{formatCurrency(selected.tax)}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-2 text-base font-bold text-white"><span>Total</span><span className="tabular-nums">{formatCurrency(selected.totalAmount)}</span></div>
              </div>
            </Card>
          ) : null}

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Receipt size={17} />}>All invoices</CardTitle>
              <Badge tone="brand" dot>{state.invoices.length}</Badge>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.invoices.map((invoice) => (
                    <tr key={invoice.id} className={`border-t border-white/[0.05] transition ${invoice.id === selected?.id ? 'bg-brand-500/[0.07]' : 'hover:bg-white/[0.03]'}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedId(invoice.id)} className="font-semibold text-brand-300 underline-offset-2 hover:underline">{invoice.id}</button>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{invoice.customerName}</td>
                      <td className="px-4 py-3 font-semibold text-white tabular-nums">{formatCurrency(invoice.totalAmount)}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone[invoice.paymentStatus]} dot>{invoice.paymentStatus}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        {invoice.paymentStatus !== 'paid' ? (
                          <button onClick={() => handleMarkPaid(invoice.id)} className="text-xs font-semibold text-emerald-400 hover:underline">Mark paid</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<FilePlus2 size={17} />}>New invoice</CardTitle>
              <Button variant="secondary" onClick={() => setLines((current) => [...current, { name: '', category: 'General', quantity: 1, unitPrice: 0 }])}><Plus size={15} /> Add line</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Customer name" className={inputClass} />
              <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="Phone (optional)" className={inputClass} />
            </div>
            <div className="mt-4 space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 md:grid-cols-[1.3fr_0.8fr_0.4fr_0.6fr_auto]">
                  <input value={line.name} onChange={(e) => updateLine(index, { name: e.target.value })} placeholder="Item name" className={inputClass} />
                  <input value={line.category} onChange={(e) => updateLine(index, { category: e.target.value })} placeholder="Category" className={inputClass} />
                  <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value || 0) })} className={inputClass} />
                  <input type="number" min={0} value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value || 0) })} className={inputClass} />
                  <button onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="flex items-center justify-center rounded-lg p-2 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className={inputClass}>
                {METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <input type="number" min={0} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} placeholder="Tax rate %" className={inputClass} />
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={handleCreate}><FilePlus2 size={16} /> Create invoice</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="animate-fade-up h-fit">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<CreditCard size={17} />}>Payment activity</CardTitle>
            </div>
            <div className="space-y-3">
              {[...state.paymentRecords].reverse().slice(0, 8).map((record) => (
                <div key={record.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 transition hover:border-brand-400/30 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-zinc-200">{record.customerName}</p>
                    <Badge tone={statusTone[record.status] ?? 'slate'} dot>{record.status}</Badge>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
                    <span>{record.paymentMethod} · {record.gateway}</span>
                    <span className="font-bold text-white tabular-nums">{formatCurrency(record.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="animate-fade-up h-fit">
            <div className="mb-5"><CardTitle icon={<Receipt size={17} />}>Receipt modes</CardTitle></div>
            <div className="space-y-3">
              {[
                { name: 'Digital receipt', details: 'Share via SMS or WhatsApp instantly.' },
                { name: 'Physical receipt', details: 'Print on paper for hand-to-hand delivery.' },
                { name: 'Both', details: 'Best for retail, cafes, and premium service businesses.' },
              ].map((mode) => (
                <div key={mode.name} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                  <p className="text-sm font-semibold text-zinc-200">{mode.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{mode.details}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
