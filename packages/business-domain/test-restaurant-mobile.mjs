import test from 'node:test';import assert from 'node:assert/strict';
import {parseRestaurantSnapshot,parseRestaurantDraft,restaurantStorage,restaurantCanDraft} from './src/restaurant-mobile.ts';
import {kitchenChangeValid} from './src/restaurant-operations.ts';
const scope={businessId:'shop',actorId:'owner',mode:'live'};
const snapshot={schemaVersion:1,source:'shop',businessId:'shop',generatedAt:'2026-11-12T00:00:00Z',tables:[{id:'t',name:'Table 1'}],orders:[{id:'o',tableId:'t',kind:'dine_in',state:'open',revision:1}],tickets:[{id:'k',orderId:'o',state:'preparing',revision:1,items:[{name:'Pizza',quantity:1,note:'No onion'}]}],menu:[{id:'m',productId:'p',category:'Food',label:'Pizza',variant:'Large',available:true,pricePaise:29900}],assignments:[{orderId:'o',actorId:'cashier',displayName:'Cashier',checkoutState:'bound'}]};
const draft={version:1,id:'draft',...scope,kind:'dine_in',tableId:'t',items:[{productId:'p',label:'Pizza Large',quantityMilli:1250,note:'ਪਿਆਜ਼ ਨਹੀਂ'.repeat(10)}],savedAt:'2026-11-12T00:00:00Z'};
function port(){const data=new Map();return {data,get:async k=>data.get(k)??null,set:async(k,v)=>{data.set(k,v);},delete:async k=>{data.delete(k);}};}
test('shop copies retain menu/table/KOT/assignment data and reject foreign or malformed identities',()=>{
 assert.deepEqual(parseRestaurantSnapshot(JSON.stringify(snapshot),'shop'),snapshot);
 assert.throws(()=>parseRestaurantSnapshot(JSON.stringify(snapshot),'other'));
 for(const changed of [{tables:[...snapshot.tables,...snapshot.tables]},{tickets:[{...snapshot.tickets[0],state:'paid'}]},{menu:[{...snapshot.menu[0],pricePaise:1.25}]}])assert.throws(()=>parseRestaurantSnapshot(JSON.stringify({...snapshot,...changed}),'shop'));
});
test('draft quantities and account/mode isolation never become financial commands',()=>{
 assert.deepEqual(parseRestaurantDraft(JSON.stringify(draft),scope),draft);
 for(const changed of [{actorId:'other'},{businessId:'other'},{mode:'demo'}])assert.throws(()=>parseRestaurantDraft(JSON.stringify(draft),{...scope,...changed}));
 assert.throws(()=>parseRestaurantDraft(JSON.stringify({...draft,items:[{...draft.items[0],quantityMilli:1.2}]}),scope));assert.equal('payments'in draft,false);assert.equal('invoiceId'in draft,false);
 assert(restaurantCanDraft('cashier'));assert(!restaurantCanDraft('auditor'));
});
test('secure chunks reopen in a new storage instance after restart',async()=>{
 const p=port();await restaurantStorage(p,scope).saveDraft(draft);assert.deepEqual(await restaurantStorage(p,scope).loadDraft(),draft);
 await restaurantStorage(p,scope).saveSnapshot(JSON.stringify(snapshot));assert.deepEqual(await restaurantStorage(p,scope).loadSnapshot(),snapshot);
 assert.equal(await restaurantStorage(p,{...scope,actorId:'other'}).loadDraft(),null);assert.equal(await restaurantStorage(p,{...scope,mode:'demo'}).loadDraft(),null);
 assert([...p.data.values()].every(s=>s.length<=500));
});
test('interrupted writes retain the preceding valid pointer',async()=>{
 const p=port();const store=restaurantStorage(p,scope);await store.saveDraft(draft);let n=0;
 const faulty={...p,set:async(k,v)=>{if(++n===2)throw Error('Device full');await p.set(k,v);}};
 await assert.rejects(restaurantStorage(faulty,scope).saveDraft({...draft,id:'changed'}));assert.deepEqual(await store.loadDraft(),draft);
});
test('concurrent local saves serialize intent and corrupted manifests fail closed',async()=>{
 const p=port();const a=restaurantStorage(p,scope),b=restaurantStorage(p,scope);await Promise.all([a.saveDraft(draft),b.saveDraft({...draft,id:'last'})]);assert.equal((await a.loadDraft()).id,'last');
 const key=[...p.data.keys()].find(k=>k.endsWith('draft.current'));p.data.set(key,JSON.stringify({version:'../../escape',count:1,length:1}));await assert.rejects(a.loadDraft());
});
test('correction contract permits operational changes and rejects control characters',()=>{
 for(const kind of ['added','removed','quantity','instructions'])assert(kitchenChangeValid({kind,description:'Pizza',before:'1',after:'2'}));
 assert(!kitchenChangeValid({kind:'payment',description:'Pizza',before:'',after:''}));assert(!kitchenChangeValid({kind:'added',description:'Pizza\n',before:'',after:''}));
});
