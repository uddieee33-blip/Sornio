fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "workspace_access_status",
            "setup_local_access",
            "unlock_workspace",
            "lock_workspace",
            "load_workspace",
            "save_workspace",
            "list_workspace_copies",
            "restore_workspace",
            "list_local_products",
            "add_local_product",
            "adjust_local_stock",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
