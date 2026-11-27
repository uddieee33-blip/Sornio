# Sornio — Phase 5 Engineering Acceptance Report

**Scope.** Independent adversarial closure of the Phase 5 durable-recovery, financial-integrity and
replication findings, with executable evidence produced on the machine that wrote the fix.

| Field | Value |
|---|---|
| Repository | `uddieee33-blip/Sornio` |
| Session branch | `arena/475a4866-sornio` |
| Branch base | `1cc5c798d1eada9a16463213b0776c01e99d36f9` (`main`) |
| Verified starting point | `9274ddb8b3977cf52411cbb49c68e191a1c78c6d` (`origin/arena/76ac88ca-sornio`) |
| Requested target commit | `16e0267f8a931ebba4736f2e34ea86341e9f6898` — **absent from GitHub (`HTTP 422`) and from every remote ref** |
| Stage 0 decision | user-selected `proceed_from_9274ddb`: fast-forward the session branch to the verified parent and continue |
| Schema version | 13 (`packages/local-store/src/lib.rs::SCHEMA_VERSION`) |
| Rust toolchain | `rustc`/`cargo` 1.100.0, `rustfmt` 1.11.0-stable, `clippy` 0.1.100 (offline vendored crates, SHA-256 verified against `Cargo.lock`) |
| Node/TS | TypeScript 6.0.3 (`typecheck`), TypeScript native 7.0.2 (`typecheck:native`), Node 22 |
| PostgreSQL | real **16.2** (`pgserver` 0.1.4 install, `initdb` + `pg_ctl`, port 55432) |
| Findings register | `docs/reviews/phase5-adversarial-findings.json` (17 findings) |
| Evidence directory | `docs/reviews/phase5-remediation-evidence/` |

**Verdicts — read both.** This document carried a single `PASS` at every level. That was wrong in scope.

| Level | Verdict | Basis |
|---|---|---|
| **A. Phase 5 code-level remediation** | **PASS** | All 17 findings remediated and re-executed by an independent acceptance review at `830b9f0` (Section G). |
| **B. Overall Windows release acceptance** | **CONDITIONAL PASS — release BLOCKED** | No Windows runtime, installer, or physical acceptance evidence exists (Section H). Code is accepted; the product is not release-ready. |

Sections A–F were written by the remediation author and are preserved **as authored**, with three
corrections marked inline (`⟦CORRECTED⟧`) where this verification pass found them inaccurate. Section G is
the independent acceptance review; Section H is the Windows release gate. Section F is an author
self-review and is **not** an independent external review.

---

## Section A — Repository identity, ancestry and scope control

* Repository, branch, base commit and starting commit were read from the actual checkout and remote, not from
  any prior report.
* The requested target `16e0267f…` **does not exist**: `api.github.com` returns `HTTP 422` for the commit and no
  branch, tag or PR head in the clone (or in any fetched remote branch, after unshallowing) contains it. Per the
  user's standing instruction the work stopped, the discrepancy was surfaced, and the user chose
  `proceed_from_9274ddb`. That is the only deviation from the requested workflow, and it is a documented one.
* `main` was not touched. No branch was created, renamed, deleted, force-pushed or rebased. The session branch was
  fast-forwarded only (`git merge --ff-only 9274ddb…`), i.e. history was preserved exactly.
* No architecture was replaced and no schema version was invented: the work stays inside schema 13, and every new
  guard is additive.

## Section B — Findings register and closure status

17 findings, **17 FIXED, 0 OPEN** (`docs/reviews/phase5-adversarial-findings.json`).

### B.1 Pre-existing register (11 entries, re-verified in this pass)

