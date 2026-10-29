//! Inventory effects and their recoverable receipt commit in the same writer transaction.
//! A new ID cannot replace an unacknowledged save, even across application processes.
use crate::{
    catalog::Product,
    identity::{self, Permission, Session},
    Store, StoreError,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryReceipt {
    pub operation_id: String,
    pub command: String,
    pub request: serde_json::Value,
    pub product: Product,
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch("CREATE TABLE local_inventory_actors(operation_id TEXT PRIMARY KEY REFERENCES local_inventory_events(operation_id),actor_id TEXT REFERENCES local_principals(id));
        INSERT INTO local_inventory_actors SELECT operation_id,NULL FROM local_inventory_events;
        CREATE TABLE local_inventory_pending(actor_id TEXT PRIMARY KEY REFERENCES local_principals(id),operation_id TEXT NOT NULL UNIQUE REFERENCES local_inventory_events(operation_id));
        CREATE TABLE local_inventory_outbox(sequence INTEGER PRIMARY KEY AUTOINCREMENT,operation_id TEXT NOT NULL UNIQUE REFERENCES local_inventory_events(operation_id),payload TEXT NOT NULL);
        PRAGMA user_version=10;")?;
    for table in ["local_inventory_actors", "local_inventory_outbox"] {
        for action in ["UPDATE", "DELETE"] {
            tx.execute_batch(&format!("CREATE TRIGGER {table}_no_{action} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Inventory receipts are immutable'); END;"))?;
        }
    }
    Ok(())
}
pub(crate) fn one(
    db: &Connection,
    sql: &str,
    values: impl rusqlite::Params,
) -> Result<(), StoreError> {
    let changed = db.execute(sql, values)?;
    if changed != 1 {
        return Err(rusqlite::Error::StatementChangedRows(changed).into());
    }
    Ok(())
}
pub(crate) fn guard(
    db: &Connection,
    session: &Option<Session>,
    id: &str,
) -> Result<(), StoreError> {
    if let Some(s) = session {
        let pending: Option<String> = db
            .query_row(
                "SELECT operation_id FROM local_inventory_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        if pending.as_deref().is_some_and(|old| old != id) {
            return Err(StoreError::CheckoutActive);
        }
    }
    Ok(())
}
pub(crate) fn reader(
    db: &Connection,
    session: &Option<Session>,
    id: &str,
) -> Result<(), StoreError> {
    if let Some(s) = session {
        let p = identity::verify(db, s, Permission::View)?;
        let actor: Option<String> = db.query_row(
            "SELECT actor_id FROM local_inventory_actors WHERE operation_id=?1",
            [id],
            |r| r.get(0),
        )?;
        if actor.as_deref() != Some(&s.actor_id) && p.role != identity::Role::Owner {
            return Err(StoreError::Forbidden);
        }
    }
    Ok(())
}
pub(crate) fn committed(
    db: &Connection,
    session: &Option<Session>,
    id: &str,
    kind: &str,
    product: &Product,
) -> Result<(), StoreError> {
    let actor = session.as_ref().map(|s| s.actor_id.as_str());
    one(
        db,
        "INSERT INTO local_inventory_actors VALUES(?1,?2)",
        params![id, actor],
    )?;
    let scope = identity::scope(db)?;
    let event = serde_json::json!({"version":1,"kind":kind,"operationId":id,"businessId":scope.business_id,"workspaceId":scope.workspace_id,"actorId":actor,"product":product}).to_string();
    one(
        db,
        "INSERT INTO local_inventory_outbox(operation_id,payload) VALUES(?1,?2)",
        params![id, event],
    )?;
    if let Some(actor) = actor {
        one(
            db,
            "INSERT INTO local_inventory_pending VALUES(?1,?2)",
            params![actor, id],
        )?;
    }
    #[cfg(test)]
    if std::env::var("SORNIO_INVENTORY_CRASH_PHASE").as_deref() == Ok("before_commit") {
        std::process::exit(88);
    }
    Ok(())
}
impl Store {
    pub(crate) fn pending_inventory(&self) -> Result<Option<InventoryReceipt>, StoreError> {
        let session = self.1.as_ref().ok_or(StoreError::Locked)?;
        let tx = self.0.unchecked_transaction()?;
        identity::verify(&tx, session, Permission::View)?;
        let row: Option<(String,String,String,String)> = tx.query_row("SELECT e.operation_id,e.kind,e.request,e.result FROM local_inventory_pending p JOIN local_inventory_events e ON e.operation_id=p.operation_id WHERE p.actor_id=?1",[&session.actor_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional()?;
        let receipt = row
            .map(
                |(operation_id, kind, request, product)| -> Result<_, StoreError> {
                    Ok(InventoryReceipt {
                        operation_id,
                        command: match kind.as_str() {
                            "product_added" => "add_local_product",
                            "stock_adjusted" => "adjust_local_stock",
                            _ => return Err(StoreError::InvalidProduct),
                        }
                        .into(),
                        request: serde_json::from_str(&request)?,
                        product: serde_json::from_str(&product)?,
                    })
                },
            )
            .transpose()?;
        tx.commit()?;
        Ok(receipt)
    }
    pub(crate) fn acknowledge_inventory(&mut self, id: &str) -> Result<(), StoreError> {
        if !crate::billing::valid_id(id) {
            return Err(StoreError::InvalidProduct);
        }
        let s = self.1.clone().ok_or(StoreError::Locked)?;
        let tx = self
            .0
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::View,
            "inventory.acknowledged",
            Some(id),
        )?;
        reader(&tx, &self.1, id)?;
        let pending: Option<String> = tx
            .query_row(
                "SELECT operation_id FROM local_inventory_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(pending) = pending {
            if pending != id {
                return Err(StoreError::CheckoutActive);
            }
            one(
                &tx,
                "DELETE FROM local_inventory_pending WHERE actor_id=?1 AND operation_id=?2",
                params![s.actor_id, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
#[path = "inventory_recovery_tests.rs"]
mod tests;
