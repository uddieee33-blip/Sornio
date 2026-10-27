import { useEffect, useState } from 'react';
import { invoke } from './native';
import type { Customer } from './customer-types';
import { money } from './billing-types';
import { errorMessage } from './access';
export function CustomerLookup({ disabled, refreshToken, onSelect }: { disabled: boolean; refreshToken: number; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState(''), [customers, setCustomers] = useState<Customer[]>([]), [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => { void invoke<Customer[]>('find_local_customers', { search, overdueOnly: false }).then(rows => { if (current) { setCustomers(rows); setMessage(''); } }).catch(error => { if (current) setMessage(errorMessage(error, 'Customers could not be loaded.')); }); }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [search, refreshToken]);
  return <div><label htmlFor="credit-customer-search">Find credit customer</label><input id="credit-customer-search" type="search" disabled={disabled} placeholder="Name, phone or customer ID" value={search} onChange={e => setSearch(e.target.value)}/>
    {message ? <p role="alert">{message}</p> : null}
    <ul aria-label="Matching credit customers">{customers.slice(0, 100).map(c => <li key={c.id}><span>{c.name} · {c.id} · Outstanding {money(c.balancePaise)}{c.creditLimitPaise === null ? ' · No credit limit' : ` · Available ${money(c.availableCreditPaise ?? '0')}`}</span><button type="button" disabled={disabled} aria-label={`Use customer ${c.id}`} onClick={() => onSelect(c.id)}>Select</button></li>)}</ul>
    {customers.length > 100 ? <p>More matches available. Refine your search.</p> : null}
  </div>;
}