| ID | Sev | Title | Status in this pass |
|---|---|---|---|
| P5-ADV-001 | High | Recovery Owner-resolution had no brute-force lockout | FIXED (already remediated; regression suite re-executed) |
| P5-ADV-002 | Medium | `verify:replication` governance gate failed on the candidate | FIXED (re-executed, 139 checks) |
| P5-ADV-003 | Medium | Financial verification was test-only, not at the restore boundary | FIXED (production `financial::verify` in the restore transaction) |
| P5-ADV-004 | Medium | Deleted credit-sale entry undetected | FIXED |
| P5-ADV-005 | Medium | Tampered repayment entry undetected | FIXED |
| P5-ADV-006 | Medium | Balanced-but-wrong billing ledger undetected | FIXED |
| P5-ADV-007 | Medium | Duplicated balanced retail **sale** journal undetected (was STILL OPEN after the ind. audit) | **FIXED this pass** |
| P5-ADV-008 | Medium | `workspace_access` / `local_recovery_identity` writable via raw SQL under a live fence (was STILL OPEN) | **FIXED this pass** |
| P5-ADV-009 ⟦CORRECTED⟧ | Medium | In-memory vs durable dedup semantics disagreed (durable runtime was BLOCKED) | FIXED; the durable path was executed on real PG 16.2, **but no durable test covered the cross-generation restore contract until the acceptance review wrote one** (Section G.3) |
| P5-ADV-010 | Low | `generation` / `owner_token` format unvalidated (was STILL OPEN) | **FIXED this pass** |
| P5-ADV-011 | Info | `clippy -D warnings` fails; 2 ESLint warnings (was STILL OPEN) | **FIXED this pass** |

### B.2 Findings uncovered by this pass (6 entries)

| ID | Sev | Title | Status |
|---|---|---|---|
| P5-NEW-001 | High | Verifier **rejected every legitimate split cash+credit retail sale**, and missed a deleted split-credit entry | FIXED (both directions) |
| P5-NEW-002 | High | Verifier **rejected every legitimate repeated-product invoice**, and could not see duplicate-line stock under-deduction | FIXED (aggregate by product) |
| P5-NEW-003 | Medium | Non-sale credit entries only checked when a journal row existed; `kind='return'` unverified | FIXED (bilateral) |
| P5-NEW-004 | High | `verify:local-schema` failed on v13 and the fingerprint still described schema 12 | FIXED (110 checks) |
| P5-NEW-005 | Medium | PostgreSQL replication migration was **not re-runnable** (`42P07` on round 2) | FIXED (3 clean applies on PG 16.2) |
| P5-NEW-006 | **Critical** | Cloud ingest **rejected the second envelope of every real desktop retail sale** (`CONFLICT`), because operation identity omitted the stream; durable hydration collapsed the two streams | FIXED (in-memory, durable, native) |

### B.3 Why P5-NEW-006 is Critical

Native checkout writes **one** `operationId` into **two** outboxes for a single sale:
`local_retail_outbox` (`stream='retail'`) and `local_billing_outbox` (`stream='billing'`)
(`CheckoutPanel.tsx`, `payments.rs::post_retail`, asserted by `replication_matrix_tests.rs`). The native export
proves it — `bill-cash-upi` is billing sequence 5 **and** retail sequence 3.

PostgreSQL always scoped identity as `(business_id, restore_generation, stream, operation_id)`, but the in-memory
`CloudStore.byOperation` used `${businessId}|${operationId}`. Consequence on the candidate:

* the retail envelope commits, then the billing envelope of the same sale is compared against the retail payload,
  its `payloadSha256` differs, and ingest throws `CONFLICT` — so **UPI, card, cash+UPI, cash+card and cash+credit
  retail sales never reached the cloud projection**;
* `hydrateFromPostgres` overwrote one stream's entry with the other's, so a post-restart duplicate check could
  compare a billing payload with a retail envelope.

The defect was invisible to the existing suites because the synthetic fixtures used distinct `bill-N` / `sale-N`
ids. It is now covered by fixtures that reuse one id across both streams.

## Section C — Remediation matrix (root cause → fix → tests → risk)

