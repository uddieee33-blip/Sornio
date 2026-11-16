//! OS credential-store device-key provisioning for Windows and macOS. No renderer-provided paths or secrets.
use crate::Store;
use fs2::FileExt;
use std::{fs::OpenOptions, path::Path};
use zeroize::Zeroizing;

fn open_local(path: &Path) -> Result<Store, String> {
    open_with_vault(path, "com.sornio.localreview")
}

fn open_with_vault(path: &Path, service: &str) -> Result<Store, String> {
    let vault = keyring::Entry::new(service, "workspace-database")
        .map_err(|_| "The device credential store could not be opened.".to_string())?;
    let key = match vault.get_password() {
        Ok(secret) => Zeroizing::new(secret),
        Err(keyring::Error::NoEntry) if !path.exists() => {
            let mut bytes = Zeroizing::new([0u8; 32]);
            getrandom::fill(bytes.as_mut()).map_err(|_| "The device could not create a secure key.".to_string())?;
            let secret = Zeroizing::new(bytes.iter().map(|byte| format!("{byte:02x}")).collect::<String>());
            vault.set_password(&secret).map_err(|_| "The device key could not be saved. No workspace was created.".to_string())?;
            secret
        }
        Err(_) => return Err("The workspace key is unavailable. Keep the database and device profile; do not reset them.".into()),
    };
    Store::open(path, &key).map_err(|error| error.to_string())
}

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
    open_local(&directory.join("workspace.db"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Draft;

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
