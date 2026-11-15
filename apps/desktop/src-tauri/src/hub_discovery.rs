//! Public DNS-SD hints. Never includes credentials, financial data or grants.
use mdns_sd::{IfKind, ServiceDaemon, ServiceInfo};
use serde_json::{json, Value};
use std::{
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
pub struct Advertisement {
    daemon: ServiceDaemon,
    fullname: String,
    stopped: AtomicBool,
    pub origin: String,
}
impl Advertisement {
    pub fn start(
        address: SocketAddr,
        origin: &str,
        identity: &Value,
        fingerprint: &str,
    ) -> Result<Arc<Self>, String> {
        let u = url::Url::parse(origin)
            .map_err(|_| "Enter the HTTPS hostname covered by the certificate.")?;
        if u.scheme() != "https"
            || !u.username().is_empty()
            || u.password().is_some()
            || u.query().is_some()
            || u.fragment().is_some()
            || u.path() != "/"
            || u.port_or_known_default() != Some(address.port())
            || origin.len() > 230
        {
            return Err(
                "Discovery requires an HTTPS origin using the listener port (maximum 230 bytes)."
                    .into(),
            );
        }
        let hub = identity["hubId"]
            .as_str()
            .ok_or("Hub identity unavailable.")?;
        let business = identity["businessId"]
            .as_str()
            .ok_or("Shop identity unavailable.")?;
        let name = identity["businessName"]
            .as_str()
            .unwrap_or("Sornio shop")
            .chars()
            .take(40)
            .collect::<String>();
        let hostname = match u.host_str() {
            Some(h) if h.ends_with(".local") => format!("{h}."),
            _ => format!("sornio-{}.local.", &hub[..hub.len().min(16)]),
        };
        let instance = format!("Sornio-{}", &hub[..hub.len().min(20)]);
        let props = vec![
            ("v", "1"),
            ("hub", hub),
            ("biz", business),
            ("name", name.as_str()),
        ];
        // Keep the canonical origin alive while ServiceInfo copies TXT values.
        let canonical = u.origin().ascii_serialization();
        let mut properties = std::collections::HashMap::new();
        for (k, v) in props.iter().take(4) {
            properties.insert((*k).to_string(), (*v).to_string());
        }
        properties.insert("origin".into(), canonical.clone());
        properties.insert("cert".into(), fingerprint.to_string());
        let mut info = ServiceInfo::new(
            "_sornio._tcp.local.",
            &instance,
            &hostname,
            address.ip(),
            address.port(),
            properties,
        )
        .map_err(|_| "Discovery metadata could not be prepared.")?;
        info.set_interfaces(vec![IfKind::Addr(address.ip())]);
        let fullname = info.get_fullname().to_string();
        let daemon = ServiceDaemon::new()
            .map_err(|_| "Multicast discovery is unavailable. Use a connection card.")?;
        if daemon
            .disable_interface(IfKind::All)
            .and_then(|_| daemon.enable_interface(IfKind::Addr(address.ip())))
            .and_then(|_| daemon.register(info))
            .is_err()
        {
            let _ = daemon.shutdown();
            return Err("Discovery could not advertise on the selected private interface. Use a connection card.".into());
        }
        Ok(Arc::new(Self {
            daemon,
            fullname,
            stopped: AtomicBool::new(false),
            origin: canonical,
        }))
    }
    pub fn stop(&self) {
        if !self.stopped.swap(true, Ordering::SeqCst) {
            let _ = self.daemon.unregister(&self.fullname);
            let _ = self.daemon.shutdown();
        }
    }
    pub fn status(&self) -> Value {
        json!({"state":if self.stopped.load(Ordering::SeqCst){"stopped"}else{"advertisement_requested"},"origin":self.origin,"service":"_sornio._tcp.local."})
    }
}
impl Drop for Advertisement {
    fn drop(&mut self) {
        self.stop();
    }
}
