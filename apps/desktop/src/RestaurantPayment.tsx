import { useRef, useState } from 'react';
import { invoke } from './native';
import { money } from './billing-types';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import { SavedInvoice } from './SavedInvoice';
import type { Invoice } from './billing-types';
import type { ReceiptPayment } from './SavedInvoice';
export function RestaurantPayment({orderId,revision,subtotal,onSettled,username}:{orderId:string;revision:number;subtotal:number|null;onSettled:()=>void;username:string}){
 const [amounts,setAmounts]=useState({cash:'',upi:'',card:'',credit:''}),[tax,setTax]=useState('0'),[customer,setCustomer]=useState('');
 const [message,setMessage]=useState('Review amounts before preparing checkout.'),[busy,setBusy]=useState(false),[started,setStarted]=useState(false);
 const [saved,setSaved]=useState<{invoice:Invoice;payments:ReceiptPayment[]}|null>(null);const request=useRef<Record<string,unknown>|null>(null),running=useRef(false);
 async function pay(recover=false){if(running.current)return;running.current=true;setBusy(true);
 try{
  if(!recover){if(subtotal===null)throw new Error('This order contains unpriced legacy items. Checkout is unavailable.');
   const bps=parseFixedDecimal(tax,2);if(bps===null||bps>10000)throw new Error('Check tax percentage.');
   if(!request.current){const payments=Object.entries(amounts).flatMap(([method,text])=>{const amountPaise=parseFixedDecimal(text||'0',2);if(amountPaise===null)throw new Error('Check payment amounts.');return amountPaise>0?[{id:crypto.randomUUID(),method,amountPaise,reference:''}]:[];});
    request.current={orderId,expectedRevision:revision,operationId:crypto.randomUUID(),taxBasisPoints:bps,customerId:customer||null,payments};}
   await invoke('prepare_restaurant',{r:request.current});setStarted(true);
  }
  const result=await invoke<{data:{invoice:Invoice;payments:ReceiptPayment[]}}>('post_restaurant',{order:orderId});setSaved(result.data);setMessage('Invoice saved. This table is released. Digital tenders remain unverified until reconciled.');
 }catch(e){setMessage(e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message'in e?String(e.message):'Checkout is unresolved. Retry the same request or recover the saved checkout.');}
 finally{running.current=false;setBusy(false);}}
 return <section className="panel"><h3>Restaurant payment</h3><p>Accepted subtotal: {subtotal===null?'Unpriced items':money(subtotal)}</p>{saved?<><SavedInvoice invoice={saved.invoice} payments={saved.payments} username={username}/><button type="button" disabled={busy} onClick={()=>{setBusy(true);void invoke('clear_local_retail',{operationId:saved.invoice.id,saved:true}).then(onSettled).catch(()=>setMessage('Sale saved. Acknowledgement failed; retry Done.')).finally(()=>setBusy(false));}}>Done · refresh tables</button></>:<fieldset disabled={busy||started}><label>Tax %<input value={tax} onChange={e=>setTax(e.target.value)} disabled={!!request.current}/></label>{Object.entries(amounts).map(([method,value])=><label key={method}>{method}<input inputMode="decimal" value={value} disabled={!!request.current} onChange={e=>setAmounts({...amounts,[method]:e.target.value})}/></label>)}<label>Customer ID for credit<input value={customer} disabled={!!request.current} onChange={e=>setCustomer(e.target.value)}/></label><button type="button" disabled={busy||subtotal===null} onClick={()=>void pay()}>Prepare and confirm payment</button></fieldset>}{!saved?<button type="button" disabled={busy} onClick={()=>void pay(true)}>Recover / retry durable checkout</button>:null}<p role="status">{message}</p></section>;
}
