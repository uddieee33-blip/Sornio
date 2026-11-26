//! Executable corruption tests for the PRODUCTION financial verifier
//! (Phase 5 remediation, P5-ADV-003..007).
//!
//! Every test uses a disposable encrypted database. Corruption is injected the
//! way on-disk damage would appear, and each test asserts the production
//! verifier detects it. Two tests are explicit false-positive guards: valid
//! history (including a multi-part return that legitimately repeats journal
//! accounts) must be accepted.
use super::*;
use crate::recovery::phase5_tests::{sale, seeded, strip_triggers, LOGIN, SECRET};
use crate::recovery::{export, fence_active, preview, restore};
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    customers::{CreditKind, CreditRequest, SaveCustomer},
    payments::{Action, PaymentPart, RefundPart, Request, ReturnLine},
    Store,
};

fn clean(db: &Connection) -> Vec<String> {
    violations(db).unwrap()
}

/// A credit sale plus a repayment: the baseline for the credit checks.
fn credit_store(d: &tempfile::TempDir) -> Store {
    let mut w = Workspace::new(seeded(&d.path().join("live")));
    w.unlock(LOGIN).unwrap();
    w.save_customer(SaveCustomer {
        operation_id: "new-customer".into(),
        id: "customer".into(),
        name: "Synthetic customer".into(),
        phone: None,
        credit_limit_paise: Some(100000),
        credit_days: 0,
        expected_revision: None,
    })
    .unwrap();
    let mut credit = sale("credit-sale", 1);
    credit.tax_basis_points = 0;
    credit.tender = Tender::Credit;
    credit.customer_id = Some("customer".into());
    w.prepare_checkout(credit.clone()).unwrap();
    w.post_invoice(credit.clone()).unwrap();
    w.clear_checkout("credit-sale", true).unwrap();
    let customer = w
        .find_customers("Synthetic customer", false)
        .unwrap()
        .remove(0);
    let collect = CreditRequest {
        operation_id: "cash-collection".into(),
        customer_id: "customer".into(),
        expected_revision: customer.revision,
        kind: CreditKind::Repayment,
        amount_paise: 1000,
        reason: String::new(),
        due_on: None,
        reverse_of: None,
    };
    w.prepare_credit(collect.clone()).unwrap();
    w.post_credit(collect.clone()).unwrap();
    w.clear_credit("cash-collection", true).unwrap();
    w.into_recovery_store()
}

/// A retail sale paid with two equal cash parts, returned in full against both
/// parts. `return_invoice` writes the journal once per refund part, so this
/// legitimately produces repeated (and byte-identical) journal rows.
fn multipart_return_store(d: &tempfile::TempDir) -> Store {
    let mut s = seeded(&d.path().join("live"));
    let revision = s.list_products().unwrap()[0].revision;
    let id = "retail-sale";
    let sale_req = Request {
        operation_id: id.into(),
        action: Action::Sale {
            invoice: PostInvoice {
                operation_id: id.into(),
                lines: vec![BillLine {
                    product_id: "rice".into(),
                    expected_revision: revision,
                    quantity_milli: 1000,
                }],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: None,
            },
            payments: vec![
                PaymentPart {
                    id: format!("{id}-p-0"),
                    method: "cash".into(),
                    amount_paise: 2125,
                    reference: String::new(),
                },
                PaymentPart {
                    id: format!("{id}-p-1"),
                    method: "cash".into(),
                    amount_paise: 2125,
                    reference: String::new(),
                },
            ],
        },
    };
    s.prepare_retail(sale_req.clone()).unwrap();
    s.post_retail(sale_req.clone()).unwrap();
    s.clear_retail(id, true).unwrap();

    let lines = vec![ReturnLine {
        line_index: 0,
        quantity_milli: 1000,
        disposition: Default::default(),
    }];
    let q = s.quote_retail_return(id, &lines).unwrap();
    let ret = Request {
        operation_id: "retail-return".into(),
        action: Action::Return {
            invoice_id: id.into(),
            expected_revision: q.revision,
            lines,
            refunds: vec![
                RefundPart {
                    payment_id: format!("{id}-p-0"),
                    amount_paise: 2125,
                },
                RefundPart {
                    payment_id: format!("{id}-p-1"),
                    amount_paise: 2125,
                },
            ],
            reason: "Two equal cash parts refunded".into(),
        },
    };
    s.prepare_retail(ret.clone()).unwrap();
    s.post_retail(ret.clone()).unwrap();
    s.clear_retail("retail-return", true).unwrap();
    s
}

