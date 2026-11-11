//! Operational restaurant drafts only. This module does not post money or stock.
use crate::{billing, identity::{self, Permission}, Store, StoreError};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Item { pub name: String, pub quantity: i64, pub note: String }
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
pub struct View { tables: Vec<Table>, orders: Vec<Order>, tickets: Vec<Ticket> }

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> { tx.execute_batch(include_str!("restaurant-schema.sql"))?; Ok(()) }
fn id(s: &str) -> Result<(), StoreError> { if billing::valid_id(s) { Ok(()) } else { Err(StoreError::InvalidInvoice) } }
fn label(s: &str, max: usize) -> bool { !s.trim().is_empty() && s.chars().count() <= max && !s.chars().any(char::is_control) }
fn changed(n: usize) -> Result<(), StoreError> { if n == 1 { Ok(()) } else { Err(StoreError::OperationConflict) } }
impl Store {
    pub(crate) fn restaurant_view(&self) -> Result<View, StoreError> {
        let session = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, session, Permission::Sell)?;
        let tables = self.0.prepare("SELECT id,name FROM local_restaurant_tables WHERE active=1 ORDER BY name")?.query_map([], |r| Ok(Table{id:r.get(0)?,name:r.get(1)?}))?.collect::<Result<Vec<_>,_>>()?;
        let orders = self.0.prepare("SELECT id,table_id,kind,state,revision FROM local_restaurant_orders WHERE state IN ('open','pending_bill') ORDER BY rowid")?.query_map([], |r| Ok(Order{id:r.get(0)?,table_id:r.get(1)?,kind:r.get(2)?,state:r.get(3)?,revision:r.get(4)?}))?.collect::<Result<Vec<_>,_>>()?;
        let rows = self.0.prepare("SELECT t.id,t.order_id,t.items,t.state,t.revision FROM local_restaurant_tickets t JOIN local_restaurant_orders o ON o.id=t.order_id WHERE o.state IN ('open','pending_bill') ORDER BY t.rowid")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,i64>(4)?)))?.collect::<Result<Vec<_>,_>>()?;
        let mut tickets = Vec::new(); for (id,order_id,items,state,revision) in rows { tickets.push(Ticket{id,order_id,items:serde_json::from_str(&items)?,state,revision}); }
        Ok(View {tables,orders,tickets})
    }
    pub(crate) fn restaurant_action(&mut self, request: Request) -> Result<(), StoreError> {
        id(&request.operation_id)?;
        let raw = serde_json::to_string(&request)?;
        let tx = self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let session = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&tx, session, Permission::Sell)?;
        let old: Option<(String,String)> = tx.query_row("SELECT actor_id,request FROM local_restaurant_events WHERE operation_id=?1",[&request.operation_id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        if let Some((actor, previous)) = old { return if actor == session.actor_id && previous == raw { Ok(()) } else { Err(StoreError::OperationConflict) }; }
        match &request.action {
            Action::CreateTable{id: key,name} => { id(key)?; if !label(name,40) { return Err(StoreError::InvalidInvoice); } identity::verify(&tx,session,Permission::Settings)?; changed(tx.execute("INSERT INTO local_restaurant_tables VALUES(?1,?2,1)",params![key,name.trim()])?)?; }
            Action::OpenOrder{id:key,table_id} => { id(key)?; if let Some(table)=table_id { id(table)?; if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_tables WHERE id=?1 AND active=1)",[table],|r|r.get::<_,bool>(0))? { return Err(StoreError::InvalidInvoice); } } changed(tx.execute("INSERT INTO local_restaurant_orders VALUES(?1,?2,?3,'open',1)",params![key,table_id,if table_id.is_some(){"dine_in"}else{"takeaway"}])?)?; }
            Action::MoveOrder{id:key,expected_revision,table_id} => { id(key)?; id(table_id)?; changed(tx.execute("UPDATE local_restaurant_orders SET table_id=?1,revision=revision+1 WHERE id=?2 AND revision=?3 AND kind='dine_in' AND state='open' AND EXISTS(SELECT 1 FROM local_restaurant_tables WHERE id=?1 AND active=1)",params![table_id,key,expected_revision])?)?; }
            Action::SendTicket{id:key,order_id,expected_revision,items} => { id(key)?;id(order_id)?;if items.is_empty() || items.len()>50 || items.iter().any(|i| !label(&i.name,120) || !(1..=1000).contains(&i.quantity) || i.note.chars().count()>200 || i.note.chars().any(char::is_control)) { return Err(StoreError::InvalidInvoice); } changed(tx.execute("UPDATE local_restaurant_orders SET revision=revision+1 WHERE id=?1 AND revision=?2 AND state='open'",params![order_id,expected_revision])?)?; changed(tx.execute("INSERT INTO local_restaurant_tickets VALUES(?1,?2,?3,'pending',1)",params![key,order_id,serde_json::to_string(items)?])?)?; }
            Action::SetTicketState{id:key,expected_revision,state} => { id(key)?; if !matches!(state.as_str(),"preparing"|"ready"|"served") { return Err(StoreError::InvalidInvoice); } changed(tx.execute("UPDATE local_restaurant_tickets SET state=?1,revision=revision+1 WHERE id=?2 AND revision=?3 AND ((state='pending' AND ?1='preparing') OR (state='preparing' AND ?1='ready') OR (state='ready' AND ?1='served')) AND EXISTS(SELECT 1 FROM local_restaurant_orders WHERE id=order_id AND state IN ('open','pending_bill'))",params![state,key,expected_revision])?)?; }
            Action::RequestBill{id:key,expected_revision} => { id(key)?; changed(tx.execute("UPDATE local_restaurant_orders SET state='pending_bill',revision=revision+1 WHERE id=?1 AND revision=?2 AND state='open'",params![key,expected_revision])?)?; }
            Action::CancelOrder{id:key,expected_revision} => { id(key)?; identity::verify(&tx,session,Permission::Settings)?; changed(tx.execute("UPDATE local_restaurant_orders SET state='cancelled',revision=revision+1 WHERE id=?1 AND revision=?2 AND state IN ('open','pending_bill')",params![key,expected_revision])?)?; }
        }
        identity::guard(&tx,&self.1,Permission::Sell,"restaurant.changed",Some(&request.operation_id))?;
        tx.execute("INSERT INTO local_restaurant_events(operation_id,actor_id,request) VALUES(?1,?2,?3)",params![request.operation_id,session.actor_id,raw])?;
        tx.commit()?; Ok(())
    }
}
