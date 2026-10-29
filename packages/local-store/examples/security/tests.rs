//! Direct JSON command dispatch into the real Workspace/SQLCipher boundary.
//! Not a Tauri/WebView2 execution test. Registry checks keep coverage explicit.
use super::*;
use sornio_local_store::identity::{Role, StaffChange, StaffDetails};
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
    let invoice = json!({"operationId":"sale","lines":[{"productId":"rice","expectedRevision":1,"quantityMilli":1000}],"taxBasisPoints":0,"tender":"cash","customerId":null});
    c!("read_local_session", json!({}), ALL);
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
            assert!(
                part.contains("with_scoped_workspace("),
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
            "local-retail"
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