| Finding | Root cause (verified) | Fix (minimal, root-cause) | Required tests (added) | Risk / blast radius |
|---|---|---|---|---|
| P5-ADV-008 | Fence triggers covered only the 40 business tables; the two metadata tables had none | v13 engine triggers: identity singleton+shape+**frozen while fenced**+immutable `business_id`+no DELETE; `workspace_access` singleton+no DELETE+**fenced** update that refuses credential swaps and any lockout weakening while still allowing monotonic failure accounting. Two production paths re-ordered (`resolve_interrupted_at`, `restore_owned`) instead of weakening a guard | 3 (8+2 scenarios) + 11 schema attacks | Medium: touches the recovery/auth boundary. Mitigated by re-running the whole recovery suite (78 tests) and the crash matrix; legacy v5–v12 archive fixtures still pass |
| P5-ADV-010 | `random_id()` emits 64-hex but nobody validated shape | `is_hex64` enforced in `admit`, `transition`, `restore_owned`, `reconcile_startup` (business, live generation, every `operation_id`, every completed `result_generation`, and latest completed == live), mirrored in SQL | 1 (9 scenarios) + 2 schema attacks | Low: fail-closed only; a legal workspace always satisfies it |
| P5-ADV-011 | Pre-existing style debt + 2 dead-code warnings | Fixed the lints that were right; 4 documented `#[allow(too_many_arguments)]` where each argument is a distinct money/security fact; removed the dead parameter and dead import | 0 (gate itself is the test) | None: no behaviour change |
| P5-NEW-001 | Rule assumed every sale entry belongs to a `tender='credit'` invoice | Accept the split form too; add the retail-direction cardinality + amount rules | 2 | Low: no predicate loosened; the tender=credit form is still required |
| P5-NEW-002 | Line-oriented check against a product-oriented writer | Aggregate payload lines by `(invoice, product)` and compare to `SUM(movements)` in both directions | 2 | Low |
| P5-NEW-003 | Conditional `EXISTS()` made a required relationship optional | Unconditional `COALESCE(...,0)` comparison; linked-entry pairing; `kind='return'` verified against `local_retail_return_parts.debt` and the attributed retail journal | 2 | Low |
| P5-NEW-004 | Loader found migrations by the literal name `migrate`; `migrate_v13` invisible | Replay `migrate_v13` (const + `FENCED_TABLES` loop), assert lib.rs step order, regenerate fingerprint (pure additions), add v13 attacks | 11 | Low: gate-only, no runtime code |
| P5-NEW-005 | Bare `CREATE` everywhere | `IF NOT EXISTS` / `CREATE OR REPLACE` / `pg_policies`-guarded policies. No predicate, CHECK, grant or RLS setting changed | 3 applies on real PG | Low |
| P5-NEW-006 | In-memory key narrower than the durable key (no `stream`) | `CloudStore.operationKey(business, stream, operation)` as the single source; used by ingest lookup/insert, `clone()`, and hydration | 9 | Medium: touches every ingest path; covered by in-memory (139), durable (79) and native HTTPS (123) suites, plus a before/after probe |
| P5-ADV-007 ⟦CORRECTED⟧ | Sale postings only compared by amount | Sale cardinality: exactly one cash and one receivables leg iff recorded cash is non-zero, no other accounts, no customer attribution | 4 (incl. halved-amounts variant and the multi-part-return false-positive guard) — **the fix and these tests landed in the baseline `9274ddb`, not in `f232348`; `f232348` contains no sale-cardinality rule** | Low: scoped to sale operations only |

## Section D — Executed verification

Every line below was run in this environment in this pass. Evidence files are in
`docs/reviews/phase5-remediation-evidence/`.

| # | Command | Result | Evidence |
|---|---|---|---|
| 1 | `cargo fmt --check` | **exit 0** | `gates-fmt.txt` |
| 2 | `cargo clippy --all-targets --locked --offline -- -D warnings` | **exit 0** (baseline: exit 101, 19 warnings) | `gates-clippy-strict.txt` |
| 3 | `cargo test --all-targets --locked --offline` | **262 passed / 0 failed / 7 ignored** + example 7 passed | `gates-cargo-test.txt` |
| 4 | `npm run typecheck` | tsc 6.0.3, **no type errors** | `gates-npm-verify.txt` |
| 5 | `npm run typecheck:native` | tsgo 7.0.2, **no type errors** | `gates-npm-verify.txt` |
| 6 | `npm run lint` | **0 errors, 0 warnings** (baseline: 2 warnings) | `gates-npm-verify.txt` |
| 7 | all 32 `npm run verify:*` sub-gates | **32/32 PASS** (baseline: 31/32; `verify:local-schema` failed) | `gates-npm-verify.txt` |
| 8 | `verify:replication-postgres` on real PostgreSQL 16.2 | **79 checks passed** | `gates-npm-verify-postgres.txt` |
| 9 | `verify:replication-native-https` (SQLCipher TEXT → TLS → PostgreSQL) on PG 16.2 | **123 checks passed** | `gates-npm-verify-postgres.txt` |
| 10 | migration applied 3× on PG 16.2 | **3/3 clean**, stable object counts | `p5-new-005-migration-idempotency-after.txt` |
| 11 | shared-`operationId` behavioural probe, candidate vs fixed | `CONFLICT` → accepted with independent cursors | `p5-new-006-probe-{before,after}.txt` |
| 12 | durable hydration of a shared id, candidate vs fixed | collapse → both stream identities | `p5-new-006-postgres-hydrate-before.txt`, `p5-new-006-postgres-after.txt` |
| 13 | native SQLCipher export pipeline (7 real sales incl. shared ids) | export **and** 123-check HTTPS run pass | `p5-new-006-native-https-before.txt`, `gates-npm-verify-postgres.txt` |

