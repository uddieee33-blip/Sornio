import { sampleInvoices, samplePaymentRecords, summarizePaymentRecords } from '@/lib/models/billing';
import { formatCurrency } from '@/lib/business-data';

const featuredInvoice = sampleInvoices[0];
const paymentSummary = summarizePaymentRecords(samplePaymentRecords);

const receiptModes = [
  { name: 'Digital receipt', details: 'Share via SMS or WhatsApp instantly.' },
  { name: 'Physical receipt', details: 'Print on paper for hand-to-hand delivery.' },
  { name: 'Both', details: 'Best for retail, cafes, and premium service businesses.' },
];

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
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">billing</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Bills, receipts, and payment flow</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Invoice</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">{featuredInvoice.id}</h2>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusStyles[featuredInvoice.paymentStatus]}`}>
                  {featuredInvoice.paymentStatus}
                </div>
              </div>

              <div className="mb-6 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div><span className="font-medium text-slate-800">Customer:</span> {featuredInvoice.customerName}</div>
                <div><span className="font-medium text-slate-800">Phone:</span> {featuredInvoice.customerPhone ?? '—'}</div>
                <div><span className="font-medium text-slate-800">Date:</span> {formatDate(featuredInvoice.createdAt)}</div>
                <div><span className="font-medium text-slate-800">Payment:</span> {featuredInvoice.paymentMethod}</div>
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
                    {featuredInvoice.items.map((item) => (
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
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(featuredInvoice.subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(featuredInvoice.tax)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(featuredInvoice.totalAmount)}</span></div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">All invoices</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-t border-slate-200">
                        <td className="px-4 py-3 font-medium text-slate-900">{invoice.id}</td>
                        <td className="px-4 py-3">{invoice.customerName}</td>
                        <td className="px-4 py-3">{formatDate(invoice.createdAt)}</td>
                        <td className="px-4 py-3">{formatCurrency(invoice.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-1 text-xs font-medium capitalize ${statusStyles[invoice.paymentStatus]}`}>
                            {invoice.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Payment activity</h2>
              <div className="mt-4 space-y-3 text-sm">
                {samplePaymentRecords.map((record) => (
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
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Collected</span>
                  <strong className="text-slate-900">{formatCurrency(paymentSummary.collected)}</strong>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Receipt modes</h2>
              <div className="mt-4 space-y-3">
                {receiptModes.map((mode) => (
                  <div key={mode.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-800">{mode.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{mode.details}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Payment capabilities</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>• UPI direct transfer</li>
                <li>• Card / bank payment</li>
                <li>• Cash collection and bookkeeping</li>
                <li>• Digital SMS / WhatsApp receipts</li>
                <li>• Printed physical bill</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
