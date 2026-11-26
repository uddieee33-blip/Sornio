# Phase 5 — Independent Adversarial Audit

**Durable recovery, corruption resistance, financial integrity (schema v13)**

- **Audit date (UTC):** 2026-11-26
- **Auditor:** Independent adversarial audit (Arena Agent Mode), treating the candidate as untrusted.
- **Candidate commit:** `7f73ef0a64c81d4d87cc983c8d410d390e01d04c`
- **Branch:** `arena/76ac88ca-sornio`
- **Baseline / `main`:** `1cc5c798d1eada9a16463213b0776c01e99d36f9` (untouched)
- **Machine-readable findings:** [`phase5-adversarial-findings.json`](./phase5-adversarial-findings.json)
- **Evidence directory:** [`phase5-adversarial-evidence/`](./phase5-adversarial-evidence/)

---

## 1. Executive verdict

**Verdict: NO-GO.**

The candidate's *ownership fencing of business data*, *crash consistency*, and *fail-closed startup reconciliation* are strong and were independently re-verified by execution. However, the audit demonstrates a **critical security-invariant violation**: the Owner-resolution command (`resolve_interrupted_recovery`) authenticates the Owner password but implements **no brute-force lockout**, unlike the normal login path. This is reachable through a registered, session-less Tauri command whenever the workspace is fenced, and on success it grants a fully unlocked Owner session. It directly breaches the standing constraint *"do not weaken existing authentication safeguards."*

Two further release blockers compound this:

1. The candidate **fails the project's existing `verify:replication` governance gate** (it bumped `SCHEMA_VERSION` to 13 and removed sidecar reset, but left the harness asserting schema 12 and `reset_sidecar_file`). The gate exits non-zero on the candidate.
2. **Financial-integrity verification is test-only.** The production restore boundary (T3) runs structural `integrity()` only; the deep financial verifier (`financial_violations`) is `#[cfg(test)]` and never gates a real restore. The audit reproduced **four false negatives** in that verifier, so even the test oracle does not establish the financial-integrity claim.

Per the decision standard, violation of a critical security invariant (authentication) mandates **NO-GO**. No finding was downgraded to reach this verdict; the single High-severity finding is a breach of a critical invariant, and the broken governance gate and absent production financial verification are independently release-blocking.

**Findings by severity:** Critical 0 · High 1 · Medium 8 · Low 1 · Informational 1 (11 total).
**Independently verified invariants (executed evidence):** 12. **Failed invariants:** 3 (authentication lockout on resolution; production financial-integrity enforcement; existing replication governance gate).

---

## 2. Candidate identity and baseline

| Item | Value |
|---|---|
| Candidate commit | `7f73ef0a64c81d4d87cc983c8d410d390e01d04c` |
| Branch | `arena/76ac88ca-sornio` (active) |
| Baseline / `main` | `1cc5c798d1eada9a16463213b0776c01e99d36f9` |
| Schema version | `SCHEMA_VERSION: i64 = 13` (`packages/local-store/src/lib.rs:160`) |
| Candidate patch | `docs/reviews/p0-durable-recovery-phase5.patch`, SHA-256 `e2aef6057e0b12cee5f3c74ec8e0087a7a6a190373be87676528b3f487f53430` |
| Audit method | Isolated export of the candidate (`git archive 7f73ef0`), no `.git`; candidate implementation never modified. |

The sandbox was reset between turns; the audit environment was rebuilt from remote objects. The relay payload was reassembled and SHA-verified (`6209d51e79e243c2cc69ed2ba24e9e85dcbf2df6f9352738aa33ce3ed91dd630`); all five Rust dist tarballs verified against `manifest.json`; toolchain reinstalled (rustc/cargo 1.100.0); 106 crates re-vendored by SHA-256. The local branch was restored to the exact candidate (`git reset --hard 7f73ef0`) before adding these audit deliverables; `main` remained at baseline throughout.

Prior agent conclusions, test names/counts, implementation comments, and prior review documents were treated as **untrusted input** and re-traced from source.

---

