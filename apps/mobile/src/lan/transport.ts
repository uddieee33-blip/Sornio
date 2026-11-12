import {fetch} from 'expo/fetch';
import {hubOrigin,type HubWire} from '../../../../packages/business-domain/src/restaurant-lan';
import {HubConnectionError,hubFailure} from '../../../../packages/business-domain/src/hub-setup';
/** Native fetch refuses redirects and retains OS TLS chain/hostname validation. */
export function hubWire(origin:string):HubWire{
 origin=hubOrigin(origin);
 return async(path,body,bearer)=>{
  if(!['/v1/identity','/v1/enrol','/v1/session','/v1/workspace','/v1/submit','/v1/operation'].includes(path))throw new HubConnectionError('invalid_request');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body),redirect:'error',credentials:'omit',signal:controller.signal});
   if(response.redirected||response.url!==origin+path)throw new HubConnectionError('redirect_refused');
   const reader=response.body?.getReader();if(!reader)throw new HubConnectionError('outcome_unknown');let size=0;const decoder=new TextDecoder();let text='';
   while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>262144){await reader.cancel();throw new HubConnectionError('response_too_large');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
   let result:unknown;try{result=JSON.parse(text);}catch{throw hubFailure(response.status,null);}
   if(!response.ok||typeof result==='object'&&result!==null&&'error'in result)throw hubFailure(response.status,result);
   return result;
  }catch(e){if(e instanceof HubConnectionError)throw e;throw new HubConnectionError('network_unavailable');}
  finally{clearTimeout(timer);}
 };
}