Headline counters: `verify:local-schema` 92 → **110** checks (all pass); `verify:replication` 129 → **139**;
`verify:replication-postgres` 71 → **79**; Rust tests 260 → **262** (+20 new/expanded tests across the recovery
and financial suites).

### D.1 ⟦CORRECTED⟧ Baseline observation carried forward honestly

On the pre-change baseline `9274ddb`, `cargo test --all-targets` reported **252 passed / 1 failed**:
`recovery::remediation_tests::rem_r2_concurrent_attempts_do_not_bypass_accounting` hit
`DatabaseBusy("database is locked")` under an 8-thread × 4-attempt contention test. The same test passes when run
alone and passes in the post-change full suite (262/0/7). It is treated as a **test-side contention flake**, not a
remediation: the assertion (`invalid == 4`, `limited == 28`, budget `(5, >0)`) was not modified. No retry, sleep or
serialization was added to make it pass, and this is disclosed rather than papered over.

### D.2 Checks that could not be executed (BLOCKED, not claimed)

| Check | Status | Reason |
|---|---|---|
| Windows / WebView2 / Tauri runtime | **BLOCKED** | No Windows host in this Linux sandbox. Executed substitutes: `verify:windows-release` (40 checks) and `verify:desktop-contract` (37 checks), both pass |
| Physical shop / device acceptance | **NOT PERFORMED** | Requires operator hardware; no evidence invented |
| macOS build | **NOT PERFORMED** | Out of scope for this pass |

## Section E — Gates and acceptance criteria

**Acceptance criteria for this pass**

1. Every finding in the register has an explicit closure status backed by execution or an explicit BLOCKED
   reason — **met** (17 FIXED; BLOCKED items listed in D.2 are environment limits, not findings).
2. No validation, constraint, financial invariant, security control or test assertion weakened — **met**. The
   restore-boundary verifier only gained rules; one pre-existing test label was renamed with its assertion intact;
   the only assertion text changed was a violation label, and the two changed test idioms are semantically
   identical.
3. No schema fork: changes stay inside schema 13 and are additive — **met**. The fingerprint diff is pure
   addition (2 tables, 12 metadata triggers, 120 barrier triggers; no table shape change, no trigger removed).
4. No history rewrite, no force push, no branch deletion, `main` untouched — **met**.
5. Backward compatibility: legacy v5–v12 archives remain verifiable and restorable — **met**
   (`version_eleven_backup_remains_verifiable_and_restorable_after_lan_migration`,
   `legacy_v6_archive_…`, `recovery_migration_preserves_schema_ten_financial_rows…`, all pass).
6. Cross-path consistency: the in-memory, durable and native replication paths agree on operation identity — **met**
   (139 / 79 / 123 checks).

**Gate results:** fmt PASS · clippy `-D warnings` PASS · full test suite PASS · typecheck PASS · native typecheck
PASS · lint PASS · 32/32 verify sub-gates PASS · PostgreSQL durable PASS · native HTTPS PASS · migration
idempotency PASS · Windows runtime BLOCKED · physical acceptance NOT PERFORMED.

## Section F — Independent adversarial review of the final diff

The diff was re-read as a hostile reviewer, looking for the ways this kind of change usually goes wrong.

1. **Did any guard get weakened to make a test pass?** No. The only production-code ordering changes are
   `resolve_interrupted_at` (fence released *before* the budget reset) and `restore_owned` (fence deleted *before*
   the generation rotates); both make the sequence stricter, and both are covered by tests that assert the
   legitimate path still works (`metadata_writes_are_allowed_once_the_fence_is_released`,
   `rem_r2_success_after_permitted_interval_clears_budget`).
2. **Can the new `workspace_access` trigger break login?** The trigger only fires `WHEN EXISTS(fence)` and permits
   monotonic failure accounting. `access::login_at` is already barred under a fence, so the only writer through a
   fence is `resolve_interrupted_at`, which now releases the fence first. Verified by the 6-test remediation
   suite and the 5-phase crash matrix.
3. **Can the new identity triggers break restore?** The generation is written after the fence row is deleted;
   `restore` is exercised by the whole recovery suite (78 tests), including crash at every transition and legacy
   archive migration.
