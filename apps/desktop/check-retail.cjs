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
const directory = mkdtempSync(join(tmpdir(), 'sornio-retail-ui-'));
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
  const reply = await rpc(command, { ...args, scope: nativeScope }); if (!reply.ok) throw new Error(JSON.stringify(reply.error));
  if (['add_local_product', 'adjust_local_stock'].includes(command)) {
    const ack = await rpc('acknowledge_local_inventory', { scope: nativeScope, operationId: args.request.operationId });
    assert.equal(ack.ok, true, 'Fixture must acknowledge its known completed stock save');
  }
  return reply.value;
}
async function stopBridge() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await stopped;
}
(async () => {
 startBridge();
 const browser = await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
 try {
  const page = await browser.newPage({viewport:{width:1365,height:1000}});page.setDefaultTimeout(20000);
  const calls=[],errors=[];let loseSale=false,loseMatch=false,loseReturn=false,hold,release;
  page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('retailReviewInvoke',async(command,args)=>{
   calls.push({command,args:structuredClone(args)});
   if(command==='post_local_retail'&&hold)await hold;
   const r=await rpc(command,args);
   if(command==='post_local_retail'&&r.ok){const kind=args.r.action.kind;if(kind==='sale'&&loseSale){loseSale=false;return {ok:false,error:{code:'unavailable',message:'Lost retail sale reply. Retry the same sale.'}};}if(kind==='match'&&loseMatch){loseMatch=false;return {ok:false,error:{code:'unavailable',message:'Lost manual match reply. Retry this exact operation.'}};}if(kind==='return'&&loseReturn){loseReturn=false;return {ok:false,error:{code:'unavailable',message:'Lost return reply. Recover the same operation.'}};}}
   return r;
  });
  await page.addInitScript(()=>{globalThis.isTauri=true;globalThis.__TAURI_INTERNALS__={invoke:async(command,args={})=>{const r=await globalThis.retailReviewInvoke(command,args);if(!r.ok)throw r.error;return r.value;}};});
  const label=name=>page.getByLabel(name,{exact:true}),button=name=>page.getByRole('button',{name,exact:true});
  const panel=page.getByRole('region',{name:'Payments & closing',exact:true});
  const alert=text=>page.getByRole('alert').filter({hasText:text});
  const password='Retail synthetic password 2026';
  async function ready(){await button('Refresh payment records').click();await panel.getByText('Payment records are up to date.',{exact:true}).waitFor();}
  async function ack(){await button('Start next retail operation').click();await panel.getByText('Payment records are up to date.',{exact:true}).waitFor();}
  async function saved(){await label('Saved retail operation ID').waitFor();return label('Saved retail operation ID').inputValue();}
  async function view(invoiceId){return native('read_local_retail',{day:await label('Cashier business date (IST)').inputValue(),username:'owner',invoiceId});}
  async function fillMatch(amount,reference){await label('Bank or terminal reference (never card number)').fill(reference);await label('Bank statement amount (₹)').fill(amount);await label('Manual statement check note').fill('Compared with bank statement manually');}
  await page.goto(baseUrl);await label('Business name for setup').fill('Retail review shop');await label('Owner name').fill('Owner');await label('Local password').fill(password);await label('Confirm password').fill(password);await button('Set up local access').click();
  nativeScope=(await native('read_local_session')).scope;
  await panel.getByText('Payment records are up to date.',{exact:true}).waitFor();
  await native('add_local_product',{request:{operationId:'rice',name:'Rice',sku:'RICE',unit:'kg',unitPricePaise:10000,openingStockMilli:10000}});
  await button('Refresh checkout').click();await button('Add Rice to sale').click();await label('Tax (%)').fill('5');await label('Transaction type').selectOption('retail');
  await label('Split cash amount (₹)').fill('30');await label('Split UPI amount (₹)').fill('50');await label('Split card amount (₹)').fill('24.99');
  assert.equal(await button('Review sale').isDisabled(),true);
  await label('Split card amount (₹)').fill('25');await label('UPI reference (optional, unverified)').fill('PENDING123456');
  await button('Review sale').click();hold=new Promise(r=>{release=r;});loseSale=true;await button('Confirm sale').click();
  await page.getByText('Confirming sale on this PC…',{exact:true}).waitFor();assert.equal(await label('Saved invoice ID').count(),0);assert.equal(await button('Lock workspace').isDisabled(),true);assert.equal((await native('list_local_invoices',{after:0})).length,0);
  release();hold=null;await alert('Lost retail sale reply').waitFor();await button('Retry same sale').click();await label('Saved invoice ID').waitFor();
  const invoice=await label('Saved invoice ID').inputValue();const saleCalls=calls.filter(c=>c.command==='post_local_retail'&&c.args.r.action.kind==='sale');assert.equal(saleCalls.length,2);assert.deepEqual(saleCalls[0].args,saleCalls[1].args);
  assert.deepEqual((await native('read_cashier_state')).balances,{cashPaise:'3000',creditPaise:'0'});
  await button('Start next sale').click();await ready();await label('Invoice ID for payment records').fill(invoice);await panel.getByText('UPI · ₹50.00',{exact:false}).waitFor();
  let v=await view(invoice);const upi=v.payments.find(p=>p.method==='upi');assert.equal(upi.status,'pending');assert.equal(upi.externallyVerified,false);assert.equal(v.summary.digitalPendingPaise,'7500');
  await fillMatch('49.99','UTR1234567890');await button(`Review manual match ${upi.id}`).click();await button('Confirm retail operation').click();await button('Edit refused retail operation').waitFor();assert.equal((await view(invoice)).payments.find(p=>p.id===upi.id).status,'pending');
  await button('Edit refused retail operation').click();await ready();await fillMatch('50.00','UTR1234567890');await button(`Review manual match ${upi.id}`).click();loseMatch=true;await button('Confirm retail operation').click();await alert('Lost manual match reply').waitFor();assert.equal(await label('Saved retail operation ID').count(),0);await button('Retry same retail operation').click();const matchId=await saved();const matches=calls.filter(c=>c.command==='post_local_retail'&&c.args.r.operationId===matchId);assert.equal(matches.length,2);assert.deepEqual(matches[0].args,matches[1].args);await ack();
  v=await view(invoice);assert.equal(v.summary.manuallyMatchedPaise,'5000');assert.equal(v.summary.externallyVerifiedPaise,'0');assert.equal(v.summary.digitalPendingPaise,'2500');
  const second={operationId:'second-sale',action:{kind:'sale',invoice:{operationId:'second-sale',lines:[{productId:'rice',expectedRevision:2,quantityMilli:1000}],taxBasisPoints:0,tender:'retail',customerId:null},payments:[{id:'second-upi',method:'upi',amountPaise:10000,reference:''}]}};
  await native('prepare_local_retail',{r:second});await native('post_local_retail',{r:second});await native('clear_local_retail',{operationId:'second-sale',saved:true});
  await label('Invoice ID for payment records').fill('second-sale');await panel.getByText('Payment ID: second-upi',{exact:false}).waitFor();await fillMatch('100',' UTR 1234567890 ');await button('Review manual match second-upi').click();await button('Confirm retail operation').click();await alert('reference already belongs').waitFor();await button('Edit refused retail operation').click();await ready();
  await label('Invoice ID for payment records').fill(invoice);await label('Return quantity for line 1: Rice (kg)').fill('0.500');await label('Return or correction reason').fill('Goods returned and inspected');await button('Calculate native return').click();await panel.getByText('Return subtotal ₹50.00 · Tax ₹2.50 · Total ₹52.50',{exact:true}).waitFor();
  await button('Review invoice return').click();loseReturn=true;await button('Confirm retail operation').click();await alert('Lost return reply').waitFor();
  const request=calls.filter(c=>c.command==='post_local_retail'&&c.args.r.action.kind==='return').at(-1).args.r;
  await stopBridge();startBridge();await page.reload();await label('Local password').fill(password);await button('Unlock workspace').click();assert.equal(await saved(),request.operationId);await ack();
  assert.deepEqual((await native('read_cashier_state')).balances,{cashPaise:'250',creditPaise:'0'});assert.equal((await native('list_local_products'))[0].stockMilli,8500);
  await label('Invoice ID for payment records').fill(invoice);await label('Return quantity for line 1: Rice (kg)').fill('0.500');await label('Return or correction reason').fill('Remaining goods returned');await button('Calculate native return').click();await panel.getByText('Cash out ₹2.50 · Credit reduction ₹0.00 · Digital refund pending ₹50.00 · Pending payment canceled ₹0.00',{exact:true}).waitFor();await button('Review invoice return').click();await button('Confirm retail operation').click();await saved();await ack();
  v=await view(invoice);assert.equal(v.refunds.length,1);assert.equal(v.refunds[0].status,'pending');assert.equal(v.payments.find(p=>p.id===upi.id).status,'refund_pending');assert.equal((await native('read_cashier_state')).balances.cashPaise,'0');assert.equal((await native('list_local_products'))[0].stockMilli,9000);
  await fillMatch('50','REFUND123456');await button(`Review refund statement match ${v.refunds[0].id}`).click();await button('Confirm retail operation').click();await saved();await ack();assert.equal((await view(invoice)).refunds[0].status,'manually_reconciled');
  await button('Save CA settlement CSV').click();await label('Saved settlement CSV path').waitFor();const csv=await label('Settlement CSV preview').inputValue();assert.ok(csv.startsWith('record_type,'));assert.ok(csv.includes('refund_obligation'));assert.ok(csv.includes('journal'));assert.equal(csv.includes(password),false);
  await label('Counted drawer cash (₹)').fill('0.01');await button('Lock workspace').click();await button('Continue editing').click();assert.equal(await label('Counted drawer cash (₹)').inputValue(),'0.01');await button('Review cashier closing').click();await button('Confirm retail operation').click();await saved();await panel.getByText('Closing expected cash ₹0.00 · Counted ₹0.01 · Variance ₹0.01',{exact:true}).waitFor();await ack();
  const late={operationId:'late-sale',lines:[{productId:'rice',expectedRevision:(await native('list_local_products'))[0].revision,quantityMilli:1000}],taxBasisPoints:0,tender:'cash',customerId:null};await native('prepare_local_checkout',{request:late});const refused=await rpc('post_local_invoice',{scope:nativeScope,request:late});assert.equal(refused.error.code,'day_closed');await native('clear_local_checkout',{operationId:'late-sale',saved:false});
  await native('create_local_staff',{details:{username:'cashier',displayName:'Cashier',role:'cashier'},password});await button('Lock workspace').click();await label('Account name').fill('cashier');await label('Local password').fill(password);await button('Unlock workspace').click();await button('Refresh payment records').waitFor();
  assert.equal(await label('Declared opening float (₹)').count(),0);assert.equal(await label('Return or correction reason').count(),0);assert.equal(await button('Save CA settlement CSV').count(),0);
  const denied=await rpc('prepare_local_retail',{scope:nativeScope,r:{operationId:'forged',action:{kind:'match',paymentId:upi.id,expectedRevision:0,reference:'FAKE123456',statementAmountPaise:5000,evidence:'Forged request'}}});assert.equal(denied.error.code,'forbidden');
  const isolated=await rpc('read_local_retail',{scope:{...nativeScope,businessId:'foreign'},day:await label('Cashier business date (IST)').inputValue(),username:'cashier',invoiceId:null});assert.equal(isolated.error.code,'workspace_mismatch');
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  console.log('Retail React/native integration passed: original invoice split checkout, unverified UPI/card separation, wrong statement amount/duplicate reference refusal, exact lost sale/match retries, interrupted partial return recovery, cumulative tax/stock, pending versus manually matched refunds, CSV, cash variance/locking, closed-day sale refusal and native role/business isolation.');
 } finally {await browser.close();await stopBridge();rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
