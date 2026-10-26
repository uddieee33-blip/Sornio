#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
use sornio_local_store::device::initialize;
use sornio_local_store::{Draft, SavedCopy, Snapshot, Store};
use std::sync::Mutex;
use tauri::Manager;

type LocalState = Mutex<Result<Store, String>>;

#[cfg(not(windows))]
fn initialize(_directory: &std::path::Path) -> Result<Store, String> {
    Err("This local review build requires Windows Credential Manager.".into())
}

#[tauri::command]
fn load_workspace(state: tauri::State<'_, LocalState>) -> Result<Snapshot, String> {
    let guard = state
        .lock()
        .map_err(|_| "Restart Sornio to reopen the local workspace.".to_string())?;
    match &*guard {
        Ok(store) => store.load().map_err(|e| e.to_string()),
        Err(error) => Err(error.clone()),
    }
}

#[tauri::command]
fn save_workspace(
    expected_revision: i64,
    draft: Draft,
    state: tauri::State<'_, LocalState>,
) -> Result<Snapshot, String> {
    let mut guard = state
        .lock()
        .map_err(|_| "Restart Sornio to reopen the local workspace.".to_string())?;
    match &mut *guard {
        Ok(store) => store
            .save(expected_revision, draft)
            .map_err(|e| e.to_string()),
        Err(error) => Err(error.clone()),
    }
}

#[tauri::command]
fn list_workspace_copies(state: tauri::State<'_, LocalState>) -> Result<Vec<SavedCopy>, String> {
    let guard = state
        .lock()
        .map_err(|_| "Restart Sornio to reopen the local workspace.".to_string())?;
    match &*guard {
        Ok(store) => store.saved_copies().map_err(|e| e.to_string()),
        Err(error) => Err(error.clone()),
    }
}

#[tauri::command]
fn restore_workspace(
    expected_revision: i64,
    source_revision: i64,
    state: tauri::State<'_, LocalState>,
) -> Result<Snapshot, String> {
    let mut guard = state
        .lock()
        .map_err(|_| "Restart Sornio to reopen the local workspace.".to_string())?;
    match &mut *guard {
        Ok(store) => store
            .restore(expected_revision, source_revision)
            .map_err(|e| e.to_string()),
        Err(error) => Err(error.clone()),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let store = app
                .path()
                .app_local_data_dir()
                .map_err(|_| "The device data directory is unavailable.".to_string())
                .and_then(|path| initialize(&path));
            app.manage(Mutex::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            list_workspace_copies,
            restore_workspace
        ])
        .run(tauri::generate_context!())
        .expect("Sornio could not start");
}