/// FALSE-POSITIVE GUARD: a healthy workspace with cash sales, a credit sale, a
/// repayment and a multi-part retail return must be accepted.
#[test]
fn rem_r3_accepts_valid_history_including_multipart_returns() {
    let d = tempfile::tempdir().unwrap();
    let s = multipart_return_store(&d);
    // Prove the scenario really does contain repeated journal accounts, so the
    // guard is meaningful (a blanket uniqueness rule would reject this).
    let repeats: i64 =
        s.0.query_row(
            "SELECT COUNT(*) FROM (SELECT operation_id,account FROM local_retail_journal
         GROUP BY operation_id,account HAVING COUNT(*)>1)",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(repeats > 0, "expected legitimate repeated journal accounts");
    assert!(clean(&s.0).is_empty(), "{:?}", clean(&s.0));

    let d2 = tempfile::tempdir().unwrap();
    let c = credit_store(&d2);
    assert!(clean(&c.0).is_empty(), "{:?}", clean(&c.0));
}

/// P5-ADV-004: deleting a credit sale's entry understates outstanding.
#[test]
fn rem_r3_detects_deleted_credit_sale_entry() {
    let d = tempfile::tempdir().unwrap();
    let s = credit_store(&d);
    assert!(clean(&s.0).is_empty());
    strip_triggers(&s.0);
    assert_eq!(
        s.0.execute(
            "DELETE FROM local_credit_entries WHERE invoice_id='credit-sale' AND kind='sale'",
            []
        )
        .unwrap(),
        1
    );
    let v = clean(&s.0);
    assert!(
        v.iter()
            .any(|x| x.starts_with("credit sale missing matching credit entry")),
        "{v:?}"
    );
    assert!(matches!(
        verify(&s.0),
        Err(StoreError::FinancialInconsistency)
    ));
}

/// P5-ADV-005: tampering a repayment entry breaks its journal relationship.
#[test]
fn rem_r3_detects_tampered_repayment_entry() {
    let d = tempfile::tempdir().unwrap();
    let s = credit_store(&d);
    assert!(clean(&s.0).is_empty());
    strip_triggers(&s.0);
    s.0.execute(
        "UPDATE local_credit_entries SET amount_paise=amount_paise+5000 WHERE operation_id='cash-collection'",
        []).unwrap();
    let v = clean(&s.0);
    assert!(
        v.iter()
            .any(|x| x.starts_with("credit entry disagrees with customer journal")),
        "{v:?}"
    );
    assert!(matches!(
        verify(&s.0),
        Err(StoreError::FinancialInconsistency)
    ));
}

/// P5-ADV-006: a balanced ledger edit keeps SUM=0 but breaks the invoice link.
#[test]
fn rem_r3_detects_balanced_but_semantically_wrong_ledger() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    assert!(clean(&s.0).is_empty());
    strip_triggers(&s.0);
    s.0.execute("UPDATE local_billing_ledger SET amount_paise=amount_paise-100 WHERE invoice_id='sale-1' AND account='revenue'", []).unwrap();
    s.0.execute("UPDATE local_billing_ledger SET amount_paise=amount_paise+100 WHERE invoice_id='sale-1' AND account='cash'", []).unwrap();
    // Still zero-sum: the old balance-only check would pass.
    let imbalance: i64 = s.0.query_row(
        "SELECT COUNT(*) FROM (SELECT invoice_id FROM local_billing_ledger GROUP BY invoice_id HAVING SUM(amount_paise)<>0)",
        [], |r| r.get(0)).unwrap();
    assert_eq!(
        imbalance, 0,
        "the tamper is deliberately balance-preserving"
    );
    let v = clean(&s.0);
    assert!(
        v.iter()
            .any(|x| x.starts_with("invoice revenue disagrees with invoice subtotal")),
        "{v:?}"
    );
    assert!(
        v.iter()
            .any(|x| x.starts_with("invoice settlement leg disagrees with invoice")),
        "{v:?}"
    );
    assert!(matches!(
        verify(&s.0),
        Err(StoreError::FinancialInconsistency)
    ));
}

/// P5-ADV-007: duplicating a real return's balanced postings is detected by
/// reconciling against the recorded return totals (not by a uniqueness rule).
#[test]
fn rem_r3_detects_duplicated_return_journal() {
    let d = tempfile::tempdir().unwrap();
    let s = multipart_return_store(&d);
    assert!(clean(&s.0).is_empty());
    // INSERT is permitted by the append-only triggers, so this is reachable
    // without altering the schema.
    s.0.execute(
        "INSERT INTO local_retail_journal(operation_id,customer_id,account,amount)
         SELECT operation_id,customer_id,account,amount FROM local_retail_journal
         WHERE operation_id='retail-return'",
        [],
    )
    .unwrap();
    let v = clean(&s.0);
    assert!(
        v.iter()
            .any(|x| x.starts_with("retail return journal disagrees with return totals")),
        "{v:?}"
    );
    assert!(matches!(
        verify(&s.0),
        Err(StoreError::FinancialInconsistency)
    ));
}

