/* Real React -> native Workspace/SQLCipher. File chooser transport is synthetic here; Windows acceptance uses real OS dialogs. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone acceptance runner. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const directory = mkdtempSync(join(tmpdir(), 'sornio-backup-ui-'));
const backup = join(directory, 'synthetic.sorniobackup');
const binary = resolve(process.env.SORNIO_REVIEW_BRIDGE || 'packages/local-store/target/debug/examples/cashier_review_bridge');
let nativeScope;
let child, queue = [], stderr = '';
function start() {
 child = spawn(binary, [join(directory, 'synthetic.db')], {env:{...process.env,SORNIO_REVIEW_BACKUP:backup},stdio:['pipe','pipe','pipe']});
 child.stderr.on('data', b => { stderr += b; });
 child.on('exit', () => { for (const p of queue.splice(0)) p.reject(new Error('Native fixture exited')); });
 createInterface({input:child.stdout}).on('line',line => { const p=queue.shift();if(p)try{p.resolve(JSON.parse(line));}catch(e){p.reject(e);} });
}
function rpc(command,args={}) { return new Promise((resolve,reject)=>{queue.push({resolve,reject});child.stdin.write(JSON.stringify({command,args})+'\n');}); }
async function native(command,args={}) { const r=await rpc(command,{...args,scope:nativeScope});assert(r.ok,JSON.stringify(r.error));return r.value; }
async function stop() { if(child.exitCode!==null || child.signalCode!==null)return;const done=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await done; }
(async()=>{
 start();const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
 try {
  const page=await browser.newPage({viewport:{width:1365,height:1000}});page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeBackupInvoke',(command,args)=>rpc(command,args));
  await page.addInitScript(()=>{globalThis.isTauri=true;globalThis.__TAURI_INTERNALS__={invoke:async(command,args={})=>{const r=await globalThis.nativeBackupInvoke(command,args);if(!r.ok)throw r.error;return r.value;}};});
  const button=name=>page.getByRole('button',{name,exact:true});const label=name=>page.getByLabel(name,{exact:true});
  const login='Native backup login password';const secret='Independent offline backup passphrase!';
  await page.goto(process.argv[2]||'http://127.0.0.1:1420');
  await label('Business name for setup').fill('Backup test shop');await label('Owner name').fill('Recovery owner');await label('Local password').fill(login);await label('Confirm password').fill(login);await button('Set up local access').click();
  nativeScope=(await native('read_local_session')).scope;
  await label('Business name').fill('Backup test shop');await label('Workspace note').fill('Before backup private note');await button('Save local draft').click();
  await page.getByText('Saved to this PC. You can close and reopen Sornio.',{exact:true}).waitFor();
  await native('add_local_product',{request:{operationId:'rice',name:'Rice',sku:'RICE',unit:'kg',unitPricePaise:4250,openingStockMilli:10000}});
  await native('acknowledge_local_inventory',{operationId:'rice'});
  await native('prepare_local_checkout',{request:{operationId:'backup-sale',lines:[{productId:'rice',expectedRevision:1,quantityMilli:1250}],taxBasisPoints:500,tender:'cash',customerId:null}});
  await native('post_local_invoice',{request:{operationId:'backup-sale',lines:[{productId:'rice',expectedRevision:1,quantityMilli:1250}],taxBasisPoints:500,tender:'cash',customerId:null}});
  await native('clear_local_checkout',{operationId:'backup-sale',saved:true});
  await page.reload();await label('Local password').fill(login);await button('Unlock workspace').click();
  await button('Open backup controls').click();
  async function credentials(recovery=secret) {await label('Current Owner password').fill(login);await label('Recovery passphrase').fill(recovery);await label('Original Owner password from backup').fill(login);}
  await label('Current Owner password').fill(login);await label('Recovery passphrase').fill(secret);await label('Confirm recovery passphrase for export').fill(secret);
  await button('Export encrypted backup…').click();await page.getByRole('status').filter({hasText:'Encrypted backup saved and verified.'}).waitFor();
  const bytes=readFileSync(backup);for(const plain of [login,secret,'Before backup private note']) assert(!bytes.includes(Buffer.from(plain)));
  await label('Workspace note').fill('Saved after backup');await button('Save local draft').click();await page.getByText('Saved to this PC. You can close and reopen Sornio.',{exact:true}).waitFor();
  await button('Choose encrypted backup…').click();await page.getByText('synthetic.sorniobackup',{exact:true}).waitFor();
  await credentials('Wrong recovery passphrase!');await button('Verify and preview backup').click();await page.getByRole('alert').filter({hasText:'Backup could not be verified.'}).waitFor();
  await credentials();await label('Original Owner password from backup').fill('Wrong original local password');await button('Verify and preview backup').click();
  await label('Local password').waitFor();await page.getByRole('alert').filter({hasText:'That password did not unlock this workspace.'}).waitFor();
  assert.equal(await label('Workspace note').count(),0,'Authentication denial left the private workspace visible');
  await label('Local password').fill(login);await button('Unlock workspace').click();
  await button('Open backup controls').click();await button('Choose encrypted backup…').click();await page.getByText('synthetic.sorniobackup',{exact:true}).waitFor();
  await credentials();await button('Verify and preview backup').click();await page.getByRole('group',{name:'Verified backup preview'}).waitFor();
  await page.getByText('Invoices: 1',{exact:false}).waitFor();
  for(const name of ['Current Owner password','Recovery passphrase','Original Owner password from backup']) assert.equal(await label(name).inputValue(),'');
  assert(await button('Create safety backup and restore').isDisabled());
  await page.getByRole('group',{name:'Verified backup preview'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:process.argv[4] || 'packages/local-store/target/backup-preview.png',fullPage:true});
  await page.locator('section[aria-labelledby="backup-heading"]').screenshot({path:'docs/reviews/windows-recovery-browser-preview.png'});
  const phraseLabel=page.getByLabel(/^Type RESTORE [a-f0-9]{12} to restore$/);
  const text=await page.locator('label[for="backup-phrase"]').innerText();const phrase=text.slice(5,-11);
  await credentials();await phraseLabel.fill(phrase);await button('Create safety backup and restore').click();
  await label('Local password').waitFor();await label('Local password').fill(login);await button('Unlock workspace').click();
  assert.equal(await label('Workspace note').inputValue(),'Before backup private note');
  assert.equal((await native('list_local_invoices',{after:0})).length,1);
  await stop();start();await page.reload();await label('Local password').fill(login);await button('Unlock workspace').click();
  assert.equal(await label('Workspace note').inputValue(),'Before backup private note');
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);
  console.log('Real native backup integration passed: ciphertext, authentication rejection, preview, cleared secrets, explicit restore, financial preservation and forced restart.');
 }catch(e){console.error(stderr);throw e;}finally{await browser.close();await stop();rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
