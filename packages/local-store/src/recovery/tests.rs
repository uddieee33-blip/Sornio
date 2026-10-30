use super::*;
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    catalog::AddProduct,
    Draft,
};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const LOGIN: &str = "Local test password!";
const SECRET: &str = "Separate recovery passphrase 2026!";
#[test]
fn version_eleven_backup_remains_verifiable_and_restorable_after_lan_migration() {
    let d = tempfile::tempdir().unwrap();
    let mut source = seeded(&d.path().join("live"));
    let invoice = source.post_invoice(sale("v11-sale", 1)).unwrap();
    let archive = d.path().join("v11-backup");
    export(&mut source, &archive, SECRET).unwrap();
    // Manufacture an old encrypted fixture using a writable test connection;
    // production archive verification deliberately opens read-only.
    let db = Connection::open(&archive).unwrap();
    db.pragma_update(None, "key", SECRET).unwrap();
    crate::lan_authority::remove_fixture_tables(&db);
    db.pragma_update(None, "user_version", 11).unwrap();
    let payload: String = db
        .query_row("SELECT payload FROM sornio_backup_manifest", [], |r| {
            r.get(0)
        })
        .unwrap();
    let mut manifest: Manifest = serde_json::from_str(&payload).unwrap();
    manifest.schema = 11;
    manifest.digest = digest(&db).unwrap();
    db.execute(
        "UPDATE sornio_backup_manifest SET payload=?1",
        [serde_json::to_string(&manifest).unwrap()],
    )
    .unwrap();
    drop(db);
    let p = preview(&mut source, &archive, SECRET, LOGIN).unwrap();
    assert_eq!(p.schema_version, 11);
    restore(
        &mut source,
        &archive,
        d.path(),
        SECRET,
        LOGIN,
        &p,
        &p.confirmation,
    )
    .unwrap();
    assert_eq!(source.list_invoices(0).unwrap()[0].invoice, invoice);
    assert_eq!(count(&source.0, "local_lan_devices"), 0);
    assert_eq!(
        source
            .0
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        SCHEMA_VERSION
    );
}
fn seeded(path: &Path) -> Store {
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
        opening_stock_milli: 10000,
    })
    .unwrap();
    w.into_recovery_store()
}
fn sale(id: &str, revision: i64) -> PostInvoice {
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
fn count(db: &Connection, table: &str) -> i64 {
    db.query_row(&format!("SELECT count(*) FROM {}", quote(table)), [], |r| {
        r.get(0)
    })
    .unwrap()
}
#[test]
fn snapshot_restore_preserves_finance_identity_pending_work_and_retries() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live.db"));
    let bill = sale("invoice-original", 1);
    let receipt = s.post_invoice(bill.clone()).unwrap();
    s.prepare_checkout(sale("pending-sale", 2)).unwrap();
    let outbox = s.billing_outbox(0).unwrap();
    let id: String =
        s.0.query_row("SELECT business_id FROM local_recovery_identity", [], |r| {
            r.get(0)
        })
        .unwrap();
    let p = d.path().join("copy.sorniobackup");
    export(&mut s, &p, SECRET).unwrap();
    let bytes = fs::read(&p).unwrap();
    assert!(!bytes.windows(6).any(|v| v == b"SQLite"));
    for private in [LOGIN, SECRET, KEY, "Private saved note", "invoice-original"] {
        assert!(!bytes
            .windows(private.len())
            .any(|v| v == private.as_bytes()));
    }
    assert!(Store::open(&p, KEY).is_err());
    let preview = preview(&mut s, &p, SECRET, LOGIN).unwrap();
    assert_eq!(preview.invoices, 1);
    assert!(preview.pending_checkout);
    s.clear_checkout("pending-sale", false).unwrap();
    assert!(matches!(
        restore(
            &mut s,
            &p,
            d.path(),
            SECRET,
            LOGIN,
            &preview,
            &preview.confirmation
        ),
        Err(StoreError::RecoveryChanged)
    ));
    let preview = super::preview(&mut s, &p, SECRET, LOGIN).unwrap();
    let safety = restore(
        &mut s,
        &p,
        d.path(),
        SECRET,
        LOGIN,
        &preview,
        &preview.confirmation,
    )
    .unwrap();
    assert!(Path::new(&safety).exists());
    assert_eq!(s.post_invoice(bill).unwrap(), receipt);
    assert_eq!(s.billing_outbox(0).unwrap().len(), outbox.len());
    assert_eq!(
        s.0.query_row("SELECT business_id FROM local_recovery_identity", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        id
    );
    assert_eq!(
        s.cashier_state()
            .unwrap()
            .checkout
            .unwrap()
            .request
            .operation_id,
        "pending-sale"
    );
    assert_eq!(count(&s.0, "local_billing_audit"), 1);
    assert!(matches!(
        restore(
            &mut s,
            &p,
            d.path(),
            SECRET,
            LOGIN,
            &preview,
            &preview.confirmation
        ),
        Err(StoreError::RecoveryChanged)
    ));
}
#[test]
fn new_device_uses_new_device_key_and_original_login_and_locks_old_sessions() {
    let d = tempfile::tempdir().unwrap();
    let mut source = seeded(&d.path().join("source.db"));
    source.post_invoice(sale("old-sale", 1)).unwrap();
    let archive = d.path().join("backup");
    export(&mut source, &archive, SECRET).unwrap();
    let target = d.path().join("target.db");
    let new_key = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    let mut target = Workspace::new(Store::open(&target, new_key).unwrap());
    let p = target.preview_backup(&archive, "", SECRET, LOGIN).unwrap();
    target
        .restore_backup(&archive, d.path(), "", SECRET, LOGIN, &p, &p.confirmation)
        .unwrap();
    assert!(!target.status().unwrap().unlocked);
    target.unlock(LOGIN).unwrap();
    assert_eq!(target.list_invoices(0).unwrap().len(), 1);
    let mut stale = Workspace::new(Store::open(&d.path().join("source.db"), KEY).unwrap());
    stale.unlock(LOGIN).unwrap();
    let mut owner = Workspace::new(source);
    owner.unlock(LOGIN).unwrap();
    let p = owner
        .preview_backup(&archive, LOGIN, SECRET, LOGIN)
        .unwrap();
    owner
        .restore_backup(
            &archive,
            d.path(),
            LOGIN,
            SECRET,
            LOGIN,
            &p,
            &p.confirmation,
        )
        .unwrap();
    assert!(!stale.status().unwrap().unlocked);
    assert!(stale.load().is_err());
    let mut stale_store = stale.into_recovery_store();
    assert!(matches!(
        stale_store.save(
            1,
            Draft {
                business_name: "stale".into(),
                business_type: "kirana".into(),
                note: "stale write".into()
            }
        ),
        Err(StoreError::Locked)
    ));
}
#[test]
fn wrong_passwords_corruption_truncation_newer_schema_and_unknown_sql_fail_closed() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    let p = d.path().join("backup");
    export(&mut s, &p, SECRET).unwrap();
    assert!(preview(&mut s, &p, "Wrong recovery passphrase!", LOGIN).is_err());
    assert!(preview(&mut s, &p, SECRET, "Wrong login password").is_err());
    let initial = digest(&s.0).unwrap();
    let original = fs::read(&p).unwrap();
    for bytes in [
        Vec::new(),
        original[..4096].to_vec(),
        {
            let mut b = original.clone();
            b.extend_from_slice(b"untrusted trailing bytes");
            b
        },
        {
            let mut b = original.clone();
            let n = b.len() - 128;
            b[n] ^= 42;
            b
        },
    ] {
        fs::write(d.path().join("bad"), bytes).unwrap();
        assert!(preview(&mut s, &d.path().join("bad"), SECRET, LOGIN).is_err());
    }
    let db = Connection::open(&p).unwrap();
    db.pragma_update(None, "key", SECRET).unwrap();
    db.pragma_update(None, "user_version", 999).unwrap();
    drop(db);
    assert!(matches!(
        preview(&mut s, &p, SECRET, LOGIN),
        Err(StoreError::NewerSchema)
    ));
    fs::write(&p, original).unwrap();
    let db = Connection::open(&p).unwrap();
    db.pragma_update(None, "key", SECRET).unwrap();
    db.execute_batch("CREATE TRIGGER hostile AFTER UPDATE ON workspace_access BEGIN DELETE FROM workspace_draft; END;").unwrap();
    drop(db);
    assert!(preview(&mut s, &p, SECRET, LOGIN).is_err());
    assert_eq!(digest(&s.0).unwrap(), initial);
}
#[test]
fn other_business_confirmation_stale_preview_storage_and_native_auth_are_checked() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    let p = d.path().join("backup");
    export(&mut s, &p, SECRET).unwrap();
    let mut other = seeded(&d.path().join("other"));
    assert!(matches!(
        preview(&mut other, &p, SECRET, LOGIN),
        Err(StoreError::BackupBusinessMismatch)
    ));
    let before = digest(&s.0).unwrap();
    assert!(export(&mut s, &p, SECRET).is_err());
    assert!(export(&mut s, &d.path().join("missing/backup"), SECRET).is_err());
    assert_eq!(digest(&s.0).unwrap(), before);
    let v = preview(&mut s, &p, SECRET, LOGIN).unwrap();
    assert!(matches!(
        restore(&mut s, &p, d.path(), SECRET, LOGIN, &v, "YES"),
        Err(StoreError::RecoveryConfirmation)
    ));
    let blocked = d.path().join("not-a-directory");
    fs::write(&blocked, "occupied").unwrap();
    assert!(restore(&mut s, &p, &blocked, SECRET, LOGIN, &v, &v.confirmation).is_err());
    assert_eq!(digest(&s.0).unwrap(), before);
    let mut w = Workspace::new(s);
    assert!(matches!(
        w.export_backup(&d.path().join("denied"), LOGIN, SECRET),
        Err(StoreError::Locked)
    ));
    w.unlock(LOGIN).unwrap();
    assert!(w
        .export_backup(&d.path().join("denied"), "Wrong login password", SECRET)
        .is_err());
    assert!(!w.status().unwrap().unlocked);
}
#[test]
fn snapshot_excludes_uncommitted_sale_and_restore_preserves_original_on_required_write_failure() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut s = seeded(&path);
    let other = Store::open(&path, KEY).unwrap();
    other
        .0
        .execute_batch("BEGIN IMMEDIATE; UPDATE local_products SET stock_milli=1;")
        .unwrap();
    // Snapshot waits for writer, rather than copying a half transaction. Release it asynchronously.
    let t = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        other.0.execute_batch("ROLLBACK").unwrap();
    });
    let p = d.path().join("backup");
    export(&mut s, &p, SECRET).unwrap();
    t.join().unwrap();
    let verified = verified(&p, SECRET, LOGIN).unwrap();
    assert_eq!(
        verified.store.list_products().unwrap()[0].stock_milli,
        10000
    );
    drop(verified);
    let v = preview(&mut s, &p, SECRET, LOGIN).unwrap();
    let before = fingerprint(&s.0).unwrap();
    s.0.pragma_update(None, "query_only", true).unwrap();
    assert!(restore(&mut s, &p, d.path(), SECRET, LOGIN, &v, &v.confirmation).is_err());
    s.0.pragma_update(None, "query_only", false).unwrap();
    assert_eq!(fingerprint(&s.0).unwrap(), before);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 10000);
}
#[test]
fn recovery_audit_is_immutable_and_migration_preserves_old_schema_contents() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("old-bill", 1)).unwrap();
    let p = d.path().join("backup");
    export(&mut s, &p, SECRET).unwrap();
    assert!(s
        .0
        .execute("UPDATE local_recovery_audit SET action='forged'", [])
        .is_err());
    assert!(s.0.execute("DELETE FROM local_recovery_audit", []).is_err());
    fs::remove_file(&p).unwrap();
    legacy_archive(&s, &p, 5);
    let v = preview(&mut s, &p, SECRET, LOGIN).unwrap();
    assert_eq!(v.schema_version, 5);
    restore(&mut s, &p, d.path(), SECRET, LOGIN, &v, &v.confirmation).unwrap();
    assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    assert!(s.cashier_state().unwrap().checkout.is_none());
}

