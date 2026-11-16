# Phase 22C — Executing the remaining release gates

**Status: PARTIALLY VERIFIED.** This document reports what ran, on which runner, at
which commit, and what it proved. It is not a plan.

| Field | Value |
|---|---|
| Code candidate under test | `78837b09` (PR #188 head, schema v23) |
| Report commit | `c59affa` (PR #189 head — the report, and nothing else) |
| This phase's branch | `arena/d1032a24-sornio`, based on `hardening/phase22-native-recovery-20261116` |
| This phase's PR | #190 (draft, isolated) |
| Report PR | #189 — retargeted from `main` to PR #188's branch; diff is 1 file / 241 insertions |

## 1. Corrections to Phase 22B

Phase 22B published documentation. Its own description claimed two things that the
GitHub API contradicts:

| Phase 22B claim | Measured |
|---|---|
| "Installed Windows purchasing lifecycle: NOT RUN (no Windows runner)" | **False.** `windows-latest` runners execute this repository's installed-app acceptance. Run [43759908030](https://github.com/uddieee33-blip/Sornio/actions/runs/43759908030) was executing `Verify installed offline app, recovery and lifecycle preservation` at `78837b09` while that text was published. |
| "Installed macOS purchasing GUI: NOT RUN (no macOS host)" | **Partly false.** `macos-latest` runs succeed here (e.g. [43763847139](https://github.com/uddieee33-blip/Sornio/actions/runs/43763847139)). What is missing is a macOS UI driver, not a host. |

What is genuinely blocked is narrower: this sandbox has no `cargo`/`rustc` and no
route to `crates.io`, so native execution can only happen in CI.

PR #189 also showed 375 changed files because it targeted `main`. `78837b09` is an
ancestor of `c59affa` and the two are exactly one commit apart, so retargeting it to
`hardening/phase22-native-recovery-20261116` reduced the review to the report alone.

## 2. Runner availability (Priority 2)

| Question | Answer | Evidence |
|---|---|---|
| Are GitHub-hosted Windows runners available? | **Yes** | 15+ `windows-latest` jobs in this phase, each reaching step 22 |
| Are GitHub-hosted macOS runners available? | **Yes** | 5 successful `macos-latest` (arm64, Xcode 26.6) runs; runner names `GitHub Actions 1000002666/2671/2674` |
| Workflow dispatch available? | Yes as a trigger; **not usable by this integration** | `POST /actions/runs/{id}/cancel` and the permissions endpoint return 403, so runs cannot be dispatched or cancelled programmatically from here |
| Billing eligibility readable? | **No** | `GET /users/.../settings/billing/actions` → 403. Allocation is evidenced empirically by jobs running to completion instead |
| Prior run artifacts readable here? | **No** | Artifacts and raw logs are served from `*.blob.core.windows.net`, outside this sandbox's network allowlist |

The last row is why the harness now emits verdicts as **workflow annotations**. An
annotation is readable through the checks API; a log tail is not.

### A gate that would have run nowhere

`windows-local.yml` and `macos-desktop.yml` filter `pull_request.branches` on the
**base** branch. PR #190's base is `hardening/phase22-native-recovery-20261116`,
which was not listed — so every change in this phase would have produced no Windows
or macOS result at all. Both filters now list that base, and the macOS one also
watches `scripts/check-phase22-macos-installed.py`. Verified: both workflows started
on the first push after the fix.

## 3. macOS installed-app acceptance — executed

New on this branch: `scripts/check-phase22-macos-installed.py`, plus a workflow step.
It copies the built `.app`, launches it, and asserts the Keychain-backed device key
provisioned an **encrypted** workspace.

| Assertion | Verdict |
|---|---|
| Bundle installed to a fresh path, byte-identical to the built bundle | **PASS** |
| Installed application launches and survives 10 s | **PASS** |
| Keychain device key provisioned a workspace at `app_local_data_dir()` | **PASS** |
| Workspace is not plaintext SQLite | **PASS** |
| Purchasing lifecycle driven through the UI | **BLOCKED** |
| Signed / notarized distribution | **BLOCKED** |

Runs: [43766147854](https://github.com/uddieee33-blip/Sornio/actions/runs/43766147854) (`90bf7d5`),
[43768285010](https://github.com/uddieee33-blip/Sornio/actions/runs/43768285010) (`8268ee8`),
[43771459864](https://github.com/uddieee33-blip/Sornio/actions/runs/43771459864) (`d1250ec`),
[43777130158](https://github.com/uddieee33-blip/Sornio/actions/runs/43777130158) (`fd242bd`),
[43781963683](https://github.com/uddieee33-blip/Sornio/actions/runs/43781963683) (`13dbfba`).

**A claim I had to withdraw.** My first version of the probe's workflow comment said a
hosted runner "cannot be granted Accessibility non-interactively". The runner reports
`UI elements enabled` as **true**. The permission is available; the missing piece is
that no macOS UI automation driver exists in this repository. That distinction decides
whether the remaining work is authoring or hardware, and it is authoring.

## 4. Windows installed-app acceptance — executed, and where it stops

Every purchasing assertion below **passed on the installed release application in CI**.
The evidence is positional and reliable: the step failed *after* them, and the failing
frame is a file-dialog helper that runs later.

Executed and passed at `78837b09`, `c59affa` and again on this branch:

| Scenario | Assertion | Verdict |
|---|---|---|
| Supplier creation | "Supplier saved.", statement renders | **PASS** |
| Supplier archive and restore | both directions against the native store | **PASS** |
| Purchase order creation | `PO-1 · Draft` | **PASS** |
| Submit and approve | `Awaiting approval` → `Approved` | **PASS** |
| Partial receiving, damaged excluded | `PO-1 · Partially received`, payable **₹75.00** | **PASS** |
| Restart in the middle of the lifecycle | after forced kill and relaunch: payable **₹75.00 exactly once**, order still partially received | **PASS** |
| Supplier invoice with variance | payable **₹80.00** | **PASS** |
| Supplier partial payment | payable **₹50.00** | **PASS** |
| Supplier return | "Return recorded for ₹25.00", payable **₹25.00** | **PASS** |
| Full receiving | `PO-1 · Received`, payable **₹125.00** | **PASS** |
| Order close and second restart | `PO-1 · Closed`, payable **₹125.00** after relaunch | **PASS** |

Not executed, because the step fails here:

| Scenario | Verdict |
|---|---|
| Encrypted backup export through the OS picker | **FAIL** (harness, open) |
| Post-backup payment (₹105.00) | **NOT RUN** |
| Payable settled to exactly ₹0.00 | **NOT RUN** |
| Restore from the encrypted backup | **NOT RUN** |
| Authoritative store audit | **NOT RUN** |

### The blocker is the OS save dialog, not purchasing

`pick_native_file` drives the native Save/Open dialog. At the purchasing export it
never closes. Three attempts were measured, none resolved it:

1. **Single shot** (the original): one click, then `wait_not(visible, 45)`. Failed at
   `78837b09` ([43759908030](https://github.com/uddieee33-blip/Sornio/actions/runs/43759908030)).
2. **Retry with the same handle**: four attempts, 15 s each. Still failed
   ([43777130146](https://github.com/uddieee33-blip/Sornio/actions/runs/43777130146)).
3. **Re-resolve by title and visibility, preferring the newest match**: this exposed a
   defect in my own patch — `Desktop().windows()` returns `UIAWrapper`, which has no
   `wait_not`, so the run failed instantly with `AttributeError`
   ([43781963670](https://github.com/uddieee33-blip/Sornio/actions/runs/43781963670)).
   Fixed by polling visibility with `wait_until`
   ([43786929707](https://github.com/uddieee33-blip/Sornio/actions/runs/43786929707)).
   That run confirms the fix works — the `AttributeError` is gone and the loop
   genuinely retried — and confirms the dialog still does not close: six attempts with
   a fresh handle each, 60 s in total, `TimeoutError`.

The traceback names the **purchasing** export (`check-native.py` line 1034). The retail
export (line 583) and the retail open dialog (line 617) both complete earlier in the
same process on the same runner. So the native dialog driver works twice and fails on
the third invocation, which is the first one to happen after the application has been
stopped and relaunched. That remains open, and it is the single thing standing between
this harness and the store audit.

## 5. Defects found by running, and corrected

| # | Defect | How it was found | Fix |
|---|---|---|---|
| C1 | Evidence recorded the **synthetic merge commit**, not the source. The macOS probe reported `sha=0498ec1e…` for a run whose head was `90bf7d5`. | Reading the probe's own annotation | Both workflows pass `github.event.pull_request.head.sha`; all four evidence writers prefer it and keep the merge commit under its own key |
| C2 | `--verify-preserved` pinned rice at **1.5 pcs**, a figure from before the purchasing lifecycle existed. The lifecycle receives 1.750 and returns 0.250, so that assertion could never hold on a preserved workspace. It had never run, because the check failed earlier. | Reading the check against the lifecycle | Stock is no longer asserted from the UI; the preserved stage asserts cash and credit, and stock is verified from the store |
| C3 | The base-branch filter meant this work would have run **no** Windows or macOS job | Comparing the PR base against the filter | Both filters list `hardening/phase22-native-recovery-20261116`; verified by the runs starting |
| C4 | I asserted a product's stock from a UI that cannot attribute it. WebView2 exposes a quantity as a bare number (`1.75`, `1.5`, `4`) with no item name; the name and the figure are separate accessibility nodes. | Two failed runs; my own first diagnosis read the expected string out of the assertion message and was wrong | Three GUI stock assertions removed with the reason recorded in place; reconciliation moved to the store audit, which also asserts accepted/damaged/returned quantities that need no baseline |
| C5 | `wait_not` called on a `UIAWrapper` | Instant `AttributeError`, with the traceback in the annotation | Visibility polled with `wait_until`; verified fixed — the next run retried instead of raising |

## 6. Authoritative persisted-state audit — authored, not executed

`apps/desktop/check-purchasing-store.py` opens the workspace the installed binary left
behind through the product's own `device::initialize`, so the OS credential store
supplies the real device key, and asserts:

- the supplier row, the purchase order, both goods receipts, the damaged total, the challan references and the purchase return;
- the full payable ledger — `[7500, 500, -3000, -2500, 10000]` with running balances `[7500, 8000, 5000, 2500, 12500]` and closing `12500`;
- accepted (`750 + 1000`), damaged (`250`) and returned (`250`) quantities, and the net stock movement they imply;
- the rice product row, and that the workspace is not plaintext SQLite.

`cashier_review_bridge` gained a device-key mode for this. Without the new environment
variable it is exactly the previous fixture and never mixes the synthetic key with a
real database.

**It has not run.** It sits after the failing step. It is authored, wired and
compiles, and that is all that can be claimed for it.

## 7. Final matrix

| Area | Verdict | Basis |
|---|---|---|
| Supplier creation, archive, restore (installed Windows app) | **PASS** | run 43759908030 and successors |
| Purchase order create / submit / approve | **PASS** | same |
| Partial receiving with damaged excluded from stock and payable | **PASS** | payable ₹75.00 |
| Full receiving | **PASS** | payable ₹125.00 |
| Supplier partial payment | **PASS** | ₹80.00 → ₹50.00 |
| Supplier return | **PASS** | ₹25.00 |
| Restart and transaction recovery *mid*-lifecycle | **PASS** | ₹75.00 exactly once; order still partially received |
| Payable reconciliation | **PASS** | ₹75 → ₹80 → ₹50 → ₹25 → ₹125 across UI and restarts |
| Inventory reconciliation | **BLOCKED** (authored) | store audit not reached; UI cannot attribute a figure to a product |
| Full settlement to ₹0.00 | **NOT RUN** | behind the dialog failure |
| Encrypted backup export / restore | **FAIL** (harness) | OS dialog does not close |
| Authoritative store audit | **NOT RUN** | behind the dialog failure |
| macOS install, launch, Keychain device key, encryption at rest | **PASS** | 5 runs |
| macOS purchasing lifecycle | **BLOCKED** | no macOS UI driver authored; Accessibility *is* available |
| macOS signed / notarized distribution | **BLOCKED** | no Apple identity in CI |
| Android emulator acceptance | **NOT RUN** | `android-review.yml` compiles on `ubuntu-latest` only; no emulator job exists |
| iOS / iPad simulator acceptance | **PASS** (non-purchasing) | `mobile.yml` simulator matrix; the suites cover navigation, dashboard, sign-out, restaurant and empty state — **no purchasing coverage** |
| Physical Android, iPhone, iPad | **BLOCKED** | no hardware |
| LAN / multi-device | **BLOCKED** | requires two physical devices |
| TLS pinning, device revocation, power loss | **BLOCKED** | requires hardware |
| Multi-hour endurance | **NOT RUN** | not attempted, not claimed |

### Simulator evidence is not device evidence

The iOS suites run on `macos-latest` simulators and pass. They exercise navigation and
session behaviour. They do not exercise purchasing, and nothing here should be read as
a physical iPhone or iPad result. Android has no emulator job at all.

## 8. What is *not* claimed

- Authored test counts are 325 Rust `#[test]` functions in `packages/local-store`. **Executed counts are not retrievable from this environment**, because raw logs and artifacts are served from storage outside the sandbox's allowlist. Only per-step outcomes, annotations and run metadata are readable, and the matrix is built from those.
- No merge, no deployment, no release, no store submission.
- No claim of physical-device, LAN, or endurance verification.

## 9. Follow-ups this phase creates

1. Fix `pick_native_file` for the purchasing export — the last thing standing between the harness and the store audit.
2. Emit `::notice::` counts from `cargo test` so executed test counts survive log expiry.
3. Author an iOS simulator purchasing flow against a live hub, now that it is known the missing piece is a driver rather than a permission.
4. Add an Android emulator job; hosted runners support KVM.
