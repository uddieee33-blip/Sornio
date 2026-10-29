#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sornio_local_store::customers as crate_types;
#[cfg(windows)]
use sornio_local_store::device::initialize;
use sornio_local_store::payments as retail;
use sornio_local_store::{
    access::{AccessStatus, Workspace},
    catalog::{AddProduct, AdjustStock, Product},
    identity::{AuditEntry, LocalSession, OwnerSetup, Principal, Scope, StaffChange, StaffDetails},
    Draft, SavedCopy, Snapshot, Store, StoreError,
};
use std::sync::{Arc, Mutex};
use tauri::Manager;
use zeroize::Zeroizing;

type LocalState = Arc<Mutex<Result<Workspace, String>>>;

#[derive(serde::Serialize)]
struct CommandError {
    code: &'static str,
    message: String,
}

impl CommandError {
    fn unavailable(message: &str) -> Self {
        Self {
            code: "unavailable",
            message: message.into(),
        }
    }
}

impl From<StoreError> for CommandError {
    fn from(error: StoreError) -> Self {
        let code = match &error {
            StoreError::Locked => "locked",
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
            StoreError::InvalidIdentity => "invalid_identity",
            StoreError::AccountExists => "account_exists",
            StoreError::IncorrectPassword => "incorrect_password",
            StoreError::InvalidPassword => "invalid_password",
            StoreError::RateLimited => "rate_limited",
            StoreError::AccessConfigured => "already_configured",
            StoreError::AccessNotConfigured => "not_configured",
            StoreError::StockConflict => "stock_conflict",
            StoreError::InvalidInvoice => "invalid_invoice",
            StoreError::CheckoutActive => "checkout_active",
            StoreError::OperationConflict => "operation_conflict",
            StoreError::DuplicateSku => "duplicate_sku",
            StoreError::InvalidProduct
            | StoreError::InvalidStock
            | StoreError::ProductMissing
            | StoreError::CatalogFull => "invalid_product",
            _ => "workspace_error",
        };
        Self {
            code,
            message: error.to_string(),
        }
    }
}

#[cfg(not(windows))]
fn initialize(_directory: &std::path::Path) -> Result<Store, String> {
    Err("This local review build requires Windows Credential Manager.".into())
}

// Password hashing and SQLite waits run off the native UI thread. Authorization
// and every data operation share the same native mutex; lock cannot race a save.
async fn with_workspace<T, F>(
    state: tauri::State<'_, LocalState>,
    operation: F,
) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(&mut Workspace) -> Result<T, StoreError> + Send + 'static,
{
    let shared = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = shared.lock().map_err(|_| {
            CommandError::unavailable("Restart Sornio to reopen the local workspace.")
        })?;
        match &mut *guard {
            Ok(workspace) => operation(workspace).map_err(CommandError::from),
            Err(message) => Err(CommandError::unavailable(message)),
        }
    })
    .await
    .map_err(|_| {
        CommandError::unavailable(
            "The workspace operation stopped. Restart Sornio and reopen your saved draft.",
        )
    })?
}

#[tauri::command]
async fn workspace_access_status(
    state: tauri::State<'_, LocalState>,
) -> Result<AccessStatus, CommandError> {
    with_workspace(state, |w| w.status()).await
}

#[tauri::command]
async fn setup_local_access(
    setup: OwnerSetup,
    password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<AccessStatus, CommandError> {
    let password = Zeroizing::new(password);
    with_workspace(state, move |w| w.provision_owner(setup, &password)).await
}

#[tauri::command]
async fn unlock_workspace(
    username: String,
    password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<AccessStatus, CommandError> {
    let password = Zeroizing::new(password);
    with_workspace(state, move |w| w.login(&username, &password)).await
}

#[tauri::command]
async fn lock_workspace(state: tauri::State<'_, LocalState>) -> Result<(), CommandError> {
    with_workspace(state, |w| {
        w.lock();
        Ok(())
    })
    .await
}

#[tauri::command]
async fn load_workspace(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Snapshot, CommandError> {
    with_scoped_workspace(state, scope, |w| w.load()).await
}

#[tauri::command]
async fn save_workspace(
    expected_revision: i64,
    draft: Draft,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Snapshot, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.save(expected_revision, draft)).await
}

#[tauri::command]
async fn list_workspace_copies(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<SavedCopy>, CommandError> {
    with_scoped_workspace(state, scope, |w| w.saved_copies()).await
}

#[tauri::command]
async fn restore_workspace(
    expected_revision: i64,
    source_revision: i64,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Snapshot, CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.restore(expected_revision, source_revision)
    })
    .await
}

#[tauri::command]
async fn list_local_products(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<Product>, CommandError> {
    with_scoped_workspace(state, scope, |w| w.list_products()).await
}

#[tauri::command]
async fn add_local_product(
    request: AddProduct,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Product, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.add_product(request)).await
}

#[tauri::command]
async fn adjust_local_stock(
    request: AdjustStock,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Product, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.adjust_stock(request)).await
}

