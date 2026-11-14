import {hubCommandStore} from './hub-command-store.ts';
import {secureRestaurantRecords,type SecurePort,parseRestaurantSnapshot} from './restaurant-mobile.ts';
import type {RestaurantSnapshot} from './restaurant-operations.ts';
export type HubIdentity={capabilities?:string[];version:1;hubId:string;businessId:string;businessName:string};
export type HubPair={certificateSha256?:string;certificateConfirmedAt?:string;version:1;origin:string;hub:HubIdentity;deviceId:string;name:string;credential:string};
export type HubSession={token:string;expires:number;actorId:string;displayName:string};
export type HubLine={menuId:string;quantity:number;expectedPricePaise:number;note:string};
export type HubSubmission={version:1;hubId:string;businessId:string;operationId:string;actorId:string;orderId:string;tableId:string|null;expectedRevision:number;items:HubLine[]};
export type HubResult={status:'accepted';operationId:string;orderId:string;revision:number;kitchenDispatched:false}|{status:'refused';reason:string;revision:number|null};
export type HubPending={resumeAfterReconnect?:boolean;version:1;state:'queued'|'unknown'|'accepted'|'refused';request:HubSubmission;result?:HubResult};
export type HubDraft={orderId:string;tableId:string|null;expectedRevision:number;items:HubLine[]};
export type HubWire=(path:string,body:Record<string,unknown>,bearer:string)=>Promise<unknown>;
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const id=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(s);
const int=(n:unknown,min=0):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=9_000_000_000_000_000;
export function hubOrigin(raw:string){let u:URL;try{u=new URL(raw);}catch{throw new Error('Enter a valid HTTPS hub origin without credentials, a path or a query.');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.hostname.length>253)throw new Error('Enter an HTTPS hub origin without a path, credentials or query.');return u.origin;}
export function hubIdentity(value:unknown,expected:{hubId:string;businessId:string}):HubIdentity{
 if(!id(expected.hubId)||!id(expected.businessId)||!obj(value)||value.version!==1||value.hubId!==expected.hubId||value.businessId!==expected.businessId||typeof value.businessName!=='string'||value.businessName.length>120)throw new Error('The hub does not match the IDs shown on the desktop.');if(value.capabilities!==undefined&&(!Array.isArray(value.capabilities)||value.capabilities.length>8||value.capabilities.some(c=>typeof c!=='string'||!/^[a-z.0-9_-]{1,80}$/.test(c))))throw new Error('Invalid hub capabilities.');return value as HubIdentity;
}
export function hubPair(value:unknown):HubPair{if(!obj(value)||value.version!==1||!obj(value.hub)||!id(value.hub.hubId)||!id(value.hub.businessId)||!id(value.deviceId)||typeof value.name!=='string'||!value.name.trim()||value.name.length>60||/[\u0000-\u001f\u007f]/.test(value.name)||typeof value.credential!=='string'||!/^[a-f0-9]{64}$/.test(value.credential)||typeof value.origin!=='string')throw new Error('Saved device enrolment is invalid.');if(value.certificateSha256!==undefined&&(typeof value.certificateSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.certificateSha256)||typeof value.certificateConfirmedAt!=='string'||!Number.isFinite(Date.parse(value.certificateConfirmedAt))))throw new Error('Saved certificate confirmation is invalid.');hubOrigin(value.origin);hubIdentity(value.hub,{hubId:value.hub.hubId,businessId:value.hub.businessId});return value as HubPair;}
export function hubSubmission(value:unknown):HubSubmission{
 if(!obj(value)||value.version!==1||!id(value.hubId)||!id(value.businessId)||!id(value.operationId)||!id(value.actorId)||!id(value.orderId)||!(value.tableId===null||id(value.tableId))||!int(value.expectedRevision)||!Array.isArray(value.items)||value.items.length<1||value.items.length>30||value.items.some(i=>!obj(i)||!id(i.menuId)||!int(i.quantity,1)||i.quantity>1000||!int(i.expectedPricePaise)||typeof i.note!=='string'||i.note.length>200||/[\u0000-\u001f\u007f]/.test(i.note)))throw new Error('Review valid menu items, whole portions, notes and prices before queueing.');
 // Bound total with integer arithmetic; native menu pricing remains authoritative.
 let total=0;for(const i of value.items as HubLine[]){total+=i.quantity*i.expectedPricePaise;if(!Number.isSafeInteger(total)||total>9_000_000_000_000_000)throw new Error('Order amount is too large.');}return value as HubSubmission;
}
export function hubResult(value:unknown,r:HubSubmission,saved=false):HubResult{
 if(!obj(value))throw new Error('Unrecognised hub result; recover the same operation.');
 if(value.status==='accepted'&&value.operationId===r.operationId&&value.orderId===r.orderId&&int(value.revision,1)&&value.revision===r.expectedRevision+1&&(saved&&value.items===undefined||Array.isArray(value.items)&&value.items.length===r.items.length)&&value.kitchenDispatched===false)return {status:'accepted',operationId:r.operationId,orderId:r.orderId,revision:value.revision,kitchenDispatched:false};
 if(value.status==='refused'&&typeof value.reason==='string'&&value.reason.length<=120&&(value.revision===null||int(value.revision)))return value as HubResult;
 throw new Error('Unrecognised hub result; recover the same operation.');
}
export function pendingRecord(value:unknown,pair:HubPair,actor:string):HubPending{if(!obj(value)||value.version!==1||!['queued','unknown','accepted','refused'].includes(String(value.state)))throw new Error('Invalid pending operation.');if(value.resumeAfterReconnect!==undefined&&typeof value.resumeAfterReconnect!=='boolean')throw new Error('Invalid reconnect policy.');const r=hubSubmission(value.request);if(r.hubId!==pair.hub.hubId||r.businessId!==pair.hub.businessId||r.actorId!==actor)throw new Error('This queue belongs to another shop or employee.');if(value.state==='accepted'||value.state==='refused'){const result=hubResult(value.result,r,true);if(result.status!==value.state)throw new Error('Saved result differs.');return {...(value.resumeAfterReconnect?{resumeAfterReconnect:true}:{}),version:1,state:result.status,request:r,result};}return value as HubPending;}
/** One unresolved command per paired employee. Immutable payload is durable before
 * transport. Every retry queries status, then resends only the SAME command. */
