//! INDEPENDENT VERIFICATION (not author code).
//! Self-contained: builds its own fixture and drives the PRODUCTION public API
//! `Workspace::resolve_interrupted_recovery` (the exact function the Tauri
//! command `resolve_interrupted_recovery` calls), NOT the clock-injected helper.
//! Portable across candidate 7f73ef0 and remediation d79a6e8 so the same test
//! proves the attack on the candidate and the fix on the remediation.
use crate::access::Workspace;
use crate::{Store, StoreError};
use rusqlite::{params, Connection};
use std::path::Path;

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const LOGIN: &str = "Independent verifier password 1!";
const WRONG: &str = "Definitely the wrong password 9!";

fn budget(db: &Connection) -> (i64, i64) {
    db.query_row(
        "SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap()
}

fn hex32() -> String {
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).unwrap();
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Build a real workspace with an Owner, then install a live recovery fence
/// exactly as an interrupted restore leaves it.
fn fixture(path: &Path) -> (Store, String) {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.setup(LOGIN).unwrap();
    w.save(0, crate::Draft {
        business_name: "Independent shop".into(),
        business_type: "kirana".into(),
        note: "independent".into(),
    }).unwrap();
    w.add_product(crate::catalog::AddProduct {
        operation_id: "iv-prod".into(), name: "Rice".into(), sku: "IVRICE".into(),
        unit: "kg".into(), unit_price_paise: 4250, opening_stock_milli: 100000,
    }).unwrap();
    let s = w.into_recovery_store();
    let business: String = s
        .0
        .query_row(
            "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let generation: String = s
        .0
        .query_row(
            "SELECT generation FROM local_recovery_identity WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let fingerprint: String = super::fingerprint(&s.0).unwrap();
    let op = hex32();
    let token = hex32();
    let at: i64 = super::now().unwrap() - 60_000;
    s.0.execute(
        "INSERT INTO local_recovery_operations(operation_id,kind,state,business_id,generation,owner_token,backup_id,expected_fingerprint,actor_id,result_generation,detail,created_at,updated_at)
         VALUES(?1,'restore','admitted',?2,?3,?4,'backup-indep',?5,NULL,NULL,NULL,?6,?6)",
        params![op, business, generation, token, fingerprint, at],
    ).unwrap();
    s.0.execute(
        "INSERT INTO local_recovery_fence(singleton,operation_id,business_id,owner_token,activated_at) VALUES(1,?1,?2,?3,?4)",
        params![op, business, token, at],
    ).unwrap();
    (s, op)
}

fn fenced(db: &Connection) -> bool {
    db.query_row("SELECT EXISTS(SELECT 1 FROM local_recovery_fence)", [], |r| r.get(0))
        .unwrap()
}

/// IV-001: The original P5-ADV-001 attack. 40 wrong-password attempts through the
/// PRODUCTION API. A protected implementation must engage the shared durable
/// lockout after 5 failures and must never grant access.
#[test]
fn iv001_production_api_brute_force_is_rate_limited() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let (mut s, op) = fixture(&path);
    let mut w = Workspace::new(s);
    let mut rate_limited = 0;
    let mut granted = 0;
    for _ in 0..40 {
        match w.resolve_interrupted_recovery(&op, WRONG) {
            Ok(()) => granted += 1,
            Err(StoreError::RateLimited) => rate_limited += 1,
            Err(StoreError::InvalidPassword) => {}
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }
    s = w.into_recovery_store();
    let (attempts, retry) = budget(&s.0);
    println!("IV001 granted={granted} rate_limited={rate_limited} attempts={attempts} retry={retry}");
    assert_eq!(granted, 0, "wrong password must never resolve recovery");
    assert!(fenced(&s.0), "fence must remain after failed attempts");
    assert!(
        rate_limited > 0,
        "ATTACK SUCCEEDS: 40 wrong-password attempts were never rate-limited (no durable lockout)"
    );
    assert_eq!(attempts, 5, "shared budget must cap at 5, got {attempts}");
    assert!(retry > 0, "lockout deadline must be set");
}

/// IV-002: Correct password must be refused during an active lockout, and the
/// fence must survive. Drives the production API only.
#[test]
fn iv002_correct_password_refused_during_lockout() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let (s, op) = fixture(&path);
    let mut w = Workspace::new(s);
    for _ in 0..5 {
        let _ = w.resolve_interrupted_recovery(&op, WRONG);
    }
    let r = w.resolve_interrupted_recovery(&op, LOGIN);
    println!("IV002 correct-password-during-lockout => {r:?}");
    assert!(
        matches!(r, Err(StoreError::RateLimited)),
        "correct password must be RateLimited during active lockout, got {r:?}"
    );
    let s = w.into_recovery_store();
    assert!(fenced(&s.0), "fence must survive a refused correct password");
}

/// IV-003: Restart (close + reopen the database file) must not reset the lockout.
#[test]
fn iv003_lockout_survives_restart() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let (s, op) = fixture(&path);
    let mut w = Workspace::new(s);
    for _ in 0..5 {
        let _ = w.resolve_interrupted_recovery(&op, WRONG);
    }
    let before = budget(&w.into_recovery_store().0);
    // Real restart: drop the connection, reopen the file.
    let reopened = Store::open(&path, KEY).unwrap();
    let after = budget(&reopened.0);
    println!("IV003 before={before:?} after_restart={after:?}");
    assert_eq!(before, after, "lockout must persist across restart");
    assert_eq!(after.0, 5);
    let mut w2 = Workspace::new(reopened);
    let r = w2.resolve_interrupted_recovery(&op, LOGIN);
    assert!(
        matches!(r, Err(StoreError::RateLimited)),
        "restart must not clear lockout, got {r:?}"
    );
}

/// IV-004: The budget is SHARED with normal login. Failures on the recovery path
/// must consume the same allowance that login uses (no second weaker policy).
#[test]
fn iv004_budget_shared_with_normal_login() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let (s, op) = fixture(&path);
    let mut w = Workspace::new(s);
    // 3 recovery failures (below the 5 cap).
    for _ in 0..3 {
        let _ = w.resolve_interrupted_recovery(&op, WRONG);
    }
    let mid = budget(&w.into_recovery_store().0);
    println!("IV004 after 3 recovery failures budget={mid:?}");
    assert_eq!(
        mid.0, 3,
        "recovery failures must charge the shared workspace_access budget"
    );
    // Resolve legitimately to release the fence so normal login can run.
    let reopened = Store::open(&path, KEY).unwrap();
    let mut w2 = Workspace::new(reopened);
    // Owner principal retry is untouched; global budget is 3 with retry 0, so a
    // correct resolution is allowed and clears the budget.
    w2.resolve_interrupted_recovery(&op, LOGIN).unwrap();
    let cleared = budget(&w2.into_recovery_store().0);
    assert_eq!(cleared, (0, 0), "successful auth clears the shared budget");
    // Now 5 normal-login failures must lock the workspace...
    let reopened = Store::open(&path, KEY).unwrap();
    let mut w3 = Workspace::new(reopened);
    for _ in 0..5 {
        let _ = w3.login("owner", WRONG);
    }
    let locked = budget(&w3.into_recovery_store().0);
    println!("IV004 after 5 login failures budget={locked:?}");
    assert_eq!(locked.0, 5);
    assert!(locked.1 > 0);
    // ...and a correct LOGIN must now be refused (proves one shared policy).
    let reopened = Store::open(&path, KEY).unwrap();
    let mut w4 = Workspace::new(reopened);
    let r = w4.login("owner", LOGIN);
    println!("IV004 login-after-lockout => {r:?}");
    assert!(
        matches!(r, Err(StoreError::RateLimited)),
        "shared lockout must also gate normal login, got {r:?}"
    );
}

