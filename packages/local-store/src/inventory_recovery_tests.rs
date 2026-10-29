use super::*;
use crate::{
    access::Workspace,
    catalog::{AddProduct, AdjustStock},
    identity::{Role, StaffDetails},
};
use rusqlite::types::Value;
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Inventory recovery test password";
fn authenticated(path: &std::path::Path) -> Store {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    if w.status().unwrap().configured {
        w.login("owner", PASSWORD).unwrap();
    } else {
        w.setup(PASSWORD).unwrap();
    }
    let l = w.local_session().unwrap();
    let mut s = Store::open(path, KEY).unwrap();
    s.1 = Some(Session {
        scope: l.scope,
        actor_id: l.principal.id,
        revision: l.principal.revision,
        expires: std::time::Instant::now() + std::time::Duration::from_secs(3600),
    });
    s
}
fn item() -> AddProduct {
    AddProduct {
        operation_id: "item".into(),
        name: "Synthetic rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 10000,
    }
}
fn change(id: &str) -> AdjustStock {
    AdjustStock {
        operation_id: id.into(),
        product_id: "item".into(),
        expected_revision: 1,
        delta_milli: 2000,
        reason: "One delivery".into(),
    }
}
fn seed(path: &std::path::Path) -> Store {
    let mut s = authenticated(path);
    s.add_product(item()).unwrap();
    s.acknowledge_inventory("item").unwrap();
    s
}
fn snapshot(s: &Store) -> Vec<Vec<Vec<Value>>> {
    [
        "local_products",
        "local_inventory_events",
        "local_inventory_actors",
        "local_inventory_pending",
        "local_inventory_outbox",
        "local_identity_audit",
        "sqlite_sequence",
    ]
    .iter()
    .map(|table| {
        let mut q =
            s.0.prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))
                .unwrap();
        let n = q.column_count();
        q.query_map([], |r| {
            (0..n).map(|i| r.get(i)).collect::<Result<Vec<Value>, _>>()
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    })
    .collect()
}
#[test]
fn lost_inventory_reply_survives_restart_and_requires_ack_before_another_id() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    let saved = s.adjust_stock(change("delivery")).unwrap();
    drop(s);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(matches!(w.pending_inventory(), Err(StoreError::Locked)));
    w.login("owner", PASSWORD).unwrap();
    let recovered = w.pending_inventory().unwrap().unwrap();
    assert_eq!(recovered.operation_id, "delivery");
    assert_eq!(recovered.product, saved);
    assert!(matches!(
        w.adjust_stock(change("replacement")),
        Err(StoreError::CheckoutActive)
    ));
    assert_eq!(w.adjust_stock(change("delivery")).unwrap(), saved);
    w.acknowledge_inventory("delivery").unwrap();
    w.acknowledge_inventory("delivery").unwrap();
    assert!(w.pending_inventory().unwrap().is_none());
    assert_eq!(w.list_products().unwrap()[0].stock_milli, 12000);
    w.lock();
    assert!(matches!(
        w.acknowledge_inventory("delivery"),
        Err(StoreError::Locked)
    ));
}
#[test]
fn deferred_commit_failure_rolls_back_stock_receipt_audit_and_outbox() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    let before = snapshot(&s);
    s.0.execute_batch("CREATE TABLE fail_parent(id INTEGER PRIMARY KEY);CREATE TABLE fail_child(id INTEGER REFERENCES fail_parent(id) DEFERRABLE INITIALLY DEFERRED);CREATE TRIGGER fail_commit AFTER INSERT ON local_inventory_pending BEGIN INSERT INTO fail_child VALUES(1);END;").unwrap();
    assert!(s.adjust_stock(change("delivery")).is_err());
    assert_eq!(snapshot(&s), before);
    let session = s.1.clone();
    drop(s);
    let mut reopened = Store::open(&path, KEY).unwrap();
    assert_eq!(snapshot(&reopened), before);
    reopened.1 = session;
    reopened
        .0
        .execute_batch("DROP TRIGGER fail_commit")
        .unwrap();
    reopened.adjust_stock(change("delivery")).unwrap();
    assert_eq!(reopened.list_products().unwrap()[0].stock_milli, 12000);
    assert_eq!(
        reopened.pending_inventory().unwrap().unwrap().operation_id,
        "delivery"
    );
}
#[test]
fn every_required_inventory_write_rolls_back_together_on_ignored_or_failed_writes() {
    for target in [
        "local_products",
        "local_inventory_events",
        "local_inventory_actors",
        "local_inventory_pending",
        "local_inventory_outbox",
        "local_identity_audit",
    ] {
        for action in ["IGNORE", "ABORT,'injected failure'"] {
            let d = tempfile::tempdir().unwrap();
            let path = d.path().join("s.db");
            let mut s = seed(&path);
            let before = snapshot(&s);
            let verb = if target == "local_products" {
                "UPDATE"
            } else {
                "INSERT"
            };
            s.0.execute_batch(&format!("CREATE TRIGGER fail_inventory BEFORE {verb} ON {target} BEGIN SELECT RAISE({action}); END;")).unwrap();
            assert!(
                s.adjust_stock(change("delivery")).is_err(),
                "{target} {action}"
            );
            assert_eq!(snapshot(&s), before, "{target} {action}");
            s.0.execute_batch("DROP TRIGGER fail_inventory").unwrap();
            drop(s);
            let mut reopened = authenticated(&path);
            assert_eq!(&snapshot(&reopened)[..5], &before[..5]);
            let saved = reopened.adjust_stock(change("delivery")).unwrap();
            assert_eq!(reopened.adjust_stock(change("delivery")).unwrap(), saved);
            assert_eq!(saved.stock_milli, 12000);
        }
    }
}
#[test]
fn ignored_creation_event_never_leaves_an_unreplayable_item() {
    let d = tempfile::tempdir().unwrap();
    let mut s = authenticated(&d.path().join("s.db"));
    let before = snapshot(&s);
    s.0.execute_batch("CREATE TRIGGER skip_event BEFORE INSERT ON local_inventory_events BEGIN SELECT RAISE(IGNORE); END;").unwrap();
    assert!(s.add_product(item()).is_err());
    assert_eq!(snapshot(&s), before);
    s.0.execute_batch("DROP TRIGGER skip_event").unwrap();
    assert!(s.add_product(item()).is_ok());
}
#[test]
fn exact_and_competing_inventory_requests_serialize_across_connections() {
    for exact in [true, false] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        drop(seed(&path));
        let mut a = authenticated(&path);
        let mut b = authenticated(&path);
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let other = barrier.clone();
        let task = std::thread::spawn(move || {
            other.wait();
            a.adjust_stock(change("delivery"))
        });
        barrier.wait();
        let second = b.adjust_stock(change(if exact { "delivery" } else { "other-delivery" }));
        let first = task.join().unwrap();
        if exact {
            assert_eq!(first.unwrap(), second.unwrap());
        } else {
            assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
        }
        assert_eq!(b.list_products().unwrap()[0].stock_milli, 12000);
        assert_eq!(
            b.0.query_row("SELECT COUNT(*) FROM local_inventory_outbox", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
}
#[test]
fn receipts_cannot_cross_staff_or_business_scope_and_revoked_sessions_cannot_write() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut owner = Workspace::new(Store::open(&path, KEY).unwrap());
    owner.setup(PASSWORD).unwrap();
    owner
        .create_staff(
            StaffDetails {
                username: "manager".into(),
                display_name: "Manager".into(),
                role: Role::Manager,
            },
            PASSWORD,
        )
        .unwrap();
    owner.add_product(item()).unwrap();
    let scope = owner.local_session().unwrap().scope;
    let mut staff = Workspace::new(Store::open(&path, KEY).unwrap());
    staff.login("manager", PASSWORD).unwrap();
    assert!(staff.pending_inventory().unwrap().is_none());
    assert!(matches!(
        staff.add_product(item()),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        staff.acknowledge_inventory("item"),
        Err(StoreError::Forbidden)
    ));
    let mut wrong = scope.clone();
    wrong.business_id = "foreign".into();
    assert!(matches!(
        staff.run_scoped(&wrong, |w| w.pending_inventory()),
        Err(StoreError::WorkspaceMismatch)
    ));
    staff.lock();
    assert!(matches!(
        staff.adjust_stock(change("denied")),
        Err(StoreError::Locked)
    ));
    assert_eq!(owner.list_products().unwrap()[0].stock_milli, 10000);
}
#[test]
fn schema_nine_migration_preserves_inventory_and_legacy_operation_ids() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let s = seed(&path);
    let products = s.list_products().unwrap();
    s.0.execute_batch("DROP TABLE local_inventory_pending; DROP TABLE local_inventory_outbox; DROP TABLE local_inventory_actors; PRAGMA user_version=9;").unwrap();
    drop(s);
    let mut reopened = authenticated(&path);
    assert_eq!(reopened.list_products().unwrap(), products);
    assert!(reopened.pending_inventory().unwrap().is_none());
    assert_eq!(reopened.add_product(item()).unwrap(), products[0]);
    assert_eq!(
        reopened
            .0
            .query_row("SELECT COUNT(*) FROM local_inventory_outbox", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn inventory_attribution_and_outbox_cannot_be_rewritten_or_replaced() {
    let d = tempfile::tempdir().unwrap();
    let s = seed(&d.path().join("s.db"));
    let before = snapshot(&s);
    for table in ["local_inventory_actors", "local_inventory_outbox"] {
        for sql in [
            format!("DELETE FROM {table}"),
            format!("UPDATE {table} SET operation_id=operation_id"),
            format!("INSERT OR REPLACE INTO {table} SELECT * FROM {table}"),
        ] {
            assert!(s.0.execute_batch(&sql).is_err(), "{sql}");
            assert_eq!(snapshot(&s), before);
        }
    }
}
#[test]
#[ignore = "subprocess-only worker, exercised by process_termination_preserves_inventory_atomicity"]
fn inventory_crash_worker() {
    let path = std::env::var_os("SORNIO_INVENTORY_CRASH_DB").unwrap();
    let mut s = authenticated(std::path::Path::new(&path));
    s.adjust_stock(change("delivery")).unwrap();
    std::process::exit(89);
}
#[test]
fn process_termination_preserves_inventory_atomicity() {
    for phase in ["before_commit", "after_commit"] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        drop(seed(&path));
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "inventory_recovery::tests::inventory_crash_worker",
                "--ignored",
            ])
            .env("SORNIO_INVENTORY_CRASH_DB", &path)
            .env("SORNIO_INVENTORY_CRASH_PHASE", phase)
            .status()
            .unwrap();
        assert_eq!(
            status.code(),
            Some(if phase == "before_commit" { 88 } else { 89 })
        );
        let mut s = authenticated(&path);
        assert_eq!(
            s.list_products().unwrap()[0].stock_milli,
            if phase == "before_commit" {
                10000
            } else {
                12000
            }
        );
        assert_eq!(
            s.pending_inventory().unwrap().is_some(),
            phase == "after_commit"
        );
        s.adjust_stock(change("delivery")).unwrap();
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 12000);
    }
}
