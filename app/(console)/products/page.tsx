'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Package, PackagePlus, Pencil, Search, Tag, Upload, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ImportDialog } from '@/components/import/import-dialog';
import { BarcodeScanner } from '@/components/scanning/barcode-scanner';
import { formatCurrency, type Product } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { describeCode, isValidGtin, looksLikeCode } from '@/lib/scanning';
import { useSearchParams } from 'next/navigation';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

type SortKey = 'name' | 'sellingPrice' | 'stock' | 'margin';

const emptyForm = {
  name: '', itemType: 'product', category: 'General', description: '', sellingPrice: '0', cost: '0',
  taxRate: '0', stock: '0', reorderLevel: '0', sku: '', unit: 'pcs', supplier: '', status: 'Active',
  barcode: '', looseMode: 'none',
};

/**
 * Where a scanned code belongs. A GTIN or a supplier label is read off a
 * printed packet, so it goes in the barcode field; a code DukaanOS minted itself
 * belongs in the internal field. One field on screen, the right slot in the
 * catalogue.
 */
function codeSlot(code: string): 'barcode' | 'internalCode' {
  return /^DK\d{9}$/.test(code.trim().toUpperCase()) ? 'internalCode' : 'barcode';
}

function marginPct(product: Product): number {
  return product.sellingPrice > 0 ? ((product.sellingPrice - product.cost) / product.sellingPrice) * 100 : 0;
}

