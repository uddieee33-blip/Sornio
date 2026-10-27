//! One review workspace per Windows profile. This is local app access, not a
//! verified business identity, staff role or password-derived encryption key.
use crate::catalog::{AddProduct, AdjustStock, Product};
use crate::{Draft, SavedCopy, Snapshot, Store, StoreError};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

const HASH_PREFIX: &str = "$argon2id$v=19$m=19456,t=2,p=1$";
const MAX_ATTEMPTS: i64 = 5;
const RETRY_SECONDS: i64 = 60;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct AccessStatus {
    pub configured: bool,
    pub unlocked: bool,
}

/// Native commands own this wrapper. No renderer-provided session flag, role,
/// token, password hash, key, path or SQL can authorize a data command.
pub struct Workspace {
    store: Store,
    unlocked: bool,
}

impl Workspace {
    pub fn post_invoice(
        &mut self,
        request: crate::billing::PostInvoice,
    ) -> Result<crate::billing::Invoice, StoreError> {
        self.require_unlock()?;
        self.store.post_invoice(request)
    }
    pub fn list_invoices(
        &self,
        after: i64,
    ) -> Result<Vec<crate::billing::InvoiceRecord>, StoreError> {
        self.require_unlock()?;
        self.store.list_invoices(after)
    }
    pub fn billing_outbox(
        &self,
        after: i64,
    ) -> Result<Vec<crate::billing::OutboxRecord>, StoreError> {
        self.require_unlock()?;
        self.store.billing_outbox(after)
    }

    pub fn new(store: Store) -> Self {
        Self {
            store,
            unlocked: false,
        }
    }

    pub fn status(&self) -> Result<AccessStatus, StoreError> {
        let configured = self
            .store
            .0
            .query_row(
                "SELECT password_hash IS NOT NULL FROM workspace_access WHERE singleton = 1",
                [],
                |r| r.get::<_, bool>(0),
            )
            .optional()?
            .ok_or(StoreError::AccessUnavailable)?;
        Ok(AccessStatus {
            configured,
            unlocked: configured && self.unlocked,
        })
    }

    pub fn setup(&mut self, password: &str) -> Result<AccessStatus, StoreError> {
        if self.status()?.configured {
            return Err(StoreError::AccessConfigured);
        }
        if password.len() > 512
            || !(10..=128).contains(&password.chars().count())
            || password.trim().is_empty()
        {
            return Err(StoreError::InvalidPassword);
        }
        let mut random = [0u8; 16];
        getrandom::fill(&mut random).map_err(|_| StoreError::AccessUnavailable)?;
        let salt = SaltString::encode_b64(&random).map_err(|_| StoreError::AccessUnavailable)?;
        let hash = hasher()?
            .hash_password(password.as_bytes(), &salt)
            .map_err(|_| StoreError::AccessUnavailable)?
            .to_string();
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let configured: bool = tx
            .query_row(
                "SELECT password_hash IS NOT NULL FROM workspace_access WHERE singleton = 1",
                [],
                |r| r.get(0),
            )
            .optional()?
            .ok_or(StoreError::AccessUnavailable)?;
        if configured {
            return Err(StoreError::AccessConfigured);
        }
        let inserted = tx.execute(
            "UPDATE workspace_access SET password_hash = ?1 WHERE singleton = 1 AND password_hash IS NULL",
            [&hash],
        )?;
        if inserted != 1 {
            return Err(StoreError::AccessUnavailable);
        }
        tx.commit()?;
        self.unlocked = true;
        Ok(AccessStatus {
            configured: true,
            unlocked: true,
        })
    }

