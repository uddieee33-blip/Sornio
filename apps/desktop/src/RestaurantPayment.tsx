import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from './native';
import { money, formatPaiseInput } from './billing-types';
import type { Principal } from './native';
import type { Product, Invoice } from './billing-types';
import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal';
import { SavedInvoice } from './SavedInvoice';
import type { ReceiptPayment } from './SavedInvoice';
import type { RetailRequest } from './retail-types';
type Recovery={orderId:string;parentId:string;attemptId:string;actorId:string;revision:number;phase:string;reason:string;request:RetailRequest};
type Line={productId:string;quantity:string;note:string};
export function RestaurantPayment({orderId,revision,subtotal,onSettled,username,owner}:{orderId:string;revision:number;subtotal:number|null;onSettled:()=>void;username:string;owner:boolean}){
 const [staff,setStaff]=useState<Principal[]>([]);
 useEffect(()=>{if(owner)void invoke<Principal[]>('list_local_staff').then(setStaff).catch(()=>setMessage('Staff list unavailable; refresh owner session.'));},[owner]);
 const [amounts,setAmounts]=useState({cash:'',upi:'',card:'',credit:''}),[tax,setTax]=useState('0'),[customer,setCustomer]=useState('');
 const [status,setStatus]=useState<Recovery|null>(null),[ready,setReady]=useState(false),[editing,setEditing]=useState(false),[accepted,setAccepted]=useState(false),[lines,setLines]=useState<Line[]>([]),[products,setProducts]=useState<Product[]>([]),[target,setTarget]=useState('');
 const [message,setMessage]=useState('Opening saved checkout…'),[busy,setBusy]=useState(false);
 const [saved,setSaved]=useState<{invoice:Invoice;payments:ReceiptPayment[]}|null>(null);const request=useRef<Record<string,unknown>|null>(null),running=useRef(false);
 const refresh=useCallback(async(hydrate=true)=>{const c=await invoke<Recovery|null>('restaurant_status',{order:orderId});setStatus(c);if(hydrate&&c?.request.action.kind==='sale'){const sale=c.request.action;setTax(String(sale.invoice.taxBasisPoints/100));setCustomer(sale.invoice.customerId??'');setAmounts(Object.fromEntries(['cash','upi','card','credit'].map(m=>[m,formatPaiseInput(sale.payments.filter(p=>p.method===m).reduce((v,p)=>v+p.amountPaise,0))])) as typeof amounts);}setReady(true);return c;},[orderId]);
 useEffect(()=>{setAccepted(false);},[lines]);
 useEffect(()=>{void Promise.all([refresh(),invoke<Product[]>('list_local_products')]).then(([,p])=>setProducts(p)).catch(()=>{setReady(false);setMessage('Could not recover checkout state. Reopen this order.');});},[refresh]);
 async function edit(){if(!status||!['refused','editable'].includes(status.phase))return;setBusy(true);try{const c=await invoke<Recovery>('edit_restaurant',{order:orderId,expected:status.revision});setStatus(c);if(c.request.action.kind!=='sale')return;const sale=c.request.action;setLines(sale.invoice.lines.map(l=>({productId:l.productId,quantity:String(l.quantityMilli/1000),note:''})));setTax(String(sale.invoice.taxBasisPoints/100));setCustomer(sale.invoice.customerId??'');setAmounts(Object.fromEntries(['cash','upi','card','credit'].map(m=>[m,formatPaiseInput(sale.payments.filter(p=>p.method===m).reduce((v,p)=>v+p.amountPaise,0))])) as typeof amounts);setAccepted(false);setEditing(true);request.current=null;}catch{setMessage('This bill changed or cannot be edited. Recover its current state.');}finally{setBusy(false);}}
 const bps=parseFixedDecimal(tax,2), correctedSubtotal=editing?lines.reduce((sum,l)=>{const p=products.find(p=>p.id===l.productId),q=parseFixedDecimal(l.quantity,3);return p&&q!==null?sum+(BigInt(q)*BigInt(p.unitPricePaise)+500n)/1000n:sum;},0n):BigInt(subtotal??0);
 const payable=status&&!editing&&status.request.action.kind==='sale'?status.request.action.payments.reduce((sum,p)=>sum+BigInt(p.amountPaise),0n):bps===null||bps>10000?null:correctedSubtotal+(correctedSubtotal*BigInt(bps)+5000n)/10000n;
 const allocated=Object.values(amounts).reduce((sum,s)=>sum+BigInt(parseFixedDecimal(s||'0',2)??0),0n);
 async function pay(recover=false){if(running.current||!ready)return;running.current=true;setBusy(true);
 try{
  let attempt=status?.attemptId;
  if(!recover){
   if(bps===null||bps>10000)throw new Error('Check tax percentage.');
   const payments=Object.entries(amounts).flatMap(([method,text])=>{const amountPaise=parseFixedDecimal(text||'0',2);if(amountPaise===null)throw new Error('Check payment amounts.');return amountPaise>0?[{id:crypto.randomUUID(),method,amountPaise,reference:''}]:[];});
   if(editing){if(!status||!['refused','editable'].includes(status.phase)||!accepted)throw new Error('Recover the current refusal and accept the displayed prices first.');
    if(!request.current)request.current={orderId,expectedRevision:status.revision,attemptId:crypto.randomUUID(),lines:lines.map(l=>{const p=products.find(p=>p.id===l.productId),q=parseFixedDecimal(l.quantity,3);if(!p||q===null||q<=0)throw new Error('Check corrected items and quantities.');return {productId:p.id,quantityMilli:q,pricePaise:p.unitPricePaise,note:l.note};}),taxBasisPoints:bps,customerId:customer||null,payments,acceptPrices:true};
    const c=await invoke<Recovery>('amend_restaurant',{r:request.current});setStatus(c);attempt=c.attemptId;setEditing(false);request.current=null;
   }else if(!status){if(subtotal===null)throw new Error('This order contains unpriced items.');
    if(!request.current)request.current={orderId,expectedRevision:revision,operationId:crypto.randomUUID(),taxBasisPoints:bps,customerId:customer||null,payments};
    const r=await invoke<RetailRequest>('prepare_restaurant',{r:request.current});attempt=r.operationId;
   }
  }
  if(!attempt)throw new Error('No saved checkout exists. Review and prepare the bill first.');
  const result=await invoke<{data:{invoice:Invoice;payments:ReceiptPayment[]}}>('post_restaurant',{order:orderId,attempt});setSaved(result.data);setMessage('Invoice saved. Table released. Digital tenders await reconciliation.');
 }catch(e){setMessage(e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message'in e?String(e.message):'Outcome unknown. Recover the saved checkout.');setEditing(false);try{const recovered=await refresh(false);if(!recovered)request.current=null;else if(editing&&['refused','editable'].includes(recovered.phase)){setEditing(true);request.current=null;}}catch{setReady(false);}}
 finally{running.current=false;setBusy(false);}}
 const canEnter=ready&&!busy&&(!status||editing);
 return <section className="panel"><h3>Restaurant payment</h3><p role="status">{status?({bound:'Ready to submit',submitting:'Recover checkout before editing',unknown:'Outcome unknown — recover checkout',refused:'Payment refused — bill remains unpaid',editable:'Unpaid bill — editing is safe',settled:'Paid'}[status.phase]??status.phase):'Unpaid bill'}</p>{status?.reason?<p role="alert">{status.reason}</p>:null}
 {saved?<><SavedInvoice invoice={saved.invoice} payments={saved.payments} username={username}/><button type="button" disabled={busy} onClick={()=>{setBusy(true);void invoke('clear_local_retail',{operationId:saved.invoice.id,saved:true}).then(onSettled).catch(()=>setMessage('Sale saved. Retry Done to acknowledge it.')).finally(()=>setBusy(false));}}>Done · refresh tables</button></>:<>
 {status&&['refused','editable'].includes(status.phase)&&!editing?<button type="button" disabled={busy} onClick={edit}>Edit unpaid bill</button>:null}
 <fieldset disabled={!canEnter}><legend>{editing?'Correct unpaid bill':'Payment allocation'}</legend>
 {editing?<>{lines.map((line,i)=><div key={i}><label>Item<select value={line.productId} onChange={e=>setLines(lines.map((l,j)=>i===j?{...l,productId:e.target.value}:l))}>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.unitPricePaise)}</option>)}</select></label><label>Quantity<input inputMode="decimal" value={line.quantity} onChange={e=>setLines(lines.map((l,j)=>i===j?{...l,quantity:e.target.value}:l))}/></label><label>Preparation correction<input maxLength={200} value={line.note} onChange={e=>setLines(lines.map((l,j)=>i===j?{...l,note:e.target.value}:l))}/></label><button type="button" onClick={()=>setLines(lines.filter((_,j)=>i!==j))}>Remove item</button></div>)}<button type="button" onClick={()=>{if(products[0])setLines([...lines,{productId:products[0].id,quantity:'1',note:''}]);}}>Add replacement / add-on</button><label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>I accept the displayed current prices for this corrected bill.</label><p>Corrections are kept in the audit history; dispatched kitchen tickets retain their original instructions.</p></>:null}
 <label>Tax %<input value={tax} onChange={e=>setTax(e.target.value)}/></label>{Object.entries(amounts).map(([method,value])=><label key={method}>{method}<input inputMode="decimal" value={value} onChange={e=>setAmounts({...amounts,[method]:e.target.value})}/></label>)}<label>Customer ID for credit<input value={customer} onChange={e=>setCustomer(e.target.value)}/></label><p>Payable: {payable===null?'Check tax':money(String(payable))} · Allocated: {money(String(allocated))} · Remaining: {payable===null?'—':money(String(payable-allocated))}</p><button type="button" disabled={editing&&!accepted} onClick={()=>void pay()}>{editing?'Confirm corrected bill and payment':'Confirm payment'}</button></fieldset>
 {status&&!editing?<button type="button" disabled={busy||!ready} onClick={()=>void pay(true)}>Recover checkout / retry same attempt</button>:null}
 {status&&owner?<div><label>Transfer unpaid checkout to employee<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose enabled employee</option>{staff.filter(p=>p.enabled).map(p=><option key={p.id} value={p.id}>{p.displayName} · {p.role}</option>)}</select></label><button type="button" disabled={busy||!target||!['bound','refused','editable'].includes(status.phase)} onClick={()=>{setBusy(true);void invoke<Recovery>('takeover_restaurant',{order:orderId,expected:status.revision,target}).then(c=>{setStatus(c);setMessage('Checkout transferred. The assigned cashier can recover it.');}).catch(()=>setMessage('Transfer refused or stale. Recover current state before retrying.')).finally(()=>setBusy(false));}}>Transfer unpaid checkout</button></div>:null}
 </>}<p role="status">{message}</p></section>;
}
