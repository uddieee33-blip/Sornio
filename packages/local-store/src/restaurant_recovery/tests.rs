use super::*;
use crate::{access::Workspace, catalog::AddProduct, identity::Session, restaurant::{Action,Item,Request},restaurant_checkout::{Menu,Prepare}};
const KEY:&str="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
fn seed(path:&std::path::Path)->Store{
 let mut w=Workspace::new(Store::open(path,KEY).unwrap());w.setup("Synthetic restaurant password 2026").unwrap();let s=w.local_session().unwrap();drop(w);
 let mut store=Store::open(path,KEY).unwrap();store.1=Some(Session{scope:s.scope,actor_id:s.principal.id,revision:s.principal.revision,generation:crate::recovery::generation(&store.0).unwrap(),expires:std::time::Instant::now()+std::time::Duration::from_secs(3600)});
 store.add_product(AddProduct{operation_id:"pizza".into(),name:"Pizza".into(),sku:"PIZZA".into(),unit:"pcs".into(),unit_price_paise:10000,opening_stock_milli:1000}).unwrap();
 store.save_restaurant_menu(Menu{id:"menu".into(),product_id:"pizza".into(),category:"Food".into(),label:"Pizza".into(),variant:"Large".into(),available:true}).unwrap();
 for (op,action) in [("table-op",Action::CreateTable{id:"table".into(),name:"Table 1".into()}),("open-op",Action::OpenOrder{id:"order".into(),table_id:Some("table".into())}),("kot-op",Action::SendTicket{id:"kot".into(),order_id:"order".into(),expected_revision:1,items:vec![Item{name:"Pizza".into(),quantity:2,note:"No onion".into(),product_id:Some("pizza".into()),unit_price_paise:None}]})]{store.restaurant_action(Request{operation_id:op.into(),action}).unwrap();}
 store.prepare_restaurant(Prepare{order_id:"order".into(),expected_revision:2,operation_id:"original".into(),tax_basis_points:0,customer_id:None,payments:vec![part(20000)]}).unwrap();store
}
fn part(amount:i64)->PaymentPart{PaymentPart{id:format!("cash-{amount}"),method:"cash".into(),amount_paise:amount,reference:String::new()}}
fn correction(rev:i64)->Amendment{Amendment{order_id:"order".into(),expected_revision:rev,attempt_id:"corrected".into(),lines:vec![Line{product_id:"pizza".into(),quantity_milli:1000,price_paise:10000,note:"No onion".into()}],tax_basis_points:0,customer_id:None,payments:vec![part(10000)],accept_prices:true}}
#[test]
fn refused_sale_amends_with_linked_attempt_and_settles_once(){
 let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("s.db"));assert!(s.restaurant_recover("order","original").is_err());let c=s.restaurant_status("order").unwrap().unwrap();assert_eq!(c.phase,"refused");
 let next=s.amend_restaurant(correction(c.revision)).unwrap();assert_eq!(next.parent_id,"original");assert_eq!(next.attempt_id,"corrected");assert!(s.restaurant_recover("order","original").is_err());
 let receipt=s.restaurant_recover("order","corrected").unwrap();assert_eq!(s.restaurant_recover("order","corrected").unwrap(),receipt);
 assert_eq!(s.0.query_row("SELECT COUNT(*) FROM local_invoices",[],|q|q.get::<_,i64>(0)).unwrap(),1);
 assert_eq!(s.0.query_row("SELECT stock_milli FROM local_products WHERE id='pizza'",[],|q|q.get::<_,i64>(0)).unwrap(),0);
 assert_eq!(s.0.query_row("SELECT settled_invoice FROM local_restaurant_orders WHERE id='order'",[],|q|q.get::<_,String>(0)).unwrap(),"corrected");
 assert!(s.amend_restaurant(correction(next.revision)).is_err());
}
#[test]
fn unknown_and_stale_amendments_cannot_replace_an_attempt(){
 let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("s.db"));let c=s.restaurant_status("order").unwrap().unwrap();
 assert!(s.amend_restaurant(correction(c.revision)).is_err());
 s.0.execute("UPDATE local_restaurant_control SET phase='unknown',revision=revision+1 WHERE order_id='order'",[]).unwrap();let c=s.restaurant_status("order").unwrap().unwrap();assert!(s.amend_restaurant(correction(c.revision)).is_err());
 assert!(s.takeover_restaurant("order",c.revision,&c.actor_id).is_err());
 s.restaurant_recover("order","original").unwrap_err();let c=s.restaurant_status("order").unwrap().unwrap();assert_eq!(c.phase,"refused");
 assert!(s.amend_restaurant(correction(c.revision-1)).is_err());s.amend_restaurant(correction(c.revision)).unwrap();assert!(s.amend_restaurant(correction(c.revision)).is_err());
}
#[test]
fn takeover_requires_owner_and_fences_the_old_cashier(){
 let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("s.db"));let owner=s.1.as_ref().unwrap().actor_id.clone();
 s.0.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) SELECT 'cashier',business_id,'cashier','Cashier','cashier',1,1,'synthetic' FROM local_identity",[]).unwrap();
 let c=s.restaurant_status("order").unwrap().unwrap();s.1.as_mut().unwrap().actor_id="cashier".into();
 assert!(matches!(s.takeover_restaurant("order",c.revision,"cashier"),Err(StoreError::Forbidden)));
 s.1.as_mut().unwrap().actor_id=owner.clone();let next=s.takeover_restaurant("order",c.revision,"cashier").unwrap();assert_eq!(next.parent_id,"original");
 assert!(matches!(s.restaurant_recover("order","original"),Err(StoreError::Forbidden)));
 assert!(s.takeover_restaurant("order",c.revision,&owner).is_err());
 s.1.as_mut().unwrap().actor_id="cashier".into();assert!(s.restaurant_recover("order","original").is_err());assert_eq!(s.restaurant_status("order").unwrap().unwrap().phase,"refused");
}
#[test]
fn database_failure_keeps_unknown_until_the_same_attempt_is_recovered(){
 let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("s.db"));s.restaurant_recover("order","original").unwrap_err();let c=s.restaurant_status("order").unwrap().unwrap();s.amend_restaurant(correction(c.revision)).unwrap();
 s.0.execute_batch("CREATE TRIGGER recovery_fault BEFORE INSERT ON local_billing_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
 assert!(s.restaurant_recover("order","corrected").is_err());let c=s.restaurant_status("order").unwrap().unwrap();assert_eq!(c.phase,"unknown");assert!(s.amend_restaurant(correction(c.revision)).is_err());
 assert_eq!(s.0.query_row("SELECT COUNT(*) FROM local_invoices",[],|q|q.get::<_,i64>(0)).unwrap(),0);
 s.0.execute_batch("DROP TRIGGER recovery_fault").unwrap();s.restaurant_recover("order","corrected").unwrap();assert_eq!(s.restaurant_status("order").unwrap().unwrap().phase,"settled");
}
#[test]
fn preparation_refusal_is_durable_and_can_correct_allocations(){
 let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("s.db"));
 // Use another unpaid order, refusing its allocation before a pending retail request exists.
 s.restaurant_action(Request{operation_id:"takeaway".into(),action:Action::OpenOrder{id:"order2".into(),table_id:None}}).unwrap();
 s.restaurant_action(Request{operation_id:"kot2-op".into(),action:Action::SendTicket{id:"kot2".into(),order_id:"order2".into(),expected_revision:1,items:vec![Item{name:"Pizza".into(),quantity:1,note:String::new(),product_id:Some("pizza".into()),unit_price_paise:None}]}}).unwrap();
 assert!(s.prepare_restaurant(Prepare{order_id:"order2".into(),expected_revision:2,operation_id:"bad-allocation".into(),tax_basis_points:0,customer_id:None,payments:vec![part(1)]}).is_err());
 let c=s.restaurant_status("order2").unwrap().unwrap();assert_eq!(c.phase,"refused");assert_eq!(c.parent_id,"bad-allocation");assert!(s.restaurant_recover("order2","bad-allocation").is_err());
}
#[test]
fn paid_tickets_finish_without_reopening_checkout_or_occupying_the_table(){
 let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("paid-kitchen.db"));
 s.restaurant_recover("order","original").unwrap_err();let c=s.restaurant_status("order").unwrap().unwrap();s.amend_restaurant(correction(c.revision)).unwrap();s.restaurant_recover("order","corrected").unwrap();
 assert_eq!(s.paid_kitchen().unwrap().as_array().unwrap().len(),1);
 s.restaurant_action(Request{operation_id:"new-guests-op".into(),action:Action::OpenOrder{id:"new-guests".into(),table_id:Some("table".into())}}).unwrap();
 let before=s.0.query_row("SELECT revision FROM local_restaurant_orders WHERE id='order'",[],|q|q.get::<_,i64>(0)).unwrap();
 for (n,state) in ["preparing","ready","served"].iter().enumerate(){let r=Request{operation_id:format!("paid-kitchen-{n}"),action:Action::SetTicketState{id:"kot".into(),expected_revision:n as i64+1,state:(*state).into()}};s.restaurant_action(r.clone()).unwrap();s.restaurant_action(r).unwrap();}
 assert!(s.paid_kitchen().unwrap().as_array().unwrap().is_empty());
 assert_eq!(s.0.query_row("SELECT revision FROM local_restaurant_orders WHERE id='order'",[],|q|q.get::<_,i64>(0)).unwrap(),before);
 assert_eq!(s.0.query_row("SELECT count(*) FROM local_invoices",[],|q|q.get::<_,i64>(0)).unwrap(),1);
 assert_eq!(s.0.query_row("SELECT stock_milli FROM local_products WHERE id='pizza'",[],|q|q.get::<_,i64>(0)).unwrap(),0);
 assert_eq!(s.0.query_row("SELECT id FROM local_restaurant_orders WHERE table_id='table' AND settled_invoice IS NULL",[],|q|q.get::<_,String>(0)).unwrap(),"new-guests");
 assert!(s.amend_restaurant(correction(1)).is_err());
}