    pub fn unlock(&mut self, password: &str) -> Result<AccessStatus, StoreError> {
        self.unlocked = false;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| StoreError::AccessUnavailable)?
            .as_secs();
        let now = i64::try_from(now).map_err(|_| StoreError::AccessUnavailable)?;
        self.unlock_at(password, now)
    }

    fn unlock_at(&mut self, password: &str, now: i64) -> Result<AccessStatus, StoreError> {
        self.unlocked = false;
        if now < 0 || password.len() > 512 {
            return Err(StoreError::InvalidPassword);
        }
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (hash, attempts, retry_after): (Option<String>, i64, i64) = tx.query_row(
            "SELECT password_hash, failed_attempts, retry_after FROM workspace_access WHERE singleton = 1",
            [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        ).optional()?.ok_or(StoreError::AccessUnavailable)?;
        let hash = hash.ok_or(StoreError::AccessNotConfigured)?;
        if now < retry_after {
            return Err(StoreError::RateLimited);
        }
        // Bound verification parameters before accepting the stored PHC string.
        // The verifier otherwise uses parameters from that string, not hasher().
        if hash.len() > 128 || !hash.starts_with(HASH_PREFIX) {
            return Err(StoreError::AccessUnavailable);
        }
        let parsed = PasswordHash::new(&hash).map_err(|_| StoreError::AccessUnavailable)?;
        match hasher()?.verify_password(password.as_bytes(), &parsed) {
            Ok(()) => {
                tx.execute("UPDATE workspace_access SET failed_attempts = 0, retry_after = 0 WHERE singleton = 1", [])?;
                tx.commit()?;
                self.unlocked = true;
                Ok(AccessStatus {
                    configured: true,
                    unlocked: true,
                })
            }
            Err(argon2::password_hash::Error::Password) => {
                let previous = if retry_after > 0 { 0 } else { attempts };
                let failed = (previous + 1).min(MAX_ATTEMPTS);
                let retry = if failed == MAX_ATTEMPTS {
                    now.saturating_add(RETRY_SECONDS)
                } else {
                    0
                };
                tx.execute("UPDATE workspace_access SET failed_attempts = ?1, retry_after = ?2 WHERE singleton = 1", params![failed, retry])?;
                // Persist the failed attempt before returning an authentication
                // error. Rolling this transaction back would reset the limit.
                tx.commit()?;
                Err(if retry > 0 {
                    StoreError::RateLimited
                } else {
                    StoreError::IncorrectPassword
                })
            }
            Err(_) => Err(StoreError::AccessUnavailable),
        }
    }

    pub fn lock(&mut self) {
        self.unlocked = false;
    }

    fn require_unlock(&self) -> Result<(), StoreError> {
        if self.unlocked {
            if self.status()?.configured {
                Ok(())
            } else {
                Err(StoreError::AccessUnavailable)
            }
        } else {
            Err(StoreError::Locked)
        }
    }

    pub fn load(&self) -> Result<Snapshot, StoreError> {
        self.require_unlock()?;
        self.store.load()
    }

    pub fn save(&mut self, expected_revision: i64, draft: Draft) -> Result<Snapshot, StoreError> {
        self.require_unlock()?;
        self.store.save(expected_revision, draft)
    }

    pub fn saved_copies(&self) -> Result<Vec<SavedCopy>, StoreError> {
        self.require_unlock()?;
        self.store.saved_copies()
    }

    pub fn list_products(&self) -> Result<Vec<Product>, StoreError> {
        self.require_unlock()?;
        self.store.list_products()
    }

    pub fn add_product(&mut self, request: AddProduct) -> Result<Product, StoreError> {
        self.require_unlock()?;
        self.store.add_product(request)
    }

    pub fn adjust_stock(&mut self, request: AdjustStock) -> Result<Product, StoreError> {
        self.require_unlock()?;
        self.store.adjust_stock(request)
    }

    pub fn restore(
        &mut self,
        expected_revision: i64,
        source_revision: i64,
    ) -> Result<Snapshot, StoreError> {
        self.require_unlock()?;
        self.store.restore(expected_revision, source_revision)
    }
}

fn hasher() -> Result<Argon2<'static>, StoreError> {
    let params =
        Params::new(19 * 1024, 2, 1, Some(32)).map_err(|_| StoreError::AccessUnavailable)?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