#[tauri::command]
async fn pending_local_inventory(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Option<sornio_local_store::inventory_recovery::InventoryReceipt>, CommandError> {
    with_scoped_workspace(state, scope, |w| w.pending_inventory()).await
}
#[tauri::command]
async fn acknowledge_local_inventory(
    scope: Scope,
    operation_id: String,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.acknowledge_inventory(&operation_id)
    })
    .await
}
#[tauri::command]
async fn read_cashier_state(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<sornio_local_store::checkout::CashierState, CommandError> {
    with_scoped_workspace(state, scope, |w| w.cashier_state()).await
}
#[tauri::command]
async fn prepare_local_checkout(
    request: sornio_local_store::billing::PostInvoice,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| w.prepare_checkout(request)).await
}
#[tauri::command]
async fn clear_local_checkout(
    operation_id: String,
    saved: bool,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.clear_checkout(&operation_id, saved)
    })
    .await
}
#[tauri::command]
async fn post_local_invoice(
    request: sornio_local_store::billing::PostInvoice,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<sornio_local_store::billing::Invoice, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.post_prepared_invoice(request)).await
}
#[tauri::command]
async fn list_local_invoices(
    after: i64,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<sornio_local_store::billing::InvoiceRecord>, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.list_invoices(after)).await
}
#[tauri::command]
async fn read_billing_outbox(
    after: i64,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<sornio_local_store::billing::OutboxRecord>, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.billing_outbox(after)).await
}
async fn with_scoped_workspace<T, F>(
    state: tauri::State<'_, LocalState>,
    scope: Scope,
    operation: F,
) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(&mut Workspace) -> Result<T, StoreError> + Send + 'static,
{
    with_workspace(state, move |w| w.run_scoped(&scope, operation)).await
}
#[tauri::command]
async fn read_local_session(
    state: tauri::State<'_, LocalState>,
) -> Result<LocalSession, CommandError> {
    with_workspace(state, |w| w.local_session()).await
}
#[tauri::command]
async fn list_local_staff(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<Principal>, CommandError> {
    with_scoped_workspace(state, scope, |w| w.list_staff()).await
}
#[tauri::command]
async fn create_local_staff(
    scope: Scope,
    details: StaffDetails,
    password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<Principal, CommandError> {
    let password = Zeroizing::new(password);
    with_scoped_workspace(state, scope, move |w| w.create_staff(details, &password)).await
}
#[tauri::command]
async fn change_local_staff(
    scope: Scope,
    change: StaffChange,
    state: tauri::State<'_, LocalState>,
) -> Result<Principal, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.change_staff(change)).await
}

#[tauri::command]
async fn change_local_password(
    scope: Scope,
    current_password: String,
    new_password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    let current_password = Zeroizing::new(current_password);
    let new_password = Zeroizing::new(new_password);
    with_scoped_workspace(state, scope, move |w| {
        w.change_password(&current_password, &new_password)
    })
    .await
}
#[tauri::command]
async fn reset_local_staff_password(
    scope: Scope,
    id: String,
    expected_revision: i64,
    owner_password: String,
    new_password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<Principal, CommandError> {
    let owner_password = Zeroizing::new(owner_password);
    let new_password = Zeroizing::new(new_password);
    with_scoped_workspace(state, scope, move |w| {
        w.reset_staff_password(&id, expected_revision, &owner_password, &new_password)
    })
    .await
}
#[tauri::command]
async fn read_identity_audit(
    scope: Scope,
    after: i64,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<AuditEntry>, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.identity_audit(after)).await
}

