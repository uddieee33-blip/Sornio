//! Real SQLCipher workloads. No direct SQL seeding or mocked financial records.
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    catalog::AddProduct,
    customers::SaveCustomer,
    identity::{Role, StaffDetails},
    purchasing::{CreatePurchaseOrder, PurchaseOrderLineInput, SaveSupplier},
    Store, StoreError,
};
use serde_json::json;
use std::{
    path::Path,
    sync::{Arc, Barrier},
    time::Instant,
};

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Phase22 synthetic owner password";

fn open(path: &Path) -> Workspace {
    Workspace::new(Store::open(path, KEY).unwrap())
}

fn sale(id: String, product: String, revision: i64) -> PostInvoice {
    PostInvoice {
        operation_id: id,
        lines: vec![BillLine {
            product_id: product,
            expected_revision: revision,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    }
}

fn scalar(w: &Workspace, sql: &str) -> i64 {
    w.store_for_test()
        .0
        .query_row(sql, [], |r| r.get(0))
        .unwrap()
}

#[test]
fn concurrent_cashiers_cannot_sell_the_same_stock_revision() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("concurrent.db");
    let mut w = open(&path);
    w.setup(PASSWORD).unwrap();
    w.add_product(AddProduct {
        operation_id: "one-item".into(),
        name: "One item".into(),
        sku: "ONE".into(),
        unit: "pcs".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 1000,
    })
    .unwrap();
    w.acknowledge_inventory("one-item").unwrap();
    for name in ["cashier-a", "cashier-b"] {
        w.create_staff(
            StaffDetails {
                username: name.into(),
                display_name: name.into(),
                role: Role::Cashier,
            },
            PASSWORD,
        )
        .unwrap();
    }
    drop(w);
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = ["cashier-a", "cashier-b"]
        .into_iter()
        .map(|name| {
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut w = open(&path);
                w.login(name, PASSWORD).unwrap();
                barrier.wait();
                w.post_invoice(sale(name.into(), "one-item".into(), 1))
            })
        })
        .collect();
    let outcomes: Vec<_> = workers.into_iter().map(|t| t.join().unwrap()).collect();
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(
        outcomes
            .iter()
            .filter(|r| matches!(r, Err(StoreError::StockConflict)))
            .count(),
        1
    );
    let w = open(&path);
    assert_eq!(scalar(&w, "SELECT COUNT(*) FROM local_invoices"), 1);
    assert_eq!(
        scalar(
            &w,
            "SELECT stock_milli FROM local_products WHERE id='one-item'"
        ),
        0
    );
    assert_eq!(
        scalar(
            &w,
            "SELECT SUM(amount_paise) FROM local_billing_ledger WHERE account='cash'"
        ),
        10000
    );
}

