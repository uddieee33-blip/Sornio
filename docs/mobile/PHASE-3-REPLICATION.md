# Phase 3 replication — GO / NO-GO

Draft PR #143 on `arena/5ed2bd28-sornio`. Not merged. Live sync stays off.
Head at the rustfmt follow-up of `3b80314`.

| Gate | Result | Evidence |
| --- | --- | --- |
| A. Preserve Windows artifacts `41457796087` | **BLOCKED** | `docs/mobile/WINDOWS-EVIDENCE-41457796087.md`. Azure blob host is not reachable here. Artifacts expire 2026-11-09. This note is not an archive. |
| B. Real PostgreSQL ≥2 connections | **PASS** | [Replication PostgreSQL `41532552398`](https://github.com/uddieee33-blip/Sornio/actions/runs/41532552398) on `postgres:16` with two `pg.Client` workers. PGlite is not this gate. |
| C. Seven native sales post → outbox → HTTPS → PG → ack → sidecar | **PARTIAL** | Native SQLCipher post/outbox/sidecar: **PASS** on Windows cargo test ([`41532553376`](https://github.com/uddieee33-blip/Sornio/actions/runs/41532553376)). HTTPS→PG used native-shaped envelopes, not SQLCipher outbox bytes. |
| D. Delivery failure then recovery per scenario | **PASS** (split) | Native FailTransport then EchoTransport on Windows. HTTPS expired token, then commit, then duplicate retry on PostgreSQL. |
| E. TLS + tenant isolation | **PASS** | Staging TLS ingest, stolen/expired tokens, cashier `SET ROLE` cannot `SELECT` customers, cross-tenant invoice counts. Certificate verification stays on. |
| F. Isolated real-Postgres CI job | **PASS** | Same run as B. Fails closed without `DATABASE_URL` in CI. |
| Native mixed ₹600 cash + ₹400 credit | **PASS** natively | Windows cargo test posted the seven-sale matrix including mixed cash+credit. Cloud accepts native atomic sale ids. |
| rustc of new tests | **PASS** | Windows release + debug `cargo test --all-targets` on [`41532553376`](https://github.com/uddieee33-blip/Sornio/actions/runs/41532553376). |
| `cargo fmt --check` of new tests | **FAIL then fix** | Browser [`41532552312`](https://github.com/uddieee33-blip/Sornio/actions/runs/41532552312) failed rustfmt on `replication_matrix_tests.rs`. Formatting is corrected in this follow-up. Browser is not green until that job reruns. |
| Merge PR #143 / production SQL / live sync / stores | **NO-GO** | Artifact preservation still blocked. Native outbox bytes were not pushed through HTTPS→PG. Founder merge only after independent review. `productionSyncEnabled` remains false. `SCHEMA_VERSION` remains 12. |

Passing `npm run verify:replication` (PGlite) is not production GO.

Do not treat this document as preservation of the Windows installer or native captures.
