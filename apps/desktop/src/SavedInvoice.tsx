import { useEffect, useRef, useState } from 'react';
import { money, quantity } from './billing-types';
import { clearPrintReceipt, printReceipt } from './receipt-print';
import type { ReceiptLayout } from './receipt-print';
import type { Invoice } from './billing-types';

export function SavedInvoice({ invoice, businessName }: { invoice: Invoice; businessName: string }) {
  const paper = useRef<HTMLElement>(null);
  const printing = useRef(false);
  const [layout, setLayout] = useState<ReceiptLayout>('80mm');
  const [notice, setNotice] = useState('Printing does not change the saved sale.');
  async function print() {
    if (!paper.current || printing.current) return;
    printing.current = true;
    try { await printReceipt(paper.current, layout); setNotice('Check the printer or PDF output. If printing failed or was cancelled, print this same receipt again.'); }
    catch { setNotice('Printing could not open. The sale is still saved. Check your printer and retry this receipt.'); }
    finally { printing.current = false; }
  }
  useEffect(() => () => clearPrintReceipt(), []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [invoice.id]);
  return <section onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); if (!event.repeat) void print(); } }} className="saved-invoice" aria-labelledby="saved-invoice-heading">
    <div className="receipt-controls"><label>Paper layout <select aria-label="Paper layout" value={layout} onChange={event => setLayout(event.target.value as ReceiptLayout)}><option value="a4">A4</option><option value="58mm">58 mm</option><option value="80mm">80 mm</option></select></label><button type="button" onClick={() => void print()}>Print saved receipt</button><p role="status">{notice}</p><p>Choose matching paper in the Windows printer dialog. Actual margins and roll length depend on the driver.</p></div>
    <article ref={paper} className="receipt-paper">
    <p data-i18n-ignore="true"><strong>{businessName}</strong></p><p>Current shop label; not stored with this historic invoice.</p>
    <h3 id="saved-invoice-heading" ref={heading} tabIndex={-1}>Sale saved on this PC</h3>
    <label htmlFor="saved-invoice-id">Saved invoice ID</label>
    <input id="saved-invoice-id" readOnly value={invoice.id}/>
    <p><time data-i18n-ignore="true" dateTime={invoice.createdAt}>{new Date(invoice.createdAt).toLocaleString()}</time></p>
    <p>{invoice.tender === 'cash' ? 'Cash received' : `Credit · Customer reference: ${invoice.customerId}`}</p>
    <ul aria-label="Saved invoice items">{invoice.lines.map((line, index) => <li key={`${line.productId}-${index}`}>
      <span data-i18n-ignore="true">{line.name} · {quantity(line.quantityMilli)} {line.unit} × {money(line.unitPricePaise)}</span><strong>{money(line.totalPaise)}</strong>
    </li>)}</ul>
    <p>Discounts: not recorded in this invoice.</p>
    <p>Subtotal: {money(invoice.subtotalPaise)} · Tax: {money(invoice.taxPaise)}</p>
    <p className="checkout-total">Saved total: {money(invoice.totalPaise)}</p>
    <p>Local sales receipt. GST tax-invoice compliance is not claimed.</p>
    </article>
  </section>;
}
