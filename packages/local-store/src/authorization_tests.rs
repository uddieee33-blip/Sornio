use super::*;
use crate::{
    billing::{BillLine, PostInvoice, Tender},
    catalog::{AddProduct, AdjustStock},
    identity::{Permission, Role},
};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Offline owner password!";
fn owner(path: &std::path::Path) -> Workspace {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.setup(PASSWORD).unwrap();
    w
}
fn details(name: &str, role: Role) -> StaffDetails {
    StaffDetails {
        username: name.into(),
        display_name: name.into(),
        role,
    }
}
fn item() -> AddProduct {
    AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 4250,
        opening_stock_milli: 10000,
    }
}
fn correction() -> AdjustStock {
    AdjustStock {
        operation_id: "correct".into(),
        product_id: "rice".into(),
        expected_revision: 1,
        delta_milli: 1000,
        reason: "Counted stock".into(),
    }
}
fn bill() -> PostInvoice {
    PostInvoice {
        operation_id: "sale".into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    }
}
fn draft() -> Draft {
    Draft {
        business_name: "Shop".into(),
        business_type: "general".into(),
        note: "Private".into(),
    }
}
fn change(p: &Principal, role: Role, enabled: bool) -> StaffChange {
    StaffChange {
        id: p.id.clone(),
        expected_revision: p.revision,
        role,
        enabled,
    }
}
#[test]
fn every_role_is_enforced_by_native_data_methods() {
    for role in [
        Role::Owner,
        Role::Manager,
        Role::AssistantManager,
        Role::Cashier,
    ] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut w = owner(&path);
        w.add_product(item()).unwrap();
        w.acknowledge_inventory("rice").unwrap();
        if role != Role::Owner {
            w.create_staff(details("staff", role.clone()), PASSWORD)
                .unwrap();
            w.login("staff", PASSWORD).unwrap();
        }
        assert!(w.list_products().is_ok());
        assert!(w.load().is_ok());
        let mut new = item();
        new.operation_id = "second".into();
        new.sku = "SECOND".into();
        assert_eq!(w.add_product(new).is_ok(), role.allows(Permission::AddItem));
        if role.allows(Permission::AddItem) {
            w.acknowledge_inventory("second").unwrap();
        }
        assert_eq!(
            w.adjust_stock(correction()).is_ok(),
            role.allows(Permission::CorrectStock)
        );
        assert_eq!(w.list_invoices(0).is_ok(), role.allows(Permission::Reports));
        assert_eq!(w.billing_outbox(0).is_ok(), role == Role::Owner);
        assert_eq!(w.list_staff().is_ok(), role == Role::Owner);
        assert_eq!(w.identity_audit(0).is_ok(), role == Role::Owner);
        assert_eq!(w.save(0, draft()).is_ok(), role == Role::Owner);
        assert_eq!(w.saved_copies().is_ok(), role == Role::Owner);
        assert_eq!(w.restore(1, 1).is_ok(), role == Role::Owner);
        let mut request = bill();
        request.lines[0].expected_revision = w
            .list_products()
            .unwrap()
            .iter()
            .find(|p| p.id == "rice")
            .unwrap()
            .revision;
        w.prepare_checkout(request.clone()).unwrap();
        let saved = w.post_prepared_invoice(request.clone()).unwrap();
        assert_eq!(saved.total_paise, 4250);
        assert_eq!(w.post_prepared_invoice(request).unwrap(), saved);
        w.clear_checkout("sale", true).unwrap();
        let state = w.cashier_state().unwrap();
        assert_eq!(state.reports_allowed, role.allows(Permission::Reports));
        assert_eq!(
            state.balances.cash_paise,
            if state.reports_allowed { "4250" } else { "0" }
        );
    }
}
#[test]
fn locked_workspace_denies_all_sensitive_commands() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    let scope = w.local_session().unwrap().scope;
    w.lock();
    assert!(matches!(w.verify_scope(&scope), Err(StoreError::Locked)));
    assert!(matches!(w.load(), Err(StoreError::Locked)));
    assert!(matches!(w.save(0, draft()), Err(StoreError::Locked)));
    assert!(matches!(w.saved_copies(), Err(StoreError::Locked)));
    assert!(matches!(w.restore(1, 1), Err(StoreError::Locked)));
    assert!(matches!(w.list_products(), Err(StoreError::Locked)));
    assert!(matches!(w.add_product(item()), Err(StoreError::Locked)));
    assert!(matches!(
        w.adjust_stock(correction()),
        Err(StoreError::Locked)
    ));
    assert!(matches!(
        w.prepare_checkout(bill()),
        Err(StoreError::Locked)
    ));
    assert!(matches!(
        w.post_prepared_invoice(bill()),
        Err(StoreError::Locked)
    ));
    assert!(matches!(w.post_invoice(bill()), Err(StoreError::Locked)));
    assert!(matches!(
        w.clear_checkout("sale", false),
        Err(StoreError::Locked)
    ));
    assert!(matches!(w.cashier_state(), Err(StoreError::Locked)));
    assert!(matches!(w.list_invoices(0), Err(StoreError::Locked)));
    assert!(matches!(w.billing_outbox(0), Err(StoreError::Locked)));
    assert!(matches!(w.local_session(), Err(StoreError::Locked)));
    assert!(matches!(w.list_staff(), Err(StoreError::Locked)));
    assert!(matches!(
        w.create_staff(details("cashier", Role::Cashier), PASSWORD),
        Err(StoreError::Locked)
    ));
    assert!(matches!(
        w.change_staff(StaffChange {
            id: "x".into(),
            expected_revision: 1,
            role: Role::Cashier,
            enabled: false
        }),
        Err(StoreError::Locked)
    ));
    assert!(matches!(w.identity_audit(0), Err(StoreError::Locked)));
}
#[test]
fn accounts_cannot_create_or_assign_owners_or_disable_the_owner() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    let me = w.local_session().unwrap().principal;
    assert!(matches!(
        w.create_staff(details("other", Role::Owner), PASSWORD),
        Err(StoreError::InvalidIdentity)
    ));
    assert!(matches!(
        w.change_staff(change(&me, Role::Cashier, false)),
        Err(StoreError::Forbidden)
    ));
    assert!(w
        .store
        .0
        .execute(
            "UPDATE local_principals SET enabled=0 WHERE role='owner'",
            []
        )
        .is_err());
    assert!(w
        .store
        .0
        .execute("DELETE FROM local_principals", [])
        .is_err());
    w.create_staff(details("cashier", Role::Cashier), PASSWORD)
        .unwrap();
    w.login("cashier", PASSWORD).unwrap();
    assert!(matches!(
        w.create_staff(details("bad", Role::Manager), PASSWORD),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.change_staff(change(&me, Role::Cashier, false)),
        Err(StoreError::Forbidden)
    ));
}
#[test]
fn disabling_and_role_changes_revoke_sessions_across_connections() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = owner(&path);
    let p = a
        .create_staff(details("manager", Role::Manager), PASSWORD)
        .unwrap();
    let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
    b.login("manager", PASSWORD).unwrap();
    assert!(b.list_invoices(0).is_ok());
    let p = a.change_staff(change(&p, Role::Cashier, true)).unwrap();
    assert!(matches!(b.list_products(), Err(StoreError::Locked)));
    b.login("manager", PASSWORD).unwrap();
    assert!(matches!(b.list_invoices(0), Err(StoreError::Forbidden)));
    let p = a.change_staff(change(&p, Role::Cashier, false)).unwrap();
    assert!(matches!(b.cashier_state(), Err(StoreError::Locked)));
    assert!(matches!(
        b.login("manager", PASSWORD),
        Err(StoreError::IncorrectPassword)
    ));
    assert!(a.change_staff(change(&p, Role::Manager, true)).is_ok());
    b.login("MANAGER", PASSWORD).unwrap();
    assert!(b.list_invoices(0).is_ok());
    assert!(matches!(
        a.change_staff(change(&p, Role::Cashier, true)),
        Err(StoreError::Conflict)
    ));
}
#[test]
fn scope_and_sessions_cannot_cross_business_databases() {
    let d = tempfile::tempdir().unwrap();
    let mut a = owner(&d.path().join("a.db"));
    let mut b = owner(&d.path().join("b.db"));
    let sa = a.local_session().unwrap().scope;
    let sb = b.local_session().unwrap().scope;
    assert_ne!(sa, sb);
    assert!(matches!(
        a.verify_scope(&sb),
        Err(StoreError::WorkspaceMismatch)
    ));
    assert!(matches!(
        b.verify_scope(&sa),
        Err(StoreError::WorkspaceMismatch)
    ));
    a.add_product(item()).unwrap();
    assert!(b.list_products().unwrap().is_empty());
    // Even transplanting the in-memory actor (not exposed by IPC) must fail closed.
    b.store.1 = a.store.1.clone();
    assert!(matches!(
        b.list_products(),
        Err(StoreError::WorkspaceMismatch)
    ));
    b.login("owner", PASSWORD).unwrap();
    assert!(b.list_products().unwrap().is_empty());
    let foreign = a.local_session().unwrap().principal;
    assert!(b
        .change_staff(change(&foreign, Role::Cashier, false))
        .is_err());
    assert!(a
        .store
        .0
        .execute("UPDATE local_identity SET business_id='forged'", [])
        .is_err());
    assert!(a.store.0.execute("DELETE FROM local_identity", []).is_err());
}
#[test]
fn separate_cashiers_cannot_read_confirm_or_cancel_anothers_checkpoint() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = owner(&path);
    a.add_product(item()).unwrap();
    a.create_staff(details("cashier", Role::Cashier), PASSWORD)
        .unwrap();
    a.prepare_checkout(bill()).unwrap();
    let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
    b.login("cashier", PASSWORD).unwrap();
    assert!(matches!(b.cashier_state(), Err(StoreError::CheckoutActive)));
    assert!(matches!(
        b.prepare_checkout(bill()),
        Err(StoreError::CheckoutActive)
    ));
    assert!(matches!(
        b.post_prepared_invoice(bill()),
        Err(StoreError::CheckoutActive)
    ));
    assert!(matches!(
        b.clear_checkout("sale", false),
        Err(StoreError::CheckoutActive)
    ));
    a.clear_checkout("sale", false).unwrap();
    let mut next = bill();
    next.operation_id = "staff-sale".into();
    b.prepare_checkout(next).unwrap();
    assert!(a.cashier_state().unwrap().checkout.is_some()); // Owner can recover an abandoned staff checkpoint.
}
#[test]
fn authorization_is_rechecked_after_obtaining_the_database_writer_lock() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = owner(&path);
    a.add_product(item()).unwrap();
    let p = a
        .create_staff(details("manager", Role::Manager), PASSWORD)
        .unwrap();
    let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
    b.login("manager", PASSWORD).unwrap();
    let tx = a
        .store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .unwrap();
    tx.execute(
        "UPDATE local_principals SET enabled=0,revision=revision+1 WHERE id=?1",
        [&p.id],
    )
    .unwrap();
    let (send, recv) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        b.require(Permission::CorrectStock).unwrap();
        send.send(()).unwrap();
        b.store.adjust_stock(correction())
    });
    recv.recv_timeout(Duration::from_secs(5)).unwrap();
    tx.commit().unwrap();
    assert!(matches!(worker.join().unwrap(), Err(StoreError::Locked)));
    assert_eq!(a.list_products().unwrap()[0].stock_milli, 10000);
}
#[test]
fn owner_creation_is_serialized_and_audit_failure_rolls_back_provisioning() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = Workspace::new(Store::open(&path, KEY).unwrap());
    let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
    a.store.0.execute_batch("CREATE TRIGGER fail_audit BEFORE INSERT ON local_identity_audit BEGIN SELECT RAISE(IGNORE); END;").unwrap();
    assert!(a.setup(PASSWORD).is_err());
    assert!(!a.status().unwrap().configured);
    assert!(!a.status().unwrap().unlocked);
    a.store.0.execute_batch("DROP TRIGGER fail_audit").unwrap();
    a.setup(PASSWORD).unwrap();
    assert!(matches!(
        b.setup(PASSWORD),
        Err(StoreError::AccessConfigured)
    ));
    assert!(!b.status().unwrap().unlocked);
    b.login("owner", PASSWORD).unwrap();
}
#[test]
fn privileged_mutations_and_audits_commit_or_rollback_together() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    w.add_product(item()).unwrap();
    let count = w.identity_audit(0).unwrap().len();
    w.store.0.execute_batch("CREATE TRIGGER fail_audit BEFORE INSERT ON local_identity_audit BEGIN SELECT RAISE(ABORT,'audit failed'); END;").unwrap();
    assert!(w
        .create_staff(details("staff", Role::Cashier), PASSWORD)
        .is_err());
    assert_eq!(w.list_staff().unwrap().len(), 1);
    assert!(w.adjust_stock(correction()).is_err());
    assert_eq!(w.list_products().unwrap()[0].stock_milli, 10000);
    assert!(w.save(0, draft()).is_err());
    assert_eq!(w.load().unwrap().revision, 0);
    assert!(w.post_invoice(bill()).is_err());
    assert!(w.list_invoices(0).unwrap().is_empty());
    assert!(w.billing_outbox(0).unwrap().is_empty());
    assert_eq!(w.identity_audit(0).unwrap().len(), count);
    w.lock();
    assert!(!w.status().unwrap().unlocked); // Fail-safe lock despite an unwritable audit.
}
#[test]
fn audit_is_append_only_including_sqlite_replace_after_reopen() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    w.create_staff(details("cashier", Role::Cashier), PASSWORD)
        .unwrap();
    let records = w.identity_audit(0).unwrap();
    assert!(records.iter().any(|e| e.action == "owner.provisioned"));
    assert!(records.iter().any(|e| e.action == "staff.created"));
    for sql in [
        "UPDATE local_identity_audit SET action='forged'",
        "DELETE FROM local_identity_audit",
        "INSERT OR REPLACE INTO local_identity_audit SELECT * FROM local_identity_audit",
    ] {
        assert!(w.store.0.execute_batch(sql).is_err());
    }
    drop(w);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(w.identity_audit(0).is_err());
    w.login("owner", PASSWORD).unwrap();
    assert!(w
        .store
        .0
        .execute_batch("DELETE FROM local_identity_audit")
        .is_err());
}
#[test]
fn password_salts_are_unique_and_ipc_results_never_contain_secrets() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    w.create_staff(details("staff", Role::Cashier), PASSWORD)
        .unwrap();
    let hashes: Vec<String> = {
        let mut q = w
            .store
            .0
            .prepare("SELECT password_hash FROM local_principals")
            .unwrap();
        let rows = q.query_map([], |r| r.get(0)).unwrap();
        rows.collect::<Result<_, _>>().unwrap()
    };
    assert_eq!(hashes.len(), 2);
    assert_ne!(hashes[0], hashes[1]);
    assert!(hashes
        .iter()
        .all(|h| h.starts_with(HASH_PREFIX) && !h.contains(PASSWORD)));
    let public = serde_json::to_string(&(
        w.local_session().unwrap(),
        w.list_staff().unwrap(),
        w.identity_audit(0).unwrap(),
    ))
    .unwrap();
    for secret in [PASSWORD, KEY, "password_hash", "argon2id"] {
        assert!(!public.contains(secret));
    }
    assert!(w
        .create_staff(details("STAFF", Role::Manager), PASSWORD)
        .is_err());
}
#[test]
fn failed_attempts_persist_across_restart_unknown_user_and_clock_rollback() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    for _ in 0..4 {
        assert!(matches!(
            w.login_at("missing", "wrong", 100),
            Err(StoreError::IncorrectPassword)
        ));
    }
    drop(w);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(matches!(
        w.login_at("owner", "wrong", 100),
        Err(StoreError::RateLimited)
    ));
    for now in [99, 159] {
        assert!(matches!(
            w.login_at("owner", PASSWORD, now),
            Err(StoreError::RateLimited)
        ));
    }
    w.login_at("owner", PASSWORD, 160).unwrap();
    assert!(matches!(
        w.login_at("owner", "wrong", 160),
        Err(StoreError::IncorrectPassword)
    ));
    assert!(!w.status().unwrap().unlocked);
}
#[test]
fn expiry_and_idle_lock_are_native_and_restart_never_restores_a_session() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    let scope = w.local_session().unwrap().scope;
    w.last_activity
        .set(Instant::now() - Duration::from_secs(901));
    assert!(matches!(w.list_products(), Err(StoreError::Locked)));
    w.login("owner", PASSWORD).unwrap();
    w.store.1.as_mut().unwrap().expires = Instant::now() - Duration::from_secs(1);
    assert!(matches!(w.load(), Err(StoreError::Locked)));
    drop(w);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(!w.status().unwrap().unlocked);
    w.login("owner", PASSWORD).unwrap();
    assert_eq!(w.local_session().unwrap().scope, scope);
}

