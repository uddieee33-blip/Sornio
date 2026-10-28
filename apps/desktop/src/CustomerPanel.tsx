import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from './native';
import type { Role } from './native';
import { errorCode, errorMessage } from './access';
import { money } from './billing-types';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import type { Customer, CreditKind, CreditReceipt, CreditRequest, PendingCredit, Statement } from './customer-types';
const emptyProfile = { id: '', name: '', phone: '', limit: '', days: '30' };
const refusedCodes = new Set(['day_closed', 'invalid_credit', 'credit_conflict', 'overpayment', 'customer_missing', 'operation_conflict', 'credit_limit', 'forbidden']);
export function CustomerPanel({ role, disabled, refreshToken, onChanged, onBusyChange, onDirtyChange }: { role: Role; disabled: boolean; refreshToken: number; onChanged: () => void; onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void }) {
  const manage = role !== 'cashier', policy = role === 'owner' || role === 'manager', correct = role === 'owner';
  const [customers, setCustomers] = useState<Customer[]>([]), [search, setSearch] = useState(''), [overdue, setOverdue] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null), [statement, setStatement] = useState<Statement | null>(null), [html, setHtml] = useState('');
  const [form, setForm] = useState(emptyProfile), [editing, setEditing] = useState<number | null>(null);
  const [kind, setKind] = useState<CreditKind>('repayment'), [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [due, setDue] = useState(''), [reverse, setReverse] = useState('');
  const [invoice, setInvoice] = useState(''), [source, setSource] = useState(''), [linkReason, setLinkReason] = useState('');
  const [pending, setPending] = useState<PendingCredit | null>(null), [receipt, setReceipt] = useState<CreditReceipt | null>(null), [review, setReview] = useState(false), [refused, setRefused] = useState(false);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<PendingCredit | null>(null);
  const printSnapshot = useRef<{ customerId: string; through: number; revision: number } | null>(null);
  const deferredRead = useRef(false), [reloadTick, setReloadTick] = useState(0);
  const profileOperation = useRef<{ fingerprint: string; request: Record<string, unknown> } | null>(null);
  const linkOperation = useRef<{ fingerprint: string; request: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [message, setMessage] = useState('Opening customer accounts…');
  const mounted = useRef(false), submitting = useRef(false), readVersion = useRef(0), selection = useRef<string | null>(null);
  useEffect(() => { onDirtyChange(JSON.stringify(form) !== JSON.stringify(emptyProfile) || editing !== null || invoice !== '' || source !== '' || linkReason !== '' || pending === null && (review || amount !== '' || reason !== '' || due !== '' || reverse !== '')); }, [form, editing, invoice, source, linkReason, pending, review, amount, reason, due, reverse, onDirtyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const applyPending = useCallback((value: PendingCredit | null) => {
    if (!value && pendingRef.current) { setAmount(''); setReason(''); setDue(''); setReverse(''); setKind('repayment'); }
    pendingRef.current = value; setPending(value); setReceipt(value?.receipt ?? null); setReview(false); setRefused(false);
    if (value) { selection.current = value.request.customerId; setKind(value.request.kind); setAmount(String(value.request.amountPaise / 100)); setReason(value.request.reason); setDue(value.request.dueOn ?? ''); setReverse(value.request.reverseOf ?? ''); }
  }, []);
  const load = useCallback(async () => {
    const generation = ++readVersion.current;
    const rows = await invoke<Customer[]>('find_local_customers', { search, overdueOnly: overdue });
    if (!mounted.current || generation !== readVersion.current) return;
    setCustomers(rows);
    const active = await invoke<PendingCredit | null>('pending_local_credit');
    if (!mounted.current || generation !== readVersion.current) return;
    if (JSON.stringify(active) !== JSON.stringify(pendingRef.current)) applyPending(active);
    const id = active?.request.customerId ?? selection.current;
    if (id) {
      const result = await invoke<Statement>('read_customer_statement', { customerId: id, after: 0, through: null });
      if (!mounted.current || generation !== readVersion.current) return;
      if (printSnapshot.current && (printSnapshot.current.customerId !== id || printSnapshot.current.through !== result.through || printSnapshot.current.revision !== result.customer.revision)) { printSnapshot.current = null; setHtml(''); }
      selection.current = id; setSelected(result.customer); setStatement(result);
    }
    setReady(true); setFailed(false); setMessage(active?.receipt ? 'Recovered the saved credit receipt.' : active ? 'This entry is awaiting confirmation. Retry the same entry to resolve it.' : 'Customer accounts are up to date.');
  }, [search, overdue, applyPending]);
  useEffect(() => { const timer = setTimeout(() => { if (submitting.current) { deferredRead.current = true; return; } void load().catch(error => { if (mounted.current) { setReady(false); setFailed(true); setMessage(errorMessage(error, 'Customer accounts could not be opened.')); } }); }, 150); return () => { clearTimeout(timer); readVersion.current += 1; }; }, [load, refreshToken, reloadTick]);
  async function run(operation: () => Promise<void>) {
    if (submitting.current || disabled) return;
    readVersion.current += 1; submitting.current = true; setBusy(true); onBusyChange(true); setFailed(false);
    try { await operation(); }
    catch (error: unknown) { if (mounted.current) { setReady(false); setFailed(true); setMessage(errorMessage(error, 'The result is uncertain. Refresh before starting another entry.')); } }
    finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); if (deferredRead.current) { deferredRead.current = false; setReloadTick(value => value + 1); } } }
  }
  async function choose(id: string) {
    if (pending || busy || disabled) return;
    selection.current = id;
    await run(async () => { const result = await invoke<Statement>('read_customer_statement', { customerId: id, after: 0, through: null }); if (mounted.current) { setSelected(result.customer); setStatement(result); printSnapshot.current = null; setHtml(''); setReview(false); setAmount(''); } });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const limit = form.limit === '' ? null : parseFixedDecimal(form.limit, 2);
    if (limit === null && form.limit !== '' || !/^\d+$/.test(form.days)) { setFailed(true); setMessage('Enter a valid credit limit and number of days.'); return; }
    void run(async () => {
      const input = { id: form.id, name: form.name, phone: form.phone || null, creditLimitPaise: !policy && editing === null ? 0 : limit, creditDays: Number(form.days), expectedRevision: editing };
      const fingerprint = JSON.stringify(input);
      if (profileOperation.current?.fingerprint !== fingerprint) profileOperation.current = { fingerprint, request: { ...input, operationId: crypto.randomUUID() } };
      const saved = await invoke<Customer>('save_local_customer', { r: profileOperation.current.request });
      profileOperation.current = null;
      if (!mounted.current) return;
      printSnapshot.current = null; setHtml(''); selection.current = saved.id; setSelected(saved); setForm(emptyProfile); setEditing(null); onChanged(); await load(); setMessage('Customer saved.');
    });
  }
  async function confirm(request: CreditRequest) {
    if (submitting.current || disabled) return;
    pendingRef.current = { request, receipt: null }; setPending({ request, receipt: null }); setReceipt(null); setReview(false); setRefused(false);
    await run(async () => {
      let prepared = false;
      try {
        await invoke('prepare_local_credit', { r: request }); prepared = true;
        const saved = await invoke<CreditReceipt>('post_local_credit', { r: request });
        if (!mounted.current) return;
        printSnapshot.current = null; setHtml(''); setReceipt(saved); pendingRef.current = { request, receipt: saved }; setPending({ request, receipt: saved }); setMessage('Credit entry saved.'); onChanged();
        try { await load(); } catch { setReady(false); setMessage('Credit entry was saved. Refresh customer accounts before the next entry.'); }
      } catch (error: unknown) {
        if (!prepared && refusedCodes.has(errorCode(error) ?? '')) { try { applyPending(await invoke<PendingCredit | null>('pending_local_credit')); } catch { /* Retain the exact uncertain request. */ } }
        if (mounted.current) { setRefused(refusedCodes.has(errorCode(error) ?? '')); setReady(false); setFailed(true); setMessage(errorMessage(error, 'The result is uncertain. Retry this same entry; do not enter it again.')); }
      }
    });
  }
  function buildRequest(): CreditRequest | null {
    if (!selected) return null;
    const value = kind === 'reversal' ? 0 : parseFixedDecimal(amount, 2);
    if (value === null || value < 0 || kind !== 'reversal' && value === 0) { setFailed(true); setMessage('Enter a positive amount with up to 2 decimals.'); return null; }
    return { operationId: crypto.randomUUID(), customerId: selected.id, expectedRevision: selected.revision, kind, amountPaise: value, reason, dueOn: kind === 'opening_due' ? due : null, reverseOf: kind === 'reversal' ? reverse : null };
  }
  async function clear(saved: boolean) {
    if (!pending) return;
    await run(async () => { await invoke('clear_local_credit', { operationId: pending.request.operationId, saved }); if (!mounted.current) return; applyPending(null); setAmount(''); await load(); });
  }
  async function more() {
    if (!statement || !selected) return;
    await run(async () => { const page = await invoke<Statement>('read_customer_statement', { customerId: selected.id, after: statement.nextAfter, through: statement.through }); if (mounted.current) setStatement({ ...page, openingBalancePaise: statement.openingBalancePaise, entries: [...statement.entries, ...page.entries] }); });
  }
  async function preview() {
    if (!selected || !statement) return;
    await run(async () => { const rendered = await invoke<string>('render_customer_statement', { customerId: selected.id, through: statement.through }); if (mounted.current) { printSnapshot.current = { customerId: selected.id, through: statement.through, revision: selected.revision }; setHtml(rendered); setMessage('Full statement is ready to print, including all history in this snapshot.'); } });
  }
  async function link() {
    if (!selected) return;
    await run(async () => {
      const fingerprint = JSON.stringify({ source, invoice, target: selected.id, reason: linkReason });
      if (linkOperation.current?.fingerprint !== fingerprint) {
        const matches = await invoke<Customer[]>('find_local_customers', { search: source, overdueOnly: false }); const from = matches.find(c => c.id === source);
        if (!from) throw new Error('Choose the existing source customer ID.');
        linkOperation.current = { fingerprint, request: { operationId: crypto.randomUUID(), invoiceId: invoice, customerId: selected.id, sourceRevision: from.revision, targetRevision: selected.revision, reason: linkReason } };
      }
      await invoke('link_local_credit', { r: linkOperation.current.request });
      linkOperation.current = null;
      if (!mounted.current) return;
      printSnapshot.current = null; setHtml(''); setInvoice(''); setSource(''); setLinkReason(''); onChanged(); await load(); setMessage('Existing credit sale linked. Original invoice and transfer history were retained.');
    });
  }
  const blocked = disabled || busy || !ready || pending !== null;
  return <section className="panel customer-panel" aria-labelledby="customers-heading" aria-busy={busy}>
    <h2 id="customers-heading">Customers & credit</h2><p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    <button type="button" disabled={busy || disabled} onClick={() => void run(load)}>Refresh customer accounts</button>
    {pending ? <div><p>Confirmation ID: {pending.request.operationId}</p>{receipt ? <><h3 tabIndex={-1}>Credit entry saved</h3><label htmlFor="credit-receipt-id">Saved credit entry ID</label><input id="credit-receipt-id" readOnly value={receipt.operationId}/><p>Amount: {money(receipt.amountPaise)} · Outstanding after entry: {money(receipt.balancePaise)}</p><button type="button" disabled={busy || disabled} onClick={() => void clear(true)}>Start next credit entry</button></> : <><button type="button" disabled={busy || disabled} onClick={() => void confirm(pending.request)}>Retry same credit entry</button>{refused ? <button type="button" disabled={busy || disabled} onClick={() => void clear(false)}>Edit refused credit entry</button> : null}</>}</div> : null}
    <fieldset disabled={blocked}><label htmlFor="customer-search">Search customer accounts</label><input id="customer-search" type="search" value={search} onChange={e => setSearch(e.target.value)}/>{policy ? <label><input type="checkbox" checked={overdue} onChange={e => setOverdue(e.target.checked)}/>Show overdue accounts</label> : null}
      <ul aria-label="Customer accounts">{customers.slice(0, 100).map(c => <li key={c.id}><span>{c.name} · {c.id} · {c.phone ?? 'No phone'} · Outstanding {money(c.balancePaise)} · Overdue {money(c.overduePaise)}</span><button type="button" aria-label={`Open customer ${c.id}`} onClick={() => void choose(c.id)}>Open</button></li>)}</ul>{customers.length > 100 ? <p>More than 100 matches. Refine your search.</p> : null}
    </fieldset>
    {manage ? <form onSubmit={save}><fieldset disabled={blocked}><legend>{editing === null ? 'Create customer' : 'Edit customer'}</legend>
      <label htmlFor="customer-id">Customer ID</label><input id="customer-id" required maxLength={80} pattern="[A-Za-z0-9_\-]+" readOnly={editing !== null} value={form.id} onChange={e => setForm({ ...form, id: e.target.value })}/>
      <label htmlFor="customer-name">Customer name</label><input id="customer-name" required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/>
      <label htmlFor="customer-phone">Customer phone (optional)</label><input id="customer-phone" type="tel" maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/>
      <label htmlFor="customer-limit">Credit limit (₹, blank for no limit)</label><input id="customer-limit" inputMode="decimal" disabled={!policy} maxLength={24} value={!policy && editing === null ? '0' : form.limit} onChange={e => setForm({ ...form, limit: e.target.value })}/>
      <label htmlFor="customer-days">Credit days</label><input id="customer-days" inputMode="numeric" disabled={!policy} maxLength={4} value={form.days} onChange={e => setForm({ ...form, days: e.target.value })}/>
      <button type="submit">Save customer</button>{editing !== null ? <button type="button" onClick={() => { setForm(emptyProfile); setEditing(null); }}>Cancel customer edit</button> : null}
    </fieldset></form> : null}
    {selected ? <section aria-labelledby="selected-customer-heading"><h3 id="selected-customer-heading">{selected.name} · {selected.id}</h3><p>Outstanding: {money(selected.balancePaise)} · Overdue: {money(selected.overduePaise)} · {selected.creditLimitPaise === null ? 'No credit limit' : `Limit: ${money(selected.creditLimitPaise)}`}</p>
      {manage ? <button type="button" disabled={blocked} onClick={() => { setForm({ id: selected.id, name: selected.name, phone: selected.phone ?? '', limit: selected.creditLimitPaise === null ? '' : String(selected.creditLimitPaise / 100), days: String(selected.creditDays) }); setEditing(selected.revision); }}>Edit customer profile</button> : null}
      <fieldset disabled={blocked || review}><legend>Record customer credit entry</legend><label htmlFor="credit-kind">Credit entry type</label><select id="credit-kind" value={kind} onChange={e => setKind(e.target.value as CreditKind)}><option value="repayment">Cash repayment</option>{correct ? <><option value="opening_due">Opening due correction</option><option value="write_off">Write off due</option><option value="reversal">Reverse a credit entry</option></> : null}</select>
        {kind !== 'reversal' ? <><label htmlFor="credit-amount">Credit entry amount (₹)</label><input id="credit-amount" inputMode="decimal" maxLength={24} value={amount} onChange={e => setAmount(e.target.value)}/></> : <><label htmlFor="credit-reverse">Credit entry ID to reverse</label><input id="credit-reverse" maxLength={80} value={reverse} onChange={e => setReverse(e.target.value)}/></>}
        {kind === 'opening_due' ? <><label htmlFor="credit-due">Opening due date</label><input id="credit-due" type="date" value={due} onChange={e => setDue(e.target.value)}/></> : null}
        <label htmlFor="credit-reason">Credit entry reason</label><input id="credit-reason" maxLength={200} value={reason} onChange={e => setReason(e.target.value)}/>
      </fieldset>
      {!pending ? review ? <div role="group" aria-label="Review credit entry"><p>{kind === 'repayment' ? `Receive ₹${amount} in cash from ${selected.name}, then confirm.` : 'This correction changes the credit ledger and retains its history. Confirm only after checking the account and reason.'}</p><button type="button" disabled={busy || disabled} onClick={() => { const r = buildRequest(); if (r) void confirm(r); }}>Confirm credit entry</button><button type="button" disabled={busy || disabled} onClick={() => setReview(false)}>Cancel credit review</button></div> : <button type="button" disabled={blocked} onClick={() => { if (buildRequest()) setReview(true); }}>Review credit entry</button> : null}
      {statement ? <><h4>Customer transaction history</h4><p>Statement snapshot {statement.through} · Closing balance {money(statement.closingBalancePaise)}</p><table><thead><tr><th>Date</th><th>Type / reference</th><th>Change</th><th>Balance</th></tr></thead><tbody>{statement.entries.map(e => <tr key={e.sequence}><td>{new Date(e.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td>{e.kind} · {e.operationId}<br/>{e.invoiceId ? `Invoice ${e.invoiceId}` : null}{e.reverseOf ? `Reverses ${e.reverseOf}` : null}<br/>{e.reason}</td><td>{money(e.amountPaise)}</td><td>{money(e.runningBalancePaise)}</td></tr>)}</tbody></table>{statement.hasMore ? <button type="button" disabled={busy || disabled} onClick={() => void more()}>Load more customer history</button> : null}<button type="button" disabled={busy || disabled} onClick={() => void preview()}>Prepare full customer statement</button></> : null}
      {correct ? <fieldset disabled={blocked}><legend>Link an existing unpaid credit sale</legend><label htmlFor="credit-link-invoice">Existing credit invoice ID</label><input id="credit-link-invoice" maxLength={80} value={invoice} onChange={e => setInvoice(e.target.value)}/><label htmlFor="credit-link-source">Existing source customer ID</label><input id="credit-link-source" maxLength={80} value={source} onChange={e => setSource(e.target.value)}/><label htmlFor="credit-link-reason">Credit link reason</label><input id="credit-link-reason" maxLength={200} value={linkReason} onChange={e => setLinkReason(e.target.value)}/><p>Moves an unrepaid sale to this account and retains the original invoice. Accounts with collections or adjustments need an explicit correction.</p><button type="button" onClick={() => void link()}>Link existing credit sale</button></fieldset> : null}
    </section> : null}
    {html ? <><button type="button" disabled={busy || disabled} onClick={() => window.print()}>Print customer statement</button><section className="customer-statement-print" aria-label="Printable customer statement" dangerouslySetInnerHTML={{ __html: html }}/></> : null}
  </section>;
}