#[test]
#[ignore = "subprocess crash worker only"]
fn crash_worker() {
    let root = std::path::PathBuf::from(std::env::var_os("SORNIO_RECOVERY_TEST_ROOT").unwrap());
    let mut w = Workspace::new(Store::open(&root.join("live"), KEY).unwrap());
    w.unlock(LOGIN).unwrap();
    let mut s = w.into_recovery_store();
    if std::env::var("SORNIO_RECOVERY_CRASH_PHASE").unwrap() == "backup" {
        export(&mut s, &root.join("interrupted.sorniobackup"), SECRET).unwrap();
    } else {
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
    }
    panic!("Worker did not stop at injected boundary");
}
#[test]
fn forced_termination_does_not_publish_partial_backup_or_commit_partial_restore() {
    for phase in ["backup", "restore"] {
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
                "recovery::tests::crash_worker",
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
                "Worker exited before boundary"
            );
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(marker.exists(), "Worker did not reach boundary");
        child.kill().unwrap();
        child.wait().unwrap();
        let mut w = Workspace::new(Store::open(&d.path().join("live"), KEY).unwrap());
        w.unlock(LOGIN).unwrap();
        let mut reopened = w.into_recovery_store();
        assert_eq!(reopened.list_invoices(0).unwrap().len(), 2);
        integrity(&reopened.0).unwrap();
        assert!(!d.path().join("interrupted.sorniobackup").exists());
        if phase == "restore" {
            let p = preview(&mut reopened, &d.path().join("backup"), SECRET, LOGIN).unwrap();
            restore(
                &mut reopened,
                &d.path().join("backup"),
                d.path(),
                SECRET,
                LOGIN,
                &p,
                &p.confirmation,
            )
            .unwrap();
            assert_eq!(reopened.list_invoices(0).unwrap().len(), 1);
        } else {
            export(&mut reopened, &d.path().join("after-crash"), SECRET).unwrap();
            assert_eq!(
                preview(&mut reopened, &d.path().join("after-crash"), SECRET, LOGIN)
                    .unwrap()
                    .invoices,
                2
            );
        }
    }
}

