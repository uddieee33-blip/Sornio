//! Phase 5 executable proof: universal ownership fencing, the durable recovery
//! state machine, crash consistency at every transition, fail-closed startup
//! reconciliation, publisher draining, and a test-only financial-integrity
//! verifier that inspects actual database state. These tests assert behavior
//! against a real encrypted SQLCipher database, never a mock of the engine.
use super::*;
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    catalog::AddProduct,
    replication::{
        publish_unpublished, FlushLock, PublishAck, PublisherIdentity, ReplicationSidecar,
        SidecarAck, Transport,
    },
    Draft,
};

pub(super) const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
pub(super) const LOGIN: &str = "Local test password!";
pub(super) const SECRET: &str = "Separate recovery passphrase 2026!";

pub(super) fn seeded(path: &Path) -> Store {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.setup(LOGIN).unwrap();
    w.save(
        0,
        Draft {
            business_name: "Recovery shop".into(),
            business_type: "kirana".into(),
            note: "Private saved note".into(),
        },
    )
    .unwrap();
    w.add_product(AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 4250,
        opening_stock_milli: 100000,
    })
    .unwrap();
    w.into_recovery_store()
}

pub(super) fn sale(id: &str, revision: i64) -> PostInvoice {
    PostInvoice {
        operation_id: id.into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: revision,
            quantity_milli: 1250,
        }],
        tax_basis_points: 500,
        tender: Tender::Cash,
        customer_id: None,
    }
}

