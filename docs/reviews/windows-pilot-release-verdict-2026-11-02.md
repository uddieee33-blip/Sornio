# Sornio — Windows Pilot Readiness: Final Release Validation Report

**Document ID**: `SORNIO-RELEASE-VERDICT-2026-11-02`
**Report date**: 2026-11-02 (UTC)
**Repository**: `uddieee33-blip/Sornio`
**Scope**: CONTROLLED SINGLE-PC WINDOWS PILOT
**Reviewing role**: Independent release review (architecture, Windows release engineering, Rust financial systems, security, QA)

---

## A. Executive Summary

Sornio's source baseline is clean and verified. Beyond that, the evidence base is thinner than the assignment's framing assumed, and three concrete gaps separate this build from a pilot-ready state. All three are things this environment cannot do, not things the code fails to do.

**What was proven in this session**

1. **The critical artifact-preservation step is still achievable.** Both expiring Windows archives (`13149371946`, `13149486747`) are **live and unexpired**, and GitHub's own artifact metadata reports SHA-256 digests that **exactly match** the historical values in the assignment. Their real expiration is **2026-11-09 14:28 UTC** — roughly 7 days out. Preservation has not yet been lost.
2. **The PR #142 tree-equality assertion is true.** PR head `e13a930…` and `main` `baabf5f…` both resolve to tree `871c48be587de15c35728494a9b6e80e308b3b22`, and the path-level diff between them is **0 entries**. The merged main tree is byte-identical to the tree that passed Windows acceptance.
3. **`main` is green on its exact commit.** CI run `41474089057` (push, `baabf5f`) succeeded, covering lint, both type checkers, the **full 30-script verification chain**, the production build, and both dependency audits.
4. **All 493 local financial, security and recovery assertions pass.** I installed the dependency tree and re-ran `npm run lint`, `typecheck`, `typecheck:native` and the complete `npm run verify` chain independently: exit 0 across the board, including the exact `0.1 + 4.01 = 4.11` and ₹2.06 COGS invariants. Transcript committed at `docs/reviews/windows-pilot-local-verification-2026-11-02.txt`.

**What could not be done here — stated plainly**

5. **Neither required workflow was dispatched.** Both `gh workflow run` calls returned **HTTP 403 "Resource not accessible by integration"**. The available token has read access but no `actions:write`. **No main-triggered run exists, so I make no claim that one occurred.** No run IDs are reported for work that did not happen.
6. **The artifacts could not be downloaded.** GitHub redirects artifact downloads to `productionresultssa32.blob.core.windows.net`, which is outside this sandbox's egress allowlist. Job logs are behind the same host. Consequently the installer **executable's** SHA-256 is **not verified** against `installer-artifact.json` here — only the *archive* digests are confirmed. I have not conflated the two.
7. **No native Rust test was executed locally.** No Rust toolchain is installed and the Rust distribution CDN is unreachable. The 191 native tests on this tree are confirmed by the Windows runner job's success, not re-run by me.

**The finding that matters most.** Neither `windows-local.yml` nor `workspace-browser.yml` is triggered by pushes to `main` — they run only on `pull_request` and `workflow_dispatch`. Main has never automatically received a Windows build. This cycle escaped harm only because squash-merge preserved tree equality; a future merge will not be so forgiving (defect **D-01**).

**Bottom line.** Repository integration: **GO**. Automated Windows release candidate: **CONDITIONAL GO**. Physical single-PC pilot: **NO-GO**. Public commercial release: **NO-GO**. Do not read these as one verdict; they are four independent judgements and only the first is unqualified.

---

## B. Exact Main Baseline

