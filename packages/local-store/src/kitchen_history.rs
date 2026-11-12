//! Bounded history from existing immutable operational events; never synthesises events.
use crate::{identity::{self,Permission},Store,StoreError};
use rusqlite::params;
use serde::{Deserialize,Serialize};use serde_json::{Value,json};
#[derive(Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Query{pub search:String,pub state:String,pub start_date:String,pub end_date:String,pub cursor:Option<String>,pub limit:i64}
impl Store{
 pub(crate) fn kitchen_history(&self,r:Query)->Result<Value,StoreError>{
 identity::verify(&self.0,self.1.as_ref().ok_or(StoreError::Locked)?,Permission::KitchenView)?;
 if r.search.chars().count()>120||r.search.chars().any(char::is_control)||!(1..=50).contains(&r.limit)||!matches!(r.state.as_str(),"all"|"pending"|"preparing"|"ready"|"served"){return Err(StoreError::InvalidDraft);}
 for date in [&r.start_date,&r.end_date]{if !date.is_empty(){if date.len()!=10||!date.bytes().enumerate().all(|(i,c)|if i==4||i==7{c==b'-'}else{c.is_ascii_digit()})||!self.0.query_row("SELECT COALESCE(date(?1,'+0 days')=?1,0)",[date],|q|q.get::<_,bool>(0))?{return Err(StoreError::InvalidDraft);}}}
 if !r.start_date.is_empty()&&!r.end_date.is_empty()&&r.start_date>r.end_date{return Err(StoreError::InvalidDraft);}
 let (before,id)=if let Some(cursor)=r.cursor{if cursor.len()>512{return Err(StoreError::InvalidDraft);}let pair:(String,String)=serde_json::from_str(&cursor).map_err(|_|StoreError::InvalidDraft)?;if pair.0.len()>40||pair.1.len()>160{return Err(StoreError::InvalidDraft);}pair}else{(String::new(),String::new())};
 let mut rows=self.0.prepare(include_str!("kitchen_history.sql"))?.query_map(params![r.search,r.state,r.start_date,r.end_date,before,id,r.limit+1],|q|Ok(json!({"id":q.get::<_,String>(0)?,"actorId":q.get::<_,String>(1)?,"staffName":q.get::<_,String>(2)?,"ticketId":q.get::<_,String>(3)?,"orderId":q.get::<_,String>(4)?,"state":q.get::<_,Option<String>>(5)?,"createdAt":q.get::<_,String>(6)?,"kind":q.get::<_,String>(7)?,"tableName":q.get::<_,Option<String>>(8)?,"orderKind":q.get::<_,String>(9)?,"currentlyPaid":q.get::<_,bool>(10)?,"detail":serde_json::from_str::<Value>(&q.get::<_,String>(11)?).unwrap_or(Value::Null)})))?.collect::<Result<Vec<_>,_>>()?;
 let more=rows.len()>r.limit as usize;rows.truncate(r.limit as usize);let cursor=if more{rows.last().map(|v|serde_json::to_string(&(v["createdAt"].as_str().unwrap_or(""),v["id"].as_str().unwrap_or("")))).transpose()?}else{None};Ok(json!({"events":rows,"nextCursor":cursor}))
 }
}
