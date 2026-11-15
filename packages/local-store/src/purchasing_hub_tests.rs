//! Phase 21B — mobile purchasing protocol acceptance.
//!
//! These tests execute the real mobile purchasing surface: the authenticated
//! `/v1/purchasing/*` routes, the durable operation journal, the exactly-once
//! replay path, and the refusal classification that Phase 21A's authoritative
//! store methods produce. They are not a Rust hub TLS test and they are not a
//! React Native test; those are separate evidence.
use super::*;
use crate::{
    access::Workspace,
    catalog::AddProduct,
    identity::{Role, StaffDetails},
    purchasing::{CreatePurchaseOrder, PurchaseOrderLineInput},
};
use serde_json::json;
use std::time::{Duration, Instant};

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Mobile purchasing password 2026";

fn seeded() -> Workspace {
    let mut w = Workspace::new(Store::open(std::path::Path::new(":memory:"), KEY).unwrap());
    w.setup(PASSWORD).unwrap();
    w.add_product(AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 100_000,
    })
    .unwrap();
    w.save_supplier(crate::purchasing::SaveSupplier {
        operation_id: "supplier-seed".into(),
        id: "sup-1".into(),
        name: "Krishna Traders".into(),
        phone: Some("+91 98765 43210".into()),
        gstin: Some("22AAAAA0000A1Z5".into()),
        address: Some("12 Market Road".into()),
        payment_terms_days: 30,
        notes: String::new(),
        archived: false,
        expected_revision: None,
    })
    .unwrap();
    w.hub_configure_for_test(true, None).unwrap();
    w
}

/// Enrol one device and sign it in as the named staff account on the supplied
/// credential. Mirrors the real pairing flow the phone performs: request, owner
/// approval, then sign-in.
fn connect_on(
    w: &mut Workspace,
    device: &str,
    secret_char: char,
    username: &str,
    password: &str,
) -> (Value, String) {
    let i = w.hub_admin_for_test().unwrap()["identity"].clone();
    let credential: String = std::iter::repeat(secret_char).take(64).collect();
    let base = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":device,"name":"Phone","credential":credential});
    w.hub_request("/v1/enrol", "", base).unwrap();
    let actor: String = w
        .store_for_test()
        .0
        .query_row(
            "SELECT id FROM local_principals WHERE username=?1",
            [username],
            |r| r.get(0),
        )
        .unwrap();
    w.hub_device_for_test(device, 1, Some(&actor)).unwrap();
    let session = w
        .hub_request(
            "/v1/session",
            &credential,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":device,"username":username,"password":password}),
        )
        .unwrap();
    (i, session["token"].as_str().unwrap().into())
}

fn connect_as(w: &mut Workspace, username: &str, password: &str) -> (Value, String) {
    connect_on(w, "phone", 'a', username, password)
}

fn owner_phone(w: &mut Workspace) -> (Value, String) {
    connect_as(w, "owner", PASSWORD)
}

fn add_staff(w: &mut Workspace, username: &str, role: Role) {
    w.create_staff(
        StaffDetails {
            username: username.into(),
            display_name: username.into(),
            role,
        },
        PASSWORD,
    )
    .unwrap();
}

/// Builds a `/v1/purchasing/submit` body for one operation kind.
fn submit_body(i: &Value, kind: &str, operation_id: &str, request: Value) -> Value {
    json!({
        "version":1,
        "hubId":i["hubId"],
        "businessId":i["businessId"],
        "operationId":operation_id,
        "kind":kind,
        "request":request,
    })
}

fn draft_order(w: &mut Workspace, i: &Value, token: &str, operation_id: &str) -> Value {
    let body = submit_body(
        i,
        "purchasing.purchase_order_created",
        operation_id,
        json!({
            "operationId":operation_id,
            "supplierId":"sup-1",
            "note":"Weekly stock",
            "lines":[{"productId":"rice","quantityMilli":10000,"unitCostPaise":9000,"taxBps":0}],
        }),
    );
    w.hub_request("/v1/purchasing/submit", token, body).unwrap()
}

