import type {KotState,RestaurantSnapshot} from './restaurant-operations.ts';
/** A read-only projection. It never allocates operations or changes confirmed data. */
export type KitchenQueueSource=Pick<RestaurantSnapshot,'tables'|'orders'|'tickets'|'paidKitchen'>;
export type KitchenQueueFilter={state:'active'|KotState;kind:'all'|'dine_in'|'takeaway';payment:'all'|'paid'|'unpaid';query:string};
export const defaultKitchenFilter:KitchenQueueFilter={state:'active',kind:'all',payment:'all',query:''};
export type KitchenQueueTicket=RestaurantSnapshot['tickets'][number]&{kind:'dine_in'|'takeaway';tableName:string|null;paid:boolean};
const priority:Record<KotState,number>={ready:0,pending:1,preparing:2,served:3};
export function kitchenQueue(source:KitchenQueueSource,filter:KitchenQueueFilter=defaultKitchenFilter){
 const orders=new Map(source.orders.map(o=>[o.id,o])),tables=new Map(source.tables.map(t=>[t.id,t.name]));
 const rows:KitchenQueueTicket[]=source.tickets.flatMap(t=>{const o=orders.get(t.orderId);return o?[{...t,kind:o.kind,tableName:o.tableId?tables.get(o.tableId)??null:null,paid:false}]:[];});
 rows.push(...(source.paidKitchen??[]).map(t=>({...t,paid:true})));
 // Defensive duplicate protection: a malformed overlap must not produce two controls.
 const ids=new Set<string>();const unique=rows.filter(t=>{if(ids.has(t.id))return false;ids.add(t.id);return true;});
 const counts:Record<KotState,number>={pending:0,preparing:0,ready:0,served:0};for(const t of unique)counts[t.state]++;
 const query=filter.query.trim().toLocaleLowerCase();
 const visible=unique.filter(t=>(filter.state==='active'?t.state!=='served':t.state===filter.state)&&(filter.kind==='all'||t.kind===filter.kind)&&(filter.payment==='all'||t.paid===(filter.payment==='paid'))&&(!query||[t.id,t.orderId,t.tableName??'',t.kind,...t.items.flatMap(i=>[i.name,i.note])].some(v=>v.toLocaleLowerCase().includes(query))));
 // Stable ties retain native ticket order. Ready tickets surface for prompt service.
 visible.sort((a,b)=>priority[a.state]-priority[b.state]);
 return {tickets:visible,counts,active:counts.pending+counts.preparing+counts.ready};
}
