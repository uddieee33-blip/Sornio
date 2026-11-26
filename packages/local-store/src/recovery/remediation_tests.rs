//! Phase 5 remediation tests.
//!
//! These are executable regression tests for the independently confirmed
//! adversarial-audit findings. They assert the REQUIRED behavior (not the
//! previously observed defect), so they fail against candidate `7f73ef0` and
//! pass only once the remediation is in place.
//!
//! RULE 2 / P5-ADV-001: recovery Owner-password verification must enforce the
//! same durable, restart-persistent, concurrency-safe lockout as normal login.
use super::phase5_tests::{install_fence, sale, seeded, KEY, LOGIN};
use super::*;
use crate::access::Workspace;

/// Read the shared database-wide authentication budget.
fn budget(db: &Connection) -> (i64, i64) {
    db.query_row(
        "SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap()
}

const WRONG: &str = "definitely-not-the-owner-password";

/// Repeated failures must be durably accounted and must engage the lockout at
/// the same threshold normal login uses (five attempts), and the protection
/// must survive closing and reopening the database (application restart).
#[test]
fn rem_r2_repeated_failures_lock_out_and_persist_across_restart() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut s = seeded(&path);
    let o = install_fence(&s.0);
    // Model the real attack state: fenced AND locked (no session), as after a
    // crash and application restart.
    s.1 = None;
    let clock = now().unwrap();

    // First four failures are rejected but do not yet lock.
    for i in 0..4 {
        let r = resolve_interrupted_at(&mut s, &o.operation_id, WRONG, clock);
        assert!(
            matches!(r, Err(StoreError::InvalidPassword)),
            "attempt {i}: {r:?}"
        );
        assert_eq!(budget(&s.0).0, i + 1, "failure must be durably counted");
    }
    // The fifth failure engages the 60 second lockout.
    let r = resolve_interrupted_at(&mut s, &o.operation_id, WRONG, clock);
    assert!(matches!(r, Err(StoreError::RateLimited)), "{r:?}");
    let (attempts, retry) = budget(&s.0);
    assert_eq!(attempts, 5);
    assert_eq!(retry, clock + 60, "lockout window must match login policy");

    // Restart: the protection is durable, not in-memory.
    drop(s);
    let mut reopened = Store::open(&path, KEY).unwrap();
    assert_eq!(budget(&reopened.0), (5, clock + 60));
    let r = resolve_interrupted_at(&mut reopened, &o.operation_id, WRONG, clock);
    assert!(
        matches!(r, Err(StoreError::RateLimited)),
        "restart must not reset the lockout: {r:?}"
    );
    assert!(fence_active(&reopened.0).unwrap(), "fence must survive");
}

/// An active lockout must never be bypassed — not even by the correct password —
/// and no session may be granted while it is active.
#[test]
fn rem_r2_correct_password_cannot_bypass_active_lockout() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    let o = install_fence(&s.0);
    // Model the real attack state: fenced AND locked (no session), as after a
    // crash and application restart.
    s.1 = None;
    let clock = now().unwrap();
    for _ in 0..5 {
        let _ = resolve_interrupted_at(&mut s, &o.operation_id, WRONG, clock);
    }
    assert_eq!(budget(&s.0).0, 5);
    // Correct password during the lockout window.
    let r = resolve_interrupted_at(&mut s, &o.operation_id, LOGIN, clock + 30);
    assert!(matches!(r, Err(StoreError::RateLimited)), "{r:?}");
    assert!(s.1.is_none(), "no session may be granted while locked out");
    assert!(fence_active(&s.0).unwrap(), "fence must remain active");
    // The budget is not cleared by the rejected attempt.
    assert_eq!(budget(&s.0), (5, clock + 60));
}

/// After the permitted recovery interval elapses, the correct password must
/// succeed, clear the shared budget and release the fence.
#[test]
fn rem_r2_success_after_permitted_interval_clears_budget() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    let o = install_fence(&s.0);
    // Model the real attack state: fenced AND locked (no session), as after a
    // crash and application restart.
    s.1 = None;
    let clock = now().unwrap();
    for _ in 0..5 {
        let _ = resolve_interrupted_at(&mut s, &o.operation_id, WRONG, clock);
    }
    assert!(matches!(
        resolve_interrupted_at(&mut s, &o.operation_id, LOGIN, clock + 59),
        Err(StoreError::RateLimited)
    ));
    // One second past the window: authentication is allowed again.
    resolve_interrupted_at(&mut s, &o.operation_id, LOGIN, clock + 61).unwrap();
    assert_eq!(budget(&s.0), (0, 0), "success clears the shared budget");
    assert!(!fence_active(&s.0).unwrap(), "resolution releases the fence");
    assert!(s.1.is_some(), "the Owner is unlocked after resolution");
}

