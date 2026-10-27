#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sornio_local_store::customers as crate_types;
#[cfg(windows)]
use sornio_local_store::device::initialize;
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
async fn read_identity_audit(
    scope: Scope,
    after: i64,
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<AuditEntry>, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.identity_audit(after)).await
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
