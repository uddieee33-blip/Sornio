/* React -> authorized native Workspace/SQLCipher. Raw calls deliberately bypass UI permissions. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const directory = mkdtempSync(join(tmpdir(), 'sornio-identity-'));
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
function bridge() {
  const child = spawn(binary, [join(directory, 'synthetic.db')], { stdio: ['pipe', 'pipe', 'pipe'] });
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
  const transport = bridge(), administrator = bridge();
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } }); page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('identityReviewInvoke', (command, args) => transport.rpc(command, args));
    await page.addInitScript(() => {
      globalThis.isTauri = true;
      globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
        const result = await globalThis.identityReviewInvoke(command, args); if (!result.ok) throw result.error; return result.value;
      } };
    });
    const label = name => page.getByLabel(name, { exact: true }), button = name => page.getByRole('button', { name, exact: true });
    const password = 'Synthetic staff password 2026';
    await page.goto(process.argv[2] || 'http://127.0.0.1:1420');
    await label('Business name for setup').fill('Identity review shop'); await label('Owner name').fill('Owner');
    await label('Local password').fill(password); await label('Confirm password').fill(password); await button('Set up local access').click();
    await page.getByRole('heading', { name: 'Staff access', exact: true }).waitFor();
    const identity = (await transport.rpc('read_local_session')).value;
    async function expectRevocationLock() {
      const locked = page.getByRole('heading', { name: 'Welcome back.', exact: true });
      // An in-flight read can observe revocation before the explicit refresh.
      if (!await locked.isVisible()) {
        try { await button('Refresh checkout').click({ timeout: 1500 }); }
        catch (error) { if (!await locked.isVisible()) throw error; }
      }
      await locked.waitFor();
    }
    async function raw(command, args = {}, scope = identity.scope) {
      return page.evaluate(async ({ command, args, scope }) => {
        try { return { ok: true, value: await globalThis.__TAURI_INTERNALS__.invoke(command, { ...args, scope }) }; }
        catch (error) { return { ok: false, code: error.code }; }
      }, { command, args, scope });
    }
    async function admin(command, args = {}) { const reply = await administrator.rpc(command, { ...args, scope: identity.scope }); assert.equal(reply.ok, true, JSON.stringify(reply.error)); return reply.value; }
    await admin('unlock_workspace', { username: 'owner', password });
    const item = { operationId: 'rice', name: 'Rice', sku: 'RICE', unit: 'kg', unitPricePaise: 10000, openingStockMilli: 10000 };
    assert.equal((await raw('add_local_product', { request: item })).ok, true);
    for (const [username, role] of [['manager', 'manager'], ['assistant', 'assistant_manager'], ['cashier', 'cashier']]) {
      await label('Staff name').fill(username); await label('Staff account name').fill(username); await label('Staff role').selectOption(role); await label('Staff password').fill(password);
      await button('Create staff account').click(); await button(`Disable ${username}`).waitFor(); assert.equal(await label('Staff password').inputValue(), '');
    }
    assert.equal((await raw('list_local_staff')).value.length, 4);
    assert.equal((await raw('load_workspace', {}, { businessId: 'wrong', workspaceId: identity.scope.workspaceId })).code, 'workspace_mismatch');
    for (const [username, canAdd, canCorrect, reports] of [['manager', true, true, true], ['assistant', true, false, false], ['cashier', false, false, false]]) {
      await button('Lock workspace').click(); await label('Account name').fill(username); await label('Local password').fill(password); await button('Unlock workspace').click();
      await button('Refresh checkout').waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Staff access', exact: true }).count(), 0);
      assert.equal(await label('Business name').count(), 0);
      assert.equal(await label('Item name').count(), canAdd ? 1 : 0); assert.equal(await label('Quantity change').count(), canCorrect ? 1 : 0);
      const state = (await raw('read_cashier_state')).value; assert.equal(state.reportsAllowed, reports);
      assert.equal((await raw('list_local_invoices', { after: 0 })).ok, reports);
      assert.equal((await raw('list_local_staff')).code, 'forbidden');
      assert.equal((await raw('read_identity_audit', { after: 0 })).code, 'forbidden');
      assert.equal((await raw('save_workspace', { expectedRevision: 0, draft: { businessName: 'Forged', businessType: 'general', note: '' } })).code, 'forbidden');
      assert.equal((await raw('create_local_staff', { details: { username: 'forged', displayName: 'Forged', role: 'owner' }, password })).code, 'forbidden');
      if (!canCorrect) assert.equal((await raw('adjust_local_stock', { request: { operationId: 'bad', productId: 'rice', expectedRevision: 1, deltaMilli: 1000, reason: 'Bypass' } })).code, 'forbidden');
    }
    assert.equal(await page.getByText('Cash recorded:', { exact: false }).count(), 0);
    await button('Add Rice to sale').click(); await button('Review sale').click(); await button('Confirm sale').click();
    await page.getByRole('heading', { name: 'Sale saved on this PC', exact: true }).waitFor();
    assert.ok(await label('Saved invoice ID').inputValue()); await button('Start next sale').click();
    const staff = await admin('list_local_staff'), cashier = staff.find(p => p.username === 'cashier');
    const manager = await admin('change_local_staff', { change: { id: cashier.id, expectedRevision: cashier.revision, role: 'manager', enabled: true } });
    await expectRevocationLock();
    assert.equal(await label('Saved invoice ID').count(), 0);
    await label('Account name').fill('cashier'); await label('Local password').fill(password); await button('Unlock workspace').click();
    await label('Quantity change').waitFor(); await page.getByText('Cash recorded: ₹100.00', { exact: true }).waitFor();
    await admin('change_local_staff', { change: { id: manager.id, expectedRevision: manager.revision, role: 'cashier', enabled: false } });
    await expectRevocationLock();
    await label('Local password').fill(password); await button('Unlock workspace').click(); await page.getByRole('alert').filter({ hasText: 'did not unlock' }).waitFor();
    assert.equal(await button('Refresh checkout').count(), 0); assert.equal(await label('Local password').inputValue(), '');
    const audit = await admin('read_identity_audit', { after: 0 }); assert.ok(audit.some(e => e.action === 'authorization.denied')); assert.ok(audit.some(e => e.action === 'staff.changed'));
    assert.equal(JSON.stringify(audit).includes(password), false);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(errors, []);
    console.log('Native authorization UI integration passed: owner provisioning, all staff roles, cashier sale, raw IPC denials, scope mismatch, native report redaction, role-change session revocation, disabled login refusal and append-only audit attribution.');
  } finally { await browser.close(); await transport.stop(); await administrator.stop(); rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
