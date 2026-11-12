//! Restaurant operational LAN authority. No invoice/payment/inventory posting endpoints.
use crate::{identity::{self,Permission,Session},restaurant::Item,Store,StoreError};
use rusqlite::{params,OptionalExtension,Transaction,TransactionBehavior};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::time::{SystemTime,UNIX_EPOCH,Instant,Duration};
pub type Document=Value;
pub fn hash(value:&str)->String{format!("{:x}",Sha256::digest(value.as_bytes()))}
fn now()->Result<i64,StoreError>{Ok(SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_|StoreError::AccessUnavailable)?.as_secs() as i64)}
fn secret(s:&str)->bool{s.len()==64&&s.bytes().all(|c|c.is_ascii_hexdigit())}
pub(crate) fn migrate(tx:&Transaction<'_>)->Result<(),StoreError>{tx.execute_batch(include_str!("hub-schema.sql"))?;tx.execute("INSERT INTO local_hub_config(singleton,id) VALUES(1,?1)",[identity::random_id()?])?;Ok(())}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Line{pub menu_id:String,pub quantity:i64,pub expected_price_paise:i64,pub note:String}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Submit{pub version:u32,pub hub_id:String,pub business_id:String,pub operation_id:String,pub actor_id:String,pub order_id:String,pub table_id:Option<String>,pub expected_revision:i64,pub items:Vec<Line>}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct KitchenSubmit{pub version:u32,pub hub_id:String,pub business_id:String,pub actor_id:String,pub operation_id:String,pub ticket_id:String,pub expected_revision:i64,pub state:String}
fn refusal(reason:&str,revision:Option<i64>)->Value{json!({"status":"refused","reason":reason,"revision":revision})}
impl Store{
 pub(crate) fn hub_identity(&self)->Result<Value,StoreError>{
  let (id,name,business):(String,String,String)=self.0.query_row("SELECT h.id,i.business_name,i.business_id FROM local_hub_config h CROSS JOIN local_identity i WHERE i.singleton=1",[],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?)))?;
  Ok(json!({"version":1,"hubId":id,"businessId":business,"businessName":name,"capabilities":["kitchen.transitions.v1","kitchen.paid.v1"]}))
 }
 pub(crate) fn hub_configure(&mut self,enabled:bool,tls:Option<(String,String)>)->Result<(),StoreError>{let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;identity::verify(&tx,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Settings)?;
  if let Some((cert,key))=tls{tx.execute("UPDATE local_hub_config SET certificate=?1,private_key=?2 WHERE singleton=1",params![cert,key])?;}
  tx.execute("UPDATE local_hub_config SET enabled=?1 WHERE singleton=1",[enabled])?;if !enabled{tx.execute("DELETE FROM local_hub_sessions",[])?;}
  identity::guard(&tx,&self.1,Permission::Settings,if enabled{"hub.enabled"}else{"hub.disabled"},None)?;tx.commit()?;Ok(())
 }
 pub(crate) fn hub_tls(&self)->Result<(String,String),StoreError>{identity::verify(&self.0,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Settings)?;Ok(self.0.query_row("SELECT certificate,private_key FROM local_hub_config WHERE singleton=1",[],|q|Ok((q.get(0)?,q.get(1)?)))?)}
 pub(crate) fn hub_admin(&self)->Result<Value,StoreError>{identity::verify(&self.0,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Settings)?;
  let devices=self.0.prepare("SELECT d.id,d.name,substr(d.credential_hash,1,12),d.state,d.actor_id,d.revision,d.expires,d.last_seen,(SELECT max(s.expires) FROM local_hub_sessions s JOIN local_principals p ON p.id=s.actor_id WHERE s.device_id=d.id AND s.device_revision=d.revision AND s.actor_revision=p.revision AND p.enabled=1 AND d.state='approved' AND d.expires>strftime('%s','now') AND s.generation=d.generation AND s.generation=(SELECT generation FROM local_recovery_identity WHERE singleton=1) AND s.expires>strftime('%s','now')) FROM local_hub_devices d ORDER BY d.created DESC LIMIT 100")?.query_map([],|q|Ok(json!({"id":q.get::<_,String>(0)?,"name":q.get::<_,String>(1)?,"code":q.get::<_,String>(2)?,"state":q.get::<_,String>(3)?,"actorId":q.get::<_,Option<String>>(4)?,"revision":q.get::<_,i64>(5)?,"expires":q.get::<_,i64>(6)?,"lastSeen":q.get::<_,Option<i64>>(7)?,"sessionExpires":q.get::<_,Option<i64>>(8)?})))?.collect::<Result<Vec<_>,_>>()?;
  let operations=self.0.prepare("SELECT id,actor_id,result,created FROM local_hub_operations ORDER BY rowid DESC LIMIT 30")?.query_map([],|q|Ok(json!({"id":q.get::<_,String>(0)?,"actorId":q.get::<_,String>(1)?,"result":serde_json::from_str::<Value>(&q.get::<_,String>(2)?).unwrap_or(Value::Null),"created":q.get::<_,i64>(3)?})))?.collect::<Result<Vec<_>,_>>()?;
  let audit=self.0.prepare("SELECT action,target,created_at FROM local_identity_audit WHERE action LIKE 'hub.%' ORDER BY sequence DESC LIMIT 50")?.query_map([],|q|Ok(json!({"action":q.get::<_,String>(0)?,"target":q.get::<_,Option<String>>(1)?,"createdAt":q.get::<_,String>(2)?})))?.collect::<Result<Vec<_>,_>>()?;
  Ok(json!({"identity":self.hub_identity()?,"devices":devices,"operations":operations,"audit":audit}))
 }
 pub(crate) fn hub_device(&mut self,id:&str,revision:i64,actor:Option<&str>)->Result<(),StoreError>{let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;identity::verify(&tx,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Settings)?;
  if let Some(a)=actor{let p=identity::principal(&tx,a)?;if !p.enabled||!p.role.allows(Permission::Sell){return Err(StoreError::Forbidden);}if tx.execute("UPDATE local_hub_devices SET state='approved',actor_id=?1,revision=revision+1,expires=?2 WHERE id=?3 AND revision=?4 AND ((state='pending' AND created>?5) OR (state='approved' AND actor_id=?1)) AND generation=?6",params![a,now()?+30*86400,id,revision,now()?-300,crate::recovery::generation(&tx)?])?!=1{return Err(StoreError::Conflict);}}
  else{if tx.execute("UPDATE local_hub_devices SET state='revoked',revision=revision+1 WHERE id=?1 AND revision=?2",params![id,revision])?!=1{return Err(StoreError::Conflict);}}
  tx.execute("DELETE FROM local_hub_sessions WHERE device_id=?1",[id])?;identity::guard(&tx,&self.1,Permission::Settings,if actor.is_some(){"hub.device_approved"}else{"hub.device_revoked"},Some(id))?;tx.commit()?;Ok(())
 }
 pub(crate) fn hub_enroll(&mut self,body:Value)->Result<Value,StoreError>{
  let id=body["deviceId"].as_str().ok_or(StoreError::InvalidIdentity)?;let name=body["name"].as_str().ok_or(StoreError::InvalidIdentity)?;let credential=body["credential"].as_str().ok_or(StoreError::InvalidIdentity)?;
  if !crate::billing::valid_id(id)||!identity::text(name,60)||!secret(credential){return Err(StoreError::InvalidIdentity);}
  let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let generation=crate::recovery::generation(&tx)?;let fingerprint=hash(credential);
  let old:Option<(String,String,String,String)>=tx.query_row("SELECT credential_hash,state,generation,name FROM local_hub_devices WHERE id=?1",[id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?))).optional()?;
  if let Some((h,state,g,n))=old{if h!=fingerprint||g!=generation||n!=name{return Err(StoreError::OperationConflict);}
    if state=="pending"{let expired:bool=tx.query_row("SELECT expires<=?1 FROM local_hub_devices WHERE id=?2",params![now()?,id],|q|q.get(0))?;if expired{tx.execute("UPDATE local_hub_devices SET created=?1,expires=?2,revision=revision+1 WHERE id=?3",params![now()?,now()?+300,id])?;identity::audit(&tx,&identity::scope(&tx)?,None,"hub.enrolment_renewed",Some(id))?;tx.commit()?;}}
    return Ok(json!({"state":state,"code":&fingerprint[..12]}));}
  if tx.query_row("SELECT count(*) FROM local_hub_devices",[],|q|q.get::<_,i64>(0))?>=100{return Err(StoreError::RateLimited);}
  tx.execute("INSERT INTO local_hub_devices(id,name,credential_hash,generation,state,created,expires) VALUES(?1,?2,?3,?4,'pending',?5,?6)",params![id,name,fingerprint,generation,now()?,now()?+300])?;
  identity::audit(&tx,&identity::scope(&tx)?,None,"hub.enrolment_requested",Some(id))?;tx.commit()?;Ok(json!({"state":"pending","code":&fingerprint[..12]}))
 }
 pub(crate) fn hub_prelogin(&self,device:&str,credential:&str)->Result<String,StoreError>{
  if !secret(credential){return Err(StoreError::Forbidden);}
  self.0.query_row("SELECT actor_id FROM local_hub_devices WHERE id=?1 AND credential_hash=?2 AND state='approved' AND expires>?3 AND generation=?4",params![device,hash(credential),now()?,crate::recovery::generation(&self.0)?],|q|q.get(0)).optional()?.ok_or(StoreError::Forbidden)
 }
 pub(crate) fn hub_session(&mut self,device:&str,credential:&str)->Result<Value,StoreError>{let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
  let s=self.1.as_ref().ok_or(StoreError::Locked)?;let p=identity::verify(&tx,s,Permission::Sell)?;
  let revision:Option<i64>=tx.query_row("SELECT revision FROM local_hub_devices WHERE id=?1 AND credential_hash=?2 AND actor_id=?3 AND state='approved' AND expires>?4 AND generation=?5",params![device,hash(credential),p.id,now()?,s.generation],|q|q.get(0)).optional()?;let revision=revision.ok_or(StoreError::Forbidden)?;
  let token=identity::random_id()?;let expires=now()?+900;
  tx.execute("UPDATE local_hub_devices SET last_seen=?1 WHERE id=?2",params![now()?,device])?;
  tx.execute("DELETE FROM local_hub_sessions WHERE expires<=?1 OR device_id=?2",params![now()?,device])?;
  tx.execute("INSERT INTO local_hub_sessions VALUES(?1,?2,?3,?4,?5,?6,?7)",params![hash(&token),device,revision,p.id,p.revision,s.generation,expires])?;
  identity::guard(&tx,&self.1,Permission::Sell,"hub.staff_connected",Some(device))?;tx.commit()?;Ok(json!({"token":token,"expires":expires,"actorId":p.id,"displayName":p.display_name}))
 }
 pub(crate) fn hub_authenticate(&self,token:&str)->Result<(Session,String),StoreError>{
  if !secret(token){return Err(StoreError::Forbidden);}
  let row:Option<(String,String,i64,String)>=self.0.query_row("SELECT s.device_id,s.actor_id,s.actor_revision,s.generation FROM local_hub_sessions s JOIN local_hub_devices d ON d.id=s.device_id WHERE s.token_hash=?1 AND s.expires>?2 AND d.state='approved' AND d.expires>?2 AND d.revision=s.device_revision AND d.generation=s.generation AND d.actor_id=s.actor_id",params![hash(token),now()?],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?))).optional()?;
  let (device,actor,revision,generation)=row.ok_or(StoreError::Locked)?;let session=Session{scope:identity::scope(&self.0)?,actor_id:actor,revision,generation,expires:Instant::now()+Duration::from_secs(30)};
  identity::verify(&self.0,&session,Permission::Sell)?;Ok((session,device))
 }
 pub(crate) fn hub_submit(&mut self,device:&str,r:Submit,token:&str)->Result<Value,StoreError>{
  if r.version!=1||!crate::billing::valid_id(&r.operation_id)||!crate::billing::valid_id(&r.order_id)||r.items.is_empty()||r.items.len()>30{return Err(StoreError::InvalidDraft);}
  let raw=serde_json::to_string(&r)?;let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;
  if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_hub_sessions s JOIN local_hub_devices d ON d.id=s.device_id WHERE s.token_hash=?1 AND s.device_id=?2 AND s.expires>?3 AND d.expires>?3 AND d.state='approved' AND d.revision=s.device_revision AND d.generation=?4 AND d.actor_id=s.actor_id)",params![hash(token),device,now()?,s.generation],|q|q.get::<_,bool>(0))?{return Err(StoreError::Forbidden);}
  if r.actor_id!=s.actor_id||r.business_id!=s.scope.business_id||r.hub_id!=tx.query_row("SELECT id FROM local_hub_config",[],|q|q.get::<_,String>(0))?{return Err(StoreError::WorkspaceMismatch);}
  let old:Option<(String,String,String,String,String)>=tx.query_row("SELECT device_id,actor_id,generation,request,result FROM local_hub_operations WHERE id=?1",[&r.operation_id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?,q.get(4)?))).optional()?;
  if let Some((d,a,g,previous,result))=old{if d!=device||a!=s.actor_id||g!=s.generation||previous!=raw{return Err(StoreError::OperationConflict);}return Ok(serde_json::from_str(&result)?);}
  // Savepoint makes even an unexpected SQL failure non-posting. Only known validation refusals are durable results.
  tx.execute_batch("SAVEPOINT hub_accept")?;
  let result=match accept(&tx,&self.1,&r){Ok(v)=>v,Err(e)=>{tx.execute_batch("ROLLBACK TO hub_accept")?;match e{StoreError::Conflict|StoreError::OperationConflict=>refusal("revision_conflict",tx.query_row("SELECT revision FROM local_restaurant_orders WHERE id=?1",[&r.order_id],|q|q.get(0)).optional()?),StoreError::InvalidProduct|StoreError::InvalidDraft=>refusal("menu_or_quantity_invalid",None),StoreError::StockConflict=>refusal("price_changed_review_required",None),StoreError::CheckoutActive=>refusal("checkout_active",None),StoreError::Forbidden=>refusal("assigned_to_other_staff",None),_=>return Err(e)}}};tx.execute_batch("RELEASE hub_accept")?;
  tx.execute("INSERT INTO local_hub_operations VALUES(?1,?2,?3,?4,?5,?6,?7)",params![r.operation_id,device,s.actor_id,s.generation,raw,result.to_string(),now()?])?;
  identity::guard(&tx,&self.1,Permission::Sell,"hub.order_result",Some(&r.operation_id))?;tx.execute("UPDATE local_hub_devices SET last_seen=?1 WHERE id=?2",params![now()?,device])?;tx.commit()?;Ok(result)
 }
 pub(crate) fn hub_kitchen(&mut self,device:&str,r:KitchenSubmit,token:&str)->Result<Value,StoreError>{
  if r.version!=1||!crate::billing::valid_id(&r.operation_id)||!crate::billing::valid_id(&r.ticket_id){return Err(StoreError::InvalidDraft);}
  let raw=serde_json::to_string(&r)?;let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;
  if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_hub_sessions hs JOIN local_hub_devices d ON d.id=hs.device_id WHERE hs.token_hash=?1 AND hs.device_id=?2 AND hs.actor_id=?3 AND hs.actor_revision=?4 AND hs.expires>?5 AND d.expires>?5 AND d.state='approved' AND d.revision=hs.device_revision AND d.generation=hs.generation AND d.generation=?6 AND d.actor_id=hs.actor_id)",params![hash(token),device,s.actor_id,s.revision,now()?,s.generation],|q|q.get::<_,bool>(0))?{return Err(StoreError::Forbidden);}
  if r.actor_id!=s.actor_id||r.business_id!=s.scope.business_id||r.hub_id!=tx.query_row("SELECT id FROM local_hub_config",[],|q|q.get::<_,String>(0))?{return Err(StoreError::WorkspaceMismatch);}
  let old:Option<(String,String,String,String,String)>=tx.query_row("SELECT device_id,actor_id,generation,request,result FROM local_hub_operations WHERE id=?1",[&r.operation_id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?,q.get(4)?))).optional()?;
  if let Some((d,a,g,previous,result))=old{if d!=device||a!=s.actor_id||g!=s.generation||previous!=raw{return Err(StoreError::OperationConflict);}return Ok(serde_json::from_str(&result)?);}
  if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_events WHERE operation_id=?1)",[&r.operation_id],|q|q.get::<_,bool>(0))?{return Err(StoreError::OperationConflict);}
  tx.execute_batch("SAVEPOINT hub_kitchen")?;
  let result=match crate::restaurant::transition_ticket(&tx,&self.1,&r.ticket_id,r.expected_revision,&r.state){
   Ok((order,revision))=>{let event=crate::restaurant::Request{operation_id:r.operation_id.clone(),action:crate::restaurant::Action::SetTicketState{id:r.ticket_id.clone(),expected_revision:r.expected_revision,state:r.state.clone()}};tx.execute("INSERT INTO local_restaurant_events(operation_id,actor_id,request) VALUES(?1,?2,?3)",params![r.operation_id,s.actor_id,serde_json::to_string(&event)?])?;json!({"status":"accepted","kind":"kitchen_state","operationId":r.operation_id,"ticketId":r.ticket_id,"orderId":order,"revision":revision,"state":r.state})},
   Err(error)=>{tx.execute_batch("ROLLBACK TO hub_kitchen")?;let reason=match error{StoreError::Conflict=>"revision_conflict",StoreError::InvalidDraft|StoreError::InvalidInvoice=>"transition_refused",StoreError::Forbidden=>"assigned_to_other_staff",StoreError::CheckoutActive=>"order_closed",_=>return Err(error)};let current:Option<(i64,String)>=tx.query_row("SELECT revision,state FROM local_restaurant_tickets WHERE id=?1",[&r.ticket_id],|q|Ok((q.get(0)?,q.get(1)?))).optional()?;json!({"status":"refused","kind":"kitchen_state","operationId":r.operation_id,"ticketId":r.ticket_id,"reason":reason,"revision":current.as_ref().map(|x|x.0),"state":current.map(|x|x.1)})}
  };tx.execute_batch("RELEASE hub_kitchen")?;
  tx.execute("INSERT INTO local_hub_operations VALUES(?1,?2,?3,?4,?5,?6,?7)",params![r.operation_id,device,s.actor_id,s.generation,raw,result.to_string(),now()?])?;
  identity::guard(&tx,&self.1,Permission::Sell,"hub.kitchen_result",Some(&r.operation_id))?;tx.execute("UPDATE local_hub_devices SET last_seen=?1 WHERE id=?2",params![now()?,device])?;tx.commit()?;Ok(result)
 }
 pub(crate) fn hub_operation(&self,device:&str,id:&str)->Result<Value,StoreError>{let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&self.0,s,Permission::Sell)?;
  let result:Option<String>=self.0.query_row("SELECT result FROM local_hub_operations WHERE id=?1 AND device_id=?2 AND actor_id=?3 AND generation=?4",params![id,device,s.actor_id,s.generation],|q|q.get(0)).optional()?;
  Ok(result.map(|r|serde_json::from_str(&r)).transpose()?.unwrap_or(json!({"status":"not_found"})))
 }
 pub(crate) fn hub_batches(&self)->Result<Value,StoreError>{identity::verify(&self.0,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Sell)?;let rows=self.0.prepare("SELECT b.id,b.order_id,b.items,o.revision FROM local_hub_batches b JOIN local_restaurant_orders o ON o.id=b.order_id WHERE b.ticket_id IS NULL AND o.state='open' ORDER BY b.rowid LIMIT 100")?.query_map([],|q|Ok(json!({"id":q.get::<_,String>(0)?,"orderId":q.get::<_,String>(1)?,"items":serde_json::from_str::<Value>(&q.get::<_,String>(2)?).unwrap_or(Value::Null),"revision":q.get::<_,i64>(3)?})))?.collect::<Result<Vec<_>,_>>()?;Ok(json!(rows))}
 pub(crate) fn hub_dispatch(&mut self,id:&str,revision:i64)->Result<(),StoreError>{let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;
  let (order,items,ticket):(String,String,Option<String>)=tx.query_row("SELECT order_id,items,ticket_id FROM local_hub_batches WHERE id=?1",[id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?)))?;crate::kitchen::authorize_order(&tx,&self.1,&order)?;if ticket.is_some(){return Ok(());}
  if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_bindings WHERE order_id=?1)",[&order],|q|q.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}
  if tx.execute("UPDATE local_restaurant_orders SET revision=revision+1 WHERE id=?1 AND revision=?2 AND state='open'",params![order,revision])?!=1{return Err(StoreError::Conflict);}
  let ticket=format!("hub-{id}");tx.execute("INSERT INTO local_restaurant_tickets VALUES(?1,?2,?3,'pending',1)",params![ticket,order,items])?;tx.execute("UPDATE local_hub_batches SET ticket_id=?1 WHERE id=?2",params![ticket,id])?;
  identity::guard(&tx,&self.1,Permission::Sell,"hub.kot_dispatched",Some(id))?;tx.commit()?;Ok(())
 }
}
fn accept(tx:&Transaction<'_>,session:&Option<Session>,r:&Submit)->Result<Value,StoreError>{
 let mut items=Vec::new();let mut total=0i64;for line in &r.items{if !(1..=1000).contains(&line.quantity)||line.note.chars().count()>200||line.note.chars().any(char::is_control){return Err(StoreError::InvalidDraft);}
  let row:Option<(String,String,i64)>=tx.query_row("SELECT p.id,m.label || CASE WHEN m.variant='' THEN '' ELSE ' / ' || m.variant END,p.unit_price_paise FROM local_restaurant_menu m JOIN local_products p ON p.id=m.product_id WHERE m.id=?1 AND m.available=1 AND p.unit='pcs'",[&line.menu_id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?))).optional()?;
  let (product,name,price)=row.ok_or(StoreError::InvalidProduct)?;if price<0||price!=line.expected_price_paise{return Err(StoreError::StockConflict);}
  total=total.checked_add(crate::billing::line_total(line.quantity.checked_mul(1000).ok_or(StoreError::InvalidDraft)?,price)?).ok_or(StoreError::InvalidDraft)?;if total>9_000_000_000_000_000{return Err(StoreError::InvalidDraft);}
  items.push(Item{name,quantity:line.quantity,note:line.note.clone(),product_id:Some(product),unit_price_paise:Some(price)});
 }
 let old:Option<(i64,Option<String>,String)>=tx.query_row("SELECT revision,table_id,state FROM local_restaurant_orders WHERE id=?1",[&r.order_id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?))).optional()?;
 let revision=if let Some((revision,table,state))=old{if revision!=r.expected_revision||table!=r.table_id||state!="open"{return Err(StoreError::Conflict);}crate::kitchen::authorize_order(tx,session,&r.order_id)?;if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_bindings WHERE order_id=?1)",[&r.order_id],|q|q.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}tx.execute("UPDATE local_restaurant_orders SET revision=revision+1 WHERE id=?1 AND revision=?2",params![r.order_id,revision])?;revision+1}
 else{if r.expected_revision!=0{return Err(StoreError::Conflict);}if let Some(table)=&r.table_id{if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_tables WHERE id=?1 AND active=1)",[table],|q|q.get::<_,bool>(0))?{return Err(StoreError::InvalidDraft);}if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_orders WHERE table_id=?1 AND state IN('open','pending_bill') AND settled_invoice IS NULL)",[table],|q|q.get::<_,bool>(0))?{return Err(StoreError::Conflict);}}
 tx.execute("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES(?1,?2,?3,'open',1)",params![r.order_id,r.table_id,if r.table_id.is_some(){"dine_in"}else{"takeaway"}])?;
 tx.execute("INSERT INTO local_restaurant_assignments VALUES(?1,?2)",params![r.order_id,session.as_ref().ok_or(StoreError::Locked)?.actor_id])?;1};
 tx.execute("INSERT INTO local_hub_batches(id,order_id,items) VALUES(?1,?2,?3)",params![r.operation_id,r.order_id,serde_json::to_string(&items)?])?;
 Ok(json!({"status":"accepted","operationId":r.operation_id,"orderId":r.order_id,"revision":revision,"items":items,"kitchenDispatched":false}))
}
#[cfg(test)]mod tests;
