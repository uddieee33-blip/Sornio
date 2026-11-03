use super::*;
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    catalog::AddProduct,
    customers::SaveCustomer,
    payments::{Action, PaymentPart, Request},
    Draft,
};
use std::fs;
use std::path::{Path, PathBuf};

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const LOGIN: &str = "Local test password!";

fn identity(generation: &str, business_id: &str) -> PublisherIdentity {
    PublisherIdentity {
        business_id: business_id.into(),
        device_id: "device-publisher-01".into(),
        restore_generation: generation.into(),
    }
}

fn seeded(path: &Path) -> Store {
    let mut workspace = Workspace::new(Store::open(path, KEY).unwrap());
    workspace.setup(LOGIN).unwrap();
    workspace
        .save(
            0,
            Draft {
                business_name: "Replication shop".into(),
                business_type: "kirana".into(),
                note: "Private saved note".into(),
            },
        )
        .unwrap();
    workspace
        .add_product(AddProduct {
            operation_id: "rice".into(),
            name: "Rice".into(),
            sku: "RICE".into(),
            unit: "kg".into(),
            unit_price_paise: 100000,
            opening_stock_milli: 100000,
        })
        .unwrap();
    workspace
        .save_customer(SaveCustomer {
            operation_id: "create-cust-ravi".into(),
            id: "cust-ravi".into(),
            name: "Ravi Singh".into(),
            phone: Some("9876543210".into()),
            credit_limit_paise: Some(500000),
            credit_days: 14,
            expected_revision: None,
        })
        .unwrap();
    workspace.into_recovery_store()
}

fn rice_line(store: &Store, quantity_milli: i64) -> BillLine {
    BillLine {
        product_id: "rice".into(),
        expected_revision: store.list_products().unwrap()[0].revision,
        quantity_milli,
    }
}

fn cash_invoice(store: &Store, id: &str) -> PostInvoice {
    PostInvoice {
        operation_id: id.into(),
        lines: vec![rice_line(store, 1000)],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    }
}

fn credit_invoice(store: &Store, id: &str) -> PostInvoice {
    PostInvoice {
        operation_id: id.into(),
        lines: vec![rice_line(store, 1000)],
        tax_basis_points: 0,
        tender: Tender::Credit,
        customer_id: Some("cust-ravi".into()),
    }
}

fn retail_sale(store: &Store, id: &str, customer: Option<&str>, parts: &[(&str, i64)]) -> Request {
    Request {
        operation_id: id.into(),
        action: Action::Sale {
            invoice: PostInvoice {
                operation_id: id.into(),
                lines: vec![rice_line(store, 1000)],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: customer.map(str::to_owned),
            },
            payments: parts
                .iter()
                .enumerate()
                .map(|(index, (method, amount))| PaymentPart {
                    id: format!("{id}-p-{index}"),
                    method: (*method).into(),
                    amount_paise: *amount,
                    reference: String::new(),
                })
                .collect(),
        },
    }
}

fn perform_retail(store: &mut Store, request: Request) {
    store.prepare_retail(request.clone()).unwrap();
    if let Err(error) = store.post_retail(request.clone()) {
        panic!("post_retail {}: {error}", request.operation_id);
    }
    store.clear_retail(&request.operation_id, true).unwrap();
}

fn post_seven_supported_sales(store: &mut Store) {
    store
        .post_invoice(cash_invoice(store, "bill-cash-1000"))
        .unwrap();
    perform_retail(
        store,
        retail_sale(store, "bill-upi-1000", None, &[("upi", 100000)]),
    );
    perform_retail(
        store,
        retail_sale(store, "bill-card-1000", None, &[("card", 100000)]),
    );
    store
        .post_invoice(credit_invoice(store, "bill-credit-1000"))
        .unwrap();
    perform_retail(
        store,
        retail_sale(
            store,
            "bill-cash-upi",
            None,
            &[("cash", 60000), ("upi", 40000)],
        ),
    );
    perform_retail(
        store,
        retail_sale(
            store,
            "bill-cash-card",
            None,
            &[("cash", 25000), ("card", 75000)],
        ),
    );
    perform_retail(
        store,
        retail_sale(
            store,
            "bill-cash-credit",
            Some("cust-ravi"),
            &[("cash", 60000), ("credit", 40000)],
        ),
    );
}

