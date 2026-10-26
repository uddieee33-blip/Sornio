//! First offline slice: encrypted, versioned local workspace drafts.
//! No cloud client, financial commands, account provisioning or sync yet.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};
use thiserror::Error;

#[cfg(windows)]
pub mod device;

#[derive(Debug, Error)]
pub enum StoreError {
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
    #[error("Choose a business type and keep the draft within its size limits.")]
    InvalidDraft,
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

pub struct Store(Connection);

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
        if version > 1 {
            return Err(StoreError::NewerSchema);
        }
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.pragma_update(None, "synchronous", "FULL")?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        db.pragma_update(None, "cipher_memory_security", "ON")?;
        if version == 0 {
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            tx.execute_batch(
                "CREATE TABLE workspace_draft (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                revision INTEGER NOT NULL CHECK (revision > 0),
                payload TEXT NOT NULL
            ); PRAGMA user_version = 1;",
            )?;
            tx.commit()?;
        }
        Ok(Self(db))
    }

    pub fn load(&self) -> Result<Snapshot, StoreError> {
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
    pub fn save(&mut self, expected_revision: i64, draft: Draft) -> Result<Snapshot, StoreError> {
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
        let payload = serde_json::to_string(&draft)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
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
        store.0.pragma_update(None, "user_version", 2).unwrap();
        drop(store);
        assert!(matches!(
            Store::open(&path, KEY),
            Err(StoreError::NewerSchema)
        ));
    }
}
