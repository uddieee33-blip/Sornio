import { KOT_STATES, type RestaurantDraft, type RestaurantSnapshot } from './restaurant-operations.ts';
export type RestaurantScope={businessId:string;actorId:string;mode:'demo'|'live'};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const id=(v:unknown)=>text(v,120)&&(v as string).length>0;
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const array=(v:unknown,max:number):v is unknown[]=>Array.isArray(v)&&v.length<=max;
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=9_000_000_000_000;
export function restaurantCanDraft(role:string):boolean{return ['owner','manager','assistant_manager','cashier'].includes(role);}
export function parseRestaurantSnapshot(raw:string,businessId:string):RestaurantSnapshot{
 if(raw.length>60000)throw new Error('Use a smaller operational snapshot.');const s:unknown=JSON.parse(raw);
 if(!object(s)||s.schemaVersion!==1||s.source!=='shop'||s.businessId!==businessId||!timestamp(s.generatedAt)||!array(s.tables,200)||!array(s.orders,1000)||!array(s.menu,2000)||!array(s.tickets,2000)||!array(s.assignments,1000))throw new Error('Snapshot does not match this business or its supported format.');
 if(s.tables.some(t=>!object(t)||!id(t.id)||!text(t.name,120)))throw new Error('Invalid table.');
 const tables=new Set(s.tables.map(t=>(t as Record<string,unknown>).id));
 if(s.orders.some(o=>!object(o)||!id(o.id)||!['dine_in','takeaway'].includes(String(o.kind))||!(o.tableId===null||id(o.tableId)&&tables.has(o.tableId))||((o.kind==='dine_in')!==(o.tableId!==null))||!['open','pending_bill'].includes(String(o.state))||!integer(o.revision,1)))throw new Error('Invalid order.');
 const orders=new Set(s.orders.map(o=>(o as Record<string,unknown>).id));
 if(s.menu.some(m=>!object(m)||!id(m.id)||!id(m.productId)||!text(m.category,120)||!text(m.label,120)||!text(m.variant,120)||typeof m.available!=='boolean'||!integer(m.pricePaise)))throw new Error('Invalid menu.');
 if(s.tickets.some(k=>!object(k)||!id(k.id)||!orders.has(k.orderId)||!KOT_STATES.includes(k.state as typeof KOT_STATES[number])||!integer(k.revision,1)||!array(k.items,100)||k.items.some(i=>!object(i)||!text(i.name,243)||!integer(i.quantity,1)||!text(i.note,200))))throw new Error('Invalid kitchen ticket.');
 if(s.acceptedBatches!==undefined&&(!array(s.acceptedBatches,1000)||s.acceptedBatches.some(b=>!object(b)||!id(b.id)||!orders.has(b.orderId)||!array(b.items,30)||b.items.some(i=>!object(i)||!text(i.name,243)||!integer(i.quantity,1)||!text(i.note,200)||!integer(i.unitPricePaise)))))throw new Error('Invalid accepted restaurant batch.');
 if(s.assignments.some(a=>!object(a)||!orders.has(a.orderId)||!(a.actorId===null||id(a.actorId))||!(a.displayName===null||text(a.displayName,120))||!['unpaid','editable','bound','submitting','refused','unknown','settled'].includes(String(a.checkoutState))))throw new Error('Invalid assignment.');
 for(const rows of [s.tables,s.orders,s.menu,s.tickets,s.assignments]){const keys=rows.map(r=>{const x=r as Record<string,unknown>;return x.id??x.orderId;});if(new Set(keys).size!==keys.length)throw new Error('Duplicate operational identity.');}
 return s as unknown as RestaurantSnapshot;
}
export function parseRestaurantDraft(raw:string,scope:RestaurantScope):RestaurantDraft{
 if(raw.length>20000)throw new Error('Draft is too large.');const d:unknown=JSON.parse(raw);
 if(!object(d)||d.version!==1||!id(d.id)||d.businessId!==scope.businessId||d.actorId!==scope.actorId||d.mode!==scope.mode||!['dine_in','takeaway'].includes(String(d.kind))||!(d.tableId===null||id(d.tableId))||((d.kind==='dine_in')!==(d.tableId!==null))||!timestamp(d.savedAt)||!array(d.items,30)||d.items.some(i=>!object(i)||!id(i.productId)||!text(i.label,240)||!integer(i.quantityMilli,1)||!text(i.note,200)))throw new Error('Draft is invalid or belongs to another account.');
 return d as unknown as RestaurantDraft;
}
export type SecurePort={get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;delete:(key:string)=>Promise<void>};
const writes=new Map<string,Promise<void>>();
/** Immutable chunks first, atomic pointer last. No plaintext fallback, network or financial sender. */
export function restaurantStorage(port:SecurePort,scope:RestaurantScope){
 if(!id(scope.businessId)||!id(scope.actorId)||!['demo','live'].includes(scope.mode))throw new Error('Invalid restaurant storage scope.');
 const hex=(s:string)=>Array.from(s).map(c=>c.codePointAt(0)!.toString(16).padStart(6,'0')).join('');
 const root=`sornio.restaurant.v1.${scope.mode}.${hex(scope.businessId)}.${hex(scope.actorId)}`;
 const {write,read}=secureRestaurantRecords(port,root);
 return {
  async saveDraft(draft:RestaurantDraft){const raw=JSON.stringify(draft);parseRestaurantDraft(raw,scope);await write('draft',raw);},
  async loadDraft(){const raw=await read('draft');return raw===null?null:parseRestaurantDraft(raw,scope);},
  async removeDraft(){await port.delete(`${root}.draft.current`);},
  async saveSnapshot(raw:string){parseRestaurantSnapshot(raw,scope.businessId);await write('snapshot',raw);},
  async loadSnapshot(){const raw=await read('snapshot');return raw===null?null:parseRestaurantSnapshot(raw,scope.businessId);},
 };
}

