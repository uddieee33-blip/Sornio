use super::*;
use crate::{
    access::Workspace,
    billing::BillLine,
    catalog::AddProduct,
    identity::{Role, StaffChange, StaffDetails},
};
use std::path::Path;
#[test]
fn simultaneous_duplicate_requests_share_one_durable_receipt() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut admin = owner(&path);
    let (s, g) = scope(&admin);
    admin
        .enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
        .unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let mut handles = vec![];
    for _ in 0..2 {
        let mut w = open(&path);
        let session = login(&mut w, "first", "owner", &s, &g);
        let (s, g, barrier) = (s.clone(), g.clone(), barrier.clone());
        handles.push(std::thread::spawn(move || {
            barrier.wait();
            w.post_lan_cash_invoice(&peer("first"), &session, &s, &g, sale("duplicate"))
                .unwrap()
        }));
    }
    let receipts: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(receipts[0], receipts[1]);
    assert_eq!(count(&admin, "local_invoices"), 1);
    assert_eq!(count(&admin, "local_lan_operations"), 1);
    assert_eq!(admin.list_products().unwrap()[0].stock_milli, 0);
}

#[test]
fn device_and_operation_history_cannot_be_deleted_or_replaced() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut admin = owner(&path);
    let (s, g) = scope(&admin);
    admin
        .enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
        .unwrap();
    let mut w = open(&path);
    let session = login(&mut w, "first", "owner", &s, &g);
    w.post_lan_cash_invoice(&peer("first"), &session, &s, &g, sale("saved"))
        .unwrap();
    drop(w);
    let reopened = open(&path);
    for sql in [
        "DELETE FROM local_lan_devices",
        "INSERT OR REPLACE INTO local_lan_devices SELECT * FROM local_lan_devices",
        "UPDATE local_lan_devices SET certificate_hash=printf('%064d',0)",
        "DELETE FROM local_lan_operations",
        "UPDATE local_lan_operations SET actor_id='forged'",
        "INSERT OR REPLACE INTO local_lan_operations SELECT * FROM local_lan_operations",
    ] {
        assert!(
            reopened.store_for_test().0.execute_batch(sql).is_err(),
            "{sql}"
        );
    }
    assert_eq!(count(&reopened, "local_lan_operations"), 1);
}
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Synthetic Owner password";
const SECRET: &str = "Independent synthetic recovery passphrase";
fn open(path: &Path) -> Workspace {
    Workspace::new(Store::open(path, KEY).unwrap())
}
fn owner(path: &Path) -> Workspace {
    let mut w = open(path);
    w.setup(PASSWORD).unwrap();
    w.add_product(AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 100,
        opening_stock_milli: 1000,
    })
    .unwrap();
    w.acknowledge_inventory("rice").unwrap();
    w
}
fn grant(id: &str, capability: Capability) -> Enrollment {
    Enrollment {
        id: id.into(),
        name: format!("Synthetic {id}"),
        certificate_hash: if id == "first" {
            "a".repeat(64)
        } else {
            "b".repeat(64)
        },
        capability,
    }
}
fn peer(id: &str) -> VerifiedPeer {
    VerifiedPeer {
        certificate_hash: grant(id, Capability::Cashier).certificate_hash,
    }
}
fn scope(w: &Workspace) -> (Scope, String) {
    (
        identity::scope(&w.store_for_test().0).unwrap(),
        crate::recovery::generation(&w.store_for_test().0).unwrap(),
    )
}
fn sale(id: &str) -> PostInvoice {
    PostInvoice {
        operation_id: id.into(),
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
fn staff(w: &mut Workspace, name: &str) -> Principal {
    w.create_staff(
        StaffDetails {
            username: name.into(),
            display_name: name.into(),
            role: Role::Cashier,
        },
        PASSWORD,
    )
    .unwrap()
}
fn login(w: &mut Workspace, id: &str, user: &str, s: &Scope, g: &str) -> Session {
    w.authenticate_lan_peer(&peer(id), s, g, user, PASSWORD)
        .unwrap()
}
fn count(w: &Workspace, t: &str) -> i64 {
    w.store_for_test()
        .0
        .query_row(&format!("SELECT count(*) FROM {t}"), [], |r| r.get(0))
        .unwrap()
}

#[test]
fn enrollment_requires_fresh_owner_and_replay_never_reenables_revoked_device() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut w = owner(&path);
    staff(&mut w, "staff");
    w.login("staff", PASSWORD).unwrap();
    assert!(matches!(
        w.enroll_lan_device(grant("first", Capability::Cashier), PASSWORD),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(w.list_lan_devices(), Err(StoreError::Forbidden)));
    w.login("owner", PASSWORD).unwrap();
    assert!(matches!(
        w.enroll_lan_device(grant("first", Capability::Cashier), "wrong"),
        Err(StoreError::IncorrectPassword)
    ));
    assert_eq!(count(&w, "local_lan_devices"), 0);
    w.login("owner", PASSWORD).unwrap();
    let device = w
        .enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
        .unwrap();
    assert_eq!(
        w.enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
            .unwrap()
            .revision,
        1
    );
    let mut duplicate = grant("second", Capability::Cashier);
    duplicate.certificate_hash = device.certificate_hash;
    assert!(matches!(
        w.enroll_lan_device(duplicate, PASSWORD),
        Err(StoreError::OperationConflict)
    ));
    w.change_lan_device("first", 1, false, Capability::Cashier, PASSWORD)
        .unwrap();
    assert!(matches!(
        w.enroll_lan_device(grant("first", Capability::Cashier), PASSWORD),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.change_lan_device("first", 1, true, Capability::Cashier, PASSWORD),
        Err(StoreError::Conflict)
    ));
    let devices = w.list_lan_devices().unwrap();
    assert_eq!(devices.len(), 1);
    assert!(!devices[0].enabled);
    assert!(w
        .identity_audit(0)
        .unwrap()
        .iter()
        .any(|a| a.action == "device.changed" && a.actor_id.is_some()));
}

#[test]
fn peer_human_scope_permission_and_revocation_are_intersected_on_every_request() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut admin = owner(&path);
    let person = staff(&mut admin, "cashier");
    let (s, g) = scope(&admin);
    admin
        .enroll_lan_device(grant("first", Capability::ReadOnly), PASSWORD)
        .unwrap();
    admin
        .enroll_lan_device(grant("second", Capability::Cashier), PASSWORD)
        .unwrap();
    let mut w = open(&path);
    let read_only = login(&mut w, "first", "owner", &s, &g);
    assert_eq!(
        w.lan_products(&peer("first"), &read_only, &s, &g)
            .unwrap()
            .len(),
        1
    );
    assert!(matches!(
        w.post_lan_cash_invoice(&peer("first"), &read_only, &s, &g, sale("read-only")),
        Err(StoreError::Forbidden)
    ));
    let session = login(&mut w, "second", "cashier", &s, &g);
    assert!(
        !w.status().unwrap().unlocked,
        "gateway authentication must not leave local Owner authority behind"
    );
    assert!(matches!(
        w.lan_products(&peer("first"), &session, &s, &g),
        Err(StoreError::Forbidden)
    ));
    let mut wrong = s.clone();
    wrong.business_id = "other".into();
    assert!(matches!(
        w.post_lan_cash_invoice(&peer("second"), &session, &wrong, &g, sale("wrong")),
        Err(StoreError::WorkspaceMismatch)
    ));
    admin
        .change_staff(StaffChange {
            id: person.id,
            expected_revision: 1,
            role: Role::Cashier,
            enabled: false,
        })
        .unwrap();
    assert!(matches!(
        w.post_lan_cash_invoice(&peer("second"), &session, &s, &g, sale("disabled")),
        Err(StoreError::Locked)
    ));
    let owner_session = login(&mut w, "second", "owner", &s, &g);
    admin
        .change_lan_device("second", 1, false, Capability::Cashier, PASSWORD)
        .unwrap();
    assert!(w
        .lan_products(&peer("second"), &owner_session, &s, &g)
        .is_err());
    admin
        .change_lan_device("second", 2, true, Capability::Cashier, PASSWORD)
        .unwrap();
    assert!(matches!(
        w.post_lan_cash_invoice(&peer("second"), &owner_session, &s, &g, sale("reenabled")),
        Err(StoreError::Locked)
    ));
    let fresh = login(&mut w, "second", "owner", &s, &g);
    w.post_lan_cash_invoice(&peer("second"), &fresh, &s, &g, sale("fresh"))
        .unwrap();
    assert_eq!(count(&w, "local_invoices"), 1);
}

#[test]
fn human_password_rotation_idle_expiry_and_unknown_device_fail_closed() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut admin = owner(&path);
    let (s, g) = scope(&admin);
    admin
        .enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
        .unwrap();
    let mut w = open(&path);
    assert!(w
        .authenticate_lan_peer(&peer("second"), &s, &g, "owner", PASSWORD)
        .is_err());
    let mut session = login(&mut w, "first", "owner", &s, &g);
    let before = Instant::now() - Duration::from_secs(899);
    session.last_activity.set(before);
    w.lan_products(&peer("first"), &session, &s, &g).unwrap();
    assert_eq!(
        session.last_activity.get(),
        before,
        "passive catalog refresh cannot renew human activity"
    );
    session
        .last_activity
        .set(Instant::now() - Duration::from_secs(901));
    assert!(matches!(
        w.lan_products(&peer("first"), &session, &s, &g),
        Err(StoreError::Locked)
    ));
    session = login(&mut w, "first", "owner", &s, &g);
    session.human.expires = Instant::now() - Duration::from_secs(1);
    assert!(matches!(
        w.lan_products(&peer("first"), &session, &s, &g),
        Err(StoreError::Locked)
    ));
    let session = login(&mut w, "first", "owner", &s, &g);
    admin
        .change_password(PASSWORD, "Changed synthetic Owner password")
        .unwrap();
    assert!(matches!(
        w.post_lan_cash_invoice(&peer("first"), &session, &s, &g, sale("rotated")),
        Err(StoreError::Locked)
    ));
    assert_eq!(count(&w, "local_invoices"), 0);
}

