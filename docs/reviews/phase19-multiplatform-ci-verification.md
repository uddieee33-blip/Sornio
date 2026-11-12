# Phase 19 — multiplatform CI execution, recovery and verification

Date: 2026-11-12
Branch under test: `arena/1b1cac28-sornio` (based on `feature/phase18j-security-history` @ `f9680015b9953454e3eae7d8980b14ee87fc83c0`)
Pull request: **#182** (draft, base `feature/phase18j-security-history`) — https://github.com/uddieee33-blip/Sornio/pull/182

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
| Source | `arena/1b1cac28-sornio` @ `af031dd` (and local execution of the same tree) |
| Environment | ubuntu-latest (GitHub runner) for CI; Debian 12, x86_64, Node 22.22.3, 2 vCPU for local runs |
| Build | **PASS** — `npm run build` completes (Next.js 16.4.3) |
| Lint | **PASS** — 0 errors, 5 warnings (was 26 errors) |
| Types | **PASS** — TS 6.0.3 and tsgo 7.0.2 both report no errors (was 18 × TS5097) |
| Tests | **EXECUTED**, counts in §3.1.1 |
| Limitations | Native Rust tests and the PostgreSQL concurrency suite are blocked (§3.1.2) |

CI: `Lint, types, build` — https://github.com/uddieee33-blip/Sornio/actions/runs/43267295246/job/131354185906 — **passed** on `bc24f83`, including `npm run verify` and `npm run build`. It now fails on `af031dd` for the reason in §3.1.2, by design.

#### 3.1.1 Locally executed test counts (same tree, real assertions)

| Suite | Command | Result |
| --- | --- | --- |
| Shared-domain behavioural tests | `node packages/business-domain/test-*.mjs` (20 files) | **91 passed, 0 failed** |
| Native SQL semantics (Python/SQLite) | `python3 scripts/test-*.py` (15 files) | **15/15 exit 0** |
| Desktop payment allocation/receipt/scan | `npm run test:split-payments --prefix apps/desktop` | **20 passed, 0 failed** |
| Windows evidence contract | `python3 -m unittest test_windows_evidence.py` | **16 passed** (needs Pillow 12, installed in a venv) |
| Install data preservation helper | `python3 -m unittest test_install_data.py` | **4 passed** |
| Mobile contracts | `npm run verify:mobile-contracts` | **63 checks passed** |
| `npm run verify` (31 gates) | see §7 | **PASS** end to end |

Selected gate contents from `npm run verify` (all EXECUTED locally): billing 25, accounting 64, security 53 invariants over 248 source files, import 20, team 16 guards, team-database, PWA 17, render, recovery 24, database 38, reliability 59, local-schema 92 checks, desktop-contract 38, money 12 (incl. 4 820 randomised invoices against the Rust formula), Windows release-identity 40, replication 116, i18n 22 catalogues × 2 749 phrases.

#### 3.1.2 BLOCKED — native Rust and PostgreSQL concurrency

`Real PostgreSQL concurrency` fails at the new *"Verify native lockfiles describe their manifests"* step:

```
apps/desktop/src-tauri/Cargo.lock does not contain mdns-sd (dependencies),
rustls (dependencies), rustls-pemfile (dependencies)
```

This is a real repository defect, not infrastructure. `apps/desktop/src-tauri/Cargo.toml` gained `rustls`, `rustls-pemfile` and `mdns-sd` during the LAN-hub phases, and `Cargo.lock` was never regenerated — `git log -S'name = "mdns-sd"' -- apps/desktop/src-tauri/Cargo.lock` returns nothing, so no correct lock has ever been committed. Every `cargo … --locked` invocation fails, which is why Windows native tests and the PostgreSQL native exporter both stopped after a toolchain install.

**Smallest action that unblocks it** (needs crates.io, which this environment cannot reach — `index.crates.io`, `static.crates.io` and `crates.io` are all unreachable from the sandbox):

```
cargo generate-lockfile --manifest-path apps/desktop/src-tauri/Cargo.toml
git add apps/desktop/src-tauri/Cargo.lock && git commit -m "Regenerate the stale Tauri lockfile"
```

