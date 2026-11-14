import { useEffect, useState } from 'react';
import { invoke } from './native';
import type { Customer } from './customer-types';
import { money } from './billing-types';
import { errorMessage } from './access';
export type ResolvedCreditCustomer = { customer: Customer; refreshToken: string };
export function CustomerLookup({ disabled, refreshToken, selectedId, onSelect, onResolved }: {
  disabled: boolean; refreshToken: string; selectedId: string;
  onSelect: (id: string) => void; onResolved: (customer: ResolvedCreditCustomer | null) => void;
}) {
  const [search, setSearch] = useState(''), [customers, setCustomers] = useState<Customer[]>([]), [message, setMessage] = useState('');
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [resolved, setResolved] = useState<ResolvedCreditCustomer | null>(null);
  const [selectionError, setSelectionError] = useState<{ id: string; token: string; message: string } | null>(null);
  const selected = resolved?.refreshToken === refreshToken && resolved.customer.id === selectedId ? resolved.customer : null;
  useEffect(() => {
    let current = true;
    if (!selectedId) return;
    const timer = setTimeout(() => {
      void invoke<Customer>('read_local_customer', { customerId: selectedId }).then(customer => {
        if (current) { const result = { customer, refreshToken }; setResolved(result); onResolved(result); setSelectionError(null); }
      }).catch(error => {
        if (current) { onResolved(null); setResolved(null); setSelectionError({ id: selectedId, token: refreshToken, message: errorMessage(error, 'Select an existing customer. Credit details could not be loaded.') }); }
      });
    }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [selectedId, refreshToken, onResolved, lookupAttempt]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => { void invoke<Customer[]>('find_local_customers', { search, overdueOnly: false }).then(rows => { if (current) { setCustomers(rows); setMessage(''); } }).catch(error => { if (current) setMessage(errorMessage(error, 'Customers could not be loaded.')); }); }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [search, refreshToken]);
  return <div className="credit-customer-lookup">
    {selectedId ? <div className="selected-credit-customer" aria-label="Selected credit customer" aria-live="polite">
      {selected?.id === selectedId ? <><strong>{selected.name}</strong><p>Outstanding: {money(selected.balancePaise)}</p>
        <p>{selected.creditLimitPaise === null ? 'No credit limit set' : `Available credit: ${money(selected.availableCreditPaise ?? '0')}`}</p>
        <small>Credit is checked again when you confirm the sale.</small></>
        : <><p>{selectionError?.id === selectedId && selectionError.token === refreshToken ? selectionError.message : 'Checking customer credit…'}</p>{selectionError?.id === selectedId && selectionError.token === refreshToken ? <button type="button" className="quiet-button" disabled={disabled} onClick={() => { setSelectionError(null); setLookupAttempt(attempt => attempt + 1); }}>Retry customer details</button> : null}</>}
    </div> : null}
    <label htmlFor="credit-customer-search">Find credit customer</label><input id="credit-customer-search" type="search" disabled={disabled} placeholder="Name, phone or customer ID" value={search} onChange={e => setSearch(e.target.value)}/>
    {message ? <p role="alert">{message}</p> : null}
    <ul aria-label="Matching credit customers">{customers.slice(0, 100).map(c => <li key={c.id}><span>{c.name} · {c.id} · Outstanding {money(c.balancePaise)}{c.creditLimitPaise === null ? ' · No credit limit' : ` · Available ${money(c.availableCreditPaise ?? '0')}`}</span><button type="button" disabled={disabled} aria-label={`Use customer ${c.id}`} aria-pressed={selectedId === c.id} onClick={() => onSelect(c.id)}>{selectedId === c.id ? 'Selected' : 'Select'}</button></li>)}</ul>
    {customers.length > 100 ? <p>More matches available. Refine your search.</p> : null}
  </div>;
}
