# Hybrid Sync V1

Status: **contract complete, transport not live**. Production adapters throw `PRODUCTION_DISABLED`.

## Authority

```
Windows / future macOS
        │
        ▼
Encrypted SQLCipher
        │
        ▼
Atomic posting + audit + outbox
        │
        ▼
Authenticated desktop sync adapter   ← Phase 2
        │
        ▼
Sornio cloud read projections        ← Phase 2/3
        │
        ▼
Android / iPhone / iPad companion
        │
        ▼
Memory cache (Phase 1) / encrypted cache (Phase 3)
```

Desktop remains the only writer of invoices, stock deductions, credit and cash.
The companion never posts to authoritative tables.

The existing hosted `sync_operating_records` RPC is a different document model
(JS numbers, last-write-style collections, float stock). It is **not** this
contract. Do not point the phone at it and call the numbers native.

## Envelope

Every companion snapshot carries:

| Field | Rule |
| --- | --- |
| `schemaVersion` | Integer `1`. Unknown versions are rejected. |
| `businessId` | Stable id. Must match the session. |
| `restoreGeneration` | Desktop recovery generation. Mismatch refuses the cache. |
| `cursor` | Non-negative integer string, monotonic, server-issued. |
| `source` | `desktop-outbox` or `demo`. Live + demo is forbidden. |
| `producedAtIso` | RFC 3339 UTC. Displayed as last sync. Never labelled LIVE. |

Cash + credit must equal each activity total at the boundary.

Amounts are integer paise strings. Quantities are integer milli strings.
JavaScript `number` is rejected.

## Required properties (Phase 1 implementation vs later)

| # | Property | Phase 1 |
| --- | --- | --- |
| 1 | Authenticated business identity | Contract + demo session |
| 2 | Authenticated device identity | Device id on the session |
| 3 | Server-enforced role authorization | No live server yet |
| 4 | Tenant isolation | businessId equality |
| 5 | Durable operation identifiers | `sourceTransactionId` |
| 6 | Monotonic cursor | Implemented |
| 7 | Restore generation | Implemented |
| 8 | Explicit schema version | `1` |
| 9–10 | Idempotent up/down | Duplicate cursor accepted |
| 11 | Duplicate event rejection | Duplicate = no-op |
| 12 | Ordering | Older cursor rejected |
| 13 | Full snapshot recovery | Snapshot replace after generation check |
| 14 | Reconnection | Manual + foreground refresh |
| 15 | Revoked device | Terminal sync phase, cache dropped |
| 16 | Consistent financial read models | Split invariant |
| 17 | Integer money | Paise strings |
| 18 | QuantityMilli | Milli strings |
| 19 | No silent overwrites | Stale in-flight token rejected |
| 20 | No false live-data claims | Freshness never `LIVE` |

## Outbox gap

Native outboxes exist and are recovered with the vault. Nothing publishes them
to Postgres. Phase 2 must:

1. Read outbox rows after a successful local commit.
2. Authenticate the desktop as a business-scoped device.
3. Upload idempotently by `operation_id`.
4. Project integer paise / milli read models.
5. Advance a per-business cursor.
6. Refuse uploads after a restore until the generation is advertised.

Do not send the SQLCipher file or its key to the phone.

## Mobile UX

Last synced is an instant. If the desktop posted at 10:42 and the phone is
opened at 13:15, the phone says when it last received a snapshot. It does not
say the revenue is current.

Foreground refresh is best-effort. Background OS limits are not promised.

## Enrollment (not wired)

1. Owner signs in.
2. Server verifies identity.
3. User selects an authorised business.
4. Device stores a protected id in Keystore / Keychain.
5. Owner approves the device on a trusted channel.
6. Server issues a short-lived mobile grant.
7. Companion downloads permitted projections.
8. Every later request is authorised independently.

LAN certificate pairing does not apply to the public internet.
