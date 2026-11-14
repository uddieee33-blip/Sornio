import {hubOrigin} from './restaurant-lan.ts';
export const HUB_SERVICE_TYPE='_sornio._tcp.';
export type DiscoveredHub={key:string;origin:string;hubId:string;businessId:string;businessName:string;certificateSha256:string|null;seenAt:number};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
/** DNS-SD supplies hints only. Authenticated TLS identity and owner approval are separate. */
export function discoveredHub(event:unknown,now=Date.now()):DiscoveredHub{
 if(!object(event)||event.kind!=='resolved'||typeof event.key!=='string'||event.key.length>200||!Number.isInteger(event.port)||Number(event.port)<1024||Number(event.port)>65535||!object(event.txt))throw new Error('Invalid service hint.');
 const t=event.txt;const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v);
 if(t.v!=='1'||!id(t.hub)||!id(t.biz)||typeof t.name!=='string'||!t.name.trim()||t.name.length>160||/[\u0000-\u001f\u007f]/.test(t.name)||typeof t.origin!=='string'||t.origin.length>230||t.cert!==undefined&&(typeof t.cert!=='string'||!/^[a-f0-9]{64}$/.test(t.cert)))throw new Error('Unsupported service hint.');
 const origin=hubOrigin(t.origin),u=new URL(origin);if(Number(u.port||443)!==event.port)throw new Error('Service port mismatch.');
 return {key:event.key,origin,hubId:t.hub,businessId:t.biz,businessName:t.name,certificateSha256:typeof t.cert==='string'?t.cert:null,seenAt:now};
}
export function discoveryRegistry(){const rows=new Map<string,DiscoveredHub>();return {
 accept(event:unknown,now=Date.now()){if(object(event)&&event.kind==='removed'&&typeof event.key==='string'){rows.delete(event.key);return;}const row=discoveredHub(event,now);if(rows.has(row.key)||rows.size<50)rows.set(row.key,row);},
 list(now=Date.now()){for(const [key,value]of rows)if(now-value.seenAt>45000)rows.delete(key);return [...rows.values()].sort((a,b)=>a.businessName.localeCompare(b.businessName));},
 clear(){rows.clear();}
};}
