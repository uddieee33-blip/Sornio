import {hubOrigin,type HubPair} from './restaurant-lan.ts';
export type CertificateReview='known'|'first_connection'|'changed_certificate'|'hint_mismatch'|'changed_address';
export function certificateReview(actual:string,saved:HubPair|null,hint?:string):CertificateReview{
 if(!/^[a-f0-9]{64}$/.test(actual)||hint!==undefined&&!/^[a-f0-9]{64}$/.test(hint))throw new Error('Invalid certificate fingerprint.');
 if(saved?.certificateSha256===actual)return 'known';
 if(saved?.certificateSha256)return 'changed_certificate';
 if(hint&&hint!==actual)return 'hint_mismatch';
 return 'first_connection';
}
export function fingerprintText(value:string){if(!/^[a-f0-9]{64}$/.test(value))throw new Error('Invalid certificate fingerprint.');return value.match(/.{4}/g)!.join(' ');}

/** Address migration never silently sends credentials to a new endpoint. The
 * actual certificate is probed first, then the employee confirms the owner-approved
 * change. Pair/device/order identities remain intact. */
export function connectionReview(actual:string,saved:HubPair|null,origin:string,hint?:string):CertificateReview{
 const result=certificateReview(actual,saved,hint);
 return saved&&hubOrigin(saved.origin)!==hubOrigin(origin)&&result==='known'?'changed_address':result;
}
