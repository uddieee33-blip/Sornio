import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from './native';
import type { Role } from './native';
import { errorMessage } from './access';
import { formatPaiseInput, money, quantity } from './billing-types';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import type { Product } from './billing-types';
import type { GoodsReceipt, PurchaseOrder, PurchaseOrderSummary, PurchaseReturn, Supplier, SupplierStatement, SupplierPayment, SupplierReceipt } from './supplier-types';

const emptyProfile = { id: '', name: '', phone: '', gstin: '', address: '', days: '30', notes: '' };
const emptyLine = { productId: '', quantity: '', cost: '', taxBps: '0' };
type DraftLine = typeof emptyLine;
const taxChoices = [['0', 'No GST'], ['500', 'GST 5%'], ['1200', 'GST 12%'], ['1800', 'GST 18%'], ['2800', 'GST 28%']] as const;
const orderStates = ['', 'draft', 'submitted', 'approved', 'rejected', 'cancelled', 'partial', 'received', 'closed'] as const;
const statusLabel: Record<string, string> = { draft: 'Draft', submitted: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', partial: 'Partially received', received: 'Received', closed: 'Closed' };

export function SupplierPanel({ role, disabled, refreshToken, onChanged, onBusyChange, onDirtyChange }: { role: Role; disabled: boolean; refreshToken: number; onChanged: () => void; onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void }) {
  const canRead = role !== 'cashier';
  const manageSupplier = role === 'owner' || role === 'manager';
  const manageOrder = manageSupplier || role === 'assistant_manager';
  const approve = manageSupplier;
  const pay = manageSupplier;
  const canReturn = manageSupplier;
  const correct = role === 'owner';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]), [search, setSearch] = useState(''), [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]), [status, setStatus] = useState(''), [openOrder, setOpenOrder] = useState<PurchaseOrder | null>(null);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]), [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyProfile), [editing, setEditing] = useState<number | null>(null);
  const [note, setNote] = useState(''), [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]), [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [lineQuantities, setLineQuantities] = useState<Record<number, string>>({}), [lineDamaged, setLineDamaged] = useState<Record<number, string>>({}), [receiptReference, setReceiptReference] = useState(''), [receiptNote, setReceiptNote] = useState('');
  const [invoiceReference, setInvoiceReference] = useState(''), [invoiceTotal, setInvoiceTotal] = useState(''), [invoiceDue, setInvoiceDue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank'), [paymentAmount, setPaymentAmount] = useState(''), [paymentReference, setPaymentReference] = useState(''), [paymentInvoice, setPaymentInvoice] = useState('');
  const [returnReceipt, setReturnReceipt] = useState(''), [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({}), [returnDisposition, setReturnDisposition] = useState('supplier_credit'), [returnMethod, setReturnMethod] = useState('bank'), [returnReason, setReturnReason] = useState('');
  const [openingAmount, setOpeningAmount] = useState(''), [openingDue, setOpeningDue] = useState(''), [openingReason, setOpeningReason] = useState('');
  const [reversalTarget, setReversalTarget] = useState(''), [reversalReason, setReversalReason] = useState('');
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [message, setMessage] = useState(canRead ? 'Opening suppliers…' : 'Suppliers are managed on this PC by owners, managers and assistant managers.');
  const [ready, setReady] = useState(false);
  const mounted = useRef(false), submitting = useRef(false), readVersion = useRef(0), announced = useRef(false);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const operationId = (fingerprint: string) => {
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
    return operation.current.id;
  };
  const clearOperation = () => { operation.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const profileDirty = JSON.stringify(form) !== JSON.stringify(emptyProfile) || editing !== null;
  const orderDirty = note.trim() !== '' || lines.some(line => line.productId !== '' || line.quantity !== '' || line.cost !== '') || editingOrder !== null;
  const actionDirty = openOrder !== null && (Object.values(lineQuantities).some(v => v.trim() !== '') || invoiceReference !== '' || paymentAmount !== '' || paymentReference !== '' || returnReason !== '' || openingAmount !== '' || reversalReason !== '');
  useEffect(() => { onDirtyChange(profileDirty || orderDirty || actionDirty); }, [profileDirty, orderDirty, actionDirty, onDirtyChange]);

  const loadProducts = useCallback(async () => { const rows = await invoke<Product[]>('list_local_products'); if (mounted.current) setProducts(rows); }, []);
  useEffect(() => { if (!canRead) return; void loadProducts().catch(() => { /* Products are only needed for new purchase orders. */ }); }, [canRead, loadProducts]);

  // quiet keeps an action's own result message ("Goods received…") on screen;
  // the trailing refresh must not stomp it with the generic line.
  const load = useCallback(async (quiet = false) => {
    if (!canRead) return;
    const generation = ++readVersion.current;
    const rows = await invoke<Supplier[]>('find_local_suppliers', { search, includeArchived: showArchived });
    if (!mounted.current || generation !== readVersion.current) return;
    setSuppliers(rows);
    if (selectedId) {
      const result = await invoke<SupplierStatement>('read_supplier_statement', { supplierId: selectedId, after: 0, through: null });
      if (!mounted.current || generation !== readVersion.current) return;
      setStatement(result);
      const list = await invoke<PurchaseOrderSummary[]>('find_purchase_orders', { search: '', status, supplierId: selectedId });
      if (!mounted.current || generation !== readVersion.current) return;
      setOrders(list);
      const [goods, supplied] = await Promise.all([
        invoke<GoodsReceipt[]>('list_goods_receipts', { orderId: openOrder?.id ?? '' }).catch(() => [] as GoodsReceipt[]),
        invoke<PurchaseReturn[]>('list_purchase_returns', { supplierId: selectedId }).catch(() => [] as PurchaseReturn[]),
      ]);
      if (!mounted.current || generation !== readVersion.current) return;
      setReceipts(openOrder ? goods : []);
      setReturns(supplied);
    }
    setReady(true); setFailed(false);
    if (!quiet) setMessage('Suppliers are up to date.');
  }, [canRead, search, showArchived, selectedId, status, openOrder?.id]);
  // Only the first load announces the generic line; every later reload stays quiet so an action's own result stays visible. Failures always announce.
  useEffect(() => { if (!canRead) return; const timer = setTimeout(() => { const quiet = announced.current; announced.current = true; void load(quiet).catch(error => { if (mounted.current) { setReady(false); setFailed(true); setMessage(errorMessage(error, 'Suppliers could not be opened.')); } }); }, 150); return () => { clearTimeout(timer); readVersion.current += 1; }; }, [load, refreshToken]);

  async function run(operationFn: () => Promise<void>) {
    if (submitting.current || disabled || !canRead) return;
    readVersion.current += 1; submitting.current = true; setBusy(true); onBusyChange(true); setFailed(false);
    try { await operationFn(); }
    catch (error: unknown) { if (mounted.current) { setReady(false); setFailed(true); setMessage(errorMessage(error, 'The result is uncertain. Refresh before starting another entry.')); } }
    finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); readVersion.current += 1; void load(true).catch(() => { /* The action reported its own outcome. */ }); } }
  }
  async function choose(id: string) {
    if (busy || disabled || !canRead) return;
    setSelectedId(id); setOpenOrder(null); setEditingOrder(null); setLines([{ ...emptyLine }]); setNote(''); setLineQuantities({}); setLineDamaged({}); setReceiptReference(''); setReceiptNote(''); setReturnReceipt(''); setReturnQuantities({}); setReturnReason('');
    await run(async () => {
      const result = await invoke<SupplierStatement>('read_supplier_statement', { supplierId: id, after: 0, through: null });
      if (!mounted.current) return;
      setStatement(result);
      const list = await invoke<PurchaseOrderSummary[]>('find_purchase_orders', { search: '', status, supplierId: id });
      if (mounted.current) setOrders(list);
      const supplied = await invoke<PurchaseReturn[]>('list_purchase_returns', { supplierId: id });
      if (mounted.current) setReturns(supplied);
      setMessage('Supplier account opened.');
    });
  }
  function saveSupplier(event: FormEvent) {
    event.preventDefault();
    const days = Number(form.days);
    if (!/^\d{1,4}$/.test(form.days) || days > 3650) { setFailed(true); setMessage('Credit days must be a number between 0 and 3650.'); return; }
    const fingerprint = `supplier:${form.id}:${editing ?? 'new'}:${form.name}:${form.phone}:${form.gstin}:${form.address}:${form.days}:${form.notes}`;
    void run(async () => {
      const saved = await invoke<Supplier>('save_local_supplier', { r: { operationId: operationId(fingerprint), id: form.id, name: form.name, phone: form.phone || null, gstin: form.gstin || null, address: form.address || null, paymentTermsDays: days, notes: form.notes, archived: false, expectedRevision: editing } });
      clearOperation();
      if (!mounted.current) return;
      setForm(emptyProfile); setEditing(null); setSelectedId(saved.id); onChanged(); setMessage('Supplier saved.');
    });
  }
  function addLine() { setLines(value => [...value, { ...emptyLine }]); }
  function removeLine(index: number) { setLines(value => value.filter((_, i) => i !== index)); }
  function saveOrder(event: FormEvent) {
    event.preventDefault();
    const prepared = [] as { productId: string; quantityMilli: number; unitCostPaise: number; taxBps: number }[];
    for (const line of lines) {
      if (!line.productId) continue;
      const quantityMilli = parseFixedDecimal(line.quantity, 3);
      const unitCostPaise = parseFixedDecimal(line.cost, 2);
      const taxBps = Number(line.taxBps);
      if (quantityMilli === null || quantityMilli <= 0 || unitCostPaise === null || Number.isNaN(taxBps)) { setFailed(true); setMessage('Each ordered line needs an item, a quantity and a unit cost.'); return; }
      prepared.push({ productId: line.productId, quantityMilli, unitCostPaise, taxBps });
    }
    if (prepared.length === 0) { setFailed(true); setMessage('Add at least one line to the order.'); return; }
    const fingerprint = `order:${editingOrder?.id ?? 'new'}:${editingOrder?.revision ?? ''}:${note}:${JSON.stringify(prepared)}`;
    void run(async () => {
      if (editingOrder) {
        await invoke('update_purchase_order', { r: { operationId: operationId(fingerprint), id: editingOrder.id, expectedRevision: editingOrder.revision, note, lines: prepared } });
      } else {
        const created = await invoke<PurchaseOrder>('create_purchase_order', { r: { operationId: operationId(fingerprint), supplierId: selectedId, note, lines: prepared } });
        setOpenOrder(created);
      }
      clearOperation();
      if (!mounted.current) return;
      setNote(''); setLines([{ ...emptyLine }]); setEditingOrder(null); onChanged(); setMessage(editingOrder ? 'Draft order updated.' : 'Draft order created. Submit it for approval when ready.');
    });
  }
  async function transition(kind: 'submit' | 'approve' | 'reject' | 'cancel' | 'close') {
    if (!openOrder) return;
    const reason = kind === 'reject' || kind === 'cancel' ? window.prompt(kind === 'reject' ? 'Reason for rejecting this order' : 'Reason for cancelling this order') ?? '' : '';
    if ((kind === 'reject' || kind === 'cancel') && reason.trim() === '') { setFailed(true); setMessage('A reason is required.'); return; }
    const fingerprint = `${kind}:${openOrder.id}:${openOrder.revision}:${reason}`;
    await run(async () => {
      const request = { operationId: operationId(fingerprint), id: openOrder.id, expectedRevision: openOrder.revision, reason: reason || null };
      if (kind === 'submit') await invoke('submit_purchase_order', { r: request });
      else if (kind === 'approve' || kind === 'reject') await invoke('decide_purchase_order', { r: { ...request, decision: kind } });
      else if (kind === 'cancel') await invoke('cancel_purchase_order', { r: request });
      else await invoke('close_purchase_order', { r: request });
      clearOperation();
      if (!mounted.current) return;
      onChanged(); setMessage('Order updated.');
      const detail = await invoke<PurchaseOrder>('get_purchase_order', { id: openOrder.id });
      if (mounted.current) setOpenOrder(detail);
    });
  }
  async function toggleArchive() {
    if (!selectedSupplier || editing !== null) return;
    const targetId = selectedSupplier.id;
    await run(async () => {
      // Read right before writing so the archive never conflicts with a just-saved edit.
      const fresh = await invoke<SupplierStatement>('read_supplier_statement', { supplierId: targetId, after: 0, through: null });
      const current = fresh.supplier;
      const fingerprint = `archive:${current.id}:${current.revision}:${current.archived}`;
      await invoke<Supplier>('save_local_supplier', { r: { operationId: operationId(fingerprint), id: current.id, name: current.name, phone: current.phone || null, gstin: current.gstin || null, address: current.address || null, paymentTermsDays: current.paymentTermsDays, notes: current.notes, archived: !current.archived, expectedRevision: current.revision } });
      clearOperation();
      if (!mounted.current) return;
      onChanged(); setMessage(current.archived ? 'Supplier restored.' : 'Supplier archived. Tick “Show archived suppliers” to see it again.');
    });
  }
  async function openDetail(id: string) {
    await run(async () => {
      const detail = await invoke<PurchaseOrder>('get_purchase_order', { id });
      if (!mounted.current) return;
      setOpenOrder(detail); setLineQuantities({}); setLineDamaged({}); setReceiptReference(''); setReceiptNote(''); setReturnQuantities({}); setReturnReceipt(''); setMessage(`Order PO-${detail.number} is ${statusLabel[detail.status] ?? detail.status}.`);
      try { const goods = await invoke<GoodsReceipt[]>('list_goods_receipts', { orderId: detail.id }); if (mounted.current) setReceipts(goods); } catch { if (mounted.current) setReceipts([]); }
    });
  }
  function receive(event: FormEvent) {
    event.preventDefault();
    if (!openOrder) return;
    const payload = [] as { lineIndex: number; productId: string; quantityMilli: number; damagedMilli: number | null; note: string | null }[];
    for (const line of openOrder.lines) {
      const raw = lineQuantities[line.lineIndex] ?? '';
      if (raw.trim() === '') continue;
      const quantityMilli = parseFixedDecimal(raw, 3);
      const damaged = (lineDamaged[line.lineIndex] ?? '').trim() === '' ? 0 : parseFixedDecimal(lineDamaged[line.lineIndex] ?? '', 3);
      if (quantityMilli === null || quantityMilli <= 0 || damaged === null || damaged < 0 || damaged > quantityMilli) { setFailed(true); setMessage('Each received line needs a positive quantity and damaged within the received quantity.'); return; }
      payload.push({ lineIndex: line.lineIndex, productId: line.productId, quantityMilli, damagedMilli: damaged === 0 ? null : damaged, note: null });
    }
    if (payload.length === 0) { setFailed(true); setMessage('Enter the quantity received for at least one line.'); return; }
    const fingerprint = `receive:${openOrder.id}:${openOrder.revision}:${receiptReference}:${JSON.stringify(payload)}`;
    void run(async () => {
      await invoke('post_goods_receipt', { r: { operationId: operationId(fingerprint), orderId: openOrder.id, reference: receiptReference || null, note: receiptNote, lines: payload } });
      clearOperation();
      if (!mounted.current) return;
      setLineQuantities({}); setLineDamaged({}); setReceiptReference(''); setReceiptNote('');
      onChanged(); setMessage('Goods received. Stock and the payable were updated.');
      const detail = await invoke<PurchaseOrder>('get_purchase_order', { id: openOrder.id });
      if (mounted.current) setOpenOrder(detail);
    });
  }
  function postInvoice(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    const total = parseFixedDecimal(invoiceTotal, 2);
    if (total === null || total <= 0 || invoiceReference.trim() === '') { setFailed(true); setMessage('Enter the supplier invoice reference and a positive total.'); return; }
    const latestReceipt = receipts[0]?.id ?? null;
    const fingerprint = `invoice:${selectedId}:${invoiceReference}:${total}:${invoiceDue}:${latestReceipt ?? ''}`;
    void run(async () => {
      await invoke('post_supplier_invoice', { r: { operationId: operationId(fingerprint), supplierId: selectedId, receiptId: latestReceipt, reference: invoiceReference, totalPaise: total, dueOn: invoiceDue || null } });
      clearOperation();
      if (!mounted.current) return;
      setInvoiceReference(''); setInvoiceTotal(''); setInvoiceDue('');
      onChanged(); setMessage('Supplier invoice recorded. Any difference from the receipt accrual was posted as a variance.');
    });
  }
  function postPayment(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    const amount = parseFixedDecimal(paymentAmount, 2);
    if (amount === null || amount <= 0 || paymentReference.trim() === '') { setFailed(true); setMessage('Enter a positive amount and the payment reference.'); return; }
    const fingerprint = `payment:${selectedId}:${paymentInvoice}:${paymentMethod}:${amount}:${paymentReference}`;
    void run(async () => {
      const saved = await invoke<SupplierPayment>('post_supplier_payment', { r: { operationId: operationId(fingerprint), supplierId: selectedId, invoiceId: paymentInvoice.trim() || null, method: paymentMethod, amountPaise: amount, reference: paymentReference, paidOn: null } });
      clearOperation();
      if (!mounted.current) return;
      setPaymentAmount(''); setPaymentReference(''); setPaymentInvoice('');
      onChanged(); setMessage(`Payment recorded. Outstanding is now ${money(saved.balancePaise)}.`);
    });
  }
  function postReturn(event: FormEvent) {
    event.preventDefault();
    if (!returnReceipt) { setFailed(true); setMessage('Choose the goods receipt to return from.'); return; }
    const receipt = receipts.find(r => r.id === returnReceipt);
    if (!receipt) { setFailed(true); setMessage('That receipt is no longer available. Refresh and try again.'); return; }
    const payload = [] as { receiptLine: number; productId: string; quantityMilli: number }[];
    for (const line of receipt.lines) {
      const raw = returnQuantities[line.lineIndex] ?? '';
      if (raw.trim() === '') continue;
      const quantityMilli = parseFixedDecimal(raw, 3);
      if (quantityMilli === null || quantityMilli <= 0) { setFailed(true); setMessage('Return quantities must be positive.'); return; }
      payload.push({ receiptLine: line.lineIndex, productId: line.productId, quantityMilli });
    }
    if (payload.length === 0) { setFailed(true); setMessage('Enter how much to return for at least one line.'); return; }
    if (returnReason.trim() === '') { setFailed(true); setMessage('Give the supplier a reason for the return.'); return; }
    const fingerprint = `return:${returnReceipt}:${returnDisposition}:${returnMethod}:${JSON.stringify(payload)}:${returnReason}`;
    void run(async () => {
      const saved = await invoke<PurchaseReturn>('post_purchase_return', { r: { operationId: operationId(fingerprint), receiptId: returnReceipt, disposition: returnDisposition, refundMethod: returnDisposition === 'refund' ? returnMethod : null, reason: returnReason, lines: payload } });
      clearOperation();
      if (!mounted.current) return;
      setReturnQuantities({}); setReturnReason(''); onChanged(); setMessage(`Return recorded for ${money(saved.totalPaise)}.`);
    });
  }
  function postOpening(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    const amount = parseFixedDecimal(openingAmount, 2, true);
    if (amount === null || amount === 0 || openingReason.trim() === '') { setFailed(true); setMessage('Enter a non-zero opening amount and the reason.'); return; }
    const fingerprint = `opening:${selectedId}:${amount}:${openingDue}:${openingReason}`;
    void run(async () => {
      const saved = await invoke<SupplierReceipt>('post_supplier_opening', { r: { operationId: operationId(fingerprint), supplierId: selectedId, amountPaise: amount, dueOn: openingDue || null, reason: openingReason } });
      clearOperation();
      if (!mounted.current) return;
      setOpeningAmount(''); setOpeningDue(''); setOpeningReason(''); onChanged(); setMessage(`Opening balance recorded. Outstanding is now ${money(saved.balancePaise)}.`);
    });
  }
  function postReversal(event: FormEvent) {
    event.preventDefault();
    if (reversalTarget.trim() === '' || reversalReason.trim() === '') { setFailed(true); setMessage('Enter the entry ID to reverse and the reason.'); return; }
    const fingerprint = `reversal:${reversalTarget}:${reversalReason}`;
    void run(async () => {
      const saved = await invoke<SupplierReceipt>('reverse_supplier_entry', { r: { operationId: operationId(fingerprint), targetOperationId: reversalTarget, reason: reversalReason } });
      clearOperation();
      if (!mounted.current) return;
      setReversalTarget(''); setReversalReason(''); onChanged(); setMessage(`Entry reversed. Outstanding is now ${money(saved.balancePaise)}.`);
    });
  }
  const blocked = disabled || busy || !ready;
  if (!canRead) return <section className="panel supplier-panel" aria-labelledby="suppliers-heading"><h2 id="suppliers-heading">Suppliers & purchases</h2><p role="status">{message}</p></section>;
  const selectedSupplier = statement?.supplier ?? suppliers.find(s => s.id === selectedId) ?? null;
  return <section className="panel supplier-panel" aria-labelledby="suppliers-heading" aria-busy={busy}>
    <h2 id="suppliers-heading">Suppliers & purchases</h2><p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    <button type="button" disabled={busy || disabled} onClick={() => void run(() => load())}>Refresh suppliers</button>
    <fieldset disabled={blocked}><label htmlFor="supplier-search">Search suppliers</label><input id="supplier-search" type="search" value={search} onChange={e => setSearch(e.target.value)}/><label><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>Show archived suppliers</label>
      <ul aria-label="Suppliers">{suppliers.slice(0, 100).map(s => <li key={s.id}><span>{s.name} · {s.id} · {s.phone ?? 'No phone'} · Outstanding {money(s.balancePaise)} · Overdue {money(s.overduePaise)}{s.archived ? ' · Archived' : ''}</span><button type="button" aria-label={`Open supplier ${s.id}`} onClick={() => void choose(s.id)}>Open</button></li>)}</ul>{suppliers.length > 100 ? <p>More than 100 matches. Refine your search.</p> : null}
    </fieldset>
    {manageSupplier ? <form onSubmit={saveSupplier}><fieldset disabled={blocked}><legend>{editing === null ? 'Create supplier' : 'Edit supplier'}</legend>
      <label htmlFor="supplier-id">Supplier ID</label><input id="supplier-id" required maxLength={80} pattern={'[A-Za-z0-9_\\-]+'} readOnly={editing !== null} value={form.id} onChange={e => setForm({ ...form, id: e.target.value })}/>
      <label htmlFor="supplier-name">Supplier name</label><input id="supplier-name" required maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/>
      <label htmlFor="supplier-phone">Phone</label><input id="supplier-phone" type="tel" maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/>
      <label htmlFor="supplier-gstin">GSTIN</label><input id="supplier-gstin" maxLength={15} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })}/>
      <label htmlFor="supplier-address">Address</label><input id="supplier-address" maxLength={500} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}/>
      <label htmlFor="supplier-days">Payment terms (days)</label><input id="supplier-days" inputMode="numeric" maxLength={4} value={form.days} onChange={e => setForm({ ...form, days: e.target.value })}/>
      <label htmlFor="supplier-notes">Notes</label><input id="supplier-notes" maxLength={800} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/>
      <button type="submit">Save supplier</button>{editing !== null ? <button type="button" onClick={() => { setForm(emptyProfile); setEditing(null); }}>Cancel supplier edit</button> : null}
    </fieldset></form> : null}
    {selectedSupplier ? <section aria-labelledby="selected-supplier-heading"><h3 id="selected-supplier-heading">{selectedSupplier.name} · {selectedSupplier.id}</h3><p>Outstanding: {money(selectedSupplier.balancePaise)} · Overdue: {money(selectedSupplier.overduePaise)} · Terms: {selectedSupplier.paymentTermsDays} days</p>
      {manageSupplier ? <button type="button" disabled={blocked} onClick={() => void toggleArchive()}>{selectedSupplier.archived ? 'Restore supplier' : 'Archive supplier'}</button> : null}
      {manageSupplier ? <button type="button" disabled={blocked} onClick={() => { setForm({ id: selectedSupplier.id, name: selectedSupplier.name, phone: selectedSupplier.phone ?? '', gstin: selectedSupplier.gstin ?? '', address: selectedSupplier.address ?? '', days: String(selectedSupplier.paymentTermsDays), notes: selectedSupplier.notes }); setEditing(selectedSupplier.revision); }}>Edit supplier profile</button> : null}
      {statement ? <><h4>Aging</h4><ul><li>Not yet due: {money(statement.aging.currentPaise)}</li><li>1–30 days: {money(statement.aging.days1To30Paise)}</li><li>31–60 days: {money(statement.aging.days31To60Paise)}</li><li>61–90 days: {money(statement.aging.days61To90Paise)}</li><li>Over 90 days: {money(statement.aging.days90PlusPaise)}</li></ul>
        <h4>Supplier statement · closing balance {money(statement.closingBalancePaise)}</h4><table><thead><tr><th>Date</th><th>Entry</th><th>Change</th><th>Balance</th></tr></thead><tbody>{statement.entries.map(e => <tr key={e.sequence}><td>{new Date(e.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td>{e.kind} · {e.operationId}<br/>{e.reference ? `Ref ${e.reference}` : null}<br/>{e.reason}</td><td>{money(e.amountPaise)}</td><td>{money(e.runningBalancePaise)}</td></tr>)}</tbody></table>{statement.hasMore ? <p>Showing the latest 100 entries.</p> : null}</> : null}
      <h4>Purchase orders</h4>
      <label htmlFor="order-status">Filter orders</label><select id="order-status" value={status} onChange={e => setStatus(e.target.value)}>{orderStates.map(value => <option key={value} value={value}>{value === '' ? 'All orders' : statusLabel[value] ?? value}</option>)}</select>
      <ul aria-label="Purchase orders">{orders.map(o => <li key={o.id}><span>PO-{o.number} · {statusLabel[o.status] ?? o.status} · {money(o.totalPaise)} · {o.itemCount} items</span><button type="button" aria-label={`Open order PO-${o.number}`} onClick={() => void openDetail(o.id)}>Open</button></li>)}</ul>
      {manageOrder && products.length > 0 ? <form onSubmit={saveOrder}><fieldset disabled={blocked}><legend>{editingOrder ? `Edit draft PO-${editingOrder.number}` : 'New purchase order'}</legend>
        <label htmlFor="order-note">Order note</label><input id="order-note" maxLength={800} value={note} onChange={e => setNote(e.target.value)}/>
        {lines.map((line, index) => <div key={index} className="order-line"><label htmlFor={`line-item-${index}`}>Item</label><select id={`line-item-${index}`} value={line.productId} onChange={e => setLines(v => v.map((l, i) => i === index ? { ...l, productId: e.target.value } : l))}><option value="">Choose an item</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({quantity(p.stockMilli)} {p.unit})</option>)}</select>
          <label htmlFor={`line-qty-${index}`}>Quantity</label><input id={`line-qty-${index}`} inputMode="decimal" maxLength={12} value={line.quantity} onChange={e => setLines(v => v.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l))}/>
          <label htmlFor={`line-cost-${index}`}>Unit cost (₹)</label><input id={`line-cost-${index}`} inputMode="decimal" maxLength={16} value={line.cost} onChange={e => setLines(v => v.map((l, i) => i === index ? { ...l, cost: e.target.value } : l))}/>
          <label htmlFor={`line-tax-${index}`}>GST</label><select id={`line-tax-${index}`} value={line.taxBps} onChange={e => setLines(v => v.map((l, i) => i === index ? { ...l, taxBps: e.target.value } : l))}>{taxChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {lines.length > 1 ? <button type="button" onClick={() => removeLine(index)}>Remove line</button> : null}
        </div>)}
        <button type="button" onClick={addLine}>Add line</button>
        <button type="submit">{editingOrder ? 'Save draft order' : 'Create draft order'}</button>{editingOrder ? <button type="button" onClick={() => { setEditingOrder(null); setNote(''); setLines([{ ...emptyLine }]); }}>Cancel order edit</button> : null}
      </fieldset></form> : null}
      {openOrder ? <section aria-labelledby="open-order-heading"><h4 id="open-order-heading">PO-{openOrder.number} · {statusLabel[openOrder.status] ?? openOrder.status}</h4><p>Supplier: {openOrder.supplierName} · Subtotal {money(openOrder.subtotalPaise)} + GST {money(openOrder.taxPaise)} = {money(openOrder.totalPaise)} · Revision {openOrder.revision}</p>
        <table><thead><tr><th>Item</th><th>Qty ordered</th><th>Qty received</th><th>Unit cost</th><th>Line total</th></tr></thead><tbody>{openOrder.lines.map(line => <tr key={line.lineIndex}><td>{line.name} ({line.sku})</td><td>{quantity(line.quantityMilli)} {line.unit}</td><td>{quantity(line.receivedMilli)} {line.unit}</td><td>{money(line.unitCostPaise)}</td><td>{money(line.lineTotalPaise)}</td></tr>)}</tbody></table>
        <div className="order-actions">
          {openOrder.status === 'draft' ? <>{manageOrder ? <><button type="button" disabled={blocked} onClick={() => void transition('submit')}>Submit for approval</button><button type="button" disabled={blocked} onClick={() => { setEditingOrder(openOrder); setNote(openOrder.note); setLines(openOrder.lines.map(line => ({ productId: line.productId, quantity: quantity(line.quantityMilli), cost: formatPaiseInput(line.unitCostPaise), taxBps: String(line.taxBps) }))); }}>Edit draft</button></> : null}{manageOrder ? <button type="button" disabled={blocked} onClick={() => void transition('cancel')}>Cancel order</button> : null}</> : null}
          {openOrder.status === 'submitted' && approve ? <><button type="button" disabled={blocked} onClick={() => void transition('approve')}>Approve order</button><button type="button" disabled={blocked} onClick={() => void transition('reject')}>Reject order</button></> : null}
          {openOrder.status === 'submitted' && !approve && manageOrder ? <button type="button" disabled={blocked} onClick={() => void transition('cancel')}>Cancel order</button> : null}
          {openOrder.status === 'approved' && manageOrder ? <button type="button" disabled={blocked} onClick={() => void transition('cancel')}>Cancel order</button> : null}
          {openOrder.status === 'approved' && approve ? <button type="button" disabled={blocked} onClick={() => void transition('close')}>Close order</button> : null}
          {openOrder.status === 'received' && approve ? <button type="button" disabled={blocked} onClick={() => void transition('close')}>Close order</button> : null}
        </div>
        {(openOrder.status === 'approved' || openOrder.status === 'partial') && manageOrder /* receive tier */ ? <form onSubmit={receive}><fieldset disabled={blocked}><legend>Receive goods</legend><p>Damaged goods do not enter stock or the payable.</p>
          <label htmlFor="receipt-reference">Delivery challan / note reference</label><input id="receipt-reference" maxLength={120} value={receiptReference} onChange={e => setReceiptReference(e.target.value)}/>
          {openOrder.lines.map(line => <div key={line.lineIndex} className="order-line"><span>{line.name} — received so far {quantity(line.receivedMilli)} of {quantity(line.quantityMilli)} {line.unit}</span>
            <label htmlFor={`receive-qty-${line.lineIndex}`}>Good quantity received</label><input id={`receive-qty-${line.lineIndex}`} inputMode="decimal" maxLength={12} value={lineQuantities[line.lineIndex] ?? ''} onChange={e => setLineQuantities(v => ({ ...v, [line.lineIndex]: e.target.value }))}/>
            <label htmlFor={`receive-damaged-${line.lineIndex}`}>Damaged within that quantity</label><input id={`receive-damaged-${line.lineIndex}`} inputMode="decimal" maxLength={12} value={lineDamaged[line.lineIndex] ?? ''} onChange={e => setLineDamaged(v => ({ ...v, [line.lineIndex]: e.target.value }))}/>
          </div>)}
          <label htmlFor="receipt-note">Receipt note</label><input id="receipt-note" maxLength={800} value={receiptNote} onChange={e => setReceiptNote(e.target.value)}/>
          <button type="submit">Receive goods</button>
        </fieldset></form> : null}
        {pay ? <><form onSubmit={postInvoice}><fieldset disabled={blocked || receipts.length === 0}><legend>Record supplier invoice</legend><p>The latest goods receipt ({receipts[0]?.id ?? 'none'}) anchors the invoice; any difference is booked as a variance on the same payable.</p>
          <label htmlFor="invoice-reference">Invoice reference</label><input id="invoice-reference" maxLength={80} required value={invoiceReference} onChange={e => setInvoiceReference(e.target.value)}/>
          <label htmlFor="invoice-total">Invoice total (₹)</label><input id="invoice-total" inputMode="decimal" maxLength={24} required value={invoiceTotal} onChange={e => setInvoiceTotal(e.target.value)}/>
          <label htmlFor="invoice-due">Due date</label><input id="invoice-due" type="date" value={invoiceDue} onChange={e => setInvoiceDue(e.target.value)}/>
          <button type="submit">Record invoice</button>
        </fieldset></form>
        <form onSubmit={postPayment}><fieldset disabled={blocked}><legend>Record payment</legend>
          <label htmlFor="payment-method">Method</label><select id="payment-method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="upi">UPI</option></select>
          <label htmlFor="payment-amount">Amount (₹)</label><input id="payment-amount" inputMode="decimal" maxLength={24} required value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}/>
          <label htmlFor="payment-reference">Payment reference</label><input id="payment-reference" maxLength={120} required value={paymentReference} onChange={e => setPaymentReference(e.target.value)}/>
          <label htmlFor="payment-invoice">Allocate to invoice ID (blank = advance)</label><input id="payment-invoice" maxLength={80} value={paymentInvoice} onChange={e => setPaymentInvoice(e.target.value)}/>
          <button type="submit">Record payment</button>
        </fieldset></form></> : null}
        {canReturn && receipts.length > 0 ? <form onSubmit={postReturn}><fieldset disabled={blocked}><legend>Return goods to the supplier</legend>
          <label htmlFor="return-receipt">Goods receipt</label><select id="return-receipt" value={returnReceipt} onChange={e => { setReturnReceipt(e.target.value); setReturnQuantities({}); }}><option value="">Choose a receipt</option>{receipts.map(r => <option key={r.id} value={r.id}>{r.id} · {r.createdAt.slice(0, 10)} · {money(r.goodsTotalPaise)}</option>)}</select>
          {returnReceipt ? receipts.find(r => r.id === returnReceipt)?.lines.map(line => <div key={line.lineIndex} className="order-line"><span>{line.productId} — received {quantity(line.quantityMilli)}, damaged {quantity(line.damagedMilli)}</span><label htmlFor={`return-qty-${line.lineIndex}`}>Quantity to return</label><input id={`return-qty-${line.lineIndex}`} inputMode="decimal" maxLength={12} value={returnQuantities[line.lineIndex] ?? ''} onChange={e => setReturnQuantities(v => ({ ...v, [line.lineIndex]: e.target.value }))}/></div>) : null}
          <label htmlFor="return-disposition">How the supplier settles</label><select id="return-disposition" value={returnDisposition} onChange={e => setReturnDisposition(e.target.value)}><option value="supplier_credit">Reduce the payable (supplier credit)</option><option value="refund">Refund the money back</option></select>
          {returnDisposition === 'refund' ? <label htmlFor="return-method">Refund method</label> : null}{returnDisposition === 'refund' ? <select id="return-method" value={returnMethod} onChange={e => setReturnMethod(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="upi">UPI</option></select> : null}
          <label htmlFor="return-reason">Reason for the return</label><input id="return-reason" maxLength={500} required value={returnReason} onChange={e => setReturnReason(e.target.value)}/>
          <button type="submit">Record return</button>
        </fieldset></form> : null}
      </section> : null}
      {returns.length > 0 ? <><h4>Purchase returns</h4><ul aria-label="Purchase returns">{returns.map(r => <li key={r.id}><span>{r.createdAt.slice(0, 10)} · {r.disposition === 'refund' ? 'Refund' : 'Supplier credit'} · {money(r.totalPaise)} · {r.reason}</span></li>)}</ul></> : null}
      {correct ? <><form onSubmit={postOpening}><fieldset disabled={blocked}><legend>Set opening balance (owner only)</legend><p>For liabilities you already owed before the app was used. Positive means you owe the supplier.</p>
        <label htmlFor="opening-amount">Opening amount (₹)</label><input id="opening-amount" inputMode="decimal" maxLength={24} required value={openingAmount} onChange={e => setOpeningAmount(e.target.value)}/>
        <label htmlFor="opening-due">Due date</label><input id="opening-due" type="date" value={openingDue} onChange={e => setOpeningDue(e.target.value)}/>
        <label htmlFor="opening-reason">Reason</label><input id="opening-reason" maxLength={500} required value={openingReason} onChange={e => setOpeningReason(e.target.value)}/>
        <button type="submit">Record opening balance</button>
      </fieldset></form>
      <form onSubmit={postReversal}><fieldset disabled={blocked}><legend>Reverse a payable entry (owner only)</legend><p>History is never rewritten; a reversal entry is posted against the original entry ID.</p>
        <label htmlFor="reversal-target">Entry ID to reverse</label><input id="reversal-target" maxLength={80} required value={reversalTarget} onChange={e => setReversalTarget(e.target.value)}/>
        <label htmlFor="reversal-reason">Reason</label><input id="reversal-reason" maxLength={500} required value={reversalReason} onChange={e => setReversalReason(e.target.value)}/>
        <button type="submit">Reverse entry</button>
      </fieldset></form></> : null}
    </section> : null}
  </section>;
}
