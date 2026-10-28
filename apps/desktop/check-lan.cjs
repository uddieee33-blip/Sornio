/* Three native processes, two real React tills, real SQLCipher and mutual-TLS TCP. Pairing file dialogs are fixture transports; Windows UIA separately tests packaged controls. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI acceptance. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, copyFileSync, rmSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');
const directory=mkdtempSync(join(tmpdir(),'sornio-lan-acceptance-'));
const binary=resolve(process.env.SORNIO_LAN_BRIDGE || 'packages/local-store/target/debug/examples/shop_lan_review_bridge');
const base=process.argv[2] || 'http://127.0.0.1:1420';
const screenshots=process.argv[4] || 'packages/local-store/target/lan-captures';mkdirSync(screenshots,{recursive:true});
class Peer {
 constructor(name){this.name=name;this.database=join(directory,name+'.db');this.file=join(directory,name+'.sorniopair');this.queue=[];this.stderr='';this.start();}
 start(){this.child=spawn(binary,[this.database],{stdio:['pipe','pipe','pipe']});this.child.stderr.on('data',s=>{this.stderr+=s;});this.child.on('exit',()=>{for(const p of this.queue.splice(0))p.reject(new Error(this.name+' exited'));});this.child.on('error',e=>{for(const p of this.queue.splice(0))p.reject(e);});createInterface({input:this.child.stdout}).on('line',line=>{const p=this.queue.shift();if(p)try{p.resolve(JSON.parse(line));}catch(e){p.reject(e);}});}
 rpc(command,args={}){return new Promise((resolve,reject)=>{this.queue.push({resolve,reject});this.child.stdin.write(JSON.stringify({command,args})+'\n');});}
 async native(command,args={}){const r=await this.rpc(command,args);assert(r.ok,JSON.stringify(r.error));return r.value;}
 async stop(){if(this.child.exitCode!==null || this.child.signalCode!==null)return;const done=new Promise(r=>this.child.once('exit',r));this.child.kill('SIGKILL');await done;}
}
const peers=[new Peer('hub'),new Peer('cashier-a'),new Peer('cashier-b')];
(async()=>{const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
try{
 const [hub,a,b]=peers;const pages=[];const errors=[];const password='Independent LAN review password';
 const button=(p,name)=>p.getByRole('button',{name,exact:true});const label=(p,name)=>p.getByLabel(name,{exact:true});
 for(const peer of peers){const page=await browser.newPage({viewport:{width:1365,height:1000}});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('invokeLanNative',(cmd,args)=>peer.rpc(cmd,args));await page.addInitScript(()=>{globalThis.isTauri=true;globalThis.__TAURI_INTERNALS__={invoke:async(cmd,args={})=>{const r=await globalThis.invokeLanNative(cmd,args);if(!r.ok)throw r.error;return r.value;}};});await page.goto(base);await label(page,'Local password').fill(password);await label(page,'Confirm password').fill(password);await button(page,'Set up local access').click();await label(page,'Business name').waitFor();pages.push(page);}
 const [hp,ap,bp]=pages;
 await label(hp,'Business name').fill('Shared shop hub');await button(hp,'Save local draft').click();await hp.getByText('Saved to this PC. You can close and reopen Sornio.',{exact:true}).waitFor();
 await hub.native('add_local_product',{request:{operationId:'last-item',name:'Last shop pack',sku:'PACK',unit:'pcs',unitPricePaise:1063,openingStockMilli:1000}});
 await button(hp,'Open shop network controls').click();await label(hp,'Local password for network settings').fill(password);await label(hp,'Shop hub address').fill('127.0.0.1:0');await button(hp,'Make this PC the shop hub').click();await hp.getByRole('status').filter({hasText:'Mode: hub.'}).waitFor();
 const live=await hub.native('read_shop_lan');const address=live.address;const fingerprint=await label(hp,'Hub trust fingerprint').inputValue();assert.equal(fingerprint.length,64);
 for(const [peer,page,name,role] of [[a,ap,'Till A','cashier'],[b,bp,'Till B','manager']]){
  await button(page,'Open shop network controls').click();await label(page,'Local password for network settings').fill(password);await label(page,'This computer’s name').fill(name);await button(page,'Export computer pairing request…').click();await page.getByRole('status').filter({hasText:'Mode: pairing.'}).waitFor();
  const requestFingerprint=await label(page,'This computer’s pairing fingerprint').inputValue();copyFileSync(peer.file,hub.file);await button(hp,'Import computer request…').click();await hp.getByRole('group',{name:'Computer request preview'}).waitFor();await label(hp,'Local password for network settings').fill(password);await label(hp,'Computer role to approve').selectOption(role);await label(hp,'Enter the pairing fingerprint shown on that computer').fill(requestFingerprint);await button(hp,'Approve computer request…').click();await hp.getByRole('status').filter({hasText:'Computer approved.'}).waitFor();copyFileSync(hub.file,peer.file);
  await button(page,'Import hub approval…').click();await page.getByRole('group',{name:'Shop hub approval'}).waitFor();await label(page,'Local password for network settings').fill(password);await label(page,'Shop hub address').fill(address);await label(page,'Enter the fingerprint shown on the hub PC').fill(fingerprint);await button(page,'Trust and join this shop hub').click();await page.getByRole('status').filter({hasText:'Mode: client.'}).waitFor();await button(page,'Add Last shop pack to sale').waitFor();assert.equal(await label(page,'Item name').count(),0,'Client mode exposed local inventory mutation form');
 }
 for(const page of [ap,bp]){await button(page,'Add Last shop pack to sale').click();await button(page,'Review sale').click();}
 await Promise.all([button(ap,'Confirm sale').click(),button(bp,'Confirm sale').click()]);
 const results=await Promise.all([ap,bp].map(async page=>{await Promise.race([page.getByRole('heading',{name:'Sale confirmed by shop hub',exact:true}).waitFor(),button(page,'Edit refused sale').waitFor()]);return await page.getByRole('heading',{name:'Sale confirmed by shop hub',exact:true}).count();}));
 assert.equal(results[0]+results[1],1,'Two clients sold the last unit');
 const hubState=await hub.native('read_cashier_state');assert.equal(hubState.products[0].stockMilli,0);assert.equal(hubState.balances.cashPaise,'1063');assert.equal((await hub.native('list_local_invoices',{after:0})).length,1);
 for(const peer of [a,b])assert.equal(await peer.native('review_local_invoice_count'),0,'Client posted a separate local invoice');
 assert.equal((await a.rpc('list_local_invoices',{after:0})).ok,false,'Cashier read the shop report');assert.equal((await b.native('list_local_invoices',{after:0})).length,1);
 const winner=results[0]?ap:bp;const loser=results[0]?bp:ap;const loserPeer=results[0]?b:a;
 await button(winner,'Start next sale').click();await button(loser,'Edit refused sale').click();
 await hub.native('adjust_local_stock',{request:{operationId:'restock-after-concurrency',productId:'last-item',expectedRevision:2,deltaMilli:1000,reason:'Physical restock'}});
 await button(loser,'Refresh checkout').click();await loser.getByRole('list',{name:'Items available for sale'}).getByText(/1 pcs available/).waitFor();
 await hub.native('review_drop_listener');await button(loser,'Refresh checkout').click();await loser.getByRole('status').filter({hasText:'Shop hub unavailable.'}).waitFor();
 // The refused cart is retained for editing; its next request receives a fresh stable operation ID.
 await button(loser,'Review sale').click();await button(loser,'Confirm sale').click();await loser.getByRole('alert').filter({hasText:'result is uncertain'}).waitFor();const queued=(await loserPeer.native('read_cashier_state')).checkout.request.operationId;
 assert.equal((await hub.native('list_local_invoices',{after:0})).length,1);
 await hub.stop();hub.start();await loserPeer.stop();loserPeer.start();await loser.reload();await label(loser,'Local password').fill(password);await button(loser,'Unlock workspace').click();await button(loser,'Retry same sale').waitFor();
 await hub.native('unlock_workspace',{password});const newAddress=(await hub.native('read_shop_lan')).address;
 await button(loser,'Open shop network controls').click();await label(loser,'Local password for network settings').fill(password);await label(loser,'Shop hub address').fill(newAddress);await button(loser,'Update hub address').click();await button(loser,'Retry same sale').click();await loser.getByRole('heading',{name:'Sale confirmed by shop hub',exact:true}).waitFor();assert.equal(await label(loser,'Saved invoice ID').inputValue(),queued);
 assert.equal((await hub.native('list_local_invoices',{after:0})).length,2);assert.equal((await hub.native('read_cashier_state')).products[0].stockMilli,0);assert.equal(await loserPeer.native('review_local_invoice_count'),0);
 await loser.screenshot({path:join(screenshots,'lan-recovered-receipt.png'),fullPage:true});
 assert.deepEqual(errors,[]);for(const page of pages)assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 console.log('LAN integration passed: three native processes, two React clients, public CSR approval and fingerprint trust, real mutual TLS, concurrent last-unit checkout, native report denial, no client financial posting, offline queue, forced hub/client restart and exact receipt recovery.');
} catch(error){for(const peer of peers)console.error(peer.name,peer.stderr);throw error;}finally{await browser.close();for(const peer of peers)await peer.stop();rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