#[cfg(test)]
mod tests {
    use super::*;
    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const PASSWORD: &str = "Sample offline password!";
    fn sample() -> Draft {
        Draft {
            business_name: "Private draft".into(),
            business_type: "kirana".into(),
            note: "Original note".into(),
        }
    }
    fn assert_locked(workspace: &mut Workspace) {
        assert!(matches!(workspace.load(), Err(StoreError::Locked)));
        assert!(matches!(
            workspace.save(0, sample()),
            Err(StoreError::Locked)
        ));
        assert!(matches!(workspace.saved_copies(), Err(StoreError::Locked)));
        assert!(matches!(workspace.restore(1, 1), Err(StoreError::Locked)));
        assert!(matches!(workspace.list_products(), Err(StoreError::Locked)));
        assert!(matches!(
            workspace.add_product(AddProduct {
                operation_id: "locked-product".into(),
                name: "Sample".into(),
                sku: "".into(),
                unit: "pcs".into(),
                unit_price_paise: 100,
                opening_stock_milli: 1000,
            }),
            Err(StoreError::Locked)
        ));
        assert!(matches!(
            workspace.adjust_stock(AdjustStock {
                operation_id: "locked-adjust".into(),
                product_id: "locked-product".into(),
                expected_revision: 1,
                delta_milli: 1000,
                reason: "Count".into(),
            }),
            Err(StoreError::Locked)
        ));
    }

    #[test]
    fn every_data_command_requires_native_unlock() {
        let dir = tempfile::tempdir().unwrap();
        let mut workspace = Workspace::new(Store::open(&dir.path().join("store.db"), KEY).unwrap());
        assert_eq!(
            workspace.status().unwrap(),
            AccessStatus {
                configured: false,
                unlocked: false
            }
        );
        assert_locked(&mut workspace);
        workspace.setup(PASSWORD).unwrap();
        workspace.save(0, sample()).unwrap();
        assert_eq!(workspace.load().unwrap().revision, 1);
        workspace.lock();
        assert_locked(&mut workspace);
        workspace.unlock(PASSWORD).unwrap();
        assert_eq!(workspace.saved_copies().unwrap().len(), 1);
    }