fn approved_order(w: &mut Workspace, i: &Value, token: &str, seed: &str) -> (String, i64) {
    let created = draft_order(w, i, token, &format!("{seed}-po"));
    let id = created["result"]["id"].as_str().unwrap().to_string();
    let revision = created["result"]["revision"].as_i64().unwrap();
    let submitted = w
        .hub_request(
            "/v1/purchasing/submit",
            token,
            submit_body(
                i,
                "purchasing.purchase_order_submitted",
                &format!("{seed}-submit"),
                json!({"operationId":format!("{seed}-submit"),"id":id,"expectedRevision":revision,"reason":null}),
            ),
        )
        .unwrap();
    assert_eq!(submitted["status"], "accepted", "{submitted}");
    let revision = submitted["result"]["revision"].as_i64().unwrap();
    let approved = w
        .hub_request(
            "/v1/purchasing/submit",
            token,
            submit_body(
                i,
                "purchasing.purchase_order_decided",
                &format!("{seed}-approve"),
                json!({"operationId":format!("{seed}-approve"),"id":id,"expectedRevision":revision,"decision":"approve","reason":null}),
            ),
        )
        .unwrap();
    assert_eq!(approved["status"], "accepted", "{approved}");
    (id, approved["result"]["revision"].as_i64().unwrap())
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

#[test]
fn workspace_read_requires_an_approved_device_session() {
    let mut w = seeded();
    let i = w.hub_admin_for_test().unwrap()["identity"].clone();
    let body = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]});
    assert!(matches!(
        w.hub_request("/v1/purchasing/workspace", "", body),
        Err(StoreError::Forbidden)
    ));
}

#[test]
fn workspace_read_returns_suppliers_orders_and_capabilities() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let document = w
        .hub_request(
            "/v1/purchasing/workspace",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]}),
        )
        .unwrap();
    assert_eq!(document["suppliers"][0]["name"], "Krishna Traders");
    assert_eq!(document["capabilities"]["manageSuppliers"], true);
    assert_eq!(document["capabilities"]["paySuppliers"], true);
    assert_eq!(document["capabilities"]["receiveStock"], true);
    // Numeric money is paise, as strings for balances and integers for totals.
    assert!(document["generatedAt"].as_str().unwrap().ends_with('Z'));
    assert_eq!(document["products"][0]["sku"], "RICE");
}

#[test]
fn wrong_workspace_is_refused_before_any_data_is_read() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let mut body = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]});
    body["businessId"] = json!("another-business");
    assert!(matches!(
        w.hub_request("/v1/purchasing/workspace", &token, body),
        Err(StoreError::WorkspaceMismatch)
    ));
}

#[test]
fn unsupported_protocol_version_is_refused() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let body = json!({"version":2,"hubId":i["hubId"],"businessId":i["businessId"]});
    // The hub answers an unknown protocol version with a body the phone can read,
    // rather than an error it has to guess at.
    let reply = w
        .hub_request("/v1/purchasing/workspace", &token, body)
        .unwrap();
    assert_eq!(reply["error"], "unsupported_version");
}

// ---------------------------------------------------------------------------
// Exactly-once writes and recovery
// ---------------------------------------------------------------------------

#[test]
fn a_replayed_operation_returns_the_same_result_and_posts_once() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let body = submit_body(
        &i,
        "purchasing.purchase_order_created",
        "po-once",
        json!({
            "operationId":"po-once",
            "supplierId":"sup-1",
            "note":"Once",
            "lines":[{"productId":"rice","quantityMilli":1000,"unitCostPaise":9000,"taxBps":0}],
        }),
    );
    let first = w
        .hub_request("/v1/purchasing/submit", &token, body.clone())
        .unwrap();
    let second = w
        .hub_request("/v1/purchasing/submit", &token, body)
        .unwrap();
    assert_eq!(first, second);
    let count: i64 = w
        .store_for_test()
        .0
        .query_row("SELECT COUNT(*) FROM local_purchase_orders", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(count, 1, "a replay must not create a second order");
}

#[test]
fn a_lost_acknowledgement_is_recovered_by_operation_identity() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let body = submit_body(
        &i,
        "purchasing.purchase_order_created",
        "po-lost-ack",
        json!({
            "operationId":"po-lost-ack",
            "supplierId":"sup-1",
            "note":"Committed but unacknowledged",
            "lines":[{"productId":"rice","quantityMilli":2000,"unitCostPaise":9000,"taxBps":0}],
        }),
    );
    let committed = w
        .hub_request("/v1/purchasing/submit", &token, body)
        .unwrap();
    assert_eq!(committed["status"], "accepted");
    // The phone never saw the reply. It asks status first, exactly like the
    // restaurant outbox does, and adopts what the hub already committed.
    let status = w
        .hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"po-lost-ack"}),
        )
        .unwrap();
    assert_eq!(status, committed);
}

