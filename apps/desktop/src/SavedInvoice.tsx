import { useEffect, useRef, useState } from 'react';
import { money, quantity } from './billing-types';
import { invoke } from './native';
import { clearPrintReceipt, printReceipt } from './receipt-print';
import type { ReceiptLayout } from './receipt-print';
import type { Invoice } from './billing-types';
import { indianDay } from './retail-types';
import type { RetailView } from './retail-types';
import punjabi from './locales/pa.json';
import { originalCreditDue } from './payment-allocation';
import type { LocalPrinterInfo, WorkstationSettings } from './workstation-types';

export type ReceiptPayment = { id: string; method: string; amountPaise: number; reference: string };

// Canonical display fields; optional historical snapshots remain absent, never
// replaced by today's business name, prices or settlement status.
function snapshot(invoice: Invoice) {
  return JSON.stringify([invoice.id, invoice.invoiceNumber ?? null, invoice.businessId ?? null, invoice.businessName ?? null,
    invoice.createdAt, invoice.tender, invoice.customerId, invoice.taxBasisPoints, invoice.subtotalPaise, invoice.taxPaise, invoice.totalPaise,
    invoice.lines.map(l => [l.productId, l.name, l.unit, l.quantityMilli, l.unitPricePaise, l.totalPaise])]);
}

function paymentSnapshot(payments: readonly ReceiptPayment[]) {
  return JSON.stringify(payments.map(part => [part.id, part.method, part.amountPaise]));
}

