#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fs2::FileExt;
use sornio_local_store::{Draft, Snapshot, Store};
use std::{fs::OpenOptions, path::Path, sync::Mutex};
use tauri::Manager;
#[cfg(windows)]
use zeroize::Zeroizing;

type LocalState = Mutex<Result<Store, String>>;

#[cfg(windows)]
fn open_local(path: &Path) -> Result<Store, String> {
    open_with_vault(path, "com.sornio.localreview")
}

#[cfg(windows)]
fn open_with_vault(path: &Path, service: &str) -> Result<Store, String> {
    let vault = keyring::Entry::new(service, "workspace-database")
        .map_err(|_| "Windows Credential Manager could not be opened.".to_string())?;
    let key = match vault.get_password() {
        Ok(secret) => Zeroizing::new(secret),
        Err(keyring::Error::NoEntry) if !path.exists() => {
            let mut bytes = Zeroizing::new([0u8; 32]);
            getrandom::fill(bytes.as_mut()).map_err(|_| "The device could not create a secure key.".to_string())?;
            let secret = Zeroizing::new(bytes.iter().map(|byte| format!("{byte:02x}")).collect::<String>());
            vault.set_password(&secret).map_err(|_| "The device key could not be saved. No workspace was created.".to_string())?;
            secret
        }
        Err(_) => return Err("The workspace key is unavailable. Keep the database and Windows profile; do not reset them.".into()),
    };
    Store::open(path, &key).map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn open_local(_path: &Path) -> Result<Store, String> {
    Err("This local review build requires Windows Credential Manager.".into())
}

fn initialize(directory: &Path) -> Result<Store, String> {
    std::fs::create_dir_all(directory)
        .map_err(|_| "The local workspace folder could not be created.".to_string())?;
    // Serializes first-use key provisioning across separate application processes.
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(directory.join("provision.lock"))
        .map_err(|_| "The local workspace could not be locked.".to_string())?;
    lock.lock_exclusive()
        .map_err(|_| "The local workspace is busy. Retry shortly.".to_string())?;
    open_local(&directory.join("workspace.db"))
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
        .invoke_handler(tauri::generate_handler![load_workspace, save_workspace])
        .run(tauri::generate_context!())
        .expect("Sornio could not start");
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn windows_vault_reopens_but_never_replaces_a_missing_key() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.db");
        let service = format!(
            "com.sornio.localreview.test.{}",
            directory.path().file_name().unwrap().to_string_lossy()
        );
        let vault = keyring::Entry::new(&service, "workspace-database").unwrap();
        let result = (|| -> Result<(), String> {
            let mut store = open_with_vault(&path, &service)?;
            store
                .save(
                    0,
                    Draft {
                        business_name: "Vault test".into(),
                        business_type: "general".into(),
                        note: "Saved offline".into(),
                    },
                )
                .map_err(|e| e.to_string())?;
            drop(store);
            let reopened = open_with_vault(&path, &service)?;
            if reopened.load().map_err(|e| e.to_string())?.revision != 1 {
                return Err("Draft not retained".into());
            }
            drop(reopened);
            vault.delete_credential().map_err(|e| e.to_string())?;
            if open_with_vault(&path, &service).is_ok() {
                return Err("Missing key was silently replaced".into());
            }
            if !matches!(vault.get_password(), Err(keyring::Error::NoEntry)) {
                return Err("Key was regenerated".into());
            }
            Ok(())
        })();
        let _ = vault.delete_credential();
        assert!(result.is_ok(), "{result:?}");
    }
}
