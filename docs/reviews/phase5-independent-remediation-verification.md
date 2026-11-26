# Sornio — Phase 5 Independent Remediation Verification & Release Gate

**Verification date (UTC):** 2026-11-26
**Repository:** `uddieee33-blip/Sornio`
**Branch:** `arena/76ac88ca-sornio`
**Exactly verified commit:** `d79a6e89fd7590c2806efd2d9bd2d46d3dada537`
**Original candidate:** `7f73ef0a64c81d4d87cc983c8d410d390e01d04c`
**Previous audit:** `5ab3a966219252c9e8cef1d3aa52829be72cafd4`
**`main` baseline:** `1cc5c798d1eada9a16463213b0776c01e99d36f9` — **untouched (local and remote), not merged**

## FINAL VERDICT: **NO-GO**

Two independent grounds:

1. **A finding reported as FIXED is only partially fixed.** `P5-ADV-007`'s exact original attack scenario — duplication of a retail operation's postings double-counting cash/revenue while staying zero-sum — **still succeeds end-to-end through the production restore boundary** for SALE operations. Reproduced with the production verifier returning `Ok(())` and a real restore returning `Ok(...)`.
2. **Required Windows acceptance evidence is absent and cannot be produced here.** No Windows host, no emulation, no MSVC/mingw toolchain, no reachable toolchain host.

Significant credit where due: the High-severity authentication defect is genuinely fixed, and the cloud deduplication fix is now **verified against a real PostgreSQL 16.2 server** — the durable path is **no longer BLOCKED**.

---

## 1. Method and independence

The author's report, counts and conclusions were **not** trusted. Everything below was re-executed.

* Clean export of the exact commit: `git archive d79a6e8… | tar -x`. The author's working directory was never used.
* **Three** separate trees, each with its **own** `CARGO_TARGET_DIR`:
  * `pristine` — byte-exact `d79a6e8`, no additions → authoritative gate counts.
  * `workspace` — `d79a6e8` + the verifier's own test modules → independent reproductions.
  * `candidate` — byte-exact `7f73ef0` → attack reproduction and defect proof.
* All tests were **written independently** by the verifier. The author's fixtures were used only to *create valid business history*; corruption was injected with the verifier's own SQL.
* Production code in `workspace` vs `pristine` differs **only** by added `#[cfg(test)] mod` declarations (verified by `diff`). No production line was altered.

**Evidence-integrity incident caught and corrected:** an early run shared one `CARGO_TARGET_DIR` across candidate and remediation. Cargo reused the candidate's test binary (`Finished in 0.04s`), making both trees report identical results. This was detected, discarded, and re-run with isolated target directories. Any conclusion drawn from that run would have been false.

**Superseded runs:** a batch executed in `workspace` was invalidated when the verifier wired an extra probe mid-run (compile errors in the *verifier's* code, and `fmt` flagging the *verifier's* unformatted tests). These are retained under `superseded/` with an explanatory README and are **not** counted as product failures.

---

## 2. Diff scope

`7f73ef0 → d79a6e8`, implementation only: **10 files, 1265 insertions, 28 deletions**.
The audit commit `5ab3a96` modified **no** implementation file (empty diff), confirming the audit did not alter the candidate.

---

## 3. RULE 2 — Recovery authentication (P5-ADV-001): **FIXED, independently verified**

Six independent tests drive the **production public API** `Workspace::resolve_interrupted_recovery` — the exact function the Tauri command calls — not the author's clock-injected helper. Real wall clock, real transactions, real restarts.

| Test | Candidate `7f73ef0` | Remediation `d79a6e8` |
|---|---|---|
| IV001 40 wrong passwords | `rate_limited=0, attempts=0` → **ATTACK SUCCEEDS** | `rate_limited=36, attempts=5, retry` set |
| IV002 correct password during lockout | **`Ok(())` — access granted** | `Err(RateLimited)` |
| IV003 restart persistence | budget `(0,0)` — nothing to persist | `(5, t)` **identical after reopen** |
| IV004 shared budget with login | budget `(0,0)` after 3 failures | `(3,0)` after 3 recovery failures; 5 login failures → `(5,t)`; correct login then `RateLimited` |
| IV005 32 concurrent attempts | `rate_limited=0` → **ATTACK SUCCEEDS** | `rate_limited=28`, budget capped at **5** |
| IV006 business access while locked | n/a (no lockout) | write rejected: *"Sornio recovery is in progress; business writes are paused"*; login `RecoveryActive` |

