//! INDEPENDENT investigation of the three findings the remediation left OPEN:
//! P5-ADV-008 (unfenced metadata writable while fenced),
//! P5-ADV-010 (owner_token / generation format unvalidated),
//! and the fail-closed behavior that bounds them.
use super::*;
use crate::recovery::phase5_tests::{install_fence, seeded, LOGIN};
use crate::recovery::{fence_active, reconcile_startup};
use crate::Store;

/// P5-ADV-008: can a raw-SQL writer reset the lockout budget or substitute the
/// recovery identity while a fence is active?
#[test]
fn ivp008_unfenced_metadata_writable_while_fenced() {
    let d = tempfile::tempdir().unwrap();
    let s = seeded(&d.path().join("live"));
    let _o = install_fence(&s.0);
    assert!(fence_active(&s.0).unwrap(), "fence must be active");

    // Positive control: a BUSINESS write must be blocked.
    let business = s.0.execute("UPDATE local_products SET stock_milli = stock_milli + 1", []);
    println!("IVP008 business write while fenced => {business:?}");
    assert!(business.is_err(), "business writes must be fenced");

    // Simulate an attacker who already holds the SQLCipher key: charge a lockout
    // then try to erase it with raw SQL while the fence is live.
    s.0.execute("UPDATE workspace_access SET failed_attempts=5, retry_after=9999999999 WHERE singleton=1", []).unwrap();
    let reset = s.0.execute("UPDATE workspace_access SET failed_attempts=0, retry_after=0 WHERE singleton=1", []);
    println!("IVP008 lockout reset while fenced => {reset:?}");
    let budget: (i64, i64) = s.0.query_row("SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    println!("IVP008 budget after reset attempt = {budget:?}");

    let gen_tamper = s.0.execute("UPDATE local_recovery_identity SET generation='deadbeef' WHERE singleton=1", []);
    println!("IVP008 generation tamper while fenced => {gen_tamper:?}");
    let biz_tamper = s.0.execute("UPDATE local_recovery_identity SET business_id='attacker-business' WHERE singleton=1", []);
    println!("IVP008 business_id substitution while fenced => {biz_tamper:?}");

    println!(
        "IVP008 OBSERVED: lockout_reset={} generation_tamper={} business_substitution={}",
        reset.is_ok(), gen_tamper.is_ok(), biz_tamper.is_ok()
    );
}

/// P5-ADV-008 bounding: does startup fail closed after identity substitution?
#[test]
fn ivp008b_startup_fails_closed_on_identity_substitution() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let s = seeded(&path);
    let _o = install_fence(&s.0);
    s.0.execute("UPDATE local_recovery_identity SET business_id='attacker-business' WHERE singleton=1", []).unwrap();
    drop(s);
    let opened = Store::open(&path, crate::recovery::phase5_tests::KEY);
    match opened {
        Err(e) => {
            println!("IVP008b Store::open after business substitution => Err({e:?}) (fails closed at OPEN)");
            assert!(matches!(e, StoreError::RecoveryCorrupt), "expected RecoveryCorrupt, got {e:?}");
        }
        Ok(mut st) => {
            let r = reconcile_startup(&mut st.0);
            println!("IVP008b reconcile_startup after business substitution => {r:?}");
            assert!(r.is_err(), "startup MUST fail closed on business substitution");
        }
    }
}

/// P5-ADV-010: is a malformed (non-64-hex) generation or owner_token accepted by
/// startup reconciliation?
#[test]
fn ivp010_malformed_generation_and_token_at_startup() {
    for bad in ["short", "zzzz", "'; DROP TABLE x; --", ""] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("live");
        let s = seeded(&path);
        let o = install_fence(&s.0);
        s.0.execute("UPDATE local_recovery_identity SET generation=?1 WHERE singleton=1", [bad]).unwrap();
        drop(s);
        match Store::open(&path, crate::recovery::phase5_tests::KEY) {
            Err(e) => println!("IVP010 generation={bad:?} => Store::open Err({e:?})"),
            Ok(mut st) => {
                let r = reconcile_startup(&mut st.0);
                println!("IVP010 generation={bad:?} => reconcile_startup {r:?}");
            }
        }
        let _ = o;
    }
    // owner_token format
    for bad in ["short", "zzzz", ""] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("live");
        let s = seeded(&path);
        let _o = install_fence(&s.0);
        let fence_upd = s.0.execute("UPDATE local_recovery_fence SET owner_token=?1 WHERE singleton=1", [bad]);
        println!("IVP010 owner_token={bad:?} fence UPDATE => {fence_upd:?}");
        let ops_upd = s.0.execute("UPDATE local_recovery_operations SET owner_token=?1", [bad]);
        println!("IVP010 owner_token={bad:?} operations UPDATE => {ops_upd:?}");
        drop(s);
        match Store::open(&path, crate::recovery::phase5_tests::KEY) {
            Err(e) => println!("IVP010 owner_token={bad:?} => Store::open Err({e:?})"),
            Ok(mut st) => {
                let r = reconcile_startup(&mut st.0);
                println!("IVP010 owner_token={bad:?} => reconcile_startup {r:?}");
            }
        }
    }
}

/// P5-ADV-008 realistic scenario: with the lockout erased by raw SQL, does the
/// recovery password oracle become unlimited again?
#[test]
fn ivp008c_lockout_reset_reopens_password_oracle() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let s = seeded(&path);
    let o = install_fence(&s.0);
    let mut w = crate::access::Workspace::new(s);
    for _ in 0..5 {
        let _ = w.resolve_interrupted_recovery(&o.operation_id, "wrong password attempt");
    }
    let st = w.into_recovery_store();
    let locked: (i64, i64) = st.0.query_row("SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    println!("IVP008c after 5 failures budget={locked:?}");
    assert_eq!(locked.0, 5, "lockout must engage");
    // Attacker with the DB key erases the budget directly.
    st.0.execute("UPDATE workspace_access SET failed_attempts=0, retry_after=0 WHERE singleton=1", []).unwrap();
    let mut w2 = crate::access::Workspace::new(st);
    let mut more = 0;
    for _ in 0..20 {
        match w2.resolve_interrupted_recovery(&o.operation_id, "another wrong guess") {
            Err(StoreError::RateLimited) => {}
            _ => more += 1,
        }
    }
    println!("IVP008c after raw-SQL budget reset: {more} of 20 further guesses were NOT rate-limited");
    println!("IVP008c OBSERVED: raw-SQL key holder can reset the budget and resume guessing (bounded by key possession)");
    let _ = LOGIN;
}
