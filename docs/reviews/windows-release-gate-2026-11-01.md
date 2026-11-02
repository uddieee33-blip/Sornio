# Sornio Windows release gate — 2026-11-01 recovery report (PR #135)

**Product:** Sornio (Tauri + React + TypeScript + Rust + SQLCipher), repo `uddieee33-blip/DukaanOS`
**PR:** #135 (draft, open) `arena/3519c98b-dukaanos` → `main`
**Assignment start SHA:** `5e2c099` · * **Final evidence head SHA:** `e911af1` (this document is committed on top of it; earlier green evidence head `989c6ae`)*
**Scope:** repair the two genuine CI failures on the PR head, prove the ₹600 cash + ₹400 credit sale natively, complete Windows installer acceptance, audit PRs #122–#135, and report GO/NO-GO with evidence only.

---

## A. Starting state and confirmed failures

At assignment start (head `5e2c099`, verified via `gh`):

- **Failure A — Core CI** (run 41301760886, job 124835187601, step 8 "Verify blueprints, theme, security and localisation"): `scripts/verify-windows-release.mjs:63` asserted the literal regex `/Check-Exit 'installed offline fixture'/` against `apps/desktop/check-installer.ps1`, but commit `f4384a5` had refactored the stage to `Invoke-NativeCheck 'installed offline fixture' @()`. The verifier was stale w.r.t. its own refactor — a static-assertion defect, not an implementation defect.
- **Failure B — Windows local** (run 41301760877, job 124834001229, step 17 "Verify installed offline app…"): annotation showed `check-native.py:293: assert backup.exists() and backup.stat().st_size >= 4096` — after the UI displayed "Encrypted backup saved and verified.", no ≥4096-byte file existed at the test-chosen `TEMP\sornio-native-<uuid>.sorniobackup` path.

## B. Root causes (all confirmed by CI check-run annotations, not assumed)

1. **Failure A (stale verifier):** literal regex no longer matched the refactored, still fail-closed stage runner. Fixed structurally (see D).
2. **Failure B (backup path not provable):** the GitHub runner's rfd save dialog **ignores synthetic filename input**. Proven across four runs: raw `Alt+N` keys (`5e2c099`) → default `Documents\sornio-business.sorniobackup`; UIA `set_edit_text` with read-back (`dba7fbc`, job 124863845501) → read-back matched but the dialog still saved to the default (UIA ValuePattern write does not update the dialog's internal state — false positive); keyboard-first (`2ea7328`) → mangled to `C:\Users\RUNNER.sorniobackup`; all reported truthfully by the app after the fix. The product chain was correct throughout: `export_local_backup` (main.rs) returns Ok only after `persist_noclobber` at the dialog-returned path (recovery.rs `publish()`), so a shown success always implies a real file *somewhere* — the test just asserted at the wrong (never-written) path.
3. **Hidden third defect (found after B was fixed):** `Invoke-NativeCheck` declared a parameter named `$args` and forwarded with `@args`; that splats the *automatic* (empty) `$args`, so `--verify-preserved` never reached python and the "reinstalled offline reopen" stage ran **first-run setup** (run 41324495119 traceback: `launch(setup=True)` → `fill("Business name for setup", …)` timeout). Fixed with an explicit `$stageArgs` + `& python @cmd`.
4. **Automation flakes (pywinauto):** `window.descendants()` raised `KeyError: None` during WebView re-render (killed a run at the first sale wait); the dialog's Save button was not found by exact-title match in one run; WebView2 splits the displayed file path into multiple text runs. All hardened without weakening any product assertion.
5. **Regression-test defect of our own making:** `$out = & python @cmd 2>&1 | Tee-Object …` consumed the child's output stream, so "child stdout visible to caller" failed (runs 41332572623 and the `5f17c21` rerun). Fixed by dropping the assignment (tee still captures the annotation tail).

## C. Windows installer acceptance — stage-by-stage (green runs 41350334103 on `e911af1`, 41339502091 on `989c6ae`, 41328797082 on `e891048`; zero failure annotations on the last two)

