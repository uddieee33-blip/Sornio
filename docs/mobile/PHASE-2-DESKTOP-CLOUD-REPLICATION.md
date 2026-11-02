# Phase 2 — Desktop outbox publishing and cloud read projections

**Status:** Implemented on `arena/5ed2bd28-sornio` for founder review. Not a production GO. Not merged to `main`.

**Depends on Phase 1:** [PR #143](https://github.com/uddieee33-blip/Sornio/pull/143) (`6b4aa24`). Arena cannot open a stacked branch, so this work lives on the same session branch. Do not treat it as independent of unmerged companion contracts.

## What this phase is

Authenticated desktop publishing of the four native SQLCipher outboxes, plus a business-isolated cloud **read** projection that `parseCompanionSnapshot` / `decideSnapshotApply` can consume.

Native SQLCipher remains the only writable ledger. Cloud never posts, never holds the writer lock during network, and never blocks checkout.

## What this phase is not

- Not live mobile reads. `apps/mobile` keeps `productionSyncEnabled: false`.
- Not a financial schema bump. `SCHEMA_VERSION` stays **12**. Publisher acks are a sidecar keyed by `(restore_generation, stream)`.
- Not hosted `sync_operating_records`. That table is a different product surface.
- Not LAN certificate pairing reused as internet auth.
- Not an auto-applied production migration.
- Not a merge of #126 (LAN) or #127 (GST).

## Native streams (independent AUTOINCREMENT)

| Stream | Table | Identity | Example payload |
| --- | --- | --- | --- |
| billing | `local_billing_outbox` | `invoice_id` | `{ version, kind: "invoice.posted", operationId, invoice }` |
| customer | `local_customer_outbox` | `operation_id` | `{ version, scope, kind, operationId, value }` |
| retail | `local_retail_outbox` | `operation_id` | `{ version, scope, actorId, receipt }` |
| inventory | `local_inventory_outbox` | `operation_id` | `{ version, kind, operationId, product }` |

There is no global sequence. Server idempotency is `(business_id, operation_id)`. Per-stream monotonicity is `(business_id, restore_generation, stream, stream_sequence)`.

A ₹1,000 sale of ₹600 cash + ₹400 credit is `Tender::Retail` plus retail `PaymentPart`s. The invoice JSON does not carry the split; the retail receipt does.

## Auth

- Desktop publisher credentials are device-scoped, short-lived, and separate from owner/manager/cashier/auditor reader credentials.
- Companion readers cannot ingest. Publishers cannot read snapshots.
- Restore generation is fail-closed: mismatch rejects ingest and `decideSnapshotApply` discards the cache.
- No admin/service-role secrets are embedded. TLS validation is not disabled.

## Sidecar publisher

`packages/local-store/src/replication.rs` is ack math only. It does not change posting.

1. Local commit writes the financial outbox as today.
2. The same process records unpublished rows in a sidecar keyed by restore generation.
3. Flush copies those rows, **releases the writer lock**, then talks to the network.
4. Ack advances only after the server accepts the envelope (or returns an idempotent duplicate).
5. On restore, generation change resets the sidecar cursor so the restored outbox is republished.

If the cloud is down, checkout still commits locally.

## Cloud projection

TypeScript harness: `packages/replication-cloud`.

PostgreSQL review SQL: `packages/replication-cloud/sql/20261103000000_native_financial_replication.sql`.

- Integer paise / milli only. Bounds match native `MAX_VALUE` (9_000_000_000_000).
- Incomplete retail splits are withheld from activity until payment parts arrive.
- Owner/manager/auditor see customer outstanding. Cashier does not.
- Business A cannot read business B.

Canonical cursor is a non-negative integer string compatible with `parseSyncCursor`.

## Proof

Run `npm run verify:replication` (TypeScript ingest, projection, snapshot, failure injection).

Rust sidecar tests run on Windows CI with the existing local-store suite. This Linux sandbox has no `rustc`.

## Production gates still closed

| Gate | State |
| --- | --- |
| Merge to main | NO until founder authorization |
| Production SQL apply | NO |
| Mobile live reads | NO (`productionSyncEnabled: false`) |
| Play / App Store | NO |
| Treat unit tests as GO | NO |
