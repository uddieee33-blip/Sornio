# Phase 19 — multiplatform CI execution, recovery and verification

Date: 2026-11-12
Branch under test: `arena/1b1cac28-sornio` (based on `feature/phase18j-security-history` @ `f9680015b9953454e3eae7d8980b14ee87fc83c0`)
Pull request: **#182** (draft, base `feature/phase18j-security-history`) — https://github.com/uddieee33-blip/Sornio/pull/182

Phase 19B update (this revision): the stale-lockfile blocker that stopped four runners is **fixed**, macOS and Windows now execute the native suite, and the failures that remain are named. Commits `22db580` … `dca1b32`. Section §3 is written against `ff3a145` and later; §10 lists what changed from the first revision of this report and retracts one wrong verdict.

This report separates four kinds of statement, and never blurs them:

* **EXECUTED** — ran, here or on a named GitHub Actions run, with the command and result recorded.
* **FAILED** — ran, and the failure is a source or configuration defect, with the fix (or the exact blocker).
* **BLOCKED** — could not run. The precise blocker and the smallest action that unblocks it.
* **NOT RUN** — no attempt possible; explicitly not verified, not described as working.

Nothing in this document is a green badge. A build that compiled is not a test that passed, and a test that passed on Linux is not a passing Windows or iOS result.

---

## 1. Repository and PR inventory

