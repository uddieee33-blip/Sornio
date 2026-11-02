use super::*;
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice},
    catalog::AddProduct,
    identity::{Scope, StaffDetails},
};
use proptest::prelude::*;
use rusqlite::types::Value;
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Native customer password!";
fn profile(id: &str) -> SaveCustomer {
    SaveCustomer {
        operation_id: format!("create-{id}"),
        id: id.into(),
        name: format!("Customer {id}"),
        phone: Some("+91 98765 43210".into()),
        credit_limit_paise: None,
        credit_days: 30,
        expected_revision: None,
    }
}
fn store(path: &std::path::Path) -> Store {
    let mut s = Store::open(path, KEY).unwrap();
    s.save_customer(profile("c1")).unwrap();
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
fn sale(s: &mut Store, id: &str, customer_id: &str) -> Invoice {
    let rev = s.list_products().unwrap()[0].revision;
    s.post_invoice(PostInvoice {
        operation_id: id.into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: rev,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Credit,
        customer_id: Some(customer_id.into()),
    })
    .unwrap()
}
fn request(s: &Store, id: &str, kind: CreditKind, amount: i64) -> CreditRequest {
    CreditRequest {
        operation_id: id.into(),
        customer_id: "c1".into(),
        expected_revision: customer(&s.0, "c1").unwrap().revision,
        kind,
        amount_paise: amount,
        reason: "Verified account correction".into(),
        due_on: None,
        reverse_of: None,
    }
}
fn rows(s: &Store) -> Vec<Vec<Vec<Value>>> {
    [
        "local_customers",
        "local_credit_entries",
        "local_customer_ops",
        "local_customer_journal",
        "local_customer_outbox",
        "local_customer_pending",
        "local_customer_canceled",
        "local_products",
        "local_invoices",
        "local_billing_ledger",
        "local_billing_audit",
        "local_billing_outbox",
        "local_identity_audit",
    ]
    .iter()
    .map(|t| {
        let mut q =
            s.0.prepare(&format!("SELECT * FROM {t} ORDER BY rowid"))
                .unwrap();
        let n = q.column_count();
        let r = q
            .query_map([], |r| {
                (0..n).map(|i| r.get(i)).collect::<Result<Vec<Value>, _>>()
            })
            .unwrap();
        r.collect::<Result<Vec<_>, _>>().unwrap()
    })
    .collect()
}
fn owner(path: &std::path::Path) -> Workspace {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.setup(PASSWORD).unwrap();
    w
}
fn native_request(w: &Workspace, id: &str, kind: CreditKind, amount: i64) -> CreditRequest {
    let c = w
        .find_customers("c1", false)
        .unwrap()
        .into_iter()
        .find(|c| c.id == "c1")
        .unwrap();
    CreditRequest {
        operation_id: id.into(),
        customer_id: "c1".into(),
        expected_revision: c.revision,
        kind,
        amount_paise: amount,
        reason: "Owner verified correction".into(),
        due_on: if kind == CreditKind::OpeningDue {
            Some("2000-01-01".into())
        } else {
            None
        },
        reverse_of: None,
    }
}
#[test]
fn customer_profiles_use_stable_business_ids_and_exact_retries() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let c = s.save_customer(profile("c1")).unwrap();
    assert_eq!(c.phone.as_deref(), Some("+919876543210"));
    assert_eq!(c.balance_paise, "0");
    let before = rows(&s);
    assert_eq!(s.save_customer(profile("c1")).unwrap().id, "c1");
    assert_eq!(rows(&s), before);
    let mut p = profile("c1");
    p.name = "Changed".into();
    assert!(matches!(
        s.save_customer(p),
        Err(StoreError::OperationConflict)
    ));
    let mut p = profile("c1");
    p.operation_id = "edit".into();
    p.expected_revision = Some(c.revision);
    p.name = "New name".into();
    let c = s.save_customer(p.clone()).unwrap();
    assert_eq!(c.revision, 2);
    assert_eq!(s.save_customer(p).unwrap().revision, 2);
    for phone in ["not-a-number", "++919999999999", "123"] {
        let mut p = profile("new");
        p.phone = Some(phone.into());
        assert!(matches!(
            s.save_customer(p),
            Err(StoreError::InvalidCustomer)
        ));
    }
    assert!(serde_json::from_value::<SaveCustomer>(serde_json::json!({"operationId":"x","id":"c","name":"A","phone":null,"creditLimitPaise":null,"creditDays":30,"expectedRevision":null,"balancePaise":100})).is_err());
    assert!(s.0.execute("DELETE FROM local_customers", []).is_err());
    assert!(s
        .0
        .execute("UPDATE local_customers SET id='other' WHERE id='c1'", [])
        .is_err());
}
#[test]
fn partial_full_repayments_and_general_ledger_balances_are_atomic_and_exact() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    sale(&mut s, "sale-1", "c1");
    sale(&mut s, "sale-2", "c1");
    assert_eq!(customer(&s.0, "c1").unwrap().balance_paise, "20000");
    let r = request(&s, "partial", CreditKind::Repayment, 4501);
    let receipt = s.post_credit(r.clone(), false).unwrap();
    assert_eq!(receipt.balance_paise, "15499");
    let saved = rows(&s);
    assert_eq!(s.post_credit(r, false).unwrap(), receipt);
    assert_eq!(rows(&s), saved);
    let state = s.cashier_state().unwrap();
    assert_eq!(state.balances.cash_paise, "4501");
    assert_eq!(state.balances.credit_paise, "15499");
    s.post_credit(request(&s, "full", CreditKind::Repayment, 15499), false)
        .unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().balance_paise, "0");
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "20000");
    let mut q=s.0.prepare("SELECT operation_id,SUM(amount_paise) FROM local_customer_journal GROUP BY operation_id").unwrap();
    let totals = q
        .query_map([], |r| r.get::<_, i64>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(totals, vec![0, 0]);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 98000);
    assert_eq!(s.list_invoices(0).unwrap().len(), 2);
}
#[test]
fn overpayment_changed_ids_and_stale_account_versions_never_mutate_history() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    sale(&mut s, "sale", "c1");
    let before = rows(&s);
    assert!(matches!(
        s.post_credit(request(&s, "too-much", CreditKind::Repayment, 10001), false),
        Err(StoreError::Overpayment)
    ));
    assert_eq!(rows(&s), before);
    let stale = request(&s, "stale", CreditKind::Repayment, 9000);
    s.post_credit(request(&s, "paid", CreditKind::Repayment, 1000), false)
        .unwrap();
    let before = rows(&s);
    assert!(matches!(
        s.post_credit(stale, false),
        Err(StoreError::CreditConflict)
    ));
    let mut changed = request(&s, "paid", CreditKind::Repayment, 2000);
    assert!(matches!(
        s.post_credit(changed.clone(), false),
        Err(StoreError::OperationConflict)
    ));
    assert_eq!(rows(&s), before);
    changed.operation_id = "sale".into();
    assert!(matches!(
        s.post_credit(changed, false),
        Err(StoreError::OperationConflict)
    ));
    assert_eq!(rows(&s), before);
}
#[test]
fn credit_limits_are_checked_inside_original_invoice_transaction() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let mut p = profile("c1");
    p.operation_id = "limit".into();
    p.expected_revision = Some(1);
    p.credit_limit_paise = Some(15000);
    s.save_customer(p).unwrap();
    sale(&mut s, "first", "c1");
    let before = rows(&s);
    let r = PostInvoice {
        operation_id: "over-limit".into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: 2,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Credit,
        customer_id: Some("c1".into()),
    };
    assert!(matches!(s.post_invoice(r), Err(StoreError::CreditLimit)));
    assert_eq!(rows(&s), before);
    s.post_credit(request(&s, "pay", CreditKind::Repayment, 5000), false)
        .unwrap();
    sale(&mut s, "second", "c1");
    assert_eq!(customer(&s.0, "c1").unwrap().balance_paise, "15000");
    let r = PostInvoice {
        operation_id: "cash".into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: 3,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    };
    s.post_invoice(r).unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().balance_paise, "15000");
}
#[test]
fn accounting_corrections_are_append_only_balanced_and_reversible_once() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let mut opening = request(&s, "opening", CreditKind::OpeningDue, 20000);
    opening.due_on = Some("2000-01-01".into());
    s.post_credit(opening, false).unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().overdue_paise, "20000");
    s.post_credit(request(&s, "collect", CreditKind::Repayment, 5000), false)
        .unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().overdue_paise, "15000");
    let mut reverse = request(&s, "void-collect", CreditKind::Reversal, 0);
    reverse.reverse_of = Some("collect".into());
    s.post_credit(reverse.clone(), false).unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().overdue_paise, "20000");
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "0");
    assert_eq!(
        s.post_credit(reverse, false).unwrap().balance_paise,
        "20000"
    );
    let before = rows(&s);
    let mut r = request(&s, "void-again", CreditKind::Reversal, 0);
    r.reverse_of = Some("collect".into());
    assert!(matches!(
        s.post_credit(r, false),
        Err(StoreError::InvalidCredit)
    ));
    assert_eq!(rows(&s), before);
    s.post_credit(request(&s, "loss", CreditKind::WriteOff, 2000), false)
        .unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().balance_paise, "18000");
    let mut r = request(&s, "restore-loss", CreditKind::Reversal, 0);
    r.reverse_of = Some("loss".into());
    s.post_credit(r, false).unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().balance_paise, "20000");
    let mut r = request(&s, "void-opening", CreditKind::Reversal, 0);
    r.reverse_of = Some("opening".into());
    s.post_credit(r, false).unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().balance_paise, "0");
    assert_eq!(customer(&s.0, "c1").unwrap().overdue_paise, "0");
    assert_eq!(
        s.customer_statement("c1", 0, None).unwrap().entries.len(),
        6
    );
}
#[test]
fn linking_an_existing_credit_sale_retains_invoice_and_transfer_history() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let original = sale(&mut s, "invoice", "legacy-ref");
    s.save_customer(profile("real-account")).unwrap();
    let source = customer(&s.0, "legacy-ref").unwrap();
    let target = customer(&s.0, "real-account").unwrap();
    let link = LinkCredit {
        operation_id: "link".into(),
        invoice_id: "invoice".into(),
        customer_id: "real-account".into(),
        source_revision: source.revision,
        target_revision: target.revision,
        reason: "Owner verified account identifier".into(),
    };
    let result = s.link_credit(link.clone()).unwrap();
    assert_eq!(result.balance_paise, "10000");
    let before = rows(&s);
    assert_eq!(s.link_credit(link).unwrap(), result);
    assert_eq!(rows(&s), before);
    assert_eq!(customer(&s.0, "legacy-ref").unwrap().balance_paise, "0");
    assert_eq!(s.list_invoices(0).unwrap()[0].invoice, original);
    assert_eq!(s.cashier_state().unwrap().balances.credit_paise, "10000");
    assert_eq!(
        s.customer_statement("legacy-ref", 0, None)
            .unwrap()
            .entries
            .len(),
        2
    );
    assert_eq!(
        s.customer_statement("real-account", 0, None)
            .unwrap()
            .entries
            .len(),
        1
    );
    let mut pay = request(&s, "collection", CreditKind::Repayment, 1000);
    pay.customer_id = "real-account".into();
    pay.expected_revision = result.revision;
    s.post_credit(pay, false).unwrap();
    let before = rows(&s);
    let r = LinkCredit {
        operation_id: "unsafe-relink".into(),
        invoice_id: "invoice".into(),
        customer_id: "c1".into(),
        source_revision: customer(&s.0, "real-account").unwrap().revision,
        target_revision: 1,
        reason: "Attempt after collection".into(),
    };
    assert!(matches!(
        s.link_credit(r),
        Err(StoreError::CreditAlreadyCollected)
    ));
    assert_eq!(rows(&s), before);
}
#[test]
fn all_required_credit_writes_rollback_together_and_retry_after_reopen() {
    for table in [
        "local_customer_ops",
        "local_credit_entries",
        "local_customer_journal",
        "local_customer_outbox",
        "local_customers",
    ] {
        for failure in ["ABORT,'injected'", "IGNORE"] {
            let d = tempfile::tempdir().unwrap();
            let path = d.path().join("s.db");
            let mut s = store(&path);
            sale(&mut s, "sale", "c1");
            let r = request(&s, "repayment", CreditKind::Repayment, 1000);
            let before = rows(&s);
            let action = if table == "local_customers" {
                "UPDATE"
            } else {
                "INSERT"
            };
            s.0.execute_batch(&format!("CREATE TRIGGER fail_credit BEFORE {action} ON {table} BEGIN SELECT RAISE({failure}); END;")).unwrap();
            assert!(s.post_credit(r.clone(), false).is_err(), "{table}");
            assert_eq!(rows(&s), before, "{table}");
            drop(s);
            let mut s = Store::open(&path, KEY).unwrap();
            assert_eq!(rows(&s), before);
            s.0.execute_batch("DROP TRIGGER fail_credit").unwrap();
            s.post_credit(r.clone(), false).unwrap();
            let saved = rows(&s);
            s.post_credit(r, false).unwrap();
            assert_eq!(rows(&s), saved);
        }
    }
}
#[test]
fn subledger_failure_rolls_back_original_invoice_stock_general_ledger_and_outbox() {
    for table in ["local_credit_entries", "local_customers"] {
        let d = tempfile::tempdir().unwrap();
        let mut s = store(&d.path().join("s.db"));
        let before = rows(&s);
        let action = if table == "local_customers" {
            "UPDATE"
        } else {
            "INSERT"
        };
        s.0.execute_batch(&format!("CREATE TRIGGER fail_subledger BEFORE {action} ON {table} BEGIN SELECT RAISE(IGNORE); END;")).unwrap();
        let r = PostInvoice {
            operation_id: "refused-sale".into(),
            lines: vec![BillLine {
                product_id: "rice".into(),
                expected_revision: 1,
                quantity_milli: 1000,
            }],
            tax_basis_points: 0,
            tender: Tender::Credit,
            customer_id: Some("c1".into()),
        };
        assert!(s.post_invoice(r).is_err());
        assert_eq!(rows(&s), before);
    }
}
#[test]
fn commit_failure_never_returns_a_receipt_or_partial_payment() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = store(&path);
    sale(&mut s, "sale", "c1");
    let before = rows(&s);
    s.0.execute_batch("CREATE TABLE fail_commit(id TEXT REFERENCES local_customer_ops(operation_id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_credit_commit AFTER INSERT ON local_customer_outbox BEGIN INSERT INTO fail_commit VALUES('missing'); END;").unwrap();
    assert!(s
        .post_credit(request(&s, "pay", CreditKind::Repayment, 1000), false)
        .is_err());
    assert_eq!(rows(&s), before);
    drop(s);
    assert_eq!(rows(&Store::open(&path, KEY).unwrap()), before);
}
#[test]
fn simultaneous_collections_cannot_double_collect_a_stale_balance() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = store(&path);
    sale(&mut a, "sale", "c1");
    let mut b = Store::open(&path, KEY).unwrap();
    let one = request(&a, "one", CreditKind::Repayment, 7000);
    let two = request(&a, "two", CreditKind::Repayment, 7000);
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_credit(one, false)
    });
    barrier.wait();
    let second = b.post_credit(two, false);
    let first = worker.join().unwrap();
    assert!(first.is_ok() != second.is_ok());
    assert_eq!(customer(&b.0, "c1").unwrap().balance_paise, "3000");
    assert_eq!(b.cashier_state().unwrap().balances.cash_paise, "7000");
}
#[test]
fn prepared_cash_collection_survives_restart_exact_retry_and_acknowledgement() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    w.save_customer(profile("c1")).unwrap();
    let opening = native_request(&w, "opening", CreditKind::OpeningDue, 10000);
    w.prepare_credit(opening.clone()).unwrap();
    w.post_credit(opening).unwrap();
    w.clear_credit("opening", true).unwrap();
    let r = native_request(&w, "cash", CreditKind::Repayment, 2500);
    w.prepare_credit(r.clone()).unwrap();
    drop(w);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(matches!(w.pending_credit(), Err(StoreError::Locked)));
    w.unlock(PASSWORD).unwrap();
    assert_eq!(w.pending_credit().unwrap().unwrap().request, r);
    let receipt = w.post_credit(r.clone()).unwrap();
    drop(w);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.unlock(PASSWORD).unwrap();
    assert_eq!(
        w.pending_credit().unwrap().unwrap().receipt,
        Some(receipt.clone())
    );
    assert_eq!(w.post_credit(r).unwrap(), receipt);
    w.clear_credit("cash", true).unwrap();
    w.clear_credit("cash", true).unwrap();
    drop(w);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.unlock(PASSWORD).unwrap();
    assert!(w.pending_credit().unwrap().is_none());
    assert_eq!(
        w.customer_statement("c1", 0, None)
            .unwrap()
            .closing_balance_paise,
        "7500"
    );
}
#[test]
fn canceled_credit_ids_fence_delayed_posting() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    w.save_customer(profile("c1")).unwrap();
    let r = native_request(&w, "cancel", CreditKind::OpeningDue, 1000);
    w.prepare_credit(r.clone()).unwrap();
    w.clear_credit("cancel", false).unwrap();
    assert!(matches!(
        w.post_credit(r),
        Err(StoreError::OperationConflict)
    ));
    assert_eq!(
        w.customer_statement("c1", 0, None)
            .unwrap()
            .closing_balance_paise,
        "0"
    );
}
#[test]
fn native_roles_deny_corrections_policy_changes_and_cross_business_access() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    w.save_customer(profile("c1")).unwrap();
    let opening = native_request(&w, "opening", CreditKind::OpeningDue, 10000);
    w.prepare_credit(opening.clone()).unwrap();
    w.post_credit(opening).unwrap();
    w.clear_credit("opening", true).unwrap();
    let wrong = Scope {
        business_id: "other-business".into(),
        workspace_id: w.local_session().unwrap().scope.workspace_id,
    };
    assert!(matches!(
        w.run_scoped(&wrong, |w| w.customer_statement("c1", 0, None)),
        Err(StoreError::WorkspaceMismatch)
    ));
    for (role, name) in [
        (Role::Manager, "manager"),
        (Role::AssistantManager, "assistant"),
        (Role::Cashier, "cashier"),
    ] {
        w.create_staff(
            StaffDetails {
                username: name.into(),
                display_name: name.into(),
                role: role.clone(),
            },
            PASSWORD,
        )
        .unwrap();
    }
    w.login("cashier", PASSWORD).unwrap();
    assert!(matches!(
        w.save_customer(profile("forged")),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.find_customers("", true),
        Err(StoreError::Forbidden)
    ));
    let correction = native_request(&w, "forged", CreditKind::WriteOff, 100);
    assert!(matches!(
        w.prepare_credit(correction.clone()),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.post_credit(correction),
        Err(StoreError::Forbidden)
    ));
    let r = native_request(&w, "cashier-pay", CreditKind::Repayment, 1000);
    w.prepare_credit(r.clone()).unwrap();
    w.post_credit(r).unwrap();
    w.clear_credit("cashier-pay", true).unwrap();
    w.login("assistant", PASSWORD).unwrap();
    assert!(matches!(
        w.save_customer(profile("unlimited")),
        Err(StoreError::Forbidden)
    ));
    let mut p = profile("no-credit");
    p.credit_limit_paise = Some(0);
    w.save_customer(p).unwrap();
    w.login("manager", PASSWORD).unwrap();
    assert!(w.find_customers("", true).is_ok());
    let mut p = profile("c1");
    p.operation_id = "policy".into();
    p.expected_revision = Some(w.find_customers("c1", false).unwrap()[0].revision);
    p.credit_limit_paise = Some(0);
    w.save_customer(p).unwrap();
    assert!(matches!(
        w.prepare_credit(native_request(&w, "bad", CreditKind::WriteOff, 100)),
        Err(StoreError::Forbidden)
    ));
    let other = d.path().join("other.db");
    let mut other = owner(&other);
    other.save_customer(profile("c1")).unwrap();
    assert_eq!(
        other
            .customer_statement("c1", 0, None)
            .unwrap()
            .closing_balance_paise,
        "0"
    );
    assert_eq!(
        w.customer_statement("c1", 0, None)
            .unwrap()
            .closing_balance_paise,
        "9000"
    );
}
#[test]
fn history_pagination_and_print_include_every_entry_at_one_immutable_snapshot() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let tx = s.0.transaction().unwrap();
    for i in 0..205 {
        entry(
            &tx,
            &format!("bulk-{i}"),
            "c1",
            "opening_due",
            1,
            Some("2000-01-01"),
            None,
            None,
            "Fixture",
        )
        .unwrap();
    }
    tx.commit().unwrap();
    let first = s.customer_statement("c1", 0, None).unwrap();
    assert_eq!(first.entries.len(), 100);
    assert!(first.has_more);
    let end = first.through;
    assert_eq!(first.closing_balance_paise, "205");
    s.post_credit(request(&s, "later", CreditKind::Repayment, 1), false)
        .unwrap();
    let second = s
        .customer_statement("c1", first.next_after, Some(end))
        .unwrap();
    assert_eq!(second.opening_balance_paise, "100");
    assert_eq!(second.closing_balance_paise, "205");
    assert_eq!(second.entries.len(), 100);
    let third = s
        .customer_statement("c1", second.next_after, Some(end))
        .unwrap();
    assert_eq!(third.entries.len(), 5);
    assert!(!third.has_more);
    assert_eq!(third.entries.last().unwrap().running_balance_paise, "205");
    let html = s.print_customer_statement("c1", Some(end)).unwrap();
    assert!(html.contains("bulk-204"));
    assert!(!html.contains("later"));
    assert!(html.contains("2.05"));
}
#[test]
fn printable_customer_data_is_escaped_and_has_no_active_content() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let mut p = profile("c1");
    p.operation_id = "edit-name".into();
    p.expected_revision = Some(1);
    p.name = "<script>alert('x')</script> & shop".into();
    s.save_customer(p).unwrap();
    let html = s.print_customer_statement("c1", None).unwrap();
    assert!(!html.contains("<script>"));
    assert!(html.contains("&lt;script&gt;"));
    assert!(html.contains("&amp; shop"));
}
#[test]
fn credit_journals_audits_and_outbox_are_immutable_after_reopen() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = store(&path);
    sale(&mut s, "sale", "c1");
    s.post_credit(request(&s, "pay", CreditKind::Repayment, 500), false)
        .unwrap();
    drop(s);
    let s = Store::open(&path, KEY).unwrap();
    for table in [
        "local_credit_entries",
        "local_customer_ops",
        "local_customer_journal",
        "local_customer_outbox",
    ] {
        for action in [
            format!("DELETE FROM {table}"),
            format!("UPDATE {table} SET operation_id='changed'"),
            format!("INSERT OR REPLACE INTO {table} SELECT * FROM {table}"),
        ] {
            assert!(s.0.execute_batch(&action).is_err(), "{action}");
        }
    }
}
#[test]
fn enormous_balances_cross_ipc_as_exact_decimal_strings() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let tx = s.0.transaction().unwrap();
    for i in 0..1002 {
        let id = format!("bulk-{i}");
        record(&tx, &id, "credit.posted", "{}", &serde_json::json!({})).unwrap();
        entry(
            &tx,
            &id,
            "c1",
            "opening_due",
            MAX_VALUE,
            Some("2000-01-01"),
            None,
            None,
            "Exact fixture",
        )
        .unwrap();
        journal(&tx, &id, "c1", "receivables", MAX_VALUE).unwrap();
        journal(&tx, &id, "c1", "opening_equity", -MAX_VALUE).unwrap();
    }
    tx.commit().unwrap();
    let c = customer(&s.0, "c1").unwrap();
    assert_eq!(c.balance_paise, "9018000000000000");
    assert_eq!(c.overdue_paise, c.balance_paise);
    let receipt = s
        .post_credit(request(&s, "small", CreditKind::Repayment, 1), false)
        .unwrap();
    assert_eq!(receipt.balance_paise, "9017999999999999");
    assert!(serde_json::to_string(&receipt)
        .unwrap()
        .contains("\"balancePaise\":\"9017999999999999\""));
}
#[test]
fn schema_v7_migration_preserves_credit_invoices_ledger_and_owner_identity() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = store(&path);
    let invoice = sale(&mut s, "old-credit", "legacy");
    let identity = identity::scope(&s.0).unwrap();
    crate::lan_authority::remove_fixture_tables(&s.0);
    s.0.execute_batch("DROP TABLE local_inventory_pending; DROP TABLE local_inventory_outbox; DROP TABLE local_inventory_actors; DROP TABLE local_retail_outbox; DROP TABLE local_retail_pending; DROP TABLE local_retail_canceled; DROP TABLE local_retail_events; DROP TABLE local_retail_journal; DROP TABLE local_retail_activity; DROP TABLE local_retail_return_items; DROP TABLE local_retail_return_parts; DROP TABLE local_retail_refunds; DROP TABLE local_retail_returns; DROP TABLE local_retail_payments; DROP TABLE local_retail_float_corrections; DROP TABLE local_retail_floats; DROP TABLE local_retail_closings; DROP TABLE local_retail_ops; DROP TABLE local_customer_journal; DROP TABLE local_customer_outbox; DROP TABLE local_customer_pending; DROP TABLE local_customer_canceled; DROP TABLE local_credit_entries; DROP TABLE local_customer_ops; DROP TABLE local_customers; PRAGMA user_version=7;").unwrap();
    drop(s);
    let s = Store::open(&path, KEY).unwrap();
    assert_eq!(identity::scope(&s.0).unwrap(), identity);
    assert_eq!(s.list_invoices(0).unwrap()[0].invoice, invoice);
    let c = customer(&s.0, "legacy").unwrap();
    assert_eq!(c.balance_paise, "10000");
    assert_eq!(c.credit_limit_paise, None);
    assert_eq!(
        s.customer_statement("legacy", 0, None).unwrap().entries[0]
            .invoice_id
            .as_deref(),
        Some("old-credit")
    );
    assert_eq!(s.billing_outbox(0).unwrap().len(), 1);
}

