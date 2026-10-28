/* React -> test transport -> real authorized Workspace/SQLCipher integration.
 * No financial engine is mocked. Actual Tauri IPC/Windows UI is check-native.py.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const baseUrl = process.argv[2] || 'http://127.0.0.1:1420';
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
const directory = mkdtempSync(join(tmpdir(), 'sornio-customer-ui-'));
const database = join(directory, 'synthetic.db');
let nativeScope;
let child, queue = [], stderr = '';
function startBridge() {
  child = spawn(binary, [database], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.on('exit', () => { for (const request of queue.splice(0)) request.reject(new Error(`Native review fixture exited: ${stderr}`)); });
  child.on('error', error => { for (const request of queue.splice(0)) request.reject(error); });
  child.stderr.on('data', data => { stderr += data; });
  createInterface({ input: child.stdout }).on('line', line => {
    const request = queue.shift();
    if (request) { try { request.resolve(JSON.parse(line)); } catch (error) { request.reject(error); } }
  });
}
function rpc(command, args = {}) {
  return new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(`${JSON.stringify({ command, args })}\n`); });
}
async function native(command, args = {}) {
  const reply = await rpc(command, { ...args, scope: nativeScope }); if (!reply.ok) throw new Error(JSON.stringify(reply.error)); return reply.value;
}
async function stopBridge() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await stopped;
}
(async () => {
  startBridge();
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } }); page.setDefaultTimeout(20000);
    const calls = [], errors = []; let losePrepare = false, losePost = false, loseLink = false, hold, release;
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('customerReviewInvoke', async (command, args) => {
      calls.push({ command, args: structuredClone(args) });
      if (command === 'post_local_credit' && hold) await hold;
      const reply = await rpc(command, args);
      if (command === 'prepare_local_credit' && losePrepare && reply.ok) { losePrepare = false; return { ok: false, error: { code: 'unavailable', message: 'Lost prepare reply. Retry the same entry.' } }; }
      if (command === 'post_local_credit' && losePost && reply.ok) { losePost = false; return { ok: false, error: { code: 'unavailable', message: 'Lost repayment reply. Retry the same entry.' } }; }
      if (command === 'link_local_credit' && loseLink && reply.ok) { loseLink = false; return { ok: false, error: { code: 'unavailable', message: 'Lost link reply. Retry the same link.' } }; }
      return reply;
    });
    await page.addInitScript(() => {
      globalThis.isTauri = true; globalThis.printCount = 0; globalThis.customerFinds = 0; window.print = () => { globalThis.printCount += 1; };
      globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => { const r = await globalThis.customerReviewInvoke(command, args); if (!r.ok) throw r.error; if (command === 'find_local_customers') globalThis.customerFinds += 1; return r.value; } };
    });
    const label = name => page.getByLabel(name, { exact: true }), button = name => page.getByRole('button', { name, exact: true });
    const panel = page.getByRole('region', { name: 'Customers & credit', exact: true });
    const password = 'Synthetic customer password 2026';
    const alert = text => page.getByRole('alert').filter({ hasText: text });
    async function ready() { await button('Refresh customer accounts').click(); await panel.getByText('Customer accounts are up to date.', { exact: true }).waitFor(); }
    async function acknowledge() { await button('Start next credit entry').click(); await panel.getByText('Customer accounts are up to date.', { exact: true }).waitFor(); }
    async function entry(kind, amount, reason = '', extra = '') {
      await label('Credit entry type').selectOption(kind);
      if (kind === 'reversal') await label('Credit entry ID to reverse').fill(extra);
      else await label('Credit entry amount (₹)').fill(amount);
      if (kind === 'opening_due') await label('Opening due date').fill(extra);
      await label('Credit entry reason').fill(reason); await button('Review credit entry').click();
    }
    async function receipt() { await label('Saved credit entry ID').waitFor(); return label('Saved credit entry ID').inputValue(); }
    await page.goto(baseUrl);
    await label('Business name for setup').fill('Customer ledger review'); await label('Owner name').fill('Owner');
    await label('Local password').fill(password); await label('Confirm password').fill(password); await button('Set up local access').click();
    nativeScope = (await native('read_local_session')).scope;
    await panel.getByText('Customer accounts are up to date.', { exact: true }).waitFor();
    await page.getByText('Checkout is ready. Totals are previews until the sale is saved.', { exact: true }).waitFor();
    await label('Transaction type').selectOption('credit');
    await page.waitForFunction(() => globalThis.customerFinds >= 2);
    await label('Customer ID').fill('customer-1'); await label('Customer name').fill('Asha <shop>');
    await label('Customer phone (optional)').fill('+91 98765 43210'); await label('Credit limit (₹, blank for no limit)').fill('200.00');
    await button('Save customer').click(); await panel.getByText('Customer saved.', { exact: true }).waitFor();
    await button('Use customer customer-1').waitFor(); // Existing lookup refreshes after account creation.
    assert.equal((await native('find_local_customers', { search: '9876543210', overdueOnly: false }))[0].phone, '+919876543210');
    await native('add_local_product', { request: { operationId: 'rice', name: 'Rice', sku: 'RICE', unit: 'kg', unitPricePaise: 10000, openingStockMilli: 10000 } });
    await button('Refresh checkout').click(); await button('Add Rice to sale').click(); await label('Transaction type').selectOption('credit');
    await label('Find credit customer').fill('9876543210'); await button('Use customer customer-1').click();
    assert.equal(await label('Credit customer reference').inputValue(), 'customer-1');
    await button('Review sale').click(); await button('Confirm sale').click(); await label('Saved invoice ID').waitFor();
    const invoice = await label('Saved invoice ID').inputValue(); await button('Start next sale').click();
    await ready(); await button('Open customer customer-1').click();
    await panel.getByText('Outstanding: ₹100.00 · Overdue: ₹0.00 · Limit: ₹200.00', { exact: true }).waitFor();
    // No financial writes when leaving review. A delayed/lost response never creates a fresh ID.
    await entry('repayment', '25.01'); await button('Lock workspace').click(); await button('Continue editing').click();
    assert.equal(await label('Credit entry amount (₹)').inputValue(), '25.01');
    await button('Cancel credit review').click();
    assert.equal((await native('read_customer_statement', { customerId: 'customer-1', after: 0, through: null })).entries.length, 1);
    await entry('repayment', '25.01'); losePrepare = true; await button('Confirm credit entry').click();
    await alert('Lost prepare reply').waitFor(); assert.equal(await label('Saved credit entry ID').count(), 0);
    hold = new Promise(resolve => { release = resolve; }); losePost = true; await button('Retry same credit entry').click();
    await page.waitForFunction(() => document.querySelector('.customer-panel')?.getAttribute('aria-busy') === 'true');
    assert.equal(await button('Lock workspace').isDisabled(), true);
    release(); hold = null; await alert('Lost repayment reply').waitFor();
    await button('Retry same credit entry').click(); const payment = await receipt();
    const attempts = calls.filter(c => c.command === 'post_local_credit' && c.args.r.operationId === payment);
    assert.equal(attempts.length, 2); assert.deepEqual(attempts[0].args, attempts[1].args);
    assert.equal((await native('read_cashier_state')).balances.creditPaise, '7499');
    assert.equal((await native('read_cashier_state')).balances.cashPaise, '2501');
    await stopBridge(); startBridge(); await page.reload();
    await label('Local password').fill(password); await button('Unlock workspace').click();
    assert.equal(await receipt(), payment); await acknowledge();
    await entry('repayment', '100.00'); await button('Confirm credit entry').click();
    await button('Edit refused credit entry').waitFor(); assert.equal(await label('Saved credit entry ID').count(), 0);
    await button('Edit refused credit entry').click(); await panel.getByText('Customer accounts are up to date.', { exact: true }).waitFor();
    await entry('repayment', '74.99'); await button('Confirm credit entry').click(); await receipt(); await acknowledge();
    assert.equal((await native('read_cashier_state')).balances.creditPaise, '0');
    assert.equal((await native('read_cashier_state')).balances.cashPaise, '10000');
    // Owner corrections retain originals and use a separate reversing journal.
    await entry('opening_due', '50.00', 'Opening book verified', '2020-01-01'); await button('Confirm credit entry').click(); const opening = await receipt(); await acknowledge();
    await label('Show overdue accounts').check(); await button('Open customer customer-1').waitFor();
    await panel.getByText('Outstanding: ₹50.00 · Overdue: ₹50.00 · Limit: ₹200.00', { exact: true }).waitFor();
    await label('Show overdue accounts').uncheck();
    await entry('reversal', '', 'Duplicate opening corrected', opening); await button('Confirm credit entry').click(); await receipt(); await acknowledge();
    await button('Prepare full customer statement').click(); await button('Print customer statement').waitFor();
    await ready(); // A same-snapshot refresh must preserve the prepared document.
    await button('Print customer statement').click();
    const printable = page.getByRole('region', { name: 'Printable customer statement', exact: true });
    assert.equal(await printable.locator('tbody tr').count(), 5);
    assert.equal(await printable.locator('script, img, iframe').count(), 0);
    await printable.getByText('Asha <shop>', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.printCount), 1);
    assert.ok((await printable.textContent()).includes(invoice));
    // Limits reject the whole original invoice, including stock and native ledger.
    await button('Add Rice to sale').click(); await label('Quantity for Rice (kg)').fill('3'); await label('Transaction type').selectOption('credit');
    await button('Use customer customer-1').click(); await button('Review sale').click(); await button('Confirm sale').click(); await button('Edit refused sale').waitFor();
    assert.equal((await native('list_local_invoices', { after: 0 })).length, 1);
    assert.equal((await native('list_local_products'))[0].stockMilli, 9000);
    await button('Edit refused sale').click(); await button('Remove Rice from sale').click();
    // Link a previously posted credit sale without rewriting its invoice, even
    // if the first transfer reply is lost and account revisions advance.
    for (const id of ['legacy-ref', 'named-account']) await native('save_local_customer', { r: { operationId: `profile-${id}`, id, name: id, phone: null, creditLimitPaise: null, creditDays: 30, expectedRevision: null } });
    const oldSale = { operationId: 'legacy-sale', lines: [{ productId: 'rice', expectedRevision: 2, quantityMilli: 1000 }], taxBasisPoints: 0, tender: 'credit', customerId: 'legacy-ref' };
    await native('prepare_local_checkout', { request: oldSale }); await native('post_local_invoice', { request: oldSale }); await native('clear_local_checkout', { operationId: 'legacy-sale', saved: true });
    await ready(); assert.equal(await button('Print customer statement').count(), 0, 'Changed ledger must invalidate the old print snapshot'); await button('Open customer named-account').click();
    await label('Existing credit invoice ID').fill('legacy-sale'); await label('Existing source customer ID').fill('legacy-ref'); await label('Credit link reason').fill('Match the original shop book');
    loseLink = true; await button('Link existing credit sale').click(); await alert('Lost link reply').waitFor();
    await ready(); await button('Link existing credit sale').click(); await panel.getByText('Existing credit sale linked. Original invoice and transfer history were retained.', { exact: true }).waitFor();
    const transfers = calls.filter(c => c.command === 'link_local_credit'); assert.equal(transfers.length, 2); assert.deepEqual(transfers[0].args, transfers[1].args);
    assert.equal((await native('read_customer_statement', { customerId: 'legacy-ref', after: 0, through: null })).closingBalancePaise, '0');
    assert.equal((await native('read_customer_statement', { customerId: 'named-account', after: 0, through: null })).closingBalancePaise, '10000');
    // Native permission and scope checks still apply to forged IPC calls.
    await native('create_local_staff', { details: { username: 'cashier', displayName: 'Cashier', role: 'cashier' }, password });
    await button('Lock workspace').click(); if (await button('Discard edits and lock').count()) await button('Discard edits and lock').click(); await label('Account name').fill('cashier'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await button('Refresh customer accounts').waitFor(); await ready(); await button('Open customer customer-1').click();
    assert.equal(await label('Customer name').count(), 0); assert.equal(await label('Show overdue accounts').count(), 0);
    assert.deepEqual(await label('Credit entry type').locator('option').allTextContents(), ['Cash repayment']);
    const denied = await rpc('prepare_local_credit', { scope: nativeScope, r: { operationId: 'forged', customerId: 'customer-1', expectedRevision: 1, kind: 'opening_due', amountPaise: 100, reason: 'forged', dueOn: '2020-01-01', reverseOf: null } });
    assert.equal(denied.error.code, 'forbidden');
    const isolated = await rpc('find_local_customers', { scope: { ...nativeScope, businessId: 'other' }, search: '', overdueOnly: false }); assert.equal(isolated.error.code, 'workspace_mismatch');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(errors, []);
    console.log('Customer React/native integration passed: profile/phone checkout lookup, atomic credit sale, partial/full cash repayment, lost prepare/post replies, exact retry, process restart, overpayment refusal, owner correction/reversal, overdue filter, escaped full statement/print, limit rollback, exact link retry/retained invoice, native permission and business isolation.');
  } finally { await browser.close(); await stopBridge(); rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
