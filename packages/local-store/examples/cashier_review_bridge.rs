//! Test-only JSON-lines transport for React -> real Workspace/SQLCipher integration.
//! This synthetic-key fixture is not included in the shipped Tauri application.
use serde::Deserialize;
use serde_json::{json, Value};
use sornio_local_store::{
    access::Workspace,
    billing::PostInvoice,
    catalog::{AddProduct, AdjustStock},
    Store, StoreError,
};
use std::io::{self, BufRead, Write};

#[derive(Deserialize)]
struct Call {
    command: String,
    #[serde(default)]
    args: Value,
}
fn argument<T: serde::de::DeserializeOwned>(args: &Value, key: &str) -> Result<T, StoreError> {
    Ok(serde_json::from_value(args[key].clone())?)
}
fn call(
    w: &mut Workspace,
    preview: &mut Option<sornio_local_store::recovery::BackupPreview>,
    c: Call,
) -> Result<Value, StoreError> {
    let a = &c.args;
    Ok(match c.command.as_str() {
        "workspace_access_status" => serde_json::to_value(w.status()?)?,
        "setup_local_access" => {
            serde_json::to_value(w.setup(&argument::<String>(a, "password")?)?)?
        }
        "unlock_workspace" => serde_json::to_value(w.unlock(&argument::<String>(a, "password")?)?)?,
        "lock_workspace" => {
            w.lock();
            Value::Null
        }
        "save_workspace" => {
            serde_json::to_value(w.save(argument(a, "expectedRevision")?, argument(a, "draft")?)?)?
        }
        "read_last_restore" => serde_json::to_value(w.last_restore()?)?,
        "choose_local_backup" => serde_json::json!("synthetic.sorniobackup"),
        "export_local_backup" => {
            let path = std::path::PathBuf::from(std::env::var_os("SORNIO_REVIEW_BACKUP").unwrap());
            serde_json::to_value(w.export_backup(
                &path,
                &argument::<String>(a, "currentPassword")?,
                &argument::<String>(a, "recoveryPassword")?,
            )?)?
        }
        "preview_local_backup" => {
            *preview = None;
            let path = std::path::PathBuf::from(std::env::var_os("SORNIO_REVIEW_BACKUP").unwrap());
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
            let path = std::path::PathBuf::from(std::env::var_os("SORNIO_REVIEW_BACKUP").unwrap());
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
        "load_workspace" => serde_json::to_value(w.load()?)?,
        "list_workspace_copies" => serde_json::to_value(w.saved_copies()?)?,
        "list_local_products" => serde_json::to_value(w.list_products()?)?,
        "add_local_product" => {
            serde_json::to_value(w.add_product(argument::<AddProduct>(a, "request")?)?)?
        }
        "adjust_local_stock" => {
            serde_json::to_value(w.adjust_stock(argument::<AdjustStock>(a, "request")?)?)?
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
    let mut preview = None;
    for line in io::stdin().lock().lines() {
        let input: Call = serde_json::from_str(&line.unwrap()).unwrap();
        let output = match call(&mut workspace, &mut preview, input) {
            Ok(value) => json!({"ok":true,"value":value}),
            Err(error) => {
                let code = match error {
                    StoreError::Locked => "locked",
                    StoreError::IncorrectPassword => "incorrect_password",
                    StoreError::RateLimited => "rate_limited",
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
