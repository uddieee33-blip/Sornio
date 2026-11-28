# Sornio — Phase 5 Remediation Report

**Date (UTC):** 2026-11-26
**Branch:** `arena/76ac88ca-sornio`
**Remediation HEAD:** `c2adaa9c77b7b1fb2ffa4c6528b16d6e56afd71f`
**Audited candidate:** `7f73ef0a64c81d4d87cc983c8d410d390e01d04c`
**Audit commit (NO-GO):** `5ab3a966219252c9e8cef1d3aa52829be72cafd4`
**`main` baseline:** `1cc5c798d1eada9a16463213b0776c01e99d36f9` — **untouched, not merged**

**Verdict: NO-GO for release.** Four finding groups are remediated with executable evidence; three findings remain open and two verification paths are blocked. A passing branch is not a release approval — see §8.

---

## 1. Scope, branch constraint, and preserved evidence

This is an **isolated remediation**, not a merge. All audit deliverables are preserved unmodified:

* `docs/reviews/phase5-independent-adversarial-audit.md`
* `docs/reviews/phase5-adversarial-findings.json` (original findings retained; a `remediation` object was **added** per finding)
* `docs/reviews/phase5-adversarial-evidence/` (12 files)

**Branch constraint (disclosed):** the session is pinned to `arena/76ac88ca-sornio`; a separately named remediation branch could not be created. All remediation commits are on this branch, stacked directly on the audit commit `5ab3a96`, which is itself stacked on the audited candidate `7f73ef0`. `main` was never modified, and no merge was performed.

**Commits (oldest → newest):**

| Commit | Scope |
|---|---|
| `895ec34` | RULE 2 — durable lockout for Owner recovery authentication (P5-ADV-001) |
| `14d5cc1` | RULE 3 — financial verification enforced at the restore boundary (P5-ADV-003..007) |
| `0ccae3c` | RULE 4 — replication harness updated to v13 semantics (P5-ADV-002) |
| `272b492` | RULE 5 — unified cross-generation dedup contract (P5-ADV-009) |
| `30abdf8` | `cargo fmt` applied to remediation code |
| `c2adaa9` | removed an unnecessary `mut` introduced by remediation tests |

No existing test was deleted or weakened. No source-level assertion replaced executable verification. The only governance assertions added are *in addition to* executable checks.

---

## 2. P5-ADV-001 — Recovery Owner-password lockout bypass (High)

**Original finding.** `resolve_interrupted` verified the Owner password with no failure accounting, so the session-less recovery command was an unlimited online password oracle. A correct guess also released the fence and granted business access even while the workspace login lockout was active.

**Root cause.** Recovery authentication called Argon2 verification directly and never touched the durable `workspace_access` failure budget used by `access::login_at`. Lockout state was therefore not consulted on the recovery path.

**Fix.** `recovery.rs::resolve_interrupted_at(store, op, password, clock)` now shares the **existing** login policy — no second, weaker policy was invented:

* Active lockout (principal **or** global) ⇒ `RateLimited`, **even with the correct password**.
* Wrong password ⇒ durable `failed_attempts = min(attempts + 1, 5)`; at 5, `retry_after = clock + 60`; after expiry the counter resets to 1. `StoreError::InvalidPassword` is preserved (required by the security governance example).
* Accounting is committed **explicitly**, so it survives process restart and is not rolled back with a failed attempt.
* All reads/writes occur inside the `IMMEDIATE` writer transaction, serializing concurrent attempts.
* Success clears `(0, 0)`, writes the `session.unlocked` audit row, and only then releases the fence.
* Locked-state review remains available where permitted; **no business access while locked**.
* Argon2 verification always runs (no early-exit timing shortcut).

**Files.** `packages/local-store/src/recovery.rs`, `packages/local-store/src/recovery/phase5_tests.rs` (helpers widened to `pub(super)`), `packages/local-store/src/recovery/remediation_tests.rs` (new).

**Security implication.** The recovery command is no longer an unlimited password oracle and can no longer be used to escape an active lockout.

**Tests added — 6, all executable:** repeated failures engage the shared budget; lockout persists across reopen; the correct password is refused while locked; concurrency cannot bypass accounting; success after the permitted interval works and clears the budget; review stays available while business access does not.

