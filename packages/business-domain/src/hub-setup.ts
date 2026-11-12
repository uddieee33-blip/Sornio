import {hubIdentity,hubOrigin,type HubIdentity} from './restaurant-lan.ts';
import {secureRestaurantRecords,type SecurePort} from './restaurant-mobile.ts';

export const HUB_ORIGIN_EXAMPLE='https://shop-hostname:8443';
const CARD_KIND='sornio.hub.setup';
const DAY=24*60*60*1000;
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function exact(v:Record<string,unknown>,keys:string[]){if(Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!(k in v)))throw new Error('Connection details contain unsupported fields. Use a fresh card from the desktop.');}
export type HubConnectionCard={kind:typeof CARD_KIND;version:1;origin:string;hubId:string;businessId:string;businessName:string;createdAt:string;expiresAt:string};
export type HubProfile={version:1;origin:string;hub:HubIdentity;verifiedAt:string};

/** Public routing hints only. No device secret, staff identity, token or trust override. */
export function makeHubCard(origin:string,identity:HubIdentity,now=Date.now()):HubConnectionCard{
 const hub=hubIdentity(identity,identity);
 const value={kind:CARD_KIND,version:1,origin:hubOrigin(origin),hubId:hub.hubId,businessId:hub.businessId,businessName:Array.from(hub.businessName).slice(0,60).join(''),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+DAY).toISOString()};
 return parseHubCard(JSON.stringify(value),now);
}
export function hubCardLink(card:HubConnectionCard,now=Date.now()):string{
 const parsed=parseHubCard(JSON.stringify(card),now);const url=new URL('sornio://hub-connect');url.searchParams.set('card',JSON.stringify(parsed));
 if(url.toString().length>2800)throw new Error('Connection link is too large for a QR code. Copy the card text instead.');return url.toString();
}
export function parseHubCard(input:string,now=Date.now()):HubConnectionCard{
 if(input.length>6000)throw new Error('Connection card is too large.');let raw=input.trim();
 if(raw.startsWith('sornio:')){let u:URL;try{u=new URL(raw);}catch{throw new Error('Unsupported Sornio connection link.');}if(u.hostname!=='hub-connect'||u.pathname&&u.pathname!=='/'||u.username||u.password||u.port||u.hash||[...u.searchParams.keys()].length!==1||!u.searchParams.has('card'))throw new Error('Unsupported Sornio connection link.');raw=u.searchParams.get('card')!;}
 if(raw.length>2000)throw new Error('Connection card is too large.');let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('Connection card could not be read. Paste the public card from the desktop.');}
 if(!object(value))throw new Error('Invalid connection card.');exact(value,['kind','version','origin','hubId','businessId','businessName','createdAt','expiresAt']);
 if(value.kind!==CARD_KIND||value.version!==1||typeof value.origin!=='string'||typeof value.businessName!=='string'||Array.from(value.businessName).length>60||/[\u0000-\u001f\u007f]/.test(value.businessName)||typeof value.createdAt!=='string'||typeof value.expiresAt!=='string')throw new Error('Unsupported connection card.');
 hubIdentity({version:1,hubId:value.hubId,businessId:value.businessId,businessName:value.businessName},{hubId:String(value.hubId),businessId:String(value.businessId)});
 const start=Date.parse(value.createdAt),end=Date.parse(value.expiresAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>DAY||start>now+300000||end<=now)throw new Error('Connection card expired or device time differs. Ask the owner for a fresh card and check device clocks.');
 let origin:string;try{origin=hubOrigin(value.origin);}catch{throw new Error('The connection card must contain an HTTPS origin without credentials or a path.');}return {...value,origin} as HubConnectionCard;
}
function profile(value:unknown):HubProfile{
 if(!object(value))throw new Error('Saved shop shortcut is invalid.');exact(value,['version','origin','hub','verifiedAt']);
 if(value.version!==1||typeof value.origin!=='string'||!object(value.hub)||typeof value.verifiedAt!=='string'||!Number.isFinite(Date.parse(value.verifiedAt)))throw new Error('Saved shop shortcut is invalid.');
 exact(value.hub,['version','hubId','businessId','businessName']);
 const hub=hubIdentity(value.hub,{hubId:String(value.hub.hubId),businessId:String(value.hub.businessId)});return {version:1,origin:hubOrigin(value.origin),hub,verifiedAt:value.verifiedAt};
}
let profileWrite=Promise.resolve();
/** Shortcuts are not credentials or authorization. Device grants and unresolved
 * operations live separately and are never removed by this store. */
