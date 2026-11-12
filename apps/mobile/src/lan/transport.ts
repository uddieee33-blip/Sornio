import {fetch} from 'expo/fetch';
import {hubOrigin,type HubWire} from '../../../../packages/business-domain/src/restaurant-lan';
/** Expo's native fetch blocks redirects in error mode on both Android and iOS.
 * Use OS TLS/hostname validation; no custom trust callback or HTTP fallback. */
export function hubWire(origin:string):HubWire{
 origin=hubOrigin(origin);
 return async(path,body,bearer)=>{
  if(!['/v1/identity','/v1/enrol','/v1/session','/v1/workspace','/v1/submit','/v1/operation'].includes(path))throw new Error('Unsupported hub operation.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body),redirect:'error',credentials:'omit',signal:controller.signal});
   if(response.redirected||response.url!==origin+path)throw new Error('The hub redirected this request. Connection refused.');
   if(!response.ok){if(response.status===401)throw new Error('Staff session expired or credentials refused. Sign in and recover the saved operation.');if(response.status===403)throw new Error('Device, employee or shop access refused. Ask the owner to check enrolment.');if(response.status===409)throw new Error('Operation identity conflict. Keep this request and ask the desktop owner to reconcile it.');throw new Error('Hub did not confirm the operation. Recover the same request after reconnecting.');}
   const reader=response.body?.getReader();if(!reader)throw new Error('Hub response is missing.');let size=0;const decoder=new TextDecoder();let text='';
   while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>262144){await reader.cancel();throw new Error('Hub response exceeds the supported device limit.');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
   const result:unknown=JSON.parse(text);if(typeof result==='object'&&result!==null&&'error'in result)throw new Error('Hub protocol or access was refused. Check shop IDs and application versions.');return result;
  }catch(e){if(e instanceof Error&&e.message.includes('Hub')||e instanceof Error&&e.message.includes('hub')||e instanceof Error&&e.message.includes('Staff')||e instanceof Error&&e.message.includes('Device')||e instanceof Error&&e.message.includes('Operation'))throw e;throw new Error('Connection unavailable or TLS certificate not trusted. Keep the saved draft/request and recover after reconnecting.');}
  finally{clearTimeout(timer);}
 };
}
