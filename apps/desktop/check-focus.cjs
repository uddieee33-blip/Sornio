/* Real React -> native Workspace/SQLCipher. Delays a read response to force
 * focus races; it does not simulate native authorization or financial writes. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const directory = mkdtempSync(join(tmpdir(), 'sornio-focus-'));
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
const child = spawn(binary, [join(directory, 'synthetic.db')]);
const queue = [];
child.stderr.on('data', () => {});
child.on('error', error => { for (const q of queue.splice(0)) q.reject(error); });
child.on('exit', () => { for (const q of queue.splice(0)) q.reject(new Error('Native focus fixture stopped')); });
createInterface({ input: child.stdout }).on('line', line => queue.shift()?.resolve(JSON.parse(line)));
function rpc(command, args = {}) { return new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify({ command, args }) + '\n'); }); }
(async () => {
  let browser, releaseInitial;
  const initialRead = new Promise(resolve => { releaseInitial = resolve; });
  let initialReleased = false;
  try {
    const password = 'Synthetic focus review password';
    async function native(command, args = {}) { const r = await rpc(command, args); assert.equal(r.ok, true, r.error?.code); return r.value; }
    await native('setup_local_access', { setup: { businessName: 'Focus review shop', businessType: 'general', displayName: 'Owner', username: 'owner' }, password });
    const { scope } = await native('read_local_session');
    await native('save_workspace', { scope, expectedRevision: 0, draft: { businessName: 'Focus review shop', businessType: 'general', note: 'Original note' } });
    browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
    const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } }); page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('focusReviewInvoke', async (command, args) => {
      const r = await rpc(command, args);
      if (command === 'read_cashier_state' && !initialReleased) await initialRead;
      return r;
    });
    await page.addInitScript(() => {
      globalThis.isTauri = true;
      globalThis.focusReviewReads = 0;
      globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
        if (command === 'read_cashier_state') globalThis.focusReviewReads++;
        const r = await globalThis.focusReviewInvoke(command, args); if (!r.ok) throw r.error; return r.value;
      } };
    });
    const label = name => page.getByLabel(name, { exact: true }), button = name => page.getByRole('button', { name, exact: true });
    const note = label('Workspace note'), search = label('Search items for sale');
    await page.goto(process.argv[2] || 'http://127.0.0.1:1420');
    await label('Local password').fill(password); await button('Unlock workspace').click();
    await page.getByText('Your saved draft is ready on this PC.', { exact: true }).waitFor();
    await page.waitForFunction(() => globalThis.focusReviewReads > 0);
    await note.focus(); await note.press('End');
    initialReleased = true; releaseInitial();
    await page.getByText('Checkout is ready. Totals are previews until the sale is saved.', { exact: true }).waitFor();
    // Let the readiness render and its passive focus effect both finish.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.type(' + intended edit');
    const observed = { activeId: await page.evaluate(() => document.activeElement?.id), note: await note.inputValue(), search: await search.inputValue(), saveDisabled: await button('Save local draft').isDisabled() };
    console.log('Delayed checkout readiness:', JSON.stringify(observed));
    assert.equal(observed.activeId, 'workspace-note', 'checkout readiness stole focus from an active editor');
    assert.equal(observed.note, 'Original note + intended edit');
    assert.equal(observed.search, ''); assert.equal(observed.saveDisabled, false);
    await button('Save local draft').click();
    await page.getByText('Saved to this PC. You can close and reopen Sornio.', { exact: true }).waitFor();
    assert.equal((await native('load_workspace', { scope })).draft.note, observed.note);

    // An explicit checkout refresh still returns the cashier to item search.
    await button('Refresh checkout').click();
    await page.waitForFunction(() => document.activeElement?.id === 'checkout-search');
    // Keyboard navigation remains explicit and works after visiting another form.
    await note.focus(); await button('Refresh checkout').focus(); await page.keyboard.press('F2');
    await page.waitForFunction(() => document.activeElement?.id === 'checkout-search');
    assert.deepEqual(errors, []);
    assert.equal((await native('list_local_invoices', { scope, after: 0 })).length, 0);
    console.log('Native focus integration passed: delayed checkout preserves active typing and save, explicit cashier refresh/F2 focus, no invoice created.');
  } finally {
    releaseInitial();
    if (browser) await browser.close();
    if (child.exitCode === null && child.signalCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await done; }
    rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
