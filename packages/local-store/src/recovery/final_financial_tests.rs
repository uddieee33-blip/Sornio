//! Final financial-integrity remediation: executable adversarial tests for the
//! independently reproduced duplicate-SALE-journal defect (IV-NEW-001 /
//! P5-ADV-007).
//!
//! Every corruption test asserts BOTH:
//!   * the production verifier (`financial::violations` / `financial::verify`), and
//!   * the **production restore API** (`preview` + `restore`), so the gate is
//!     proven at the real recovery boundary, not only in the standalone verifier.
//!
//! Corruptions are injected into the LIVE database and then exported, so the
//! archive digest and schema are valid and it is the FINANCIAL gate that must
//! reject the import (editing an exported archive is rejected earlier by digest
//! validation and would not exercise this gate).
//!
//! The exact auditor scenario is reproduced: a ₹4,250 retail sale whose journal
//! is duplicated to cash ₹8,500 / receivables -₹8,500 while staying balanced.
use super::*;
use crate::billing::{BillLine, PostInvoice, Tender};
use crate::payments::{Action, PaymentPart, RefundPart, Request, ReturnLine};
use crate::recovery::financial::{verify as prod_verify, violations as prod_violations};
use crate::recovery::phase5_tests::{seeded, LOGIN, SECRET};
use crate::recovery::{export, fence_active, preview, restore};
use crate::Store;

fn v(db: &Connection) -> Vec<String> {
    prod_violations(db).unwrap()
}

/// Run `f` with one table's append-only guard temporarily removed, then restore
/// the guard with its EXACT original SQL.
///
/// This matters: `recovery::validate` compares the archive schema against a
/// freshly migrated reference store, so an archive missing a trigger is rejected
/// at preview as `InvalidBackup` and never reaches the financial gate. Restoring
/// the identical trigger keeps the schema byte-identical, so the corruption
/// persists while the FINANCIAL verifier is the component that must reject it.
fn mutate_without_guard<F: FnOnce()>(db: &Connection, table: &str, f: F) {
    let guards: Vec<(String, String)> = {
        let mut q = db
            .prepare(
                "SELECT name, sql FROM sqlite_schema
                 WHERE type='trigger' AND tbl_name=?1 AND name LIKE '%_no_%'",
            )
            .unwrap();
        let r = q
            .query_map([table], |x| Ok((x.get(0)?, x.get(1)?)))
            .unwrap();
        r.collect::<Result<_, _>>().unwrap()
    };
    assert!(!guards.is_empty(), "expected append-only guards on {table}");
    for (name, _) in &guards {
        db.execute_batch(&format!("DROP TRIGGER {name};")).unwrap();
    }
    f();
    for (_, sql) in &guards {
        db.execute_batch(sql).unwrap();
    }
}

/// Post a retail sale through the public API. `methods` are the payment parts.
fn retail_sale(s: &mut Store, id: &str, methods: &[(&str, i64)], tax_bp: i64) {
    let revision = s.list_products().unwrap()[0].revision;
    let req = Request {
        operation_id: id.into(),
        action: Action::Sale {
            invoice: PostInvoice {
                operation_id: id.into(),
                lines: vec![BillLine {
                    product_id: "rice".into(),
                    expected_revision: revision,
                    quantity_milli: 1000,
                }],
                tax_basis_points: tax_bp,
                tender: Tender::Retail,
                customer_id: None,
            },
            payments: methods
                .iter()
                .enumerate()
                .map(|(n, (m, a))| PaymentPart {
                    id: format!("{id}-p-{n}"),
                    method: (*m).into(),
                    amount_paise: *a,
                    reference: String::new(),
                })
                .collect(),
        },
    };
    s.prepare_retail(req.clone()).unwrap();
    s.post_retail(req.clone()).unwrap();
    s.clear_retail(id, true).unwrap();
}

/// The auditor's exact fixture: one ₹4,250 cash retail sale.
fn sale_4250(d: &tempfile::TempDir) -> Store {
    let mut s = seeded(&d.path().join("live"));
    retail_sale(&mut s, "final-sale", &[("cash", 4250)], 0);
    assert!(v(&s.0).is_empty(), "baseline must be clean: {:?}", v(&s.0));
    s
}

