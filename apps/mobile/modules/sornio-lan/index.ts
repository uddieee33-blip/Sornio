import {requireNativeModule, type EventSubscription} from 'expo';
export type DiscoveryEvent={kind:'resolved'|'removed';key:string;host?:string;port?:number;txt?:Record<string,string>};
export type DiscoveryStatus={state:string};
export interface SornioLanNative {
 startDiscovery():Promise<void>;
 stopDiscovery():Promise<void>;
 addListener(event:'onService',listener:(event:DiscoveryEvent)=>void):EventSubscription;
 addListener(event:'onDiscoveryStatus',listener:(event:DiscoveryStatus)=>void):EventSubscription;
}
export function nativeLan():SornioLanNative{return requireNativeModule<SornioLanNative>('SornioLan');}