#[test]
fn privileged_audit_failure_rolls_back_the_whole_collection() {
    for failure in ["ABORT,'audit unavailable'", "IGNORE"] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut w = owner(&path);
        w.save_customer(profile("c1")).unwrap();
        let r = native_request(&w, "opening", CreditKind::OpeningDue, 10000);
        w.prepare_credit(r.clone()).unwrap();
        w.post_credit(r).unwrap();
        w.clear_credit("opening", true).unwrap();
        let r = native_request(&w, "cash", CreditKind::Repayment, 1000);
        w.prepare_credit(r.clone()).unwrap();
        let s = Store::open(&path, KEY).unwrap();
        let before = rows(&s);
        s.0.execute_batch(&format!("CREATE TRIGGER audit_fail BEFORE INSERT ON local_identity_audit BEGIN SELECT RAISE({failure}); END;")).unwrap();
        assert!(w.post_credit(r.clone()).is_err());
        assert_eq!(rows(&s), before);
        s.0.execute_batch("DROP TRIGGER audit_fail").unwrap();
        w.post_credit(r).unwrap();
        assert_eq!(
            w.customer_statement("c1", 0, None)
                .unwrap()
                .closing_balance_paise,
            "9000"
        );
        let audit = w.identity_audit(0).unwrap();
        assert!(audit.iter().any(|e| e.action == "credit.posted"
            && e.target.as_deref() == Some("cash")
            && e.actor_id.is_some()));
    }
}