#[test]
fn full_target_database_rolls_restore_back_without_losing_current_data() {
    let d = tempfile::tempdir().unwrap();
    let mut source = seeded(&d.path().join("source"));
    let payload = serde_json::to_string(&Draft {
        business_name: "Archive history".into(),
        business_type: "kirana".into(),
        note: "x".repeat(2000),
    })
    .unwrap();
    for n in 2..150 {
        source
            .0
            .execute(
                "INSERT INTO workspace_history VALUES(?1,?2)",
                params![n, &payload],
            )
            .unwrap();
    }
    let archive = d.path().join("archive");
    export(&mut source, &archive, SECRET).unwrap();
    let mut target = Store::open(&d.path().join("target"), KEY).unwrap();
    let before = fingerprint(&target.0).unwrap();
    let pages: i64 = target
        .0
        .pragma_query_value(None, "page_count", |r| r.get(0))
        .unwrap();
    target
        .0
        .pragma_update(None, "max_page_count", pages)
        .unwrap();
    let p = preview(&mut target, &archive, SECRET, LOGIN).unwrap();
    assert!(restore(
        &mut target,
        &archive,
        d.path(),
        SECRET,
        LOGIN,
        &p,
        &p.confirmation
    )
    .is_err());
    assert_eq!(fingerprint(&target.0).unwrap(), before);
    integrity(&target.0).unwrap();
    let foreign_keys: bool = target
        .0
        .pragma_query_value(None, "foreign_keys", |r| r.get(0))
        .unwrap();
    assert!(foreign_keys);
}

