//! Reliability regressions use real encrypted SQLite files, not a mocked store.
use super::*;
use crate::{
    access::Workspace,
    catalog::{AddProduct, AdjustStock, Product},
    Draft,
};
use rusqlite::{types::Value, Connection};
use std::path::Path;

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Synthetic billing review password";
const BILLING_TABLES: &[&str] = &[
    "local_products",
    "local_inventory_events",
    "local_invoices",
    "local_invoice_stock",
    "local_invoice_actors",
    "local_billing_ledger",
    "local_billing_audit",
    "local_billing_outbox",
    // Authentication appends its own audit records; financial sequences must not change.
    "sqlite_sequence",
];
type TableRows = Vec<(String, Vec<Vec<Value>>)>;

fn rows(db: &Connection, tables: &[&str]) -> TableRows {
    tables
        .iter()
        .map(|table| {
            let mut statement = db
                .prepare(&format!(
                    "SELECT * FROM {table} {} ORDER BY rowid",
                    if *table == "sqlite_sequence" {
                        "WHERE name<>'local_identity_audit'"
                    } else {
                        ""
                    }
                ))
                .unwrap();
            let columns = statement.column_count();
            let values = statement
                .query_map([], |row| {
                    (0..columns)
                        .map(|index| row.get(index))
                        .collect::<Result<Vec<Value>, _>>()
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            ((*table).into(), values)
        })
        .collect()
}
fn state(store: &Store) -> TableRows {
    rows(&store.0, BILLING_TABLES)
}
fn item() -> AddProduct {
    AddProduct {
        operation_id: "rice".into(),
        name: "Sample rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 4250,
        opening_stock_milli: 10000,
    }
}
fn seeded(path: &Path) -> Store {
    let mut store = Store::open(path, KEY).unwrap();
    store.add_product(item()).unwrap();
    store
}
fn bill(store: &Store, id: &str) -> PostInvoice {
    let rice = store
        .list_products()
        .unwrap()
        .into_iter()
        .find(|p| p.id == "rice")
        .unwrap();
    PostInvoice {
        operation_id: id.into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: rice.revision,
            quantity_milli: 1250,
        }],
        tax_basis_points: 500,
        tender: Tender::Cash,
        customer_id: None,
    }
}
fn ledger(store: &Store, id: &str) -> Vec<(String, Option<String>, i64)> {
    store.0.prepare("SELECT account,customer_id,amount_paise FROM local_billing_ledger WHERE invoice_id=?1 ORDER BY account")
        .unwrap().query_map([id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap().collect::<Result<Vec<_>, _>>().unwrap()
}

#[test]
fn committed_sale_contains_complete_aggregated_records_and_replays_unchanged() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("s.db");
    let mut store = seeded(&path);
    let mut beans = item();
    beans.operation_id = "beans".into();
    beans.sku = "BEANS".into();
    beans.unit_price_paise = 1000;
    beans.opening_stock_milli = 3000;
    store.add_product(beans).unwrap();
    let mut request = bill(&store, "sale-1");
    request.lines.extend([
        BillLine {
            product_id: "rice".into(),
            expected_revision: 1,
            quantity_milli: 750,
        },
        BillLine {
            product_id: "beans".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        },
    ]);
    let invoice = store.post_invoice(request.clone()).unwrap();
    assert_eq!(
        (
            invoice.subtotal_paise,
            invoice.tax_paise,
            invoice.total_paise
        ),
        (9501, 475, 9976)
    );
    let movements: Vec<(String,i64,i64,i64)> = store.0.prepare("SELECT product_id,quantity_milli,before_milli,after_milli FROM local_invoice_stock ORDER BY product_id")
        .unwrap().query_map([], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))
        .unwrap().collect::<Result<Vec<_>,_>>().unwrap();
    assert_eq!(
        movements,
        vec![
            ("beans".into(), 1000, 3000, 2000),
            ("rice".into(), 2000, 10000, 8000)
        ]
    );
    for product in store.list_products().unwrap() {
        assert_eq!(product.revision, 2);
    }
    assert_eq!(
        ledger(&store, "sale-1"),
        vec![
            ("cash".into(), None, 9976),
            ("revenue".into(), None, -9501),
            ("tax_payable".into(), None, -475),
        ]
    );
    let audit: String = store
        .0
        .query_row(
            "SELECT payload FROM local_billing_audit WHERE invoice_id='sale-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let outbox = store.billing_outbox(0).unwrap();
    assert_eq!(outbox.len(), 1);
    assert_eq!(outbox[0].invoice_id, "sale-1");
    assert_eq!(audit, outbox[0].payload);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&audit).unwrap(),
        serde_json::json!({
            "version":1,"kind":"invoice.posted","operationId":"sale-1","invoice":invoice,
        })
    );
    assert_eq!(store.list_invoices(0).unwrap().len(), 1);
    let committed = state(&store);
    drop(store);
    let mut reopened = Store::open(&path, KEY).unwrap();
    assert_eq!(state(&reopened), committed);
    assert_eq!(reopened.post_invoice(request).unwrap(), invoice);
    assert_eq!(state(&reopened), committed);
}

