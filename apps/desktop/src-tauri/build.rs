fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "load_workspace",
            "save_workspace",
            "list_workspace_copies",
            "restore_workspace",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