## 3. Scope and exclusions

**In scope (all six required areas):** A. Authorization/recovery-command security; B. Universal ownership fencing; C. Crash consistency; D. Financial integrity; E. Publisher draining/replication; F. Metadata/corruption resistance.

**Executed in this audit:**
- Full Rust suite `--all-targets` on the pristine candidate (independent re-run).
- `cargo fmt --check`; `cargo clippy --all-targets` (plain gate) and with `-D warnings`.
- Subprocess crash-consistency test (independent re-run).
- 12 additional targeted adversarial tests (8 defect repros + 4 fail-closed controls), appended only to an isolated copy.
- Cloud TypeScript compilation (strict, TS 6.0.3) and a behavioral dedup/generation probe.
- The existing `verify:replication` harness (executed; fails on the candidate).

**Exclusions / environmental limitations (see §12):**
- **Tauri desktop build NOT compiled** (offline limitation). Runtime authorization of the Tauri commands is verified at the Rust boundary and by static dispatch/permission/capability tracing, **not** by a running desktop app. Classified NOT VERIFIED at the desktop-runtime layer.
- **No Windows verification.** All execution is Linux. No Windows behavior is claimed.
- **Cloud Postgres path NOT executed** (no Postgres instance). The durable `postgres.ts` dedup/sequence logic is source-inspected; the in-memory reference path was executed.
- Public restore and sidecar deletion remain disabled (not enabled by this audit).

---

## 4. Authorization and recovery-command security (Area A)

**Commands:** `read_recovery_status` and `resolve_interrupted_recovery` (`apps/desktop/src-tauri/src/main.rs:769,776`), both registered in `invoke_handler` and routed through `with_recovery_review_workspace` → `verify_scope_readonly` (no session required or granted).

**Statically verified (consistent across all four layers):**
- `permissions/workspace.toml` defines `local-recovery-review` allowing exactly the two commands.
- `capabilities/local-workspace.json` lists 8 permissions including `local-recovery-review`, `local: true`, window `main` only.
- `build.rs` manifest names agree.
- Governance test `security_command_tests::recovery_review_commands_enforce_scope_and_owner_password_while_lock_free` passes (7/0 security suite). A negative test confirms the review category is excluded from the generic session-guarded `cases()`.
- `verify_scope_readonly` enforces workspace identity (`Scope` equality) and grants no authority; resolution re-authenticates the Owner internally. Passwords are `Zeroizing`-wrapped at the command boundary.

**Lock-free justification:** status is operational metadata (diagnosable while fenced); resolution must work while login is itself barred by the fence. This justification is sound for *status*. For *resolution*, the lock-free path is necessary but its authentication is incomplete:

> **Finding P5-ADV-001 (HIGH — critical authentication invariant violated).** `recovery::resolve_interrupted` (`packages/local-store/src/recovery.rs`) reads `retry_after` and honors an *existing* lockout, but on a wrong password returns `InvalidPassword` **without incrementing `failed_attempts` or setting `retry_after`** (global or principal), and writes no `session.unlocked` audit. Contrast `access::login_at`, which increments both counters and locks for 60s at 5 failures. Consequently, while fenced, an attacker can make **unlimited** Owner-password guesses through `resolve_interrupted_recovery`; on success `store.1 = Some(session)` grants a fully unlocked Owner session.
> **Reproduced:** `audit_a1_resolve_interrupted_has_no_bruteforce_lockout` — 25 wrong attempts all return `InvalidPassword`, counters stay `(0,0,0,0)`, then the correct password unlocks the session. Control `audit_a2_normal_login_locks_out_after_five_failures` confirms normal login locks at 5. Evidence: `adversarial-all-12.txt`.

**Escalation via test-bridge/dispatch:** the cashier-review bridge's `recovery_review_dispatch` is scope-verified; the governance suite asserts every registered command has an explicit security case and scoped wrapper, and that no generic database/reset command exists. No escalation path was found at the Rust boundary. **Desktop-runtime authorization is NOT VERIFIED** (no desktop build).

---

## 5. Universal ownership fencing (Area B)

