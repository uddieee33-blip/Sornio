//! Native sessions; each command revalidates scope, revision, role and expiry.
use crate::identity::{
    self, AuditEntry, LocalSession, OwnerSetup, Permission, Principal, Scope, StaffChange,
    StaffDetails,
};
use crate::{
    catalog::{AddProduct, AdjustStock, Product},
    Draft, SavedCopy, Snapshot, Store, StoreError,
};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use std::{
    cell::Cell,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
const HASH_PREFIX: &str = "$argon2id$v=19$m=19456,t=2,p=1$";
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct AccessStatus {
    pub configured: bool,
    pub unlocked: bool,
}
pub struct Workspace {
    store: Store,
    last_activity: Cell<Instant>,
}
impl Workspace {
    #[cfg(test)]
    pub(crate) fn store_for_test(&self) -> &Store {
        &self.store
    }
    /// Native enrollment only; no renderer or listener command is registered yet.
    pub fn enroll_lan_device(
        &mut self,
        request: crate::lan_authority::Enrollment,
        owner_password: &str,
    ) -> Result<crate::lan_authority::Device, StoreError> {
        let owner = self.require(Permission::Staff)?;
        self.login(&owner.username, owner_password)?;
        crate::lan_authority::enroll(&mut self.store, request)
    }
    pub fn change_lan_device(
        &mut self,
        id: &str,
        revision: i64,
        enabled: bool,
        capability: crate::lan_authority::Capability,
        owner_password: &str,
    ) -> Result<(), StoreError> {
        let owner = self.require(Permission::Staff)?;
        self.login(&owner.username, owner_password)?;
        crate::lan_authority::change(&mut self.store, id, revision, enabled, capability)
    }
    pub fn list_lan_devices(&self) -> Result<Vec<crate::lan_authority::Device>, StoreError> {
        self.read(Permission::Staff, |s| crate::lan_authority::list(&s.0))
    }
    /// The future TLS adapter must own a separate Workspace for authentication.
    /// The verified peer and session cannot be deserialized from an IPC request.
    pub fn authenticate_lan_peer(
        &mut self,
        peer: &crate::lan_authority::VerifiedPeer,
        scope: &Scope,
        generation: &str,
        username: &str,
        password: &str,
    ) -> Result<crate::lan_authority::Session, StoreError> {
        self.lock();
        crate::lan_authority::preauthenticate(&self.store.0, peer, scope, generation)?;
        self.login(username, password)?;
        crate::lan_authority::bind(&mut self.store, peer, scope, generation)
    }
    pub fn lan_products(
        &self,
        peer: &crate::lan_authority::VerifiedPeer,
        session: &crate::lan_authority::Session,
        scope: &Scope,
        generation: &str,
    ) -> Result<Vec<Product>, StoreError> {
        crate::lan_authority::products(&self.store, peer, session, scope, generation)
    }
    pub fn post_lan_cash_invoice(
        &mut self,
        peer: &crate::lan_authority::VerifiedPeer,
        session: &crate::lan_authority::Session,
        scope: &Scope,
        generation: &str,
        request: crate::billing::PostInvoice,
    ) -> Result<crate::lan_authority::Receipt, StoreError> {
        crate::lan_authority::post(&mut self.store, peer, session, scope, generation, request)
    }
    pub(crate) fn into_recovery_store(self) -> Store {
        self.store
    }
    pub(crate) fn store_owner_username(&self) -> Result<String, StoreError> {
        Ok(self.store.0.query_row(
            "SELECT username FROM local_principals WHERE role='owner' AND enabled=1",
            [],
            |r| r.get(0),
        )?)
    }

    fn recovery_authorize(&mut self, password: &str) -> Result<(), StoreError> {
        if self.status()?.configured {
            self.require(Permission::Settings)?;
        }
        if self.status()?.configured {
            let username: String = self.store.0.query_row(
                "SELECT username FROM local_principals WHERE role='owner' AND enabled=1",
                [],
                |r| r.get(0),
            )?;
            self.login(&username, password)?;
            self.require(Permission::Settings)?;
        }
        Ok(())
    }

    pub fn last_restore(&self) -> Result<Option<crate::recovery::RestoreReceipt>, StoreError> {
        self.read(Permission::Settings, |s| Ok(s.0.query_row(
            "SELECT backup_id,created_at FROM local_recovery_audit WHERE action='restore_committed' ORDER BY seq DESC LIMIT 1", [],
            |r| Ok(crate::recovery::RestoreReceipt { backup_id:r.get(0)?,created_at:r.get(1)? }),
        ).optional()?))
    }

    /// Paths come from the native file picker, never renderer-provided paths.
    pub fn export_backup(
        &mut self,
        destination: &std::path::Path,
        current_password: &str,
        recovery_password: &str,
    ) -> Result<crate::recovery::BackupPreview, StoreError> {
        self.require(Permission::Settings)?;
        self.recovery_authorize(current_password)?;
        if current_password == recovery_password {
            return Err(StoreError::InvalidRecoveryPassword);
        }
        crate::recovery::export(&mut self.store, destination, recovery_password)
    }

    pub fn preview_backup(
        &mut self,
        source: &std::path::Path,
        current_password: &str,
        recovery_password: &str,
        original_password: &str,
    ) -> Result<crate::recovery::BackupPreview, StoreError> {
        self.recovery_authorize(current_password)?;
        let result = crate::recovery::preview(
            &mut self.store,
            source,
            recovery_password,
            original_password,
        );
        if matches!(
            &result,
            Err(StoreError::IncorrectPassword | StoreError::RateLimited)
        ) {
            self.lock();
        }
        result
    }

    pub fn restore_backup(
        &mut self,
        source: &std::path::Path,
        safety_directory: &std::path::Path,
        current_password: &str,
        recovery_password: &str,
        original_password: &str,
        preview: &crate::recovery::BackupPreview,
        confirmation: &str,
    ) -> Result<String, StoreError> {
        self.recovery_authorize(current_password)?;
        let result = crate::recovery::restore(
            &mut self.store,
            source,
            safety_directory,
            recovery_password,
            original_password,
            preview,
            confirmation,
        );
        self.lock();
        result
    }

    pub fn new(mut store: Store) -> Self {
        store.1 = None;
        Self {
            store,
            last_activity: Cell::new(Instant::now()),
        }
    }
    pub fn status(&self) -> Result<AccessStatus, StoreError> {
        identity::scope(&self.store.0)?;
        let configured: bool = self.store.0.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_principals WHERE role='owner')",
            [],
            |r| r.get(0),
        )?;
        Ok(AccessStatus {
            configured,
            unlocked: self.authorize(Permission::View).is_ok(),
        })
    }
    pub fn local_session(&self) -> Result<LocalSession, StoreError> {
        let principal = self.authorize(Permission::View)?;
        Ok(LocalSession {
            scope: identity::scope(&self.store.0)?,
            principal,
            business_name: self.store.0.query_row(
                "SELECT business_name FROM local_identity WHERE singleton=1",
                [],
                |r| r.get(0),
            )?,
        })
    }
    /// Boundary shared by IPC and future transport adapters. A supplied scope
    /// never selects a database and never grants authority.
    pub fn run_scoped<T>(
        &mut self,
        scope: &Scope,
        operation: impl FnOnce(&mut Self) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        let result = self.verify_scope(scope).and_then(|()| operation(self));
        if matches!(
            &result,
            Err(StoreError::Forbidden | StoreError::WorkspaceMismatch)
        ) {
            if let Ok(tx) = self
                .store
                .0
                .transaction_with_behavior(TransactionBehavior::Immediate)
            {
                if let Ok(actual) = identity::scope(&tx) {
                    let actor = self
                        .store
                        .1
                        .as_ref()
                        .and_then(|s| identity::verify(&tx, s, Permission::View).ok());
                    if identity::audit(&tx, &actual, actor.as_ref(), "authorization.denied", None)
                        .is_ok()
                    {
                        let _ = tx.commit();
                    }
                }
            }
        }
        result
    }
    pub fn verify_scope(&self, scope: &Scope) -> Result<(), StoreError> {
        self.require(Permission::View)?;
        if &identity::scope(&self.store.0)? != scope {
            return Err(StoreError::WorkspaceMismatch);
        }
        Ok(())
    }
    pub fn require(&self, permission: Permission) -> Result<Principal, StoreError> {
        let p = self.authorize(permission)?;
        self.last_activity.set(Instant::now());
        Ok(p)
    }
    // Passive access-status/session polling must not extend the idle deadline.
    fn authorize(&self, permission: Permission) -> Result<Principal, StoreError> {
        let session = self.store.1.as_ref().ok_or(StoreError::Locked)?;
        if self.last_activity.get().elapsed() >= Duration::from_secs(15 * 60) {
            return Err(StoreError::Locked);
        }
        identity::verify(&self.store.0, session, permission)
    }
    pub fn provision_owner(
        &mut self,
        setup: OwnerSetup,
        password: &str,
    ) -> Result<AccessStatus, StoreError> {
        self.store.1 = None;
        let username = identity::username(&setup.username)?;
        if !identity::text(&setup.business_name, 120)
            || !identity::text(&setup.display_name, 80)
            || ![
                "gym",
                "cafe",
                "kirana",
                "salon",
                "electronics",
                "boutique",
                "service",
                "general",
            ]
            .contains(&setup.business_type.as_str())
        {
            return Err(StoreError::InvalidIdentity);
        }
        let hash = hash_password(password)?;
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let configured: bool =
            tx.query_row("SELECT EXISTS(SELECT 1 FROM local_principals)", [], |r| {
                r.get(0)
            })?;
        if configured {
            return Err(StoreError::AccessConfigured);
        }
        let scope = identity::scope(&tx)?;
        let id = identity::random_id()?;
        if tx.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) VALUES(?1,?2,?3,?4,'owner',1,1,?5)",params![id,scope.business_id,username,setup.display_name,hash])?!=1 { return Err(StoreError::AccessUnavailable); }
        if tx.execute(
            "UPDATE local_identity SET business_name=?1,business_type=?2 WHERE singleton=1",
            params![setup.business_name, setup.business_type],
        )? != 1
        {
            return Err(StoreError::AccessUnavailable);
        }
        let p = identity::principal(&tx, &id)?;
        identity::audit(&tx, &scope, Some(&p), "owner.provisioned", Some(&id))?;
        let session = identity::session(&tx, scope, &p)?;
        tx.commit()?;
        #[cfg(test)]
        credential_tests::after_auth_commit();
        self.store.1 = Some(session);
        self.last_activity.set(Instant::now());
        self.status()
    }
    pub fn login(&mut self, username: &str, password: &str) -> Result<AccessStatus, StoreError> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| StoreError::AccessUnavailable)?
            .as_secs();
        self.login_at(
            username,
            password,
            i64::try_from(now).map_err(|_| StoreError::AccessUnavailable)?,
        )
    }
    fn login_at(
        &mut self,
        username: &str,
        password: &str,
        now: i64,
    ) -> Result<AccessStatus, StoreError> {
        self.store.1 = None;
        if now < 0 || password.len() > 512 {
            return Err(StoreError::InvalidPassword);
        }
        let username = identity::username(username)?;
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let scope = identity::scope(&tx)?;
        // Database-wide persistent budget prevents cycling through usernames.
        let (global_attempts, global_retry): (i64, i64) = tx.query_row(
            "SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if now < global_retry {
            return Err(StoreError::RateLimited);
        }
        let row:Option<(String,String,i64,i64)>=tx.query_row("SELECT id,password_hash,failed_attempts,retry_after FROM local_principals WHERE username=?1",[&username],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional()?;
        let mut accepted = None;
        if let Some((id, hash, _, retry)) = &row {
            if now < *retry {
                return Err(StoreError::RateLimited);
            }
            if verify_password(password, hash)? {
                let p = identity::principal(&tx, id)?;
                if p.enabled {
                    accepted = Some(p);
                }
            }
        } else {
            // Same bounded Argon2 work; unknown users do not get a fast oracle.
            let _ = hash_password("Unknown account verification only")?;
        }
        if let Some(p) = accepted {
            if tx.execute(
                "UPDATE local_principals SET failed_attempts=0,retry_after=0 WHERE id=?1",
                [&p.id],
            )? != 1
            {
                return Err(StoreError::AccessUnavailable);
            }
            if tx.execute(
                "UPDATE workspace_access SET failed_attempts=0,retry_after=0 WHERE singleton=1",
                [],
            )? != 1
            {
                return Err(StoreError::AccessUnavailable);
            }
            identity::audit(&tx, &scope, Some(&p), "session.unlocked", None)?;
            let session = identity::session(&tx, scope, &p)?;
            tx.commit()?;
            #[cfg(test)]
            credential_tests::after_auth_commit();
            self.store.1 = Some(session);
            self.last_activity.set(Instant::now());
            self.status()
        } else {
            let attempts = (if global_retry > 0 { 0 } else { global_attempts } + 1).min(5);
            let retry = if attempts == 5 {
                now.saturating_add(60)
            } else {
                0
            };
            if tx.execute(
                "UPDATE workspace_access SET failed_attempts=?1,retry_after=?2 WHERE singleton=1",
                params![attempts, retry],
            )? != 1
            {
                return Err(StoreError::AccessUnavailable);
            }
            if let Some((id, _, attempts, old_retry)) = row {
                let failed = (if old_retry > 0 { 0 } else { attempts } + 1).min(5);
                if tx.execute(
                    "UPDATE local_principals SET failed_attempts=?1,retry_after=?2 WHERE id=?3",
                    params![
                        failed,
                        if failed == 5 {
                            now.saturating_add(60)
                        } else {
                            0
                        },
                        id
                    ],
                )? != 1
                {
                    return Err(StoreError::AccessUnavailable);
                }
            }
            identity::audit(&tx, &scope, None, "session.denied", None)?;
            tx.commit()?;
            Err(if retry > 0 {
                StoreError::RateLimited
            } else {
                StoreError::IncorrectPassword
            })
        }
    }
    pub fn lock(&mut self) {
        // Lock memory even if an audit write fails; a disk fault cannot keep access open.
        if let Some(session) = self.store.1.take() {
            if let Ok(tx) = self
                .store
                .0
                .transaction_with_behavior(TransactionBehavior::Immediate)
            {
                let p = identity::verify(&tx, &session, Permission::View).ok();
                if identity::audit(&tx, &session.scope, p.as_ref(), "session.locked", None).is_ok()
                {
                    let _ = tx.commit();
                }
            }
        }
    }
    pub fn create_staff(
        &mut self,
        details: StaffDetails,
        password: &str,
    ) -> Result<Principal, StoreError> {
        self.require(Permission::Staff)?;
        let username = identity::username(&details.username)?;
        if details.role == identity::Role::Owner || !identity::text(&details.display_name, 80) {
            return Err(StoreError::InvalidIdentity);
        }
        let hash = hash_password(password)?;
        let id = identity::random_id()?;
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.store.1,
            Permission::Staff,
            "staff.create_authorized",
            Some(&id),
        )?;
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_principals WHERE username=?1)",
            [&username],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(StoreError::AccountExists);
        }
        let scope = identity::scope(&tx)?;
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM local_principals", [], |r| r.get(0))?;
        if count >= 100 {
            return Err(StoreError::InvalidIdentity);
        }
        if tx.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) VALUES(?1,?2,?3,?4,?5,1,1,?6)",params![id,scope.business_id,username,details.display_name,details.role.key(),hash])?!=1 { return Err(StoreError::AccessUnavailable); }
        let p = identity::principal(&tx, &id)?;
        identity::audit_details(
            &tx,
            self.store.1.as_ref().ok_or(StoreError::Locked)?,
            "staff.created",
            &id,
            serde_json::json!({"account":p}),
        )?;
        tx.commit()?;
        Ok(p)
    }
    /// Requires the current credential; all sessions for this principal are revoked.
    pub fn change_password(
        &mut self,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), StoreError> {
        let actor = self.require(Permission::View)?;
        self.login(&actor.username, current_password)?;
        let hash = hash_password(new_password)?;
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let session = self.store.1.as_ref().ok_or(StoreError::Locked)?;
        let actor = identity::verify(&tx, session, Permission::View)?;
        let revision = actor
            .revision
            .checked_add(1)
            .ok_or(StoreError::AccessUnavailable)?;
        if tx.execute("UPDATE local_principals SET password_hash=?1,revision=?2,failed_attempts=0,retry_after=0 WHERE id=?3 AND revision=?4",params![hash,revision,actor.id,actor.revision])? != 1 { return Err(StoreError::Conflict); }
        if actor.role == identity::Role::Owner
            && tx.execute(
                "UPDATE workspace_access SET password_hash=NULL WHERE singleton=1",
                [],
            )? != 1
        {
            return Err(StoreError::AccessUnavailable);
        }
        identity::audit(
            &tx,
            &session.scope,
            Some(&actor),
            "credentials.password_changed",
            Some(&actor.id),
        )?;
        tx.commit()?;
        self.store.1 = None;
        Ok(())
    }
    /// An enabled Owner must freshly authenticate. Never resets an Owner or enables staff.
    pub fn reset_staff_password(
        &mut self,
        id: &str,
        expected_revision: i64,
        owner_password: &str,
        new_password: &str,
    ) -> Result<Principal, StoreError> {
        let actor = self.require(Permission::Staff)?;
        if !crate::billing::valid_id(id) || expected_revision < 1 {
            return Err(StoreError::InvalidIdentity);
        }
        self.login(&actor.username, owner_password)?;
        let hash = hash_password(new_password)?;
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let session = self.store.1.as_ref().ok_or(StoreError::Locked)?;
        let actor = identity::verify(&tx, session, Permission::Staff)?;
        let target = identity::principal(&tx, id)?;
        if target.role == identity::Role::Owner {
            return Err(StoreError::Forbidden);
        }
        let revision = target
            .revision
            .checked_add(1)
            .ok_or(StoreError::AccessUnavailable)?;
        if tx.execute("UPDATE local_principals SET password_hash=?1,revision=?2,failed_attempts=0,retry_after=0 WHERE id=?3 AND revision=?4",params![hash,revision,id,expected_revision])? != 1 { return Err(StoreError::Conflict); }
        identity::audit(
            &tx,
            &session.scope,
            Some(&actor),
            "credentials.staff_password_reset",
            Some(id),
        )?;
        let updated = identity::principal(&tx, id)?;
        tx.commit()?;
        Ok(updated)
    }
    pub fn change_staff(&mut self, change: StaffChange) -> Result<Principal, StoreError> {
        self.require(Permission::Staff)?;
        if change.role == identity::Role::Owner || !crate::billing::valid_id(&change.id) {
            return Err(StoreError::InvalidIdentity);
        }
        let tx = self
            .store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.store.1,
            Permission::Staff,
            "staff.change_authorized",
            Some(&change.id),
        )?;
        let p = identity::principal(&tx, &change.id)?;
        if p.role == identity::Role::Owner {
            return Err(StoreError::Forbidden);
        }
        if tx.execute("UPDATE local_principals SET role=?1,enabled=?2,revision=revision+1 WHERE id=?3 AND revision=?4",params![change.role.key(),change.enabled,change.id,change.expected_revision])?!=1 { return Err(StoreError::Conflict); }
        let result = identity::principal(&tx, &change.id)?;
        identity::audit_details(
            &tx,
            self.store.1.as_ref().ok_or(StoreError::Locked)?,
            "staff.changed",
            &change.id,
            serde_json::json!({"before":p,"after":result}),
        )?;
        tx.commit()?;
        Ok(result)
    }
    pub fn list_staff(&self) -> Result<Vec<Principal>, StoreError> {
        self.require(Permission::Staff)?;
        let tx = self.store.0.unchecked_transaction()?;
        identity::verify(
            &tx,
            self.store.1.as_ref().ok_or(StoreError::Locked)?,
            Permission::Staff,
        )?;
        let ids: Vec<String> = {
            let mut q =
                tx.prepare("SELECT id FROM local_principals ORDER BY username LIMIT 100")?;
            let rows = q.query_map([], |r| r.get(0))?;
            rows.collect::<Result<_, _>>()?
        };
        let result = ids
            .iter()
            .map(|id| identity::principal(&tx, id))
            .collect::<Result<_, _>>()?;
        tx.commit()?;
        Ok(result)
    }
    pub fn identity_audit(&self, after: i64) -> Result<Vec<AuditEntry>, StoreError> {
        self.require(Permission::Audit)?;
        if after < 0 {
            return Err(StoreError::InvalidIdentity);
        }
        let tx = self.store.0.unchecked_transaction()?;
        identity::verify(
            &tx,
            self.store.1.as_ref().ok_or(StoreError::Locked)?,
            Permission::Audit,
        )?;
        let result = {
            let mut q=tx.prepare("SELECT sequence,actor_id,actor_role,action,target,created_at,details FROM local_identity_audit WHERE sequence>?1 ORDER BY sequence LIMIT 100")?;
            let rows = q.query_map([after], |r| {
                Ok(AuditEntry {
                    sequence: r.get(0)?,
                    actor_id: r.get(1)?,
                    actor_role: r.get(2)?,
                    action: r.get(3)?,
                    target: r.get(4)?,
                    created_at: r.get(5)?,
                    details: r.get(6)?,
                })
            })?;
            rows.collect::<Result<_, _>>()?
        };
        tx.commit()?;
        Ok(result)
    }
    // Only storage-unit tests retain the old shorthand. It is not compiled into Tauri.
    #[cfg(test)]
    pub fn setup(&mut self, password: &str) -> Result<AccessStatus, StoreError> {
        self.provision_owner(
            OwnerSetup {
                business_name: "Test business".into(),
                business_type: "general".into(),
                display_name: "Owner".into(),
                username: "owner".into(),
            },
            password,
        )
    }
    #[cfg(test)]
    pub fn unlock(&mut self, password: &str) -> Result<AccessStatus, StoreError> {
        self.login("owner", password)
    }
    pub fn save_customer(
        &mut self,
        r: crate::customers::SaveCustomer,
    ) -> Result<crate::customers::Customer, StoreError> {
        self.require(Permission::ManageCustomers)?;
        self.store.save_customer(r)
    }
    pub fn find_customers(
        &self,
        search: &str,
        overdue_only: bool,
    ) -> Result<Vec<crate::customers::Customer>, StoreError> {
        self.require(if overdue_only {
            Permission::Reports
        } else {
            Permission::CustomerRead
        })?;
        self.store.find_customers(search, overdue_only)
    }
    pub fn prepare_credit(&mut self, r: crate::customers::CreditRequest) -> Result<(), StoreError> {
        self.require(if r.kind == crate::customers::CreditKind::Repayment {
            Permission::CollectCredit
        } else {
            Permission::CorrectCredit
        })?;
        self.store.prepare_credit(r)
    }
    pub fn post_credit(
        &mut self,
        r: crate::customers::CreditRequest,
    ) -> Result<crate::customers::CreditReceipt, StoreError> {
        self.require(if r.kind == crate::customers::CreditKind::Repayment {
            Permission::CollectCredit
        } else {
            Permission::CorrectCredit
        })?;
        self.store.post_credit(r, true)
    }
    pub fn pending_credit(&self) -> Result<Option<crate::customers::PendingCredit>, StoreError> {
        self.require(Permission::CollectCredit)?;
        self.store.pending_credit()
    }
    pub fn clear_credit(&mut self, id: &str, saved: bool) -> Result<(), StoreError> {
        self.require(Permission::CollectCredit)?;
        self.store.clear_credit(id, saved)
    }
    pub fn link_credit(
        &mut self,
        r: crate::customers::LinkCredit,
    ) -> Result<crate::customers::CreditReceipt, StoreError> {
        self.require(Permission::CorrectCredit)?;
        self.store.link_credit(r)
    }
    pub fn customer_statement(
        &self,
        id: &str,
        after: i64,
        through: Option<i64>,
    ) -> Result<crate::customers::Statement, StoreError> {
        self.require(Permission::CustomerRead)?;
        self.store.customer_statement(id, after, through)
    }
    pub fn print_customer_statement(
        &self,
        id: &str,
        through: Option<i64>,
    ) -> Result<String, StoreError> {
        self.require(Permission::CustomerRead)?;
        self.store.print_customer_statement(id, through)
    }
    pub fn prepare_retail(&mut self, r: crate::payments::Request) -> Result<(), StoreError> {
        self.require(r.action.permission())?;
        self.store.prepare_retail(r)
    }
    pub fn post_retail(
        &mut self,
        r: crate::payments::Request,
    ) -> Result<crate::payments::Receipt, StoreError> {
        self.require(r.action.permission())?;
        self.store.post_retail(r)
    }
    pub fn clear_retail(&mut self, id: &str, saved: bool) -> Result<(), StoreError> {
        self.require(Permission::Sell)?;
        self.store.clear_retail(id, saved)
    }
    pub fn retail_view(
        &self,
        day: &str,
        username: &str,
        invoice_id: Option<&str>,
    ) -> Result<crate::payments::View, StoreError> {
        self.require(Permission::Sell)?;
        self.store.retail_view(day, username, invoice_id)
    }
    pub fn quote_retail_return(
        &self,
        id: &str,
        lines: &[crate::payments::ReturnLine],
    ) -> Result<crate::payments::ReturnQuote, StoreError> {
        self.require(Permission::Refund)?;
        self.store.quote_retail_return(id, lines)
    }
    pub fn export_retail(&mut self, day: &str) -> Result<crate::payments::Export, StoreError> {
        self.require(Permission::Reports)?;
        self.store.export_retail(day)
    }
    pub fn takeover_payment(&mut self, id: &str, why: &str) -> Result<String, StoreError> {
        self.require(Permission::Settings)?;
        self.store.takeover_payment(id, why)
    }
    pub fn prepare_checkout(
        &mut self,
        request: crate::billing::PostInvoice,
    ) -> Result<(), StoreError> {
        self.require(Permission::Sell)?;
        self.store.prepare_checkout(request)
    }
    pub fn clear_checkout(&mut self, operation_id: &str, saved: bool) -> Result<(), StoreError> {
        self.require(Permission::Sell)?;
        self.store.clear_checkout(operation_id, saved)
    }
    pub fn cashier_state(&self) -> Result<crate::checkout::CashierState, StoreError> {
        self.require(Permission::Sell)?;
        let mut state = self.store.cashier_state()?;
        if !self
            .require(Permission::View)?
            .role
            .allows(Permission::Reports)
        {
            state.balances.cash_paise = "0".into();
            state.balances.credit_paise = "0".into();
        }
        Ok(state)
    }
    pub fn post_prepared_invoice(
        &mut self,
        request: crate::billing::PostInvoice,
    ) -> Result<crate::billing::Invoice, StoreError> {
        self.require(Permission::Sell)?;
        self.store.post_prepared_invoice(request)
    }
    pub fn post_invoice(
        &mut self,
        request: crate::billing::PostInvoice,
    ) -> Result<crate::billing::Invoice, StoreError> {
        self.require(Permission::Sell)?;
        self.store.post_invoice(request)
    }
    pub fn read_invoice(&self, id: &str) -> Result<crate::billing::Invoice, StoreError> {
        self.read(Permission::Sell, |s| s.read_invoice(id))
    }
    pub fn list_invoices(
        &self,
        after: i64,
    ) -> Result<Vec<crate::billing::InvoiceRecord>, StoreError> {
        self.require(Permission::Reports)?;
        self.read(Permission::Reports, |s| s.list_invoices(after))
    }
    pub fn billing_outbox(
        &self,
        after: i64,
    ) -> Result<Vec<crate::billing::OutboxRecord>, StoreError> {
        self.require(Permission::Outbox)?;
        self.read(Permission::Outbox, |s| s.billing_outbox(after))
    }

    fn read<T>(
        &self,
        permission: Permission,
        operation: impl FnOnce(&Store) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        self.require(permission)?;
        let tx = self.store.0.unchecked_transaction()?;
        identity::verify(
            &tx,
            self.store.1.as_ref().ok_or(StoreError::Locked)?,
            permission,
        )?;
        let result = operation(&self.store)?;
        tx.commit()?;
        Ok(result)
    }
    pub fn load(&self) -> Result<Snapshot, StoreError> {
        self.require(Permission::View)?;
        self.read(Permission::View, |s| {
            let mut snapshot = s.load()?;
            let principal = identity::verify(
                &s.0,
                s.1.as_ref().ok_or(StoreError::Locked)?,
                Permission::View,
            )?;
            if principal.role != identity::Role::Owner {
                if let Some(draft) = snapshot.draft.as_mut() {
                    draft.note.clear();
                }
            }
            Ok(snapshot)
        })
    }

    pub fn save(&mut self, expected_revision: i64, draft: Draft) -> Result<Snapshot, StoreError> {
        self.require(Permission::Settings)?;
        self.store.save(expected_revision, draft)
    }

    pub fn saved_copies(&self) -> Result<Vec<SavedCopy>, StoreError> {
        self.require(Permission::Settings)?;
        self.read(Permission::Settings, |s| s.saved_copies())
    }

    pub fn list_products(&self) -> Result<Vec<Product>, StoreError> {
        self.require(Permission::View)?;
        self.read(Permission::View, |s| s.list_products())
    }

    pub fn add_product(&mut self, request: AddProduct) -> Result<Product, StoreError> {
        self.require(Permission::AddItem)?;
        self.store.add_product(request)
    }

    pub fn pending_inventory(
        &self,
    ) -> Result<Option<crate::inventory_recovery::InventoryReceipt>, StoreError> {
        self.require(Permission::View)?;
        self.store.pending_inventory()
    }
    pub fn acknowledge_inventory(&mut self, operation_id: &str) -> Result<(), StoreError> {
        self.require(Permission::View)?;
        self.store.acknowledge_inventory(operation_id)
    }
    pub fn adjust_stock(&mut self, request: AdjustStock) -> Result<Product, StoreError> {
        self.require(Permission::CorrectStock)?;
        self.store.adjust_stock(request)
    }

    pub fn restore(
        &mut self,
        expected_revision: i64,
        source_revision: i64,
    ) -> Result<Snapshot, StoreError> {
        self.require(Permission::Settings)?;
        self.store.restore(expected_revision, source_revision)
    }
}
fn hasher() -> Result<Argon2<'static>, StoreError> {
    Ok(Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(19 * 1024, 2, 1, Some(32)).map_err(|_| StoreError::AccessUnavailable)?,
    ))
}
pub(crate) fn hash_password(password: &str) -> Result<String, StoreError> {
    if password.len() > 512
        || !(10..=128).contains(&password.chars().count())
        || password.trim().is_empty()
    {
        return Err(StoreError::InvalidPassword);
    }
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| StoreError::AccessUnavailable)?;
    let salt = SaltString::encode_b64(&bytes).map_err(|_| StoreError::AccessUnavailable)?;
    Ok(hasher()?
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| StoreError::AccessUnavailable)?
        .to_string())
}
fn verify_password(password: &str, hash: &str) -> Result<bool, StoreError> {
    if hash.len() > 128 || !hash.starts_with(HASH_PREFIX) {
        return Err(StoreError::AccessUnavailable);
    }
    let parsed = PasswordHash::new(hash).map_err(|_| StoreError::AccessUnavailable)?;
    match hasher()?.verify_password(password.as_bytes(), &parsed) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::Password) => Ok(false),
        Err(_) => Err(StoreError::AccessUnavailable),
    }
}
#[cfg(test)]
#[path = "authorization_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "credential_tests.rs"]
mod credential_tests;