export function SavedInvoice({ invoice, payments, username, workstationSettings, printers, isReprint = false }: {
  invoice: Invoice;
  payments?: readonly ReceiptPayment[];
  username?: string;
  workstationSettings?: WorkstationSettings;
  printers?: readonly LocalPrinterInfo[];
  isReprint?: boolean;
}) {
  const creditDue = originalCreditDue(invoice.tender, invoice.totalPaise, invoice.customerId, payments);
  const paper = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), printing = useRef(false);
  const [layout, setLayout] = useState<ReceiptLayout>(workstationSettings?.receiptLayout ?? '80mm');
  const [language, setLanguage] = useState<'en' | 'pa'>(workstationSettings?.receiptLanguage ?? 'en');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printCount, setPrintCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [livePrinters, setLivePrinters] = useState<readonly LocalPrinterInfo[] | null>(null);
  const [notice, setNotice] = useState('Printing does not change the saved sale.');
  const translate = (text: string) => language === 'pa' ? (punjabi as Record<string, string>)[text] ?? text : text;
  const showReprintBadge = isReprint || printCount > 0;
  const activePrinters = livePrinters ?? printers;
  const preferredPrinter = workstationSettings?.printerName?.trim() ?? '';
  const matchedPrinter = preferredPrinter ? activePrinters?.find(p => p.name === preferredPrinter) : undefined;
  const printerMissing = Boolean(preferredPrinter && activePrinters && activePrinters.length > 0 && !matchedPrinter);
  const printerUnavailable = Boolean(
    printerMissing
    || (matchedPrinter && (matchedPrinter.workOffline || matchedPrinter.status === 'offline' || matchedPrinter.status === 'stopped')),
  );
  useEffect(() => {
    heading.current?.focus();
    const source = paper.current;
    return () => clearPrintReceipt(source);
  }, [invoice.id]);
  async function print() {
    const source = paper.current;
    if (!source || printing.current || creditDue === null || (invoice.tender === 'retail' && !username)) return;
    printing.current = true; setBusy(true);
    try {
      await printReceipt(source, layout, async () => {
        const saved = await invoke<Invoice>('read_local_invoice', { invoiceId: invoice.id });
        if (snapshot(saved) !== snapshot(invoice)) throw new Error('Reopen the current saved receipt before printing');
        if (invoice.tender === 'retail' && payments?.length && username) {
          const retail = await invoke<RetailView>('read_local_retail', { day: indianDay(), username, invoiceId: invoice.id });
          if (!retail.payments.every(part => !part.externallyVerified) || paymentSnapshot(retail.payments) !== paymentSnapshot(payments)) {
            throw new Error('Reopen the current saved receipt before printing');
          }
        }
      });
      if (source.isConnected) {
        setPrintCount(count => count + 1);
        setNotice('Check the printer or PDF output. If printing failed or was cancelled, print this same receipt again.');
      }
    } catch {
      if (source.isConnected) setNotice('Printing could not open. Reopen the saved receipt, check access and your printer, then retry.');
    } finally {
      printing.current = false;
      if (source.isConnected) {
        setBusy(false);
        if (preferredPrinter) {
          void invoke<LocalPrinterInfo[]>('list_local_printers')
            .then(list => { if (source.isConnected) setLivePrinters(list); })
            .catch(() => {});
        }
      }
    }
  }
  return <section onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); if (!event.repeat) void print(); }
  }} className="saved-invoice" aria-labelledby="saved-invoice-heading">
    <div className="receipt-controls">
      <label>Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ <select aria-label="Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ" disabled={busy} value={language} onChange={e => { clearPrintReceipt(paper.current); setLanguage(e.target.value as 'en' | 'pa'); }}><option value="en">English</option><option value="pa">ਪੰਜਾਬੀ</option></select></label>
      <label>{translate('Paper layout')} <select aria-label="Paper layout" disabled={busy} value={layout} onChange={e => { clearPrintReceipt(paper.current); setLayout(e.target.value as ReceiptLayout); }}><option value="a4">A4</option><option value="58mm">58 mm</option><option value="80mm">80 mm</option></select></label>
      <button type="button" disabled={busy || creditDue === null || (invoice.tender === 'retail' && !username)} onClick={() => void print()}>
        {busy ? translate('Opening print…') : translate('Print saved receipt')}
      </button>
      <button type="button" className="quiet-button" disabled={busy} onClick={() => setPreviewOpen(open => !open)}>
        {previewOpen ? translate('Hide print preview') : translate('Show print preview')}
      </button>
      {preferredPrinter ? <p className="muted">{translate('Preferred printer:')} <strong>{preferredPrinter}</strong></p> : null}
      {printerUnavailable ? <p className="printer-warning" role="alert">{translate('Selected printer appears offline or stopped in Windows. The sale is already saved — do not re-bill. Check paper/power and use Reprint.')}</p> : null}
      <p role="status">{translate(notice)}</p><p>{translate('Choose matching paper in the Windows printer dialog. Margins and roll length depend on the driver.')}</p>
    </div>
    <article ref={paper} lang={language === 'pa' ? 'pa-IN' : 'en-IN'} className={`receipt-paper${previewOpen ? ` receipt-preview receipt-preview-${layout}` : ''}`}>
      {showReprintBadge ? <p className="reprint-banner"><strong>{translate('REPRINT — Copy of original saved receipt')}</strong></p> : null}
      <h3 id="saved-invoice-heading" ref={heading} tabIndex={-1}>{translate('Sale saved on this PC')}</h3>
      <p><strong>{invoice.businessName ?? translate('Legacy receipt — shop name was not stored')}</strong></p>
      <p>{translate('Sale number:')} {invoice.invoiceNumber ?? translate('Legacy record — use saved invoice ID')}</p>
      <label htmlFor="saved-invoice-id">{translate('Saved invoice ID')}</label><input id="saved-invoice-id" readOnly value={invoice.id}/>
      <p><time dateTime={invoice.createdAt}>{new Date(invoice.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</time></p>
      {invoice.tender === 'cash' ? <p>{translate('Cash received')}: {money(invoice.totalPaise)}</p>
        : invoice.tender === 'credit' ? <p>{translate('Credit · Customer reference:')} {invoice.customerId} · {money(invoice.totalPaise)}</p>
        : <>
          {payments?.length ? <ul className="receipt-payments" aria-label="Saved payment breakdown">{payments.map(part => <li key={part.id}>
            <span>{part.method === 'cash' ? translate('Cash received') : part.method === 'credit' ? translate('Customer credit') : part.method === 'upi' ? translate('UPI (unverified)') : translate('Card (unverified)')}{part.reference && (part.method === 'upi' || part.method === 'card') ? ` (${translate('Reference:')} ${part.reference})` : ''}</span>
            <strong>{money(part.amountPaise)}</strong>
          </li>)}</ul> : null}
          {invoice.customerId ? <p>{translate('Customer reference:')} {invoice.customerId}</p> : null}
          <p>{translate('Retail payment recorded. UPI/card amounts remain unverified; review Payments & closing for pending status.')}</p>
        </>}
      <ul aria-label="Saved invoice items">{invoice.lines.map((line, index) => <li key={`${line.productId}-${index}`}>
        <span>{line.name} · {quantity(line.quantityMilli)} {line.unit} × {money(line.unitPricePaise)}</span><strong>{money(line.totalPaise)}</strong>
      </li>)}</ul>
      <p>{translate('Discounts: not recorded in this invoice.')}</p>
      <p>{translate('Subtotal:')} {money(invoice.subtotalPaise)} {translate('· Tax:')} {money(invoice.taxPaise)} ({invoice.taxBasisPoints / 100}%)</p>
      <p className="checkout-total">{translate('Saved total:')} {money(invoice.totalPaise)}</p>
      {creditDue === null ? <p role="alert">{translate('Payment breakdown unavailable. Reopen this receipt before printing.')}</p> : <p className="receipt-amount-due"><strong>{translate('Amount due at sale:')} {money(creditDue)}</strong></p>}
      <p>{translate('Original sale record. Later collections, returns and refunds appear in the customer and payment records.')}</p>
      <p>{translate('Local sales receipt. GST tax-invoice compliance is not claimed.')}</p>
    </article>
  </section>;
}
