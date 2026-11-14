use super::*;
use crate::{access::Workspace, catalog::AddProduct, restaurant_checkout::Menu};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Synthetic restaurant password 2026";
fn seeded() -> Workspace {
    let mut w = Workspace::new(Store::open(std::path::Path::new(":memory:"), KEY).unwrap());
    w.setup(PASSWORD).unwrap();
    w.add_product(AddProduct {
        operation_id: "pizza".into(),
        name: "Pizza".into(),
        sku: "PIZZA".into(),
        unit: "pcs".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 10000,
    })
    .unwrap();
    w.save_restaurant_menu(Menu {
        id: "menu".into(),
        product_id: "pizza".into(),
        category: "Food".into(),
        label: "Pizza".into(),
        variant: "Large".into(),
        available: true,
    })
    .unwrap();
    w.hub_configure(true, None).unwrap();
    w
}
fn connect(w: &mut Workspace) -> (Value, String) {
    let i = w.hub_admin().unwrap()["identity"].clone();
    let credential = "a".repeat(64);
    let base = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"phone","name":"Phone","credential":credential});
    w.hub_request("/v1/enrol", "", base.clone()).unwrap();
    assert!(w.hub_request("/v1/session",&credential,json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"phone","username":"owner","password":PASSWORD})).is_err());
    let actor = w.local_session().unwrap().principal.id;
    w.hub_device("phone", 1, Some(&actor)).unwrap();
    let session=w.hub_request("/v1/session",&credential,json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"phone","username":"owner","password":PASSWORD})).unwrap();
    (i, session["token"].as_str().unwrap().into())
}
fn submission(w: &Workspace, i: &Value, id: &str) -> Value {
    json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"actorId":w.local_session().unwrap().principal.id,"operationId":id,"orderId":"order","tableId":null,"expectedRevision":0,"items":[{"menuId":"menu","quantity":2,"expectedPricePaise":10000,"note":"No onion"}]})
}
#[test]
fn duplicate_acceptance_is_durable_and_never_posts_money_or_kot() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    let request = submission(&w, &i, "operation");
    let a = w.hub_request("/v1/submit", &t, request.clone()).unwrap();
    assert_eq!(a["status"], "accepted");
    assert_eq!(w.hub_request("/v1/submit", &t, request.clone()).unwrap(), a);
    let mut conflict = request;
    conflict["items"][0]["quantity"] = json!(3);
    assert!(matches!(
        w.hub_request("/v1/submit", &t, conflict),
        Err(StoreError::OperationConflict)
    ));
    for table in [
        "local_invoices",
        "local_billing_ledger",
        "local_restaurant_tickets",
    ] {
        assert_eq!(
            w.store_for_test()
                .0
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |q| q
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    w.hub_dispatch("operation", 1).unwrap();
    w.hub_dispatch("operation", 1).unwrap();
    assert_eq!(
        w.store_for_test()
            .0
            .query_row("SELECT count(*) FROM local_restaurant_tickets", [], |q| q
                .get::<_, i64>(
                0
            ))
            .unwrap(),
        1
    );
}
#[test]
fn refused_payload_requires_new_identity_and_explicit_price_review() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    let mut r = submission(&w, &i, "bad-price");
    r["items"][0]["expectedPricePaise"] = json!(9000);
    let a = w.hub_request("/v1/submit", &t, r.clone()).unwrap();
    assert_eq!(a["reason"], "price_changed_review_required");
    r["items"][0]["expectedPricePaise"] = json!(10000);
    assert!(w.hub_request("/v1/submit", &t, r.clone()).is_err());
    r["operationId"] = json!("accepted-price");
    assert_eq!(
        w.hub_request("/v1/submit", &t, r).unwrap()["status"],
        "accepted"
    );
}
#[test]
fn stale_revision_and_revoked_devices_are_refused() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    let r = submission(&w, &i, "first");
    w.hub_request("/v1/submit", &t, r).unwrap();
    let r = submission(&w, &i, "stale");
    assert_eq!(
        w.hub_request("/v1/submit", &t, r).unwrap()["reason"],
        "revision_conflict"
    );
    w.hub_device("phone", 2, None).unwrap();
    assert!(w
        .hub_request(
            "/v1/workspace",
            &t,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]})
        )
        .is_err());
}
#[test]
fn foreign_shop_and_unknown_status_never_create_an_order() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    let mut r = submission(&w, &i, "foreign");
    r["businessId"] = json!("foreign");
    assert!(w.hub_request("/v1/submit", &t, r).is_err());
    let status=w.hub_request("/v1/operation",&t,json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"never-sent"})).unwrap();
    assert_eq!(status["status"], "not_found");
    assert_eq!(
        w.store_for_test()
            .0
            .query_row("SELECT count(*) FROM local_restaurant_orders", [], |q| q
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn grant_renewal_fences_previous_staff_sessions() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    let actor = w.local_session().unwrap().principal.id;
    w.store_for_test()
        .0
        .execute(
            "UPDATE local_hub_devices SET expires=0 WHERE id='phone'",
            [],
        )
        .unwrap();
    let body = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]});
    assert!(w.hub_request("/v1/workspace", &t, body.clone()).is_err());
    w.hub_device("phone", 2, Some(&actor)).unwrap();
    assert!(w.hub_request("/v1/workspace", &t, body).is_err());
}
#[test]
fn changed_staff_revision_invalidates_remote_authority() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    let actor = w.local_session().unwrap().principal.id;
    w.store_for_test()
        .0
        .execute(
            "UPDATE local_principals SET revision=revision+1 WHERE id=?1",
            [actor],
        )
        .unwrap();
    assert!(w
        .hub_request(
            "/v1/workspace",
            &t,
            json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"]})
        )
        .is_err());
}

