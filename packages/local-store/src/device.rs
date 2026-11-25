//! OS credential-store device-key provisioning and single-instance workspace
//! locking for Windows and macOS. No renderer-provided paths or secrets.
use crate::Store;
use fs2::FileExt;
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::Path,
};
use zeroize::Zeroizing;

/// Exclusive OS file lock held for the lifetime of one desktop application
/// process targeting a workspace directory. Automatically released by the OS on
/// normal exit, crash, or power loss so a crashed process never leaves a stale
/// lock behind.
pub struct WorkspaceInstanceLock(File);

impl WorkspaceInstanceLock {
    pub fn acquire(directory: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(directory)
            .map_err(|_| "The local workspace folder could not be created.".to_string())?;
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join("workspace.lock"))
            .map_err(|_| "The local workspace lock file could not be opened.".to_string())?;
        file.try_lock_exclusive().map_err(|_| {
            "Sornio is already open for this workspace on this PC. Switch to the open Sornio window instead of opening a second copy.".to_string()
        })?;
        let _ = file.set_len(0);
        let _ = writeln!(file, "pid={}", std::process::id());
        let _ = file.sync_data();
        Ok(Self(file))
    }
}

fn open_local(path: &Path, backup_dir: &Path) -> Result<Store, String> {
    open_with_vault(path, "com.sornio.localreview", Some(backup_dir))
}

fn open_with_vault(path: &Path, service: &str, backup_dir: Option<&Path>) -> Result<Store, String> {
    let vault = keyring::Entry::new(service, "workspace-database")
        .map_err(|_| "The device credential store could not be opened.".to_string())?;
    let key = match vault.get_password() {
        Ok(secret) => Zeroizing::new(secret),
        Err(keyring::Error::NoEntry) if !path.exists() => {
            let mut bytes = Zeroizing::new([0u8; 32]);
            getrandom::fill(bytes.as_mut())
                .map_err(|_| "The device could not create a secure key.".to_string())?;
            let secret = Zeroizing::new(
                bytes
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>(),
            );
            vault
                .set_password(&secret)
                .map_err(|_| "The device key could not be saved. No workspace was created.".to_string())?;
            secret
        }
        Err(_) => {
            return Err(
                "The workspace key is unavailable. Keep the database and device profile; do not reset them.".into(),
            )
        }
    };
    match backup_dir {
        Some(dir) => Store::open_with_migration_backup(path, &key, dir).map_err(|e| e.to_string()),
        None => Store::open(path, &key).map_err(|e| e.to_string()),
    }
}

/// Open the device-backed store (used by quiescent audit tooling and desktop startup).
pub fn initialize(directory: &Path) -> Result<Store, String> {
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
    open_local(
        &directory.join("workspace.db"),
        &directory.join("migration-backups"),
    )
}

/// Acquire an exclusive single-instance lock for the desktop GUI process and
/// open the device-backed encrypted workspace with pre-migration backup safety.
pub fn initialize_desktop(directory: &Path) -> Result<(Store, WorkspaceInstanceLock), String> {
    let instance_lock = WorkspaceInstanceLock::acquire(directory)?;
    let store = initialize(directory)?;
    Ok((store, instance_lock))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Draft;

    #[test]
    fn workspace_instance_lock_blocks_second_holder_and_releases_on_drop() {
        let directory = tempfile::tempdir().unwrap();
        let first = WorkspaceInstanceLock::acquire(directory.path()).unwrap();
        let second = WorkspaceInstanceLock::acquire(directory.path());
        assert!(
            second.is_err(),
            "a second instance must not acquire the same workspace lock"
        );
        assert!(second
            .err()
            .unwrap()
            .contains("Sornio is already open for this workspace"));
        drop(first);
        let third = WorkspaceInstanceLock::acquire(directory.path());
        assert!(
            third.is_ok(),
            "lock must be cleanly acquirable after the first instance exits"
        );
    }

    #[test]
    fn native_vault_reopens_but_never_replaces_a_missing_key() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.db");
        let service = format!(
            "com.sornio.localreview.test.{}",
            directory.path().file_name().unwrap().to_string_lossy()
        );
        let vault = keyring::Entry::new(&service, "workspace-database").unwrap();
        let result = (|| -> Result<(), String> {
            let mut store = open_with_vault(&path, &service, None)?;
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
            let reopened = open_with_vault(&path, &service, None)?;
            if reopened.load().map_err(|e| e.to_string())?.revision != 1 {
                return Err("Draft not retained".into());
            }
            drop(reopened);
            vault.delete_credential().map_err(|e| e.to_string())?;
            if open_with_vault(&path, &service, None).is_ok() {
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