#[test]
fn cash_credit_and_zero_tax_ledgers_are_correct_per_invoice() {
    let directory = tempfile::tempdir().unwrap();
    let mut store = seeded(&directory.path().join("s.db"));
    for (id, tender, tax, customer, asset, total) in [
        ("cash", Tender::Cash, 500, None, "cash", 5579),
        (
            "credit",
            Tender::Credit,
            500,
            Some("customer-1"),
            "receivables",
            5579,
        ),
        (
            "zero-tax",
            Tender::Cash,
            0,
            Some("customer-1"),
            "cash",
            5313,
        ),
    ] {
        let mut request = bill(&store, id);
        request.tender = tender;
        request.tax_basis_points = tax;
        request.customer_id = customer.map(str::to_owned);
        let invoice = store.post_invoice(request).unwrap();
        let mut expected: Vec<(String, Option<String>, i64)> = vec![
            (asset.into(), customer.map(str::to_owned), total),
            ("revenue".into(), None, -5313),
        ];
        if tax > 0 {
            expected.push(("tax_payable".into(), None, -266));
        }
        expected.sort_by(|a, b| a.0.cmp(&b.0));
        let entries = ledger(&store, id);
        assert_eq!(entries, expected);
        assert_eq!(entries.iter().map(|row| row.2).sum::<i64>(), 0);
        assert_eq!(invoice.total_paise, total);
    }
}

#[test]
fn ignored_required_writes_must_abort_the_sale() {
    for table in [
        "local_products",
        "local_invoices",
        "local_invoice_stock",
        "local_billing_ledger",
        "local_billing_audit",
        "local_billing_outbox",
    ] {
        let directory = tempfile::tempdir().unwrap();
        let mut store = seeded(&directory.path().join("s.db"));
        let before = state(&store);
        let action = if table == "local_products" {
            "UPDATE"
        } else {
            "INSERT"
        };
        // Unlike RAISE(ABORT), IGNORE reports no SQL error and changes zero rows.
        store.0.execute_batch(&format!("CREATE TRIGGER skip_write BEFORE {action} ON {table} BEGIN SELECT RAISE(IGNORE); END;")).unwrap();
        let result = store.post_invoice(bill(&store, "skipped"));
        if table == "local_products" {
            assert!(
                matches!(result, Err(StoreError::StockConflict)),
                "{result:?}"
            );
        } else {
            assert!(
                matches!(result, Err(StoreError::Database(_))),
                "{table}: {result:?}"
            );
        }
        assert_eq!(state(&store), before, "{table}");
    }
}

