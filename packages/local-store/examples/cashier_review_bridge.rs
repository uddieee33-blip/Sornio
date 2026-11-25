//! Test-only JSON-lines transport for React -> real Workspace/SQLCipher integration.
//! This synthetic-key fixture is not included in the shipped Tauri application.
use serde::Deserialize;
use serde_json::{json, Value};
use sornio_local_store::{
    access::Workspace,
    billing::PostInvoice,
    catalog::{AddProduct, AdjustStock},
    customers::{CreditRequest, LinkCredit, SaveCustomer},
    identity::{OwnerSetup, Scope, StaffChange, StaffDetails},
    Draft, Store, StoreError,
};
use std::io::{self, BufRead, Write};

#[cfg(test)]
#[path = "security/tests.rs"]
mod security_command_tests;

#[derive(Deserialize)]
struct Call {
    command: String,
    #[serde(default)]
    args: Value,
}
fn argument<T: serde::de::DeserializeOwned>(args: &Value, key: &str) -> Result<T, StoreError> {
    Ok(serde_json::from_value(args[key].clone())?)
}
thread_local! { static BACKUP_PREVIEW: std::cell::RefCell<Option<sornio_local_store::recovery::BackupPreview>> = const { std::cell::RefCell::new(None) }; }
fn recovery_dispatch(w: &mut Workspace, c: Call) -> Result<Value, StoreError> {
    BACKUP_PREVIEW.with(|p| {
        let mut preview = p.borrow_mut();
        let a = &c.args;
        Ok(match c.command.as_str() {
            "read_last_restore" => serde_json::to_value(w.last_restore()?)?,
            "choose_local_backup" => {
                *preview = None;
                serde_json::json!("synthetic.sorniobackup")
            }
            "export_local_backup" => {
                let path = std::path::PathBuf::from(
                    std::env::var_os("SORNIO_REVIEW_BACKUP").ok_or(StoreError::BackupStorage)?,
                );
                serde_json::to_value(w.export_backup(
                    &path,
                    &argument::<String>(a, "currentPassword")?,
                    &argument::<String>(a, "recoveryPassword")?,
                )?)?
            }
            "preview_local_backup" => {
                *preview = None;
                let path = std::path::PathBuf::from(
                    std::env::var_os("SORNIO_REVIEW_BACKUP").ok_or(StoreError::BackupStorage)?,
                );
                let result = w.preview_backup(
                    &path,
                    &argument::<String>(a, "currentPassword")?,
                    &argument::<String>(a, "recoveryPassword")?,
                    &argument::<String>(a, "originalPassword")?,
                )?;
                *preview = Some(result.clone());
                serde_json::to_value(result)?
            }
            "restore_local_backup" => {
                let path = std::path::PathBuf::from(
                    std::env::var_os("SORNIO_REVIEW_BACKUP").ok_or(StoreError::BackupStorage)?,
                );
                let expected = preview.take().ok_or(StoreError::RecoveryChanged)?;
                serde_json::to_value(w.restore_backup(
                    &path,
                    path.parent().unwrap(),
                    &argument::<String>(a, "currentPassword")?,
                    &argument::<String>(a, "recoveryPassword")?,
                    &argument::<String>(a, "originalPassword")?,
                    &expected,
                    &argument::<String>(a, "confirmation")?,
                )?)?
            }

            _ => return Err(StoreError::InvalidInvoice),
        })
    })
}
fn call(w: &mut Workspace, c: Call) -> Result<Value, StoreError> {
    if [
        "read_last_restore",
        "choose_local_backup",
        "export_local_backup",
        "preview_local_backup",
        "restore_local_backup",
    ]
    .contains(&c.command.as_str())
    {
        if w.status()?.configured {
            let scope = argument::<Scope>(&c.args, "scope")?;
            return w.run_scoped(&scope, |w| {
                w.require(sornio_local_store::identity::Permission::Settings)?;
                recovery_dispatch(w, c)
            });
        }
        if ![
            "choose_local_backup",
            "preview_local_backup",
            "restore_local_backup",
        ]
        .contains(&c.command.as_str())
            || c.args.get("scope").is_some_and(|v| !v.is_null())
        {
            return Err(StoreError::Locked);
        }
        return recovery_dispatch(w, c);
    }
    if ![
        "workspace_access_status",
        "read_local_session",
        "setup_local_access",
        "unlock_workspace",
        "lock_workspace",
    ]
    .contains(&c.command.as_str())
    {
        let scope = argument::<Scope>(&c.args, "scope")?;
        return w.run_scoped(&scope, move |w| dispatch(w, c));
    }
    dispatch(w, c)
}
fn dispatch(w: &mut Workspace, c: Call) -> Result<Value, StoreError> {
    let a = &c.args;
    Ok(match c.command.as_str() {
        "change_local_password" => {
            w.change_password(
                &argument::<String>(a, "currentPassword")?,
                &argument::<String>(a, "newPassword")?,
            )?;
            Value::Null
        }
        "reset_local_staff_password" => serde_json::to_value(w.reset_staff_password(
            &argument::<String>(a, "id")?,
            argument(a, "expectedRevision")?,
            &argument::<String>(a, "ownerPassword")?,
            &argument::<String>(a, "newPassword")?,
        )?)?,
        "list_local_held_bills" => serde_json::to_value(w.list_held_bills()?)?,
        "mutate_local_held_bill" => serde_json::to_value(w.mutate_held_bill(argument(a, "r")?)?)?,
        "prepare_local_held_checkout" => {
            w.prepare_held_checkout(argument(a, "r")?)?;
            Value::Null
        }
        "prepare_local_retail" => {
            w.prepare_retail(argument(a, "r")?)?;
            Value::Null
        }
        "post_local_retail" => serde_json::to_value(w.post_retail(argument(a, "r")?)?)?,
        "clear_local_retail" => {
            w.clear_retail(
                &argument::<String>(a, "operationId")?,
                argument(a, "saved")?,
            )?;
            Value::Null
        }
        "read_local_retail" => serde_json::to_value(w.retail_view(
            &argument::<String>(a, "day")?,
            &argument::<String>(a, "username")?,
            argument::<Option<String>>(a, "invoiceId")?.as_deref(),
        )?)?,
        "quote_local_return" => serde_json::to_value(w.quote_retail_return(
            &argument::<String>(a, "invoiceId")?,
            &argument::<Vec<sornio_local_store::payments::ReturnLine>>(a, "lines")?,
        )?)?,
        "take_over_local_payment" => serde_json::to_value(w.takeover_payment(
            &argument::<String>(a, "operationId")?,
            &argument::<String>(a, "reason")?,
        )?)?,
        "export_local_settlements" => {
            let e = w.export_retail(&argument::<String>(a, "day")?)?;
            serde_json::json!({"fileName":e.file_name,"csv":e.csv,"path":"synthetic-test-export.csv"})
        }
        "save_local_customer" => {
            serde_json::to_value(w.save_customer(argument::<SaveCustomer>(a, "r")?)?)?
        }
        "read_local_customer" => {
            serde_json::to_value(w.read_customer(&argument::<String>(a, "customerId")?)?)?
        }
        "find_local_customers" => serde_json::to_value(w.find_customers(
            &argument::<String>(a, "search")?,
            argument(a, "overdueOnly")?,
        )?)?,
        "prepare_local_credit" => {
            w.prepare_credit(argument::<CreditRequest>(a, "r")?)?;
            Value::Null
        }
        "post_local_credit" => {
            serde_json::to_value(w.post_credit(argument::<CreditRequest>(a, "r")?)?)?
        }
        "pending_local_credit" => serde_json::to_value(w.pending_credit()?)?,
        "clear_local_credit" => {
            w.clear_credit(
                &argument::<String>(a, "operationId")?,
                argument(a, "saved")?,
            )?;
            Value::Null
        }
        "link_local_credit" => {
            serde_json::to_value(w.link_credit(argument::<LinkCredit>(a, "r")?)?)?
        }
        "read_customer_statement" => serde_json::to_value(w.customer_statement(
            &argument::<String>(a, "customerId")?,
            argument(a, "after")?,
            argument(a, "through")?,
        )?)?,
        "render_customer_statement" => serde_json::to_value(w.print_customer_statement(
            &argument::<String>(a, "customerId")?,
            argument(a, "through")?,
        )?)?,
        "read_local_session" => serde_json::to_value(w.local_session()?)?,
        "list_local_staff" => serde_json::to_value(w.list_staff()?)?,
        "create_local_staff" => serde_json::to_value(w.create_staff(
            argument::<StaffDetails>(a, "details")?,
            &argument::<String>(a, "password")?,
        )?)?,
        "change_local_staff" => {
            serde_json::to_value(w.change_staff(argument::<StaffChange>(a, "change")?)?)?
        }
        "read_identity_audit" => serde_json::to_value(w.identity_audit(argument(a, "after")?)?)?,
        "workspace_access_status" => serde_json::to_value(w.status()?)?,
        "setup_local_access" => serde_json::to_value(w.provision_owner(
            argument::<OwnerSetup>(a, "setup")?,
            &argument::<String>(a, "password")?,
        )?)?,
        "unlock_workspace" => serde_json::to_value(w.login(
            &argument::<String>(a, "username")?,
            &argument::<String>(a, "password")?,
        )?)?,
        "lock_workspace" => {
            w.lock();
            Value::Null
        }
        "save_workspace" => serde_json::to_value(w.save(
            argument(a, "expectedRevision")?,
            argument::<Draft>(a, "draft")?,
        )?)?,
        "restore_workspace" => serde_json::to_value(w.restore(
            argument(a, "expectedRevision")?,
            argument(a, "sourceRevision")?,
        )?)?,
        "read_billing_outbox" => serde_json::to_value(w.billing_outbox(argument(a, "after")?)?)?,
        "load_workspace" => serde_json::to_value(w.load()?)?,
        "list_workspace_copies" => serde_json::to_value(w.saved_copies()?)?,
        "list_local_products" => serde_json::to_value(w.list_products()?)?,
        "add_local_product" => {
            serde_json::to_value(w.add_product(argument::<AddProduct>(a, "request")?)?)?
        }
        "adjust_local_stock" => {
            serde_json::to_value(w.adjust_stock(argument::<AdjustStock>(a, "request")?)?)?
        }
        "pending_local_inventory" => serde_json::to_value(w.pending_inventory()?)?,
        "acknowledge_local_inventory" => {
            w.acknowledge_inventory(&argument::<String>(a, "operationId")?)?;
            Value::Null
        }
        "read_cashier_state" => serde_json::to_value(w.cashier_state()?)?,
        "prepare_local_checkout" => {
            w.prepare_checkout(argument::<PostInvoice>(a, "request")?)?;
            Value::Null
        }
        "post_local_invoice" => {
            serde_json::to_value(w.post_prepared_invoice(argument::<PostInvoice>(a, "request")?)?)?
        }
        "clear_local_checkout" => {
            w.clear_checkout(
                &argument::<String>(a, "operationId")?,
                argument::<bool>(a, "saved")?,
            )?;
            Value::Null
        }
        "read_local_invoice" => {
            serde_json::to_value(w.read_invoice(&argument::<String>(a, "invoiceId")?)?)?
        }
        "list_local_invoices" => serde_json::to_value(w.list_invoices(argument(a, "after")?)?)?,
        // Restaurant, kitchen, hub and held-bill surfaces. These arms exist so the security
        // harness exercises the real Workspace method - and therefore the real permission and
        // scope checks - instead of erroring on a missing arm, which would prove nothing.
        "list_local_held_bills" => serde_json::to_value(w.list_held_bills()?)?,
        "mutate_local_held_bill" => serde_json::to_value(w.mutate_held_bill(argument(a, "r")?)?)?,
        "prepare_local_held_checkout" => {
            w.prepare_held_checkout(argument(a, "r")?)?;
            Value::Null
        }
        "read_local_customer" => {
            serde_json::to_value(w.read_customer(&argument::<String>(a, "customerId")?)?)?
        }
        "restaurant_live" => serde_json::to_value(w.restaurant_live()?)?,
        "restaurant_workspace" => serde_json::to_value(w.restaurant_workspace()?)?,
        "restaurant_status" => {
            serde_json::to_value(w.restaurant_status(argument::<String>(a, "order")?)?)?
        }
        "restaurant_menu" => serde_json::to_value(w.restaurant_menu()?)?,
        "edit_restaurant" => serde_json::to_value(w.edit_restaurant(
            argument::<String>(a, "order")?,
            argument::<i64>(a, "expected")?,
        )?)?,
        "amend_restaurant" => serde_json::to_value(w.amend_restaurant(argument(a, "r")?)?)?,
        "takeover_restaurant" => serde_json::to_value(w.takeover_restaurant(
            argument::<String>(a, "order")?,
            argument::<i64>(a, "expected")?,
            argument::<String>(a, "target")?,
        )?)?,
        "prepare_restaurant" => serde_json::to_value(w.prepare_restaurant(argument(a, "r")?)?)?,
        "post_restaurant" => serde_json::to_value(w.post_restaurant(
            argument::<String>(a, "order")?,
            argument::<String>(a, "attempt")?,
        )?)?,
        "read_restaurant" => serde_json::to_value(w.restaurant_view()?)?,
        "change_restaurant" => {
            w.restaurant_action(argument(a, "r")?)?;
            Value::Null
        }
        "save_restaurant_menu" => {
            w.save_restaurant_menu(argument(a, "m")?)?;
            Value::Null
        }
        "kitchen_view" => serde_json::to_value(w.kitchen_view()?)?,
        "kitchen_action" => serde_json::to_value(w.kitchen_action(argument(a, "a")?)?)?,
        "hub_live" => serde_json::to_value(w.hub_live()?)?,
        "hub_admin" => serde_json::to_value(w.hub_admin()?)?,
        "hub_batches" => serde_json::to_value(w.hub_batches()?)?,
        "hub_dispatch" => {
            w.hub_dispatch(
                &argument::<String>(a, "id")?,
                argument::<i64>(a, "revision")?,
            )?;
            Value::Null
        }
        "hub_device" => {
            w.hub_device(
                &argument::<String>(a, "id")?,
                argument::<i64>(a, "revision")?,
                argument::<Option<String>>(a, "actor")?.as_deref(),
            )?;
            Value::Null
        }
        "save_local_supplier" => serde_json::to_value(w.save_supplier(argument::<
            sornio_local_store::purchasing::SaveSupplier,
        >(a, "r")?)?)?,
        "find_local_suppliers" => serde_json::to_value(w.find_suppliers(
            &argument::<String>(a, "search")?,
            argument(a, "includeArchived")?,
        )?)?,
        "suspect_local_supplier_duplicates" => serde_json::to_value(w.supplier_duplicates(
            &argument::<String>(a, "name")?,
            argument::<Option<String>>(a, "phone")?.as_deref(),
            argument::<Option<String>>(a, "gstin")?.as_deref(),
        )?)?,
        "read_supplier_statement" => serde_json::to_value(w.supplier_statement(
            &argument::<String>(a, "supplierId")?,
            argument(a, "after")?,
            argument(a, "through")?,
        )?)?,
        "list_purchase_returns" => {
            serde_json::to_value(w.list_purchase_returns(&argument::<String>(a, "supplierId")?)?)?
        }
        "create_purchase_order" => {
            serde_json::to_value(w.create_purchase_order(argument::<
                sornio_local_store::purchasing::CreatePurchaseOrder,
            >(a, "r")?)?)?
        }
        "update_purchase_order" => {
            serde_json::to_value(w.update_purchase_order(argument::<
                sornio_local_store::purchasing::UpdatePurchaseOrder,
            >(a, "r")?)?)?
        }
        "get_purchase_order" => {
            serde_json::to_value(w.get_purchase_order(&argument::<String>(a, "id")?)?)?
        }
        "find_purchase_orders" => serde_json::to_value(w.find_purchase_orders(
            &argument::<String>(a, "search")?,
            &argument::<String>(a, "status")?,
            &argument::<String>(a, "supplierId")?,
        )?)?,
        "submit_purchase_order" => {
            serde_json::to_value(w.submit_purchase_order(argument::<
                sornio_local_store::purchasing::TransitionPurchaseOrder,
            >(a, "r")?)?)?
        }
        "decide_purchase_order" => {
            serde_json::to_value(w.decide_purchase_order(argument::<
                sornio_local_store::purchasing::DecidePurchaseOrder,
            >(a, "r")?)?)?
        }
        "cancel_purchase_order" => {
            serde_json::to_value(w.cancel_purchase_order(argument::<
                sornio_local_store::purchasing::TransitionPurchaseOrder,
            >(a, "r")?)?)?
        }
        "close_purchase_order" => {
            serde_json::to_value(w.close_purchase_order(argument::<
                sornio_local_store::purchasing::TransitionPurchaseOrder,
            >(a, "r")?)?)?
        }
        "post_goods_receipt" => serde_json::to_value(w.post_goods_receipt(argument::<
            sornio_local_store::purchasing::PostGoodsReceipt,
        >(a, "r")?)?)?,
        "list_goods_receipts" => {
            serde_json::to_value(w.list_goods_receipts(&argument::<String>(a, "orderId")?)?)?
        }
        "post_supplier_invoice" => {
            serde_json::to_value(w.post_supplier_invoice(argument::<
                sornio_local_store::purchasing::PostSupplierInvoice,
            >(a, "r")?)?)?
        }
        "post_supplier_payment" => {
            serde_json::to_value(w.post_supplier_payment(argument::<
                sornio_local_store::purchasing::PostSupplierPayment,
            >(a, "r")?)?)?
        }
        "post_supplier_opening" => {
            serde_json::to_value(w.post_supplier_opening(argument::<
                sornio_local_store::purchasing::PostSupplierOpening,
            >(a, "r")?)?)?
        }
        "reverse_supplier_entry" => {
            serde_json::to_value(w.reverse_supplier_entry(argument::<
                sornio_local_store::purchasing::ReverseSupplierEntry,
            >(a, "r")?)?)?
        }
        "post_purchase_return" => {
            serde_json::to_value(w.post_purchase_return(argument::<
                sornio_local_store::purchasing::PostPurchaseReturn,
            >(a, "r")?)?)?
        }
        "read_workstation_settings" => serde_json::to_value(w.read_workstation_settings()?)?,
        "save_workstation_settings" => {
            serde_json::to_value(w.save_workstation_settings(argument::<
                sornio_local_store::workstation_settings::SaveWorkstationSettings,
            >(a, "r")?)?)?
        }
        "list_local_printers" => {
            w.require(sornio_local_store::identity::Permission::View)?;
            json!([])
        }
        // hub_control and hub_import_tls are native-runtime commands: they drive the hub
        // listener and the OS file dialog, so there is no store-level equivalent to call.
        // hub_control's real handler performs verify_scope followed by a Settings require, and
        // this arm mirrors exactly that pair rather than inventing a weaker check.
        "hub_control" => {
            w.verify_scope(&argument::<Scope>(a, "scope")?)?;
            w.require(sornio_local_store::identity::Permission::Settings)?;
            Value::Null
        }
        "hub_import_tls" => {
            w.require(sornio_local_store::identity::Permission::Settings)?;
            Value::Null
        }
        _ => return Err(StoreError::InvalidInvoice),
    })
}
fn main() {
    let path = std::env::args_os()
        .nth(1)
        .expect("Synthetic review database path required");
    // Two key sources, and they are deliberately not interchangeable.
    //
    // Without `SORNIO_REVIEW_DEVICE_DIR` this fixture opens a scratch database
    // under a hard-coded synthetic key, exactly as it always has.
    //
    // With it, the fixture opens the *installed application's own* workspace
    // through the same `device::initialize` entry point the shipped binary
    // calls, so the OS credential store supplies the real device key. That is
    // what lets a post-run audit assert the bytes the installed product wrote
    // rather than the product's own rendering of them. The path argument is
    // unused in that mode and the synthetic key is never used, so a real
    // database can never be opened with a known key.
    let store = match std::env::var_os("SORNIO_REVIEW_DEVICE_DIR") {
        Some(directory) => {
            eprintln!(
                "bridge: opening the installed application's workspace via the OS credential store"
            );
            // The OS-backed key provider is intentionally unavailable on Linux.
            // The synthetic review bridge must still compile for cross-platform CI,
            // but must NEVER substitute its known synthetic key for a real device.
            #[cfg(any(windows, target_os = "macos"))]
            {
                match sornio_local_store::device::initialize(std::path::Path::new(&directory)) {
                    Ok(store) => store,
                    Err(message) => {
                        eprintln!("bridge: the installed workspace could not be opened: {message}");
                        std::process::exit(3);
                    }
                }
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                let _ = directory;
                eprintln!(
                    "bridge: OS credential-backed workspace review is unavailable on this platform"
                );
                std::process::exit(3);
            }
        }
        None => Store::open(
            std::path::Path::new(&path),
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        )
        .unwrap(),
    };
    let mut workspace = Workspace::new(store);
    for line in io::stdin().lock().lines() {
        let input: Call = serde_json::from_str(&line.unwrap()).unwrap();
        let output = match call(&mut workspace, input) {
            Ok(value) => json!({"ok":true,"value":value}),
            Err(error) => {
                let code = match error {
                    StoreError::Locked => "locked",
                    StoreError::HeldBillConflict => "held_bill_conflict",
                    StoreError::InvalidHeldBill => "invalid_held_bill",
                    StoreError::HeldBillLimit => "held_bill_limit",
                    StoreError::InvoiceMissing => "invoice_missing",
                    StoreError::InvalidBackup => "invalid_backup",
                    StoreError::BackupStorage => "backup_storage",
                    StoreError::BackupBusinessMismatch => "backup_business_mismatch",
                    StoreError::InvalidRecoveryPassword => "invalid_recovery_password",
                    StoreError::RecoveryChanged => "recovery_changed",
                    StoreError::RecoveryConfirmation => "recovery_confirmation",
                    StoreError::RateLimited => "rate_limited",
                    StoreError::InvalidPayment => "invalid_payment",
                    StoreError::PaymentConflict => "payment_conflict",
                    StoreError::DuplicateSettlement => "duplicate_settlement",
                    StoreError::DayClosed => "day_closed",
                    StoreError::ComplexCreditReturn => "complex_credit_return",
                    StoreError::InvalidCustomer => "invalid_customer",
                    StoreError::CustomerMissing => "customer_missing",
                    StoreError::InvalidCredit => "invalid_credit",
                    StoreError::CreditConflict => "credit_conflict",
                    StoreError::Overpayment => "overpayment",
                    StoreError::CreditLimit => "credit_limit",
                    StoreError::CreditAlreadyCollected => "credit_collected",
                    StoreError::Forbidden => "forbidden",
                    StoreError::WorkspaceMismatch => "workspace_mismatch",
                    StoreError::AccountExists => "account_exists",
                    StoreError::IncorrectPassword => "incorrect_password",
                    StoreError::InvalidPassword => "invalid_password",
                    StoreError::InvalidIdentity => "invalid_identity",
                    StoreError::AccessConfigured => "already_configured",
                    StoreError::AccessNotConfigured => "not_configured",
                    StoreError::StockConflict => "stock_conflict",
                    StoreError::CheckoutActive => "checkout_active",
                    StoreError::InvalidInvoice => "invalid_invoice",
                    StoreError::DuplicateSku => "duplicate_sku",
                    StoreError::InvalidProduct
                    | StoreError::InvalidStock
                    | StoreError::ProductMissing
                    | StoreError::CatalogFull => "invalid_product",
                    StoreError::InvalidSupplier => "invalid_supplier",
                    StoreError::SupplierMissing => "supplier_missing",
                    StoreError::SupplierConflict => "supplier_conflict",
                    StoreError::InvalidPurchaseOrder => "invalid_purchase_order",
                    StoreError::PurchaseOrderMissing => "purchase_order_missing",
                    StoreError::PurchaseOrderConflict => "purchase_order_conflict",
                    StoreError::InvalidPurchase => "invalid_purchase",
                    StoreError::OrderState => "order_state",
                    StoreError::InvalidReceipt => "invalid_receipt",
                    StoreError::InvalidPayable => "invalid_payable",
                    StoreError::InvalidReturn => "invalid_return",
                    StoreError::OperationConflict => "operation_conflict",
                    _ => "workspace_error",
                };
                json!({"ok":false,"error":{"code":code,"message":error.to_string()}})
            }
        };
        println!("{output}");
        io::stdout().flush().unwrap();
    }
}
