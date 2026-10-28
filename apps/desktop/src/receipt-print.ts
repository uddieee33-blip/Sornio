/** Print a rendered native receipt only. No IPC, frame or posting access. */
export type ReceiptLayout = 'a4' | '58mm' | '80mm';
export function clearPrintReceipt() {
  document.querySelector('[data-sornio-print-root]')?.remove();
  document.querySelector('style[data-sornio-print-style]')?.remove();
}
export async function printReceipt(receipt: HTMLElement, layout: ReceiptLayout): Promise<void> {
  clearPrintReceipt();
  const root = document.createElement('div');
  root.dataset.sornioPrintRoot = 'true';
  root.lang = document.documentElement.lang;
  root.append(receipt.cloneNode(true));
  // Do not duplicate screen IDs/labels in the print-only subtree.
  root.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  root.querySelectorAll('label').forEach(element => element.removeAttribute('for'));
  root.querySelectorAll('input').forEach(input => {
    const text = document.createElement('span'); text.className = 'receipt-reference';
    text.textContent = input.value; input.replaceWith(text);
  });
  const style = document.createElement('style');
  style.dataset.sornioPrintStyle = 'true';
  const width = layout === 'a4' ? '100%' : layout === '58mm' ? '52mm' : '74mm';
  style.textContent = `@media screen{[data-sornio-print-root]{display:none}}@media print{@page{size:${layout === 'a4' ? 'A4' : 'auto'};margin:${layout === 'a4' ? '12mm' : '3mm'}}body>:not([data-sornio-print-root]){display:none!important}[data-sornio-print-root]{display:block!important;color:#000;background:#fff;font:12px "Sornio Gurmukhi","Nirmala UI","Raavi","Segoe UI",sans-serif}[data-sornio-print-root] article{width:${width};max-width:100%;overflow-wrap:anywhere}[data-sornio-print-root] h3{font-size:16px}[data-sornio-print-root] ul{padding:0;list-style:none}[data-sornio-print-root] li{border-bottom:1px dotted #888;padding:6px 0;break-inside:avoid}[data-sornio-print-root] strong{display:block}[data-sornio-print-root] p{margin:6px 0}[data-sornio-print-root] input{border:0;width:100%;font:inherit}}`;
  document.head.append(style); document.body.append(root);
  try {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    // Locking/unmounting while fonts load must not print stale private data.
    if (!root.isConnected) throw new Error('Receipt is no longer open');
    window.addEventListener('afterprint', clearPrintReceipt, { once: true });
    window.print();
    // Neither closing the dialog nor afterprint proves that paper was produced.
  } catch (error) { clearPrintReceipt(); throw error; }
}
