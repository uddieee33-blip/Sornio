import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { calculateNativeInvoice, validateNativeInvoiceRequest } from '../../../packages/business-domain/src/native-invoice';
import type { NativeInvoiceRequest } from '../../../packages/business-domain/src/native-invoice';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import { errorCode, errorMessage } from './access';
import { money, quantity } from './billing-types';
import type { CashierState, Invoice, Product } from './billing-types';
import { SavedInvoice } from './SavedInvoice';

type CartLine = { productId: string; typedQuantity: string };
const emptyBalances = { cashPaise: '0', creditPaise: '0' };
const refusedCodes = new Set(['invalid_invoice', 'invalid_product', 'stock_conflict']);

export function CheckoutPanel({ disabled, refreshToken, onLocked, onDirtyChange, onBusyChange, onPosted }: {
  disabled: boolean; refreshToken: number; onLocked: () => void;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onPosted: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState(emptyBalances);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [tax, setTax] = useState('0');
  const [tender, setTender] = useState<'cash' | 'credit'>('cash');
  const [lan, setLan] = useState<CashierState['lan']>(undefined);
  const [customer, setCustomer] = useState('');
  const [pending, setPending] = useState<NativeInvoiceRequest | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [review, setReview] = useState(false);
  const [refused, setRefused] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('Opening checkout…');
  const submitting = useRef(false);
  const readGeneration = useRef(0);
  const pendingRef = useRef<NativeInvoiceRequest | null>(null);
  const remember = useCallback((request: NativeInvoiceRequest | null) => {
    pendingRef.current = request; setPending(request);
  }, []);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange(cart.length > 0 && pending === null); }, [cart.length, pending, onDirtyChange]);

  const apply = useCallback((state: CashierState) => {
    setLan(state.lan); setProducts(state.products); setBalances(state.balances); setReady(true); setReview(false);
    if (state.checkout) {
      const { request, invoice: saved } = state.checkout;
      remember(request); setInvoice(saved); setRefused(false); setReview(false);
      setCart(request.lines.map(line => ({ productId: line.productId, typedQuantity: quantity(line.quantityMilli) })));
      setTax(String(request.taxBasisPoints / 100)); setTender(request.tender); setCustomer(request.customerId ?? '');
      setMessage(saved ? state.lan ? 'Recovered the hub-confirmed receipt kept on this PC.' : 'Recovered the saved invoice from this PC.' : 'This checkout is waiting for confirmation. Retry the same sale to resolve it.');
    } else {
      // Another window may have completed/canceled this checkpoint. Never turn
      // its old uncertain cart into a fresh sale with a new operation ID.
      if (pendingRef.current) { setCart([]); setTax('0'); setTender('cash'); setCustomer(''); }
      remember(null); setInvoice(null);
      setMessage('Checkout is ready. Totals are previews until the sale is saved.');
    }
  }, [remember]);

  useEffect(() => {
    let current = true;
    const generation = ++readGeneration.current;
    invoke<CashierState>('read_cashier_state').then(state => { if (current && generation === readGeneration.current) { apply(state); setFailed(false); } }).catch((error: unknown) => {
      if (!current || generation !== readGeneration.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setReady(false); setFailed(true); setMessage(errorMessage(error, 'Checkout could not be opened. Refresh checkout to retry.'));
    });
    return () => { current = false; };
  }, [refreshToken, onLocked, apply]);

  async function refresh() {
    if (submitting.current) return;
    // A delayed background read must not replace newer explicit recovery state.
    readGeneration.current += 1;
    submitting.current = true; setBusy(true); onBusyChange(true);
    try {
      const state = await invoke<CashierState>('read_cashier_state');
      if (!mounted.current) return;
      apply(state); setFailed(false); setRefused(false);
      if (state.checkout?.invoice) onPosted();
    } catch (error: unknown) {
      if (!mounted.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setReady(false); setFailed(true); setMessage(errorMessage(error, 'Checkout could not be refreshed.'));
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }

  async function confirm(request: NativeInvoiceRequest) {
    if (submitting.current || disabled) return;
    readGeneration.current += 1;
    submitting.current = true; setBusy(true); onBusyChange(true); remember(request); setReview(false); setRefused(false); setFailed(false);
    setMessage(lan ? 'Requesting confirmation from the shop hub…' : 'Confirming sale on this PC…');
    try {
      // Persist the exact request before invoking posting. Never create a new ID
      // for a timeout/reply loss, including after a window/app restart.
      await invoke('prepare_local_checkout', { request });
      const saved = await invoke<Invoice>('post_local_invoice', { request });
      if (!mounted.current) return;
      setInvoice(saved); setMessage(lan ? 'Sale confirmed by the shop hub. Refreshing stock and balances…' : 'Sale saved on this PC. Refreshing stock and balances…'); onPosted();
      try {
        const state = await invoke<CashierState>('read_cashier_state');
        if (!mounted.current) return;
        setLan(state.lan); setProducts(state.products); setBalances(state.balances); setReady(true);
        setMessage(state.lan && !state.lan.online ? 'The hub confirmed this invoice. The connection is now unavailable; displayed stock is cached.' : state.lan ? 'Sale confirmed by the shop hub. Stock and balances are up to date.' : 'Sale saved on this PC. Stock and balances are up to date.');
      } catch (error: unknown) {
        if (!mounted.current) return;
        if (errorCode(error) === 'locked') { onLocked(); return; }
        setReady(false); setFailed(true);
        setMessage('Sale was saved. Stock or balances could not be refreshed. Refresh checkout before the next sale.');
      }
    } catch (error: unknown) {
      if (!mounted.current) return;
      const code = errorCode(error);
      if (code === 'locked') { onLocked(); return; }
      setRefused(refusedCodes.has(code ?? '')); setFailed(true);
      setMessage(errorMessage(error, 'The sale result is uncertain. Retry the same sale; do not enter it again.'));
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }

  async function release(saved: boolean) {
    if (!pending || submitting.current || disabled || (saved && !ready)) return;
    readGeneration.current += 1;
    submitting.current = true; setBusy(true); onBusyChange(true);
    try {
      // Native code compares this expected result under its writer lock. A late
      // confirmation cannot race cancellation and post an abandoned request.
      await invoke('clear_local_checkout', { operationId: pending.operationId, saved });
      if (!mounted.current) return;
      remember(null); setInvoice(null); setReview(false); setRefused(false);
      if (saved) { setCart([]); setTax('0'); setTender('cash'); setCustomer(''); setSearch(''); }
      const state = await invoke<CashierState>('read_cashier_state');
      if (mounted.current) { apply(state); setFailed(false); }
    } catch (error: unknown) {
      if (!mounted.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setReady(false); setFailed(true); setMessage(errorMessage(error, 'Reload checkout before continuing.'));
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }

  const productMap = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const taxBasisPoints = parseFixedDecimal(tax, 2);
  let preview: ReturnType<typeof calculateNativeInvoice> | null = null;
  let problem = '';
  if (cart.length) {
    try {
      const lines = cart.map(line => {
        const product = productMap.get(line.productId), amount = parseFixedDecimal(line.typedQuantity, 3);
        if (!product || amount === null || amount <= 0 || amount > product.stockMilli) throw new Error('Check quantities against available stock. Use up to 3 decimals in the displayed unit.');
        return { quantityMilli: amount, unitPricePaise: product.unitPricePaise };
      });
      if (taxBasisPoints === null) throw new Error('Enter a tax percentage with up to 2 decimals.');
      preview = calculateNativeInvoice(lines, taxBasisPoints);
      if (tender === 'credit' && (customer.length < 1 || customer.length > 80 || /[^A-Za-z0-9_-]/.test(customer))) problem = 'Enter a customer reference for credit (letters, numbers, dash or underscore).';
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : '';
      problem = detail === 'Invoice overflow' ? 'This sale total is too large. Check quantities and prices.'
        : detail === 'Invalid native invoice' ? 'Use a tax percentage between 0 and 100.'
        : detail || 'Check the sale quantities and tax.';
    }
  }
  const blocked = disabled || busy || !ready || pending !== null;
  const matching = useMemo(() => products.filter(product => `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  function add(product: Product) {
    if (blocked || review) return;
    if (cart.some(line => line.productId === product.id)) { setSearch(''); return; }
    if (cart.length >= 100) { setFailed(true); setMessage('A sale supports up to 100 items.'); return; }
    setCart(lines => [...lines, { productId: product.id, typedQuantity: quantity(Math.min(1000, product.stockMilli)) }]);
    setSearch('');
  }
  function startConfirmation() {
    if (!preview || problem || taxBasisPoints === null || blocked) return;
    setReview(true); setFailed(false); setMessage('Review the items and transaction type, then confirm this sale.');
  }
  function postNew() {
    if (blocked || !preview || problem || taxBasisPoints === null) return;
    const request: NativeInvoiceRequest = {
      operationId: crypto.randomUUID(), taxBasisPoints, tender, customerId: tender === 'credit' ? customer : null,
      lines: cart.map(line => ({ productId: line.productId, expectedRevision: productMap.get(line.productId)!.revision, quantityMilli: parseFixedDecimal(line.typedQuantity, 3)! })),
    };
    try { validateNativeInvoiceRequest(request); } catch { setFailed(true); setMessage('Check the sale items and customer reference.'); return; }
    void confirm(request);
  }

  return <section className="panel checkout-panel" id="checkout" aria-labelledby="checkout-heading">
    <div className="panel-heading"><div><p className="eyebrow">LOCAL CASHIER</p><h2 id="checkout-heading">Checkout</h2></div>
      <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => void refresh()}>Refresh checkout</button></div>
    {lan ? <p role="status">{lan.online ? 'Shop hub connected. Only a hub-confirmed receipt completes this sale. Balances below are this computer’s confirmed receipts.' : 'Shop hub unavailable. Cached stock is not reserved. Prepared requests stay on this PC; unsaved carts stay only in this window. Retry the same pending sale after reconnecting. No shared sale can be confirmed offline.'}</p> : null}
    <div className="checkout-balances" aria-label="Local ledger balances" aria-busy={!ready}><p>{`Cash recorded: ${money(balances.cashPaise)}`}</p><p>{`Credit receivable: ${money(balances.creditPaise)}`}</p>{!ready ? <p>Balances need refresh.</p> : null}</div>
    <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    {invoice ? <><SavedInvoice invoice={invoice} hubConfirmed={Boolean(lan)}/><button type="button" disabled={busy || disabled || !ready} onClick={() => void release(true)}>Start next sale</button></> : <>
      {pending ? <div className="pending-stock"><p>Confirmation ID: <span className="operation-id">{pending.operationId}</span></p><p>The exact request is kept on this PC. Locking or reopening the app preserves it.</p>
        <button type="button" disabled={busy || disabled} onClick={() => void confirm(pending)}>Retry same sale</button>
        {refused ? <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => void release(false)}>Edit refused sale</button> : null}
      </div> : null}
      <fieldset disabled={blocked || review}>
        <label htmlFor="checkout-search">Search items for sale</label><input id="checkout-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Item name or code"/>
        <ul className="checkout-results" aria-label="Items available for sale">{matching.slice(0, 50).map(product => <li key={product.id}>
          <div><strong>{product.name}</strong><span>{product.sku} · {quantity(product.stockMilli)} {product.unit} available · {money(product.unitPricePaise)} / {product.unit}</span></div>
          <button type="button" disabled={product.stockMilli === 0} aria-label={`Add ${product.name} to sale`} onClick={() => add(product)}>{cart.some(line => line.productId === product.id) ? 'In sale' : 'Add'}</button>
        </li>)}</ul>
        {matching.length > 50 ? <p className="muted">Showing the first 50 matches. Refine the search.</p> : null}
        {matching.length === 0 ? <p className="muted">No matching sale items.</p> : null}
        <ul className="checkout-cart" aria-label="Current sale items">{cart.map((line, index) => {
          const product = productMap.get(line.productId);
          return <li key={line.productId}><strong>{product?.name ?? line.productId}</strong><div className="checkout-quantity">
            <div><label htmlFor={`sale-quantity-${index}`}>Quantity for {product?.name ?? line.productId} ({product?.unit ?? 'units'})</label>
              <input id={`sale-quantity-${index}`} inputMode="decimal" maxLength={24} value={line.typedQuantity} onChange={event => setCart(lines => lines.map((entry, i) => i === index ? { ...entry, typedQuantity: event.target.value } : entry))}/>
              <small>Up to 3 decimals · {product ? `${quantity(product.stockMilli)} ${product.unit} available` : 'Reload items'}</small></div>
            <button type="button" className="quiet-button" aria-label={`Remove ${product?.name ?? line.productId} from sale`} onClick={() => setCart(lines => lines.filter(entry => entry.productId !== line.productId))}>Remove</button>
          </div></li>;
        })}</ul>
        <div className="checkout-options"><div><label htmlFor="sale-tax">Tax (%)</label><input id="sale-tax" inputMode="decimal" maxLength={8} value={tax} onChange={event => setTax(event.target.value)}/></div>
          <div><label htmlFor="sale-tender">Transaction type</label><select id="sale-tender" value={tender} onChange={event => setTender(event.target.value as 'cash' | 'credit')}><option value="cash">Cash</option><option value="credit">Credit</option></select></div>
          {tender === 'credit' ? <div><label htmlFor="sale-customer">Credit customer reference</label><input id="sale-customer" maxLength={80} value={customer} onChange={event => setCustomer(event.target.value)}/><small>Use the customer’s stable reference.</small></div> : null}
        </div>
      </fieldset>
      {!pending && cart.length ? <><p className="muted">{problem || 'Preview only. The native store checks prices, stock and totals before saving.'}</p>
        {preview ? <p className="checkout-total">Subtotal: {money(preview.subtotalPaise)} · Tax: {money(preview.taxPaise)}<br/><output aria-live="polite">Total: {money(preview.totalPaise)}</output></p> : null}
        {review ? <div role="group" aria-label="Confirm sale"><p>{tender === 'cash' ? 'Receive cash for this sale.' : `Record credit for ${customer}.`} {lan ? 'Ask the shop hub to confirm this sale?' : 'Save this sale on this PC?'}</p><button type="button" disabled={disabled || busy} onClick={postNew}>Confirm sale</button><button type="button" className="quiet-button" disabled={disabled || busy} onClick={() => setReview(false)}>Edit sale</button></div>
          : <button type="button" disabled={blocked || !preview || Boolean(problem)} onClick={startConfirmation}>Review sale</button>}
      </> : null}
    </>}
  </section>;
}