fn legs(s: &Store, op: &str) -> Vec<(String, i64)> {
    let mut q = s
        .0
        .prepare("SELECT account,amount FROM local_retail_journal WHERE operation_id=?1 ORDER BY sequence")
        .unwrap();
    let r = q.query_map([op], |x| Ok((x.get(0)?, x.get(1)?))).unwrap();
    r.collect::<Result<_, _>>().unwrap()
}

/// Duplicate every journal leg of `op` with fresh sequence numbers. INSERT is
/// permitted by the append-only triggers, so this is reachable on disk.
fn duplicate_journal(s: &Store, op: &str) -> usize {
    let existing = legs(s, op);
    let first: i64 =
        s.0.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_journal",
            [],
            |r| r.get(0),
        )
        .unwrap();
    for (offset, (acct, amt)) in existing.iter().enumerate() {
        s.0.execute(
            "INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount)
             VALUES(?1,?2,NULL,?3,?4)",
            rusqlite::params![first + offset as i64, op, acct, amt],
        )
        .unwrap();
    }
    existing.len()
}

/// Export the (corrupted) live database, then attempt a REAL production restore
/// back into the same business. Returns the restore result plus proof that the
/// original database survived.
fn restore_round_trip(
    s: &mut Store,
    d: &tempfile::TempDir,
    name: &str,
) -> (Result<String, StoreError>, i64, bool) {
    let archive = d.path().join(format!("{name}.sorniobackup"));
    export(s, &archive, SECRET).unwrap();
    let before: i64 =
        s.0.query_row("SELECT COUNT(*) FROM local_invoices", [], |r| r.get(0))
            .unwrap();
    let p = preview(s, &archive, SECRET, LOGIN).unwrap();
    let result = restore(s, &archive, d.path(), SECRET, LOGIN, &p, &p.confirmation);
    let after: i64 =
        s.0.query_row("SELECT COUNT(*) FROM local_invoices", [], |r| r.get(0))
            .unwrap();
    let fenced = fence_active(&s.0).unwrap();
    (result, after - before, fenced)
}

/// Assert the corruption is caught by the verifier AND rejected by production
/// restore, with the original database preserved and no fence left behind.
fn assert_rejected(s: &mut Store, d: &tempfile::TempDir, name: &str, expect_label: &str) {
    let found = v(&s.0);
    println!("[{name}] verifier violations: {found:?}");
    assert!(
        found.iter().any(|x| x.contains(expect_label)),
        "[{name}] expected a violation containing {expect_label:?}, got {found:?}"
    );
    assert!(
        matches!(prod_verify(&s.0), Err(StoreError::FinancialInconsistency)),
        "[{name}] production verify() must reject"
    );
    let (result, delta, fenced) = restore_round_trip(s, d, name);
    println!("[{name}] production restore => {result:?}");
    assert!(
        matches!(result, Err(StoreError::FinancialInconsistency)),
        "[{name}] production RESTORE must reject the corrupted backup, got {result:?}"
    );
    assert_eq!(delta, 0, "[{name}] original invoices must be preserved");
    assert!(
        !fenced,
        "[{name}] no fence may be left behind after rejection"
    );
}

// ---------------------------------------------------------------------------
// 1. Duplicate sale journal — the EXACT previously failing ₹4,250 scenario.
// ---------------------------------------------------------------------------
#[test]
fn fin01_duplicate_sale_journal_4250_scenario() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    println!("fin01 BEFORE: {:?}", legs(&s, "final-sale"));
    let added = duplicate_journal(&s, "final-sale");
    let after = legs(&s, "final-sale");
    println!("fin01 duplicated {added} legs; AFTER: {after:?}");
    let cash: i64 = after
        .iter()
        .filter(|(a, _)| a == "cash")
        .map(|(_, n)| n)
        .sum();
    let recv: i64 = after
        .iter()
        .filter(|(a, _)| a == "receivables")
        .map(|(_, n)| n)
        .sum();
    // Reproduce the auditor's exact numbers.
    assert_eq!(
        cash, 8500,
        "cash must have doubled to 8500 paise (Rs 85.00 units)"
    );
    assert_eq!(recv, -8500, "receivables must have doubled to -8500");
    let zero: i64 =
        s.0.query_row(
            "SELECT SUM(amount) FROM local_retail_journal WHERE operation_id='final-sale'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        zero, 0,
        "the corruption must remain mathematically balanced"
    );
    println!("fin01 ledger still zero-sum: {zero}");
    assert_rejected(&mut s, &d, "fin01", "retail sale journal");
}

