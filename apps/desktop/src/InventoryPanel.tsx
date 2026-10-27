import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import { errorCode, errorMessage } from './access';

type Product = { id: string; name: string; sku: string; unit: string; unitPricePaise: number; stockMilli: number; revision: number };
type AddProduct = { operationId: string; name: string; sku: string; unit: string; unitPricePaise: number; openingStockMilli: number };
type AdjustStock = { operationId: string; productId: string; expectedRevision: number; deltaMilli: number; reason: string };
type Pending = { command: 'add_local_product'; request: AddProduct } | { command: 'adjust_local_stock'; request: AdjustStock };
const empty = { name: '', sku: '', unit: 'pcs', price: '', quantity: '' };
const quantity = (value: number) => (value / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const money = (value: number) => (value / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

export function InventoryPanel({ disabled, onLocked, onDirtyChange, onBusyChange, refreshToken, onSaved }: {
  refreshToken: number; onSaved: () => void; disabled: boolean; onLocked: () => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(empty);
  const [selection, setSelection] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [ready, setReady] = useState(false);
  const [openedToken, setOpenedToken] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState('Opening items on this PC…');
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const current = useRef(true);
  const dirty = form.name !== '' || form.sku !== '' || form.price !== '' || form.quantity !== '' || delta !== '' || reason !== '' || pending !== null;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    current.current = true;
    let active = true;
    invoke<Product[]>('list_local_products').then(items => {
      if (active) { setProducts(items); setReady(true); setOpenedToken(refreshToken); setFailed(false); setMessage('Items and counts are saved only on this PC.'); }
    }).catch((error: unknown) => {
      if (!active) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setFailed(true); setMessage(errorMessage(error, 'Items could not be opened. Retry loading your items.'));
    });
    return () => { active = false; current.current = false; };
  }, [onLocked, refreshToken]);

  async function reload() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      const items = await invoke<Product[]>('list_local_products');
      if (!current.current) return;
      setProducts(items); setReady(true); setOpenedToken(refreshToken); setFailed(false);
      setMessage('Reopened the latest item counts from this PC.');
    } catch (error: unknown) {
      if (!current.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setFailed(true); setMessage(errorMessage(error, 'Items could not be reopened.'));
    } finally { submitting.current = false; if (current.current) setBusy(false); }
  }

  async function submit(operation: Pending) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setPending(operation); setFailed(false); setMessage('Saving item changes to this PC…');
    try {
      const saved = await invoke<Product>(operation.command, { request: operation.request });
      if (!current.current) return;
      // Show the durable response immediately. A subsequent reload is explicit;
      // a failed read must never turn a committed write into a failed save.
      setProducts(items => [...items.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setPending(null); onSaved();
      if (operation.command === 'add_local_product') setForm(empty);
      else { setDelta(''); setReason(''); }
      setReady(false);
      setMessage('Saved item changes to this PC. Refreshing counts…');
      try {
        const items = await invoke<Product[]>('list_local_products');
        if (!current.current) return;
        setProducts(items); setReady(true); setOpenedToken(refreshToken); setMessage('Saved item changes to this PC.');
      } catch (readError: unknown) {
        if (!current.current) return;
        if (errorCode(readError) === 'locked') { onLocked(); return; }
        setFailed(true); setMessage('Item changes were saved. Latest counts could not be opened; reload item counts before making another change.');
      }
    } catch (error: unknown) {
      if (!current.current) return;
      const code = errorCode(error);
      if (code === 'locked') { onLocked(); return; }
      // Validation/conflict errors definitively refuse the mutation. An unknown
      // transport/database error retains the exact ID and payload for safe retry.
      if (['invalid_product', 'duplicate_sku', 'stock_conflict', 'operation_conflict'].includes(code ?? '')) setPending(null);
      setFailed(true); setMessage(errorMessage(error, 'Save could not be confirmed. Retry this same save before editing.'));
    } finally { submitting.current = false; if (current.current) setBusy(false); }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending) return;
    const price = parseFixedDecimal(form.price, 2), stock = parseFixedDecimal(form.quantity, 3);
    if (price === null || stock === null || !form.name.trim()) {
      setFailed(true); setMessage('Enter a name, a price with up to 2 decimals and stock with up to 3 decimals.'); return;
    }
    void submit({ command: 'add_local_product', request: { operationId: crypto.randomUUID(), name: form.name, sku: form.sku, unit: form.unit, unitPricePaise: price, openingStockMilli: stock } });
  }

  function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending) return;
    const item = products.find(product => product.id === selection), amount = parseFixedDecimal(delta, 3, true);
    if (!item || amount === null || amount === 0 || !reason.trim()) {
      setFailed(true); setMessage('Choose an item, enter a non-zero stock change and explain the count.'); return;
    }
    void submit({ command: 'adjust_local_stock', request: { operationId: crypto.randomUUID(), productId: item.id, expectedRevision: item.revision, deltaMilli: amount, reason } });
  }

  const blocked = disabled || busy || !ready || openedToken !== refreshToken;
  const matching = products.filter(item => `${item.name} ${item.sku}`.toLowerCase().includes(search.toLowerCase()));
  const shown = matching.slice(0, 100);
  return <section className="panel inventory-panel" aria-labelledby="inventory-heading" aria-busy={busy}>
    <div className="panel-heading"><div><p className="eyebrow">LOCAL STOCK REVIEW</p><h2 id="inventory-heading">Items & stock</h2></div><span className="small-chip">{products.length} items</span></div>
    <p className="muted">Add sample items and record counted stock. These records belong to this PC’s review workspace. Use Checkout to record a cash or credit sale.</p>
    <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    {pending ? <div className="pending-stock"><p>This save is waiting for confirmation. Retry uses the same save ID and values.</p><button type="button" disabled={busy || disabled} onClick={() => void submit(pending)}>Retry item save</button></div> : null}
    <div className="inventory-forms">
      <form onSubmit={add} aria-label="Add local item"><fieldset disabled={blocked || pending !== null}>
        <legend>Add an item</legend>
        <label htmlFor="item-name">Item name</label><input id="item-name" maxLength={120} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/>
        <label htmlFor="item-sku">Item code (optional)</label><input id="item-sku" maxLength={80} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}/>
        <label htmlFor="item-unit">Stock unit</label><select id="item-unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}><option value="pcs">Pieces</option><option value="kg">Kilograms</option><option value="litre">Litres</option><option value="metre">Metres</option></select>
        <label htmlFor="item-price">Unit price (₹)</label><input id="item-price" inputMode="decimal" maxLength={24} required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/>
        <label htmlFor="item-stock">Opening stock</label><input id="item-stock" inputMode="decimal" maxLength={24} required value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}/>
        <button type="submit">Save item on this PC</button>
      </fieldset></form>
      <form onSubmit={adjust} aria-label="Adjust local stock"><fieldset disabled={blocked || pending !== null || products.length === 0}>
        <legend>Record a stock change</legend>
        <label htmlFor="stock-item">Item to adjust</label><select id="stock-item" required value={selection} onChange={e => setSelection(e.target.value)}><option value="">Choose an item</option>{products.map(item => <option key={item.id} value={item.id}>{item.name} ({quantity(item.stockMilli)} {item.unit})</option>)}</select>
        <label htmlFor="stock-change">Quantity change</label><input id="stock-change" inputMode="text" maxLength={24} required aria-describedby="stock-change-help" value={delta} onChange={e => setDelta(e.target.value)}/>
        <p id="stock-change-help" className="muted">Use a positive count for a delivery or a negative count for damage or a correction. Up to 3 decimals.</p>
        <label htmlFor="stock-reason">Reason for stock change</label><input id="stock-reason" maxLength={200} required value={reason} onChange={e => setReason(e.target.value)}/>
        <button type="submit">Save stock change</button>
      </fieldset></form>
    </div>
    <div className="inventory-list"><label htmlFor="item-search">Find an item</label><input id="item-search" type="search" value={search} onChange={e => setSearch(e.target.value)}/>
      <button className="quiet-button" type="button" disabled={busy || disabled || pending !== null} onClick={() => void reload()}>Reload item counts</button>
      {matching.length > shown.length ? <p className="muted">Showing the first 100 matches. Refine your search to find a specific item.</p> : null}
      {shown.length ? <ul aria-label="Saved local items">{shown.map(item => <li key={item.id}><div><strong>{item.name}</strong><span>{item.sku || 'No item code'} · {money(item.unitPricePaise)} / {item.unit}</span></div><div><strong>{quantity(item.stockMilli)} {item.unit}</strong><span>Item revision {item.revision}</span></div></li>)}</ul> : <p className="muted">{products.length ? 'No matching items.' : 'Your saved items will appear here.'}</p>}
    </div>
  </section>;
}
