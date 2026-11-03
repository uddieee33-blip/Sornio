# Phase 2 — Desktop outbox publishing and cloud read projections

**Status:** Hardened on `arena/5ed2bd28-sornio` for founder review. Not a production GO. Not merged to `main`.

**Depends on Phase 1:** [PR #143](https://github.com/uddieee33-blip/Sornio/pull/143). Arena cannot open a stacked branch, so Phase 1 companion and Phase 2 replication share this draft. Do not treat Phase 2 as independent of unmerged contracts.

## Review-surface limitation

Preferred split is Phase 1 (companion) vs Phase 2 (replication). Creating a second branch would leave PR #143's history or require a force-push. Arena tracks this session on `arena/5ed2bd28-sornio` only. Combined draft is retained on purpose.

## Payment classification (native)

`PaymentPart.method` is `cash | upi | card | credit`.

| Method | Ledger meaning | Snapshot field |
| --- | --- | --- |
| cash | Banked immediately | `cashPaise` |
| upi / card | Digital receivables until statement match | `digitalPaise` |
| credit | Customer debt until repayment | `creditPaise` |

UPI and card are **not** customer credit. Schema v1 cannot represent digital tenders (`cash + credit = total`). Live desktop-outbox snapshots use **schema v2**: `cash + credit + digital = total`. Demo snapshots stay v1.

Incomplete retail allocations (`Tender::Retail` without a correlated receipt) are `pending` and are omitted from activity. `projectionComplete` is false until correlation succeeds. Invoice identity is the billing invoice id, never the retail operation id.

## Auth

Every ingest and snapshot call resolves the presented credential against the **enrolled** device row. Revocation on the server wins over a stale token. Publisher cannot read. Cashier cannot read `native_replication.customers` or `customer_statements` (database grant + RLS + `security_invoker` views, not only snapshot filtering). JWT claims use `set_config(..., true)` inside the reader transaction (`SET LOCAL`). Enrollment is privileged: a publisher cannot self-enroll or un-revoke.

Staging HTTPS uses an HMAC issuer local to the test. Clients do not carry a service-role key.

## Persistence

- PostgreSQL is the durable store. `ingestDurable` hydrates projections from SQL, applies one event, and commits event + stream head + cursor + all projections + ack in **one transaction**. Ack is inserted after projections. A rejected ingest rolls back and writes no ack.
- Multi-worker safety is `SELECT … FOR UPDATE` on the business row plus unique `(business_id, restore_generation, stream, stream_sequence)` and `(…, operation_id)`. Not a process mutex.
- Payload digest is SHA-256 of the **native outbox TEXT**, not `JSON.stringify` of a parsed object.
- Posted invoices require `cash + digital + customer_credit = total`. Pending rows may exist without that equality.
- Do not auto-apply SQL to production.

## Native publisher

`Store::unpublished_replication` reads the four outboxes after a sidecar ack cursor. `ReplicationSidecar` persists those cursors in a SQLCipher file outside `SCHEMA_VERSION` (still 12). Restore deletes the sidecar file so a new generation is republished. `publish_unpublished` talks to a `Transport` only after the financial writer lock is released; this crate does not open sockets. HTTPS proof is the Node staging ingest.

## Proof

`npm run verify:replication` — classification, correlation, atomic SQL ingest, restart hydrate, enrolled revocation, PGlite RLS with `SET LOCAL`, staging TLS ingest.

`npm run verify:mobile-contracts` — demo v1 still parses.

## Remaining blockers / not GO

- No `rustc` in this sandbox, so native sidecar tests are source-level here; Windows CI must compile them
- No production SQL apply, no live mobile reads, `productionSyncEnabled` remains false
- Multi-worker concurrency is designed (row locks + uniques) but PGlite is one connection — true Postgres workers remain UNTESTED
- No Play/App Store, no merge to `main`