4. **Do the new financial rules reject valid shops?** Three false-positive guards were added deliberately
   (`p5_new_001_split_cash_credit_sale_is_accepted` incl. a real restore round trip,
   `p5_new_002_repeated_product_lines_are_accepted`, `p5_new_003_credit_return_entry_must_match_the_return_record`
   which proves a legitimate credit refund is accepted *before* injecting the attack), plus the pre-existing
   multi-part-return guard.
5. **Can the relaxed credit rule hide a wrong amount?** No: the split form still requires the entry to equal the
   recorded credit parts *and* the customer to match, and the ticked form still requires `tender='credit'` with
   `totalPaise = amount`; the new retail-direction rules make the check bidirectional.
6. **Is the stream key change a dedup regression?** No: `restore_generation` is still excluded (cross-generation
   dedup intact, P5-ADV-009 behaviour preserved and re-verified), payload reuse on the same stream still raises
   `CONFLICT`, and retries of a seen sequence still return `duplicate: true` with the *original* cursor. All four
   properties have explicit assertions in the in-memory and durable suites.
7. **Does the extra startup validation risk bricking a healthy database?** Every new check can only fire on data
   that the schema now prevents from being written; a healthy workspace always satisfies it, and the crash matrix
   plus the legacy-migration tests confirm healthy archives still open and restore.
8. **Is the schema fingerprint honest?** It was regenerated with `--write` and then re-verified; the diff contains
   only additions, and the guard-attack suite now covers 11 v13 behaviours.
9. **Is the PostgreSQL change cosmetic?** No: the candidate fails on the second apply with `42P07`; the fixed file
   applies three times and the object counts are stable. Policies were wrapped, not altered.
10. **Is any claimed evidence actually a mock?** No. Every numeric claim above comes from a real
    SQLCipher-backed Rust test, the project's own verifier script, or a real PostgreSQL 16.2 server.
11. **Residual risk.** Windows/Runtime and physical acceptance are unverified (D.2). The `rem_r2` contention flake
    is disclosed (D.1). Nothing else is deferred.

## Verdict (as authored — superseded by Section I)

**PASS.** *(Author's code-level verdict. Correct for level A after independent re-execution; it was never a
release verdict, and the document did not say so. See Sections G, H and I.)*

All 17 findings — 11 inherited (three of which were still open after the previous independent audit) and 6
uncovered by this pass, including one Critical defect that silently dropped the cloud copy of most real retail
sales — are remediated with root-cause fixes and executable, before/after evidence. Every gate that this
environment can run passes; the two that cannot run are named as BLOCKED rather than claimed. No validation,
constraint, financial invariant, security control, assertion or history was weakened to get here.

---

# Part II — Independent acceptance reconciliation (2026-11-27)

Written by the acceptance-review session. Everything below was re-derived from the repository and re-executed
in a clean worktree; nothing was copied from Part I.

## Section G — Independent verification of the seven-commit series

### G.1 Git state (verified by hash, not by message)

| Item | Verified value |
|---|---|
| Repository | `uddieee33-blip/Sornio` |
| Branch | `arena/475a4866-sornio`, `active`, base `1cc5c798d1eada9a16463213b0776c01e99d36f9` |
| HEAD | `830b9f0f057f1aea7ac60535d779671add8211ec` |
| Starting point | `9274ddb8b3977cf52411cbb49c68e191a1c78c6d` |
| Working tree | clean (`git status --porcelain` empty) before this pass |
| `main` | ancestor of HEAD; **0 behind / 27 ahead**; not modified |
| Remote | `origin/arena/475a4866-sornio` == HEAD |
| History | linear; `git reflog` shows seven `commit:` entries on top of a `merge … Fast-forward` — no amend, no rebase, no reset, no force-push |
| Branch deletion | none |

| Commit | Parent | Scope as claimed | Scope as verified |
|---|---|---|---|
| `124e601` | `9274ddb` | P5-ADV-008/010 | correct |
| `f232348` | `124e601` | P5-ADV-007 + P5-NEW-001..003 | **P5-NEW-001..003 only**; no sale-cardinality rule exists in this diff |
| `221d1f3` | `f232348` | P5-NEW-006 | correct |
| `b5e78e5` | `221d1f3` | P5-NEW-004 | correct |
| `da6a5ca` | `b5e78e5` | P5-NEW-005 | correct |
| `a3573a2` | `da6a5ca` | P5-ADV-011 | correct |
| `830b9f0` | `a3573a2` | docs/evidence | correct |

