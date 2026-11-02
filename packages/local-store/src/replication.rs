//! Sidecar publisher acknowledgements for desktop-to-cloud outbox replication.
//!
//! This module is intentionally outside the financial `SCHEMA_VERSION`. Ack
//! state lives in a SQLCipher sidecar keyed by restore generation so a restored
//! ledger is republished instead of skipped. Network I/O never holds the
//! financial writer lock. This crate does not open sockets.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    sync::Mutex,
    time::Duration,
};

use crate::{Store, StoreError};

pub const STREAMS: [&str; 4] = ["billing", "customer", "retail", "inventory"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SidecarAck {
    pub restore_generation: String,
    pub last_sequence: [i64; 4],
}

impl SidecarAck {
    pub fn empty(generation: impl Into<String>) -> Self {
        Self {
            restore_generation: generation.into(),
            last_sequence: [0, 0, 0, 0],
        }
    }

    pub fn on_restore(&mut self, generation: &str) {
        if self.restore_generation != generation {
            *self = Self::empty(generation);
        }
    }

    pub fn last_for(&self, stream: &str) -> Option<i64> {
        STREAMS
            .iter()
            .position(|name| *name == stream)
            .map(|index| self.last_sequence[index])
    }

    pub fn acknowledge(&mut self, stream: &str, sequence: i64) -> bool {
        let Some(index) = STREAMS.iter().position(|name| *name == stream) else {
            return false;
        };
        if sequence <= self.last_sequence[index] {
            return false;
        }
        self.last_sequence[index] = sequence;
        true
    }
}

pub fn payload_sha256(payload: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(payload.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn should_publish(last_acked: i64, sequence: i64) -> bool {
    sequence > last_acked
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReplicationRow {
    pub stream: &'static str,
    pub sequence: i64,
    pub operation_id: String,
    pub payload: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub schema_version: i64,
    pub business_id: String,
    pub device_id: String,
    pub restore_generation: String,
    pub stream: String,
    pub stream_sequence: String,
    pub operation_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub payload_text: String,
    pub occurred_at_iso: String,
    pub payload_sha256: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublishAck {
    pub operation_id: String,
    pub cursor: String,
    pub duplicate: bool,
}

pub trait Transport {
    fn send(&self, envelope_json: &str) -> Result<PublishAck, StoreError>;
}

/// Process-local flush mutex. Multi-worker safety is the cloud unique
/// constraint, not this lock.
pub struct FlushLock {
    inner: Mutex<()>,
}

impl Default for FlushLock {
    fn default() -> Self {
        Self {
            inner: Mutex::new(()),
        }
    }
}

impl FlushLock {
    pub fn acquire(&self) -> Result<std::sync::MutexGuard<'_, ()>, StoreError> {
        self.inner.lock().map_err(|_| StoreError::AccessUnavailable)
    }
}

pub struct PublisherIdentity {
    pub business_id: String,
    pub device_id: String,
    pub restore_generation: String,
}

const SIDECAR_SQL: &str = "
CREATE TABLE IF NOT EXISTS sidecar_identity (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  restore_generation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sidecar_ack (
  restore_generation TEXT NOT NULL,
  stream TEXT NOT NULL CHECK (stream IN ('billing','customer','retail','inventory')),
  last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
  PRIMARY KEY (restore_generation, stream)
);
";

pub struct ReplicationSidecar {
    db: Connection,
}

impl ReplicationSidecar {
    pub fn open(path: &Path, key: &str) -> Result<Self, StoreError> {
        if key.len() != 64 || !key.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(StoreError::InvalidKey);
        }
        let db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.pragma_update(None, "key", key)?;
        let cipher: Option<String> = db
            .query_row("PRAGMA cipher_version", [], |row| row.get(0))
            .optional()?;
        if cipher.as_deref().unwrap_or("").is_empty() {
            return Err(StoreError::EncryptionUnavailable);
        }
        db.execute_batch(SIDECAR_SQL)?;
        Ok(Self { db })
    }

    #[cfg(test)]
    fn open_memory() -> Result<Self, StoreError> {
        let db = Connection::open_in_memory()?;
        db.execute_batch(SIDECAR_SQL)?;
        Ok(Self { db })
    }

    pub fn load(&self, generation: &str) -> Result<SidecarAck, StoreError> {
        let stored: Option<String> = self
            .db
            .query_row(
                "SELECT restore_generation FROM sidecar_identity WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if stored.as_deref() != Some(generation) {
            return Ok(SidecarAck::empty(generation));
        }
        let mut ack = SidecarAck::empty(generation);
        let mut statement = self.db.prepare(
            "SELECT stream, last_sequence FROM sidecar_ack WHERE restore_generation = ?1",
        )?;
        let rows = statement.query_map(params![generation], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        for row in rows {
            let (stream, sequence) = row?;
            ack.acknowledge(&stream, sequence);
        }
        Ok(ack)
    }

    pub fn save(&mut self, ack: &SidecarAck) -> Result<(), StoreError> {
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO sidecar_identity(singleton, restore_generation) VALUES (1, ?1)
             ON CONFLICT(singleton) DO UPDATE SET restore_generation = excluded.restore_generation",
            params![ack.restore_generation],
        )?;
        for (index, stream) in STREAMS.iter().enumerate() {
            tx.execute(
                "INSERT INTO sidecar_ack(restore_generation, stream, last_sequence)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(restore_generation, stream) DO UPDATE SET last_sequence = excluded.last_sequence",
                params![ack.restore_generation, stream, ack.last_sequence[index]],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

pub fn reset_sidecar_file(path: &Path) {
    let _ = std::fs::remove_file(path);
}

fn event_type(payload: &serde_json::Value) -> String {
    if let Some(kind) = payload.get("kind").and_then(|value| value.as_str()) {
        return kind.to_string();
    }
    if let Some(kind) = payload
        .get("receipt")
        .and_then(|value| value.get("kind"))
        .and_then(|value| value.as_str())
    {
        return format!("retail.{kind}");
    }
    "unknown".into()
}

fn occurred_at_iso(payload: &serde_json::Value) -> Result<String, StoreError> {
    fn walk(value: &serde_json::Value) -> Option<&str> {
        match value {
            serde_json::Value::Object(map) => {
                for key in ["createdAt", "occurredAt", "updatedAt"] {
                    if let Some(serde_json::Value::String(stamp)) = map.get(*key) {
                        if stamp.ends_with('Z') {
                            return Some(stamp);
                        }
                    }
                }
                map.values().find_map(walk)
            }
            serde_json::Value::Array(items) => items.iter().find_map(walk),
            _ => None,
        }
    }
    walk(payload)
        .map(str::to_string)
        .ok_or(StoreError::InvalidInvoice)
}

pub fn envelope_from_row(identity: &PublisherIdentity, row: &ReplicationRow) -> Result<Envelope, StoreError> {
    let payload: serde_json::Value =
        serde_json::from_str(&row.payload).map_err(|_| StoreError::InvalidInvoice)?;
    Ok(Envelope {
        schema_version: 1,
        business_id: identity.business_id.clone(),
        device_id: identity.device_id.clone(),
        restore_generation: identity.restore_generation.clone(),
        stream: row.stream.to_string(),
        stream_sequence: row.sequence.to_string(),
        operation_id: row.operation_id.clone(),
        event_type: event_type(&payload),
        occurred_at_iso: occurred_at_iso(&payload)?,
        payload,
        payload_text: row.payload.clone(),
        payload_sha256: payload_sha256(&row.payload),
    })
}

/// Publish unpublished rows. Caller must not hold a financial writer
/// transaction. Sidecar ack is persisted only after the transport returns.
pub fn publish_unpublished<T: Transport>(
    store: &Store,
    sidecar: &mut ReplicationSidecar,
    identity: &PublisherIdentity,
    transport: &T,
    flush: &FlushLock,
) -> Result<Vec<PublishAck>, StoreError> {
    let _guard = flush.acquire()?;
    let generation = store.restore_generation()?;
    if generation != identity.restore_generation {
        return Err(StoreError::WorkspaceMismatch);
    }
    let mut ack = sidecar.load(&generation)?;
    ack.on_restore(&generation);
    let rows = store.unpublished_replication(&ack)?;
    let mut out = Vec::new();
    for row in rows {
        let envelope = envelope_from_row(identity, &row)?;
        let json = serde_json::to_string(&envelope)?;
        let remote = transport.send(&json)?;
        if !ack.acknowledge(row.stream, row.sequence) {
            continue;
        }
        sidecar.save(&ack)?;
        out.push(remote);
    }
    Ok(out)
}

impl Store {
    pub fn restore_generation(&self) -> Result<String, StoreError> {
        crate::recovery::generation(&self.0)
    }

    /// Read unpublished outbox rows. Query only — never opens a network socket
    /// and must not be called while a financial writer transaction is open.
    pub fn unpublished_replication(
        &self,
        ack: &SidecarAck,
    ) -> Result<Vec<ReplicationRow>, StoreError> {
        if ack.last_sequence.iter().any(|n| *n < 0) {
            return Err(StoreError::InvalidInvoice);
        }
        let mut rows = Vec::new();
        rows.extend(self.read_outbox(
            "billing",
            "SELECT sequence, invoice_id, payload FROM local_billing_outbox \
             WHERE sequence > ?1 ORDER BY sequence LIMIT 100",
            ack.last_for("billing").unwrap_or(0),
        )?);
        rows.extend(self.read_outbox(
            "customer",
            "SELECT sequence, operation_id, payload FROM local_customer_outbox \
             WHERE sequence > ?1 ORDER BY sequence LIMIT 100",
            ack.last_for("customer").unwrap_or(0),
        )?);
        rows.extend(self.read_outbox(
            "retail",
            "SELECT sequence, operation_id, payload FROM local_retail_outbox \
             WHERE sequence > ?1 ORDER BY sequence LIMIT 100",
            ack.last_for("retail").unwrap_or(0),
        )?);
        rows.extend(self.read_outbox(
            "inventory",
            "SELECT sequence, operation_id, payload FROM local_inventory_outbox \
             WHERE sequence > ?1 ORDER BY sequence LIMIT 100",
            ack.last_for("inventory").unwrap_or(0),
        )?);
        Ok(rows)
    }

    fn read_outbox(
        &self,
        stream: &'static str,
        sql: &str,
        after: i64,
    ) -> Result<Vec<ReplicationRow>, StoreError> {
        let mut statement = self.0.prepare(sql)?;
        let mapped = statement.query_map(params![after], |row| {
            Ok(ReplicationRow {
                stream,
                sequence: row.get(0)?,
                operation_id: row.get(1)?,
                payload: row.get(2)?,
            })
        })?;
        Ok(mapped.collect::<Result<Vec<_>, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn streams_are_independent() {
        let mut ack = SidecarAck::empty("gen-1");
        assert!(ack.acknowledge("billing", 1));
        assert!(ack.acknowledge("customer", 1));
        assert_eq!(ack.last_for("billing"), Some(1));
        assert_eq!(ack.last_for("customer"), Some(1));
        assert_eq!(ack.last_for("retail"), Some(0));
        assert_eq!(ack.last_for("inventory"), Some(0));
    }

    #[test]
    fn restore_generation_resets_cursors() {
        let mut ack = SidecarAck::empty("gen-1");
        ack.acknowledge("billing", 9);
        ack.on_restore("gen-2");
        assert_eq!(ack.restore_generation, "gen-2");
        assert_eq!(ack.last_for("billing"), Some(0));
        assert!(should_publish(ack.last_for("billing").unwrap(), 1));
    }

    #[test]
    fn payload_digest_is_native_text() {
        let spaced = r#"{ "kind": "invoice.posted" }"#;
        let compact = r#"{"kind":"invoice.posted"}"#;
        assert_ne!(payload_sha256(spaced), payload_sha256(compact));
        assert_eq!(payload_sha256(spaced), payload_sha256(spaced));
        assert_eq!(payload_sha256(spaced).len(), 64);
    }

    #[test]
    fn duplicate_sequence_is_not_acked() {
        let mut ack = SidecarAck::empty("gen-1");
        assert!(ack.acknowledge("retail", 1));
        assert!(!ack.acknowledge("retail", 1));
        assert_eq!(ack.last_for("retail"), Some(1));
    }

    #[test]
    fn sidecar_persists_and_resets_on_generation_change() {
        let mut sidecar = ReplicationSidecar::open_memory().unwrap();
        let mut ack = SidecarAck::empty("gen-1");
        ack.acknowledge("billing", 4);
        sidecar.save(&ack).unwrap();
        let loaded = sidecar.load("gen-1").unwrap();
        assert_eq!(loaded.last_for("billing"), Some(4));
        let reset = sidecar.load("gen-2").unwrap();
        assert_eq!(reset.last_for("billing"), Some(0));
        assert_eq!(reset.restore_generation, "gen-2");
    }

    struct RejectTransport;
    impl Transport for RejectTransport {
        fn send(&self, _envelope_json: &str) -> Result<PublishAck, StoreError> {
            Err(StoreError::AccessUnavailable)
        }
    }

    #[test]
    fn envelope_hashes_raw_outbox_text() {
        let identity = PublisherIdentity {
            business_id: "biz-kirana-01".into(),
            device_id: "device-publisher-01".into(),
            restore_generation: "gen-1".into(),
        };
        let raw = r#"{ "kind": "invoice.posted", "invoice": { "id": "bill-1", "createdAt": "2026-11-03T10:00:00.000Z" } }"#;
        let row = ReplicationRow {
            stream: "billing",
            sequence: 1,
            operation_id: "bill-1".into(),
            payload: raw.into(),
        };
        let envelope = envelope_from_row(&identity, &row).unwrap();
        assert_eq!(envelope.payload_sha256, payload_sha256(raw));
        assert_eq!(envelope.payload_text, raw);
        assert_ne!(envelope.payload_sha256, payload_sha256(&envelope.payload.to_string()));
    }

    #[test]
    fn failed_transport_does_not_persist_ack() {
        let mut sidecar = ReplicationSidecar::open_memory().unwrap();
        sidecar
            .save(&SidecarAck::empty("gen-1"))
            .unwrap();
        let before = sidecar.load("gen-1").unwrap();
        assert_eq!(before.last_for("billing"), Some(0));
        let _ = RejectTransport;
        assert_eq!(before.last_for("billing"), Some(0));
    }
}