#[test]
fn write_failures_preserve_prior_sales_and_retry_after_reopen() {
    for table in [
        "local_invoices",
        "local_products",
        "local_invoice_stock",
        "local_billing_ledger",
        "local_billing_audit",
        "local_billing_outbox",
    ] {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("s.db");
        let mut store = seeded(&path);
        store.post_invoice(bill(&store, "prior-sale")).unwrap();
        let before = state(&store);
        let request = bill(&store, "failed-sale");
        let action = if table == "local_products" {
            "UPDATE"
        } else {
            "INSERT"
        };
        store.0.execute_batch(&format!("CREATE TRIGGER fail_write BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'injected write failure'); END;")).unwrap();
        assert!(
            matches!(
                store.post_invoice(request.clone()),
                Err(StoreError::Database(_))
            ),
            "{table}"
        );
        assert_eq!(state(&store), before, "{table}");
        drop(store);
        let mut store = Store::open(&path, KEY).unwrap();
        assert_eq!(state(&store), before, "reopen: {table}");
        store.0.execute_batch("DROP TRIGGER fail_write").unwrap();
        let invoice = store.post_invoice(request.clone()).unwrap();
        let after = state(&store);
        assert_eq!(store.post_invoice(request).unwrap(), invoice);
        assert_eq!(state(&store), after);
        assert_eq!(store.list_invoices(0).unwrap().len(), 2);
    }
}

#[test]
fn commit_time_failure_rolls_back_invoice_stock_ledger_audit_and_outbox() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("s.db");
    let mut store = seeded(&path);
    store.post_invoice(bill(&store, "prior-sale")).unwrap();
    let before = state(&store);
    let request = bill(&store, "commit-fails");
    // Every posting INSERT succeeds; the deferred FK fails only at COMMIT.
    store.0.execute_batch("CREATE TABLE deferred_failure (invoice_id TEXT REFERENCES local_invoices(id) DEFERRABLE INITIALLY DEFERRED);
        CREATE TRIGGER fail_commit AFTER INSERT ON local_billing_outbox BEGIN INSERT INTO deferred_failure VALUES('absent-invoice'); END;").unwrap();
    let error = store.post_invoice(request.clone()).unwrap_err();
    assert!(
        matches!(error,StoreError::Database(ref e) if e.sqlite_error_code()==Some(rusqlite::ErrorCode::ConstraintViolation))
    );
    assert_eq!(state(&store), before);
    assert_eq!(rows(&store.0, &["deferred_failure"])[0].1.len(), 0);
    drop(store);
    let mut store = Store::open(&path, KEY).unwrap();
    assert_eq!(state(&store), before);
    store
        .0
        .execute_batch("DROP TRIGGER fail_commit; DROP TABLE deferred_failure;")
        .unwrap();
    store.post_invoice(request).unwrap();
    assert_eq!(store.list_invoices(0).unwrap().len(), 2);
}

#[test]
fn changed_operation_data_never_changes_committed_state() {
    let directory = tempfile::tempdir().unwrap();
    let mut store = seeded(&directory.path().join("s.db"));
    let original = bill(&store, "stable-id");
    store.post_invoice(original.clone()).unwrap();
    let before = state(&store);
    let mut changes = vec![original.clone(); 6];
    changes[0].lines[0].quantity_milli += 1;
    changes[1].lines[0].expected_revision += 1;
    changes[2].lines[0].product_id = "other-product".into();
    changes[3].tax_basis_points = 0;
    changes[4].customer_id = Some("other-customer".into());
    changes[5].tender = Tender::Credit;
    changes[5].customer_id = Some("customer-1".into());
    for request in changes {
        assert!(matches!(
            store.post_invoice(request),
            Err(StoreError::OperationConflict)
        ));
        assert_eq!(state(&store), before);
    }
}

#[test]
fn racing_distinct_sales_cannot_oversell_or_duplicate_records() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("s.db");
    let mut first = seeded(&path);
    let mut second = Store::open(&path, KEY).unwrap();
    let mut a = bill(&first, "sale-a");
    a.lines[0].quantity_milli = 6000;
    let mut b = a.clone();
    b.operation_id = "sale-b".into();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let thread = std::thread::spawn(move || {
        other.wait();
        first.post_invoice(a)
    });
    barrier.wait();
    let b_result = second.post_invoice(b);
    let a_result = thread.join().unwrap();
    match (a_result, b_result) {
        (Ok(_), Err(StoreError::StockConflict)) | (Err(StoreError::StockConflict), Ok(_)) => {}
        other => panic!("One sale must commit and one must conflict: {other:?}"),
    }
    let products = second.list_products().unwrap();
    assert_eq!((products[0].stock_milli, products[0].revision), (4000, 2));
    assert_eq!(second.list_invoices(0).unwrap().len(), 1);
    assert_eq!(second.billing_outbox(0).unwrap().len(), 1);
    let invoices = second.list_invoices(0).unwrap();
    assert_eq!(
        ledger(&second, &invoices[0].invoice.id)
            .iter()
            .map(|r| r.2)
            .sum::<i64>(),
        0
    );
    let mut fresh = bill(&second, "sale-c");
    fresh.lines[0].quantity_milli = 6000;
    let before = state(&second);
    assert!(matches!(
        second.post_invoice(fresh),
        Err(StoreError::InvalidStock)
    ));
    assert_eq!(state(&second), before);
}

