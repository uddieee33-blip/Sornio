//! Sidecar publisher acknowledgements for desktop-to-cloud outbox replication.
//!
//! This module is intentionally outside the financial `SCHEMA_VERSION`. Ack
//! state lives in a SQLCipher sidecar keyed by restore generation so a restored
//! ledger is republished instead of skipped. Network I/O never holds the
//! financial writer lock. This crate does not open sockets.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{path::Path, sync::Mutex, time::Duration};

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
    #[serde(default)]
    pub business_id: Option<String>,
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

pub fn reset_sidecar_file(path: &Path) -> Result<(), StoreError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(StoreError::BackupStorage),
    }
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
                    if let Some(serde_json::Value::String(stamp)) = map.get(key) {
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

fn cursor_ok(cursor: &str) -> bool {
    !cursor.is_empty()
        && cursor.len() <= 39
        && cursor.bytes().all(|b| b.is_ascii_digit())
        && !(cursor.len() > 1 && cursor.starts_with('0'))
}

pub fn parse_publish_ack(
    expected_operation_id: &str,
    identity: &PublisherIdentity,
    body: &str,
) -> Result<PublishAck, StoreError> {
    if body.is_empty() || body.len() > 4096 {
        return Err(StoreError::InvalidInvoice);
    }
    let remote: PublishAck = serde_json::from_str(body).map_err(|_| StoreError::InvalidInvoice)?;
    validate_ack(expected_operation_id, identity, &remote)?;
    Ok(remote)
}

pub fn validate_ack(
    expected_operation_id: &str,
    identity: &PublisherIdentity,
    remote: &PublishAck,
) -> Result<(), StoreError> {
    if remote.operation_id != expected_operation_id {
        return Err(StoreError::OperationConflict);
    }
    if !cursor_ok(&remote.cursor) {
        return Err(StoreError::InvalidInvoice);
    }
    if let Some(business_id) = &remote.business_id {
        if business_id != &identity.business_id {
            return Err(StoreError::WorkspaceMismatch);
        }
    }
    Ok(())
}

pub fn commit_local_ack(
    sidecar: &mut ReplicationSidecar,
    ack: &mut SidecarAck,
    stream: &str,
    sequence: i64,
    expected_operation_id: &str,
    identity: &PublisherIdentity,
    remote: &PublishAck,
) -> Result<(), StoreError> {
    validate_ack(expected_operation_id, identity, remote)?;
    let mut next = ack.clone();
    if !next.acknowledge(stream, sequence) {
        return Ok(());
    }
    sidecar.save(&next)?;
    *ack = next;
    Ok(())
}

pub fn envelope_from_row(
    identity: &PublisherIdentity,
    row: &ReplicationRow,
) -> Result<Envelope, StoreError> {
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
/// transaction. Sidecar ack is persisted only after a validated ack.
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
        commit_local_ack(
            sidecar,
            &mut ack,
            row.stream,
            row.sequence,
            &row.operation_id,
            identity,
            &remote,
        )?;
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
    use crate::{
        access::Workspace,
        billing::{BillLine, PostInvoice, Tender},
        catalog::AddProduct,
        Draft,
    };
    use std::sync::Mutex;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const LOGIN: &str = "Local test password!";

    fn identity(generation: &str, business_id: &str) -> PublisherIdentity {
        PublisherIdentity {
            business_id: business_id.into(),
            device_id: "device-publisher-01".into(),
            restore_generation: generation.into(),
        }
    }

    fn seeded(path: &Path) -> Store {
        let mut workspace = Workspace::new(Store::open(path, KEY).unwrap());
        workspace.setup(LOGIN).unwrap();
        workspace
            .save(
                0,
                Draft {
                    business_name: "Replication shop".into(),
                    business_type: "kirana".into(),
                    note: "Private saved note".into(),
                },
            )
            .unwrap();
        workspace
            .add_product(AddProduct {
                operation_id: "rice".into(),
                name: "Rice".into(),
                sku: "RICE".into(),
                unit: "kg".into(),
                unit_price_paise: 80000,
                opening_stock_milli: 10000,
            })
            .unwrap();
        workspace.into_recovery_store()
    }

    fn cash_sale(id: &str) -> PostInvoice {
        PostInvoice {
            operation_id: id.into(),
            lines: vec![BillLine {
                product_id: "rice".into(),
                expected_revision: 1,
                quantity_milli: 1000,
            }],
            tax_basis_points: 0,
            tender: Tender::Cash,
            customer_id: None,
        }
    }

    struct CountingTransport<T> {
        inner: T,
        sent: Mutex<usize>,
    }

    impl<T: Transport> Transport for CountingTransport<T> {
        fn send(&self, envelope_json: &str) -> Result<PublishAck, StoreError> {
            *self.sent.lock().unwrap() += 1;
            self.inner.send(envelope_json)
        }
    }

    struct FailTransport;
    impl Transport for FailTransport {
        fn send(&self, _envelope_json: &str) -> Result<PublishAck, StoreError> {
            Err(StoreError::AccessUnavailable)
        }
    }

    struct WrongOperationTransport;
    impl Transport for WrongOperationTransport {
        fn send(&self, _envelope_json: &str) -> Result<PublishAck, StoreError> {
            Ok(PublishAck {
                operation_id: "someone-else".into(),
                cursor: "1".into(),
                duplicate: false,
                business_id: None,
            })
        }
    }

    struct EchoTransport;
    impl Transport for EchoTransport {
        fn send(&self, envelope_json: &str) -> Result<PublishAck, StoreError> {
            let value: serde_json::Value =
                serde_json::from_str(envelope_json).map_err(|_| StoreError::InvalidInvoice)?;
            Ok(PublishAck {
                operation_id: value
                    .get("operationId")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .into(),
                cursor: "1".into(),
                duplicate: false,
                business_id: value
                    .get("businessId")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
        }
    }

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

    #[test]
    fn sidecar_last_write_wins_without_corrupting_primary_key() {
        let mut sidecar = ReplicationSidecar::open_memory().unwrap();
        let mut first = SidecarAck::empty("gen-1");
        first.acknowledge("billing", 1);
        sidecar.save(&first).unwrap();
        let mut second = SidecarAck::empty("gen-1");
        second.acknowledge("billing", 2);
        sidecar.save(&second).unwrap();
        assert_eq!(sidecar.load("gen-1").unwrap().last_for("billing"), Some(2));
    }

    #[test]
    fn envelope_hashes_raw_outbox_text() {
        let identity = identity("gen-1", "biz-kirana-01");
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
        assert_ne!(
            envelope.payload_sha256,
            payload_sha256(&envelope.payload.to_string())
        );
    }

    #[test]
    fn invalid_acknowledgments_never_advance_sidecar() {
        let mut sidecar = ReplicationSidecar::open_memory().unwrap();
        let mut ack = SidecarAck::empty("gen-1");
        sidecar.save(&ack).unwrap();
        let publisher = identity("gen-1", "biz-kirana-01");
        let cases = [
            PublishAck {
                operation_id: "other".into(),
                cursor: "1".into(),
                duplicate: false,
                business_id: None,
            },
            PublishAck {
                operation_id: "bill-1".into(),
                cursor: "".into(),
                duplicate: false,
                business_id: None,
            },
            PublishAck {
                operation_id: "bill-1".into(),
                cursor: "01".into(),
                duplicate: false,
                business_id: None,
            },
            PublishAck {
                operation_id: "bill-1".into(),
                cursor: "1".into(),
                duplicate: false,
                business_id: Some("biz-other-99".into()),
            },
        ];
        for remote in cases {
            let before = sidecar.load("gen-1").unwrap();
            assert!(commit_local_ack(
                &mut sidecar,
                &mut ack,
                "billing",
                1,
                "bill-1",
                &publisher,
                &remote,
            )
            .is_err());
            assert_eq!(before.last_for("billing"), Some(0));
            assert_eq!(ack.last_for("billing"), Some(0));
        }
        assert!(parse_publish_ack("bill-1", &publisher, "{").is_err());
        assert!(parse_publish_ack("bill-1", &publisher, "").is_err());
        assert!(parse_publish_ack(
            "bill-1",
            &publisher,
            r#"{"operationId":"bill-1","duplicate":false}"#,
        )
        .is_err());
        let ok = parse_publish_ack(
            "bill-1",
            &publisher,
            r#"{"operationId":"bill-1","cursor":"1","duplicate":true,"businessId":"biz-kirana-01"}"#,
        )
        .unwrap();
        commit_local_ack(
            &mut sidecar,
            &mut ack,
            "billing",
            1,
            "bill-1",
            &publisher,
            &ok,
        )
        .unwrap();
        assert_eq!(sidecar.load("gen-1").unwrap().last_for("billing"), Some(1));
        commit_local_ack(
            &mut sidecar,
            &mut ack,
            "billing",
            1,
            "bill-1",
            &publisher,
            &ok,
        )
        .unwrap();
        assert_eq!(sidecar.load("gen-1").unwrap().last_for("billing"), Some(1));
    }

    #[test]
    fn failed_transport_does_not_persist_ack() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = seeded(&dir.path().join("live.db"));
        let invoice = store.post_invoice(cash_sale("bill-cash-1")).unwrap();
        assert_eq!(invoice.total_paise, 80000);
        let generation = store.restore_generation().unwrap();
        let business_id: String = store
            .0
            .query_row(
                "SELECT business_id FROM local_recovery_identity WHERE singleton=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let publisher = identity(&generation, &business_id);
        let mut sidecar = ReplicationSidecar::open_memory().unwrap();
        sidecar.save(&SidecarAck::empty(&generation)).unwrap();
        let unpublished = store
            .unpublished_replication(&sidecar.load(&generation).unwrap())
            .unwrap();
        let billing = unpublished
            .iter()
            .find(|row| row.stream == "billing" && row.operation_id == "bill-cash-1")
            .unwrap();
        let flush = FlushLock::default();
        let fail = CountingTransport {
            inner: FailTransport,
            sent: Mutex::new(0),
        };
        assert!(publish_unpublished(&store, &mut sidecar, &publisher, &fail, &flush).is_err());
        assert_eq!(*fail.sent.lock().unwrap(), 1);
        assert_eq!(
            sidecar.load(&generation).unwrap().last_for("billing"),
            Some(0)
        );
        let wrong = CountingTransport {
            inner: WrongOperationTransport,
            sent: Mutex::new(0),
        };
        assert!(publish_unpublished(&store, &mut sidecar, &publisher, &wrong, &flush).is_err());
        assert_eq!(*wrong.sent.lock().unwrap(), 1);
        assert_eq!(
            sidecar.load(&generation).unwrap().last_for("billing"),
            Some(0)
        );
        let ok = CountingTransport {
            inner: EchoTransport,
            sent: Mutex::new(0),
        };
        let acks = publish_unpublished(&store, &mut sidecar, &publisher, &ok, &flush).unwrap();
        assert!(!acks.is_empty());
        assert_eq!(
            sidecar.load(&generation).unwrap().last_for("billing"),
            Some(billing.sequence)
        );
        let stale = identity("gen-old", &business_id);
        assert!(matches!(
            publish_unpublished(&store, &mut sidecar, &stale, &ok, &flush),
            Err(StoreError::WorkspaceMismatch)
        ));
    }

    #[test]
    fn missing_sidecar_file_reset_succeeds_and_directory_reset_fails_closed() {
        let dir = tempfile::tempdir().unwrap();
        reset_sidecar_file(&dir.path().join("missing.sqlite")).unwrap();
        assert!(reset_sidecar_file(dir.path()).is_err());
    }
}

#[cfg(test)]
#[path = "replication_matrix_tests.rs"]
mod replication_matrix_tests;