Do **not** relax `--locked` to make this green. That would trade a caught defect for a silent dependency change.

`cargo test` for `packages/local-store` (207 `#[test]`s: SQLCipher, migrations v1→v22, atomic checkout, cash/UPI/card/split, credit, hold/resume, inventory, refunds, barcode, kitchen persistence, RBAC, durable recovery, backup/restore) is **BLOCKED** by the same missing toolchain/network in this sandbox. It is not reported as passing anywhere.

### 3.2 Windows — native POS

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `af031dd`; run inspected @ `2e6a643` |
| Environment | `windows-latest`, x86_64, Strawberry Perl selected for vendored OpenSSL |
| Build | Frontend **PASS** (`tsc --noEmit` then `vite build`); native build **BLOCKED** |
| Tests | **NOT RUN** — native step stopped on the stale lockfile (§6, blocker 1) |
| Artifacts | none produced |
| Limitations | installer, installed-app startup, uninstall/reinstall preservation: **NOT VERIFIED** |

Run: https://github.com/uddieee33-blip/Sornio/actions/runs/43284416636 (job `local-windows`), plus the earlier https://github.com/uddieee33-blip/Sornio/actions/runs/43273212555.

Latest result on `1254310`: `tsc --noEmit` and `vite build` **PASS**, then:

```
error: cannot update the lock file D:\a\Sornio\Sornio\packages\local-store\Cargo.lock
because --locked was passed to prevent this
```

That is the lockfile defect appearing on the *second* crate set as well —
`packages/local-store` resolves differently on Windows than on Linux because
its `keyring`/`fs2`/`zeroize` dependencies are declared under
`[target.'cfg(windows)'.dependencies]`. Fixing `apps/desktop/src-tauri` alone
will not be enough; `packages/local-store/Cargo.lock` must be regenerated with
the Windows target in play (a Windows or cross-target `cargo generate-lockfile`).
This is now the single highest-value unblock in the whole matrix: it stops
Windows native tests, the Windows installer, macOS native tests and the
PostgreSQL native exporter, on four separate runners.

Two genuine defects were found and fixed on the way: first, `apps/desktop` had a real type error (`'pending' is possibly 'null'` — my own ref→state conversion) that the Windows job reported as "Build bundled frontend failed"; `tsc --noEmit` and `vite build` are now separate steps. Second, the run then failed inside `cargo test --locked` with `cannot update the lock file … because --locked was passed` — the same stale-lockfile defect, and the first time it has been attributed to the right cause.

**Do not confuse this with `windows-desktop.yml`** (hosted WebView2 preview, manual-only, online-only). It is not the product and was not used as evidence here.

### 3.3 macOS — desktop application

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `1254310` |
| Environment | macOS runner (`macos-latest`), toolchain recorded by the job |
| Build | Frontend **PASS**; native **BLOCKED** at `Native tests (debug profile)` |
| Tests | **did not run** — stopped by the stale lockfile (§6, blocker 1) |
| Artifacts | unsigned `.app`, if the bundle step passes |
| Limitations | **no signing, no notarization**; an unsigned `.app` is partial engineering evidence and is not a distributable macOS release |

There was **no macOS desktop workflow in the repository at all** before this phase: `desktop:build:macos` and `src-tauri/tauri.macos.conf.json` existed and had never been exercised.

Getting it to run at all took five attempts, and the reason was not runner capacity:

* four runs on `macos-14` were cancelled with zero steps and no runner assigned;
* switching to `macos-latest` did not help, which was the clue;
* the actual cause was a malformed file — an edit had removed a step's `run:` body while leaving its `- name:` behind, so one step had neither `run` nor `uses`. **GitHub rejects the entire workflow for that**, and because the file only declares `pull_request`/`workflow_dispatch`, the rejection surfaced as a `push`-event failure with an empty job list (`total_count: 0`) and no check-run, which reads exactly like "no runner available".
* `1254310` removes the empty step. The workflow now schedules and the job is assigned a runner.

That a second macOS job (`iOS simulator compile`) was getting a runner all along is what ruled out capacity.

### 3.4 Android

