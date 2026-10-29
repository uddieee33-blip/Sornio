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
        "list_local_invoices" => serde_json::to_value(w.list_invoices(argument(a, "after")?)?)?,
        _ => return Err(StoreError::InvalidInvoice),
    })
}
fn main() {
    let path = std::env::args_os()
        .nth(1)
        .expect("Synthetic review database path required");
    let store = Store::open(
        std::path::Path::new(&path),
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    )
    .unwrap();
    let mut workspace = Workspace::new(store);
    for line in io::stdin().lock().lines() {
        let input: Call = serde_json::from_str(&line.unwrap()).unwrap();
        let output = match call(&mut workspace, input) {
            Ok(value) => json!({"ok":true,"value":value}),
            Err(error) => {
                let code = match error {
                    StoreError::Locked => "locked",
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
                    StoreError::IncorrectPassword => "incorrect_password",
                    StoreError::InvalidPassword => "invalid_password",
                    StoreError::InvalidIdentity => "invalid_identity",
                    StoreError::StockConflict => "stock_conflict",
                    StoreError::CheckoutActive => "checkout_active",
                    StoreError::InvalidInvoice => "invalid_invoice",
                    StoreError::InvalidStock | StoreError::ProductMissing => "invalid_product",
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