#[test]
fn passive_access_and_session_polling_cannot_renew_an_idle_session() {
    let d = tempfile::tempdir().unwrap();
    let w = owner(&d.path().join("s.db"));
    let before = Instant::now() - Duration::from_secs(899);
    w.last_activity.set(before);
    assert!(w.status().unwrap().unlocked);
    assert!(w.local_session().is_ok());
    assert_eq!(w.last_activity.get(), before);
    w.last_activity
        .set(Instant::now() - Duration::from_secs(901));
    assert!(!w.status().unwrap().unlocked);
    assert!(matches!(w.local_session(), Err(StoreError::Locked)));
    assert!(matches!(w.list_products(), Err(StoreError::Locked)));
}
#[test]
fn malformed_hash_and_failed_auth_writes_never_unlock() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    w.store.0.pragma_update(None, "query_only", true).unwrap();
    assert!(w.login("owner", PASSWORD).is_err());
    assert!(!w.status().unwrap().unlocked);
    w.store.0.pragma_update(None, "query_only", false).unwrap();
    w.store.0.execute("UPDATE local_principals SET password_hash='$argon2id$v=19$m=4294967295,t=2,p=1$bad$bad'",[]).unwrap();
    assert!(matches!(
        w.login("owner", PASSWORD),
        Err(StoreError::AccessUnavailable)
    ));
    assert!(!w.status().unwrap().unlocked);
}
#[test]
fn v6_migration_preserves_data_and_requires_the_existing_owners_password() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("legacy.db");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.pragma_update(None, "key", KEY).unwrap();
    db.execute_batch(include_str!("../fixtures/pr120-v4-schema.sql"))
        .unwrap();
    db.execute_batch(include_str!("billing-schema.sql"))
        .unwrap();
    db.execute_batch("CREATE TABLE local_checkout(singleton INTEGER PRIMARY KEY CHECK(singleton=1),operation_id TEXT NOT NULL UNIQUE,request TEXT NOT NULL); CREATE TABLE local_checkout_canceled(operation_id TEXT PRIMARY KEY NOT NULL); PRAGMA user_version=6;").unwrap();
    let hash = hash_password(PASSWORD).unwrap();
    db.execute("UPDATE workspace_access SET password_hash=?1", [&hash])
        .unwrap();
    let raw = serde_json::to_string(&draft()).unwrap();
    db.execute("INSERT INTO workspace_draft VALUES(1,1,?1)", [&raw])
        .unwrap();
    db.execute("INSERT INTO workspace_history VALUES(1,?1)", [&raw])
        .unwrap();
    drop(db);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(w.status().unwrap().configured);
    assert!(!w.status().unwrap().unlocked);
    assert!(matches!(
        w.setup("New different password"),
        Err(StoreError::AccessConfigured)
    ));
    assert!(matches!(
        w.login("owner", "wrong"),
        Err(StoreError::IncorrectPassword)
    ));
    w.login("owner", PASSWORD).unwrap();
    assert_eq!(w.load().unwrap().draft, Some(draft()));
    assert_eq!(w.saved_copies().unwrap().len(), 1);
    let scope = w.local_session().unwrap().scope;
    assert!(w
        .identity_audit(0)
        .unwrap()
        .iter()
        .any(|e| e.action == "identity.migrated"));
    drop(w);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.login("owner", PASSWORD).unwrap();
    assert_eq!(w.local_session().unwrap().scope, scope);
}
#[test]
fn invalid_owner_fields_and_passwords_do_not_partially_provision() {
    let d = tempfile::tempdir().unwrap();
    let mut w = Workspace::new(Store::open(&d.path().join("s.db"), KEY).unwrap());
    for password in ["short".into(), " ".repeat(10), "x".repeat(129)] {
        assert!(matches!(
            w.setup(&password),
            Err(StoreError::InvalidPassword)
        ));
        assert!(!w.status().unwrap().configured);
    }
    let setup = OwnerSetup {
        business_name: "".into(),
        business_type: "general".into(),
        display_name: "Owner".into(),
        username: "owner".into(),
    };
    assert!(matches!(
        w.provision_owner(setup, PASSWORD),
        Err(StoreError::InvalidIdentity)
    ));
    assert!(!w.status().unwrap().configured);
}

