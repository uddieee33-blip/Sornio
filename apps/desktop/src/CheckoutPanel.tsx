import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from './native';
import { calculateNativeInvoice, validateNativeInvoiceRequest } from '../../../packages/business-domain/src/native-invoice';
import { indianDay } from './retail-types';
import type { CheckoutRequest, RetailRequest, RetailReceipt, RetailView } from './retail-types';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import { errorCode, errorMessage } from './access';
import { formatPaiseInput, money, quantity } from './billing-types';
import type { CashierState, Invoice, Product } from './billing-types';
import { CustomerLookup } from './CustomerLookup';
import type { ResolvedCreditCustomer } from './CustomerLookup';
import { allocationPreview, paymentMethods, remainingForMethod } from './payment-allocation';
import { SavedInvoice } from './SavedInvoice';
import type { ReceiptPayment } from './SavedInvoice';
import { findCode, scanNeedsQuantity } from './scan';
import { heldDraftInput } from './held-bills';
import type { HeldBill, HeldMutation, HeldPrepare, ResumedBill } from './held-bills';

type CartLine = { productId: string; typedQuantity: string };
type FocusTarget =
  | { kind: 'search'; select: boolean }
  | { kind: 'quantity'; index: number }
  | { kind: 'receipt-lookup' };

const emptyBalances = { cashPaise: '0', creditPaise: '0' };
const refusedCodes = new Set(['invalid_payment', 'payment_conflict', 'day_closed', 'invalid_invoice', 'invalid_product', 'stock_conflict', 'customer_missing', 'credit_limit', 'credit_conflict']);
const readyMessage = 'Checkout is ready. Totals are previews until the sale is saved.';

function formatBasisPointsInput(bps: number): string {
  const whole = Math.trunc(bps / 100), remainder = bps % 100;
  if (remainder === 0) return String(whole);
  return `${whole}.${String(remainder).padStart(2, '0').replace(/0$/, '')}`;
}

