//! Versioned SQLCipher snapshots. No plaintext database, device key export, or password reset.
use crate::{Store, StoreError, SCHEMA_VERSION};
use rusqlite::{
    params, types::ValueRef, Connection, OpenFlags, OptionalExtension, TransactionBehavior,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tempfile::NamedTempFile;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReceipt {
    pub backup_id: String,
    pub created_at: i64,
}

const FORMAT: i64 = 1;
const MAX_BYTES: u64 = 512 * 1024 * 1024;
const EXTENSION: &str = "CREATE TABLE IF NOT EXISTS local_recovery_identity (
 singleton INTEGER PRIMARY KEY CHECK(singleton = 1), business_id TEXT NOT NULL, generation TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS local_recovery_audit (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL UNIQUE,
 action TEXT NOT NULL, backup_id TEXT NOT NULL, created_at INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS local_recovery_audit_no_update BEFORE UPDATE ON local_recovery_audit
 BEGIN SELECT RAISE(ABORT, 'immutable recovery audit'); END;
 CREATE TRIGGER IF NOT EXISTS local_recovery_audit_no_delete BEFORE DELETE ON local_recovery_audit
 BEGIN SELECT RAISE(ABORT, 'immutable recovery audit'); END;";
const MANIFEST_SQL: &str = "CREATE TABLE sornio_backup_manifest (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), payload TEXT NOT NULL)";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupPreview {
    pub backup_id: String,
    pub business_id: String,
    pub business_name: String,
    pub created_at: i64,
    pub schema_version: i64,
    pub invoices: i64,
    pub ledger_entries: i64,
    pub audit_records: i64,
    pub outbox_events: i64,
    pub pending_checkout: bool,
    pub file_sha256: String,
    /// Absolute destination the archive was actually written to (export) or
    /// read from (preview), so a success message can never point at a
    /// different file than the one verified.
    pub file_path: String,
    pub current_fingerprint: String,
    pub confirmation: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    format: i64,
    schema: i64,
    id: String,
    created: i64,
    digest: String,
}

fn storage<T>(r: std::io::Result<T>) -> Result<T, StoreError> {
    r.map_err(|_| StoreError::BackupStorage)
}
pub(crate) fn random_id() -> Result<String, StoreError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| StoreError::AccessUnavailable)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
pub(crate) fn migrate(tx: &rusqlite::Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(EXTENSION)?;
    let existing: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_recovery_identity)",
        [],
        |r| r.get(0),
    )?;
    if !existing
        && tx.execute(
            "INSERT INTO local_recovery_identity VALUES(1,?1,?2)",
            params![crate::identity::scope(tx)?.business_id, random_id()?],
        )? != 1
    {
        return Err(StoreError::AccessUnavailable);
    }
    let business: String = tx.query_row(
        "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    if business != crate::identity::scope(tx)?.business_id {
        return Err(StoreError::BackupBusinessMismatch);
    }
    tx.pragma_update(None, "user_version", 11)?;
    Ok(())
}
pub(crate) fn generation(db: &Connection) -> Result<String, StoreError> {
    Ok(db.query_row(
        "SELECT generation FROM local_recovery_identity WHERE singleton=1",
        [],
        |r| r.get(0),
    )?)
}

// ---------------------------------------------------------------------------
// Phase 5 durable recovery state machine (schema v13).
// See docs/reviews/p0-durable-recovery-phase5-state-machine.md.
// ---------------------------------------------------------------------------

/// Business tables barred by the engine-level recovery fence. Recovery, auth and
/// audit metadata tables are deliberately exempt so the Owner can authenticate,
/// audit and resolve an interrupted recovery while business writes stay paused.
const FENCED_TABLES: &[&str] = &[
    "workspace_draft",
    "workspace_history",
    "local_products",
    "local_inventory_events",
    "local_inventory_actors",
    "local_inventory_pending",
    "local_inventory_outbox",
    "local_invoices",
    "local_invoice_actors",
    "local_invoice_stock",
    "local_billing_ledger",
    "local_billing_outbox",
    "local_checkout",
    "local_checkout_canceled",
    "local_customers",
    "local_customer_ops",
    "local_credit_entries",
    "local_customer_journal",
    "local_customer_outbox",
    "local_customer_pending",
    "local_customer_canceled",
    "local_retail_ops",
    "local_retail_pending",
    "local_retail_canceled",
    "local_retail_payments",
    "local_retail_events",
    "local_retail_journal",
    "local_retail_activity",
    "local_retail_returns",
    "local_retail_return_items",
    "local_retail_return_parts",
    "local_retail_refunds",
    "local_retail_floats",
    "local_retail_float_corrections",
    "local_retail_closings",
    "local_retail_outbox",
    "local_principals",
    "local_identity",
    "local_lan_devices",
    "local_lan_operations",
];

const NON_TERMINAL: &str = "('admitted','quiescing','executing','verifying')";

const KNOWN_AUDIT_ACTIONS: &[&str] = &[
    "backup_prepared",
    "backup_exported",
    "restore_committed",
    "recovery.admitted",
    "recovery.quiescing",
    "recovery.executing",
    "recovery.verifying",
    "recovery.completed",
    "recovery.rejected",
    "recovery.interrupted",
    "recovery.reconciled_fence",
    "recovery.imported_interrupted",
];

