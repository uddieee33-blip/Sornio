import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHubCard,hubCardLink,parseHubCard,hubProfiles,HubConnectionError,hubFailure} from './src/hub-setup.ts';
import {hubOutbox} from './src/restaurant-lan.ts';
const now=Date.parse('2026-11-12T12:00:00Z');
const hub={version:1,hubId:'hub',businessId:'business',businessName:'Sornio Café'};
function port(){const data=new Map();return {data,get:async k=>data.get(k)??null,set:async(k,v)=>{data.set(k,v);},delete:async k=>{data.delete(k);}};}
test('public card and QR link round-trip without accepting credentials or trust overrides',()=>{
 const card=makeHubCard('https://shop.local:8443',{...hub,credential:'secret',token:'secret',privateKey:'secret'},now);
 const raw=JSON.stringify(card);assert(!raw.includes('secret'));assert.deepEqual(parseHubCard(hubCardLink(card,now),now),card);
 for(const key of ['credential','token','password','privateKey','skipTlsValidation'])assert.throws(()=>parseHubCard(JSON.stringify({...card,[key]:'must not be accepted'}),now));
 const worst=makeHubCard('https://'+'a'.repeat(60)+'.local:8443',{...hub,hubId:'a'.repeat(128),businessId:'b'.repeat(128),businessName:'🍕'.repeat(60)},now);assert(hubCardLink(worst,now).length<=2800);
});
test('expired/future cards, duplicate link fields, foreign schemes and cleartext are refused',()=>{
 const card=makeHubCard('https://shop.local:8443',hub,now);assert.throws(()=>parseHubCard(JSON.stringify(card),now+86400000));assert.throws(()=>parseHubCard(JSON.stringify(card),now-600000));
 for(const raw of [JSON.stringify({...card,origin:'http://shop.local'}),JSON.stringify({...card,origin:'https://user:secret@shop.local'}),hubCardLink(card,now)+'&card=other','sornio://hub-connect@attacker?card=x','sornio://hub-connect?card=x#override'])assert.throws(()=>parseHubCard(raw,now));
 const marker='private-token-must-not-appear';try{parseHubCard(`{"token":"${marker}`,now);assert.fail();}catch(e){assert(!e.message.includes(marker));}
});
test('remembered shops survive restart, are bounded and contain no caller-supplied credentials',async()=>{
 const p=port();for(let i=0;i<7;i++)await hubProfiles(p).remember('https://shop.local:8443',{...hub,hubId:'hub'+i,token:'not-stored'},now+i);
 const shops=await hubProfiles(p).load();assert.equal(shops.length,5);assert.equal(shops[0].hub.hubId,'hub6');assert(!JSON.stringify(shops).includes('not-stored'));
 await Promise.all([hubProfiles(p).remember('https://one.local:8443',{...hub,hubId:'one'},now),hubProfiles(p).remember('https://two.local:8443',{...hub,hubId:'two'},now)]);const both=await hubProfiles(p).load();assert(both.some(s=>s.hub.hubId==='one'));assert(both.some(s=>s.hub.hubId==='two'));
});
test('failed shortcut writes preserve the previous shop and unrelated unknown requests',async()=>{
 const p=port(),profiles=hubProfiles(p);await profiles.remember('https://shop.local:8443',hub,now);
 const pair={version:1,origin:'https://shop.local:8443',hub,deviceId:'phone',name:'Phone',credential:'a'.repeat(64)};
 const outbox=hubOutbox(p,pair,'cashier');await outbox.queue({version:1,hubId:'hub',businessId:'business',actorId:'cashier',operationId:'op',orderId:'order',tableId:null,expectedRevision:0,items:[{menuId:'pizza',quantity:1,expectedPricePaise:100,note:''}]});await assert.rejects(outbox.recover(async()=>{throw new Error('timeout');},'token'));
 const write=p.set;p.set=async()=>{throw new Error('storage full');};await assert.rejects(profiles.remember('https://new.local:8443',{...hub,hubId:'new'},now));p.set=write;assert.equal((await profiles.load())[0].hub.hubId,'hub');await profiles.removeShortcut('hub');assert.equal((await profiles.load()).length,0);assert.equal((await hubOutbox(p,pair,'cashier').load()).state,'unknown');
});
test('failure classification is precise and never includes arbitrary server messages',()=>{
 const codes=[[401,'session_required'],[403,'access_refused'],[409,'operation_identity_conflict'],[429,'try_later'],[503,'outcome_unknown']];
 for(const [status,code]of codes){const e=hubFailure(status,{error:'unexpected',message:'credential-secret'});assert(e instanceof HubConnectionError);assert.equal(e.code,code);assert(!e.message.includes('credential-secret'));}
 assert.equal(hubFailure(200,{error:'unsupported_version'}).code,'unsupported_version');assert.equal(hubFailure(401,{error:'credentials_refused'}).code,'credentials_refused');
});
test('connection errors never retire an unresolved restaurant operation',async()=>{
 const p=port(),pair={version:1,origin:'https://shop.local:8443',hub,deviceId:'phone',name:'Phone',credential:'a'.repeat(64)};
 const outbox=hubOutbox(p,pair,'cashier');await outbox.queue({version:1,hubId:'hub',businessId:'business',actorId:'cashier',operationId:'stable-request',orderId:'order',tableId:null,expectedRevision:0,items:[{menuId:'pizza',quantity:1,expectedPricePaise:100,note:''}]});
 for(const code of ['session_required','access_refused','unsupported_version','outcome_unknown']){await assert.rejects(outbox.recover(async()=>{throw new HubConnectionError(code);},'token'));const saved=await outbox.load();assert.equal(saved.state,'unknown');assert.equal(saved.request.operationId,'stable-request');await assert.rejects(outbox.acknowledge());}
});