    #[test]
    fn restarting_locks_without_changing_saved_drafts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut first = Workspace::new(Store::open(&path, KEY).unwrap());
        first.setup(PASSWORD).unwrap();
        first.save(0, sample()).unwrap();
        drop(first);
        let mut reopened = Workspace::new(Store::open(&path, KEY).unwrap());
        assert_eq!(
            reopened.status().unwrap(),
            AccessStatus {
                configured: true,
                unlocked: false
            }
        );
        assert_locked(&mut reopened);
        assert!(matches!(
            reopened.unlock("Wrong password"),
            Err(StoreError::IncorrectPassword)
        ));
        assert_locked(&mut reopened);
        reopened.unlock(PASSWORD).unwrap();
        assert_eq!(reopened.load().unwrap().draft, Some(sample()));
        assert_eq!(reopened.restore(1, 1).unwrap().revision, 2);
    }

    #[test]
    fn setup_cannot_replace_another_instances_credentials() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut a = Workspace::new(Store::open(&path, KEY).unwrap());
        let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
        a.setup(PASSWORD).unwrap();
        assert!(matches!(
            b.setup("Different password!"),
            Err(StoreError::AccessConfigured)
        ));
        assert_locked(&mut b);
        b.unlock(PASSWORD).unwrap();
        a.lock();
        assert_locked(&mut a); // A lock/session never grants B's session to A.
        assert!(b.status().unwrap().unlocked);
    }

    #[test]
    fn failed_attempt_limit_survives_process_reopen_and_clock_rollback() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut a = Workspace::new(Store::open(&path, KEY).unwrap());
        a.setup(PASSWORD).unwrap();
        for _ in 0..4 {
            assert!(matches!(
                a.unlock_at("Wrong password", 100),
                Err(StoreError::IncorrectPassword)
            ));
        }
        drop(a);
        let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
        assert!(matches!(
            b.unlock_at("Wrong password", 100),
            Err(StoreError::RateLimited)
        ));
        assert!(matches!(
            b.unlock_at(PASSWORD, 99),
            Err(StoreError::RateLimited)
        ));
        assert!(matches!(
            b.unlock_at(PASSWORD, 159),
            Err(StoreError::RateLimited)
        ));
        assert_locked(&mut b);
        b.unlock_at(PASSWORD, 160).unwrap();
        assert!(matches!(
            b.unlock_at("Wrong password", 160),
            Err(StoreError::IncorrectPassword)
        ));
        assert_locked(&mut b);
    }

    #[test]
    fn failed_access_writes_never_unlock_the_session() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::new(Store::open(&dir.path().join("store.db"), KEY).unwrap());
        w.store.0.pragma_update(None, "query_only", true).unwrap();
        assert!(w.setup(PASSWORD).is_err());
        assert_locked(&mut w);
        w.store.0.pragma_update(None, "query_only", false).unwrap();
        w.setup(PASSWORD).unwrap();
        w.lock();
        w.store.0.pragma_update(None, "query_only", true).unwrap();
        assert!(w.unlock(PASSWORD).is_err());
        assert_locked(&mut w);
        assert!(w.unlock("Wrong password").is_err());
        assert_locked(&mut w);
    }

    #[test]
    fn old_drafts_migrate_to_locked_access_without_reset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut legacy = Store::open(&path, KEY).unwrap();
        legacy.save(0, sample()).unwrap();
        legacy
            .0
            .execute_batch("DROP TABLE local_billing_outbox; DROP TABLE local_billing_audit; DROP TABLE local_billing_ledger; DROP TABLE local_invoice_stock; DROP TABLE local_invoices; DROP TABLE local_inventory_events; DROP TABLE local_products; DROP TABLE workspace_access; PRAGMA user_version = 2;")
            .unwrap();
        drop(legacy);
        let mut migrated = Workspace::new(Store::open(&path, KEY).unwrap());
        assert_locked(&mut migrated);
        migrated.setup(PASSWORD).unwrap();
        assert_eq!(migrated.load().unwrap().draft, Some(sample()));
        assert_eq!(migrated.saved_copies().unwrap().len(), 1);
    }

    #[test]
    fn invalid_passwords_and_malformed_hashes_fail_closed() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::new(Store::open(&dir.path().join("store.db"), KEY).unwrap());
        for p in ["short".to_owned(), " ".repeat(10), "x".repeat(129)] {
            assert!(matches!(w.setup(&p), Err(StoreError::InvalidPassword)));
        }
        assert!(matches!(
            w.unlock(PASSWORD),
            Err(StoreError::AccessNotConfigured)
        ));
        w.setup(PASSWORD).unwrap();
        w.store
            .0
            .execute(
                "UPDATE workspace_access SET password_hash = ?1",
                ["$argon2id$v=19$m=4294967295,t=2,p=1$bad$bad"],
            )
            .unwrap();
        assert!(matches!(
            w.unlock(PASSWORD),
            Err(StoreError::AccessUnavailable)
        ));
        assert_locked(&mut w);
    }

    #[test]
    fn password_hashes_use_unique_salts_and_no_plaintext_password() {
        let dir = tempfile::tempdir().unwrap();
        let mut hashes = Vec::new();
        for name in ["a.db", "b.db"] {
            let mut w = Workspace::new(Store::open(&dir.path().join(name), KEY).unwrap());
            w.setup(PASSWORD).unwrap();
            let hash: String = w
                .store
                .0
                .query_row("SELECT password_hash FROM workspace_access", [], |r| {
                    r.get(0)
                })
                .unwrap();
            assert!(hash.starts_with(HASH_PREFIX));
            assert!(!hash.contains(PASSWORD));
            hashes.push(hash);
        }
        assert_ne!(hashes[0], hashes[1]);
    }

    #[test]
    fn missing_access_record_never_becomes_a_password_reset() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::new(Store::open(&dir.path().join("store.db"), KEY).unwrap());
        w.setup(PASSWORD).unwrap();
        w.save(0, sample()).unwrap();
        w.store
            .0
            .execute("DELETE FROM workspace_access", [])
            .unwrap();
        assert!(matches!(w.load(), Err(StoreError::AccessUnavailable)));
        assert!(matches!(w.status(), Err(StoreError::AccessUnavailable)));
        assert!(matches!(
            w.setup("Replacement password"),
            Err(StoreError::AccessUnavailable)
        ));
        assert!(matches!(
            w.unlock(PASSWORD),
            Err(StoreError::AccessUnavailable)
        ));
        assert_locked(&mut w);
        assert_eq!(w.store.load().unwrap().draft, Some(sample()));
    }
}
