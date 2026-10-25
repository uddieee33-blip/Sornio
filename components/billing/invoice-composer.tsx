'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { FilePlus2, Plus, Trash2 } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { calculateInvoice, formatInvoiceAmount, type InvoiceLine } from '@/lib/invoices';
import { useDukaanStore } from '@/lib/store';
import type { PaymentMethod } from '@/lib/models/billing';
import styles from './invoice-composer.module.css';

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-hidden transition focus:border-brand-500 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-1.5 block text-xs font-semibold text-stone-700';
const emptyLine: InvoiceLine = { name: '', category: 'General', quantity: 1, unitPrice: 0 };
type DraftLine = InvoiceLine & { key: number };

export function InvoiceComposer({ onCreated }: { onCreated: (invoiceId: string, customerName: string) => void }) {
  const { state, actions, hydrated } = useDukaanStore();
  const products = state.products.filter(product => product.status === 'Active');
  const id = useId();
  const nextKey = useRef(2);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Once a cashier adds a line, start at its product picker, not back at the
  // Add line button. It saves traversing every existing bill item with Tab.
  const pendingLineFocus = useRef<number | null>(null);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', method: 'Cash' as PaymentMethod, taxRate: '0' });
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine, key: 1 }]);
  const [error, setError] = useState<string | null>(null);
  const totals = calculateInvoice(lines, Number(form.taxRate));

  useEffect(() => {
    const key = pendingLineFocus.current;
    if (key === null) return;
    const picker = document.getElementById(`${id}-product-${key}`);
    if (picker instanceof HTMLSelectElement) {
      pendingLineFocus.current = null;
      picker.focus();
    }
  }, [id, lines]);

  const updateLine = (key: number, patch: Partial<InvoiceLine>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
    setError(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hydrated) return;
    const result = actions.createInvoice({ ...form, lines, taxRate: Number(form.taxRate) });
    if (!result.ok || !result.invoiceId) {
      setError(result.error ?? 'Could not create invoice.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const customer = form.customerName.trim() || 'Walk-in customer';
    setForm({ customerName: '', customerPhone: '', method: 'Cash', taxRate: '0' });
    setLines([{ ...emptyLine, key: nextKey.current++ }]);
    setError(null);
    onCreated(result.invoiceId, customer);
  };

  return (
    <section id="new-invoice" className={`${styles.editor} scroll-mt-24`} aria-labelledby={`${id}-title`}>
      <form onSubmit={submit} className={styles.layout}>
        <Card className={styles.items}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div id={`${id}-title`}><CardTitle icon={<FilePlus2 size={17} />}>Bill details</CardTitle></div>
            <Button type="button" variant="secondary" onClick={() => {
              const key = nextKey.current++;
              pendingLineFocus.current = key;
              setLines((current) => [...current, { ...emptyLine, key }]);
              setError(null);
            }}><Plus size={15} /> Add line</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0"><span className={labelClass}>Customer (optional)</span>
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Walk-in customer" autoComplete="off" className={inputClass} />
            </label>
            <label className="min-w-0"><span className={labelClass}>Phone (optional)</span>
              <input type="tel" inputMode="tel" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="Customer phone" autoComplete="off" className={inputClass} />
            </label>
          </div>

          <div className="mt-5 space-y-3">
            {lines.map((line, index) => (
              <fieldset key={line.key} className={`${styles.line} min-w-0 rounded-2xl border border-stone-200 p-4`}>
                <legend className="px-1 text-xs font-bold text-stone-600">Item {index + 1}</legend>
                <div className="mb-3"><label htmlFor={`${id}-product-${line.key}`} className={labelClass}>Choose an item</label>
                  <select id={`${id}-product-${line.key}`} value={line.productId ?? ''} onChange={event => {
                    const product = products.find(item => item.id === event.target.value);
                    updateLine(line.key, product ? { productId: product.id, name: product.name, category: product.category, unitPrice: product.sellingPrice } : { ...emptyLine, productId: undefined, quantity: line.quantity });
                  }} className={inputClass}>
                    <option value="">Custom item or service</option>
                    {products.map(product => <option key={product.id} value={product.id}>{product.name}{product.itemType === 'product' ? ` — ${product.stock} in stock` : ' — service'}</option>)}
                  </select>
                </div>
                {line.productId && !products.some(product => product.id === line.productId) ? <p className="mb-3 text-xs text-red-700">This item is no longer available. Choose another item.</p> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="min-w-0 sm:col-span-2"><span className={labelClass}>Item name</span>
                    <input required readOnly={Boolean(line.productId)} value={line.name} onChange={(e) => updateLine(line.key, { name: e.target.value })} placeholder="Item or service" className={inputClass} />
                  </label>
                  <label className="min-w-0"><span className={labelClass}>Quantity</span>
                    <input required type="number" inputMode="decimal" min="0.001" step="any" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })} className={inputClass} />
                  </label>
                  <label className="min-w-0"><span className={labelClass}>Price per item (₹)</span>
                    <input required type="number" inputMode="decimal" min="0" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) })} className={inputClass} />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <details className="min-w-0 flex-1">
                    <summary className="w-fit cursor-pointer rounded-md py-2 text-xs font-medium text-stone-600">Category (optional)</summary>
                    <label><span className={labelClass}>Category</span><input value={line.category} onChange={(e) => updateLine(line.key, { category: e.target.value })} className={inputClass} /></label>
                  </details>
                  <Button type="button" variant="ghost" disabled={lines.length === 1} aria-label={`Remove item ${index + 1}`} onClick={() => {
                    setLines((current) => current.filter((item) => item.key !== line.key));
                    setError(null);
                  }}><Trash2 size={15} /><span>Remove</span></Button>
                </div>
              </fieldset>
            ))}
          </div>
        </Card>
        <Card className={styles.summary}>
          <div className={styles.summaryHeading}><CardTitle>Total</CardTitle></div>
          <div className={`${styles.paymentFields} grid gap-3 sm:grid-cols-2`}>
            <label className="min-w-0"><span className={labelClass}>Expected payment method</span>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className={inputClass}>
                {METHODS.map((method) => <option key={method}>{method}</option>)}
              </select>
            </label>
            <label className="min-w-0"><span className={labelClass}>Tax rate (%)</span>
              <input required type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.taxRate} onChange={(e) => { setForm({ ...form, taxRate: e.target.value }); setError(null); }} className={inputClass} />
            </label>
          </div>

          <div className={`${styles.totals} mt-5 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200`} aria-live="polite" aria-atomic="true">
            {totals.ok ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3 text-stone-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatInvoiceAmount(totals.subtotal)}</dd></div>
                <div className="flex justify-between gap-3 text-stone-600"><dt>Tax</dt><dd className="tabular-nums">{formatInvoiceAmount(totals.tax)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-stone-200 pt-2 font-bold text-stone-900"><dt>Total</dt><dd className="tabular-nums">{formatInvoiceAmount(totals.total)}</dd></div>
              </dl>
            ) : <p className="text-sm text-stone-600">Add the item details to see the bill total.</p>}
          </div>
          {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error}</p> : null}
          <p className="mt-4 text-xs leading-relaxed text-stone-600">This saves an unpaid bill. Catalogue items update stock when you save; custom items do not change stock. Confirm payment after the money arrives.</p>
          <Button type="submit" disabled={!hydrated} className="mt-4 w-full"><FilePlus2 size={16} /> Save bill</Button>
        </Card>
      </form>
    </section>
  );
}
