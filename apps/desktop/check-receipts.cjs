/* Actual React -> native Workspace/SQLCipher. Print-dialog/PDF transport is synthetic;
 * this is not Windows driver, physical paper, scanner or peripheral acceptance. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone acceptance runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const dir = mkdtempSync(join(tmpdir(), 'sornio-receipt-'));
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
const password = 'Synthetic receipt test password';
function bridge() {
  const child = spawn(binary, [join(dir, 'synthetic.db')]); const queue = [];
  child.stderr.on('data', () => {});
  child.on('error', error => { for (const q of queue.splice(0)) q.reject(error); });
  child.on('exit', () => { for (const q of queue.splice(0)) q.reject(new Error('Native receipt fixture stopped')); });
  createInterface({ input: child.stdout }).on('line', line => queue.shift()?.resolve(JSON.parse(line)));
  return { rpc(command, args = {}) { return new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify({ command, args }) + '\n'); }); }, async stop() { if (child.exitCode !== null || child.signalCode !== null) return; const done = new Promise(r => child.once('exit', r)); child.kill('SIGKILL'); await done; } };
}
(async () => {
 const transport = bridge(), admin = bridge(); let browser;
 try {
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } }); page.setDefaultTimeout(20000);
  const calls = [], errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('receiptReviewInvoke', async (command, args) => { calls.push({ command, args }); return transport.rpc(command, args); });
  await page.addInitScript(() => {
    globalThis.isTauri = true;
    globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => { const r = await globalThis.receiptReviewInvoke(command, args); if (!r.ok) throw r.error; return r.value; } };
    window.__printCalls = 0; window.print = () => { window.__printCalls++; };
  });
  const button = name => page.getByRole('button', { name, exact: true }), label = name => page.getByLabel(name, { exact: true });
  const saved = () => page.getByRole('heading', { name: 'Sale saved on this PC', exact: true });
  await page.goto(process.argv[2] || 'http://127.0.0.1:1420');
  await label('Business name for setup').fill('Immutable original shop'); await label('Owner name').fill('Receipt owner');
  await label('Local password').fill(password); await label('Confirm password').fill(password); await button('Set up local access').click();
  const session = (await transport.rpc('read_local_session')).value, scope = session.scope;
  async function native(command, args = {}, service = transport) { const r = await service.rpc(command, { ...args, scope }); assert.equal(r.ok, true, JSON.stringify(r.error)); return r.value; }
  await native('unlock_workspace', { username: 'owner', password }, admin);
  const cashier = await native('create_local_staff', { details: { username: 'cashier', displayName: 'Receipt cashier', role: 'cashier' }, password }, admin);
  for (const [id, name, sku] of [['rice', 'Rice', 'RICE'], ['other', 'Rice substitute', 'OTHER']]) {
    await native('add_local_product', { request: { operationId: id, name, sku, unit: 'kg', unitPricePaise: 4250, openingStockMilli: 10000 } });
    await native('acknowledge_local_inventory', { operationId: id });
  }
  await button('Refresh checkout').click();
  // Empty/ambiguous Enter and key repeats never silently select another item.
  await label('Search items for sale').fill(''); await label('Search items for sale').press('Enter');
  assert.equal(await page.getByRole('list', { name: 'Current sale items' }).getByRole('listitem').count(), 0);
  await label('Search items for sale').fill('Ric'); await label('Search items for sale').press('Enter');
  assert.equal(await page.getByRole('list', { name: 'Current sale items' }).getByRole('listitem').count(), 0);
  await label('Search items for sale').fill('Rice'); await label('Search items for sale').press('Enter'); // Exact SKU wins over two name matches.
  assert.equal(await page.getByRole('list', { name: 'Current sale items' }).getByRole('listitem').count(), 1);
  await label('Search items for sale').fill('RICE'); await label('Search items for sale').press('Enter');
  // A weighed item is never sold at a quantity nobody entered: the scan asks
  // for the quantity, and scanning the same item again asks again instead of
  // incrementing a number the cashier never typed.
  assert.equal(await label('Quantity for Rice (kg)').inputValue(), '');
  await page.getByText('Enter the quantity for this item.', { exact: true }).waitFor();
  await label('Search items for sale').fill('RICE'); await label('Search items for sale').dispatchEvent('keydown', { key: 'Enter', repeat: true });
  assert.equal(await label('Quantity for Rice (kg)').inputValue(), '');
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.keyboard.press('F3'); await page.keyboard.type('0.125'); await page.keyboard.press('Enter');
  await label('Tax (%)').fill('5'); const started = performance.now();
  // The deliberate confirmation is Alt+Enter. A plain Enter is a scanner
  // keypress and the product refuses to treat it as a financial confirmation,
  // so the keyboard sale has to use the deliberate key.
  await page.keyboard.press('F4'); await page.waitForFunction(() => document.activeElement?.textContent === 'Confirm sale'); await page.keyboard.press('Alt+Enter'); await saved().waitFor();
  const keyboardMs = Math.round(performance.now() - started); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const cashId = await label('Saved invoice ID').inputValue();
  const original = await native('read_local_invoice', { invoiceId: cashId }); assert.equal(original.totalPaise, 558);
  assert.equal(await page.locator('.receipt-paper time').textContent(), new Date(original.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST');
  async function state() { return { invoices: await native('list_local_invoices', { after: 0 }), products: await native('list_local_products'), balances: (await native('read_cashier_state')).balances, outbox: await native('read_billing_outbox', { after: 0 }) }; }
  const before = await state(), posts = calls.filter(c => c.command.startsWith('post_')).length;
  await page.evaluate(() => { window.print = () => { throw new Error('Synthetic printer refusal'); }; });
  await button('Print saved receipt').click(); await page.getByRole('status').filter({ hasText: 'Printing could not open.' }).waitFor();
  assert.equal(await page.locator('[data-sornio-print-root]').count(), 0);
  await page.evaluate(() => { window.print = () => { window.__printCalls++; }; });
  const output = process.argv[4] || join(dir, 'review'); mkdirSync(output, { recursive: true });
  for (const layout of ['a4', '58mm', '80mm']) {
    await label('Paper layout').selectOption(layout); await button('Print saved receipt').click();
    await page.getByRole('status').filter({ hasText: 'Check the printer or PDF output.' }).waitFor();
    const root = page.locator('[data-sornio-print-root]'); assert.equal(await root.locator('.receipt-reference').textContent(), cashId);
    assert.equal(await root.locator('[id]').count(), 0);
    await page.emulateMedia({ media: 'print' }); assert.equal(await page.locator('.desktop-shell').isVisible(), false); assert.equal(await root.isVisible(), true);
    if (layout !== 'a4') { const box = await root.locator('article').boundingBox(); assert.ok(Math.abs(box.width - (layout === '58mm' ? 52 : 74) * 96 / 25.4) < 1); }
    const pdf = await page.pdf({ path: join(output, `saved-receipt-${layout}.pdf`), preferCSSPageSize: true }); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); assert.equal(await root.count(), 0);
  }
  await label('Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ').selectOption('pa');
  await button('ਸੰਭਾਲੀ ਰਸੀਦ ਛਾਪੋ').click(); await page.waitForFunction(() => document.querySelector('[data-sornio-print-root]')?.textContent.includes('ਨਕਦ ਪ੍ਰਾਪਤ ਹੋਇਆ'));
  assert.equal(await label('ਸੰਭਾਲੇ ਬਿੱਲ ਦਾ ਨੰਬਰ').inputValue(), cashId);
  await page.evaluate(() => document.fonts.load('12px "Sornio Gurmukhi"', 'ਰਸੀਦ'));
  assert.equal(await page.evaluate(() => document.fonts.check('12px "Sornio Gurmukhi"', 'ਰਸੀਦ')), true);
  await page.locator('.saved-invoice').screenshot({ path: 'docs/reviews/windows-punjabi-receipt-browser.png' });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.desktop-shell').isVisible(), false);
  await page.pdf({ path: join(output, 'saved-receipt-punjabi.pdf'), preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  await label('Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ').selectOption('en'); await saved().waitFor();
  assert.deepEqual(await state(), before); assert.equal(calls.filter(c => c.command.startsWith('post_')).length, posts);
  // Browse/reopen uses persisted snapshots rather than today's editable shop draft.
  await button('Start next sale').click(); await label('Business name').fill('Renamed draft after sale'); await button('Save local draft').click();
  await page.getByText('Saved to this PC. You can close and reopen Sornio.', { exact: true }).waitFor();
  await button('Find saved receipt').click(); await button('Browse saved receipts').click();
  await page.getByRole('region', { name: 'Saved receipts', exact: true }).getByRole('button').filter({ hasText: cashId }).click(); await saved().waitFor();
  assert.equal(await page.locator('.receipt-paper').getByText('Immutable original shop', { exact: true }).count(), 1);
  assert.equal(await page.locator('.receipt-paper').getByText('Renamed draft after sale', { exact: true }).count(), 0);
  await button('Print saved receipt').click(); await page.getByRole('status').filter({ hasText: 'Check the printer or PDF output.' }).waitFor();
  await page.locator('.saved-invoice').screenshot({ path: 'docs/reviews/windows-saved-receipt-browser.png' });
  assert.deepEqual(await native('read_local_invoice', { invoiceId: cashId }), original);
  // Cancel an older asynchronous print, then open a newer print before the old fonts resolve.
  await page.evaluate(() => { window.__fontResolve = null; const waiting = new Promise(r => { window.__fontResolve = r; }); Object.defineProperty(document.fonts, 'ready', { configurable: true, value: waiting }); });
  await button('Print saved receipt').click(); await page.waitForFunction(() => document.querySelector('[data-sornio-print-root]'));
  await button('Back to checkout').click(); assert.equal(await page.locator('[data-sornio-print-root]').count(), 0);
  await button('Find saved receipt').click(); await label('Receipt ID to reopen').fill(cashId); await button('Open saved receipt').click(); await saved().waitFor();
  await page.evaluate(() => { Object.defineProperty(document.fonts, 'ready', { configurable: true, value: Promise.resolve() }); });
  await button('Print saved receipt').click(); await page.getByRole('status').filter({ hasText: 'Check the printer or PDF output.' }).waitFor();
  const newerPrintCount = await page.evaluate(() => window.__printCalls); await page.evaluate(() => window.__fontResolve());
  await page.waitForTimeout(100); assert.equal(await page.locator('[data-sornio-print-root] .receipt-reference').textContent(), cashId); assert.equal(await page.evaluate(() => window.__printCalls), newerPrintCount);
  await button('Back to checkout').click();
  // A retail original remains explicitly unverified in its printable snapshot.
  await label('Search items for sale').fill('RICE'); await label('Search items for sale').press('Enter'); await label('Tax (%)').fill('0'); await label('Transaction type').selectOption('retail');
  await label('Split cash amount (₹)').fill('10'); await label('Split UPI amount (₹)').fill('32.50'); await button('Review sale').click(); await button('Confirm sale').click(); await saved().waitFor();
  const retailId = await label('Saved invoice ID').inputValue(); await button('Print saved receipt').click(); await page.getByRole('status').filter({ hasText: 'Check the printer or PDF output.' }).waitFor();
  assert.ok((await page.locator('[data-sornio-print-root]').innerText()).includes('UPI/card amounts remain unverified'));
  const day = await label('Cashier business date (IST)').inputValue(); const payments = await native('read_local_retail', { day, username: 'owner', invoiceId: retailId }); assert.ok(payments.payments.every(p => !p.externallyVerified));
  await button('Start next sale').click();
  // Split cash (₹600) + customer credit (₹400) on a ₹1,000 sale: F4 review, Escape cancel, exact-once post, EN/PA receipt & reopen.
  await native('save_local_customer', { r: { operationId: 'split-customer', id: 'customer-split', name: 'Split Customer', phone: null, creditLimitPaise: 500000, creditDays: 30, expectedRevision: null } });
  await native('add_local_product', { request: { operationId: 'atta20', name: 'Atta 20kg', sku: 'ATTA20', unit: 'pcs', unitPricePaise: 100000, openingStockMilli: 5000 } });
  await native('acknowledge_local_inventory', { operationId: 'atta20' });
  await button('Refresh checkout').click();
  const preSplit = await state();
  await page.keyboard.press('F2'); await label('Search items for sale').fill('ATTA20'); await label('Search items for sale').press('Enter');
  await label('Tax (%)').fill('0'); await label('Transaction type').selectOption('retail');
  await label('Customer reference for a credit split (optional)').fill('customer-split');
  await label('Split cash amount (₹)').fill('600'); await label('Split customer credit amount (₹)').fill('400');
  await page.keyboard.press('F4'); await page.waitForFunction(() => document.activeElement?.textContent === 'Confirm sale');
  assert.equal((await native('list_local_invoices', { after: 0 })).length, preSplit.invoices.length);
  assert.ok((await page.getByRole('group', { name: 'Confirm sale', exact: true }).innerText()).includes('Customer credit'));
  await page.keyboard.press('Escape'); await page.waitForFunction(() => document.activeElement?.id === 'checkout-search');
  await page.keyboard.press('F4'); await page.waitForFunction(() => document.activeElement?.textContent === 'Confirm sale');
  // A plain Enter is a scanner keypress. It must never confirm a sale, and it
  // must not even reach the store: a scanner that fires Enter while a cashier
  // is looking at the review must not post money.
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  assert.equal(await saved().count(),0,'A plain Enter must never confirm a sale.');
  assert.equal((await native('list_local_invoices',{after:0})).length,preSplit.invoices.length,'A plain Enter must never post a sale.');
  await page.keyboard.press('Alt+Enter'); await saved().waitFor();
  const splitId = await label('Saved invoice ID').inputValue();
  const postSplit = await state();
  assert.equal(postSplit.invoices.length, preSplit.invoices.length + 1);
  assert.equal(postSplit.products.find(p => p.id === 'atta20').stockMilli, 4000);
  assert.equal(BigInt(postSplit.balances.cashPaise) - BigInt(preSplit.balances.cashPaise), 60000n);
  assert.equal(BigInt(postSplit.balances.creditPaise) - BigInt(preSplit.balances.creditPaise), 40000n);
  await label('Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ').selectOption('pa');
  await button('ਸੰਭਾਲੀ ਰਸੀਦ ਛਾਪੋ').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-sornio-print-root]')?.textContent || '';
    return text.includes('ਨਕਦ ਪ੍ਰਾਪਤ ਹੋਇਆ') && text.includes('ਗਾਹਕ ਉਧਾਰ') && text.includes('₹600.00') && text.includes('₹400.00');
  });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await label('Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ').selectOption('en');
  await button('Start next sale').click();
  await button('Find saved receipt').click(); await page.waitForFunction(() => document.activeElement?.id === 'receipt-lookup');
  await label('Receipt ID to reopen').fill(splitId); await label('Receipt ID to reopen').press('Enter'); await saved().waitFor();
  assert.ok((await page.getByRole('list', { name: 'Saved payment breakdown', exact: true }).innerText()).includes('Customer credit'));
  assert.deepEqual(await state(), postSplit);
  await button('Back to checkout').click(); await page.waitForFunction(() => document.activeElement?.id === 'checkout-search');
  await button('Lock workspace').click(); await label('Account name').fill('cashier'); await label('Local password').fill(password); await button('Unlock workspace').click();
  await button('Refresh checkout').waitFor(); await label('Search items for sale').fill('RICE'); await label('Search items for sale').press('Enter'); await label('Quantity for Rice (kg)').fill('0.250'); await button('Review sale').click(); await button('Confirm sale').click(); await saved().waitFor();
  const ownId = await label('Saved invoice ID').inputValue(); await button('Start next sale').click(); await button('Find saved receipt').click();
  assert.equal(await button('Browse saved receipts').count(), 0);
  await label('Receipt ID to reopen').fill(cashId); await button('Open saved receipt').click(); await page.getByRole('alert').filter({ hasText: 'permission' }).waitFor(); assert.equal(await label('Saved invoice ID').count(), 0);
  await label('Receipt ID to reopen').fill(ownId); await button('Open saved receipt').click(); await saved().waitFor();
  await page.evaluate(() => { const waiting = new Promise(r => { window.__fontResolve = r; }); Object.defineProperty(document.fonts, 'ready', { configurable: true, value: waiting }); });
  const printsBeforeRevocation = await page.evaluate(() => window.__printCalls);
  await button('Print saved receipt').click(); await page.waitForFunction(() => document.querySelector('[data-sornio-print-root]'));
  await native('change_local_staff', { change: { id: cashier.id, expectedRevision: cashier.revision, role: 'cashier', enabled: false } }, admin);
  await page.evaluate(() => window.__fontResolve()); await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__printCalls), printsBeforeRevocation); assert.equal(await page.locator('[data-sornio-print-root]').count(), 0);
  assert.equal(await label('Saved invoice ID').count(), 0); assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ keyboardReviewAndCommit4xCpuMs: keyboardMs, printLayouts: 3, extraFinancialPostsFromPrinting: 0 }));
  console.log('Receipt React/native integration passed: keyboard exact-code/repeat guards; native invoice lookup; three PDF/CSS layouts; Punjabi font; original snapshot/history; printer refusal/retry; cancelled async print isolation; cashier ownership; revocation during font loading; unchanged financial state and empty browser storage. Not physical Windows printer acceptance.');
 } finally { if (browser) await browser.close(); await transport.stop(); await admin.stop(); rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
