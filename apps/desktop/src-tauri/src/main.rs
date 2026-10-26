#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
use sornio_local_store::device::initialize;
use sornio_local_store::{
    access::{AccessStatus, Workspace},
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
            StoreError::IncorrectPassword => "incorrect_password",
            StoreError::RateLimited => "rate_limited",
            StoreError::AccessConfigured => "already_configured",
            StoreError::AccessNotConfigured => "not_configured",
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
    password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<AccessStatus, CommandError> {
    let password = Zeroizing::new(password);
    with_workspace(state, move |w| w.setup(&password)).await
}

#[tauri::command]
async fn unlock_workspace(
    password: String,
    state: tauri::State<'_, LocalState>,
) -> Result<AccessStatus, CommandError> {
    let password = Zeroizing::new(password);
    with_workspace(state, move |w| w.unlock(&password)).await
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
async fn load_workspace(state: tauri::State<'_, LocalState>) -> Result<Snapshot, CommandError> {
    with_workspace(state, |w| w.load()).await
}

#[tauri::command]
async fn save_workspace(
    expected_revision: i64,
    draft: Draft,
    state: tauri::State<'_, LocalState>,
) -> Result<Snapshot, CommandError> {
    with_workspace(state, move |w| w.save(expected_revision, draft)).await
}

#[tauri::command]
async fn list_workspace_copies(
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<SavedCopy>, CommandError> {
    with_workspace(state, |w| w.saved_copies()).await
}

#[tauri::command]
async fn restore_workspace(
    expected_revision: i64,
    source_revision: i64,
    state: tauri::State<'_, LocalState>,
) -> Result<Snapshot, CommandError> {
    with_workspace(state, move |w| {
        w.restore(expected_revision, source_revision)
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
            workspace_access_status,
            setup_local_access,
            unlock_workspace,
            lock_workspace,
            load_workspace,
            save_workspace,
            list_workspace_copies,
            restore_workspace
        ])
        .run(tauri::generate_context!())
        .expect("Sornio could not start");
}