#[test]
fn internal_name_lookalikes_and_manifest_named_triggers_are_not_trusted() {
    let d = tempfile::tempdir().unwrap();
    let mut source = seeded(&d.path().join("source"));
    for (index,sql) in ["CREATE TABLE sqliteXhidden(secret TEXT)","CREATE TRIGGER sornio_backup_manifest AFTER UPDATE ON workspace_access BEGIN DELETE FROM workspace_draft; END;"].iter().enumerate() {
  let p=d.path().join(format!("archive-{index}"));export(&mut source,&p,SECRET).unwrap();
  let db=Connection::open(&p).unwrap();db.pragma_update(None,"key",SECRET).unwrap();db.execute_batch(sql).unwrap();drop(db);
  assert!(preview(&mut source,&p,SECRET,LOGIN).is_err());assert!(source.load().unwrap().draft.is_some());
 }
    let mut legacy = Store::open(&d.path().join("legacy"), KEY).unwrap();
    legacy
        .save(
            0,
            Draft {
                business_name: "Legacy business".into(),
                business_type: "kirana".into(),
                note: "No access configured yet".into(),
            },
        )
        .unwrap();
    let p = d.path().join("ordinary");
    export(&mut source, &p, SECRET).unwrap();
    assert!(matches!(
        preview(&mut legacy, &p, SECRET, LOGIN),
        Err(StoreError::BackupBusinessMismatch)
    ));
}