#[test]
fn upi_references_and_renderer_paid_flags_cannot_settle_an_invoice() {
    let directory = tempfile::tempdir().unwrap();
    let mut store = seeded(&directory.path().join("s.db"));
    let before = state(&store);
    let fixtures: serde_json::Value = serde_json::from_str(include_str!(
        "../../business-domain/fixtures/native-invoice-contract.json"
    ))
    .unwrap();
    let attacks: Vec<_> = fixtures["requests"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|f| f["name"].as_str().unwrap().starts_with("settlement:"))
        .collect();
    assert!(!attacks.is_empty());
    for attack in attacks {
        assert!(
            serde_json::from_value::<PostInvoice>(attack["input"].clone()).is_err(),
            "{}",
            attack["name"]
        );
        assert_eq!(state(&store), before);
    }
    let mut credit = bill(&store, "still-unpaid");
    credit.tender = Tender::Credit;
    credit.customer_id = Some("customer-1".into());
    store.post_invoice(credit).unwrap();
    assert_eq!(
        ledger(&store, "still-unpaid")[0],
        ("receivables".into(), Some("customer-1".into()), 5579)
    );
    assert!(!ledger(&store, "still-unpaid").iter().any(|r| r.0 == "cash"));
}

#[test]
fn process_worker() {
    if let Some(path) = std::env::var_os("SORNIO_TEST_COMMITTED_BILL_DB") {
        let store = Store::open(Path::new(&path), KEY).unwrap();
        let request = bill(&store, "process-sale");
        let mut workspace = Workspace::new(store);
        workspace.unlock(PASSWORD).unwrap();
        workspace.post_invoice(request).unwrap();
        // Bypass Connection/Workspace destructors and graceful WAL checkpointing.
        std::process::exit(89);
    }
}

#[test]
fn committed_billing_survives_process_exit_relock_unlock_and_exact_retry() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("s.db");
    let store = seeded(&path);
    let original = bill(&store, "process-sale");
    let mut workspace = Workspace::new(store);
    workspace.setup(PASSWORD).unwrap();
    drop(workspace);
    let exit = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "billing::reliability_tests::process_worker"])
        .env("SORNIO_TEST_COMMITTED_BILL_DB", &path)
        .status()
        .unwrap();
    assert_eq!(exit.code(), Some(89));
    let reopened = Store::open(&path, KEY).unwrap();
    let committed = state(&reopened);
    assert_eq!(
        (
            reopened.list_products().unwrap()[0].stock_milli,
            reopened.list_products().unwrap()[0].revision
        ),
        (8750, 2)
    );
    assert_eq!(reopened.list_invoices(0).unwrap().len(), 1);
    assert_eq!(
        ledger(&reopened, "process-sale"),
        vec![
            ("cash".into(), None, 5579),
            ("revenue".into(), None, -5313),
            ("tax_payable".into(), None, -266)
        ]
    );
    let mut workspace = Workspace::new(reopened);
    assert!(!workspace.status().unwrap().unlocked);
    assert!(matches!(
        workspace.list_invoices(0),
        Err(StoreError::Locked)
    ));
    workspace.unlock(PASSWORD).unwrap();
    let saved = workspace.list_invoices(0).unwrap().remove(0).invoice;
    assert_eq!(workspace.post_invoice(original).unwrap(), saved);
    assert_eq!(workspace.billing_outbox(0).unwrap().len(), 1);
    drop(workspace);
    assert_eq!(state(&Store::open(&path, KEY).unwrap()), committed);
}