export default function ProductsPage() {
  useLocaleRefresh();
  const { state, actions } = useDukaanStore();
  const { portal } = usePortal();
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [selected, setSelected] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);

  const categories = useMemo(() => Array.from(new Set(state.products.map((p) => p.category))).sort(), [state.products]);

  /**
   * Arriving from the scan station with an unknown code: prefill it, so the item
   * is registered once and scans itself from the next bill. Adjusting state
   * during render (rather than in an effect) is React's documented pattern for
   * deriving state from props, and it keeps this off the effect path entirely.
   */
  const searchParams = useSearchParams();
  const scannedCode = (searchParams.get('code') ?? '').trim();
  const [appliedCode, setAppliedCode] = useState('');
  if (scannedCode && scannedCode !== appliedCode) {
    setAppliedCode(scannedCode);
    setForm((current) => ({ ...current, barcode: scannedCode }));
    setMessage({
      tone: 'ok',
      text: `Code ${scannedCode} filled in from the scan station. Name the item and save — then it scans itself at the counter.`,
    });
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = state.products.filter((p) => {
      if (needle && !`${p.name} ${p.category} ${p.sku ?? ''} ${p.supplier ?? ''} ${p.barcode ?? ''} ${p.internalCode ?? ''}`.toLowerCase().includes(needle)) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'sellingPrice') return b.sellingPrice - a.sellingPrice;
      if (sortKey === 'stock') return b.stock - a.stock;
      return marginPct(b) - marginPct(a);
    });
  }, [state.products, query, categoryFilter, statusFilter, sortKey]);

  // Product profitability + history from the traceable sale ledger.
  const productStats = useMemo(() => {
    const stats = new Map<string, { revenue: number; cogs: number; units: number; history: { date: string; quantity: number; rate: number; total: number }[] }>();
    for (const tx of state.transactions) {
      if (tx.type !== 'sale' || !tx.items) continue;
      for (const item of tx.items) {
        const entry = stats.get(item.productId) ?? { revenue: 0, cogs: 0, units: 0, history: [] };
        entry.revenue += item.quantity * item.rate;
        entry.cogs += item.quantity * item.cost;
        entry.units += item.quantity;
        entry.history.unshift({ date: tx.date, quantity: item.quantity, rate: item.rate, total: item.quantity * item.rate });
        stats.set(item.productId, entry);
      }
    }
    return stats;
  }, [state.transactions]);

  const handleSubmit = () => {
    // A code is validated before it is stored, exactly as the counter would
    // validate it: a mistyped barcode in the catalogue is a misread waiting to
    // happen on every future bill.
    const code = form.barcode.trim();
    if (code) {
      if (!looksLikeCode(code)) {
        setMessage({ tone: 'error', text: 'That barcode does not look right — it should be at least three printable characters.' });
        return;
      }
      const gtinShaped = [8, 12, 13, 14].includes(code.length) && /^\d+$/.test(code);
      if (gtinShaped && !isValidGtin(code)) {
        setMessage({ tone: 'error', text: 'That retail barcode’s check digit does not match — scan the packet again, or type the digits printed under the bars.' });
        return;
      }
      const clash = state.products.find(
        (product) => [product.barcode, product.internalCode].some((existing) => existing && existing.trim().toUpperCase() === code.toUpperCase()),
      );
      if (clash) {
        setMessage({ tone: 'error', text: `${clash.name} already carries ${code}. Two items can never share a code — clear it there first.` });
        return;
      }
    }

    const result = actions.addProduct({
      name: form.name,
      category: form.category.trim() || 'General',
      itemType: form.itemType === 'service' ? 'service' : 'product',
      sellingPrice: Number(form.sellingPrice || 0),
      cost: Number(form.cost || 0),
      stock: form.itemType === 'service' ? 0 : Number(form.stock || 0),
      reorderLevel: form.itemType === 'service' ? 0 : Number(form.reorderLevel || 0),
      status: form.status === 'Inactive' ? 'Inactive' : 'Active',
      supplier: form.supplier.trim() || undefined,
      description: form.description.trim() || undefined,
      taxRate: Number(form.taxRate || 0),
      sku: form.sku.trim() || undefined,
      unit: form.unit.trim() || undefined,
      ...(form.barcode
        ? codeSlot(form.barcode) === 'internalCode'
          ? { internalCode: form.barcode }
          : { barcode: form.barcode }
        : {}),
      ...(form.itemType === 'product' && form.looseMode !== 'none' ? { looseMode: form.looseMode as 'weight' | 'price' } : {}),
    });
    if (result.ok) {
      setMessage({
        tone: 'ok',
        text: `${form.name.trim()} saved${code ? ' with its code' : ''} — it is now available in Sales, Inventory, Profitability, and Reports.`,
      });
      setForm(emptyForm);
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not add item.' });
    }
  };

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    detailCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelected(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(detailPanelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !detailPanelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !detailPanelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      detailTriggerRef.current?.focus();
    };
  }, [selected]);

  const selectedStats = selected ? productStats.get(selected.id) : undefined;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Catalog"
        title="Products & Services"
        subtitle="Create your own items once — they power Sales, Inventory, Profitability, Reports, and Insights."
        actions={<Badge tone="brand" dot>{state.products.length} items</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        {/* Add item */}
        <div className="space-y-6">
        {portal.capture.channels.includes('barcode') ? (
          <BarcodeScanner
            label="Register a code"
            autoFocus={false}
            onRead={(read) => {
              const profile = describeCode(read.code);
              setForm((current) => ({ ...current, barcode: profile.code }));
              setMessage({
                tone: profile.valid ? 'ok' : 'error',
                text: profile.valid
                  ? `${profile.note} Now name the item and save.`
                  : profile.note,
              });
            }}
          />
        ) : null}
        <Card className="animate-fade-up h-fit">
          <div className="mb-5"><CardTitle icon={<PackagePlus size={17} />}>Add Item</CardTitle></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><label className={labelClass} htmlFor="new-item-name">Item Name *</label><input id="new-item-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Handmade Soap" /></div>
            <div><label className={labelClass} htmlFor="new-item-type">Item Type</label>
              <select id="new-item-type" value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} className={inputClass}>
                <option value="product">Product</option><option value="service">Service</option>
              </select>
            </div>
            <div><label className={labelClass} htmlFor="new-item-category">Category</label><input id="new-item-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} placeholder="e.g. Personal Care" /></div>
            <div className="md:col-span-2"><label className={labelClass} htmlFor="new-item-description">Description</label><input id="new-item-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Optional description" /></div>
            <div><label className={labelClass} htmlFor="new-item-price">Selling Price (₹)</label><input id="new-item-price" type="number" min={0} value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="new-item-cost">Cost Price (₹)</label><input id="new-item-cost" type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="new-item-tax">Tax % (if applicable)</label><input id="new-item-tax" type="number" min={0} max={100} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="new-item-unit">Unit</label><input id="new-item-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputClass} placeholder="pcs / kg / hour" /></div>
            {form.itemType === 'product' ? (
              <>
                <div><label className={labelClass} htmlFor="new-item-stock">Opening Stock</label><input id="new-item-stock" type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass} htmlFor="new-item-reorder">Reorder Level</label><input id="new-item-reorder" type="number" min={0} value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} className={inputClass} /></div>
              </>
            ) : null}
            <div><label className={labelClass} htmlFor="new-item-sku">SKU / Item Code (optional)</label><input id="new-item-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} className={inputClass} placeholder="SOAP-001" /></div>
            <div className="md:col-span-2">
              <label className={labelClass} htmlFor="new-item-barcode">Barcode (scan the packet, or type it)</label>
              <div className="relative">
                <Tag size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                <input
                  id="new-item-barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className={`${inputClass} pl-9 font-mono`}
                  placeholder="8901234567890 — or a DukaanOS code like DK000000018"
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-stone-600">
                A retail code is checked before it is saved. No barcode on the packet? Save the item, then mint an internal code and print the
                label from the Scan Station — every scanner in the shop will read it.
              </p>
            </div>
            {form.itemType === 'product' ? (
              <div>
                <label className={labelClass} htmlFor="new-item-loose">Sold loose?</label>
                <select id="new-item-loose" value={form.looseMode} onChange={(e) => setForm({ ...form, looseMode: e.target.value })} className={inputClass}>
                  <option value="none">No — packets and pieces</option>
                  <option value="weight">Yes — the scale prints the weight</option>
                  <option value="price">Yes — the scale prints the price</option>
                </select>
              </div>
            ) : null}
            <div><label className={labelClass} htmlFor="new-item-supplier">Supplier (optional)</label><input id="new-item-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={inputClass} placeholder="Urban Goods Co." /></div>
            <div><label className={labelClass} htmlFor="new-item-status">Status</label>
              <select id="new-item-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                <option value="Active">Active</option><option value="Inactive">Inactive (archived)</option>
              </select>
            </div>
          </div>
          {message ? (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button onClick={handleSubmit}><PackagePlus size={16} /> Save item</Button>
          </div>
        </Card>
        </div>

        {/* Product list */}
        <Card className="animate-fade-up">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <CardTitle icon={<Package size={17} />}>Product list</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-200"
              >
                <Upload size={14} /> Import CSV
              </button>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-600" />
                <input type="search" aria-label="Search name, SKU, supplier…" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU, supplier…" className="w-56 rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus" />
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <select aria-label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-semibold text-stone-700 outline-hidden focus:border-portal/50">
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-semibold text-stone-700 outline-hidden focus:border-portal/50">
              <option value="all">Any status</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
            </select>
            <select aria-label={sortKey === 'name' ? 'Sort: Name' : sortKey === 'sellingPrice' ? 'Sort: Price' : sortKey === 'stock' ? 'Sort: Stock' : 'Sort: Margin'} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-semibold text-stone-700 outline-hidden focus:border-portal/50">
              <option value="name">Sort: Name</option>
              <option value="sellingPrice">Sort: Price</option>
              <option value="stock">Sort: Stock</option>
              <option value="margin">Sort: Margin</option>
            </select>
            <span className="ml-auto text-stone-600">{visible.length} shown</span>
          </div>

          {state.products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No items yet"
              description="A new business starts with an empty catalog. Add your first product or service — every sale, stock movement, and profit figure will flow from it."
            >
              <Button onClick={() => setImportOpen(true)}>
                <Upload size={16} /> Import CSV
              </Button>
            </EmptyState>
          ) : visible.length === 0 ? (
            <p className="rounded-2xl bg-stone-50 p-6 text-sm text-stone-600">No items match the current search/filter.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-stone-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 text-right font-semibold">Price</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost</th>
                    <th className="px-4 py-3 text-right font-semibold">Margin</th>
                    <th className="px-4 py-3 text-right font-semibold">Stock</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => {
                    const margin = marginPct(product);
                    return (
                      <tr key={product.id} onClick={() => { detailTriggerRef.current = null; setSelected(product); }} className="cursor-pointer border-t border-stone-200 transition hover:bg-brand-500/[0.06]">
                        <td className="px-4 py-3">
                          <button type="button" onClick={(event) => { event.stopPropagation(); detailTriggerRef.current = event.currentTarget; setSelected(product); }} className="min-h-11 w-full rounded-lg text-left font-medium text-stone-800 underline-offset-2 hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">{product.name}</button>
                          <p className="text-xs text-stone-600">
                            {product.itemType === 'service' ? 'Service' : 'Product'}
                            {product.sku ? ` · ${product.sku}` : ''}
                          </p>
                          {product.barcode || product.internalCode ? (
                            <p className="mt-0.5 font-mono text-[10px] text-stone-500">
                              {product.barcode ?? product.internalCode}
                              {product.looseMode && product.looseMode !== 'none' ? ' · loose by weight' : ''}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[10px] font-semibold text-amber-700">no code — cannot be scanned yet</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-stone-600">{product.category}</td>
                        <td className="px-4 py-3 text-right font-semibold text-stone-900 tabular-nums">{formatCurrency(product.sellingPrice)}</td>
                        <td className="px-4 py-3 text-right text-stone-600 tabular-nums">{formatCurrency(product.cost)}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${margin >= 40 ? 'text-emerald-700' : margin >= 15 ? 'text-amber-700' : 'text-red-700'}`}>{margin.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-right text-stone-700 tabular-nums">{product.itemType === 'service' ? '—' : product.stock}</td>
                        <td className="px-4 py-3"><Badge tone={product.status === 'Active' ? 'emerald' : 'slate'} dot>{product.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Product detail drawer */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs" onClick={() => setSelected(null)} role="dialog" aria-modal="true" aria-label={selected.name}>
          <div ref={detailPanelRef} className="h-full w-full max-w-lg overflow-y-auto border-l border-stone-200 bg-panel p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">Product detail</p>
                <h2 className="mt-1.5 font-display text-2xl font-bold text-stone-900">{selected.name}</h2>
                <p className="mt-1 text-sm text-stone-600">{selected.category} · {selected.itemType === 'service' ? 'Service' : 'Product'}{selected.sku ? ` · SKU ${selected.sku}` : ''}{selected.supplier ? ` · ${selected.supplier}` : ''}</p>
              </div>
              <button ref={detailCloseRef} onClick={() => setSelected(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900" aria-label="Close"><X size={16} /></button>
            </div>

            {selected.description ? <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{selected.description}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200">
              {selected.barcode || selected.internalCode ? (
                <>
                  <Badge tone="emerald" dot>Scannable</Badge>
                  <span className="font-mono text-xs font-semibold text-stone-900">{selected.barcode ?? selected.internalCode}</span>
                  <span className="text-[11px] text-stone-600">
                    {selected.barcode ? 'retail barcode' : 'DukaanOS internal code'}
                    {selected.looseMode && selected.looseMode !== 'none' ? ' · sold loose' : ''}
                  </span>
                </>
              ) : (
                <>
                  <Badge tone="amber" dot>No code yet</Badge>
                  <span className="text-[11px] leading-relaxed text-stone-600">
                    This item cannot be scanned at the counter. Mint an internal code, print its label once, and it scans like anything else.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const result = actions.mintInternalCode(selected.id);
                      setMessage({ tone: result.ok ? 'ok' : 'error', text: result.ok ? 'Internal code minted — print its label from the Scan Station.' : result.error ?? 'Could not mint a code.' });
                      if (result.ok) setSelected(null);
                    }}
                    className="touch-manipulation min-h-11 rounded-lg bg-portal-gradient px-2.5 py-1.5 text-[11px] font-bold text-white shadow-glow-sm transition hover:brightness-110"
                  >
                    Mint internal code
                  </button>
                </>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: 'Revenue', value: formatCurrency(selectedStats?.revenue ?? 0) },
                { label: 'Profit', value: formatCurrency((selectedStats?.revenue ?? 0) - (selectedStats?.cogs ?? 0)) },
                { label: 'Margin', value: `${marginPct(selected).toFixed(1)}%` },
                { label: 'Units sold', value: String(selectedStats?.units ?? 0) },
                { label: 'Stock on hand', value: selected.itemType === 'service' ? '—' : String(selected.stock) },
                { label: 'Stock value', value: selected.itemType === 'service' ? '—' : formatCurrency(selected.stock * selected.cost) },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{stat.label}</p>
                  <p className="mt-1 font-display text-lg font-bold text-stone-900 tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>

            <ProductEditor key={selected.id} product={selected} />

            <h3 className="mt-6 text-sm font-semibold text-stone-700">Sales history</h3>
            <div className="mt-2 space-y-2">
              {(selectedStats?.history ?? []).slice(0, 8).map((entry, index) => (
                <div key={index} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
                  <span className="text-stone-600">{entry.date} · {entry.quantity} × {formatCurrency(entry.rate)}</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">+{formatCurrency(entry.total)}</span>
                </div>
              ))}
              {!selectedStats || selectedStats.history.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No sales recorded for this item yet — record one from the Sales page and it appears here.</p>
              ) : null}
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                onClick={() => actions.toggleProductStatus(selected.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ring-1 ring-inset transition ${selected.status === 'Active' ? 'bg-red-500/10 text-red-700 ring-red-500/25 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 hover:bg-emerald-500/20'}`}
              >
                {selected.status === 'Active' ? <><Archive size={15} /> Archive (deactivate)</> : <><ArchiveRestore size={15} /> Reactivate</>}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? <ImportDialog kind="products" onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}

/** Inline editor for price, cost, category, stock, reorder level, supplier, tax, unit, status. */
function ProductEditor({ product }: { product: Product }) {
  const { actions } = useDukaanStore();
  const [draft, setDraft] = useState({
    sellingPrice: String(product.sellingPrice),
    cost: String(product.cost),
    category: product.category,
    stock: String(product.stock),
    reorderLevel: String(product.reorderLevel),
    supplier: product.supplier ?? '',
    taxRate: String(product.taxRate ?? 0),
    unit: product.unit ?? 'pcs',
  });
  const [saved, setSaved] = useState<string | null>(null);

  const save = () => {
    const result = actions.updateProduct(product.id, {
      sellingPrice: Number(draft.sellingPrice || 0),
      cost: Number(draft.cost || 0),
      category: draft.category.trim() || 'General',
      stock: product.itemType === 'service' ? product.stock : Number(draft.stock || 0),
      reorderLevel: product.itemType === 'service' ? product.reorderLevel : Number(draft.reorderLevel || 0),
      supplier: draft.supplier.trim() || undefined,
      taxRate: Number(draft.taxRate || 0),
      unit: draft.unit.trim() || undefined,
    });
    setSaved(result.ok ? 'Saved — changes are audited.' : result.error ?? 'Could not save.');
    setTimeout(() => setSaved(null), 2500);
  };

  const small = 'w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50';

  return (
    <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800"><Pencil size={14} className="text-brand-600" /> Edit item</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-stone-600">Selling price<input type="number" min={0} value={draft.sellingPrice} onChange={(e) => setDraft({ ...draft, sellingPrice: e.target.value })} className={`mt-1 ${small}`} /></label>
        <label className="text-xs text-stone-600">Cost price<input type="number" min={0} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className={`mt-1 ${small}`} /></label>
        <label className="text-xs text-stone-600">Category<input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={`mt-1 ${small}`} /></label>
        <label className="text-xs text-stone-600">Tax %<input type="number" min={0} max={100} value={draft.taxRate} onChange={(e) => setDraft({ ...draft, taxRate: e.target.value })} className={`mt-1 ${small}`} /></label>
        {product.itemType === 'product' ? (
          <>
            <label className="text-xs text-stone-600">Stock<input type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} className={`mt-1 ${small}`} /></label>
            <label className="text-xs text-stone-600">Reorder level<input type="number" min={0} value={draft.reorderLevel} onChange={(e) => setDraft({ ...draft, reorderLevel: e.target.value })} className={`mt-1 ${small}`} /></label>
          </>
        ) : null}
        <label className="text-xs text-stone-600">Supplier<input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} className={`mt-1 ${small}`} /></label>
        <label className="text-xs text-stone-600">Unit<input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={`mt-1 ${small}`} /></label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {saved ? <span className="text-xs font-semibold text-emerald-700">{saved}</span> : <span className="text-xs text-stone-600">Archiving is used instead of deletion.</span>}
        <Button variant="secondary" onClick={save}>Save changes</Button>
      </div>
    </div>
  );
}
