//! Phase 3 financial, concurrency, crash and SQLCipher regressions.
//! Assertions observe committed database state. Integer paise only.
use super::*;
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    catalog::AddProduct,
    customers::SaveCustomer,
    identity::{Role, Session, StaffDetails},
    Store, StoreError,
};
use rusqlite::types::Value as SqlValue;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Synthetic retail password 2026";

fn authenticated(path: &Path) -> Store {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    if !w.status().unwrap().configured {
        w.setup(PASSWORD).unwrap();
    } else {
        w.unlock(PASSWORD).unwrap();
    }
    let l = w.local_session().unwrap();
    drop(w);
    let mut s = Store::open(path, KEY).unwrap();
    s.1 = Some(Session {
        scope: l.scope,
        actor_id: l.principal.id,
        revision: l.principal.revision,
        generation: crate::recovery::generation(&s.0).unwrap(),
        expires: std::time::Instant::now() + std::time::Duration::from_secs(3600),
    });
    s
}

fn seed(path: &Path) -> Store {
    let mut s = authenticated(path);
    s.add_product(AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 100000,
    })
    .unwrap();
    s
}

fn customer(id: &str, limit: Option<i64>) -> SaveCustomer {
    SaveCustomer {
        operation_id: format!("create-{id}"),
        id: id.into(),
        name: format!("Customer {id}"),
        phone: Some("+91 98765 43210".into()),
        credit_limit_paise: limit,
        credit_days: 30,
        expected_revision: None,
    }
}

fn rice(store: &Store, milli: i64) -> BillLine {
    BillLine {
        product_id: "rice".into(),
        expected_revision: store.list_products().unwrap()[0].revision,
        quantity_milli: milli,
    }
}

fn req(id: &str, action: Action) -> Request {
    Request {
        operation_id: id.into(),
        action,
    }
}

fn perform(s: &mut Store, r: Request) -> Receipt {
    s.prepare_retail(r.clone()).unwrap();
    let out = s.post_retail(r.clone()).unwrap();
    s.clear_retail(&r.operation_id, true).unwrap();
    out
}

/// ₹1,000 retail sale (10 kg × ₹100) with optional customer credit part.
fn retail_1000(s: &Store, id: &str, who: Option<&str>, parts: &[(&str, i64)]) -> Request {
    req(
        id,
        Action::Sale {
            invoice: PostInvoice {
                operation_id: id.into(),
                lines: vec![rice(s, 10000)],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: who.map(str::to_owned),
            },
            payments: parts
                .iter()
                .enumerate()
                .map(|(i, (method, amount))| PaymentPart {
                    id: format!("{id}-p-{i}"),
                    method: (*method).into(),
                    amount_paise: *amount,
                    reference: String::new(),
                })
                .collect(),
        },
    )
}

fn cash_or_credit(s: &Store, id: &str, tender: Tender, who: Option<&str>) -> PostInvoice {
    PostInvoice {
        operation_id: id.into(),
        lines: vec![rice(s, 10000)],
        tax_basis_points: 0,
        tender,
        customer_id: who.map(str::to_owned),
    }
}