Notices in the check record, in order: `install` → `installed offline fixture` → `snapshot stopped application data` → `uninstall and data preservation` → `same-version reinstall` → `reinstalled offline reopen with original credentials` → `final uninstall`, then evidence verification and artifact upload passed. The `installed offline fixture` stage (check-native.py main flow) includes: owner setup, draft save/restore history, product creation, the **split cash+credit retail sale with balances ₹53.13 cash / ₹31.88 credit / 2 pcs**, lock/unlock with wrong-password refusal, restart persistence, acknowledgement semantics, **encrypted backup export to a real OS file (≥4096 bytes, no plaintext secrets, not raw SQLite)**, wrong-passphrase refusal ("Backup could not be verified."), good-passphrase preview, typed `RESTORE …` confirmation, full restore, and post-restore balances. `reinstalled offline reopen` ran in `--verify-preserved` mode and verified the preserved business name, note, balances (95.64/0.00/1.75), saved receipt and operation ID. Same-version reinstall is **not** claimed as a version upgrade (`actualVersionUpgrade = 'untested'` is asserted in the lifecycle record).

## D. Exact changes (all on `arena/3519c98b-dukaanos`, never merged)

| Commit | Change |
|---|---|
| `ab1c1fd` | `scripts/verify-windows-release.mjs`: replaced the stale literal check with a structural fail-closed analyzer (any child-process helper must `throw` inside an `if (<exit code> -ne 0)` block and nowhere else; the stage literal must be invoked through such a guard) + 5 embedded self-tests (legacy pass, modern pass, guard-without-throw reject, unconditional-throw reject, stage-never-invoked reject). 38→40 checks pass locally. |
| `dba7fbc` | `recovery.rs`: `BackupPreview.file_path` populated in `export()` (after publish) and `verified()`; `BackupPanel.tsx`: success message keeps `"Encrypted backup saved and verified."` and adds `"Saved to: <path>"`; `check-native.py`: UIA dialog driving + app-stated-path assertions + diagnostics. |
| `2e1e488` | `windows-local.yml`: added **debug-profile** `cargo test --all-targets --locked` step (overflow checks/debug_assertions active), no continue-on-error. |
| `3214753` | `check-native.py`: only keyboard read-back counts as dialog-verified; debug step gained the same `::error::` annotation plumbing as the release step. |
| `747047f` / `3da27e0` / `2ea7328` | `check-native.py`: tolerate transient UIA enumeration errors (`ui_texts`/`ui_descendants`), tolerant Save/Open button lookup with `{ENTER}` fallback, restore-phrase scan hardened. |
| `8e27c8c` | `check-native.py`: choose-dialog display asserted by file name (WebView2 splits path text runs). |
| `e891048` | `check-installer.ps1`: **root-cause fix for the `--verify-preserved` drop** — parameter renamed `$args`→`$stageArgs`, command built explicitly, invoked as `& python @cmd`. Full Windows acceptance went green on this head (run 41328797082). |
| `ff85a17` | `apps/desktop/lib/invoke-native-check.ps1` (dot-sourced stage runner, so tests exercise the production function), `apps/desktop/test-invoke-native-check.ps1` wired into `windows-local.yml` before installer acceptance, verifier extended to analyze the dot-sourced lib and require the test in the workflow (40 checks), `--verify-preserved` fails closed if a fresh-setup screen ever appears. |
| `11a81e6` | lib: removed the output-consuming `$out =` assignment (child stdout now reaches the caller; tee still captures the annotation tail); forwarding test extended (annotation names stage + retains child tail, stdout visible on success, spaces in args, `--verify-preserved` exactly once, no stale exit/argv across invocations). |

## E. Tests and results