| Field | Value |
| --- | --- |
| Source | `arena/1b1cac28-sornio` @ `2e6a643` (green), re-run on `af031dd` |
| Environment | ubuntu-latest, JDK 17 (temurin), Android SDK 35, build-tools 35.0.0, Gradle 8.11.1 |
| Build | **PASS** — `:app:assembleDebug` + `:app:lintDebug` for the review shell, `expo prebuild` + `:app:assembleDebug` for the companion |
| Tests | **PASS** — contract tests (63 checks), companion typecheck, navigation-boundary suite (29 allowed/hostile URL cases) |
| Artifacts | `Sornio-Android-review`, **50 168 802 bytes** — https://github.com/uddieee33-blip/Sornio/actions/runs/43270253648/artifacts (both APKs, SHA-256 recorded in the run log) |
| Limitations | **no emulator run.** Nothing here is on-device acceptance |

Runs: https://github.com/uddieee33-blip/Sornio/actions/runs/43270253648 (review shell, **success**), https://github.com/uddieee33-blip/Sornio/actions/runs/43273212994 (companion: `Contracts, types, security` **success**, `Android debug compile` **success**).

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

Run: https://github.com/uddieee33-blip/Sornio/actions/runs/43279979056 — `iOS simulator compile` **success**.

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
| Dependency audit | exit 1, no detail | `cargo audit` output never surfaced | step now annotates the advisory; the audit itself still fails — see §6 |
| Android artifact | `409 Conflict` | duplicate upload step | **FIXED**, job now green |
| macOS desktop job | 5 runs, zero jobs, no check-run | a step with `name` but neither `run` nor `uses` invalidates the whole workflow; the rejection surfaces as a bare `push`-event failure | **FIXED**; job now runs on a real runner |
| iOS `NSObjectProtocol` | first fix rejected: multiple inheritance `NSObject` + `BaseModule` | `Module` already inherits `NSObject` | **FIXED** in `5815b0b`; iOS now **PASSES** |

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

### On the i18n repair

The extractor was the defect, not the catalogue. `hub-trust.ts` declares `type CertificateReview='known'|'first_connection'|…`, and the values are also *returned*, so `first_connection`, `changed_certificate` and `hint_mismatch` entered `en.json` as translatable copy that no screen renders — and the gate then demanded 22 translations of them. `countStorageKey()`'s `` `sornio.count.v1.${…}` `` was admitted the same way. Type-level literals, identifier-shaped tokens (`^[a-z][a-z0-9]*([._][a-z0-9]+)+$`) and machine-shaped templates are now excluded before any copy rule sees them. The catalogue went from 2 755 keys to 2 749 (four phantom keys and two type literals removed, none added) and all 22 locales were pruned with `i18n:prune`, which only deletes retired keys and never translates.

### On the lint repair