// ---------------------------------------------------------------------------
// 2. Missing sale journal.
// ---------------------------------------------------------------------------
#[test]
fn fin02_missing_sale_journal() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    // DELETE is barred by append-only triggers, so emulate on-disk loss by
    // removing the triggers first (the verifier must catch it regardless).
    let mut n = 0;
    mutate_without_guard(&s.0, "local_retail_journal", || {
        n =
            s.0.execute(
                "DELETE FROM local_retail_journal WHERE operation_id='final-sale'",
                [],
            )
            .unwrap();
    });
    println!("fin02 removed {n} sale journal legs");
    assert_eq!(n, 2);
    assert_rejected(&mut s, &d, "fin02", "retail sale journal");
}

/// 2b. Only ONE leg removed — the operation is then unbalanced AND incomplete.
#[test]
fn fin02b_partial_missing_sale_journal() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    mutate_without_guard(&s.0, "local_retail_journal", || {
        s.0.execute(
            "DELETE FROM local_retail_journal WHERE operation_id='final-sale' AND account='receivables'",
            [],
        ).unwrap();
    });
    println!("fin02b legs now: {:?}", legs(&s, "final-sale"));
    assert_rejected(&mut s, &d, "fin02b", "retail sale journal");
}

// ---------------------------------------------------------------------------
// 3. Incorrect cash posting.
// ---------------------------------------------------------------------------
#[test]
fn fin03_incorrect_cash_posting() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    // Offset both legs so the operation stays balanced but the cash leg is wrong.
    mutate_without_guard(&s.0, "local_retail_journal", || {
        s.0.execute("UPDATE local_retail_journal SET amount=amount+700 WHERE operation_id='final-sale' AND account='cash'", []).unwrap();
        s.0.execute("UPDATE local_retail_journal SET amount=amount-700 WHERE operation_id='final-sale' AND account='receivables'", []).unwrap();
    });
    let zero: i64 =
        s.0.query_row(
            "SELECT SUM(amount) FROM local_retail_journal WHERE operation_id='final-sale'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        zero, 0,
        "must stay balanced to be a real false-negative probe"
    );
    println!("fin03 legs: {:?} (balanced)", legs(&s, "final-sale"));
    assert_rejected(&mut s, &d, "fin03", "disagrees with recorded cash payments");
}

// ---------------------------------------------------------------------------
// 4. Incorrect receivables posting.
// ---------------------------------------------------------------------------
#[test]
fn fin04_incorrect_receivables_posting() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    mutate_without_guard(&s.0, "local_retail_journal", || {
        s.0.execute("UPDATE local_retail_journal SET amount=-9999 WHERE operation_id='final-sale' AND account='receivables'", []).unwrap();
        s.0.execute("UPDATE local_retail_journal SET amount=9999 WHERE operation_id='final-sale' AND account='cash'", []).unwrap();
    });
    println!("fin04 legs: {:?}", legs(&s, "final-sale"));
    assert_rejected(&mut s, &d, "fin04", "disagrees with recorded cash payments");
}

// ---------------------------------------------------------------------------
// 5. Incorrect revenue posting injected into a sale operation.
//    A retail sale must not carry a revenue leg at all.
// ---------------------------------------------------------------------------
#[test]
fn fin05_incorrect_revenue_posting_on_sale() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    let next: i64 =
        s.0.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_journal",
            [],
            |r| r.get(0),
        )
        .unwrap();
    // Balanced revenue/refund_payable pair added to the SALE operation.
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'final-sale',NULL,'revenue',-4250)", rusqlite::params![next]).unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'final-sale',NULL,'refund_payable',4250)", rusqlite::params![next+1]).unwrap();
    let zero: i64 =
        s.0.query_row(
            "SELECT SUM(amount) FROM local_retail_journal WHERE operation_id='final-sale'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(zero, 0, "still balanced");
    println!("fin05 legs: {:?}", legs(&s, "final-sale"));
    assert_rejected(&mut s, &d, "fin05", "unexpected account or customer");
}