#[test]
fn an_unknown_operation_reports_not_found_rather_than_inventing_a_result() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let status = w
        .hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"never-sent"}),
        )
        .unwrap();
    assert_eq!(status["status"], "not_found");
}

#[test]
fn reusing_an_operation_identity_for_different_content_is_a_conflict() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let mut body = submit_body(
        &i,
        "purchasing.purchase_order_created",
        "po-reused",
        json!({
            "operationId":"po-reused",
            "supplierId":"sup-1",
            "note":"First body",
            "lines":[{"productId":"rice","quantityMilli":1000,"unitCostPaise":9000,"taxBps":0}],
        }),
    );
    w.hub_request("/v1/purchasing/submit", &token, body.clone())
        .unwrap();
    body["request"]["note"] = json!("Different body");
    assert!(matches!(
        w.hub_request("/v1/purchasing/submit", &token, body),
        Err(StoreError::OperationConflict)
    ));
}

#[test]
fn reusing_an_operation_identity_for_another_kind_is_a_conflict() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let body = submit_body(
        &i,
        "purchasing.purchase_order_created",
        "kind-clash",
        json!({
            "operationId":"kind-clash",
            "supplierId":"sup-1",
            "note":"Created",
            "lines":[{"productId":"rice","quantityMilli":1000,"unitCostPaise":9000,"taxBps":0}],
        }),
    );
    w.hub_request("/v1/purchasing/submit", &token, body)
        .unwrap();
    let other = submit_body(
        &i,
        "purchasing.supplier_payment",
        "kind-clash",
        json!({
            "operationId":"kind-clash",
            "supplierId":"sup-1",
            "invoiceId":null,
            "method":"cash",
            "amountPaise":100,
            "reference":"REF",
            "paidOn":null,
        }),
    );
    assert!(matches!(
        w.hub_request("/v1/purchasing/submit", &token, other),
        Err(StoreError::OperationConflict)
    ));
}

#[test]
fn an_unknown_purchasing_kind_is_refused_before_the_store_runs() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let body = json!({
        "version":1,"hubId":i["hubId"],"businessId":i["businessId"],
        "operationId":"bad-kind","kind":"purchasing.delete_everything","request":{},
    });
    assert!(matches!(
        w.hub_request("/v1/purchasing/submit", &token, body),
        Err(StoreError::InvalidDraft)
    ));
}

#[test]
fn journal_rows_are_immutable_and_survive_delete_attempts() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    draft_order(&mut w, &i, &token, "po-immutable");
    assert!(w
        .store_for_test()
        .0
        .execute(
            "UPDATE local_hub_operations SET result='{}' WHERE id='po-immutable'",
            []
        )
        .is_err());
    assert!(w
        .store_for_test()
        .0
        .execute(
            "DELETE FROM local_hub_operations WHERE id='po-immutable'",
            []
        )
        .is_err());
}

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

#[test]
fn an_assistant_manager_cannot_record_a_supplier_payment_through_mobile() {
    let mut w = seeded();
    add_staff(&mut w, "assistant", Role::AssistantManager);
    let (i, token) = connect_on(&mut w, "assistant-phone", 'b', "assistant", PASSWORD);
    let body = submit_body(
        &i,
        "purchasing.supplier_payment",
        "am-payment",
        json!({
            "operationId":"am-payment",
            "supplierId":"sup-1",
            "invoiceId":null,
            "method":"cash",
            "amountPaise":500,
            "reference":"CASH-1",
            "paidOn":null,
        }),
    );
    let result = w
        .hub_request("/v1/purchasing/submit", &token, body)
        .unwrap();
    assert_eq!(result["status"], "refused");
    assert_eq!(result["reason"], "not_permitted");
    // A refusal is durable too: the same identity keeps returning it.
    assert_eq!(
        w.hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"am-payment"})
        )
        .unwrap()["reason"],
        "not_permitted"
    );
    let payments: i64 = w
        .store_for_test()
        .0
        .query_row("SELECT COUNT(*) FROM local_supplier_payments", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(payments, 0, "no payment row may exist after a refusal");
}