const V13_EXTENSION: &str = "CREATE TABLE local_recovery_operations (
 operation_id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('restore')),
 state TEXT NOT NULL CHECK(state IN ('admitted','quiescing','executing','verifying','completed','rejected','interrupted')),
 business_id TEXT NOT NULL,
 generation TEXT NOT NULL,
 owner_token TEXT NOT NULL,
 backup_id TEXT NOT NULL,
 expected_fingerprint TEXT NOT NULL,
 actor_id TEXT,
 result_generation TEXT,
 detail TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL);
 CREATE TABLE local_recovery_fence (
 singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
 operation_id TEXT NOT NULL REFERENCES local_recovery_operations(operation_id),
 business_id TEXT NOT NULL,
 owner_token TEXT NOT NULL,
 activated_at INTEGER NOT NULL);
 CREATE TRIGGER local_recovery_operations_no_delete BEFORE DELETE ON local_recovery_operations
 BEGIN SELECT RAISE(ABORT,'recovery operation history is permanent'); END;
 CREATE TRIGGER local_recovery_operations_insert BEFORE INSERT ON local_recovery_operations
 BEGIN
  SELECT RAISE(ABORT,'invalid initial recovery state') WHERE NEW.state NOT IN ('admitted','verifying');
  SELECT RAISE(ABORT,'recovery result generation must start empty') WHERE NEW.result_generation IS NOT NULL;
  SELECT RAISE(ABORT,'recovery business identity mismatch') WHERE
   (SELECT EXISTS(SELECT 1 FROM local_principals))
   AND NEW.business_id <> (SELECT business_id FROM local_recovery_identity WHERE singleton=1);
 END;
 CREATE TRIGGER local_recovery_operations_transition BEFORE UPDATE ON local_recovery_operations
 BEGIN
  SELECT RAISE(ABORT,'recovery operation identity is immutable') WHERE
   NEW.operation_id<>OLD.operation_id OR NEW.kind<>OLD.kind OR NEW.business_id<>OLD.business_id
   OR NEW.generation<>OLD.generation OR NEW.owner_token<>OLD.owner_token OR NEW.backup_id<>OLD.backup_id
   OR NEW.expected_fingerprint<>OLD.expected_fingerprint OR NEW.actor_id IS NOT OLD.actor_id
   OR NEW.created_at<>OLD.created_at;
  SELECT RAISE(ABORT,'invalid recovery state transition') WHERE NOT (
   (OLD.state='admitted' AND NEW.state IN ('quiescing','rejected','interrupted'))
   OR (OLD.state='quiescing' AND NEW.state IN ('executing','rejected','interrupted'))
   OR (OLD.state='executing' AND NEW.state IN ('verifying','interrupted'))
   OR (OLD.state='verifying' AND NEW.state IN ('completed','interrupted')));
  SELECT RAISE(ABORT,'recovery result generation only at completion') WHERE
   (NEW.state='completed' AND NEW.result_generation IS NULL)
   OR (NEW.state<>'completed' AND NEW.result_generation IS NOT NULL);
  SELECT RAISE(ABORT,'recovery timestamps must advance') WHERE NEW.updated_at < OLD.updated_at;
 END;
 CREATE TRIGGER local_recovery_fence_insert BEFORE INSERT ON local_recovery_fence
 BEGIN
  SELECT RAISE(ABORT,'recovery fence must reference a live operation') WHERE NOT EXISTS(
   SELECT 1 FROM local_recovery_operations o WHERE o.operation_id=NEW.operation_id
   AND o.state IN ('admitted','quiescing','executing','verifying')
   AND o.business_id=NEW.business_id AND o.owner_token=NEW.owner_token);
 END;
 CREATE TRIGGER local_recovery_fence_no_update BEFORE UPDATE ON local_recovery_fence
 BEGIN SELECT RAISE(ABORT,'recovery fence is immutable while active'); END;
 CREATE TRIGGER local_recovery_fence_release BEFORE DELETE ON local_recovery_fence
 BEGIN
  SELECT RAISE(ABORT,'recovery fence may only be released for a terminal operation') WHERE NOT EXISTS(
   SELECT 1 FROM local_recovery_operations o WHERE o.operation_id=OLD.operation_id
   AND o.state IN ('completed','rejected','interrupted'));
 END;";

pub(crate) fn migrate_v13(tx: &rusqlite::Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(V13_EXTENSION)?;
    for table in FENCED_TABLES {
        for (suffix, op) in [("ins", "INSERT"), ("upd", "UPDATE"), ("del", "DELETE")] {
            tx.execute_batch(&format!(
                "CREATE TRIGGER recovery_fence_{table}_{suffix} BEFORE {op} ON {table}
                 BEGIN SELECT RAISE(ABORT,'Sornio recovery is in progress; business writes are paused')
                 WHERE EXISTS(SELECT 1 FROM local_recovery_fence); END;"
            ))?;
        }
    }
    tx.pragma_update(None, "user_version", 13)?;
    Ok(())
}

/// Test-only: a faithful pre-v13 database has none of the v13 recovery objects.
/// Legacy-migration fixtures downgrade an already-migrated store by dropping the
/// tables that did not exist at the target version; they must also remove the v13
/// extension (operations/fence tables and the per-table barrier triggers),
/// otherwise a later `ALTER TABLE … RENAME` re-parses a trigger that references a
/// dropped table. This never runs in production code paths.
#[cfg(test)]
pub(crate) fn remove_v13_for_legacy_test(db: &Connection) {
    for table in FENCED_TABLES {
        for suffix in ["ins", "upd", "del"] {
            db.execute_batch(&format!(
                "DROP TRIGGER IF EXISTS recovery_fence_{table}_{suffix};"
            ))
            .unwrap();
        }
    }
    db.execute_batch(
        "DROP TABLE IF EXISTS local_recovery_fence; DROP TABLE IF EXISTS local_recovery_operations;",
    )
    .unwrap();
}

/// In-memory capability held only by the admitting process. Never serialized.
pub(crate) struct Ownership {
    pub operation_id: String,
    pub owner_token: String,
}

pub(crate) fn fence_active(db: &Connection) -> Result<bool, StoreError> {
    Ok(db.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_recovery_fence)",
        [],
        |r| r.get(0),
    )?)
}

/// Clean early rejection for business paths; the engine-level barrier triggers
/// remain the universal enforcement for every connection and raw SQL.
pub(crate) fn ensure_open(db: &Connection) -> Result<(), StoreError> {
    if fence_active(db)? {
        return Err(StoreError::RecoveryActive);
    }
    Ok(())
}