**Mechanism:** `FENCED_TABLES` (40 business tables) each get three `BEFORE INSERT/UPDATE/DELETE` triggers that `RAISE(ABORT)` whenever a `local_recovery_fence` row exists (`recovery.rs:migrate_v13`). The fence is a singleton; admission inserts operation + fence in one `IMMEDIATE` transaction.

**Independently verified (executed):**
- **No session-less raw-SQL bypass for business data.** `audit_b1` positive control: `UPDATE local_products …` is rejected while fenced. The candidate's `fence_blocks_every_business_table_write_including_raw_sql` re-ran green in the full suite (representative write per fenced table, fingerprint unchanged).
- **No dual ownership.** `admit` rejects a second admission (`RecoveryActive`); the fence singleton prevents a second owner. At startup, `audit_f2_startup_rejects_two_live_operations` confirms two live operations → `RecoveryCorrupt`.
- **Stale-owner commit barred.** `transition()` matches `operation_id + owner_token + state` and requires exactly one updated row; the `local_recovery_operations_transition` trigger independently enforces the state graph and immutable identity for every connection.
- **Business-identity substitution fails closed at startup.** `audit_b2_startup_fails_closed_on_business_substitution` → `RecoveryCorrupt`.
- **No validation↔commit race for business data.** The fence is checked at write time inside the writer transaction; `restore_owned` holds a single `IMEDIATE` writer lock from re-validation through commit, and re-checks the bound fingerprint under that lock (`RecoveryChanged` on drift). Crash points `executing`/`verifying` are inside the uncommitted transaction (rollback-safe).

> **Finding P5-ADV-008 (MEDIUM — bounded metadata gap).** The fence deliberately exempts auth/recovery metadata. `audit_b1_unfenced_metadata_writable_while_fenced` shows raw-SQL `UPDATE workspace_access …` (lockout counters) and `UPDATE local_recovery_identity SET generation=…` **succeed while fenced**. `local_recovery_identity` has no immutability trigger. Impact is bounded: business substitution is caught fail-closed at startup (`audit_b2`), and a concurrent raw writer is blocked by the writer lock during the restore transaction; however generation tamper is not cross-checked, and lockout counters can be reset between transactions. This is a defense-in-depth gap, not a business-data ownership breach.

**Unfenced tables (observed):** `workspace_access`, `local_identity_audit`, `local_billing_audit`, `local_recovery_audit`, `local_recovery_identity` (plus the recovery operations/fence tables themselves). Audit tables carry their own immutability triggers; `local_recovery_identity` and `workspace_access` do not.

---

## 6. Crash consistency (Area C)

**Independently verified (executed):** `recovery::phase5_tests::crash_at_every_transition_is_fail_closed_and_consistent` re-run, **CRASH_EXIT=0** (`pristine-crash.txt`). It spawns a real subprocess (`current_exe … phase5_crash_worker --ignored`), injects `SORNIO_RECOVERY_CRASH_PHASE` at each of `admitted, quiescing, executing, verifying, completed`, waits for the boundary marker, then **kills** the child and reopens the store:

- **Pre-commit crashes (admitted/quiescing/executing/verifying):** durable fence remains, **original two invoices retained**, `requires_resolution=true`; Owner resolution releases the fence and leaves the original data and a clean financial verifier.
- **Completed crash:** the only committed success point — fence released, imported image (one invoice), `requires_resolution=false`, financial verifier clean.
- `executing`/`verifying` crash hooks sit inside the uncommitted writer transaction, so a crash rolls back the import entirely; the admission fence (committed earlier) survives.

**Source-traced:** TX-R (`tx.commit()` in `restore_owned`) is the sole durable success point; `result_generation` is set only at completion; imported non-terminal operations are explicitly terminated (`recovery.imported_interrupted`); the fence is re-established for the verifying operation. Startup reconciliation (Area F) contains any ambiguous survivor.

**Linux only.** No Windows crash behavior is claimed (NOT VERIFIED).

---

## 7. Financial integrity (Area D)