// Recreate the exact schema accepted by PR #125, rather than relabeling a
// schema-9 store as legacy. Copy only the columns that existed in that format.
fn legacy_archive(source: &Store, path: &Path, version: i64) {
    let db = Connection::open(path).unwrap();
    db.pragma_update(None, "key", SECRET).unwrap();
    db.pragma_update(None, "foreign_keys", false).unwrap();
    let objects: Vec<(String, String, String)> =
        serde_json::from_str(include_str!("../../fixtures/recovery-v6-schema.json")).unwrap();
    for (kind, _, sql) in objects
        .iter()
        .filter(|(k, _, _)| k == "table")
        .chain(objects.iter().filter(|(k, _, _)| k != "table"))
    {
        assert!(kind == "table" || kind == "index" || kind == "trigger");
        db.execute_batch(sql).unwrap();
    }
    // An encrypted ATTACH sees the committed source/WAL using its own key.
    db.execute(
        "ATTACH DATABASE ?1 AS fixture_source KEY ?2",
        params![source.0.path().unwrap(), KEY],
    )
    .unwrap();
    for (_, name, _) in objects.iter().filter(|(kind, _, _)| kind == "table") {
        if version == 5 && matches!(name.as_str(), "local_checkout" | "local_checkout_canceled") {
            db.execute_batch(&format!("DROP TABLE {}", quote(name)))
                .unwrap();
            continue;
        }
        if name == "workspace_access" {
            db.execute("INSERT INTO workspace_access(singleton,password_hash) SELECT 1,password_hash FROM fixture_source.local_principals WHERE role='owner'",[]).unwrap();
            continue;
        }
        let columns: Vec<String> = db
            .prepare(&format!("PRAGMA table_info({})", quote(name)))
            .unwrap()
            .query_map([], |r| r.get(1))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        let names = columns
            .iter()
            .map(|c| quote(c))
            .collect::<Vec<_>>()
            .join(",");
        db.execute_batch(&format!(
            "INSERT INTO {}({names}) SELECT {names} FROM fixture_source.{}",
            quote(name),
            quote(name)
        ))
        .unwrap();
    }
    db.execute_batch("DETACH DATABASE fixture_source").unwrap();
    db.pragma_update(None, "user_version", version).unwrap();
    db.execute_batch(MANIFEST_SQL).unwrap();
    let m = Manifest {
        format: FORMAT,
        schema: version,
        id: random_id().unwrap(),
        created: now().unwrap(),
        digest: digest(&db).unwrap(),
    };
    db.execute(
        "INSERT INTO sornio_backup_manifest VALUES(1,?1)",
        [serde_json::to_string(&m).unwrap()],
    )
    .unwrap();
}

#[test]
fn legacy_v6_archive_preserves_business_identity_and_migrates_individual_owner() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live"));
    s.post_invoice(sale("legacy-v6-sale", 1)).unwrap();
    let id = crate::identity::scope(&s.0).unwrap().business_id;
    let p = d.path().join("v6");
    legacy_archive(&s, &p, 6);
    let v = preview(&mut s, &p, SECRET, LOGIN).unwrap();
    assert_eq!(v.schema_version, 6);
    assert_eq!(v.business_id, id);
    restore(&mut s, &p, d.path(), SECRET, LOGIN, &v, &v.confirmation).unwrap();
    let mut w = Workspace::new(s);
    w.login("owner", LOGIN).unwrap();
    assert_eq!(w.local_session().unwrap().scope.business_id, id);
    assert_eq!(w.list_invoices(0).unwrap().len(), 1);
}