/** Bounded encrypted-record port shared by drafts and LAN outbox. ASCII JSON chunks
 * avoid splitting UTF-16 surrogate pairs at a native SecureStore boundary. */
export function secureRestaurantRecords(port:SecurePort,root:string){
 if(!/^[a-zA-Z0-9._-]{1,3000}$/.test(root))throw new Error('Invalid secure record scope.');
 async function write(kind:string,raw:string){raw=raw.replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));if(raw.length>60000)throw new Error('Record is too large.');const queueKey=`${root}.${kind}`;
  const next=(writes.get(queueKey)??Promise.resolve()).catch(()=>{}).then(async()=>{const version=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);const count=Math.max(1,Math.ceil(raw.length/320));for(let i=0;i<count;i++)await port.set(`${root}.${kind}.${version}.${i}`,raw.slice(i*320,(i+1)*320));await port.set(`${root}.${kind}.current`,JSON.stringify({version,count,length:raw.length}));});
  writes.set(queueKey,next);try{await next;}finally{if(writes.get(queueKey)===next)writes.delete(queueKey);}
 }
 async function read(kind:string){await writes.get(`${root}.${kind}`)?.catch(()=>{});const raw=await port.get(`${root}.${kind}.current`);if(raw===null)return null;if(raw.length>500)throw new Error('Invalid secure manifest.');const m:unknown=JSON.parse(raw);
  if(!object(m)||typeof m.version!=='string'||!/^[a-z0-9-]{1,80}$/.test(m.version)||!integer(m.count,1)||m.count>188||!integer(m.length)||m.length>60000||m.count!==Math.max(1,Math.ceil(m.length/320)))throw new Error('Invalid secure manifest.');
  let value='';for(let i=0;i<m.count;i++){const chunk=await port.get(`${root}.${kind}.${m.version}.${i}`);if(chunk===null||chunk.length>320)throw new Error('Secure record is incomplete; keep the original device data.');value+=chunk;}if(value.length!==m.length)throw new Error('Secure record length differs.');return value;
 }
 return {write,read};
}