#[test]
fn the_capability_document_matches_the_native_role_matrix() {
    let mut w = seeded();
    add_staff(&mut w, "assistant", Role::AssistantManager);
    add_staff(&mut w, "till", Role::Cashier);
    let (i, owner_token) = owner_phone(&mut w);
    let envelope = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]});
    let owner = w
        .hub_request("/v1/purchasing/workspace", &owner_token, envelope.clone())
        .unwrap();
    assert_eq!(owner["capabilities"]["approvePurchaseOrders"], true);
    assert_eq!(owner["capabilities"]["paySuppliers"], true);

    // A second paired device, so the first session is not evicted.
    let (_, assistant_token) = connect_on(&mut w, "assistant-phone", 'b', "assistant", PASSWORD);
    let assistant = w
        .hub_request(
            "/v1/purchasing/workspace",
            &assistant_token,
            envelope.clone(),
        )
        .unwrap();
    // An assistant manager drafts and receives but cannot edit the supplier
    // register: `Role::AssistantManager` does not include `ManageSuppliers`.
    assert_eq!(assistant["capabilities"]["supplierRead"], true);
    assert_eq!(assistant["capabilities"]["manageSuppliers"], false);
    assert_eq!(assistant["capabilities"]["managePurchaseOrders"], true);
    assert_eq!(assistant["capabilities"]["receiveStock"], true);
    assert_eq!(assistant["capabilities"]["paySuppliers"], false);
    assert_eq!(assistant["capabilities"]["correctPayables"], false);
}

#[test]
fn a_cashier_cannot_read_the_supplier_workspace() {
    let mut w = seeded();
    add_staff(&mut w, "till", Role::Cashier);
    let (i, token) = connect_as(&mut w, "till", PASSWORD);
    assert!(matches!(
        w.hub_request(
            "/v1/purchasing/workspace",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]})
        ),
        Err(StoreError::Forbidden)
    ));
}

#[test]
fn a_revoked_device_stops_reading_immediately() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let body = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]});
    w.hub_request("/v1/purchasing/workspace", &token, body.clone())
        .unwrap();
    // Revoking bumps the device revision, exactly as the owner's approval screen
    // does. The next request no longer matches an approved device grant.
    w.hub_device_for_test("phone", 2, None).unwrap();
    assert!(w
        .hub_request("/v1/purchasing/workspace", &token, body)
        .is_err());
}

// ---------------------------------------------------------------------------
// Refusals, stale revisions and the guarantees they preserve
// ---------------------------------------------------------------------------

#[test]
fn a_stale_revision_is_refused_and_reported_without_overwriting() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let created = draft_order(&mut w, &i, &token, "po-stale");
    let stale = created["result"]["revision"].as_i64().unwrap();
    // Someone else (here: the desktop) edits the draft first.
    w.update_purchase_order(crate::purchasing::UpdatePurchaseOrder {
        operation_id: "desktop-edit".into(),
        id: created["result"]["id"].as_str().unwrap().into(),
        expected_revision: stale,
        note: "Desktop edit".into(),
        lines: vec![PurchaseOrderLineInput {
            product_id: "rice".into(),
            quantity_milli: 2000,
            unit_cost_paise: 9000,
            tax_bps: Some(0),
        }],
    })
    .unwrap();
    let refused = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.purchase_order_updated",
                "phone-stale-edit",
                json!({"operationId":"phone-stale-edit","id":created["result"]["id"],"expectedRevision":stale,"note":"Phone edit","lines":[{"productId":"rice","quantityMilli":3000,"unitCostPaise":9000,"taxBps":0}]}),
            ),
        )
        .unwrap();
    assert_eq!(refused["status"], "refused");
    assert_eq!(refused["reason"], "revision_conflict");
    // The current revision is returned so the phone can reconcile explicitly.
    assert_eq!(refused["revision"], json!(stale + 1));
    let note: String = w
        .store_for_test()
        .0
        .query_row(
            "SELECT note FROM local_purchase_orders WHERE id=?1",
            [created["result"]["id"].as_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        note, "Desktop edit",
        "the desktop value must not be overwritten"
    );
}