**Candidate: 0 passed / 6 failed. Remediation: 6 passed / 0 failed.**

Transaction-boundary verification: the policy was compared line-by-line against `access::login_at`. Both use the same `workspace_access` budget, the same `min(5)` cap, the same `+60s` deadline and the same reset-after-expiry rule. Failure accounting is **explicitly committed** inside the `IMMEDIATE` transaction, which is why it survives both restart and concurrency. IV004 proves the allowance is genuinely shared — alternating paths cannot multiply it. IV006's assertion was hardened after an initial version failed for a schema reason rather than the fence; it now asserts the rejection message is the fence.

**No second, weaker password policy exists.** Status: **FIXED**.

---

## 4. RULE 3 — Financial integrity: **partially fixed; one residual gap**

Eleven independent tests, plus a dedicated end-to-end probe.

### Original four scenarios — all reproduced as detected

| Scenario | Verifier output |
|---|---|
| 1. Deleted credit-sale entry | `credit sale missing matching credit entry`, `customer outstanding is negative` |
| 2. Tampered repayment | `credit entry disagrees with customer journal` |
| 3. Balanced-but-wrong ledger | `invoice settlement leg disagrees with invoice`, `invoice revenue disagrees with invoice subtotal` — **ledger SUM confirmed still 0** |
| 4. Duplicated retail journal | **see residual gap below** |

### Additional realistic corruptions — all detected

Missing postings entirely; broken stock arithmetic (`after ≠ before − qty`); negative stock; orphan retail journal operation with no backing activity.

**Defense-in-depth observed:** `CHECK(after_milli=before_milli-quantity_milli)`, `CHECK(stock_milli>=0)` and `UNIQUE(sequence)` block these corruptions through ordinary SQL. They were injected by rebuilding tables without constraints, emulating genuine on-disk damage. The verifier is a real second layer.

### False-positive guard — passes

A legitimate two-part refund produces **2** repeated `(operation_id, account)` groups and is **accepted**. The author's decision to reject a blanket `UNIQUE(operation_id, account)` is correct.

### Production boundary — verified

* Restore invokes `financial::verify(&tx)` **inside the single IMMEDIATE transaction**, after `integrity()` and **before** the completion transition (confirmed in the diff).
* A corrupt backup is rejected with `FinancialInconsistency`; the original database is intact (**2 invoices preserved**, later sale retained) and **no fence is left behind**.
* A healthy backup still restores and the restored database is financially clean.
* Corruption was injected **before export** so the archive digest matches — proving the *financial* gate rejects it, not the digest check.

### 🔴 NEW DEFECT IV-NEW-001 — duplicated retail **SALE** journal is accepted (Medium)

The author's regression test duplicates a **RETURN** operation, which is caught by the return-totals comparison. Duplicating a **SALE** operation is not caught by any check.

Measured on the remediation build:

```
account totals BEFORE: [("cash", 4250), ("receivables", -4250)]
account totals AFTER : [("cash", 8500), ("receivables", -8500)]
operation still zero-sum: 0
backing activity rows: 1
PRODUCTION VERIFIER violations: []
PRODUCTION verify() => Ok(())
PRODUCTION RESTORE of duplicated-sale-journal backup => Ok("…sornio-before-restore-….sorniobackup")
fence after restore attempt: false
RESULT: RESIDUAL GAP CONFIRMED
```

This is precisely `P5-ADV-007`'s recorded scenario and expected invariant:

> *attack_scenario:* "On-disk duplication of a retail operation's postings double-counts revenue/cash while remaining zero-sum; the verifier reports clean."
> *expected_invariant:* "Journal postings must be unique per operation/account; duplication must be detected."

