# Phase 2 assignment — native outbox to cloud read projections

Priority: CRITICAL  
Depends on: Phase 1 companion contracts (`packages/mobile-contracts`)

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