All seven hashes and parents match the assignment. The one attribution defect is `f232348`: see G.6.

### G.2 Source review — what was actually checked, per finding

* **P5-ADV-008 (metadata fencing).** `V13_EXTENSION` now creates 12 triggers over
  `local_recovery_identity`, `workspace_access`, `local_recovery_operations` and `local_recovery_fence`.
  The two legitimate writers were **re-ordered, not loosened**: `resolve_interrupted_at` releases the fence
  before clearing the budget, and `restore_owned` deletes the imported fence before rotating the generation.
  Both orders are asserted by tests (`recovery_metadata_is_immutable_while_fenced` asserts six raw-SQL attacks
  are refused and the durable budget is unchanged; `metadata_writes_are_allowed_once_the_fence_is_released`
  asserts the legitimate path still works). Reviewed for the classic mistake — a guard that fires on the happy
  path — and found none: the `workspace_access` update trigger only fires `WHEN EXISTS(fence)` and permits
  monotonic failure counting.
* **P5-ADV-010 (identity validation).** `is_hex64` is applied at `admit`, `transition`, `restore_owned` and
  `reconcile_startup`, and mirrored in SQL. `reconcile_startup` additionally requires the newest completed
  operation's `result_generation` to equal the live generation — a real strengthening, not decoration.
* **P5-NEW-001/002/003 (verifier vs real writers).** Checked against the writers, not against the comments:
  `billing.rs::post_into` aggregates requested quantity per product and writes one movement per product
  (confirms the P5-NEW-002 aggregation fix); `customers::post_split_credit` books only the credit part
  (confirms the P5-NEW-001 split form). Both directions exist for each rule, plus false-positive guards
  that prove valid split, repeated-line and credit-return history is accepted — including a real
  export/preview/restore round trip.
* **P5-NEW-004 (schema gate).** `load_migrations()` now replays `recovery::migrate_v13` (the `V13_EXTENSION`
  const plus an expansion of the `FENCED_TABLES` loop) and asserts the `lib.rs` step order. Reproduced the
  before state: the pre-fix tree exits **1** with `user_version is 12, crate SCHEMA_VERSION is 13`. At HEAD:
  **110/110**.
* **P5-NEW-005 (migration idempotency).** Re-ran on real PostgreSQL 16.2 with my own driver, not the repo's
  script: the pre-fix file fails round 2 (`relation "businesses" already exists`); the shipped file applies
  three times with identical counts `{tables:11, policies:7, rls:8, idx:14, view:1}`.
* **P5-ADV-011 (lint).** Pre-fix tree: **19** clippy warnings (11 `needless_borrow`, 4 `too_many_arguments`,
  `type_complexity`, `redundant_field_pattern`, `manual_range_contains`, `redundant_pattern_matching`).
  HEAD: `-D warnings` exits 0. The four `#[allow(too_many_arguments)]` sites each carry a justification
  comment naming the contract/column reason; none hides a missing refactor that would change behaviour.

### G.3 P5-NEW-006 — deep review (the Critical one)

**Physical vs semantic identity.** The physical constraint is
`UNIQUE (business_id, restore_generation, stream, operation_id)` (and a second unique on
`(business_id, restore_generation, stream, stream_sequence)`); the ack table is keyed
`PRIMARY KEY (business_id, restore_generation, stream, operation_id)`. The **semantic** dedup key is
`(business_id, stream, operation_id)` — deliberately *without* `restore_generation`, because a restore replays
the same operations under a new transport epoch and `bumpCustomer` applies a delta, so re-projection
double-counts. The two keys differ only in `restore_generation`, which is exactly the intended design.

| # | Property | Method | Result |
|---|---|---|---|
| 1 | One native operation id legitimately spans billing + retail | counted occurrences in the real export `manifest.json`/`envelopes/` | **5** shared ids (`bill-upi-1000` billing 2 / retail 1, `bill-card-1000` 3/2, `bill-cash-upi` 5/3, `bill-cash-card` 6/4, `bill-cash-credit` 7/5) |
| 2 | Both envelopes accepted independently | replayed all 14 real envelopes through `ingestEnvelope` at HEAD | **14/14 commit** |
| — | The defect was real | same replay against the parent of `221d1f3` | **8/14 commit**; 5 `CONFLICT` + 1 `GAP` cascade |
| 3 | Retries return their original cursors | harness shared-id block (139 checks) + durable probe | retry keeps `duplicate:true` with the first cursor, per stream |
| 4 | Changed payload on a known identity → CONFLICT | in-memory and durable | `CONFLICT` in both |
| 5 | `clone()` preserves both stream identities | harness (139) + durable probe key-shape assertion | holds |
| 6 | Hydration preserves both identities | durable probe + `verify:replication-postgres` (79) | holds at HEAD; the pre-fix tree returns **collapsed** keys (`business|operation`), which is how I confirmed the old bug |
| 7 | Cross-generation dedup prevents double projection | durable probe on PG 16.2 | outstanding stays `5000`, not `10000` |
| 8 | Stream sequence advances after restore | durable probe | first new post-restore op accepted; head advanced by replayed rows |
| 9 | A new post-restore op is not rejected as GAP | durable probe | accepted; a genuinely skipped sequence still raises `GAP` |

