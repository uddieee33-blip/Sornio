/* Actual React -> Workspace/SQLCipher inventory receipt recovery. No financial engine mock. */
/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CI runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const directory = mkdtempSync(join(tmpdir(), 'sornio-inventory-recovery-'));
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
const password = 'Synthetic inventory recovery password';
let child, queue = [], browser, scope;
function start() {
  child = spawn(binary, [join(directory, 'synthetic.db')]);
  child.on('exit', () => { for (const q of queue.splice(0)) q.reject(new Error('Native fixture stopped')); });
  child.stderr.on('data', () => {});
  createInterface({ input: child.stdout }).on('line', line => queue.shift()?.resolve(JSON.parse(line)));
}
function rpc(command, args = {}) { return new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify({ command, args }) + '\n'); }); }
async function native(command, args = {}) { const r = await rpc(command, { ...args, scope }); assert.equal(r.ok, true, JSON.stringify(r.error)); return r.value; }
async function stop() { if (child && child.exitCode === null && child.signalCode === null) { const exited = new Promise(r => child.once('exit', r)); child.kill('SIGKILL'); await exited; } }
(async () => {
  start();
  await native('setup_local_access', { setup: { businessName: 'Synthetic inventory', businessType: 'kirana', displayName: 'Owner', username: 'owner' }, password });
  scope = (await native('read_local_session')).scope;
  await native('add_local_product', { request: { operationId: 'rice', name: 'Recovery rice', sku: 'RICE', unit: 'kg', unitPricePaise: 10000, openingStockMilli: 10000 } });
  await native('acknowledge_local_inventory', { operationId: 'rice' });
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const page = await browser.newPage();page.setDefaultTimeout(15000);
  let loseStock = true, loseAck = false, original;
  await page.exposeFunction('inventoryReviewInvoke', async (command, args) => {
    const result = await rpc(command, args);
    if (command === 'adjust_local_stock' && loseStock && result.ok) {
      loseStock = false; original = structuredClone(args.request);
      return { ok: false, error: { code: 'unavailable', message: 'Synthetic committed stock reply lost' } };
    }
    if (command === 'acknowledge_local_inventory' && loseAck && result.ok) {
      loseAck = false;return { ok: false, error: { code: 'unavailable', message: 'Synthetic acknowledgement reply lost' } };
    }
    return result;
  });
  await page.addInitScript(() => {
    globalThis.isTauri = true;
    globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => { const r = await globalThis.inventoryReviewInvoke(command, args); if (!r.ok) throw r.error; return r.value; } };
  });
  const button = name => page.getByRole('button', { name, exact: true });
  const label = name => page.getByLabel(name, { exact: true });
  const errors = [];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2] || 'http://127.0.0.1:1420');
  await label('Local password').fill(password);await button('Unlock workspace').click();
  await label('Item to adjust').selectOption('rice');await label('Quantity change').fill('2');await label('Reason for stock change').fill('One delivery');await button('Save stock change').click();
  await button('Retry item save').waitFor();assert.equal((await native('list_local_products'))[0].stockMilli,12000);
  assert.equal((await native('pending_local_inventory')).operationId,original.operationId);
  await stop();start();await page.reload();await label('Local password').fill(password);await button('Unlock workspace').click();
  await button('Acknowledge item save').waitFor();assert.equal(await button('Retry item save').count(),0);assert.equal(await button('Save stock change').isDisabled(),true);
  assert.equal((await native('pending_local_inventory')).operationId,original.operationId);
  assert.equal((await native('adjust_local_stock',{request:original})).stockMilli,12000);
  const replacement=await rpc('adjust_local_stock',{scope,request:{...original,operationId:'replacement'}});assert.equal(replacement.ok,false);
  loseAck=true;await button('Acknowledge item save').click();await page.getByRole('alert').filter({hasText:'acknowledgement reply lost'}).waitFor();
  assert.equal(await button('Save stock change').isDisabled(),true);await button('Acknowledge item save').click();await page.getByText('Saved item change acknowledged.',{exact:true}).waitFor();
  assert.equal(await native('pending_local_inventory'),null);assert.equal((await native('list_local_products'))[0].stockMilli,12000);
  await button('Lock workspace').click();await label('Local password').fill(password);await button('Unlock workspace').click();await label('Item to adjust').waitFor();assert.equal(await button('Acknowledge item save').count(),0);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  console.log('Inventory React/native recovery passed: committed reply loss, native process kill/restart, exact receipt replay, replacement-ID refusal, lost acknowledgement/retry, unlock recovery and unchanged stock.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close();await stop();rmSync(directory,{recursive:true,force:true}); });
