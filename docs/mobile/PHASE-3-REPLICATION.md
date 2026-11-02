# Phase 3 replication — GO / NO-GO

Draft PR #143 on `arena/5ed2bd28-sornio`. Not merged. Live sync stays off.

| Gate | Result | Evidence |
| --- | --- | --- |
| A. Preserve Windows artifacts `41457796087` | **BLOCKED** | `docs/mobile/WINDOWS-EVIDENCE-41457796087.md`. Azure blob host is not reachable here. Artifacts expire 2026-11-09. This note is not an archive. |
| B. Real PostgreSQL ≥2 connections | **UNTESTED here** | `scripts/verify-replication-postgres.mjs` plus `.github/workflows/replication-postgres.yml` (`postgres:16` service). PGlite is not this gate. |
| C. Seven native sales post → outbox → HTTPS → PG → ack → sidecar | **PARTIAL / UNTESTED** | Native SQLCipher matrix is `packages/local-store/src/replication_matrix_tests.rs` (needs rustc). HTTPS→PG matrix uses native-shaped envelopes, not SQLCipher outbox bytes. |
| D. Delivery failure then recovery per scenario | **UNTESTED here** | Native FailTransport then EchoTransport; HTTPS expired token then commit then duplicate retry. |
| E. TLS + tenant isolation | **UNTESTED here** | Staging TLS ingest, stolen/expired tokens, cashier `SET ROLE` cannot `SELECT` customers, cross-tenant invoice counts. Certificate verification stays on. |
| F. Isolated real-Postgres CI job | **WRITTEN, not yet green** | `Replication PostgreSQL` workflow. Fails closed without `DATABASE_URL` in CI. |
| Native mixed ₹600 cash + ₹400 credit | **Supported in native code** | `Action::Sale` + `Tender::Retail`. Cloud now accepts native atomic sale ids (`operationId` may equal invoice id). Untested on a compiler until Windows CI. |
| rustc / `cargo fmt --check` of new tests | **UNTESTED here** | No rustc in this sandbox. |
| Merge PR #143 / production SQL / live sync / stores | **NO-GO** | Founder merge only after independent review. `productionSyncEnabled` remains false. `SCHEMA_VERSION` remains 12. |

Passing `npm run verify:replication` (PGlite) is not production GO.

Do not treat this document as preservation of the Windows installer or native captures.