fn business_id(store: &Store) -> String {
    store
        .0
        .query_row(
            "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

fn outbox_payload(store: &Store, table: &str, id_column: &str, id: &str) -> String {
    store
        .0
        .query_row(
            &format!("SELECT payload FROM {table} WHERE {id_column}=?1"),
            [id],
            |row| row.get(0),
        )
        .unwrap()
}

struct EchoTransport;
impl Transport for EchoTransport {
    fn send(&self, envelope_json: &str) -> Result<PublishAck, StoreError> {
        let value: serde_json::Value =
            serde_json::from_str(envelope_json).map_err(|_| StoreError::InvalidInvoice)?;
        Ok(PublishAck {
            operation_id: value
                .get("operationId")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .into(),
            cursor: "1".into(),
            duplicate: false,
            business_id: value
                .get("businessId")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        })
    }
}

struct FailTransport;
impl Transport for FailTransport {
    fn send(&self, _envelope_json: &str) -> Result<PublishAck, StoreError> {
        Err(StoreError::AccessUnavailable)
    }
}

#[test]
fn native_financial_matrix_posts_seven_supported_sales() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("live.db");
    let mut store = seeded(&path);
    post_seven_supported_sales(&mut store);

    let balances = store.cashier_state().unwrap().balances;
    assert_eq!(balances.cash_paise, "245000");
    assert_eq!(balances.credit_paise, "140000");

    let invoices = store.list_invoices(0).unwrap();
    assert_eq!(invoices.len(), 7);
    for id in [
        "bill-cash-1000",
        "bill-upi-1000",
        "bill-card-1000",
        "bill-credit-1000",
        "bill-cash-upi",
        "bill-cash-card",
        "bill-cash-credit",
    ] {
        assert_eq!(
            invoices
                .iter()
                .find(|row| row.invoice.id == id)
                .unwrap()
                .invoice
                .total_paise,
            100000
        );
    }

    let upi = outbox_payload(
        &store,
        "local_retail_outbox",
        "operation_id",
        "bill-upi-1000",
    );
    assert!(upi.contains("\"method\":\"upi\""));
    assert!(!upi.contains("\"method\":\"credit\""));
    let card = outbox_payload(
        &store,
        "local_retail_outbox",
        "operation_id",
        "bill-card-1000",
    );
    assert!(card.contains("\"method\":\"card\""));
    assert!(!card.contains("\"method\":\"credit\""));
    let split = outbox_payload(
        &store,
        "local_retail_outbox",
        "operation_id",
        "bill-cash-credit",
    );
    assert!(split.contains("\"method\":\"cash\""));
    assert!(split.contains("\"method\":\"credit\""));
    let billing = outbox_payload(
        &store,
        "local_billing_outbox",
        "invoice_id",
        "bill-cash-1000",
    );
    let digest = payload_sha256(&billing);
    let independent = {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(billing.as_bytes()))
    };
    assert_eq!(digest, independent);
    assert_eq!(digest.len(), 64);
    assert_ne!(digest, payload_sha256(""));
    assert_ne!(digest, payload_sha256("abc"));
    assert!(billing.contains("\"kind\":\"invoice.posted\""));

    let digital: i64 = store
        .0
        .query_row(
            "SELECT COALESCE(SUM(amount),0) FROM local_retail_payments \
             WHERE method IN ('upi','card')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(digital, 100000 + 100000 + 40000 + 75000);
    let matched: i64 = store
        .0
        .query_row(
            "SELECT COUNT(*) FROM local_retail_events WHERE kind='matched'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(matched, 0);

    let generation = store.restore_generation().unwrap();
    let publisher = identity(&generation, &business_id(&store));
    let mut sidecar = ReplicationSidecar::open_memory().unwrap();
    sidecar.save(&SidecarAck::empty(&generation)).unwrap();
    let flush = FlushLock::default();
    assert!(publish_unpublished(&store, &mut sidecar, &publisher, &FailTransport, &flush).is_err());
    assert_eq!(
        sidecar.load(&generation).unwrap().last_for("billing"),
        Some(0)
    );
    let unpublished = store
        .unpublished_replication(&sidecar.load(&generation).unwrap())
        .unwrap();
    assert!(unpublished
        .iter()
        .any(|row| row.operation_id == "bill-cash-1000"));
    publish_unpublished(&store, &mut sidecar, &publisher, &EchoTransport, &flush).unwrap();
    let acked = sidecar.load(&generation).unwrap();
    assert!(acked.last_for("billing").unwrap() > 0);
    assert!(acked.last_for("retail").unwrap() > 0);

    drop(store);
    let mut workspace = Workspace::new(Store::open(&path, KEY).unwrap());
    workspace.unlock(LOGIN).unwrap();
    let reopened = workspace.into_recovery_store();
    assert_eq!(reopened.list_invoices(0).unwrap().len(), 7);
    assert_eq!(
        reopened.cashier_state().unwrap().balances.credit_paise,
        "140000"
    );
    let empty = SidecarAck::empty("gen-other");
    assert!(reopened
        .unpublished_replication(&empty)
        .unwrap()
        .iter()
        .any(|row| row.operation_id == "bill-cash-credit"));
}

#[test]
fn native_outbox_text_is_the_digest_input() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = seeded(&dir.path().join("live.db"));
    store
        .post_invoice(cash_invoice(&store, "bill-digest"))
        .unwrap();
    let payload = outbox_payload(&store, "local_billing_outbox", "invoice_id", "bill-digest");
    let compact =
        serde_json::to_string(&serde_json::from_str::<serde_json::Value>(&payload).unwrap())
            .unwrap();
    let digest = payload_sha256(&payload);
    let independent = {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(payload.as_bytes()))
    };
    assert_eq!(digest, independent);
    assert_eq!(digest.len(), 64);
    assert_ne!(digest, payload_sha256(""));
    if payload != compact {
        assert_ne!(digest, payload_sha256(&compact));
    }
}