fn count(s: &Store, sql: &str) -> i64 {
    s.0.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn journals_balance(s: &Store) {
    let mut q = s
        .0
        .prepare("SELECT operation_id,SUM(amount) FROM local_retail_journal GROUP BY operation_id")
        .unwrap();
    for n in q.query_map([], |r| r.get::<_, i64>(1)).unwrap() {
        assert_eq!(n.unwrap(), 0);
    }
    let billing: i64 = s
        .0
        .query_row(
            "SELECT COALESCE(SUM(amount_paise),0) FROM local_billing_ledger",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(billing, 0);
}

fn money(s: &Store) -> (String, String, usize, i64, i64, i64) {
    let b = s.cashier_state().unwrap().balances;
    (
        b.cash_paise,
        b.credit_paise,
        s.list_invoices(0).unwrap().len(),
        s.list_products().unwrap()[0].stock_milli,
        i64::try_from(pending_digital(&s.0).unwrap()).unwrap(),
        count(s, "SELECT COUNT(*) FROM local_credit_entries"),
    )
}

fn snapshots(s: &Store) -> Vec<Vec<Vec<SqlValue>>> {
    [
        "local_invoices",
        "local_products",
        "local_invoice_stock",
        "local_billing_ledger",
        "local_billing_outbox",
        "local_credit_entries",
        "local_customer_journal",
        "local_retail_ops",
        "local_retail_payments",
        "local_retail_journal",
        "local_retail_activity",
        "local_retail_outbox",
        "local_retail_canceled",
        "local_retail_pending",
    ]
    .iter()
    .map(|t| {
        let mut q = s
            .0
            .prepare(&format!("SELECT * FROM {t} ORDER BY rowid"))
            .unwrap();
        let n = q.column_count();
        q.query_map([], |r| {
            (0..n)
                .map(|i| r.get(i))
                .collect::<Result<Vec<SqlValue>, _>>()
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    })
    .collect()
}

fn independent_sha256(payload: &str) -> String {
    format!("{:x}", Sha256::digest(payload.as_bytes()))
}

fn copy_sqlcipher(src: &Path, dest: &Path) {
    std::fs::copy(src, dest).expect("copy sqlcipher db");
    for suffix in ["-wal", "-shm"] {
        let from = PathBuf::from(format!("{}{suffix}", src.display()));
        if from.exists() {
            std::fs::copy(&from, PathBuf::from(format!("{}{suffix}", dest.display())))
                .expect("copy sqlcipher wal");
        }
    }
}

struct Case {
    id: &'static str,
    customer: bool,
    parts: &'static [(&'static str, i64)],
    tender: Option<Tender>,
    cash: &'static str,
    credit: &'static str,
    digital: i64,
    debt_entries: i64,
}

#[test]
fn financial_matrix_posts_supported_allocations_in_integer_paise() {
    let cases = [
        Case {
            id: "fin-cash-1000",
            customer: false,
            parts: &[],
            tender: Some(Tender::Cash),
            cash: "100000",
            credit: "0",
            digital: 0,
            debt_entries: 0,
        },
        Case {
            id: "fin-upi-1000",
            customer: false,
            parts: &[("upi", 100000)],
            tender: None,
            cash: "0",
            credit: "0",
            digital: 100000,
            debt_entries: 0,
        },
        Case {
            id: "fin-card-1000",
            customer: false,
            parts: &[("card", 100000)],
            tender: None,
            cash: "0",
            credit: "0",
            digital: 100000,
            debt_entries: 0,
        },
        Case {
            id: "fin-credit-1000",
            customer: true,
            parts: &[],
            tender: Some(Tender::Credit),
            cash: "0",
            credit: "100000",
            digital: 0,
            debt_entries: 1,
        },
        Case {
            id: "fin-cash-upi",
            customer: false,
            parts: &[("cash", 60000), ("upi", 40000)],
            tender: None,
            cash: "60000",
            credit: "0",
            digital: 40000,
            debt_entries: 0,
        },
        Case {
            id: "fin-cash-credit",
            customer: true,
            parts: &[("cash", 60000), ("credit", 40000)],
            tender: None,
            cash: "60000",
            credit: "40000",
            digital: 0,
            debt_entries: 1,
        },
        Case {
            id: "fin-cash-card",
            customer: false,
            parts: &[("cash", 25000), ("card", 75000)],
            tender: None,
            cash: "25000",
            credit: "0",
            digital: 75000,
            debt_entries: 0,
        },
        Case {
            id: "fin-three-way",
            customer: true,
            parts: &[("cash", 30000), ("upi", 30000), ("credit", 40000)],
            tender: None,
            cash: "30000",
            credit: "40000",
            digital: 30000,
            debt_entries: 1,
        },
    ];
    assert_eq!(cases.len(), 8, "supported matrix must not shrink silently");
    for case in cases {
        let d = tempfile::tempdir().unwrap();
        let mut s = seed(&d.path().join("s.db"));
        if case.customer {
            s.save_customer(customer("c1", Some(500000))).unwrap();
        }
        if let Some(tender) = case.tender {
            s.post_invoice(cash_or_credit(
                &s,
                case.id,
                tender,
                case.customer.then_some("c1"),
            ))
            .unwrap();
        } else {
            perform(
                &mut s,
                retail_1000(
                    &s,
                    case.id,
                    case.customer.then_some("c1"),
                    case.parts,
                ),
            );
        }
        assert_eq!(
            money(&s),
            (
                case.cash.into(),
                case.credit.into(),
                1,
                90000,
                case.digital,
                case.debt_entries
            ),
            "{}",
            case.id
        );
        assert_eq!(
            s.list_invoices(0).unwrap()[0].invoice.total_paise,
            100000,
            "{}",
            case.id
        );
        assert_eq!(
            count(
                &s,
                &format!("SELECT COUNT(*) FROM local_invoice_stock WHERE invoice_id='{}'", case.id)
            ),
            1,
            "{}",
            case.id
        );
        assert_eq!(
            count(
                &s,
                &format!("SELECT COUNT(*) FROM local_billing_outbox WHERE invoice_id='{}'", case.id)
            ),
            1,
            "{}",
            case.id
        );
        if case.customer {
            assert_eq!(
                s.find_customers("c1", false).unwrap()[0].balance_paise,
                case.credit,
                "{}",
                case.id
            );
        }
        for p in invoice_payments(&s.0, case.id).unwrap() {
            assert!(
                !p.externally_verified,
                "{} must not claim provider verification",
                case.id
            );
        }
        journals_balance(&s);
        drop(s);
        let reopened = authenticated(&d.path().join("s.db"));
        assert_eq!(
            money(&reopened),
            (
                case.cash.into(),
                case.credit.into(),
                1,
                90000,
                case.digital,
                case.debt_entries
            ),
            "{} after reopen",
            case.id
        );
    }
}

#[test]
fn financial_matrix_rejects_invalid_allocations_without_partial_effects() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(customer("c1", Some(30000))).unwrap();
    let before = snapshots(&s);
    let mut rejected = 0usize;

    let empty = retail_1000(&s, "rej-empty", None, &[]);
    assert!(matches!(
        s.prepare_retail(empty),
        Err(StoreError::InvalidPayment)
    ));
    rejected += 1;

    let negative = retail_1000(&s, "rej-neg", None, &[("cash", -1)]);
    assert!(matches!(
        s.prepare_retail(negative),
        Err(StoreError::InvalidPayment)
    ));
    rejected += 1;

    let zero = retail_1000(&s, "rej-zero", None, &[("cash", 0)]);
    assert!(matches!(
        s.prepare_retail(zero),
        Err(StoreError::InvalidPayment)
    ));
    rejected += 1;

    let unknown = retail_1000(&s, "rej-wallet", None, &[("wallet", 100000)]);
    assert!(matches!(
        s.prepare_retail(unknown),
        Err(StoreError::InvalidPayment)
    ));
    rejected += 1;

    let credit_no_customer = retail_1000(
        &s,
        "rej-credit-anon",
        None,
        &[("cash", 60000), ("credit", 40000)],
    );
    assert!(matches!(
        s.prepare_retail(credit_no_customer),
        Err(StoreError::InvalidPayment)
    ));
    rejected += 1;

    let customer_no_credit = retail_1000(&s, "rej-cust-cash", Some("c1"), &[("cash", 100000)]);
    assert!(matches!(
        s.prepare_retail(customer_no_credit),
        Err(StoreError::InvalidPayment)
    ));
    rejected += 1;

    let two_credit = retail_1000(
        &s,
        "rej-two-credit",
        Some("c1"),
        &[("credit", 40000), ("credit", 60000)],
    );
    assert!(matches!(
        s.prepare_retail(two_credit),
        Err(StoreError::InvalidPayment)
    ));
    rejected += 1;
    assert_eq!(snapshots(&s), before);

    let over = retail_1000(
        &s,
        "rej-over",
        Some("c1"),
        &[("cash", 60000), ("credit", 50000)],
    );
    s.prepare_retail(over.clone()).unwrap();
    let prepared = snapshots(&s);
    assert!(matches!(
        s.post_retail(over.clone()),
        Err(StoreError::InvalidPayment)
    ));
    assert_eq!(snapshots(&s), prepared);
    s.clear_retail("rej-over", false).unwrap();
    rejected += 1;

    let under = retail_1000(
        &s,
        "rej-under",
        None,
        &[("cash", 60000), ("upi", 30000)],
    );
    s.prepare_retail(under.clone()).unwrap();
    let prepared = snapshots(&s);
    assert!(matches!(
        s.post_retail(under),
        Err(StoreError::InvalidPayment)
    ));
    assert_eq!(snapshots(&s), prepared);
    s.clear_retail("rej-under", false).unwrap();
    rejected += 1;

    let mut dup = retail_1000(&s, "rej-dup", None, &[("cash", 60000), ("upi", 40000)]);
    if let Action::Sale { payments, .. } = &mut dup.action {
        payments[1].id = payments[0].id.clone();
    }
    s.prepare_retail(dup.clone()).unwrap();
    let prepared = snapshots(&s);
    assert!(matches!(
        s.post_retail(dup),
        Err(StoreError::InvalidPayment)
    ));
    assert_eq!(snapshots(&s), prepared);
    s.clear_retail("rej-dup", false).unwrap();
    rejected += 1;

    let missing = retail_1000(
        &s,
        "rej-missing",
        Some("missing-cust"),
        &[("credit", 100000)],
    );
    s.prepare_retail(missing.clone()).unwrap();
    let prepared = snapshots(&s);
    assert!(matches!(
        s.post_retail(missing),
        Err(StoreError::CustomerMissing)
    ));
    assert_eq!(snapshots(&s), prepared);
    s.clear_retail("rej-missing", false).unwrap();
    rejected += 1;

    let over_limit = retail_1000(
        &s,
        "rej-limit",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    s.prepare_retail(over_limit.clone()).unwrap();
    let prepared = snapshots(&s);
    assert!(matches!(
        s.post_retail(over_limit),
        Err(StoreError::CreditLimit)
    ));
    assert_eq!(snapshots(&s), prepared);
    s.clear_retail("rej-limit", false).unwrap();
    rejected += 1;

    assert_eq!(rejected, 12, "rejection matrix must not shrink silently");
    assert_eq!(s.list_invoices(0).unwrap().len(), 0);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 100000);
    assert_eq!(
        s.find_customers("c1", false).unwrap()[0].balance_paise,
        "0"
    );
    assert_eq!(count(&s, "SELECT COUNT(*) FROM local_credit_entries"), 0);
    journals_balance(&s);
}

#[test]
fn split_credit_reused_canceled_and_customer_ids_conflict() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(customer("c1", None)).unwrap();

    let first = retail_1000(
        &s,
        "split-ok",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    perform(&mut s, first.clone());
    let committed = snapshots(&s);
    assert!(matches!(
        s.post_retail(first.clone()),
        Ok(_)
    ));
    assert_eq!(snapshots(&s), committed);
    let mut changed = first;
    if let Action::Sale { payments, .. } = &mut changed.action {
        payments[0].amount_paise = 50000;
        payments[1].amount_paise = 50000;
    }
    assert!(matches!(
        s.post_retail(changed),
        Err(StoreError::OperationConflict)
    ));
    assert_eq!(snapshots(&s), committed);

    let canceled = retail_1000(
        &s,
        "split-cancel",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    s.prepare_retail(canceled.clone()).unwrap();
    s.clear_retail("split-cancel", false).unwrap();
    assert!(matches!(
        s.prepare_retail(canceled),
        Err(StoreError::OperationConflict)
    ));

    let stolen = retail_1000(
        &s,
        "create-c1",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    assert!(matches!(
        s.prepare_retail(stolen),
        Err(StoreError::OperationConflict)
    ));

    assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    assert_eq!(
        s.find_customers("c1", false).unwrap()[0].balance_paise,
        "40000"
    );
    journals_balance(&s);
}

#[test]
fn last_unit_inventory_race_never_oversells() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    a.acknowledge_inventory("rice").unwrap();
    a.add_product(AddProduct {
        operation_id: "last-unit".into(),
        name: "Last unit".into(),
        sku: "LAST".into(),
        unit: "pcs".into(),
        unit_price_paise: 100000,
        opening_stock_milli: 1000,
    })
    .unwrap();
    let mut b = authenticated(&path);
    let invoice = |id: &str| PostInvoice {
        operation_id: id.into(),
        lines: vec![BillLine {
            product_id: "last-unit".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    };
    let first = invoice("last-a");
    let second = invoice("last-b");
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_invoice(first)
    });
    barrier.wait();
    let b_result = b.post_invoice(second);
    let a_result = worker.join().unwrap();
    match (a_result, b_result) {
        (Ok(_), Err(StoreError::StockConflict | StoreError::InvalidStock))
        | (Err(StoreError::StockConflict | StoreError::InvalidStock), Ok(_)) => {}
        other => panic!("last unit must sell once: {other:?}"),
    }
    let last = b
        .list_products()
        .unwrap()
        .into_iter()
        .find(|p| p.id == "last-unit")
        .unwrap();
    assert_eq!(last.stock_milli, 0);
    assert_eq!(b.list_invoices(0).unwrap().len(), 1);
    assert_eq!(b.cashier_state().unwrap().balances.cash_paise, "100000");
}

#[test]
fn three_cashiers_two_units_never_oversell() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    a.acknowledge_inventory("rice").unwrap();
    a.add_product(AddProduct {
        operation_id: "two-units".into(),
        name: "Two units".into(),
        sku: "TWO".into(),
        unit: "pcs".into(),
        unit_price_paise: 100000,
        opening_stock_milli: 2000,
    })
    .unwrap();
    let mut b = authenticated(&path);
    let mut c = authenticated(&path);
    let invoice = |id: &str| PostInvoice {
        operation_id: id.into(),
        lines: vec![BillLine {
            product_id: "two-units".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    };
    let first = invoice("two-a");
    let second = invoice("two-b");
    let third = invoice("two-c");
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
    let other_a = barrier.clone();
    let other_b = barrier.clone();
    let worker_a = std::thread::spawn(move || {
        other_a.wait();
        a.post_invoice(first)
    });
    let worker_b = std::thread::spawn(move || {
        other_b.wait();
        b.post_invoice(second)
    });
    barrier.wait();
    let c_result = c.post_invoice(third);
    let a_result = worker_a.join().unwrap();
    let b_result = worker_b.join().unwrap();
    let ok = a_result.is_ok() as u8 + b_result.is_ok() as u8 + c_result.is_ok() as u8;
    assert!(
        ok >= 1 && ok <= 2,
        "two units / three cashiers: {a_result:?} {b_result:?} {c_result:?}"
    );
    let product = c
        .list_products()
        .unwrap()
        .into_iter()
        .find(|p| p.id == "two-units")
        .unwrap();
    assert_eq!(product.stock_milli, 2000 - 1000 * i64::from(ok));
    assert_eq!(c.list_invoices(0).unwrap().len(), usize::from(ok));
    assert!(product.stock_milli >= 0);
}

#[test]
fn same_invoice_id_concurrent_posts_once() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    let mut b = authenticated(&path);
    let left = cash_or_credit(&a, "same-id", Tender::Cash, None);
    let mut right = left.clone();
    right.lines[0].quantity_milli = 2000;
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_invoice(left)
    });
    barrier.wait();
    let b_result = b.post_invoice(right);
    let a_result = worker.join().unwrap();
    let posted = a_result.is_ok() as u8 + b_result.is_ok() as u8;
    assert_eq!(posted, 1, "same invoice id: {a_result:?} vs {b_result:?}");
    assert_eq!(b.list_invoices(0).unwrap().len(), 1);
    assert_eq!(
        count(&b, "SELECT COUNT(*) FROM local_billing_outbox"),
        1
    );
}

