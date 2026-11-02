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

Every ingest and snapshot call resolves the presented credential against the **enrolled** device row. Revocation on the server wins over a stale token. Publisher cannot read. Cashier cannot read `native_replication.customers` (database grant + RLS, not only snapshot filtering).

## Persistence

- In-memory `CloudStore` is a test working set with clone/adopt atomicity.
- PostgreSQL migration is review-only and is executed in PGlite. Posted invoices require `cash + digital + customer_credit = total`. Pending rows may exist without that equality.
- Do not auto-apply to production.

## Native publisher

`Store::unpublished_replication` reads the four outboxes after a sidecar ack cursor. It does not open a network socket and must not run inside a financial writer transaction. HTTP flush is still TypeScript-side. This sandbox has no `rustc`.

## Proof

`npm run verify:replication` — 77 checks (classification, correlation, atomic ingest, enrolled revocation, PGlite migration, RLS).

`npm run verify:mobile-contracts` — demo v1 still parses.

## Remaining blockers

- No Windows debug end-to-end publish (no `rustc` here)
- No production SQL, no live mobile reads
- No HTTPS token issuer
- SQL projector still uses a working-set apply then persists; not a standalone stored-procedure engine
- Unit tests are not a production GO
