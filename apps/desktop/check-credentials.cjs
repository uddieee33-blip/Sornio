/* Actual React -> scoped Workspace/SQLCipher credential controls; synthetic data only. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const directory = mkdtempSync(join(tmpdir(), 'sornio-credentials-'));
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
const OLD = 'Synthetic original password', STAFF = 'Synthetic staff replacement', NEXT = 'Synthetic owner replacement', LAST = 'Synthetic final replacement';
function bridge() {
  const child = spawn(binary, [join(directory, 'synthetic.db')]); const queue = [];
  child.stderr.on('data', () => {});
  createInterface({ input: child.stdout }).on('line', line => queue.shift()?.resolve(JSON.parse(line)));
  child.on('error', error => { for (const q of queue.splice(0)) q.reject(error); });
  child.on('exit', () => { for (const q of queue.splice(0)) q.reject(new Error('Native test fixture stopped')); });
  return { rpc(command, args = {}) { return new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify({ command, args }) + '\n'); }); }, async stop() { if (child.exitCode !== null || child.signalCode !== null) return; const exited = new Promise(r => child.once('exit', r)); child.kill('SIGKILL'); await exited; } };
}
(async () => {
  const transport = bridge(), other = bridge(); let browser;
  try {
    async function native(command, args = {}) { const r = await transport.rpc(command, args); assert.equal(r.ok, true, r.error?.code); return r.value; }
    await native('setup_local_access', { setup: { businessName: 'Synthetic shop', businessType: 'general', displayName: 'Owner', username: 'owner' }, password: OLD });
    const identity = await native('read_local_session'), scope = identity.scope;
    const person = await native('create_local_staff', { scope, details: { username: 'cashier', displayName: 'Cashier', role: 'cashier' }, password: OLD });
    assert.equal((await other.rpc('unlock_workspace', { username: 'cashier', password: OLD })).ok, true);
    browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
    const page = await browser.newPage(); page.setDefaultTimeout(20000);
    let loseReply = true, loseResetReply = false, writes = 0;
    await page.exposeFunction('credentialReviewInvoke', async (command, args) => {
      const r = await transport.rpc(command, args);
      if (command === 'change_local_password' && r.ok) { writes++; if (loseReply) { loseReply = false; return { ok: false, error: { code: 'unavailable', message: 'Synthetic committed credential reply lost' } }; } }
      if (command === 'reset_local_staff_password' && r.ok && loseResetReply) { loseResetReply = false; return { ok: false, error: { code: 'unavailable', message: 'Synthetic committed staff reset reply lost' } }; }
      return r;
    });
    await page.addInitScript(() => { globalThis.isTauri = true; globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => { const r = await globalThis.credentialReviewInvoke(command, args); if (!r.ok) throw r.error; return r.value; } }; });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const label = name => page.getByLabel(name, { exact: true }), button = name => page.getByRole('button', { name, exact: true });
    async function login(username, password) { await label('Account name').fill(username); await label('Local password').fill(password); await button('Unlock workspace').click(); await page.getByRole('heading', { name: 'Passwords & access', exact: true }).waitFor(); }
    async function change(current, next) { await label('Current account password').fill(current); await label('New account password').fill(next); await label('Confirm new account password').fill(next); await button('Change my password and lock').click(); }
    await page.goto(process.argv[2] || 'http://127.0.0.1:1420'); await login('owner', OLD);
    await label('Business name').fill('Unsaved draft'); assert.equal(await button('Change my password and lock').isDisabled(), true); await label('Business name').fill('');
    await label('Staff account to reset').selectOption(person.id);
    await label('Owner password for reset').fill(OLD); await label('New staff password').fill(STAFF); await label('Confirm new staff password').fill(STAFF);
    await button('Reset staff password').click(); await page.getByRole('status').filter({ hasText: 'Staff password reset.' }).waitFor();
    for (const name of ['Owner password for reset', 'New staff password', 'Confirm new staff password']) assert.equal(await label(name).inputValue(), '');
    assert.equal((await other.rpc('list_local_products', { scope })).error.code, 'locked');
    assert.equal((await other.rpc('unlock_workspace', { username: 'cashier', password: STAFF })).ok, true);
    assert.equal((await other.rpc('reset_local_staff_password', { scope, id: identity.principal.id, expectedRevision: 1, ownerPassword: OLD, newPassword: NEXT })).error.code, 'forbidden');
    loseResetReply = true;
    await label('Owner password for reset').fill(OLD); await label('New staff password').fill(LAST); await label('Confirm new staff password').fill(LAST);
    await button('Reset staff password').click(); await page.getByRole('alert').filter({ hasText: 'could not be confirmed' }).waitFor();
    for (const name of ['Owner password for reset', 'New staff password', 'Confirm new staff password']) assert.equal(await label(name).inputValue(), '');
    await button('Reload staff password accounts').click(); await page.getByRole('status').filter({ hasText: 'Staff password accounts refreshed.' }).waitFor();
    assert.equal((await other.rpc('list_local_products', { scope })).error.code, 'locked');
    assert.equal((await other.rpc('unlock_workspace', { username: 'cashier', password: LAST })).ok, true);
    await label('Current account password').fill(OLD); await label('New account password').fill(NEXT); await label('Confirm new account password').fill(LAST);
    await button('Change my password and lock').click(); await page.getByRole('alert').filter({ hasText: 'do not match' }).waitFor(); assert.equal(writes, 0);
    await label('Confirm new account password').fill(NEXT); await button('Change my password and lock').click();
    await page.getByRole('alert').filter({ hasText: 'could not be confirmed' }).waitFor();
    for (const name of ['Current account password', 'New account password', 'Confirm new account password']) assert.equal(await label(name).inputValue(), '');
    await button('Lock workspace').click(); await label('Local password').fill(OLD); await button('Unlock workspace').click(); await page.getByRole('alert').filter({ hasText: 'did not unlock' }).waitFor();
    await login('owner', NEXT); await change(NEXT, LAST); await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor(); await login('owner', LAST);
    await button('Lock workspace').click(); await login('cashier', LAST);
    assert.equal(await button('Reset staff password').count(), 0);
    await change(LAST, NEXT); await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor(); await login('cashier', NEXT);
    assert.equal(writes, 3); assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(errors, []);
    console.log('Credential React/native integration passed: dirty-work guard, owner fresh-auth staff reset, revoked second session, cashier reset denial, mismatch refusal, lost committed reply/relogin recovery, owner/staff rotation, cleared secret inputs and empty browser storage.');
  } finally { if (browser) await browser.close(); await transport.stop(); await other.stop(); rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
