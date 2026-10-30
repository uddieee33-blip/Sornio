use super::*;
use crate::identity::{Role, StaffDetails};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OLD: &str = "Synthetic original password";
const NEW: &str = "Synthetic replacement password";
thread_local! {
    // One-shot, thread-local scheduling seam; absent from production builds.
    static AFTER_AUTH_COMMIT: std::cell::RefCell<Option<Box<dyn FnOnce()>>> =
        const { std::cell::RefCell::new(None) };
}
pub(super) fn after_auth_commit() {
    let callback = AFTER_AUTH_COMMIT.with(|slot| slot.borrow_mut().take());
    if let Some(callback) = callback {
        callback();
    }
}

fn restore_during_session_publication(provisioning: bool) {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = if provisioning {
        Workspace::new(Store::open(&path, KEY).unwrap())
    } else {
        let mut w = owner(&path);
        w.lock();
        w
    };
    let authenticated_generation = crate::recovery::generation(&w.store.0).unwrap();
    let safety = d.path().to_path_buf();
    let archive = d.path().join("before-restore.sorniobackup");
    // Use a real second connection and the supported encrypted restore path.
    // The Owner's identity/revision/password are unchanged, so only the
    // generation fence can invalidate the earlier authentication.
    AFTER_AUTH_COMMIT.with(|slot| {
        *slot.borrow_mut() = Some(Box::new(move || {
            const RECOVERY: &str = "Independent synthetic recovery secret";
            let mut restorer = Workspace::new(Store::open(&path, KEY).unwrap());
            restorer.login("owner", OLD).unwrap();
            restorer.export_backup(&archive, OLD, RECOVERY).unwrap();
            let preview = restorer
                .preview_backup(&archive, OLD, RECOVERY, OLD)
                .unwrap();
            restorer
                .restore_backup(
                    &archive,
                    &safety,
                    OLD,
                    RECOVERY,
                    OLD,
                    &preview,
                    &preview.confirmation,
                )
                .unwrap();
        }));
    });
    let status = if provisioning {
        w.setup(OLD)
    } else {
        w.login("owner", OLD)
    }
    .unwrap();
    assert_ne!(
        crate::recovery::generation(&w.store.0).unwrap(),
        authenticated_generation
    );
    assert!(
        !status.unlocked,
        "pre-restore authentication must remain fenced (provisioning={provisioning})"
    );
    assert!(matches!(
        w.require(Permission::Settings),
        Err(StoreError::Locked)
    ));
    assert!(matches!(w.load(), Err(StoreError::Locked)));
    assert!(matches!(
        w.save(
            0,
            Draft {
                business_name: "Must not be saved".into(),
                business_type: "general".into(),
                note: "Pre-restore authority".into(),
            }
        ),
        Err(StoreError::Locked)
    ));
    w.login("owner", OLD).unwrap();
    assert!(w.require(Permission::Settings).is_ok());
    assert!(w.load().unwrap().draft.is_none());
}
#[test]
fn restore_between_login_commit_and_session_publication_cannot_unlock() {
    restore_during_session_publication(false);
}
#[test]
fn restore_between_provision_commit_and_session_publication_cannot_unlock() {
    restore_during_session_publication(true);
}
fn owner(path: &std::path::Path) -> Workspace {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.setup(OLD).unwrap();
    w
}
fn staff(w: &mut Workspace) -> Principal {
    w.create_staff(
        StaffDetails {
            username: "cashier".into(),
            display_name: "Cashier".into(),
            role: Role::Cashier,
        },
        OLD,
    )
    .unwrap()
}
fn credential(w: &Workspace, id: &str) -> (String, i64, bool) {
    w.store
        .0
        .query_row(
            "SELECT password_hash,revision,enabled FROM local_principals WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap()
}
#[test]
fn password_change_revokes_other_sessions_survives_lost_reply_and_preserves_data() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = owner(&path);
    let p = staff(&mut a);
    a.add_product(crate::catalog::AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 100,
        opening_stock_milli: 10000,
    })
    .unwrap();
    a.acknowledge_inventory("rice").unwrap();
    a.save(
        0,
        Draft {
            business_name: "Shop".into(),
            business_type: "general".into(),
            note: "Retained draft".into(),
        },
    )
    .unwrap();
    let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
    b.login("cashier", OLD).unwrap();
    a.login("cashier", OLD).unwrap();
    a.prepare_checkout(crate::billing::PostInvoice {
        operation_id: "pending-sale".into(),
        lines: vec![crate::billing::BillLine {
            product_id: "rice".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: crate::billing::Tender::Cash,
        customer_id: None,
    })
    .unwrap();
    a.change_password(OLD, NEW).unwrap();
    assert!(matches!(a.load(), Err(StoreError::Locked)));
    assert!(matches!(b.load(), Err(StoreError::Locked)));
    drop(a);
    let mut a = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(matches!(
        a.login("cashier", OLD),
        Err(StoreError::IncorrectPassword)
    ));
    a.login("cashier", NEW).unwrap();
    assert_eq!(
        a.local_session().unwrap().principal.revision,
        p.revision + 1
    );
    assert_eq!(a.load().unwrap().draft.unwrap().business_name, "Shop");
    assert_eq!(
        a.cashier_state()
            .unwrap()
            .checkout
            .unwrap()
            .request
            .operation_id,
        "pending-sale"
    );
    assert_eq!(a.list_products().unwrap()[0].stock_milli, 10000);
    a.login("owner", OLD).unwrap();
    assert_eq!(a.load().unwrap().draft.unwrap().note, "Retained draft");
    let audit = a.identity_audit(0).unwrap();
    assert!(audit.iter().any(
        |x| x.action == "credentials.password_changed" && x.actor_id.as_deref() == Some(&p.id)
    ));
    let payload = serde_json::to_string(&audit).unwrap();
    assert!(!payload.contains(OLD) && !payload.contains(NEW) && !payload.contains("argon2"));
}
#[test]
fn owner_rotation_removes_legacy_verifier_and_requires_existing_secret() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    let id = w.local_session().unwrap().principal.id;
    let original = credential(&w, &id);
    w.store
        .0
        .execute(
            "UPDATE workspace_access SET password_hash=?1 WHERE singleton=1",
            [&original.0],
        )
        .unwrap();
    assert!(matches!(
        w.change_password("Wrong synthetic password", NEW),
        Err(StoreError::IncorrectPassword)
    ));
    assert_eq!(credential(&w, &id), original);
    assert!(!w.status().unwrap().unlocked);
    w.login("owner", OLD).unwrap();
    w.change_password(OLD, NEW).unwrap();
    let hash: Option<String> = w
        .store
        .0
        .query_row(
            "SELECT password_hash FROM workspace_access WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(hash.is_none());
    assert!(matches!(
        w.login("owner", OLD),
        Err(StoreError::IncorrectPassword)
    ));
    w.login("owner", NEW).unwrap();
}
#[test]
fn reset_requires_owner_reauthentication_preserves_disabled_state_and_revokes_sessions() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = owner(&path);
    let p = staff(&mut a);
    let owner_id = a.local_session().unwrap().principal.id;
    let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
    b.login("cashier", OLD).unwrap();
    assert!(matches!(
        b.reset_staff_password(&p.id, p.revision, OLD, NEW),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        a.reset_staff_password(&p.id, p.revision, "Wrong synthetic password", NEW),
        Err(StoreError::IncorrectPassword)
    ));
    a.login("owner", OLD).unwrap();
    let updated = a.reset_staff_password(&p.id, p.revision, OLD, NEW).unwrap();
    assert_eq!(updated.revision, p.revision + 1);
    assert!(matches!(b.load(), Err(StoreError::Locked)));
    assert!(matches!(
        a.reset_staff_password(&p.id, p.revision, OLD, NEW),
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        a.reset_staff_password(&owner_id, 1, OLD, NEW),
        Err(StoreError::Forbidden)
    ));
    let disabled = a
        .change_staff(StaffChange {
            id: p.id.clone(),
            expected_revision: updated.revision,
            role: Role::Cashier,
            enabled: false,
        })
        .unwrap();
    let reset = a
        .reset_staff_password(&p.id, disabled.revision, OLD, OLD)
        .unwrap();
    assert!(!reset.enabled);
    assert!(matches!(
        b.login("cashier", OLD),
        Err(StoreError::IncorrectPassword)
    ));
}
#[test]
fn credential_writes_and_required_audit_roll_back_on_statement_and_commit_failure() {
    for reset in [false, true] {
        for fault in ["ignore", "abort", "commit"] {
            let d = tempfile::tempdir().unwrap();
            let path = d.path().join("s.db");
            let mut w = owner(&path);
            let p = staff(&mut w);
            let id = if reset {
                p.id.clone()
            } else {
                w.local_session().unwrap().principal.id
            };
            let before = credential(&w, &id);
            let action = if reset {
                "credentials.staff_password_reset"
            } else {
                "credentials.password_changed"
            };
            if fault == "commit" {
                w.store.0.execute_batch("CREATE TABLE missing_parent(id INTEGER PRIMARY KEY);CREATE TABLE fail_child(id INTEGER REFERENCES missing_parent(id) DEFERRABLE INITIALLY DEFERRED);CREATE TRIGGER fail_credentials AFTER UPDATE OF password_hash ON local_principals BEGIN INSERT INTO fail_child VALUES(1);END;").unwrap();
            } else {
                w.store.0.execute_batch(&format!("CREATE TRIGGER fail_credentials BEFORE INSERT ON local_identity_audit WHEN NEW.action='{action}' BEGIN SELECT RAISE({});END;",if fault=="ignore"{"IGNORE"}else{"ABORT,'synthetic failure'"})).unwrap();
            }
            let result = if reset {
                w.reset_staff_password(&id, before.1, OLD, NEW).map(|_| ())
            } else {
                w.change_password(OLD, NEW)
            };
            assert!(result.is_err());
            assert_eq!(credential(&w, &id), before);
            assert_eq!(
                w.store
                    .0
                    .query_row(
                        "SELECT COUNT(*) FROM local_identity_audit WHERE action=?1",
                        [action],
                        |r| r.get::<_, i64>(0)
                    )
                    .unwrap(),
                0
            );
            drop(w);
            let mut reopened = Workspace::new(Store::open(&path, KEY).unwrap());
            assert_eq!(credential(&reopened, &id), before);
            reopened
                .store
                .0
                .execute_batch("DROP TRIGGER fail_credentials")
                .unwrap();
            reopened.login("owner", OLD).unwrap();
            if reset {
                reopened
                    .reset_staff_password(&id, before.1, OLD, NEW)
                    .unwrap();
            } else {
                reopened.change_password(OLD, NEW).unwrap();
            }
            assert_eq!(
                reopened
                    .store
                    .0
                    .query_row(
                        "SELECT COUNT(*) FROM local_identity_audit WHERE action=?1",
                        [action],
                        |r| r.get::<_, i64>(0)
                    )
                    .unwrap(),
                1
            );
        }
    }
}
#[test]
fn fresh_authentication_uses_persistent_failed_attempt_budget() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    let id = w.local_session().unwrap().principal.id;
    w.store
        .0
        .execute(
            "UPDATE workspace_access SET failed_attempts=4 WHERE singleton=1",
            [],
        )
        .unwrap();
    assert!(matches!(
        w.change_password("Wrong synthetic password", NEW),
        Err(StoreError::RateLimited)
    ));
    assert!(matches!(
        w.login("owner", OLD),
        Err(StoreError::RateLimited)
    ));
    assert_eq!(credential(&w, &id).1, 1);
}