#[test]
fn cancellation_and_collection_serialize_without_losing_money() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = owner(&path);
    a.save_customer(profile("c1")).unwrap();
    let opening = native_request(&a, "opening", CreditKind::OpeningDue, 10000);
    a.prepare_credit(opening.clone()).unwrap();
    a.post_credit(opening).unwrap();
    a.clear_credit("opening", true).unwrap();
    let r = native_request(&a, "cash", CreditKind::Repayment, 1000);
    a.prepare_credit(r.clone()).unwrap();
    let mut b = Workspace::new(Store::open(&path, KEY).unwrap());
    b.unlock(PASSWORD).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_credit(r)
    });
    barrier.wait();
    let cancel = b.clear_credit("cash", false);
    let post = worker.join().unwrap();
    match (post, cancel) {
        (Ok(_), Err(StoreError::CheckoutActive)) => assert_eq!(
            b.customer_statement("c1", 0, None)
                .unwrap()
                .closing_balance_paise,
            "9000"
        ),
        (Err(StoreError::OperationConflict), Ok(())) => assert_eq!(
            b.customer_statement("c1", 0, None)
                .unwrap()
                .closing_balance_paise,
            "10000"
        ),
        other => panic!("Invalid collection/cancellation outcome: {other:?}"),
    }
}