fn kitchen_command(w: &Workspace, i: &Value, id: &str, revision: i64, state: &str) -> Value {
    json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"actorId":w.local_session().unwrap().principal.id,"operationId":id,"ticketId":"hub-operation","expectedRevision":revision,"state":state})
}
fn dispatched(w: &mut Workspace, i: &Value, t: &str) {
    let request = submission(w, i, "operation");
    w.hub_request("/v1/submit", t, request).unwrap();
    w.hub_dispatch("operation", 1).unwrap();
}
#[test]
fn kitchen_transitions_replay_exactly_and_never_post_financial_changes() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    dispatched(&mut w, &i, &t);
    for (n, state) in ["preparing", "ready", "served"].iter().enumerate() {
        let request = kitchen_command(&w, &i, &format!("kitchen-{n}"), n as i64 + 1, state);
        let result = w
            .hub_request("/v1/kitchen-state", &t, request.clone())
            .unwrap();
        assert_eq!(result["status"], "accepted");
        assert_eq!(result["revision"], n as i64 + 2);
        assert_eq!(
            w.hub_request("/v1/kitchen-state", &t, request.clone())
                .unwrap(),
            result
        );
        let recovered=w.hub_request("/v1/operation",&t,json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":request["operationId"]})).unwrap();
        assert_eq!(recovered, result);
        let mut conflict = request;
        conflict["state"] = json!("served");
        if state != &"served" {
            assert!(matches!(
                w.hub_request("/v1/kitchen-state", &t, conflict),
                Err(StoreError::OperationConflict)
            ));
        }
    }
    let db = &w.store_for_test().0;
    for table in ["local_invoices", "local_billing_ledger"] {
        assert_eq!(
            db.query_row(&format!("SELECT count(*) FROM {table}"), [], |q| q
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    assert_eq!(
        db.query_row(
            "SELECT stock_milli FROM local_products WHERE id='pizza'",
            [],
            |q| q.get::<_, i64>(0)
        )
        .unwrap(),
        10000
    );
    assert_eq!(
        db.query_row(
            "SELECT revision FROM local_restaurant_orders WHERE id='order'",
            [],
            |q| q.get::<_, i64>(0)
        )
        .unwrap(),
        2
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM local_restaurant_events", [], |q| q
            .get::<_, i64>(0))
            .unwrap(),
        3
    );
}
#[test]
fn kitchen_conflicts_are_durable_and_invalid_transitions_do_not_advance() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    dispatched(&mut w, &i, &t);
    let invalid = kitchen_command(&w, &i, "skip", 1, "ready");
    assert_eq!(
        w.hub_request("/v1/kitchen-state", &t, invalid).unwrap()["reason"],
        "transition_refused"
    );
    let stale = kitchen_command(&w, &i, "stale-kitchen", 2, "preparing");
    let refusal = w
        .hub_request("/v1/kitchen-state", &t, stale.clone())
        .unwrap();
    assert_eq!(refusal["reason"], "revision_conflict");
    assert_eq!(refusal["state"], "pending");
    let valid = kitchen_command(&w, &i, "valid", 1, "preparing");
    w.hub_request("/v1/kitchen-state", &t, valid).unwrap();
    assert_eq!(
        w.hub_request("/v1/kitchen-state", &t, stale).unwrap(),
        refusal
    );
    assert_eq!(
        w.store_for_test()
            .0
            .query_row(
                "SELECT revision FROM local_restaurant_tickets WHERE id='hub-operation'",
                [],
                |q| q.get::<_, i64>(0)
            )
            .unwrap(),
        2
    );
}
#[test]
fn kitchen_rejects_wrong_shop_revoked_device_and_closed_order() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    dispatched(&mut w, &i, &t);
    let mut wrong = kitchen_command(&w, &i, "foreign-kitchen", 1, "preparing");
    wrong["businessId"] = json!("foreign");
    assert!(w.hub_request("/v1/kitchen-state", &t, wrong).is_err());
    w.store_for_test()
        .0
        .execute(
            "UPDATE local_restaurant_orders SET state='cancelled' WHERE id='order'",
            [],
        )
        .unwrap();
    let closed = kitchen_command(&w, &i, "closed-kitchen", 1, "preparing");
    assert_eq!(
        w.hub_request("/v1/kitchen-state", &t, closed).unwrap()["reason"],
        "order_closed"
    );
    w.hub_device("phone", 2, None).unwrap();
    let revoked = kitchen_command(&w, &i, "revoked-kitchen", 1, "preparing");
    assert!(w.hub_request("/v1/kitchen-state", &t, revoked).is_err());
    assert_eq!(
        w.store_for_test()
            .0
            .query_row(
                "SELECT revision FROM local_restaurant_tickets WHERE id='hub-operation'",
                [],
                |q| q.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
}
#[test]
fn kitchen_cashier_cannot_modify_another_staff_members_order() {
    use crate::identity::{Role, StaffDetails};
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    dispatched(&mut w, &i, &t);
    let cashier = w
        .create_staff(
            StaffDetails {
                username: "waiter".into(),
                display_name: "Waiter".into(),
                role: Role::Cashier,
            },
            PASSWORD,
        )
        .unwrap();
    let credential = "b".repeat(64);
    w.hub_request("/v1/enrol","",json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"waiter-phone","name":"Waiter phone","credential":credential})).unwrap();
    w.hub_device("waiter-phone", 1, Some(&cashier.id)).unwrap();
    let session=w.hub_request("/v1/session",&credential,json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"waiter-phone","username":"waiter","password":PASSWORD})).unwrap();
    let token = session["token"].as_str().unwrap();
    let mut request = kitchen_command(&w, &i, "unauthorised", 1, "preparing");
    request["actorId"] = json!(cashier.id);
    assert_eq!(
        w.hub_request("/v1/kitchen-state", token, request).unwrap()["reason"],
        "assigned_to_other_staff"
    );
    assert_eq!(
        w.store_for_test()
            .0
            .query_row(
                "SELECT revision FROM local_restaurant_tickets WHERE id='hub-operation'",
                [],
                |q| q.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
}
#[test]
fn supervisor_assignment_replays_by_authenticated_device_and_revocation_blocks_recovery() {
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    dispatched(&mut w, &i, &t);
    let actor = w.local_session().unwrap().principal.id;
    let r = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"actorId":actor,"operationId":"mobile-assignment","ticketId":"hub-operation","expectedRevision":1,"targetActorId":actor});
    let result = w.hub_request("/v1/kitchen-assign", &t, r.clone()).unwrap();
    assert_eq!(result["status"], "accepted");
    assert_eq!(
        w.hub_request("/v1/kitchen-assign", &t, r.clone()).unwrap(),
        result
    );
    let status = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"operationId":"mobile-assignment"});
    assert_eq!(
        w.hub_request("/v1/assignment-operation", &t, status.clone())
            .unwrap(),
        result
    );
    let mut changed = r;
    changed["expectedRevision"] = json!(99);
    assert!(w.hub_request("/v1/kitchen-assign", &t, changed).is_err());
    w.hub_device("phone", 2, None).unwrap();
    assert!(w
        .hub_request("/v1/assignment-operation", &t, status)
        .is_err());
    assert_eq!(
        w.store_for_test()
            .0
            .query_row(
                "SELECT revision FROM local_restaurant_tickets WHERE id='hub-operation'",
                [],
                |q| q.get::<_, i64>(0)
            )
            .unwrap(),
        2
    );
}
#[test]
fn non_supervisor_cannot_assign_from_an_approved_mobile_device() {
    use crate::identity::{Role, StaffDetails};
    let mut w = seeded();
    let (i, t) = connect(&mut w);
    dispatched(&mut w, &i, &t);
    let cashier = w
        .create_staff(
            StaffDetails {
                username: "waiter".into(),
                display_name: "Waiter".into(),
                role: Role::Cashier,
            },
            PASSWORD,
        )
        .unwrap();
    let credential = "b".repeat(64);
    w.hub_request("/v1/enrol","",json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"waiter","name":"Waiter phone","credential":credential})).unwrap();
    w.hub_device("waiter", 1, Some(&cashier.id)).unwrap();
    let session=w.hub_request("/v1/session",&credential,json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"deviceId":"waiter","username":"waiter","password":PASSWORD})).unwrap();
    let r = json!({"version":1,"hubId":i["hubId"],"businessId":i["businessId"],"actorId":cashier.id,"operationId":"forbidden-assignment","ticketId":"hub-operation","expectedRevision":1,"targetActorId":cashier.id});
    assert!(w
        .hub_request("/v1/kitchen-assign", session["token"].as_str().unwrap(), r)
        .is_err());
    assert_eq!(
        w.store_for_test()
            .0
            .query_row(
                "SELECT revision FROM local_restaurant_tickets WHERE id='hub-operation'",
                [],
                |q| q.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
}