`main` is at `1cc5c798d1eada9a16463213b0776c01e99d36f9` (PR #145). Nothing in this phase touched `main`.

### Phase 18 stack — verified dependency graph

Each PR's base commit is the previous PR's head commit, so this is a true chain: testing the tip verifies the combined tree, and **certifies no intermediate PR independently**.

| PR | Base (SHA) | Head (SHA) | Title |
| --- | --- | --- | --- |
| #171 | `c2262ccd55b0` | `0cd7cf923e25` | Fix live workspace limits and explicit verified-address recovery |
| #172 | `0cd7cf923e25` | `af07903e115c` | Authoritative mobile kitchen transitions and durable recovery |
| #173 | `af07903e115c` | `cecf8f24c199` | Continue restaurant preparation after payment |
| #174 | `cecf8f24c199` | `4c1e84e0a539` | Service-first kitchen queue across desktop and mobile |
| #175 | `4c1e84e0a539` | `d74f38499181` | Native kitchen responsibilities and ticket-level assignments |
| #176 | `d74f38499181` | `026b3a5f340a` | Searchable native preparation history |
| #177 | `026b3a5f340a` | `71f8e0d0a20c` | Mobile supervisor assignments with durable recovery |
| #178 | `71f8e0d0a20c` | `15bc6e2258d3` | Durable staff responsibility management, explicit kitchen revocation |
| #179 | `15bc6e2258d3` | `a70be3cd8525` | Employee responsibility audit pages, LAN session visibility |
| #180 | `a70be3cd8525` | `820b978e5e18` | Durable targeted staff session sign-out |
| #181 | `820b978e5e18` | `f9680015b995` | Searchable session and device security history |

The reference SHA in the assignment (`f9680015b9953454e3eae7d8980b14ee87fc83c0`) is confirmed as PR #181's head. `feature/phase18j-security-history` is 49 commits ahead of `main`.

### Other open PRs

* #147 `repair/p0-ci-financial-20261105` → `main` (base `main`, draft) — the source of the three failing runs listed in the assignment.
* #148–#170 — the Phase 12–17 chain, also strictly stacked, each based on the previous head.
* #146 dependabot (`npm_and_yarn/minor-and-patch`) → `main` — independent, non-draft, its CI run passed on 2026-11-09.
* #126, #127 → `main` — reported `CONFLICTING`, unrelated to Phase 18; **not tested in this phase**.

**Independent verification is required for:** #126, #127, #146, #147 and the #148–#170 chain. None of them is certified by this report.

---

## 2. Workflow trigger diagnosis — why Phase 18 had no CI results

This was the primary blocker and it was not infrastructure.

Every workflow that could have verified the stack filtered `pull_request` bases:

```yaml
on:
  pull_request:
    branches: [main, 'integration/windows-finance-recovery', 'hardening/...', ...]
```

PRs #171–#181 target `feature/phase18*` branches, never `main`. GitHub evaluates that filter **before assigning a runner**, so all eleven PRs produced **zero** workflow runs. Confirmed directly: `actions/runs?head_sha=<each PR head>` returned `total_count: 0` for all eleven, and the only check on the tip was `Supabase Preview` (an external check suite, not a workflow).

Nothing about billing, runner availability, permissions, path filters or toolchain versions could be the cause, because no run was ever created. `workflow_dispatch` existed on several workflows but could not be used: the token available to this agent is a GitHub App installation token without the `actions` permission (`gh workflow run` → `403 Resource not accessible by integration`). That is a verification-tool limitation, not a repository defect, and it is why the trigger fix below was the only way to obtain any real result.

### Fix applied

`ci.yml`, `windows-local.yml`, `workspace-browser.yml`, `replication-postgres.yml`, `mobile.yml` and `android-review.yml` now include `feature/*phase1*`, `feature/*lane*`, `repair/*` and `arena/*` in their `pull_request` base list. Patterns are explicit rather than `**` so a fork cannot silently redefine what a required check means. Workflows are otherwise unchanged.

**Result:** the same commit that produced zero runs now produces eleven jobs across seven workflows. That transition is the evidence.

---

## 3. Platform-by-platform results

All CI results below are for `arena/1b1cac28-sornio`. Run links are to the runs that were actually inspected; job-level annotations are quoted verbatim.

### 3.1 Linux — shared engineering checks

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `ff3a145` (and local execution of the same tree) |
| Environment | ubuntu-latest (GitHub runner) for CI; Debian 12, x86_64, Node 22.22.3 for local runs |
| Build | **PASS** — `npm run build` completes: 52 routes, 46 static pages (Next.js 16.4.3) |
| Lint | **PASS** — 0 errors, 5 warnings |
| Types | **PASS** — TS 6.0.3 and tsgo 7.0.2 both report no errors |
| Tests | **EXECUTED** — see §3.1.1 |
| Limitations | Native Rust is executed on macOS/Windows runners, not here (§3.1.2) |

**Correction to the first revision of this report.** It recorded Linux as green. It was not: on `08fcbc8`, three of the checks below were failing, and two of them had never once executed a test.

| Check | `08fcbc8` | `ff3a145` | What changed |
| --- | --- | --- | --- |
| `Lint, types, build` | **failure** | **success** | failed at the `verify:cargo-lock` gate before lint/typecheck/tests/build ran |
| `Real PostgreSQL concurrency` | **failure** | **success** | failed at the same gate |
| `browser` | **failure** | **failure** (252 pass / 2 fail) | failed at `cargo fmt --check`, so the browser acceptance suite *never ran*; it now runs, and fails on two named native tests |
| `Contracts, types, security` | success | success | unchanged |
| `Android debug compile`, `android`, `IOS simulator compile` | success | success | unchanged |

So `Lint, types, build` had been failing since the `verify:cargo-lock` gate was added in `569e380` — a gate doing exactly its job, on a genuinely stale lockfile, upstream of every other check in that job. The earlier report's claim that it "passed on this tree" was true of `bc24f83` and false of the commit that actually shipped.

#### 3.1.1 Executed tests, with counts

Verified locally on `ff3a145` (same tree CI builds), every command exiting 0:

| Suite | Command | Result |
| --- | --- | --- |
| Full gate suite (34 gates) | `npm run verify` | **PASS**, 754 individual `ok` assertions, 9 suites reporting `N passed, 0 failed` totalling 348, plus 179 `checks` |
| Native lockfile gate | `npm run verify:cargo-lock` | **PASS** — 24 declared dependencies present across both lockfiles |
| Lint | `npm run lint` | **0 errors**, 5 warnings |
| Types (JS API) | `npm run typecheck` | PASS (typescript 6.0.3) |
| Types (native) | `npm run typecheck:native` | PASS (tsgo 7.0.2) |
| Production build | `npm run build` | **PASS** — 52 routes, 46 static pages |

Inside `npm run verify`, all of which executed: billing 25, accounting 64, security 53 invariants, import 20, team 16 guards, PWA 17, recovery 24, database 38, reliability 59, local-schema 92, desktop-contract 38, money 12 (incl. 4 820 randomised invoices against the Rust formula), Windows release-identity 40, replication 116, mobile contracts 63.

#### 3.1.2 Native Rust on Linux runners

The native suite does not run on the Linux runner: `packages/local-store` builds SQLCipher from source with vendored OpenSSL, and the workflows run it on macOS and Windows. Those results are §3.2 and §3.3. The first revision of this report listed native Rust as BLOCKED on a missing local toolchain; that remains true of this sandbox, but it is no longer true of CI, so it is no longer recorded as a blocker.

### 3.2 Windows — native POS

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `ff3a145`, job `local-windows` |
| Environment | `windows-latest`, runner "GitHub Actions 1000001544", Strawberry Perl for vendored OpenSSL |
| Build | Frontend **PASS** (`tsc --noEmit`, then `vite build`); native compile **PASS** |
| Tests | **EXECUTED** — `cargo test --all-targets --locked`: **250 passed, 4 failed, 6 ignored**, 920.80 s |
| Artifacts | installer **not built** (step 14 skipped after the test failure) |
| Limitations | installed-app startup, uninstall/reinstall data preservation, real printing/scanner/drawer: **NOT VERIFIED** |

Run: https://github.com/uddieee33-blip/Sornio/actions/runs/43309438864/job/131501297293

This is the phase's most significant change. The job had never compiled a single Rust line on Windows: it died at step 12 with `cannot update the lock file … because --locked was passed`, before the toolchain ever reached the code. With both lockfiles regenerated (§5), steps 1–11 pass and the full native suite executes on Windows for the first time in this repository's history for the current tree.

Four failures, of which **two are Windows-only** — they do not occur on macOS (§3.3):

| Test | Observed |
| --- | --- |
| `lan_authority::tests::migration_from_frozen_v11_preserves_records_and_rejects_partial_schema_collision` | **Windows only.** The live schema after rolling back to v11 does not equal `fixtures/recovery-v11-schema.json` |
| `recovery::tests::version_eleven_backup_remains_verifiable_and_restorable_after_lan_migration` | **Windows only.** Preview of a manufactured v11 archive does not report `schema_version == 11` |
| `held_bills::tests::held_checkout_and_completion_are_atomic_and_retry_safe` | cross-platform (§3.3, defect 1) |
| `payments::tests::phase11a_legacy_cash_and_credit_only_paths_keep_their_accounting` | cross-platform (§3.3, defect 2) |

What the two Windows-only failures most plausibly mean, stated as a hypothesis and **not** as a conclusion: both involve a *manufactured* v11 archive, and both differ between platforms, which points at platform-dependent schema text rather than at row data. The prime suspect is the v21 migration, `ALTER TABLE local_kitchen_staff_next RENAME TO local_kitchen_staff`: SQLite's `legacy_alter_table` setting is a connection default that has changed across versions and is configured differently by the bundled SQLCipher build, and `ALTER TABLE … RENAME` rewrites the `sql` text of objects that reference the renamed table — which is what the frozen fixture compares verbatim. Nothing in the record yet distinguishes that from a second cause, and the run that would is `dca1b32` (§10).

**Not claimed:** that the Windows installer builds. Step 14 was skipped, so there is still no installer, no installed-app launch and no uninstall/reinstall preservation evidence.

**Do not confuse this with `windows-desktop.yml`** (hosted WebView2 preview, manual-only, online-only). It is not the product and was not used as evidence here.

### 3.3 macOS — desktop application

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `ff3a145` |
| Environment | `macos-latest`, arm64, **Xcode 26.6** |
| Build | Frontend **PASS**; native compile **PASS** |
| Tests | **EXECUTED** — `cargo test --all-targets --locked`: **252 passed, 2 failed, 6 ignored**, 188.37 s |
| Artifacts | unsigned `.app` — still **not produced**, because the test failure stops the job before the bundle step |
| Limitations | **no signing, no notarization**; no installed-app launch against a real login Keychain |

Run: the `macos` check on `ff3a145`. The job had previously reported only `Process completed with exit code 101` with no test names at all — it had no annotation capture, and raw job logs are not retrievable for this repository. It now reports the failing tests and their panic text (§5), which is how the two defects below were identified at all.

**The workflow-scheduling defect, from the first revision, stands and was correctly diagnosed:** an edit had left a step with `name` but neither `run` nor `uses`, which invalidates the entire workflow; GitHub surfaced that as a `push`-event run with `total_count: 0` and no check-run, which reads exactly like "no runner available". Runner capacity was never the problem — the `iOS simulator compile` job was getting a macOS runner throughout. Fixed in `1254310`.

**Two genuine, cross-platform defects remain.** Both are *pre-existing*: they are not caused by this phase's changes, and they only became visible when the suite first executed.

**Defect 1 — a held-bill checkout records a payment row for a plain cash invoice.**

```
held_bills::tests::held_checkout_and_completion_are_atomic_and_retry_safe
assertion `left == right` failed
  left: (1, 0, 1, 98750)
 right: (1, 0, 0, 98750)
```

The tuple is `(invoices, credit_entries, retail_payments, rice_stock)`. The test asserts that completing a held bill leaves the invoice posted and stock decremented while writing **no** payment row. `payments::invoice_posted` writes a `local_retail_payments` row for every invoice, using a fallback part equal to the invoice total with method `cash` or `credit`, regardless of tender. On a replay the insert is prevented by the primary key, so one row per invoice is the steady state. The test's expectation predates that behaviour; the code is self-consistent. **No assertion was changed** — deciding whether a held-bill cash sale should book a payment row is a business-semantics decision, not a test repair.

**Defect 2 — an idempotent replay appends an audit row.**

```
payments::tests::phase11a_legacy_cash_and_credit_only_paths_keep_their_accounting
assertion `left == right` failed   (snapshots of 12 tables before and after re-posting)
```

`post_into` calls `identity::guard(..., "sale.posted", ...)` — which unconditionally appends to `local_identity_audit` — *before* the replay short-circuit that returns the stored invoice for a repeated operation id. So re-posting the same operation id is idempotent for financial rows but adds a `sale.posted` audit row, and the test's whole-table snapshot sees it. The failing snapshot differs in `local_identity_audit`; financial tables are unchanged.

This is arguably *correct* — a replayed posting is a real access-control event worth recording — but it is not what the test asserts, and the test's intent (that a replay must not double-book money) is worth preserving. **Neither the audit path nor the assertion was altered.** It needs an explicit decision.

### 3.4 Android

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `2e6a643` (green), re-run on `af031dd` |
| Environment | ubuntu-latest, JDK 17 (temurin), Android SDK 35, build-tools 35.0.0, Gradle 8.11.1 |
| Build | **PASS** — `:app:assembleDebug` + `:app:lintDebug` for the review shell, `expo prebuild` + `:app:assembleDebug` for the companion |
| Tests | **PASS** — contract tests (63 checks), companion typecheck, navigation-boundary suite (29 allowed/hostile URL cases) |
| Artifacts | `Sornio-Android-review`, **50 168 802 bytes** — https://github.com/uddieee33-blip/Sornio/actions/runs/43270253648/artifacts (both APKs, SHA-256 recorded in the run log) |
| Limitations | **no emulator run.** Nothing here is on-device acceptance |

Runs: https://github.com/uddieee33-blip/Sornio/actions/runs/43270253648 (review shell, **success**), https://github.com/uddieee33-blip/Sornio/actions/runs/43273212994 (companion, **success**), and re-confirmed on the final commit: https://github.com/uddieee33-blip/Sornio/actions/runs/43288021094 (review shell) and https://github.com/uddieee33-blip/Sornio/actions/runs/43288021082 (companion — `Contracts, types, security`, `Android debug compile` and `iOS simulator compile` all **success** on one run).

`android-review.yml` previously watched only `mobile/android/**`, so the Expo companion — the actual Android product surface — was never built by it. Widened, and the companion gates added. A duplicate artifact upload (my own error) failed the first green build with `409 Conflict`; fixed in `1c476ac`.

### 3.5 iOS

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `5815b0b` |
| Environment | macOS runner `GitHub Actions 1000001438`, **Xcode 26.6**, **iOS Simulator SDK 26.5** (`-sdk iphonesimulator26.5`) |
| Build | **PASS** — `expo prebuild --platform ios`, `pod install`, then `xcodebuild -workspace Sornio.xcworkspace -scheme Sornio -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO … build` |
| Tests | companion contract tests (63 checks), contracts typecheck, companion typecheck, secret scan — all **PASS**; no simulator interaction tests exist |
| Artifacts | build products only (unsigned, simulator slice); no distributable artifact |
| Limitations | simulator compile only. **No physical iPhone acceptance**, no runtime/IPC exercise of the Bonjour module |

Run: https://github.com/uddieee33-blip/Sornio/actions/runs/43279979056 — `iOS simulator compile` **success**; re-confirmed on the final commit in https://github.com/uddieee33-blip/Sornio/actions/runs/43288021082.

Three defects were found here, each only visible by executing:

1. `error: cannot declare conformance to 'NSObjectProtocol' in Swift; 'SornioLanModule' should inherit 'NSObject' instead` — the class conformed to `@objc` delegates without an `NSObject` base.
2. The first fix (`NSObject` added to the class) was rejected: `error: multiple inheritance from classes 'NSObject' and 'BaseModule'` and `error: type 'SornioLanModule' does not conform to protocol 'AnyModule'` — `ExpoModulesCore.Module` already inherits `NSObject` through `BaseModule`.
3. The correct shape, in `5815b0b`: the delegate conformance lives on a private `LanDiscovery: NSObject` helper that owns the browser and service table and reports through closures. The module keeps its definition, events and lifetime, and the JS-visible API (`startDiscovery`, `stopDiscovery`, `probe`, `request`, `onService`, `onDiscoveryStatus`) is unchanged.

**No functional regression was introduced to make this compile** — nothing was deleted or stubbed; the discovery logic moved.

### 3.6 iPadOS

`apps/mobile/app.json` declares `ios.supportsTablet: true` with bundle id `com.sornio.companion`, so tablet support is **declared in configuration**. That is the whole of the verified claim.

* iPad-specific simulator build: **NOT RUN** — no iPad destination was attempted; the existing iOS job uses `generic/platform=iOS Simulator`.
* Tablet navigation, staff management, kitchen queue, supervisor controls, preparation history, session management, persistent recovery on iPad: **NOT VERIFIED**. Several of these have shared-domain tests (EXECUTED, §3.1.1) and native SQL tests (EXECUTED), which is not the same as a tablet UI check.
* Physical iPad: **NOT VERIFIED**, and a successful iPhone-targeted simulator compile would not have counted.

---

## 4. Failed checks and root causes

| Check | Symptom | Root cause | Status |
| --- | --- | --- | --- |
| All workflows, PRs #171–#181 | zero runs | `pull_request` base filters to `main`+dead branches | **FIXED** |
| CI → Lint, types, build | 26 lint errors | `react-hooks/refs` (refs read during render), `set-state-in-effect`, `immutability` in 7 new Phase 18 panels | **FIXED**, verified by passing CI run |
| CI → typecheck / build | 18 × TS5097 | Phase 18 shared sources import `./x.ts`; neither tsconfig allowed it | **FIXED** |
| verify:money / business-domain / checkout | TS5097 before any assertion | same, in the emitted compile step | **FIXED** |
| verify:i18n | 4 "new phrases" that are identifiers | extractor catalogued type-level literals and storage keys as copy | **FIXED** |
| verify:replication | `financial schema remains 12` | literal assertion left behind at schema 22 | **FIXED** (pins version against the migration ladder) |
| Windows `local-windows` | `'pending' is possibly 'null'` reported as "Build bundled frontend failed" | my own ref→state conversion; One-step `tsc && vite build` hid which half failed | **FIXED** |
| Windows / replication native | `cannot update the lock file … --locked` | stale `src-tauri/Cargo.lock` since the LAN-hub phases | **BLOCKED** on crates.io (§3.1.2) |
| iOS simulator compile | exit 65, no diagnostic | missing `NSObject` base class in `SornioLanModule` | **FIXED, awaiting re-run** |
| rustfmt (workspace-browser) | exit 1, no diff shown | annotation exceeded the 65 535-byte cap and was discarded | **FIXED** (capped at 60 KB + file list); the underlying minified Rust formatting is **still unformatted** and the step still fails |
| Dependency audit | exit 1, no detail | output never surfaced (single oversized annotation discarded) | **diagnosis FIXED**: now names `libsqlite3-sys RUSTSEC-2026-0459`, `patched: none`, in both lockfiles — see §6 |
| Android artifact | `409 Conflict` | duplicate upload step | **FIXED**, job now green |
| macOS desktop job | 5 runs, zero jobs, no check-run | a step with `name` but neither `run` nor `uses` invalidates the whole workflow; the rejection surfaces as a bare `push`-event failure | **FIXED**; job now runs on a real runner |
| iOS `NSObjectProtocol` | first fix rejected: multiple inheritance `NSObject` + `BaseModule` | `Module` already inherits `NSObject` | **FIXED** in `5815b0b`; iOS now **PASSES** |
| Windows `local-windows` | exit 101 at step 12, before any Rust compiled | `packages/local-store/Cargo.lock` unresolvable on Windows *and* `src-tauri/Cargo.lock` stale | **FIXED** — native suite now executes (250 pass / 4 fail) |
| macOS `Native tests` | exit 101, no test names | lockfile first; then no annotation capture at all, so the failure was unreadable | **FIXED** — names the failing tests (§5) |
| `Lint, types, build`, `Real PostgreSQL concurrency` | failure at `verify:cargo-lock` | correct gate, stale lockfile | **FIXED** — both **pass** on `ff3a145` |
| `browser` | failure at `cargo fmt --check` | native sources had never been formatted, so the browser acceptance suite never ran | **FIXED** — formatted in `4418035`; suite now executes |
| 11 × migration tests | `table local_held_bills already exists` | frozen `DROP TABLE` literals stopped at v4–v11 while the schema grew to v22 | **FIXED** in `0b12f1c` |
| `schema_rollback` drift test | listed `sqlite_sequence` | SQLite's own bookkeeping is not a schema object | **FIXED** in `ff3a145` |
| Check-run annotations | text silently truncated or replaced | no trailing newline before the next `::error::`, plus unbounded database dumps | **FIXED** in `6f9dbb4`, `dca1b32` |
| `held_checkout_and_completion_are_atomic_and_retry_safe` | `(1,0,1,98750)` vs `(1,0,0,98750)` | payment row written for a cash invoice (§3.3) | **OPEN** — product semantics |
| `phase11a_legacy_…_accounting` | snapshot differs after replay | `identity::guard` audits before the replay short-circuit (§3.3) | **OPEN** — product semantics |
| 2 × Windows-only v11-archive tests | frozen schema / preview mismatch, Windows only | platform-dependent schema text, suspected `ALTER TABLE RENAME` interaction | **OPEN** — instrumented in `dca1b32` |
| `Dependency audit` | exit 1 | `libsqlite3-sys` compiles SQLite **3.46.1**; `patched: none` | **OPEN** — no fixed release (§6.2) |

---

## 5. Corrections implemented

All on `arena/1b1cac28-sornio`, in review as draft PR #182. No merge, no release, no settings change.

`bc24f83` — trigger repair; ICI tsconfig (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`); i18n extractor no longer catalogs type literals / identifier tokens / storage keys; replication schema assertion pinned to the migration ladder; 7 desktop panels' hook violations fixed; `macos-desktop.yml` added; Android workflow widened.
`75afa20` — `KitchenPanel` null-narrowing; `scripts/verify-cargo-lock.mjs` added and wired into `verify:lock`; audit step made diagnosable; Windows build step split.
`1c476ac` — duplicate Android artifact upload removed.
`2e6a643` — macOS job on `macos-latest` and off rustfmt; iOS records Xcode/SDK and annotates build errors; rustfmt annotation capped.
`af031dd` — `NSObject` base class for the iOS LAN module; `verify-cargo-lock` runs early in the replication job.
`fd9dd3e` — this report.
`fd9dd3e` — this report (first draft).
`569e380` — `verify:cargo-lock` becomes its own gate, run early in CI's verify job and in the replication job, instead of being chained into `verify:lock`. Chaining it there stopped the other 24 gates from running at all: one failing check instead of 24 executed ones, which is the opposite of the point.
`5815b0b` — the Bonjour delegate conformance moves to a private `LanDiscovery` helper after `NSObject` on the module was rejected as multiple inheritance.
`1254310` — removes the empty workflow step that made GitHub reject `macos-desktop.yml` outright.

Phase 19B:

`22db580` — a dispatchable, engineering-only `native-lockfile.yml` regenerates both lockfiles where a toolchain and crates.io exist. The review environment has neither (no `cargo`/`rustc`/`rustfmt`; `crates.io`, `index.crates.io` and `static.crates.io` all return `000`), so the resolution must happen on a runner. It uses `cargo metadata` rather than `cargo generate-lockfile` — the latter re-resolves from scratch and would move dependencies nobody asked to move — and publishes to a short-lived review branch so the delta is reviewed before it lands. It also reports the bundled SQLite/SQLCipher version, which is what §6.2 turns on.
`4418035` — the resolved lockfiles, plus the formatter's own output for both native workspaces, isolated in one commit so it can be reverted independently. The lockfile delta is **purely additive**: `packages/local-store` 107 → 113 packages (adding `core-foundation`, `core-foundation-sys`, `security-framework`, `security-framework-sys` for the macOS `keyring` path), `apps/desktop/src-tauri` 451 → 468 (adding `rustls`, `rustls-pemfile`, `mdns-sd` and their trees). **No existing package changed version**, verified by diffing name/version pairs. `--locked` is untouched in every build and test workflow.
`0b12f1c` — the migration-fixture repair (§3.3, §4) and working annotation capture for macOS and the browser job.
`a934a8a` — corrects the drift test's premise and removes a dead version argument.
`6f9dbb4` — module ordering for rustfmt, and the annotation-emitter fix: a command's output carries no trailing newline, so the following `::error::` was being parsed as part of the previous message.
`ff3a145` — excludes SQLite's own `sqlite_%` bookkeeping from the drift test.
`dca1b32` — caps panic-dump line length in three emitters and makes the frozen-schema assertion report the first differing entry instead of printing 123 entries twice.

### On the formatter commit

Formatting 25 Rust files (6 216 changed lines) is a large diff in code no Phase 19 test covers, and the first revision of this report declined to apply it. That was the wrong call, for a reason that only showed up by reading the workflow: `workspace-browser.yml` runs `cargo fmt --check` as its **first** native step, so the entire browser acceptance suite — and the native suite behind it — could never execute until the formatter was satisfied. The change is the formatter's own output with no logic, no rename and no signature change (checked with `git diff -w`), it is its own commit, and it is the only way to obtain the test evidence this phase exists to produce. It is still large enough to deserve separate review.

### On the migration-fixture repair

Eleven of the twelve original native failures were one defect in the *tests*. Each migration test built its historic database by dropping tables and setting `user_version` back to v3–v11, but its frozen `DROP TABLE` literal stopped at the version under test; since the schema grew to v22, the v13–v22 tables survived and the migrator re-ran those phases, failing on `table local_held_bills already exists` before a single assertion ran.

That database state cannot exist: `Store::open` migrates in one transaction, so `user_version` and its tables always move together. **The migrator was not changed.** The per-test literals were deliberately left frozen — each is the record of what the phases above version N created, and quietly extending them would weaken every migration test — and a new `#[cfg(test)]` helper drops only what they miss, with a drift test that fails if a future phase adds a table without listing it. No assertion was removed or relaxed; the tests now assert what they always meant to.

### On the i18n repair

The extractor was the defect, not the catalogue. `hub-trust.ts` declares `type CertificateReview='known'|'first_connection'|…`, and the values are also *returned*, so `first_connection`, `changed_certificate` and `hint_mismatch` entered `en.json` as translatable copy that no screen renders — and the gate then demanded 22 translations of them. `countStorageKey()`'s `` `sornio.count.v1.${…}` `` was admitted the same way. Type-level literals, identifier-shaped tokens (`^[a-z][a-z0-9]*([._][a-z0-9]+)+$`) and machine-shaped templates are now excluded before any copy rule sees them. The catalogue went from 2 755 keys to 2 749 (four phantom keys and two type literals removed, none added) and all 22 locales were pruned with `i18n:prune`, which only deletes retired keys and never translates.

### On the lint repair

Every fix preserves behaviour. Refs that were read during render became state (`SecurityHistoryPanel`, `StaffAccessPanel`, `KitchenPanel` — the last one's `pending` genuinely gates disabled controls, so a ref there could disagree with the committed tree). Effects no longer call `setState` synchronously; results are gated on an unmount flag instead. `RestaurantPayment` declared `amounts`/`setAmounts` below the callbacks that close over them, and its "I accept these prices" acknowledgement is now invalidated in the same update that changes the lines, instead of one render later. `setReady(false)` was dropped from a failure path rather than turned into a cascading render; the panel stays un-ready until a refresh succeeds, which is the same gate.

No assertion was deleted, no rule disabled, no test removed, no `--no-verify`, no encryption/RBAC/financial guard weakened. Two warnings in pre-existing non-Phase-18 files were left alone as out of scope.

---

## 6. Remaining blockers

Ordered by what they block. Each states the precise blocker and the smallest action that clears it.

### 6.1 Two native tests need a product decision, not a patch

`held_checkout_and_completion_are_atomic_and_retry_safe` and `phase11a_legacy_cash_and_credit_only_paths_keep_their_accounting` (§3.3) now fail on both macOS and Windows. They are the only thing standing between the native suite and green, and they cannot be closed by editing a test without answering a business question:

* should a completed held-bill cash sale record a `local_retail_payments` row (the code says yes; the test says no)?
* should an idempotent replay append a `sale.posted` audit row (the code says yes; the test says no)?

**Smallest unblock:** an owner decision on each. If the answer is "the test is the specification", the fix is in `payments::invoice_posted` and `post_into`'s guard placement, and it is a behavioural change to financial and audit code that must not be made silently to get a green badge.

### 6.2 `cargo audit`: identified precisely, not fixable by a version bump

The advisory is now named with an exact mechanism rather than by proxy:

* `libsqlite3-sys 0.35.0` in both lockfiles; advisory **RUSTSEC-2026-0459**, which tracks **CVE-2026-119375 / GHSA-72w2-rjgg-q729** — a *medium*-severity SQLite flaw: "SQLite before 3.54.0 contains an information disclosure vulnerability that allows attackers to read uninitialized page-cache memory by supplying a WAL file with an undersized page size."
* The Rust side ships two amalgamations. At tag `v0.35.0`: `libsqlite3-sys/sqlite3/sqlite3.h` is SQLite **3.49.1**, `libsqlite3-sys/sqlcipher/sqlite3.h` is SQLite **3.46.1** (`2024-08-13 09:16:08`).
* The project enables `bundled-sqlcipher-vendored-openssl`, and `libsqlite3-sys/build.rs` selects the directory via `lib_name()`, which returns `"sqlcipher"` for `sqlcipher`/`bundled-sqlcipher`, then compiles `{lib_name}/sqlite3.c`. **So the code that actually ships is SQLite 3.46.1, not 3.49.1** — nearly a year older than the pinned default and far below the 3.54.0 fixed line.
* `patched: none` is accurate: no `libsqlite3-sys` release carries a fixed SQLCipher amalgamation.

**Exposure, stated honestly:** the precondition is opening an attacker-supplied database *and* WAL file. A shop's store is local and encrypted with SQLCipher, so this is not a remotely triggerable flaw in normal operation. It becomes relevant for any workflow that opens a database file received from elsewhere — most importantly backup *restore* from an untrusted source. That path is guarded by a manifest digest, but the digest is computed by the same library.

**Smallest unblock:** none inside this repository. It requires an upstream `libsqlite3-sys` whose `sqlcipher` amalgamation is ≥ 3.54.0. Retiring a database-encryption advisory on a version bump alone is not acceptable for an offline POS; it needs the full native suite re-run against the bump. Tracked, not fixed. `proc-macro-error` and, newly, `rustls-pemfile` are unmaintained warnings, not failures.

### 6.3 Two Windows-only schema failures are not yet explained

`migration_from_frozen_v11_…` and `version_eleven_backup_…` pass on macOS and fail on Windows. The check record could not say *how* they differ because whole-vector assertions exhausted the annotation budget. `dca1b32` makes the schema comparison report the first differing entry and caps dump line length, so the next Windows run names the difference instead of asserting that one exists. Until that lands, the platform difference is **[UNKNOWN]**, not "a Windows bug".

### 6.4 No physical hardware, no signing

* **Windows installer**: not built (step skipped after the test failure). No install/uninstall, no data-preservation-across-reinstall, no real thermal printer, scanner, cash drawer, or power-loss recovery.
* **macOS**: no signed or notarized artifact, no installed-app launch against a real login Keychain. An unsigned `.app` would be partial evidence and must never be distributed.
* **iPadOS**: unchanged from §3.6 — declared only.
* **iOS**: simulator compile only; the Bonjour module still has never executed.

### 6.5 `workflow_dispatch` is unavailable to this token

The agent's token lacks the `actions` permission, so a run could not be dispatched directly and every cycle cost a commit whose purpose was to trigger CI — and each such commit changed the code under test. The `native-lockfile` job was reached by pushing the workflow file itself, which is why it declares a `push` trigger on that path. `git push` and `gh pr edit` work.

## 7. Artifact locations

| Artifact | Where |
| --- | --- |
| Android APKs (review shell + companion), 50 168 802 bytes | run `43270253648` → `Sornio-Android-review` |
| Regenerated lockfiles | run `43292018168` → `native-lockfiles` (34 759 bytes); review branch `ci/native-lockfile-22db580` |
| Windows job record (250 pass / 4 fail) | run `43309438864` / job `131501297293` |
| macOS job record (252 pass / 2 fail) | `macos` check on `ff3a145` |
| Windows installer | **absent** — step skipped after the test failure |
| macOS `.app` | **absent** — job stops before the bundle step |
| iOS simulator app | build products only, never uploaded |
| Local gate logs | transient (`/tmp/gates/*.log`); every count in §3.1.1 is reproduced by the command beside it |

Check-run annotations are the durable evidence for this phase, because raw job logs are not retrievable for this repository. Every failure quoted above is a verbatim annotation.

## 8. Risks that require physical hardware or an account

* **Physical Windows POS**: installer install/uninstall, data preservation across reinstall, real thermal printing, real barcode scanner, cash drawer, crash-recovery on power loss. No CI here can substitute for these.
* **Physical iPad/iPhone**: tablet layouts, camera scanning, Face ID unlock, real LAN multicast with a shop access point.
* **macOS notarization**: needs an Apple Developer account and credentials; unsigned builds are partial evidence and must never be distributed as a release.
* **Real payment terminals / UPI apps**: the tests assert arithmetic and ledger invariants, not acquirer behaviour.
* **Multi-till concurrency on real shop LAN**: the PostgreSQL suite exercises concurrency against a real server, but not on shop hardware.

---

## 9. GO / NO-GO

**NO-GO for any release of the Phase 18 stack.**

| Area | Verdict | Basis |
| --- | --- | --- |
| Shared web/Linux logic, money, i18n, security invariants | **GO** | 34 gates pass locally on `ff3a145` (754 assertions); `Lint, types, build` and `Real PostgreSQL concurrency` **pass** in CI on the same commit; 52-route production build |
| Android | **PARTIAL — build only** | two APKs built and uploaded; no emulator or device run |
| iOS | **PARTIAL — simulator compile only** | Xcode 26.6 / SDK 26.5 simulator build passes; no interaction tests; the Bonjour module has never executed |
| iPadOS | **NO-GO / UNVERIFIED** | `supportsTablet: true` is declared; nothing else was done |
| macOS | **PARTIAL — native suite executes, 2 failures** | 252 passed / 2 failed; no `.app`, no signing |
| Windows native product | **PARTIAL — native suite executes, 4 failures** | 250 passed / 4 failed; 2 of the 4 are Windows-only; no installer |
| Native Rust (SQLCipher, migrations v1→v22, atomic checkout, RBAC, recovery) | **EXECUTED, 2 cross-platform + 2 Windows-only failures** | first execution of this suite on a runner for the current tree |
| Dependency audit | **FAIL — accepted risk pending upstream** | SQLite 3.46.1 in the shipped SQLCipher build; `patched: none` (§6.2) |
| Replication / PostgreSQL | **GO** | `Real PostgreSQL concurrency` passes; 116 replication checks pass locally |

The change this phase actually produced is that the matrix now **executes**. Before it, four runners stopped at a lockfile before compiling a line of Rust, one Linux job stopped at a lockfile before running a single test, and the browser job stopped at the formatter before running the acceptance suite at all — while the report that said so also wrongly called Linux green. On this revision, every platform that can execute has executed, and every remaining failure has a name and a cause.

What stops a release is unchanged in kind, smaller in number, and now specific:

1. two native tests need a product decision (§6.1), not a patch;
2. two Windows-only schema failures are identified but not yet explained (§6.3);
3. the shipped SQLite build carries an unfixed advisory (§6.2);
4. no installer, no signed or notarized macOS app, no iPad or physical-device evidence (§6.4).

An offline-first POS whose Windows installer has never been built from the current tree, whose iPad UI has never been opened, and whose encryption engine compiles a SQLite release carrying an unpatched CVE is not releasable — however many Linux gates are green.

---

## 10. What changed in this revision, and one retraction

Read this section before citing anything above.

**Retracted:** the first revision recorded Linux as **GO** with "CI `Lint, types, build` passed on this tree". That was true of `bc24f83` and false of the commit that actually shipped. On `08fcbc8`, `Lint, types, build`, `Real PostgreSQL concurrency` and `browser` were all red, and `browser` had never executed its suite. The verdict is now backed by runs on `ff3a145`, and the discrepancy is tabulated in §3.1.

**Corrected:** the first revision described the lockfile blocker as "BLOCKED on crates.io" and left it there. It is fixed (§5), and the fix converted four blocked runners into executing ones.

**Corrected:** the first revision said the native Rust suite was BLOCKED and could not be reported. It has now been executed on two platforms: 252 pass / 2 fail on macOS, 250 pass / 4 fail on Windows.

**Corrected:** the first revision declined to apply rustfmt and reported formatting as a blocker. Applying it was necessary for any of the above to execute (§5).

**Corrected:** the first revision attributed the audit finding to a `sqlcipher-src` crate. No such crate is in either lockfile; the amalgamation ships inside `libsqlite3-sys`, and the compiled version is **3.46.1**, not the 3.49.1 default (§6.2).

**Still true, and still not claimed:** no physical iPhone, iPad or Windows POS hardware was touched; no installer, signed macOS app or notarized artifact exists; Android has never run on an emulator; the iOS Bonjour module has never executed; iPadOS is unverified.