#[test]
fn exact_replays_do_not_expose_other_cashiers_completed_receipts() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    w.add_product(item()).unwrap();
    w.create_staff(details("cashier", Role::Cashier), PASSWORD)
        .unwrap();
    w.prepare_checkout(bill()).unwrap();
    w.post_prepared_invoice(bill()).unwrap();
    w.clear_checkout("sale", true).unwrap();
    w.login("cashier", PASSWORD).unwrap();
    assert!(matches!(
        w.prepare_checkout(bill()),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.post_prepared_invoice(bill()),
        Err(StoreError::Forbidden)
    ));
    assert_eq!(w.cashier_state().unwrap().products[0].stock_milli, 9000);
}
#[test]
fn native_dispatch_denials_are_audited_without_renderer_supplied_identity() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    w.save(0, draft()).unwrap();
    w.create_staff(details("cashier", Role::Cashier), PASSWORD)
        .unwrap();
    w.login("cashier", PASSWORD).unwrap();
    let scope = w.local_session().unwrap().scope;
    let cashier = w.local_session().unwrap().principal.id;
    assert!(matches!(
        w.run_scoped(&scope, |w| w.save(1, draft())),
        Err(StoreError::Forbidden)
    ));
    assert!(w.load().unwrap().draft.unwrap().note.is_empty());
    w.login("owner", PASSWORD).unwrap();
    let audit = w.identity_audit(0).unwrap();
    assert!(audit.iter().any(|e| e.action == "authorization.denied"
        && e.actor_id.as_deref() == Some(&cashier)
        && e.actor_role.as_deref() == Some("cashier")));
}