#[test]
fn owner_only_backup_preserves_customer_payments_and_revokes_staff_sessions() {
    use crate::customers::SaveCustomer;
    use crate::identity::{Permission, Role, StaffDetails};
    use crate::payments::{Action, PaymentPart, Request};
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut w = Workspace::new(seeded(&path));
    w.unlock(LOGIN).unwrap();
    w.create_staff(
        StaffDetails {
            username: "cashier".into(),
            display_name: "Cashier".into(),
            role: Role::Cashier,
        },
        "Cashier password 2026",
    )
    .unwrap();
    w.save_customer(SaveCustomer {
        operation_id: "customer-op".into(),
        id: "customer".into(),
        name: "Test customer".into(),
        phone: None,
        credit_limit_paise: None,
        credit_days: 0,
        expected_revision: None,
    })
    .unwrap();
    let mut invoice = sale("retail-sale", 1);
    invoice.tax_basis_points = 0;
    invoice.lines[0].quantity_milli = 1000;
    invoice.tender = Tender::Retail;
    let request = Request {
        operation_id: "retail-sale".into(),
        action: Action::Sale {
            invoice,
            payments: vec![PaymentPart {
                id: "payment".into(),
                method: "cash".into(),
                amount_paise: 4250,
                reference: String::new(),
            }],
        },
    };
    w.prepare_retail(request.clone()).unwrap();
    w.post_retail(request.clone()).unwrap();
    w.clear_retail("retail-sale", true).unwrap();
    let archive = d.path().join("archive");
    w.export_backup(&archive, LOGIN, SECRET).unwrap();
    let mut cashier = Workspace::new(Store::open(&path, KEY).unwrap());
    cashier.login("cashier", "Cashier password 2026").unwrap();
    assert!(matches!(
        cashier.export_backup(&d.path().join("denied"), LOGIN, SECRET),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        cashier.preview_backup(&archive, LOGIN, SECRET, LOGIN),
        Err(StoreError::Forbidden)
    ));
    let p = w.preview_backup(&archive, LOGIN, SECRET, LOGIN).unwrap();
    w.restore_backup(
        &archive,
        d.path(),
        LOGIN,
        SECRET,
        LOGIN,
        &p,
        &p.confirmation,
    )
    .unwrap();
    assert!(matches!(
        cashier.require(Permission::View),
        Err(StoreError::Locked)
    ));
    w.unlock(LOGIN).unwrap();
    assert!(w
        .list_staff()
        .unwrap()
        .iter()
        .filter(|p| p.role != Role::Owner)
        .all(|p| !p.enabled));
    assert!(cashier.login("cashier", "Cashier password 2026").is_err());
    assert_eq!(w.find_customers("Test customer", false).unwrap().len(), 1);
    assert_eq!(w.list_invoices(0).unwrap().len(), 1);
    let store = w.into_recovery_store();
    assert_eq!(count(&store.0, "local_retail_payments"), 1);
    assert_eq!(count(&store.0, "local_retail_journal"), 2);
}

#[test]
fn all_non_owner_roles_and_expired_or_revoked_owners_cannot_start_recovery() {
    use crate::identity::{Role, StaffDetails};
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut w = Workspace::new(seeded(&path));
    w.unlock(LOGIN).unwrap();
    let archive = d.path().join("backup");
    w.export_backup(&archive, LOGIN, SECRET).unwrap();
    for (name, role) in [
        ("cashier", Role::Cashier),
        ("assistant", Role::AssistantManager),
        ("manager", Role::Manager),
    ] {
        w.create_staff(
            StaffDetails {
                username: name.into(),
                display_name: name.into(),
                role,
            },
            LOGIN,
        )
        .unwrap();
        let mut staff = Workspace::new(Store::open(&path, KEY).unwrap());
        staff.login(name, LOGIN).unwrap();
        assert!(matches!(
            staff.export_backup(&d.path().join(name), LOGIN, SECRET),
            Err(StoreError::Forbidden)
        ));
        assert!(matches!(
            staff.preview_backup(&archive, LOGIN, SECRET, LOGIN),
            Err(StoreError::Forbidden)
        ));
        let p = w.preview_backup(&archive, LOGIN, SECRET, LOGIN).unwrap();
        assert!(matches!(
            staff.restore_backup(
                &archive,
                d.path(),
                LOGIN,
                SECRET,
                LOGIN,
                &p,
                &p.confirmation
            ),
            Err(StoreError::Forbidden)
        ));
        assert!(!d.path().join(name).exists());
    }
    let mut stale = Workspace::new(Store::open(&path, KEY).unwrap());
    stale.unlock(LOGIN).unwrap();
    w.change_password(LOGIN, "Replacement Owner password 2026!")
        .unwrap();
    assert!(matches!(
        stale.export_backup(&d.path().join("stale"), LOGIN, SECRET),
        Err(StoreError::Locked)
    ));
}

#[test]
fn recovery_migration_preserves_schema_ten_financial_rows_and_rolls_back_on_error() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut s = seeded(&path);
    s.post_invoice(sale("migration-sale", 1)).unwrap();
    let invoices = s.list_invoices(0).unwrap();
    let products = s.list_products().unwrap();
    crate::lan_authority::remove_fixture_tables(&s.0);
    s.0.execute_batch("DROP TABLE local_recovery_audit; DROP TABLE local_recovery_identity; PRAGMA user_version=10;").unwrap();
    drop(s);
    let migrated = Store::open(&path, KEY).unwrap();
    assert_eq!(
        serde_json::to_value(migrated.list_invoices(0).unwrap()).unwrap(),
        serde_json::to_value(invoices).unwrap()
    );
    assert_eq!(migrated.list_products().unwrap(), products);
    assert_eq!(
        migrated
            .0
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        SCHEMA_VERSION
    );
    assert_eq!(generation(&migrated.0).unwrap().len(), 64);
    drop(migrated);
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "key", KEY).unwrap();
    db.execute_batch("DROP TABLE local_recovery_audit; DROP TABLE local_recovery_identity; CREATE TABLE local_recovery_identity(incorrect TEXT); PRAGMA user_version=10;").unwrap();
    drop(db);
    assert!(Store::open(&path, KEY).is_err());
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "key", KEY).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        10
    );
    assert_eq!(count(&db, "local_invoices"), 1);
    assert!(!db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='local_recovery_audit')",
            [],
            |r| r.get::<_, bool>(0)
        )
        .unwrap());
}