fn outbox_dir() -> PathBuf {
    PathBuf::from(
        std::env::var("SORNIO_NATIVE_OUTBOX_DIR")
            .expect("SORNIO_NATIVE_OUTBOX_DIR is required for the native-to-HTTPS pipeline"),
    )
}

fn copy_sqlcipher(src: &Path, dest: &Path) {
    fs::copy(src, dest).expect("copy sqlcipher db");
    for suffix in ["-wal", "-shm"] {
        let from = PathBuf::from(format!("{}{suffix}", src.display()));
        if from.exists() {
            fs::copy(&from, PathBuf::from(format!("{}{suffix}", dest.display())))
                .expect("copy sqlcipher wal");
        }
    }
}

#[test]
#[ignore]
fn native_sqlcipher_export_pipeline() {
    let dir = outbox_dir();
    fs::create_dir_all(dir.join("payloads")).expect("payloads dir");
    fs::create_dir_all(dir.join("envelopes")).expect("envelopes dir");
    fs::create_dir_all(dir.join("digests")).expect("digests dir");
    let scratch = tempfile::tempdir().unwrap();
    let live = scratch.path().join("live.db");
    let sidecar_path = scratch.path().join("sidecar.sqlite");
    let mut store = seeded(&live);
    post_seven_supported_sales(&mut store);
    let balances = store.cashier_state().expect("cashier").balances;
    assert_eq!(balances.cash_paise, "245000");
    assert_eq!(balances.credit_paise, "140000");
    let generation = store.restore_generation().expect("generation");
    let biz = business_id(&store);
    let publisher = identity(&generation, &biz);
    let mut sidecar = ReplicationSidecar::open(&sidecar_path, KEY).expect("sidecar");
    sidecar
        .save(&SidecarAck::empty(&generation))
        .expect("save empty sidecar");
    let rows = store
        .unpublished_replication(&sidecar.load(&generation).expect("load sidecar"))
        .expect("unpublished rows");
    assert!(
        rows.iter().any(|row| row.operation_id == "bill-cash-1000"),
        "billing cash sale missing from unpublished set ({})",
        rows.len()
    );
    assert!(rows
        .iter()
        .any(|row| row.operation_id == "bill-cash-credit"));
    let mut manifest = Vec::new();
    for row in &rows {
        let envelope = envelope_from_row(&publisher, row).expect("envelope from SQLCipher row");
        let envelope_json = serde_json::to_string(&envelope).unwrap();
        let digest = payload_sha256(&row.payload);
        assert_eq!(digest, envelope.payload_sha256);
        assert_eq!(row.payload, envelope.payload_text);
        let stem = format!("{}-{}-{}", row.stream, row.sequence, row.operation_id);
        fs::write(
            dir.join("payloads").join(format!("{stem}.txt")),
            &row.payload,
        )
        .unwrap();
        fs::write(
            dir.join("envelopes").join(format!("{stem}.json")),
            &envelope_json,
        )
        .unwrap();
        fs::write(dir.join("digests").join(format!("{stem}.sha256")), &digest).unwrap();
        manifest.push(serde_json::json!({
            "stream": row.stream,
            "sequence": row.sequence,
            "operationId": row.operation_id,
            "digest": digest,
            "envelopeFile": format!("envelopes/{stem}.json"),
            "payloadFile": format!("payloads/{stem}.txt"),
        }));
    }
    fs::write(
        dir.join("identity.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "businessId": biz,
            "deviceId": publisher.device_id,
            "restoreGeneration": generation,
            "businessName": "Replication shop",
            "portalId": "kirana",
        }))
        .unwrap(),
    )
    .unwrap();
    fs::write(
        dir.join("native_ledger.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "cashPaise": balances.cash_paise,
            "creditPaise": balances.credit_paise,
            "invoiceCount": store.list_invoices(0).unwrap().len(),
            "invoices": [
                {"id": "bill-cash-1000", "cash": "100000", "digital": "0", "credit": "0"},
                {"id": "bill-upi-1000", "cash": "0", "digital": "100000", "credit": "0"},
                {"id": "bill-card-1000", "cash": "0", "digital": "100000", "credit": "0"},
                {"id": "bill-credit-1000", "cash": "0", "digital": "0", "credit": "100000"},
                {"id": "bill-cash-upi", "cash": "60000", "digital": "40000", "credit": "0"},
                {"id": "bill-cash-card", "cash": "25000", "digital": "75000", "credit": "0"},
                {"id": "bill-cash-credit", "cash": "60000", "digital": "0", "credit": "40000"},
            ],
        }))
        .unwrap(),
    )
    .unwrap();
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_string_pretty(&serde_json::json!({ "rows": manifest })).unwrap(),
    )
    .unwrap();
    store
        .0
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .expect("checkpoint live db");
    drop(store);
    drop(sidecar);
    copy_sqlcipher(&live, &dir.join("live.db"));
    copy_sqlcipher(&sidecar_path, &dir.join("sidecar.sqlite"));
}

