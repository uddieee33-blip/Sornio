//! Versioned SQLCipher snapshots. No plaintext database, device key export, or password reset.
use crate::{Store, StoreError, SCHEMA_VERSION};
use rusqlite::{params, types::ValueRef, Connection, OpenFlags, TransactionBehavior};
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
        if kind != "table"
            || (live
                && matches!(
                    name.as_str(),
                    "local_recovery_audit" | "local_identity_audit"
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
    } else if version == 13 || version == 12 {
        let reference = Store::open(Path::new(":memory:"), &random_id()?)?;
        let mut expected = schema(&reference.0)?;
        expected.retain(|(_, name, _)| !name.starts_with("local_restaurant_") && (version != 12 || !name.starts_with("local_held_bills")));
        expected
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
    password(secret)?;
    // Recovery passphrase must be separate from the local login password (checked by adapter).
    if destination.exists() {
        return Err(StoreError::BackupStorage);
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
    storage(fs::create_dir_all(safety_dir))?;
    let safety = safety_dir.join(format!(
        "sornio-before-restore-{}.sorniobackup",
        random_id()?
    ));
    // Must succeed before destructive work. The separate passphrase also protects this safety copy.
    export(store, &safety, secret)?;

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
        // Detect another process writing between preview/safety copy and the writer lock.
        if fingerprint(&tx)? != expected.current_fingerprint {
            return Err(StoreError::RecoveryChanged);
        }
        check_business(&tx, &expected.business_id)?;
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
        if tx.execute(
            "UPDATE local_recovery_identity SET generation=?1 WHERE singleton=1",
            [random_id()?],
        )? != 1
        {
            return Err(StoreError::AccessUnavailable);
        }
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
                actor.as_ref().or(Some(&archived_actor)),
                "recovery.staff_disabled",
                Some(&id),
            )?;
        }
        crate::lan_authority::disable_after_restore(
            &tx,
            actor.as_ref().unwrap_or(&archived_actor),
        )?;
        audit(
            &tx,
            "restore_committed",
            &expected.backup_id,
            actor.as_ref().or(Some(&archived_actor)),
        )?;
        integrity(&tx)?;
        tx.commit()?;
        Ok(())
    })();
    let detach = store.0.execute_batch("DETACH DATABASE recovery_import;");
    let fk = store.0.pragma_update(None, "foreign_keys", "ON");
    result?;
    detach?;
    fk?;
    store.1 = None;
    Ok(safety.to_string_lossy().into_owned())
}
#[cfg(test)]
mod tests;
