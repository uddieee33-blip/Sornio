'use client';

import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import type { PaymentMethod } from '@/lib/models/billing';
import { useDukaanStore } from '@/lib/store';

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none';

/** Money that customers still owe the business, and the form that records a payment against it. */
export function CollectDuesPanel() {
  const { state, actions } = useDukaanStore();
  const outstanding = useMemo(
    () => summarizeFinancials(state.transactions, state.products, state.customers).customerReceivables,
    [state.transactions, state.products, state.customers],
  );
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'Credit' | 'Other'>>('Cash');
  const [customer, setCustomer] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string;
  } | null>(null);

  const submit = () => {
    const value = Number(amount);
    const result = actions.collectDue({ amount: value, method,
      customerId: customer || undefined,
      reference,
    });
    if (result.ok) {
      setMessage({ tone: 'ok', text: `${formatCurrency(value)} collected via ${method}. Dues are now ${formatCurrency(outstanding - value)}.`,
      });
      setAmount('');
      setCustomer('');
    } else {
      setMessage({
        tone: 'error',
        text: result.error ?? 'Could not record the payment.',
      });
    }
  };

  return (
    <Card className="animate-fade-up mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Customer dues</CardTitle>
        <Badge tone={outstanding > 0 ? 'amber' : 'emerald'} dot>
          {outstanding > 0 ? `${formatCurrency(outstanding)} outstanding` : 'Nothing owed'}
        </Badge>
      </div>
      {outstanding > 0 ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Amount received
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Received via
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option>Cash</option>
              <option>UPI</option>
              <option>Card</option>
              <option>Bank Transfer</option>
            </select>
          </label>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Customer account
            <select value={customer} onChange={(e) => setCustomer(e.target.value)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Unallocated older dues</option>
              {state.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Payment reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Payment reference"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <button
            type="button"
            onClick={submit}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          >
            Record payment
          </button>
        </div>
      ) : (
        <p className="text-sm text-stone-600">Credit sales and opening balances appear here until they are paid.</p>
      )}
      {message && (
        <p className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`} role="status">
          {message.text}
        </p>
      )}
    </Card>
  );
}

/** What the business owes its suppliers (goods received on credit), and the form that pays it down. */
export function PaySupplierPanel() {
  const { state, actions } = useDukaanStore();
  const payable = useMemo(
    () => summarizeFinancials(state.transactions, state.products, state.customers).payables,
    [state.transactions, state.products, state.customers],
  );
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'Credit' | 'Other'>>('Bank Transfer');
  const [supplier, setSupplier] = useState('');
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);

  const submit = () => {
    const value = Number(amount);
    const result = actions.paySupplier({ amount: value, method, supplier });
    if (result.ok) {
      setMessage({
        tone: 'ok',
        text: `${formatCurrency(value)} paid via ${method}. Still owed: ${formatCurrency(payable - value)}.`,
      });
      setAmount('');
      setSupplier('');
    } else {
      setMessage({
        tone: 'error',
        text: result.error ?? 'Could not record the payment.',
      });
    }
  };

  return (
    <Card className="animate-fade-up mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Owed to suppliers</CardTitle>
        <Badge tone={payable > 0 ? 'amber' : 'emerald'} dot>
          {payable > 0 ? `${formatCurrency(payable)} payable` : 'Nothing owed'}
        </Badge>
      </div>
      {payable > 0 ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Amount paid
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Paid via
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option>Bank Transfer</option>
              <option>Cash</option>
              <option>UPI</option>
              <option>Card</option>
            </select>
          </label>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Supplier (optional)
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Supplier name"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <button
            type="button"
            onClick={submit}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          >
            Record payment
          </button>
        </div>
      ) : (
        <p className="text-sm text-stone-600">Deliveries received on credit appear here until they are paid.</p>
      )}
      {message && (
        <p className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`} role="status">
          {message.text}
        </p>
      )}
    </Card>
  );
}