/// P5-ADV-007: an orphan journal operation with no source activity is rejected.
#[test]
fn rem_r3_detects_orphan_retail_journal_operation() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    assert!(clean(&s.0).is_empty());
    s.0.execute_batch(
        "INSERT INTO local_retail_journal(operation_id,customer_id,account,amount) VALUES('ghost-op',NULL,'revenue',-5000);
         INSERT INTO local_retail_journal(operation_id,customer_id,account,amount) VALUES('ghost-op',NULL,'cash',5000);").unwrap();
    let v = clean(&s.0);
    assert!(
        v.iter()
            .any(|x| x.starts_with("retail journal without source operation")),
        "{v:?}"
    );
}

/// Missing postings and broken inventory arithmetic are still detected.
#[test]
fn rem_r3_detects_missing_postings_and_broken_stock_arithmetic() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    strip_triggers(&s.0);
    s.0.execute(
        "DELETE FROM local_invoice_stock WHERE invoice_id='sale-1'",
        [],
    )
    .unwrap();
    let v = clean(&s.0);
    assert!(
        v.iter()
            .any(|x| x.starts_with("invoice line missing matching stock movement")),
        "{v:?}"
    );
    s.0.execute("UPDATE local_billing_ledger SET amount_paise=amount_paise+1 WHERE invoice_id='sale-1' AND account='cash'", []).unwrap();
    let v = clean(&s.0);
    assert!(
        v.iter().any(|x| x.starts_with("billing ledger imbalance")),
        "{v:?}"
    );
}

/// END-TO-END: the production restore boundary must REJECT a financially
/// inconsistent backup, leaving the original data and the fence intact.
/// The corruption is injected with INSERT only, so the backup schema still
/// matches the reference and structural validation passes — proving the
/// financial gate (not a schema check) is what rejects it.
#[test]
fn rem_r3_restore_rejects_financially_inconsistent_backup() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("first-sale", 1)).unwrap();

    // The archive is digest-protected, so post-export file tampering is caught
    // earlier (see rem_r3_tampered_backup_file_is_rejected_at_preview). The
    // realistic threat is a snapshot taken FROM an already-damaged database:
    // the digest and schema both match, so only financial verification can
    // catch it. INSERT is allowed by the append-only triggers, so this damage
    // is reachable without altering the schema.
    s.0.execute_batch(
        "INSERT INTO local_retail_journal(operation_id,customer_id,account,amount) VALUES('ghost-op',NULL,'revenue',-5000);
         INSERT INTO local_retail_journal(operation_id,customer_id,account,amount) VALUES('ghost-op',NULL,'cash',5000);").unwrap();
    let archive = d.path().join("damaged-backup");
    export(&mut s, &archive, SECRET).unwrap();
    // Data written after the snapshot must survive the rejected restore.
    s.post_invoice(sale("later-sale", 2)).unwrap();

    let p = preview(&mut s, &archive, SECRET, LOGIN).unwrap();
    let result = restore(
        &mut s,
        &archive,
        d.path(),
        SECRET,
        LOGIN,
        &p,
        &p.confirmation,
    );
    assert!(
        matches!(result, Err(StoreError::FinancialInconsistency)),
        "restore must reject the inconsistent backup: {result:?}"
    );
    // The original database is untouched by the rejected import.
    assert_eq!(s.list_invoices(0).unwrap().len(), 2);
    let orphans: i64 =
        s.0.query_row(
            "SELECT COUNT(*) FROM local_retail_journal WHERE operation_id='ghost-op'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        orphans, 2,
        "the rejected restore must not alter the live database"
    );
    assert!(!fence_active(&s.0).unwrap(), "no fence may be left behind");
}

/// Documents the pre-existing protection: editing the exported archive bytes is
/// detected by the manifest digest before any import is attempted.
#[test]
fn rem_r3_tampered_backup_file_is_rejected_at_preview() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("first-sale", 1)).unwrap();
    let archive = d.path().join("backup");
    export(&mut s, &archive, SECRET).unwrap();
    {
        let backup = Connection::open(&archive).unwrap();
        backup.pragma_update(None, "key", SECRET).unwrap();
        backup.execute_batch(
            "INSERT INTO local_retail_journal(operation_id,customer_id,account,amount) VALUES('ghost-op',NULL,'revenue',-5000);
             INSERT INTO local_retail_journal(operation_id,customer_id,account,amount) VALUES('ghost-op',NULL,'cash',5000);").unwrap();
    }
    assert!(matches!(
        preview(&mut s, &archive, SECRET, LOGIN),
        Err(StoreError::InvalidBackup)
    ));
}

/// A valid backup must still restore successfully with the financial gate in place.
#[test]
fn rem_r3_valid_backup_still_restores() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("first-sale", 1)).unwrap();
    let archive = d.path().join("backup");
    export(&mut s, &archive, SECRET).unwrap();
    s.post_invoice(sale("later-sale", 2)).unwrap();
    let p = preview(&mut s, &archive, SECRET, LOGIN).unwrap();
    restore(
        &mut s,
        &archive,
        d.path(),
        SECRET,
        LOGIN,
        &p,
        &p.confirmation,
    )
    .unwrap();
    assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    assert!(clean(&s.0).is_empty(), "{:?}", clean(&s.0));
}
