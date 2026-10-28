//! Single-shop authority. Device certificates are capabilities, not staff/cloud identity.
use crate::{
    billing::{Invoice, InvoiceRecord, OutboxRecord, PostInvoice},
    catalog::Product,
    Store, StoreError,
};
use rcgen::{
    BasicConstraints, CertificateParams, CertificateSigningRequestParams, DnType,
    ExtendedKeyUsagePurpose, IsCa, Issuer, KeyPair, KeyUsagePurpose,
};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
};
use zeroize::Zeroizing;
pub(crate) mod client;
#[cfg(test)]
mod tests;
pub mod transport;

pub(crate) fn migrate(db: &mut Connection) -> Result<(), StoreError> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute_batch(include_str!("schema.sql"))?;
    tx.commit()?;
    Ok(())
}
pub(crate) fn random_id() -> Result<String, StoreError> {
    let mut bytes = [0; 32];
    getrandom::fill(&mut bytes).map_err(|_| StoreError::AccessUnavailable)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
pub fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn id(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn name(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= 240
        && value.chars().count() <= 120
        && !value.chars().any(char::is_control)
}
pub fn local_address(address: &str) -> Result<SocketAddr, StoreError> {
    if address.len() > 100 {
        return Err(StoreError::InvalidLan);
    }
    let parsed: SocketAddr = address.parse().map_err(|_| StoreError::InvalidLan)?;
    let allowed = match parsed.ip() {
        IpAddr::V4(v) => v.is_private() || v.is_loopback(),
        IpAddr::V6(v) => v.is_loopback() || v.is_unique_local(),
    };
    if !allowed || (parsed.port() != 0 && parsed.port() < 1024) {
        return Err(StoreError::InvalidLan);
    }
    Ok(parsed)
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Owner,
    Manager,
    Cashier,
}
impl Role {
    fn text(self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Manager => "manager",
            Self::Cashier => "cashier",
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairRequest {
    pub version: u32,
    pub device_id: String,
    pub name: String,
    pub csr: Vec<u8>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairPreview {
    pub name: String,
    pub device_id: String,
    pub request_fingerprint: String,
}
fn verify_request(request: &PairRequest) -> Result<CertificateSigningRequestParams, StoreError> {
    if request.version != 1
        || !id(&request.device_id)
        || !name(&request.name)
        || request.csr.len() > 16384
    {
        return Err(StoreError::InvalidLan);
    }
    let csr = CertificateSigningRequestParams::from_der(&request.csr.clone().into())
        .map_err(|_| StoreError::InvalidLan)?;
    if csr.params.distinguished_name.get(&DnType::CommonName)
        != Some(&rcgen::DnValue::Utf8String(request.device_id.clone()))
    {
        return Err(StoreError::InvalidLan);
    }
    Ok(csr)
}
pub fn pair_preview(request: &PairRequest) -> Result<PairPreview, StoreError> {
    let _ = verify_request(request)?;
    Ok(PairPreview {
        name: request.name.clone(),
        device_id: request.device_id.clone(),
        request_fingerprint: fingerprint(&request.csr),
    })
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Approval {
    pub version: u32,
    pub business_id: String,
    pub hub_id: String,
    pub business_name: String,
    pub device_id: String,
    pub request_hash: String,
    pub root: Vec<u8>,
    pub certificate: Vec<u8>,
}
impl Approval {
    pub fn root_fingerprint(&self) -> String {
        fingerprint(&self.root)
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Settings {
    version: u32,
    mode: String,
    business_id: String,
    hub_id: String,
    device_id: String,
    name: String,
    endpoint: String,
    enabled: bool,
    root: Vec<u8>,
    root_key: Vec<u8>,
    server_cert: Vec<u8>,
    server_key: Vec<u8>,
    device_key: Vec<u8>,
    csr: Vec<u8>,
    device_cert: Vec<u8>,
}
impl Drop for Settings {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.root_key.zeroize();
        self.server_key.zeroize();
        self.device_key.zeroize();
    }
}
fn settings(db: &Connection) -> Result<Option<Settings>, StoreError> {
    let raw: Option<String> = db
        .query_row(
            "SELECT payload FROM lan_settings WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .optional()?;
    raw.map(|v| {
        let v = Zeroizing::new(v);
        serde_json::from_str(&v).map_err(StoreError::from)
    })
    .transpose()
    .and_then(|s: Option<Settings>| {
        if s.as_ref().is_some_and(|s| s.version != 1) {
            Err(StoreError::InvalidLan)
        } else {
            Ok(s)
        }
    })
}
fn save_settings(db: &Connection, s: &Settings) -> Result<(), StoreError> {
    let raw = Zeroizing::new(serde_json::to_string(s)?);
    db.execute("INSERT INTO lan_settings VALUES(1,?1) ON CONFLICT(singleton) DO UPDATE SET payload=excluded.payload",[&*raw])?;
    Ok(())
}
fn audit(
    db: &Connection,
    actor: &str,
    action: &str,
    payload: serde_json::Value,
) -> Result<(), StoreError> {
    db.execute(
        "INSERT INTO lan_audit(actor,action,payload) VALUES(?1,?2,?3)",
        params![actor, action, payload.to_string()],
    )?;
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub name: Option<String>,
    pub mode: String,
    pub business_id: Option<String>,
    pub hub_id: Option<String>,
    pub device_id: Option<String>,
    pub endpoint: Option<String>,
    pub enabled: bool,
    pub root_fingerprint: Option<String>,
    pub pairing_fingerprint: Option<String>,
    pub pending: usize,
}
pub(crate) fn status(db: &Connection) -> Result<Status, StoreError> {
    let s = settings(db)?;
    let pending: i64 = db.query_row(
        "SELECT count(*) FROM lan_client_queue WHERE active=1",
        [],
        |r| r.get(0),
    )?;
    Ok(Status {
        name: s.as_ref().map(|s| s.name.clone()),
        mode: s
            .as_ref()
            .map(|s| s.mode.clone())
            .unwrap_or_else(|| "standalone".into()),
        business_id: s
            .as_ref()
            .filter(|s| !s.business_id.is_empty())
            .map(|s| s.business_id.clone()),
        hub_id: s
            .as_ref()
            .filter(|s| !s.hub_id.is_empty())
            .map(|s| s.hub_id.clone()),
        device_id: s.as_ref().map(|s| s.device_id.clone()),
        endpoint: s.as_ref().map(|s| s.endpoint.clone()),
        enabled: s.as_ref().is_some_and(|s| s.enabled),
        pairing_fingerprint: s
            .as_ref()
            .filter(|s| !s.csr.is_empty())
            .map(|s| fingerprint(&s.csr)),
        root_fingerprint: s
            .as_ref()
            .filter(|s| !s.root.is_empty())
            .map(|s| fingerprint(&s.root)),
        pending: pending as usize,
    })
}
pub(crate) fn client_mode(db: &Connection) -> Result<bool, StoreError> {
    Ok(settings(db)?.is_some_and(|s| s.mode == "client" || s.mode == "pairing"))
}
pub(crate) fn guard_local(db: &Connection) -> Result<(), StoreError> {
    if client_mode(db)? {
        Err(StoreError::LanDenied)
    } else {
        Ok(())
    }
}
pub(crate) fn guard_local_id(db: &Connection, id: &str) -> Result<(), StoreError> {
    if db.query_row(
        "SELECT EXISTS(SELECT 1 FROM lan_operations WHERE operation_id=?1 AND committed=0)",
        [id],
        |r| r.get::<_, bool>(0),
    )? {
        Err(StoreError::OperationConflict)
    } else {
        Ok(())
    }
}
fn cert_params(common_name: &str, server: bool) -> Result<CertificateParams, StoreError> {
    let mut p = CertificateParams::new(if server {
        vec!["sornio.shop".into()]
    } else {
        vec![]
    })
    .map_err(|_| StoreError::InvalidLan)?;
    p.distinguished_name.push(DnType::CommonName, common_name);
    p.not_before = rcgen::date_time_ymd(2020, 1, 1);
    p.not_after = rcgen::date_time_ymd(2100, 1, 1);
    p.key_usages = vec![KeyUsagePurpose::DigitalSignature];
    p.extended_key_usages = vec![if server {
        ExtendedKeyUsagePurpose::ServerAuth
    } else {
        ExtendedKeyUsagePurpose::ClientAuth
    }];
    Ok(p)
}
fn new_settings(mode: &str, name: &str) -> Result<Settings, StoreError> {
    Ok(Settings {
        version: 1,
        mode: mode.into(),
        business_id: String::new(),
        hub_id: String::new(),
        device_id: random_id()?,
        name: name.into(),
        endpoint: String::new(),
        enabled: false,
        root: vec![],
        root_key: vec![],
        server_cert: vec![],
        server_key: vec![],
        device_key: vec![],
        csr: vec![],
        device_cert: vec![],
    })
}
pub(crate) fn designate(store: &mut Store, endpoint: &str) -> Result<Status, StoreError> {
    local_address(endpoint)?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    if settings(&tx)?.is_some() {
        return Err(StoreError::LanConfigured);
    }
    let draft: Option<String> = tx
        .query_row(
            "SELECT payload FROM workspace_draft WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .optional()?;
    let business = draft
        .and_then(|s| serde_json::from_str::<crate::Draft>(&s).ok())
        .ok_or(StoreError::InvalidDraft)?;
    let mut s = new_settings("hub", &business.business_name)?;
    s.business_id = random_id()?;
    s.hub_id = random_id()?;
    s.endpoint = endpoint.into();
    s.enabled = true;
    let root_key = KeyPair::generate().map_err(|_| StoreError::AccessUnavailable)?;
    let mut root = cert_params(&format!("Sornio shop {}", s.hub_id), false)?;
    root.extended_key_usages = vec![];
    root.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    root.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    let cert = root
        .self_signed(&root_key)
        .map_err(|_| StoreError::InvalidLan)?;
    let server_key = KeyPair::generate().map_err(|_| StoreError::AccessUnavailable)?;
    let server = cert_params("Sornio shop hub", true)?
        .signed_by(&server_key, &Issuer::from_params(&root, &root_key))
        .map_err(|_| StoreError::InvalidLan)?;
    s.root = cert.der().to_vec();
    s.root_key = root_key.serialize_der();
    s.server_cert = server.der().to_vec();
    s.server_key = server_key.serialize_der();
    save_settings(&tx, &s)?;
    audit(
        &tx,
        "local-administrator",
        "hub.designated",
        serde_json::json!({"businessId":s.business_id,"hubId":s.hub_id,"endpoint":endpoint,"rootFingerprint":fingerprint(&s.root)}),
    )?;
    tx.commit()?;
    status(&store.0)
}
pub(crate) fn pairing_request(
    store: &mut Store,
    device_name: &str,
) -> Result<PairRequest, StoreError> {
    if !name(device_name) {
        return Err(StoreError::InvalidLan);
    }
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    if let Some(s) = settings(&tx)? {
        if s.mode == "pairing" && s.name == device_name {
            return Ok(PairRequest {
                version: 1,
                device_id: s.device_id.clone(),
                name: s.name.clone(),
                csr: s.csr.clone(),
            });
        }
        return Err(StoreError::LanConfigured);
    }
    let data:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM local_products UNION ALL SELECT 1 FROM local_invoices UNION ALL SELECT 1 FROM local_checkout LIMIT 1)",[],|r|r.get(0))?;
    if data {
        return Err(StoreError::LanConfigured);
    }
    let mut s = new_settings("pairing", device_name)?;
    let key = KeyPair::generate().map_err(|_| StoreError::AccessUnavailable)?;
    s.csr = cert_params(&s.device_id, false)?
        .serialize_request(&key)
        .map_err(|_| StoreError::InvalidLan)?
        .der()
        .to_vec();
    s.device_key = key.serialize_der();
    let result = PairRequest {
        version: 1,
        device_id: s.device_id.clone(),
        name: s.name.clone(),
        csr: s.csr.clone(),
    };
    save_settings(&tx, &s)?;
    audit(
        &tx,
        "local-administrator",
        "device.requested",
        serde_json::json!({"deviceId":s.device_id,"requestHash":fingerprint(&s.csr)}),
    )?;
    tx.commit()?;
    Ok(result)
}
pub(crate) fn approve(
    store: &mut Store,
    request: PairRequest,
    role: Role,
) -> Result<Approval, StoreError> {
    if request.version != 1
        || !id(&request.device_id)
        || !name(&request.name)
        || request.csr.len() > 16384
    {
        return Err(StoreError::InvalidLan);
    }
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let s = settings(&tx)?
        .filter(|s| s.mode == "hub")
        .ok_or(StoreError::LanDenied)?;
    let hash = fingerprint(&request.csr);
    if let Some((old_hash, old_role, old_name, approval)) = tx
        .query_row(
            "SELECT request_hash,role,name,approval FROM lan_devices WHERE device_id=?1",
            [&request.device_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?
    {
        if old_hash == hash && old_role == role.text() && old_name == request.name {
            return Ok(serde_json::from_str(&approval)?);
        }
        return Err(StoreError::OperationConflict);
    }
    let csr = verify_request(&request)?;
    let key = KeyPair::try_from(s.root_key.as_slice()).map_err(|_| StoreError::InvalidLan)?;
    let issuer = Issuer::from_ca_cert_der(&s.root.clone().into(), key)
        .map_err(|_| StoreError::InvalidLan)?;
    // Never sign the applicant's requested CA/server extensions. Only its verified public key is used.
    let certificate = cert_params(&request.device_id, false)?
        .signed_by(&csr.public_key, &issuer)
        .map_err(|_| StoreError::InvalidLan)?
        .der()
        .to_vec();
    let approval = Approval {
        version: 1,
        business_id: s.business_id.clone(),
        hub_id: s.hub_id.clone(),
        business_name: s.name.clone(),
        device_id: request.device_id.clone(),
        request_hash: hash.clone(),
        root: s.root.clone(),
        certificate,
    };
    tx.execute(
        "INSERT INTO lan_devices VALUES(?1,?2,?3,?4,?5,?6,1,1)",
        params![
            request.device_id,
            request.name,
            role.text(),
            fingerprint(&approval.certificate),
            hash,
            serde_json::to_string(&approval)?
        ],
    )?;
    audit(
        &tx,
        "local-administrator",
        "device.approved",
        serde_json::json!({"deviceId":request.device_id,"name":request.name,"role":role,"certificateHash":fingerprint(&approval.certificate)}),
    )?;
    tx.commit()?;
    Ok(approval)
}
pub(crate) fn join(
    store: &mut Store,
    approval: Approval,
    endpoint: &str,
    confirmed_fingerprint: &str,
) -> Result<Status, StoreError> {
    if approval.version != 1
        || !id(&approval.business_id)
        || !id(&approval.hub_id)
        || approval.root.len() > 16384
        || approval.certificate.len() > 16384
        || approval.root_fingerprint() != confirmed_fingerprint
    {
        return Err(StoreError::InvalidLan);
    }
    local_address(endpoint)?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut s = settings(&tx)?
        .filter(|s| s.mode == "pairing")
        .ok_or(StoreError::LanConfigured)?;
    if approval.device_id != s.device_id || approval.request_hash != fingerprint(&s.csr) {
        return Err(StoreError::LanDenied);
    }
    s.mode = "client".into();
    s.business_id = approval.business_id.clone();
    s.hub_id = approval.hub_id.clone();
    s.root = approval.root.clone();
    s.device_cert = approval.certificate.clone();
    s.endpoint = endpoint.into();
    s.enabled = true;
    let _ = transport::client_config(&s)?;
    save_settings(&tx, &s)?;
    tx.execute("INSERT INTO lan_client_cache VALUES(1,'[]',0,0)", [])?;
    audit(
        &tx,
        "local-administrator",
        "device.joined",
        serde_json::json!({"businessId":s.business_id,"hubId":s.hub_id,"rootFingerprint":confirmed_fingerprint}),
    )?;
    tx.commit()?;
    status(&store.0)
}
pub(crate) fn change_address(store: &mut Store, endpoint: &str) -> Result<(), StoreError> {
    let addr = local_address(endpoint)?;
    if addr.port() == 0 {
        return Err(StoreError::InvalidLan);
    }
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut s = settings(&tx)?
        .filter(|s| s.mode == "client")
        .ok_or(StoreError::LanDenied)?;
    s.endpoint = endpoint.into();
    save_settings(&tx, &s)?;
    audit(
        &tx,
        "local-administrator",
        "hub.address_changed",
        serde_json::json!({"endpoint":endpoint,"hubId":s.hub_id}),
    )?;
    tx.commit()?;
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub device_id: String,
    pub name: String,
    pub role: String,
    pub enabled: bool,
    pub revision: i64,
}
pub(crate) fn devices(db: &Connection) -> Result<Vec<Device>, StoreError> {
    if !settings(db)?.is_some_and(|s| s.mode == "hub") {
        return Err(StoreError::LanDenied);
    }
    Ok(db
        .prepare("SELECT device_id,name,role,enabled,revision FROM lan_devices ORDER BY device_id")?
        .query_map([], |r| {
            Ok(Device {
                device_id: r.get(0)?,
                name: r.get(1)?,
                role: r.get(2)?,
                enabled: r.get(3)?,
                revision: r.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?)
}
pub(crate) fn set_device(
    store: &mut Store,
    device_id: &str,
    role: Role,
    enabled: bool,
    revision: i64,
) -> Result<(), StoreError> {
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    if !settings(&tx)?.is_some_and(|s| s.mode == "hub") || revision <= 0 {
        return Err(StoreError::LanDenied);
    }
    if tx.execute("UPDATE lan_devices SET role=?1,enabled=?2,revision=revision+1 WHERE device_id=?3 AND revision=?4",params![role.text(),enabled,device_id,revision])?!=1{return Err(StoreError::Conflict);}
    audit(
        &tx,
        "local-administrator",
        "device.changed",
        serde_json::json!({"deviceId":device_id,"role":role,"enabled":enabled,"previousRevision":revision}),
    )?;
    tx.commit()?;
    Ok(())
}
pub(crate) fn hub_enabled(store: &mut Store, enabled: bool) -> Result<(), StoreError> {
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut s = settings(&tx)?
        .filter(|s| s.mode == "hub")
        .ok_or(StoreError::LanDenied)?;
    s.enabled = enabled;
    save_settings(&tx, &s)?;
    audit(
        &tx,
        "local-administrator",
        "hub.enabled",
        serde_json::json!({"enabled":enabled}),
    )?;
    tx.commit()?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub business_id: String,
    pub hub_id: String,
    pub device_id: String,
    pub command: Command,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Sync { after: i64 },
    Report { after: i64 },
    Post { request: PostInvoice },
    Cancel { request: PostInvoice },
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Outcome {
    Receipt { invoice: Invoice },
    Rejected { code: String, message: String },
    Canceled,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Delivery {
    pub record: OutboxRecord,
    pub own_request_hash: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Response {
    Sync {
        products: Vec<Product>,
        events: Vec<Delivery>,
        through: i64,
        head: i64,
    },
    Report {
        invoices: Vec<InvoiceRecord>,
    },
    Outcome {
        sequence: i64,
        outcome: Outcome,
    },
    Denied,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reply {
    pub version: u32,
    pub business_id: String,
    pub hub_id: String,
    pub device_id: String,
    pub response: Response,
}
fn rejection(error: StoreError) -> Result<Outcome, StoreError> {
    let code = match error {
        StoreError::StockConflict => "stock_conflict",
        StoreError::InvalidStock => "invalid_product",
        StoreError::ProductMissing => "invalid_product",
        StoreError::InvalidInvoice => "invalid_invoice",
        StoreError::OperationConflict => "operation_conflict",
        StoreError::CheckoutActive => "checkout_active",
        other => return Err(other),
    };
    Ok(Outcome::Rejected {
        code: code.into(),
        message: error.to_string(),
    })
}
fn products(db: &Connection) -> Result<Vec<Product>, StoreError> {
    Ok(db.prepare("SELECT id,name,sku,unit,unit_price_paise,stock_milli,revision FROM local_products ORDER BY name,id")?.query_map([],|r|Ok(Product{id:r.get(0)?,name:r.get(1)?,sku:r.get(2)?,unit:r.get(3)?,unit_price_paise:r.get(4)?,stock_milli:r.get(5)?,revision:r.get(6)?}))?.collect::<Result<_,_>>()?)
}
pub(crate) fn dispatch(
    store: &mut Store,
    peer: transport::VerifiedPeer,
    request: Request,
) -> Result<Reply, StoreError> {
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let s = settings(&tx)?
        .filter(|s| s.mode == "hub" && s.enabled)
        .ok_or(StoreError::LanDenied)?;
    let role: Option<String> = tx
        .query_row(
            "SELECT role FROM lan_devices WHERE device_id=?1 AND certificate_hash=?2 AND enabled=1",
            params![request.device_id, peer.0],
            |r| r.get(0),
        )
        .optional()?;
    if request.version != 1
        || request.business_id != s.business_id
        || request.hub_id != s.hub_id
        || role.is_none()
    {
        audit(
            &tx,
            "untrusted-peer",
            "request.denied",
            serde_json::json!({"certificateHash":peer.0}),
        )?;
        tx.commit()?;
        return Err(StoreError::LanDenied);
    }
    let role = role.unwrap();
    let response = match request.command {
        Command::Sync { after } => {
            if after < 0 {
                return Err(StoreError::InvalidLan);
            }
            let head: i64 = tx.query_row(
                "SELECT coalesce(max(sequence),0) FROM local_billing_outbox",
                [],
                |r| r.get(0),
            )?;
            if after > head {
                return Err(StoreError::InvalidLan);
            }
            let events=tx.prepare("SELECT sequence,invoice_id,payload FROM local_billing_outbox WHERE sequence>?1 ORDER BY sequence LIMIT 20")?.query_map([after],|r|Ok(OutboxRecord{sequence:r.get(0)?,invoice_id:r.get(1)?,payload:r.get(2)?}))?.collect::<Result<Vec<_>,_>>()?;
            let through = events.last().map(|e| e.sequence).unwrap_or(after);
            let mut visible = Vec::new();
            for event in events {
                let own:Option<String>=tx.query_row("SELECT request FROM lan_operations WHERE operation_id=?1 AND device_id=?2 AND committed=1",params![event.invoice_id,request.device_id],|r|r.get(0)).optional()?;
                if role != "cashier" || own.is_some() {
                    visible.push(Delivery {
                        record: event,
                        own_request_hash: own.map(|r| fingerprint(r.as_bytes())),
                    });
                }
            }
            Response::Sync {
                products: products(&tx)?,
                events: visible,
                through,
                head,
            }
        }
        Command::Report { after } => {
            if role == "cashier" {
                audit(
                    &tx,
                    &request.device_id,
                    "report.denied",
                    serde_json::json!({}),
                )?;
                tx.commit()?;
                return Err(StoreError::LanDenied);
            }
            if after < 0 {
                return Err(StoreError::InvalidLan);
            }
            let invoices=tx.prepare("SELECT sequence,payload FROM local_invoices WHERE sequence>?1 ORDER BY sequence LIMIT 100")?.query_map([after],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?)))?.collect::<Result<Vec<_>,_>>()?.into_iter().map(|(sequence,payload)|Ok(InvoiceRecord{sequence,invoice:serde_json::from_str(&payload)?})).collect::<Result<Vec<_>,StoreError>>()?;
            audit(
                &tx,
                &request.device_id,
                "report.read",
                serde_json::json!({"after":after}),
            )?;
            Response::Report { invoices }
        }
        command @ (Command::Post { .. } | Command::Cancel { .. }) => {
            let (invoice, cancel) = match command {
                Command::Post { request } => (request, false),
                Command::Cancel { request } => (request, true),
                _ => unreachable!(),
            };
            invoice.validate()?;
            let raw = serde_json::to_string(&invoice)?;
            let old:Option<(i64,String,String,String)>=tx.query_row("SELECT sequence,device_id,request,outcome FROM lan_operations WHERE operation_id=?1",[&invoice.operation_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional()?;
            if let Some((sequence, device, old_raw, outcome)) = old {
                if device != request.device_id || old_raw != raw {
                    return Err(StoreError::OperationConflict);
                }
                return Ok(Reply {
                    version: 1,
                    business_id: s.business_id.clone(),
                    hub_id: s.hub_id.clone(),
                    device_id: request.device_id,
                    response: Response::Outcome {
                        sequence,
                        outcome: serde_json::from_str(&outcome)?,
                    },
                });
            }
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM local_invoices WHERE id=?1)",
                [&invoice.operation_id],
                |r| r.get(0),
            )?;
            let operation_id = invoice.operation_id.clone();
            let outcome = if exists {
                rejection(StoreError::OperationConflict)?
            } else if cancel {
                Outcome::Canceled
            } else {
                tx.execute_batch("SAVEPOINT lan_invoice;")?;
                match crate::billing::post_into(&tx, invoice, false) {
                    Ok(invoice) => {
                        tx.execute_batch("RELEASE lan_invoice;")?;
                        Outcome::Receipt { invoice }
                    }
                    Err(error) => {
                        tx.execute_batch("ROLLBACK TO lan_invoice; RELEASE lan_invoice;")?;
                        rejection(error)?
                    }
                }
            };
            #[cfg(test)]
            halt_test_boundary("before_commit");
            tx.execute("INSERT INTO lan_operations(operation_id,device_id,request,outcome,committed) VALUES(?1,?2,?3,?4,?5)",params![operation_id,request.device_id,raw,serde_json::to_string(&outcome)?,matches!(outcome,Outcome::Receipt{..})])?;
            let sequence = tx.last_insert_rowid();
            audit(
                &tx,
                &request.device_id,
                "operation.resolved",
                serde_json::json!({"operationId":operation_id,"sequence":sequence,"outcome":outcome}),
            )?;
            Response::Outcome { sequence, outcome }
        }
    };
    tx.commit()?;
    Ok(Reply {
        version: 1,
        business_id: s.business_id.clone(),
        hub_id: s.hub_id.clone(),
        device_id: request.device_id,
        response,
    })
}
pub(crate) fn server_config(
    db: &Connection,
) -> Result<Option<(String, Arc<rustls::ServerConfig>)>, StoreError> {
    let Some(s) = settings(db)?.filter(|s| s.mode == "hub" && s.enabled) else {
        return Ok(None);
    };
    Ok(Some((s.endpoint.clone(), transport::server_config(&s)?)))
}

#[cfg(test)]
fn halt_test_boundary(phase: &str) {
    if std::env::var("SORNIO_LAN_HALT").ok().as_deref() == Some(phase) {
        let marker = std::env::var_os("SORNIO_LAN_MARKER").unwrap();
        std::fs::File::create(marker).unwrap().sync_all().unwrap();
        loop {
            std::thread::park();
        }
    }
}