Duplication is reachable via `INSERT` (permitted by the append-only triggers) with fresh `sequence` values. **`P5-ADV-007` must be downgraded from FIXED to STILL OPEN (partially fixed).**

**Recommended fix:** validate retail **sale** journal legs relationally against the operation's recorded payments/activity amounts — mirroring the existing return check — rather than relying on zero-sum plus activity existence. A blanket uniqueness rule remains wrong because valid multi-part returns repeat accounts.

---

## 5. RULE 4 — Cloud deduplication: **FIXED, durable path now VERIFIED**

### PostgreSQL provisioning — succeeded

The previous pass marked this BLOCKED. A **real disposable PostgreSQL 16.2** was provisioned from PyPI `pgserver` binaries (`initdb` → `postgres` on `127.0.0.1:55432`, database `sornio_verify`, `fsync=on`). No production credentials or data. A fresh database was created for every run because the migration is **not idempotent** (`42P07` on re-apply) — itself worth noting operationally.

Real `pg` client, real migration SQL, real transactions, real parallel connections. **No mocks.**

### Durable results — 36 / 36 passed, exit 0

Cross-generation duplicates return `duplicate:true` with the **original** cursor; duplicates advance the new generation's head; the first **new** post-restore operation is accepted (no `GAP`); outstanding is **not** double-counted; per-generation acks exist and point at the original cursor; exactly **one** event row per operation; stale generation fenced; conflicting payload → `CONFLICT`; publisher credentials cannot read snapshots (`FORBIDDEN`).

**Concurrency (4 parallel connections):**
* Duplicate ingestion: all 4 succeed, all `duplicate:true`, same cursor, **1** event row, outstanding unchanged.
* Racing distinct operations for the same next sequence: **exactly one** commits, three fail `DUPLICATE_SEQUENCE`, head advances **exactly once**, **1** event row.

**Rollback:** a rejected `GAP` ingest leaves **no** partial event row, **no** partial ack row, head unchanged, and the connection is not left in an aborted transaction.

### Defect proven on the candidate against the same real server

Full ordered outbox replay (what a real sidecar reset does):

| Build | Replay acks | Outstanding | Duplicate event rows |
|---|---|---|---|
| Candidate `7f73ef0` | all `duplicate:false` | **5000 → 10000 (DOUBLED)** | `rp-bill`, `rp-cred`, `rp-cust`, `rp-prod` each ×2 |
| Remediation `d79a6e8` | all `duplicate:true`, original cursors | **5000 → 5000** | none |

The author's double-counting claim is **confirmed on real PostgreSQL**, and the fix demonstrably eliminates it.

### In-memory contract — 18 / 18 passed

All nine documented clauses independently exercised, including delayed-ack retry idempotence, cursor stability, `CONFLICT`, `STALE_GENERATION`, head advancement, and full-replay idempotence.

**Status: FIXED.** The durable path is **verified by execution**, superseding the previous BLOCKED status and the source-text-only assertion.

---

## 6. RULE 5 — Replication governance: **FIXED, independently verified**

`node scripts/verify-replication.mjs` → **129 checks passed, exit 0**.

Assertion-intent audit of the harness diff: **exactly two** assertions removed, both obsolete —
`financial schema remains 12` and `desktop restore discards sidecar acks` (presence of `reset_sidecar_file`). **25 added**, including v13 schema pin, `migrate_v13`/`reconcile_startup` wiring, inverted sidecar-deletion absence, generation-keyed reset, fencing and financial-gate checks.

The nine new dedup checks are **genuinely behavioral** (duplicate flags, outstanding equality, cursor stability, `expectCode('CONFLICT')`), plus two source-text checks for the Postgres key shape. Those two source-text checks are now **superseded by the real PostgreSQL execution** in §5. Overall the harness mixes behavioral assertions with 18 source-text governance checks; the security and compatibility intent of every removed assertion is preserved by a meaningful v13 equivalent. **No bypass.**

---

## 7. RULE 6 — The three outstanding findings

### P5-ADV-008 — unfenced metadata writable while fenced: **CONFIRMED, bounded**

Reproduced with a live fence:

