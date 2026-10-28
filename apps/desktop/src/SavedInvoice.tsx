import { useEffect, useRef } from 'react';
import { money, quantity } from './billing-types';
import type { Invoice } from './billing-types';

export function SavedInvoice({ invoice, hubConfirmed = false }: { invoice: Invoice; hubConfirmed?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [invoice.id]);
  return <section className="saved-invoice" aria-labelledby="saved-invoice-heading">
    <h3 id="saved-invoice-heading" ref={heading} tabIndex={-1}>{hubConfirmed ? 'Sale confirmed by shop hub' : 'Sale saved on this PC'}</h3>
    <label htmlFor="saved-invoice-id">Saved invoice ID</label>
    <input id="saved-invoice-id" readOnly value={invoice.id}/>
    <p><time dateTime={invoice.createdAt}>{new Date(invoice.createdAt).toLocaleString()}</time></p>
    <p>{invoice.tender === 'cash' ? 'Cash received' : `Credit · Customer reference: ${invoice.customerId}`}</p>
    <ul aria-label="Saved invoice items">{invoice.lines.map((line, index) => <li key={`${line.productId}-${index}`}>
      <span>{line.name} · {quantity(line.quantityMilli)} {line.unit} × {money(line.unitPricePaise)}</span><strong>{money(line.totalPaise)}</strong>
    </li>)}</ul>
    <p>Subtotal: {money(invoice.subtotalPaise)} · Tax: {money(invoice.taxPaise)}</p>
    <p className="checkout-total">Saved total: {money(invoice.totalPaise)}</p>
  </section>;
}