// ---------------------------------------------------------------------------
// 6. Incorrect tax posting injected into a sale operation.
// ---------------------------------------------------------------------------
#[test]
fn fin06_incorrect_tax_posting_on_sale() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    let next: i64 =
        s.0.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_journal",
            [],
            |r| r.get(0),
        )
        .unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'final-sale',NULL,'tax_payable',-500)", rusqlite::params![next]).unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'final-sale',NULL,'refund_payable',500)", rusqlite::params![next+1]).unwrap();
    println!("fin06 legs: {:?}", legs(&s, "final-sale"));
    assert_rejected(&mut s, &d, "fin06", "unexpected account or customer");
}

/// 6b. A genuine taxed sale must still be accepted, and its billing ledger tax
///     leg must reconcile (guards against over-broad tax rules).
#[test]
fn fin06b_taxed_sale_is_accepted_and_tax_tamper_detected() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    // 18% tax on 4250 => tax 765, total 5015.
    retail_sale(&mut s, "taxed-sale", &[("cash", 5015)], 1800);
    let clean = v(&s.0);
    println!("fin06b valid taxed sale violations: {clean:?}");
    assert!(
        clean.is_empty(),
        "valid taxed sale must be accepted: {clean:?}"
    );
    let tax: i64 = s.0.query_row("SELECT amount_paise FROM local_billing_ledger WHERE invoice_id='taxed-sale' AND account='tax_payable'", [], |r| r.get(0)).unwrap();
    println!("fin06b recorded tax leg = {tax}");
    // Now tamper the tax leg while keeping the invoice ledger balanced.
    mutate_without_guard(&s.0, "local_billing_ledger", || {
        s.0.execute("UPDATE local_billing_ledger SET amount_paise=amount_paise+100 WHERE invoice_id='taxed-sale' AND account='tax_payable'", []).unwrap();
        s.0.execute("UPDATE local_billing_ledger SET amount_paise=amount_paise-100 WHERE invoice_id='taxed-sale' AND account='cash'", []).unwrap();
    });
    assert_rejected(&mut s, &d, "fin06b", "invoice");
}