**Result:** `6 passed; 0 failed` — exit 0 (`rule6-auth-remediation.txt`).
**Status: FIXED.**

---

## 3. P5-ADV-003..007 — Financial verification not enforced; verifier blind spots (Medium ×5)

**Original findings.** `financial_violations` had **zero production callers** (003). The audit then reproduced four false negatives: deleted credit-sale entry (004), tampered repayment/`opening_due` (005), balanced revenue↔cash shift (006), duplicated balanced retail journal (007).

**Root cause.** Verification existed only as a test oracle, so a restore could install a semantically corrupt ledger. The oracle itself checked aggregate balance, which is invariant under exactly the tampers above — balanced totals cannot establish that a ledger entry corresponds to its source business record.

**Fix — production boundary.** `packages/local-store/src/recovery/financial.rs` provides `violations()` and `verify()`. `verify()` is called inside the **single `IMMEDIATE` restore transaction**, after `integrity()` and before completion, raising the new `StoreError::FinancialInconsistency`. Rejection rolls the whole transaction back: the original database and the fence are preserved. The desktop adapter maps the error to `financial_inconsistency`.

**Invariants now established (source record → financial consequence, not totals):**

1. **Invoice ↔ ledger:** postings exist; zero-sum; exactly one settlement leg matching total/tender/customer; revenue leg equals `−subtotal`; a tax leg exists **iff** tax > 0; `subtotal + tax = total`.
2. **Inventory movement arithmetic:** non-negative stock; `after = before − qty`; payload line ↔ movement correspondence in **both** directions.
3. **Credit:** journal zero-sum; credit sale ↔ credit entry in both directions; for non-sale entries the entry delta equals the journal's receivables movement; derived outstanding ≥ 0.
4. **Retail:** journal zero-sum; **every** journal operation is backed by `local_retail_activity`; return revenue/tax legs equal `local_retail_returns`.
5. **Outbox:** no duplicate idempotency keys.

**Preserving valid history.** A blanket `UNIQUE(operation_id, account)` was deliberately **rejected**: valid multi-part returns legitimately produce one journal batch per refund part. Duplication is detected relationally instead. A dedicated false-positive guard test asserts that repeated `(operation_id, account)` rows exist in valid history and are still accepted.

**Documented limitations (not invented rules).** Customer outstanding is **derived**, not stored (`local_customers` has no balance column), so it is recomputed rather than compared to a stored field. `stock_adjusted` events have no `local_invoice_stock` row, so stock is **not** reconstructable from invoice movements alone; the verifier checks movement arithmetic and correspondence, not a full stock rebuild. Legacy rows with NULL payload fields yield NULL comparisons and are not flagged.

**Files.** `recovery/financial.rs` (new), `recovery/financial_tests.rs` (new), `recovery.rs` (module + gate), `recovery/phase5_tests.rs` (oracle now also calls the production verifier — additive), `lib.rs` (`FinancialInconsistency`), `apps/desktop/src-tauri/src/main.rs` (error mapping).

**Tests added — 10, all executable, on disposable databases:** valid history incl. multi-part returns accepted; deleted credit-sale entry; tampered repayment; balanced-but-semantically-wrong ledger (asserts `SUM` is still 0); duplicated return journal; orphan retail journal operation; missing postings + broken stock arithmetic; **end-to-end restore rejection** (asserts the original 2 invoices are intact, ghost rows unchanged, no fence left behind); tampered backup file rejected at preview (`InvalidBackup`); valid backup still restores.

**Result:** `10 passed; 0 failed` — exit 0 (`rule6-financial-corruption.txt`).
**Status: FIXED** for 003, 004, 005, 006, 007.

---

## 4. P5-ADV-002 — `verify:replication` governance gate failed (Medium)

**Original finding.** The harness asserted `financial schema remains 12` and required sidecar-reset code that v13 removed, so the required gate exited 1 with `AssertionError`.

**Root cause.** The harness pinned v12 semantics and asserted the *presence* of a sidecar-deletion path that v13 replaced with generation-keyed reset.

**Fix.** Every obsolete assertion was replaced with a meaningful v13 equivalent — **none removed or weakened**:

* Schema pin → **13**, plus `migrate_v13` and `reconcile_startup` wiring checks.
* Sidecar-deletion *presence* → **absence**, plus `on_restore` / `ack.on_restore(&generation)` / stale-generation checks.
* Added recovery-fencing and financial-module assertions.
* Added 9 executable dedup-contract checks (§5).

