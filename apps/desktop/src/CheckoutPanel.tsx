import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from './native';
import { calculateNativeInvoice, validateNativeInvoiceRequest } from '../../../packages/business-domain/src/native-invoice';
import type { CheckoutRequest, RetailRequest, RetailReceipt } from './retail-types';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import { errorCode, errorMessage } from './access';
import { money, quantity } from './billing-types';
import type { CashierState, Invoice, Product } from './billing-types';
import { CustomerLookup } from './CustomerLookup';
import { SavedInvoice } from './SavedInvoice';

type CartLine = { productId: string; typedQuantity: string };
const emptyBalances = { cashPaise: '0', creditPaise: '0' };
const refusedCodes = new Set(['invalid_payment', 'payment_conflict', 'day_closed', 'invalid_invoice', 'invalid_product', 'stock_conflict', 'customer_missing', 'credit_limit', 'credit_conflict']);

export function CheckoutPanel({ disabled, refreshToken, customerRefreshToken, onLocked, onDirtyChange, onBusyChange, onPosted }: {
  disabled: boolean; refreshToken: number; customerRefreshToken: number; onLocked: () => void;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onPosted: () => void;
}) {
  const searchInput = useRef<HTMLInputElement>(null), confirmButton = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<{ sequence: number; invoice: Invoice }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false), [historicInvoice, setHistoricInvoice] = useState<Invoice | null>(null), [receiptId, setReceiptId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [reportsAllowed, setReportsAllowed] = useState(false);
  const [balances, setBalances] = useState(emptyBalances);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [tax, setTax] = useState('0');
  const [tender, setTender] = useState<'cash' | 'credit' | 'retail'>('cash');
  const [customer, setCustomer] = useState('');
  const [paymentAmounts, setPaymentAmounts] = useState({ cash: '', upi: '', card: '' });
  const [paymentReferences, setPaymentReferences] = useState({ upi: '', card: '' });
  const retailRef = useRef<RetailRequest | null>(null);
  const [pending, setPending] = useState<CheckoutRequest | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [review, setReview] = useState(false);
  const [refused, setRefused] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('Opening checkout…');
  useEffect(() => { if (review) confirmButton.current?.focus(); }, [review]);
  useEffect(() => {
    if (!ready || busy || invoice || pending || historyOpen) return;
    const search = searchInput.current, active = document.activeElement;
    if (!search) return;
    // A delayed read must not redirect typing from another form or an active
    // checkout editor. Initial entry and explicit cashier actions can focus search.
    if (active && active !== document.body && active !== document.documentElement) {
      if (!search.closest('#checkout')?.contains(active)) return;
      if (active !== search && (active.matches('input, textarea, select') || active instanceof HTMLElement && active.isContentEditable)) return;
    }
    search.focus();
  }, [ready, busy, invoice, pending, historyOpen]);
  const submitting = useRef(false);
  const readGeneration = useRef(0);
  const pendingRef = useRef<CheckoutRequest | null>(null);
  const remember = useCallback((request: CheckoutRequest | null) => {
    pendingRef.current = request; setPending(request); if (!request) retailRef.current = null;
  }, []);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange(cart.length > 0 && pending === null); }, [cart.length, pending, onDirtyChange]);

  const apply = useCallback((state: CashierState) => {
    setReportsAllowed(state.reportsAllowed); setProducts(state.products); setBalances(state.balances); setReady(true); setReview(false);
    if (state.checkout) {
      const { request, invoice: saved, retailRequest } = state.checkout;
      retailRef.current = retailRequest ?? null;
      if (retailRequest?.action.kind === 'sale') { const parts = retailRequest.action.payments; setPaymentAmounts({ cash: String(parts.filter(p => p.method === 'cash').reduce((a,p) => a + p.amountPaise, 0) / 100), upi: String(parts.filter(p => p.method === 'upi').reduce((a,p) => a + p.amountPaise, 0) / 100), card: String(parts.filter(p => p.method === 'card').reduce((a,p) => a + p.amountPaise, 0) / 100) }); }
      remember(request); setInvoice(saved); setRefused(false); setReview(false);
      setCart(request.lines.map(line => ({ productId: line.productId, typedQuantity: quantity(line.quantityMilli) })));
      setTax(String(request.taxBasisPoints / 100)); setTender(request.tender); setCustomer(request.customerId ?? '');
      setMessage(saved ? 'Recovered the saved invoice from this PC.' : 'This checkout is waiting for confirmation. Retry the same sale to resolve it.');
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

  async function receipts(after = 0) {
    if (submitting.current || disabled || !reportsAllowed) return;
    submitting.current = true; setBusy(true); onBusyChange(true);
    try {
      const records = await invoke<{ sequence: number; invoice: Invoice }[]>('list_local_invoices', { after });
      if (!mounted.current) return;
      setHistory(records); setHistoryOpen(true); setHistoricInvoice(null); setFailed(false);
    } catch (error) {
      if (!mounted.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setFailed(true); setMessage(errorMessage(error, 'Saved receipts could not be opened.'));
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
  async function openReceipt(id: string) {
    if (submitting.current || disabled || !id.trim()) return;
    submitting.current = true; setBusy(true); onBusyChange(true);
    try {
      const saved = await invoke<Invoice>('read_local_invoice', { invoiceId: id.trim() });
      if (!mounted.current) return;
      setHistoricInvoice(saved); setHistoryOpen(true); setFailed(false);
    } catch (error) {
      if (!mounted.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setHistoricInvoice(null); setFailed(true); setMessage(errorMessage(error, 'Check the saved receipt ID and your access.'));
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
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

  async function confirm(request: CheckoutRequest) {
    if (submitting.current || disabled) return;
    readGeneration.current += 1;
    submitting.current = true; setBusy(true); onBusyChange(true); remember(request); setReview(false); setRefused(false); setFailed(false);
    setMessage('Confirming sale on this PC…');
    try {
      // Persist the exact request before invoking posting. Never create a new ID
      // for a timeout/reply loss, including after a window/app restart.
      let saved: Invoice;
      if (request.tender === 'retail') {
        if (!retailRef.current) retailRef.current = { operationId: request.operationId, action: { kind: 'sale', invoice: request, payments: (['cash', 'upi', 'card'] as const).flatMap(method => { const amount = parseFixedDecimal(paymentAmounts[method] || '0', 2); return amount && amount > 0 ? [{ id: crypto.randomUUID(), method, amountPaise: amount, reference: method === 'cash' ? '' : paymentReferences[method] }] : []; }) } };
        await invoke('prepare_local_retail', { r: retailRef.current });
        const receipt = await invoke<RetailReceipt>('post_local_retail', { r: retailRef.current });
        if (!receipt.data.invoice) throw new Error('The saved invoice could not be read. Retry the same sale.');
        saved = receipt.data.invoice;
      } else {
        await invoke('prepare_local_checkout', { request });
        saved = await invoke<Invoice>('post_local_invoice', { request });
      }
      if (!mounted.current) return;
      setInvoice(saved); setMessage('Sale saved on this PC. Refreshing stock and balances…'); onPosted();
      try {
        const state = await invoke<CashierState>('read_cashier_state');
        if (!mounted.current) return;
        setReportsAllowed(state.reportsAllowed); setProducts(state.products); setBalances(state.balances); setReady(true);
        setMessage('Sale saved on this PC. Stock and balances are up to date.');
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
      await invoke(pending.tender === 'retail' ? 'clear_local_retail' : 'clear_local_checkout', { operationId: pending.operationId, saved });
      if (!mounted.current) return;
      remember(null); setInvoice(null); setReview(false); setRefused(false);
      if (saved) { setPaymentAmounts({ cash: '', upi: '', card: '' }); setPaymentReferences({ upi: '', card: '' }); setCart([]); setTax('0'); setTender('cash'); setCustomer(''); setSearch(''); }
      const state = await invoke<CashierState>('read_cashier_state');
      if (mounted.current) { apply(state); setFailed(false); if (pending.tender === 'retail') onPosted(); }
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
      if (tender === 'retail') { const values = Object.values(paymentAmounts).map(v => parseFixedDecimal(v || '0', 2)); if (values.some(v => v === null || v < 0) || values.reduce<number>((n,v) => n + (v ?? 0), 0) !== preview.totalPaise) problem = 'Split payment amounts must equal the invoice total exactly.'; }
      if (tender === 'credit' && (customer.length < 1 || customer.length > 80 || /[^A-Za-z0-9_-]/.test(customer))) problem = 'Enter a customer reference for credit (letters, numbers, dash or underscore).';
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : '';
      problem = detail === 'Invoice overflow' ? 'This sale total is too large. Check quantities and prices.'
        : detail === 'Invalid native invoice' ? 'Use a tax percentage between 0 and 100.'
        : detail || 'Check the sale quantities and tax.';
    }
  }
  const blocked = disabled || busy || !ready || pending !== null || historyOpen;
  const matching = useMemo(() => products.filter(product => `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  function add(product: Product, scan = false) {
    if (blocked || review) return;
    if (product.stockMilli <= 0) { setFailed(true); setMessage('This item is out of stock.'); return; }
    const existing = cart.findIndex(line => line.productId === product.id);
    if (existing >= 0) {
      if (scan) {
        const current = parseFixedDecimal(cart[existing].typedQuantity, 3);
        if (current === null || current + 1000 > product.stockMilli) { setFailed(true); setMessage('Check quantity against available stock.'); return; }
        setCart(lines => lines.map((line, index) => index === existing ? { ...line, typedQuantity: quantity(current + 1000) } : line));
      } else { document.getElementById(`sale-quantity-${existing}`)?.focus(); }
      setSearch(''); return;
    }
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
    const request: CheckoutRequest = {
      operationId: crypto.randomUUID(), taxBasisPoints, tender, customerId: tender === 'credit' ? customer : null,
      lines: cart.map(line => ({ productId: line.productId, expectedRevision: productMap.get(line.productId)!.revision, quantityMilli: parseFixedDecimal(line.typedQuantity, 3)! })),
    };
    try { validateNativeInvoiceRequest(request.tender === 'retail' ? { ...request, tender: 'cash' } : request); } catch { setFailed(true); setMessage('Check the sale items and customer reference.'); return; }
    void confirm(request);
  }

  return <section onKeyDown={event => {
    if (event.repeat || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || disabled || busy) return;
    if (event.key === 'F2') { event.preventDefault(); searchInput.current?.focus(); searchInput.current?.select(); }
    if (event.key === 'F3' && !blocked && cart.length) { event.preventDefault(); document.getElementById(`sale-quantity-${cart.length - 1}`)?.focus(); }
    if (event.key === 'F4' && !pending && !invoice && !historyOpen) { event.preventDefault(); startConfirmation(); }
    if (event.key === 'F8' && pending && !invoice) { event.preventDefault(); void confirm(pending); }
    if (event.key === 'Escape' && review) { event.preventDefault(); setReview(false); searchInput.current?.focus(); }
  }} className="panel checkout-panel" id="checkout" aria-labelledby="checkout-heading">
    <div className="panel-heading"><div><p className="eyebrow">LOCAL CASHIER</p><h2 id="checkout-heading">Checkout</h2></div>
      <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => void refresh()}>Refresh checkout</button></div>
    <p className="muted">F2: find item · F3: last quantity · Enter: add exact code or single match · F4: review · Enter: confirm · F8: recover pending sale</p>
    {reportsAllowed ? <div className="checkout-balances" aria-label="Local ledger balances" aria-busy={!ready}><p>{`Cash recorded: ${money(balances.cashPaise)}`}</p><p>{`Credit receivable: ${money(balances.creditPaise)}`}</p>{!ready ? <p>Balances need refresh.</p> : null}</div> : null}
    <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    {!invoice && !pending ? <button type="button" disabled={busy || disabled} onClick={() => { setHistoryOpen(true); setHistoricInvoice(null); setHistory([]); }}>Find saved receipt</button> : null}
    {historyOpen && !invoice && !pending ? <section aria-label="Saved receipts">
      <button type="button" disabled={busy || disabled} onClick={() => { setHistoryOpen(false); setHistoricInvoice(null); setReceiptId(''); }}>Back to checkout</button>
      <label htmlFor="receipt-lookup">Receipt ID to reopen</label><input id="receipt-lookup" maxLength={80} value={receiptId} disabled={busy || disabled} onChange={e => setReceiptId(e.target.value)}/>
      <button type="button" disabled={busy || disabled || !receiptId.trim()} onClick={() => void openReceipt(receiptId)}>Open saved receipt</button>
      {reportsAllowed ? <button type="button" disabled={busy || disabled} onClick={() => void receipts()}>Browse saved receipts</button> : <p>Enter the exact ID of a receipt you saved. Other staff receipts require report permission.</p>}
      {historicInvoice ? <SavedInvoice key={historicInvoice.id} invoice={historicInvoice}/> : null}
      {reportsAllowed && history.length ? <><p>Saved receipts, oldest first. Opening or printing does not create a sale.</p><ul>{history.map(record => <li key={record.invoice.id}><button type="button" disabled={busy || disabled} onClick={() => void openReceipt(record.invoice.id)}>{record.invoice.id} · {money(record.invoice.totalPaise)}</button></li>)}</ul>{history.length === 100 ? <button type="button" disabled={busy || disabled} onClick={() => void receipts(history[history.length - 1].sequence)}>Next receipts</button> : null}</> : null}
    </section> : null}
    {invoice ? <><SavedInvoice key={invoice.id} invoice={invoice}/><button type="button" disabled={busy || disabled || !ready} onClick={() => void release(true)}>Start next sale</button></> : <>
      {pending ? <div className="pending-stock"><p>Confirmation ID: <span className="operation-id">{pending.operationId}</span></p><p>The exact request is kept on this PC. Locking or reopening the app preserves it.</p>
        <button type="button" disabled={busy || disabled} onClick={() => void confirm(pending)}>Retry same sale</button>
        {refused ? <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => void release(false)}>Edit refused sale</button> : null}
      </div> : null}
      <fieldset disabled={blocked || review}>
        <label htmlFor="checkout-search">Search items for sale</label><input ref={searchInput} id="checkout-search" onKeyDown={event => {
          if (event.key !== 'Enter' || event.repeat || event.nativeEvent.isComposing || blocked || review) return;
          event.preventDefault();
          if (!search.trim()) { setFailed(true); setMessage('Enter an item name or exact code.'); return; }
          const exact = products.filter(product => product.sku && product.sku.toLowerCase() === search.trim().toLowerCase());
          const choices = exact.length ? exact : matching;
          if (choices.length === 1) add(choices[0], exact.length === 1);
          else { setFailed(true); setMessage('Choose one item. This search or code does not identify one item.'); }
        }} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Item name or code"/>
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
              <input onFocus={event => event.currentTarget.select()} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); searchInput.current?.focus(); } }} id={`sale-quantity-${index}`} inputMode="decimal" maxLength={24} value={line.typedQuantity} onChange={event => setCart(lines => lines.map((entry, i) => i === index ? { ...entry, typedQuantity: event.target.value } : entry))}/>
              <small>Up to 3 decimals · {product ? `${quantity(product.stockMilli)} ${product.unit} available` : 'Reload items'}</small></div>
            <button type="button" className="quiet-button" aria-label={`Remove ${product?.name ?? line.productId} from sale`} onClick={() => setCart(lines => lines.filter(entry => entry.productId !== line.productId))}>Remove</button>
          </div></li>;
        })}</ul>
        <div className="checkout-options"><div><label htmlFor="sale-tax">Tax (%)</label><input id="sale-tax" inputMode="decimal" maxLength={8} value={tax} onChange={event => setTax(event.target.value)}/></div>
          <div><label htmlFor="sale-tender">Transaction type</label><select id="sale-tender" value={tender} onChange={event => setTender(event.target.value as 'cash' | 'credit' | 'retail')}><option value="cash">Cash</option><option value="retail">UPI / card / split</option><option value="credit">Credit</option></select></div>
          {tender === 'credit' ? <div><CustomerLookup disabled={blocked || review} refreshToken={customerRefreshToken + refreshToken} onSelect={setCustomer}/><label htmlFor="sale-customer">Credit customer reference</label><input id="sale-customer" maxLength={80} value={customer} onChange={event => setCustomer(event.target.value)}/><small>Use the customer’s stable reference.</small></div> : null}
        </div>
        {tender === 'retail' ? <fieldset><legend>Record retail payment amounts</legend><p>Cash is recorded as received. UPI and card stay pending and unverified. A reference or screenshot does not verify a transfer.</p>{(['cash', 'upi', 'card'] as const).map(method => <div key={method}><label htmlFor={`split-${method}`}>Split {method === 'upi' ? 'UPI' : method} amount (₹)</label><input id={`split-${method}`} inputMode="decimal" maxLength={24} value={paymentAmounts[method]} onChange={e => setPaymentAmounts({ ...paymentAmounts, [method]: e.target.value })}/>{method !== 'cash' ? <><label htmlFor={`split-ref-${method}`}>{method === 'upi' ? 'UPI' : 'Card terminal'} reference (optional, unverified)</label><input id={`split-ref-${method}`} maxLength={80} value={paymentReferences[method]} onChange={e => setPaymentReferences({ ...paymentReferences, [method]: e.target.value })}/></> : null}</div>)}</fieldset> : null}
      </fieldset>
      {!pending && cart.length ? <><p className="muted">{problem || 'Preview only. The native store checks prices, stock and totals before saving.'}</p>
        {preview ? <p className="checkout-total">Subtotal: {money(preview.subtotalPaise)} · Tax: {money(preview.taxPaise)}<br/><output aria-live="polite">Total: {money(preview.totalPaise)}</output></p> : null}
        {review ? <div role="group" aria-label="Confirm sale"><p>{tender === 'cash' ? 'Receive cash for this sale.' : tender === 'credit' ? `Record credit for ${customer}.` : 'Record this payment split. Digital amounts remain pending and unverified.'} Save this sale on this PC?</p><button type="button" disabled={disabled || busy} ref={confirmButton} onClick={postNew}>Confirm sale</button><button type="button" className="quiet-button" disabled={disabled || busy} onClick={() => setReview(false)}>Edit sale</button></div>
          : <button type="button" disabled={blocked || !preview || Boolean(problem)} onClick={startConfirmation}>Review sale</button>}
      </> : null}
    </>}
  </section>;
}
