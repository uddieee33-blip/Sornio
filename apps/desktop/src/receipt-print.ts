/** Adapted from #128. Receipts and statements share one authenticated print job. */
export type ReceiptLayout = 'a4' | '58mm' | '80mm';
type PrintJob = { source: HTMLElement; root: HTMLElement; style: HTMLStyleElement; events: AbortController };
let active: PrintJob | null = null;
function finish(job: PrintJob) {
  job.events.abort(); job.root.remove(); job.style.remove();
  if (active === job) active = null;
}
export function clearPrintReceipt(source?: HTMLElement | null) {
  if (active && (!source || active.source === source)) finish(active);
}
export function printReceipt(receipt: HTMLElement, layout: ReceiptLayout, authorize: () => Promise<void>): Promise<void> {
  return printDocument(receipt, layout, 'receipt', authorize);
}
export function printCustomerStatement(statement: HTMLElement, authorize: () => Promise<void>): Promise<void> {
  return printDocument(statement, 'a4', 'statement', authorize);
}
async function printDocument(receipt: HTMLElement, layout: ReceiptLayout, kind: 'receipt' | 'statement', authorize: () => Promise<void>): Promise<void> {
  if (!['a4', '58mm', '80mm'].includes(layout)) throw new Error('Unsupported paper layout');
  clearPrintReceipt();
  const root = document.createElement('div'), style = document.createElement('style');
  const job: PrintJob = { source: receipt, root, style, events: new AbortController() };
  active = job;
  const current = () => active === job && !job.events.signal.aborted && receipt.isConnected;
  window.addEventListener('sornio-session-locked', () => finish(job), { signal: job.events.signal, once: true });
  try {
    await authorize();
    if (!current()) throw new Error('Print document is no longer open');
    root.dataset.sornioPrintRoot = 'true'; root.lang = receipt.lang || 'en-IN';
    root.dataset.sornioPrintKind = kind;
    root.append(receipt.cloneNode(true));
    root.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    root.querySelectorAll('label').forEach(element => element.removeAttribute('for'));
    root.querySelectorAll('input').forEach(input => {
      const text = document.createElement('span'); text.className = 'receipt-reference';
      text.textContent = input.value; input.replaceWith(text);
    });
    style.dataset.sornioPrintStyle = 'true';
    const width = layout === 'a4' ? '100%' : layout === '58mm' ? '52mm' : '74mm';
    const fontSize = layout === '58mm' ? '11px' : '12px';
    style.textContent = `@media screen{[data-sornio-print-root]{display:none}}@media print{@page{size:${layout === 'a4' ? 'A4' : 'auto'};margin:${layout === 'a4' ? '12mm' : '3mm'}}body>:not([data-sornio-print-root]){display:none!important}[data-sornio-print-root]{display:block!important;color:#000;background:#fff;font:${fontSize}/1.45 "Sornio Gurmukhi","Nirmala UI","Raavi","Segoe UI",sans-serif}[data-sornio-print-root] article{width:${width};max-width:100%;overflow-wrap:anywhere}[data-sornio-print-root] h3{font-size:${layout === '58mm' ? '14px' : '16px'};margin:0 0 6px}[data-sornio-print-root] ul{padding:0;margin:6px 0;list-style:none}[data-sornio-print-root] li{display:flex;justify-content:space-between;align-items:baseline;gap:8px;border-bottom:1px dotted #888;padding:6px 0;break-inside:avoid}[data-sornio-print-root] li>span{min-width:0;overflow-wrap:anywhere}[data-sornio-print-root] li>strong{white-space:nowrap;flex-shrink:0}[data-sornio-print-root] strong{display:block}[data-sornio-print-root] p{margin:6px 0}[data-sornio-print-kind=statement]{font-size:11pt}[data-sornio-print-kind=statement] .customer-statement-print{margin:0}[data-sornio-print-kind=statement] table{width:100%;border-collapse:collapse;table-layout:fixed}[data-sornio-print-kind=statement] th,[data-sornio-print-kind=statement] td{padding:5pt;border-bottom:1pt solid #ccc;text-align:left;overflow-wrap:anywhere;vertical-align:top}[data-sornio-print-kind=statement] th:nth-child(2){width:36%}[data-sornio-print-kind=statement] thead{display:table-header-group}[data-sornio-print-kind=statement] tr{break-inside:avoid}}`;
    document.head.append(style); document.body.append(root);
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (!current()) throw new Error('Print document is no longer open');
    // A staff revocation, session expiry or restore during font loading must be
    // checked by native authority again before opening the print dialog.
    await authorize();
    if (!current()) throw new Error('Print document is no longer open');
    window.addEventListener('afterprint', () => finish(job), { signal: job.events.signal, once: true });
    window.print(); // Returning/cancelling does not prove that paper was produced.
  } catch (error) { finish(job); throw error; }
}