#[test]
fn concurrent_credit_limit_never_exceeds_customer_cap() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    a.save_customer(customer("c1", Some(50000))).unwrap();
    let mut b = authenticated(&path);
    let left = cash_or_credit(&a, "credit-a", Tender::Credit, Some("c1"));
    let right = cash_or_credit(&b, "credit-b", Tender::Credit, Some("c1"));
    let mut left = left;
    let mut right = right;
    left.lines[0].quantity_milli = 4000;
    right.lines[0].quantity_milli = 4000;
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_invoice(left)
    });
    barrier.wait();
    let b_result = b.post_invoice(right);
    let a_result = worker.join().unwrap();
    match (a_result, b_result) {
        (Ok(_), Err(StoreError::CreditLimit | StoreError::CreditConflict))
        | (Err(StoreError::CreditLimit | StoreError::CreditConflict), Ok(_)) => {}
        other => panic!("credit cap must serialize: {other:?}"),
    }
    let debt: i64 = b
        .find_customers("c1", false)
        .unwrap()[0]
        .balance_paise
        .parse()
        .unwrap();
    assert!(debt <= 50000, "customer debt {debt} exceeded ₹500 cap");
    assert_eq!(debt, 40000);
    assert_eq!(b.list_invoices(0).unwrap().len(), 1);
    assert_eq!(b.list_products().unwrap()[0].stock_milli, 96000);
}