**Central observation:** the deep financial verifier `financial_violations` is **test-only** (`#[cfg(test)]`, `recovery/phase5_tests.rs`); a repository-wide search shows it is referenced **nowhere outside tests**. The production restore's T3 step calls only `integrity()` (`PRAGMA cipher_integrity_check`, `integrity_check`, `foreign_key_check`) — structural, not financial. The code comment states *"Deep financial-invariant verification is test-only by design."*

> **Finding P5-ADV-003 (MEDIUM).** Financial-integrity invariants are **not enforced at the production restore boundary**. Restore relies on backup structural integrity plus the assumption that the source database's write-time triggers/constraints guaranteed validity. A backup whose financial data is logically invalid but structurally intact (e.g., on-disk logical corruption) would be imported and marked `completed` without financial verification. End-to-end silent corruption was **not demonstrated** (schema validation requires the full trigger set, and write-time triggers constrain normal data), so this is classified as a design/verification gap, not a demonstrated silent-corruption exploit.

**Verifier SQL false negatives — independently reproduced** (each test corrupts state via `strip_triggers` then asserts `financial_violations` returns empty):

| ID | Gap | Repro |
|---|---|---|
| P5-ADV-004 (Medium) | Deleting a credit sale's `local_credit_entries` row understates customer outstanding; check 5 is an INNER JOIN on `kind='sale'`, so a missing entry yields no row. | `audit_d1_verifier_misses_deleted_credit_sale_entry` |
| P5-ADV-005 (Medium) | Tampering a `repayment`/`opening_due` credit entry changes outstanding; check 5 only cross-checks `kind='sale'`. | `audit_d2_verifier_misses_tampered_repayment_entry` |
| P5-ADV-006 (Medium) | A balanced billing-ledger tamper (shift between `revenue` and `cash`) keeps `SUM=0`; the verifier never reconciles ledger amounts to invoice totals. | `audit_d3_verifier_misses_balanced_ledger_tamper` |
| P5-ADV-007 (Medium) | `local_retail_journal` has no `UNIQUE(operation_id,account)` and the verifier has no duplicate-journal check; a duplicated balanced posting set (double-counted revenue/cash) reports clean. | `audit_d4_verifier_misses_duplicated_retail_journal` |

Evidence: `adversarial-all-12.txt`, `adversarial-repros.txt`. The verifier **does** correctly detect ledger imbalance, missing postings, duplicate outbox keys, negative stock, broken stock arithmetic, credit-sale receivables mismatch, and the recovery-metadata invariants (candidate tests re-ran green). The gaps above are beyond those existing examples, as required.

**Cross-business contamination:** financial tables are single-business by construction; business identity is bound in `local_recovery_identity` and enforced at admission/startup (Area F). No cross-business financial mixing path was found.

---

## 8. Publisher draining and replication (Area E)

**Rust publisher (`replication.rs:publish_unpublished`) — source-traced + candidate tests re-run:**
- Acquires the flush lock and the process-wide drain mutex (`acquire_drain`).
- Checks `restore_generation == identity.restore_generation` (`WorkspaceMismatch` otherwise) and `ensure_open` (`RecoveryActive` if fenced).
- **Re-checks fence + generation before AND after every network send, before the durable ack** — a recovery admitted or committed mid-batch stops the publisher before it can publish or ack stale rows.
- `unpublished_replication` is query-only and never opens a socket.

**Cloud TypeScript — executed:**
- The cloud package **compiles cleanly** under strict TypeScript 6.0.3 (`TSC_EXIT=0`).
- Behavioral probe (`cloud-behavioral-probe.txt`, 5 assertions passed): first ingest not duplicate; same-generation redelivery idempotent (`duplicate=true`, same cursor); payload reuse → `CONFLICT`; generation mismatch → `STALE_GENERATION`.