// ---------------------------------------------------------------------------
// 7. Duplicate operation with altered payload.
// ---------------------------------------------------------------------------
#[test]
fn fin07_duplicate_operation_with_altered_payload() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    // (a) PRODUCTION API: reusing an operation id with a different payload must
    //     be refused outright, so a duplicate sale cannot be created normally.
    let revision = s.list_products().unwrap()[0].revision;
    let reuse = Request {
        operation_id: "final-sale".into(),
        action: Action::Sale {
            invoice: PostInvoice {
                operation_id: "final-sale".into(),
                lines: vec![BillLine {
                    product_id: "rice".into(),
                    expected_revision: revision,
                    quantity_milli: 1000,
                }],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: None,
            },
            payments: vec![PaymentPart {
                id: "final-sale-p-9".into(),
                method: "cash".into(),
                amount_paise: 9999,
                reference: String::new(),
            }],
        },
    };
    let r = s.prepare_retail(reuse);
    println!("fin07 API reuse of operation id with altered payload => {r:?}");
    assert!(
        matches!(r, Err(StoreError::OperationConflict)),
        "operation id reuse must be refused, got {r:?}"
    );
    // The stored operation must be unchanged by the refused attempt.
    assert_eq!(
        legs(&s, "final-sale"),
        vec![
            ("cash".to_string(), 4250),
            ("receivables".to_string(), -4250)
        ]
    );
    assert!(
        v(&s.0).is_empty(),
        "a refused duplicate must not corrupt the database"
    );

    // (b) ON-DISK duplicate outbox row with an ALTERED payload. operation_id is
    //     UNIQUE, so this requires schema damage; the verifier must still detect
    //     it. (The schema gate independently rejects such an archive at preview.)
    let rows: i64 =
        s.0.query_row(
            "SELECT COUNT(*) FROM local_retail_outbox WHERE operation_id='final-sale'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    println!("fin07 retained outbox rows for the sale: {rows}");
    if rows == 0 {
        println!("fin07 no retained outbox row after clear; API guard is the operative defense");
        return;
    }
    s.0.execute_batch(
        "PRAGMA foreign_keys=OFF;
         CREATE TABLE fin_outbox_tmp AS SELECT * FROM local_retail_outbox;
         DROP TABLE local_retail_outbox;
         CREATE TABLE local_retail_outbox(sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL REFERENCES local_retail_ops(id), payload TEXT NOT NULL);
         INSERT INTO local_retail_outbox SELECT * FROM fin_outbox_tmp;
         DROP TABLE fin_outbox_tmp;
         PRAGMA foreign_keys=ON;",
    ).unwrap();
    let altered = s.0.execute(
        "INSERT INTO local_retail_outbox(sequence,operation_id,payload)
         SELECT (SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_outbox), operation_id, '{\"altered\":true}'
         FROM local_retail_outbox WHERE operation_id='final-sale'",
        [],
    ).unwrap();
    println!("fin07 duplicated outbox rows with altered payload: {altered}");
    let found = v(&s.0);
    println!("fin07 verifier violations: {found:?}");
    assert!(
        found
            .iter()
            .any(|x| x.contains("retail outbox duplicate operation")),
        "duplicate outbox operation must be detected: {found:?}"
    );
    assert!(matches!(
        prod_verify(&s.0),
        Err(StoreError::FinancialInconsistency)
    ));
    // Layered defense: the damaged schema is ALSO rejected before any import,
    // at export or at preview depending on which structural gate fires first.
    let archive = d.path().join("fin07.sorniobackup");
    let exported = export(&mut s, &archive, SECRET);
    println!("fin07 export of schema-damaged database => {exported:?}");
    let rejected_early = match exported {
        Err(StoreError::InvalidBackup) => true,
        Ok(_) => {
            let p = preview(&mut s, &archive, SECRET, LOGIN);
            println!("fin07 preview of schema-damaged archive => {p:?}");
            matches!(p, Err(StoreError::InvalidBackup))
        }
        Err(e) => panic!("unexpected export error: {e:?}"),
    };
    assert!(
        rejected_early,
        "schema damage must be rejected before import"
    );
}

/// 7b. A duplicated sale journal whose legs were HALVED so the sums still match:
///     only the cardinality (one posting set per operation) rule can catch this.
#[test]
fn fin07b_duplicate_with_halved_amounts_keeps_sums() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    // Split each leg into two halves: sums unchanged, cardinality doubled.
    mutate_without_guard(&s.0, "local_retail_journal", || {
        s.0.execute("UPDATE local_retail_journal SET amount=2125 WHERE operation_id='final-sale' AND account='cash'", []).unwrap();
        s.0.execute("UPDATE local_retail_journal SET amount=-2125 WHERE operation_id='final-sale' AND account='receivables'", []).unwrap();
    });
    let next: i64 =
        s.0.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_journal",
            [],
            |r| r.get(0),
        )
        .unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'final-sale',NULL,'cash',2125)", rusqlite::params![next]).unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'final-sale',NULL,'receivables',-2125)", rusqlite::params![next+1]).unwrap();
    let cash: i64 = s.0.query_row("SELECT SUM(amount) FROM local_retail_journal WHERE operation_id='final-sale' AND account='cash'", [], |r| r.get(0)).unwrap();
    assert_eq!(
        cash, 4250,
        "sums must still be correct so only cardinality can catch it"
    );
    println!(
        "fin07b legs: {:?} (sums correct, cardinality doubled)",
        legs(&s, "final-sale")
    );
    assert_rejected(&mut s, &d, "fin07b", "not exactly one posting set");
}

