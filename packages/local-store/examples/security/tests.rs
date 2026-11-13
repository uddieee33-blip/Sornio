//! Direct JSON command dispatch into the real Workspace/SQLCipher boundary.
//! Not a Tauri/WebView2 execution test. Registry checks keep coverage explicit.
use super::*;
use sornio_local_store::identity::{Role, StaffChange, StaffDetails};
// `json!` comes from the example root through `use super::*`.
use std::collections::BTreeSet;

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Synthetic security test password";
const PUBLIC: &[&str] = &[
    "workspace_access_status",
    "setup_local_access",
    "unlock_workspace",
    "lock_workspace",
];
const ALL: &[&str] = &["owner", "manager", "assistant_manager", "cashier"];
const MANAGE: &[&str] = &["owner", "manager", "assistant_manager"];
const REPORTS: &[&str] = &["owner", "manager"];
const OWNER: &[&str] = &["owner"];
// Permission-derived role sets. KitchenView, KitchenPrepare and Settings are Owner-only in
// Role::allows; Sell is held by every role. Using the derived set means a denial here is
// asserted to be Forbidden at the native boundary, not merely "some error".
const SELL: &[&str] = &["owner", "manager", "assistant_manager", "cashier"];
// Kitchen permissions do NOT follow Role::allows. kitchen_staff::allows grants KitchenView and
// KitchenPrepare to any role that holds Sell, so every role qualifies; only an explicit
// "revoked" kitchen mode takes it away. Getting this wrong made a case expect a Forbidden that
// the native layer never returns, which is exactly the false expectation this test exists to
// prevent - so the sets below are read off the gate, not off intuition.
const KITCHEN: &[&str] = &["owner", "manager", "assistant_manager", "cashier"];
const SETTINGS: &[&str] = &["owner"];
struct Case {
    command: &'static str,
    args: Value,
    allowed: &'static [&'static str],
}
fn cases() -> Vec<Case> {
    let mut out = Vec::new();
    macro_rules! c {
        ($name:literal,$args:expr,$roles:expr) => {
            out.push(Case {
                command: $name,
                args: $args,
                allowed: $roles,
            });
        };
    }
    for command in [
        "read_last_restore",
        "choose_local_backup",
        "export_local_backup",
        "preview_local_backup",
        "restore_local_backup",
    ] {
        out.push(Case { command, args: json!({"currentPassword":PASSWORD,"recoveryPassword":"Independent recovery passphrase","originalPassword":PASSWORD,"confirmation":"RESTORE 123456789abc"}), allowed: OWNER });
    }
    let invoice = json!({"operationId":"sale","lines":[{"productId":"rice","expectedRevision":1,"quantityMilli":1000}],"taxBasisPoints":0,"tender":"cash","customerId":null});
    c!("read_local_session", json!({}), ALL);
    c!(
        "change_local_password",
        json!({"currentPassword":PASSWORD,"newPassword":"Synthetic replacement password"}),
        ALL
    );
    c!(
        "reset_local_staff_password",
        json!({"id":"target","expectedRevision":1,"ownerPassword":PASSWORD,"newPassword":"Synthetic replacement password"}),
        OWNER
    );
    c!("load_workspace", json!({}), ALL);
    c!(
        "save_workspace",
        json!({"expectedRevision":0,"draft":{"businessName":"Shop","businessType":"general","note":"Private"}}),
        OWNER
    );
    c!("list_workspace_copies", json!({}), OWNER);
    c!(
        "restore_workspace",
        json!({"expectedRevision":1,"sourceRevision":1}),
        OWNER
    );
    c!("list_local_products", json!({}), ALL);
    c!(
        "add_local_product",
        json!({"request":{"operationId":"rice","name":"Rice","sku":"RICE","unit":"kg","unitPricePaise":100,"openingStockMilli":1000}}),
        MANAGE
    );
    c!(
        "adjust_local_stock",
        json!({"request":{"operationId":"adjust","productId":"rice","expectedRevision":1,"deltaMilli":1000,"reason":"Count"}}),
        REPORTS
    );
    c!("pending_local_inventory", json!({}), ALL);
    c!(
        "acknowledge_local_inventory",
        json!({"operationId":"rice"}),
        ALL
    );
    c!("read_cashier_state", json!({}), ALL);
    c!("prepare_local_checkout", json!({"request":invoice}), ALL);
    c!("post_local_invoice", json!({"request":invoice}), ALL);
    c!(
        "clear_local_checkout",
        json!({"operationId":"sale","saved":false}),
        ALL
    );
    c!("read_local_invoice", json!({"invoiceId":"sale"}), ALL);
    c!("list_local_invoices", json!({"after":0}), REPORTS);
    c!("read_billing_outbox", json!({"after":0}), OWNER);
    c!("list_local_staff", json!({}), OWNER);
    c!(
        "create_local_staff",
        json!({"details":{"username":"newstaff","displayName":"Staff","role":"manager"},"password":PASSWORD}),
        OWNER
    );
    c!(
        "change_local_staff",
        json!({"change":{"id":"target","expectedRevision":1,"role":"cashier","enabled":false}}),
        OWNER
    );
    c!("read_identity_audit", json!({"after":0}), OWNER);
    let customer = json!({"operationId":"customer","id":"customer","name":"Name","phone":null,"creditLimitPaise":null,"creditDays":30,"expectedRevision":null});
    c!("save_local_customer", json!({"r":customer}), MANAGE);
    for overdue in [false, true] {
        c!(
            "find_local_customers",
            json!({"search":"","overdueOnly":overdue}),
            if overdue { REPORTS } else { ALL }
        );
    }
    for kind in ["repayment", "opening_due", "write_off", "reversal"] {
        let credit = json!({"operationId":"collect","customerId":"customer","expectedRevision":1,"kind":kind,"amountPaise":100,"reason":"Correction","dueOn":null,"reverseOf":null});
        c!(
            "prepare_local_credit",
            json!({"r":credit}),
            if kind == "repayment" { ALL } else { OWNER }
        );
        c!(
            "post_local_credit",
            json!({"r":credit}),
            if kind == "repayment" { ALL } else { OWNER }
        );
    }
    c!("pending_local_credit", json!({}), ALL);
    c!(
        "clear_local_credit",
        json!({"operationId":"collect","saved":false}),
        ALL
    );
    c!(
        "link_local_credit",
        json!({"r":{"operationId":"link","invoiceId":"sale","customerId":"customer","sourceRevision":1,"targetRevision":1,"reason":"Correction"}}),
        OWNER
    );
    c!(
        "read_customer_statement",
        json!({"customerId":"customer","after":0,"through":null}),
        ALL
    );
    c!(
        "render_customer_statement",
        json!({"customerId":"customer","through":null}),
        ALL
    );
    let actions = [
        (json!({"kind":"sale","invoice":invoice,"payments":[]}), ALL),
        (
            json!({"kind":"match","paymentId":"payment","expectedRevision":1,"reference":"BANK123456","statementAmountPaise":100,"evidence":"Statement"}),
            REPORTS,
        ),
        (
            json!({"kind":"reverse_match","paymentId":"payment","expectedRevision":1,"reason":"Correction"}),
            REPORTS,
        ),
        (
            json!({"kind":"return","invoiceId":"sale","expectedRevision":1,"lines":[],"refunds":[],"reason":"Return"}),
            REPORTS,
        ),
        (
            json!({"kind":"match_refund","refundId":"refund","expectedRevision":1,"reference":"BANK123456","statementAmountPaise":100,"evidence":"Statement"}),
            REPORTS,
        ),
        (
            json!({"kind":"float","day":"2026-10-29","username":"owner","amountPaise":100}),
            REPORTS,
        ),
        (
            json!({"kind":"correct_float","openingId":"opening","amountPaise":100,"reason":"Correction"}),
            REPORTS,
        ),
        (
            json!({"kind":"close","day":"2026-10-29","username":"owner","through":0,"countedPaise":100}),
            ALL,
        ),
        (
            json!({"kind":"correct_close","closingId":"closing","countedPaise":100,"reason":"Correction"}),
            REPORTS,
        ),
        (
            json!({"kind":"reopen","closingId":"closing","reason":"Correction"}),
            REPORTS,
        ),
    ];
    for (action, roles) in actions {
        let r = json!({"operationId":"retail","action":action});
        c!("prepare_local_retail", json!({"r":r}), roles);
        c!("post_local_retail", json!({"r":r}), roles);
    }
    c!(
        "clear_local_retail",
        json!({"operationId":"retail","saved":false}),
        ALL
    );
    c!(
        "read_local_retail",
        json!({"day":"2026-10-29","username":"owner","invoiceId":null}),
        ALL
    );
    c!(
        "quote_local_return",
        json!({"invoiceId":"sale","lines":[]}),
        REPORTS
    );
    c!(
        "take_over_local_payment",
        json!({"operationId":"retail","reason":"Recovery"}),
        OWNER
    );
    c!(
        "export_local_settlements",
        json!({"day":"2026-10-29"}),
        REPORTS
    );

    // Restaurant, kitchen, hub and held-bill coverage. Every payload below uses the real
    // domain shape, because each command reaches its permission gate before its payload is
    // interpreted - a malformed payload would fail deserialisation and prove nothing.
    // Field names follow the frontend contract exactly: variant fields are snake_case
    // (expected_revision) while the surrounding structs are camelCase. create_table is flat.
    let table = json!({"operationId":"restaurant","action":{"kind":"create_table","id":"t1","name":"Table 1"}});
    c!("change_restaurant", json!({"r":table}), SELL);
    c!(
        "change_restaurant",
        json!({"r":{"operationId":"restaurant","action":{"kind":"set_ticket_state","id":"ticket","expected_revision":1,"state":"ready"}}}),
        KITCHEN
    );
    c!("read_restaurant", json!({}), KITCHEN);
    c!("restaurant_workspace", json!({}), KITCHEN);
    c!("restaurant_live", json!({}), KITCHEN);
    c!(
        "restaurant_status",
        json!({"order":"order-1"}),
        SELL
    );
    c!("restaurant_menu", json!({}), SELL);
    c!(
        "edit_restaurant",
        json!({"order":"order-1","expected":1}),
        SELL
    );
    c!(
        "amend_restaurant",
        json!({"r":{"orderId":"order-1","expectedRevision":1,"attemptId":"amend-1","lines":[],"taxBasisPoints":0,"customerId":null,"payments":[],"acceptPrices":false}}),
        SELL
    );
    c!(
        "takeover_restaurant",
        json!({"order":"order-1","expected":1,"target":"owner"}),
        SETTINGS
    );
    c!(
        "prepare_restaurant",
        json!({"r":{"orderId":"order-1","expectedRevision":1,"operationId":"restaurant-1","taxBasisPoints":0,"customerId":null,"payments":[]}}),
        SELL
    );
    c!(
        "post_restaurant",
        json!({"order":"order-1","attempt":"restaurant-1"}),
        SELL
    );
    c!(
        "save_restaurant_menu",
        json!({"m":{"id":"m1","productId":"rice","category":"main","label":"Rice","variant":"regular","available":true}}),
        SETTINGS
    );

    // Kitchen: viewing tickets is KitchenView; mutating them is KitchenView/KitchenPrepare.
    // A cashier holds neither, so kitchen staff can never reach a financial permission here.
    c!("kitchen_view", json!({}), KITCHEN);
    c!(
        "kitchen_action",
        json!({"a":{"kind":"assign","order_id":"order-1","expected_revision":1,"actor_id":"employee-1"}}),
        KITCHEN
    );

    // Hub and device administration.
    c!("hub_live", json!({}), SETTINGS);
    c!("hub_admin", json!({}), SETTINGS);
    c!("hub_batches", json!({}), SELL);
    c!(
        "hub_dispatch",
        json!({"id":"batch-1","revision":1}),
        SELL
    );
    c!(
        "hub_device",
        json!({"id":"device-1","revision":1,"actor":null}),
        SETTINGS
    );
    c!(
        "hub_control",
        json!({"enabled":false,"address":"127.0.0.1:0","origin":null}),
        SETTINGS
    );
    c!("hub_import_tls", json!({}), SETTINGS);

    // Held bills and customer reads.
    c!("list_local_held_bills", json!({}), SELL);
    c!(
        "mutate_local_held_bill",
        json!({"r":{"id":"held-1","expectedRevision":1,"action":{"kind":"resume"}}}),
        SELL
    );
    c!(
        "prepare_local_held_checkout",
        json!({"r":{"id":"held-1","expectedRevision":1,"invoice":{"operationId":"held-sale","lines":[],"taxBasisPoints":0,"tender":"cash","customerId":null},"payments":null}}),
        SELL
    );
    c!(
        "read_local_customer",
        json!({"customerId":"customer-1"}),
        // CustomerRead: every role holds it, so the negative case here is scope and session,
        // covered by the locked/wrong-workspace tests rather than a role denial.
        ALL
    );

    out
}
fn owner(path: &std::path::Path) -> Workspace {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.provision_owner(
        OwnerSetup {
            business_name: "Synthetic".into(),
            business_type: "general".into(),
            display_name: "Owner".into(),
            username: "owner".into(),
        },
        PASSWORD,
    )
    .unwrap();
    w
}
fn invoke(w: &mut Workspace, c: &Case, scope: &Scope) -> Result<Value, StoreError> {
    let mut args = c.args.clone();
    args["scope"] = serde_json::to_value(scope).unwrap();
    call(
        w,
        Call {
            command: c.command.into(),
            args,
        },
    )
}
#[test]
fn every_registered_command_has_an_explicit_security_case_and_scoped_wrapper() {
    let source = include_str!("../../../../apps/desktop/src-tauri/src/main.rs");
    let registered: BTreeSet<_> = source
        .split("#[tauri::command]")
        .skip(1)
        .map(|part| {
            part.split("async fn ")
                .nth(1)
                .unwrap()
                .split('(')
                .next()
                .unwrap()
                .trim()
        })
        .collect();
    let covered: BTreeSet<_> = cases()
        .iter()
        .map(|c| c.command)
        .chain(PUBLIC.iter().copied())
        .collect();
    assert_eq!(
        registered, covered,
        "New native commands need explicit negative cases"
    );
    println!("security inventory: {} native commands; {} public entry points; {} sensitive request variants", registered.len(), PUBLIC.len(), cases().len());
    let manifest = include_str!("../../../../apps/desktop/src-tauri/build.rs");
    let permissions = include_str!("../../../../apps/desktop/src-tauri/permissions/workspace.toml");
    let permitted: BTreeSet<_> = permissions
        .lines()
        .filter(|line| line.starts_with("commands.allow ="))
        .flat_map(|line| line.split('"').skip(1).step_by(2))
        .collect();
    assert_eq!(
        registered, permitted,
        "Capability command list must match audited registry"
    );
    for name in &registered {
        assert!(
            manifest.contains(&format!("\"{name}\"")),
            "{name} missing from build manifest"
        );
    }
    for part in source.split("#[tauri::command]").skip(1) {
        let name = part
            .split("async fn ")
            .nth(1)
            .unwrap()
            .split('(')
            .next()
            .unwrap()
            .trim();
        if !PUBLIC.contains(&name) && name != "read_local_session" {
            // Commands that also drive native runtime state (the hub listener, the live
            // discovery address) cannot use the closing helper, but they must still prove
            // their own scope check. A blanket name exception would let a future unscoped
            // command hide here, so each must call verify_scope - or verify_live_scope, which
            // additionally demands View - explicitly.
            let self_scoped = part.contains("verify_scope(&scope)")
                || part.contains("verify_live_scope(&scope)")
                || part.contains("w.run_scoped(&scope");
            assert!(
                part.contains("with_scoped_workspace(")
                    || ([
                        "choose_local_backup",
                        "preview_local_backup",
                        "restore_local_backup"
                    ]
                    .contains(&name)
                        && part.contains("with_recovery_workspace("))
                    || self_scoped,
                "{name} must use native scope enforcement"
            );
        }
    }
}
#[test]
fn capability_is_local_only_and_no_generic_database_or_reset_command_exists() {
    let capability: Value = serde_json::from_str(include_str!(
        "../../../../apps/desktop/src-tauri/capabilities/local-workspace.json"
    ))
    .unwrap();
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none());
    assert_eq!(
        capability["permissions"],
        json!([
            "workspace-drafts",
            "local-stock",
            "local-billing",
            "local-identity",
            "local-customers",
            "local-retail",
            "local-recovery"
        ])
    );
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    let scope = w.local_session().unwrap().scope;
    for command in [
        "execute_sql",
        "open_database",
        "read_database_key",
        "reset_owner_password",
        "restore_without_password",
    ] {
        assert!(
            matches!(
                call(
                    &mut w,
                    Call {
                        command: command.into(),
                        args: json!({"scope":scope})
                    }
                ),
                Err(StoreError::InvalidInvoice)
            ),
            "Unexpected capability: {command}"
        );
    }
    for day in [
        "../escape",
        "2026-10-29/escape",
        "2026-10-29\\escape",
        "2026-10-29\0",
    ] {
        assert!(w.export_retail(day).is_err());
    }
}
#[test]
fn locked_wrong_business_and_disabled_staff_are_denied_for_every_sensitive_command() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut admin = owner(&path);
    let scope = admin.local_session().unwrap().scope;
    let p = admin
        .create_staff(
            StaffDetails {
                username: "cashier".into(),
                display_name: "Cashier".into(),
                role: Role::Cashier,
            },
            PASSWORD,
        )
        .unwrap();
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.login("cashier", PASSWORD).unwrap();
    for c in cases() {
        if c.command != "read_local_session" {
            let wrong = Scope {
                business_id: "other-business".into(),
                workspace_id: scope.workspace_id.clone(),
            };
            assert!(
                matches!(
                    invoke(&mut w, &c, &wrong),
                    Err(StoreError::WorkspaceMismatch)
                ),
                "{}",
                c.command
            );
            let wrong = Scope {
                business_id: scope.business_id.clone(),
                workspace_id: "other-workspace".into(),
            };
            assert!(
                matches!(
                    invoke(&mut w, &c, &wrong),
                    Err(StoreError::WorkspaceMismatch)
                ),
                "{}",
                c.command
            );
        }
    }
    admin
        .change_staff(StaffChange {
            id: p.id,
            expected_revision: p.revision,
            role: Role::Cashier,
            enabled: false,
        })
        .unwrap();
    for c in cases() {
        assert!(
            matches!(invoke(&mut w, &c, &scope), Err(StoreError::Locked)),
            "disabled: {}",
            c.command
        );
    }
    w.lock();
    for c in cases() {
        assert!(
            matches!(invoke(&mut w, &c, &scope), Err(StoreError::Locked)),
            "locked: {}",
            c.command
        );
    }
}
#[test]
fn role_denials_use_direct_backend_calls_including_all_financial_action_variants() {
    for (name, role) in [
        ("manager", Role::Manager),
        ("assistant_manager", Role::AssistantManager),
        ("cashier", Role::Cashier),
    ] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut w = owner(&path);
        let scope = w.local_session().unwrap().scope;
        w.create_staff(
            StaffDetails {
                username: name.into(),
                display_name: name.into(),
                role,
            },
            PASSWORD,
        )
        .unwrap();
        w.login(name, PASSWORD).unwrap();
        for c in cases() {
            if !c.allowed.contains(&name) {
                let result = invoke(&mut w, &c, &scope);
                assert!(
                    matches!(result, Err(StoreError::Forbidden)),
                    "{name} {} must be forbidden; got error class {:?}",
                    c.command,
                    result.err().map(|e| std::mem::discriminant(&e))
                );
            }
        }
    }
}
/// The coverage cases above prove denials. This proves the other half: an actor who is
/// genuinely permitted can drive a real restaurant flow end to end, so a green suite is not
/// just a suite of refusals. The owner creates the table (create_table needs Settings, which
/// Manager does not hold by design), then a manager runs the selling flow.
#[test]
fn authorised_kitchen_and_restaurant_operations_really_succeed() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    let scope = w.local_session().unwrap().scope;
    w.create_staff(
        StaffDetails {
            username: "manager".into(),
            display_name: "Manager".into(),
            role: Role::Manager,
        },
        PASSWORD,
    )
    .unwrap();

    // Table setup is an owner responsibility, and the operation id must be a plain id: an id
    // built from formatted JSON would contain quotes and be rejected before the action runs.
    let table = json!({"operationId":"op-table","action":{"kind":"create_table","id":"t1","name":"Table 1"}});
    call(
        &mut w,
        Call {
            command: "change_restaurant".into(),
            args: json!({"r":table,"scope":scope}),
        },
    )
    .expect("an owner must be able to create a table");

    // send_ticket re-prices every line from the catalogue, so a real product and a menu entry
    // mapped to it must exist first. Without these the command fails on the lookup rather than
    // on anything the test is trying to prove.
    call(
        &mut w,
        Call {
            command: "add_local_product".into(),
            args: json!({"request":{"operationId":"rice","name":"Rice","sku":"RICE","unit":"kg",
                                    "unitPricePaise":10000,"openingStockMilli":10000},
                        "scope":scope}),
        },
    )
    .expect("an owner holds AddItem and must be able to add a product");
    call(
        &mut w,
        Call {
            command: "save_restaurant_menu".into(),
            args: json!({"m":{"id":"m-rice","productId":"rice","category":"main","label":"Rice",
                              "variant":"","available":true},
                        "scope":scope}),
        },
    )
    .expect("an owner holds Settings and must be able to save the menu");

    w.lock();
    w.login("manager", PASSWORD).unwrap();
    for action in [
        json!({"kind":"open_order","id":"order-1","table_id":"t1"}),
        json!({"kind":"send_ticket","id":"ticket-1","order_id":"order-1","expected_revision":1,
               "items":[{"name":"Rice","quantity":1,"note":"","productId":"rice"}]}),
    ] {
        let kind = action["kind"].as_str().unwrap().to_string();
        let r = json!({"operationId":format!("op-table-{kind}"), "action":action});
        call(
            &mut w,
            Call {
                command: "change_restaurant".into(),
                args: json!({"r":r,"scope":scope}),
            },
        )
        .unwrap_or_else(|e| panic!("{kind} must succeed for a manager: {e}"));
    }

    // The ticket really exists, so the transition below exercises the authoritative path rather
    // than failing on a missing row - which is what a superficial green would have looked like.
    let state = invoke(
        &mut w,
        &Case {
            command: "kitchen_view",
            args: json!({}),
            allowed: ALL,
        },
        &scope,
    )
    .unwrap();
    assert!(
        state["tickets"].as_array().is_some_and(|t| !t.is_empty()),
        "the ticket created above must be visible to kitchen staff"
    );

    let r = json!({"operationId":"op-prep","action":{"kind":"set_ticket_state","id":"ticket-1","expected_revision":1,"state":"preparing"}});
    call(
        &mut w,
        Call {
            command: "change_restaurant".into(),
            args: json!({"r":r,"scope":scope}),
        },
    )
    .expect("a manager holds KitchenPrepare, so marking a ticket preparing must succeed");

    // A stale revision on the same ticket must be refused, so the success above is not merely
    // an operation that silently tolerates any input.
    let stale = json!({"operationId":"op-stale","action":{"kind":"set_ticket_state","id":"ticket-1","expected_revision":1,"state":"ready"}});
    assert!(
        call(
            &mut w,
            Call {
                command: "change_restaurant".into(),
                args: json!({"r":stale,"scope":scope}),
            },
        )
        .is_err(),
        "a stale ticket revision must not be accepted after the ticket moved on"
    );
}
/// Kitchen grants must never widen access. A cashier given a kitchen mode is restricted to the
/// kitchen permissions and gains nothing financial; and no one may grant themselves a mode.
#[test]
fn kitchen_grants_cannot_escalate_financial_permissions() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    let owner_id = w.local_session().unwrap().principal.id;
    let cook = w
        .create_staff(
            StaffDetails {
                username: "cook".into(),
                display_name: "Cook".into(),
                role: Role::Cashier,
            },
            PASSWORD,
        )
        .unwrap();

    // An owner may grant a supervisor mode to somebody else.
    w.kitchen_action(sornio_local_store::kitchen::Action::Staff {
        operation_id: "grant".into(),
        actor_id: cook.id.clone(),
        expected_revision: 1,
        mode: "supervisor".into(),
    })
    .unwrap();

    // But not to themselves - self-escalation is refused outright.
    assert!(
        w.kitchen_action(sornio_local_store::kitchen::Action::Staff {
            operation_id: "self".into(),
            actor_id: owner_id,
            expected_revision: 1,
            mode: "supervisor".into(),
        })
        .is_err(),
        "an actor must not grant themselves a kitchen responsibility"
    );

    // With a kitchen mode the cook is kitchen-only: the supervisory grant must not carry any
    // permission that touches money, stock or staff.
    w.lock();
    w.login("cook", PASSWORD).unwrap();
    assert!(
        w.save_customer(sornio_local_store::customers::SaveCustomer {
            operation_id: "cust".into(),
            id: "customer-1".into(),
            name: "Customer".into(),
            phone: None,
            credit_limit_paise: None,
            credit_days: 30,
            expected_revision: None,
        })
        .is_err(),
        "a kitchen-only cashier must not gain customer policy rights through a kitchen grant"
    );
}
#[test]
fn injection_is_data_and_spoofed_authority_is_rejected() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = owner(&path);
    let scope = w.local_session().unwrap().scope;
    w.create_staff(
        StaffDetails {
            username: "cashier".into(),
            display_name: "Cashier".into(),
            role: Role::Cashier,
        },
        PASSWORD,
    )
    .unwrap();
    w.login("cashier", PASSWORD).unwrap();
    let mut args = json!({"scope":scope,"role":"owner","actorId":"owner","details":{"username":"escalate","displayName":"Staff","role":"owner"},"password":PASSWORD});
    assert!(matches!(
        call(
            &mut w,
            Call {
                command: "create_local_staff".into(),
                args: args.clone()
            }
        ),
        Err(StoreError::Forbidden)
    ));
    args = json!({"scope":scope,"search":"'; DROP TABLE local_principals; --","overdueOnly":false});
    assert!(call(
        &mut w,
        Call {
            command: "find_local_customers".into(),
            args
        }
    )
    .is_ok());
    w.lock();
    assert!(matches!(
        w.login("owner' OR 1=1 --", PASSWORD),
        Err(StoreError::InvalidIdentity)
    ));
    assert!(w.login("owner", PASSWORD).unwrap().unlocked);
    assert_eq!(w.list_staff().unwrap().len(), 2);
}

#[test]
fn public_bootstrap_cannot_replace_an_existing_owner_or_accept_wrong_credentials() {
    let d = tempfile::tempdir().unwrap();
    let mut w = owner(&d.path().join("s.db"));
    let scope = w.local_session().unwrap().scope;
    w.lock();
    let attempt = Call {
        command: "setup_local_access".into(),
        args: json!({"setup":{"businessName":"Replacement","businessType":"general","displayName":"Replacement","username":"replacement"},"password":PASSWORD}),
    };
    assert!(matches!(
        call(&mut w, attempt),
        Err(StoreError::AccessConfigured)
    ));
    assert!(matches!(
        call(
            &mut w,
            Call {
                command: "unlock_workspace".into(),
                args: json!({"username":"owner","password":"wrong synthetic password"})
            }
        ),
        Err(StoreError::IncorrectPassword)
    ));
    assert!(matches!(w.local_session(), Err(StoreError::Locked)));
    w.login("owner", PASSWORD).unwrap();
    assert_eq!(w.local_session().unwrap().scope, scope);
    assert_eq!(w.list_staff().unwrap().len(), 1);
}