```
business write while fenced      => Err (fenced)      ← positive control
lockout reset while fenced       => Ok(1), budget (0,0)
generation tamper while fenced   => Ok(1)
business_id substitution         => Ok(1)
```

Realistic scenario established: a writer holding the SQLCipher key erases the lockout and resumes guessing — measured **4 further guesses** admitted before re-lockout, repeatably.

**Bounding verified independently:** `Store::open` after business substitution returns **`RecoveryCorrupt`** — fail-closed at open, even earlier than `reconcile_startup`. And of **50** Tauri commands, **none** accepts raw SQL; no `execute_batch` is reachable from the desktop adapter. The attack therefore requires key/file possession, which is outside the app's exposed surface.

**Recommendation: ACCEPT with documented rationale, tracked.** Not a release blocker on its own, but it does weaken the P5-ADV-001 guarantee against a key-holding attacker and must be stated explicitly in the threat model. Do **not** fence `workspace_access` naively — that would break the shared login path the authentication fix depends on.

### P5-ADV-010 — token/generation format unvalidated: **PARTIALLY CONFIRMED, partially falsified**

* **Generation: confirmed.** `reconcile_startup` returns `Ok(())` for `"short"`, `"zzzz"`, `"'; DROP TABLE x; --"` and `""`. No format validation.
* **`owner_token`: falsified as written.** Tampering is blocked at write time by existing triggers — *"recovery fence is immutable while active"* and *"recovery operation identity is immutable"*. The token cannot be rewritten through SQL while the fence is live.

**Recommendation: FIX (small).** Add 64-hex validation for `generation` at admission and reconciliation, consistent with the backup-manifest path which already validates it. Low severity; values are parameterised so the injection string is not executable. Not a release blocker.

### P5-ADV-011 — clippy style lints: **CONFIRMED, pre-existing**

Plain `cargo clippy --all-targets` → **exit 0**, 17 lib warnings + 2 test-only. `-D warnings` → **exit 101**. **Zero** warnings originate in remediation files (`financial.rs`, `financial_tests.rs`, `remediation_tests.rs`). Categories are style-only: needless borrow (11), too-many-arguments (4), complex type, redundant pattern matching, manual range contains.

**Recommendation: ACCEPT.** The plain gate is the project's gate; this is pre-existing repo-wide debt, not a remediation regression.

---

## 8. RULE 7 — Complete test ledger

Authoritative gates run on **`pristine`** (exact `d79a6e8`, no verifier additions).
Cargo manifest: `--locked --manifest-path packages/local-store/Cargo.toml`.
Toolchain: rustc/cargo 1.100.0, Node v22.22.3, TypeScript 6.0.3, PostgreSQL 16.2.

| Gate | Command | Result | Exit |
|---|---|---|---|
| Complete Rust suite | `cargo test --all-targets` | **237 / 0 / 7** (381.35s) + example **7 / 0** (9.77s) | **0** |
| Security governance | `cargo test --example cashier_review_bridge` | 7 / 0 | 0 |
| Migration | `cargo test --lib migrat` | 14 / 0 | 0 |
| Recovery | `cargo test --lib recovery::` | 59 / 0 / 3 | 0 |
| Financial corruption (author) | `cargo test --lib recovery::financial::financial_tests` | 10 / 0 | 0 |
| Auth remediation (author) | `cargo test --lib recovery::remediation_tests` | 6 / 0 | 0 |
| Five-phase crash consistency | `cargo test --lib …crash_at_every_transition_is_fail_closed_and_consistent -- --exact` | 1 / 0 (24.03s) | 0 |
| Formatting | `cargo fmt --check` | clean | 0 |
| Clippy (plain gate) | `cargo clippy --all-targets` | 17 pre-existing, 0 new | 0 |
| Clippy strict | `cargo clippy --all-targets -- -D warnings` | pre-existing style lints | 101 |
| Replication governance | `node scripts/verify-replication.mjs` | **129 checks** | 0 |
| Cloud typecheck (project) | `tsc --noEmit -p packages/mobile-contracts/tsconfig.json` | clean | 0 |
| Cloud typecheck (strict emit) | `tsc --strict` (replication-cloud + mobile-contracts) | clean | 0 |
| Cloud behavioral (independent) | `node cloud-behavioral-verify.mjs` | **18 / 18** | 0 |
| **Durable PostgreSQL (independent)** | `node pg-durable-verify.mjs` | **36 / 36** | **0** |

