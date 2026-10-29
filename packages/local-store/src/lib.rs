//! Encrypted drafts, catalogue and atomic cash/credit invoice posting.
//! One review workspace; verified business identity and sync transport remain separate.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};
use thiserror::Error;

pub mod access;
pub mod billing;
pub mod catalog;
pub mod checkout;
pub mod customers;
pub mod identity;
pub mod inventory_recovery;
pub mod payments;

#[cfg(windows)]
pub mod device;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("Check payment amounts, references, return quantities and closing values.")]
    InvalidPayment,
    #[error("Payment or closing changed. Refresh it before continuing.")]
    PaymentConflict,
    #[error("That reference already belongs to another active manual match.")]
    DuplicateSettlement,
    #[error("This cashier day is closed. An owner or manager must reopen it with a reason.")]
    DayClosed,
    #[error("This account has adjusted credit history. Automatic credit returns are unavailable; review an explicit accounting and stock correction.")]
    ComplexCreditReturn,
    #[error("The local database could not be opened or saved. Keep the original files and retry.")]
    Database(#[from] rusqlite::Error),
    #[error("The database encryption key is invalid.")]
    InvalidKey,
    #[error("Encrypted SQLite support is unavailable. No data was saved.")]
    EncryptionUnavailable,
    #[error("This database needs a newer Sornio version.")]
    NewerSchema,
    #[error("Another window changed this draft. Reopen it before saving again.")]
    Conflict,
    #[error("That saved copy is no longer available. Refresh saved copies and try again.")]
    MissingRevision,
    #[error("This account does not have permission for that action.")]
    Forbidden,
    #[error("This request belongs to another business or workspace.")]
    WorkspaceMismatch,
    #[error("That account name already exists. Reload staff to confirm before retrying.")]
    AccountExists,
    #[error("Check the business, account name and role.")]
    InvalidIdentity,
    #[error("Unlock this workspace to continue.")]
    Locked,
    #[error("Local access is already configured. Unlock with the existing password.")]
    AccessConfigured,
    #[error("Set up local access before unlocking this workspace.")]
    AccessNotConfigured,
    #[error("Use a password of 10–128 characters, with at least one non-space character.")]
    InvalidPassword,
    #[error("That password did not unlock this workspace.")]
    IncorrectPassword,
    #[error("Too many attempts. Wait 60 seconds before trying again.")]
    RateLimited,
    #[error("Local access could not be checked. Keep the original database and Windows profile.")]
    AccessUnavailable,
    #[error("Choose a business type and keep the draft within its size limits.")]
    InvalidDraft,
    #[error("Check the item name, unit, price and stock quantity.")]
    InvalidProduct,
    #[error("Check the customer identifier, name, phone and credit settings.")]
    InvalidCustomer,
    #[error("Choose an existing customer account before recording credit.")]
    CustomerMissing,
    #[error("Check the amount, date and correction reason.")]
    InvalidCredit,
    #[error("This customer's account changed. Refresh its balance before continuing.")]
    CreditConflict,
    #[error("The repayment or correction exceeds this customer's outstanding balance.")]
    Overpayment,
    #[error("This sale would exceed the customer's credit limit.")]
    CreditLimit,
    #[error("A credit account with collections or adjustments cannot be relinked. Preserve its history and use an authorized correction.")]
    CreditAlreadyCollected,
    #[error(
        "The credit entry could not be saved or read. Keep its operation ID and retry safely."
    )]
    CreditUnavailable,
    #[error("Check invoice items, tax rate and cash/credit customer reference.")]
    InvalidInvoice,
    #[error(
        "Another checkout is active or its result changed. Reload checkout before continuing."
    )]
    CheckoutActive,
    #[error("That item code is already in use. Choose another code.")]
    DuplicateSku,
    #[error("Another window changed this stock. Reload items before adjusting it.")]
    StockConflict,
    #[error("This save ID already belongs to different input. Reload items before continuing.")]
    OperationConflict,
    #[error("The item could not be found. Reload items before continuing.")]
    ProductMissing,
    #[error("The stock change would leave an invalid quantity. Check the count.")]
    InvalidStock,
    #[error("This review supports up to 5,000 items.")]
    CatalogFull,
    #[error("The saved draft could not be read. Keep the original files for recovery.")]
    InvalidData(#[from] serde_json::Error),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    pub business_name: String,
    pub business_type: String,
    pub note: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Snapshot {
    pub revision: i64,
    pub draft: Option<Draft>,
}

/// Includes the current copy. Restoring creates a new revision, never rewinds it.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct SavedCopy {
    pub revision: i64,
    pub draft: Draft,
}