#[test]
fn recovery_refuses_ignored_audit_writes_and_substituted_archives_without_losing_live_data() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut s = seeded(&path);
    let archive = d.path().join("archive");
    for action in ["IGNORE", "ABORT,'synthetic failure'"] {
        let before = digest(&s.0).unwrap();
        s.0.execute_batch(&format!("CREATE TRIGGER fault_recovery BEFORE INSERT ON local_recovery_audit BEGIN SELECT RAISE({action}); END;")).unwrap();
        assert!(export(&mut s, &archive, SECRET).is_err());
        assert!(!archive.exists());
        s.0.execute_batch("DROP TRIGGER fault_recovery").unwrap();
        assert_eq!(digest(&s.0).unwrap(), before);
    }
    export(&mut s, &archive, SECRET).unwrap();
    let expected = preview(&mut s, &archive, SECRET, LOGIN).unwrap();
    let replacement = d.path().join("replacement");
    export(&mut s, &replacement, SECRET).unwrap();
    fs::copy(&replacement, &archive).unwrap();
    let before = fingerprint(&s.0).unwrap();
    assert!(matches!(
        restore(
            &mut s,
            &archive,
            d.path(),
            SECRET,
            LOGIN,
            &expected,
            &expected.confirmation
        ),
        Err(StoreError::RecoveryChanged)
    ));
    assert_eq!(fingerprint(&s.0).unwrap(), before);
}

