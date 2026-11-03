# PR #143 reliability & release-gate review — 2026-11-03

**Prepared by:** Arena agent session on branch `arena/457ce32c-sornio` (read-only audit of PR #143's branch; no commits were made to the PR branch, nothing was merged, no production infrastructure was touched).

**Verdict: PR #143 merge readiness = NO-GO for automatic merge (founder-review only). Internal/CI testing evidence is strong. Real-shop pilot and production cloud synchronization remain NO-GO.**

---

## A. Executive summary

- PR #143 head is unchanged since the assignment checkpoint: `4340d7280f22dd3427c58ed8840aa224444eebd6` on `arena/5ed2bd28-sornio`, state OPEN / DRAFT / `MERGEABLE`, 36 commits, 165 files, base `main` = `005f27a7702b37916ae517b7f37360c0e9ce436f`. No other agent has pushed to the branch.
- All six workflows on the head SHA completed **SUCCESS** (run IDs below), including `Windows local workspace` run `41624151210`, whose 26 steps include real `cargo test --all-targets` in **release and debug**, an NSIS installer build, a silent install on a GitHub-hosted Windows runner, offline launch with a firewall block, and artifact upload.
- The six commits after `4747cda` were reviewed line-by-line. The split-credit `unclaimed()` fix is correct and is backstopped by the unique index `credit_sale_once`. The tautological `assert_eq!(payload_sha256(x), payload_sha256(x))` tests were genuinely replaced with NIST CAVP vectors plus an independent `sha2` hasher; a fresh scan of **all** Rust files at the head finds zero remaining `assert_eq!(X, X)` self-comparisons.
- Re-executed locally on the PR head (Node 22, `npm ci` clean): `verify-replication` **106/106**, `verify-billing` **25/25**, `verify-accounting` **64/64**, `verify-native-money` **12/12** (incl. 4,820 random invoices vs the native BigInt formula), `verify-desktop-contract` **31/31**, `verify-inventory` **9/9 groups**, `verify-mobile-contracts` **63/63**, `typecheck` (TS 6.0.3) **no errors**. `verify-replication-postgres` and `verify-replication-native-https` **fail closed** without `DATABASE_URL`/native outbox (verified; they are not silently skipped).
- Hard sandbox limits (honest): no `cargo`/`rustc` here, so native SQLCipher tests are CI-only (not re-run locally); GitHub Actions log/artifact byte downloads redirect to Azure Blob storage, which is outside this sandbox's egress allowlist, so installer **zip bytes could not be independently hashed** — only GitHub-reported artifact digests are recorded. No PostgreSQL locally, so PG ingest races are CI-only.

## B. Repository baseline (verified 2026-11-03)

| Field | Value |
| --- | --- |
| Main SHA | `005f27a7702b37916ae517b7f37360c0e9ce436f` |
| PR | #143 OPEN, DRAFT, `mergeable=MERGEABLE` |
| PR head SHA | `4340d7280f22dd3427c58ed8840aa224444eebd6` (branch `arena/5ed2bd28-sornio`) |
| Previous checkpoint | `4747cdabb528cc6bf5cee4547ccb7d179962aa4d` |
| Commits after checkpoint | 6: `1d6d0a2`, `e564c29`, `b2cb24f`, `1d61769`, `486ab7a`, `4340d72` |
| Changed files / delta | 165 files, +20,586 / −23 |
| Branch modified by others since checkpoint | **No** — head identical to checkpoint |
| Working branch of this session | `arena/457ce32c-sornio` (= main) |
| `SCHEMA_VERSION` | still `12` (`packages/local-store/src/lib.rs:150`) |
| `productionSyncEnabled` | still `false` (`apps/mobile/app.json:62`) |

### CI at head `4340d728` (all fetched live from the GitHub API today)

| Workflow | Run ID | Result | Jobs |
| --- | --- | --- | --- |
| Windows local workspace | 41624151210 | SUCCESS | `local-windows` (26/26 steps success) |
| CI | 41624151225 | SUCCESS | Lint, types, build, Dependency audit |
| Workspace browser review | 41624151580 | SUCCESS | browser (rustfmt + debug/release cargo test) |
| Replication PostgreSQL | 41624151597 | SUCCESS | Real PostgreSQL concurrency |
| Android review package | 41624151287 | SUCCESS | android |
| Mobile companion | 41624151239 | SUCCESS | Contracts, types, security, Android debug compile, iOS simulator compile |

Historical failures on intermediate SHAs (`e564c29d` browser review, `1d6d0a28` replication/browser) were fixed by later commits in the same PR; the head is green. A green check is evidence the check ran — not production readiness.

## C. Review of the six new commits

| Commit | Change | Assessment |
| --- | --- | --- |
| `1d6d0a2` | Phase 3 financial reliability matrix (`phase3_reliability_tests.rs`, +1,088 lines, 15 test fns), split-credit conflict-check fix in `customers.rs`, digest tests in `replication.rs` / `replication_matrix_tests.rs` | **Root cause fixed, not weakened.** See D. Tests are assertion-heavy (snapshot queries before/after, journal zero-sum checks, independent hasher, NIST vectors). |
| `e564c29`, `b2cb24f` | rustfmt + borrow fixes in the new test module only | No behavior change; keeps `cargo test` compiling. |
| `1d61769`, `4340d72` | Evidence doc updates only (`docs/mobile/PHASE-3-...md`) | Documentation, no code risk. Claims in the doc match the workflow runs verified in B. |
| `486ab7a` | +126 lines in `scripts/verify-replication-native-https.mjs`: restricted-role RLS reads (cashier cannot read customers; foreign owner sees zero rows) and closed-world ingest failures (missing token, oversized body, connection refused, plaintext HTTP, post-after-close) | Fail-closed paths proven in CI run `41623767795` and re-confirmed green at head via run `41624151597`. Local re-run confirms fail-closed without `DATABASE_URL`. |

Classification: no P0/P1 defects introduced by these six commits. The PR-wide change set (Phase 1 mobile + Phase 2 replication + Phase 3 reliability) is coherent: 90 files under `apps/mobile`, 19 under `packages/mobile-contracts`, 14 under `packages/replication-cloud`, 7 under `packages/local-store`, plus verify scripts and docs. No unrelated files touched (deletions total 23 lines).

## D. Financial correctness — mixed credit payments (₹1,000 = ₹600 cash + ₹400 credit)

Code path at head: `post_retail` (single Immediate transaction) → retail journal/payment parts → `post_split_credit` for the credit leg.

- **The `unclaimed()` removal is correct.** `payments::unclaimed()` treats `local_retail_pending` as a conflict; `prepare_retail` already owns that row for the in-flight invoice, so the old check made every split cash+credit sale abort (rolled back — a failed sale, not a ledger leak). The replacement explicitly rejects customer ops/pending/canceled **and** completed/canceled retail rows (`local_retail_ops`, `local_retail_canceled`) for the same invoice id, while allowing the in-flight `local_retail_pending` row owned by the same transaction. This does **not** create a cross-subsystem hole: full-credit `post_sale` (customers.rs:431) and the other caller (customers.rs:184) still use `unclaimed()`, and the DB-level unique index `credit_sale_once` on `local_credit_entries(invoice_id) WHERE kind='sale'` backstops double credit posting.
- Regression scenarios required by the assignment, mapped to tests at head (all PASS in CI on `b2cb24f`/`486ab7a`, per the in-repo matrix and green `cargo test --all-targets` runs): exact retry (S-001), same id different amount (S-002), canceled retail id reuse (S-003), customer-op id reuse (S-004), pending customer op (covered by the `local_customer_pending` EXISTS check), conflicting invoice id (C-003 `same_invoice_id_concurrent_posts_once`), credit limit (F-024, C-004), missing customer (F-023), disabled customer (existing customers tests), insufficient inventory (C-001/C-002 + existing racing-sale tests), interruption before/after commit (K-001/K-002 subprocess death tests + K-003..K-010 abort triggers), staff stealing a prepared split (S-005). Over/underpayment, zero/negative amounts, unknown tenders, two credit parts, duplicate payment ids: F-013..F-022, each asserting the pre-post snapshot is unchanged.
- All arithmetic is integer paise (`i64`/`i128` with explicit overflow-checked `add`); `verify-native-money` re-proved the renderer matches the native BigInt half-up formula on 4,820 random invoices locally today. Digital (UPI/card) rows remain `externally_verified = false` — asserted in F-012/E-004; a manual match is never represented as bank settlement.
- Local re-execution today: `verify-accounting` 64/64 (QuantityMilli aggregation, BigInt COGS, idempotent replay), `verify-billing` 25/25.

## E. Failure injection

Covered by `phase3::split_sale_process_death_before_and_after_commit` (subprocess exit 88 before commit → zero rows; exit 89 after commit → retry idempotent), `split_sale_mid_write_failures_leave_no_partial_financial_rows` (abort triggers after invoice/stock/ledger/credit/payments/journals/outbox inserts → snapshot unchanged), plus the pre-existing billing/refund/inventory/recovery process-death tests — all inside `cargo test --all-targets` (release **and** debug) on the Windows runner. Not re-runnable locally (no cargo); statuses are CI-verified, not sandbox-verified. Honest gaps (also listed in the PR's own doc): power-loss of the Windows host during install, PostgreSQL restart mid-ingest, live WAN failure — UNTESTED.

## F. Concurrency

16 scenarios in the matrix (C-001..C-016): last-unit races with 2 and 3 cashiers, same-id conflicting payloads, concurrent credit-limit approach, competing prepares (`CheckoutActive`/`sale_clear` serialize), close-vs-sale, settlement retries, LAN last-stock. SQLite `Immediate` transactions + optimistic `expected_revision` on products ⇒ stale checkouts are `StockConflict`, never silent oversell. No duplicate journal entries; all PASS in CI at `b2cb24f`/`4747cda`.

## G. Replication durability

Pipeline verified in CI (run `41623767795` on `486ab7a`, re-run green at head `41624151597`): native SQLCipher export (db+WAL+SHM copy) → TEXT payloads → SHA-256 over the **original TEXT** (NIST-vector-tested; independent-hasher cross-check; tautology removed) → TLS ingest into real PostgreSQL 16 with transactional projection + cursor + ack → sidecar ack apply (`native_sqlcipher_apply_https_acks`, executed via `--ignored --exact` with a grep guard against zero-test execution). Duplicate/late/conflicting/ cross-tenant/tampered/malformed/oversized/plaintext/refused/closed-server cases all fail closed without a second financial effect (`486ab7a` additions). `verify-replication.mjs` re-run locally today: **106/106**. Local PG-dependent proof: BLOCKED (no local Postgres; script explicitly reports BLOCKED, not pass). Restore-generation sidecar reset covered by `restore_generation_resets_cursors`; SCHEMA_VERSION stays 12.

## H. Security / tenant isolation

- Native identity is the authority for local writes; renderer role flags are not trusted (`native_rbac_and_cross_business_denials_do_not_depend_on_react`).
- Restricted PG roles exercised against native rows on `486ab7a`: `sornio_cashier` sees the 7 posted invoices but **cannot** SELECT customers; a foreign-business owner sees **zero** invoices (including the ₹600+₹400 split); this-business owner reads cash 60000 + credit 40000. Missing/empty Bearer rejected.
- Known documented gap (not changed, correctly conservative): `acks` table has RLS ENABLE without FORCE/policy — privileged ingest connection only; revoked-device matrix beyond existing auth tests remains open (X-014 partial).
- `productionSyncEnabled=false` confirmed at head. SQL-injection surface limited by `valid_id` (alphanumeric/`-`/`_`).

## I. Windows verification (evidence classified honestly)

| Gate | Status | Evidence |
| --- | --- | --- |
| COMPILED (Rust, release+debug) | PASS | Windows run 41624151210 steps “Test encrypted storage…” (release) and debug-profile step, `cargo test --all-targets --locked` |
| TESTED (native SQLCipher financial/concurrency/crash suites) | PASS (CI-only; no local cargo) | same run; test-count lines not downloadable from this sandbox (Azure blob blocked) — step success verified via API; zero-test guard exists in the replication workflow |
| PACKAGED (NSIS installer) | PASS | step “Build independent Windows installer” + `if-no-files-found: error` artifact upload |
| Artifact | Recorded, **bytes not independently hashed** | `Sornio-Local-Workspace-Review` id 13226523094, 222,750,973 bytes, GitHub-reported `sha256:73294feb42222b176d5bae1bc761e0f3f2d8889e4648877c252fc5ec42724f66`; captures id 13226528046, 1,284,164 bytes, `sha256:aa811faf41f0f4de0ed1b5db87376ea42673a5fb9573a30f28a8b9dde11b2e6b` (retention 7 days) |
| INSTALLED (silent, on github-hosted Windows) | PASS | `check-installer.ps1` step success |
| LAUNCHED offline | PASS | `Invoke-NativeCheck` under outbound firewall block + `--verify-preserved` reopen |
| FINANCIALLY VERIFIED in the installed app | **UNTESTED** — no human cashier session through the installed UI; native financial proof is at the cargo-test level, not an end-to-end UI sale |

## J. Mobile verification

Mobile companion run 41624151239 SUCCESS (contracts, types, security, Android debug compile, iOS simulator compile). Android review package 41624151287 SUCCESS (APK produced; earlier recorded SHA-256 `18b81b71…895f3` at `6b4aa24`). `verify-mobile-contracts` re-run locally today: **63/63**. Read-only guarantee intact: companion snapshots are integer-paise strings validated by `parseCompanionSnapshot`/`decideSnapshotApply`; production adapter throws `PRODUCTION_DISABLED`; `productionSyncEnabled=false`; no mobile-side financial posting; no store submission. Physical-device runtime: UNTESTED.

## K. Test matrix

The in-repo matrix (`docs/mobile/PHASE-3-RELIABILITY-AND-RELEASE-GATE.md` at head) enumerates 166 rows across F(25) S(5) E(25) C(16) K(18) Q(10) R(27) X(20) W(12) M(8) — ≥100 required — each with ID, risk, scenario, expected, test fn, environment, SHA and an honest PASS/UNTESTED/BLOCKED status. My independent re-execution today on head `4340d728` (sandbox): 7 Node suites, **257 checks passed, 0 failed**, plus TS6 typecheck clean; 2 PG/native suites fail closed by design without infra (BLOCKED locally, PASS in CI). Tautology scan across all Rust at head: **0** `assert_eq!(X,X)` remain. `#[ignore]` count = 6, every one with a documented subprocess/pipeline reason; the two replication pipeline workers are executed in CI with `--ignored` plus an explicit “cargo ran zero native export tests” guard.

## L. Unresolved issues

- **P0 (process):** Do not auto-merge #143; keep it draft; founder authorization required. `productionSyncEnabled` must stay `false`.
- **P1:** Installer zip bytes not independently hashable from this sandbox (GitHub-reported digest only, expires with retention). Windows UI cashier sale UNTESTED. PostgreSQL restart mid-ingest UNTESTED. Live shop WAN failure matrix UNTESTED. Live-writer db copy without checkpoint not separately proven.
- **P2:** `acks` RLS without FORCE/policy (privileged ingest only — document or fix deliberately). Revoked-device ingest matrix partial. Physical mobile devices UNTESTED. Production TLS termination UNTESTED.
- **P3:** PR title still says “Phase 1” though it spans Phases 1–3 (housekeeping; description does explain this).

## M. Merge-readiness verdict (PR #143)

**NO-GO for automatic merge; GO for founder code review.** The branch is technically mergeable and fully green, the Phase 3 fixes are correct and regression-covered, and no tautological or silently-skipped tests remain. But the branch deliberately integrates three phases with live sync disabled; merging is a founder decision, and mergeable=true is not release approval.

## N. Production readiness

- Controlled internal testing (review installer on throwaway machines, no shop profiles): **conditional GO**, matching the PR's own scope boundary.
- Real-shop pilot: **NO-GO** (sync off; UI-level cashier workflow unproven; WAN failure matrix untested).
- Production cloud synchronization: **NO-GO** (`productionSyncEnabled=false`; staging-only ingest proven).
- Public mobile release: **NO-GO** (no store submission; runtime untested on devices).

---

*Method note: all GitHub state was fetched live via `gh`/API on 2026-11-03. PR branch contents were inspected via `git show`/`git grep` on `origin/arena/5ed2bd28-sornio` without checking it out; local re-execution used a scratch extraction at `/tmp/pr143`. No changes were pushed to the PR branch, no force-push, no merge, no production SQL, no store submission, no billing/visibility changes.*
