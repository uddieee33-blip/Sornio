'use client';

import { getActiveFormattingLocale } from '@/lib/locale';

import { useLocaleRefresh } from '@/lib/i18n';

/**
 * Scan Station — `/scan`.
 *
 * The page exists because of one sentence a shop owner says: *“I want to scan,
 * not type.”* It carries the three jobs a counter does with a scanner, and
 * nothing else:
 *
 *   1. **Counter** — scan packets onto a bill. A bill built here is recorded
 *      through the same `recordSale` path as a hand-typed one, so the ledger,
 *      stock, profitability and audit trail behave identically. Scanning is
 *      faster typing, never a second accounting path.
 *   2. **Goods inward** — scan the delivery in off the supplier's carton,
 *      raising stock at the price it actually came in at. This is where an
 *      ITF-14 case code or a supplier's Code 128 earns its keep.
 *   3. **Labels** — print a DukaanOS code for anything that will never carry a
 *      manufacturer's barcode: loose grain, stitched orders, house packs. The
 *      sheet prints through the browser to any printer in the shop, including a
 *      thermal label printer.
 *
 * Unmatched codes are shown, not hidden. A code nobody claims is the most
 * useful thing the scanner can produce: it says exactly which item still needs a
 * code on file, and it can be linked or created without leaving the page.
 *
 * Only portals that carry the scan module can reach this route — the Edge
 * middleware refuses everyone else before the page renders (see
 * `lib/portals/routes.ts`), and the blueprint says why in `capture.note`.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Link2,
  PackagePlus,
  Printer,
  ScanBarcode,
  ShoppingCart,
  Tag,
  Trash2,
  Usb,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarcodeScanner, type ScannerRead } from '@/components/scanning/barcode-scanner';
import { DeviceCheck } from '@/components/scanning/device-check';
import { LabelSheet, type LabelSpec } from '@/components/scanning/label-sheet';
import { formatCurrency } from '@/lib/business-data';
import { describeStockChange } from '@/lib/inventory';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import type { PaymentMethod } from '@/lib/models/billing';
import {
  applyScanToTicket,
  buildLooseCode,
  lineFromProduct,
  removeTicketLine,
  resolveScan,
  setTicketQuantity,
  ticketTotal,
  type ScanResolution,
  type ScanTicketLine,
} from '@/lib/scanning';

const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];
const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

type Mode = 'counter' | 'inward' | 'labels' | 'devices';

export default function ScanStationPage() {
  useLocaleRefresh();
  const { state, actions, hydrated } = useDukaanStore();
  const { portal, terms } = usePortal();

  const [mode, setMode] = useState<Mode>('counter');
  const [ticket, setTicket] = useState<ScanTicketLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [lastResult, setLastResult] = useState<ScanResolution | null>(null);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  // Goods inward: what has been scanned off the carton so far.
  const [inward, setInward] = useState<{ productId: string; quantity: number; cost: number }[]>([]);
  const [supplier, setSupplier] = useState('');

  // Labels.
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [looseWeightKg, setLooseWeightKg] = useState('1');

  const total = useMemo(() => ticketTotal(ticket), [ticket]);
  const scannedToday = useMemo(
    () => state.scanEvents.filter((event) => event.at.slice(0, 10) === new Date().toISOString().slice(0, 10)),
    [state.scanEvents],
  );
  const unmatched = useMemo(
    () => state.scanEvents.filter((event) => event.outcome === 'unmatched' || event.outcome === 'invalid').slice(0, 8),
    [state.scanEvents],
  );

  const note = (tone: 'ok' | 'error' | 'info', text: string) => {
    setFlash({ tone, text });
    window.setTimeout(() => setFlash(null), 4000);
  };

  /** One read, three possible jobs — decided by the mode the counter is in. */
  const handleRead = (read: ScannerRead) => {
    const resolution = resolveScan(read.code, state.products);
    setLastResult(resolution);

    if (mode === 'counter') {
      if (resolution.status === 'matched') {
        const line = lineFromProduct(resolution.product, resolution.quantity);
        setTicket((current) => applyScanToTicket(current, { ...line, mergeable: resolution.via !== 'loose' }));
        actions.recordScan({
          code: resolution.profile.code,
          source: read.source,
          context: 'counter',
          outcome: 'matched',
          symbology: resolution.profile.symbology,
          productId: resolution.product.id,
          productName: resolution.product.name,
          quantity: resolution.quantity,
        });
        note('ok', resolution.reason);
        return;
      }
      if (resolution.status === 'ambiguous') {
        actions.recordScan({ code: resolution.profile.code, source: read.source, context: 'counter', outcome: 'ambiguous', symbology: resolution.profile.symbology });
        note('error', resolution.reason);
        return;
      }
      actions.recordScan({
        code: resolution.profile.code,
        source: read.source,
        context: 'counter',
        outcome: resolution.status === 'invalid' ? 'invalid' : 'unmatched',
        symbology: resolution.profile.symbology,
      });
      note(resolution.status === 'invalid' ? 'error' : 'info', resolution.reason);
      return;
    }

    if (mode === 'inward') {
      if (resolution.status !== 'matched') {
        actions.recordScan({
          code: resolution.profile.code,
          source: read.source,
          context: 'inward',
          outcome: resolution.status === 'invalid' ? 'invalid' : 'unmatched',
          symbology: resolution.profile.symbology,
        });
        note('error', resolution.reason);
        return;
      }
      const product = resolution.product;
      if (product.itemType === 'service') {
        note('error', `${product.name} is a service — there is nothing to receive.`);
        return;
      }
      const quantity = resolution.via === 'loose' ? 1 : resolution.quantity;
      setInward((current) => {
        const existing = current.find((entry) => entry.productId === product.id);
        if (existing) {
          return current.map((entry) => (entry.productId === product.id ? { ...entry, quantity: entry.quantity + quantity } : entry));
        }
        return [...current, { productId: product.id, quantity, cost: product.cost }];
      });
      actions.recordScan({
        code: resolution.profile.code,
        source: read.source,
        context: 'inward',
        outcome: 'matched',
        symbology: resolution.profile.symbology,
        productId: product.id,
        productName: product.name,
        quantity,
      });
      note('ok', `${product.name} received — ${quantity} unit(s) at ${formatCurrency(product.cost)} each.`);
      return;
    }

    // Labels: the scan tells us which item needs a printed code.
    if (resolution.status === 'matched') {
      setSelectedLabels((current) => (current.includes(resolution.product.id) ? current : [...current, resolution.product.id]));
      note('ok', `${resolution.product.name} added to the label sheet.`);
      return;
    }
    note('info', 'Scan an item you already stock to add it to the label sheet, or pick it from the list.');
  };

  const commitSale = () => {
    if (ticket.length === 0) return;
    const result = actions.recordSale({
      lines: ticket.map((line) => ({ productId: line.productId, quantity: line.quantity, rate: line.rate })),
      method,
      customerName,
      source: 'scan',
    });
    if (result.ok) {
      // The shelf change, in units, right where the owner is looking — not
      // buried on another screen. This is the "108 packets became 105" moment.
      const changed = (result.stockChanges ?? []).map(describeStockChange);
      note(
        'ok',
        `${formatCurrency(total)} billed through the scanner — revenue, stock and cash updated.${changed.length ? ` ${changed.join(', ')}.` : ''}`,
      );
      setTicket([]);
      setCustomerName('');
      setLastResult(null);
    } else {
      note('error', result.error ?? 'Could not record the sale.');
    }
  };

  const commitInward = () => {
    if (inward.length === 0) return;
    const result = actions.recordStockInward({ lines: inward, supplier: supplier.trim() || undefined });
    if (result.ok) {
      note('ok', `${inward.length} item(s) added to stock — inventory value updated at purchase cost.`);
      setInward([]);
      setSupplier('');
    } else {
      note('error', result.error ?? 'Could not receive the delivery.');
    }
  };

  /** Attach an unknown code to an existing item, straight from the unmatched list. */
  const linkTo = (code: string, productId: string) => {
    const result = actions.assignCode({ productId, code });
    note(result.ok ? 'ok' : 'error', result.ok ? `${code} linked — the counter will recognise it from now on.` : result.error ?? 'Could not link it.');
  };

  /** A plain label for an item — shelf tag or packet label. */
  const shelfLabel = (product: (typeof state.products)[number]): LabelSpec | null => {
    const code = product.barcode ?? product.internalCode;
    if (!code) return null;
    return {
      id: `${product.id}-base`,
      name: product.name,
      code,
      price: product.sellingPrice,
      unit: product.unit,
      shopName: state.profile.name,
      kind: product.looseMode && product.looseMode !== 'none' ? 'loose' : 'shelf',
      detail: product.looseMode && product.looseMode !== 'none' ? 'weighed at the counter' : undefined,
    };
  };

  /**
   * The fresh label a counter scale would print for this item at this weight —
   * a real in-store EAN-13 carrying the weight (or the price) inside the code.
   */
  const weighLabel = (product: (typeof state.products)[number]): LabelSpec | null => {
    if (!product.internalCode || !product.looseMode || product.looseMode === 'none') return null;
    const kg = Math.max(0.05, Number(looseWeightKg) || 1);
    const grams = Math.round(kg * 1000);
    const scaleNumber = product.scaleNumber ?? Number(/^DK(\d{8})\d$/.exec(product.internalCode)?.[1] ?? 1) % 99999;
    return {
      id: `${product.id}-loose-${grams}`,
      name: product.name,
      code: buildLooseCode({
        mode: product.looseMode,
        itemNumber: scaleNumber,
        value: product.looseMode === 'price' ? Math.round(product.sellingPrice * kg) : grams,
      }),
      price: product.sellingPrice,
      unit: product.unit,
      weight: `${kg} kg`,
      shopName: state.profile.name,
      kind: 'loose',
      detail: 'weighed at the counter',
    };
  };

  const labels: LabelSpec[] = selectedLabels.flatMap((id) => {
    const product = state.products.find((item) => item.id === id);
    if (!product) return [];
    return [shelfLabel(product), weighLabel(product)].filter((label): label is LabelSpec => Boolean(label));
  });

  const labelCandidates = state.products.filter((product) => product.status === 'Active' && (product.barcode || product.internalCode));

  const modeTabs: { id: Mode; label: string; icon: typeof ScanBarcode; hint: string }[] = [
    { id: 'counter', label: 'Counter', icon: ShoppingCart, hint: 'Scan onto a bill' },
    { id: 'inward', label: 'Goods inward', icon: Boxes, hint: 'Scan the delivery in' },
    { id: 'labels', label: 'Labels', icon: Tag, hint: 'Print codes for uncoded goods' },
    // The tab an owner opens when something is not working — and the tab that
    // proves the other three work with the hardware on this counter.
    { id: 'devices', label: 'Devices', icon: Usb, hint: 'Test your scanner, camera and reader' },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow={`${portal.capture.label} · ${scannedToday.length} scan${scannedToday.length === 1 ? '' : 's'} today`}
        title="Scan Station"
        subtitle={`${portal.capture.what}. ${portal.capture.note}`}
      />

      {flash ? (
        <div
          className={`mb-6 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset animate-fade-in ${
            flash.tone === 'ok'
              ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20'
              : flash.tone === 'error'
                ? 'bg-red-500/10 text-red-700 ring-red-500/20'
                : 'bg-sky-500/10 text-sky-700 ring-sky-500/20'
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {modeTabs.map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                setLastResult(null);
              }}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-left ring-1 ring-inset transition ${
                active ? 'bg-portal-gradient text-white ring-transparent' : 'bg-white text-stone-700 ring-stone-200 hover:text-stone-900'
              }`}
            >
              <Icon size={15} />
              <span>
                <span className="block text-xs font-bold">{tab.label}</span>
                <span className={`block text-[10px] ${active ? 'text-white/80' : 'text-stone-500'}`}>{tab.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {mode === 'devices' ? <DeviceCheck /> : null}

      <div className={`grid gap-6 lg:grid-cols-[1.08fr_0.92fr] ${mode === 'devices' ? 'mt-6' : ''}`}>
        <div className="space-y-6">
          {/* The live scanner stays mounted in every mode, including the device
              test: the counter never loses its input because someone opened a
              diagnostics tab mid-bill. */}
          <BarcodeScanner
            label={mode === 'inward' ? 'Receive into stock' : mode === 'labels' ? 'Add to the label sheet' : mode === 'devices' ? 'Scanner test — scan anything' : 'Counter scanner'}
            onRead={handleRead}
            onIgnored={(reason) => note('error', reason)}
          />

          {mode === 'counter' ? (
            <Card className="animate-fade-up">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <CardTitle icon={<ShoppingCart size={17} />}>Scanned bill</CardTitle>
                <Badge tone={ticket.length > 0 ? 'brand' : 'slate'}>{ticket.length} line(s)</Badge>
              </div>

              {ticket.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
                  Nothing scanned yet. Point the scanner at a packet — matched items land here instantly, and anything unknown is offered as a
                  new item so the counter never has to stop.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {ticket.map((line) => (
                    <li key={line.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-900">
                          {line.name}
                          {line.mergeable ? null : <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-portal">weighed</span>}
                        </p>
                        <p className="truncate text-[11px] text-stone-600">
                          {formatCurrency(line.rate)} {line.unit ? `/ ${line.unit}` : ''} · scanned
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={line.mergeable ? 1 : 0.001}
                        value={line.quantity}
                        onChange={(event) => setTicket((current) => setTicketQuantity(current, line.id, Number(event.target.value || 0)))}
                        aria-label={`Quantity for ${line.name}`}
                        className="w-20 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-right text-sm tabular-nums outline-hidden focus:border-portal/50"
                      />
                      <span className="w-24 text-right font-display text-sm font-bold text-stone-900 tabular-nums">
                        {formatCurrency(line.quantity * line.rate)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTicket((current) => removeTicketLine(current, line.id))}
                        className="rounded-lg p-2 text-stone-500 transition hover:bg-red-500/10 hover:text-red-700"
                        aria-label={`Remove ${line.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 space-y-3 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <div className="flex flex-wrap gap-2">
                  {METHODS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMethod(option)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        method === option ? 'bg-portal-gradient text-white' : 'bg-white text-stone-600 ring-1 ring-inset ring-stone-200 hover:text-stone-900'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                    {terms.customerOne} (optional)
                    <input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Walk-in"
                      className={`mt-1.5 ${inputClass}`}
                    />
                  </label>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Bill total</p>
                    <p className="font-display text-2xl font-bold text-stone-900 tabular-nums">{formatCurrency(total)}</p>
                  </div>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="secondary" onClick={() => setTicket([])} disabled={ticket.length === 0}>
                    Clear
                  </Button>
                  <Button onClick={commitSale} disabled={ticket.length === 0}>
                    <Zap size={16} /> Bill {formatCurrency(total)}
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {mode === 'inward' ? (
            <Card className="animate-fade-up">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <CardTitle icon={<Boxes size={17} />}>Delivery being received</CardTitle>
                <Badge tone={inward.length > 0 ? 'brand' : 'slate'}>{inward.length} item(s)</Badge>
              </div>
              {inward.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
                  Scan each carton or packet as it comes off the delivery. Stock rises at the purchase price, and inventory value in the ledger
                  moves with it — no separate register, no evening reconciliation.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {inward.map((entry) => {
                    const product = state.products.find((item) => item.id === entry.productId);
                    return (
                      <li key={entry.productId} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-900">{product?.name ?? 'Item'}</p>
                          <p className="text-[11px] text-stone-600">
                            {product ? `${product.stock} in stock → ${product.stock + entry.quantity}` : ''}
                          </p>
                        </div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                          Qty
                          <input
                            type="number"
                            min={1}
                            value={entry.quantity}
                            onChange={(event) =>
                              setInward((current) =>
                                current.map((item) =>
                                  item.productId === entry.productId ? { ...item, quantity: Math.max(1, Number(event.target.value || 1)) } : item,
                                ),
                              )
                            }
                            className="mt-0.5 block w-16 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-right text-sm tabular-nums outline-hidden focus:border-portal/50"
                          />
                        </label>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                          Cost
                          <input
                            type="number"
                            min={0}
                            value={entry.cost}
                            onChange={(event) =>
                              setInward((current) =>
                                current.map((item) =>
                                  item.productId === entry.productId ? { ...item, cost: Math.max(0, Number(event.target.value || 0)) } : item,
                                ),
                              )
                            }
                            className="mt-0.5 block w-20 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-right text-sm tabular-nums outline-hidden focus:border-portal/50"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setInward((current) => current.filter((item) => item.productId !== entry.productId))}
                          className="rounded-lg p-2 text-stone-500 transition hover:bg-red-500/10 hover:text-red-700"
                          aria-label="Remove line"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200 sm:flex-row sm:items-end">
                <label className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Supplier (optional)
                  <input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Who delivered it" className={`mt-1.5 ${inputClass}`} />
                </label>
                <Button onClick={commitInward} disabled={inward.length === 0}>
                  <PackagePlus size={16} /> Receive into stock
                </Button>
              </div>
            </Card>
          ) : null}

          {mode === 'labels' ? (
            <Card className="animate-fade-up">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <CardTitle icon={<Tag size={17} />}>Label sheet</CardTitle>
                <Badge tone="slate">{labelCandidates.length} printable item(s)</Badge>
              </div>
              {labelCandidates.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title={hydrated ? 'No printable items yet' : 'Reading this device…'}
                  description="Once an item has a barcode or a DukaanOS internal code, its label can be printed here — a shelf tag, a packet label, or an in-store weigh label that carries the weight itself."
                />
              ) : (
                <>
                  <p className="mb-3 text-[11px] leading-relaxed text-stone-600">
                    Tick what you need, or scan an item to add it. Items sold loose also get a weigh label at the weight you set — that is the
                    label a counter scale would print, and any scanner in the shop reads it.
                  </p>
                  <div className="mb-4 flex flex-wrap items-end gap-3">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                      Weigh label for
                      <input
                        type="number"
                        min={0.05}
                        step={0.05}
                        value={looseWeightKg}
                        onChange={(event) => setLooseWeightKg(event.target.value)}
                        className="mt-1.5 block w-24 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm tabular-nums outline-hidden focus:border-portal/50"
                      />
                    </label>
                    <span className="pb-2.5 text-xs text-stone-600">kg — applied to every loose item you tick</span>
                  </div>
                  <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    {labelCandidates.map((product) => {
                      const checked = selectedLabels.includes(product.id);
                      return (
                        <label
                          key={product.id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-xs transition ${
                            checked ? 'border-portal/40 bg-portal/[0.06]' : 'border-stone-200 bg-white hover:bg-stone-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedLabels((current) => (checked ? current.filter((id) => id !== product.id) : [...current, product.id]))}
                            className="h-4 w-4 rounded border-stone-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-stone-900">{product.name}</span>
                            <span className="block truncate font-mono text-[10px] text-stone-600">
                              {product.barcode ?? product.internalCode}
                              {product.looseMode && product.looseMode !== 'none' ? ' · loose, sold by weight' : ''}
                            </span>
                          </span>
                          {product.looseMode && product.looseMode !== 'none' && product.internalCode ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                const result = actions.mintInternalCode(product.id);
                                note(result.ok ? 'ok' : 'error', result.ok ? 'Internal code minted — it prints as Code 128.' : result.error ?? 'Could not mint a code.');
                              }}
                              className="shrink-0 rounded-lg bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600 ring-1 ring-inset ring-stone-200 transition hover:text-stone-900"
                            >
                              Re-mint
                            </button>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                  <LabelSheet labels={labels} columns={3} />
                </>
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {lastResult ? (
            <Card className="animate-fade-up">
              <CardTitle icon={<ScanBarcode size={17} />}>Last read</CardTitle>
              <p className="mt-3 font-mono text-sm font-bold tracking-wide text-stone-900">{lastResult.profile.code || '—'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={lastResult.status === 'matched' ? 'emerald' : lastResult.status === 'invalid' ? 'red' : 'amber'}>
                  {lastResult.status}
                </Badge>
                <Badge tone="slate">{lastResult.profile.symbology}</Badge>
                {lastResult.profile.kind !== 'unknown' ? <Badge tone="sky">{lastResult.profile.kind}</Badge> : null}
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-stone-600">{lastResult.reason}</p>

              {lastResult.status === 'unmatched' ? (
                <div className="mt-4 space-y-3 rounded-2xl bg-stone-50 p-3.5 ring-1 ring-inset ring-stone-200">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">What next?</p>
                  {lastResult.suggestions.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-[11px] text-stone-600">Closest items on file</p>
                      <div className="flex flex-wrap gap-1.5">
                        {lastResult.suggestions.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => linkTo(lastResult.profile.code, product.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:text-stone-900"
                          >
                            <Link2 size={11} /> {product.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <Link
                    href={`/products?code=${encodeURIComponent(lastResult.profile.code)}`}
                    className="touch-manipulation inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-portal-gradient px-3 py-1.5 text-[11px] font-bold text-white shadow-glow-sm transition hover:brightness-110"
                  >
                    <PackagePlus size={12} /> Create this item in the catalogue
                  </Link>
                  <p className="text-[10px] leading-relaxed text-stone-500">
                    The catalogue form opens with the scanned code filled in — save it once and this packet scans itself from the next bill.
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card className="animate-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle icon={<AlertTriangle size={17} />}>Codes that matched nothing</CardTitle>
              <Badge tone={unmatched.length > 0 ? 'amber' : 'slate'}>{unmatched.length}</Badge>
            </div>
            {unmatched.length === 0 ? (
              <p className="rounded-xl bg-emerald-500/[0.07] p-3.5 text-xs leading-relaxed text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
                Every code scanned so far resolved to an item on file. Nothing needs a code attaching.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {unmatched.map((event) => (
                  <li key={event.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-stone-900">{event.code}</span>
                      <Badge tone={event.outcome === 'invalid' ? 'red' : 'amber'}>{event.outcome}</Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-stone-500">
                      {event.source} · {event.context} · {new Date(event.at).toLocaleString(getActiveFormattingLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {resolveScan(event.code, state.products).status === 'unmatched' &&
                      (resolveScan(event.code, state.products) as Extract<ScanResolution, { status: 'unmatched' }>).suggestions
                        .slice(0, 3)
                        .map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => linkTo(event.code, product.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:text-stone-900"
                          >
                            <Link2 size={10} /> {product.name}
                          </button>
                        ))}
                      <Link
                        href={`/products?code=${encodeURIComponent(event.code)}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-portal ring-1 ring-inset ring-portal/25 transition hover:bg-portal/[0.06]"
                      >
                        <PackagePlus size={10} /> Create item
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle icon={<CheckCircle2 size={17} />}>Today’s scan log</CardTitle>
              <Badge tone="slate">{scannedToday.length}</Badge>
            </div>
            {scannedToday.length === 0 ? (
              <p className="rounded-xl bg-stone-50 p-3.5 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
                No reads yet today. A record is kept of every scan — including which channel read it — so a disputed line can always be traced
                back to the second it was read.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
                {scannedToday.slice(0, 40).map((event) => (
                  <li key={event.id} className="flex items-center gap-2.5 py-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        event.outcome === 'matched' ? 'bg-emerald-500' : event.outcome === 'invalid' ? 'bg-red-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-stone-800">{event.productName ?? event.code}</span>
                      <span className="block truncate font-mono text-[10px] text-stone-500">
                        {event.code} · {event.source} · {event.symbology}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-stone-500">
                      {new Date(event.at).toLocaleTimeString(getActiveFormattingLocale(), { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-relaxed text-stone-500">
              <Printer size={11} /> Labels print from the browser to any printer in the shop — including a thermal label printer.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