#[test]
fn two_retail_sale_prepares_serialize_at_pending() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let first = retail_1000(&s, "prep-a", None, &[("cash", 100000)]);
    let second = retail_1000(&s, "prep-b", None, &[("cash", 100000)]);
    s.prepare_retail(first).unwrap();
    assert!(matches!(
        s.prepare_retail(second),
        Err(StoreError::CheckoutActive)
    ));
    assert_eq!(s.list_invoices(0).unwrap().len(), 0);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 100000);
}

#[test]
fn split_sale_mid_write_failures_leave_no_partial_financial_rows() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(customer("c1", None)).unwrap();
    let tables = [
        "local_invoices",
        "local_invoice_stock",
        "local_billing_ledger",
        "local_credit_entries",
        "local_retail_payments",
        "local_retail_journal",
        "local_billing_outbox",
        "local_retail_outbox",
    ];
    assert_eq!(tables.len(), 8);
    for (index, table) in tables.into_iter().enumerate() {
        let id = format!("fault-{index}");
        let request = retail_1000(
            &s,
            &id,
            Some("c1"),
            &[("cash", 60000), ("credit", 40000)],
        );
        s.prepare_retail(request.clone()).unwrap();
        let prepared = snapshots(&s);
        s.0.execute_batch(&format!(
            "CREATE TRIGGER phase3_fail BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'phase3 fault {table}'); END;"
        ))
        .unwrap();
        assert!(
            s.post_retail(request).is_err(),
            "insert into {table} must abort the split sale"
        );
        assert_eq!(snapshots(&s), prepared, "{table}");
        s.0.execute_batch("DROP TRIGGER phase3_fail").unwrap();
        s.clear_retail(&id, false).unwrap();
    }
    assert_eq!(s.list_invoices(0).unwrap().len(), 0);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 100000);
    assert_eq!(
        s.find_customers("c1", false).unwrap()[0].balance_paise,
        "0"
    );
    journals_balance(&s);
}