#[test]
fn ignored_authentication_counter_writes_fail_closed() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    w.store.0.execute_batch("CREATE TRIGGER ignore_budget BEFORE UPDATE ON workspace_access BEGIN SELECT RAISE(IGNORE); END;").unwrap();
    assert!(matches!(
        w.login("owner", PASSWORD),
        Err(StoreError::AccessUnavailable)
    ));
    assert!(!w.status().unwrap().unlocked);
    assert!(matches!(
        w.login("owner", "wrong"),
        Err(StoreError::AccessUnavailable)
    ));
    assert!(!w.status().unwrap().unlocked);
}

#[test]
fn encrypted_storage_and_temporary_data_policy_are_explicit_after_reopen() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    let private_note = "Synthetic confidential customer reference 34f291cc8b9d";
    w.save(
        0,
        Draft {
            business_name: "Synthetic private shop".into(),
            business_type: "general".into(),
            note: private_note.into(),
        },
    )
    .unwrap();
    for store in [&w.store, &Store::open(&path, KEY).unwrap()] {
        for (pragma, expected) in [
            ("temp_store", 2),
            ("foreign_keys", 1),
            ("recursive_triggers", 1),
            ("synchronous", 2),
        ] {
            assert_eq!(
                store
                    .0
                    .pragma_query_value(None, pragma, |r| r.get::<_, i64>(0))
                    .unwrap(),
                expected,
                "{pragma}"
            );
        }
        let memory_security: String = store
            .0
            .pragma_query_value(None, "cipher_memory_security", |r| r.get(0))
            .unwrap();
        assert_eq!(memory_security, "1");
    }
    for file in std::fs::read_dir(d.path()).unwrap() {
        let bytes = std::fs::read(file.unwrap().path()).unwrap();
        for secret in [private_note, PASSWORD, KEY] {
            assert!(
                !bytes
                    .windows(secret.len())
                    .any(|window| window == secret.as_bytes()),
                "Sensitive marker found in database sidecar"
            );
        }
    }
    let plain = rusqlite::Connection::open(&path).unwrap();
    assert!(plain
        .query_row("SELECT COUNT(*) FROM sqlite_schema", [], |r| r
            .get::<_, i64>(0))
        .is_err());
    drop(w);
    let mut reopened = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(!reopened.status().unwrap().unlocked);
    reopened.login("owner", PASSWORD).unwrap();
    assert_eq!(reopened.load().unwrap().draft.unwrap().note, private_note);
}