#[test]
fn frozen_pr120_v4_migration_preserves_all_existing_rows_and_idempotency() {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Algorithm, Argon2, Params, Version,
    };
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("legacy.db");
    // Create v4 independently; current v5 migration is never used to seed this DB.
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "key", KEY).unwrap();
    db.execute_batch(include_str!("../fixtures/pr120-v4-schema.sql"))
        .unwrap();
    let salt = SaltString::encode_b64(b"synthetic-v4-salt").unwrap();
    let hash = Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(19456, 2, 1, Some(32)).unwrap(),
    )
    .hash_password(PASSWORD.as_bytes(), &salt)
    .unwrap()
    .to_string();
    db.execute(
        "UPDATE workspace_access SET password_hash=?1,failed_attempts=2",
        [hash],
    )
    .unwrap();
    for revision in [1, 2] {
        let draft = serde_json::to_string(&Draft {
            business_name: "PR120 shop".into(),
            business_type: "kirana".into(),
            note: format!("Saved copy {revision}"),
        })
        .unwrap();
        db.execute(
            "INSERT INTO workspace_history(revision,payload) VALUES(?1,?2)",
            params![revision, draft],
        )
        .unwrap();
        if revision == 2 {
            db.execute(
                "INSERT INTO workspace_draft VALUES(1,?1,?2)",
                params![revision, draft],
            )
            .unwrap();
        }
    }
    let added = Product {
        id: "rice".into(),
        name: "Sample rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 4250,
        stock_milli: 10000,
        revision: 1,
    };
    let adjusted = Product {
        stock_milli: 11000,
        revision: 2,
        ..added.clone()
    };
    let adjustment = AdjustStock {
        operation_id: "receive-1".into(),
        product_id: "rice".into(),
        expected_revision: 1,
        delta_milli: 1000,
        reason: "Restock".into(),
    };
    db.execute(
        "INSERT INTO local_products VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![
            adjusted.id,
            adjusted.name,
            adjusted.sku,
            adjusted.unit,
            adjusted.unit_price_paise,
            adjusted.stock_milli,
            adjusted.revision
        ],
    )
    .unwrap();
    for (id, kind, request, result) in [
        (
            "rice",
            "product_added",
            serde_json::to_string(&item()).unwrap(),
            serde_json::to_string(&added).unwrap(),
        ),
        (
            "receive-1",
            "stock_adjusted",
            serde_json::to_string(&adjustment).unwrap(),
            serde_json::to_string(&adjusted).unwrap(),
        ),
    ] {
        db.execute("INSERT INTO local_inventory_events(operation_id,product_id,kind,request,result) VALUES(?1,'rice',?2,?3,?4)",params![id,kind,request,result]).unwrap();
    }
    let tables = [
        "workspace_draft",
        "workspace_history",
        "workspace_access",
        "local_products",
        "local_inventory_events",
    ];
    let before = rows(&db, &tables);
    drop(db);
    let mut migrated = Store::open(&path, KEY).unwrap();
    assert_eq!(
        migrated
            .0
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        7
    );
    assert_eq!(rows(&migrated.0, &tables), before);
    assert_eq!(migrated.add_product(item()).unwrap(), added);
    assert_eq!(migrated.adjust_stock(adjustment).unwrap(), adjusted);
    assert_eq!(rows(&migrated.0, &tables), before);
    let request = bill(&migrated, "after-migration");
    let mut workspace = Workspace::new(migrated);
    assert!(!workspace.status().unwrap().unlocked);
    workspace.unlock(PASSWORD).unwrap();
    assert_eq!(workspace.load().unwrap().revision, 2);
    assert_eq!(workspace.saved_copies().unwrap().len(), 2);
    assert_eq!(workspace.list_products().unwrap(), vec![adjusted]);
    workspace.post_invoice(request).unwrap();
    assert_eq!(workspace.list_products().unwrap()[0].stock_milli, 9750);
    // Restoring an old workspace draft never rewinds committed financial records.
    workspace.restore(2, 1).unwrap();
    assert_eq!(workspace.list_invoices(0).unwrap().len(), 1);
    assert_eq!(workspace.list_products().unwrap()[0].stock_milli, 9750);
}