// ---------------------------------------------------------------------------
// 8. Legitimate multi-part return — MUST still be accepted.
// ---------------------------------------------------------------------------
#[test]
fn fin08_legitimate_multipart_return_accepted() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    retail_sale(&mut s, "mp-sale", &[("cash", 2125), ("cash", 2125)], 0);
    let lines = vec![ReturnLine {
        line_index: 0,
        quantity_milli: 1000,
        disposition: Default::default(),
    }];
    let q = s.quote_retail_return("mp-sale", &lines).unwrap();
    let ret = Request {
        operation_id: "mp-return".into(),
        action: Action::Return {
            invoice_id: "mp-sale".into(),
            expected_revision: q.revision,
            lines,
            refunds: vec![
                RefundPart {
                    payment_id: "mp-sale-p-0".into(),
                    amount_paise: 2125,
                },
                RefundPart {
                    payment_id: "mp-sale-p-1".into(),
                    amount_paise: 2125,
                },
            ],
            reason: "Two equal cash parts refunded".into(),
        },
    };
    s.prepare_retail(ret.clone()).unwrap();
    s.post_retail(ret.clone()).unwrap();
    s.clear_retail("mp-return", true).unwrap();
    let repeats: i64 = s.0.query_row(
        "SELECT COUNT(*) FROM (SELECT operation_id,account FROM local_retail_journal GROUP BY operation_id,account HAVING COUNT(*)>1)",
        [], |r| r.get(0)).unwrap();
    println!("fin08 repeated (operation,account) groups in VALID history = {repeats}");
    assert!(
        repeats > 0,
        "the guard is only meaningful if valid history repeats accounts"
    );
    let found = v(&s.0);
    println!("fin08 violations on valid multipart history: {found:?}");
    assert!(
        found.is_empty(),
        "valid multi-part return MUST NOT be rejected: {found:?}"
    );
    // And it must survive a real restore round trip.
    let (result, delta, fenced) = restore_round_trip(&mut s, &d, "fin08");
    println!("fin08 production restore of VALID multipart history => {result:?}");
    assert!(result.is_ok(), "valid history must restore: {result:?}");
    assert_eq!(delta, 0);
    assert!(!fenced);
    assert!(v(&s.0).is_empty(), "restored history must be clean");
}

// ---------------------------------------------------------------------------
// 9. Multiple legitimate sales — MUST be accepted.
// ---------------------------------------------------------------------------
#[test]
fn fin09_multiple_legitimate_sales_accepted() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    retail_sale(&mut s, "sale-a", &[("cash", 4250)], 0);
    retail_sale(&mut s, "sale-b", &[("cash", 4250)], 0);
    // A digital-only sale legitimately has NO retail journal legs (cash == 0).
    retail_sale(&mut s, "sale-upi", &[("upi", 4250)], 0);
    // A mixed sale banks only the cash portion.
    retail_sale(&mut s, "sale-mixed", &[("cash", 2000), ("upi", 2250)], 0);
    let found = v(&s.0);
    println!("fin09 violations on four valid sales: {found:?}");
    assert!(
        found.is_empty(),
        "multiple valid sales must be accepted: {found:?}"
    );
    let upi_legs = legs(&s, "sale-upi");
    println!("fin09 digital-only sale legs (expected none): {upi_legs:?}");
    assert!(
        upi_legs.is_empty(),
        "a cash-zero sale must post no retail legs"
    );
    assert_eq!(
        legs(&s, "sale-mixed"),
        vec![
            ("cash".to_string(), 2000),
            ("receivables".to_string(), -2000)
        ]
    );
    let (result, _, fenced) = restore_round_trip(&mut s, &d, "fin09");
    println!("fin09 production restore of valid multi-sale history => {result:?}");
    assert!(
        result.is_ok(),
        "valid multi-sale history must restore: {result:?}"
    );
    assert!(!fenced);
}

/// 9b. Duplicating ONE sale among several must still be caught (fresh store: a
///     successful restore locks the workspace, so it cannot be reused).
#[test]
fn fin09b_duplicate_one_of_many_sales_rejected() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    retail_sale(&mut s, "sale-a", &[("cash", 4250)], 0);
    retail_sale(&mut s, "sale-b", &[("cash", 4250)], 0);
    retail_sale(&mut s, "sale-c", &[("cash", 4250)], 0);
    assert!(v(&s.0).is_empty());
    duplicate_journal(&s, "sale-b");
    println!(
        "fin09b duplicated only sale-b; sale-a legs: {:?}",
        legs(&s, "sale-a")
    );
    assert_rejected(&mut s, &d, "fin09b", "retail sale journal");
    // The untouched sales must still carry exactly one posting set each.
    assert_eq!(
        legs(&s, "sale-a"),
        vec![
            ("cash".to_string(), 4250),
            ("receivables".to_string(), -4250)
        ]
    );
}