**Gap found and closed by this pass (IV2-002).** `verify-replication-postgres.mjs` never rotates the restore
generation — every case stays on `gen-1` — so properties 7–9 had **no durable test at all**. The implementation
does satisfy them; I proved it with a probe written for this audit (10/10 assertions,
`phase5-final-verification-evidence/p5-adv-009-durable-cross-generation.txt`). This is recorded as a
verification gap that existed until now, not as a code defect.

**Query/plan note (IV2-004).** Because the duplicate lookup omits `restore_generation`, PostgreSQL cannot use
the operation-id uniqueness index; the measured plan scans
`events_business_id_restore_generation_stream_stream_sequenc_key` and filters on `operation_id`. Correctness
is unaffected (the operation id is unique per business+stream by construction); it is a scale note.

**Concurrency.** `ingestDurable` holds the transaction open and locks business → device → stream head
`FOR UPDATE` before the duplicate check, and the harness drives two real connections plus a same-envelope race
(`verify:replication-postgres`, 79 checks). The loser fails closed with a replication error rather than
writing a second row.

**Documentation.** `phase5-cloud-dedup-contract.md` §1 still labels the durable *before* key as
"per-generation" while §2 calls it the defect. Both statements are true of different moments (the pre-fix
durable query omitted `restore_generation`; the schema constraint includes it), but read together they
contradict. Corrected in this pass and flagged in Section I.

### G.4 Independent gate ledger

Executed from `/tmp/verify-head` (`git worktree` at `830b9f0`, clean). Raw transcripts in
`docs/reviews/phase5-final-verification-evidence/`.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `cargo fmt --check` | 0 | clean |
| 2 | `cargo check --all-targets --locked --offline` | 0 | finished in 2m08s from an empty target dir |
| 3 | `cargo clippy --all-targets --locked --offline -- -D warnings` | 0 | no warnings |
| 4 | `cargo test --all-targets --locked --offline` | 0 | **262 passed / 0 failed / 7 ignored** (444.08s) + example 7/0 |
| 5 | `npm run typecheck` | 0 | tsc 6.0.3 clean |
| 6 | `npm run typecheck:native` | 0 | tsgo 7.0.2 clean |
| 7 | `npm run lint` | 0 | eslint clean |
| 8 | `npm run verify` (32 sub-gates) | 0 | **32/32**; local-schema 110, replication 139, windows-release 40, desktop-contract 37, mobile-contracts 63, database 38, recovery 24 |
| 9 | `verify-replication-postgres` (fresh schema) | 0 | **79** checks on PostgreSQL 16.2 |
| 10 | `verify-replication-native-https` | 0 | **123** checks SQLCipher TEXT → TLS → PostgreSQL |
| 11 | migration ×3 on PG 16.2 | 0 | 3/3 stable; pre-fix file fails round 2 |
| 12 | real-export replay | 0 | 14/14 at HEAD vs 8/14 pre-fix |
| 13 | durable cross-generation probe (new) | 0 | 10/10 at HEAD; pre-fix fails hydration identity |
| 14 | `cargo test --lib recovery::` | 0 | 84 passed / 3 ignored |
| 15 | `cargo test --lib final_financial` | 0 | 16 passed (the P5-ADV-007 suite) |
| 16 | `rem_r2_concurrent` ×6 in isolation | 0 | 6/6 pass |

**Environment:** rustc/cargo 1.100.0, node v22.22.3, npm 10.9.8, TypeScript 6.0.3 / 7.0.2-native,
PostgreSQL **16.2** real server (port 55432), Linux x86_64. No Windows host; no `windows-gnu` std installed
(the cross-target is not available offline, so "compile for Windows" was not possible either).

