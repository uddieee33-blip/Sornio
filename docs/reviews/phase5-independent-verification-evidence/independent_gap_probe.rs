//! INDEPENDENT probe of a suspected RESIDUAL gap in the production financial
//! verifier: a duplicated balanced retail SALE journal (as opposed to the
//! RETURN journal the author's regression test covers).
//!
//! P5-ADV-007 was reported as "duplicated balanced retail journal". The author's
//! test duplicates `retail-return`. This probe duplicates a SALE operation and
//! checks whether the production verifier AND the production restore boundary
//! reject it.
use super::*;
use crate::recovery::financial::{verify as prod_verify, violations as prod_violations};
use crate::recovery::phase5_tests::{seeded, LOGIN, SECRET};
use crate::recovery::{export, fence_active, preview, restore};
use crate::billing::{BillLine, PostInvoice, Tender};
use crate::payments::{Action, PaymentPart, Request};

fn retail_sale_store(d: &tempfile::TempDir, id: &str) -> Store {
    let mut s = seeded(&d.path().join("live"));
    let revision = s.list_products().unwrap()[0].revision;
    let req = Request {
        operation_id: id.into(),
        action: Action::Sale {
            invoice: PostInvoice {
                operation_id: id.into(),
                lines: vec![BillLine { product_id: "rice".into(), expected_revision: revision, quantity_milli: 1000 }],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: None,
            },
            payments: vec![PaymentPart { id: format!("{id}-p-0"), method: "cash".into(), amount_paise: 4250, reference: String::new() }],
        },
    };
    s.prepare_retail(req.clone()).unwrap();
    s.post_retail(req.clone()).unwrap();
    s.clear_retail(id, true).unwrap();
    s
}

/// Duplicate every journal leg of a SALE operation with fresh sequence numbers,
/// preserving zero-sum. INSERT is allowed by the append-only triggers.
fn duplicate_sale_journal(s: &Store, op: &str) -> usize {
    let legs: Vec<(Option<String>, String, i64)> = {
        let mut q = s.0.prepare("SELECT customer_id,account,amount FROM local_retail_journal WHERE operation_id=?1 ORDER BY sequence").unwrap();
        let r = q.query_map([op], |x| Ok((x.get(0)?, x.get(1)?, x.get(2)?))).unwrap();
        r.collect::<Result<_, _>>().unwrap()
    };
    let mut next: i64 = s.0.query_row("SELECT COALESCE(MAX(sequence),0)+1 FROM local_retail_journal", [], |r| r.get(0)).unwrap();
    for (cust, acct, amt) in &legs {
        s.0.execute(
            "INSERT INTO local_retail_journal(sequence,operation_id,customer_id,account,amount) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![next, op, cust, acct, amt],
        ).unwrap();
        next += 1;
    }
    legs.len()
}

#[test]
fn ivx01_duplicated_sale_journal_verifier_and_restore() {
    let d = tempfile::tempdir().unwrap();
    let mut s = retail_sale_store(&d, "ivx-sale");
    assert!(prod_violations(&s.0).unwrap().is_empty(), "baseline must be clean");

    let before: Vec<(String, i64)> = {
        let mut q = s.0.prepare("SELECT account, SUM(amount) FROM local_retail_journal GROUP BY account ORDER BY account").unwrap();
        let r = q.query_map([], |x| Ok((x.get(0)?, x.get(1)?))).unwrap();
        r.collect::<Result<_, _>>().unwrap()
    };
    let added = duplicate_sale_journal(&s, "ivx-sale");
    let after: Vec<(String, i64)> = {
        let mut q = s.0.prepare("SELECT account, SUM(amount) FROM local_retail_journal GROUP BY account ORDER BY account").unwrap();
        let r = q.query_map([], |x| Ok((x.get(0)?, x.get(1)?))).unwrap();
        r.collect::<Result<_, _>>().unwrap()
    };
    println!("IVX01 duplicated {added} sale journal legs");
    println!("IVX01 account totals BEFORE: {before:?}");
    println!("IVX01 account totals AFTER : {after:?}");
    let zero: i64 = s.0.query_row("SELECT SUM(amount) FROM local_retail_journal WHERE operation_id='ivx-sale'", [], |r| r.get(0)).unwrap();
    println!("IVX01 operation still zero-sum: {zero}");
    let activity: i64 = s.0.query_row("SELECT COUNT(*) FROM local_retail_activity WHERE operation_id='ivx-sale'", [], |r| r.get(0)).unwrap();
    println!("IVX01 backing activity rows: {activity}");

    let v = prod_violations(&s.0).unwrap();
    println!("IVX01 PRODUCTION VERIFIER violations: {v:?}");
    let verify_result = prod_verify(&s.0);
    println!("IVX01 PRODUCTION verify() => {verify_result:?}");

    // End-to-end: export the corrupted state and attempt a real restore.
    let backup = d.path().join("dup-sale.sorniobackup");
    let prev = export(&mut s, &backup, SECRET).unwrap();
    let p = preview(&mut s, &backup, SECRET, LOGIN).unwrap();
    let r = restore(&mut s, &backup, d.path(), SECRET, LOGIN, &p, &p.confirmation);
    println!("IVX01 PRODUCTION RESTORE of duplicated-sale-journal backup => {r:?}");
    println!("IVX01 backup id {}", prev.backup_id);
    let fenced = fence_active(&s.0).unwrap();
    println!("IVX01 fence after restore attempt: {fenced}");

    // Report the finding rather than asserting a pass, so the evidence is explicit.
    if v.is_empty() && r.is_ok() {
        println!("IVX01 RESULT: RESIDUAL GAP CONFIRMED — duplicated balanced retail SALE journal is ACCEPTED by both the verifier and the production restore boundary.");
    } else {
        println!("IVX01 RESULT: duplication was REJECTED (no gap).");
    }
    // The probe must not fail the suite; it records the observed behavior.
    assert!(activity >= 1, "fixture sanity");
}