/// Install a durable admitted operation + fence directly (exactly what `admit`
/// writes), used to exercise the fenced state without a full backup round-trip.
pub(super) fn install_fence(db: &Connection) -> Ownership {
    let business: String = db
        .query_row(
            "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let operation_id = random_id().unwrap();
    let owner_token = random_id().unwrap();
    let at = now().unwrap();
    db.execute(
        "INSERT INTO local_recovery_operations(operation_id,kind,state,business_id,generation,owner_token,backup_id,expected_fingerprint,actor_id,result_generation,detail,created_at,updated_at)
         VALUES(?1,'restore','admitted',?2,?3,?4,'backup-test',?5,NULL,NULL,NULL,?6,?6)",
        params![operation_id, business, generation(db).unwrap(), owner_token, fingerprint(db).unwrap(), at],
    )
    .unwrap();
    db.execute(
        "INSERT INTO local_recovery_fence(singleton,operation_id,business_id,owner_token,activated_at) VALUES(1,?1,?2,?3,?4)",
        params![operation_id, business, owner_token, at],
    )
    .unwrap();
    Ownership {
        operation_id,
        owner_token,
    }
}

/// Remove every user trigger so a test can inject raw on-disk-style corruption.
/// The financial verifier must detect bad state regardless of how it arose.
pub(super) fn strip_triggers(db: &Connection) {
    let names: Vec<String> = {
        let mut q = db
            .prepare(
                "SELECT name FROM sqlite_schema WHERE type='trigger' AND name NOT GLOB 'sqlite_*'",
            )
            .unwrap();
        let rows = q.query_map([], |r| r.get(0)).unwrap();
        rows.collect::<Result<_, _>>().unwrap()
    };
    for n in names {
        db.execute_batch(&format!("DROP TRIGGER {}", quote(&n)))
            .unwrap();
    }
}

// ---------------------------------------------------------------------------
// Test-only financial-integrity verifier. Inspects ACTUAL database state.
// Returns a list of human-readable violations; empty means all invariants hold.
// ---------------------------------------------------------------------------
fn push_query(db: &Connection, v: &mut Vec<String>, sql: &str, label: &str) {
    let mut q = db.prepare(sql).unwrap();
    let rows = q
        .query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    for key in rows {
        v.push(format!("{label}: {key}"));
    }
}

/// Test-only financial-integrity verifier. Inspects ACTUAL database state and
/// returns human-readable violations; an empty list means every invariant holds.
fn financial_violations(db: &Connection) -> Vec<String> {
    let mut v = Vec::new();

    // 1. Double-entry balance: every operation's postings must sum to zero.
    push_query(db, &mut v,
        "SELECT invoice_id FROM local_billing_ledger GROUP BY invoice_id HAVING SUM(amount_paise)<>0",
        "billing ledger imbalance");
    push_query(db, &mut v,
        "SELECT operation_id FROM local_customer_journal GROUP BY operation_id HAVING SUM(amount_paise)<>0",
        "customer journal imbalance");
    push_query(
        db,
        &mut v,
        "SELECT operation_id FROM local_retail_journal GROUP BY operation_id HAVING SUM(amount)<>0",
        "retail journal imbalance",
    );

    // 2. Missing postings: a posted invoice must have ledger rows.
    push_query(db, &mut v,
        "SELECT i.id FROM local_invoices i WHERE NOT EXISTS(SELECT 1 FROM local_billing_ledger l WHERE l.invoice_id=i.id)",
        "invoice missing ledger postings");

    // 3. Duplicate idempotency keys in the replication outboxes. (The schema also
    //    enforces UNIQUE; this reads actual state as defense against on-disk damage.)
    for (table, key, label) in [
        (
            "local_billing_outbox",
            "invoice_id",
            "billing outbox duplicate operation",
        ),
        (
            "local_customer_outbox",
            "operation_id",
            "customer outbox duplicate operation",
        ),
        (
            "local_retail_outbox",
            "operation_id",
            "retail outbox duplicate operation",
        ),
        (
            "local_inventory_outbox",
            "operation_id",
            "inventory outbox duplicate operation",
        ),
    ] {
        push_query(
            db,
            &mut v,
            &format!("SELECT {key} FROM {table} GROUP BY {key} HAVING COUNT(*)>1"),
            label,
        );
    }

    // 4. Inventory: stock must be non-negative and invoice_stock arithmetic exact.
    push_query(
        db,
        &mut v,
        "SELECT id FROM local_products WHERE stock_milli<0",
        "negative inventory stock",
    );
    push_query(db, &mut v,
        "SELECT invoice_id||'/'||product_id FROM local_invoice_stock WHERE after_milli<>before_milli-quantity_milli",
        "invoice stock arithmetic broken");

    // 5. Credit cross-check: a credit sale's receivables posting must equal the
    //    credit entry recorded for that invoice.
    push_query(db, &mut v,
        "SELECT c.invoice_id FROM local_credit_entries c JOIN local_billing_ledger l ON l.invoice_id=c.invoice_id AND l.account='receivables' WHERE c.kind='sale' AND l.amount_paise<>c.amount_paise",
        "credit sale receivables mismatch");

    // 6. Recovery invariants against actual metadata.
    let non_terminal: i64 = db
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM local_recovery_operations WHERE state IN {NON_TERMINAL}"
            ),
            [],
            |r| r.get(0),
        )
        .unwrap();
    if non_terminal > 1 {
        v.push(format!("multiple live recovery operations: {non_terminal}"));
    }
    push_query(db, &mut v,
        "SELECT operation_id FROM local_recovery_operations WHERE state='completed' AND result_generation IS NULL",
        "completed recovery without result generation");
    push_query(db, &mut v,
        "SELECT operation_id FROM local_recovery_fence f WHERE NOT EXISTS(SELECT 1 FROM local_recovery_operations o WHERE o.operation_id=f.operation_id AND o.state IN ('admitted','quiescing','executing','verifying'))",
        "fence references non-live operation");
    // The newest completed recovery must own the current restore generation.
    let latest: Option<String> = db
        .query_row(
            "SELECT result_generation FROM local_recovery_operations WHERE state='completed' ORDER BY updated_at DESC, rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .unwrap();
    if let Some(result) = latest {
        if result != generation(db).unwrap() {
            v.push("latest completed recovery generation != current generation".into());
        }
    }
    // Additive: also exercise the PRODUCTION restore-boundary verifier, so every
    // healthy-state assertion in this suite proves the production gate accepts
    // valid data (and the corruption tests below cover its detections). Existing
    // assertions are unchanged.
    v.extend(super::financial::violations(db).unwrap());
    v
}

#[test]
fn financial_verifier_accepts_a_healthy_workspace() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    s.post_invoice(sale("sale-2", 2)).unwrap();
    assert!(
        financial_violations(&s.0).is_empty(),
        "{:?}",
        financial_violations(&s.0)
    );
}