**Files.** `scripts/verify-replication.mjs`.

**Result:** `verify-replication: 129 checks passed` — **exit 0** (`rule5-replication-harness.txt`; the RULE 4 milestone run was 120 checks, `rule4-replication-harness.txt`). The harness was run in full, not bypassed.
**Status: FIXED.**

---

## 5. P5-ADV-009 — In-memory vs durable Postgres dedup divergence (Medium)

**Comparison and decision.** Full analysis: **`docs/reviews/phase5-cloud-dedup-contract.md`**.

The paths disagreed on whether a restore generation is part of business identity. **Decision: cross-generation dedup is intentional and required; the per-generation durable key was the defect.** A restore generation is a transport epoch; `operationId` identifies a business operation. Because `bumpCustomer` **applies a delta**, re-projecting a replayed credit entry would **double-count customer outstanding**.

**A second defect was found while establishing the contract.** The in-memory path returned early for a duplicate **without advancing the new generation's stream head**. After a restore, all replayed snapshot rows are duplicates, so the head stayed at 0 and the **first genuinely new sale was rejected `GAP` — permanently unpublishable.** Reproduced before the fix:

```
gen-2 billing seq3 (bill-3-NEW) => ERROR GAP - Stream sequence skipped a gap.
```

After the fix: `{"operationId":"bill-3-NEW","cursor":"6","duplicate":false}`, `OUTSTANDING_PRESERVED: true`.

**Fix.** `ingest.ts` computes sequence/head before the duplicate branch and advances the head when a duplicate is exactly `last + 1` (clone/adopt). `postgres.ts` drops `restore_generation` from the duplicate lookup, selects the earliest event, advances the current generation's head under `FOR UPDATE` when contiguous, and inserts a per-generation ack `ON CONFLICT DO NOTHING`. Retries of a seen sequence stay idempotent and keep the original cursor.

**Contract (9 clauses)** is documented and covered by executable harness checks: cross-generation duplicate; no re-projection of credit deltas; new post-restore operation accepted; retry idempotent with original cursor; `CONFLICT` on payload reuse; `STALE_GENERATION` fence retained.

**Files.** `packages/replication-cloud/src/ingest.ts`, `packages/replication-cloud/src/postgres.ts`, `scripts/verify-replication.mjs`, `docs/reviews/phase5-cloud-dedup-contract.md`.

**Verification.** In-memory contract **executable-verified** (129 harness checks, exit 0); before/after behavioural probes captured; strict `tsc` exit 0.

**Durable PostgreSQL runtime: BLOCKED.** No `postgres`, `initdb`, `psql`, `pg_ctl` binaries, no server, no container runtime in this environment. **TypeScript compilation is not runtime verification and is not claimed as such.** The Postgres dedup-key check is a source-level governance assertion only.
**Status: FIXED — NOT INDEPENDENTLY VERIFIED** (durable path); in-memory path FIXED.

---

## 6. Findings not remediated in this pass

| Finding | Severity | Status | Reason |
|---|---|---|---|
| **P5-ADV-008** — `workspace_access` / `local_recovery_identity` writable via raw SQL while fenced | Medium | **STILL OPEN** | Bounded defense-in-depth gap. No raw-SQL command is exposed by the desktop adapter; business-identity substitution is already fail-closed at startup (`RecoveryCorrupt`). Fencing `workspace_access` would break the login path that RULE 2 deliberately shares, so it needs a designed trust-model change, not a trigger added under time pressure. |
| **P5-ADV-010** — `owner_token` / generation format unvalidated at `admit` / `reconcile_startup` | Low | **STILL OPEN** | The backup-manifest path already validates 64-hex identity, but admission/reconciliation do not. Small, safe follow-up; not attempted here to keep this pass reviewable. |
| **P5-ADV-011** — `clippy -D warnings` pre-existing style lints | Informational | **STILL OPEN** | Pre-existing repo-wide debt. The **plain** clippy gate passes (exit 0) and remediation code contributes **zero** warnings. |

---

## 7. RULE 6 — Complete verification ledger

