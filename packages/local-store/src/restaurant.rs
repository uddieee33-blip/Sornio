//! Operational restaurant drafts only. This module does not post money or stock.
use crate::{billing, identity::{self, Permission}, Store, StoreError};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Item { pub name: String, pub quantity: i64, pub note: String,
 #[serde(default)] pub product_id: Option<String>, #[serde(default)] pub unit_price_paise: Option<i64> }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag="kind", rename_all="snake_case", deny_unknown_fields)]
pub enum Action {
    CreateTable { id: String, name: String },
    OpenOrder { id: String, table_id: Option<String> },
    MoveOrder { id: String, expected_revision: i64, table_id: String },
    SendTicket { id: String, order_id: String, expected_revision: i64, items: Vec<Item> },
    SetTicketState { id: String, expected_revision: i64, state: String },
    RequestBill { id: String, expected_revision: i64 },
    CancelOrder { id: String, expected_revision: i64 },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Request { pub operation_id: String, pub action: Action }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Table { id: String, name: String }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Order { id: String, table_id: Option<String>, kind: String, state: String, revision: i64 }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Ticket { id: String, order_id: String, items: Vec<Item>, state: String, revision: i64 }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct View { tables: Vec<Table>, orders: Vec<Order>, tickets: Vec<Ticket>, #[serde(rename="paidKitchen")] paid_kitchen: serde_json::Value }

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> { tx.execute_batch(include_str!("restaurant-schema.sql"))?; Ok(()) }
fn id(s: &str) -> Result<(), StoreError> { if billing::valid_id(s) { Ok(()) } else { Err(StoreError::InvalidInvoice) } }
fn label(s: &str, max: usize) -> bool { !s.trim().is_empty() && s.chars().count() <= max && !s.chars().any(char::is_control) }
fn changed(n: usize) -> Result<(), StoreError> { if n == 1 { Ok(()) } else { Err(StoreError::OperationConflict) } }
impl Store {
    pub(crate) fn restaurant_view(&self) -> Result<View, StoreError> {
        let session = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, session, Permission::Sell)?;
        let tables = self.0.prepare("SELECT id,name FROM local_restaurant_tables WHERE active=1 ORDER BY name")?.query_map([], |r| Ok(Table{id:r.get(0)?,name:r.get(1)?}))?.collect::<Result<Vec<_>,_>>()?;
        let orders = self.0.prepare("SELECT id,table_id,kind,state,revision FROM local_restaurant_orders WHERE state IN ('open','pending_bill') AND settled_invoice IS NULL ORDER BY rowid")?.query_map([], |r| Ok(Order{id:r.get(0)?,table_id:r.get(1)?,kind:r.get(2)?,state:r.get(3)?,revision:r.get(4)?}))?.collect::<Result<Vec<_>,_>>()?;
        let rows = self.0.prepare("SELECT t.id,t.order_id,t.items,t.state,t.revision FROM local_restaurant_tickets t JOIN local_restaurant_orders o ON o.id=t.order_id WHERE o.state IN ('open','pending_bill') AND o.settled_invoice IS NULL ORDER BY t.rowid")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,i64>(4)?)))?.collect::<Result<Vec<_>,_>>()?;
        let mut tickets = Vec::new(); for (id,order_id,items,state,revision) in rows { tickets.push(Ticket{id,order_id,items:serde_json::from_str(&items)?,state,revision}); }
        Ok(View {tables,orders,tickets,paid_kitchen:self.paid_kitchen()?})
    }
    /// Paid preparation is a separate read model: never reopen orders or occupy tables.
    pub(crate) fn paid_kitchen(&self)->Result<serde_json::Value,StoreError>{
        identity::verify(&self.0,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Sell)?;
        let rows=self.0.prepare("SELECT t.id,t.order_id,o.kind,tb.name,t.items,t.state,t.revision,COALESCE(c.actor_id,a.actor_id),p.display_name FROM local_restaurant_tickets t JOIN local_restaurant_orders o ON o.id=t.order_id JOIN local_invoices i ON i.id=o.settled_invoice LEFT JOIN local_restaurant_tables tb ON tb.id=o.table_id LEFT JOIN local_restaurant_control c ON c.order_id=o.id LEFT JOIN local_restaurant_assignments a ON a.order_id=o.id LEFT JOIN local_principals p ON p.id=COALESCE(c.actor_id,a.actor_id) WHERE o.state IN ('open','pending_bill') AND t.state<>'served' ORDER BY t.rowid LIMIT 1000")?.query_map([],|q|Ok((q.get::<_,String>(0)?,q.get::<_,String>(1)?,q.get::<_,String>(2)?,q.get::<_,Option<String>>(3)?,q.get::<_,String>(4)?,q.get::<_,String>(5)?,q.get::<_,i64>(6)?,q.get::<_,Option<String>>(7)?,q.get::<_,Option<String>>(8)?)))?.collect::<Result<Vec<_>,_>>()?;
        let mut result=Vec::new();for (id,order,kind,table,items,state,revision,actor,name) in rows{let items:Vec<Item>=serde_json::from_str(&items)?;result.push(serde_json::json!({"id":id,"orderId":order,"kind":kind,"tableName":table,"items":items,"state":state,"revision":revision,"actorId":actor,"displayName":name}));}Ok(serde_json::json!(result))
    }
    pub(crate) fn restaurant_action(&mut self, request: Request) -> Result<(), StoreError> {
        id(&request.operation_id)?;
        let raw = serde_json::to_string(&request)?;
        let tx = self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let session = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&tx, session, Permission::Sell)?;
        let old: Option<(String,String)> = tx.query_row("SELECT actor_id,request FROM local_restaurant_events WHERE operation_id=?1",[&request.operation_id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        if let Some((actor, previous)) = old { return if actor == session.actor_id && previous == raw { Ok(()) } else { Err(StoreError::OperationConflict) }; }
        let target = match &request.action { Action::MoveOrder{id,..}|Action::RequestBill{id,..}|Action::CancelOrder{id,..} => Some(id), Action::SendTicket{order_id,..} => Some(order_id), _=>None };
        if let Some(target)=target { crate::kitchen::authorize_order(&tx,&self.1,target)?; if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_bindings WHERE order_id=?1)",[target],|q|q.get::<_,bool>(0))? {return Err(StoreError::CheckoutActive);} }
        match &request.action {
            Action::CreateTable{id: key,name} => { id(key)?; if !label(name,40) { return Err(StoreError::InvalidInvoice); } identity::verify(&tx,session,Permission::Settings)?; changed(tx.execute("INSERT INTO local_restaurant_tables VALUES(?1,?2,1)",params![key,name.trim()])?)?; }
            Action::OpenOrder{id:key,table_id} => { id(key)?; if let Some(table)=table_id { id(table)?; if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_tables WHERE id=?1 AND active=1)",[table],|r|r.get::<_,bool>(0))? { return Err(StoreError::InvalidInvoice); } } changed(tx.execute("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES(?1,?2,?3,'open',1)",params![key,table_id,if table_id.is_some(){"dine_in"}else{"takeaway"}])?)?; }
            Action::MoveOrder{id:key,expected_revision,table_id} => { id(key)?; id(table_id)?; changed(tx.execute("UPDATE local_restaurant_orders SET table_id=?1,revision=revision+1 WHERE id=?2 AND revision=?3 AND kind='dine_in' AND state='open' AND EXISTS(SELECT 1 FROM local_restaurant_tables WHERE id=?1 AND active=1)",params![table_id,key,expected_revision])?)?; }
            Action::SendTicket{id:key,order_id,expected_revision,items} => { id(key)?;id(order_id)?;if items.is_empty() || items.len()>50 || items.iter().any(|i| !label(&i.name,120) || !(1..=1000).contains(&i.quantity) || i.note.chars().count()>200 || i.note.chars().any(char::is_control)) { return Err(StoreError::InvalidInvoice); } changed(tx.execute("UPDATE local_restaurant_orders SET revision=revision+1 WHERE id=?1 AND revision=?2 AND state='open'",params![order_id,expected_revision])?)?; changed(tx.execute("INSERT INTO local_restaurant_tickets VALUES(?1,?2,?3,'pending',1)",params![key,order_id,serde_json::to_string(&priced_items(&tx,items)?)?])?)?; }
            Action::SetTicketState{id:key,expected_revision,state} => { transition_ticket(&tx,&self.1,key,*expected_revision,state)?; }
            Action::RequestBill{id:key,expected_revision} => { id(key)?; changed(tx.execute("UPDATE local_restaurant_orders SET state='pending_bill',revision=revision+1 WHERE id=?1 AND revision=?2 AND state='open'",params![key,expected_revision])?)?; }
            Action::CancelOrder{id:key,expected_revision} => { id(key)?; identity::verify(&tx,session,Permission::Settings)?; changed(tx.execute("UPDATE local_restaurant_orders SET state='cancelled',revision=revision+1 WHERE id=?1 AND revision=?2 AND state IN ('open','pending_bill')",params![key,expected_revision])?)?; }
        }
        identity::guard(&tx,&self.1,Permission::Sell,"restaurant.changed",Some(&request.operation_id))?;
        tx.execute("INSERT INTO local_restaurant_events(operation_id,actor_id,request) VALUES(?1,?2,?3)",params![request.operation_id,session.actor_id,raw])?;
        tx.commit()?; Ok(())
    }
}

fn priced_items(tx:&Transaction<'_>,items:&[Item])->Result<Vec<Item>,StoreError>{
 let mut result=Vec::new();for i in items {
  let product=i.product_id.as_deref().ok_or(StoreError::InvalidProduct)?;
  let (price,name):(i64,String)=tx.query_row("SELECT p.unit_price_paise,m.label || CASE WHEN m.variant='' THEN '' ELSE ' / ' || m.variant END FROM local_products p JOIN local_restaurant_menu m ON m.product_id=p.id WHERE p.id=?1 AND m.available=1 ORDER BY m.id LIMIT 1",[product],|q|Ok((q.get(0)?,q.get(1)?)))?;
  result.push(Item{name,quantity:i.quantity,note:i.note.clone(),product_id:Some(product.into()),unit_price_paise:Some(price)});
 }Ok(result)
}

/// One authoritative operational transition shared by desktop and authenticated LAN.
/// It changes neither order items/revisions nor money, stock, debt or table ownership.
pub(crate) fn transition_ticket(tx:&Transaction<'_>,session:&Option<crate::identity::Session>,ticket:&str,expected:i64,next:&str)->Result<(String,i64),StoreError>{
 id(ticket)?;let actor=session.as_ref().ok_or(StoreError::Locked)?;identity::verify(tx,actor,Permission::Sell)?;
 if expected<1||!matches!(next,"preparing"|"ready"|"served"){return Err(StoreError::InvalidDraft);}
 let row:Option<(String,String,i64,String,Option<String>)>=tx.query_row("SELECT t.order_id,t.state,t.revision,o.state,o.settled_invoice FROM local_restaurant_tickets t JOIN local_restaurant_orders o ON o.id=t.order_id WHERE t.id=?1",[ticket],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?,q.get(4)?))).optional()?;
 let (order,state,revision,order_state,invoice)=row.ok_or(StoreError::InvalidDraft)?;
 crate::kitchen::authorize_order(tx,session,&order)?;
 if revision!=expected{return Err(StoreError::Conflict);}
 if !matches!(order_state.as_str(),"open"|"pending_bill"){return Err(StoreError::CheckoutActive);}
 if let Some(invoice)=invoice{if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_invoices WHERE id=?1)",[invoice],|q|q.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}}
 if !matches!((state.as_str(),next),("pending","preparing")|("preparing","ready")|("ready","served")){return Err(StoreError::InvalidDraft);}
 let revision=revision.checked_add(1).ok_or(StoreError::Conflict)?;
 if tx.execute("UPDATE local_restaurant_tickets SET state=?1,revision=?2 WHERE id=?3 AND revision=?4 AND state=?5 AND ((state='pending' AND ?1='preparing') OR (state='preparing' AND ?1='ready') OR (state='ready' AND ?1='served')) AND EXISTS(SELECT 1 FROM local_restaurant_orders WHERE id=local_restaurant_tickets.order_id AND state IN ('open','pending_bill') AND (settled_invoice IS NULL OR EXISTS(SELECT 1 FROM local_invoices WHERE id=local_restaurant_orders.settled_invoice)))",params![next,revision,ticket,expected,state])?!=1{return Err(StoreError::Conflict);}
 Ok((order,revision))
}
