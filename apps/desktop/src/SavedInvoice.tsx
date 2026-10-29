import { useEffect, useRef } from 'react';
import { money, quantity } from './billing-types';
import type { Invoice } from './billing-types';

export function SavedInvoice({ invoice }: { invoice: Invoice }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [invoice.id]);
  return <section className="saved-invoice" aria-labelledby="saved-invoice-heading">
    <h3 id="saved-invoice-heading" ref={heading} tabIndex={-1}>Sale saved on this PC</h3>
    {invoice.businessName ? <p>{invoice.businessName}</p> : null}
    <p>Sale number: {invoice.invoiceNumber ?? 'Legacy record — use saved invoice ID'}</p>
    <label htmlFor="saved-invoice-id">Saved invoice ID</label>
    <input id="saved-invoice-id" readOnly value={invoice.id}/>
    <p><time dateTime={invoice.createdAt}>{new Date(invoice.createdAt).toLocaleString()}</time></p>
    <p>{invoice.tender === 'cash' ? 'Cash received' : invoice.tender === 'retail' ? 'Retail payment recorded. UPI/card amounts remain unverified; review Payments & closing for pending status.' : `Credit · Customer reference: ${invoice.customerId}`}</p>
    <ul aria-label="Saved invoice items">{invoice.lines.map((line, index) => <li key={`${line.productId}-${index}`}>
      <span>{line.name} · {quantity(line.quantityMilli)} {line.unit} × {money(line.unitPricePaise)}</span><strong>{money(line.totalPaise)}</strong>
    </li>)}</ul>
    <p>Subtotal: {money(invoice.subtotalPaise)} · Tax: {money(invoice.taxPaise)}</p>
    <p className="checkout-total">Saved total: {money(invoice.totalPaise)}</p>
  </section>;
}