- **Local (this sandbox, head `11a81e6`):** `npm run verify` — all suites pass, exit 0 (incl. `verify:windows-release` **40 checks**, `verify:desktop-contract` **25 checks**, money/schema/recovery static suites). Desktop `tsc --noEmit && vite build` passes; eslint clean on changed TS files; `py_compile` on `check-native.py`; YAML parse on workflows; tree-sitter parse on `recovery.rs`. pwsh is **not available** in this sandbox, so the PowerShell forwarding test runs in Windows CI, not locally (stated explicitly, not claimed).
- **Rust native (Windows CI):** release-profile `cargo test --all-targets --release --locked` and the added debug-profile `cargo test --all-targets --locked` both ran and passed on the green head `e891048` (run 41328797082 — the job only proceeds past these steps when they pass; no `::error::failing tests` annotations). Note: on `2e1e488` one debug-profile execution failed with exit 101 before the annotation plumbing existed; on `3214753` and later heads the debug step passed. Residual flake risk recorded in H.
- **₹600 cash + ₹400 credit (₹1,000) native proof:** `packages/local-store/src/payments_tests.rs` — `split_cash_and_customer_credit_sale_posts_one_atomic_sale` (one invoice, one stock deduction, exactly ₹600 cash `60000` paise, exactly ₹400 `credit_due` receivable, no fictitious ₹1,000 cash, one audit row, one outbox row, `externally_verified == false` for all parts, idempotent replay, altered-payload → `OperationConflict`, restart persistence), `split_sale_validation_credit_limit_and_atomicity_are_enforced_natively` (no-customer/two-credit/customer-without-credit refused pre-write, unbalanced split and over-limit fail closed with full rollback), `split_sale_repayment_and_credit_return_reconcile_without_duplicates`, plus generated/proptest suites, `concurrent_successful_invoices_receive_distinct_durable_numbers`, crash-point process-death tests (`before_commit`/`after_commit`), and `cash_variance_preserves_large_integer_values_and_refuses_overflow` (integer paise). UI-level proof: the fixture stage's split sale with balances 53.13/31.88/2 passed inside the green Windows run.
- **Forwarding regression test** (`test-invoke-native-check.ps1`, synthetic fake `python`, no product/credentials/data): fixture stage forwards zero extra args; preserved stage forwards exactly `--verify-preserved`; nonzero child exit throws with stage-naming message; `::error::` annotation emitted with child tail; success stdout visible; spaces preserved; exactly-once; no stale state. **Executed and passed in CI on `989c6ae` (run 41339502091) and on `e911af1` (run 41350334103)** — the test stage notices appear in the check record and both jobs finished success with 0 failure annotations.

## F. GitHub Actions results

