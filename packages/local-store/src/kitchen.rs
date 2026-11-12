use crate::{billing,identity::{self,Permission,Session},Store,StoreError};
use rusqlite::{params,Connection,OptionalExtension,Transaction,TransactionBehavior};
use serde::{Serialize,Deserialize};
use serde_json::{Value,json};
pub type Document=Value;
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Change { pub kind:String,pub description:String,pub before:String,pub after:String }
#[derive(Serialize,Deserialize)]
#[serde(tag="kind",rename_all="snake_case",deny_unknown_fields)]
pub enum Action {
 Correct {id:String,order_id:String,expected_revision:i64,changes:Vec<Change>},
 Destination {id:String,name:String,layout:String},
 Print {id:String,ticket_id:String,ticket_kind:String,destination_id:String},
 Confirm {id:String,state:String},
 Assign {order_id:String,expected_revision:i64,actor_id:String},
}
pub(crate) fn migrate(tx:&Transaction<'_>)->Result<(),StoreError>{tx.execute_batch(include_str!("kitchen-schema.sql"))?;Ok(())}
pub(crate) fn authorize_order(db:&Connection,session:&Option<Session>,order:&str)->Result<(),StoreError>{
 let s=session.as_ref().ok_or(StoreError::Locked)?;identity::verify(db,s,Permission::Sell)?;
 let actor:Option<String>=db.query_row("SELECT actor_id FROM local_restaurant_control WHERE order_id=?1 UNION ALL SELECT actor_id FROM local_restaurant_assignments WHERE order_id=?1 LIMIT 1",[order],|q|q.get(0)).optional()?;
 if actor.as_ref().is_some_and(|a|a!=&s.actor_id)&&identity::verify(db,s,Permission::Settings).is_err(){return Err(StoreError::Forbidden);}Ok(())
}
fn valid(text:&str,max:usize)->bool{text.chars().count()<=max&&!text.chars().any(char::is_control)}
fn payload(db:&Connection,kind:&str,id:&str)->Result<Value,StoreError>{
 match kind {
 "kot"=>{let (order,items,state):(String,String,String)=db.query_row("SELECT order_id,items,state FROM local_restaurant_tickets WHERE id=?1",[id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?)))?;Ok(json!({"id":id,"orderId":order,"kind":kind,"items":serde_json::from_str::<Value>(&items)?,"state":state}))},
 "correction"=>{let (order,changes,created):(String,String,String)=db.query_row("SELECT order_id,changes,created_at FROM local_kitchen_corrections WHERE id=?1",[id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?)))?;Ok(json!({"id":id,"orderId":order,"kind":kind,"changes":serde_json::from_str::<Value>(&changes)?,"createdAt":created}))},
 _=>Err(StoreError::InvalidDraft)
 }
}
impl Store {
 pub(crate) fn kitchen_view(&self)->Result<Value,StoreError>{
  identity::verify(&self.0,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Sell)?;
  let destinations=self.0.prepare("SELECT id,name,layout FROM local_kitchen_destinations ORDER BY name")?.query_map([],|q|Ok(json!({"id":q.get::<_,String>(0)?,"name":q.get::<_,String>(1)?,"layout":q.get::<_,String>(2)?})))?.collect::<Result<Vec<_>,_>>()?;
  let ids=self.0.prepare("SELECT id FROM local_kitchen_corrections ORDER BY rowid DESC LIMIT 500")?.query_map([],|q|q.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?;
  let corrections=ids.iter().map(|id|payload(&self.0,"correction",id)).collect::<Result<Vec<_>,_>>()?;
  let jobs=self.0.prepare("SELECT id,ticket_id,ticket_kind,destination_id,state FROM local_kitchen_print_jobs ORDER BY rowid DESC LIMIT 500")?.query_map([],|q|Ok(json!({"id":q.get::<_,String>(0)?,"ticketId":q.get::<_,String>(1)?,"ticketKind":q.get::<_,String>(2)?,"destinationId":q.get::<_,String>(3)?,"state":q.get::<_,String>(4)?})))?.collect::<Result<Vec<_>,_>>()?;
  Ok(json!({"destinations":destinations,"corrections":corrections,"jobs":jobs}))
 }
 pub(crate) fn kitchen_action(&mut self,a:Action)->Result<Value,StoreError>{
  let raw=serde_json::to_string(&a)?;let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;
  let result=match &a {
   Action::Correct{id,order_id,expected_revision,changes}=>{
    if !billing::valid_id(id)||changes.is_empty()||changes.len()>50||changes.iter().any(|c|!matches!(c.kind.as_str(),"added"|"removed"|"quantity"|"instructions")||c.description.trim().is_empty()||!valid(&c.description,120)||!valid(&c.before,200)||!valid(&c.after,200)){return Err(StoreError::InvalidDraft);}
    authorize_order(&tx,&self.1,order_id)?;
    let old:Option<(String,String)>=tx.query_row("SELECT actor_id,request FROM local_kitchen_corrections WHERE id=?1",[id],|q|Ok((q.get(0)?,q.get(1)?))).optional()?;
    if let Some((actor,previous))=old{if actor!=s.actor_id||previous!=raw{return Err(StoreError::OperationConflict);}return payload(&tx,"correction",id);}
    let n=tx.execute("UPDATE local_restaurant_orders SET revision=revision+1 WHERE id=?1 AND revision=?2 AND state<>'cancelled' AND EXISTS(SELECT 1 FROM local_restaurant_tickets WHERE order_id=?1)",params![order_id,expected_revision])?;if n!=1{return Err(StoreError::Conflict);}
    tx.execute("INSERT INTO local_kitchen_corrections(id,order_id,actor_id,request,changes) VALUES(?1,?2,?3,?4,?5)",params![id,order_id,s.actor_id,raw,serde_json::to_string(changes)?])?;payload(&tx,"correction",id)?
   },
   Action::Destination{id,name,layout}=>{identity::verify(&tx,s,Permission::Settings)?;if !billing::valid_id(id)||name.trim().is_empty()||!valid(name,60)||!matches!(layout.as_str(),"58mm"|"80mm"|"a4"){return Err(StoreError::InvalidDraft);}tx.execute("INSERT INTO local_kitchen_destinations VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,layout=excluded.layout",params![id,name,layout])?;json!({"id":id})},
   Action::Print{id,ticket_id,ticket_kind,destination_id}=>{
    if !billing::valid_id(id){return Err(StoreError::InvalidDraft);}
    let old:Option<(String,String,String,String,String)>=tx.query_row("SELECT ticket_id,ticket_kind,destination_id,actor_id,payload FROM local_kitchen_print_jobs WHERE id=?1",[id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?,q.get(4)?))).optional()?;
    if let Some((ticket,kind,destination,actor,document))=old{if ticket!=*ticket_id||kind!=*ticket_kind||destination!=*destination_id||actor!=s.actor_id{return Err(StoreError::OperationConflict);}return Ok(serde_json::from_str(&document)?);}
    let (name,layout):(String,String)=tx.query_row("SELECT name,layout FROM local_kitchen_destinations WHERE id=?1",[destination_id],|q|Ok((q.get(0)?,q.get(1)?)))?;
    let document=json!({"jobId":id,"destination":name,"layout":layout,"ticket":payload(&tx,ticket_kind,ticket_id)?});
    tx.execute("INSERT INTO local_kitchen_print_jobs VALUES(?1,?2,?3,?4,?5,?6,'requested')",params![id,ticket_id,ticket_kind,destination_id,s.actor_id,document.to_string()])?;document
   },
   Action::Confirm{id,state}=>{if !matches!(state.as_str(),"operator_confirmed"|"operator_cancelled"){return Err(StoreError::InvalidDraft);}let (actor,old):(String,String)=tx.query_row("SELECT actor_id,state FROM local_kitchen_print_jobs WHERE id=?1",[id],|q|Ok((q.get(0)?,q.get(1)?)))?;if actor!=s.actor_id{return Err(StoreError::Forbidden);}if old!=*state{if old!="requested"{return Err(StoreError::Conflict);}tx.execute("UPDATE local_kitchen_print_jobs SET state=?1 WHERE id=?2",params![state,id])?;}json!({"id":id,"state":state})},
   Action::Assign{order_id,expected_revision,actor_id}=>{identity::verify(&tx,s,Permission::Settings)?;if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_control WHERE order_id=?1)",[order_id],|q|q.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_principals WHERE id=?1 AND enabled=1 AND business_id=?2)",params![actor_id,s.scope.business_id],|q|q.get::<_,bool>(0))?{return Err(StoreError::Forbidden);}if tx.execute("UPDATE local_restaurant_orders SET revision=revision+1 WHERE id=?1 AND revision=?2 AND state IN ('open','pending_bill') AND settled_invoice IS NULL",params![order_id,expected_revision])?!=1{return Err(StoreError::Conflict);}tx.execute("INSERT INTO local_restaurant_assignments VALUES(?1,?2) ON CONFLICT(order_id) DO UPDATE SET actor_id=excluded.actor_id",params![order_id,actor_id])?;json!({"orderId":order_id,"actorId":actor_id})},
  };
  identity::guard(&tx,&self.1,Permission::Sell,"restaurant.kitchen_changed",Some(&raw))?;tx.commit()?;Ok(result)
 }
 pub(crate) fn restaurant_workspace(&self)->Result<Value,StoreError>{
  let tx=self.0.unchecked_transaction()?;
  let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&self.0,s,Permission::Sell)?;
  let view=serde_json::to_value(self.restaurant_view()?)?;
  let menu=self.0.prepare("SELECT m.id,m.product_id,m.category,m.label,m.variant,m.available,p.unit_price_paise FROM local_restaurant_menu m JOIN local_products p ON p.id=m.product_id ORDER BY m.id")?.query_map([],|q|Ok(json!({"id":q.get::<_,String>(0)?,"productId":q.get::<_,String>(1)?,"category":q.get::<_,String>(2)?,"label":q.get::<_,String>(3)?,"variant":q.get::<_,String>(4)?,"available":q.get::<_,bool>(5)?,"pricePaise":q.get::<_,i64>(6)?})))?.collect::<Result<Vec<_>,_>>()?;
  let assignments=self.0.prepare("SELECT o.id,COALESCE(c.actor_id,a.actor_id),p.display_name,COALESCE(c.phase,'unpaid') FROM local_restaurant_orders o LEFT JOIN local_restaurant_control c ON c.order_id=o.id LEFT JOIN local_restaurant_assignments a ON a.order_id=o.id LEFT JOIN local_principals p ON p.id=COALESCE(c.actor_id,a.actor_id) WHERE o.settled_invoice IS NULL AND o.state<>'cancelled'")?.query_map([],|q|Ok(json!({"orderId":q.get::<_,String>(0)?,"actorId":q.get::<_,Option<String>>(1)?,"displayName":q.get::<_,Option<String>>(2)?,"checkoutState":q.get::<_,String>(3)?})))?.collect::<Result<Vec<_>,_>>()?;
  let generated:String=self.0.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",[],|q|q.get(0))?;
  let result=json!({"schemaVersion":1,"source":"shop","businessId":s.scope.business_id,"generatedAt":generated,"tables":view["tables"],"orders":view["orders"],"tickets":view["tickets"],"menu":menu,"assignments":assignments});tx.commit()?;Ok(result)
 }
}