/// Concurrent resolution attempts must not bypass attempt accounting: the
/// IMMEDIATE writer transaction serializes them, so exactly four failures are
/// admitted before the lockout engages and the budget never exceeds five.
#[test]
fn rem_r2_concurrent_attempts_do_not_bypass_accounting() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut s = seeded(&path);
    let o = install_fence(&s.0);
    let operation_id = o.operation_id.clone();
    drop(s);

    let threads = 8;
    let per_thread = 4;
    let mut handles = Vec::new();
    for _ in 0..threads {
        let path = path.clone();
        let operation_id = operation_id.clone();
        handles.push(std::thread::spawn(move || {
            let mut store = Store::open(&path, KEY).unwrap();
            let clock = now().unwrap();
            let mut invalid = 0usize;
            let mut limited = 0usize;
            for _ in 0..per_thread {
                match resolve_interrupted_at(&mut store, &operation_id, WRONG, clock) {
                    Err(StoreError::InvalidPassword) => invalid += 1,
                    Err(StoreError::RateLimited) => limited += 1,
                    other => panic!("unexpected concurrent result: {other:?}"),
                }
            }
            (invalid, limited)
        }));
    }
    let mut invalid = 0;
    let mut limited = 0;
    for h in handles {
        let (i, l) = h.join().unwrap();
        invalid += i;
        limited += l;
    }
    assert_eq!(invalid, 4, "only four failures may precede the lockout");
    assert_eq!(limited, threads * per_thread - 4);
    let reopened = Store::open(&path, KEY).unwrap();
    let (attempts, retry) = budget(&reopened.0);
    assert_eq!(attempts, 5, "concurrency must not over- or under-count");
    assert!(retry > 0, "the lockout must be engaged");
}

/// Locked-state recovery review must remain available while the Owner is locked
/// out, but no ordinary business functionality may become accessible.
#[test]
fn rem_r2_review_available_while_business_stays_blocked() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    let o = install_fence(&s.0);
    // Model the real attack state: fenced AND locked (no session), as after a
    // crash and application restart.
    s.1 = None;
    let clock = now().unwrap();
    for _ in 0..5 {
        let _ = resolve_interrupted_at(&mut s, &o.operation_id, WRONG, clock);
    }
    // Review is operational metadata and stays readable without a session.
    let st = status(&s.0).unwrap();
    assert!(st.fenced && st.requires_resolution);
    assert_eq!(st.operation_id.as_deref(), Some(o.operation_id.as_str()));
    // No session was granted, and business writes remain barred by the fence.
    assert!(s.1.is_none());
    assert!(s
        .0
        .execute("UPDATE local_products SET stock_milli=0 WHERE id='rice'", [])
        .is_err());
    // Normal login is still barred by the fence, and the shared budget is spent.
    let mut w = Workspace::new(s);
    assert!(matches!(w.unlock(LOGIN), Err(StoreError::RecoveryActive)));
}

/// The recovery path must not be a second, weaker password policy: failures
/// charged through resolution also lock out the normal login path (shared
/// database-wide budget), so alternating paths cannot multiply the allowance.
#[test]
fn rem_r2_budget_is_shared_with_normal_login() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    // No fence here: resolution still authenticates and must charge the budget.
    let clock = now().unwrap();
    for _ in 0..5 {
        let _ = resolve_interrupted_at(&mut s, "nonexistent-operation", WRONG, clock);
    }
    let (attempts, retry) = budget(&s.0);
    assert_eq!(attempts, 5);
    assert!(retry > clock);
    // The normal login path now honors the very same lockout.
    let mut w = Workspace::new(s);
    assert!(
        matches!(w.unlock(LOGIN), Err(StoreError::RateLimited)),
        "normal login must respect the budget spent through recovery resolution"
    );
}