Environment: `rustc`/`cargo` 1.100.0, `rustfmt` 1.11.0-stable, `clippy` 0.1.100, Node v22.22.3, TypeScript 6.0.3. Vendored crates, offline. `CARGO_TARGET_DIR=/home/user/phase5-audit/target`, `RUST_TEST_THREADS=2`.
Cargo manifest for all Rust commands: `--manifest-path packages/local-store/Cargo.toml`.

| # | Command | Result | Exit | Evidence |
|---|---|---|---|---|
| 1 | `cargo test --all-targets --locked …` | **237 passed / 0 failed / 7 ignored** (360.22s) + security example **7 / 0** (9.65s) | **0** | `rule6-full-suite-final.txt` |
| 2 | `cargo test --example cashier_review_bridge --locked …` | 7 passed / 0 failed | 0 | `rule6-security-governance.txt` |
| 3 | `cargo test --lib --locked … recovery::` | 59 passed / 0 failed / 3 ignored (131.86s) | 0 | `rule6-recovery-tests.txt` |
| 4 | `cargo test --lib --locked … migrat` | 14 passed / 0 failed (19.59s) | 0 | `rule6-migration-tests.txt` |
| 5 | `cargo test --lib --locked … recovery::financial::financial_tests` | 10 passed / 0 failed (11.93s) | 0 | `rule6-financial-corruption.txt` |
| 6 | `cargo test --lib --locked … recovery::remediation_tests` | 6 passed / 0 failed (12.41s) | 0 | `rule6-auth-remediation.txt` |
| 7 | `cargo test --lib --locked … recovery::phase5_tests::crash_at_every_transition_is_fail_closed_and_consistent -- --exact` | **1 passed / 0 failed** (24.19s) — five-phase subprocess crash consistency **re-run after the recovery changes** | 0 | `rule6-crash-final.txt` |
| 8 | `node scripts/verify-replication.mjs` | **129 checks passed** | 0 | `rule5-replication-harness.txt` |
| 9 | `tsc --noEmit -p packages/mobile-contracts/tsconfig.json` | clean | 0 | `rule6-cloud-tsc.txt` |
| 10 | `tsc … --strict` (replication-cloud + mobile-contracts, emit) | clean | 0 | `rule6-cloud-tsc.txt` |
| 11 | `node cloud-probe.mjs <fixed build>` | **5 assertions passed** (audit probe re-run) | 0 | `rule6-cloud-behavioral.txt` |
| 12 | `node cloud-restore-probe.mjs` before / after | before: `GAP` on first new post-restore sale; after: accepted, outstanding preserved | 0 | `rule5-probe-before.txt`, `rule5-probe-after.txt` |
| 13 | `cargo fmt --check …` | clean (after applying `cargo fmt`) | 0 | `rule6-fmt.txt` |
| 14 | `cargo clippy --all-targets --locked …` | passes; **17 pre-existing** lib warnings, **0** from remediation code | 0 | `rule6-clippy.txt` |

Baseline comparison: the audit measured **221 / 0 / 7 + 7 / 0**; remediation is **237 / 0 / 7 + 7 / 0** — **+16 tests, no regressions, no deletions**.

The 7 ignored tests are unchanged from the audit baseline: 5 are subprocess crash workers exercised by their parent tests, and 2 (`native_sqlcipher_export_pipeline`, `native_sqlcipher_apply_https_acks`) were already `#[ignore]` in the candidate.

Evidence directory: **`docs/reviews/phase5-remediation-evidence/`** (20 files).

---

## 8. Remaining release blockers

1. **Durable PostgreSQL runtime — BLOCKED.** The SQL dedup change is unverified against a real server. Must be re-run on a disposable PostgreSQL instance: ingest → restore → replay → new operation, asserting no double-counted outstanding and no `GAP`.
2. **Windows / Tauri desktop runtime — NOT VERIFIED.** Linux-only, offline; the desktop adapter was not compiled or run. Only the Rust boundary and the error-code mapping changed.
3. **P5-ADV-008 (Medium) and P5-ADV-010 (Low) — STILL OPEN.**
4. **P5-ADV-011 (Informational) — STILL OPEN**; `-D warnings` is not a passing gate repo-wide.
5. **Independent review required.** Every fix must be reproduced by a reviewer on a clean checkout. This report is author evidence, not independent verification.

**No GO is declared.** The remediation branch passing its own tests does not authorize release. `main` remains at `1cc5c798` and no merge was performed.
