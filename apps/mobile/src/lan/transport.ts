import {nativeLan} from '../../modules/sornio-lan';
import {hubOrigin,type HubWire} from '../../../../packages/business-domain/src/restaurant-lan';
import {HubConnectionError,hubFailure} from '../../../../packages/business-domain/src/hub-setup';
type Reply={status:number;body:string;certificateSha256:string};
function nativeFailure(error:unknown):HubConnectionError{
 let candidate=error;for(let i=0;i<4&&typeof candidate==='object'&&candidate!==null;i++){const e=candidate as {code?:string;cause?:unknown};if(['certificate_changed','certificate_untrusted','certificate_expired','network_unavailable','redirect_refused','response_too_large','invalid_request'].includes(e.code??''))return new HubConnectionError(e.code as 'certificate_changed');if(e.code==='ERR_MODULE_NOT_FOUND')return new HubConnectionError('native_connection_unavailable');candidate=e.cause;}
 return new HubConnectionError('network_unavailable');
}
function read(reply:Reply){if(!Number.isInteger(reply.status)||typeof reply.body!=='string'||reply.body.length>262144||!/^[a-f0-9]{64}$/.test(reply.certificateSha256))throw new HubConnectionError('outcome_unknown');let result:unknown;try{result=JSON.parse(reply.body);}catch{throw hubFailure(reply.status,null);}if(reply.status<200||reply.status>=300||typeof result==='object'&&result!==null&&'error'in result)throw hubFailure(reply.status,result);return result;}
/** A probe sends no credentials. The native TLS stack validates chain, dates and
 * hostname and returns the actual leaf fingerprint for explicit desktop comparison. */
export async function probeHub(origin:string){try{const native=nativeLan();if(typeof native.probe!=='function')throw new HubConnectionError('native_connection_unavailable');const reply=await native.probe(hubOrigin(origin));return {identity:read(reply),certificateSha256:reply.certificateSha256};}catch(e){if(e instanceof HubConnectionError)throw e;throw nativeFailure(e);}}
/** Every credential/order request checks the saved leaf pin on the same TLS
 * connection before HTTP headers/body, in addition to ordinary OS trust. */
export function hubWire(origin:string,pin?:string):HubWire{
 origin=hubOrigin(origin);return async(path,body,bearer)=>{
  if(!pin||!/^[a-f0-9]{64}$/.test(pin))throw new HubConnectionError('certificate_confirmation_required');
  try{const native=nativeLan();if(typeof native.request!=='function')throw new HubConnectionError('native_connection_unavailable');const reply=await native.request(origin,path,JSON.stringify(body),bearer,pin);if(reply.certificateSha256!==pin)throw new HubConnectionError('certificate_changed');return read(reply);}catch(e){if(e instanceof HubConnectionError)throw e;throw nativeFailure(e);}
 };
}
