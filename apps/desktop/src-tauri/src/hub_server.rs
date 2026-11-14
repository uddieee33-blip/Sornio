//! Bounded HTTPS-only LAN adapter. Mobile uses the OS TLS trust store and hostname checks.
use crate::LocalState;
use rustls::{ServerConfig, ServerConnection, StreamOwned};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    io::{BufReader, Read, Write},
    net::{IpAddr, SocketAddr, TcpListener},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
#[derive(Default)]
pub struct Runtime {
    pub stop: Option<Arc<AtomicBool>>,
    pub address: Option<String>,
    pub advertisement: Option<Arc<crate::hub_discovery::Advertisement>>,
    pub discovery_error: Option<String>,
}
impl Runtime {
    pub fn halt(&mut self) {
        if let Some(stop) = self.stop.take() {
            stop.store(true, Ordering::SeqCst);
        }
        if let Some(ad) = self.advertisement.take() {
            ad.stop();
        }
        self.address = None;
        self.discovery_error = None;
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.halt();
    }
}
pub type State = Arc<Mutex<Runtime>>;
pub fn config(cert: &str, key: &str) -> Result<Arc<ServerConfig>, String> {
    let certs = rustls_pemfile::certs(&mut BufReader::new(cert.as_bytes()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid TLS certificate chain.")?;
    let key = rustls_pemfile::private_key(&mut BufReader::new(key.as_bytes()))
        .map_err(|_| "Invalid TLS key.")?
        .ok_or("A TLS private key is required.")?;
    let mut cfg = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|_| "Certificate and key do not match.")?;
    cfg.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(Arc::new(cfg))
}
/// Public diagnostics only. Matching material does not prove OS trust, validity dates,
/// hostname coverage or reachability; the mobile TLS stack still checks those.
pub fn tls_status(cert: &str, key: &str) -> Value {
    let fingerprint = rustls_pemfile::certs(&mut BufReader::new(cert.as_bytes()))
        .next()
        .and_then(Result::ok)
        .map(|der| format!("{:x}", Sha256::digest(der.as_ref())));
    json!({"configured":!cert.is_empty()&&!key.is_empty(),"keyMatches":config(cert,key).is_ok(),"certificateSha256":fingerprint})
}
fn local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.is_private() || v.is_link_local(),
        _ => false,
    }
}
pub fn start(
    address: &str,
    tls: Arc<ServerConfig>,
    workspace: LocalState,
    advertise: Option<(String, Value, String)>,
) -> Result<Runtime, String> {
    let address: SocketAddr = address
        .parse()
        .map_err(|_| "Enter this computer's private IPv4 address and port.")?;
    if !local(address.ip()) || address.port() < 1024 {
        return Err("Bind to a private IPv4 interface and a port above 1023. Public/wildcard listeners are refused.".into());
    }
    let listener =
        TcpListener::bind(address).map_err(|_| "Could not bind this LAN interface/port.")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "Could not configure listener.")?;
    let (advertisement, discovery_error) = match advertise {
        Some((origin, identity, cert)) => {
            match crate::hub_discovery::Advertisement::start(address, &origin, &identity, &cert) {
                Ok(ad) => (Some(ad), None),
                Err(e) => (None, Some(e)),
            }
        }
        None => (None, None),
    };
    let ad = advertisement.clone();
    let stop = Arc::new(AtomicBool::new(false));
    let halted = stop.clone();
    let active = Arc::new(AtomicUsize::new(0));
    std::thread::spawn(move || {
        let mut window = Instant::now();
        let mut requests = 0;
        while !halted.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((socket, peer)) => {
                    if window.elapsed() > Duration::from_secs(60) {
                        window = Instant::now();
                        requests = 0;
                    }
                    if !local(peer.ip()) || requests >= 120 || active.load(Ordering::SeqCst) >= 8 {
                        continue;
                    }
                    requests += 1;
                    active.fetch_add(1, Ordering::SeqCst);
                    let config = tls.clone();
                    let ws = workspace.clone();
                    let count = active.clone();
                    let stop = halted.clone();
                    std::thread::spawn(move || {
                        let _ = socket.set_read_timeout(Some(Duration::from_secs(5)));
                        let _ = socket.set_write_timeout(Some(Duration::from_secs(5)));
                        if let Ok(conn) = ServerConnection::new(config) {
                            let mut stream = StreamOwned::new(conn, socket);
                            let response = serve(&mut stream, &ws, &stop)
                                .unwrap_or((400, json!({"error":"invalid_request"})));
                            let body = response.1.to_string();
                            let header=format!("HTTP/1.1 {} Result\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nContent-Length: {}\r\n\r\n",response.0,body.len());
                            let _ = stream.write_all(header.as_bytes());
                            let _ = stream.write_all(body.as_bytes());
                            let _ = stream.flush();
                        }
                        count.fetch_sub(1, Ordering::SeqCst);
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50))
                }
                Err(_) => break,
            }
        }
        halted.store(true, Ordering::SeqCst);
        if let Some(ad) = ad {
            ad.stop();
        }
    });
    Ok(Runtime {
        stop: Some(stop),
        address: Some(address.to_string()),
        advertisement,
        discovery_error,
    })
}
fn serve<S: Read + Write>(
    stream: &mut S,
    workspace: &LocalState,
    stop: &AtomicBool,
) -> Result<(u16, Value), ()> {
    let started = Instant::now();
    let mut data = Vec::new();
    let header_end;
    loop {
        if started.elapsed() > Duration::from_secs(8) || data.len() > 8192 {
            return Err(());
        }
        let mut byte = [0];
        stream.read_exact(&mut byte).map_err(|_| ())?;
        data.push(byte[0]);
        if data.ends_with(b"\r\n\r\n") {
            header_end = data.len();
            break;
        }
    }
    let mut headers = [httparse::EMPTY_HEADER; 24];
    let mut req = httparse::Request::new(&mut headers);
    req.parse(&data).map_err(|_| ())?;
    if req.method != Some("POST") || req.version != Some(1) {
        return Err(());
    }
    let path = req.path.ok_or(())?.to_string();
    let mut length = None;
    let mut token = String::new();
    let mut content = false;
    let mut auth_seen = false;
    for h in req.headers.iter() {
        match h.name.to_ascii_lowercase().as_str() {
            "content-length" => {
                if length.is_some() {
                    return Err(());
                }
                length = Some(
                    std::str::from_utf8(h.value)
                        .map_err(|_| ())?
                        .parse::<usize>()
                        .map_err(|_| ())?,
                );
            }
            "authorization" => {
                if auth_seen {
                    return Err(());
                }
                auth_seen = true;
                let value = std::str::from_utf8(h.value).map_err(|_| ())?;
                token = value.strip_prefix("Bearer ").ok_or(())?.to_string();
            }
            "content-type" => {
                content = h.value == b"application/json";
            }
            "transfer-encoding" | "origin" => return Err(()),
            _ => {}
        }
    }
    let length = length.ok_or(())?;
    if length > 32768 || !content {
        return Err(());
    }
    data.resize(header_end + length, 0);
    let mut offset = header_end;
    while offset < data.len() {
        if started.elapsed() > Duration::from_secs(8) {
            return Err(());
        }
        let n = stream.read(&mut data[offset..]).map_err(|_| ())?;
        if n == 0 {
            return Err(());
        }
        offset += n;
    }
    let body: Value = serde_json::from_slice(&data[header_end..]).map_err(|_| ())?;
    if stop.load(Ordering::SeqCst) {
        return Ok((503, json!({"error":"hub_disabled"})));
    }
    let mut guard = workspace.lock().map_err(|_| ())?;
    if stop.load(Ordering::SeqCst) {
        return Ok((503, json!({"error":"hub_disabled"})));
    }
    let w = guard.as_mut().map_err(|_| ())?;
    match w.hub_request(&path, &token, body) {
        Ok(value) => Ok((200, value)),
        Err(e) => {
            use sornio_local_store::StoreError::*;
            let (code, name) = match e {
                Locked => (401, "session_required"),
                Forbidden => (403, "access_refused"),
                WorkspaceMismatch => (403, "wrong_shop"),
                IncorrectPassword | InvalidPassword => (401, "credentials_refused"),
                RateLimited => (429, "try_later"),
                OperationConflict => (409, "operation_identity_conflict"),
                InvalidDraft | InvalidIdentity => (400, "invalid_request"),
                _ => (503, "outcome_unknown"),
            };
            Ok((code, json!({"error":name})))
        }
    }
}
