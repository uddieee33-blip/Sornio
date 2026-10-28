//! Native pairing files are public CSR/certificate material only. Keys never cross IPC.
use super::*;
use sornio_local_store::lan::{self, transport::HubServer};
use std::{
    io::{Read, Write},
    path::PathBuf,
};
#[derive(Default)]
pub struct Runtime {
    server: Option<HubServer>,
    error: Option<String>,
}
pub type RuntimeState = Arc<Mutex<Runtime>>;
#[derive(Default)]
pub struct SelectedApproval {
    approval: Option<lan::Approval>,
    request: Option<lan::PairRequest>,
}
pub(super) type ApprovalState = Arc<Mutex<SelectedApproval>>;
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LiveStatus {
    status: lan::Status,
    listening: bool,
    address: Option<String>,
    error: Option<String>,
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApprovalPreview {
    business_name: String,
    business_id: String,
    hub_id: String,
    device_id: String,
    root_fingerprint: String,
}

pub fn refresh_listener(shared: LocalState, runtime: RuntimeState) -> Result<(), CommandError> {
    let config = {
        let guard = shared
            .lock()
            .map_err(|_| CommandError::unavailable("Restart Sornio to reopen the hub."))?;
        match &*guard {
            Ok(w) => w.lan_listener_config().map_err(CommandError::from)?,
            Err(_) => None,
        }
    };
    let mut running = runtime
        .lock()
        .map_err(|_| CommandError::unavailable("Restart Sornio to reopen the listener."))?;
    running.server.take();
    running.error = None;
    if let Some((endpoint, config)) = config {
        let server = HubServer::bind(
            &endpoint,
            config,
            Arc::new(move |peer, request| {
                let mut guard = shared.lock().ok()?;
                guard.as_mut().ok()?.handle_lan_peer(peer, request).ok()
            }),
        );
        match server {
            Ok(server) => running.server = Some(server),
            Err(error) => {
                running.error = Some(error.to_string());
                return Err(error.into());
            }
        }
    }
    Ok(())
}
#[cfg(windows)]
fn pick_public_file() -> Option<PathBuf> {
    rfd::FileDialog::new()
        .add_filter("Sornio computer pairing", &["sorniopair"])
        .set_title("Open Sornio pairing file")
        .pick_file()
}
#[cfg(not(windows))]
fn pick_public_file() -> Option<PathBuf> {
    None
}
fn load_public<T: serde::de::DeserializeOwned>() -> Result<Option<T>, StoreError> {
    let Some(path) = pick_public_file() else {
        return Ok(None);
    };
    let mut file = std::fs::File::open(path).map_err(|_| StoreError::InvalidLan)?;
    if !file
        .metadata()
        .map_err(|_| StoreError::InvalidLan)?
        .is_file()
    {
        return Err(StoreError::InvalidLan);
    }
    let mut raw = Vec::new();
    Read::by_ref(&mut file)
        .take(65537)
        .read_to_end(&mut raw)
        .map_err(|_| StoreError::InvalidLan)?;
    if raw.len() > 65536 {
        return Err(StoreError::InvalidLan);
    }
    Ok(Some(
        serde_json::from_slice(&raw).map_err(|_| StoreError::InvalidLan)?,
    ))
}
fn save_public(value: &impl serde::Serialize, name: &str) -> Result<bool, StoreError> {
    #[cfg(windows)]
    let path = rfd::FileDialog::new()
        .add_filter("Sornio computer pairing", &["sorniopair"])
        .set_file_name(name)
        .set_title("Save Sornio pairing file")
        .save_file();
    #[cfg(not(windows))]
    let path: Option<PathBuf> = {
        let _ = name;
        None
    };
    let Some(path) = path else { return Ok(false) };
    let parent = path.parent().ok_or(StoreError::InvalidLan)?;
    let mut file = tempfile::Builder::new()
        .prefix(".sornio-pair-")
        .tempfile_in(parent)
        .map_err(|_| StoreError::InvalidLan)?;
    file.write_all(&serde_json::to_vec(value)?)
        .map_err(|_| StoreError::InvalidLan)?;
    file.as_file()
        .sync_all()
        .map_err(|_| StoreError::InvalidLan)?;
    file.persist_noclobber(&path)
        .map_err(|_| StoreError::InvalidLan)?;
    Ok(true)
}
#[tauri::command]
pub(super) async fn read_shop_lan(
    state: tauri::State<'_, LocalState>,
    runtime: tauri::State<'_, RuntimeState>,
) -> Result<LiveStatus, CommandError> {
    let runtime = Arc::clone(runtime.inner());
    with_workspace(state, move |w| {
        let status = w.lan_status()?;
        let runtime = runtime.lock().map_err(|_| StoreError::AccessUnavailable)?;
        Ok(LiveStatus {
            status,
            listening: runtime.server.is_some(),
            address: runtime.server.as_ref().map(|s| s.address().to_string()),
            error: runtime.error.clone(),
        })
    })
    .await
}
#[tauri::command]
pub(super) async fn designate_shop_hub(
    password: String,
    endpoint: String,
    state: tauri::State<'_, LocalState>,
    runtime: tauri::State<'_, RuntimeState>,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let shared = Arc::clone(state.inner());
    let runtime = Arc::clone(runtime.inner());
    with_workspace(state, move |w| w.designate_hub(&password, &endpoint)).await?;
    refresh_listener(shared, runtime)
}
#[tauri::command]
pub(super) async fn set_shop_hub_enabled(
    password: String,
    enabled: bool,
    state: tauri::State<'_, LocalState>,
    runtime: tauri::State<'_, RuntimeState>,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let shared = Arc::clone(state.inner());
    let runtime = Arc::clone(runtime.inner());
    with_workspace(state, move |w| w.enable_lan_hub(&password, enabled)).await?;
    refresh_listener(shared, runtime)
}
#[tauri::command]
pub(super) async fn export_shop_pair_request(
    password: String,
    name: String,
    state: tauri::State<'_, LocalState>,
) -> Result<bool, CommandError> {
    let password = Zeroizing::new(password);
    with_workspace(state, move |w| {
        let request = w.create_pair_request(&password, &name)?;
        save_public(&request, "sornio-computer-request.sorniopair")
    })
    .await
}
#[tauri::command]
pub(super) async fn preview_shop_pair_request(
    selection: tauri::State<'_, ApprovalState>,
) -> Result<Option<lan::PairPreview>, CommandError> {
    let selected = Arc::clone(selection.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let request = load_public::<lan::PairRequest>().map_err(CommandError::from)?;
        let preview = request
            .as_ref()
            .map(lan::pair_preview)
            .transpose()
            .map_err(CommandError::from)?;
        selected
            .lock()
            .map_err(|_| CommandError::unavailable("Choose the request again."))?
            .request = request;
        Ok(preview)
    })
    .await
    .map_err(|_| CommandError::unavailable("Pairing preview stopped."))?
}
#[tauri::command]
pub(super) async fn approve_shop_computer(
    password: String,
    role: lan::Role,
    request_fingerprint: String,
    selection: tauri::State<'_, ApprovalState>,
    state: tauri::State<'_, LocalState>,
) -> Result<bool, CommandError> {
    let password = Zeroizing::new(password);
    let selected = Arc::clone(selection.inner());
    with_workspace(state, move |w| {
        w.unlock(&password)?;
        let request = selected
            .lock()
            .map_err(|_| StoreError::AccessUnavailable)?
            .request
            .take()
            .ok_or(StoreError::InvalidLan)?;
        if lan::fingerprint(&request.csr) != request_fingerprint {
            return Err(StoreError::InvalidLan);
        }
        let approval = w.approve_device(&password, request, role)?;
        save_public(&approval, "sornio-hub-approval.sorniopair")
    })
    .await
}
#[tauri::command]
pub(super) async fn preview_shop_approval(
    selection: tauri::State<'_, ApprovalState>,
) -> Result<Option<ApprovalPreview>, CommandError> {
    let selected = Arc::clone(selection.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let value = load_public::<lan::Approval>().map_err(CommandError::from)?;
        let preview = value.as_ref().map(|a| ApprovalPreview {
            business_name: a.business_name.clone(),
            business_id: a.business_id.clone(),
            hub_id: a.hub_id.clone(),
            device_id: a.device_id.clone(),
            root_fingerprint: a.root_fingerprint(),
        });
        selected
            .lock()
            .map_err(|_| CommandError::unavailable("Choose the approval again."))?
            .approval = value;
        Ok(preview)
    })
    .await
    .map_err(|_| CommandError::unavailable("Pairing selection stopped."))?
}
#[tauri::command]
pub(super) async fn join_shop_hub(
    password: String,
    endpoint: String,
    fingerprint: String,
    selection: tauri::State<'_, ApprovalState>,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let selected = Arc::clone(selection.inner());
    with_workspace(state, move |w| {
        let approval = selected
            .lock()
            .map_err(|_| StoreError::AccessUnavailable)?
            .approval
            .take()
            .ok_or(StoreError::InvalidLan)?;
        w.join_hub(&password, approval, &endpoint, &fingerprint)?;
        Ok(())
    })
    .await
}
#[tauri::command]
pub(super) async fn change_shop_hub_address(
    password: String,
    endpoint: String,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    with_workspace(state, move |w| w.change_hub_address(&password, &endpoint)).await
}
#[tauri::command]
pub(super) async fn list_shop_computers(
    state: tauri::State<'_, LocalState>,
) -> Result<Vec<lan::Device>, CommandError> {
    with_workspace(state, |w| w.lan_devices()).await
}
#[tauri::command]
pub(super) async fn change_shop_computer(
    password: String,
    device_id: String,
    role: lan::Role,
    enabled: bool,
    revision: i64,
    state: tauri::State<'_, LocalState>,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    with_workspace(state, move |w| {
        w.change_lan_device(&password, &device_id, role, enabled, revision)
    })
    .await
}

pub fn setup(app: &mut tauri::App, shared: LocalState) {
    let runtime = Arc::new(Mutex::new(Runtime::default()));
    let _ = refresh_listener(shared, runtime.clone());
    app.manage(runtime);
    app.manage(Arc::new(Mutex::new(SelectedApproval::default())));
}
