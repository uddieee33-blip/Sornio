import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from './native';
import { RestaurantPayment } from './RestaurantPayment';
import { restaurantSubtotal } from '../../../packages/business-domain/src/restaurant';
import type { RestaurantMenu } from '../../../packages/business-domain/src/restaurant';
import type { Product } from './billing-types';
import { errorMessage } from './access';

type Table = {id:string;name:string};
type Order = {id:string;tableId:string|null;kind:'dine_in'|'takeaway';state:'open'|'pending_bill';revision:number};
type Item = {name:string;quantity:number;note:string;productId?:string;unitPricePaise?:number};
type Ticket = {id:string;orderId:string;items:Item[];state:'pending'|'preparing'|'ready'|'served';revision:number};
type Data = {tables:Table[];orders:Order[];tickets:Ticket[]};
type Request = {operationId:string;action:Record<string,unknown>};
export function RestaurantPanel({ owner, disabled, username }: {owner:boolean;disabled:boolean;username:string}) {
  const [menu,setMenu]=useState<RestaurantMenu[]>([]),[products,setProducts]=useState<Product[]>([]);
  const [category,setCategory]=useState(''),[variant,setVariant]=useState(''),[product,setProduct]=useState('');
  const [data,setData]=useState<Data>({tables:[],orders:[],tickets:[]});
  const [ready,setReady]=useState(false), [busy,setBusy]=useState(false), [message,setMessage]=useState('Opening restaurant workspace…');
  const [pending,setPending]=useState<Request|null>(null), [selected,setSelected]=useState('');
  const [tableName,setTableName]=useState(''),[itemName,setItemName]=useState(''),[quantity,setQuantity]=useState('1'),[note,setNote]=useState('');
  const [items,setItems]=useState<Item[]>([]),[moveTable,setMoveTable]=useState('');
  const running=useRef(false);
  const reload=useCallback(async()=>{try {const result=await invoke<Data>('read_restaurant');setData(result);setMenu(await invoke<RestaurantMenu[]>('restaurant_menu'));setProducts(await invoke<Product[]>('list_local_products'));setReady(true);} catch(e){setReady(false);setMessage(errorMessage(e,'Could not open restaurant orders.'));}},[]);
  useEffect(()=>{void reload();},[reload]);
  async function execute(request:Request) {
    if(running.current || disabled)return;
    running.current=true;setBusy(true);setPending(request);
    try {await invoke('change_restaurant',{r:request});setPending(null);await reload();setMessage('Saved on this device.');if(request.action.kind==='send_ticket')setItems([]);}
    catch(e){setMessage(errorMessage(e,'The result is uncertain. Retry the same action before continuing.'));}
    finally{running.current=false;setBusy(false);}
  }
  function run(action:Record<string,unknown>) {void execute({operationId:crypto.randomUUID(),action});}
  const order=data.orders.find(x=>x.id===selected);
  const locked=disabled||busy||!ready||pending!==null;
  return <section className="panel restaurant-panel" aria-label="Restaurant operations">
    <div className="panel-heading"><div><p className="eyebrow">RESTAURANT · LOCAL ORDERS</p><h2>Tables & kitchen</h2></div></div>
    <p className="muted">Development workspace. Menu variants and paid add-ons use individual catalog products. Add add-ons as separate priced items; preparation notes are free. Accepted prices are retained; changed catalog prices require review before checkout.</p>
    <p role="status" aria-live="polite">{message}</p>
    {pending?<div className="pending-stock"><p>Retry the same action to resolve an uncertain result.</p><button type="button" disabled={busy||disabled} onClick={()=>void execute(pending)}>Retry saved action</button></div>:null}
    {owner?<div><label htmlFor="rest-table-name">New table name</label><input id="rest-table-name" value={tableName} maxLength={40} disabled={locked} onChange={e=>setTableName(e.target.value)}/><button type="button" disabled={locked||!tableName.trim()} onClick={()=>{run({kind:'create_table',id:crypto.randomUUID(),name:tableName.trim()});setTableName('');}}>Add table</button></div>:null}
    {owner?<fieldset disabled={locked}><legend>Menu configuration</legend><label>Category<input value={category} onChange={e=>setCategory(e.target.value)}/></label><label>Variant<input value={variant} onChange={e=>setVariant(e.target.value)} placeholder="Large / Extra cheese"/></label><label>Catalog product<select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Select product</option>{products.filter(p=>p.unit==='pcs').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" disabled={!product} onClick={()=>{void invoke('save_restaurant_menu',{m:{id:crypto.randomUUID(),productId:product,category,label:products.find(p=>p.id===product)?.name??'',variant,available:true}}).then(reload).catch(e=>setMessage(errorMessage(e,'Menu save failed.')));}}>Add priced menu entry</button>{menu.map(m=><button type="button" key={m.id} onClick={()=>void invoke('save_restaurant_menu',{m:{...m,available:!m.available}}).then(reload)}>{m.label} / {m.variant}: {m.available?'Available':'Unavailable'}</button>)}</fieldset>:null}
    <h3>Tables</h3><div className="restaurant-grid">{data.tables.map(table=>{const current=data.orders.find(o=>o.tableId===table.id);return <div className="restaurant-table" key={table.id}><strong>{table.name}</strong><span>{current?current.state==='pending_bill'?'Bill requested':'Occupied':'Available'}</span><button type="button" disabled={locked} onClick={()=>current?setSelected(current.id):run({kind:'open_order',id:crypto.randomUUID(),table_id:table.id})}>{current?'Open order':'Seat guests'}</button></div>;})}</div>
    <button type="button" disabled={locked} onClick={()=>run({kind:'open_order',id:crypto.randomUUID(),table_id:null})}>New takeaway order</button>
    <h3>Open orders</h3><div className="restaurant-grid">{data.orders.map(o=><button type="button" key={o.id} disabled={locked} aria-pressed={selected===o.id} onClick={()=>setSelected(o.id)}>{o.tableId ? data.tables.find(t=>t.id===o.tableId)?.name ?? 'Table' : 'Takeaway'} · {o.state==='pending_bill'?'Bill requested':'Open'} · {o.id.slice(0,6)}</button>)}</div>
    {order?<div><h3>{order.kind==='takeaway'?'Takeaway':data.tables.find(t=>t.id===order.tableId)?.name ?? 'Table'} · {order.state==='pending_bill'?'Bill requested':'Open'}</h3>
      {order.kind==='dine_in'&&order.state==='open'?<div><label htmlFor="rest-move">Move to available table</label><select id="rest-move" value={moveTable} disabled={locked} onChange={e=>setMoveTable(e.target.value)}><option value="">Select table</option>{data.tables.filter(t=>!data.orders.some(o=>o.tableId===t.id)).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><button disabled={locked||!moveTable} type="button" onClick={()=>{run({kind:'move_order',id:order.id,expected_revision:order.revision,table_id:moveTable});setMoveTable('');}}>Move order</button></div>:null}
      {order.state==='open'?<div><h4>Prepare kitchen ticket</h4><label htmlFor="rest-item">Item / variant / add-ons</label><select id="rest-item" value={itemName} disabled={locked} onChange={e=>setItemName(e.target.value)}><option value="">Choose menu variant or add-on</option>{menu.filter(m=>m.available).map(m=><option key={m.id} value={m.id}>{m.category} · {m.label} / {m.variant}</option>)}</select><label htmlFor="rest-qty">Quantity</label><input id="rest-qty" inputMode="numeric" value={quantity} disabled={locked} onChange={e=>setQuantity(e.target.value)}/><label htmlFor="rest-note">Preparation note</label><input id="rest-note" value={note} maxLength={200} disabled={locked} onChange={e=>setNote(e.target.value)}/><button type="button" disabled={locked||!itemName.trim()||!/^\d+$/.test(quantity)||Number(quantity)<1||Number(quantity)>1000||items.length>=50} onClick={()=>{setItems([...items,{name:menu.find(m=>m.id===itemName)?.label??'',productId:menu.find(m=>m.id===itemName)?.productId,quantity:Number(quantity),note:note.trim()}]);setItemName('');setNote('');setQuantity('1');}}>Add item</button><ul>{items.map((i,n)=><li key={n}>{i.quantity} × {i.name}{i.note?` · ${i.note}`:''} <button type="button" disabled={locked} onClick={()=>setItems(items.filter((_,j)=>j!==n))}>Remove</button></li>)}</ul><button type="button" disabled={locked||!items.length} onClick={()=>run({kind:'send_ticket',id:crypto.randomUUID(),order_id:order.id,expected_revision:order.revision,items})}>Send kitchen ticket</button><button type="button" disabled={locked||items.length>0} onClick={()=>run({kind:'request_bill',id:order.id,expected_revision:order.revision})}>Request bill</button></div>:null}
      <RestaurantPayment username={username} key={order.id} orderId={order.id} revision={order.revision} subtotal={restaurantSubtotal(data.tickets.filter(t=>t.orderId===order.id).flatMap(t=>t.items))} onSettled={()=>{setSelected('');void reload();}}/>
      <h4>Kitchen tickets</h4>{data.tickets.filter(t=>t.orderId===order.id).map(t=><div className="restaurant-ticket" key={t.id}><strong>{t.state} · {t.id.slice(0,6)}</strong><ul>{t.items.map((i,n)=><li key={n}>{i.quantity} × {i.name}{i.note?` · ${i.note}`:''}</li>)}</ul>{t.state!=='served'?<button type="button" disabled={locked} onClick={()=>run({kind:'set_ticket_state',id:t.id,expected_revision:t.revision,state:({pending:'preparing',preparing:'ready',ready:'served'} as const)[t.state as 'pending'|'preparing'|'ready']})}>Mark {({pending:'preparing',preparing:'ready',ready:'served'} as const)[t.state as 'pending'|'preparing'|'ready']}</button>:null}</div>)}
      {owner?<button type="button" disabled={locked} onClick={()=>{if(window.confirm('Cancel this order? This cannot be undone.'))run({kind:'cancel_order',id:order.id,expected_revision:order.revision});}}>Cancel order</button>:null}
    </div>:null}
  </section>;
}