#[tauri::command]
async fn prepare_local_retail(
    scope: Scope,
    r: retail::Request,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| w.prepare_retail(r)).await
}
#[tauri::command]
async fn post_local_retail(
    scope: Scope,
    r: retail::Request,
    state: tauri::State<'_, LocalState>,
) -> Result<retail::Receipt, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.post_retail(r)).await
}
#[tauri::command]
async fn clear_local_retail(
    scope: Scope,
    operation_id: String,
    saved: bool,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| w.clear_retail(&operation_id, saved)).await
}
#[tauri::command]
async fn read_local_retail(
    scope: Scope,
    day: String,
    username: String,
    invoice_id: Option<String>,
    state: tauri::State<'_, LocalState>,
) -> Result<retail::View, CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.retail_view(&day, &username, invoice_id.as_deref())
    })
    .await
}
#[tauri::command]
async fn quote_local_return(
    scope: Scope,
    invoice_id: String,
    lines: Vec<retail::ReturnLine>,
    state: tauri::State<'_, LocalState>,
) -> Result<retail::ReturnQuote, CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.quote_retail_return(&invoice_id, &lines)
    })
    .await
}
#[tauri::command]
async fn take_over_local_payment(
    scope: Scope,
    operation_id: String,
    reason: String,
    state: tauri::State<'_, LocalState>,
) -> Result<String, CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.takeover_payment(&operation_id, &reason)
    })
    .await
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedSettlementExport {
    file_name: String,
    path: String,
    csv: String,
}
#[tauri::command]
async fn export_local_settlements(
    app: tauri::AppHandle,
    scope: Scope,
    day: String,
    state: tauri::State<'_, LocalState>,
) -> Result<SavedSettlementExport, CommandError> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| CommandError::unavailable("Could not locate the settlement export folder."))?
        .join("settlement-exports")
        .join(&scope.business_id);
    // Scope is validated before file IO. No caller path or arbitrary file access.
    with_scoped_workspace(state, scope, move |w| {
        use std::io::Write;
        let export = w.export_retail(&day)?;
        std::fs::create_dir_all(&directory).map_err(|_| StoreError::AccessUnavailable)?;
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| StoreError::AccessUnavailable)?
            .as_nanos();
        let name = format!("Sornio-settlements-{day}-{nonce}.csv");
        let path = directory.join(&name);
        let temporary = directory.join(format!("{name}.partial"));
        let result = (|| -> std::io::Result<()> {
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            f.write_all(export.csv.as_bytes())?;
            f.sync_all()?;
            drop(f);
            std::fs::rename(&temporary, &path)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&temporary);
            return Err(StoreError::AccessUnavailable);
        }
        Ok(SavedSettlementExport {
            file_name: name,
            path: path.to_string_lossy().into_owned(),
            csv: export.csv,
        })
    })
    .await
}

#[tauri::command]
async fn save_local_customer(
    scope: Scope,
    r: crate_types::SaveCustomer,
    state: tauri::State<'_, LocalState>,
) -> Result<crate_types::Customer, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.save_customer(r)).await
}

#[tauri::command]
async fn find_local_customers(
    scope: Scope,
    search: String,
    overdue_only: bool,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<crate_types::Customer>, CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.find_customers(&search, overdue_only)
    })
    .await
}

#[tauri::command]
async fn prepare_local_credit(
    scope: Scope,
    r: crate_types::CreditRequest,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| w.prepare_credit(r)).await
}

#[tauri::command]
async fn post_local_credit(
    scope: Scope,
    r: crate_types::CreditRequest,
    state: tauri::State<'_, LocalState>,
) -> Result<crate_types::CreditReceipt, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.post_credit(r)).await
}

#[tauri::command]
async fn pending_local_credit(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Option<crate_types::PendingCredit>, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.pending_credit()).await
}

#[tauri::command]
async fn clear_local_credit(
    scope: Scope,
    operation_id: String,
    saved: bool,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| w.clear_credit(&operation_id, saved)).await
}

#[tauri::command]
async fn link_local_credit(
    scope: Scope,
    r: crate_types::LinkCredit,
    state: tauri::State<'_, LocalState>,
) -> Result<crate_types::CreditReceipt, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.link_credit(r)).await
}

#[tauri::command]
async fn read_customer_statement(
    scope: Scope,
    customer_id: String,
    after: i64,
    through: Option<i64>,
    state: tauri::State<'_, LocalState>,
) -> Result<crate_types::Statement, CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.customer_statement(&customer_id, after, through)
    })
    .await
}

#[tauri::command]
async fn render_customer_statement(
    scope: Scope,
    customer_id: String,
    through: Option<i64>,
    state: tauri::State<'_, LocalState>,
) -> Result<String, CommandError> {
    with_scoped_workspace(state, scope, move |w| {
        w.print_customer_statement(&customer_id, through)
    })
    .await
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let workspace = app
                .path()
                .app_local_data_dir()
                .map_err(|_| "The device data directory is unavailable.".to_string())
                .and_then(|path| initialize(&path))
                .map(Workspace::new);
            app.manage(Arc::new(Mutex::new(workspace)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            change_local_password,
            reset_local_staff_password,
            prepare_local_retail,
            post_local_retail,
            clear_local_retail,
            read_local_retail,
            quote_local_return,
            take_over_local_payment,
            export_local_settlements,
            save_local_customer,
            find_local_customers,
            prepare_local_credit,
            post_local_credit,
            pending_local_credit,
            clear_local_credit,
            link_local_credit,
            read_customer_statement,
            render_customer_statement,
            workspace_access_status,
            read_local_session,
            list_local_staff,
            create_local_staff,
            change_local_staff,
            read_identity_audit,
            setup_local_access,
            unlock_workspace,
            lock_workspace,
            load_workspace,
            save_workspace,
            list_workspace_copies,
            restore_workspace,
            list_local_products,
            add_local_product,
            adjust_local_stock,
            pending_local_inventory,
            acknowledge_local_inventory,
            read_cashier_state,
            prepare_local_checkout,
            clear_local_checkout,
            post_local_invoice,
            list_local_invoices,
            read_billing_outbox
        ])
        .run(tauri::generate_context!())
        .expect("Sornio could not start");
}