#[test]
fn integrated_recovery_preserves_credit_split_upi_returns_closing_and_every_financial_table() {
    use crate::customers::{CreditKind, CreditRequest, SaveCustomer};
    use crate::payments::{Action, PaymentPart, Request, ReturnLine};
    use rusqlite::types::Value;
    fn perform(w: &mut Workspace, r: Request) {
        w.prepare_retail(r.clone()).unwrap();
        w.post_retail(r.clone()).unwrap();
        w.clear_retail(&r.operation_id, true).unwrap();
    }
    fn rows(db: &Connection) -> std::collections::BTreeMap<String, Vec<Vec<Value>>> {
        let mut result = std::collections::BTreeMap::new();
        for (kind, name, _) in schema(db).unwrap() {
            if kind != "table"
                || [
                    "local_recovery_identity",
                    "local_recovery_audit",
                    "local_identity_audit",
                    "local_principals",
                    "workspace_access",
                ]
                .contains(&name.as_str())
            {
                continue;
            }
            let mut stmt = db
                .prepare(&format!("SELECT * FROM {} ORDER BY rowid", quote(&name)))
                .unwrap();
            let columns = stmt.column_count();
            let values = stmt
                .query_map([], |r| {
                    (0..columns)
                        .map(|i| r.get(i))
                        .collect::<Result<Vec<Value>, _>>()
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            result.insert(name, values);
        }
        result
    }
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("live");
    let mut w = Workspace::new(seeded(&path));
    w.unlock(LOGIN).unwrap();
    w.save_customer(SaveCustomer {
        operation_id: "new-customer".into(),
        id: "customer".into(),
        name: "Synthetic customer".into(),
        phone: None,
        credit_limit_paise: Some(10000),
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
    let collected = w.post_credit(collect.clone()).unwrap();
    w.clear_credit("cash-collection", true).unwrap();
    let mut invoice = sale("split-sale", 2);
    invoice.tax_basis_points = 0;
    invoice.lines[0].quantity_milli = 1000;
    invoice.tender = Tender::Retail;
    perform(
        &mut w,
        Request {
            operation_id: "split-sale".into(),
            action: Action::Sale {
                invoice,
                payments: vec![
                    PaymentPart {
                        id: "cash-part".into(),
                        method: "cash".into(),
                        amount_paise: 1250,
                        reference: String::new(),
                    },
                    PaymentPart {
                        id: "upi-part".into(),
                        method: "upi".into(),
                        amount_paise: 3000,
                        reference: String::new(),
                    },
                ],
            },
        },
    );
    let lines = vec![ReturnLine {
        line_index: 0,
        quantity_milli: 500,
    }];
    let q = w.quote_retail_return("split-sale", &lines).unwrap();
    perform(
        &mut w,
        Request {
            operation_id: "partial-return".into(),
            action: Action::Return {
                invoice_id: "split-sale".into(),
                expected_revision: q.revision,
                lines,
                refunds: q.suggested_refunds,
                reason: "Synthetic returned goods".into(),
            },
        },
    );
    let mut s = w.into_recovery_store();
    let day: String =
        s.0.query_row("SELECT date('now','+5 hours','+30 minutes')", [], |r| {
            r.get(0)
        })
        .unwrap();
    let mut w = Workspace::new(s);
    w.unlock(LOGIN).unwrap();
    let view = w.retail_view(&day, "owner", None).unwrap();
    perform(
        &mut w,
        Request {
            operation_id: "closing".into(),
            action: Action::Close {
                day: day.clone(),
                username: "owner".into(),
                through: view.summary.through,
                counted_paise: view.summary.expected_cash_paise.parse().unwrap(),
            },
        },
    );
    s = w.into_recovery_store();
    let expected = rows(&s.0);
    let archive = d.path().join("integrated-backup");
    export(&mut s, &archive, SECRET).unwrap();
    let mut changed = s.load().unwrap().draft.unwrap();
    changed.note = "Saved after backup".into();
    s.save(1, changed).unwrap();
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
    assert_eq!(rows(&s.0),expected,"Every customer, inventory, invoice, settlement, pending-intent, journal and outbox row must survive");
    let mut w = Workspace::new(s);
    w.unlock(LOGIN).unwrap();
    assert_eq!(w.post_credit(collect).unwrap(), collected);
    let view = w.retail_view(&day, "owner", Some("split-sale")).unwrap();
    assert!(view.payments.iter().all(|p| !p.externally_verified));
    assert_eq!(w.pending_inventory().unwrap().unwrap().operation_id, "rice");
}

#[test]
fn restored_copy_does_not_revoke_an_independent_original_or_merge_operation_histories() {
    let d = tempfile::tempdir().unwrap();
    let mut original = seeded(&d.path().join("original.db"));
    let archive = d.path().join("backup");
    export(&mut original, &archive, SECRET).unwrap();
    let original_generation = generation(&original.0).unwrap();
    let mut copy = Workspace::new(Store::open(&d.path().join("copy.db"), KEY).unwrap());
    let preview = copy.preview_backup(&archive, "", SECRET, LOGIN).unwrap();
    copy.restore_backup(
        &archive,
        d.path(),
        "",
        SECRET,
        LOGIN,
        &preview,
        &preview.confirmation,
    )
    .unwrap();
    copy.unlock(LOGIN).unwrap();
    let request = sale("same-id-on-independent-copies", 1);
    let original_receipt = original.post_invoice(request.clone()).unwrap();
    let mut conflicting = request.clone();
    conflicting.lines[0].quantity_milli = 2500;
    let copy_receipt = copy.post_invoice(conflicting).unwrap();
    assert_eq!(original_receipt.id, copy_receipt.id);
    assert_ne!(original_receipt.total_paise, copy_receipt.total_paise);
    assert_eq!(original.post_invoice(request).unwrap(), original_receipt);
    assert_eq!(generation(&original.0).unwrap(), original_generation);
    assert_ne!(
        generation(&copy.into_recovery_store().0).unwrap(),
        original_generation
    );
    // This passing test demonstrates a limitation, NOT distributed exactly-once:
    // separate files remain separate authorities until the LAN fencing protocol exists.
}

#[test]
fn duplicate_restore_with_old_preview_cannot_replace_the_workspace_twice() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seeded(&d.path().join("live.db"));
    let archive = d.path().join("backup");
    export(&mut s, &archive, SECRET).unwrap();
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
    let mut w = Workspace::new(s);
    w.unlock(LOGIN).unwrap();
    let mut s = w.into_recovery_store();
    let before = digest(&s.0).unwrap();
    let epoch = generation(&s.0).unwrap();
    assert!(matches!(
        restore(
            &mut s,
            &archive,
            d.path(),
            SECRET,
            LOGIN,
            &p,
            &p.confirmation
        ),
        Err(StoreError::RecoveryChanged)
    ));
    assert_eq!(digest(&s.0).unwrap(), before);
    assert_eq!(generation(&s.0).unwrap(), epoch);
}
