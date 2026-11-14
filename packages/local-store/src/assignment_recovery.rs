//! Durable operational requests/results only. No financial tables are written.
use crate::{
    identity::{self, Permission},
    kitchen::Action,
    Store, StoreError,
};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub hub_id: String,
    pub business_id: String,
    pub actor_id: String,
    pub operation_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ticket_id: Option<String>,
    pub expected_revision: i64,
    pub target_actor_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub responsibility: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_handle: Option<String>,
}
pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("assignment_recovery-schema.sql"))?;
    Ok(())
}
impl Store {
    fn assignment_scope(&self, r: &Request) -> Result<(), StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, s, Permission::KitchenView)?;
        if r.version != 1
            || r.expected_revision < 1
            || ![&r.operation_id, &r.target_actor_id]
                .iter()
                .all(|v| crate::billing::valid_id(v))
            || r.ticket_id
                .as_ref()
                .is_some_and(|v| !crate::billing::valid_id(v))
            || (u8::from(r.ticket_id.is_some())
                + u8::from(r.responsibility.is_some())
                + u8::from(r.session_handle.is_some()))
                != 1
            || r.session_handle
                .as_ref()
                .is_some_and(|h| h.len() != 32 || !h.bytes().all(|v| v.is_ascii_hexdigit()))
            || r.responsibility.as_ref().is_some_and(|m| {
                !matches!(m.as_str(), "none" | "preparer" | "supervisor" | "revoked")
            })
        {
            return Err(StoreError::InvalidDraft);
        }
        if r.actor_id != s.actor_id
            || r.business_id != s.scope.business_id
            || self.hub_identity()?["hubId"] != r.hub_id
        {
            return Err(StoreError::WorkspaceMismatch);
        }
        Ok(())
    }
    pub(crate) fn assignment_prepare(
        &mut self,
        id: String,
        ticket: String,
        revision: i64,
        target: String,
    ) -> Result<Value, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        let r = Request {
            version: 1,
            hub_id: self.hub_identity()?["hubId"]
                .as_str()
                .ok_or(StoreError::InvalidIdentity)?
                .into(),
            business_id: s.scope.business_id.clone(),
            actor_id: s.actor_id.clone(),
            operation_id: id,
            ticket_id: Some(ticket),
            expected_revision: revision,
            target_actor_id: target,
            responsibility: None,
            session_handle: None,
        };
        self.operation_prepare(r)
    }
    pub(crate) fn responsibility_prepare(
        &mut self,
        id: String,
        target: String,
        revision: i64,
        mode: String,
    ) -> Result<Value, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        let r = Request {
            version: 1,
            hub_id: self.hub_identity()?["hubId"]
                .as_str()
                .ok_or(StoreError::InvalidIdentity)?
                .into(),
            business_id: s.scope.business_id.clone(),
            actor_id: s.actor_id.clone(),
            operation_id: id,
            ticket_id: None,
            expected_revision: revision,
            target_actor_id: target,
            responsibility: Some(mode),
            session_handle: None,
        };
        self.operation_prepare(r)
    }
    pub(crate) fn session_signout_prepare(
        &mut self,
        id: String,
        target: String,
        revision: i64,
        handle: String,
    ) -> Result<Value, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        let r = Request {
            version: 1,
            hub_id: self.hub_identity()?["hubId"]
                .as_str()
                .ok_or(StoreError::InvalidIdentity)?
                .into(),
            business_id: s.scope.business_id.clone(),
            actor_id: s.actor_id.clone(),
            operation_id: id,
            ticket_id: None,
            expected_revision: revision,
            target_actor_id: target,
            responsibility: None,
            session_handle: Some(handle),
        };
        self.operation_prepare(r)
    }
    fn operation_prepare(&mut self, r: Request) -> Result<Value, StoreError> {
        self.assignment_scope(&r)?;
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        let permission = if r.responsibility.is_some() || r.session_handle.is_some() {
            Permission::Staff
        } else {
            Permission::KitchenSupervise
        };
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::verify(&tx, s, permission)?;
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_kitchen_assignment_ops WHERE id=?1 AND NOT(actor_id=?2 AND generation=?3 AND device='desktop'))",params![r.operation_id,s.actor_id,s.generation],|q|q.get::<_,bool>(0))?{return Err(StoreError::OperationConflict);}
        let old:Option<String>=tx.query_row("SELECT request FROM local_kitchen_assignment_ops WHERE id=?1 AND actor_id=?2 AND generation=?3 AND device='desktop'",params![r.operation_id,s.actor_id,s.generation],|q|q.get(0)).optional()?;
        if let Some(old) = old {
            if old != raw {
                return Err(StoreError::OperationConflict);
            }
        } else {
            if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_kitchen_staff_events WHERE id=?1) OR EXISTS(SELECT 1 FROM local_hub_operations WHERE id=?1) OR EXISTS(SELECT 1 FROM local_restaurant_events WHERE operation_id=?1)",[&r.operation_id],|q|q.get::<_,bool>(0))?{return Err(StoreError::OperationConflict);}
            if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_kitchen_assignment_ops WHERE actor_id=?1 AND generation=?2 AND device='desktop' AND acknowledged=0)",params![s.actor_id,s.generation],|q|q.get::<_,bool>(0))?{return Err(StoreError::Conflict);}
            tx.execute("INSERT INTO local_kitchen_assignment_ops(id,actor_id,generation,device,request,state) VALUES(?1,?2,?3,'desktop',?4,'prepared')",params![r.operation_id,s.actor_id,s.generation,raw])?;
        }
        tx.commit()?;
        self.assignment_pending()
    }
    pub(crate) fn assignment_pending(&self) -> Result<Value, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, s, Permission::KitchenView)?;
        let row:Option<(String,String,Option<String>)>=self.0.query_row("SELECT request,state,result FROM local_kitchen_assignment_ops WHERE actor_id=?1 AND generation=?2 AND device='desktop' AND acknowledged=0",params![s.actor_id,s.generation],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?))).optional()?;
        Ok(match row {
            Some((request, state, result)) => {
                json!({"request":serde_json::from_str::<Value>(&request)?,"state":state,"result":result.map(|v|serde_json::from_str::<Value>(&v)).transpose()?})
            }
            None => Value::Null,
        })
    }
    pub(crate) fn assignment_ack(&mut self, id: String) -> Result<Value, StoreError> {
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&tx, s, Permission::KitchenView)?;
        if tx.execute("UPDATE local_kitchen_assignment_ops SET acknowledged=1 WHERE id=?1 AND actor_id=?2 AND generation=?3 AND device='desktop' AND state IN('accepted','refused')",params![id,s.actor_id,s.generation])?!=1{return Err(StoreError::Conflict);}
        tx.commit()?;
        Ok(Value::Null)
    }
    pub(crate) fn assignment_resume(&mut self) -> Result<Value, StoreError> {
        let pending = self.assignment_pending()?;
        if pending.is_null() {
            return Err(StoreError::InvalidDraft);
        }
        let r: Request = serde_json::from_value(pending["request"].clone())?;
        self.assignment_execute("desktop", r, None)?;
        self.assignment_pending()
    }
    pub(crate) fn assignment_status(&self, device: &str, id: &str) -> Result<Value, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, s, Permission::KitchenView)?;
        let row:Option<String>=self.0.query_row("SELECT result FROM local_kitchen_assignment_ops WHERE id=?1 AND actor_id=?2 AND generation=?3 AND device=?4 AND state IN('accepted','refused')",params![id,s.actor_id,s.generation,device],|q|q.get(0)).optional()?;
        Ok(row
            .map(|v| serde_json::from_str(&v))
            .transpose()?
            .unwrap_or(json!({"status":"not_found"})))
    }
    pub(crate) fn assignment_execute(
        &mut self,
        device: &str,
        r: Request,
        token: Option<&str>,
    ) -> Result<Value, StoreError> {
        self.assignment_scope(&r)?;
        let permission = if r.responsibility.is_some() || r.session_handle.is_some() {
            Permission::Staff
        } else {
            Permission::KitchenSupervise
        };
        let slot = if token.is_some() {
            format!("lan:{device}")
        } else {
            "desktop".into()
        };
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&tx, s, permission)?;
        if let Some(token) = token {
            if !tx.query_row("SELECT EXISTS(SELECT 1 FROM local_hub_sessions h JOIN local_hub_devices d ON d.id=h.device_id WHERE h.token_hash=?1 AND h.device_id=?2 AND h.actor_id=?3 AND h.actor_revision=?4 AND h.expires>strftime('%s','now') AND d.expires>strftime('%s','now') AND d.state='approved' AND d.actor_id=h.actor_id AND d.revision=h.device_revision AND d.generation=h.generation AND h.generation=?5)",params![crate::hub::hash(token),device,s.actor_id,s.revision,s.generation],|q|q.get::<_,bool>(0))?{return Err(StoreError::Forbidden);}
        }
        let old:Option<(String,String,String,String,Option<String>)>=tx.query_row("SELECT actor_id,generation,device,request,result FROM local_kitchen_assignment_ops WHERE id=?1",[&r.operation_id],|q|Ok((q.get(0)?,q.get(1)?,q.get(2)?,q.get(3)?,q.get(4)?))).optional()?;
        if let Some((actor, generation, prior_device, request, result)) = old {
            if actor != s.actor_id
                || generation != s.generation
                || prior_device != slot
                || request != raw
            {
                return Err(StoreError::OperationConflict);
            }
            if let Some(result) = result {
                return Ok(serde_json::from_str(&result)?);
            }
        } else {
            tx.execute("INSERT INTO local_kitchen_assignment_ops(id,actor_id,generation,device,request,state) VALUES(?1,?2,?3,?4,?5,'unknown')",params![r.operation_id,s.actor_id,s.generation,slot,raw])?;
        }
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_hub_operations WHERE id=?1) OR EXISTS(SELECT 1 FROM local_restaurant_events WHERE operation_id=?1)",[&r.operation_id],|q|q.get::<_,bool>(0))?{return Err(StoreError::OperationConflict);}
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_kitchen_staff_events WHERE id=?1)",
            [&r.operation_id],
            |q| q.get::<_, bool>(0),
        )? {
            return Err(StoreError::OperationConflict);
        }
        tx.execute_batch("SAVEPOINT assign_ticket")?;
        let mutation = if let Some(handle) = &r.session_handle {
            crate::session_signout::end_session(
                &tx,
                &self.1,
                &r.target_actor_id,
                r.expected_revision,
                handle,
            )
        } else if let Some(mode) = &r.responsibility {
            crate::kitchen_staff::change_responsibility(
                &tx,
                &self.1,
                &r.target_actor_id,
                r.expected_revision,
                mode,
            )
        } else {
            crate::kitchen_staff::assign_ticket(
                &tx,
                &self.1,
                r.ticket_id.as_deref().ok_or(StoreError::InvalidDraft)?,
                r.expected_revision,
                &r.target_actor_id,
            )
        };
        let kind = if r.session_handle.is_some() {
            "staff_session_signout"
        } else if r.responsibility.is_some() {
            "staff_responsibility"
        } else {
            "kitchen_assignment"
        };
        let result = match mutation {
            Ok(value) => {
                if r.session_handle.is_some() {
                    json!({"status":"accepted","kind":kind,"operationId":r.operation_id,"targetActorId":r.target_actor_id,"sessionHandle":r.session_handle,"revision":value["revision"],"outcome":value["outcome"]})
                } else {
                    let a = if let Some(mode) = &r.responsibility {
                        Action::Staff {
                            operation_id: r.operation_id.clone(),
                            actor_id: r.target_actor_id.clone(),
                            expected_revision: r.expected_revision,
                            mode: mode.clone(),
                        }
                    } else {
                        Action::AssignTicket {
                            operation_id: r.operation_id.clone(),
                            ticket_id: r.ticket_id.clone().ok_or(StoreError::InvalidDraft)?,
                            expected_revision: r.expected_revision,
                            actor_id: r.target_actor_id.clone(),
                        }
                    };
                    tx.execute("INSERT INTO local_kitchen_staff_events(id,actor_id,ticket_id,request,result) VALUES(?1,?2,?3,?4,?5)",params![r.operation_id,s.actor_id,r.ticket_id,serde_json::to_string(&a)?,value.to_string()])?;
                    if r.responsibility.is_some() {
                        json!({"status":"accepted","kind":kind,"operationId":r.operation_id,"targetActorId":r.target_actor_id,"revision":value["revision"],"responsibility":value["mode"]})
                    } else {
                        json!({"status":"accepted","kind":kind,"operationId":r.operation_id,"ticketId":r.ticket_id,"revision":value["revision"],"actorId":value["actorId"]})
                    }
                }
            }
            Err(e) => {
                tx.execute_batch("ROLLBACK TO assign_ticket")?;
                let reason = match e {
                    StoreError::Conflict => "revision_conflict",
                    StoreError::Forbidden => "change_not_permitted",
                    StoreError::WorkspaceMismatch => "wrong_shop",
                    StoreError::InvalidIdentity | StoreError::InvalidDraft => "invalid_request",
                    _ => return Err(e),
                };
                if r.session_handle.is_some() {
                    let revision: Option<i64> = tx
                        .query_row(
                            "SELECT revision FROM local_principals WHERE id=?1 AND business_id=?2",
                            params![r.target_actor_id, s.scope.business_id],
                            |q| q.get(0),
                        )
                        .optional()?;
                    json!({"status":"refused","kind":kind,"operationId":r.operation_id,"targetActorId":r.target_actor_id,"sessionHandle":r.session_handle,"reason":reason,"revision":revision})
                } else if r.responsibility.is_some() {
                    let revision: Option<i64> = tx
                        .query_row(
                            "SELECT revision FROM local_principals WHERE id=?1 AND business_id=?2",
                            params![r.target_actor_id, s.scope.business_id],
                            |q| q.get(0),
                        )
                        .optional()?;
                    let mode:Option<String>=tx.query_row("SELECT k.mode FROM local_kitchen_staff k JOIN local_principals p ON p.id=k.actor_id WHERE k.actor_id=?1 AND p.business_id=?2",params![r.target_actor_id,s.scope.business_id],|q|q.get(0)).optional()?;
                    json!({"status":"refused","kind":kind,"operationId":r.operation_id,"targetActorId":r.target_actor_id,"reason":reason,"revision":revision,"responsibility":mode.unwrap_or("none".into())})
                } else {
                    let revision: Option<i64> = tx
                        .query_row(
                            "SELECT revision FROM local_restaurant_tickets WHERE id=?1",
                            [&r.ticket_id],
                            |q| q.get(0),
                        )
                        .optional()?;
                    let actor: Option<String> = tx
                        .query_row(
                            "SELECT actor_id FROM local_kitchen_ticket_staff WHERE ticket_id=?1",
                            [&r.ticket_id],
                            |q| q.get(0),
                        )
                        .optional()?;
                    json!({"status":"refused","kind":kind,"operationId":r.operation_id,"ticketId":r.ticket_id,"reason":reason,"revision":revision,"actorId":actor})
                }
            }
        };
        tx.execute_batch("RELEASE assign_ticket")?;
        tx.execute(
            "UPDATE local_kitchen_assignment_ops SET state=?1,result=?2 WHERE id=?3",
            params![
                result["status"].as_str().ok_or(StoreError::InvalidDraft)?,
                result.to_string(),
                r.operation_id
            ],
        )?;
        identity::guard(
            &tx,
            &self.1,
            permission,
            if r.session_handle.is_some() {
                "staff.session_signout"
            } else {
                "kitchen.assignment_result"
            },
            Some(&r.operation_id),
        )?;
        if token.is_some() {
            tx.execute(
                "UPDATE local_hub_devices SET last_seen=strftime('%s','now') WHERE id=?1",
                [device],
            )?;
        }
        tx.commit()?;
        Ok(result)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::access::Workspace;
    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const PASSWORD: &str = "Synthetic assignment recovery password";
    fn ticket(w: &Workspace) {
        w.store_for_test().0.execute("INSERT INTO local_restaurant_orders(id,kind,state,revision) VALUES('order','takeaway','open',1)",[]).unwrap();
        w.store_for_test()
            .0
            .execute(
                "INSERT INTO local_restaurant_tickets VALUES('kot','order','[]','pending',1)",
                [],
            )
            .unwrap();
    }
    #[test]
    fn desktop_prepared_assignment_survives_reopen_and_replays_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("assignment.db");
        let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
        w.setup(PASSWORD).unwrap();
        ticket(&w);
        let actor = w.local_session().unwrap().principal.id;
        w.kitchen_action(Action::PrepareAssignment {
            operation_id: "op".into(),
            ticket_id: "kot".into(),
            expected_revision: 1,
            actor_id: actor,
        })
        .unwrap();
        drop(w);
        let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
        w.login("owner", PASSWORD).unwrap();
        assert_eq!(
            w.kitchen_action(Action::PendingAssignment).unwrap()["state"],
            "prepared"
        );
        let result = w.kitchen_action(Action::ResumeAssignment).unwrap();
        assert_eq!(result["state"], "accepted");
        assert_eq!(w.kitchen_action(Action::ResumeAssignment).unwrap(), result);
        assert_eq!(
            w.store_for_test()
                .0
                .query_row(
                    "SELECT revision FROM local_restaurant_tickets WHERE id='kot'",
                    [],
                    |q| q.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );
        assert_eq!(
            w.store_for_test()
                .0
                .query_row("SELECT count(*) FROM local_kitchen_staff_events", [], |q| q
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        w.kitchen_action(Action::AcknowledgeAssignment {
            operation_id: "op".into(),
        })
        .unwrap();
        assert!(w
            .kitchen_action(Action::PendingAssignment)
            .unwrap()
            .is_null());
    }
    #[test]
    fn stale_assignment_is_durable_refusal_without_financial_writes() {
        let mut w = Workspace::new(Store::open(std::path::Path::new(":memory:"), KEY).unwrap());
        w.setup(PASSWORD).unwrap();
        ticket(&w);
        let actor = w.local_session().unwrap().principal.id;
        w.kitchen_action(Action::PrepareAssignment {
            operation_id: "op".into(),
            ticket_id: "kot".into(),
            expected_revision: 9,
            actor_id: actor,
        })
        .unwrap();
        let result = w.kitchen_action(Action::ResumeAssignment).unwrap();
        assert_eq!(result["result"]["reason"], "revision_conflict");
        assert_eq!(w.kitchen_action(Action::ResumeAssignment).unwrap(), result);
        for table in [
            "local_invoices",
            "local_billing_ledger",
            "local_credit_entries",
            "local_inventory_events",
        ] {
            assert_eq!(
                w.store_for_test()
                    .0
                    .query_row(&format!("SELECT count(*) FROM {table}"), [], |q| q
                        .get::<_, i64>(0))
                    .unwrap(),
                0
            );
        }
    }
}
#[cfg(test)]
mod responsibility_tests {
    use super::*;
    use crate::{
        access::Workspace,
        identity::{Role, StaffDetails},
    };
    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const PASSWORD: &str = "Synthetic staff responsibility password";
    #[test]
    fn responsibility_survives_reopen_invalidates_old_authority_and_replays_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("staff.db");
        let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
        w.setup(PASSWORD).unwrap();
        let cook = w
            .create_staff(
                StaffDetails {
                    username: "cook".into(),
                    display_name: "Cook".into(),
                    role: Role::Cashier,
                },
                PASSWORD,
            )
            .unwrap();
        w.login("cook", PASSWORD).unwrap();
        let old_session = w.store_for_test().1.clone().unwrap();
        w.login("owner", PASSWORD).unwrap();
        w.kitchen_action(Action::PrepareResponsibility {
            operation_id: "change".into(),
            actor_id: cook.id.clone(),
            expected_revision: 1,
            mode: "supervisor".into(),
        })
        .unwrap();
        drop(w);
        let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
        w.login("owner", PASSWORD).unwrap();
        let receipt = w.kitchen_action(Action::ResumeAssignment).unwrap();
        assert_eq!(receipt["result"]["kind"], "staff_responsibility");
        assert_eq!(receipt["result"]["revision"], 2);
        assert!(identity::verify(&w.store_for_test().0, &old_session, Permission::View).is_err());
        assert_eq!(w.kitchen_action(Action::ResumeAssignment).unwrap(), receipt);
        assert_eq!(
            w.store_for_test()
                .0
                .query_row(
                    "SELECT revision FROM local_principals WHERE id=?1",
                    [&cook.id],
                    |q| q.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );
        w.kitchen_action(Action::AcknowledgeAssignment {
            operation_id: "change".into(),
        })
        .unwrap();
        w.kitchen_action(Action::PrepareResponsibility {
            operation_id: "revoke".into(),
            actor_id: cook.id.clone(),
            expected_revision: 2,
            mode: "revoked".into(),
        })
        .unwrap();
        assert_eq!(
            w.kitchen_action(Action::ResumeAssignment).unwrap()["result"]["status"],
            "accepted"
        );
        w.lock();
        w.login("cook", PASSWORD).unwrap();
        let store = w.store_for_test();
        let session = store.1.as_ref().unwrap();
        for p in [
            Permission::Sell,
            Permission::KitchenPrepare,
            Permission::KitchenSupervise,
            Permission::KitchenView,
            Permission::Staff,
        ] {
            assert!(identity::verify(&store.0, session, p).is_err());
        }
    }
    #[test]
    fn non_admin_and_self_escalation_are_refused() {
        let mut w = Workspace::new(Store::open(std::path::Path::new(":memory:"), KEY).unwrap());
        w.setup(PASSWORD).unwrap();
        let owner = w.local_session().unwrap().principal;
        w.kitchen_action(Action::PrepareResponsibility {
            operation_id: "self".into(),
            actor_id: owner.id,
            expected_revision: 1,
            mode: "supervisor".into(),
        })
        .unwrap();
        assert_eq!(
            w.kitchen_action(Action::ResumeAssignment).unwrap()["result"]["status"],
            "refused"
        );
        w.kitchen_action(Action::AcknowledgeAssignment {
            operation_id: "self".into(),
        })
        .unwrap();
        let cook = w
            .create_staff(
                StaffDetails {
                    username: "cook".into(),
                    display_name: "Cook".into(),
                    role: Role::Cashier,
                },
                PASSWORD,
            )
            .unwrap();
        w.kitchen_action(Action::Staff {
            operation_id: "grant".into(),
            actor_id: cook.id.clone(),
            expected_revision: 1,
            mode: "supervisor".into(),
        })
        .unwrap();
        w.lock();
        w.login("cook", PASSWORD).unwrap();
        assert!(w
            .kitchen_action(Action::PrepareResponsibility {
                operation_id: "escalate".into(),
                actor_id: cook.id,
                expected_revision: 2,
                mode: "none".into()
            })
            .is_err());
    }
    #[test]
    fn legacy_v20_assignment_request_canonical_payload_is_unchanged() {
        let raw="{\"version\":1,\"hubId\":\"hub\",\"businessId\":\"shop\",\"actorId\":\"owner\",\"operationId\":\"op\",\"ticketId\":\"kot\",\"expectedRevision\":1,\"targetActorId\":\"cook\"}";
        let r: Request = serde_json::from_str(raw).unwrap();
        assert!(r.responsibility.is_none());
        assert_eq!(serde_json::to_string(&r).unwrap(), raw);
    }
}