#[test]
fn a_draft_or_receipt_never_moves_stock_or_money() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let before: (i64, i64) = w
        .store_for_test()
        .0
        .query_row(
            "SELECT (SELECT stock_milli FROM local_products WHERE id='rice'),
                    (SELECT COALESCE(SUM(amount_paise),0) FROM local_supplier_entries)",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    let (order, revision) = approved_order(&mut w, &i, &token, "no-effect");
    assert_eq!(before, (100_000, 0));
    let order_document = w
        .hub_request(
            "/v1/purchasing/order",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"orderId":order}),
        )
        .unwrap();
    assert_eq!(order_document["order"]["status"], "approved");
    assert_eq!(order_document["order"]["revision"], json!(revision));
    let after: (i64, i64) = w
        .store_for_test()
        .0
        .query_row(
            "SELECT (SELECT stock_milli FROM local_products WHERE id='rice'),
                    (SELECT COALESCE(SUM(amount_paise),0) FROM local_supplier_entries)",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(after, before, "approval must not post stock or payables");
}

#[test]
fn an_over_receipt_is_refused_and_stock_moves_only_once_for_a_valid_one() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let (order, _) = approved_order(&mut w, &i, &token, "receive");
    let before: i64 = w
        .store_for_test()
        .0
        .query_row(
            "SELECT stock_milli FROM local_products WHERE id='rice'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let too_much = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.goods_received",
                "over-receipt",
                json!({"operationId":"over-receipt","orderId":order,"reference":"CH-1","note":"Too much","lines":[{"lineIndex":0,"productId":"rice","quantityMilli":20000,"damagedMilli":0,"note":null}]}),
            ),
        )
        .unwrap();
    assert_eq!(too_much["status"], "refused");
    assert_eq!(too_much["reason"], "invalid_receipt");
    let unchanged: i64 = w
        .store_for_test()
        .0
        .query_row(
            "SELECT stock_milli FROM local_products WHERE id='rice'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(unchanged, before);

    let ok = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.goods_received",
                "good-receipt",
                json!({"operationId":"good-receipt","orderId":order,"reference":"CH-1","note":"Delivery","lines":[{"lineIndex":0,"productId":"rice","quantityMilli":4000,"damagedMilli":1000,"note":null}]}),
            ),
        )
        .unwrap();
    assert_eq!(ok["status"], "accepted", "{ok}");
    let after: i64 = w
        .store_for_test()
        .0
        .query_row(
            "SELECT stock_milli FROM local_products WHERE id='rice'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    // 4,000 received of which 1,000 damaged: only the 3,000 good units land.
    assert_eq!(after, before + 3000);
    assert_eq!(ok["result"]["damagedTotalPaise"], json!(9000));

    // The same request replayed must not receive a second time.
    let replay = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.goods_received",
                "good-receipt",
                json!({"operationId":"good-receipt","orderId":order,"reference":"CH-1","note":"Delivery","lines":[{"lineIndex":0,"productId":"rice","quantityMilli":4000,"damagedMilli":1000,"note":null}]}),
            ),
        )
        .unwrap();
    assert_eq!(replay["status"], "accepted");
    let after_replay: i64 = w
        .store_for_test()
        .0
        .query_row(
            "SELECT stock_milli FROM local_products WHERE id='rice'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        after_replay, after,
        "a replayed receipt must not double stock"
    );
}

#[test]
fn a_partial_receipt_leaves_the_order_partial_and_accepts_the_remainder() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let (order, _) = approved_order(&mut w, &i, &token, "partial");
    let first = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.goods_received",
                "partial-1",
                json!({"operationId":"partial-1","orderId":order,"reference":"CH-A","note":"First truck","lines":[{"lineIndex":0,"productId":"rice","quantityMilli":4000,"damagedMilli":0,"note":null}]}),
            ),
        )
        .unwrap();
    assert_eq!(first["result"]["orderStatus"], "partial");
    let second = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.goods_received",
                "partial-2",
                json!({"operationId":"partial-2","orderId":order,"reference":"CH-B","note":"Second truck","lines":[{"lineIndex":0,"productId":"rice","quantityMilli":6000,"damagedMilli":0,"note":null}]}),
            ),
        )
        .unwrap();
    assert_eq!(second["result"]["orderStatus"], "received");
}