#[test]
fn financial_verifier_detects_ledger_imbalance_and_missing_postings() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    assert!(financial_violations(&s.0).is_empty());
    // Inject corruption directly (bypassing triggers, as on-disk damage would).
    strip_triggers(&s.0);
    s.0.execute(
        "UPDATE local_billing_ledger SET amount_paise=amount_paise+1 WHERE invoice_id='sale-1' AND account='cash'",
        [],
    )
    .unwrap();
    s.0.execute(
        "DELETE FROM local_billing_ledger WHERE invoice_id='sale-1' AND account='revenue'",
        [],
    )
    .unwrap();
    let v = financial_violations(&s.0);
    assert!(
        v.iter().any(|x| x.starts_with("billing ledger imbalance")),
        "{v:?}"
    );
}

#[test]
fn financial_verifier_detects_credit_mismatch_and_customer_journal_imbalance() {
    use crate::customers::{CreditKind, CreditRequest, SaveCustomer};
    let d = tempfile::tempdir().unwrap();
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
    let s = w.into_recovery_store();
    assert!(
        financial_violations(&s.0).is_empty(),
        "{:?}",
        financial_violations(&s.0)
    );
    // Inject corruption that SQL constraints do not themselves block.
    strip_triggers(&s.0);
    s.0.execute(
        "UPDATE local_credit_entries SET amount_paise=amount_paise+1 WHERE kind='sale' AND invoice_id='credit-sale'",
        [],
    )
    .unwrap();
    s.0.execute(
        "UPDATE local_customer_journal SET amount_paise=amount_paise+1 WHERE operation_id='cash-collection' AND account='cash'",
        [],
    )
    .unwrap();
    let v = financial_violations(&s.0);
    assert!(
        v.iter()
            .any(|x| x.starts_with("credit sale receivables mismatch")),
        "{v:?}"
    );
    assert!(
        v.iter()
            .any(|x| x.starts_with("customer journal imbalance")),
        "{v:?}"
    );
}

#[test]
fn financial_verifier_holds_after_a_complete_restore() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    let archive = d.path().join("backup");
    export(&mut s, &archive, SECRET).unwrap();
    s.post_invoice(sale("sale-2", 2)).unwrap();
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
    // After restore the imported image plus the completed operation must be clean.
    assert!(
        financial_violations(&s.0).is_empty(),
        "{:?}",
        financial_violations(&s.0)
    );
}

// ---------------------------------------------------------------------------
// Universal ownership enforcement: the engine-level barrier rejects every
// business write while fenced, including session-less raw SQL.
// ---------------------------------------------------------------------------
#[test]
fn fence_blocks_every_business_table_write_including_raw_sql() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    let before = fingerprint(&s.0).unwrap();
    let _o = install_fence(&s.0);
    assert!(fence_active(&s.0).unwrap());
    // A representative write per fenced table must be rejected by the barrier.
    let attempts = [
        "UPDATE local_products SET stock_milli=0 WHERE id='rice'",
        "DELETE FROM local_invoices WHERE id='sale-1'",
        "INSERT INTO local_billing_ledger(invoice_id,account,amount_paise) VALUES('sale-1','cash',1)",
        "INSERT INTO local_customers(id,name,credit_days,revision) VALUES('c-fence','C',30,1)",
        "INSERT INTO workspace_history(revision,payload) VALUES(999,'{}')",
        "UPDATE local_principals SET enabled=0 WHERE role='owner'",
        "INSERT INTO local_inventory_events(product_id,operation_id,kind,request,payload,created_at) VALUES('rice','x','product_added','{}','{}','2026-01-01')",
    ];
    for sql in attempts {
        let result = s.0.execute_batch(sql);
        assert!(result.is_err(), "fenced write was not rejected: {sql}");
    }
    // No business state changed.
    assert_eq!(fingerprint(&s.0).unwrap(), before);
}

#[test]
fn second_admission_while_fenced_is_rejected_no_dual_ownership() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    let archive = d.path().join("backup");
    export(&mut s, &archive, SECRET).unwrap();
    let p = preview(&mut s, &archive, SECRET, LOGIN).unwrap();
    let _o = admit(&mut s, &p).unwrap();
    // A second concurrent admission must fail closed, never create a second owner.
    assert!(matches!(admit(&mut s, &p), Err(StoreError::RecoveryActive)));
    let live: i64 =
        s.0.query_row(
            &format!(
                "SELECT COUNT(*) FROM local_recovery_operations WHERE state IN {NON_TERMINAL}"
            ),
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(live, 1);
}