#[test]
fn user_facing_errors_do_not_include_database_or_parser_payloads() {
    let marker = "Synthetic private payment/customer payload 7b67c3a824";
    let error = StoreError::Database(rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(1),
        Some(marker.into()),
    ));
    assert!(!error.to_string().contains(marker));
    let parse = serde_json::from_str::<serde_json::Value>(marker).unwrap_err();
    assert!(!StoreError::InvalidData(parse).to_string().contains(marker));
}

#[test]
fn saved_receipt_lookup_enforces_actor_scope_and_revocation_after_acknowledgement() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    w.add_product(item()).unwrap();
    w.acknowledge_inventory("rice").unwrap();
    let owner_receipt = w.post_invoice(bill()).unwrap();
    let cashier = w
        .create_staff(details("cashier", Role::Cashier), PASSWORD)
        .unwrap();
    w.create_staff(details("assistant", Role::AssistantManager), PASSWORD)
        .unwrap();
    w.create_staff(details("manager", Role::Manager), PASSWORD)
        .unwrap();
    w.login("cashier", PASSWORD).unwrap();
    assert!(matches!(
        w.read_invoice(&owner_receipt.id),
        Err(StoreError::Forbidden)
    ));
    let mut request = bill();
    request.operation_id = "cashier-sale".into();
    request.lines[0].expected_revision = 2;
    w.prepare_checkout(request.clone()).unwrap();
    let own = w.post_prepared_invoice(request).unwrap();
    w.clear_checkout(&own.id, true).unwrap();
    assert_eq!(w.read_invoice(&own.id).unwrap(), own);
    assert!(matches!(w.list_invoices(0), Err(StoreError::Forbidden)));
    w.login("assistant", PASSWORD).unwrap();
    assert!(matches!(
        w.read_invoice(&own.id),
        Err(StoreError::Forbidden)
    ));
    w.login("manager", PASSWORD).unwrap();
    assert_eq!(w.read_invoice(&own.id).unwrap(), own);
    assert_eq!(w.read_invoice(&owner_receipt.id).unwrap(), owner_receipt);
    let mut stale = Workspace::new(Store::open(&path, KEY).unwrap());
    stale.login("cashier", PASSWORD).unwrap();
    w.login("owner", PASSWORD).unwrap();
    w.change_staff(change(&cashier, Role::Cashier, false))
        .unwrap();
    assert!(matches!(
        stale.read_invoice(&own.id),
        Err(StoreError::Locked)
    ));
    let foreign = owner(&d.path().join("foreign.db"))
        .local_session()
        .unwrap()
        .scope;
    assert!(matches!(
        w.run_scoped(&foreign, |w| w.read_invoice(&own.id)),
        Err(StoreError::WorkspaceMismatch)
    ));
}

