//! Sidecar publisher acknowledgements for desktop-to-cloud outbox replication.
//!
//! This module is intentionally outside the financial `SCHEMA_VERSION`. Ack
//! state lives in a SQLCipher sidecar keyed by restore generation so a restored
//! ledger is republished instead of skipped. Network I/O never holds the
//! financial writer lock.
use sha2::{Digest, Sha256};

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
    fn payload_digest_is_stable() {
        let first = payload_sha256("{\"kind\":\"invoice.posted\"}");
        let second = payload_sha256("{\"kind\":\"invoice.posted\"}");
        let other = payload_sha256("{\"kind\":\"customer.saved\"}");
        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
        assert_ne!(first, other);
    }

    #[test]
    fn duplicate_sequence_is_not_acked() {
        let mut ack = SidecarAck::empty("gen-1");
        assert!(ack.acknowledge("retail", 1));
        assert!(!ack.acknowledge("retail", 1));
        assert_eq!(ack.last_for("retail"), Some(1));
    }
}
