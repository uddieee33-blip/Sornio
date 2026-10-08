'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, Plus, ShoppingCart, Trash2, Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BarcodeScanner, type ScannerRead } from '@/components/scanning/barcode-scanner';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, type SaleLine } from '@/lib/store';
import { describeStockChange } from '@/lib/inventory';
import { usePortal } from '@/lib/portals/portal-provider';
import { resolveScan } from '@/lib/scanning';
import type { PaymentMethod } from '@/lib/models/billing';

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];
const inputClass = 'rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

export default function SalesPage() {
  useLocaleRefresh();
  const { state, actions } = useDukaanStore();
  const { portal } = usePortal();
  const sellableProducts = state.products.filter((product) => product.status === 'Active');
  // The counter scanner is part of this trade's desk — a gym's enrolment desk
  // never grows one (see the portal blueprint's `capture`).
  const scansAtThisDesk = portal.capture.channels.includes('barcode');

  const [lines, setLines] = useState<SaleLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.rate, 0), [lines]);

  const addLine = () => {
    const first = sellableProducts[0];
    if (!first) return;
    setLines((current) => [...current, { productId: first.id, quantity: 1, rate: first.sellingPrice }]);
  };

  const updateLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => setLines((current) => current.filter((_, i) => i !== index));

  const handleProductChange = (index: number, productId: string) => {
    const product = state.products.find((item) => item.id === productId);
    updateLine(index, { productId, rate: product ? product.sellingPrice : 0 });
  };

  const handleRecord = (methodOverride?: PaymentMethod) => {
    const used = methodOverride ?? method;
    const result = actions.recordSale({ lines, method: used, customerName });
    if (result.ok) {
      // Say what the sale did to the shelves, in units the owner can go and
      // count: "Kidney beans — 108 → 105". A stock figure that changes without
      // a sentence next to it is the thing shopkeepers stop trusting.
      const changed = (result.stockChanges ?? []).map(describeStockChange);
      setMessage({
        tone: 'ok',
        text: `Sale of ${formatCurrency(total)} recorded via ${used}.${changed.length ? ` Stock updated — ${changed.join(', ')}.` : ''}`,
      });
      setLimitHit(false);
      setLines([]);
      setCustomerName('');
    } else {
      setLimitHit(result.code === 'collection-limit');
      setMessage({ tone: 'error', text: result.error ?? 'Could not record sale.' });
    }
  };

  const recentSales = [...state.transactions].filter((tx) => tx.type === 'sale').reverse().slice(0, 6);

  /**
   * A scan at this counter adds a line at the catalogue price — the same line a
   * cashier would have typed, and the same `recordSale` path records it. An
   * unknown code is reported with its closest matches rather than guessed at.
   */
  const handleScan = (read: ScannerRead) => {
    const resolution = resolveScan(read.code, state.products);
    actions.recordScan({
      code: resolution.profile.code,
      source: read.source,
      context: 'counter',
      outcome: resolution.status,
      symbology: resolution.profile.symbology,
      productId: resolution.status === 'matched' ? resolution.product.id : undefined,
      productName: resolution.status === 'matched' ? resolution.product.name : undefined,
    });

    if (resolution.status === 'matched') {
      setLines((current) => {
        const index = current.findIndex((line) => line.productId === resolution.product.id);
        if (index >= 0 && resolution.via !== 'loose') {
          return current.map((line, position) =>
            position === index ? { ...line, quantity: line.quantity + resolution.quantity } : line,
          );
        }
        return [
          ...current,
          { productId: resolution.product.id, quantity: resolution.quantity, rate: resolution.product.sellingPrice },
        ];
      });
      setMessage({ tone: 'ok', text: resolution.reason });
      return;
    }
    setMessage({ tone: 'error', text: resolution.reason });
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader eyebrow="Operations" title="Sales" subtitle="Record multi-line sales. Revenue, cash, and inventory update everywhere automatically." />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
        {scansAtThisDesk ? (
          <BarcodeScanner onRead={handleScan} label={`${portal.terms.desk} scanner`} onIgnored={(reason) => setMessage({ tone: 'error', text: reason })} />
        ) : null}
        <Card className="animate-fade-up h-fit">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<ShoppingCart size={17} />}>Record a sale</CardTitle>
            <Button variant="secondary" onClick={addLine}><Plus size={15} /> Add line</Button>
          </div>

          <div className="space-y-4">
            {lines.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-stone-200 p-8 text-center">
                <ShoppingCart size={28} className="mx-auto text-stone-600" />
                <p className="mt-2 text-sm text-stone-600">No lines yet — add one to start a sale.</p>
              </div>
            ) : null}
            {lines.map((line, index) => {
              const product = state.products.find((item) => item.id === line.productId);
              return (
                <div key={index} className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                  <div className="grid gap-3 md:grid-cols-[1.5fr_0.5fr_0.8fr_auto]">
                    <select value={line.productId} onChange={(e) => handleProductChange(index, e.target.value)} className={inputClass}>
                      {sellableProducts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.itemType === 'product' ? ` (${item.stock} in stock)` : ''}
                        </option>
                      ))}
                    </select>
                    <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value || 0) })} className={inputClass} />
                    <input type="number" min={0} value={line.rate} onChange={(e) => updateLine(index, { rate: Number(e.target.value || 0) })} className={inputClass} />
                    <div className="flex items-center justify-between gap-3 md:justify-end">
                      <span className="font-display text-sm font-bold text-stone-900 tabular-nums">{formatCurrency(line.quantity * line.rate)}</span>
                      <button onClick={() => removeLine(index)} className="rounded-lg p-2 text-stone-600 transition hover:bg-red-500/10 hover:text-red-700"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {product && product.itemType === 'product' && line.quantity > product.stock ? (
                    <p className="mt-2 text-xs font-semibold text-red-700">Only {product.stock} in stock for {product.name}.</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-5 space-y-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600">Customer (optional)</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" className={`${inputClass} w-full`} />
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {METHODS.map((option) => (
                  <button key={option} onClick={() => { setMethod(option); setLimitHit(false); }} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${method === option ? 'bg-brand-gradient text-white shadow-glow-sm' : 'bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-200 hover:text-stone-900'}`}>
                    {option}
                  </button>
                ))}
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-stone-600">Sale total</p>
                <p className="font-display text-2xl font-bold text-stone-900 tabular-nums">{formatCurrency(total)}</p>
              </div>
            </div>
          </div>

          {message ? (
            <div className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'}`}>
              <p>{message.text}</p>
              {message.tone === 'error' && limitHit && method !== 'Cash' ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setMethod('Cash');
                      handleRecord('Cash');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 active:scale-95"
                  >
                    <Banknote size={13} /> Record it in cash instead
                  </button>
                  <Link
                    href="/subscription"
                    className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-white"
                  >
                    Remove the limit <ArrowRight size={12} />
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <Button onClick={() => handleRecord()}><Zap size={16} /> Record sale</Button>
          </div>
        </Card>
        </div>

        <Card className="animate-fade-up h-fit">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<Zap size={17} />}>Recent sales</CardTitle>
            <Badge tone="emerald" dot>{recentSales.length}</Badge>
          </div>
          <div className="space-y-3">
            {recentSales.map((sale) => (
              <div key={sale.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5 transition hover:border-emerald-400/25 hover:bg-stone-100">
                <p className="text-sm font-semibold text-stone-800">{sale.description}</p>
                <div className="mt-1.5 flex items-center justify-between text-xs text-stone-600">
                  <span>{sale.date} · {sale.paymentMethod ?? '—'}</span>
                  <span className="font-bold text-emerald-700 tabular-nums">+{formatCurrency(sale.amount)}</span>
                </div>
              </div>
            ))}
            {recentSales.length === 0 ? <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">No sales recorded yet.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