#[test]
fn prepared_operation_ids_cannot_be_claimed_by_profile_or_other_actor() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    w.save_customer(profile("c1")).unwrap();
    w.create_staff(
        StaffDetails {
            username: "cashier".into(),
            display_name: "Cashier".into(),
            role: Role::Cashier,
        },
        PASSWORD,
    )
    .unwrap();
    let r = native_request(&w, "reserved", CreditKind::OpeningDue, 10000);
    w.prepare_credit(r.clone()).unwrap();
    let mut p = profile("other");
    p.operation_id = "reserved".into();
    assert!(matches!(
        w.save_customer(p),
        Err(StoreError::OperationConflict)
    ));
    let mut other = Workspace::new(Store::open(&path, KEY).unwrap());
    other.login("cashier", PASSWORD).unwrap();
    let mut payment = r.clone();
    payment.kind = CreditKind::Repayment;
    payment.due_on = None;
    assert!(matches!(
        other.prepare_credit(payment),
        Err(StoreError::OperationConflict)
    ));
    w.post_credit(r.clone()).unwrap();
    w.clear_credit("reserved", true).unwrap();
    let next = native_request(&w, "next", CreditKind::Repayment, 100);
    w.prepare_credit(next.clone()).unwrap();
    assert!(matches!(
        w.prepare_credit(r),
        Err(StoreError::CheckoutActive)
    ));
    assert_eq!(w.pending_credit().unwrap().unwrap().request, next);
}