#[test]
fn receipt_reads_preserve_posted_state_and_refuse_invalid_or_missing_ids() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    w.add_product(item()).unwrap();
    let receipt = w.post_invoice(bill()).unwrap();
    let records = serde_json::to_value(w.list_invoices(0).unwrap()).unwrap();
    let stock = w.list_products().unwrap();
    let outbox = serde_json::to_value(w.billing_outbox(0).unwrap()).unwrap();
    for _ in 0..3 {
        assert_eq!(w.read_invoice(&receipt.id).unwrap(), receipt);
    }
    assert!(matches!(
        w.read_invoice("not-posted"),
        Err(StoreError::InvoiceMissing)
    ));
    for id in ["", "' OR 1=1 --", &"x".repeat(81)] {
        assert!(matches!(
            w.read_invoice(id),
            Err(StoreError::InvalidInvoice)
        ));
    }
    assert_eq!(
        serde_json::to_value(w.list_invoices(0).unwrap()).unwrap(),
        records
    );
    assert_eq!(w.list_products().unwrap(), stock);
    assert_eq!(
        serde_json::to_value(w.billing_outbox(0).unwrap()).unwrap(),
        outbox
    );
    w.lock();
    assert!(matches!(
        w.read_invoice(&receipt.id),
        Err(StoreError::Locked)
    ));
}