export function hubProfiles(port:SecurePort){
 const records=secureRestaurantRecords(port,'sornio.lan.shortcuts.v1');
 async function load(){const raw=await records.read('profiles');if(raw===null)return [];const values:unknown=JSON.parse(raw);if(!Array.isArray(values)||values.length>5)throw new Error('Saved shop shortcuts are invalid.');const result=values.map(profile);if(new Set(result.map(p=>p.hub.hubId)).size!==result.length)throw new Error('Duplicate shop shortcut.');return result;}
 async function change(update:(old:HubProfile[])=>HubProfile[]){const next=profileWrite.catch(()=>{}).then(async()=>{const values=update(await load());await records.write('profiles',JSON.stringify(values));});profileWrite=next;await next;}
 return {
  async load(){await profileWrite.catch(()=>{});return load();},
  /** Call only after an explicit HTTPS identity check; still confers no access. */
  async remember(origin:string,identity:HubIdentity,now=Date.now()){
   const hub=hubIdentity(identity,identity);const entry=profile({version:1,origin,hub:{version:1,hubId:hub.hubId,businessId:hub.businessId,businessName:hub.businessName},verifiedAt:new Date(now).toISOString()});
   await change(old=>[entry,...old.filter(p=>p.hub.hubId!==entry.hub.hubId)].slice(0,5));
  },
  async removeShortcut(hubId:string){await change(old=>old.filter(p=>p.hub.hubId!==hubId));}
 };
}
export type HubFailureCode='session_required'|'credentials_refused'|'access_refused'|'wrong_shop'|'try_later'|'operation_identity_conflict'|'unsupported_version'|'invalid_request'|'outcome_unknown'|'network_unavailable'|'redirect_refused'|'response_too_large';
const messages:Record<HubFailureCode,string>={
 session_required:'Staff session expired. Sign in again, then recover the same saved request.',
 credentials_refused:'Staff sign-in was refused. Check the assigned employee account and password.',
 access_refused:'Access refused. Ask the owner to check device approval, expiry and employee assignment.',
 wrong_shop:'This address does not match the selected shop. No new order should be started here.',
 try_later:'The hub is busy or sign-in is temporarily limited. Wait, then recover the saved request.',
 operation_identity_conflict:'This request identity conflicts with the hub history. Keep it and ask the desktop owner to reconcile it.',
 unsupported_version:'The phone and desktop use incompatible protocols. Update them before recovering the saved request.',
 invalid_request:'The hub could not validate this request. Keep it and ask the desktop owner to review it.',
 outcome_unknown:'The hub did not confirm the outcome. Recover the same saved request before editing.',
 network_unavailable:'Cannot reach the verified hub. Check Wi-Fi, the unlocked desktop and HTTPS certificate trust, then recover the saved request.',
 redirect_refused:'The address redirected elsewhere. Connection refused; check the desktop connection card.',
 response_too_large:'The hub reply exceeds this device’s limit. Keep saved work and ask the desktop owner to review it.'
};
export class HubConnectionError extends Error{readonly code:HubFailureCode;constructor(code:HubFailureCode){super(messages[code]);this.name='HubConnectionError';this.code=code;}}
export function hubFailure(status:number,body:unknown):HubConnectionError{
 const code=object(body)&&typeof body.error==='string'?body.error:'';
 if(Object.prototype.hasOwnProperty.call(messages,code)&&code!=='network_unavailable'&&code!=='redirect_refused'&&code!=='response_too_large')return new HubConnectionError(code as HubFailureCode);
 return new HubConnectionError(status===401?'session_required':status===403?'access_refused':status===409?'operation_identity_conflict':status===429?'try_later':'outcome_unknown');
}
