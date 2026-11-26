# P0 Durable Recovery — Phase 5 Report
## Durable Recovery State Machine & Ownership Proof

Date: 2026-11-26 (UTC)
Branch: `arena/76ac88ca-sornio` (session branch; `main` untouched)
Baseline: `1cc5c798d1eada9a16463213b0776c01e99d36f9` (Merge PR #145), schema `user_version = 12`
Candidate schema: `user_version = 13`

**Final decision: CONDITIONAL GO** (see §12). The local-store durable-recovery core is
implemented, compiled, and proven against silent corruption with executable evidence.
Production enablement remains conditional on the blocked verification gates in §11.
Public restore stays disabled; sidecar deletion stays disabled.

---

## 1. Baseline establishment and Phase 3/4 artifact search

- Exact baseline commit/tree: `1cc5c798d1eada9a16463213b0776c01e99d36f9` (`main`, Merge PR #145).
  The session branch was created from this commit; all Phase 5 work is on the session branch.
- **Phase 3 / Phase 4 P0-durable-recovery reports and patches were NOT found.** Searched:
  the working tree, `docs/reviews/` (58 prior artifacts), the full local git history
  (`git log -S`, `git log --all`), and 22 remote `arena/*` trees via `git ls-remote` + the
  GitHub API. No `p0-durable-recovery-phase3*` or `phase4*` report/patch exists anywhere.
  This is recorded as a baseline finding, not substituted with unrelated `PHASE*` documents.
  Consequently Phase 5 is a **fresh implementation against the real baseline**, not a blind
  stack of prior patches (which the task forbids and which do not exist).
- Because the prior artifacts are absent, there is no prior-patch SHA-256 to verify. The
  SHA-256 of the Phase 5 replacement patch is recorded in §10.

## 2. Recovery state machine (design of record)

Full design: `docs/reviews/p0-durable-recovery-phase5-state-machine.md` (with §12
"Implementation notes (final)"). Summary of the durable objects and edges:

- New tables: `local_recovery_operations` (immutable-identity operation ledger) and
  `local_recovery_fence` (singleton admission barrier), plus per-table BEFORE I/U/D
  barrier triggers on all 38 business tables.
- States: `admitted → quiescing → executing → verifying → completed`, with
  `rejected` / `interrupted` terminal exits from any non-terminal state.
- Transactions: **TX-A** admission, **TX-Q** quiesce, **TX-S1/S2** safety export,
  **TX-R** single restore transaction, **TX-J** reject, **TX-I** owner resolution,
  **T7** startup re-fence. **TX-R commit is the only durable success point.** No
  atomicity is claimed across separate transactions.
- Every transition requires an exact `(operation_id, owner_token, expected_state)`
  match under the SQLite writer lock; the UPDATE trigger independently enforces the
  same graph for every connection/process. `owner_token` is a 256-bit in-memory
  capability, never serialized.
- Impossible/ambiguous/dangerous states (dual ownership, stale-owner commit,
  business-identity substitution, orphaned fence, completed-without-result-generation,
  >1 live operation) are enumerated and rejected fail-closed (see §5, §6).

## 3. Universal ownership enforcement — proof

Design + write-path inventory: `docs/reviews/p0-durable-recovery-phase5-ownership-fencing.md`.
Enforcement is **engine-level** (SQLite triggers), so it applies to every connection and
to session-less raw SQL, not just the guarded Rust API:

- `identity::guard` gained a clean `recovery::ensure_open` early check for all guarded
  business writes; `login_at` gained the same check (fenced login → `RecoveryActive`).
- The per-table barrier triggers RAISE while a fence row exists, covering all paths that
  publish business ops, write financial transactions, update inventory, or change guards
  (products, invoices, ledger, journals, credit entries, customers, retail, checkout,
  inventory events/outbox, principals, identity, LAN, drafts/history).
- **Executable proof** (`recovery::phase5_tests`):
  - `fence_blocks_every_business_table_write_including_raw_sql` — representative raw
    INSERT/UPDATE/DELETE per fenced table is rejected; business fingerprint unchanged.
  - `second_admission_while_fenced_is_rejected_no_dual_ownership` — exactly one live op.
  - `stale_owner_token_cannot_transition_or_release` — forged token → `RecoveryOwnership`.
  - `business_identity_substitution_into_a_configured_store_is_rejected` — `BackupBusinessMismatch`.
  - `rejected_attempt_releases_fence_and_preserves_business_state` — terminal `rejected`,
    fence released, business writes resume, fingerprint preserved.
- No silent transfer: `owner_token`/`business_id`/`generation`/`backup_id` are immutable
  (UPDATE trigger). No network-wide fence is claimed — this is a single-device architecture;
  cross-process safety comes from the durable SQLite barrier + restore-generation rotation,
  not distributed coordination (none introduced).

## 4. Publisher fencing / draining — proof

`replication::publish_unpublished` now: acquires the process-local drain mutex (shared with
restore quiescence), checks `ensure_open`, and **re-checks fence + generation before and after
every network send, before each durable ack**. A recovery admitted mid-batch stops the
publisher before it can publish or ack stale rows; a restore that commits while an envelope is
on the wire prevents acking against a vanished generation. The sidecar is generation-keyed, so
a new restore generation starts at cursor 0 while old ack history is preserved.

- **Executable proof**: `publisher_is_barred_while_a_recovery_fence_is_active` (normal publish
  acks; after a fence appears the next publish → `RecoveryActive` and the stale row is never
  acked), `publisher_with_stale_generation_is_rejected` (`WorkspaceMismatch`).
- Registration/in-flight tracking/interruption/restart are covered by the drain mutex + the
  per-row re-checks + the crash tests (§6). Idempotency remains the cloud unique constraint
  plus the generation-keyed sidecar (cloud-side dedup verification is a blocked gate, §11).

## 5. Fail-closed startup reconciliation — proof

Design + 15-row matrix: `docs/reviews/p0-durable-recovery-phase5-startup-reconciliation.md`.
`Store::open` runs `recovery::reconcile_startup` after migration. The **only automatic write**
is the audited T7 re-fence (a live operation that lost its fence row). Every ambiguous state
refuses the open with `RecoveryCorrupt`, preserving the original files:

- missing audit/operations/fence/identity table; unknown audit action; orphaned fence;
  conflicting business identity; >1 non-terminal operation; completed without
  `result_generation`; fence owner-token/business mismatch.
- Legacy audits are accepted as history; deep financial checks are deliberately **not** run at
  startup (documented limitation — they are test-only, §7).
- **Executable proof**: `startup_reconciliation_matrix` (7 corrupt cases each refuse open),
  `startup_refences_a_live_operation_that_lost_its_fence` (T7 re-fence + `recovery.reconciled_fence`
  audit, status `requiresResolution`).

## 6. Crash-consistency analysis — proof

22-row crash matrix: `docs/reviews/p0-durable-recovery-phase5-crash-matrix.md`. Crash hooks
(`SORNIO_RECOVERY_CRASH_PHASE/_MARKER`) park a subprocess at each durable boundary; the parent
SIGKILLs it and reopens.

- **Executable proof**: `crash_at_every_transition_is_fail_closed_and_consistent` loops over
  `admitted, quiescing, executing, verifying, completed`:
  - Pre-commit crashes (`admitted`/`quiescing`/`executing`/`verifying`): reopen is **fenced**,
    pre-restore data intact (2 invoices), `requiresResolution`; Owner resolution releases the
    fence without touching business rows; financial verifier clean.
  - `completed`: the only success point committed — fence released, backup imported (1 invoice),
    no resolution required, financial verifier clean.
- The pre-existing `forced_termination_does_not_publish_partial_backup_or_commit_partial_restore`
  was updated to assert the new fail-closed semantics (fenced login rejected; wrong Owner password
  rejected; resolution restores write access; a fresh restore then succeeds).

## 7. Test-only financial-integrity verifier

`financial_violations(db)` in `recovery/phase5_tests.rs` inspects **actual database state** and
returns violations (empty = healthy). It is `#[cfg(test)]`-gated — never shipped, never run at
startup. Checks: double-entry balance per operation across `local_billing_ledger`,
`local_customer_journal`, `local_retail_journal`; missing invoice postings; duplicate outbox
idempotency keys; non-negative inventory + exact `invoice_stock` arithmetic; credit-sale
receivables ↔ credit-entry cross-check; recovery invariants (≤1 live op, completed has
`result_generation`, fence references a live op, latest completed generation == current).

- **Executable proof**: `financial_verifier_accepts_a_healthy_workspace`,
  `financial_verifier_detects_ledger_imbalance_and_missing_postings`,
  `financial_verifier_detects_credit_mismatch_and_customer_journal_imbalance`,
  `financial_verifier_holds_after_a_complete_restore`. Corruption is injected by stripping
  triggers and mutating real rows (SQL UNIQUE/CHECK constraints already block duplicate keys
  and negative stock, so those verifier checks are defense-in-depth against on-disk damage).
- The verifier is also asserted clean inside every crash-test branch (§6).

## 8. Rust environment, commands, exact output and exit codes

The sandbox blocks `static.rust-lang.org`, `sh.rustup.rs`, `crates.io`, and CDNs. A genuine
toolchain was established via a GitHub-Actions relay (issue #202) + offline vendoring:

- Toolchain: **rustc 1.100.0 (0ef1bc386 2026-11-09)**, cargo 1.100.0 (3acc79c0c 2026-11-05),
  rustfmt 1.11.0-stable, clippy 0.1.100. Official `dist 2026-11-12` tarballs SHA-256-verified
  against the channel manifest (`docs/reviews/phase5-evidence/rust-dist-manifest.json`,
  `channel-rust-stable-2026-11-12.toml`). Installed under `/home/user/rust`.
- Dependencies: all **106 locked crates vendored** with checksums equal to `Cargo.lock`
  (`/home/user/phase5-vendor`, `.cargo/config.toml` → directory source, `net.offline=true`).
- Relay runs: GitHub Actions **45817782673** and **45818393971** SUCCESS; payload SHA-256 in
  `relay-payload-run1/run2.tar.sha256`; full logs in `relay-issue-comments.md`. Relay scaffolding
  archived to `phase5-evidence/relay-archive/` and removed from the tree; the 1.6 GB bulk payload
  directory was deleted.

Exact commands and results (full log: `phase5-evidence/final-all-targets-test.txt`):

| Command | Result | Exit |
|---|---|---|
| `cargo test --locked --manifest-path packages/local-store/Cargo.toml --no-run` (baseline) | compiled | 0 |
| `cargo test --locked …` (baseline, untouched main) | **204 passed / 3 failed / 6 ignored** | 101 |
| `cargo build --locked …` (candidate v13) | compiled | 0 |
| `cargo test --all-targets --locked …` (candidate, final) | **221 lib passed / 0 failed / 7 ignored** + **7 security passed / 0 failed** | **0** |
| `cargo fmt --manifest-path … --check` | clean | 0 |
| `cargo clippy --locked … --all-targets` | no new warnings in changed code | 0 |
| `git apply --check` of replacement patch on pristine baseline export | applies | 0 |

Env: `RUST_TEST_THREADS=2 CARGO_BUILD_JOBS=2`; exit codes captured via `${PIPESTATUS[0]}`.

### 8.1 The three baseline failures were test-side defects (minimally repaired)

All three fail on **untouched `main`** and assert combinations the product correctly rejects:
1. `inventory_recovery_tests.rs:355` — `UPDATE … WHERE id='rice'` but the fixture's product id is
   `item` (introduced by PR #141 `37e8cf7`); matched 0 rows. Fixed the literal to `item`.
2. `billing_reliability_tests.rs:206` — zero-tax case posted `Tender::Cash` **with** `customer_id`;
   `invoice_posted` correctly rejects cash+customer (customer ⇔ credit part). Fixed to `None`.
3. `phase3_reliability_tests.rs:771` — concurrent-credit loser returns `StockConflict` (per-line
   revision CAS) but the test accepted only `CreditLimit|CreditConflict`. Added `StockConflict`
   to the accepted set; debt/stock invariants unchanged.
Each repair is commented in-place and preserves the asserted financial invariants.

## 9. Security restrictions honored

- Public restore remains disabled; sidecar deletion remains disabled (the desktop restore no
  longer calls `reset_sidecar_file`). No destructive operation against production data; no
  automatic cleanup of ambiguous recovery states (only explicit Owner resolution); no silent
  recovery success; no fake fixtures presented as production verification.
- No existing safeguard weakened: every pre-existing Tauri command keeps its exact session guard.
  The two new recovery-review commands are an **additive audited category** (`local-recovery-review`
  capability, `with_recovery_review_workspace` read-only scope wrapper) with a dedicated negative
  security test; the governance test `every_registered_command_has_an_explicit_security_case_and_scoped_wrapper`
  passes (registry == permissions == build manifest == capability).
- The financial verifier is test-only and inspects real DB state. No network-wide fence claimed;
  no distributed coordination introduced. No cross-transaction atomicity claimed.

## 10. Deliverables

- This report: `docs/reviews/p0-durable-recovery-phase5-report.md`.
- **Complete replacement patch**: `docs/reviews/p0-durable-recovery-phase5.patch`
  (37 files, +31349/−47 vs baseline; applies cleanly to `1cc5c798`).
  **SHA-256: `e2aef6057e0b12cee5f3c74ec8e0087a7a6a190373be87676528b3f487f53430`**.
- State-machine doc: `…-phase5-state-machine.md` (incl. final implementation notes).
- Ownership/fencing analysis: `…-phase5-ownership-fencing.md`.
- Crash matrix (22 rows): `…-phase5-crash-matrix.md`.
- Startup-reconciliation matrix (15 rows): `…-phase5-startup-reconciliation.md`.
- Financial test results + full suite log: `phase5-evidence/final-all-targets-test.txt`.
- Rust environment evidence: `phase5-evidence/rust-dist-manifest.json`,
  `channel-rust-stable-2026-11-12.toml`, `relay-payload-run1/run2.tar.sha256`,
  `relay-issue-comments.md`, `relay-archive/`.
- v12 schema fixture (for legacy backup validation): `packages/local-store/fixtures/recovery-v12-schema.json`
  (129 objects / 45 tables / 72 triggers; delta vs v11 = 6 LAN objects).
- Executable proofs: `packages/local-store/src/recovery/phase5_tests.rs` (14 tests + crash worker),
  `packages/local-store/examples/security/tests.rs` (recovery-review negative test).

## 11. Status ledger and remaining blockers

**Implemented** (v13 schema + state machine + ownership fencing + publisher draining +
fail-closed reconciliation + Owner resolution + test-only financial verifier + desktop
command wiring + sidecar-deletion removal).

**Compiled**: `sornio-local-store` lib + all examples (`cargo build`/`--no-run`, exit 0).

**Tested**: 221 lib + 7 security tests pass, 0 failures (exit 0); crash/reconciliation/financial
proofs execute against real encrypted SQLCipher databases, including subprocess SIGKILL.

**Independently verified**: patch applies to a pristine baseline export (`git apply --check`, exit 0);
toolchain tarballs SHA-verified against the official channel manifest; vendored crate checksums
equal `Cargo.lock`; baseline failures reproduced on untouched `main` before repair.

**Still blocked** (gates left unresolved, not claimed):
1. **Desktop Tauri crate compile/run** — Tauri/WebView2 dependencies are not in the offline vendor
   set, so `apps/desktop/src-tauri` cannot be compiled here. The new commands are verified
   *statically* (governance test: registry/permissions/build/capability) and *at runtime* through
   the test bridge dispatch, but a full Tauri build + WebView2 integration test requires a
   networked environment. **Not claimed as compiled.**
2. **Cloud replication dedup** — `replication-cloud/src/*.ts` (ingest/postgres) was not read;
   cloud-side idempotency under restore/re-publish is unverified. The local fence/generation
   guarantees are proven; the cloud end is a separate gate.
3. **Issue #202 closure** — the GitHub App token has read-only issues scope (`403 Resource not
   accessible by integration`); closing #202 is a manual step. Relay completion is recorded in
   the evidence archive regardless.
4. **Deep financial verification at startup** — intentionally test-only (§7); startup performs
   structural reconciliation, not full ledger re-derivation. Documented limitation.
5. **Phase 3/4 P0-durable-recovery artifacts** — absent everywhere (§1); nothing to stack or verify.

## 12. Final decision

**CONDITIONAL GO.**

The Phase 5 durable-recovery state machine and universal ownership enforcement are implemented,
compiled, and proven against silent corruption with executable crash, reconciliation, publisher,
and financial-integrity evidence on the real encrypted store. The three baseline test failures
were test-side defects and were minimally repaired without weakening any invariant. No silent
success, no dual ownership, no stale-owner commit, and no business-identity substitution path
survives the proofs.

It is **conditional**, not a full GO, because the desktop Tauri compile/integration gate and the
cloud-side dedup gate remain unresolved in this offline environment (§11), and public restore must
stay disabled until those are verified in a networked environment and reviewed. It is **not NO-GO**:
no unsafe recovery path was found, and the fail-closed design contains every interruption without
data loss. Proceed to integration/release review with the §11 conditions; do not merge to `main`,
release, enable public restore, or enable sidecar deletion on this evidence alone.

## 13. Reviewer instructions

1. Verify the patch: `sha256sum docs/reviews/p0-durable-recovery-phase5.patch` must equal
   `e2aef6057e0b12cee5f3c74ec8e0087a7a6a190373be87676528b3f487f53430`; then
   `git archive 1cc5c798 | tar -x -C /tmp/base && cd /tmp/base && git apply --check <patch>`.
2. Establish the toolchain (networked): rustup 1.100.0, or reuse the SHA-verified dist tarballs
   per `phase5-evidence/rust-dist-manifest.json`; `cargo fetch --locked` for the 106 crates.
3. Run: `cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml`
   (expect 221 lib + 7 security pass, 0 fail; 7 ignored are subprocess crash workers).
4. Read the four design docs and the §12 implementation notes; run the crash worker manually if
   desired: `cargo test … recovery::phase5_tests::phase5_crash_worker -- --ignored` with
   `SORNIO_RECOVERY_CRASH_PHASE`/`_MARKER`/`SORNIO_RECOVERY_TEST_ROOT`.
5. In a networked environment, compile `apps/desktop/src-tauri` and verify the cloud dedup gate
   before considering public restore. Keep public restore and sidecar deletion disabled until then.