#[test]
fn committed_reply_loss_restart_duplicate_and_conflicting_identity_have_one_effect() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut admin = owner(&path);
    let (s, g) = scope(&admin);
    staff(&mut admin, "other");
    admin
        .enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
        .unwrap();
    admin
        .enroll_lan_device(grant("second", Capability::Cashier), PASSWORD)
        .unwrap();
    let mut w = open(&path);
    let session = login(&mut w, "first", "owner", &s, &g);
    let receipt = w
        .post_lan_cash_invoice(&peer("first"), &session, &s, &g, sale("sale"))
        .unwrap();
    drop(w);
    let mut reopened = open(&path);
    let fresh = login(&mut reopened, "first", "owner", &s, &g);
    assert_eq!(
        reopened
            .post_lan_cash_invoice(&peer("first"), &fresh, &s, &g, sale("sale"))
            .unwrap(),
        receipt
    );
    let mut changed = sale("sale");
    changed.lines[0].quantity_milli = 500;
    assert!(matches!(
        reopened.post_lan_cash_invoice(&peer("first"), &fresh, &s, &g, changed),
        Err(StoreError::OperationConflict)
    ));
    let other = login(&mut reopened, "first", "other", &s, &g);
    assert!(matches!(
        reopened.post_lan_cash_invoice(&peer("first"), &other, &s, &g, sale("sale")),
        Err(StoreError::OperationConflict)
    ));
    let other_device = login(&mut reopened, "second", "owner", &s, &g);
    assert!(matches!(
        reopened.post_lan_cash_invoice(&peer("second"), &other_device, &s, &g, sale("sale")),
        Err(StoreError::OperationConflict)
    ));
    assert_eq!(count(&reopened, "local_invoices"), 1);
    assert_eq!(count(&reopened, "local_lan_operations"), 1);
    assert_eq!(
        reopened
            .lan_products(&peer("first"), &fresh, &s, &g)
            .unwrap()[0]
            .stock_milli,
        0
    );
    let sum: i64 = reopened
        .store_for_test()
        .0
        .query_row(
            "SELECT sum(amount_paise) FROM local_billing_ledger",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sum, 0);
}