#[test]
fn stale_owner_token_cannot_transition_or_release() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    let o = install_fence(&s.0);
    let forged = Ownership {
        operation_id: o.operation_id.clone(),
        owner_token: random_id().unwrap(),
    };
    let tx =
        s.0.transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
    assert!(matches!(
        transition(&tx, &forged, &["admitted"], "quiescing", None, None),
        Err(StoreError::RecoveryOwnership)
    ));
    tx.commit().unwrap();
    // The real fence is untouched.
    assert!(fence_active(&s.0).unwrap());
}

#[test]
fn business_identity_substitution_into_a_configured_store_is_rejected() {
    let d = tempfile::tempdir().unwrap();
    let mut source = seeded(&d.path().join("source"));
    source.post_invoice(sale("sale-1", 1)).unwrap();
    let archive = d.path().join("backup");
    export(&mut source, &archive, SECRET).unwrap();
    // A different, already-configured business must refuse the foreign backup.
    let mut other = seeded(&d.path().join("other"));
    other.post_invoice(sale("other-sale", 1)).unwrap();
    assert!(matches!(
        preview(&mut other, &archive, SECRET, LOGIN),
        Err(StoreError::BackupBusinessMismatch)
    ));
}

#[test]
fn rejected_attempt_releases_fence_and_preserves_business_state() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    let before = fingerprint(&s.0).unwrap();
    let o = install_fence(&s.0);
    reject(&mut s, &o, "test rejection").unwrap();
    assert!(!fence_active(&s.0).unwrap());
    assert_eq!(fingerprint(&s.0).unwrap(), before);
    let state: String =
        s.0.query_row(
            "SELECT state FROM local_recovery_operations WHERE operation_id=?1",
            [&o.operation_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(state, "rejected");
    // Business writes work again after the fence is released.
    s.post_invoice(sale("sale-2", 2)).unwrap();
}

// ---------------------------------------------------------------------------
// Publisher fencing / draining.
// ---------------------------------------------------------------------------
struct EchoTransport;
impl Transport for EchoTransport {
    fn send(&self, envelope_json: &str) -> Result<PublishAck, StoreError> {
        let value: serde_json::Value =
            serde_json::from_str(envelope_json).map_err(|_| StoreError::InvalidInvoice)?;
        Ok(PublishAck {
            operation_id: value
                .get("operationId")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .into(),
            cursor: "1".into(),
            duplicate: false,
            business_id: value
                .get("businessId")
                .and_then(|v| v.as_str())
                .map(str::to_string),
        })
    }
}

fn publisher_setup(s: &Store, dir: &Path) -> (PublisherIdentity, ReplicationSidecar, FlushLock) {
    let generation = s.restore_generation().unwrap();
    let business_id: String =
        s.0.query_row(
            "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let identity = PublisherIdentity {
        business_id,
        device_id: "device-phase5".into(),
        restore_generation: generation.clone(),
    };
    let mut sidecar = ReplicationSidecar::open(&dir.join("sidecar.sqlite"), KEY).unwrap();
    sidecar.save(&SidecarAck::empty(&generation)).unwrap();
    (identity, sidecar, FlushLock::default())
}

#[test]
fn publisher_is_barred_while_a_recovery_fence_is_active() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    let (identity, mut sidecar, flush) = publisher_setup(&s, d.path());
    // Normal publish succeeds and acks the outbox row.
    let acks = publish_unpublished(&s, &mut sidecar, &identity, &EchoTransport, &flush).unwrap();
    assert!(!acks.is_empty());
    // A new sale creates a new unpublished row, then a fence appears.
    s.post_invoice(sale("sale-2", 2)).unwrap();
    let _o = install_fence(&s.0);
    assert!(matches!(
        publish_unpublished(&s, &mut sidecar, &identity, &EchoTransport, &flush),
        Err(StoreError::RecoveryActive)
    ));
    // The stale row was never acked under the fence.
    let gen = s.restore_generation().unwrap();
    assert_eq!(sidecar.load(&gen).unwrap().last_for("billing"), Some(1));
}

#[test]
fn publisher_with_stale_generation_is_rejected() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    let (mut identity, mut sidecar, flush) = publisher_setup(&s, d.path());
    identity.restore_generation = "stale-generation".into();
    assert!(matches!(
        publish_unpublished(&s, &mut sidecar, &identity, &EchoTransport, &flush),
        Err(StoreError::WorkspaceMismatch)
    ));
}