### G.5 The `rem_r2` flake, kept visible

Disclosed in Part I §D.1 and still open as a *test-harness* observation, not a code defect: the authoring pass
saw `rem_r2_concurrent_attempts_do_not_bypass_accounting` fail once with `DatabaseBusy` on the **baseline**
under 8-thread load. This pass ran it **6/6 in isolation and passing inside the full 262-test suite**. The
assertions were not weakened; no retry or serialization was added. It remains a known flake under heavy
parallel load and should be reported as such rather than as "fixed".

### G.6 Corrections to Part I

1. **P5-ADV-007 attribution.** Part I's matrix implies `f232348` closed the duplicated-sale-journal defect. It
   did not: `git log -S "retail sale journal is not exactly one posting set"` resolves to `9274ddb` only, and
   the 16-test suite `recovery/final_financial_tests.rs` (including `fin01_duplicate_sale_journal_4250_scenario`
   and the halved-legs variant `fin07b`) arrived with that baseline commit. The fix **is** in HEAD (the baseline
   is HEAD's ancestor) and all 16 tests pass at HEAD. Corrected inline and in the register.
2. **P5-ADV-009 overclaim.** "Durable path now executed on real PG 16.2" is true of ingest/dedup/hydration,
   but the *cross-generation restore* contract had no durable test. Corrected inline; closed by G.3.
3. **Single verdict framing.** The report ended with an unqualified `PASS`, which a reader can only read as a
   release verdict. It never was one. Now split (Section I).
4. **Test-count bookkeeping.** The register carried `237` Rust tests / `129` harness checks (pre-closure counts)
   alongside `262` / `139` in the ledger. Reconciled at HEAD.

## Section H — Windows release gate (mandatory, separate, NOT met)

Windows is kept as its own acceptance gate. **Nothing in this section is satisfied.** No Linux result is
offered as a substitute, and no hardware compatibility is claimed.

| Gate | Status | Evidence / reason |
|---|---|---|
| Windows runtime verification | **BLOCKED** | No Windows host in this environment; no `windows-gnu` target installed for even a cross-compile |
| WebView2 availability | **NOT VERIFIED** | Requires a Windows host |
| Tauri startup and shutdown | **NOT VERIFIED** | Requires a Windows host |
| Database initialization (SQLCipher on NTFS) | **NOT VERIFIED** | Requires a Windows host |
| Upgrade behaviour from a schema-12 shop database | **NOT VERIFIED** | The v13 migration is exercised in Rust tests, but not on Windows over a real installed product |
| Offline billing | **NOT VERIFIED** | Requires an installed Windows build |
| Recovery flow (native file dialogs, fence, owner re-auth) | **NOT VERIFIED** | Requires an installed Windows build |
| Installation and packaging (NSIS, per-user) | **NOT PERFORMED** | Requires Windows + NSIS |
| ACL/permissions of the encrypted database on NTFS | **NOT VERIFIED** | Not modelled by any POSIX test |
| Physical device / real-shop acceptance | **NOT PERFORMED** | Requires operator hardware |

What *is* verified is **packaging intent only**, and the script says so in its own header: `verify:windows-release`
(40 checks) asserts that exactly one workflow may emit a shop-facing installer, that WebView2 is configured for
offline bundling, that the window loads bundled assets, and that devtools are closed. `verify:desktop-contract`
(37 checks) asserts renderer command contracts. Neither executes a binary.

## Section I — Final verdicts

### A. Phase 5 code-level remediation — **PASS**

All 17 findings: root cause identified in source, remediation present, regression assertions executed
independently at HEAD. Every runnable gate passes (Section G.4). Two claims were narrowed rather than accepted
(P5-ADV-007 attribution, P5-ADV-009 durable coverage) and both are now evidenced. One verification gap was
found and closed. No gate was bypassed, no assertion weakened, no history rewritten, `main` untouched.

Conditions attached to that PASS:

* the `rem_r2` flake stays disclosed as a flake;
* `rotatePublisherGeneration` has no public export and no repo test (IV2-003) — noted, not fixed here;
* the duplicate lookup cannot use the operation-id index (IV2-004) — scale note.

### B. Overall Windows release acceptance — **CONDITIONAL PASS / BLOCKED**

**BLOCKED** on the Windows gate (Section H) and the physical acceptance gate. The code is accepted; the
product is **not** release-ready, and no deployment, merge to `main`, or release is authorised by this
document.
