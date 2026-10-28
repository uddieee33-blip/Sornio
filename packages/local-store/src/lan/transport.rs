//! Length-framed JSON inside mandatory, standard TLS 1.3 mutual authentication.
use super::{fingerprint, local_address, Reply, Request, Settings};
use crate::StoreError;
use rustls::{
    pki_types::{CertificateDer, PrivatePkcs8KeyDer, ServerName},
    ClientConfig, ClientConnection, RootCertStore, ServerConfig, ServerConnection, StreamOwned,
};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};
const REQUEST_LIMIT: usize = 64 * 1024;
const RESPONSE_LIMIT: usize = 8 * 1024 * 1024;
pub struct VerifiedPeer(pub(super) String);
fn roots(s: &Settings) -> Result<RootCertStore, StoreError> {
    let mut roots = RootCertStore::empty();
    roots
        .add(CertificateDer::from(s.root.clone()))
        .map_err(|_| StoreError::InvalidLan)?;
    Ok(roots)
}
pub(super) fn server_config(s: &Settings) -> Result<Arc<ServerConfig>, StoreError> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let verifier = rustls::server::WebPkiClientVerifier::builder_with_provider(
        Arc::new(roots(s)?),
        provider.clone(),
    )
    .build()
    .map_err(|_| StoreError::InvalidLan)?;
    let config = ServerConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&rustls::version::TLS13])
        .map_err(|_| StoreError::InvalidLan)?
        .with_client_cert_verifier(verifier)
        .with_single_cert(
            vec![s.server_cert.clone().into()],
            PrivatePkcs8KeyDer::from(s.server_key.clone()).into(),
        )
        .map_err(|_| StoreError::InvalidLan)?;
    Ok(Arc::new(config))
}
pub(super) fn client_config(s: &Settings) -> Result<Arc<ClientConfig>, StoreError> {
    let config =
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_protocol_versions(&[&rustls::version::TLS13])
            .map_err(|_| StoreError::InvalidLan)?
            .with_root_certificates(roots(s)?)
            .with_client_auth_cert(
                vec![s.device_cert.clone().into()],
                PrivatePkcs8KeyDer::from(s.device_key.clone()).into(),
            )
            .map_err(|_| StoreError::InvalidLan)?;
    Ok(Arc::new(config))
}
fn send(
    stream: &mut impl Write,
    value: &impl serde::Serialize,
    limit: usize,
) -> std::io::Result<()> {
    let raw = serde_json::to_vec(value)?;
    if raw.len() > limit {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "LAN frame exceeds limit",
        ));
    }
    stream.write_all(&(raw.len() as u32).to_be_bytes())?;
    stream.write_all(&raw)?;
    stream.flush()
}
fn receive<T: serde::de::DeserializeOwned>(
    stream: &mut impl Read,
    limit: usize,
) -> std::io::Result<T> {
    let mut prefix = [0; 4];
    stream.read_exact(&mut prefix)?;
    let n = u32::from_be_bytes(prefix) as usize;
    if n == 0 || n > limit {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Invalid LAN frame size",
        ));
    }
    let mut raw = vec![0; n];
    stream.read_exact(&mut raw)?;
    Ok(serde_json::from_slice(&raw)?)
}
pub(super) fn exchange(
    s: &Settings,
    command: super::Command,
) -> Result<super::Response, StoreError> {
    let address = local_address(&s.endpoint)?;
    let socket = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|_| StoreError::HubUnavailable)?;
    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|_| StoreError::HubUnavailable)?;
    socket
        .set_write_timeout(Some(Duration::from_secs(3)))
        .map_err(|_| StoreError::HubUnavailable)?;
    let connection = ClientConnection::new(
        client_config(s)?,
        ServerName::try_from("sornio.shop".to_owned()).map_err(|_| StoreError::InvalidLan)?,
    )
    .map_err(|_| StoreError::InvalidLan)?;
    let mut stream = StreamOwned::new(connection, socket);
    let request = Request {
        version: 1,
        business_id: s.business_id.clone(),
        hub_id: s.hub_id.clone(),
        device_id: s.device_id.clone(),
        command,
    };
    send(&mut stream, &request, REQUEST_LIMIT).map_err(|_| StoreError::HubUnavailable)?;
    let reply: Reply =
        receive(&mut stream, RESPONSE_LIMIT).map_err(|_| StoreError::HubUnavailable)?;
    if reply.version != 1
        || reply.business_id != s.business_id
        || reply.hub_id != s.hub_id
        || reply.device_id != s.device_id
    {
        return Err(StoreError::LanDenied);
    }
    if matches!(reply.response, super::Response::Denied) {
        return Err(StoreError::LanDenied);
    }
    Ok(reply.response)
}
/// Private-key possession is established by rustls before this handler receives a peer.
pub type Handler = Arc<dyn Fn(VerifiedPeer, Request) -> Option<Reply> + Send + Sync>;
pub struct HubServer {
    address: SocketAddr,
    stopped: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<()>>,
}
impl HubServer {
    pub fn bind(
        endpoint: &str,
        config: Arc<ServerConfig>,
        handler: Handler,
    ) -> Result<Self, StoreError> {
        let listener =
            TcpListener::bind(local_address(endpoint)?).map_err(|_| StoreError::HubUnavailable)?;
        let address = listener
            .local_addr()
            .map_err(|_| StoreError::HubUnavailable)?;
        listener
            .set_nonblocking(true)
            .map_err(|_| StoreError::HubUnavailable)?;
        let stopped = Arc::new(AtomicBool::new(false));
        let flag = stopped.clone();
        let active = Arc::new(AtomicUsize::new(0));
        let join = thread::spawn(move || {
            while !flag.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((socket, peer)) => {
                        if !allowed_peer(peer) {
                            continue;
                        }
                        if active.fetch_add(1, Ordering::AcqRel) >= 8 {
                            active.fetch_sub(1, Ordering::AcqRel);
                            continue;
                        }
                        let config = config.clone();
                        let handler = handler.clone();
                        let count = active.clone();
                        let flag = flag.clone();
                        thread::spawn(move || {
                            let _guard = Worker(count);
                            let _ = serve(socket, config, handler, flag);
                        });
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            address,
            stopped,
            join: Some(join),
        })
    }
    pub fn address(&self) -> SocketAddr {
        self.address
    }
}
fn allowed_peer(peer: SocketAddr) -> bool {
    match peer.ip() {
        std::net::IpAddr::V4(v) => v.is_private() || v.is_loopback(),
        std::net::IpAddr::V6(v) => v.is_loopback() || v.is_unique_local(),
    }
}
struct Worker(Arc<AtomicUsize>);
impl Drop for Worker {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}
fn serve(
    socket: TcpStream,
    config: Arc<ServerConfig>,
    handler: Handler,
    stopped: Arc<AtomicBool>,
) -> std::io::Result<()> {
    socket.set_read_timeout(Some(Duration::from_secs(3)))?;
    socket.set_write_timeout(Some(Duration::from_secs(3)))?;
    let conn = ServerConnection::new(config).map_err(std::io::Error::other)?;
    let mut stream = StreamOwned::new(conn, socket);
    while stream.conn.is_handshaking() {
        stream.conn.complete_io(&mut stream.sock)?;
    }
    let certificate = stream
        .conn
        .peer_certificates()
        .and_then(|c| c.first())
        .ok_or_else(|| std::io::Error::other("Client certificate required"))?;
    let peer = VerifiedPeer(fingerprint(certificate.as_ref()));
    let request: Request = receive(&mut stream, REQUEST_LIMIT)?;
    if stopped.load(Ordering::Acquire) {
        return Ok(());
    }
    if let Some(reply) = handler(peer, request) {
        send(&mut stream, &reply, RESPONSE_LIMIT)?;
    }
    Ok(())
}
impl Drop for HubServer {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}
