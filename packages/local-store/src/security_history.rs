//! Bounded administrative projection of existing immutable security audit records.
use crate::{Store, StoreError, identity::{self, Permission}};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[derive(Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Query { pub action: String, pub actor_id: String, pub search: String, pub start_date: String, pub end_date: String, pub cursor: Option<i64>, pub limit: i64 }
impl Store {
 pub(crate) fn security_history(&self, r: Query) -> Result<Value, StoreError> {
  let tx=self.0.unchecked_transaction()?;
  let s=self.1.as_ref().ok_or(StoreError::Locked)?;
  identity::verify(&tx,s,Permission::Staff)?;
  if !(1..=50).contains(&r.limit) || !matches!(r.action.as_str(),""|"staff.session_signout"|"hub.device_approved"|"hub.device_revoked") || (!r.actor_id.is_empty()&&!crate::billing::valid_id(&r.actor_id)) || r.search.chars().count()>120 || r.cursor.is_some_and(|v|v<1||v>9_007_199_254_740_991) { return Err(StoreError::InvalidDraft); }
  crate::kitchen_history::validate_dates(&tx,&r.start_date,&r.end_date)?;
  let mut events=tx.prepare(include_str!("security_history.sql"))?.query_map(params![s.scope.business_id,s.scope.workspace_id,r.action,r.actor_id,r.start_date,r.end_date,r.cursor,r.search.trim(),r.limit+1],|q|Ok(json!({
   "sequence":q.get::<_,i64>(0)?,"actorId":q.get::<_,Option<String>>(1)?,"actorName":q.get::<_,Option<String>>(2)?,"actorRole":q.get::<_,Option<String>>(3)?,"action":q.get::<_,String>(4)?,"targetId":q.get::<_,String>(5)?,"targetKind":q.get::<_,String>(6)?,"targetName":q.get::<_,Option<String>>(7)?,"operationId":q.get::<_,Option<String>>(8)?,"outcome":q.get::<_,Option<String>>(9)?,"createdAt":q.get::<_,String>(10)?
  })))?.collect::<Result<Vec<_>,_>>()?;
  let more=events.len()>r.limit as usize; events.truncate(r.limit as usize);
  let cursor=if more {events.last().and_then(|e|e["sequence"].as_i64())} else {None};
  let generated:String=tx.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",[],|q|q.get(0))?;
  let result=json!({"businessId":s.scope.business_id,"generatedAt":generated,"events":events,"nextCursor":cursor});
  tx.commit()?; Ok(result)
 }
}
#[cfg(test)]mod tests {
 use super::*; use crate::{access::Workspace,kitchen::Action,identity::{Role,StaffDetails}};
 const KEY:&str="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
 const PASSWORD:&str="Synthetic security history password";
 fn query()->Query {Query{action:String::new(),actor_id:String::new(),search:String::new(),start_date:String::new(),end_date:String::new(),cursor:None,limit:25}}
 #[test]fn security_reports_require_native_staff_permission(){let mut w=Workspace::new(Store::open(std::path::Path::new(":memory:"),KEY).unwrap());w.setup(PASSWORD).unwrap();let v=w.kitchen_action(Action::SecurityHistory{query:query()}).unwrap();assert!(v["events"].as_array().unwrap().is_empty());w.create_staff(StaffDetails{username:"cook".into(),display_name:"Cook".into(),role:Role::Cashier},PASSWORD).unwrap();w.lock();w.login("cook",PASSWORD).unwrap();assert!(w.kitchen_action(Action::SecurityHistory{query:query()}).is_err());}
 #[test]fn unsupported_actions_and_unbounded_queries_are_refused(){let mut w=Workspace::new(Store::open(std::path::Path::new(":memory:"),KEY).unwrap());w.setup(PASSWORD).unwrap();let mut r=query();r.action="invoice.posted".into();assert!(w.kitchen_action(Action::SecurityHistory{query:r}).is_err());let mut r=query();r.limit=51;assert!(w.kitchen_action(Action::SecurityHistory{query:r}).is_err());let mut r=query();r.cursor=Some(0);assert!(w.kitchen_action(Action::SecurityHistory{query:r}).is_err());}
}
