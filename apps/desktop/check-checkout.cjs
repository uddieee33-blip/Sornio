/* React -> test transport -> real authorized Workspace/SQLCipher integration.
 * No financial engine is mocked. Actual Tauri IPC/Windows UI is check-native.py.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const baseUrl = process.argv[2] || 'http://127.0.0.1:1420';
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
const directory = mkdtempSync(join(tmpdir(), 'sornio-checkout-ui-'));
const database = join(directory, 'synthetic.db');
let child, queue = [], stderr = '';
function startBridge() {
  child = spawn(binary, [database], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.on('exit', () => { for (const request of queue.splice(0)) request.reject(new Error('Native review fixture exited.')); });
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
  const reply = await rpc(command, args); if (!reply.ok) throw new Error(JSON.stringify(reply.error)); return reply.value;
}
async function stopBridge() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await stopped;
}
(async () => {
  startBridge();
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
    page.setDefaultTimeout(15000);
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    let holdPost, releasePost, losePost = false, losePrepare = false, failRead = false, failAfterPost = false, failInventoryRead = false;
    let holdNextRead = false, releaseRead, readHeld;
    const heldRead = new Promise(resolve => { releaseRead = resolve; });
    const readReady = new Promise(resolve => { readHeld = resolve; });
    await page.exposeFunction('nativeReviewInvoke', async (command, args) => {
      calls.push({ command, args: structuredClone(args) });
      if (command === 'post_local_invoice' && holdPost) await holdPost;
      if (command === 'list_local_products' && failInventoryRead) { failInventoryRead = false; return { ok: false, error: { code: 'unavailable', message: 'Injected inventory read interruption.' } }; }
      if (command === 'read_cashier_state' && failRead) { failRead = false; return { ok: false, error: { code: 'unavailable', message: 'Injected read interruption.' } }; }
      const reply = await rpc(command, args);
      if (command === 'read_cashier_state' && holdNextRead) {
        holdNextRead = false; readHeld(); await heldRead;
      }
      if (command === 'prepare_local_checkout' && losePrepare) { losePrepare = false; return { ok: false, error: { code: 'unavailable', message: 'Prepare reply was lost. Retry the same sale.' } }; }
      if (command === 'post_local_invoice' && reply.ok) {
        if (failAfterPost) { failAfterPost = false; failRead = true; failInventoryRead = true; }
        if (losePost) { losePost = false; return { ok: false, error: { code: 'unavailable', message: 'Posting reply was lost. Retry the same sale.' } }; }
      }
      return reply;
    });
    await page.addInitScript(() => {
      globalThis.isTauri = true;
      globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
        const result = await globalThis.nativeReviewInvoke(command, args);
        if (command === 'read_cashier_state') globalThis.reviewCashierReads = (globalThis.reviewCashierReads || 0) + 1;
        if (!result.ok) throw result.error;
        return result.value;
      } };
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const label = name => page.getByLabel(name, { exact: true });
    const saved = () => page.getByRole('heading', { name: 'Sale saved on this PC', exact: true });
    const alert = text => page.getByRole('alert').filter({ hasText: text });
    const password = 'Review checkout password';
    await page.goto(baseUrl);
    await label('Local password').fill(password); await label('Confirm password').fill(password);
    await button('Set up local access').click();
    await label('Item name').fill('Review rice'); await label('Item code (optional)').fill('RICE');
    await label('Stock unit').selectOption('kg'); await label('Unit price (₹)').fill('42.50'); await label('Opening stock').fill('10');
    await page.getByText('Checkout is ready. Totals are previews until the sale is saved.', { exact: true }).waitFor();
    holdNextRead = true;
    await button('Save item on this PC').click();
    await page.getByText('Saved item changes to this PC.', { exact: true }).waitFor();
    await readReady;
    for (const [id, name, unit, price, stock] of [['oil','Review oil','litre',10000,5000],['cloth','Review cloth','metre',1999,3000],['widget','Review widget','pcs',199,2000]]) {
      await native('add_local_product', { request: { operationId: id, name, sku: id.toUpperCase(), unit, unitPricePaise: price, openingStockMilli: stock } });
    }
    await button('Refresh checkout').click();
    await page.getByText('Cash recorded: ₹0.00', { exact: true }).waitFor();
    await button('Add Review oil to sale').waitFor();
    const readsBeforeRelease = await page.evaluate(() => globalThis.reviewCashierReads);
    releaseRead();
    await page.waitForFunction(before => globalThis.reviewCashierReads > before, readsBeforeRelease);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await button('Add Review oil to sale').count(), 1, 'An old background read replaced the newer explicit checkout snapshot');
    async function add(name, unit, quantity) {
      await label('Search items for sale').fill(name);
      await button(`Add ${name} to sale`).click();
      await label(`Quantity for ${name} (${unit})`).fill(quantity);
    }
    await add('Review rice','kg','1.250'); await label('Tax (%)').fill('5.00');
    await page.getByText('Total: ₹55.79', { exact: true }).waitFor();
    await button('Lock workspace').click(); await button('Continue editing').click();
    assert.equal(await label('Quantity for Review rice (kg)').inputValue(),'1.250');
    await label('Quantity for Review rice (kg)').fill('1.2501');
    assert.equal(await button('Review sale').isDisabled(),true);
    await label('Quantity for Review rice (kg)').fill('11');
    assert.equal(await button('Review sale').isDisabled(),true);
    await label('Quantity for Review rice (kg)').fill('1.250');
    holdPost = new Promise(resolve => { releasePost = resolve; }); losePost = true;
    await button('Review sale').click(); await button('Confirm sale').click();
    await page.getByText('Confirming sale on this PC…',{exact:true}).waitFor();
    assert.equal(await saved().count(),0);
    assert.equal((await native('list_local_invoices',{after:0})).length,0);
    assert.equal(await button('Lock workspace').isDisabled(),true);
    releasePost(); holdPost = null;
    await alert('Posting reply was lost').waitFor();
    assert.equal(await saved().count(),0);
    await button('Retry same sale').click(); await saved().waitFor();
    const firstId = await label('Saved invoice ID').inputValue();
    assert.match(firstId,/^[a-f0-9-]{36}$/);
    assert.equal(await label('Saved invoice ID').getAttribute('readonly'),'');
    await page.getByText('Cash recorded: ₹55.79',{exact:true}).waitFor();
    await page.getByRole('list',{name:'Saved local items'}).getByText('8.75 kg',{exact:true}).waitFor();
    const firstRequest = calls.find(call=>call.command==='post_local_invoice').args.request;
    assert.deepEqual(Object.keys(firstRequest.lines[0]).sort(),['expectedRevision','productId','quantityMilli']);
    assert.equal(firstRequest.operationId,firstId);
    const cashAttempts = calls.filter(call=>call.command==='post_local_invoice'&&call.args.request.operationId===firstId);
    assert.equal(cashAttempts.length,2); assert.deepEqual(cashAttempts[0].args,cashAttempts[1].args);
    await button('Start next sale').click();
    await add('Review rice','kg','0.750'); await label('Transaction type').selectOption('credit');
    assert.equal(await button('Review sale').isDisabled(),true);
    await label('Credit customer reference').fill('customer-1');
    assert.deepEqual(await label('Transaction type').locator('option').allTextContents(),['Cash','Credit']);
    losePost = true;
    await button('Review sale').click(); await button('Confirm sale').click();
    await alert('Posting reply was lost').waitFor();
    assert.equal(await saved().count(),0);
    assert.equal(await label('Quantity for Review rice (kg)').isDisabled(),true);
    assert.equal((await native('list_local_invoices',{after:0})).length,2);
    const uncertain = calls.filter(call=>call.command==='post_local_invoice').at(-1).args.request;
    await stopBridge(); startBridge(); await page.reload();
    await label('Local password').fill(password); await button('Unlock workspace').click();
    await saved().waitFor();
    assert.equal(await label('Saved invoice ID').inputValue(),uncertain.operationId);
    const attempts = calls.filter(call=>call.command==='post_local_invoice'&&call.args.request.operationId===uncertain.operationId);
    assert.equal(attempts.length,1); // Restart recovers the durable receipt without posting again.
    const creditState = await native('read_cashier_state');
    assert.equal(creditState.products.find(p=>p.sku==='RICE').stockMilli,8000);
    assert.deepEqual(creditState.balances,{cashPaise:'5579',creditPaise:'3188'});
    await page.getByText('Credit receivable: ₹31.88',{exact:true}).waitFor();
    await button('Start next sale').click();

    // Prepare reply loss: no posting was invoked, but the durable request must
    // survive both the window reload and forced native-process termination.
    await add('Review oil','litre','1.250'); losePrepare = true;
    await button('Review sale').click(); await button('Confirm sale').click();
    await alert('Prepare reply was lost').waitFor();
    const prepared = (await native('read_cashier_state')).checkout.request;
    assert.equal((await native('list_local_invoices',{after:0})).length,2);
    await stopBridge(); startBridge(); await page.reload();
    await page.getByRole('heading',{name:'Welcome back.',exact:true}).waitFor();
    assert.equal(await label('Saved invoice ID').count(),0);
    assert.equal((await rpc('read_cashier_state')).error.code,'locked');
    await label('Local password').fill(password); await button('Unlock workspace').click();
    await button('Retry same sale').waitFor();
    await button('Retry same sale').click(); await saved().waitFor();
    assert.equal(await label('Saved invoice ID').inputValue(),prepared.operationId);
    assert.deepEqual(calls.filter(call=>call.command==='post_local_invoice').at(-1).args.request,prepared);
    assert.deepEqual((await native('read_cashier_state')).balances,{cashPaise:'18079',creditPaise:'3188'});
    await button('Start next sale').click();

    await add('Review cloth','metre','0.500');
    await native('adjust_local_stock',{request:{operationId:'other-window',productId:'cloth',expectedRevision:1,deltaMilli:1000,reason:'Counted delivery'}});
    await button('Review sale').click(); await button('Confirm sale').click();
    await alert('Another window changed this stock').waitFor();
    assert.equal((await native('list_local_invoices',{after:0})).length,3);
    await button('Edit refused sale').click();
    await page.getByText('Checkout is ready. Totals are previews until the sale is saved.',{exact:true}).waitFor();
    await button('Review sale').click(); await button('Confirm sale').click(); await saved().waitFor();
    assert.equal((await native('list_local_invoices',{after:0})).length,4);
    await button('Start next sale').click();

    await add('Review widget','pcs','0.125'); failAfterPost = true;
    await button('Review sale').click(); await button('Confirm sale').click();
    await alert('Sale was saved.').waitFor(); await saved().waitFor();
    await alert('Injected inventory read interruption.').waitFor();
    assert.equal(await button('Save item on this PC').isDisabled(),true);
    assert.equal(await button('Start next sale').isDisabled(),true);
    assert.equal(await button('Retry same sale').count(),0);
    const finalId = await label('Saved invoice ID').inputValue();
    await button('Refresh checkout').click();
    await page.getByText('Cash recorded: ₹191.04',{exact:true}).waitFor();
    await page.getByRole('list',{name:'Saved local items'}).getByText('1.875 pcs',{exact:true}).waitFor();
    assert.equal(await button('Save item on this PC').isDisabled(),false);
    assert.equal(await label('Saved invoice ID').inputValue(),finalId);
    assert.equal((await native('list_local_invoices',{after:0})).length,5);
    assert.equal((await native('read_cashier_state')).products.find(p=>p.id==='widget').stockMilli,1875);
    // Keyboard-only checkout under a 4x CPU slowdown. No mouse submission.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
    await button('Start next sale').click();
    await page.getByText('Checkout is ready. Totals are previews until the sale is saved.',{exact:true}).waitFor();
    const keyboardStart = performance.now();
    await page.keyboard.press('F2');
    await page.keyboard.type('WIDGET'); await page.keyboard.press('Enter');
    await page.keyboard.press('F3'); await page.keyboard.type('0.125'); await page.keyboard.press('Enter');
    await page.keyboard.press('F4'); await button('Confirm sale').waitFor(); await page.keyboard.press('Enter');
    await saved().waitFor();
    const keyboardMs = Math.round(performance.now()-keyboardStart);
    const printedId = await label('Saved invoice ID').inputValue();
    const invoicesBeforePrint = await native('list_local_invoices',{after:0});
    const postsBeforePrint = calls.filter(call=>call.command==='post_local_invoice').length;
    await page.evaluate(()=>{window.print=()=>{throw new Error('Injected print dialog failure');};});
    await button('Print saved receipt').click();
    await page.getByRole('status').filter({hasText:'Printing could not open.'}).waitFor();
    await page.evaluate(()=>{window.print=()=>{window.__receiptPrints=(window.__receiptPrints||0)+1;};});
    for(const layout of ['a4','58mm','80mm']) {
      await label('Paper layout').selectOption(layout);await button('Print saved receipt').click();
      await page.getByRole('status').filter({hasText:'Check the printer or PDF output.'}).waitFor();
      await page.waitForFunction(()=>document.querySelector('[data-sornio-print-root]'));
      assert.equal(await page.locator('[data-sornio-print-root] .receipt-reference').textContent(),printedId);
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('.desktop-shell').isVisible(),false);
      assert.equal(await page.locator('[data-sornio-print-root]').isVisible(),true);
      if(process.argv[4]) { mkdirSync(process.argv[4],{recursive:true}); await page.pdf({path:join(process.argv[4],`receipt-${layout}.pdf`),preferCSSPageSize:true}); }
      await page.emulateMedia({media:'screen'});
    }
    await label('Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ').selectOption('pa');
    await page.getByRole('button',{name:'ਸੰਭਾਲੀ ਰਸੀਦ ਛਾਪੋ',exact:true}).waitFor();
    await page.getByRole('button',{name:'ਸੰਭਾਲੀ ਰਸੀਦ ਛਾਪੋ',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-sornio-print-root]')?.textContent.includes('ਨਕਦ ਪ੍ਰਾਪਤ ਹੋਇਆ'));
    assert.equal(await label('ਸੰਭਾਲੇ ਬਿੱਲ ਦਾ ਨੰਬਰ').inputValue(),printedId);
    await page.evaluate(()=>document.fonts.load('12px "Sornio Gurmukhi"','ਰਸੀਦ'));
    assert.equal(await page.evaluate(()=>document.fonts.check('12px "Sornio Gurmukhi"','ਰਸੀਦ')),true);
    if(process.argv[4]) { await page.screenshot({path:join(process.argv[4],'receipt-punjabi.png'),fullPage:true}); }
    await label('Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ').selectOption('en');
    await saved().waitFor();
    assert.deepEqual(await native('list_local_invoices',{after:0}),invoicesBeforePrint);
    assert.equal(calls.filter(call=>call.command==='post_local_invoice').length,postsBeforePrint);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    console.log(JSON.stringify({keyboardCheckout4xCpuMs:keyboardMs,printLayouts:3,printFailureInjected:true,extraFinancialPostsFromPrinting:0}));
    for (const width of [390,760,1365]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
    }
    if(process.argv[4]) {
      mkdirSync(process.argv[4],{recursive:true});
      await page.screenshot({path:join(process.argv[4],'checkout-saved-light.png'),fullPage:true});
      await page.emulateMedia({colorScheme:'dark'});
      await page.screenshot({path:join(process.argv[4],'checkout-saved-dark.png'),fullPage:true});
    }
    await button('Start next sale').click();
    await button('Find saved receipt').click();
    await page.getByRole('region',{name:'Saved receipts'}).getByRole('button').filter({hasText:printedId}).click();
    await saved().waitFor();
    assert.equal(await label('Saved invoice ID').inputValue(),printedId);
    await button('Print saved receipt').click();
    await page.waitForFunction(()=>document.querySelector('[data-sornio-print-root]'));
    assert.deepEqual(await native('list_local_invoices',{after:0}),invoicesBeforePrint);
    await button('Lock workspace').click();
    await page.getByRole('heading',{name:'Welcome back.',exact:true}).waitFor();
    assert.equal(await saved().count(),0); assert.equal(await label('Saved invoice ID').count(),0);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key!=='dukaanos-language').length+sessionStorage.length),0);
    assert.equal(await page.locator('[data-sornio-print-root]').count(),0);
    assert.deepEqual(errors,[]);
    console.log('Checkout integration passed: real SQLCipher/Workspace; stale background read fencing; shared preview; kg/litre/metre/pcs quantities; no success before commit; cash/credit; stock/balance refresh; exact-ID retry after lost post/prepare replies; native-process restart and unlock recovery; stale-stock refusal/edit; saved-sale/read-failure handling; locking; responsive light/dark UI.');
  } finally { await browser.close(); await stopBridge(); rmSync(directory,{recursive:true,force:true}); }
})().catch(error=>{console.error(error,stderr);process.exit(1);});