const SCHEMA_VERSION: i64 = 10;
const HISTORY_LIMIT: i64 = 20;

pub struct Store(Connection, Option<identity::Session>);

impl Store {
    /// A random 256-bit hex secret comes from the native credential vault.
    /// Never accept a key or database path from the renderer.
    pub fn open(path: &Path, key: &str) -> Result<Self, StoreError> {
        if key.len() != 64 || !key.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(StoreError::InvalidKey);
        }
        let mut db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.pragma_update(None, "key", key)?;
        let cipher: Option<String> = db
            .query_row("PRAGMA cipher_version", [], |row| row.get(0))
            .optional()?;
        if cipher.as_deref().unwrap_or("").is_empty() {
            return Err(StoreError::EncryptionUnavailable);
        }
        // This reads an encrypted page before any migration. Wrong/missing keys
        // must fail closed, never replace an unreadable database with a new one.
        let version: i64 = db.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > SCHEMA_VERSION {
            return Err(StoreError::NewerSchema);
        }
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.pragma_update(None, "synchronous", "FULL")?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        // REPLACE deletes conflicting rows internally. Its delete triggers only
        // fire with recursive triggers enabled; otherwise append-only history
        // could be replaced despite the UPDATE/DELETE guards.
        db.pragma_update(None, "recursive_triggers", "ON")?;
        db.pragma_update(None, "cipher_memory_security", "ON")?;
        if version < SCHEMA_VERSION {
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            // Re-read after acquiring the write lock: another process may have
            // migrated while this connection waited for the transaction.
            let locked_version: i64 = tx.pragma_query_value(None, "user_version", |r| r.get(0))?;
            if locked_version > SCHEMA_VERSION {
                return Err(StoreError::NewerSchema);
            }
            if locked_version == 0 {
                tx.execute_batch(
                    "CREATE TABLE workspace_draft (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                revision INTEGER NOT NULL CHECK (revision > 0),
                payload TEXT NOT NULL
                );",
                )?;
            }
            if locked_version < 2 {
                tx.execute_batch(
                    "CREATE TABLE workspace_history (
                    revision INTEGER PRIMARY KEY CHECK (revision > 0),
                    payload TEXT NOT NULL
                );
                INSERT INTO workspace_history(revision, payload)
                    SELECT revision, payload FROM workspace_draft;
                PRAGMA user_version = 2;",
                )?;
            }
            if locked_version < 3 {
                tx.execute_batch("CREATE TABLE workspace_access (
                    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                    password_hash TEXT,
                    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
                    retry_after INTEGER NOT NULL DEFAULT 0 CHECK (retry_after >= 0)
                );
                INSERT INTO workspace_access(singleton) VALUES (1);
                PRAGMA user_version = 3;")?;
            }
            if locked_version < 4 {
                catalog::migrate(&tx)?;
            }
            if locked_version < 5 {
                billing::migrate(&tx)?;
            }
            if locked_version < 6 {
                checkout::migrate(&tx)?;
            }
            if locked_version < 7 {
                identity::migrate(&tx)?;
            }
            if locked_version < 8 {
                customers::migrate(&tx)?;
            }
            if locked_version < 9 {
                payments::migrate(&tx)?;
            }
            if locked_version < 10 {
                inventory_recovery::migrate(&tx)?;
            }
            tx.commit()?;
        }
        Ok(Self(db, None))
    }

    pub(crate) fn load(&self) -> Result<Snapshot, StoreError> {
        let raw: Option<(i64, String)> = self
            .0
            .query_row(
                "SELECT revision, payload FROM workspace_draft WHERE singleton = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        match raw {
            Some((revision, payload)) => Ok(Snapshot {
                revision,
                draft: Some(serde_json::from_str(&payload)?),
            }),
            None => Ok(Snapshot {
                revision: 0,
                draft: None,
            }),
        }
    }

    /// Return success only after SQLite commits; stale windows cannot overwrite.
    pub(crate) fn save(
        &mut self,
        expected_revision: i64,
        draft: Draft,
    ) -> Result<Snapshot, StoreError> {
        Self::validate(expected_revision, &draft)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        crate::identity::guard(
            &tx,
            &self.1,
            crate::identity::Permission::Settings,
            "settings.saved",
            None,
        )?;
        Self::commit_draft(tx, expected_revision, draft)
    }

    pub(crate) fn saved_copies(&self) -> Result<Vec<SavedCopy>, StoreError> {
        let mut statement = self.0.prepare(
            "SELECT revision, payload FROM workspace_history ORDER BY revision DESC LIMIT ?1",
        )?;
        let rows = statement.query_map([HISTORY_LIMIT], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })?;
        let mut copies = Vec::new();
        for row in rows {
            let (revision, payload) = row?;
            copies.push(SavedCopy {
                revision,
                draft: serde_json::from_str(&payload)?,
            });
        }
        Ok(copies)
    }

    /// Fetch and restore under one write lock. Stale writers or pruned copies
    /// must leave the current draft and history untouched.
    pub(crate) fn restore(
        &mut self,
        expected_revision: i64,
        source_revision: i64,
    ) -> Result<Snapshot, StoreError> {
        if expected_revision < 0 || source_revision <= 0 {
            return Err(StoreError::MissingRevision);
        }
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        crate::identity::guard(
            &tx,
            &self.1,
            crate::identity::Permission::Settings,
            "settings.restored",
            None,
        )?;
        let payload: String = tx
            .query_row(
                "SELECT payload FROM workspace_history WHERE revision = ?1",
                [source_revision],
                |r| r.get(0),
            )
            .optional()?
            .ok_or(StoreError::MissingRevision)?;
        let draft: Draft = serde_json::from_str(&payload)?;
        Self::validate(expected_revision, &draft)?;
        Self::commit_draft(tx, expected_revision, draft)
    }

    fn validate(expected_revision: i64, draft: &Draft) -> Result<(), StoreError> {
        const TYPES: &[&str] = &[
            "gym",
            "cafe",
            "kirana",
            "salon",
            "electronics",
            "boutique",
            "service",
            "general",
        ];
        if expected_revision < 0
            || draft.business_name.trim().is_empty()
            || draft.business_name.len() > 240
            || draft.note.len() > 8_000
            || !TYPES.contains(&draft.business_type.as_str())
        {
            return Err(StoreError::InvalidDraft);
        }
        Ok(())
    }

    fn commit_draft(
        tx: rusqlite::Transaction<'_>,
        expected_revision: i64,
        draft: Draft,
    ) -> Result<Snapshot, StoreError> {
        let payload = serde_json::to_string(&draft)?;
        let revision: i64 = tx
            .query_row(
                "SELECT revision FROM workspace_draft WHERE singleton = 1",
                [],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(0);
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let next = revision.checked_add(1).ok_or(StoreError::Conflict)?;
        tx.execute("INSERT INTO workspace_draft(singleton, revision, payload) VALUES(1, ?1, ?2)
            ON CONFLICT(singleton) DO UPDATE SET revision = excluded.revision, payload = excluded.payload",
            params![next, payload])?;
        tx.execute(
            "INSERT INTO workspace_history(revision, payload) VALUES (?1, ?2)",
            params![next, payload],
        )?;
        tx.execute(
            "DELETE FROM workspace_history WHERE revision NOT IN (
            SELECT revision FROM workspace_history ORDER BY revision DESC LIMIT ?1
        )",
            [HISTORY_LIMIT],
        )?;
        tx.commit()?;
        Ok(Snapshot {
            revision: next,
            draft: Some(draft),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    fn draft() -> Draft {
        Draft {
            business_name: "Private sample shop".into(),
            business_type: "kirana".into(),
            note: "Restart without a network".into(),
        }
    }

    #[test]
    fn encrypted_draft_survives_close_and_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        {
            let mut store = Store::open(&path, KEY).unwrap();
            assert_eq!(store.load().unwrap().revision, 0);
            store.save(0, draft()).unwrap();
        }
        let store = Store::open(&path, KEY).unwrap();
        assert_eq!(
            store.load().unwrap(),
            Snapshot {
                revision: 1,
                draft: Some(draft())
            }
        );
        for entry in std::fs::read_dir(dir.path()).unwrap() {
            let bytes = std::fs::read(entry.unwrap().path()).unwrap();
            assert!(!bytes
                .windows(b"Private sample shop".len())
                .any(|w| w == b"Private sample shop"));
        }
        let plain = Connection::open(&path).unwrap();
        assert!(plain
            .query_row("SELECT name FROM sqlite_master", [], |r| r
                .get::<_, String>(0))
            .is_err());
    }

    #[test]
    fn wrong_key_does_not_replace_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        {
            Store::open(&path, KEY).unwrap().save(0, draft()).unwrap();
        }
        assert!(Store::open(&path, &"f".repeat(64)).is_err());
        assert_eq!(
            Store::open(&path, KEY).unwrap().load().unwrap().draft,
            Some(draft())
        );
    }

    #[test]
    fn stale_writers_and_invalid_input_leave_original_intact() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut a = Store::open(&path, KEY).unwrap();
        let mut b = Store::open(&path, KEY).unwrap();
        a.save(0, draft()).unwrap();
        assert!(matches!(b.save(0, draft()), Err(StoreError::Conflict)));
        let mut invalid = draft();
        invalid.note = "x".repeat(8_001);
        assert!(matches!(a.save(1, invalid), Err(StoreError::InvalidDraft)));
        assert_eq!(a.load().unwrap().revision, 1);
    }

    #[test]
    fn database_failure_never_reports_a_successful_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut store = Store::open(&path, KEY).unwrap();
        store.save(0, draft()).unwrap();
        store.0.pragma_update(None, "query_only", true).unwrap();
        assert!(store.save(1, draft()).is_err());
        assert_eq!(store.load().unwrap().revision, 1);
    }

    #[test]
    fn unsupported_schema_and_invalid_keys_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        assert!(matches!(
            Store::open(&path, "short"),
            Err(StoreError::InvalidKey)
        ));
        let store = Store::open(&path, KEY).unwrap();
        store
            .0
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        drop(store);
        assert!(matches!(
            Store::open(&path, KEY),
            Err(StoreError::NewerSchema)
        ));
    }

    #[test]
    fn version_one_migration_preserves_draft_and_seeds_history() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        {
            let mut old = Store::open(&path, KEY).unwrap();
            old.save(0, draft()).unwrap();
            old.0
                .execute_batch("DROP TABLE local_inventory_pending; DROP TABLE local_inventory_outbox; DROP TABLE local_inventory_actors; DROP TABLE local_retail_outbox; DROP TABLE local_retail_pending; DROP TABLE local_retail_canceled; DROP TABLE local_retail_events; DROP TABLE local_retail_journal; DROP TABLE local_retail_activity; DROP TABLE local_retail_return_items; DROP TABLE local_retail_return_parts; DROP TABLE local_retail_refunds; DROP TABLE local_retail_returns; DROP TABLE local_retail_payments; DROP TABLE local_retail_float_corrections; DROP TABLE local_retail_floats; DROP TABLE local_retail_closings; DROP TABLE local_retail_ops; DROP TABLE local_customer_journal; DROP TABLE local_customer_outbox; DROP TABLE local_customer_pending; DROP TABLE local_customer_canceled; DROP TABLE local_credit_entries; DROP TABLE local_customer_ops; DROP TABLE local_customers; DROP TABLE local_checkout_canceled; DROP TABLE local_checkout; DROP TABLE local_invoice_actors; DROP TABLE local_identity_audit; DROP TABLE local_principals; DROP TABLE local_identity; DROP TABLE local_billing_outbox; DROP TABLE local_billing_audit; DROP TABLE local_billing_ledger; DROP TABLE local_invoice_stock; DROP TABLE local_invoices; DROP TABLE local_inventory_events; DROP TABLE local_products; DROP TABLE workspace_history; DROP TABLE workspace_access; PRAGMA user_version = 1;")
                .unwrap();
        }
        let migrated = Store::open(&path, KEY).unwrap();
        assert_eq!(migrated.load().unwrap().draft, Some(draft()));
        assert_eq!(
            migrated.saved_copies().unwrap(),
            vec![SavedCopy {
                revision: 1,
                draft: draft()
            }]
        );
        drop(migrated);
        assert_eq!(
            Store::open(&path, KEY)
                .unwrap()
                .saved_copies()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn restoring_creates_a_new_revision_and_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut store = Store::open(&path, KEY).unwrap();
        store.save(0, draft()).unwrap();
        let mut changed = draft();
        changed.note = "A different note".into();
        store.save(1, changed.clone()).unwrap();
        assert_eq!(
            store.restore(2, 1).unwrap(),
            Snapshot {
                revision: 3,
                draft: Some(draft())
            }
        );
        drop(store);
        let reopened = Store::open(&path, KEY).unwrap();
        assert_eq!(reopened.load().unwrap().revision, 3);
        let history = reopened.saved_copies().unwrap();
        assert_eq!(
            history.iter().map(|c| c.revision).collect::<Vec<_>>(),
            vec![3, 2, 1]
        );
        assert_eq!(history[1].draft, changed);
        assert_eq!(history[0].draft, draft());
    }

    #[test]
    fn stale_restore_and_missing_copy_cannot_replace_newer_work() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut a = Store::open(&path, KEY).unwrap();
        let mut b = Store::open(&path, KEY).unwrap();
        a.save(0, draft()).unwrap();
        let mut newest = draft();
        newest.note = "Newer committed work".into();
        a.save(1, newest.clone()).unwrap();
        assert!(matches!(b.restore(1, 1), Err(StoreError::Conflict)));
        assert!(matches!(
            b.restore(2, 999),
            Err(StoreError::MissingRevision)
        ));
        assert!(matches!(b.restore(2, -1), Err(StoreError::MissingRevision)));
        assert_eq!(a.load().unwrap().draft, Some(newest));
        assert_eq!(a.saved_copies().unwrap().len(), 2);
    }

    #[test]
    fn retention_is_bounded_and_pruned_revisions_cannot_be_restored() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join("store.db"), KEY).unwrap();
        for revision in 0..25 {
            store.save(revision, draft()).unwrap();
        }
        let history = store.saved_copies().unwrap();
        assert_eq!(history.len(), HISTORY_LIMIT as usize);
        assert_eq!(history.first().unwrap().revision, 25);
        assert_eq!(history.last().unwrap().revision, 6);
        assert!(matches!(
            store.restore(25, 1),
            Err(StoreError::MissingRevision)
        ));
        assert_eq!(store.load().unwrap().revision, 25);
    }

    #[test]
    fn history_write_failure_rolls_back_both_save_and_restore() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join("store.db"), KEY).unwrap();
        store.save(0, draft()).unwrap();
        let mut changed = draft();
        changed.note = "Must never be committed".into();
        store
            .0
            .execute_batch(
                "CREATE TRIGGER fail_history BEFORE INSERT ON workspace_history
            BEGIN SELECT RAISE(ABORT, 'Simulated storage failure'); END;",
            )
            .unwrap();
        assert!(store.save(1, changed).is_err());
        assert!(store.restore(1, 1).is_err());
        assert_eq!(
            store.load().unwrap(),
            Snapshot {
                revision: 1,
                draft: Some(draft())
            }
        );
        assert_eq!(store.saved_copies().unwrap().len(), 1);
    }
}