#[test]
#[ignore = "subprocess worker exercised by split_sale_process_death_before_and_after_commit"]
fn split_sale_crash_worker() {
    let path = std::env::var_os("SORNIO_RETAIL_CRASH_DB").unwrap();
    let mut s = authenticated(std::path::Path::new(&path));
    let raw: String = s
        .0
        .query_row("SELECT request FROM local_retail_pending", [], |r| r.get(0))
        .unwrap();
    s.post_retail(serde_json::from_str(&raw).unwrap()).unwrap();
    panic!("Crash point was not reached");
}

#[test]
fn split_sale_process_death_before_and_after_commit() {
    for phase in ["before_commit", "after_commit"] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = seed(&path);
        s.save_customer(customer("c1", None)).unwrap();
        let request = retail_1000(
            &s,
            "crash-split",
            Some("c1"),
            &[("cash", 60000), ("credit", 40000)],
        );
        s.prepare_retail(request.clone()).unwrap();
        drop(s);
        let exit = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "payments::phase3::split_sale_crash_worker",
                "--ignored",
            ])
            .env("SORNIO_RETAIL_CRASH_DB", &path)
            .env("SORNIO_RETAIL_CRASH_ID", "crash-split")
            .env("SORNIO_RETAIL_CRASH_PHASE", phase)
            .status()
            .unwrap();
        assert_eq!(
            exit.code(),
            Some(if phase == "before_commit" { 88 } else { 89 })
        );
        let mut s = authenticated(&path);
        if phase == "before_commit" {
            assert_eq!(s.list_invoices(0).unwrap().len(), 0);
            assert_eq!(s.list_products().unwrap()[0].stock_milli, 100000);
            assert_eq!(
                s.find_customers("c1", false).unwrap()[0].balance_paise,
                "0"
            );
        }
        let receipt = s.post_retail(request.clone()).unwrap();
        assert_eq!(s.list_invoices(0).unwrap().len(), 1);
        assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "60000");
        assert_eq!(s.cashier_state().unwrap().balances.credit_paise, "40000");
        assert_eq!(
            s.find_customers("c1", false).unwrap()[0].balance_paise,
            "40000"
        );
        assert_eq!(s.post_retail(request.clone()).unwrap(), receipt);
        let mut changed = request;
        if let Action::Sale { payments, .. } = &mut changed.action {
            payments[0].amount_paise = 50000;
            payments[1].amount_paise = 50000;
        }
        assert!(matches!(
            s.post_retail(changed),
            Err(StoreError::OperationConflict)
        ));
        journals_balance(&s);
    }
}