#[test]
fn settled_sales_do_not_hide_later_backdated_opening_dues() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    sale(&mut s, "sale", "c1");
    s.post_credit(request(&s, "paid", CreditKind::Repayment, 10000), false)
        .unwrap();
    let mut opening = request(&s, "opening", CreditKind::OpeningDue, 5000);
    opening.due_on = Some("2020-01-01".into());
    s.post_credit(opening, false).unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().overdue_paise, "5000");
    s.post_credit(request(&s, "part", CreditKind::Repayment, 1234), false)
        .unwrap();
    assert_eq!(customer(&s.0, "c1").unwrap().overdue_paise, "3766");
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]
    #[test]
    fn generated_credit_collections_preserve_debt_cash_and_exact_replay(amount in 100i64..1000000, cut in 1u32..1000) {
        let d=tempfile::tempdir().unwrap();let mut s=store(&d.path().join("s.db"));
        s.0.execute("UPDATE local_products SET unit_price_paise=?1 WHERE id='rice'",[amount]).unwrap();sale(&mut s,"credit-sale","c1");
        let part=(amount*cut as i64/1000).clamp(1,amount-1);let r=request(&s,"partial",CreditKind::Repayment,part);
        let receipt=s.post_credit(r.clone(),false).unwrap();let snapshot=rows(&s);prop_assert_eq!(s.post_credit(r,false).unwrap(),receipt);prop_assert_eq!(&rows(&s),&snapshot);
        prop_assert_eq!(customer(&s.0,"c1").unwrap().balance_paise,(amount-part).to_string());
        let over=request(&s,"overpay",CreditKind::Repayment,amount-part+1);prop_assert!(s.post_credit(over,false).is_err());prop_assert_eq!(&rows(&s),&snapshot);
        let remaining=request(&s,"remaining",CreditKind::Repayment,amount-part);s.post_credit(remaining,false).unwrap();
        prop_assert_eq!(customer(&s.0,"c1").unwrap().balance_paise,"0");prop_assert_eq!(s.cashier_state().unwrap().balances.cash_paise,amount.to_string());
        let sum:i64=s.0.query_row("SELECT COALESCE(SUM(amount_paise),0) FROM local_customer_journal",[],|r|r.get(0)).unwrap();prop_assert_eq!(sum,0);
    }
}
