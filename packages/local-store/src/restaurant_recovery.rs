use crate::{billing::{self,BillLine,PostInvoice,Tender},identity::{self,Permission},payments::{self,PaymentPart},Store,StoreError};
use rusqlite::{params,Connection,OptionalExtension,Transaction,TransactionBehavior};
use serde::{Serialize,Deserialize};
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Status {pub order_id:String,pub parent_id:String,pub attempt_id:String,pub actor_id:String,pub revision:i64,pub phase:String,pub reason:String,pub request:payments::Request}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Line {pub product_id:String,pub quantity_milli:i64,pub price_paise:i64,pub note:String}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Amendment {pub order_id:String,pub expected_revision:i64,pub attempt_id:String,pub lines:Vec<Line>,pub tax_basis_points:i64,pub customer_id:Option<String>,pub payments:Vec<PaymentPart>,pub accept_prices:bool}
pub(crate) fn migrate(tx:&Transaction<'_>)->Result<(),StoreError>{tx.execute_batch(include_str!("restaurant_recovery-schema.sql"))?;Ok(())}
fn read(db:&Connection,order:&str)->Result<Status,StoreError>{
 let (parent_id,attempt_id,actor_id,revision,phase,reason,raw):(String,String,String,i64,String,String,String)=db.query_row("SELECT c.parent_id,c.attempt_id,c.actor_id,c.revision,c.phase,c.reason,a.request FROM local_restaurant_control c JOIN local_restaurant_attempts a ON a.id=c.attempt_id WHERE c.order_id=?1",[order],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?,q.get(4)?,q.get(5)?,q.get(6)?)))?;
 Ok(Status{order_id:order.into(),parent_id,attempt_id,actor_id,revision,phase,reason,request:serde_json::from_str(&raw)?})
}
fn unpaid(db:&Connection,order:&str)->Result<(),StoreError>{
 if db.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_attempts a WHERE a.order_id=?1 AND (EXISTS(SELECT 1 FROM local_invoices i WHERE i.id=a.id) OR EXISTS(SELECT 1 FROM local_retail_ops r WHERE r.id=a.id))) OR EXISTS(SELECT 1 FROM local_restaurant_orders WHERE id=?1 AND settled_invoice IS NOT NULL)",[order],|q|q.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}Ok(())
}
fn audit(tx:&Transaction<'_>,order:&str,actor:&str,payload:&str)->Result<(),StoreError>{tx.execute("INSERT INTO local_restaurant_recovery_events(order_id,actor_id,payload) VALUES(?1,?2,?3)",params![order,actor,payload])?;Ok(())}
pub(crate) fn bind(tx:&Transaction<'_>,order:&str,id:&str,actor:&str,raw:&str)->Result<(),StoreError>{
 tx.execute("INSERT INTO local_restaurant_attempts VALUES(?1,?2,?1,?3)",params![id,order,raw])?;
 tx.execute("INSERT INTO local_restaurant_control VALUES(?1,?2,?2,?3,1,'bound','')",params![order,id,actor])?;audit(tx,order,actor,"checkout.bound")
}
pub(crate) fn complete(tx:&Transaction<'_>,invoice:&str)->Result<(),StoreError>{
 tx.execute("UPDATE local_restaurant_orders SET settled_invoice=?1,revision=revision+1 WHERE id=(SELECT order_id FROM local_restaurant_control WHERE attempt_id=?1) AND settled_invoice IS NULL",[invoice])?;
 tx.execute("UPDATE local_restaurant_control SET phase='settled',revision=revision+1,reason='' WHERE attempt_id=?1 AND phase<>'settled'",[invoice])?;Ok(())
}
pub(crate) fn current_request(db:&Connection,order:&str,actor:&str)->Result<payments::Request,StoreError>{let c=read(db,order)?;if c.actor_id!=actor{return Err(StoreError::Forbidden);}Ok(c.request)}
impl Store {
 pub(crate) fn restaurant_preparation_refused(&mut self,r:&crate::restaurant_checkout::Prepare,reason:&str)->Result<(),StoreError>{
  if !billing::valid_id(&r.operation_id){return Ok(());}
  let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;
  if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_control WHERE order_id=?1)",[&r.order_id],|q|q.get::<_,bool>(0))?{return Ok(());}
  let revision:i64=tx.query_row("SELECT revision FROM local_restaurant_orders WHERE id=?1 AND settled_invoice IS NULL AND state IN ('open','pending_bill')",[&r.order_id],|q|q.get(0))?;
  if revision!=r.expected_revision{return Err(StoreError::Conflict);}
  payments::available(&tx,&r.operation_id)?;
  let rows=tx.prepare("SELECT items FROM local_restaurant_tickets WHERE order_id=?1 ORDER BY rowid")?.query_map([&r.order_id],|q|q.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?;
  let mut lines=Vec::new();for raw in rows{let items:Vec<crate::restaurant::Item>=serde_json::from_str(&raw)?;for item in items{lines.push(BillLine{product_id:item.product_id.unwrap_or_default(),expected_revision:1,quantity_milli:item.quantity.checked_mul(1000).ok_or(StoreError::InvalidInvoice)?});}}
  let request=payments::Request{operation_id:r.operation_id.clone(),action:payments::Action::Sale{invoice:PostInvoice{operation_id:r.operation_id.clone(),lines,tax_basis_points:r.tax_basis_points,tender:Tender::Retail,customer_id:r.customer_id.clone()},payments:r.payments.clone()}};
  let raw=serde_json::to_string(&request)?;
  tx.execute("INSERT INTO local_restaurant_bindings VALUES(?1,?2,?3,?4)",params![r.order_id,r.operation_id,s.actor_id,raw])?;
  bind(&tx,&r.order_id,&r.operation_id,&s.actor_id,&raw)?;
  tx.execute("UPDATE local_restaurant_control SET phase='refused',reason=?1,revision=revision+1 WHERE order_id=?2",params![reason,r.order_id])?;
  tx.execute("UPDATE local_restaurant_orders SET state='pending_bill',revision=revision+1 WHERE id=?1",[&r.order_id])?;
  audit(&tx,&r.order_id,&s.actor_id,"checkout.preparation_refused")?;tx.commit()?;Ok(())
 }

 pub(crate) fn restaurant_status(&self,order:&str)->Result<Option<Status>,StoreError>{
  identity::verify(&self.0,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Sell)?;
  if !self.0.query_row("SELECT EXISTS(SELECT 1 FROM local_restaurant_control WHERE order_id=?1)",[order],|q|q.get::<_,bool>(0))?{return Ok(None);}Ok(Some(read(&self.0,order)?))
 }
 pub(crate) fn restaurant_recover(&mut self,order:&str,expected_attempt:&str)->Result<payments::Receipt,StoreError>{
  let request={let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;let c=read(&tx,order)?;
   if c.actor_id!=s.actor_id{return Err(StoreError::Forbidden);}
   if c.attempt_id!=expected_attempt{return Err(StoreError::Conflict);}
   if matches!(c.phase.as_str(),"refused"|"editable") && !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_retail_pending WHERE id=?1 AND actor_id=?2)",params![c.attempt_id,s.actor_id],|q|q.get::<_,bool>(0))? {return Err(StoreError::InvalidPayment);}
   if c.phase!="settled"{tx.execute("UPDATE local_restaurant_control SET phase='submitting',revision=revision+1 WHERE order_id=?1",[order])?;audit(&tx,order,&s.actor_id,"checkout.submitting")?;}
   let r=c.request;tx.commit()?;r};
  let attempt=request.operation_id.clone();
  let result=self.post_retail(request);
  if result.is_ok(){let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;complete(&tx,&attempt)?;tx.commit()?;}
  if let Err(ref error)=result {
   let definite=matches!(error,StoreError::StockConflict|StoreError::InvalidStock|StoreError::CreditLimit|StoreError::CustomerMissing|StoreError::InvalidCustomer|StoreError::InvalidPayment|StoreError::InvalidInvoice|StoreError::ProductMissing|StoreError::CreditConflict|StoreError::DayClosed|StoreError::InvalidProduct|StoreError::InvalidCredit|StoreError::Overpayment);
   let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
   let canceled=tx.query_row("SELECT EXISTS(SELECT 1 FROM local_retail_canceled WHERE id=(SELECT attempt_id FROM local_restaurant_control WHERE order_id=?1))",[order],|q|q.get::<_,bool>(0))?;
   if unpaid(&tx,order).is_ok(){tx.execute("UPDATE local_restaurant_control SET phase=?1,reason=?2,revision=revision+1 WHERE order_id=?3 AND phase<>'settled'",params![if definite||canceled{"refused"}else{"unknown"},error.to_string(),order])?;}
   tx.commit()?;
  }result
 }
 pub(crate) fn edit_restaurant(&mut self,order:&str,expected:i64)->Result<Status,StoreError>{
  let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;let c=read(&tx,order)?;
  if c.actor_id!=s.actor_id{return Err(StoreError::Forbidden);}if c.revision!=expected||!matches!(c.phase.as_str(),"refused"|"editable"){return Err(StoreError::Conflict);}unpaid(&tx,order)?;
  if c.phase=="refused"{tx.execute("UPDATE local_restaurant_control SET phase='editable',revision=revision+1 WHERE order_id=?1",[order])?;audit(&tx,order,&s.actor_id,"checkout.editing")?;}
  let result=read(&tx,order)?;tx.commit()?;Ok(result)
 }
 pub(crate) fn amend_restaurant(&mut self,r:Amendment)->Result<Status,StoreError>{
  let raw=serde_json::to_string(&r)?;let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;let c=read(&tx,&r.order_id)?;
  if c.actor_id!=s.actor_id{return Err(StoreError::Forbidden);}if c.revision!=r.expected_revision||!matches!(c.phase.as_str(),"refused"|"editable"){return Err(StoreError::Conflict);}unpaid(&tx,&r.order_id)?;
  if !r.accept_prices||!billing::valid_id(&r.attempt_id)||r.lines.is_empty()||r.lines.len()>100{return Err(StoreError::InvalidInvoice);}
  let mut lines=Vec::new();let mut subtotal=0i64;
  for l in &r.lines {
   if l.note.len()>200||l.note.chars().any(char::is_control){return Err(StoreError::InvalidInvoice);}
   let (price,revision):(i64,i64)=tx.query_row("SELECT p.unit_price_paise,p.revision FROM local_products p WHERE p.id=?1 AND EXISTS(SELECT 1 FROM local_restaurant_menu m WHERE m.product_id=p.id AND m.available=1)",[&l.product_id],|q|Ok((q.get(0)?,q.get(1)?)))?;
   if price!=l.price_paise{return Err(StoreError::StockConflict);}
   subtotal=subtotal.checked_add(billing::line_total(l.quantity_milli,price)?).ok_or(StoreError::InvalidInvoice)?;
   lines.push(BillLine{product_id:l.product_id.clone(),expected_revision:revision,quantity_milli:l.quantity_milli});
  }
  let total=subtotal.checked_add(billing::tax_total(subtotal,r.tax_basis_points)?).ok_or(StoreError::InvalidInvoice)?;
  let allocated=r.payments.iter().try_fold(0i64,|v,p|v.checked_add(p.amount_paise).ok_or(StoreError::InvalidPayment))?;
  if total<=0||allocated!=total{return Err(StoreError::InvalidPayment);}
  // Retirement and replacement occur under the same writer lock; the old key can never post again.
  tx.execute("INSERT OR IGNORE INTO local_retail_canceled VALUES(?1)",[&c.attempt_id])?;
  tx.execute("DELETE FROM local_retail_pending WHERE id=?1 AND actor_id=?2",params![c.attempt_id,s.actor_id])?;
  let next=payments::Request{operation_id:r.attempt_id.clone(),action:payments::Action::Sale{invoice:PostInvoice{operation_id:r.attempt_id.clone(),lines,tax_basis_points:r.tax_basis_points,tender:Tender::Retail,customer_id:r.customer_id},payments:r.payments}};
  payments::prepare_into(&tx,&self.1,next.clone())?;
  tx.execute("INSERT INTO local_restaurant_attempts VALUES(?1,?2,?3,?4)",params![r.attempt_id,r.order_id,c.parent_id,serde_json::to_string(&next)?])?;
  tx.execute("UPDATE local_restaurant_control SET attempt_id=?1,phase='bound',reason='',revision=revision+1 WHERE order_id=?2",params![r.attempt_id,r.order_id])?;
  audit(&tx,&r.order_id,&s.actor_id,&raw)?;let result=read(&tx,&r.order_id)?;tx.commit()?;Ok(result)
 }
 pub(crate) fn takeover_restaurant(&mut self,order:&str,expected:i64,target:&str)->Result<Status,StoreError>{
  let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Settings)?;let c=read(&tx,order)?;
  if c.revision!=expected||!matches!(c.phase.as_str(),"bound"|"refused"|"editable"){return Err(StoreError::Conflict);}unpaid(&tx,order)?;
  if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_principals WHERE id=?1 AND enabled=1 AND business_id=?2)",params![target,s.scope.business_id],|q|q.get::<_,bool>(0))?{return Err(StoreError::Forbidden);}
  if target==c.actor_id{return Ok(c);}
  if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_retail_pending WHERE actor_id=?1)",[target],|q|q.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}
  tx.execute("UPDATE local_retail_pending SET actor_id=?1 WHERE id=?2 AND actor_id=?3",params![target,c.attempt_id,c.actor_id])?;
  tx.execute("UPDATE local_restaurant_control SET actor_id=?1,revision=revision+1 WHERE order_id=?2",params![target,order])?;
  audit(&tx,order,&s.actor_id,&format!("checkout.transfer:{}->{}",c.actor_id,target))?;let result=read(&tx,order)?;tx.commit()?;Ok(result)
 }
}

pub(crate) fn canceled(tx:&Transaction<'_>,attempt:&str)->Result<(),StoreError>{
 let order:Option<String>=tx.query_row("SELECT order_id FROM local_restaurant_control WHERE attempt_id=?1 AND phase<>'settled'",[attempt],|q|q.get(0)).optional()?;
 if let Some(order)=order {unpaid(tx,&order)?;tx.execute("UPDATE local_restaurant_control SET phase='refused',reason='Checkout cancelled before posting. Correct the unpaid bill.',revision=revision+1 WHERE order_id=?1",[order])?;}
 Ok(())
}
#[cfg(test)]
mod tests;