| Field | Verified value | How verified |
| --- | --- | --- |
| `main` commit | `baabf5fe35462de22d8a4d6132e29b3873fc919d` | `git ls-remote origin refs/heads/main` + `gh repo view` |
| `main` tree | `871c48be587de15c35728494a9b6e80e308b3b22` | `git rev-parse origin/main^{tree}` |
| Commit date | 2026-11-02T15:41:34Z | PR #142 merge metadata |
| Merge method | squash (PR #142, 5 commits → 1) | `gh pr view 142` |
| PR #142 head | `e13a930549d45b141d85ee8f7c8deeef470d7396` | `gh api .../pulls/142` |
| PR #142 head tree | `871c48be587de15c35728494a9b6e80e308b3b22` | `git rev-parse e13a930^{tree}` |
| Tree equality | **IDENTICAL** | Equal tree hashes + `git diff --name-status` = 0 paths |
| Native schema version | **12** | `packages/local-store/src/lib.rs:149` |
| App version | **0.3.0** | `apps/desktop/package.json`, `tauri.conf.json`, `Cargo.toml` all agree |
| Product identity | `Sornio Local Review` / `com.sornio.localreview` | `tauri.conf.json` |
| Installer format | NSIS, per-user (`currentUser`) | `verify-windows-release.mjs` confirms static gate |
| WebView2 | bundled offline installer | `verify-windows-release.mjs` |
| Native test functions | 191 | static count of `#[test]` under `packages/local-store` |

The tree-equality claim is **verified, not inherited**. Both commits were fetched and hashed directly; the empty diff is the proof, since a squash merge can otherwise silently alter content.

---

## C. GitHub Actions Evidence

### C.1 Post-merge CI — GitHub-confirmed on the exact main SHA

| Field | Value |
| --- | --- |
| Workflow | `CI` (`.github/workflows/ci.yml`) |
| Run ID | `41474089057` |
| Event / tested commit | `push` / `baabf5fe35462de22d8a4d6132e29b3873fc919d` |
| Started → completed | 2026-11-02T15:41:37Z → 2026-11-02T15:45:12Z (3 m 35 s) |
| Conclusion | **success** (attempt 1) |

| Job ID | Name | Conclusion | Covers |
| --- | --- | --- | --- |
| `125374964241` | Dependency audit | success | `npm audit` root + desktop; `cargo audit` on both lockfiles |
| `125374964550` | Lint, types, build | success | `lint`, `typecheck`, `typecheck:native`, **`npm run verify` (30 scripts)**, `build` |

This is the **only** GitHub-confirmed execution on the current main SHA, and it does carry the full verification chain — the workflow's "Verify blueprints, theme, security and localisation" step runs all 30 scripts. Main is genuinely green.

### C.2 Windows local workspace — PR-bound, tree-identical to main

| Field | Value |
| --- | --- |
| Workflow | `Windows local workspace` (`.github/workflows/windows-local.yml`) |
| Run ID | `41457796087` |
| Event | **`pull_request`** — *not* main-triggered |
| Tested commit / tree | `e13a930…` / `871c48b…` (**equals main tree**) |
| Head branch | `arena/d8cb03c5-sornio` |
| Started → completed | 2026-11-02T13:59:46Z → 2026-11-02T14:28:34Z (28 m 48 s) |
| Runner | `windows-latest` (GitHub-hosted Windows VM) |
| Conclusion | **success** |

| Job ID | Name | Conclusion | Window |
| --- | --- | --- | --- |
| `125318857120` | `local-windows` | success | 13:59:48Z → 14:28:33Z |

Steps confirmed by job success (every step exited zero), per the workflow definition: `npm ci` ×2, bundled frontend build, **SQLCipher `cargo test --release` suite**, **debug-profile suite** (overflow checks + `debug_assert` active), **NSIS installer build**, `test_install_data.py`, `test_windows_evidence.py`, `check-native-scale.py`, `test-invoke-native-check.ps1`, `check-installer.ps1` (offline install, recovery, lifecycle preservation, UIA), `check-windows-evidence.py`.

**Honest limit**: per-step timings and step log text are not retrievable — GitHub serves job logs from blob storage, unreachable here. Success is asserted at job granularity only.

### C.3 Workflow dispatch attempts — both refused

| Workflow | Workflow ID | Result | HTTP | Error |
| --- | --- | --- | --- | --- |
| `workspace-browser.yml` | `396278092` | **NOT STARTED** | 403 | `Resource not accessible by integration` |
| `windows-local.yml` | `396609582` | **NOT STARTED** | 403 | `Resource not accessible by integration` |

Neither workflow ran. **No run IDs, job IDs or timestamps exist for a main-triggered browser or Windows run, because none took place.** Per instruction, I did not retry with the same restricted credential, and I changed no permissions, rulesets, tokens or security settings. Founder UI instructions are in section K (F3).

---

## D. Windows Installer Manifest

Provenance label: **PR #142-bound, tree identical to main**. Not a main-triggered build.

| Attribute | Value |
| --- | --- |
| Product name | Sornio Local Review |
| App version | 0.3.0 |
| Identifier | `com.sornio.localreview` |
| Source commit | `e13a930549d45b141d85ee8f7c8deeef470d7396` |
| Source tree | `871c48be587de15c35728494a9b6e80e308b3b22` (**= main tree**) |
| Database schema | 12 |
| Windows workflow run | `41457796087` (PR event, `windows-latest`) |
| Installer filename | `Sornio Local Review_0.3.0_x64-setup.exe` |
| **Installer executable SHA-256** | **NOT COMPUTED — artifact body unreachable** |
| **Archive** SHA-256 (installer ZIP) | `2b6bfaf5d60c2438b22e6596367ad37ab5253923b7a76c4c08d6b85e5e399449` — **confirmed live via API** |
| **Archive** SHA-256 (native captures ZIP) | `1c70021fd649c37dbbe14b274d759b575435d6016c8c25f05ae0608d6ca89e38` — **confirmed live via API** |
| Signing status | **UNSIGNED** — no Authenticode/EV certificate configured |
| Native test status | PASS on Windows runner (job success) |
| Browser acceptance status | Not re-run this session; last success on `fc927d6` (artifacts in prior manifest) |
| Rust compiler version | **Unknown** — floating `stable`, unpinned (see D-02) |
| Tauri build version | **Unknown** — log unreachable |
| Expiration | `2026-11-09T14:28:06Z` / `2026-11-09T14:28:14Z` |

**The distinction that must not be lost.** `2b6bfaf5…` is the SHA-256 of the **ZIP archive that bundles the installer**, not of the installer binary. It must never be published as the installer checksum. The authoritative executable checksum lives in `installerSha256` inside `installer-artifact.json`, which ships inside the *native-captures* artifact — and the project's own `check-windows-evidence.py` enforces that match before the artifact is uploaded. That gate ran and passed on the Windows runner; the underlying value could not be read from here.

**Signing.** This build is unsigned. It must not be published as a commercial release, and no Windows warning may be suppressed or bypassed to make it appear trusted. SmartScreen "Unknown publisher" is the expected, correct behaviour.

---

## E. Archival Report

| Artifact | ID | Size | Live? | Archive SHA-256 | Matches historical? |
| --- | --- | --- | --- | --- | --- |
| `Sornio-Local-Workspace-Review` | `13149371946` | 222,744,930 B (212.4 MiB) | **Yes**, expires 2026-11-09T14:28:06Z | `2b6bfaf5…99449` | **Yes, exact** |
| `Sornio-Local-Native-Captures` | `13149486747` | 1,278,398 B (1.22 MiB) | **Yes**, expires 2026-11-09T14:28:14Z | `1c70021f…89e38` | **Yes, exact** |

**What was actually preserved**: digests re-read from GitHub's artifact API and confirmed against the historical record. That is metadata-level integrity — it proves GitHub's stored object is the object whose digest was recorded. It does **not** prove anything about the binary inside.

**What was not preserved**: the archive bodies, the installer executable, the evidence manifest contents, and the screenshots. All blocked by egress restrictions. **Preservation is therefore NOT complete and must not be marked complete.**

Remaining risk: **hard expiry in ~7 days**. If nothing is downloaded before 2026-11-09 14:28 UTC, GitHub deletes both permanently. The source tree survives in git and can be rebuilt, but the *exact binary that passed Windows acceptance* — the thing physical pilot testing is supposed to validate — would be gone. That rebuild would also be non-reproducible at bit level (D-02).

Mitigation shipped: **`scripts/preserve-windows-artifacts.ps1`**, a founder-runnable script that downloads both artifacts, re-verifies archive digests against GitHub metadata, extracts, computes the installer executable SHA-256, compares it to `installer-artifact.json`, verifies all four screenshots are readable, copies to a durable destination, re-hashes the durable copy, and writes `PRESERVATION-MANIFEST.json`. It fails loudly on any mismatch and never overwrites historical evidence.

---

## F. Financial Reliability Report

Executed locally in this session on tree `871c48b`. Full transcript: `docs/reviews/windows-pilot-local-verification-2026-11-02.txt`.

| Area | Result | Evidence |
| --- | --- | --- |
| **Exact quantity/money** | **PASS** | `0.1 + 4.01` aggregates to exact `4110` QuantityMilli (≈4.11); COGS posts exactly **₹2.06** with no 1-paise drift; single stock deduction; balanced journal |
| No float fallback | **PASS** | "postSale never falls back to legacy float money() rounding"; sub-paise rates and values beyond the native paise cap are refused |
| Quantity precision dust | **PASS** | `0.001 + 0.002` → `3` QuantityMilli (0.003) with exact ₹4.50 revenue, ₹3.00 COGS, 0.997 remaining |
| Renderer/native parity | **PASS** | 12 money-contract checks; renderer matched the native formula on **4,820 random invoices** with 180 overflow refusals |
| **Split payment** | **PASS** | ₹1,000 = ₹600 cash + ₹400 credit: one invoice, one deduction, balanced journal; replay preserves a single deduction and rejects altered payloads |
| **Inventory integrity** | **PASS** | Insufficient stock and failed COGS postings reject explicitly and roll back without mutating prior lines; repeated lines cannot jointly oversell; 9 inventory groups including "stock never goes below zero, whatever arrives out of order" |
| Lost-reply / repeated ack / stale session | **PASS** | Idempotent operation replay; `inventory_recovery_tests.rs` (11 native tests); recovery confirmed on the Windows runner |
| **Returns and refunds** | **PASS (automated)** | Damaged-return non-restocking exercised by `check-native-scale.py` (Windows runner) and native recovery tests |
| **Customer accounts** | **PASS** | `customers_tests.rs` (23 native tests); checkout display exact in paise including balances beyond JS safe integers; `money()`/`formatPaiseInput()` use BigInt with no `parseFloat`/`Number` on paise |
| Aggregate | **64** accounting + **12** money + **25** billing + invoice/checkout/domain contracts; **493** assertions total across the chain | |

No stable financial code was rewritten. No reproducible financial defect was found, so per instruction none was changed.

---

## G. Security and Recovery Report

| Control | Status | Basis |
| --- | --- | --- |
| SQLCipher encrypted local DB | **PASS** | `rusqlite` with `bundled-sqlcipher-vendored-openssl`; release **and** debug suites on Windows runner |
| No plaintext fallback | **PASS** | `test_install_data.py` ciphertext-preservation helper passed on Windows runner; `verify-security.mjs` 53 invariants |
| Windows Credential Manager custody | **PASS** | Windows runner coverage; `credential_tests.rs` (7 tests) |
| Owner authentication | **PASS** | `verify-auth.mjs` 53 checks; native access suite |
| Native RBAC | **PASS** | `authorization_tests.rs` (24 tests); "every role is enforced by native data methods" |
| Cross-business refusal | **PASS** | "scope and sessions cannot cross business databases" |
| Session expiration / disabled staff | **PASS** | Expiry and idle lock are native; role changes revoke sessions across connections; restart never restores a session |
| Encrypted backup generation | **PASS** | `recovery/tests.rs` (20 tests) |
| Corrupted backup / wrong passphrase rejection | **PASS** | Recovery refuses and keeps the workspace locked |
| Pre-restore safety backup | **PASS** | Written to `recovery-safety`; enforced by the restore flow |
| Restore epoch invalidation | **PASS** | Staff accounts disabled until Owner review after restore |
| Idempotency after restore | **PASS** | Native idempotent-operation tests across relock/unlock |
| Transport/web surface | **PASS** | CSRF exemption limited to `/api/report`; cookie shapes derived per request; Partitioned+Secure framing; host decides HTTPS before the forwarded header; rate-limit buckets |

Synthetic fixtures only throughout. No secret, password, vault key or customer record appears in this report or the manifest.

**Blocking-readiness statement**: no critical financial-integrity or recovery failure was found. The pilot is not blocked by security or recovery *code*; it is blocked by absence of physical evidence.

---

## H. Windows Installation Evidence

### H.1 Automated (GitHub-hosted Windows VM) — confirmed where stated

| Requirement | Status | Basis |
| --- | --- | --- |
| NSIS installer generation | **PASS** | `desktop:build --bundles nsis` step; installer artifact uploaded with `if-no-files-found: error` |
| Install under standard user | **PASS (VM)** | per-user NSIS, verified statically and by `check-installer.ps1` |
| Application launch | **PASS (VM)** | `check-installer.ps1` |
| WebView2 runtime handling | **PARTIAL** | offline installer bundled; runtime-absent path not exercised |
| Local vault initialization | **PASS (VM)** | `check-installer.ps1` + credential tests |
| Offline operation | **PASS (VM)** | prior cycle exercised offline startup under a firewall block on `sornio-desktop.exe` and `msedgewebview2.exe` |
| Data-file permissions | **PASS (VM)** | per-user `%LOCALAPPDATA%` |
| Encrypted DB reopen | **PASS (VM)** | `--verify-preserved` stage |
| Application restart | **PASS (VM)** | restart/crash-recovery native tests |
| Same-version reinstall preservation | **PASS (VM)** | `check-install-data.py` SHA-256 across uninstall/reinstall |
| Windows UI automation | **PASS (VM)** | `pywinauto` UIA + 4 screenshots gated by `check-windows-evidence.py` |
| Installer checksum consistency | **PASS (VM, at build time)** | `check-windows-evidence.py` compared exe vs manifest pre-upload; **not re-verifiable here** |

### H.2 Physical hardware — UNTESTED

An automated Windows VM is not a shop counter. These remain **unverified** and nothing in this report should be read as evidence for them:

- Clean-PC offline WebView2 bootstrap when the runtime is **absent**.
- Real thermal receipt printing, and real A4 output.
- Real Punjabi Gurmukhi **paper** rendering (tofu/matra behaviour is a printer-and-font-stack concern, not a VM concern).
- Real USB barcode scanning (HID timing, duplicate-scan behaviour).
- USB backup media durability and real eject/reinsert hashing.
- Cross-version installer upgrade (`0.3.0` → anything) — out of scope.
- SmartScreen behaviour on a genuine customer machine.

---

## I. Physical Acceptance Package

Delivered as three artefacts, ready for an authorised operator:

| File | Purpose |
| --- | --- |
| `docs/reviews/windows-physical-pilot-acceptance-plan-2026-11-02.md` | The 15-stage procedure with pass criteria (pre-existing, unchanged) |
| `docs/reviews/windows-physical-pilot-execution-record-2026-11-02.md` | **New** — the same 15 stages reframed as a results record, each carrying test ID, expected result, actual result, PASS/FAIL/UNTESTED/BLOCKED status, evidence reference, tester, date and defect record |
| `docs/reviews/windows-physical-pilot-tracker-2026-11-02.csv` | **New** — 15-row machine-readable tracker for collation and sign-off |

The 15 stages: (1) clean offline install, (2) owner setup and encrypted vault, (3) staff auth and native authorization, (4) product creation and three-decimal stock, (5) USB barcode scanner, (6) keyboard-only cash checkout, (7) ₹600 cash + ₹400 credit split, (8) credit sale and partial repayment, (9) English receipt printing, (10) Punjabi receipt printing, (11) process-failure recovery rehearsal, (12) encrypted backup to USB, (13) integrity and restore, (14) returns, refund safeguards and cash closing, (15) same-version uninstall/reinstall.

All 15 are currently **UNTESTED** — recorded as fact, not as a default. The record embeds the safety rules: no mains power interruption (Step 11 uses `Stop-Process` only), no live customer data, no suppression of Windows security warnings, and UNTESTED rather than inferred PASS when hardware is unavailable.

I have not simulated printer or scanner success anywhere in this report.

---

## J. Defect Register

| ID | Severity | Issue | Repro / evidence | Location | Impact | Remediation | Regression requirement | Pilot blocking |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **D-01** | **P1** | **No workflow runs on push to `main`.** Windows and browser acceptance are `pull_request` + `workflow_dispatch` only. | Read `.github/workflows/windows-local.yml` and `workspace-browser.yml` `on:` blocks — no `push:` key. Consequence: CI run `41474089057` on `baabf5f` ran *no* Windows or browser job. | `.github/workflows/windows-local.yml:3-10`, `.github/workflows/workspace-browser.yml:3-9` | A commit merged to main can reach a pilot PC with no Windows build or installer having ever been produced for that exact commit. This cycle survived only because squash-merge preserved tree equality — a merge that changes content would not. | Add `push: branches: [main]` (with the existing `paths:` filter) to both workflows. | A test asserting both workflows declare a `push` trigger for `main`. | **Conditionally — not blocking this release** (tree equality proven), **blocking for any future merge**. |
| **D-02** | P3 | Build toolchain is not pinned: `dtolnay/rust-toolchain` installs a floating `stable`, and no `rust-toolchain.toml` exists. Tauri CLI (`^2.0.0`) and crate (`2`) ranges float too. | `.github/workflows/windows-local.yml:31`; `ls rust-toolchain*` → absent. | same | Rebuilding today's source in future may yield a different binary; bit-reproducible verification of a preserved installer is impossible. | Pin `toolchain:` to an exact version and commit `rust-toolchain.toml`; pin Tauri versions. | CI asserts a pinned toolchain file exists. | No — does not affect runtime correctness. |
| **D-03** | P2 | Windows evidence has a 7-day retention window and no durable archival step. | `retention-days: 7` on both upload steps; `archivedToDurableStore: false`. Artifacts expire 2026-11-09. | `.github/workflows/windows-local.yml` (both upload steps) | The only physical-pilot-eligible binary can be destroyed by calendar drift. This has already nearly happened once. | Adopt `scripts/preserve-windows-artifacts.ps1` as a mandatory post-build step and archive to durable storage; consider raising retention for release runs. | Preservation manifest must exist and be checksum-verified before a build is called a release candidate. | No, but it is the highest-urgency *action*. |
| **D-04** | P3 | Provenance of the only Windows-accepted binary is PR-bound, not main-bound, because of D-01. | Run `41457796087` is `event: pull_request`, `head_branch: arena/d8cb03c5-sornio`. | process | Release narrative must always carry the tree-equality caveat; a reader could mistake it for a main build. | Fixed by D-01. | Manifest must state provenance event and ref. | No. |

No P0 defect was found. No financial-corruption, data-loss, security-bypass or duplicated-transaction defect was identified in this review.

---

## K. Founder Action Checklist

These cannot be performed by the agent from this environment. Ordered by urgency.

**F1 — CRITICAL, before 2026-11-09 14:28 UTC — preserve the artifacts**

```powershell
# From a clone of the repository, in PowerShell 7+, with `gh auth login` completed
pwsh -File scripts/preserve-windows-artifacts.ps1 -Destination 'D:\Sornio-Release-Archive'
```

The script verifies both archive digests, extracts, computes the **installer executable** SHA-256, matches it to `installer-artifact.json`, checks the four screenshots, copies to durable storage, re-hashes the copy, and writes `PRESERVATION-MANIFEST.json`. Expect `PRESERVED_AND_VERIFIED` and exit 0.

Manual fallback if the script cannot run:
1. GitHub → Actions → workflow "Windows local workspace" → run `41457796087`.
2. Download `Sornio-Local-Workspace-Review` (id `13149371946`) and `Sornio-Local-Native-Captures` (id `13149486747`).
3. `Get-FileHash <zip> -Algorithm SHA256` must equal `2b6bfaf5d60c2438b22e6596367ad37ab5253923b7a76c4c08d6b85e5e399449` and `1c70021fd649c37dbbe14b274d759b575435d6016c8c25f05ae0608d6ca89e38` respectively.
4. Extract, then `Get-FileHash "Sornio Local Review_0.3.0_x64-setup.exe" -Algorithm SHA256`.
5. Confirm that value equals `installerSha256` inside `installer-artifact.json`. **These are different numbers** — the ZIP digest is not the installer digest.
6. Copy both extracts plus the computed hashes to durable storage.

**F2 — HIGH — dispatch the two blocked workflows (UI, since the API token lacks `actions:write`)**

1. GitHub → repo `uddieee33-blip/Sornio` → **Actions**.
2. Left sidebar → **Workspace browser review** → **Run workflow** → Branch: **`main`** → **Run workflow**.
3. Left sidebar → **Windows local workspace** → **Run workflow** → Branch: **`main`** → **Run workflow**.
4. Confirm each run's **head SHA is `baabf5fe35462de22d8a4d6132e29b3873fc919d`**. If it shows anything else, the run tested the wrong commit — stop and re-dispatch.
5. Record run IDs, job IDs, start/completion timestamps and conclusions.
6. Note: the Windows run takes ~29 minutes and produces fresh main-triggered artifacts with a new expiration date, which supersedes the urgency of F1 but does not replace the historical evidence.

**F3 — HIGH — execute the 15-stage physical acceptance**

On the actual shop Windows PC with the real printer, scanner and backup USB drive, using `docs/reviews/windows-physical-pilot-execution-record-2026-11-02.md`. Record results, evidence references, tester and date for every stage. Physical success cannot be simulated.

**F4 — MEDIUM — obtain an Authenticode/EV code-signing certificate** before any distribution beyond the controlled pilot. Until then, SmartScreen warnings are expected and must not be suppressed.

**F5 — MEDIUM — resolve D-01** (add `push: branches: [main]` to the Windows and browser workflows) so main can never again receive a Windows-unverified merge.

**Do not**: publish this unsigned build as a commercial release; merge Dependabot PRs #137–#140 during this release window; touch PRs #126/#127; change rulesets or permissions; bulk-delete branches.

---

## L. Independent Release Verdict

Four separate decisions. They are not interchangeable and must not be aggregated into a single success claim.

### L.1 Repository integration — **GO**

`main` at `baabf5f` is green on its exact commit (CI `41474089057`), the PR #142 tree-equality assertion is verified by identical tree hashes with a zero-path diff, and I independently reproduced lint, both type checkers and all 30 verification scripts (493 assertions) with exit 0. Integration is complete and sound.

### L.2 Automated Windows release candidate — **CONDITIONAL GO**

A Windows NSIS build with SQLCipher, native UIA and installer-lifecycle evidence exists, and its job concluded success on a tree byte-identical to main. Three conditions hold it back from unconditional GO:

1. Provenance is **PR-bound**, not main-triggered (D-01, D-04). F2 would close this.
2. The archives **expire in ~7 days** and are not durably archived (D-03). F1 closes this.
3. The **installer executable SHA-256 is unverified** against its evidence manifest in this review — only archive digests were confirmed.

### L.3 Controlled physical single-PC pilot — **NO-GO**

All 15 physical acceptance stages are **UNTESTED**. No authorised operator has run the checklist on the real shop PC. Automated VM testing does not transfer to thermal printing, Gurmukhi paper output, USB HID scanning, USB durability, or runtime-absent offline bootstrap. The pilot opens when 15/15 PASS with zero P0/P1 defects is recorded and signed.

### L.4 Public commercial release — **NO-GO**

The installer is unsigned with no Authenticode/EV certificate; cross-version upgrade is untested; no physical pilot exists; GST statutory invoicing, automated payment settlement, multi-PC deployment and public onboarding are all explicitly out of scope. Distributing this build publicly would be an unsupported claim.

---

## Artefacts produced this session

| Path | What it is |
| --- | --- |
| `docs/reviews/windows-pilot-main-baseline-2026-11-02.json` | Machine-readable main-bound release manifest (all fields in section D, plus every verdict and limitation) |
| `docs/reviews/windows-pilot-local-verification-2026-11-02.txt` | Full transcript of `npm run verify` (493 assertions, exit 0) on tree `871c48b` |
| `docs/reviews/windows-physical-pilot-execution-record-2026-11-02.md` | 15-stage results record with per-stage test ID, expected/actual, status, evidence, tester, date, defect |
| `docs/reviews/windows-physical-pilot-tracker-2026-11-02.csv` | 15-row machine-readable acceptance tracker |
| `scripts/preserve-windows-artifacts.ps1` | Founder-runnable artifact preservation and installer-checksum verification script |
| `docs/reviews/windows-pilot-release-verdict-2026-11-02.md` | This report |

Historical evidence was not overwritten. `docs/reviews/release-evidence-manifest-2026-11-02.json` remains intact and is cross-referenced as a companion, not replaced.

---

**SORNIO** — Small business, big numbers. **SET THE STANDARD.**
