import {hubCommandStore,type CommandRecord} from './hub-command-store.ts';
import {secureRestaurantRecords,type SecurePort} from './restaurant-mobile.ts';
import {hubPair,type HubPair} from './restaurant-lan.ts';
import {KOT_STATES,type KotState} from './restaurant-operations.ts';
export const KITCHEN_CAPABILITY='kitchen.transitions.v1';
export type KitchenCommand={version:1;hubId:string;businessId:string;actorId:string;operationId:string;ticketId:string;expectedRevision:number;state:'preparing'|'ready'|'served'};
export type KitchenResult={status:'accepted';kind:'kitchen_state';operationId:string;ticketId:string;orderId:string;state:KotState;revision:number}|{status:'refused';kind:'kitchen_state';operationId:string;ticketId:string;reason:string;state:KotState|null;revision:number|null};
export type KitchenPending=CommandRecord<KitchenCommand,KitchenResult>;
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v);
const rev=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
export function nextKitchenState(state:KotState):KitchenCommand['state']|null{return state==='pending'?'preparing':state==='preparing'?'ready':state==='ready'?'served':null;}
export function kitchenCommand(v:unknown):KitchenCommand{if(!object(v)||v.version!==1||!id(v.hubId)||!id(v.businessId)||!id(v.actorId)||!id(v.operationId)||!id(v.ticketId)||!rev(v.expectedRevision)||!['preparing','ready','served'].includes(String(v.state))||Object.keys(v).some(k=>!['version','hubId','businessId','actorId','operationId','ticketId','expectedRevision','state'].includes(k)))throw new Error('Invalid kitchen command.');return v as KitchenCommand;}
export function kitchenResult(v:unknown,r:KitchenCommand):KitchenResult{
 if(!object(v)||v.kind!=='kitchen_state'||v.operationId!==r.operationId||v.ticketId!==r.ticketId)throw new Error('Unrecognised kitchen result. Recover the same saved command.');
 if(v.status==='accepted'&&id(v.orderId)&&v.state===r.state&&v.revision===r.expectedRevision+1)return {status:'accepted',kind:'kitchen_state',operationId:r.operationId,ticketId:r.ticketId,orderId:v.orderId,state:r.state,revision:v.revision as number};
 if(v.status==='refused'&&typeof v.reason==='string'&&v.reason.length<=120&&(v.state===null||KOT_STATES.includes(v.state as KotState))&&(v.revision===null||rev(v.revision)))return v as KitchenResult;
 throw new Error('Unrecognised kitchen result. Recover the same saved command.');
}
export function kitchenOutbox(port:SecurePort,pair:HubPair,actor:string){
 hubPair(pair);if(!id(actor))throw new Error('Invalid kitchen employee.');const root=`sornio.lan.v1.${pair.hub.hubId}.${pair.deviceId}.${actor}.kitchen`;
 function parse(v:unknown):KitchenPending{if(!object(v)||v.version!==1||!['queued','unknown','accepted','refused'].includes(String(v.state))||v.resumeAfterReconnect!==undefined&&typeof v.resumeAfterReconnect!=='boolean')throw new Error('Invalid kitchen recovery record.');const request=kitchenCommand(v.request);if(request.hubId!==pair.hub.hubId||request.businessId!==pair.hub.businessId||request.actorId!==actor)throw new Error('Kitchen command belongs to another shop or employee.');if(v.state==='accepted'||v.state==='refused'){const result=kitchenResult(v.result,request);if(result.status!==v.state)throw new Error('Kitchen result state differs.');return {version:1,state:result.status,request,result,...(v.resumeAfterReconnect?{resumeAfterReconnect:true}:{})};}return v as KitchenPending;}
 return hubCommandStore<KitchenCommand,KitchenResult>({records:secureRestaurantRecords(port,root),lockKey:root,validate:kitchenCommand,parse,result:kitchenResult,route:'/v1/kitchen-state',base:{version:1,hubId:pair.hub.hubId,businessId:pair.hub.businessId}});
}