Every fix preserves behaviour. Refs that were read during render became state (`SecurityHistoryPanel`, `StaffAccessPanel`, `KitchenPanel` — the last one's `pending` genuinely gates disabled controls, so a ref there could disagree with the committed tree). Effects no longer call `setState` synchronously; results are gated on an unmount flag instead. `RestaurantPayment` declared `amounts`/`setAmounts` below the callbacks that close over them, and its "I accept these prices" acknowledgement is now invalidated in the same update that changes the lines, instead of one render later. `setReady(false)` was dropped from a failure path rather than turned into a cascading render; the panel stays un-ready until a refresh succeeds, which is the same gate.

No assertion was deleted, no rule disabled, no test removed, no `--no-verify`, no encryption/RBAC/financial guard weakened. Two warnings in pre-existing non-Phase-18 files were left alone as out of scope.

---

## 6. Remaining blockers

1. **Stale native lockfiles — the single highest-value unblock.** `apps/desktop/src-tauri/Cargo.lock` is missing `rustls`, `rustls-pemfile`, `mdns-sd` (three LAN-hub phases never re-locked), *and* `packages/local-store/Cargo.lock` does not resolve on Windows, where `keyring`/`fs2`/`zeroize` are declared under `[target.'cfg(windows)'.dependencies]`. This one defect blocks **four** runners: Windows native tests and installer, macOS native tests and `.app`, the PostgreSQL native exporter, and the SQLCipher/encryption suites that are the core of an offline-first POS.

   ```bash
   cargo generate-lockfile --manifest-path apps/desktop/src-tauri/Cargo.toml
   cargo generate-lockfile --manifest-path packages/local-store/Cargo.toml   # with a Windows/cross target in play
   git add packages/local-store/Cargo.lock apps/desktop/src-tauri/Cargo.lock
   ```

   `scripts/verify-cargo-lock.mjs` now exists so a stale lock cannot recur silently; it fails today, deliberately, and names the manifest and the crates.
2. **`cargo audit` failure** — the audit job still exits 1 and its findings cannot be read from here: raw job logs are served from `productionresultssa*.blob.core.windows.net`, which this sandbox cannot reach (TLS connection closed), and check-run annotations carried only "exit code 1". Both lockfiles show **no** matching advisory from the GitHub Advisory Database (4 180 Rust advisories cross-checked against 107 + 451 locked packages, including `tokio 1.54.1` which is past GHSA-5wjr-9356-4wc8). The remaining explanations — an advisory newer than the database snapshot, or `cargo audit` erroring rather than reporting — are not distinguishable from the available evidence. The step now annotates the advisory, crate and fix, so the next run will say.
3. **macOS workflow not scheduled** (§3.3) — four runs cancelled with no runner.
4. **Rust formatting** — the repository's Rust sources are minified (build.rs command lists, per-line match arms in `hub_discovery.rs`). `cargo fmt` would reformat them; that is a large diff in code no Phase 19 test covers, so it is reported, not applied.
5. **`workflow_dispatch` unavailable in this environment** — the agent's token lacks the `actions` permission, so re-running a specific job had to go through a new push. `git push` and `gh pr create/edit` do work.
6. **iOS simulator interaction tests do not exist**, for iPhone or iPad. The iOS job compiles; it does not drive the UI.

---

## 7. Artifact locations

| Artifact | Where |
| --- | --- |
| Android APKs (review shell + companion), 50 MB | run `43270253648` → `Sornio-Android-review` |
| Android APK, companion | run `43273212994` → upload step `success` |
| Native outbox envelopes, PostgreSQL concurrency | **absent** — job blocked at step 4 |
| Windows installer | **absent** — never built |
| macOS `.app` | **absent** — job never scheduled |
| iOS simulator app | **absent** — build failed, fix unverified |
| Local gate logs | `/tmp/verify-final.log`, `/tmp/domain-counts.txt`, `/tmp/py-tests.txt` (transient; the commands in §3.1.1 reproduce them) |

---

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
| Shared web/Linux logic, money, i18n, security invariants | **GO** (evidence-backed) | `npm run verify` passes end to end locally; CI `Lint, types, build` passed on this tree; 91 domain tests, 15 native-SQL suites, 63 mobile contracts |
| Android | **PARTIAL — build only** | two APKs built and uploaded; no emulator or device run |
| iOS | **PARTIAL — simulator compile only** | Xcode 26.6 / SDK 26.5 simulator build passes; no interaction tests, no device run; the module has never executed |
| iPadOS | **NO-GO / UNVERIFIED** | `supportsTablet: true` is declared; no iPad destination was built, no tablet UI test exists |
| macOS | **NO-GO — BLOCKED** | workflow now schedules and the frontend builds; native tests blocked by the lockfile, so no `.app` |
| Windows native product | **NO-GO — BLOCKED** | frontend builds; native tests and installer blocked by the stale lockfile |
| Replication / PostgreSQL | **BLOCKED** | concurrency job cannot reach the native tests |

The stack's financial and security assertions are the strongest part of the evidence and they pass. The stack is much better instrumented than it was: eleven PRs that produced zero CI runs now produce real results, three source defects that no static gate could see have been fixed, and every remaining failure names its cause. But an offline-first POS whose Windows installer has never been built from the current tree, whose native encryption tests cannot execute on four runners, and whose iPad UI has never been opened is not releasable — regardless of how many Linux gates are green.