fn non_terminal_operation(db: &Connection) -> Result<Option<(String, String)>, StoreError> {
    Ok(db
        .query_row(
            &format!(
                "SELECT operation_id,state FROM local_recovery_operations WHERE state IN {NON_TERMINAL} LIMIT 1"
            ),
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?)
}

/// Token- and state-matched transition under the caller's writer lock. The
/// UPDATE trigger independently enforces the same graph for every connection.
fn transition(
    tx: &rusqlite::Transaction<'_>,
    o: &Ownership,
    from: &[&str],
    to: &str,
    detail: Option<&str>,
    result_generation: Option<&str>,
) -> Result<(), StoreError> {
    let placeholders = from.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "UPDATE local_recovery_operations
         SET state=?, detail=COALESCE(?,detail), result_generation=?, updated_at=?
         WHERE operation_id=? AND owner_token=? AND state IN ({placeholders})"
    );
    let mut values: Vec<rusqlite::types::Value> = vec![
        to.to_string().into(),
        detail.map(|s| s.to_string()).into(),
        result_generation.map(|s| s.to_string()).into(),
        now()?.into(),
        o.operation_id.clone().into(),
        o.owner_token.clone().into(),
    ];
    values.extend(from.iter().map(|s| (*s).to_string().into()));
    if tx.execute(&sql, rusqlite::params_from_iter(values))? != 1 {
        return Err(StoreError::RecoveryOwnership);
    }
    Ok(())
}

/// T0 — admission. One IMMEDIATE transaction: the writer lock drains in-flight
/// writers of every process, then the fence singleton makes a second concurrent
/// admission impossible. The bound identity columns are immutable afterwards.
fn admit(store: &mut Store, preview: &BackupPreview) -> Result<Ownership, StoreError> {
    let session = store.1.clone();
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let configured: bool =
        tx.query_row("SELECT EXISTS(SELECT 1 FROM local_principals)", [], |r| {
            r.get(0)
        })?;
    let actor = if configured {
        let s = session.as_ref().ok_or(StoreError::Locked)?;
        Some(crate::identity::verify(
            &tx,
            s,
            crate::identity::Permission::Settings,
        )?)
    } else {
        None
    };
    if fence_active(&tx)? {
        return Err(StoreError::RecoveryActive);
    }
    if non_terminal_operation(&tx)?.is_some() {
        return Err(StoreError::RecoveryInterrupted);
    }
    check_business(&tx, &preview.business_id)?;
    let operation_id = random_id()?;
    let owner_token = random_id()?;
    let at = now()?;
    tx.execute(
        "INSERT INTO local_recovery_operations(operation_id,kind,state,business_id,generation,owner_token,backup_id,expected_fingerprint,actor_id,result_generation,detail,created_at,updated_at)
         VALUES(?1,'restore','admitted',?2,?3,?4,?5,?6,?7,NULL,NULL,?8,?8)",
        params![
            operation_id,
            preview.business_id,
            generation(&tx)?,
            owner_token,
            preview.backup_id,
            fingerprint(&tx)?,
            actor.as_ref().map(|p| p.id.clone()),
            at
        ],
    )?;
    tx.execute(
        "INSERT INTO local_recovery_fence(singleton,operation_id,business_id,owner_token,activated_at) VALUES(1,?1,?2,?3,?4)",
        params![operation_id, preview.business_id, owner_token, at],
    )?;
    audit(&tx, "recovery.admitted", &operation_id, actor.as_ref())?;
    tx.commit()?;
    Ok(Ownership {
        operation_id,
        owner_token,
    })
}

/// T5 — explicit rejection. Releases the fence only after the terminal state is
/// durable in the same transaction. Never touches business data.
fn reject(store: &mut Store, o: &Ownership, reason: &str) -> Result<(), StoreError> {
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    transition(
        &tx,
        o,
        &["admitted", "quiescing"],
        "rejected",
        Some(reason),
        None,
    )?;
    tx.execute(
        "DELETE FROM local_recovery_fence WHERE operation_id=?1",
        [&o.operation_id],
    )?;
    audit(&tx, "recovery.rejected", &o.operation_id, None)?;
    tx.commit()?;
    Ok(())
}