#[test]
#[ignore = "Explicit 5k/10k/50k/1k/5k workload; run via scripts/run-phase22-workload.py"]
fn requested_synthetic_dataset_reconciles_after_restart_and_backup_restore() {
    let started = Instant::now();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("scale.db");
    let startup = Instant::now();
    let mut w = open(&path);
    w.setup(PASSWORD).unwrap();
    let startup_ms = startup.elapsed().as_secs_f64() * 1000.0;
    let mut stages = serde_json::Map::new();
    let stage = Instant::now();
    for n in 0..5000 {
        let id = format!("p-{n}");
        w.add_product(AddProduct {
            operation_id: id.clone(),
            name: format!("Synthetic product {n:05}"),
            sku: format!("SKU-{n}"),
            unit: "pcs".into(),
            unit_price_paise: 10000,
            opening_stock_milli: 100000,
        })
        .unwrap();
        w.acknowledge_inventory(&id).unwrap();
    }
    stages.insert(
        "products_seconds".into(),
        json!(stage.elapsed().as_secs_f64()),
    );
    let stage = Instant::now();
    for n in 0..10000 {
        w.save_customer(SaveCustomer {
            operation_id: format!("c-save-{n}"),
            id: format!("c-{n}"),
            name: format!("Synthetic customer {n:05}"),
            phone: None,
            credit_limit_paise: None,
            credit_days: 0,
            expected_revision: None,
        })
        .unwrap();
    }
    stages.insert(
        "customers_seconds".into(),
        json!(stage.elapsed().as_secs_f64()),
    );
    let stage = Instant::now();
    for n in 0..1000 {
        w.save_supplier(SaveSupplier {
            operation_id: format!("s-save-{n}"),
            id: format!("s-{n}"),
            name: format!("Synthetic supplier {n:05}"),
            phone: None,
            gstin: None,
            address: None,
            payment_terms_days: 30,
            notes: String::new(),
            archived: false,
            expected_revision: None,
        })
        .unwrap();
    }
    stages.insert(
        "suppliers_seconds".into(),
        json!(stage.elapsed().as_secs_f64()),
    );
    let stage = Instant::now();
    for n in 0..5000 {
        w.create_purchase_order(CreatePurchaseOrder {
            operation_id: format!("po-{n}"),
            supplier_id: format!("s-{}", n % 1000),
            note: "Synthetic draft, no financial posting".into(),
            lines: vec![PurchaseOrderLineInput {
                product_id: format!("p-{n}"),
                quantity_milli: 1000,
                unit_cost_paise: 9000,
                tax_bps: Some(0),
            }],
        })
        .unwrap();
    }
    stages.insert(
        "orders_seconds".into(),
        json!(stage.elapsed().as_secs_f64()),
    );
    let stage = Instant::now();
    for n in 0..50000 {
        let request = sale(
            format!("invoice-{n}"),
            format!("p-{}", n % 5000),
            n / 5000 + 1,
        );
        let posted = w.post_invoice(request.clone()).unwrap();
        assert_eq!(posted.total_paise, 10000);
        if n % 1000 == 0 {
            // simulate a missing acknowledgement with the same immutable request
            assert_eq!(w.post_invoice(request).unwrap(), posted);
            println!("PHASE22_PROGRESS invoices={}", n + 1);
        }
    }
    let invoice_seconds = stage.elapsed().as_secs_f64();
    stages.insert("invoices_seconds".into(), json!(invoice_seconds));
    for (table, expected) in [
        ("local_products", 5000),
        ("local_customers", 10000),
        ("local_invoices", 50000),
        ("local_suppliers", 1000),
        ("local_purchase_orders", 5000),
    ] {
        assert_eq!(
            scalar(&w, &format!("SELECT COUNT(*) FROM {table}")),
            expected
        );
    }
    let reconcile = |w: &Workspace| {
        assert_eq!(
            scalar(w, "SELECT SUM(stock_milli) FROM local_products"),
            450000000
        );
        assert_eq!(
            scalar(
                w,
                "SELECT SUM(amount_paise) FROM local_billing_ledger WHERE account='cash'"
            ),
            500000000
        );
        assert_eq!(scalar(w, "SELECT COUNT(*) FROM (SELECT invoice_id FROM local_billing_ledger GROUP BY invoice_id HAVING SUM(amount_paise)<>0)"),0);
        assert_eq!(scalar(w, "SELECT COUNT(*) FROM local_supplier_entries"), 0);
        assert_eq!(
            scalar(w, "SELECT COUNT(*) FROM pragma_foreign_key_check"),
            0
        );
    };
    reconcile(&w);
    let mut queries = Vec::new();
    for _ in 0..30 {
        let query = Instant::now();
        assert_eq!(w.list_products().unwrap().len(), 5000);
        assert!(!w.find_customers("09999", false).unwrap().is_empty());
        assert!(!w.find_suppliers("00999", false).unwrap().is_empty());
        assert!(!w.find_purchase_orders("", "", "s-999").unwrap().is_empty());
        w.cashier_state().unwrap();
        queries.push(query.elapsed().as_secs_f64() * 1000.0);
    }
    drop(w);
    let encrypted_bytes = std::fs::metadata(&path).unwrap().len();
    assert!(!std::fs::read(&path)
        .unwrap()
        .starts_with(b"SQLite format 3"));
    let reopen = Instant::now();
    let mut w = open(&path);
    w.login("owner", PASSWORD).unwrap();
    let reopen_ms = reopen.elapsed().as_secs_f64() * 1000.0;
    reconcile(&w);
    let backup = dir.path().join("scale.sorniobackup");
    let recovery = "Separate phase22 synthetic recovery password";
    let stage = Instant::now();
    w.export_backup(&backup, PASSWORD, recovery).unwrap();
    let backup_seconds = stage.elapsed().as_secs_f64();
    let preview = w
        .preview_backup(&backup, PASSWORD, recovery, PASSWORD)
        .unwrap();
    w.restore_backup(
        &backup,
        dir.path(),
        PASSWORD,
        recovery,
        PASSWORD,
        &preview,
        &preview.confirmation,
    )
    .unwrap();
    w.login("owner", PASSWORD).unwrap();
    reconcile(&w);
    queries.sort_by(f64::total_cmp);
    println!(
        "PHASE22_METRICS {}",
        json!({"result":"PASS","schema":23,
        "counts":{"products":5000,"customers":10000,"invoices":50000,"suppliers":1000,"purchaseOrders":5000},
        "elapsed_seconds":started.elapsed().as_secs_f64(),"stages":stages,
        "native_postings_per_second":50000.0/invoice_seconds,
        "startup_with_setup_ms":startup_ms,"reopen_with_unlock_ms":reopen_ms,
        "query_bundle_ms":{"samples":30,"median":queries[15],"maximum":queries[29]},
        "encrypted_database_bytes":encrypted_bytes,"backup_bytes":std::fs::metadata(backup).unwrap().len(),
        "backup_seconds":backup_seconds,"financial_reconciliation":"PASS: cash, stock, balanced invoice journals, no draft-order debt; repeated after reopen and restore",
        "limitations":"native Workspace/SQLCipher workload; no installed GUI performance or physical power-loss claim"})
    );
}