> **Finding P5-ADV-002 (MEDIUM — existing governance gate fails).** `node scripts/verify-replication.mjs` exits **1** on the candidate (`cloud-verify-replication.txt`). It compiles successfully, then fails the static assertion `financial schema remains 12` (line 281) because the candidate set `SCHEMA_VERSION=13`. It would also fail `desktop restore discards sidecar acks` (asserts `reset_sidecar_file`, which the candidate removed). `git diff baseline candidate -- scripts/verify-replication.mjs` is empty — the candidate did not update the harness. This is a regression in the project's required verification suite (`npm run verify:replication`). The audit did **not** weaken the assertions.

> **Finding P5-ADV-009 (MEDIUM — cloud dedup semantics discrepancy).** The in-memory reference `ingest.ts` dedups by `businessId|operationId` (**cross-generation**); the probe confirms a gen-2 redelivery of a gen-1 operation returns `duplicate=true`. The durable `postgres.ts` dedups by `(business_id, restore_generation, stream, operation_id)` (**per-generation**, SQL `UNIQUE` line 50). After a restore rotates the generation, the Postgres path would not dedup against the prior generation's events and could re-project them; projection idempotency for journals/credits is not guaranteed by the per-generation key. The in-memory behavior was executed; the Postgres path is **source-inspected, NOT VERIFIED by execution** (no Postgres instance).

**Retry / duplicate delivery / stale ack / crash during publication:** the Rust before/after-send re-checks bound the stale-ack window; the sidecar is generation-keyed (`on_restore`). The residual cross-generation re-projection risk is captured in P5-ADV-009.

---

## 9. Metadata and corruption resistance (Area F)

`reconcile_startup` (`recovery.rs:529`) requires exactly the four recovery tables, validates every distinct audit action against `KNOWN_AUDIT_ACTIONS`, binds every operation's business to `local_recovery_identity`, requires `completed ⇒ result_generation`, permits at most one live operation, and reconciles the fence↔operation pairing (T7 re-fences a live operation missing its fence; `(None, Some)` fence-without-live → corrupt).

**Independently verified fail-closed (executed):**
- `audit_f1_startup_rejects_unknown_audit_action` → `RecoveryCorrupt`.
- `audit_f2_startup_rejects_two_live_operations` → `RecoveryCorrupt`.
- `audit_f3_startup_rejects_fence_on_terminal_operation` → `RecoveryCorrupt`.
- `audit_f4_startup_rejects_completed_without_generation` → `RecoveryCorrupt`.
- `audit_b2_startup_fails_closed_on_business_substitution` → `RecoveryCorrupt`.

Evidence: `adversarial-corruption.txt`, `adversarial-all-12.txt`.

**Source-traced enforcement:** duplicate operation IDs are barred by `PRIMARY KEY`; invalid transitions by the `local_recovery_operations_transition` trigger (exact graph, immutable identity, generation only at completion, monotonic timestamps); fence immutability while active and release-only-for-terminal by fence triggers; unexpected schema versions by `validate()` (`NewerSchema` / `InvalidBackup`, version range 5..=13). Admission and startup enforce the same business-identity and single-live-operation invariants.

> **Finding P5-ADV-010 (LOW).** `owner_token` and `generation` are assumed to be random hex (`random_id()`), but neither admission nor reconciliation validates their format/length. A tampered-but-nonempty token/generation that still matches the fence pairing would not be rejected on format alone. Impact is low (the values are internal and pairing-checked); flagged for completeness.

---

## 10. Test execution ledger

All commands run from the isolated candidate export with `CARGO_TARGET_DIR=/home/user/phase5-audit/target`, `RUST_TEST_THREADS=2`, `CARGO_BUILD_JOBS=2`, offline vendored crates. Toolchain: rustc 1.100.0 (0ef1bc386 2026-11-09), cargo 1.100.0, rustfmt 1.11.0-stable, clippy 0.1.100. Node v22.22.3, TypeScript 6.0.3 (repo pin).