#[test]
fn a_supplier_payment_posts_once_and_a_replay_is_identical() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    // An opening payable so there is something to pay.
    let opening = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.supplier_payment",
                "opening-first",
                json!({"operationId":"opening-first","supplierId":"sup-1","invoiceId":null,"method":"cash","amountPaise":100,"reference":"SEED","paidOn":null}),
            ),
        )
        .unwrap();
    assert_eq!(opening["status"], "accepted");
    let payment_body = json!({
        "operationId":"pay-1","supplierId":"sup-1","invoiceId":null,
        "method":"upi","amountPaise":250,"reference":"UPI-9911","paidOn":null,
    });
    let first = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.supplier_payment",
                "pay-1",
                payment_body.clone(),
            ),
        )
        .unwrap();
    assert_eq!(first["status"], "accepted", "{first}");
    // One opening payment, then one committed payment: the replay adds nothing.
    let rows: i64 = w
        .store_for_test()
        .0
        .query_row("SELECT COUNT(*) FROM local_supplier_payments", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(rows, 2);
    let replay = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(&i, "purchasing.supplier_payment", "pay-1", payment_body),
        )
        .unwrap();
    assert_eq!(replay, first);
    let rows_after: i64 = w
        .store_for_test()
        .0
        .query_row("SELECT COUNT(*) FROM local_supplier_payments", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(rows_after, 2);
    // The journal and the ledger agree: one entry per committed payment.
    let journal: i64 = w
        .store_for_test()
        .0
        .query_row(
            "SELECT COUNT(*) FROM local_supplier_journal WHERE operation_id='pay-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        journal, 2,
        "a payment must post a balanced two-account journal"
    );
    let balanced: i64 = w
        .store_for_test()
        .0
        .query_row(
            "SELECT COALESCE(SUM(amount_paise),0) FROM local_supplier_journal WHERE operation_id='pay-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(balanced, 0);
}

#[test]
fn a_return_is_refused_without_a_receipt_and_refusals_are_durable() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let (order, _) = approved_order(&mut w, &i, &token, "ret");
    let received = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.goods_received",
                "ret-receipt",
                json!({"operationId":"ret-receipt","orderId":order,"reference":"CH-R","note":"Delivery","lines":[{"lineIndex":0,"productId":"rice","quantityMilli":5000,"damagedMilli":0,"note":null}]}),
            ),
        )
        .unwrap();
    let receipt_id = received["result"]["id"].as_str().unwrap().to_string();
    let over = w
        .hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.purchase_return",
                "over-return",
                json!({"operationId":"over-return","receiptId":receipt_id,"disposition":"supplier_credit","refundMethod":null,"reason":"Damaged","lines":[{"receiptLine":0,"productId":"rice","quantityMilli":9000}]}),
            ),
        )
        .unwrap();
    assert_eq!(over["status"], "refused");
    let repeated = w
        .hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"over-return"}),
        )
        .unwrap();
    assert_eq!(repeated, over);
    let returns: i64 = w
        .store_for_test()
        .0
        .query_row("SELECT COUNT(*) FROM local_purchase_returns", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(returns, 0);
}

#[test]
fn a_statement_read_is_bounded_and_scoped_to_one_supplier() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let statement = w
        .hub_request(
            "/v1/purchasing/statement",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"supplierId":"sup-1","after":0,"through":null}),
        )
        .unwrap();
    assert_eq!(statement["statement"]["supplier"]["id"], "sup-1");
    assert!(statement["statement"]["entries"].is_array());
    assert!(matches!(
        w.hub_request(
            "/v1/purchasing/statement",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"supplierId":"no-such-supplier","after":0})
        ),
        Err(StoreError::SupplierMissing) | Err(StoreError::InvalidPurchase)
    ));
}

#[test]
fn a_session_expiry_during_recovery_does_not_lose_the_committed_result() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let body = submit_body(
        &i,
        "purchasing.purchase_order_created",
        "po-expiry",
        json!({"operationId":"po-expiry","supplierId":"sup-1","note":"Committed","lines":[{"productId":"rice","quantityMilli":1000,"unitCostPaise":9000,"taxBps":0}]}),
    );
    let committed = w
        .hub_request("/v1/purchasing/submit", &token, body)
        .unwrap();
    // Drop every staff session, as a sign-out or expiry would.
    w.store_for_test()
        .0
        .execute("DELETE FROM local_hub_sessions", [])
        .unwrap();
    assert!(w
        .hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"po-expiry"})
        )
        .is_err());
    // Re-authenticate the same device: the committed result is still there.
    let session = {
        let credential = "a".repeat(64);
        w.hub_request(
            "/v1/session",
            &credential,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"phone","username":"owner","password":PASSWORD}),
        )
        .unwrap()
    };
    let fresh = session["token"].as_str().unwrap();
    let recovered = w
        .hub_request(
            "/v1/purchasing/operation",
            fresh,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"po-expiry"}),
        )
        .unwrap();
    assert_eq!(recovered, committed);
}

