/* Mocked IPC interaction checks only. Native acceptance is check-native.py. */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loads isolated Playwright through NODE_PATH. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseUrl = process.argv[2] || 'http://127.0.0.1:1420';
(async () => {
 const browser = await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
 try {
  const page = await browser.newPage({viewport:{width:1365,height:1000}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseUrl);
  await page.getByRole('heading',{name:'Installed app required',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Business name',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Local password',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  await page.addInitScript(()=>{
   globalThis.isTauri=true;
   globalThis.review={access:{configured:false,unlocked:false},password:'',snapshot:{revision:0,draft:null},copies:[],products:[],stockOps:{},stockRequests:[],calls:[],failLock:false,rateLimited:false};
   globalThis.__TAURI_INTERNALS__={invoke:async(command,args={})=>{
    await new Promise(r=>setTimeout(r,20)); const s=globalThis.review; s.calls.push(command);
    if(command==='read_local_session')return {scope:{businessId:'review-business',workspaceId:'review-workspace'},businessName:'Review store',principal:{id:'owner',username:'owner',displayName:'Owner',role:'owner',enabled:true,revision:1}};
    if(command==='list_local_staff'||command==='find_local_customers')return [];
    if(command==='pending_local_credit')return null;
    if(command==='workspace_access_status')return structuredClone(s.access);
    if(command==='setup_local_access'){
     if(s.access.configured)throw {code:'already_configured',message:'Local access is already configured.'};
     s.password=args.password;s.access={configured:true,unlocked:true};return structuredClone(s.access);
    }
    if(command==='unlock_workspace'){
     if(s.rateLimited)throw {code:'rate_limited',message:'Too many attempts. Wait 60 seconds before trying again.'};
     if(args.password!==s.password)throw {code:'incorrect_password',message:'That password did not unlock this workspace.'};
     s.access.unlocked=true;return structuredClone(s.access);
    }
    if(command==='lock_workspace'){
     if(s.failLock)throw {code:'unavailable',message:'Could not lock this workspace.'};
     s.access.unlocked=false;return null;
    }
    if(!s.access.unlocked)throw {code:'locked',message:'Unlock this workspace to continue.'};
    if(command==='read_cashier_state')return {products:structuredClone(s.products),checkout:null,reportsAllowed:true,balances:{cashPaise:'0',creditPaise:'0'}};
    if(command==='load_workspace')return structuredClone(s.snapshot);
    if(command==='list_workspace_copies')return structuredClone(s.copies);
    if(command==='list_local_products'){
     if(s.failStockRead){s.failStockRead=false;throw {code:'unavailable',message:'Stock read failed.'};}
     return structuredClone(s.products);
    }
    if(command==='add_local_product'||command==='adjust_local_stock'){
     const r=args.request;s.stockRequests.push(structuredClone(r));
     if(s.stockOps[r.operationId])return structuredClone(s.stockOps[r.operationId]);
     let product;
     if(command==='add_local_product'){
      product={id:r.operationId,name:r.name.trim(),sku:r.sku.trim().toUpperCase(),unit:r.unit,unitPricePaise:r.unitPricePaise,stockMilli:r.openingStockMilli,revision:1};
      s.products.push(product);
     }else{
      const index=s.products.findIndex(p=>p.id===r.productId),old=s.products[index];
      if(!old||old.revision!==r.expectedRevision)throw {code:'stock_conflict',message:'Another window changed this stock. Reload items before adjusting it.'};
      if(old.stockMilli+r.deltaMilli<0)throw {code:'invalid_product',message:'The stock change would leave an invalid quantity. Check the count.'};
      product={...old,stockMilli:old.stockMilli+r.deltaMilli,revision:old.revision+1};s.products[index]=product;
     }
     s.stockOps[r.operationId]=structuredClone(product);
     if(s.failStockReply){s.failStockReply=false;throw {code:'unavailable',message:'Save could not be confirmed. Retry this same save before editing.'};}
     if(s.failReadAfterSave){s.failReadAfterSave=false;s.failStockRead=true;}
     return structuredClone(product);
    }
    if(args.expectedRevision!==s.snapshot.revision)throw {code:'workspace_error',message:'Another window changed this draft. Reopen it before saving again.'};
    const draft=command==='restore_workspace'?s.copies.find(c=>c.revision===args.sourceRevision)?.draft:args.draft;
    if(!draft)throw {code:'workspace_error',message:'Saved copy not available.'};
    s.snapshot={revision:s.snapshot.revision+1,draft:structuredClone(draft)};
    s.copies.unshift(structuredClone(s.snapshot));return structuredClone(s.snapshot);
   }};
  });
  const button=name=>page.getByRole('button',{name,exact:true});
  const password=()=>page.getByLabel('Local password',{exact:true});
  await page.reload();
  await page.getByRole('heading',{name:'Make this PC yours.',exact:true}).waitFor();
  if (process.argv[4]) {
   require('node:fs').mkdirSync(process.argv[4],{recursive:true});
   await page.screenshot({path:require('node:path').join(process.argv[4],'access-light.png')});
   await page.emulateMedia({colorScheme:'dark'});
   await page.screenshot({path:require('node:path').join(process.argv[4],'access-dark.png')});
   await page.emulateMedia({colorScheme:'light'});
  }
  assert.equal(await page.getByLabel('Business name',{exact:true}).count(),0);
  assert.deepEqual(await page.evaluate(()=>globalThis.review.calls.filter(c=>c!=='workspace_access_status')),[]);
  await page.getByLabel('Business name for setup',{exact:true}).fill('Review store');await page.getByLabel('Owner name',{exact:true}).fill('Owner');
  await password().fill('Review password 2026');
  await page.getByLabel('Confirm password',{exact:true}).fill('Different password');
  await button('Set up local access').click();
  await page.getByRole('alert').filter({hasText:'The passwords do not match.'}).waitFor();
  assert.equal(await page.evaluate(()=>globalThis.review.calls.includes('setup_local_access')),false);
  await page.getByLabel('Confirm password',{exact:true}).fill('Review password 2026');
  await button('Set up local access').click();
  const name=page.getByLabel('Business name',{exact:true}),note=page.getByLabel('Workspace note',{exact:true});
  await page.getByLabel('Business type',{exact:true}).selectOption('gym');
  await page.getByText('Members, check-ins and upcoming renewals.',{exact:true}).waitFor();
  await page.getByLabel('Business type',{exact:true}).selectOption('kirana');
  await name.fill('Sample local store');await note.fill('Original committed note');await button('Save local draft').click();
  await page.getByText('Revision 1 · Current draft',{exact:true}).waitFor();
  await note.fill('Second committed note');await button('Save local draft').click();
  await page.getByText('Revision 2 · Current draft',{exact:true}).waitFor();
  await button('Restore saved copy 1').click();
  await page.getByText('Restored saved copy 1 as revision 3.',{exact:true}).waitFor();
  assert.equal(await note.inputValue(),'Original committed note');
  await note.fill('Unsaved edit to keep');
  assert.equal(await button('Restore saved copy 1').isDisabled(),true);
  await button('Lock workspace').click();await button('Continue editing').click();
  assert.equal(await note.inputValue(),'Unsaved edit to keep');
  assert.equal(await page.evaluate(()=>globalThis.review.calls.includes('lock_workspace')),false);
  await page.evaluate(()=>{globalThis.review.failLock=true;});
  await button('Lock workspace').click();await button('Discard edits and lock').click();
  await page.getByRole('alert').filter({hasText:'Could not lock this workspace.'}).waitFor();
  assert.equal(await note.inputValue(),'Unsaved edit to keep');
  await page.evaluate(()=>{globalThis.review.failLock=false;});await button('Discard edits and lock').click();
  await page.getByRole('heading',{name:'Welcome back.',exact:true}).waitFor();
  assert.equal(await name.count(),0);
  assert.equal(await page.getByRole('heading',{name:'Saved copies',exact:true}).count(),0);
  assert.deepEqual(await page.evaluate(()=>Promise.all(['load_workspace','save_workspace','list_workspace_copies','restore_workspace','list_local_products','add_local_product','adjust_local_stock'].map(c=>globalThis.__TAURI_INTERNALS__.invoke(c).then(()=>'allowed',e=>e.code)))),['locked','locked','locked','locked','locked','locked','locked']);
  await password().fill('Wrong password');await button('Unlock workspace').click();
  await page.getByRole('alert').filter({hasText:'That password did not unlock'}).waitFor();
  assert.equal(await name.count(),0);assert.equal(await password().inputValue(),'');
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:1365,height:1000});
  await password().fill('Review password 2026');await button('Unlock workspace').click();
  await page.getByText('Your saved draft is ready on this PC.',{exact:true}).waitFor();
  assert.equal(await note.inputValue(),'Original committed note');
  await page.evaluate(()=>{globalThis.review.snapshot={revision:4,draft:{businessName:'Other window',businessType:'kirana',note:'New committed work'}};globalThis.review.copies.unshift(structuredClone(globalThis.review.snapshot));});
  await note.fill('Conflicting edits');await button('Save local draft').click();
  await page.getByRole('alert').filter({hasText:'Another window changed'}).waitFor();
  assert.equal(await note.inputValue(),'Conflicting edits');
  await button('Reopen saved draft').click();await button('Discard edits and reopen').click();
  await page.getByText('Reopened the latest saved draft from this PC.',{exact:true}).waitFor();
  assert.equal(await name.inputValue(),'Other window');
  await page.getByLabel('Item name',{exact:true}).fill('Sample rice');
  await page.getByLabel('Item code (optional)',{exact:true}).fill('rice-1');
  await page.getByLabel('Stock unit',{exact:true}).selectOption('kg');
  await page.getByLabel('Unit price (₹)',{exact:true}).fill('42.501');
  await page.getByLabel('Opening stock',{exact:true}).fill('1.250');
  await button('Save item on this PC').click();
  await page.getByRole('alert').filter({hasText:'Enter a name, a price'}).waitFor();
  assert.equal(await page.evaluate(()=>globalThis.review.stockRequests.length),0);
  await page.getByLabel('Unit price (₹)',{exact:true}).fill('42.50');
  await page.evaluate(()=>{globalThis.review.failStockReply=true;});
  await button('Save item on this PC').click();
  await button('Retry item save').waitFor();
  assert.equal(await page.getByLabel('Item name',{exact:true}).isDisabled(),true);
  await button('Retry item save').click();
  await page.getByText('Saved item changes to this PC.',{exact:true}).waitFor();
  const itemList=page.getByRole('list',{name:'Saved local items',exact:true});
  await itemList.getByText('1.25 kg',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>globalThis.review.products.length),1);
  const requests=await page.evaluate(()=>globalThis.review.stockRequests);
  assert.deepEqual(requests[0],requests[1]);
  await page.getByLabel('Item to adjust',{exact:true}).selectOption(await page.evaluate(()=>globalThis.review.products[0].id));
  await page.getByLabel('Quantity change',{exact:true}).fill('2.750');
  await page.getByLabel('Reason for stock change',{exact:true}).fill('Counted delivery');
  await button('Save stock change').click();await itemList.getByText('4 kg',{exact:true}).waitFor();
  await page.getByLabel('Quantity change',{exact:true}).fill('-4.001');
  await page.getByLabel('Reason for stock change',{exact:true}).fill('Wrong count');
  await button('Save stock change').click();
  await page.getByRole('alert').filter({hasText:'invalid quantity'}).waitFor();
  assert.equal(await page.evaluate(()=>globalThis.review.products[0].stockMilli),4000);
  await page.getByLabel('Quantity change',{exact:true}).fill('-1.000');
  await page.getByLabel('Reason for stock change',{exact:true}).fill('Damaged packet');
  await page.evaluate(()=>{globalThis.review.products[0].revision++;});
  await button('Save stock change').click();
  await page.getByRole('alert').filter({hasText:'Another window changed this stock'}).waitFor();
  await button('Reload item counts').click();
  await page.getByText('Reopened the latest item counts from this PC.',{exact:true}).waitFor();
  await page.evaluate(()=>{globalThis.review.failReadAfterSave=true;});
  await button('Save stock change').click();
  await page.getByRole('alert').filter({hasText:'Item changes were saved.'}).waitFor();
  assert.equal(await button('Retry item save').count(),0);
  assert.equal(await button('Save stock change').isDisabled(),true);
  await button('Reload item counts').click();await itemList.getByText('3 kg',{exact:true}).waitFor();
  await page.getByLabel('Find an item',{exact:true}).fill('missing');
  await page.getByText('No matching items.',{exact:true}).waitFor();
  await page.getByLabel('Find an item',{exact:true}).fill('rice-1');
  await itemList.getByText('Sample rice',{exact:true}).waitFor();
  await page.setViewportSize({width:760,height:800});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await button('Lock workspace').click();await page.getByRole('heading',{name:'Welcome back.',exact:true}).waitFor();
  await page.evaluate(()=>{globalThis.review.rateLimited=true;});
  await password().fill('Review password 2026');await button('Unlock workspace').click();
  await page.getByRole('alert').filter({hasText:'Too many attempts.'}).waitFor();
  assert.equal(await name.count(),0);assert.deepEqual(errors,[]);
  console.log('Desktop mocked-IPC UI checks passed: browser guard, setup, mismatch, save/restore, dirty lock guard, failed lock, lock/unlock, wrong password, stale-save recovery, attempt-limit error, fractional stock, retry deduplication, negative/stale stock refusal, committed-write/read-failure handling and responsive light/dark access. Native acceptance remains separate.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

