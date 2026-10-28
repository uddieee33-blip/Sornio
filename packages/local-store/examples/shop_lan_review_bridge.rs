//! Synthetic-key, localhost fixture only. Not shipped with the native application.
#[allow(dead_code)]
mod cashier_review_bridge;
use cashier_review_bridge::Call;
use serde_json::{json, Value};
use sornio_local_store::{
    access::Workspace,
    lan::{self, transport::HubServer},
    Draft, Store, StoreError,
};
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
fn arg<T: serde::de::DeserializeOwned>(a: &Value, key: &str) -> Result<T, StoreError> {
    Ok(serde_json::from_value(a[key].clone())?)
}
struct Bridge {
    workspace: Arc<Mutex<Workspace>>,
    listener: Option<HubServer>,
    approval: Option<lan::Approval>,
    request: Option<lan::PairRequest>,
    pair_file: PathBuf,
    database: PathBuf,
}
impl Bridge {
    fn restart(&mut self) -> Result<(), StoreError> {
        let config = self.workspace.lock().unwrap().lan_listener_config()?;
        self.listener.take();
        if let Some((endpoint, config)) = config {
            let w = self.workspace.clone();
            self.listener = Some(HubServer::bind(
                &endpoint,
                config,
                Arc::new(move |peer, request| w.lock().ok()?.handle_lan_peer(peer, request).ok()),
            )?);
        }
        Ok(())
    }
    fn call(&mut self, c: Call) -> Result<Value, StoreError> {
        let a = &c.args;
        Ok(match c.command.as_str() {
            "save_workspace" => serde_json::to_value(
                self.workspace
                    .lock()
                    .unwrap()
                    .save(arg(a, "expectedRevision")?, arg::<Draft>(a, "draft")?)?,
            )?,
            "read_shop_lan" => {
                json!({"status":self.workspace.lock().unwrap().lan_status()?,"listening":self.listener.is_some(),"address":self.listener.as_ref().map(|s|s.address().to_string()),"error":null})
            }
            "designate_shop_hub" => {
                self.workspace.lock().unwrap().designate_hub(
                    &arg::<String>(a, "password")?,
                    &arg::<String>(a, "endpoint")?,
                )?;
                self.restart()?;
                Value::Null
            }
            "set_shop_hub_enabled" => {
                self.workspace
                    .lock()
                    .unwrap()
                    .enable_lan_hub(&arg::<String>(a, "password")?, arg(a, "enabled")?)?;
                self.restart()?;
                Value::Null
            }
            "export_shop_pair_request" => {
                let request = self.workspace.lock().unwrap().create_pair_request(
                    &arg::<String>(a, "password")?,
                    &arg::<String>(a, "name")?,
                )?;
                std::fs::write(&self.pair_file, serde_json::to_vec(&request)?)
                    .map_err(|_| StoreError::InvalidLan)?;
                json!(true)
            }
            "preview_shop_pair_request" => {
                let request: lan::PairRequest = serde_json::from_slice(
                    &std::fs::read(&self.pair_file).map_err(|_| StoreError::InvalidLan)?,
                )?;
                let preview = lan::pair_preview(&request)?;
                self.request = Some(request);
                serde_json::to_value(preview)?
            }
            "approve_shop_computer" => {
                let request = self.request.take().ok_or(StoreError::InvalidLan)?;
                if lan::fingerprint(&request.csr) != arg::<String>(a, "requestFingerprint")? {
                    return Err(StoreError::InvalidLan);
                }
                let approval = self.workspace.lock().unwrap().approve_device(
                    &arg::<String>(a, "password")?,
                    request,
                    arg(a, "role")?,
                )?;
                std::fs::write(&self.pair_file, serde_json::to_vec(&approval)?)
                    .map_err(|_| StoreError::InvalidLan)?;
                json!(true)
            }
            "preview_shop_approval" => {
                let value: lan::Approval = serde_json::from_slice(
                    &std::fs::read(&self.pair_file).map_err(|_| StoreError::InvalidLan)?,
                )?;
                let preview = json!({"businessName":value.business_name,"businessId":value.business_id,"hubId":value.hub_id,"deviceId":value.device_id,"rootFingerprint":value.root_fingerprint()});
                self.approval = Some(value);
                preview
            }
            "join_shop_hub" => {
                let approval = self.approval.take().ok_or(StoreError::InvalidLan)?;
                self.workspace.lock().unwrap().join_hub(
                    &arg::<String>(a, "password")?,
                    approval,
                    &arg::<String>(a, "endpoint")?,
                    &arg::<String>(a, "fingerprint")?,
                )?;
                Value::Null
            }
            "change_shop_hub_address" => {
                self.workspace.lock().unwrap().change_hub_address(
                    &arg::<String>(a, "password")?,
                    &arg::<String>(a, "endpoint")?,
                )?;
                Value::Null
            }
            "list_shop_computers" => {
                serde_json::to_value(self.workspace.lock().unwrap().lan_devices()?)?
            }
            "change_shop_computer" => {
                self.workspace.lock().unwrap().change_lan_device(
                    &arg::<String>(a, "password")?,
                    &arg::<String>(a, "deviceId")?,
                    arg(a, "role")?,
                    arg(a, "enabled")?,
                    arg(a, "revision")?,
                )?;
                Value::Null
            }
            "review_drop_listener" => {
                self.listener.take();
                Value::Null
            }
            "review_restart_listener" => {
                self.restart()?;
                json!(self.listener.as_ref().map(|s| s.address().to_string()))
            }
            "review_local_invoice_count" => {
                json!(Store::open(&self.database, KEY)?.list_invoices(0)?.len())
            }
            _ => cashier_review_bridge::call(&mut self.workspace.lock().unwrap(), c)?,
        })
    }
}
fn main() {
    let database = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .expect("Synthetic fixture database"),
    );
    let pair_file = database.with_extension("sorniopair");
    let w = Workspace::new(Store::open(&database, KEY).unwrap());
    let mut bridge = Bridge {
        workspace: Arc::new(Mutex::new(w)),
        listener: None,
        approval: None,
        request: None,
        pair_file,
        database,
    };
    bridge.restart().unwrap();
    for line in io::stdin().lock().lines() {
        let c: Call = serde_json::from_str(&line.unwrap()).unwrap();
        let result = match bridge.call(c) {
            Ok(value) => json!({"ok":true,"value":value}),
            Err(error) => {
                let code = match error {
                    StoreError::Locked => "locked",
                    StoreError::IncorrectPassword => "incorrect_password",
                    StoreError::RateLimited => "rate_limited",
                    StoreError::LanUncertain => "lan_uncertain",
                    StoreError::HubUnavailable => "hub_unavailable",
                    StoreError::LanDenied => "lan_denied",
                    StoreError::StockConflict => "stock_conflict",
                    StoreError::InvalidStock | StoreError::ProductMissing => "invalid_product",
                    StoreError::OperationConflict => "operation_conflict",
                    StoreError::CheckoutActive => "checkout_active",
                    _ => "workspace_error",
                };
                json!({"ok":false,"error":{"code":code,"message":error.to_string()}})
            }
        };
        println!("{result}");
        io::stdout().flush().unwrap();
    }
}
