//! Test-only JSON-lines transport for React -> real Workspace/SQLCipher integration.
//! This synthetic-key fixture is not included in the shipped Tauri application.
use serde::Deserialize;
use serde_json::{json, Value};
use sornio_local_store::{
    access::Workspace,
    billing::PostInvoice,
    catalog::{AddProduct, AdjustStock},
    identity::{OwnerSetup, Scope, StaffChange, StaffDetails},
    Draft, Store, StoreError,
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
fn call(w: &mut Workspace, c: Call) -> Result<Value, StoreError> {
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
                    StoreError::Forbidden => "forbidden",
                    StoreError::WorkspaceMismatch => "workspace_mismatch",
                    StoreError::IncorrectPassword => "incorrect_password",
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
