//! Headless compilation of the *actual* desktop LAN sources. These module paths
//! deliberately point at the production files; there is no reference server,
//! copied router, test permission model or alternate transaction implementation.
#[path = "../../../apps/desktop/src-tauri/src/hub_discovery.rs"]
pub mod hub_discovery;
#[path = "../../../apps/desktop/src-tauri/src/hub_server.rs"]
pub mod hub_server;