#[test]
#[ignore]
fn native_sqlcipher_apply_https_acks() {
    let dir = outbox_dir();
    let live = dir.join("live.db");
    let store = Store::open(&live, KEY).unwrap();
    let generation = store.restore_generation().unwrap();
    let publisher = identity(&generation, &business_id(&store));
    let mut sidecar = ReplicationSidecar::open(&dir.join("sidecar.sqlite"), KEY).unwrap();
    let mut ack = sidecar.load(&generation).unwrap();
    let raw = fs::read_to_string(dir.join("acks.jsonl")).expect("acks.jsonl from HTTPS ingest");
    let mut applied = 0usize;
    for line in raw.lines().filter(|line| !line.trim().is_empty()) {
        let value: serde_json::Value = serde_json::from_str(line).unwrap();
        let stream = value.get("stream").and_then(|v| v.as_str()).unwrap();
        let sequence = value.get("sequence").and_then(|v| v.as_i64()).unwrap();
        let operation_id = value.get("operationId").and_then(|v| v.as_str()).unwrap();
        let body = value.get("ack").unwrap().to_string();
        let remote = parse_publish_ack(operation_id, &publisher, &body).unwrap();
        commit_local_ack(
            &mut sidecar,
            &mut ack,
            stream,
            sequence,
            operation_id,
            &publisher,
            &remote,
        )
        .unwrap();
        applied += 1;
    }
    assert!(applied > 0, "no HTTPS acks were applied");
    drop(store);
    let mut workspace = Workspace::new(Store::open(&live, KEY).unwrap());
    workspace.unlock(LOGIN).unwrap();
    let reopened = workspace.into_recovery_store();
    assert_eq!(reopened.list_invoices(0).unwrap().len(), 7);
    assert_eq!(
        reopened.cashier_state().unwrap().balances.credit_paise,
        "140000"
    );
    let leftover = reopened
        .unpublished_replication(&sidecar.load(&generation).unwrap())
        .unwrap();
    assert!(
        leftover
            .iter()
            .all(|row| row.operation_id != "bill-cash-1000"
                && row.operation_id != "bill-cash-credit"),
        "acked sales must leave the unpublished set"
    );
    fs::write(
        dir.join("native_after.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "applied": applied,
            "invoiceCount": 7,
            "creditPaise": "140000",
            "unpublishedAfterAck": leftover.len(),
        }))
        .unwrap(),
    )
    .unwrap();
}
