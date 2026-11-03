# Phase 2 assignment — native outbox to cloud read projections

Priority: CRITICAL  
Depends on: Phase 1 companion contracts (`packages/mobile-contracts`) and unmerged [PR #143](https://github.com/uddieee33-blip/Sornio/pull/143). Arena cannot open a stacked branch, so implementation lives on `arena/5ed2bd28-sornio`.

## Objective

Publish committed Windows financial events to authenticated, tenant-isolated
read projections without weakening SQLCipher invariants.

## Scope

1. Rust outbox publisher in `packages/local-store` (or a sibling crate).
2. Authenticated HTTPS adapter. Short-lived desktop credentials. No vault key.
3. Postgres / Supabase tables for:
   - `business_id`
   - `restore_generation`
   - `cursor`
   - immutable financial events with integer paise / milli
4. Idempotent ingest on `operation_id`.
5. Read API matching `CompanionSnapshot` / `parseCompanionSnapshot`.
6. Contract tests: duplicate upload, out-of-order reject, generation bump,
   ₹1,000 = ₹600 cash + ₹400 credit.
7. Evidence that native ledger totals equal projection totals.

## Out of scope

- Mobile live wiring (Phase 3)
- Mobile financial writes
- Play / App Store submission
- GST engine work
- LAN socket work

## Exit

Phase 2 is done when a Windows debug build can post one cash+credit invoice
offline, reconnect, and a contract test against the cloud returns the same
paise strings the companion parser accepts — with production adapter still
disabled in the app until Phase 3.

## Implementation notes (this branch)

See [PHASE-2-DESKTOP-CLOUD-REPLICATION.md](./PHASE-2-DESKTOP-CLOUD-REPLICATION.md).

- Financial `SCHEMA_VERSION` remains 12. Publisher acks are a sidecar.
- UPI/card are digital receivables, not customer credit. Live snapshots use companion schema v2.
- Cloud ingest/projection: `packages/replication-cloud` (atomic working set + review-only SQL executed in PGlite).
- Native unpublished outbox reader: `Store::unpublished_replication`.
- Proof: `npm run verify:replication` (77 checks). Rust tests run on Windows CI.
- `productionSyncEnabled` remains false. Combined Phase 1+2 draft retained; Arena cannot open a stacked PR. Do not merge #143/#126/#127 from this work.