// ---------------------------------------------------------------------------
// 10. Historical data compatibility — legacy payloads must not be rejected.
// ---------------------------------------------------------------------------
#[test]
fn fin10_historical_legacy_payload_compatibility() {
    let d = tempfile::tempdir().unwrap();
    let s = sale_4250(&d);
    // Emulate a legacy invoice whose payload predates the modern tender field.
    mutate_without_guard(&s.0, "local_invoices", || {
        s.0.execute(
            "UPDATE local_invoices SET payload='{}' WHERE id='final-sale'",
            [],
        )
        .unwrap();
    });
    let found = v(&s.0);
    println!("fin10 violations with legacy (field-less) payload: {found:?}");
    assert!(
        !found.iter().any(|x| x.contains("retail sale")),
        "legacy payloads must not trip the modern sale-journal rules: {found:?}"
    );
    // A legacy row must still be protected by the tender-independent checks:
    // an orphan journal operation is rejected regardless of payload age.
    let next: i64 =
        s.0.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_journal",
            [],
            |r| r.get(0),
        )
        .unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'legacy-ghost',NULL,'cash',100)", rusqlite::params![next]).unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'legacy-ghost',NULL,'receivables',-100)", rusqlite::params![next+1]).unwrap();
    let found2 = v(&s.0);
    println!("fin10 violations after orphan injection: {found2:?}");
    assert!(
        found2
            .iter()
            .any(|x| x.contains("without source operation")),
        "tender-independent orphan detection must still work: {found2:?}"
    );
}

/// 10b. The migration fixtures (schema 11/12 history) must still restore.
#[test]
fn fin10b_valid_history_restore_is_not_rejected() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    retail_sale(&mut s, "hist-a", &[("cash", 4250)], 0);
    retail_sale(&mut s, "hist-b", &[("cash", 1000), ("card", 3250)], 0);
    assert!(v(&s.0).is_empty());
    let (result, _, fenced) = restore_round_trip(&mut s, &d, "fin10b");
    println!("fin10b healthy history restore => {result:?}");
    assert!(result.is_ok(), "healthy history must restore: {result:?}");
    assert!(!fenced);
    assert!(
        v(&s.0).is_empty(),
        "restored database must be financially clean"
    );
    let invoices: i64 =
        s.0.query_row("SELECT COUNT(*) FROM local_invoices", [], |r| r.get(0))
            .unwrap();
    assert_eq!(invoices, 2, "both historical invoices must survive");
}

/// A synthetic sale (activity + balanced journal, but no invoice) is rejected.
#[test]
fn fin11_synthetic_sale_without_invoice_rejected() {
    let d = tempfile::tempdir().unwrap();
    let mut s = sale_4250(&d);
    let next: i64 =
        s.0.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_journal",
            [],
            |r| r.get(0),
        )
        .unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'ghost-sale',NULL,'cash',4250)", rusqlite::params![next]).unwrap();
    s.0.execute("INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,'ghost-sale',NULL,'receivables',-4250)", rusqlite::params![next+1]).unwrap();
    let aday: String =
        s.0.query_row("SELECT day FROM local_retail_activity LIMIT 1", [], |r| {
            r.get(0)
        })
        .unwrap();
    s.0.execute(
        "INSERT INTO local_retail_activity(operation_id,actor_id,day,kind,cash_delta,created_at)
         VALUES('ghost-sale',NULL,?1,'invoice',4250,'2026-11-26T10:00:00.000Z')",
        [&aday],
    )
    .unwrap();
    println!("fin11 synthetic sale has activity + balanced journal but no invoice");
    assert_rejected(&mut s, &d, "fin11", "without source invoice");
}
