#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hub_server;
mod hub_discovery;
use sornio_local_store::customers as crate_types;
#[cfg(any(windows, target_os = "macos"))]
use sornio_local_store::device::initialize;
use sornio_local_store::payments as retail;
use sornio_local_store::recovery::BackupPreview;
use sornio_local_store::{
    access::{AccessStatus, Workspace},
    catalog::{AddProduct, AdjustStock, Product},
    identity::{AuditEntry, LocalSession, OwnerSetup, Principal, Scope, StaffChange, StaffDetails},
    Draft, SavedCopy, Snapshot, Store, StoreError,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
#[derive(Default)]
struct RecoverySelection {
    path: Option<PathBuf>,
    preview: Option<BackupPreview>,
}
type RecoveryState = Arc<Mutex<RecoverySelection>>;
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
            StoreError::Conflict => "conflict",
            StoreError::InvalidDraft => "invalid_draft",
            StoreError::HeldBillConflict => "held_bill_conflict",
            StoreError::InvalidHeldBill => "invalid_held_bill",
            StoreError::HeldBillLimit => "held_bill_limit",
            StoreError::InvoiceMissing => "invoice_missing",
            StoreError::BackupStorage => "backup_storage",
            StoreError::InvalidBackup => "invalid_backup",
            StoreError::BackupBusinessMismatch => "backup_business_mismatch",
            StoreError::InvalidRecoveryPassword => "invalid_recovery_password",
            StoreError::RecoveryConfirmation => "recovery_confirmation",
            StoreError::RecoveryChanged => "recovery_changed",
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

#[cfg(not(any(windows, target_os = "macos")))]
fn initialize(_directory: &std::path::Path) -> Result<Store, String> {
    Err("This local review build requires Windows Credential Manager or macOS Keychain.".into())
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
async fn read_local_invoice(
    invoice_id: String,
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<sornio_local_store::billing::Invoice, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.read_invoice(&invoice_id)).await
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
async fn kitchen_view(scope:Scope,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::kitchen::Document,CommandError>{with_scoped_workspace(state,scope,|w|w.kitchen_view()).await}
#[tauri::command]
async fn kitchen_action(scope:Scope,a:sornio_local_store::kitchen::Action,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::kitchen::Document,CommandError>{with_scoped_workspace(state,scope,move |w|w.kitchen_action(a)).await}
#[tauri::command]
async fn restaurant_workspace(scope:Scope,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::kitchen::Document,CommandError>{with_scoped_workspace(state,scope,|w|w.restaurant_workspace()).await}
#[tauri::command]
async fn restaurant_status(scope:Scope,order:String,state:tauri::State<'_,LocalState>)->Result<Option<sornio_local_store::restaurant_recovery::Status>,CommandError>{with_scoped_workspace(state,scope,move |w|w.restaurant_status(order)).await}
#[tauri::command]
async fn edit_restaurant(scope:Scope,order:String,expected:i64,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::restaurant_recovery::Status,CommandError>{with_scoped_workspace(state,scope,move |w|w.edit_restaurant(order,expected)).await}
#[tauri::command]
async fn amend_restaurant(scope:Scope,r:sornio_local_store::restaurant_recovery::Amendment,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::restaurant_recovery::Status,CommandError>{with_scoped_workspace(state,scope,move |w|w.amend_restaurant(r)).await}
#[tauri::command]
async fn takeover_restaurant(scope:Scope,order:String,expected:i64,target:String,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::restaurant_recovery::Status,CommandError>{with_scoped_workspace(state,scope,move |w|w.takeover_restaurant(order,expected,target)).await}
#[tauri::command]
async fn restaurant_menu(scope:Scope,state:tauri::State<'_,LocalState>)->Result<Vec<sornio_local_store::restaurant_checkout::Menu>,CommandError>{with_scoped_workspace(state,scope,|w|w.restaurant_menu()).await}
#[tauri::command]
async fn save_restaurant_menu(scope:Scope,m:sornio_local_store::restaurant_checkout::Menu,state:tauri::State<'_,LocalState>)->Result<(),CommandError>{with_scoped_workspace(state,scope,move |w|w.save_restaurant_menu(m)).await}
#[tauri::command]
async fn prepare_restaurant(scope:Scope,r:sornio_local_store::restaurant_checkout::Prepare,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::payments::Request,CommandError>{with_scoped_workspace(state,scope,move |w|w.prepare_restaurant(r)).await}
#[tauri::command]
async fn post_restaurant(scope:Scope,order:String,attempt:String,state:tauri::State<'_,LocalState>)->Result<sornio_local_store::payments::Receipt,CommandError>{with_scoped_workspace(state,scope,move |w|w.post_restaurant(order,attempt)).await}
#[tauri::command]
async fn read_restaurant(scope: Scope, state: tauri::State<'_, LocalState>) -> Result<sornio_local_store::restaurant::View, CommandError> { with_scoped_workspace(state, scope, |w| w.restaurant_view()).await }
#[tauri::command]
async fn change_restaurant(scope: Scope, r: sornio_local_store::restaurant::Request, state: tauri::State<'_, LocalState>) -> Result<(), CommandError> { with_scoped_workspace(state, scope, move |w| w.restaurant_action(r)).await }
#[tauri::command]
async fn list_local_held_bills(scope: Scope, state: tauri::State<'_, LocalState>) -> Result<Vec<sornio_local_store::held_bills::Bill>, CommandError> {
    with_scoped_workspace(state, scope, |w| w.list_held_bills()).await
}
#[tauri::command]
async fn mutate_local_held_bill(scope: Scope, r: sornio_local_store::held_bills::Mutation, state: tauri::State<'_, LocalState>) -> Result<sornio_local_store::held_bills::Resumed, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.mutate_held_bill(r)).await
}
#[tauri::command]
async fn prepare_local_held_checkout(scope: Scope, r: sornio_local_store::held_bills::Prepare, state: tauri::State<'_, LocalState>) -> Result<(), CommandError> {
    with_scoped_workspace(state, scope, move |w| w.prepare_held_checkout(r)).await
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
async fn read_local_customer(
    scope: Scope,
    customer_id: String,
    state: tauri::State<'_, LocalState>,
) -> Result<crate_types::Customer, CommandError> {
    with_scoped_workspace(state, scope, move |w| w.read_customer(&customer_id)).await
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

async fn with_recovery_workspace<T, F>(
    state: tauri::State<'_, LocalState>,
    scope: Option<Scope>,
    operation: F,
) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(&mut Workspace) -> Result<T, StoreError> + Send + 'static,
{
    with_workspace(state, move |w| {
        if w.status()?.configured {
            let scope = scope.ok_or(StoreError::Locked)?;
            w.run_scoped(&scope, |w| {
                w.require(sornio_local_store::identity::Permission::Settings)?;
                operation(w)
            })
        } else {
            if scope.is_some() {
                return Err(StoreError::WorkspaceMismatch);
            }
            operation(w)
        }
    })
    .await
}
#[tauri::command]
async fn read_last_restore(
    scope: Scope,
    state: tauri::State<'_, LocalState>,
) -> Result<Option<sornio_local_store::recovery::RestoreReceipt>, CommandError> {
    with_scoped_workspace(state, scope, |w| w.last_restore()).await
}
#[tauri::command]
async fn choose_local_backup(
    scope: Option<Scope>,
    selection: tauri::State<'_, RecoveryState>,
    state: tauri::State<'_, LocalState>,
) -> Result<Option<String>, CommandError> {
    let selected = Arc::clone(selection.inner());
    with_recovery_workspace(state, scope, move |_w| {
        #[cfg(any(windows, target_os = "macos"))]
        let path = rfd::FileDialog::new()
            .add_filter("Sornio encrypted backup", &["sorniobackup"])
            .set_title("Choose encrypted Sornio backup")
            .pick_file();
        #[cfg(not(any(windows, target_os = "macos")))]
        let path: Option<PathBuf> = None;
        let name = path
            .as_ref()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().into_owned());
        let mut selected = selected.lock().map_err(|_| StoreError::AccessUnavailable)?;
        selected.path = path;
        selected.preview = None;
        Ok(name)
    })
    .await
}
#[tauri::command]
async fn export_local_backup(
    scope: Scope,
    current_password: String,
    recovery_password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<Option<BackupPreview>, CommandError> {
    let current = Zeroizing::new(current_password);
    let secret = Zeroizing::new(recovery_password);
    with_scoped_workspace(state, scope, move |w| {
        w.require(sornio_local_store::identity::Permission::Settings)?;
        #[cfg(any(windows, target_os = "macos"))]
        let path = rfd::FileDialog::new()
            .add_filter("Sornio encrypted backup", &["sorniobackup"])
            .set_file_name("sornio-business.sorniobackup")
            .set_title("Export encrypted Sornio backup")
            .save_file();
        #[cfg(not(any(windows, target_os = "macos")))]
        let path: Option<PathBuf> = None;
        path.map(|p| w.export_backup(&p, &current, &secret))
            .transpose()
    })
    .await
}
#[tauri::command]
async fn preview_local_backup(
    scope: Option<Scope>,
    current_password: String,
    recovery_password: String,
    original_password: String,
    selection: tauri::State<'_, RecoveryState>,
    state: tauri::State<'_, LocalState>,
) -> Result<BackupPreview, CommandError> {
    let current = Zeroizing::new(current_password);
    let secret = Zeroizing::new(recovery_password);
    let original = Zeroizing::new(original_password);
    let selected = Arc::clone(selection.inner());
    with_recovery_workspace(state, scope, move |w| {
        let mut selected = selected.lock().map_err(|_| StoreError::AccessUnavailable)?;
        selected.preview = None;
        let path = selected.path.clone().ok_or(StoreError::InvalidBackup)?;
        let preview = w.preview_backup(&path, &current, &secret, &original)?;
        selected.preview = Some(preview.clone());
        Ok(preview)
    })
    .await
}
#[tauri::command]
async fn restore_local_backup(
    scope: Option<Scope>,
    current_password: String,
    recovery_password: String,
    original_password: String,
    confirmation: String,
    app: tauri::AppHandle,
    selection: tauri::State<'_, RecoveryState>,
    state: tauri::State<'_, LocalState>,
) -> Result<String, CommandError> {
    let current = Zeroizing::new(current_password);
    let secret = Zeroizing::new(recovery_password);
    let original = Zeroizing::new(original_password);
    let safety = app
        .path()
        .app_local_data_dir()
        .map_err(|_| CommandError::unavailable("Safety backup folder is unavailable."))?
        .join("recovery-safety");
    let selected = Arc::clone(selection.inner());
    let sidecar = app
        .path()
        .app_local_data_dir()
        .map_err(|_| CommandError::unavailable("Replication sidecar folder is unavailable."))?
        .join("replication-sidecar.sqlite");
    with_recovery_workspace(state, scope, move |w| {
        let mut selected = selected.lock().map_err(|_| StoreError::AccessUnavailable)?;
        let path = selected.path.clone().ok_or(StoreError::InvalidBackup)?;
        let preview = selected.preview.take().ok_or(StoreError::RecoveryChanged)?;
        let receipt = w.restore_backup(
            &path,
            &safety,
            &current,
            &secret,
            &original,
            &preview,
            &confirmation,
        )?;
        sornio_local_store::replication::reset_sidecar_file(&sidecar)?;
        Ok(receipt)
    })
    .await
}
#[tauri::command]
async fn restaurant_live(scope:Scope,state:tauri::State<'_,LocalState>)->Result<serde_json::Value,CommandError>{with_workspace(state,move|w|{w.verify_live_scope(&scope)?;w.restaurant_live()}).await}
#[tauri::command]
async fn hub_live(scope:Scope,state:tauri::State<'_,LocalState>,runtime:tauri::State<'_,hub_server::State>)->Result<serde_json::Value,CommandError>{
 let (address,discovery)={let r=runtime.lock().map_err(|_|CommandError::unavailable("Hub state unavailable."))?;let address=if r.stop.as_ref().is_some_and(|s|!s.load(std::sync::atomic::Ordering::SeqCst)){r.address.clone()}else{None};let discovery=r.advertisement.as_ref().map(|a|a.status()).unwrap_or_else(||serde_json::json!({"state":if r.discovery_error.is_some(){"unavailable"}else{"off"},"message":r.discovery_error}));(address,discovery)};
 with_workspace(state,move|w|{w.verify_live_scope(&scope)?;let mut view=w.hub_live()?;view["address"]=serde_json::json!(address);view["discovery"]=discovery;Ok(view)}).await
}
#[tauri::command]
async fn hub_admin(scope:Scope,state:tauri::State<'_,LocalState>,runtime:tauri::State<'_,hub_server::State>)->Result<serde_json::Value,CommandError>{
 let (address,discovery)={let r=runtime.lock().map_err(|_|CommandError::unavailable("Hub state unavailable."))?;let address=if r.stop.as_ref().is_some_and(|s|!s.load(std::sync::atomic::Ordering::SeqCst)){r.address.clone()}else{None};let discovery=r.advertisement.as_ref().map(|a|a.status()).unwrap_or_else(||serde_json::json!({"state":if r.discovery_error.is_some(){"unavailable"}else{"off"},"message":r.discovery_error}));(address,discovery)};
 with_scoped_workspace(state,scope,move|w|{let mut v=w.hub_admin()?;let (cert,key)=w.hub_tls()?;let key=Zeroizing::new(key);v["tls"]=hub_server::tls_status(&cert,&key);v["discovery"]=discovery;v["address"]=serde_json::json!(address);Ok(v)}).await
}
#[tauri::command]
async fn hub_device(id:String,revision:i64,actor:Option<String>,scope:Scope,state:tauri::State<'_,LocalState>)->Result<(),CommandError>{with_scoped_workspace(state,scope,move|w|w.hub_device(&id,revision,actor.as_deref())).await}
#[tauri::command]
async fn hub_batches(scope:Scope,state:tauri::State<'_,LocalState>)->Result<serde_json::Value,CommandError>{with_scoped_workspace(state,scope,|w|w.hub_batches()).await}
#[tauri::command]
async fn hub_dispatch(id:String,revision:i64,scope:Scope,state:tauri::State<'_,LocalState>)->Result<(),CommandError>{with_scoped_workspace(state,scope,move|w|w.hub_dispatch(&id,revision)).await}
#[tauri::command]
async fn hub_control(enabled:bool,address:String,origin:Option<String>,scope:Scope,state:tauri::State<'_,LocalState>,runtime:tauri::State<'_,hub_server::State>)->Result<(),CommandError>{
 let ws=Arc::clone(state.inner());let rt=Arc::clone(runtime.inner());
 tauri::async_runtime::spawn_blocking(move||{let mut r=rt.lock().map_err(|_|CommandError::unavailable("Hub state unavailable."))?;
  let mut guard=ws.lock().map_err(|_|CommandError::unavailable("Workspace unavailable."))?;let w=guard.as_mut().map_err(|_|CommandError::unavailable("Unlock the workspace."))?;w.verify_scope(&scope)?;w.require(sornio_local_store::identity::Permission::Settings)?;
  r.halt();w.hub_configure(false,None)?;
  if enabled{let (cert,key)=w.hub_tls()?;let key=Zeroizing::new(key);let tls=hub_server::config(&cert,&key).map_err(|e|CommandError::unavailable(&e))?;let identity=w.hub_admin()?["identity"].clone();let fingerprint=hub_server::tls_status(&cert,&key)["certificateSha256"].as_str().unwrap_or("").to_string();let advertise=origin.filter(|s|!s.trim().is_empty()).map(|o|(o,identity,fingerprint));let next=hub_server::start(&address,tls,ws.clone(),advertise).map_err(|e|CommandError::unavailable(&e))?;w.hub_configure(true,None)?;*r=next;}Ok(())
 }).await.map_err(|_|CommandError::unavailable("Hub change interrupted."))?
}
#[tauri::command]
async fn hub_import_tls(scope:Scope,state:tauri::State<'_,LocalState>,runtime:tauri::State<'_,hub_server::State>)->Result<(),CommandError>{
 let result=with_scoped_workspace(state,scope,|w|{w.require(sornio_local_store::identity::Permission::Settings)?;
  #[cfg(any(windows,target_os="macos"))]{
   let cert=rfd::FileDialog::new().set_title("Select trusted HTTPS certificate chain PEM").pick_file().ok_or(StoreError::InvalidDraft)?;
   let key=rfd::FileDialog::new().set_title("Select matching private key PEM (kept in encrypted local database)").pick_file().ok_or(StoreError::InvalidDraft)?;
   if std::fs::metadata(&cert).map_err(|_|StoreError::AccessUnavailable)?.len()>65536||std::fs::metadata(&key).map_err(|_|StoreError::AccessUnavailable)?.len()>16384{return Err(StoreError::InvalidDraft);}
   let cert=std::fs::read_to_string(cert).map_err(|_|StoreError::AccessUnavailable)?;let key=std::fs::read_to_string(key).map_err(|_|StoreError::AccessUnavailable)?;
   hub_server::config(&cert,&key).map_err(|_|StoreError::InvalidIdentity)?;w.hub_configure(false,Some((cert,key)))
  }
  #[cfg(not(any(windows,target_os="macos")))]{Err(StoreError::AccessUnavailable)}
 }).await;
 if result.is_ok(){runtime.lock().map_err(|_|CommandError::unavailable("Hub state unavailable."))?.halt();}
 result
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
            app.manage(Arc::new(Mutex::new(hub_server::Runtime::default())));
            app.manage(Arc::new(Mutex::new(RecoverySelection::default())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            restaurant_live, hub_live, hub_admin, hub_control, hub_import_tls, hub_device, hub_batches, hub_dispatch,
            read_last_restore,
            choose_local_backup,
            export_local_backup,
            preview_local_backup,
            restore_local_backup,
            change_local_password,
            reset_local_staff_password,
            kitchen_view,
            kitchen_action,
            restaurant_workspace,
            restaurant_status,
            edit_restaurant,
            amend_restaurant,
            takeover_restaurant,
            restaurant_menu,
            save_restaurant_menu,
            prepare_restaurant,
            post_restaurant,
            read_restaurant,
            change_restaurant,
            list_local_held_bills,
            mutate_local_held_bill,
            prepare_local_held_checkout,
            prepare_local_retail,
            post_local_retail,
            clear_local_retail,
            read_local_retail,
            quote_local_return,
            take_over_local_payment,
            export_local_settlements,
            save_local_customer,
            find_local_customers,
            read_local_customer,
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
            read_local_invoice,
            list_local_invoices,
            read_billing_outbox
        ])
        .run(tauri::generate_context!())
        .expect("Sornio could not start");
}
