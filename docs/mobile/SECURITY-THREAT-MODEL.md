# Companion threat model (Phase 1)

Implemented controls live in `packages/mobile-contracts/src/security.ts` and
the snapshot engine. Unresolved items stay documented; they are not pretended
to be finished.

| Threat | Phase 1 | Control |
| --- | --- | --- |
| Stolen phone | implemented | Session JSON in SecureStore/Keystore/Keychain. Snapshot is memory-only. OS lock recommended. |
| Lost device | documented | Server revocation is required. Contract treats `revoked` as terminal. |
| Compromised session token | documented | Short-lived tokens required. Phase 1 issues none. |
| Revoked staff | implemented | No client-trusted writes. Role only hides navigation. |
| Former owner cached records | implemented | Sign-out wipes session keys and memory snapshot. |
| Cross-business exposure | implemented | `businessId` must match the session. |
| Tampered snapshot | implemented | Runtime validation. Number amounts rejected. Split invariant. |
| Malicious network | documented | TLS required. Production adapter disabled, so no host is contacted. |
| Replay | implemented | Monotonic cursor. |
| Duplicate cloud events | implemented | Equal cursor is idempotent. |
| Restored desktop generation | implemented | Generation mismatch refuses overwrite. |
| Stale device operations | implemented | Mobile cannot submit financial operations. |
| Inconsistent projections | implemented | Cash + credit = total. |
| Offline cache exposure | implemented | No durable business cache. Not claimed as encrypted persistence. |
| Customer data in logs | implemented | `redact()` strips tokens and phones. Error boundary does not print records. |
| Unauthorized business switch | implemented | Engine rejects a different business id. |

## Non-negotiable

- No SQLCipher vault key on the phone.
- No service-role key, privileged DB URL or admin secret in the mobile bundle.
- TLS for any future internet sync.
- Notification previews must not include customer balances (no notifications shipped).