export function hubOutbox(port:SecurePort,pair:HubPair,actor:string){
 hubPair(pair);if(!id(actor))throw new Error('Invalid hub employee.');const root=`sornio.lan.v1.${pair.hub.hubId}.${pair.deviceId}.${actor}`,records=secureRestaurantRecords(port,root);
 const commands=hubCommandStore<HubSubmission,HubResult>({records,lockKey:root,validate:hubSubmission,parse:value=>pendingRecord(value,pair,actor),result:hubResult,route:'/v1/submit',base:{version:1,hubId:pair.hub.hubId,businessId:pair.hub.businessId}});
 return {...commands,
  async saveDraft(d:HubDraft){if(d.items.length){hubSubmission({version:1,hubId:pair.hub.hubId,businessId:pair.hub.businessId,operationId:'draft',actorId:actor,...d});}else if(!id(d.orderId)||!(d.tableId===null||id(d.tableId))||!int(d.expectedRevision))throw new Error('Invalid empty draft.');await records.write('draft',JSON.stringify(d));},
  async loadDraft():Promise<HubDraft|null>{const raw=await records.read('draft');if(!raw)return null;const d=JSON.parse(raw) as HubDraft;if(!Array.isArray(d.items)||!id(d.orderId)||!(d.tableId===null||id(d.tableId))||!int(d.expectedRevision))throw new Error('Invalid saved draft.');if(d.items.length)hubSubmission({version:1,hubId:pair.hub.hubId,businessId:pair.hub.businessId,operationId:'draft',actorId:actor,...d});return d;}
 };
}
/** Validate a received workspace under the enrolled business, never demo scope. */
export function hubWorkspace(value:unknown,pair:HubPair):RestaurantSnapshot{return parseRestaurantSnapshot(JSON.stringify(value),pair.hub.businessId,262144);}
