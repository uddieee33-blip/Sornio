const invoice = {
  id: 'INV-1024',
  customerName: 'John Wilson',
  businessName: 'Cult Fitness',
  date: '02 Oct 2026',
  paymentMethod: 'UPI',
  subtotal: 4999,
  tax: 0,
  total: 4999,
  items: [
    { name: 'Quarterly membership', qty: 1, price: 4999 },
  ],
};

const receiptModes = [
  { name: 'Digital receipt', details: 'Share via SMS or WhatsApp instantly.' },
  { name: 'Physical receipt', details: 'Print on paper for hand-to-hand delivery.' },
  { name: 'Both', details: 'Best for retail, cafes, and premium service businesses.' },
];

export default function BillingPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">billing</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Bills, receipts, and payment flow</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Invoice</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{invoice.id}</h2>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Paid</div>
            </div>

            <div className="mb-6 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
              <div><span className="font-medium text-slate-800">Customer:</span> {invoice.customerName}</div>
              <div><span className="font-medium text-slate-800">Business:</span> {invoice.businessName}</div>
              <div><span className="font-medium text-slate-800">Date:</span> {invoice.date}</div>
              <div><span className="font-medium text-slate-800">Payment:</span> {invoice.paymentMethod}</div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium">Qty</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.name} className="border-t border-slate-200">
                      <td className="px-4 py-3">{item.name}</td>
                      <td className="px-4 py-3">{item.qty}</td>
                      <td className="px-4 py-3">₹{item.price.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 ml-auto max-w-xs space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{invoice.subtotal.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>₹{invoice.tax.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900"><span>Total</span><span>₹{invoice.total.toLocaleString('en-IN')}</span></div>
            </div>
          </div>

          <div className="space-y-5">
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