**Independent reproductions** (workspace = commit + verifier tests):

| Suite | Result | Exit |
|---|---|---|
| IV001–IV006 auth, remediation | 6 / 0 | 0 |
| IV001–IV006 auth, **candidate** | **0 / 6 — attacks succeed** | 101 |
| IVF01–IVF11 financial | 11 / 0 | 0 |
| IVX01 duplicated-sale-journal probe | 1 / 0 (**gap confirmed**) | 0 |
| IVP008/010 open-findings probe | 4 / 0 | 0 |
| Augmented full suite | 255 / 0 / 7 + 7 / 0 | 0 |

The author's headline claim of **237 / 0 / 7 + 7 / 0** is **exactly reproduced**. Test counts are genuine; no test was deleted or weakened.

---

## 9. RULE 8 — Windows acceptance: **NOT PERFORMED — RELEASE BLOCKER**

Exhaustive availability probe:

* Host: Debian GNU/Linux 12, kernel 6.1.158+, x86_64.
* `/mnt/c`, `WSLInterop`, `/cygdrive`: **absent**.
* `powershell.exe`, `cmd.exe`, `wsl.exe`, `wine`, `wine64`, `qemu-system-x86_64`, `vagrant`: **missing**.
* `x86_64-w64-mingw32-gcc`, `link.exe`, `cl.exe`: **missing**. No Windows Rust target installed.
* `cargo-tauri` missing; `webkit2gtk` missing (a Linux Tauri build is also unavailable).
* `static.rust-lang.org` unreachable — a Windows toolchain cannot be fetched.

**No Windows 10/11 machine is available.** None of the eight required Windows checks (native Tauri build, command registration, Owner authentication, locked-state review, restore rejection on corruption, successful restore, restart after interrupted recovery, install/upgrade compatibility) could be executed.

**Linux results are explicitly NOT substituted for Windows acceptance.** This remains a hard release blocker.

---

## 10. Remaining release blockers

1. **IV-NEW-001 (Medium) — duplicated retail SALE journal accepted by the production restore boundary.** `P5-ADV-007` is only partially fixed and must be re-opened.
2. **Windows acceptance — entirely unperformed**, and not performable in this environment.
3. **P5-ADV-008 (Medium)** — confirmed; accept only with an explicit, documented threat-model statement acknowledging that a key-holding attacker can reset the lockout.
4. **P5-ADV-010 (Low)** — generation format unvalidated; small fix recommended.
5. **P5-ADV-011 (Informational)** — pre-existing style debt; accept.
6. **Migration idempotency** — `applyReplicationMigration` fails `42P07` on re-apply; operational note for deployment tooling.

### Resolved since the previous pass

* **Durable PostgreSQL is no longer BLOCKED** — 36/36 assertions on a real PostgreSQL 16.2 server, including concurrency and rollback.
* **P5-ADV-001 (High)** — independently verified fixed at the production API, including restart and concurrency.
* **P5-ADV-002, 003, 004, 005, 006, 009** — independently verified fixed.

---

## 11. Verdict rationale

**NO-GO.** The remediation is substantially genuine: the High-severity authentication bypass is closed, the cloud deduplication defect is fixed and now proven on a real database, and the headline test counts are honest and reproducible. But a financial-integrity finding claimed FIXED still admits its own original attack scenario through the production restore path, and the mandatory Windows acceptance evidence does not exist. Under the stated gate — *"any critical financial-integrity defect remains, or required acceptance evidence is insufficient"* — this cannot be released.

A re-review should require: the sale-journal relational check with an executable regression, a completed Windows acceptance run, and an explicit documented decision on P5-ADV-008.

**`main` remains at `1cc5c798`. Nothing was merged. The original audit and remediation reports are preserved unmodified.**
