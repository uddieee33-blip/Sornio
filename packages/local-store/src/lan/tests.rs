use super::*;
use crate::{
    access::Workspace,
    billing::{BillLine, Tender},
    catalog::AddProduct,
    Draft,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Barrier, Mutex,
};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Shop hub test password!";
fn workspace(path: &std::path::Path) -> Workspace {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.setup(PASSWORD).unwrap();
    w
}
fn hub(path: &std::path::Path) -> Arc<Mutex<Workspace>> {
    let mut w = workspace(path);
    w.save(
        0,
        Draft {
            business_name: "One physical shop".into(),
            business_type: "kirana".into(),
            note: "Hub private note".into(),
        },
    )
    .unwrap();
    w.add_product(AddProduct {
        operation_id: "item".into(),
        name: "Last rice pack".into(),
        sku: "RICE".into(),
        unit: "pcs".into(),
        unit_price_paise: 1063,
        opening_stock_milli: 1000,
    })
    .unwrap();
    w.designate_hub(PASSWORD, "127.0.0.1:0").unwrap();
    Arc::new(Mutex::new(w))
}
fn start(hub: Arc<Mutex<Workspace>>, lose: Arc<AtomicBool>) -> transport::HubServer {
    let (_, config) = hub.lock().unwrap().lan_listener_config().unwrap().unwrap();
    transport::HubServer::bind(
        "127.0.0.1:0",
        config,
        Arc::new(move |peer, request| {
            let is_post = matches!(request.command, Command::Post { .. });
            let response = hub.lock().unwrap().handle_lan_peer(peer, request).ok();
            if is_post && lose.swap(false, Ordering::SeqCst) {
                None
            } else {
                response
            }
        }),
    )
    .unwrap()
}
fn pair(
    hub: &Arc<Mutex<Workspace>>,
    path: &std::path::Path,
    role: Role,
    address: SocketAddr,
) -> Workspace {
    let mut w = workspace(path);
    let request = w.create_pair_request(PASSWORD, "Shop computer").unwrap();
    let approval = hub
        .lock()
        .unwrap()
        .approve_device(PASSWORD, request, role)
        .unwrap();
    let hash = approval.root_fingerprint();
    w.join_hub(PASSWORD, approval, &address.to_string(), &hash)
        .unwrap();
    w
}
fn sale(id: &str) -> PostInvoice {
    PostInvoice {
        operation_id: id.into(),
        lines: vec![BillLine {
            product_id: "item".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    }
}
fn count(w: &Workspace, table: &str) -> i64 {
    w.store
        .0
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}
#[test]
fn two_mutual_tls_clients_cannot_oversell_and_share_one_native_commit_order() {
    let d = tempfile::tempdir().unwrap();
    let hub = hub(&d.path().join("hub"));
    let server = start(hub.clone(), Arc::new(AtomicBool::new(false)));
    let mut a = pair(&hub, &d.path().join("a"), Role::Cashier, server.address());
    let mut b = pair(&hub, &d.path().join("b"), Role::Manager, server.address());
    assert_eq!(a.cashier_state().unwrap().products[0].stock_milli, 1000);
    assert_eq!(b.cashier_state().unwrap().products[0].stock_milli, 1000);
    a.prepare_checkout(sale("client-a-sale")).unwrap();
    b.prepare_checkout(sale("client-b-sale")).unwrap();
    let barrier = Arc::new(Barrier::new(3));
    let other = barrier.clone();
    let ta = std::thread::spawn(move || {
        other.wait();
        let result = a.post_prepared_invoice(sale("client-a-sale"));
        (a, result)
    });
    let other = barrier.clone();
    let tb = std::thread::spawn(move || {
        other.wait();
        let result = b.post_prepared_invoice(sale("client-b-sale"));
        (b, result)
    });
    barrier.wait();
    let (mut a, ra) = ta.join().unwrap();
    let (mut b, rb) = tb.join().unwrap();
    assert_ne!(ra.is_ok(), rb.is_ok());
    let h = hub.lock().unwrap();
    assert_eq!(h.store.list_products().unwrap()[0].stock_milli, 0);
    assert_eq!(count(&h, "local_invoices"), 1);
    assert_eq!(count(&h, "local_billing_outbox"), 1);
    assert_eq!(count(&h, "lan_operations"), 2);
    let sum: i64 = h
        .store
        .0
        .query_row(
            "SELECT sum(amount_paise) FROM local_billing_ledger",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sum, 0);
    drop(h);
    assert_eq!(a.cashier_state().unwrap().products[0].stock_milli, 0);
    assert_eq!(b.cashier_state().unwrap().products[0].stock_milli, 0);
    assert_eq!(count(&a, "local_invoices"), 0);
    assert_eq!(count(&b, "local_invoices"), 0);
    assert!(matches!(a.list_invoices(0), Err(StoreError::LanDenied)));
    assert_eq!(b.list_invoices(0).unwrap().len(), 1);
}
#[test]
fn lost_reply_restart_exact_retry_and_outbox_replay_never_duplicate_invoice() {
    let d = tempfile::tempdir().unwrap();
    let hub = hub(&d.path().join("hub"));
    let lose = Arc::new(AtomicBool::new(true));
    let server = start(hub.clone(), lose);
    let path = d.path().join("cashier");
    let mut a = pair(&hub, &path, Role::Cashier, server.address());
    let request = sale("lost-reply-operation");
    a.prepare_checkout(request.clone()).unwrap();
    assert!(matches!(
        a.post_prepared_invoice(request.clone()),
        Err(StoreError::LanUncertain)
    ));
    assert_eq!(count(&hub.lock().unwrap(), "local_invoices"), 1);
    drop(a);
    let mut a = Workspace::new(Store::open(&path, KEY).unwrap());
    assert!(a.cashier_state().is_err());
    a.unlock(PASSWORD).unwrap();
    let state = a.cashier_state().unwrap();
    assert_eq!(
        state.checkout.unwrap().invoice.unwrap().id,
        request.operation_id
    );
    let invoice = a.post_prepared_invoice(request.clone()).unwrap();
    assert_eq!(invoice.total_paise, 1063);
    a.clear_checkout(&request.operation_id, true).unwrap();
    a.clear_checkout(&request.operation_id, true).unwrap();
    assert!(a.prepare_checkout(request).is_err());
    assert_eq!(count(&hub.lock().unwrap(), "local_invoices"), 1);
    assert_eq!(count(&a, "lan_client_events"), 1);
    assert_eq!(count(&a, "local_billing_ledger"), 0);
}
#[test]
fn disconnect_pending_cancel_reconnect_and_hub_restart_preserve_uncertainty() {
    let d = tempfile::tempdir().unwrap();
    let hub_path = d.path().join("hub");
    let h = hub(&hub_path);
    let server = start(h.clone(), Arc::new(AtomicBool::new(false)));
    let mut a = pair(&h, &d.path().join("a"), Role::Cashier, server.address());
    a.cashier_state().unwrap();
    drop(server);
    let request = sale("offline-queued");
    a.prepare_checkout(request.clone()).unwrap();
    assert!(matches!(
        a.post_prepared_invoice(request.clone()),
        Err(StoreError::LanUncertain)
    ));
    assert!(matches!(
        a.clear_checkout(&request.operation_id, false),
        Err(StoreError::LanUncertain)
    ));
    let state = a.cashier_state().unwrap();
    assert!(!state.lan.unwrap().online);
    assert!(state.checkout.unwrap().invoice.is_none());
    assert_eq!(count(&h.lock().unwrap(), "local_invoices"), 0);
    // Reopen the hub database/keys and start a new real listener, preserving trust and queues.
    drop(h);
    let reopened = Arc::new(Mutex::new(Workspace::new(
        Store::open(&hub_path, KEY).unwrap(),
    )));
    let server = start(reopened.clone(), Arc::new(AtomicBool::new(false)));
    a.change_hub_address(PASSWORD, &server.address().to_string())
        .unwrap();
    let receipt = a.post_prepared_invoice(request.clone()).unwrap();
    assert_eq!(receipt.id, request.operation_id);
    assert!(a.clear_checkout(&request.operation_id, false).is_err());
    a.clear_checkout(&request.operation_id, true).unwrap();
    assert_eq!(count(&reopened.lock().unwrap(), "local_invoices"), 1);
    a.prepare_checkout(sale("never-sent")).unwrap();
    a.clear_checkout("never-sent", false).unwrap();
    assert!(a.prepare_checkout(sale("never-sent")).is_err());
}
#[test]
fn device_revocation_role_denial_wrong_shop_and_device_spoofing_fail_closed() {
    let d = tempfile::tempdir().unwrap();
    let h = hub(&d.path().join("hub"));
    let server = start(h.clone(), Arc::new(AtomicBool::new(false)));
    let mut a = pair(&h, &d.path().join("a"), Role::Cashier, server.address());
    let mut b = pair(&h, &d.path().join("b"), Role::Owner, server.address());
    assert!(a.list_invoices(0).is_err());
    assert!(b.list_invoices(0).is_ok());
    let settings_a = settings(&a.store.0).unwrap().unwrap();
    let settings_b = settings(&b.store.0).unwrap().unwrap();
    let mut wrong = settings(&a.store.0).unwrap().unwrap();
    wrong.business_id = random_id().unwrap();
    assert!(transport::exchange(&wrong, Command::Sync { after: 0 }).is_err());
    wrong.business_id = settings_a.business_id.clone();
    wrong.device_id = settings_b.device_id.clone();
    assert!(transport::exchange(&wrong, Command::Sync { after: 0 }).is_err());
    h.lock()
        .unwrap()
        .change_lan_device(PASSWORD, &settings_a.device_id, Role::Cashier, false, 1)
        .unwrap();
    assert!(a.cashier_state().is_err());
    a.prepare_checkout(sale("revoked-attempt")).unwrap();
    assert!(a.post_prepared_invoice(sale("revoked-attempt")).is_err());
    assert_eq!(count(&h.lock().unwrap(), "local_invoices"), 0);
    let other = hub(&d.path().join("other-hub"));
    let other_server = start(other, Arc::new(AtomicBool::new(false)));
    a.change_hub_address(PASSWORD, &other_server.address().to_string())
        .unwrap();
    assert!(!a.cashier_state().unwrap().lan.unwrap().online);
    assert!(a
        .add_product(AddProduct {
            operation_id: "fork".into(),
            name: "fork".into(),
            sku: "".into(),
            unit: "pcs".into(),
            unit_price_paise: 100,
            opening_stock_milli: 1000
        })
        .is_err());
    assert!(a.post_invoice(sale("local-fork")).is_err());
}
#[test]
fn pairing_requires_fresh_password_existing_data_is_preserved_and_fingerprint_is_native() {
    let d = tempfile::tempdir().unwrap();
    let h = hub(&d.path().join("hub"));
    let mut a = workspace(&d.path().join("a"));
    assert!(a.create_pair_request("Wrong password", "Till").is_err());
    a.unlock(PASSWORD).unwrap();
    let request = a.create_pair_request(PASSWORD, "Till").unwrap();
    let again = a.create_pair_request(PASSWORD, "Till").unwrap();
    assert_eq!(request.csr, again.csr);
    let approval = h
        .lock()
        .unwrap()
        .approve_device(PASSWORD, request.clone(), Role::Cashier)
        .unwrap();
    let again = h
        .lock()
        .unwrap()
        .approve_device(PASSWORD, request, Role::Cashier)
        .unwrap();
    assert_eq!(approval.certificate, again.certificate);
    assert!(a
        .join_hub(
            PASSWORD,
            approval.clone(),
            "127.0.0.1:45433",
            &"0".repeat(64)
        )
        .is_err());
    let hash = approval.root_fingerprint();
    a.join_hub(PASSWORD, approval, "127.0.0.1:45433", &hash)
        .unwrap();
    assert!(a.designate_hub(PASSWORD, "127.0.0.1:45433").is_err());
    let mut local = workspace(&d.path().join("local"));
    local
        .add_product(AddProduct {
            operation_id: "local".into(),
            name: "Existing stock".into(),
            sku: "".into(),
            unit: "pcs".into(),
            unit_price_paise: 100,
            opening_stock_milli: 1000,
        })
        .unwrap();
    assert!(local.create_pair_request(PASSWORD, "Till").is_err());
    assert_eq!(local.list_products().unwrap().len(), 1);
    for ip in [
        "0.0.0.0:45433",
        "8.8.8.8:45433",
        "example.com:45433",
        "127.0.0.1:80",
    ] {
        assert!(local_address(ip).is_err());
    }
}
#[test]
fn failed_hub_required_audit_or_outbox_rolls_back_stock_invoice_and_dedup_receipt() {
    for table in ["lan_audit", "lan_operations", "local_billing_outbox"] {
        let d = tempfile::tempdir().unwrap();
        let h = hub(&d.path().join("hub"));
        let server = start(h.clone(), Arc::new(AtomicBool::new(false)));
        let mut a = pair(&h, &d.path().join("a"), Role::Cashier, server.address());
        h.lock().unwrap().store.0.execute_batch(&format!("CREATE TRIGGER injected_fail BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'failure');END;")).unwrap();
        a.prepare_checkout(sale("atomic-request")).unwrap();
        assert!(a.post_prepared_invoice(sale("atomic-request")).is_err());
        let hub = h.lock().unwrap();
        assert_eq!(count(&hub, "local_invoices"), 0);
        assert_eq!(count(&hub, "lan_operations"), 0);
        assert_eq!(hub.store.list_products().unwrap()[0].stock_milli, 1000);
        hub.store
            .0
            .execute_batch("DROP TRIGGER injected_fail;")
            .unwrap();
        drop(hub);
        a.post_prepared_invoice(sale("atomic-request")).unwrap();
        assert_eq!(count(&h.lock().unwrap(), "local_invoices"), 1);
    }
}
#[test]
fn local_receipt_write_failure_recovers_from_hub_outbox_without_reposting() {
    let d = tempfile::tempdir().unwrap();
    let h = hub(&d.path().join("hub"));
    let server = start(h.clone(), Arc::new(AtomicBool::new(false)));
    let mut a = pair(&h, &d.path().join("a"), Role::Cashier, server.address());
    let request = sale("local-write-failure");
    a.prepare_checkout(request.clone()).unwrap();
    a.store.0.execute_batch("CREATE TRIGGER fail_receipt BEFORE UPDATE OF outcome ON lan_client_queue BEGIN SELECT RAISE(ABORT,'disk failure');END;").unwrap();
    assert!(matches!(
        a.post_prepared_invoice(request.clone()),
        Err(StoreError::LanUncertain)
    ));
    assert_eq!(count(&h.lock().unwrap(), "local_invoices"), 1);
    a.store
        .0
        .execute_batch("DROP TRIGGER fail_receipt;")
        .unwrap();
    let state = a.cashier_state().unwrap();
    assert_eq!(
        state.checkout.unwrap().invoice.unwrap().id,
        request.operation_id
    );
    a.post_prepared_invoice(request).unwrap();
    assert_eq!(count(&h.lock().unwrap(), "local_invoices"), 1);
}
#[test]
fn operation_ids_cannot_cross_devices_change_requests_or_bypass_cancellation() {
    let d = tempfile::tempdir().unwrap();
    let h = hub(&d.path().join("hub"));
    let server = start(h.clone(), Arc::new(AtomicBool::new(false)));
    let mut a = pair(&h, &d.path().join("a"), Role::Cashier, server.address());
    let mut b = pair(&h, &d.path().join("b"), Role::Manager, server.address());
    let request = sale("one-global-operation");
    a.prepare_checkout(request.clone()).unwrap();
    a.post_prepared_invoice(request.clone()).unwrap();
    let s = settings(&a.store.0).unwrap().unwrap();
    let mut changed = request.clone();
    changed.tax_basis_points = 500;
    assert!(matches!(
        transport::exchange(&s, Command::Post { request: changed }),
        Err(StoreError::LanDenied)
    ));
    b.prepare_checkout(request.clone()).unwrap();
    assert!(b.post_prepared_invoice(request.clone()).is_err());
    let state = b.cashier_state().unwrap();
    assert!(
        state.checkout.unwrap().invoice.is_none(),
        "Manager event feed claimed another device's receipt"
    );
    let s = settings(&b.store.0).unwrap().unwrap();
    let cancel = sale("cancel-on-hub");
    assert!(matches!(
        transport::exchange(
            &s,
            Command::Cancel {
                request: cancel.clone()
            }
        )
        .unwrap(),
        Response::Outcome {
            outcome: Outcome::Canceled,
            ..
        }
    ));
    assert!(matches!(
        transport::exchange(&s, Command::Post { request: cancel }).unwrap(),
        Response::Outcome {
            outcome: Outcome::Canceled,
            ..
        }
    ));
    assert!(h
        .lock()
        .unwrap()
        .post_invoice(sale("cancel-on-hub"))
        .is_err());
    assert_eq!(count(&h.lock().unwrap(), "local_invoices"), 1);
}
#[test]
#[ignore = "subprocess-only hub worker"]
fn hub_process_worker() {
    let path = std::path::PathBuf::from(std::env::var_os("SORNIO_LAN_HUB_DB").unwrap());
    let h = Arc::new(Mutex::new(Workspace::new(Store::open(&path, KEY).unwrap())));
    let (_, config) = h.lock().unwrap().lan_listener_config().unwrap().unwrap();
    let server = transport::HubServer::bind(
        "127.0.0.1:0",
        config,
        Arc::new(move |peer, request| {
            let post = matches!(request.command, Command::Post { .. });
            let reply = h.lock().unwrap().handle_lan_peer(peer, request).ok();
            if post {
                halt_test_boundary("after_commit");
            }
            reply
        }),
    )
    .unwrap();
    let address = std::path::PathBuf::from(std::env::var_os("SORNIO_LAN_ADDRESS").unwrap());
    let pending_address = address.with_extension("pending");
    std::fs::write(&pending_address, server.address().to_string()).unwrap();
    std::fs::rename(pending_address, address).unwrap();
    loop {
        std::thread::park();
    }
}
struct Child(std::process::Child);
impl Drop for Child {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn process_hub(root: &std::path::Path, phase: &str) -> (Child, SocketAddr) {
    let address = root.join(format!("address-{phase}"));
    let _ = std::fs::remove_file(&address);
    let marker = root.join("boundary");
    let _ = std::fs::remove_file(&marker);
    let mut child = Child(
        std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "lan::tests::hub_process_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("SORNIO_LAN_HUB_DB", root.join("hub"))
            .env("SORNIO_LAN_ADDRESS", &address)
            .env("SORNIO_LAN_HALT", phase)
            .env("SORNIO_LAN_MARKER", &marker)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap(),
    );
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    while !address.exists() && std::time::Instant::now() < deadline {
        assert!(
            child.0.try_wait().unwrap().is_none(),
            "Hub exited before listening"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    let text = std::fs::read_to_string(address).unwrap();
    (child, text.parse().unwrap())
}
#[test]
fn forced_hub_termination_before_and_after_commit_resolves_the_same_durable_request() {
    for phase in ["before_commit", "after_commit"] {
        let d = tempfile::tempdir().unwrap();
        let h = hub(&d.path().join("hub"));
        let (child, address) = process_hub(d.path(), phase);
        let path = d.path().join("cashier");
        let mut a = pair(&h, &path, Role::Cashier, address);
        let request = sale("kill-boundary-sale");
        a.prepare_checkout(request.clone()).unwrap();
        drop(h);
        let worker = std::thread::spawn(move || {
            let r = a.post_prepared_invoice(request);
            (a, r)
        });
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while !d.path().join("boundary").exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(
            d.path().join("boundary").exists(),
            "Hub did not reach kill boundary"
        );
        drop(child);
        let (a, result) = worker.join().unwrap();
        assert!(matches!(result, Err(StoreError::LanUncertain)));
        drop(a);
        let check = Workspace::new(Store::open(&d.path().join("hub"), KEY).unwrap());
        assert_eq!(
            count(&check, "local_invoices"),
            if phase == "after_commit" { 1 } else { 0 }
        );
        assert_eq!(
            count(&check, "lan_operations"),
            if phase == "after_commit" { 1 } else { 0 }
        );
        drop(check);
        let (_child, address) = process_hub(d.path(), "normal");
        let mut a = Workspace::new(Store::open(&path, KEY).unwrap());
        a.unlock(PASSWORD).unwrap();
        a.change_hub_address(PASSWORD, &address.to_string())
            .unwrap();
        let receipt = a.post_prepared_invoice(sale("kill-boundary-sale")).unwrap();
        assert_eq!(receipt.total_paise, 1063);
        let check = Workspace::new(Store::open(&d.path().join("hub"), KEY).unwrap());
        assert_eq!(count(&check, "local_invoices"), 1);
        assert_eq!(count(&check, "local_billing_outbox"), 1);
        assert_eq!(check.store.list_products().unwrap()[0].stock_milli, 0);
    }
}

#[test]
fn approval_cannot_substitute_another_computers_certificate() {
    let d = tempfile::tempdir().unwrap();
    let h = hub(&d.path().join("hub"));
    let mut a = workspace(&d.path().join("a"));
    let mut b = workspace(&d.path().join("b"));
    let ra = a.create_pair_request(PASSWORD, "A").unwrap();
    let rb = b.create_pair_request(PASSWORD, "B").unwrap();
    let aa = h
        .lock()
        .unwrap()
        .approve_device(PASSWORD, ra, Role::Cashier)
        .unwrap();
    let ab = h
        .lock()
        .unwrap()
        .approve_device(PASSWORD, rb, Role::Owner)
        .unwrap();
    let mut substituted = aa.clone();
    substituted.certificate = ab.certificate.clone();
    let fp = aa.root_fingerprint();
    assert!(a
        .join_hub(PASSWORD, substituted, "127.0.0.1:45433", &fp)
        .is_err());
    a.join_hub(PASSWORD, aa, "127.0.0.1:45433", &fp).unwrap();
    assert!(a
        .store
        .add_product(AddProduct {
            operation_id: "raw-fork".into(),
            name: "forbidden local".into(),
            sku: "".into(),
            unit: "pcs".into(),
            unit_price_paise: 100,
            opening_stock_milli: 1000
        })
        .is_err());
    assert!(a.store.prepare_checkout(sale("raw-prepare-fork")).is_err());
    assert!(a.store.post_invoice(sale("raw-post-fork")).is_err());
}
