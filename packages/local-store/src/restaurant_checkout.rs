use crate::{billing::{self, BillLine, PostInvoice, Tender}, identity::{self, Permission}, payments::{self, PaymentPart}, restaurant::Item, Store, StoreError};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Menu { pub id:String, pub product_id:String, pub category:String, pub label:String, pub variant:String, pub available:bool }
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Prepare { pub order_id:String, pub expected_revision:i64, pub operation_id:String, pub tax_basis_points:i64, pub customer_id:Option<String>, pub payments:Vec<PaymentPart> }
pub(crate) fn migrate(tx:&Transaction<'_>)->Result<(),StoreError>{tx.execute_batch(include_str!("restaurant_checkout-schema.sql"))?;Ok(())}
pub(crate) fn complete(tx:&Transaction<'_>,invoice:&str)->Result<(),StoreError>{crate::restaurant_recovery::complete(tx,invoice)}

impl Store {
 pub(crate) fn prepare_restaurant(&mut self,r:Prepare)->Result<payments::Request,StoreError>{
  let result=self.prepare_restaurant_inner(r.clone());
  if let Err(ref error)=result {
   if matches!(error,StoreError::StockConflict|StoreError::CreditLimit|StoreError::CustomerMissing|StoreError::InvalidCustomer|StoreError::InvalidPayment|StoreError::InvalidInvoice|StoreError::ProductMissing) {
    self.restaurant_preparation_refused(&r,&error.to_string())?;
   }
  }result
 }
 pub(crate) fn restaurant_menu(&self)->Result<Vec<Menu>,StoreError>{
  let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&self.0,s,Permission::Sell)?;
  Ok(self.0.prepare("SELECT id,product_id,category,label,variant,available FROM local_restaurant_menu ORDER BY category,label,variant")?.query_map([],|r|Ok(Menu{id:r.get(0)?,product_id:r.get(1)?,category:r.get(2)?,label:r.get(3)?,variant:r.get(4)?,available:r.get(5)?}))?.collect::<Result<Vec<_>,_>>()?)
 }
 pub(crate) fn save_restaurant_menu(&mut self,m:Menu)->Result<(),StoreError>{
  if !billing::valid_id(&m.id)||!billing::valid_id(&m.product_id)||[&m.category,&m.label,&m.variant].iter().any(|v|v.len()>120||v.chars().any(char::is_control))||m.label.trim().is_empty(){return Err(StoreError::InvalidProduct);}
  let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
  identity::verify(&tx,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::Settings)?;
  tx.execute("INSERT INTO local_restaurant_menu VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id,category=excluded.category,label=excluded.label,variant=excluded.variant,available=excluded.available",params![m.id,m.product_id,m.category,m.label,m.variant,m.available])?;
  identity::guard(&tx,&self.1,Permission::Settings,"restaurant.menu_changed",Some(&m.id))?;tx.commit()?;Ok(())
 }
 fn prepare_restaurant_inner(&mut self,r:Prepare)->Result<payments::Request,StoreError>{
  let tx=self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
  let s=self.1.as_ref().ok_or(StoreError::Locked)?;identity::verify(&tx,s,Permission::Sell)?;
  let old:Option<(String,String)>=tx.query_row("SELECT actor_id,request FROM local_restaurant_bindings WHERE order_id=?1",[&r.order_id],|q|Ok((q.get(0)?,q.get(1)?))).optional()?;
  if old.is_some() {let c=crate::restaurant_recovery::current_request(&tx,&r.order_id,&s.actor_id)?;return Ok(c);}
  let revision:i64=tx.query_row("SELECT revision FROM local_restaurant_orders WHERE id=?1 AND state IN ('open','pending_bill') AND settled_invoice IS NULL",[&r.order_id],|q|q.get(0))?;
  if revision!=r.expected_revision{return Err(StoreError::OperationConflict);}
  let rows=tx.prepare("SELECT items FROM local_restaurant_tickets WHERE order_id=?1 ORDER BY rowid")?.query_map([&r.order_id],|q|q.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?;
  let mut lines=Vec::new();let mut subtotal=0i64;
  for raw in rows {let items:Vec<Item>=serde_json::from_str(&raw)?;for item in items{
   let product=item.product_id.ok_or(StoreError::InvalidProduct)?;
   let (price,revision):(i64,i64)=tx.query_row("SELECT unit_price_paise,revision FROM local_products WHERE id=?1",[&product],|q|Ok((q.get(0)?,q.get(1)?)))?;
   if Some(price)!=item.unit_price_paise{return Err(StoreError::StockConflict);}
   subtotal=subtotal.checked_add(billing::line_total(item.quantity.checked_mul(1000).ok_or(StoreError::InvalidInvoice)?,price)?).ok_or(StoreError::InvalidInvoice)?;
   lines.push(BillLine{product_id:product,expected_revision:revision,quantity_milli:item.quantity.checked_mul(1000).ok_or(StoreError::InvalidInvoice)?});
  }}
  let total=subtotal.checked_add(billing::tax_total(subtotal,r.tax_basis_points)?).ok_or(StoreError::InvalidInvoice)?;
  let allocated=r.payments.iter().try_fold(0i64,|sum,p|sum.checked_add(p.amount_paise).ok_or(StoreError::InvalidPayment))?;
  if allocated!=total || total<=0 {return Err(StoreError::InvalidPayment);}
  let credit=r.payments.iter().filter(|p|p.method=="credit").map(|p|p.amount_paise).sum::<i64>();
  if credit>0 {
   let customer=crate::customers::customer(&tx,r.customer_id.as_deref().ok_or(StoreError::InvalidPayment)?)?;
   if let Some(available)=customer.available_credit_paise {if available.parse::<i128>().map_or(true,|v|credit as i128>v){return Err(StoreError::CreditLimit);}}
  }
  let request=payments::Request{operation_id:r.operation_id.clone(),action:payments::Action::Sale{invoice:PostInvoice{operation_id:r.operation_id.clone(),lines,tax_basis_points:r.tax_basis_points,tender:Tender::Retail,customer_id:r.customer_id},payments:r.payments}};
  payments::prepare_into(&tx,&self.1,request.clone())?;
  tx.execute("INSERT INTO local_restaurant_bindings VALUES(?1,?2,?3,?4)",params![r.order_id,r.operation_id,s.actor_id,serde_json::to_string(&request)?])?;
  crate::restaurant_recovery::bind(&tx,&r.order_id,&r.operation_id,&s.actor_id,&serde_json::to_string(&request)?)?;
  tx.execute("UPDATE local_restaurant_orders SET state='pending_bill',revision=revision+1 WHERE id=?1",[&r.order_id])?;
  identity::guard(&tx,&self.1,Permission::Sell,"restaurant.checkout_bound",Some(&r.order_id))?;tx.commit()?;Ok(request)
 }
 pub(crate) fn post_restaurant(&mut self,order:&str,attempt:&str)->Result<payments::Receipt,StoreError>{self.restaurant_recover(order,attempt)}
}
