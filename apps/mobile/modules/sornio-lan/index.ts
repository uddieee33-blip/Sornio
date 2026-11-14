import {requireNativeModule, type EventSubscription} from 'expo';
export type DiscoveryEvent={kind:'resolved'|'removed';key:string;host?:string;port?:number;txt?:Record<string,string>};
export type DiscoveryStatus={state:string};
export interface SornioLanNative {
 probe(origin:string):Promise<{status:number;body:string;certificateSha256:string}>;
 request(origin:string,path:string,body:string,bearer:string,pin:string):Promise<{status:number;body:string;certificateSha256:string}>;
 startDiscovery():Promise<void>;
 stopDiscovery():Promise<void>;
 addListener(event:'onService',listener:(event:DiscoveryEvent)=>void):EventSubscription;
 addListener(event:'onDiscoveryStatus',listener:(event:DiscoveryStatus)=>void):EventSubscription;
}
export function nativeLan():SornioLanNative{try{return requireNativeModule<SornioLanNative>('SornioLan');}catch{throw Object.assign(new Error('Native Sornio LAN module is unavailable.'),{code:'ERR_MODULE_NOT_FOUND'});}}
