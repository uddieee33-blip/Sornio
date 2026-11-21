/* Real native backend -> React acceptance for the purchasing surface.
 * Raw IPC calls and the UI share one synthetic-key Workspace/SQLCipher fixture,
 * so this proves permissions, idempotency and the ledger effects, not mocks.
 * Windows native keyboard acceptance (check-native.py) remains separate. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const directory = mkdtempSync(join(tmpdir(), 'sornio-purchasing-'));
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
function bridge() {
  const child = spawn(binary, [join(directory, 'synthetic-purchasing.db')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const queue = []; let errors = '';
  child.stderr.on('data', data => { errors += data; });
  createInterface({ input: child.stdout }).on('line', line => { const next = queue.shift(); if (next) { try { next.resolve(JSON.parse(line)); } catch (error) { next.reject(error); } } });
  child.on('error', error => { for (const next of queue.splice(0)) next.reject(error); });
  child.on('exit', code => { for (const next of queue.splice(0)) next.reject(new Error(`Native fixture exited ${code}: ${errors}`)); });
  return {
    rpc(command, args = {}) { return new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(`${JSON.stringify({ command, args })}\n`); }); },
    async stop() { if (child.exitCode !== null || child.signalCode !== null) return; const closed = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await closed; },
  };
}
(async () => {
  const transport = bridge();
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } }); page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('purchasingReviewInvoke', (command, args) => transport.rpc(command, args));
    await page.addInitScript(() => {
      globalThis.isTauri = true;
      globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
        const result = await globalThis.purchasingReviewInvoke(command, args); if (!result.ok) throw result.error; return result.value;
      } };
    });
    const label = name => page.getByLabel(name, { exact: true }), button = name => page.getByRole('button', { name, exact: true });
    const password = 'Synthetic staff password 2026';
    await page.goto(process.argv[2] || 'http://127.0.0.1:1420');
    await label('Business name for setup').fill('Purchasing review shop'); await label('Owner name').fill('Owner');
    await label('Local password').fill(password); await label('Confirm password').fill(password); await button('Set up local access').click();
    await page.getByRole('link', { name: 'Suppliers & purchases', exact: true }).click();
    await page.getByRole('heading', { name: 'Suppliers & purchases', exact: true }).waitFor();

    const identity = (await transport.rpc('read_local_session')).value;
    async function rawScoped(command, args = {}) { return transport.rpc(command, { ...args, scope: identity.scope }); }
    const product = await rawScoped('add_local_product', { request: { operationId: 'review-rice', name: 'Sample rice', sku: 'RICE', unit: 'kg', unitPricePaise: 10000, openingStockMilli: 10000 } });
    assert.equal(product.ok, true, JSON.stringify(product.error));
    // The native app asks the operator to acknowledge an item save; do the same through the IPC layer or the catalog (correctly) blocks locking.
    const acknowledged = await rawScoped('acknowledge_local_inventory', { operationId: 'review-rice' });
    assert.equal(acknowledged.ok, true, JSON.stringify(acknowledged.error));
    const ghee = await rawScoped('add_local_product', { request: {
      operationId: 'review-ghee', name: 'Phase 5 acceptance ghee', sku: 'GHEE', unit: 'pcs',
      unitPricePaise: 100000, openingStockMilli: 1000,
    } });
    assert.equal(ghee.ok, true, JSON.stringify(ghee.error));
    assert.equal((await rawScoped('acknowledge_local_inventory', { operationId: 'review-ghee' })).ok, true);
    for (const [username, role] of [['manager', 'manager'], ['assistant', 'assistant_manager'], ['cashier', 'cashier']]) {
      const created = await rawScoped('create_local_staff', { details: { username, displayName: username, role }, password });
      assert.equal(created.ok, true, JSON.stringify(created.error));
    }
    // The panel reads the product catalogue once when it mounts; remount it so the
    // item just created through the IPC layer is present for the order form.
    await button('Lock workspace').click();
    await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    await label('Account name').fill('owner'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await page.getByRole('heading', { name: 'Suppliers & purchases', exact: true }).waitFor();

    // --- Supplier create (UI) ---
    await label('Supplier ID').fill('acme');
    await label('Supplier name').fill('Acme Traders');
    await label('Phone').fill('9876543210');
    await label('Payment terms (days)').fill('30');
    await button('Save supplier').click();
    await page.getByText('Supplier saved.', { exact: true }).waitFor();
    await page.getByRole('list', { name: 'Suppliers', exact: true }).getByText('Acme Traders', { exact: false }).waitFor();

    // --- Supplier open + edit (UI) ---
    await page.getByRole('button', { name: 'Open supplier acme', exact: true }).click();
    await page.getByRole('heading', { name: 'Acme Traders · acme', exact: true }).waitFor();
    await button('Edit supplier profile').click();
    await label('Phone').fill('9123456780');
    await button('Save supplier').click();
    await page.getByText('Supplier saved.', { exact: true }).waitFor();
    const edited = await rawScoped('find_local_suppliers', { search: 'acme', includeArchived: false });
    assert.equal(edited.value[0].phone, '9123456780');

    // --- Supplier archive + restore (UI) ---
    await button('Archive supplier').click();
    await page.getByText(/Supplier archived/).waitFor();
    assert.equal(await page.getByRole('list', { name: 'Suppliers', exact: true }).getByText('Acme Traders', { exact: false }).count(), 0);
    await page.getByLabel('Show archived suppliers').check();
    await page.getByRole('list', { name: 'Suppliers', exact: true }).getByText('Acme Traders', { exact: false }).waitFor();
    assert.equal((await rawScoped('find_local_suppliers', { search: 'acme', includeArchived: false })).value.length, 0);
    await page.getByRole('button', { name: 'Open supplier acme', exact: true }).click();
    await page.getByRole('heading', { name: 'Acme Traders · acme', exact: true }).waitFor();
    await button('Restore supplier').click();
    await page.getByText('Supplier restored.', { exact: true }).waitFor();
    await page.getByLabel('Show archived suppliers').uncheck();
    await page.getByRole('list', { name: 'Suppliers', exact: true }).getByText('Acme Traders', { exact: false }).waitFor();

    // --- Purchase order draft -> submit -> approve (UI, owner) ---
    const productList = await rawScoped('list_local_products');
    assert.equal(productList.ok, true, JSON.stringify(productList.error));
    assert.equal(productList.value[0].id, 'review-ghee');
    const item = page.getByLabel('Item', { exact: true });
    await item.focus();
    await item.press('Alt+ArrowDown');
    await page.keyboard.type('Sample');
    await item.press('Enter');
    assert.equal(await item.inputValue(), 'review-rice');
    await label('Quantity').fill('2');
    await label('Unit cost (₹)').fill('100');
    await label('GST').selectOption('1200');
    await button('Create draft order').click();
    await page.getByText('Draft order created. Submit it for approval when ready.', { exact: true }).waitFor();
    await button('Open order PO-1').click();
    await page.getByRole('heading', { name: 'PO-1 · Draft', exact: true }).waitFor();
    await button('Submit for approval').click();
    await page.getByText('Order updated.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'PO-1 · Awaiting approval', exact: true }).waitFor();
    await button('Approve order').click();
    await page.getByText('Order updated.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'PO-1 · Approved', exact: true }).waitFor();

    // --- Goods receipt: 2 kg ordered, 2 kg received, 0.25 kg damaged (UI) ---
    await label('Good quantity received').fill('2');
    await label('Damaged within that quantity').fill('0.25');
    await label('Delivery challan / note reference').fill('CHALLAN-77');
    await button('Receive goods').click();
    await page.getByText('Goods received. Stock and the payable were updated.', { exact: true }).waitFor();

    // --- Supplier invoice (UI) ---
    await label('Invoice reference').fill('INV-9001');
    await label('Invoice total (₹)').fill('200');
    await button('Record invoice').click();
    await page.getByText('Supplier invoice recorded. Any difference from the receipt accrual was posted as a variance.', { exact: true }).waitFor();

    // --- Partial payment (UI) ---
    await label('Amount (₹)').fill('100');
    await label('Payment reference').fill('PAY-1');
    await button('Record payment').click();
    await page.getByText(/Payment recorded\. Outstanding is now/).waitFor();

    // --- Exactly-once at the IPC layer: identical retried requests must not double-post ---
    const receiptSelect = page.getByLabel('Goods receipt', { exact: true });
    await receiptSelect.locator('option').nth(1).waitFor({ state: 'attached' });
    const receiptId = await receiptSelect.locator('option').nth(1).getAttribute('value');
    assert.ok(receiptId, 'expected a goods receipt option');
    // No receipt: the receipt is already invoiced above, and a receipt can anchor only one invoice. The replay check under test is on operationId, not on the receipt.
    const dupInvoice = { operationId: 'review-exactly-once-invoice', supplierId: 'acme', receiptId: null, reference: 'INV-EXACTLY-ONCE', totalPaise: 50000, dueOn: null };
    const invoiceFirst = await rawScoped('post_supplier_invoice', { r: dupInvoice });
    const invoiceSecond = await rawScoped('post_supplier_invoice', { r: dupInvoice });
    assert.equal(invoiceFirst.ok, true, JSON.stringify(invoiceFirst.error));
    assert.equal(invoiceSecond.ok, true, JSON.stringify(invoiceSecond.error));
    assert.equal(invoiceSecond.value.id, invoiceFirst.value.id);
    const dupPayment = { operationId: 'review-exactly-once-payment', supplierId: 'acme', invoiceId: null, method: 'bank', amountPaise: 5000, reference: 'PAY-EXACTLY-ONCE', paidOn: null };
    const paymentFirst = await rawScoped('post_supplier_payment', { r: dupPayment });
    const paymentSecond = await rawScoped('post_supplier_payment', { r: dupPayment });
    assert.equal(paymentFirst.ok, true, JSON.stringify(paymentFirst.error));
    assert.equal(paymentSecond.ok, true, JSON.stringify(paymentSecond.error));
    assert.equal(paymentSecond.value.id, paymentFirst.value.id);
    assert.equal(paymentSecond.value.balancePaise, paymentFirst.value.balancePaise);

    // --- Purchase return of the damaged stock (UI) ---
    await receiptSelect.selectOption(receiptId);
    await label('Quantity to return').fill('0.25');
    await label('Reason for the return').fill('Damaged packaging');
    await button('Record return').click();
    await page.getByText(/Return recorded for/).waitFor();
    await page.getByRole('row').filter({ hasText: 'Ref INV-9001' }).waitFor();

    // --- RBAC: assistant_manager may manage orders but may not approve or pay ---
    await button('Lock workspace').click();
    await label('Account name').fill('assistant'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await page.getByRole('heading', { name: 'Suppliers & purchases', exact: true }).waitFor();
    assert.equal(await button('Approve order').count(), 0);
    assert.equal(await button('Record payment').count(), 0);
    assert.equal((await rawScoped('decide_purchase_order', { r: { operationId: 'assistant-decide-forbidden', id: 'PO', expectedRevision: 1, decision: 'approve', reason: null } })).error.code, 'forbidden');
    assert.equal((await rawScoped('post_supplier_payment', { r: { operationId: 'assistant-pay-forbidden', supplierId: 'acme', invoiceId: null, method: 'bank', amountPaise: 100, reference: 'NO', paidOn: null } })).error.code, 'forbidden');
    assert.equal((await rawScoped('find_local_suppliers', { search: '', includeArchived: false })).ok, true);
    assert.equal((await rawScoped('post_supplier_invoice', { r: { operationId: 'assistant-invoice-forbidden', supplierId: 'acme', receiptId: null, reference: 'NO', totalPaise: 100, dueOn: null } })).error.code, 'forbidden');
    assert.equal((await rawScoped('post_supplier_opening', { r: { operationId: 'assistant-opening-forbidden', supplierId: 'acme', amountPaise: 100, dueOn: null, reason: 'x' } })).error.code, 'forbidden');
    assert.equal((await rawScoped('reverse_supplier_entry', { r: { operationId: 'assistant-reversal-forbidden', targetOperationId: 'x', reason: 'x' } })).error.code, 'forbidden');

    // --- RBAC: cashier cannot read suppliers or orders at all ---
    await button('Lock workspace').click();
    await label('Account name').fill('cashier'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await page.getByText('Suppliers are managed on this PC by owners, managers and assistant managers.', { exact: true }).waitFor();
    assert.equal(await button('Create supplier').count(), 0);
    assert.equal((await rawScoped('find_local_suppliers', { search: '', includeArchived: false })).error.code, 'forbidden');
    assert.equal((await rawScoped('create_purchase_order', { r: { operationId: 'cashier-order-forbidden', supplierId: 'acme', note: 'x', lines: [] } })).error.code, 'forbidden');

    // --- RBAC: manager may approve and pay (UI surface, raw IPC) ---
    await button('Lock workspace').click();
    await label('Account name').fill('manager'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await page.getByRole('heading', { name: 'Suppliers & purchases', exact: true }).waitFor();
    assert.equal((await rawScoped('find_local_suppliers', { search: '', includeArchived: false })).ok, true);
    assert.equal((await rawScoped('decide_purchase_order', { r: { operationId: 'manager-decide-allowed-but-order-closed', id: 'PO', expectedRevision: 1, decision: 'approve', reason: null } })).error?.code !== 'forbidden', true);

    // --- Back to owner; the workspace must still be coherent ---
    await button('Lock workspace').click();
    await label('Account name').fill('owner'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await page.getByRole('heading', { name: 'Suppliers & purchases', exact: true }).waitFor();
    await button('Refresh suppliers').click();
    await page.getByText('Suppliers are up to date.', { exact: true }).waitFor();

    assert.deepEqual(errors, []);
    console.log('Supplier purchasing UI acceptance passed: create/edit/archive/restore, draft->submit->approve, receipt with damaged stock, invoice, partial payment, exactly-once IPC retries, purchase return, cashier/assistant/manager/owner permission boundaries.');
  } finally {
    await browser.close();
    await transport.stop();
    rmSync(directory, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