/// IV-005: Concurrent production-API attempts cannot bypass the budget.
#[test]
fn iv005_concurrent_attempts_cannot_bypass_budget() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let (s, op) = fixture(&path);
    drop(s);
    let mut handles = Vec::new();
    for _ in 0..8 {
        let p = path.clone();
        let o = op.clone();
        handles.push(std::thread::spawn(move || {
            let st = Store::open(&p, KEY).unwrap();
            let mut w = Workspace::new(st);
            let mut limited = 0;
            for _ in 0..4 {
                if matches!(
                    w.resolve_interrupted_recovery(&o, WRONG),
                    Err(StoreError::RateLimited)
                ) {
                    limited += 1;
                }
            }
            limited
        }));
    }
    let total_limited: usize = handles.into_iter().map(|h| h.join().unwrap()).sum();
    let reopened = Store::open(&path, KEY).unwrap();
    let (attempts, retry) = budget(&reopened.0);
    println!("IV005 32 concurrent attempts: rate_limited={total_limited} attempts={attempts} retry={retry}");
    assert!(
        total_limited > 0,
        "ATTACK SUCCEEDS: 32 concurrent wrong passwords were never rate-limited"
    );
    assert_eq!(attempts, 5, "budget must never exceed 5, got {attempts}");
    assert!(retry > 0);
    assert!(fenced(&reopened.0), "fence must survive concurrent failures");
}

/// IV-006: A successful recovery authentication must not expose ordinary
/// business functionality while the workspace is locked.
#[test]
fn iv006_no_business_access_while_locked() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let (s, op) = fixture(&path);
    let mut w = Workspace::new(s);
    for _ in 0..5 {
        let _ = w.resolve_interrupted_recovery(&op, WRONG);
    }
    // Correct password during lockout: must fail, so no session is established.
    let r = w.resolve_interrupted_recovery(&op, LOGIN);
    assert!(matches!(r, Err(StoreError::RateLimited)), "got {r:?}");
    // Business functionality must remain unavailable: the fence is still live.
    let s = w.into_recovery_store();
    assert!(fenced(&s.0), "fence must still be active");
    // Valid column set: the rejection must come from the FENCE, not a schema error.
    let blocked = s.0.execute(
        "UPDATE local_products SET stock_milli = stock_milli + 1",
        [],
    );
    println!("IV006 business write while locked => {blocked:?}");
    let rows: i64 = s.0.query_row("SELECT COUNT(*) FROM local_products", [], |r| r.get(0)).unwrap();
    println!("IV006 products present = {rows}");
    assert!(rows > 0, "fixture must contain business rows for the fence test to be meaningful");
    let msg = format!("{blocked:?}");
    println!("IV006 fence rejection message: {msg}");
    assert!(blocked.is_err(), "business writes must be blocked while fenced");
    assert!(
        msg.to_lowercase().contains("fence") || msg.to_lowercase().contains("recovery"),
        "rejection must be the recovery FENCE, not a schema error: {msg}"
    );
    // And a normal login must also be refused (shared lockout).
    let mut w2 = Workspace::new(s);
    let login = w2.login("owner", LOGIN);
    println!("IV006 login while locked => {login:?}");
    assert!(
        login.is_err(),
        "no business session may be established while locked"
    );
}