#[test]
fn sqlcipher_wrong_key_and_reopen_preserve_split_sale() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    s.save_customer(customer("c1", None)).unwrap();
    perform(
        &mut s,
        retail_1000(
            &s,
            "enc-split",
            Some("c1"),
            &[("cash", 60000), ("credit", 40000)],
        ),
    );
    drop(s);
    let mut wrong = KEY.to_string();
    wrong.replace_range(63..64, "0");
    assert_ne!(wrong, KEY);
    assert!(Store::open(&path, &wrong).is_err());
    let s = authenticated(&path);
    assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    assert_eq!(s.cashier_state().unwrap().balances.credit_paise, "40000");
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 90000);
}

#[test]
fn wal_copy_of_live_database_preserves_committed_split_sale() {
    let d = tempfile::tempdir().unwrap();
    let live = d.path().join("live.db");
    let mut s = seed(&live);
    s.save_customer(customer("c1", None)).unwrap();
    perform(
        &mut s,
        retail_1000(
            &s,
            "wal-split",
            Some("c1"),
            &[("cash", 60000), ("credit", 40000)],
        ),
    );
    drop(s);
    let copy = d.path().join("copy.db");
    copy_sqlcipher(&live, &copy);
    let copied = authenticated(&copy);
    assert_eq!(copied.list_invoices(0).unwrap().len(), 1);
    assert_eq!(
        copied.cashier_state().unwrap().balances.cash_paise,
        "60000"
    );
    assert_eq!(
        copied.cashier_state().unwrap().balances.credit_paise,
        "40000"
    );
    assert_eq!(
        copied.find_customers("c1", false).unwrap()[0].balance_paise,
        "40000"
    );
}