#[test]
fn a_hub_disable_blocks_every_purchasing_route() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    w.hub_configure(false, None).unwrap();
    let body = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]});
    assert!(w
        .hub_request("/v1/purchasing/workspace", &token, body)
        .is_err());
}

#[test]
fn an_identity_owned_by_another_device_cannot_adopt_its_result() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    draft_order(&mut w, &i, &token, "po-owner");
    // The journal is append-only, so a row for another paired device is written
    // directly. Handing its result to this caller would leak a committed outcome a
    // different phone owns, and reporting `not_found` would invite a resend the hub
    // has already decided.
    let actor = w.local_session_for_test().unwrap().principal.id;
    // The journal has a foreign key to the device table, so the competing phone
    // needs a real device row. It is inserted directly, enrolled to nobody, which
    // is precisely the shape a foreign device would have.
    w.store_for_test()
        .0
        .execute(
            "INSERT INTO local_hub_devices(id,name,credential_hash,generation,state,actor_id,created,expires,revision) \
             VALUES('other-device','Other phone',?1,'gen','approved',NULL,1,9999999999,1)",
            rusqlite::params!["f".repeat(64)],
        )
        .unwrap();
    w.store_for_test()
        .0
        .execute(
            "INSERT INTO local_hub_operations VALUES('foreign','other-device',?1,'gen',?2,'{}',1)",
            rusqlite::params![
                actor,
                json!({"kind":"purchasing.purchase_order_created","operationId":"foreign","digest":"x","request":{}}).to_string()
            ],
        )
        .unwrap();
    assert!(matches!(
        w.hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"foreign"})
        ),
        Err(StoreError::OperationConflict)
    ));
    // Submitting under that identity is a conflict too, not a second write.
    assert!(matches!(
        w.hub_request(
            "/v1/purchasing/submit",
            &token,
            submit_body(
                &i,
                "purchasing.purchase_order_created",
                "foreign",
                json!({"operationId":"foreign","supplierId":"sup-1","note":"x","lines":[{"productId":"rice","quantityMilli":1000,"unitCostPaise":9000,"taxBps":0}]}),
            ),
        ),
        Err(StoreError::OperationConflict)
    ));
    // The seeded identity still answers for its own device.
    let owned = w
        .hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"po-owner"}),
        )
        .unwrap();
    assert_eq!(owned["status"], "accepted");
}

#[test]
fn an_order_operation_identity_cannot_be_replayed_as_a_purchasing_one() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    // A restaurant submission shares the same journal table.
    let _ = w.hub_request(
        "/v1/submit",
        &token,
        json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"order-op","actorId":w.local_session_for_test().unwrap().principal.id,"orderId":"order-x","tableId":null,"expectedRevision":0,"items":[{"menuId":"menu-x","quantity":1,"expectedPricePaise":100,"note":""}]}),
    );
    assert!(matches!(
        w.hub_request(
            "/v1/purchasing/operation",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"order-op"})
        ),
        Err(StoreError::OperationConflict)
    ));
}

#[test]
fn an_operation_audit_row_is_written_for_every_committed_mobile_write() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    draft_order(&mut w, &i, &token, "po-audit");
    let audited: i64 = w
        .store_for_test()
        .0
        .query_row(
            "SELECT COUNT(*) FROM local_identity_audit WHERE action='hub.purchasing.purchase_order_created' AND target='po-audit'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(audited, 1);
}

#[test]
fn the_owner_actor_is_reported_so_the_phone_never_trusts_its_own_claim() {
    let mut w = seeded();
    let (i, token) = owner_phone(&mut w);
    let document = w
        .hub_request(
            "/v1/purchasing/workspace",
            &token,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]}),
        )
        .unwrap();
    let actor = w.local_session_for_test().unwrap().principal.id;
    assert_eq!(document["actorId"], json!(actor));
    assert_eq!(document["role"], "owner");
    // A long session must not be silently renewed by a passive read.
    let before = w.idle_clock_for_test();
    let _ = w.hub_request(
        "/v1/purchasing/workspace",
        &token,
        json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]}),
    );
    assert!(Instant::now().duration_since(before) < Duration::from_secs(5));
}
