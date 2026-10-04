'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/business-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore, type InvoiceLine } from '@/lib/store';

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

const statusStyles: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  partial: 'bg-sky-50 text-sky-700 border-sky-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

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
  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900';

  const updateLine = (index: number, patch: Partial<InvoiceLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleCreate = () => {
    const result = actions.createInvoice({
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      lines,
      method: form.method,
      taxRate: Number(form.taxRate || 0),
    });
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
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">billing</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Bills, receipts, and payment flow</h1>
        </div>

        {message ? (
          <p className={`mb-6 rounded-xl px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            {selected ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Invoice</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">{selected.id}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusStyles[selected.paymentStatus]}`}>
                      {selected.paymentStatus}
                    </span>
                    {selected.paymentStatus !== 'paid' ? (
                      <button onClick={() => handleMarkPaid(selected.id)} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
                        Mark paid
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mb-6 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <div><span className="font-medium text-slate-800">Customer:</span> {selected.customerName}</div>
                  <div><span className="font-medium text-slate-800">Phone:</span> {selected.customerPhone ?? '—'}</div>
                  <div><span className="font-medium text-slate-800">Date:</span> {formatDate(selected.createdAt)}</div>
                  <div><span className="font-medium text-slate-800">Payment:</span> {selected.paymentMethod}</div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Qty</th>
                        <th className="px-4 py-3 font-medium">Price</th>
                        <th className="px-4 py-3 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-200">
                          <td className="px-4 py-3">
                            <p className="text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.category}</p>
                          </td>
                          <td className="px-4 py-3">{item.quantity}</td>
                          <td className="px-4 py-3">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-4 py-3">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 ml-auto max-w-xs space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(selected.subtotal)}</span></div>
                  <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(selected.tax)}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(selected.totalAmount)}</span></div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">All invoices</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.invoices.map((invoice) => (
                      <tr key={invoice.id} className={`border-t border-slate-200 ${invoice.id === selected?.id ? 'bg-slate-50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <button onClick={() => setSelectedId(invoice.id)} className="text-left underline-offset-2 hover:underline">{invoice.id}</button>
                        </td>
                        <td className="px-4 py-3">{invoice.customerName}</td>
                        <td className="px-4 py-3">{formatCurrency(invoice.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-1 text-xs font-medium capitalize ${statusStyles[invoice.paymentStatus]}`}>
                            {invoice.paymentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {invoice.paymentStatus !== 'paid' ? (
                            <button onClick={() => handleMarkPaid(invoice.id)} className="text-xs font-medium text-emerald-700">Mark paid</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">New invoice</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Customer name" className={inputClass} />
                <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="Phone (optional)" className={inputClass} />
              </div>
              <div className="mt-4 space-y-3">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1.3fr_0.8fr_0.4fr_0.6fr_auto]">
                    <input value={line.name} onChange={(e) => updateLine(index, { name: e.target.value })} placeholder="Item name" className={inputClass} />
                    <input value={line.category} onChange={(e) => updateLine(index, { category: e.target.value })} placeholder="Category" className={inputClass} />
                    <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value || 0) })} className={inputClass} />
                    <input type="number" min={0} value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value || 0) })} className={inputClass} />
                    <button onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="text-xs font-medium text-red-600">Remove</button>
                  </div>
                ))}
                <button onClick={() => setLines((current) => [...current, { name: '', category: 'General', quantity: 1, unitPrice: 0 }])} className="text-xs font-medium text-slate-700">+ Add line</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className={inputClass}>
                  {METHODS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <input type="number" min={0} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} placeholder="Tax rate %" className={inputClass} />
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={handleCreate} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Create invoice</button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Payment activity</h2>
              <div className="mt-4 space-y-3 text-sm">
                {[...state.paymentRecords].reverse().slice(0, 8).map((record) => (
                  <div key={record.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-800">{record.customerName}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[record.status]}`}>{record.status}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>{record.paymentMethod} · {record.gateway}</span>
                      <span>{formatCurrency(record.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Receipt modes</h2>
              <div className="mt-4 space-y-3">
                {[
                  { name: 'Digital receipt', details: 'Share via SMS or WhatsApp instantly.' },
                  { name: 'Physical receipt', details: 'Print on paper for hand-to-hand delivery.' },
                  { name: 'Both', details: 'Best for retail, cafes, and premium service businesses.' },
                ].map((mode) => (
                  <div key={mode.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-800">{mode.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{mode.details}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
