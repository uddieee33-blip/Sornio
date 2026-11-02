/* Real React -> Workspace/SQLCipher. PDF and print-dialog stubs are not physical
 * Windows/driver acceptance. All identities, account entries and products are synthetic. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone acceptance runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const dir = mkdtempSync(join(tmpdir(), 'sornio-statement-print-'));
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
const password = 'Synthetic statement review password';
function bridge() {
  const child = spawn(binary, [join(dir, 'synthetic.db')]), queue = [];
  child.stderr.on('data', () => {});
  child.on('error', error => { for (const q of queue.splice(0)) q.reject(error); });
  child.on('exit', () => { for (const q of queue.splice(0)) q.reject(new Error('Native statement fixture stopped')); });
  createInterface({ input: child.stdout }).on('line', line => queue.shift()?.resolve(JSON.parse(line)));
  return {
    rpc(command, args = {}) { return new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify({ command, args }) + '\n'); }); },
    async stop() { if (child.exitCode !== null || child.signalCode !== null) return; const done = new Promise(r => child.once('exit', r)); child.kill('SIGKILL'); await done; },
  };
}
(async () => {
  const transport = bridge(), admin = bridge(); let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
    const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } }); page.setDefaultTimeout(20000);
    const calls = [], errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('statementReviewInvoke', async (command, args) => { calls.push({ command, args }); return transport.rpc(command, args); });
    await page.addInitScript(() => {
      globalThis.isTauri = true; window.__printCalls = 0; window.print = () => { window.__printCalls++; };
      globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => { const r = await globalThis.statementReviewInvoke(command, args); if (!r.ok) throw r.error; return r.value; } };
    });
    const button = name => page.getByRole('button', { name, exact: true }), label = name => page.getByLabel(name, { exact: true });
    const panel = page.getByRole('region', { name: 'Customers & credit', exact: true });
    const printRoot = page.locator('[data-sornio-print-root]');
    const alert = text => page.getByRole('alert').filter({ hasText: text });
    await page.goto(process.argv[2] || 'http://127.0.0.1:1420');
    await label('Business name for setup').fill('Synthetic statement shop'); await label('Owner name').fill('Synthetic owner');
    await label('Local password').fill(password); await label('Confirm password').fill(password); await button('Set up local access').click();
    await button('Refresh customer accounts').waitFor();
    const scope = (await transport.rpc('read_local_session')).value.scope;
    async function native(command, args = {}) { const r = await admin.rpc(command, { ...args, scope }); assert.equal(r.ok, true, JSON.stringify(r.error)); return r.value; }
    await native('unlock_workspace', { username: 'owner', password });
    const cashier = await native('create_local_staff', { details: { username: 'cashier', displayName: 'Synthetic cashier', role: 'cashier' }, password });
    let customer = await native('save_local_customer', { r: { operationId: 'statement-profile', id: 'statement-account', name: 'Asha <shop> ਪੰਜਾਬੀ', phone: '+919876543210', creditLimitPaise: null, creditDays: 30, expectedRevision: null } });
    for (let i = 1; i <= 105; i++) {
      const r = { operationId: `statement-row-${String(i).padStart(3, '0')}`, customerId: customer.id, expectedRevision: customer.revision, kind: 'opening_due', amountPaise: 101, reason: `Synthetic book row ${i} <not markup>`, dueOn: '2026-01-01', reverseOf: null };
      await native('prepare_local_credit', { r }); const receipt = await native('post_local_credit', { r });
      await native('clear_local_credit', { operationId: r.operationId, saved: true }); customer = { ...customer, revision: receipt.revision };
    }
    async function open() {
      await button('Refresh customer accounts').click(); await panel.getByText('Customer accounts are up to date.', { exact: true }).waitFor();
      await button('Open customer statement-account').click(); await button('Prepare full customer statement').waitFor();
    }
    async function prepare() { await button('Prepare full customer statement').click(); await button('Print customer statement').waitFor(); }
    async function printed() { await panel.getByText(/Check the printer or PDF output/).waitFor(); }
    async function state() {
      let after = 0, entries = [];
      for (;;) { const s = await native('read_customer_statement', { customerId: customer.id, after, through: null }); entries.push(...s.entries); if (!s.hasMore) return { entries, closing: s.closingBalancePaise, invoices: await native('list_local_invoices', { after: 0 }), products: await native('list_local_products'), balances: (await native('read_cashier_state')).balances, outbox: await native('read_billing_outbox', { after: 0 }) }; after = s.nextAfter; }
    }
    const financialPosts = () => calls.filter(c => c.command.startsWith('post_')).length;
    await open(); assert.equal(await panel.getByRole('button', { name: 'Load more customer history' }).count(), 1);
    await prepare(); const source = page.getByRole('region', { name: 'Printable customer statement', exact: true });
    assert.equal(await source.locator('tbody tr').count(), 105, 'Print includes history beyond the UI page limit');
    assert.equal(await source.locator('script,img,iframe').count(), 0); await source.getByText('Asha <shop> ਪੰਜਾਬੀ', { exact: true }).waitFor();
    assert.match(await source.evaluate(e => getComputedStyle(e).fontFamily), /Sornio Gurmukhi/);
    await page.evaluate(() => document.fonts.load('24px "Sornio Gurmukhi"', 'ਪੰਜਾਬੀ'));
    assert.equal(await page.evaluate(() => document.fonts.check('24px "Sornio Gurmukhi"', 'ਪੰਜਾਬੀ')), true);
    const before = await state(), posts = financialPosts();
    assert.equal(before.entries.length, 105); assert.equal(before.closing, '10605');
    // A failed printer cannot remove the preview or alter any financial record.
    await page.evaluate(() => { window.print = () => { throw new Error('Synthetic printer refusal'); }; });
    await button('Print customer statement').click(); await alert('Statement printing could not open.').waitFor(); assert.equal(await printRoot.count(), 0);
    await page.evaluate(() => { window.print = () => { window.__printCalls++; }; });
    await button('Print customer statement').click(); await printed(); assert.equal(await printRoot.count(), 1);
    assert.equal(await printRoot.getAttribute('data-sornio-print-kind'), 'statement'); assert.equal(await printRoot.locator('tbody tr').count(), 105);
    assert.equal(await printRoot.locator('[id]').count(), 0);
    await page.emulateMedia({ media: 'print' }); assert.equal(await printRoot.isVisible(), true); assert.equal(await page.locator('#root').isVisible(), false);
    assert.equal(await page.locator('.customer-statement-print:visible').count(), 1, 'Statement remains visible while application UI is hidden');
    assert.equal(await printRoot.locator('thead').evaluate(e => getComputedStyle(e).display), 'table-header-group');
    assert.equal(await printRoot.evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, 'Statement has no horizontal overflow');
    const output = process.argv[4] || join(dir, 'review'); mkdirSync(output, { recursive: true });
    const pdf = await page.pdf({ path: join(output, 'customer-statement-105-rows.pdf'), preferCSSPageSize: true }); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    await page.emulateMedia({ media: 'screen' });
    await source.evaluate(e => e.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -80));
    const capture = await page.screenshot({ path: join(output, 'customer-statement-browser.png') });
    writeFileSync('docs/reviews/windows-customer-statement-browser.png', capture);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); assert.equal(await printRoot.count(), 0);
    await button('Print customer statement').click(); await printed(); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.deepEqual(await state(), before); assert.equal(financialPosts(), posts);
    // A profile change before preparation must refuse the old rendered HTML.
    async function rename(name, operationId) {
      const current = (await native('find_local_customers', { search: customer.id, overdueOnly: false })).find(c => c.id === customer.id);
      customer = await native('save_local_customer', { r: { operationId, id: customer.id, name, phone: current.phone, creditLimitPaise: null, creditDays: 30, expectedRevision: current.revision } });
    }
    await rename('Changed before printing', 'rename-before'); const priorCount = await page.evaluate(() => window.__printCalls);
    await button('Print customer statement').click(); await alert('The customer statement changed.').waitFor();
    assert.equal(await printRoot.count(), 0); assert.equal(await page.evaluate(() => window.__printCalls), priorCount); assert.equal(await source.count(), 0);
    await open(); await prepare();
    // A profile change during fonts must also refuse, without an OS print call.
    await page.evaluate(() => { Object.defineProperty(document.fonts, 'ready', { configurable: true, value: new Promise(r => { window.__releaseFonts = r; }) }); });
    await button('Print customer statement').click(); await page.waitForFunction(() => document.querySelector('[data-sornio-print-root]'));
    await rename('Changed during fonts', 'rename-during'); await page.evaluate(() => window.__releaseFonts());
    await alert('The customer statement changed.').waitFor(); assert.equal(await printRoot.count(), 0); assert.equal(await page.evaluate(() => window.__printCalls), priorCount);
    await page.evaluate(() => { Object.defineProperty(document.fonts, 'ready', { configurable: true, value: Promise.resolve() }); });
    await open(); await prepare();
    // Both document types replace the same job; neither can leave duplicate print DOM.
    await native('add_local_product', { request: { operationId: 'sample-product', name: 'Synthetic tyre', sku: 'TYRE', unit: 'pcs', unitPricePaise: 100, openingStockMilli: 1000 } });
    await native('acknowledge_local_inventory', { operationId: 'sample-product' });
    const r = { operationId: 'sample-receipt', lines: [{ productId: 'sample-product', expectedRevision: 1, quantityMilli: 1000 }], taxBasisPoints: 0, tender: 'cash', customerId: null };
    await native('prepare_local_checkout', { request: r }); await native('post_local_invoice', { request: r }); await native('clear_local_checkout', { operationId: r.operationId, saved: true });
    const afterSale = await state();
    await button('Find saved receipt').click(); await label('Receipt ID to reopen').fill(r.operationId); await button('Open saved receipt').click();
    await button('Print saved receipt').click(); await page.locator('.saved-invoice').getByRole('status').filter({ hasText: 'Check the printer or PDF output.' }).waitFor();
    assert.equal(await printRoot.getAttribute('data-sornio-print-kind'), 'receipt');
    await button('Print customer statement').click(); await printed(); assert.equal(await printRoot.count(), 1); assert.equal(await printRoot.getAttribute('data-sornio-print-kind'), 'statement');
    await button('Print saved receipt').click(); await page.locator('.saved-invoice').getByRole('status').filter({ hasText: 'Check the printer or PDF output.' }).waitFor();
    assert.equal(await printRoot.count(), 1); assert.equal(await printRoot.getAttribute('data-sornio-print-kind'), 'receipt');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); assert.deepEqual(await state(), afterSale); assert.equal(financialPosts(), posts);
    // Cashier preparation requires a still-enabled human at the final native read.
    await button('Lock workspace').click(); await label('Account name').fill('cashier'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await button('Refresh customer accounts').waitFor(); await open(); await prepare();
    await page.evaluate(() => { Object.defineProperty(document.fonts, 'ready', { configurable: true, value: new Promise(r => { window.__releaseFonts = r; }) }); });
    const countBeforeRevocation = await page.evaluate(() => window.__printCalls);
    await button('Print customer statement').click(); await page.waitForFunction(() => document.querySelector('[data-sornio-print-root]'));
    await native('change_local_staff', { change: { id: cashier.id, expectedRevision: cashier.revision, role: 'cashier', enabled: false } });
    await page.evaluate(() => window.__releaseFonts()); await button('Unlock workspace').waitFor();
    assert.equal(await page.locator('.customer-panel').count(), 0); assert.equal(await printRoot.count(), 0); assert.equal(await page.locator('[data-sornio-print-style]').count(), 0);
    assert.equal(await page.evaluate(() => window.__printCalls), countBeforeRevocation); assert.deepEqual(await state(), afterSale); assert.equal(financialPosts(), posts);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fullStatementRows: 105, closingBalancePaise: before.closing, additionalRendererFinancialPosts: financialPosts() - posts, printerCalls: countBeforeRevocation }));
    console.log('Customer statement React/native printing passed: blank-print regression; all 105 rows beyond UI pagination; escaped markup; A4 PDF/repeated header CSS; printer refusal/retry; unchanged account history/stock/balances/billing outbox; before/during-font snapshot changes refused; one shared receipt/statement job; disabled cashier denied after font loading. Not Windows or physical printer acceptance.');
  } finally { if (browser) await browser.close(); await transport.stop(); await admin.stop(); rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