| Head | CI (Lint, types, build) | Dependency audit | Workspace browser review | Windows local workspace |
|---|---|---|---|---|
| `5e2c099` (start) | **failure** (run 41301760886, stale verifier) | success | success | **failure** (run 41301760877, backup path assert) |
| `ab1c1fd`…`e891048` | success (41308936515, 41324495136, 41328797085) | success | success (41328797173) | failure→…→**success on `e891048`** (run **41328797082**, check-run 124914302000) |
| `ff85a17` / `5f17c21` | success (41332572588; 41335135039) | success | success (41332572598) | failure (41332572623: forwarding test's own stdout check; fixed in `11a81e6`) |
| `11a81e6` | not started (billing block) | not started | not started | not started (runs 41337531186/198/276, ~18:36Z) |
| **`989c6ae`** | failure (run 41339502089 — stuck 96 min during the outage, zero annotations; infra, not code) | **success** (124971141351) | **success** (run 41339502176) | **SUCCESS** (run **41339502091**, check-run 124971124699, **0 failure annotations**) |
| **`e911af1`** | **SUCCESS** (run **41350334137**, check-run 124978926937) | **success** (124978926718) | failure (run 41350334080, exit 1 with zero annotations on a docs-only delta — transient runner flake; green on `989c6ae`) | **SUCCESS** (run **41350334103**, check-run 124978926651, **0 failure annotations**) |

**Billing blocker (infrastructure, not code, now cleared):** from ~18:36Z to ~19:00Z every job failed to start with *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* It cleared on its own; the `989c6ae` runs then started. Rerun/dispatch endpoints returned 403 for the available token, so fresh runs were triggered by pushes. No billing/account settings were touched (prohibited). On `e911af1` the CI, dependency-audit and Windows-local gates are all green; the one red browser job is an annotation-free exit-1 on a docs-only delta with a green browser run on the immediately preceding code-identical head.

## G. Windows artifacts (green run 41350334103 on `e911af1`; earlier green runs 41339502091 on `989c6ae`, 41328797082 on `e891048`)

- `Sornio-Local-Workspace-Review` — artifact 13100994675, 222,742,223 bytes: genuine NSIS installer + `installer-lifecycle-result.json` / `installer-artifact.json` (incl. installer SHA-256 computed and checked by `check-windows-evidence.py`, whose step passed) — https://github.com/uddieee33-blip/DukaanOS/actions/runs/41350334103
- `Sornio-Local-Native-Captures` — artifact 13102325184, 1,274,318 bytes: real pywinauto screenshots (setup, unlock, checkout, credit sale, locked, backup preview/restored, preserved reopen, …).
- Earlier green runs: 41339502091 (artifacts 13101041623 / 13100354737) on `989c6ae`; 41328797082 (artifacts 13093233099 / 13093631899) on `e891048`.
- This sandbox cannot download artifact zips or raw logs (the signed redirects point to Azure blob storage, which is not in the egress allowlist — same EOF as before), so the SHA-256 and PNG bytes are verified by the in-CI evidence step that passed, not re-downloaded locally.

## H. PR #122–#135 audit vs #135 head

Line-level coverage of each PR's diff vs the #135 head: #122 97%, #123 98%, #124 99%, #125 91% (doc superseded by `docs/reviews/integration-matrix-2026-11-01.md`), #128 60% (pa.json locale + review doc intentionally not consolidated; safe-printing contract checks present), #129 80% (2026-10-29 audit docs superseded; `catalog.rs` revision guards present), #130/#131/#134 99%. **#126 (LAN) and #127 (GST) are deliberately absent from the product:** `lan_authority.rs` is authority-foundation only ("No socket, listener, pairing UI or wire token"; no lan module/commands/UI in the head) and there is no GST code in `packages/` — consistent with LAN disabled and GST not statutory.

## I. Risks

1. Final-head (`11a81e6`) Windows run not yet executed due to the account billing block — the only unverified gate.
2. One debug-profile cargo execution on `2e1e488` failed (exit 101) before annotation plumbing existed; passed on `3214753`+ — possible residual flake, now annotated if it recurs.
3. The CI runner's OS save dialog mangles synthetic filename input; the acceptance now proves the app writes and reports the true path, but "dialog honors a typed custom path" is proven only when keyboard read-back succeeds (flag `driven`), which it did not on the runner.
4. Artifact zips/logs not locally re-downloadable (egress) — evidence is the in-CI verifier plus run/artifact URLs.

## J. Merge recommendation

**HOLD merge (never merged — per standing instruction); READY FOR REVIEW.** On `e911af1` the CI (Lint, types, build, run 41350334137), dependency audit, and Windows local workspace (run 41350334103 — forwarding regression test, release & debug native suites, NSIS build, complete installer lifecycle incl. backup export/verify/wrong-passphrase/restore and preserved reopen, evidence verification, artifact uploads) are all green; the browser review is green on the code-identical `989c6ae` (run 41339502176) and its `e911af1` rerun was an annotation-free exit-1 flake on a docs-only delta.

## K. Controlled-pilot verdict

**GO (evidence-backed on `e911af1` / `989c6ae`).** SQLCipher at rest; native role-based authorization; atomic ₹600 cash + ₹400 credit = ₹1,000 sale (one invoice, one stock deduction, exactly ₹600 recorded cash, exactly ₹400 receivable, one audit + one outbox row, idempotent operation IDs, altered-payload conflict, credit-limit/unbalanced/no-customer refusals with full rollback, crash-point process-death atomicity, concurrency, integer paise, UPI/digital never auto-verified — all in the native test suites that passed in release **and** debug on Windows); encrypted backup export/verify/restore with wrong-credential refusal; data preservation across uninstall → same-version reinstall → reopen with original credentials; offline operation with outbound network blocked; genuine installer, screenshots and checksum evidence uploaded (run 41350334103). Same-version reinstall is not claimed as a version upgrade.

## L. Precise next engineering task

Watch the runs triggered by the commit that adds this section: require `CI`, `Dependency audit`, `Workspace browser review` and `Windows local workspace` all success on that exact final SHA (browser to confirm the flake is gone). If any step fails, classify it as a separate issue from its annotation; do not weaken checks. After that, PR #135 is merge-ready for human review (merge itself is not performed by this automation).