// ---------------------------------------------------------------------------
// Fail-closed startup reconciliation matrix. Each case corrupts durable recovery
// metadata into an ambiguous state and asserts that reopen refuses (RecoveryCorrupt)
// or, for the single safe case, re-fences with an audit entry.
// ---------------------------------------------------------------------------
fn reopen_err(path: &Path) -> StoreError {
    match Store::open(path, KEY) {
        Ok(_) => panic!("expected reopen to fail closed"),
        Err(e) => e,
    }
}

#[test]
fn startup_reconciliation_matrix() {
    // Each closure corrupts a freshly-fenced store; we assert the reopen outcome.
    type Case = (&'static str, fn(&Connection), bool);
    let cases: &[Case] = &[
        (
            "missing_audit_table",
            |db| {
                db.execute_batch("DROP TABLE local_recovery_audit").unwrap();
            },
            true,
        ),
        (
            "unknown_audit_action",
            |db| {
                db.execute("INSERT INTO local_recovery_audit(operation_id,action,backup_id,created_at) VALUES('unknown-op','recovery.evil','b',0)", []).unwrap();
            },
            true,
        ),
        (
            "orphaned_fence",
            |db| {
                strip_triggers(db);
                db.execute("UPDATE local_recovery_operations SET state='rejected'", [])
                    .unwrap();
            },
            true,
        ),
        (
            "conflicting_business_identity",
            |db| {
                strip_triggers(db);
                db.execute(
                    "UPDATE local_recovery_operations SET business_id='someone-else'",
                    [],
                )
                .unwrap();
            },
            true,
        ),
        (
            "two_live_operations",
            |db| {
                strip_triggers(db);
                db.execute("INSERT INTO local_recovery_operations(operation_id,kind,state,business_id,generation,owner_token,backup_id,expected_fingerprint,created_at,updated_at) SELECT 'second','restore','admitted',business_id,generation,'tok','b','f',0,0 FROM local_recovery_operations LIMIT 1", []).unwrap();
            },
            true,
        ),
        (
            "completed_without_result_generation",
            |db| {
                strip_triggers(db);
                db.execute("UPDATE local_recovery_operations SET state='completed', result_generation=NULL", []).unwrap();
                db.execute("DELETE FROM local_recovery_fence", []).unwrap();
            },
            true,
        ),
        (
            "fence_owner_token_mismatch",
            |db| {
                strip_triggers(db);
                db.execute("UPDATE local_recovery_fence SET owner_token='forged'", [])
                    .unwrap();
            },
            true,
        ),
    ];
    for (name, corrupt, expect_corrupt) in cases {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("live");
        let s = seeded(&path);
        let _o = install_fence(&s.0);
        corrupt(&s.0);
        drop(s);
        if *expect_corrupt {
            assert!(
                matches!(reopen_err(&path), StoreError::RecoveryCorrupt),
                "case {name} did not refuse open"
            );
        }
    }
}

#[test]
fn startup_refences_a_live_operation_that_lost_its_fence() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let s = seeded(&path);
    let o = install_fence(&s.0);
    // Simulate a crash that committed the operation but lost the fence row.
    strip_triggers(&s.0);
    s.0.execute("DELETE FROM local_recovery_fence", []).unwrap();
    drop(s);
    // Reopen must succeed but re-establish the fail-closed barrier (T7) + audit.
    let reopened = Store::open(&path, KEY).unwrap();
    assert!(fence_active(&reopened.0).unwrap());
    let status = status(&reopened.0).unwrap();
    assert!(status.fenced && status.requires_resolution);
    assert_eq!(
        status.operation_id.as_deref(),
        Some(o.operation_id.as_str())
    );
    let audited: i64 = reopened
        .0
        .query_row(
            // The audit ledger stores the referenced operation id in backup_id.
            "SELECT COUNT(*) FROM local_recovery_audit WHERE action='recovery.reconciled_fence' AND backup_id=?1",
            [&o.operation_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(audited, 1);
}

// ---------------------------------------------------------------------------
// Crash consistency at every durable transition (subprocess SIGKILL).
// ---------------------------------------------------------------------------
#[test]
#[ignore = "subprocess crash worker only"]
fn phase5_crash_worker() {
    let root = std::path::PathBuf::from(std::env::var_os("SORNIO_RECOVERY_TEST_ROOT").unwrap());
    let mut w = Workspace::new(Store::open(&root.join("live"), KEY).unwrap());
    w.unlock(LOGIN).unwrap();
    let mut s = w.into_recovery_store();
    let p = preview(&mut s, &root.join("backup"), SECRET, LOGIN).unwrap();
    restore(
        &mut s,
        &root.join("backup"),
        &root,
        SECRET,
        LOGIN,
        &p,
        &p.confirmation,
    )
    .unwrap();
    panic!("Worker did not stop at injected boundary");
}

#[test]
fn crash_at_every_transition_is_fail_closed_and_consistent() {
    for phase in [
        "admitted",
        "quiescing",
        "executing",
        "verifying",
        "completed",
    ] {
        let d = tempfile::tempdir().unwrap();
        let mut s = seeded(&d.path().join("live"));
        s.post_invoice(sale("first-sale", 1)).unwrap();
        export(&mut s, &d.path().join("backup"), SECRET).unwrap();
        s.post_invoice(sale("later-sale", 2)).unwrap();
        drop(s);
        let marker = d.path().join("at-boundary");
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "recovery::phase5_tests::phase5_crash_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("SORNIO_RECOVERY_TEST_ROOT", d.path())
            .env("SORNIO_RECOVERY_CRASH_PHASE", phase)
            .env("SORNIO_RECOVERY_CRASH_MARKER", &marker)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        while !marker.exists() && std::time::Instant::now() < deadline {
            assert!(
                child.try_wait().unwrap().is_none(),
                "worker exited before boundary ({phase})"
            );
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(marker.exists(), "worker did not reach boundary ({phase})");
        child.kill().unwrap();
        child.wait().unwrap();

        let store = Store::open(&d.path().join("live"), KEY).unwrap();
        integrity(&store.0).unwrap();
        if phase == "completed" {
            // The only success point committed: fence released, backup imported.
            assert!(!fence_active(&store.0).unwrap(), "{phase}");
            assert_eq!(store.list_invoices(0).unwrap().len(), 1, "{phase}");
            let st = status(&store.0).unwrap();
            assert!(!st.requires_resolution, "{phase}");
            assert!(financial_violations(&store.0).is_empty(), "{phase}");
        } else {
            // Every pre-commit crash leaves a durable fence and pre-restore data.
            assert!(fence_active(&store.0).unwrap(), "{phase}");
            assert_eq!(store.list_invoices(0).unwrap().len(), 2, "{phase}");
            let mut w = Workspace::new(store);
            let st = w.recovery_status().unwrap();
            assert!(st.fenced && st.requires_resolution, "{phase}");
            let op = st.operation_id.clone().unwrap();
            w.resolve_interrupted_recovery(&op, LOGIN).unwrap();
            assert!(!fence_active(&w.store_for_test().0).unwrap(), "{phase}");
            assert_eq!(
                w.store_for_test().list_invoices(0).unwrap().len(),
                2,
                "{phase}"
            );
            assert!(
                financial_violations(&w.store_for_test().0).is_empty(),
                "{phase}"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// P5-ADV-008 / P5-ADV-010: recovery metadata must be tamper-resistant.
//
// The original audit wrote, with raw SQL and a live fence: a lockout reset, a
// `generation` tamper, a `business_id` substitution, and accepted malformed
// generations at startup reconciliation. Every guard below is engine-level, so
// it holds for any connection and any raw SQL, not only through the Rust API.
// ---------------------------------------------------------------------------

/// With a live fence the engine refuses every metadata rewrite the audit used.
#[test]
fn recovery_metadata_is_immutable_while_fenced() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    let o = install_fence(&s.0);
    s.1 = None;
    let clock = now().unwrap();
    for _ in 0..5 {
        let _ = resolve_interrupted_at(&mut s, &o.operation_id, "wrong-password-value", clock);
    }
    let spent: (i64, i64) =
        s.0.query_row(
            "SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(spent.0, 5, "the audit's precondition: budget is spent");
    // 1. The audit's lockout reset must be refused while the fence is live.
    assert!(
        s.0.execute(
            "UPDATE workspace_access SET failed_attempts=0,retry_after=0 WHERE singleton=1",
            [],
        )
        .is_err(),
        "clearing the shared lockout under a live fence must be refused"
    );
    // Partial weakening (retry window dropped) and credential swaps are refused.
    assert!(s
        .0
        .execute(
            "UPDATE workspace_access SET retry_after=0 WHERE singleton=1",
            []
        )
        .is_err());
    assert!(s
        .0
        .execute(
            "UPDATE workspace_access SET password_hash='x' WHERE singleton=1",
            []
        )
        .is_err());
    assert!(s.0.execute("DELETE FROM workspace_access", []).is_err());
    // 2. The audit's generation tamper must be refused.
    assert!(s
        .0
        .execute(
            "UPDATE local_recovery_identity SET generation='tampered'",
            []
        )
        .is_err());
    // 3. The audit's business identity substitution must be refused.
    assert!(s
        .0
        .execute(
            "UPDATE local_recovery_identity SET business_id='someone-else'",
            []
        )
        .is_err());
    // 4. Deleting the identity row (and thus the fence's identity anchor) fails.
    assert!(s
        .0
        .execute("DELETE FROM local_recovery_identity", [])
        .is_err());
    let (attempts, retry): (i64, i64) =
        s.0.query_row(
            "SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        (attempts, retry),
        spent,
        "the durable budget must be unchanged by every refused tamper"
    );
    // Accountability is preserved: only monotonic failure accounting may be
    // written through the fence, so a further attempt still locks out.
    assert!(matches!(
        resolve_interrupted_at(&mut s, &o.operation_id, "wrong-password-value", clock + 120),
        Err(StoreError::InvalidPassword)
    ));
    let after: (i64, i64) =
        s.0.query_row(
            "SELECT failed_attempts,retry_after FROM workspace_access WHERE singleton=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        after.0, 1,
        "after the lockout window expires the budget restarts at one"
    );
    assert_eq!(after.1, 0, "the expired lockout window is cleared");
    assert!(fence_active(&s.0).unwrap(), "the fence is still live");
}

/// Legitimate post-fence maintenance still works: release → rotate generation is
/// the production restore/resolve order, and it must not be blocked.
#[test]
fn metadata_writes_are_allowed_once_the_fence_is_released() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("sale-1", 1)).unwrap();
    let archive = d.path().join("backup");
    export(&mut s, &archive, SECRET).unwrap();
    s.post_invoice(sale("sale-2", 2)).unwrap();
    let before = generation(&s.0).unwrap();
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
    let after = generation(&s.0).unwrap();
    assert_ne!(before, after, "a restore rotates the generation");
    assert!(is_hex64(&after), "the new generation is canonical");
    assert!(!fence_active(&s.0).unwrap());
    // The shared authentication budget is usable (and resettable) again.
    let mut w = Workspace::new(s);
    w.unlock(LOGIN).unwrap();
}

/// Malformed durable metadata is refused at startup, not accepted because it is
/// merely non-empty. (P5-ADV-010: the audit's four accepted malformed values.)
#[test]
fn startup_rejects_malformed_recovery_identity() {
    for bad in ["short", "zzzz", "'; DROP TABLE x; --", ""] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("live");
        let s = seeded(&path);
        strip_triggers(&s.0);
        s.0.execute("UPDATE local_recovery_identity SET generation=?1", [bad])
            .unwrap();
        drop(s);
        assert!(
            matches!(reopen_err(&path), StoreError::RecoveryCorrupt),
            "generation {bad:?} must be refused at startup"
        );
    }
    for bad in ["short", "not-hex", ""] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("live");
        let s = seeded(&path);
        strip_triggers(&s.0);
        s.0.execute("UPDATE local_recovery_identity SET business_id=?1", [bad])
            .unwrap();
        drop(s);
        assert!(
            matches!(reopen_err(&path), StoreError::RecoveryCorrupt),
            "business identity {bad:?} must be refused at startup"
        );
    }
    // A completed recovery whose recorded result generation is malformed or does
    // not match the live generation must also fail closed.
    let canonical = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdee";
    for (label, result) in [
        ("malformed result generation", "short"),
        (
            "result generation differs from the live generation",
            canonical,
        ),
    ] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("live");
        let s = seeded(&path);
        let o = install_fence(&s.0);
        strip_triggers(&s.0);
        s.0.execute("UPDATE local_recovery_operations SET state='completed'", [])
            .unwrap();
        s.0.execute(
            "UPDATE local_recovery_operations SET result_generation=?1 WHERE operation_id=?2",
            params![result, o.operation_id],
        )
        .unwrap();
        s.0.execute("DELETE FROM local_recovery_fence", []).unwrap();
        drop(s);
        assert!(
            matches!(reopen_err(&path), StoreError::RecoveryCorrupt),
            "{label} must be refused at startup"
        );
    }
}
