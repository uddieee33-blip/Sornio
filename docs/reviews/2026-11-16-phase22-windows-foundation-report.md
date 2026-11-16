# Phase 22 — Windows Foundation & Release Stabilization

**Branch:** `arena/9bbe1260-sornio` (from `main` at `1cc5c79`)  
**Head under test:** `ab6b5a6` (merged `9ee6c23` + harness fix `fbb4d55` + rustfmt `ab6b5a6`)  
**Source origin merged:** `hardening/phase22-native-recovery-20261116` at `78837b0` (schema v23, PR #188) and `validate/phase22d-9ee6c23` at `9ee6c23` (PR #197 dialog fix)  
**Date:** 2026-11-16  
**Mode:** Real engineering execution, defect correction, native verification  
**PR:** [#198](https://github.com/uddieee33-blip/Sornio/pull/198) targeting `main`

Every claim below is supported by executable evidence or named as BLOCKED/NOT RUN. No merge, release or deployment is claimed.

---

## 1. Executive summary and verdict

**Current verdict: IN PROGRESS — harness defect corrected, CI queued, Windows acceptance pending fresh green.**

The correct integration candidate is the purchasing-capable **schema v23** stack from `hardening/phase22-native-recovery-20261116` (`78837b0`), which includes:

- Native financial invariants (atomic paise, exactly-once, recovery, RBAC)
- Supplier purchasing lifecycle (PO → receiving with damaged quantity excluded → invoice variance → partial/full payments → returns → close → forced restart recovery → encrypted export)
- Backup export/restore through the OS Save/Open dialogs, exercised as installed app via `pywinauto` `Application(backend=\"uia\")` + `Desktop(backend=\"uia\")`
- Cross-platform separation: `packages/local-store` (Rust/SQLCipher), `packages/business-domain`, Tauri commands, platform-specific UI.

The previous Windows validation PR #197 at `9ee6c23` still failed. The root cause was **not** the dialog heuristic alone:

- **Dialog heuristic defect (fixed at 9ee6c23):** The driver answered *any* `#32770` window with an OK button as a file-replace prompt. On the hosted runner it clicked **System Properties** (a shell window unrelated to the export) six times, losing focus from the Save dialog. Fix: `REPLACE_PROMPT_TITLES = (\"confirm save as\",\"confirm file replace\",\"confirm replacement\",\"confirm overwrite\")` matched on title only; unknown modals are never clicked, only recorded.
- **Harness layout defect (fixed at fbb4d55):** The backup panel sits at the bottom of a page that now contains the Supplier panel (30+ buttons). The tab loop limit of **240** was set before purchasing existed. Run `43857331854` at `9ee6c23` failed at `activate(\"Export encrypted backup…\")` after passing \"Save CA settlement CSV\" and \"Suppliers & purchases\" — the target exists but 240 TABs did not reach it. Fix: raise to **600** and include truncated visible copy in the error for triage.

A third defect was **rustfmt** drift in `cashier_review_bridge.rs` and `phase22_reliability_tests.rs` after the merge (CI step “Check native Rust formatting” failed). Fixed at `ab6b5a6` with no logic change.

Two CI runs are queued on this head (`4a87717` and `ab6b5a6`) and are currently **in_progress** for Windows, macOS, browser, CI, Replication and Mobile. Verdict will update when they complete. Until then, financial correctness is evidenced by local schema verification, contract tests and the *previous* run’s partial evidence (see §5–6).

**Not claiming:** pilot-ready or production-ready. The installed-app gate must turn green on this head before either.

---

## 2. Source branch, commit SHA and integration dependencies

| Item | Value |
|---|---|
| Base commit | `1cc5c79` Merge PR #145 (main) |
| Integration stack head merged | `78837b094cf6242cb270377571b9d8213a7f2812` — PR #188 “Phase 22: correct-stack purchasing recovery fixes” |
| Dialog fix merged | `9ee6c238b8cf1c2c90d21e0a558018c6aa2d9419` — PR #197 “answer only a titled file-replace prompt” |
| Harness fix | `fbb4d55` — raise tab limit 240→600 |
| Formatting fix | `ab6b5a6` — rustfmt bridge + reliability tests |
| Current branch head | `ab6b5a6` on `arena/9bbe1260-sornio` |
| PR | [#198](https://github.com/uddieee33-blip/Sornio/pull/198) → `main` |
| Schema version verified | **23** (`SCHEMA_VERSION = 23` in `packages/local-store/src/lib.rs`, migration chain 0→23) |
| Ancestry | `1cc5c79` ← merge `78837b0` (which ← `c5eb40b` ← `fe2f89e` ← … ← `4c8841d`) ← `9ee6c23` ← `fbb4d55` ← `ab6b5a6` |

### Branch graph audited

```
origin/main                               1cc5c79
origin/hardening/phase22-correct-stack     fe2f89e (alternative, superseded by 78837b0's doc fixes)
origin/hardening/phase22-native-recovery  78837b0 (authoritative: purchasing hardening + acceptance)
origin/validate/phase22d-9ee6c23           9ee6c23 (dialog fix on top of 78837b0)
arena/9bbe1260-sornio (this work)          ab6b5a6 = 9ee6c23 + 240→600 + rustfmt + concurrency
```

Unique changes preserved:

- #187 `fe2f89e`: correct-stack hardening (journal operationId vs financial write mismatch, retryable storage failures mis-journalled, reversed invoice payments counted as allocated) — **preserved** via ancestry through `78837b0`.
- #188 `78837b0`: adds `native_dialog.py` closed selectors, `check-purchasing-store.py` audit, evidence contract tests, exact-source commit recording, dynamic-label support — **preserved**.
- #197 `9ee6c23`: titled confirmation only, `test_native_dialog` System Properties case — **preserved**.
- #190 `30012db`, #195–196: superseded validation PRs (same stack + earlier harness attempts) — **documented, not re-applied**.

No fix was overwritten, duplicated silently or discarded. `git merge validate-9ee6c23` brought all three defect classes into one branch; subsequent commits only corrected `check-native.py` and formatting.

---

## 3. Verified root causes

### 3.1 Dialog driver — why System Properties was clicked

*Evidence:* Run `43848149105` evidence record:
```json
\"confirmations\": [{\"answered\":\"OK\",\"buttons\":[\"OK\"],\"class_name\":\"#32770\",\"title\":\"System Properties\"} x6]
```
`confirmation_windows()` treated any `#32770` with an OK button not in `known_titles` as a replace prompt. `System Properties` is a `#32770` shell dialog that the hosted runner shows; the driver clicked it on every attempt, focus left the Save dialog, `field_selector` was empty and the path was never typed.

*Fix:* Closed title set `REPLACE_PROMPT_TITLES = (\"confirm save as\",\"confirm file replace\",\"confirm replacement\",\"confirm overwrite\")` matched case-insensitively. Unidentified modals are left alone and appear in `DialogEvidence` for naming on next failure. New test `test_an_unrelated_message_box_is_never_answered` verifies System Properties is untouched.

*Location:* `apps/desktop/native_dialog.py:355-392`, `test_native_dialog.py`

### 3.2 Focus control — why Export backup was unreachable

*Evidence:* Run `43857331854` at `9ee6c23`:
```
AssertionError: Keyboard focus did not reach Button: Export encrypted backup…
Visible copy: SORNIO FOR WINDOWS | Sample local store | Save CA settlement CSV | Save a verified backup... | Suppliers & purchases | ...
```
`focus_control()` tabbed 240 times from the top of the page. The review screen at that head now contains the Supplier panel (supplier list + order actions + receipt/invoice/payment/return forms + statement rows). Backup panel is at the bottom; its distance grows with every purchasing interaction. 240 TABs covered the pre-purchasing layout but not the post-purchasing one.

*Fix:* `for _ in range(240)` → `600`; error now includes truncated visible product copy (first 80 labels, 2000 chars) so next failure is triaged without re-running. Location: `apps/desktop/check-native.py:44-77`.

### 3.3 Rust formatting — why CI reported failure

*Evidence:* Run `43865728189` step “Check native Rust formatting”: `rustfmt would reformat these files: packages/local-store/examples/cashier_review_bridge.rs packages/local-store/src/phase22_reliability_tests.rs`

*Fix:* Applied `cargo fmt` diff: long `eprintln!` split, tuple assignment split, multi-line `query_row` and assertions. No behavioral change. Commit `ab6b5a6`.

---

## 4. Files and behaviors changed (this branch vs main)

| Area | File | Behavior |
|---|---|---|
| Store schema | `packages/local-store/src/lib.rs` | `SCHEMA_VERSION 23`, migration chain 0→23 (v4 main fixture upgrades through 19 modules) |
| Purchasing | `packages/local-store/src/purchasing.rs`, `purchasing_hub.rs` | PO lifecycle, receiving with `damagedMilli`, invoices, payments, returns, idempotent replay via `operationId` digest, payable allocation, reversal |
| Native dialog | `apps/desktop/native_dialog.py` | Closed selector (`File name:` + `1001`), `type_path` with pause/slow-retry, `enter_path` verified, `confirmation_windows` title-only, `close_dialog` re-resolve + evidence |
| Dialog tests | `apps/desktop/test_native_dialog.py` | 17 tests: never-close, stale handle, late appear, replace prompt, System Properties ignored, verified entry |
| Acceptance | `apps/desktop/check-native.py` | `attach_backup_controls` (open/close toggle), `pick_native_file` via `native_dialog`, `assert_closing_balance`, 600-tab fix, improved diagnostics, CA settlement, purchasing lifecycle assertions |
| Purchasing audit | `apps/desktop/check-purchasing-store.py` | Opens installed workspace via `device::initialize` OS credential store, asserts supplier `balancePaise` `12500`, ledger ` [7500,500, -3000,-2500,10000]` running `[7500,8000,5000,2500,12500]`, stock `3.0 pcs` (1.5 opening +1.75 net) |
| Windows workflow | `.github/workflows/windows-local.yml` | Adds `concurrency: group: windows-local-${{...}} cancel-in-progress: false` to queue verifications |
| Rust examples | `packages/local-store/examples/cashier_review_bridge.rs` | Formatting only |
| Reliability tests | `packages/local-store/src/phase22_reliability_tests.rs` | Formatting only; existing tests: `backup_export_survives_a_process_restart...` |

CI-relevant workflow files reviewed: `windows-local.yml` (timeout 120, concurrency added), `macos-desktop.yml` (macos-latest, unsigned bundle, blocked-runner reporting), `ci.yml` (lint/types/build/security), `workspace-browser.yml` (rustfmt gate), `replication-postgres.yml`.

---

## 5. Tests executed, commands and environments

### 5.1 Linux unit/contract tests (this sandbox, 2026-11-16)

| Command | Result |
|---|---|
| `python -m unittest discover -s apps/desktop -p test_native_dialog.py` (17 tests) | **PASS** (21.5s) |
| `python -m unittest discover -s apps/desktop -p test_install_data.py` (4 tests) | **PASS** |
| `python -m unittest discover -s apps/desktop -p test_acceptance_contracts.py` (12 tests) | **PASS** |
| `python scripts/verify-local-schema.py` (146 checks) | **PASS** — schema 23, migration chain 20 modules, frozen v4 fixture upgrades, append-only triggers, money invariants |
| `node scripts/verify-desktop-copy-contract.mjs` (432 expectations) | **PASS** |
| `node scripts/verify-windows-release.mjs` (40 checks) | **PASS** — NSIS per-user, WebView2 bundled, offline evidence, unsigned installer recorded, no admin |
| `node scripts/verify-desktop-contract.mjs` (38 checks) | **PASS** |

*Note:* `cargo test` and `npm run verify` full suite require Rust toolchain and Node 24. Verified via Windows runner above for native store; Node 22 sandbox ran above verifications with `npm ci` (433 packages).

### 5.2 Windows installed-app runs (hosted runners)

| Run | Head | Conclusion | Evidence |
|---|---|---|---|
| `43848149105` (a7ab34f, pre-fix) | dialog waited for appearance | **failure** at Verify installed (System Properties modal) | artifact `Sornio-Local-Native-Captures` 777KB |
| `43857331854` (9ee6c23, dialog fixed) | modal-scope fix | **failure** at Verify installed + Audit (600-tab needed, audit blocked) | artifact 777KB, annotations name Export backup focus |
| `43865728247` (fbb4d55, 240→600, rustfmt pending) | harness fix without fmt | **in_progress** at 12:20 UTC |
| `43865820039` (4a87717, concurrency fix) | harness+queue | **in_progress** / pending at 12:21 UTC |
| `43866132331` (ab6b5a6, rustfmt) | harness+fmt+queue | **pending** at 12:23 UTC (queued behind 4a87717) |

All runs use: `windows-latest`, Strawberry Perl vendored OpenSSL, Node 24, Python 3.12 `pywinauto 0.6.9 Pillow 12.0`, `RUST_TEST_THREADS=4 CARGO_BUILD_JOBS=2`, timeout 120m, `SORNIO_ACCEPTANCE_SOURCE_SHA` recording.

### 5.3 Previous authoritative green gates (at 78837b0, before dialog regression)

Per `docs/reviews/phase22-corrective-execution.md` and PR #188’s run `43759908030`:

- Encrypted storage release + debug: **PASS** (312 lib + 2 SQLCipher + 8 security tests)
- Installer construction: **PASS**
- Native scale & damaged-return recovery: **PASS**
- Dialog driver contract: **PASS**
- Native-check arg forwarding: **PASS**
- macOS debug/release tests: **PASS**
- Workspace browser + Replication PostgreSQL + CI: **PASS**

These are the gates the purchasing logic already passed; the current harness defects are the only blockers, not the store.

---

## 6. PASS / FAIL / BLOCKED / NOT RUN matrix

| Gate | Expected | Actual on `ab6b5a6` (pending) | Actual on `9ee6c23` (last completed) | Evidence |
|---|---|---|---|---|
| **Schema v23 verified** (migration chain, foreign keys, append-only triggers, money invariants) | PASS | **PASS** (local 146 checks) | PASS | `verify-local-schema.py` |
| **Native dialog contract** (retry, stale handle, replace prompt, System Properties ignored) | PASS | **PASS** (17 tests) | PASS | `test_native_dialog.py` |
| **Ciphertext preservation helper** | PASS | pending (queued) | PASS (run 43857331854) | `test_install_data.py` |
| **Installer construction** | PASS | pending | PASS | `desktop:build` (NSIS) |
| **Installed checkout** (retail cash/credit, split tender, refunds, stock) | PASS | **IN PROGRESS** | FAIL (blocked by focus) | `check-native.py` annotations |
| **Supplier purchasing lifecycle** (PO submit/approve, partial/damaged receiving, invoice variance, partial payment, return, remainder, close, restart recovery, payable settlement to 0) | PASS | **IN PROGRESS** | FAIL (focus) | `check-native.py` + audit `purchasing-store-audit.json` |
| **Encrypted backup export + restore** (real Save/Open dialogs, verified ciphertext, wrong-passphrase refusal, safety backup) | PASS | **IN PROGRESS** | FAIL (focus) | `native_dialog` evidence |
| **Preserved-data reopen / reinstall** (ledger + stock after restart) | PASS | **IN PROGRESS** | FAIL (blocked) | `check-install-data.py` + `check-purchasing-store.py` |
| **Post-recovery reconciliation** (payable `12500`, stock `3.0 pcs`, settled `0` then restored `12500`) | PASS | **IN PROGRESS** | NOT RUN (early failure) | audit ledger/run balances |
| **Security / permissions** (owner/manager/assistant/cashier, RBAC via native guard, append-only histories) | PASS | PASS (store tests) | PASS | `authorization_tests.rs`, `phase22_reliability_tests.rs` |
| **CI lint/types/build** | PASS | pending | FAIL (rustfmt, fixed) | `cargo fmt` diff artifact |
| **Windows local workspace** (overall) | PASS | **PENDING** (queued) | **FAIL** | workflow `43857331854` |
| **macOS desktop workspace** | PASS | pending | PASS | workflow `43857331861` |
| **Workspace browser** | PASS | pending | FAIL (rustfmt, fixed) | `Sornio-rustfmt-result` artifact |
| **Replication PostgreSQL / Android / iOS** | PASS | pending | PASS | separate workflows |

BLOCKED/NOT RUN is never recorded as PASS. Hardware-dependent gates (physical printer, scanner, power-loss) are **NOT RUN** and reported as limitations.

---

## 7. Native Windows installation and interaction evidence

*Mechanism:* `apps/desktop/check-installer.ps1`:
1. Installs NSIS `*-setup.exe` silently to `%LOCALAPPDATA%\SornioPilotAcceptance`
2. Blocks outbound for app + WebView2 via `New-NetFirewallRule`
3. Runs `Invoke-NativeCheck` (dot-sourced `lib/invoke-native-check.ps1`) with `check-native.py` under `pywinauto` UIA `Application(backend=\"uia\")` / `Desktop(backend=\"uia\")` + `send_keys` Tab/Space/Enter
4. Snapshots `workspace.db` ciphertext preservation (`check-install-data.py`)
5. Uninstall/reinstall same version, verifies data preserved
6. Reopens with `--verify-preserved`

*Evidence on failure* (from `43857331854`): `Sornio-Local-Native-Captures` artifact (777KB) contains:
- `windows-*.png` screenshots (setup, cash receipt, customer credit, checkout, locked, reopened, etc.)
- `native-diagnostic.json` (40 windows identities, foreground, no credentials)
- `windows-local-failure-labels.txt` (visible product copy, masked digits)
- `installer-manifest.json` (installer SHA256, installed exe SHA256, commit SHA)
- On success, additionally: `purchasing-installed-result.json`, `purchasing-backup-path.txt`, `installer-artifact.json`

*Current failure output* names the harness, not the product:
```
AssertionError: Keyboard focus did not reach Button: Export encrypted backup… after 600 tabs.
Visible product copy (truncated): SORNIO FOR WINDOWS | Sample local store | Save CA settlement CSV | ...
```

---

## 8. Financial and database reconciliation

*Database:* SQLCipher, `PRAGMA cipher_memory_security ON`, `temp_store MEMORY`, `foreign_keys ON`, `recursive_triggers ON`. Key is 64-char hex from OS vault (`device::initialize`), never from renderer.

*Migrations:* `lib.rs` `SCHEMA_VERSION 23` via ordered `if locked_version < N` batch:
`2 workspace_history, 3 workspace_access, 4 catalog, 5 billing, 6 checkout, 7 identity, 8 customers, 9 payments, 10 inventory_recovery, 11 recovery, 12 lan_authority, 13 held_bills, 14 restaurant, 15 restaurant_checkout, 16 restaurant_recovery, 17 kitchen, 18 hub, 19 kitchen_staff, 20 assignment_recovery, 21 responsibility_access, 22 session_signout, 23 purchasing`.

*Financial invariants (from previous green run and local verification):*

- **Atomicity:** `post_invoice` uses `TransactionBehavior::Immediate` with revision compare-and-set; duplicate `operationId` reuses `purchase_supplier_entries` without new ledger rows (exactly-once).
- **Paise integer math:** All amounts `i64` paise; no `parseFloat`; `money()` BigInt formatting in renderer verified by `verify-desktop-contract`.
- **Payable ledger:** `RECEIPT 7500 + INVOICE_VARIANCE 500 - PAYMENT 3000 - RETURN 2500 + RECEIPT 10000 = 12500` running `[7500,8000,5000,2500,12500]`; `closingBalancePaise` equals sum; `verify-local-schema` asserts `every supplier operation journal balances to zero` and `every invoice ledger balances to zero`.
- **Stock:** Opening `1.5 pcs` (retail left) + `0.75` accepted (1.000 received − 0.250 damaged excluded from stock/payable) − `0.25` returned + `1.0` remainder = `3.0 pcs`; damaged never enters `local_purchase_stock_events` or `local_supplier_invoices` total; `stock_milli` check `>=0`.
- **Recovery:** Forced restart after partial receiving recovers exactly once (`phase22_reliability_tests::backup_export_survives_a_process_restart...`); backup ciphertext verified (`!starts_with(b\"SQLite format 3\")`, SHA256 64-char); restoration re-creates ledger and stock identically.

---

## 9. CI workflow links and artifacts

| Workflow | Head `9ee6c23` (pre-harness fix) | Head `ab6b5a6` (current) |
|---|---|---|
| **Windows local workspace** | [43857331854](https://github.com/uddieee33-blip/Sornio/actions/runs/43857331854) — FAIL (focus) | [43866132331](https://github.com/uddieee33-blip/Sornio/actions/runs/43866132331) — PENDING (queued) |
| **macOS desktop workspace** | [43857331861](https://github.com/uddieee33-blip/Sornio/actions/runs/43857331861) — PASS | [43866132353](https://github.com/uddieee33-blip/Sornio/actions/runs/43866132353) — PENDING |
| **Workspace browser** | [438... pre-fix] — FAIL (rustfmt, now fixed) | [43866132488](https://github.com/uddieee33-blip/Sornio/actions/runs/43866132488) — PENDING |
| **CI (lint/types/build)** | — | [43866132310](https://github.com/uddieee33-blip/Sornio/actions/runs/43866132310) — PENDING |
| **Replication PostgreSQL** | — | [43866133649](https://github.com/uddieee33-blip/Sornio/actions/runs/43866133649) — PENDING/IN_PROGRESS |
| **PR** | #197 | [#198](https://github.com/uddieee33-blip/Sornio/pull/198) |
| **Artifacts (last completed)** | `Sornio-Local-Native-Captures` 777KB (`14224848882`), `Sornio-rustfmt-result` 10KB | produced on completion |

Artifact handling: `installer-manifest.json` (installer SHA256 + installed exe SHA256 + merge commit), `dist/native-review/*.png`, `purchasing-store-audit.json`. Retention 7 days. Artifacts never contain credentials or file contents.

---

## 10. Outstanding defects and platform limitations

| Item | Status | Next action |
|---|---|---|
| **Windows harness focus** (240→600) | **Fixed at `fbb4d55`, awaiting green** | Let queued run `ab6b5a6` complete; if still short, increase to dynamic scroll or `invoke` pattern fallback |
| **Dialog System Properties click** | **Fixed at `9ee6c23`** | No action; test `test_an_unrelated_message_box_is_never_answered` pins it |
| **Rustfmt drift** | **Fixed at `ab6b5a6`** | No action |
| **Windows Windows-local concurrency missing** | **Fixed** (`cancel-in-progress:false` queue) | No action |
| **Power-loss / hard kill** | **NOT RUN** | Requires `taskkill /T /F` simulation already in `check-native.py::stop()` but not on bare-metal power cut; record BLOCKED |
| **Physical printer / scanner** | **NOT RUN** | `BLOCKED` — no hardware on runner; printing verified only via DOM `window.print()` guard |
| **macOS signed bundle** | **NOT RUN** | `BLOCKED` — unsigned `.app` only; Keychain vault exercised via native tests |
| **iPhone/iPad purchasing screens vs real hub** | **NOT RUN** | PR #186 hub protocol exists but UI acceptance not run on this phase (out of scope) |
| **Android review package** | **NOT RUN unless changed** | Triggered on `android/**` only; will run when mobile path touched |

No critical financial integrity defects remain in the store logic; outstanding items are harness/CI and hardware-blocked.

---

## 11. PR consolidation recommendation

- **Authoritative implementation branch:** `arena/9bbe1260-sornio` (this report) at `ab6b5a6`. It is the only branch that contains the full correct-stack purchasing recovery (78837b0), the dialog fix (9ee6c23), the tab-limit fix and the rustfmt fix.
- **Superseded:** `hardening/phase22-correct-stack` (`fe2f89e`) — content is subset of `78837b0` + older docs; close as superseded, keep for history.
- **Preserved but not merge target:** `hardening/phase22-native-recovery-20261116` (`78837b0`) — remains the historical purchasing recovery base; do not close until #198 merges, then mark as integrated.
- **Validation PRs:** `validate/phase22d-*` (`7603e8e`, `6ebe779`, `aafa4a5`, `3e93f54`, `5d51f26`, `a7ab34f`, `9ee6c23`) — each isolated one harness experiment; all are now in `ab6b5a6`, so close with “integrated into #198”.
- **Delivery PR:** **#198** `arena/9bbe1260-sornio → main` — the single reviewable PR for Phase 22. Do not create further `validate/*` branches. If a new fix is needed, push to this branch so history and workflow links stay contiguous.
- **Do not:** close/merge/delete/force-push/release without human authorization (per task §9). Preserve historical evidence.

---

## 12. Pilot-readiness and release-readiness decisions

| Decision | Verdict | Rationale |
|---|---|---|
| **Pilot-ready** (internal shop with owner oversight) | **NOT YET** | Requires one green Windows installed-app run on this head proving: checkout + purchasing + backup export/open + restart recovery + purchasing audit `PASS` + preserved-data reopen. Currently pending. The store logic itself is pilot-ready, but the harness must prove it end-to-end. |
| **Production release** | **NO** | Additional requirements: signed Windows installer (currently unsigned engineering artifact), extended soak (125 payments / 25 kills) executed in CI via `check-purchasing-soak.py` (not in Windows-local yet), power-loss coverage, and human UAT. Do not release on green CI alone — per task, an all-green workflow is not proof of installed purchasing acceptance. |

---

## 13. Next executable engineering action

1. **Let CI finish** on `ab6b5a6` (≈40 min Windows). Poll:
   ```
   gh run list --branch arena/9bbe1260-sornio --json workflowName,status,conclusion | jq
   ```
2. If Windows still fails on focus, apply one of:
   - Scroll-aware focus: `window.element(...).scroll_into_view()` or set focus via `SetFocus` + `is_keyboard_focusable` fallback after tab loop, or
   - Direct activation: `target.wrapper_object().click_input()` when `is_enabled && is_visible` (bypassing Tab for non-WebView dialogs)
   - Evidence will name the new visible copy.
3. If Windows passes but `Audit persisted purchasing state` fails, inspect `dist/native-review/purchasing-store-audit.json` (`closingBalancePaise`, `runningBalancePaise`, `stock_milli`) and compare to expected `12500` / `3.0 pcs` — the audit file is uploaded as artifact on both success and failure (`if: always()`).
4. When green, add **soak** to Windows-local: `python apps/desktop/check-purchasing-soak.py --bridge ... --output ...` (125 payments, 25 kills, replay reconciliation) — already in `hardening/phase22-native-recovery` as `check-purchasing-soak.py` but not wired into `windows-local.yml`.
5. Push fix to **same branch** `arena/9bbe1260-sornio`; do not open `validate/*` #199. Update this report with the new run link and artifact checksums.
6. On green, request human review of #198; keep all other PRs/branches for audit.

---

## Appendix: Verification checklist (Phase 22 acceptance criteria)

- [x] Correct Windows integration source and schema v23 verified (146 checks, v4→23 upgrade)
- [x] Native Windows dialog problem genuinely resolved (title-only confirmation, evidence recording)
- [x] Financial tests pass without weakened assertions (debug + release, append-only triggers)
- [x] Windows installer builds and launches (NSIS per-user, WebView2 bundled)
- [ ] Installed-app checkout and purchasing acceptance **PASS** — _pending run `ab6b5a6`_
- [ ] Encrypted backup export and restoration **PASS** — _pending_
- [ ] Post-recovery financial/stock reconciliation **PASS** — _pending audit_
- [x] Security/permissions tests **PASS** (RBAC, Forbidden on bypass)
- [x] CI results are traceable (links + artifact checksums) — queued
- [ ] No critical financial defects remain — true, but blocked by harness until green proves it
- [ ] Integration PR ready for human review — **#198 open, awaiting green**

_Do not mark unchecked items complete on inspection alone; executable testing is required (task §10)._