/// T6 — manual interruption resolution. Requires a live Owner session and an
/// explicit operation id; the crashed owner's token is deliberately not needed
/// and cannot be reused. Moves only to the terminal `interrupted` state.
pub(crate) fn resolve_interrupted(
    store: &mut Store,
    operation_id: &str,
    password: &str,
) -> Result<(), StoreError> {
    if password.is_empty() || password.len() > 512 {
        return Err(StoreError::InvalidPassword);
    }
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    // The store is fenced after an interrupted recovery, so the normal login
    // (which writes attempt counters to fenced tables) cannot run. Authenticate
    // the Owner read-only against the stored verifier, honoring the persistent
    // lockout. Resolution itself writes only recovery metadata, never business
    // tables, so it is the single authorized write path through a live fence.
    let owner: Option<(String, String, i64, bool)> = tx
        .query_row(
            "SELECT id,password_hash,retry_after,enabled FROM local_principals WHERE role='owner' LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?;
    let (id, hash, retry, enabled) = owner.ok_or(StoreError::AccessUnavailable)?;
    let global_retry: i64 = tx.query_row(
        "SELECT retry_after FROM workspace_access WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    let clock = now()?;
    if clock < retry || clock < global_retry {
        return Err(StoreError::RateLimited);
    }
    if !enabled || !crate::access::verify_password(password, &hash)? {
        return Err(StoreError::InvalidPassword);
    }
    let actor = crate::identity::principal(&tx, &id)?;
    let scope = crate::identity::scope(&tx)?;
    let session = crate::identity::session(&tx, scope, &actor)?;
    let changed = tx.execute(
        &format!(
            "UPDATE local_recovery_operations SET state='interrupted', detail=?2, updated_at=?3
             WHERE operation_id=?1 AND state IN {NON_TERMINAL}"
        ),
        params![operation_id, "resolved by owner after interruption", now()?],
    )?;
    if changed != 1 {
        return Err(StoreError::RecoveryOwnership);
    }
    tx.execute(
        "DELETE FROM local_recovery_fence WHERE operation_id=?1",
        [operation_id],
    )?;
    audit(&tx, "recovery.interrupted", operation_id, Some(&actor))?;
    tx.commit()?;
    // The Owner authenticated; leave the workspace unlocked for normal use now
    // that the fence is released. The generation is unchanged by resolution.
    store.1 = Some(session);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryStatus {
    pub fenced: bool,
    pub operation_id: Option<String>,
    pub state: Option<String>,
    pub backup_id: Option<String>,
    pub requires_resolution: bool,
}

pub(crate) fn status(db: &Connection) -> Result<RecoveryStatus, StoreError> {
    let row: Option<(String, String, String)> = db
        .query_row(
            &format!(
                "SELECT operation_id,state,backup_id FROM local_recovery_operations WHERE state IN {NON_TERMINAL} LIMIT 1"
            ),
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    Ok(match row {
        Some((operation_id, state, backup_id)) => RecoveryStatus {
            fenced: fence_active(db)?,
            operation_id: Some(operation_id),
            state: Some(state),
            backup_id: Some(backup_id),
            requires_resolution: true,
        },
        None => RecoveryStatus {
            fenced: fence_active(db)?,
            operation_id: None,
            state: None,
            backup_id: None,
            requires_resolution: false,
        },
    })
}

/// Fail-closed startup reconciliation. Never advances a recovery state, never
/// deletes ambiguous rows, never interprets ambiguity as success. The only
/// automatic write is T7 re-fencing (containment), which is audited.
pub(crate) fn reconcile_startup(db: &mut Connection) -> Result<(), StoreError> {
    let tables: i64 = db.query_row(
        "SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('local_recovery_operations','local_recovery_fence','local_recovery_audit','local_recovery_identity')",
        [],
        |r| r.get(0),
    )?;
    if tables != 4 {
        return Err(StoreError::RecoveryCorrupt);
    }
    let actions: Vec<String> = {
        let mut q = db.prepare("SELECT DISTINCT action FROM local_recovery_audit")?;
        let rows = q.query_map([], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    if actions
        .iter()
        .any(|a| !KNOWN_AUDIT_ACTIONS.contains(&a.as_str()))
    {
        return Err(StoreError::RecoveryCorrupt);
    }
    let business: String = db.query_row(
        "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    let ops: Vec<(String, String, String, Option<String>)> = {
        let mut q = db.prepare(
            "SELECT operation_id,state,business_id,result_generation FROM local_recovery_operations",
        )?;
        let rows = q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
        rows.collect::<Result<_, _>>()?
    };
    let mut live: Option<(String, String)> = None;
    for (id, state, biz, result_generation) in ops {
        if biz != business {
            return Err(StoreError::RecoveryCorrupt);
        }
        match state.as_str() {
            "completed" => {
                if result_generation.is_none() {
                    return Err(StoreError::RecoveryCorrupt);
                }
            }
            "rejected" | "interrupted" => {}
            "admitted" | "quiescing" | "executing" | "verifying" => {
                if live.is_some() {
                    return Err(StoreError::RecoveryCorrupt);
                }
                live = Some((id, state));
            }
            _ => return Err(StoreError::RecoveryCorrupt),
        }
    }
    let fence: Option<(String, String, String)> = db
        .query_row(
            "SELECT operation_id,business_id,owner_token FROM local_recovery_fence WHERE singleton=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    match (live, fence) {
        (None, Some(_)) => Err(StoreError::RecoveryCorrupt),
        (Some((id, _)), Some((fid, fbiz, ftoken))) => {
            if fid != id {
                return Err(StoreError::RecoveryCorrupt);
            }
            let (biz, token): (String, String) = db.query_row(
                "SELECT business_id,owner_token FROM local_recovery_operations WHERE operation_id=?1",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            if fbiz != biz || ftoken != token {
                return Err(StoreError::RecoveryCorrupt);
            }
            Ok(())
        }
        (Some((id, _)), None) => {
            // T7: restore the fail-closed barrier. Containment, not cleanup.
            let (biz, token): (String, String) = db.query_row(
                "SELECT business_id,owner_token FROM local_recovery_operations WHERE operation_id=?1",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            tx.execute(
                "INSERT INTO local_recovery_fence(singleton,operation_id,business_id,owner_token,activated_at) VALUES(1,?1,?2,?3,?4)",
                params![id, biz, token, now()?],
            )?;
            audit(&tx, "recovery.reconciled_fence", &id, None)?;
            tx.commit()?;
            Ok(())
        }
        (None, None) => Ok(()),
    }
}
fn password(password: &str) -> Result<(), StoreError> {
    if !(14..=128).contains(&password.chars().count())
        || password.len() > 512
        || password.trim().len() < 14
        || password.contains('\0')
        || password
            .get(..2)
            .is_some_and(|p| p.eq_ignore_ascii_case("x'"))
    {
        return Err(StoreError::InvalidRecoveryPassword);
    }
    Ok(())
}
fn now() -> Result<i64, StoreError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_secs()).ok())
        .ok_or(StoreError::AccessUnavailable)
}
fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}
fn schema(db: &Connection) -> Result<Vec<(String, String, String)>, StoreError> {
    Ok(db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND NOT(type = 'table' AND name = 'sornio_backup_manifest') ORDER BY type,name")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<Result<_,_>>()?)
}
fn hash_field(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}
fn digest(db: &Connection) -> Result<String, StoreError> {
    digest_inner(db, false)
}
fn fingerprint(db: &Connection) -> Result<String, StoreError> {
    digest_inner(db, true)
}
fn digest_inner(db: &Connection, live: bool) -> Result<String, StoreError> {
    let mut hash = Sha256::new();
    for (kind, name, sql) in schema(db)? {
        hash_field(&mut hash, sql.as_bytes());
        // The live fingerprint detects business-state drift between preview and
        // restore. Recovery's own bookkeeping (audit history, operation ledger,
        // fence) changes during a restore by design and must not invalidate it.
        // Backup digests (live=false) still cover every table.
        if kind != "table"
            || (live
                && matches!(
                    name.as_str(),
                    "local_recovery_audit"
                        | "local_identity_audit"
                        | "local_recovery_operations"
                        | "local_recovery_fence"
                ))
        {
            continue;
        }
        let mut stmt = db.prepare(&format!(
            "SELECT * FROM {} ORDER BY {}",
            quote(&name),
            (1..=db
                .prepare(&format!("SELECT * FROM {}", quote(&name)))?
                .column_count())
                .map(|n| n.to_string())
                .collect::<Vec<_>>()
                .join(",")
        ))?;
        let columns = stmt.column_count();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            hash.update([255]);
            for n in 0..columns {
                match row.get_ref(n)? {
                    ValueRef::Null => hash.update([0]),
                    ValueRef::Integer(n) => {
                        hash.update([1]);
                        hash.update(n.to_le_bytes());
                    }
                    ValueRef::Real(n) => {
                        hash.update([2]);
                        hash.update(n.to_bits().to_le_bytes());
                    }
                    ValueRef::Text(s) => {
                        hash.update([3]);
                        hash_field(&mut hash, s);
                    }
                    ValueRef::Blob(s) => {
                        hash.update([4]);
                        hash_field(&mut hash, s);
                    }
                }
            }
        }
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn file_hash(path: &Path) -> Result<String, StoreError> {
    let mut file = storage(File::open(path))?;
    let mut hash = Sha256::new();
    let mut buf = [0; 65536];
    loop {
        let n = storage(file.read(&mut buf))?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn integrity(db: &Connection) -> Result<(), StoreError> {
    if db
        .prepare("PRAGMA cipher_integrity_check")?
        .query([])?
        .next()?
        .is_some()
    {
        return Err(StoreError::InvalidBackup);
    }
    let rows = db
        .prepare("PRAGMA integrity_check")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if rows != ["ok"]
        || db
            .prepare("PRAGMA foreign_key_check")?
            .query([])?
            .next()?
            .is_some()
    {
        return Err(StoreError::InvalidBackup);
    }
    Ok(())
}
fn audit(
    db: &Connection,
    action: &str,
    id: &str,
    actor: Option<&crate::identity::Principal>,
) -> Result<(), StoreError> {
    if let Some(actor) = actor {
        crate::identity::audit(
            db,
            &crate::identity::scope(db)?,
            Some(actor),
            action,
            Some(id),
        )?;
    }
    if db.execute("INSERT INTO local_recovery_audit(operation_id,action,backup_id,created_at) VALUES(?1,?2,?3,?4)", params![random_id()?,action,id,now()?])? != 1 { return Err(StoreError::AccessUnavailable); }
    Ok(())
}

// Only recovery may write a pristine, unconfigured target. An established store
// always requires the live Owner session, rechecked after the writer lock.
fn writer(store: &mut Store) -> Result<rusqlite::Transaction<'_>, StoreError> {
    let session = store.1.clone();
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let configured: bool =
        tx.query_row("SELECT EXISTS(SELECT 1 FROM local_principals)", [], |r| {
            r.get(0)
        })?;
    if configured {
        let session = session.as_ref().ok_or(StoreError::Locked)?;
        crate::identity::verify(&tx, session, crate::identity::Permission::Settings)?;
    }
    Ok(tx)
}
fn details(db: &Connection, manifest: &Manifest, sha: String) -> Result<BackupPreview, StoreError> {
    let count = |table: &str| -> Result<i64, StoreError> {
        Ok(
            db.query_row(&format!("SELECT count(*) FROM {}", quote(table)), [], |r| {
                r.get(0)
            })?,
        )
    };
    Ok(BackupPreview {
        backup_id: manifest.id.clone(),
        business_id: db.query_row(
            "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
            [],
            |r| r.get(0),
        )?,
        business_name: if manifest.schema >= 7 {
            db.query_row(
                "SELECT business_name FROM local_identity WHERE singleton=1",
                [],
                |r| r.get(0),
            )?
        } else {
            db.query_row(
                "SELECT payload FROM workspace_draft WHERE singleton=1",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|s| serde_json::from_str::<crate::Draft>(&s).ok())
            .map(|d| d.business_name)
            .unwrap_or_else(|| "Unconfigured business".into())
        },
        created_at: manifest.created,
        schema_version: manifest.schema,
        invoices: count("local_invoices")?,
        ledger_entries: count("local_billing_ledger")?
            + if manifest.schema >= 8 {
                count("local_customer_journal")?
            } else {
                0
            }
            + if manifest.schema >= 9 {
                count("local_retail_journal")?
            } else {
                0
            },
        audit_records: count("local_billing_audit")?
            + count("local_recovery_audit")?
            + if manifest.schema >= 7 {
                count("local_identity_audit")?
            } else {
                0
            },
        outbox_events: count("local_billing_outbox")?
            + if manifest.schema >= 8 {
                count("local_customer_outbox")?
            } else {
                0
            }
            + if manifest.schema >= 9 {
                count("local_retail_outbox")?
            } else {
                0
            }
            + if manifest.schema >= 10 {
                count("local_inventory_outbox")?
            } else {
                0
            },
        pending_checkout: if manifest.schema >= 6 {
            count("local_checkout")? > 0
        } else {
            false
        },
        file_sha256: sha,
        file_path: String::new(),
        current_fingerprint: String::new(),
        confirmation: format!("RESTORE {}", &manifest.id[..12]),
    })
}
fn encrypted(path: &Path, secret: &str) -> Result<Connection, StoreError> {
    let db = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    db.pragma_update(None, "key", secret)?;
    db.pragma_update(None, "cipher_memory_security", "ON")?;
    db.pragma_update(None, "trusted_schema", "OFF")?;
    db.pragma_update(None, "temp_store", "MEMORY")?;
    Ok(db)
}
fn validate(db: &Connection) -> Result<Manifest, StoreError> {
    // Version and trusted schema are checked before any application triggers/migrations can execute.
    let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > SCHEMA_VERSION {
        return Err(StoreError::NewerSchema);
    }
    if !(5..=SCHEMA_VERSION).contains(&version) {
        return Err(StoreError::InvalidBackup);
    }
    let expected_schema = if version == SCHEMA_VERSION {
        let reference = Store::open(Path::new(":memory:"), &random_id()?)?;
        schema(&reference.0)?
    } else if version == 12 {
        serde_json::from_str(include_str!("../fixtures/recovery-v12-schema.json"))?
    } else if version == 11 {
        serde_json::from_str(include_str!("../fixtures/recovery-v11-schema.json"))?
    } else if matches!(version, 5 | 6) {
        let mut legacy: Vec<(String, String, String)> =
            serde_json::from_str(include_str!("../fixtures/recovery-v6-schema.json"))?;
        if version == 5 {
            legacy.retain(|(_, name, _)| !name.starts_with("local_checkout"));
        }
        legacy
    } else {
        return Err(StoreError::InvalidBackup);
    };
    if schema(db)? != expected_schema {
        return Err(StoreError::InvalidBackup);
    }
    let manifest_sql: String = db.query_row(
        "SELECT sql FROM sqlite_schema WHERE name='sornio_backup_manifest' AND type='table'",
        [],
        |r| r.get(0),
    )?;
    if manifest_sql != MANIFEST_SQL {
        return Err(StoreError::InvalidBackup);
    }
    integrity(db)?;
    let payload: String = db.query_row(
        "SELECT payload FROM sornio_backup_manifest WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    if payload.len() > 2048 {
        return Err(StoreError::InvalidBackup);
    }
    let m: Manifest = serde_json::from_str(&payload)?;
    if m.format != FORMAT
        || m.schema != version
        || !(0..=253402300799).contains(&m.created)
        || m.id.len() != 64
        || !m.id.bytes().all(|b| b.is_ascii_hexdigit())
        || m.digest != digest(db)?
    {
        return Err(StoreError::InvalidBackup);
    }
    let identity: (String, String) = db.query_row(
        "SELECT business_id,generation FROM local_recovery_identity WHERE singleton=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    if [identity.0.clone(), identity.1]
        .iter()
        .any(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err(StoreError::InvalidBackup);
    }
    if version >= 7 && crate::identity::scope(db)?.business_id != identity.0 {
        return Err(StoreError::InvalidBackup);
    }
    Ok(m)
}
#[cfg(test)]
fn crash_point(phase: &str) {
    if std::env::var("SORNIO_RECOVERY_CRASH_PHASE").ok().as_deref() == Some(phase) {
        let marker = std::env::var_os("SORNIO_RECOVERY_CRASH_MARKER").unwrap();
        let f = File::create(marker).unwrap();
        f.sync_all().unwrap();
        loop {
            std::thread::park();
        }
    }
}
fn publish(temp: NamedTempFile, destination: &Path) -> Result<(), StoreError> {
    storage(temp.as_file().sync_all())?;
    temp.persist_noclobber(destination)
        .map_err(|_| StoreError::BackupStorage)?;
    #[cfg(unix)]
    storage(
        File::open(destination.parent().ok_or(StoreError::BackupStorage)?)
            .and_then(|f| f.sync_all()),
    )?;
    Ok(())
}
pub(crate) fn export(
    store: &mut Store,
    destination: &Path,
    secret: &str,
) -> Result<BackupPreview, StoreError> {
    export_inner(store, destination, secret, None)
}

/// Public exports are barred while a recovery fence is active. The safety copy
/// taken inside a restore is exempt only with the matching live ownership token.
fn export_inner(
    store: &mut Store,
    destination: &Path,
    secret: &str,
    exemption: Option<&Ownership>,
) -> Result<BackupPreview, StoreError> {
    password(secret)?;
    // Recovery passphrase must be separate from the local login password (checked by adapter).
    if destination.exists() {
        return Err(StoreError::BackupStorage);
    }
    let fence_ok = |db: &Connection| -> Result<bool, StoreError> {
        if !fence_active(db)? {
            return Ok(true);
        }
        Ok(match exemption {
            Some(o) => db.query_row(
                "SELECT EXISTS(SELECT 1 FROM local_recovery_fence WHERE operation_id=?1 AND owner_token=?2)",
                params![o.operation_id, o.owner_token],
                |r| r.get(0),
            )?,
            None => false,
        })
    };
    if !fence_ok(&store.0)? {
        return Err(StoreError::RecoveryActive);
    }
    let temp = storage(
        tempfile::Builder::new()
            .prefix(".sornio-encrypted-")
            .tempfile_in(destination.parent().ok_or(StoreError::BackupStorage)?),
    )?;
    store.0.execute(
        "ATTACH DATABASE ?1 AS recovery_export KEY ?2",
        params![
            temp.path().to_str().ok_or(StoreError::BackupStorage)?,
            secret
        ],
    )?;
    let result = (|| {
        store.0.execute_batch(
            "PRAGMA recovery_export.journal_mode=DELETE; PRAGMA recovery_export.synchronous=FULL;",
        )?;
        let session = store.1.clone();
        let tx = writer(store)?;
        if !fence_ok(&tx)? {
            return Err(StoreError::RecoveryActive);
        }
        let actor = session
            .as_ref()
            .map(|s| crate::identity::verify(&tx, s, crate::identity::Permission::Settings))
            .transpose()?;
        let id = random_id()?;
        audit(&tx, "backup_prepared", &id, actor.as_ref())?;
        tx.query_row("SELECT sqlcipher_export('recovery_export')", [], |_| Ok(()))?;
        tx.execute_batch(&format!("PRAGMA recovery_export.user_version={SCHEMA_VERSION}; CREATE TABLE recovery_export.sornio_backup_manifest (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), payload TEXT NOT NULL);"))?;
        // Hash attached snapshot through a second connection only after commit; metadata is finalized below.
        tx.commit()?;
        Ok::<_, StoreError>(id)
    })();
    let detached = store.0.execute_batch("DETACH DATABASE recovery_export;");
    let id = result?;
    detached?;
    let db = Connection::open(temp.path())?;
    db.pragma_update(None, "key", secret)?;
    db.pragma_update(None, "cipher_memory_security", "ON")?;
    let manifest = Manifest {
        format: FORMAT,
        schema: SCHEMA_VERSION,
        id: id.clone(),
        created: now()?,
        digest: digest(&db)?,
    };
    db.execute(
        "INSERT INTO sornio_backup_manifest VALUES(1,?1)",
        [serde_json::to_string(&manifest)?],
    )?;
    validate(&db)?;
    let mut preview = details(&db, &manifest, String::new())?;
    drop(db);
    preview.file_sha256 = file_hash(temp.path())?;
    if storage(temp.as_file().metadata())?.len() > MAX_BYTES {
        return Err(StoreError::BackupStorage);
    }
    #[cfg(test)]
    crash_point("backup");
    publish(temp, destination)?;
    preview.file_path = destination.to_string_lossy().into_owned();
    let session = store.1.clone();
    let tx = writer(store)?;
    let actor = session
        .as_ref()
        .map(|s| crate::identity::verify(&tx, s, crate::identity::Permission::Settings))
        .transpose()?;
    audit(&tx, "backup_exported", &id, actor.as_ref())?;
    tx.commit()?;
    Ok(preview)
}
struct Verified {
    file: NamedTempFile,
    store: Store,
    preview: BackupPreview,
}
fn verified(source: &Path, secret: &str, original_password: &str) -> Result<Verified, StoreError> {
    password(secret)?;
    let mut input = storage(File::open(source))?;
    if !storage(input.metadata())?.is_file()
        || !(4096..=MAX_BYTES).contains(&storage(input.metadata())?.len())
    {
        return Err(StoreError::InvalidBackup);
    }
    let mut file = storage(
        tempfile::Builder::new()
            .prefix("sornio-encrypted-review-")
            .tempfile(),
    )?;
    let n = storage(std::io::copy(
        &mut Read::by_ref(&mut input).take(MAX_BYTES + 1),
        &mut file,
    ))?;
    if n > MAX_BYTES {
        return Err(StoreError::InvalidBackup);
    }
    storage(file.flush())?;
    let db = encrypted(file.path(), secret).map_err(|_| StoreError::InvalidBackup)?;
    let manifest = validate(&db).map_err(|e| match e {
        StoreError::NewerSchema => e,
        _ => StoreError::InvalidBackup,
    })?;
    let pages: i64 = db.pragma_query_value(None, "page_count", |r| r.get(0))?;
    let page_size: String = db.pragma_query_value(None, "cipher_page_size", |r| r.get(0))?;
    if page_size != "4096" || pages.checked_mul(4096) != i64::try_from(n).ok() {
        return Err(StoreError::InvalidBackup);
    }
    let mut preview = details(&db, &manifest, file_hash(file.path())?)?;
    preview.file_path = file.path().to_string_lossy().into_owned();
    drop(db);
    let store = Store::open_secret(file.path(), secret)?;
    let mut workspace = crate::access::Workspace::new(store);
    // An archive's Cashier/Manager password cannot authorize full recovery.
    let username: String = workspace.store_owner_username()?;
    workspace.login(&username, original_password)?;
    workspace.require(crate::identity::Permission::Settings)?;
    let store = workspace.into_recovery_store();
    Ok(Verified {
        file,
        store,
        preview,
    })
}
pub(crate) fn preview(
    store: &mut Store,
    source: &Path,
    secret: &str,
    original_password: &str,
) -> Result<BackupPreview, StoreError> {
    let v = verified(source, secret, original_password)?;
    let mut preview = v.preview.clone();
    check_business(&store.0, &preview.business_id)?;
    preview.current_fingerprint = fingerprint(&store.0)?;
    Ok(preview)
}
fn check_business(db: &Connection, expected: &str) -> Result<(), StoreError> {
    let configured: bool =
        db.query_row("SELECT EXISTS(SELECT 1 FROM local_principals)", [], |r| {
            r.get(0)
        })?;
    let id: String = db.query_row(
        "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    let contains_data: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM workspace_draft UNION ALL SELECT 1 FROM workspace_history UNION ALL SELECT 1 FROM local_products UNION ALL SELECT 1 FROM local_invoices UNION ALL SELECT 1 FROM local_inventory_events UNION ALL SELECT 1 FROM local_billing_outbox LIMIT 1)", [], |r| r.get(0))?;
    if (configured || contains_data) && id != expected {
        return Err(StoreError::BackupBusinessMismatch);
    }
    Ok(())
}
pub(crate) fn restore(
    store: &mut Store,
    source: &Path,
    safety_dir: &Path,
    secret: &str,
    original_password: &str,
    expected: &BackupPreview,
    confirmation: &str,
) -> Result<String, StoreError> {
    if expected.confirmation != confirmation {
        return Err(StoreError::RecoveryConfirmation);
    }
    let v = verified(source, secret, original_password)?;
    let archived_actor = crate::identity::verify(
        &v.store.0,
        v.store.1.as_ref().ok_or(StoreError::Locked)?,
        crate::identity::Permission::Settings,
    )?;
    if v.preview.file_sha256 != expected.file_sha256
        || v.preview.backup_id != expected.backup_id
        || v.preview.confirmation != confirmation
    {
        return Err(StoreError::RecoveryChanged);
    }
    check_business(&store.0, &v.preview.business_id)?;
    if fingerprint(&store.0)? != expected.current_fingerprint {
        return Err(StoreError::RecoveryChanged);
    }
    // T0: durable ownership + admission barrier before any destructive work.
    let ownership = admit(store, &v.preview)?;
    #[cfg(test)]
    crash_point("admitted");
    // From here every failure path must explicitly reject (T5) so the fence is
    // released. A crash instead leaves the fenced state for startup review (T6).
    let result = restore_owned(
        store,
        v,
        safety_dir,
        secret,
        expected,
        &ownership,
        &archived_actor,
    );
    match result {
        Ok(path) => Ok(path),
        Err(e) => {
            let _ = reject(store, &ownership, &format!("{e:?}"));
            Err(e)
        }
    }
}

fn restore_owned(
    store: &mut Store,
    v: Verified,
    safety_dir: &Path,
    secret: &str,
    expected: &BackupPreview,
    ownership: &Ownership,
    archived_actor: &crate::identity::Principal,
) -> Result<String, StoreError> {
    // T1: drain in-process replication publishers, then record quiescence.
    // Cross-process writers are already barred by the durable fence; the
    // restore writer lock below waits out any in-flight write transaction.
    let _drain = crate::replication::acquire_drain()?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    transition(&tx, ownership, &["admitted"], "quiescing", None, None)?;
    audit(&tx, "recovery.quiescing", &ownership.operation_id, None)?;
    tx.commit()?;
    #[cfg(test)]
    crash_point("quiescing");

    storage(fs::create_dir_all(safety_dir))?;
    let safety = safety_dir.join(format!(
        "sornio-before-restore-{}.sorniobackup",
        random_id()?
    ));
    // Must succeed before destructive work. The separate passphrase also protects
    // this safety copy; only the live ownership token may export through the fence.
    export_inner(store, &safety, secret, Some(ownership))?;

    // Close the migrated staging connection before attachment; WAL is checkpointed on close.
    let Verified {
        file,
        store: staged,
        ..
    } = v;
    drop(staged);
    store.0.execute(
        "ATTACH DATABASE ?1 AS recovery_import KEY ?2",
        params![
            file.path().to_str().ok_or(StoreError::BackupStorage)?,
            secret
        ],
    )?;
    store.0.pragma_update(None, "foreign_keys", "OFF")?;
    let result = (|| {
        let session = store.1.clone();
        let tx = writer(store)?;
        let actor = session
            .as_ref()
            .map(|s| crate::identity::verify(&tx, s, crate::identity::Permission::Settings))
            .transpose()?;
        let actor_ref = actor.as_ref().or(Some(archived_actor));
        // Re-validate ownership and identity under the writer lock. The bound
        // fingerprint was captured at admission inside its own writer lock.
        let (bound_generation, bound_fingerprint, bound_created): (String, String, i64) = tx
            .query_row(
                "SELECT generation,expected_fingerprint,created_at FROM local_recovery_operations WHERE operation_id=?1 AND owner_token=?2 AND state='quiescing'",
                params![ownership.operation_id, ownership.owner_token],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| StoreError::RecoveryOwnership)?;
        if fingerprint(&tx)? != bound_fingerprint {
            return Err(StoreError::RecoveryChanged);
        }
        check_business(&tx, &expected.business_id)?;
        // T2: execution. Durable only if this whole transaction commits.
        transition(&tx, ownership, &["quiescing"], "executing", None, None)?;
        audit(
            &tx,
            "recovery.executing",
            &ownership.operation_id,
            actor_ref,
        )?;
        #[cfg(test)]
        crash_point("executing");
        let objects = schema(&tx)?;
        for (kind, name, _) in objects
            .iter()
            .filter(|(k, _, _)| k != "table")
            .chain(objects.iter().filter(|(k, _, _)| k == "table"))
        {
            tx.execute_batch(&format!("DROP {} {}", kind, quote(name)))?;
        }
        #[cfg(test)]
        crash_point("restore");
        tx.query_row(
            "SELECT sqlcipher_export('main','recovery_import')",
            [],
            |_| Ok(()),
        )?;
        tx.execute_batch(&format!(
            "DROP TABLE sornio_backup_manifest; PRAGMA user_version={SCHEMA_VERSION};"
        ))?;
        let new_generation = random_id()?;
        if tx.execute(
            "UPDATE local_recovery_identity SET generation=?1 WHERE singleton=1",
            [&new_generation],
        )? != 1
        {
            return Err(StoreError::AccessUnavailable);
        }
        // The import replaced the operations table with the backup's history.
        // Any non-terminal operation inside the imported image (a safety backup
        // captured mid-recovery) is an interrupted attempt: terminate it explicitly.
        let imported: Vec<String> = {
            let mut q = tx.prepare(&format!(
                "SELECT operation_id FROM local_recovery_operations WHERE state IN {NON_TERMINAL}"
            ))?;
            let ids = q.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
            ids
        };
        for id in imported {
            tx.execute(
                &format!(
                    "UPDATE local_recovery_operations SET state='interrupted', detail='imported interrupted recovery', updated_at=?2 WHERE operation_id=?1 AND state IN {NON_TERMINAL}"
                ),
                params![id, now()?],
            )?;
            audit(&tx, "recovery.imported_interrupted", &id, actor_ref)?;
        }
        // Imported fence rows now reference only terminal operations.
        tx.execute("DELETE FROM local_recovery_fence", [])?;
        // Re-establish this operation's durable record (destroyed by the import).
        tx.execute(
            "INSERT INTO local_recovery_operations(operation_id,kind,state,business_id,generation,owner_token,backup_id,expected_fingerprint,actor_id,result_generation,detail,created_at,updated_at)
             VALUES(?1,'restore','verifying',?2,?3,?4,?5,?6,?7,NULL,NULL,?8,?9)",
            params![
                ownership.operation_id,
                expected.business_id,
                bound_generation,
                ownership.owner_token,
                expected.backup_id,
                bound_fingerprint,
                actor_ref.map(|p| p.id.clone()),
                bound_created,
                now()?
            ],
        )?;
        audit(
            &tx,
            "recovery.verifying",
            &ownership.operation_id,
            actor_ref,
        )?;
        #[cfg(test)]
        crash_point("verifying");
        // Recovery must not reactivate credentials revoked after snapshot time.
        // Keep individual identities/history, then require explicit Owner review.
        let staff: Vec<String> = {
            let mut q = tx.prepare("SELECT id FROM local_principals WHERE role<>'owner'")?;
            let ids = q.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
            ids
        };
        for id in staff {
            let revision: i64 = tx.query_row(
                "SELECT revision FROM local_principals WHERE id=?1",
                [&id],
                |r| r.get(0),
            )?;
            let next = revision
                .checked_add(1)
                .ok_or(StoreError::AccessUnavailable)?;
            if tx.execute(
                "UPDATE local_principals SET enabled=0,revision=?1 WHERE id=?2",
                params![next, id],
            )? != 1
            {
                return Err(StoreError::AccessUnavailable);
            }
            crate::identity::audit(
                &tx,
                &crate::identity::scope(&tx)?,
                actor_ref,
                "recovery.staff_disabled",
                Some(&id),
            )?;
        }
        crate::lan_authority::disable_after_restore(&tx, actor_ref.unwrap_or(archived_actor))?;
        // T3: structural verification of the imported image inside the same tx.
        // Deep financial-invariant verification is test-only by design.
        integrity(&tx)?;
        // T4: completion. The only durable success point is this transaction's commit.
        transition(
            &tx,
            ownership,
            &["verifying"],
            "completed",
            None,
            Some(&new_generation),
        )?;
        audit(&tx, "restore_committed", &expected.backup_id, actor_ref)?;
        audit(
            &tx,
            "recovery.completed",
            &ownership.operation_id,
            actor_ref,
        )?;
        tx.commit()?;
        Ok(())
    })();
    let detach = store.0.execute_batch("DETACH DATABASE recovery_import;");
    let fk = store.0.pragma_update(None, "foreign_keys", "ON");
    result?;
    detach?;
    fk?;
    store.1 = None;
    #[cfg(test)]
    crash_point("completed");
    Ok(safety.to_string_lossy().into_owned())
}
#[cfg(test)]
#[path = "recovery/phase5_tests.rs"]
mod phase5_tests;
#[cfg(test)]
mod tests;
