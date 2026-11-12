/** Durable operational command transport. This stores requests/results, not a ledger. */
export type CommandRecord<R,T>={version:1;state:'queued'|'unknown'|'accepted'|'refused';request:R;result?:T;resumeAfterReconnect?:boolean};
export type CommandWire=(path:string,body:Record<string,unknown>,bearer:string)=>Promise<unknown>;
const active=new Set<string>();
export function hubCommandStore<R extends {operationId:string},T extends {status:'accepted'|'refused'}>(c:{
 records:{read:(kind:string)=>Promise<string|null>;write:(kind:string,raw:string)=>Promise<void>};lockKey:string;
 validate:(raw:unknown)=>R;parse:(raw:unknown)=>CommandRecord<R,T>;result:(raw:unknown,request:R)=>T;
 route:string;base:Record<string,unknown>;
}){
 async function load(){const raw=await c.records.read('operation');return raw&&raw!=='null'?c.parse(JSON.parse(raw)):null;}
 const save=(record:CommandRecord<R,T>)=>c.records.write('operation',JSON.stringify(record));
 function acquire(){if(active.has(c.lockKey))throw new Error('Recover the active request first.');active.add(c.lockKey);}
 return {
  load,
  async queue(input:R){acquire();try{const r=c.validate(JSON.parse(JSON.stringify(input)));if(JSON.stringify(r).replace(/[\u007f-\uffff]/g,v=>'\\u'+v.charCodeAt(0).toString(16).padStart(4,'0')).length>50000)throw new Error('Submission exceeds the secure queue limit. Split it into smaller reviewed batches.');const record=c.parse({version:1,state:'queued',request:r});const old=await load();if(old){if(JSON.stringify(old.request)!==JSON.stringify(r))throw new Error('A saved operation already exists. Recover or acknowledge its final result first.');return old;}await save(record);return record;}finally{active.delete(c.lockKey);}},
  async pauseReconnect(){acquire();try{const p=await load();if(p&&['queued','unknown'].includes(p.state))await save({...p,resumeAfterReconnect:false});}finally{active.delete(c.lockKey);}},
  async acknowledge(){acquire();try{const p=await load();if(!p||!['accepted','refused'].includes(p.state))throw new Error('Only a confirmed final result can be acknowledged.');await c.records.write('operation','null');}finally{active.delete(c.lockKey);}},
  async recover(wire:CommandWire,token:string,options?:{resumeAfterReconnect?:boolean}){acquire();try{let p=await load();if(!p)throw new Error('No saved submission.');if(p.state==='accepted'||p.state==='refused')return p;
   p={...p,state:'unknown',...(options?.resumeAfterReconnect?{resumeAfterReconnect:true}:{})};await save(p);
   let reply=await wire('/v1/operation',{...c.base,operationId:p.request.operationId},token);
   if(typeof reply==='object'&&reply!==null&&'status'in reply&&reply.status==='not_found')reply=await wire(c.route,p.request as unknown as Record<string,unknown>,token);
   const result=c.result(reply,p.request),next:CommandRecord<R,T>={...p,state:result.status,result};await save(next);return next;
  }finally{active.delete(c.lockKey);}}
 };
}