export function CheckoutPanel({ username, disabled, refreshToken, customerRefreshToken, onLocked, onDirtyChange, onBusyChange, onPosted }: {
  username: string; disabled: boolean; refreshToken: number; customerRefreshToken: number; onLocked: () => void;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onPosted: () => void;
}) {
  const searchInput = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const receiptLookupInput = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [heldActive, setHeldActive] = useState<HeldBill | null>(null);
  const heldActiveRef = useRef<HeldBill | null>(null);
  const heldPrepareRef = useRef<HeldPrepare | null>(null);
  const [heldPending, setHeldPending] = useState<HeldMutation | null>(null);
  const [heldNote, setHeldNote] = useState('');
  const [heldWarnings, setHeldWarnings] = useState<string[]>([]);
  const [heldCreditRefresh, setHeldCreditRefresh] = useState(0);
  const [history, setHistory] = useState<{ sequence: number; invoice: Invoice }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historicInvoice, setHistoricInvoice] = useState<Invoice | null>(null);
  const [historicPayments, setHistoricPayments] = useState<ReceiptPayment[]>([]);
  const [receiptId, setReceiptId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [reportsAllowed, setReportsAllowed] = useState(false);
  const [balances, setBalances] = useState(emptyBalances);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [tax, setTax] = useState('0');
  const [tender, setTender] = useState<'cash' | 'credit' | 'retail'>('cash');
  const [customer, setCustomer] = useState('');
  const [creditCustomerSnapshot, setCreditCustomer] = useState<ResolvedCreditCustomer | null>(null);
  const creditRefreshKey = `${customerRefreshToken}:${refreshToken}:${heldCreditRefresh}`;
  const creditCustomer = creditCustomerSnapshot?.refreshToken === creditRefreshKey && creditCustomerSnapshot.customer.id === customer
    ? creditCustomerSnapshot.customer : null;
  const [paymentAmounts, setPaymentAmounts] = useState({ cash: '', upi: '', card: '', credit: '' });
  const [paymentReferences, setPaymentReferences] = useState({ upi: '', card: '' });
  const retailRef = useRef<RetailRequest | null>(null);
  const [pending, setPending] = useState<CheckoutRequest | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoicePayments, setInvoicePayments] = useState<ReceiptPayment[]>([]);
  const [review, setReview] = useState(false);
  const [refused, setRefused] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('Opening checkout…');

  useEffect(() => { if (review) confirmButton.current?.focus(); }, [review]);
  useEffect(() => {
    if (pending && !invoice && !busy) {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) retryButton.current?.focus();
    }
  }, [pending, invoice, busy]);
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || busy) return;
    if (target.kind === 'search' && !review && !historyOpen && !pending && !invoice && searchInput.current && !searchInput.current.disabled) {
      pendingFocus.current = null;
      searchInput.current.focus();
      if (target.select) searchInput.current.select();
    } else if (target.kind === 'quantity' && !review && !historyOpen && !pending && !invoice) {
      const input = document.getElementById(`sale-quantity-${target.index}`) as HTMLInputElement | null;
      if (input && !input.disabled) {
        pendingFocus.current = null;
        input.focus();
        input.select();
      }
    } else if (target.kind === 'receipt-lookup' && historyOpen && receiptLookupInput.current && !receiptLookupInput.current.disabled) {
      pendingFocus.current = null;
      receiptLookupInput.current.focus();
    }
  });
  useEffect(() => {
    if (!ready || busy || invoice || pending || historyOpen) return;
    const searchEl = searchInput.current, active = document.activeElement;
    if (!searchEl) return;
    // A delayed read must not redirect typing from another form or an active
    // checkout editor. Initial entry and explicit cashier actions can focus search.
    if (active && active !== document.body && active !== document.documentElement) {
      if (!searchEl.closest('#checkout')?.contains(active)) return;
      if (active !== searchEl && (active.matches('input, textarea, select') || active instanceof HTMLElement && active.isContentEditable)) return;
    }
    searchEl.focus();
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

  const clearHeldContext = useCallback(() => {
    heldActiveRef.current = null; heldPrepareRef.current = null;
    setHeldActive(null); setHeldNote(''); setHeldWarnings([]);
  }, []);
  const emptyBill = useCallback(() => {
    setCart([]); setTax('0'); setTender('cash'); setCustomer(''); setSearch('');
    setPaymentAmounts({ cash: '', upi: '', card: '', credit: '' }); setPaymentReferences({ upi: '', card: '' });
    setCreditCustomer(null); clearHeldContext();
  }, [clearHeldContext]);
  const restoreHeld = useCallback((resumed: ResumedBill) => {
    const input = resumed.bill.draft.input;
    heldActiveRef.current = resumed.bill; heldPrepareRef.current = null; setHeldActive(resumed.bill);
    setHeldNote(input.note); setHeldWarnings(resumed.warnings); setHeldCreditRefresh(value => value + 1);
    setCart(input.lines.map(l => ({ productId: l.productId, typedQuantity: quantity(l.quantityMilli) })));
    setTax(formatBasisPointsInput(input.taxBasisPoints)); setTender(input.tender); setCustomer(input.customerId ?? '');
    setPaymentAmounts(Object.fromEntries(paymentMethods.map(method => [method, formatPaiseInput(input.payments.filter(p => p.method === method).reduce((sum,p) => sum + p.amountPaise, 0))])) as typeof paymentAmounts);
    setPaymentReferences({ upi: input.payments.find(p => p.method === 'upi')?.reference ?? '', card: input.payments.find(p => p.method === 'card')?.reference ?? '' });
    setSearch(''); setReview(false); setHistoryOpen(false); setHeldOpen(false);
    pendingFocus.current = { kind: 'search', select: false };
  }, []);

  const apply = useCallback((state: CashierState) => {
    setReportsAllowed(state.reportsAllowed); setProducts(state.products); setBalances(state.balances); setReady(true); setReview(false);
    if (state.checkout) {
      clearHeldContext();
      const { request, invoice: saved, retailRequest } = state.checkout;
      retailRef.current = retailRequest ?? null;
      if (retailRequest?.action.kind === 'sale') {
        const parts = retailRequest.action.payments;
        setPaymentAmounts({
          cash: formatPaiseInput(parts.filter(p => p.method === 'cash').reduce((a, p) => a + p.amountPaise, 0)),
          upi: formatPaiseInput(parts.filter(p => p.method === 'upi').reduce((a, p) => a + p.amountPaise, 0)),
          card: formatPaiseInput(parts.filter(p => p.method === 'card').reduce((a, p) => a + p.amountPaise, 0)),
          credit: formatPaiseInput(parts.filter(p => p.method === 'credit').reduce((a, p) => a + p.amountPaise, 0)),
        });
        setPaymentReferences({ upi: parts.find(p => p.method === 'upi')?.reference ?? '', card: parts.find(p => p.method === 'card')?.reference ?? '' });
        setInvoicePayments(saved ? parts : []);
      } else {
        setInvoicePayments([]);
      }
      remember(request); setInvoice(saved); setRefused(false); setReview(false);
      setCart(request.lines.map(line => ({ productId: line.productId, typedQuantity: quantity(line.quantityMilli) })));
      setTax(formatBasisPointsInput(request.taxBasisPoints)); setTender(request.tender); setCustomer(request.customerId ?? '');
      setMessage(saved ? 'Recovered the saved invoice from this PC.' : 'This checkout is waiting for confirmation. Retry the same sale to resolve it.');
    } else if (state.activeHeldBill) {
      remember(null); setInvoice(null); setInvoicePayments([]); setRefused(false);
      const active = heldActiveRef.current;
      if (!active || active.id !== state.activeHeldBill.bill.id || active.revision !== state.activeHeldBill.bill.revision) restoreHeld(state.activeHeldBill);
      else setHeldWarnings(state.activeHeldBill.warnings);
      setMessage('Held bill resumed. Review current prices, stock and payment amounts before confirming.');
    } else {
      if (heldActiveRef.current) emptyBill();
      // Another window may have completed/canceled this checkpoint. Never turn
      // its old uncertain cart into a fresh sale with a new operation ID.
      if (pendingRef.current) { setCart([]); setTax('0'); setTender('cash'); setCustomer(''); setPaymentAmounts({ cash: '', upi: '', card: '', credit: '' }); setPaymentReferences({ upi: '', card: '' }); }
      remember(null); setInvoice(null); setInvoicePayments([]);
      setMessage(readyMessage);
    }
  }, [remember, restoreHeld, emptyBill, clearHeldContext]);

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

  async function listHeld() {
    if (submitting.current || disabled || pending || heldPending) return;
    submitting.current = true; setBusy(true); onBusyChange(true);
    try {
      const rows = await invoke<HeldBill[]>('list_local_held_bills');
      if (!mounted.current) return;
      setHeldBills(rows); setHeldOpen(true); setFailed(false);
    } catch (error) {
      if (!mounted.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setFailed(true); setMessage(errorMessage(error, 'Held bills could not be loaded. Try again.'));
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
  async function changeHeld(request: HeldMutation) {
    if (submitting.current || disabled || pending) return;
    readGeneration.current += 1;
    submitting.current = true; setBusy(true); onBusyChange(true); setHeldPending(request);
    setFailed(false); setMessage('Saving held bill on this PC…');
    try {
      const result = await invoke<ResumedBill>('mutate_local_held_bill', { r: request });
      if (!mounted.current) return;
      setHeldPending(null);
      if (request.action.kind === 'save' || heldActiveRef.current?.id === result.bill.id && request.action.kind === 'discard') emptyBill();
      setHeldBills(rows => request.action.kind === 'discard' ? rows.filter(b => b.id !== result.bill.id)
        : [result.bill, ...rows.filter(b => b.id !== result.bill.id)]);
      if (request.action.kind === 'resume') {
        // Preserve the saved draft if refreshing current stock fails, but block checkout.
        restoreHeld(result); setReady(false);
        const state = await invoke<CashierState>('read_cashier_state');
        if (mounted.current) apply(state);
      } else {
        setReview(false);
        setMessage(request.action.kind === 'save' ? 'Bill held on this PC. You can serve the next customer.' : 'Held bill discarded. No sale or payment was recorded.');
        pendingFocus.current = { kind: 'search', select: false };
      }
    } catch (error) {
      if (!mounted.current) return;
      const code = errorCode(error);
      if (code === 'locked') { onLocked(); return; }
      // A typed rejection is definite. Unknown/transport errors keep the exact
      // mutation for retry; never create a second draft ID after a lost reply.
      if (['held_bill_conflict','invalid_held_bill','held_bill_limit','forbidden','checkout_active','customer_missing','invalid_product','invalid_invoice'].includes(code ?? '')) {
        setHeldPending(null); setReady(false);
      }
      setFailed(true); setMessage(errorMessage(error, 'The held-bill result is uncertain. Retry this same action, or refresh checkout if the save was confirmed.'));
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
  function holdBill() {
    if (blocked || review || !cart.length) return;
    try {
      const draft = heldDraftInput(cart, tax, tender, customer, paymentAmounts, paymentReferences, heldNote);
      const active = heldActiveRef.current;
      void changeHeld({ id: active?.id ?? crypto.randomUUID(), expectedRevision: active?.revision ?? 0, action: { kind: 'save', draft } });
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Check this bill before holding it.'); }
  }

  async function receipts(after = 0) {
    if (submitting.current || disabled || !reportsAllowed) return;
    submitting.current = true; setBusy(true); onBusyChange(true);
    try {
      const records = await invoke<{ sequence: number; invoice: Invoice }[]>('list_local_invoices', { after });
      if (!mounted.current) return;
      setHistory(records); setHistoryOpen(true); setHistoricInvoice(null); setHistoricPayments([]); setFailed(false);
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
      let parts: ReceiptPayment[] = [];
      if (saved.tender === 'retail') {
        const retail = await invoke<RetailView>('read_local_retail', { day: indianDay(), username, invoiceId: saved.id });
        parts = retail.payments;
      }
      if (!mounted.current) return;
      setHistoricInvoice(saved); setHistoricPayments(parts); setHistoryOpen(true); setFailed(false);
    } catch (error) {
      if (!mounted.current) return;
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setHistoricInvoice(null); setHistoricPayments([]); setFailed(true); setMessage(errorMessage(error, 'Check the saved receipt ID and your access.'));
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
    let heldPreparing = false;
    try {
      // Persist the exact request before invoking posting. Never create a new ID
      // for a timeout/reply loss, including after a window/app restart.
      let saved: Invoice;
      let savedPayments: ReceiptPayment[] = [];
      if (request.tender === 'retail') {
        if (!retailRef.current) {
          retailRef.current = {
            operationId: request.operationId,
            action: {
              kind: 'sale',
              invoice: request,
              payments: (['cash', 'upi', 'card', 'credit'] as const).flatMap(method => {
                const amount = parseFixedDecimal(paymentAmounts[method] || '0', 2);
                return amount && amount > 0
                  ? [{ id: crypto.randomUUID(), method, amountPaise: amount, reference: method === 'cash' || method === 'credit' ? '' : paymentReferences[method].trim() }]
                  : [];
              }),
            },
          };
        }
        if (heldActiveRef.current && !heldPrepareRef.current) {
          heldPrepareRef.current = { id: heldActiveRef.current.id, expectedRevision: heldActiveRef.current.revision, invoice: request,
            payments: retailRef.current.action.kind === 'sale' ? retailRef.current.action.payments : null };
        }
        if (heldPrepareRef.current) { heldPreparing = true; await invoke('prepare_local_held_checkout', { r: heldPrepareRef.current }); heldPreparing = false; }
        else await invoke('prepare_local_retail', { r: retailRef.current });
        const receipt = await invoke<RetailReceipt>('post_local_retail', { r: retailRef.current });
        if (!receipt.data.invoice) throw new Error('The saved invoice could not be read. Retry the same sale.');
        saved = receipt.data.invoice;
        savedPayments = receipt.data.payments ?? (retailRef.current.action.kind === 'sale' ? retailRef.current.action.payments : []);
      } else {
        if (heldActiveRef.current && !heldPrepareRef.current) {
          heldPrepareRef.current = { id: heldActiveRef.current.id, expectedRevision: heldActiveRef.current.revision, invoice: request, payments: null };
        }
        if (heldPrepareRef.current) { heldPreparing = true; await invoke('prepare_local_held_checkout', { r: heldPrepareRef.current }); heldPreparing = false; }
        else await invoke('prepare_local_checkout', { request });
        saved = await invoke<Invoice>('post_local_invoice', { request });
      }
      if (!mounted.current) return;
      setInvoice(saved); setInvoicePayments(savedPayments); setMessage('Sale saved on this PC. Refreshing stock and balances…'); onPosted();
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
      if (heldPreparing && (refusedCodes.has(code ?? '') || ['held_bill_conflict','invalid_held_bill','forbidden','checkout_active'].includes(code ?? ''))) {
        // Preparation was refused before any post. Read native state instead of
        // attempting to cancel a checkpoint that may never have been created.
        try { const state = await invoke<CashierState>('read_cashier_state'); if (mounted.current) apply(state); }
        catch { setReady(false); }
      }
      setRefused(!heldPreparing && refusedCodes.has(code ?? '')); setFailed(true);
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
      remember(null); setInvoice(null); setInvoicePayments([]); setReview(false); setRefused(false);
      pendingFocus.current = { kind: 'search', select: false };
      if (saved) { clearHeldContext(); setPaymentAmounts({ cash: '', upi: '', card: '', credit: '' }); setPaymentReferences({ upi: '', card: '' }); setCart([]); setTax('0'); setTender('cash'); setCustomer(''); setSearch(''); }
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
  const { preview, problem, problemFieldId } = useMemo(() => {
    if (!cart.length) return { preview: null as ReturnType<typeof calculateNativeInvoice> | null, problem: '', problemFieldId: '' };
    let fieldId = '';
    try {
      const lines: { quantityMilli: number; unitPricePaise: number }[] = [];
      for (let index = 0; index < cart.length; index++) {
        const line = cart[index];
        const product = productMap.get(line.productId), amount = parseFixedDecimal(line.typedQuantity, 3);
        if (!product || amount === null || amount <= 0 || amount > product.stockMilli) {
          fieldId = `sale-quantity-${index}`;
          throw new Error('Check quantities against available stock. Use up to 3 decimals in the displayed unit.');
        }
        lines.push({ quantityMilli: amount, unitPricePaise: product.unitPricePaise });
      }
      if (taxBasisPoints === null) {
        fieldId = 'sale-tax';
        throw new Error('Enter a tax percentage with up to 2 decimals.');
      }
      const computed = calculateNativeInvoice(lines, taxBasisPoints);
      let nextProblem = '';
      const allocation = allocationPreview(computed.totalPaise, paymentAmounts);
      if (tender === 'retail' && (allocation.invalidMethod || allocation.remainingPaise !== 0)) {
        nextProblem = allocation.invalidMethod ? 'Enter payment amounts with up to 2 decimals.'
          : allocation.remainingPaise > 0 ? `Still to allocate: ${money(allocation.remainingPaise)}`
          : `Allocated too much: ${money(-allocation.remainingPaise)}. Reduce a payment amount.`;
        fieldId = `split-${allocation.invalidMethod ?? 'cash'}`;
      }
      const credit = tender === 'credit' ? computed.totalPaise : tender === 'retail' ? allocation.creditPaise : 0;
      if (!nextProblem && credit > 0) {
        if (!customer || creditCustomer?.id !== customer) {
          nextProblem = 'Select an existing credit customer and wait for their credit details.';
          fieldId = 'sale-customer';
        } else if (creditCustomer.creditLimitPaise !== null
          && (creditCustomer.availableCreditPaise === null || BigInt(credit) > BigInt(creditCustomer.availableCreditPaise))) {
          nextProblem = 'This amount exceeds the customer’s available credit. Reduce credit or choose another payment method.';
          fieldId = tender === 'retail' ? 'split-credit' : 'sale-customer';
        }
      }
      return { preview: computed, problem: nextProblem, problemFieldId: fieldId };
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : '';
      if (detail === 'Invoice overflow') {
        return { preview: null, problem: 'This sale total is too large. Check quantities and prices.', problemFieldId: fieldId };
      }
      if (detail === 'Invalid native invoice') {
        return { preview: null, problem: 'Use a tax percentage between 0 and 100.', problemFieldId: 'sale-tax' };
      }
      return { preview: null, problem: detail || 'Check the sale quantities and tax.', problemFieldId: fieldId };
    }
  }, [cart, productMap, taxBasisPoints, tender, paymentAmounts, customer, creditCustomer]);
  const allocation = allocationPreview(preview?.totalPaise ?? 0, paymentAmounts);
  const needsCreditCustomer = tender === 'credit' || (tender === 'retail' && allocation.creditPaise > 0);
  const blocked = disabled || busy || !ready || pending !== null || historyOpen || heldPending !== null;
  const normalizedSearch = search.trim().toLowerCase();
  const matching = useMemo(
    () => products.filter(product => !normalizedSearch || [product.name, product.sku, product.id].some(field => field.toLowerCase().includes(normalizedSearch))),
    [products, normalizedSearch],
  );

  function add(product: Product, scan = false) {
    if (blocked || review) return;
    if (product.stockMilli <= 0) { setFailed(true); setMessage('This item is out of stock.'); return; }
    const existing = cart.findIndex(line => line.productId === product.id);
    if (existing >= 0) {
      if (scan && scanNeedsQuantity(product)) {
        pendingFocus.current = { kind: 'quantity', index: existing };
        setMessage('Enter the quantity for this item.'); setFailed(false);
      } else if (scan) {
        const current = parseFixedDecimal(cart[existing].typedQuantity, 3);
        if (current === null || current + 1000 > product.stockMilli) { setFailed(true); setMessage('Check quantity against available stock.'); return; }
        setCart(lines => lines.map((line, index) => index === existing ? { ...line, typedQuantity: quantity(current + 1000) } : line));
      } else { document.getElementById(`sale-quantity-${existing}`)?.focus(); }
      setSearch('');
      if (failed && !(scan && scanNeedsQuantity(product))) { setFailed(false); setMessage(readyMessage); }
      return;
    }
    if (cart.length >= 100) { setFailed(true); setMessage('A sale supports up to 100 items.'); return; }
    if (scan && !scanNeedsQuantity(product) && product.stockMilli < 1000) { setFailed(true); setMessage('Not enough stock for one item.'); return; }
    const needsQuantity = scan && scanNeedsQuantity(product);
    if (needsQuantity) { pendingFocus.current = { kind: 'quantity', index: cart.length }; setFailed(false); setMessage('Enter the quantity for this item.'); }
    setCart(lines => [...lines, { productId: product.id, typedQuantity: needsQuantity ? '' : quantity(Math.min(1000, product.stockMilli)) }]);
    setSearch('');
    if (failed && !needsQuantity) { setFailed(false); setMessage(readyMessage); }
  }

  const startConfirmation = useCallback((fromKeyboard = false) => {
    if (blocked) return;
    if (!cart.length) {
      if (fromKeyboard) {
        setFailed(true); setMessage('Add at least one item before reviewing the sale.');
        searchInput.current?.focus();
      }
      return;
    }
    if (!preview || problem || taxBasisPoints === null) {
      if (fromKeyboard) {
        setFailed(true); setMessage(problem || 'Check the sale quantities and tax.');
        const target = problemFieldId ? document.getElementById(problemFieldId) as HTMLInputElement | null : null;
        target?.focus(); target?.select?.();
      }
      return;
    }
    setReview(true); setFailed(false); setMessage('Review the items and transaction type, then confirm this sale.');
  }, [blocked, cart.length, preview, problem, problemFieldId, taxBasisPoints]);

  const cancelReview = useCallback(() => {
    setReview(false); setFailed(false); setMessage(readyMessage);
    pendingFocus.current = { kind: 'search', select: false };
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false); setHistoricInvoice(null); setHistoricPayments([]); setReceiptId('');
    pendingFocus.current = { kind: 'search', select: false };
  }, []);

  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || disabled || busy || heldPending) return;
      if (document.querySelector('.lock-prompt, .reopen-prompt')) return;
      if (event.key === 'F8') {
        if (pending && !invoice) { event.preventDefault(); void confirm(pending); }
        return;
      }
      if (event.key === 'F2') {
        if (pending || invoice || !ready) return;
        event.preventDefault();
        if (review || historyOpen) {
          setReview(false); setHistoryOpen(false); setHistoricInvoice(null); setHistoricPayments([]); setReceiptId('');
          if (review) { setFailed(false); setMessage(readyMessage); }
          pendingFocus.current = { kind: 'search', select: true };
        } else {
          searchInput.current?.focus(); searchInput.current?.select();
        }
        return;
      }
      if (event.key === 'F3') {
        if (pending || invoice || historyOpen || !ready) return;
        event.preventDefault();
        if (!cart.length) {
          if (review) setReview(false);
          setFailed(true); setMessage('Add at least one item before changing quantity.');
          pendingFocus.current = { kind: 'search', select: false };
          searchInput.current?.focus();
          return;
        }
        const activeId = document.activeElement?.id ?? '';
        const currentIndex = activeId.startsWith('sale-quantity-') ? Number(activeId.slice('sale-quantity-'.length)) : -1;
        const targetIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < cart.length
          ? (currentIndex + cart.length - 1) % cart.length
          : cart.length - 1;
        if (review) {
          setReview(false); setFailed(false); setMessage(readyMessage);
          pendingFocus.current = { kind: 'quantity', index: targetIndex };
        } else {
          const input = document.getElementById(`sale-quantity-${targetIndex}`) as HTMLInputElement | null;
          input?.focus(); input?.select();
        }
        return;
      }
      if (event.key === 'F4') {
        if (!pending && !invoice && !historyOpen && !review) {
          event.preventDefault();
          startConfirmation(true);
        }
        return;
      }
      if (event.key === 'Escape') {
        if (review) { event.preventDefault(); cancelReview(); }
        else if (historyOpen && !invoice && !pending) { event.preventDefault(); closeHistory(); }
      }
    }
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  });

  function postNew() {
    if (blocked || !preview || problem || taxBasisPoints === null) return;
    const creditSplitPaise = parseFixedDecimal(paymentAmounts.credit || '0', 2) ?? 0;
    const request: CheckoutRequest = {
      operationId: crypto.randomUUID(), taxBasisPoints, tender, customerId: tender === 'credit' ? customer : tender === 'retail' && creditSplitPaise > 0 ? customer : null,
      lines: cart.map(line => ({ productId: line.productId, expectedRevision: productMap.get(line.productId)!.revision, quantityMilli: parseFixedDecimal(line.typedQuantity, 3)! })),
    };
    try { validateNativeInvoiceRequest(request.tender === 'retail' ? { ...request, tender: 'cash' } : request); } catch { setFailed(true); setMessage('Check the sale items and customer reference.'); return; }
    void confirm(request);
  }

  const splitBreakdown = useMemo(() => {
    if (tender !== 'retail') return [];
    return (['cash', 'upi', 'card', 'credit'] as const).flatMap(method => {
      const amountPaise = parseFixedDecimal(paymentAmounts[method] || '0', 2);
      if (!amountPaise || amountPaise <= 0) return [];
      const label = method === 'cash' ? 'Cash'
        : method === 'credit' ? 'Customer credit'
        : method === 'upi' ? `UPI (unverified${paymentReferences.upi.trim() ? ` · Ref: ${paymentReferences.upi.trim()}` : ''})`
        : `Card (unverified${paymentReferences.card.trim() ? ` · Ref: ${paymentReferences.card.trim()}` : ''})`;
      return [{ method, label, amountPaise }];
    });
  }, [tender, paymentAmounts, paymentReferences]);

  return <section className="panel checkout-panel" id="checkout" aria-labelledby="checkout-heading">
    <div className="panel-heading"><div><p className="eyebrow">LOCAL CASHIER</p><h2 id="checkout-heading">Checkout</h2></div>
      <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => void refresh()}>Refresh checkout</button></div>
    <p className="muted">F2: find item · F3: edit quantity · Enter: add exact code · F4: review · Alt+Enter: confirm when focused · F8: recover pending sale</p>
    {reportsAllowed ? <div className="checkout-balances" aria-label="Local ledger balances" aria-busy={!ready}><p>{`Cash recorded: ${money(balances.cashPaise)}`}</p><p>{`Credit receivable: ${money(balances.creditPaise)}`}</p>{!ready ? <p>Balances need refresh.</p> : null}</div> : null}
    <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    {!invoice && !pending ? <div className="held-bill-toolbar">
      <button type="button" className="quiet-button" disabled={busy || disabled || heldPending !== null} onClick={() => { if (heldOpen) setHeldOpen(false); else void listHeld(); }}>{heldOpen ? 'Close held bills' : 'Held bills'}</button>
      {cart.length > 0 ? <><label htmlFor="held-bill-note">Bill note (optional)</label><input id="held-bill-note" maxLength={80} value={heldNote} disabled={blocked || review} placeholder="Customer name or short note" onChange={e => setHeldNote(e.target.value)}/>
        <button type="button" disabled={blocked || review} onClick={holdBill}>Hold bill</button></> : null}
    </div> : null}
    {heldPending ? <div className="pending-stock"><p>The held-bill result is uncertain. Retry the same action to check whether it was saved.</p><button type="button" disabled={busy || disabled} onClick={() => void changeHeld(heldPending)}>Retry held bill action</button></div> : null}
    {heldActive && !pending && !invoice ? <p className="held-bill-context">Resumed bill {heldActive.id.slice(0,8)}{heldNote ? ` · ${heldNote}` : ''}. Hold again to save any further edits.</p> : null}
    {heldWarnings.length && heldActive && !pending && !invoice ? <div className="held-bill-warnings" role="status"><strong>Review this resumed bill</strong><ul>{heldWarnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul></div> : null}
    {heldOpen && !pending && !invoice ? <section className="held-bills" aria-label="Held bills">
      <p className="muted">Your bills saved on this PC. Draft amounts are estimates; no stock or payment is reserved.</p>
      <button type="button" className="quiet-button" disabled={busy || disabled || heldPending !== null} onClick={() => void listHeld()}>Refresh held bills</button>
      {!heldBills.length ? <p>No held bills.</p> : <ul>{heldBills.map(bill => <li key={bill.id}>
        <div><strong>Bill {bill.id.slice(0,8)}{bill.state === 'active' ? ' · Open at counter' : ''}</strong>
          <span><time dateTime={bill.updatedAt}>{new Date(bill.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</time></span>
          <span>{bill.draft.customer?.name ?? bill.draft.input.customerId ?? 'Walk-in customer'} · {bill.draft.input.lines.length} products · {money(bill.draft.totalPaise)}</span>
          {bill.draft.input.note ? <span>{bill.draft.input.note}</span> : null}</div>
        <div><button type="button" disabled={busy || disabled || heldPending !== null || cart.length > 0 || !ready} aria-label={`Resume bill ${bill.id}`} onClick={() => void changeHeld({ id:bill.id,expectedRevision:bill.revision,action:{ kind:'resume' } })}>Resume</button>
          <button type="button" className="quiet-button" disabled={busy || disabled || heldPending !== null || Boolean(heldActive && heldActive.id !== bill.id)} aria-label={`Discard bill ${bill.id}`} onClick={() => void changeHeld({ id:bill.id,expectedRevision:bill.revision,action:{ kind:'discard' } })}>Discard</button></div>
      </li>)}</ul>}
      {cart.length > 0 ? <p>Hold or finish the current bill before resuming another.</p> : null}
    </section> : null}
    {!invoice && !pending ? <button type="button" disabled={busy || disabled} onClick={() => { setHistoryOpen(true); setHistoricInvoice(null); setHistoricPayments([]); setHistory([]); pendingFocus.current = { kind: 'receipt-lookup' }; }}>Find saved receipt</button> : null}
    {historyOpen && !invoice && !pending ? <section aria-label="Saved receipts">
      <button type="button" disabled={busy || disabled} onClick={closeHistory}>Back to checkout</button>
      <label htmlFor="receipt-lookup">Receipt ID to reopen</label><input ref={receiptLookupInput} id="receipt-lookup" maxLength={80} value={receiptId} disabled={busy || disabled} onChange={e => setReceiptId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.repeat && !e.nativeEvent.isComposing && receiptId.trim()) { e.preventDefault(); void openReceipt(receiptId); } }}/>
      <button type="button" disabled={busy || disabled || !receiptId.trim()} onClick={() => void openReceipt(receiptId)}>Open saved receipt</button>
      {reportsAllowed ? <button type="button" disabled={busy || disabled} onClick={() => void receipts()}>Browse saved receipts</button> : <p>Enter the exact ID of a receipt you saved. Other staff receipts require report permission.</p>}
      {historicInvoice ? <SavedInvoice key={historicInvoice.id} invoice={historicInvoice} payments={historicPayments} username={username}/> : null}
      {reportsAllowed && history.length ? <><p>Saved receipts, oldest first. Opening or printing does not create a sale.</p><ul>{history.map(record => <li key={record.invoice.id}><button type="button" disabled={busy || disabled} onClick={() => void openReceipt(record.invoice.id)}>{record.invoice.id} · {money(record.invoice.totalPaise)}</button></li>)}</ul>{history.length === 100 ? <button type="button" disabled={busy || disabled} onClick={() => void receipts(history[history.length - 1].sequence)}>Next receipts</button> : null}</> : null}
    </section> : null}
    {invoice ? <><SavedInvoice key={invoice.id} invoice={invoice} payments={invoicePayments} username={username}/><button type="button" disabled={busy || disabled || !ready} onClick={() => void release(true)}>Start next sale</button></> : <>
      {pending ? <div className="pending-stock"><p>Confirmation ID: <span className="operation-id">{pending.operationId}</span></p><p>The exact request is kept on this PC. Locking or reopening the app preserves it (press F8 to retry).</p>
        <button ref={retryButton} type="button" disabled={busy || disabled} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat && !event.nativeEvent.isComposing) void confirm(pending); } }} onClick={() => void confirm(pending)}>Retry same sale</button>
        {refused ? <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => void release(false)}>Edit refused sale</button> : null}
      </div> : null}
      <fieldset disabled={blocked || review}>
        <label htmlFor="checkout-search">Search items for sale</label><input ref={searchInput} id="checkout-search" onKeyDown={event => {
          if (event.key !== 'Enter' || event.repeat || event.nativeEvent.isComposing || blocked || review) return;
          event.preventDefault();
          if (!normalizedSearch) { setFailed(true); setMessage('Enter an item name or exact code.'); return; }
          const exact = findCode(products, search);
          if (exact.length === 1) add(exact[0], true);
          else if (exact.length > 1) { setFailed(true); setMessage('This code matches more than one item. Choose the item manually.'); }
          else { setFailed(true); setMessage('No exact item code found. Choose a matching item manually.'); }
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
              <input onFocus={event => event.currentTarget.select()} onKeyDown={event => { if (event.key === 'Enter' && !event.repeat && !event.nativeEvent.isComposing) { event.preventDefault(); searchInput.current?.focus(); } }} id={`sale-quantity-${index}`} inputMode="decimal" maxLength={24} value={line.typedQuantity} onChange={event => setCart(lines => lines.map((entry, i) => i === index ? { ...entry, typedQuantity: event.target.value } : entry))}/>
              <small>Up to 3 decimals · {product ? `${quantity(product.stockMilli)} ${product.unit} available · ${money(product.unitPricePaise)} / ${product.unit}` : 'Reload items'}</small></div>
            <button type="button" className="quiet-button" aria-label={`Remove ${product?.name ?? line.productId} from sale`} onClick={() => { pendingFocus.current = { kind: 'search', select: false }; setCart(lines => lines.filter(entry => entry.productId !== line.productId)); }}>Remove</button>
          </div></li>;
        })}</ul>
        <div className="checkout-options"><div><label htmlFor="sale-tax">Tax (%)</label><input id="sale-tax" inputMode="decimal" maxLength={8} value={tax} onChange={event => setTax(event.target.value)}/></div>
          <div><label htmlFor="sale-tender">Transaction type</label><select id="sale-tender" value={tender} onChange={event => setTender(event.target.value as 'cash' | 'credit' | 'retail')}><option value="cash">Cash</option><option value="retail">UPI / card / split</option><option value="credit">Credit</option></select></div>
          {needsCreditCustomer ? <div><CustomerLookup disabled={blocked || review} refreshToken={creditRefreshKey} selectedId={customer} onSelect={setCustomer} onResolved={setCreditCustomer}/><label htmlFor="sale-customer">{tender === 'credit' ? 'Credit customer reference' : 'Customer reference for a credit split (optional)'}</label><input id="sale-customer" maxLength={80} value={customer} onChange={event => setCustomer(event.target.value)}/><small>Choose an existing customer above. Their reference is filled automatically.</small></div> : null}
        </div>
        {tender === 'retail' ? <fieldset className="payment-allocation"><legend>Allocate payment</legend>
          <div className="allocation-totals" aria-live="polite">
            <p>Payable<strong>{preview ? money(preview.totalPaise) : '—'}</strong></p>
            <p>Allocated<strong>{allocation.invalidMethod ? '—' : money(allocation.allocatedPaise)}</strong></p>
            <p>{allocation.remainingPaise < 0 ? 'Overallocated' : 'Remaining'}<strong>{!preview || allocation.invalidMethod ? '—' : money(Math.abs(allocation.remainingPaise))}</strong></p>
          </div>
          <p className="muted">Enter what the customer pays with each method. UPI and card are recorded as unverified until manually reconciled.</p>
          <div className="allocation-methods">{paymentMethods.map(method => {
            const remaining = preview ? remainingForMethod(preview.totalPaise, paymentAmounts, method) : null;
            const label = method === 'upi' ? 'UPI' : method === 'credit' ? 'customer credit' : method;
            return <div key={method} className="allocation-method">
              <label htmlFor={`split-${method}`}>Split {label} amount (₹)</label>
              <div className="allocation-entry"><input id={`split-${method}`} inputMode="decimal" maxLength={24} placeholder="0.00" aria-invalid={allocation.invalidMethod === method} value={paymentAmounts[method]} onChange={e => setPaymentAmounts(previous => ({ ...previous, [method]: e.target.value }))}/>
                <button type="button" className="quiet-button" aria-label={`Use remaining for ${label}`} disabled={remaining === null || remaining === 0} onClick={() => { if (remaining !== null) setPaymentAmounts(previous => ({ ...previous, [method]: formatPaiseInput(remaining) })); }}>Use remaining</button></div>
              {method === 'upi' || method === 'card' ? <><label htmlFor={`split-ref-${method}`}>{method === 'upi' ? 'UPI' : 'Card terminal'} reference (optional, unverified)</label><input id={`split-ref-${method}`} maxLength={80} value={paymentReferences[method]} onChange={e => setPaymentReferences(previous => ({ ...previous, [method]: e.target.value }))}/></> : null}
            </div>;
          })}</div>
        </fieldset> : null}
      </fieldset>
      {!pending && cart.length ? <><p className="muted">{problem || 'Preview only. The native store checks prices, stock and totals before saving.'}</p>
        {preview ? <p className="checkout-total">Subtotal: {money(preview.subtotalPaise)} · Tax: {money(preview.taxPaise)}<br/><output aria-live="polite">Total: {money(preview.totalPaise)}</output></p> : null}
        {review && preview ? <div role="group" aria-label="Confirm sale">
          <div className="checkout-review-summary">
            <ul aria-label="Review sale items">{cart.map((line, index) => {
              const product = productMap.get(line.productId);
              const qtyMilli = parseFixedDecimal(line.typedQuantity, 3) ?? 0;
              return <li key={line.productId}>
                <span>{product?.name ?? line.productId} · {quantity(qtyMilli)} {product?.unit ?? 'units'} × {money(product?.unitPricePaise ?? 0)}</span>
                <strong>{money(preview.lineTotalsPaise[index] ?? 0)}</strong>
              </li>;
            })}</ul>
            {tender === 'cash' ? <p>Payment allocation: Cash · {money(preview.totalPaise)}</p>
              : tender === 'credit' ? <p>Payment allocation: Customer credit · Customer: {creditCustomer?.name} ({customer}) · Credit amount: {money(preview.totalPaise)}</p>
              : <>
                <ul aria-label="Review payment allocation">{splitBreakdown.map(part => <li key={part.method}><span>{part.label}</span><strong>{money(part.amountPaise)}</strong></li>)}</ul>
                {needsCreditCustomer ? <p>Customer: {creditCustomer?.name} · {customer} · Amount due: {money(allocation.creditPaise)}</p> : null}
              </>}
          </div>
          <p>{tender === 'cash' ? 'Receive cash for this sale.' : tender === 'credit' ? `Record credit for ${customer}.` : 'Record this payment split. Digital amounts remain pending and unverified; any customer-credit amount stays outstanding on the customer’s account.'} Save this sale on this PC?</p>
          <button type="button" disabled={disabled || busy || Boolean(problem)} ref={confirmButton} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat && !event.nativeEvent.isComposing) postNew(); } }} onClick={postNew}>Confirm sale</button>
          <button type="button" className="quiet-button" disabled={disabled || busy} onClick={cancelReview}>Edit sale</button>
        </div>
          : <button type="button" disabled={blocked || !preview || Boolean(problem)} onClick={() => startConfirmation(false)}>Review sale</button>}
      </> : null}
    </>}
  </section>;
}
