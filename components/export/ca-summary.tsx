'use client';

/**
 * Print-friendly accountant handoff. The browser's Print -> Save as PDF
 * works without sending sensitive shop records to any external PDF service.
 * This is a management summary, NOT a GSTR return or a certified tax report.
 */
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
const day = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function CaSummary() {
  const { state, hydrated } = useDukaanStore();
  const [start, setStart] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [end, setEnd] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  });
  const periodValid = start <= end;
  const invoices = periodValid ? state.invoices.filter((invoice) => invoice.createdAt.slice(0, 10) >= start && invoice.createdAt.slice(0, 10) <= end) : [];
  const total = (key: 'subtotal' | 'tax' | 'totalAmount') => invoices.reduce((sum, invoice) => sum + invoice[key], 0);
  const unpaid = invoices.filter((invoice) => invoice.paymentStatus !== 'paid');
  const paid = invoices.filter((invoice) => invoice.paymentStatus === 'paid');
  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-stone-900">Share with your accountant</h2>
          <p className="mt-1 text-sm text-stone-600">Choose dates, then select Print or Save as PDF on your device. Nothing is uploaded.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-stone-700">From
            <input aria-label="Report start date" type="date" className="mt-1 block rounded-lg border border-stone-300 p-2" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-stone-700">To
            <input aria-label="Report end date" type="date" className="mt-1 block rounded-lg border border-stone-300 p-2" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button type="button" disabled={!hydrated || !periodValid} onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            <FileText size={16} /> Print / Save PDF
          </button>
        </div>
      </div>
      {!periodValid && <p className="mt-3 text-sm text-red-700">The end date must be on or after the start date.</p>}
      <div className="ca-report mt-5 rounded-xl border border-stone-200 p-5 text-stone-900">
        <h2 className="text-xl font-bold">{state.profile.name || 'Business'} — Accountant summary</h2>
        <p className="mt-1 text-sm">Period: {start} to {end}</p>
        <p className="mt-1 text-xs">Prepared: {day(new Date().toISOString())}</p>
        <p className="mt-3 text-xs font-semibold">Management summary only. Not a filed GST return or independently reconciled bank statement. Verify source records before statutory use.</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt>Invoices</dt><dd className="font-bold">{invoices.length}</dd></div>
          <div><dt>Taxable / pre-tax value</dt><dd className="font-bold">{money(total('subtotal'))}</dd></div>
          <div><dt>Recorded tax</dt><dd className="font-bold">{money(total('tax'))}</dd></div>
          <div><dt>Gross invoiced</dt><dd className="font-bold">{money(total('totalAmount'))}</dd></div>
        </dl>
        <p className="mt-4 text-sm">Paid invoices: {paid.length} · Invoices not fully paid: {unpaid.length} (face value {money(unpaid.reduce((sum, invoice) => sum + invoice.totalAmount, 0))}; not an outstanding balance calculation).</p>
        <table className="mt-5 w-full border-collapse text-left text-xs">
          <thead><tr className="border-b border-stone-400"><th className="py-2">Date</th><th>Bill #</th><th>Customer</th><th>Status</th><th className="text-right">Gross (₹)</th></tr></thead>
          <tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-b border-stone-200"><td className="py-2">{day(invoice.createdAt)}</td><td>{invoice.id}</td><td>{invoice.customerName}</td><td>{invoice.paymentStatus}</td><td className="text-right">{money(invoice.totalAmount)}</td></tr>)}</tbody>
        </table>
        {invoices.length === 0 && <p className="mt-4 text-sm">No invoices in the selected period.</p>}
        <p className="mt-5 text-xs">Provide the transaction-level CSV export to your CA for reconciliation. This report only summarizes invoices currently stored in this business.</p>
      </div>

    </section>
  );
}