#[test]
fn two_native_clients_competing_for_last_stock_cannot_oversell() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut admin = owner(&path);
    let (s, g) = scope(&admin);
    staff(&mut admin, "first-human");
    staff(&mut admin, "second-human");
    admin
        .enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
        .unwrap();
    admin
        .enroll_lan_device(grant("second", Capability::Cashier), PASSWORD)
        .unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let mut handles = vec![];
    for (device, user) in [("first", "first-human"), ("second", "second-human")] {
        let mut w = open(&path);
        let session = login(&mut w, device, user, &s, &g);
        let s = s.clone();
        let g = g.clone();
        let barrier = barrier.clone();
        handles.push(std::thread::spawn(move || {
            barrier.wait();
            w.post_lan_cash_invoice(&peer(device), &session, &s, &g, sale(device))
        }));
    }
    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(results
        .iter()
        .any(|r| matches!(r, Err(StoreError::StockConflict))));
    assert_eq!(count(&admin, "local_invoices"), 1);
    assert_eq!(count(&admin, "local_lan_operations"), 1);
    assert_eq!(admin.list_products().unwrap()[0].stock_milli, 0);
}

#[test]
fn required_gateway_writes_roll_back_invoice_stock_ledger_and_outbox() {
    for trigger in ["CREATE TRIGGER fail_gateway BEFORE INSERT ON local_lan_operations BEGIN SELECT RAISE(IGNORE); END;", "CREATE TRIGGER fail_gateway BEFORE INSERT ON local_identity_audit WHEN NEW.action='device.sale_posted' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;"] {
        let d=tempfile::tempdir().unwrap();let path=d.path().join("db");let mut admin=owner(&path);let (s,g)=scope(&admin);
        admin.enroll_lan_device(grant("first",Capability::Cashier),PASSWORD).unwrap();let mut w=open(&path);let session=login(&mut w,"first","owner",&s,&g);
        admin.store_for_test().0.execute_batch(trigger).unwrap();
        assert!(w.post_lan_cash_invoice(&peer("first"),&session,&s,&g,sale("fail")).is_err());
        for table in ["local_lan_operations","local_invoices","local_billing_ledger","local_billing_outbox"] {assert_eq!(count(&w,table),0,"{table}");}
        assert_eq!(admin.list_products().unwrap()[0].stock_milli,1000);
        admin.store_for_test().0.execute_batch("DROP TRIGGER fail_gateway").unwrap();
        w.post_lan_cash_invoice(&peer("first"),&session,&s,&g,sale("fail")).unwrap();
    }
}