| # | Command | Result | Exit | Evidence |
|---|---|---|---|---|
| 1 | `cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml` | lib **221 passed / 0 failed / 7 ignored**; security example **7 passed / 0 failed** | 0 | `candidate-full-suite.txt` |
| 2 | `cargo fmt --check --manifest-path packages/local-store/Cargo.toml` | clean | 0 | `pristine-fmt.txt` |
| 3 | `cargo clippy --all-targets --locked …` (plain gate) | 17 lib warnings (19 in test cfg), no errors | 0 | `pristine-clippy-plain.txt` |
| 4 | `cargo clippy --all-targets … -- -D warnings` | 17 style lints promoted to errors | 101 | `pristine-clippy.txt` |
| 5 | `cargo test --lib … crash_at_every_transition_is_fail_closed_and_consistent -- --exact` | 1 passed (subprocess crashes at 5 phases) | 0 | `pristine-crash.txt` |
| 6 | `cargo test --lib … recovery::phase5_tests::audit_ -- --nocapture` | **12 passed / 0 failed** (audit-added) | 0 | `adversarial-all-12.txt` |
| 7 | `node scripts/verify-replication.mjs` | compiles; fails `financial schema remains 12` | 1 | `cloud-verify-replication.txt` |
| 8 | `tsc … replication-cloud + mobile-contracts --strict` (TS 6.0.3) | compiles clean | 0 | (compile step of #7; `cloud-out`) |
| 9 | `node cloud-probe.mjs` (audit behavioral probe) | 5 assertions passed | 0 | `cloud-behavioral-probe.txt` |

**Notes:**
- An initial `cargo fmt --check --locked …` invocation returned exit 2 because `cargo fmt` rejects `--locked`; this was an auditor command error, corrected in row 2 (the candidate formats cleanly).
- Row 4 (`-D warnings`) is stricter than the candidate's gate; the lints are pre-existing style issues (`payments.rs:769/1516/1777`, `customers.rs:301/330`, `access.rs:166`, `phase3_reliability_tests.rs:561/708`), not Phase 5 security defects (P5-ADV-011, Informational).
- The 12 audit-added tests live only in an isolated copy; the pristine candidate lib has 228 tests (221 + 7 ignored). The crash test (row 5) is the candidate's unchanged test.
- The full suite (row 1) was executed on the pristine candidate **before** any audit tests were appended.

---

## 11. Findings ranked by severity

| ID | Severity | Area | Title | Reproduced |
|---|---|---|---|---|
| P5-ADV-001 | **High** | A | Owner-resolution command has no brute-force lockout; grants unlocked Owner session | Yes (`audit_a1`) |
| P5-ADV-002 | Medium | E | Existing `verify:replication` governance gate fails on candidate (schema 12 / sidecar-reset assertions) | Yes (exit 1) |
| P5-ADV-003 | Medium | D | Financial-integrity verification is test-only; not enforced at production restore | Source + repros |
| P5-ADV-004 | Medium | D | Verifier misses deleted credit-sale entry (outstanding understated) | Yes (`audit_d1`) |
| P5-ADV-005 | Medium | D | Verifier misses tampered repayment/opening_due credit entry | Yes (`audit_d2`) |
| P5-ADV-006 | Medium | D | Verifier misses balanced ledger tamper vs invoice total | Yes (`audit_d3`) |
| P5-ADV-007 | Medium | D | Verifier misses duplicated balanced retail journal | Yes (`audit_d4`) |
| P5-ADV-008 | Medium | B | Unfenced metadata (`workspace_access`, `local_recovery_identity`) writable while fenced (bounded) | Yes (`audit_b1`) |
| P5-ADV-009 | Medium | E | Cloud in-memory dedup cross-generation vs Postgres per-generation | In-memory executed; Postgres source-only |
| P5-ADV-010 | Low | F | `owner_token`/`generation` format not validated | Source-only |
| P5-ADV-011 | Informational | — | `clippy -D warnings` style lints (pre-existing); plain gate passes | Yes (exit 101) |

Full detail (file/function, code path, attack scenario, expected invariant, observed behavior, impact, remediation, evidence references) is in [`phase5-adversarial-findings.json`](./phase5-adversarial-findings.json).

---

## 12. Unverified claims and environmental limitations

- **Tauri desktop runtime: NOT VERIFIED.** The desktop crate was not compiled (offline limitation). Authorization is verified at the Rust boundary and by static dispatch/permission/capability/build-manifest tracing; a governance test is **not** treated as proof of runtime authorization. A real desktop build is required to confirm the command surface end-to-end.
- **Windows: NOT VERIFIED.** All execution is Linux; no Windows behavior is claimed.
- **Cloud Postgres durable path: NOT VERIFIED by execution.** No Postgres instance; `postgres.ts` dedup/sequence/rotation logic is source-inspected. The in-memory reference path was executed (probe). P5-ADV-009 requires production-path verification.
- **End-to-end silent financial corruption via restore: NOT demonstrated.** P5-ADV-003 is a verification-gap finding; the audit did not produce a malicious backup that restores to invalid financial state (schema validation + write-time triggers constrain this).
- **Prior claims re-checked:** the candidate's claimed `221/0/7 + 7/0`, fmt/clippy exit 0 were independently reproduced. The candidate's claim of passing governance does **not** extend to `verify:replication`, which fails (P5-ADV-002).

**Classification legend:** IMPLEMENTED (source present) · COMPILED (builds) · TESTED (candidate tests pass) · INDEPENDENTLY VERIFIED (audit-executed evidence) · NOT VERIFIED (insufficient evidence) · FAILED (invariant violated). Passing candidate tests alone never qualify as independent verification.

---

## 13. Remediation priorities

1. **(Blocker, P5-ADV-001)** Add the persistent lockout to `resolve_interrupted`: increment global + principal `failed_attempts`, set `retry_after` at the threshold, and audit failed resolution attempts — mirroring `login_at`. Add a regression test asserting lockout engages through the resolution path.
2. **(Blocker, P5-ADV-002)** Update `scripts/verify-replication.mjs` to the v13 reality (schema 13; sidecar reset removed) **without weakening assertions** — replace stale expectations with correct v13 invariants, and make `npm run verify:replication` pass.
3. **(Blocker, P5-ADV-003/004/005/006/007)** Enforce financial-invariant verification at the production restore boundary (promote a hardened verifier out of `#[cfg(test)]`), and close the false negatives: require a credit entry per credit sale; cross-check all credit kinds against the customer journal; reconcile ledger legs to invoice totals; add a duplicate-journal check (and a `UNIQUE` guard) for `local_retail_journal`.
4. **(P5-ADV-008)** Extend fencing/immutability to `local_recovery_identity` and `workspace_access`, or document and bound the metadata trust model; cross-check generation consistency.
5. **(P5-ADV-009)** Verify and align cloud dedup semantics across in-memory and Postgres paths for post-restore re-publication; confirm projection idempotency for journals/credits.
6. **(P5-ADV-010/011)** Validate token/generation format; optionally address clippy style lints.
7. **(Verification)** Compile and exercise the Tauri desktop build (and Windows) to convert NOT VERIFIED authorization/crash claims into independently verified evidence.

---

## 14. Final decision

**NO-GO.**

- **Independently verified invariants (executed):** 12 — business-table fence blocks session-less raw SQL; no dual live ownership at startup; pre-commit crash retains original data; completed-crash is the sole success point; startup rejects unknown audit action, two live ops, fence-on-terminal, completed-without-generation, and business substitution; normal login lockout intact; cloud same-generation idempotent dedup, payload-reuse CONFLICT, and STALE_GENERATION fencing.
- **Failed invariants:** 3 — authentication lockout on the resolution path (P5-ADV-001); production financial-integrity enforcement (P5-ADV-003); existing replication governance gate (P5-ADV-002).
- **Ownership fencing of business data, crash consistency, and fail-closed startup reconciliation are sound** and are not the basis for NO-GO. The decision is driven by the authentication-safeguard breach, the broken required governance gate, and the absence of production financial-integrity verification with reproduced detector false negatives.

The candidate implementation and all prior evidence are preserved unchanged; this audit added only the two deliverables and the evidence directory. `main` remained untouched at `1cc5c798d1eada9a16463213b0776c01e99d36f9`.
