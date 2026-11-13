//! Kitchen authority is independent of checkout ownership. No financial writes.
use crate::{
    identity::{self, Permission, Role, Session},
    Store, StoreError,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::{json, Value};
pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("kitchen_staff-schema.sql"))?;
    Ok(())
}
pub(crate) fn allows(
    db: &Connection,
    p: &identity::Principal,
    permission: Permission,
) -> Result<bool, StoreError> {
    let mode: Option<String> = db
        .query_row(
            "SELECT mode FROM local_kitchen_staff WHERE actor_id=?1",
            [&p.id],
            |q| q.get(0),
        )
        .optional()?;
    let kitchen_only = p.role == Role::Cashier && mode.is_some();
    Ok(match permission {
        Permission::KitchenView | Permission::KitchenPrepare => {
            mode.as_deref() != Some("revoked")
                && (mode.is_some() || p.role.allows(Permission::Sell))
        }
        Permission::KitchenSupervise => {
            mode.as_deref() != Some("revoked")
                && (mode.as_deref() == Some("supervisor")
                    || matches!(p.role, Role::Owner | Role::Manager))
        }
        Permission::View => true,
        _ => !kitchen_only && p.role.allows(permission),
    })
}
pub(crate) fn authorize_ticket(
    db: &Connection,
    session: &Option<Session>,
    ticket: &str,
    order: &str,
) -> Result<(), StoreError> {
    let s = session.as_ref().ok_or(StoreError::Locked)?;
    identity::verify(db, s, Permission::KitchenPrepare)?;
    if identity::verify(db, s, Permission::KitchenSupervise).is_ok() {
        return Ok(());
    }
    let assigned: Option<String> = db
        .query_row(
            "SELECT actor_id FROM local_kitchen_ticket_staff WHERE ticket_id=?1",
            [ticket],
            |q| q.get(0),
        )
        .optional()?;
    match assigned {
        Some(actor) if actor == s.actor_id => Ok(()),
        Some(_) => Err(StoreError::Forbidden),
        None => {
            identity::verify(db, s, Permission::Sell)?;
            crate::kitchen::authorize_order(db, session, order)
        }
    }
}
pub(crate) fn assign_ticket(
    tx: &Transaction<'_>,
    session: &Option<Session>,
    ticket_id: &str,
    expected_revision: i64,
    actor_id: &str,
) -> Result<Value, StoreError> {
    let next_revision = expected_revision
        .checked_add(1)
        .ok_or(StoreError::Conflict)?;
    let s = session.as_ref().ok_or(StoreError::Locked)?;
    identity::verify(tx, s, Permission::KitchenSupervise)?;
    if !tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_principals WHERE id=?1 AND business_id=?2)",
        params![actor_id, s.scope.business_id],
        |q| q.get::<_, bool>(0),
    )? {
        return Err(StoreError::WorkspaceMismatch);
    }
    let target = identity::principal(tx, actor_id)?;
    if !target.enabled || !allows(tx, &target, Permission::KitchenPrepare)? {
        return Err(StoreError::Forbidden);
    }
    if tx.execute("UPDATE local_restaurant_tickets SET revision=revision+1 WHERE id=?1 AND revision=?2 AND state IN('pending','preparing','ready') AND EXISTS(SELECT 1 FROM local_restaurant_orders WHERE id=local_restaurant_tickets.order_id AND state IN('open','pending_bill'))",params![ticket_id,expected_revision])?!=1{return Err(StoreError::Conflict);}
    let previous: Option<String> = tx
        .query_row(
            "SELECT actor_id FROM local_kitchen_ticket_staff WHERE ticket_id=?1",
            [ticket_id],
            |q| q.get(0),
        )
        .optional()?;
    tx.execute("INSERT INTO local_kitchen_ticket_staff VALUES(?1,?2) ON CONFLICT(ticket_id) DO UPDATE SET actor_id=excluded.actor_id",params![ticket_id,actor_id])?;
    Ok(
        json!({"ticketId":ticket_id,"actorId":actor_id,"previousActorId":previous,"revision":next_revision}),
    )
}
pub(crate) fn change_responsibility(
    tx: &Transaction<'_>,
    session: &Option<Session>,
    actor_id: &str,
    expected_revision: i64,
    mode: &str,
) -> Result<Value, StoreError> {
    let s = session.as_ref().ok_or(StoreError::Locked)?;
    identity::verify(tx, s, Permission::Staff)?;
    let next_revision = expected_revision
        .checked_add(1)
        .ok_or(StoreError::Conflict)?;
    if actor_id == s.actor_id || !matches!(mode, "none" | "preparer" | "supervisor" | "revoked") {
        return Err(StoreError::Forbidden);
    }
    if !tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_principals WHERE id=?1 AND business_id=?2)",
        params![actor_id, s.scope.business_id],
        |q| q.get::<_, bool>(0),
    )? {
        return Err(StoreError::WorkspaceMismatch);
    }
    let p = identity::principal(tx, actor_id)?;
    if !p.enabled || p.role == Role::Owner {
        return Err(StoreError::Forbidden);
    }
    if tx.execute("UPDATE local_principals SET revision=revision+1 WHERE id=?1 AND revision=?2 AND business_id=?3 AND enabled=1",params![actor_id,expected_revision,s.scope.business_id])?!=1{return Err(StoreError::Conflict);}
    if mode == "none" {
        tx.execute(
            "DELETE FROM local_kitchen_staff WHERE actor_id=?1",
            [actor_id],
        )?;
    } else {
        tx.execute("INSERT INTO local_kitchen_staff VALUES(?1,?2) ON CONFLICT(actor_id) DO UPDATE SET mode=excluded.mode",params![actor_id,mode])?;
    }
    tx.execute(
        "DELETE FROM local_hub_sessions WHERE actor_id=?1",
        [actor_id],
    )?;
    Ok(json!({"employeeId":actor_id,"mode":mode,"revision":next_revision}))
}
impl Store {
    pub(crate) fn kitchen_staff_view(&self) -> Result<Value, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, s, Permission::KitchenView)?;
        let mut employees=self.0.prepare("SELECT p.id,p.display_name,p.role,p.enabled,p.revision,k.mode FROM local_principals p LEFT JOIN local_kitchen_staff k ON k.actor_id=p.id WHERE p.business_id=?1 ORDER BY p.display_name LIMIT 100")?.query_map([&s.scope.business_id],|q|Ok(json!({"id":q.get::<_,String>(0)?,"name":q.get::<_,String>(1)?,"role":q.get::<_,String>(2)?,"enabled":q.get::<_,bool>(3)?,"revision":q.get::<_,i64>(4)?,"mode":q.get::<_,Option<String>>(5)?})))?.collect::<Result<Vec<_>,_>>()?;
        for employee in &mut employees {
            let p = identity::principal(
                &self.0,
                employee["id"].as_str().ok_or(StoreError::InvalidIdentity)?,
            )?;
            employee["capabilities"] = json!({"canPrepare":allows(&self.0,&p,Permission::KitchenPrepare)?,"canSupervise":allows(&self.0,&p,Permission::KitchenSupervise)?,"canSell":allows(&self.0,&p,Permission::Sell)?});
        }
        let assignments=self.0.prepare("SELECT a.ticket_id,a.actor_id FROM local_kitchen_ticket_staff a JOIN local_restaurant_tickets t ON t.id=a.ticket_id JOIN local_restaurant_orders o ON o.id=t.order_id WHERE t.state<>'served' AND o.state IN('open','pending_bill') ORDER BY t.rowid LIMIT 3000")?.query_map([],|q|Ok(json!({"ticketId":q.get::<_,String>(0)?,"actorId":q.get::<_,String>(1)?})))?.collect::<Result<Vec<_>,_>>()?;
        let history=self.0.prepare("SELECT id,actor_id,ticket_id,result,created_at FROM local_kitchen_staff_events ORDER BY sequence DESC LIMIT 100")?.query_map([],|q|Ok(json!({"id":q.get::<_,String>(0)?,"actorId":q.get::<_,String>(1)?,"ticketId":q.get::<_,Option<String>>(2)?,"result":serde_json::from_str::<Value>(&q.get::<_,String>(3)?).unwrap_or(Value::Null),"createdAt":q.get::<_,String>(4)?})))?.collect::<Result<Vec<_>,_>>()?;
        Ok(
            json!({"actorId":s.actor_id,"canManageStaff":identity::verify(&self.0,s,Permission::Staff).is_ok(),"canAssign":identity::verify(&self.0,s,Permission::KitchenSupervise).is_ok(),"canSell":identity::verify(&self.0,s,Permission::Sell).is_ok(),"employees":employees,"assignments":assignments,"history":history}),
        )
    }
    pub(crate) fn kitchen_staff_action(
        &mut self,
        a: crate::kitchen::Action,
    ) -> Result<Value, StoreError> {
        use crate::kitchen::Action;
        let raw = serde_json::to_string(&a)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&tx, s, Permission::KitchenView)?;
        let (id, permission) = match &a {
            Action::Staff { operation_id, .. } => (operation_id, Permission::Staff),
            Action::AssignTicket { operation_id, .. } => {
                (operation_id, Permission::KitchenSupervise)
            }
            _ => return Err(StoreError::InvalidDraft),
        };
        identity::verify(&tx, s, permission)?;
        if !crate::billing::valid_id(id) {
            return Err(StoreError::InvalidDraft);
        }
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_kitchen_assignment_ops WHERE id=?1)",
            [id],
            |q| q.get::<_, bool>(0),
        )? {
            return Err(StoreError::OperationConflict);
        }
        let old: Option<(String, String, String)> = tx
            .query_row(
                "SELECT actor_id,request,result FROM local_kitchen_staff_events WHERE id=?1",
                [id],
                |q| Ok((q.get(0)?, q.get(1)?, q.get(2)?)),
            )
            .optional()?;
        if let Some((actor, request, result)) = old {
            if actor != s.actor_id || request != raw {
                return Err(StoreError::OperationConflict);
            }
            return Ok(serde_json::from_str(&result)?);
        }
        let (ticket, result) = match &a {
            Action::Staff {
                actor_id,
                expected_revision,
                mode,
                ..
            } => (
                None,
                change_responsibility(&tx, &self.1, actor_id, *expected_revision, mode)?,
            ),
            Action::AssignTicket {
                ticket_id,
                expected_revision,
                actor_id,
                ..
            } => (
                Some(ticket_id.as_str()),
                assign_ticket(&tx, &self.1, ticket_id, *expected_revision, actor_id)?,
            ),
            _ => return Err(StoreError::InvalidDraft),
        };
        tx.execute("INSERT INTO local_kitchen_staff_events(id,actor_id,ticket_id,request,result) VALUES(?1,?2,?3,?4,?5)",params![id,s.actor_id,ticket,raw,result.to_string()])?;
        identity::guard(
            &tx,
            &self.1,
            permission,
            "restaurant.kitchen_staff_changed",
            Some(id),
        )?;
        tx.commit()?;
        Ok(result)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        access::Workspace,
        identity::{Role, StaffDetails},
        kitchen::Action,
    };
    const PASSWORD: &str = "Synthetic kitchen password 2026";
    fn setup() -> Workspace {
        let mut w = Workspace::new(
            Store::open(
                std::path::Path::new(":memory:"),
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            )
            .unwrap(),
        );
        w.setup(PASSWORD).unwrap();
        w
    }
    #[test]
    fn kitchen_only_employee_has_no_financial_authority_and_assignment_fences_transitions() {
        let mut w = setup();
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
            mode: "preparer".into(),
        })
        .unwrap();
        w.store_for_test().0.execute("INSERT INTO local_restaurant_orders(id,kind,state,revision) VALUES('order','takeaway','open',1)",[]).unwrap();
        w.store_for_test()
            .0
            .execute(
                "INSERT INTO local_restaurant_tickets VALUES('ticket','order','[]','pending',1)",
                [],
            )
            .unwrap();
        let request = Action::AssignTicket {
            operation_id: "assign".into(),
            ticket_id: "ticket".into(),
            expected_revision: 1,
            actor_id: cook.id.clone(),
        };
        let result = w.kitchen_action(request).unwrap();
        assert_eq!(result["revision"], 2);
        assert_eq!(
            w.kitchen_action(Action::AssignTicket {
                operation_id: "assign".into(),
                ticket_id: "ticket".into(),
                expected_revision: 1,
                actor_id: cook.id.clone()
            })
            .unwrap(),
            result
        );
        assert!(w
            .kitchen_action(Action::AssignTicket {
                operation_id: "stale".into(),
                ticket_id: "ticket".into(),
                expected_revision: 1,
                actor_id: cook.id.clone()
            })
            .is_err());
        w.lock();
        w.login("cook", PASSWORD).unwrap();
        let store = w.store_for_test();
        let s = store.1.as_ref().unwrap();
        assert!(identity::verify(&store.0, s, Permission::KitchenPrepare).is_ok());
        for permission in [
            Permission::Sell,
            Permission::CollectCredit,
            Permission::Refund,
            Permission::Staff,
            Permission::KitchenSupervise,
        ] {
            assert!(identity::verify(&store.0, s, permission).is_err());
        }
        w.restaurant_action(crate::restaurant::Request {
            operation_id: "cook-next".into(),
            action: crate::restaurant::Action::SetTicketState {
                id: "ticket".into(),
                expected_revision: 2,
                state: "preparing".into(),
            },
        })
        .unwrap();
        assert!(w
            .kitchen_action(Action::AssignTicket {
                operation_id: "self-grant".into(),
                ticket_id: "ticket".into(),
                expected_revision: 3,
                actor_id: cook.id
            })
            .is_err());
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
    #[test]
    fn changed_responsibility_payload_under_same_id_is_refused() {
        let mut w = setup();
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
        let a = Action::Staff {
            operation_id: "grant".into(),
            actor_id: cook.id.clone(),
            expected_revision: 1,
            mode: "preparer".into(),
        };
        w.kitchen_action(a).unwrap();
        assert!(w
            .kitchen_action(Action::Staff {
                operation_id: "grant".into(),
                actor_id: cook.id,
                expected_revision: 2,
                mode: "supervisor".into()
            })
            .is_err());
    }
}