#[test]
fn restore_disables_devices_and_quarantines_old_sessions_and_operation_generations() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let archive = d.path().join("backup");
    let mut admin = owner(&path);
    let (s, g) = scope(&admin);
    admin
        .enroll_lan_device(grant("first", Capability::Cashier), PASSWORD)
        .unwrap();
    let mut w = open(&path);
    let session = login(&mut w, "first", "owner", &s, &g);
    w.post_lan_cash_invoice(&peer("first"), &session, &s, &g, sale("saved"))
        .unwrap();
    admin.export_backup(&archive, PASSWORD, SECRET).unwrap();
    let preview = admin
        .preview_backup(&archive, PASSWORD, SECRET, PASSWORD)
        .unwrap();
    admin
        .restore_backup(
            &archive,
            d.path(),
            PASSWORD,
            SECRET,
            PASSWORD,
            &preview,
            &preview.confirmation,
        )
        .unwrap();
    assert!(w
        .post_lan_cash_invoice(&peer("first"), &session, &s, &g, sale("saved"))
        .is_err());
    admin.login("owner", PASSWORD).unwrap();
    let devices = admin.list_lan_devices().unwrap();
    assert!(!devices[0].enabled);
    assert_eq!(devices[0].revision, 2);
    let (_, new_generation) = scope(&admin);
    assert_ne!(g, new_generation);
    assert!(w
        .authenticate_lan_peer(&peer("first"), &s, &new_generation, "owner", PASSWORD)
        .is_err());
    admin
        .change_lan_device("first", 2, true, Capability::Cashier, PASSWORD)
        .unwrap();
    let fresh = login(&mut w, "first", "owner", &s, &new_generation);
    assert!(w
        .lan_products(&peer("first"), &session, &s, &new_generation)
        .is_err());
    assert!(matches!(
        w.post_lan_cash_invoice(&peer("first"), &fresh, &s, &new_generation, sale("saved")),
        Err(StoreError::OperationConflict)
    ));
    assert_eq!(count(&admin, "local_invoices"), 1);
    assert_eq!(count(&admin, "local_lan_operations"), 1);
    assert!(admin
        .identity_audit(0)
        .unwrap()
        .iter()
        .any(|a| a.action == "recovery.device_disabled"));
}

#[test]
fn migration_from_frozen_v11_preserves_records_and_rejects_partial_schema_collision() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db");
    let mut w = owner(&path);
    w.post_invoice(sale("legacy")).unwrap();
    let invoices = serde_json::to_value(w.list_invoices(0).unwrap()).unwrap();
    remove_fixture_tables(&w.store_for_test().0);
    w.store_for_test()
        .0
        .pragma_update(None, "user_version", 11)
        .unwrap();
    let actual=w.store_for_test().0.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' ORDER BY type,name").unwrap().query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))).unwrap().collect::<Result<Vec<_>,_>>().unwrap();
    let frozen: Vec<(String, String, String)> =
        serde_json::from_str(include_str!("../../fixtures/recovery-v11-schema.json")).unwrap();
    assert_eq!(actual, frozen);
    drop(w);
    let mut migrated = open(&path);
    migrated.login("owner", PASSWORD).unwrap();
    assert_eq!(
        serde_json::to_value(migrated.list_invoices(0).unwrap()).unwrap(),
        invoices
    );
    assert!(migrated.list_lan_devices().unwrap().is_empty());
    remove_fixture_tables(&migrated.store_for_test().0);
    migrated
        .store_for_test()
        .0
        .execute_batch("CREATE TABLE local_lan_operations(incorrect TEXT); PRAGMA user_version=11;")
        .unwrap();
    drop(migrated);
    assert!(Store::open(&path, KEY).is_err());
    let db = Connection::open(path).unwrap();
    db.pragma_update(None, "key", KEY).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        11
    );
    assert!(!db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='local_lan_devices')",
            [],
            |r| r.get::<_, bool>(0)
        )
        .unwrap());
}
