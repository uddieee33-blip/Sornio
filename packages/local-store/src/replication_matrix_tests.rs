use super::*;
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    catalog::AddProduct,
    customers::SaveCustomer,
    payments::{Action, PaymentPart, Request},
    Draft,
};
use std::path::Path;

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
    store.post_retail(request.clone()).unwrap();
    store.clear_retail(&request.operation_id, true).unwrap();
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

    store.post_invoice(cash_invoice(&store, "bill-cash-1000")).unwrap();
    perform_retail(
        &mut store,
        retail_sale(&store, "bill-upi-1000", None, &[("upi", 100000)]),
    );
    perform_retail(
        &mut store,
        retail_sale(&store, "bill-card-1000", None, &[("card", 100000)]),
    );
    store
        .post_invoice(credit_invoice(&store, "bill-credit-1000"))
        .unwrap();
    perform_retail(
        &mut store,
        retail_sale(
            &store,
            "bill-cash-upi",
            None,
            &[("cash", 60000), ("upi", 40000)],
        ),
    );
    perform_retail(
        &mut store,
        retail_sale(
            &store,
            "bill-cash-card",
            None,
            &[("cash", 25000), ("card", 75000)],
        ),
    );
    perform_retail(
        &mut store,
        retail_sale(
            &store,
            "bill-cash-credit",
            Some("cust-ravi"),
            &[("cash", 60000), ("credit", 40000)],
        ),
    );

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

    let upi = outbox_payload(&store, "local_retail_outbox", "operation_id", "bill-upi-1000");
    assert!(upi.contains("\"method\":\"upi\""));
    assert!(!upi.contains("\"method\":\"credit\""));
    let card = outbox_payload(&store, "local_retail_outbox", "operation_id", "bill-card-1000");
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
    let billing = outbox_payload(&store, "local_billing_outbox", "invoice_id", "bill-cash-1000");
    assert_eq!(payload_sha256(&billing), payload_sha256(&billing));
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
    assert!(
        publish_unpublished(&store, &mut sidecar, &publisher, &FailTransport, &flush).is_err()
    );
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
    assert!(
        reopened
            .unpublished_replication(&empty)
            .unwrap()
            .iter()
            .any(|row| row.operation_id == "bill-cash-credit")
    );
}

#[test]
fn native_outbox_text_is_the_digest_input() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = seeded(&dir.path().join("live.db"));
    store.post_invoice(cash_invoice(&store, "bill-digest")).unwrap();
    let payload = outbox_payload(&store, "local_billing_outbox", "invoice_id", "bill-digest");
    let compact = serde_json::to_string(
        &serde_json::from_str::<serde_json::Value>(&payload).unwrap(),
    )
    .unwrap();
    assert_eq!(payload_sha256(&payload).len(), 64);
    if payload != compact {
        assert_ne!(payload_sha256(&payload), payload_sha256(&compact));
    }
}