#[test]
fn outbox_sha256_matches_independent_hasher_of_sqlcipher_text() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(customer("c1", None)).unwrap();
    perform(
        &mut s,
        retail_1000(
            &s,
            "digest-split",
            Some("c1"),
            &[("cash", 60000), ("credit", 40000)],
        ),
    );
    let billing: String = s
        .0
        .query_row(
            "SELECT payload FROM local_billing_outbox WHERE invoice_id='digest-split'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let retail: String = s
        .0
        .query_row(
            "SELECT payload FROM local_retail_outbox WHERE operation_id='digest-split'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let billing_digest = crate::replication::payload_sha256(&billing);
    let retail_digest = crate::replication::payload_sha256(&retail);
    assert_eq!(billing_digest, independent_sha256(&billing));
    assert_eq!(retail_digest, independent_sha256(&retail));
    assert_ne!(billing_digest, retail_digest);
    assert_eq!(billing_digest.len(), 64);
    assert_eq!(retail_digest.len(), 64);
    assert!(billing.contains("\"kind\":\"invoice.posted\""));
    assert!(retail.contains("\"method\":\"cash\""));
    assert!(retail.contains("\"method\":\"credit\""));
    assert_ne!(
        billing_digest,
        crate::replication::payload_sha256("")
    );
}

#[test]
fn second_staff_cannot_steal_a_prepared_split_sale() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    a.save_customer(customer("c1", None)).unwrap();
    let request = retail_1000(
        &a,
        "owned-split",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    a.prepare_retail(request.clone()).unwrap();
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.unlock(PASSWORD).unwrap();
    w.create_staff(
        StaffDetails {
            username: "manager".into(),
            display_name: "Manager".into(),
            role: Role::Manager,
        },
        PASSWORD,
    )
    .unwrap();
    w.login("manager", PASSWORD).unwrap();
    let l = w.local_session().unwrap();
    drop(w);
    let mut b = Store::open(&path, KEY).unwrap();
    b.1 = Some(Session {
        scope: l.scope,
        actor_id: l.principal.id,
        revision: l.principal.revision,
        generation: crate::recovery::generation(&b.0).unwrap(),
        expires: std::time::Instant::now() + std::time::Duration::from_secs(3600),
    });
    assert!(matches!(
        b.post_retail(request),
        Err(StoreError::CheckoutActive)
    ));
    assert_eq!(b.list_invoices(0).unwrap().len(), 0);
    assert_eq!(
        b.find_customers("c1", false).unwrap()[0].balance_paise,
        "0"
    );
}
