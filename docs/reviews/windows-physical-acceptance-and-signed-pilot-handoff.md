# Windows Physical Acceptance & Signed Pilot Handoff Report

**Date:** 2026-11-25  
**Repository:** `uddieee33-blip/Sornio`  
**Working Branch:** `arena/677ba59c-sornio` (Draft PR `#201`)  
**Pilot Recommendation:** **`NO-GO`** *(zero physical hardware tests executed; Windows installer is unsigned; stacked PR chain `#198 → #199 → #201` is unmerged)*

This handoff report independently verifies repository state, CI records, artifact availability, signing readiness, acceptance package usability, and remaining blockers so a human Windows operator and authorized certificate owner can execute closure without guesswork.

---

## 1. Verified Branch and Commit State

Independently verified via `git fetch origin`, `git rev-parse`, `git merge-base --is-ancestor`, and `gh pr view`:

| Reference | Verified Commit SHA | Status |
|---|---|---|
| `origin/main` | `1cc5c798d1eada9a16463213b0776c01e99d36f9` | Default branch (untouched) |
| `origin/arena/9bbe1260-sornio` (PR `#198`) | `98d285cba1aa244c17b3264755dc986ed98eed74` | Open, non-draft (`MERGEABLE` / `UNSTABLE`) |
| `origin/repair/windows-foundation-ci-20261119` (PR `#199`) | `0a9ec374b3a8d877c6332f33d5ba1d23e5f8c0f9` | Open, draft (`MERGEABLE` / `CLEAN`) |
| `origin/arena/677ba59c-sornio` (PR `#201` — verified code commit) | `d2d3071c8fbce282a42556476c453b512b7a317d` | Verified 8/8 CI PASS (all code + acceptance package) |
| `origin/arena/677ba59c-sornio` (PR `#201` — prior readiness report commit) | `ce5a1b235ae668d137414504aaf47f0a65e529be` | Docs-only commit on top of `d2d3071`; 6/6 non-Windows checks PASS, `Windows local workspace` run `45663638646` (`local-windows` job `139379814390`) `in_progress` at inspection time |

- **Ancestry check (`git merge-base --is-ancestor`):**
  - `origin/main` (`1cc5c79`) `<=` PR `#198` (`98d285c`): **VERIFIED**
  - PR `#198` (`98d285c`) `<=` PR `#199` (`0a9ec37`): **VERIFIED**
  - PR `#199` (`0a9ec37`) `<=` PR `#201` (`ce5a1b2`): **VERIFIED**

---

## 2. Verified PR Dependency Chain

```text
main (1cc5c79)
 └── PR #198: arena/9bbe1260-sornio (98d285c) — OPEN, non-draft, MERGEABLE / UNSTABLE
      └── PR #199: repair/windows-foundation-ci-20261119 (0a9ec37) — OPEN, draft, MERGEABLE / CLEAN
           └── PR #201: arena/677ba59c-sornio (ce5a1b2 + this closure commit) — OPEN, draft, MERGEABLE
```

- **PR `#198` check findings (verified via GitHub API on `98d285c`):** 14 checks `success`, `Supabase Preview` `skipped`, and **2 failures**: `local-windows` (`133330756898`) and `browser` (`133295642912`). Those foundation CI failures are precisely what PR `#199` was created to repair (`7/7` active checks `success` on `0a9ec37`, including `local-windows` `136966421964` and `browser` `136966422103`).
- **PR `#201` integration note:** Base branch `repair/windows-foundation-ci-20261119` is preserved untouched. None of `#198`, `#199`, or `#201` have been merged. Dependabot PR `#200` remains held/superseded by `#201`'s already-patched `Cargo.lock` (`url 2.5.9`, `form_urlencoded 1.2.3`, `cookie 0.18.3`).

---

## 3. Verified CI Status with Run IDs

### 3.1 Verified Code Commit `d2d3071c8fbce282a42556476c453b512b7a317d` — 8/8 Active Checks PASS

Independently confirmed against GitHub API `commits/d2d3071.../check-runs` and `gh run list`:

| Check Run | Workflow | Run ID | Job / Check ID | Conclusion | Verified Scope |
|---|---|---|---|---|---|
| `Real PostgreSQL concurrency` | Replication PostgreSQL | `45635688063` | `139280371977` | **PASS** | Cloud/replication concurrency |
| `Dependency audit` | CI | `45635688283` | `139282899786` | **PASS** | Strict `cargo audit` (0 suppressions) + `npm audit` |
| `Lint, types, build` | CI | `45635688283` | `139282900392` | **PASS** | ESLint, TypeScript, Vite & desktop bundle |
| `Historical SQLCipher compatibility (4.6.1 to 4.20.0)` | CI | `45635688283` | `139282908920` | **PASS** | Legacy SQLCipher ciphertext compatibility |
| `browser` | Workspace browser review | `45635688117` | `139280372208` | **PASS** | `cargo fmt --check`, Rust tests, browser review |
| `macos` | macOS desktop workspace | `45635688200` | `139294915210` | **PASS** | macOS desktop & local-store tests |
| `local-windows` | Windows local workspace | `45635688125` | `139298192043` | **PASS** | Release+debug SQLCipher tests, Windows `0.4.0` NSIS installer build, `WINDOWS_SIGNING_TESTS_PASSED 11/11`, `-VerifyManifest`, installed offline recovery |
| `Phase 23 upgrade (0.3.0 -> 0.4.0), offline install & 10k/50k scale` | Windows local workspace | `45635688125` | `139352055594` | **PASS** | Genuine `0.3.0 → 0.4.0` upgrade + downgrade refusal, clean WebView2-absent offline install (`119.72 s`), 10k/50k scale (`434.61 s`, `150.54` postings/s, `16.03 MB` peak RSS, reconciliation PASS) |

*(Plus `Supabase Preview` `139280305436`: `skipped`.)*

### 3.2 Prior Docs-Only Commit `ce5a1b235ae668d137414504aaf47f0a65e529be`

| Workflow | Run ID | Status at Independent Inspection |
|---|---|---|
| Replication PostgreSQL | `45663638805` | `completed` / `success` |
| CI (`Lint, types, build`, `Dependency audit`, `Historical SQLCipher`) | `45663638624` | `completed` / `success` |
| Workspace browser review | `45663638597` | `completed` / `success` |
| macOS desktop workspace | `45663638735` | `completed` / `success` |
| Windows local workspace | `45663638646` | `in_progress` (`local-windows` job `139379814390`; triggered because `pull_request` `paths:` evaluates all PR `#201` files) |

---

## 4. Installer Artifact and Checksum Status

Independently checked via `gh api repos/uddieee33-blip/Sornio/actions/runs/45635688125/artifacts`, job annotations (`139298192043` & `139352055594`), and an attempted `gh run download`:

| Artifact / File | Verification Source | Exact Size & Checksum | Retention / Accessibility Status |
|---|---|---|---|
| GitHub Actions artifact zip `Sornio-Local-Workspace-Review` (Artifact ID `15042059041`, Run `45635688125`) | **VERIFIED** via GitHub API | `304,381,475` bytes · zip digest `sha256:cf47d6015da4c9240941c2f5fd20f1c6350c38d5c2ab449877be866ffeec0eef` | `expired: false` · **Expires `2026-12-02T16:36:48Z`** (7-day retention) |
| Companion artifacts (`Sornio-Local-Native-Captures` ID `15042496357`; `Sornio-Phase23-Evidence` ID `15046066497`) | **VERIFIED** via GitHub API | `1,689,890` bytes (`sha256:8c848b55...`) and `5,662` bytes (`sha256:7fd6c5a5...`) | `expired: false` · **Expires `2026-12-02T16:36:59Z` / `17:15:39Z`** |
| Inner NSIS installer `Sornio Local Review_0.4.0_x64-setup.exe` | **VERIFIED** via both `PHASE23_RELEASE_MANIFEST` (`139298192043`) and `PHASE23_OFFLINE_INSTALL_EVIDENCE` (`139352055594`) | `304,306,144` bytes (`290.21 MB`) · SHA-256 `ffc009bee0ad46cce3326a35dbfc3e9d6ab66f3d25acd87e033f93968aac351f` | **Unsigned** (`signingState: BLOCKED`, `releaseReady: false`, `authenticodeStatus: NotSigned`) |
| Direct binary download from sandbox (`gh run download`) | **NOT ACCESSIBLE IN SANDBOX** | Redirects to `productionresultssa4.blob.core.windows.net`, which returns `EOF` under sandbox egress restrictions | **Operator Action Required:** Download on Windows before `2026-12-02T16:36:48Z` (or from the latest green PR `#201` run) and verify both the zip SHA-256 and extracted `.exe` SHA-256 locally via `verify-physical-bench-prereqs.ps1`. |

---

## 5. Physical Tests Genuinely Completed vs. Still Blocked

- **Physical Tests Genuinely Completed on Real Windows Hardware:** **`0`**
- **Physical Tests Still Blocked (`NOT RUN`):** **`38` test IDs across 10 blockers (`BLK-01` – `BLK-10`)**:
  - Offline installation, upgrade & cold boot: `IN1`, `IN2`, `IN3`, `IN4` (`README.md` §3) — **`BLOCKED` (`NOT RUN`)**
  - Low-spec shop PC performance: `PERF1`, `PERF2` (`README.md` §3) — **`BLOCKED` (`NOT RUN`)**
  - USB HID barcode scanner & multi-device: `SC1`–`SC7` (`barcode-scanner-test-procedure.md`) — **`BLOCKED` (`NOT RUN`)**
  - Thermal receipt printer (80 mm & 58 mm): `PR1`, `PR2a`, `PR2b`, `PR3`–`PR7` (`printer-and-cash-drawer-test-procedure.md`) — **`BLOCKED` (`NOT RUN`)**
  - Cash drawer: `CD1`–`CD3` (`printer-and-cash-drawer-test-procedure.md`) — **`BLOCKED` (`NOT RUN`)**
  - External USB backup, clean restore & controlled power-loss recovery: `BR1`–`BR4`, `PL1`–`PL7` (`backup-restore-and-power-loss-procedure.md`) — **`BLOCKED` (`NOT RUN`)**
  - End-to-end financial, stock, credit, payable, RBAC & audit reconciliation: `R1`–`R9` (`transaction-reconciliation-checklist.md`) — **`BLOCKED` (`NOT RUN`)**

### Acceptance Package Usability Audit Corrections Made

Inspecting the existing package against the source code and `docs/reviews/physical-hardware-and-supervised-pilot-readiness.md` surfaced concrete usability gaps that were corrected in place (documentation only; zero application code changed):

1. **SKU mismatch fixed (`transaction-reconciliation-checklist.md`):** Corrected `0089011100003 Musical Folding Baby Walker` to `0089011100004 Musical Folding Baby Walker (8-Wheel)` so it matches `pilot-starter-catalog.csv` (`0089011100003` is `Kids Steel Tricycle with Canopy & Bell`).
2. **Explicit reconciliation IDs added (`transaction-reconciliation-checklist.md`):** Added `R1`–`R9` row IDs matching the blocker register and defect template.
3. **PowerShell 7 compatibility fixed (`backup-restore-and-power-loss-procedure.md` `BR1`):** Replaced Windows-PowerShell-5.1-only `Get-Content -Encoding Byte` with `[System.IO.File]::ReadAllBytes(...)[0..15]`, which works identically on Windows PowerShell 5.1 and PowerShell 7 (`pwsh`).
4. **80 mm vs. 58 mm split (`printer-and-cash-drawer-test-procedure.md`):** Split `PR2` into `PR2a` (80 mm) and `PR2b` (58 mm), added the `Spooler` service prerequisite, explicitly restated unsupported raw ESC/POS & USB/serial cash-drawer boundaries, and noted that `PR4`'s 60+ char item and 25-line invoice require creating temporary bench items beyond the 11-row starter CSV.
5. **Barcode scanner prerequisites tightened (`barcode-scanner-test-procedure.md`):** Added explicit requirements for printed barcode labels matching the CSV SKUs and verifying Windows OS keyboard layout is set to English (avoiding Gurmukhi OS IME corruption during scanning).
6. **Physical install/upgrade & low-spec performance IDs added (`README.md`):** Added `IN1`–`IN4` and `PERF1`–`PERF2`, linked the new `EVIDENCE-CAPTURE-GUIDE.md`, and noted 7-day artifact expiry.
7. **Prior report discrepancies noted:** The earlier `docs/reviews/physical-hardware-and-supervised-pilot-readiness.md` wrote `.sornio-backup` (actual verified extension in `apps/desktop/src-tauri/src/main.rs:1136,1165-1166` is `.sorniobackup`) and paraphrased `PR1`–`PR7` / `SC1`–`SC7` / `BR1`–`BR4` / `PL1`–`PL7` with drifted numbering compared to the procedure files. The procedure files in `docs/pilot/windows-physical-acceptance-package/` plus `docs/reviews/windows-physical-acceptance-blocker-register.md` are now the single authoritative ID reference.

---

## 6. Signing Readiness Audit

Audited directly from `.github/workflows/windows-local.yml` (lines 197–216), `scripts/sign-windows-installer.ps1`, `scripts/test-windows-signing.ps1`, and `scripts/test-signing-manifest-contract.py`:

| Audit Question | Verified Finding | Evidence Reference |
|---|---|---|
| **Required certificate type & trust requirements** | Publicly trusted Windows Authenticode Code Signing certificate issued by a Windows-trusted Root CA, containing a private key, valid current window (`NotBefore <= UTC now <= NotAfter`), and **Code Signing EKU OID `1.3.6.1.5.5.7.3.3`**. Signed with SHA-256 file digest (`/fd SHA256`) and mandatory RFC 3161 SHA-256 timestamp (`/tr <url> /td SHA256`, default `http://timestamp.digicert.com`). Self-signed or untrusted chains fail closed on `signtool verify /pa /tw` and `Get-AuthenticodeSignature.Status != 'Valid'`. **Procurement caveat:** Since June 2023 CA/Browser Forum rules, most newly issued OV/EV code-signing certificates are stored on FIPS 140-2 HSMs or cloud signing services (e.g., Azure Trusted Signing) rather than exportable PFX files. `sign-windows-installer.ps1` currently signs via `signtool.exe sign /f <pfx>`; if the authorized certificate owner procures Azure Trusted Signing or an HSM-backed key instead of a PFX, a bounded developer update to the signing step will be needed before signing runs. | `scripts/sign-windows-installer.ps1:34,193-260,267-284` |
| **Required GitHub Actions secret / variable names** | **Secrets (mandatory pair):** `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD`. Partial configuration (one set without the other) fails closed immediately (`$hasCert -xor $hasPass`). **Optional variable:** `WINDOWS_SIGNING_TIMESTAMP_URL` (defaults to `http://timestamp.digicert.com`; must match `^https?://[^\s]+$`). | `.github/workflows/windows-local.yml:201-204`, `scripts/sign-windows-installer.ps1:156-165` |
| **Secret handling & non-exposure check** | **VERIFIED SAFE WITH ONE RUNTIME NOTE:** Workflow binds secrets strictly to the signing step `env:` (`permissions: contents: read, actions: read`). Script never echoes secrets (`Write-*` checked by regex in `test-signing-manifest-contract.py`), redacts both `$certB64` and `$certPass` via `Remove-SecretText` (`[REDACTED]`) before throwing any error, writes the temporary PFX to `%TEMP%`, and zero-wipes its exact byte length before deletion in `finally`. Verified by **11/11** negative/redaction tests (`scripts/test-windows-signing.ps1`) on Windows CI (`139298192043`). *Runtime note:* `signtool.exe` receives `/p $certPass` in-process on the ephemeral GitHub runner; moving to Azure Trusted Signing / HSM later eliminates PFX/password handling altogether. | `.github/workflows/windows-local.yml:30-32,199-215`, `scripts/sign-windows-installer.ps1:36-49,211-260`, `scripts/test-windows-signing.ps1` |
| **Can unsigned artifacts accidentally be labelled release-ready?** | **NO — FAIL-CLOSED.** `$releaseReady` is computed strictly as `($signingState -eq 'SIGNED' -and $statusText -eq 'Valid' -and $ekuVerified -and $timestampVerified)`. When secrets are absent, the manifest records `signingState: "BLOCKED"`, `releaseReady: false`, `authenticodeStatus: "NotSigned"`. Forged manifests claiming `SIGNED`/`releaseReady: true` for unsigned or untimestamped files are rejected by `-VerifyManifest` (tested in `test-windows-signing.ps1` Case 11 and `test-signing-manifest-contract.py`). **Remaining workflow gap to note:** `windows-local.yml` intentionally runs without `-RequireSignature` for PR builds; there is no dedicated release-tag workflow enforcing `-RequireSignature` yet, so the release operator **must** run `-VerifyManifest -RequireSignature` before approving any pilot/production build. | `scripts/sign-windows-installer.ps1:96-144,286,320-322`, `.github/workflows/windows-local.yml:208-215` |
| **How to verify Authenticode status & certificate identity** | On Windows, run `Get-AuthenticodeSignature -FilePath ".\Sornio Local Review_0.4.0_x64-setup.exe" \| Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate` and `signtool.exe verify /pa /tw ".\Sornio Local Review_0.4.0_x64-setup.exe"` (or `.\scripts\sign-windows-installer.ps1 -InstallerPath <exe> -OutputManifestPath <manifest> -VerifyManifest -RequireSignature`). Confirm `Status = Valid`, expected organization `Subject` and `Thumbprint`, EKU `1.3.6.1.5.5.7.3.3`, and valid RFC 3161 `TimeStamperCertificate`. | `scripts/sign-windows-installer.ps1:96-144,237` |
| **How to verify final installer checksum after signing** | `sign-windows-installer.ps1` computes `Get-FileHash -Algorithm SHA256` at line 262 — **after** `signtool.exe sign` embeds the Authenticode signature and timestamp. Therefore `phase23-release-manifest.json`'s `sha256` and `sizeBytes` always match the **final signed bytes**, and running `Get-FileHash <exe> -Algorithm SHA256` plus `-VerifyManifest -RequireSignature` catches even a 1-bit post-sign modification (verified in `test-windows-signing.ps1` Case 10). | `scripts/sign-windows-installer.ps1:80-144,262` |

> **Certificate Custody Boundary:** Certificate procurement, legal identity verification, and GitHub Actions secret entry must be performed exclusively by an authorized adult or organization representative. No certificate, private key, or secret was requested, created, or committed.

---

## 7. Updated Blocker Register

The complete 10-item blocker register is maintained in [`docs/reviews/windows-physical-acceptance-blocker-register.md`](windows-physical-acceptance-blocker-register.md):

- `BLK-01` — Physical Windows 10/11 offline install & upgrade (`IN1`–`IN4`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-02` — USB HID barcode scanner (`SC1`–`SC7`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-03` — 80 mm thermal receipt printer (`PR1`, `PR2a`, `PR3`–`PR7`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-04` — 58 mm thermal receipt printer (`PR2b`, `PR3`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-05` — Cash drawer compatibility & limitations (`CD1`–`CD3`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-06` — External USB backup, restore & power-loss recovery (`BR1`–`BR4`, `PL1`–`PL7`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-07` — End-to-end financial reconciliation (`R1`–`R9`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-08` — Low-spec shop PC performance (`PERF1`–`PERF2`) — **`BLOCKED` (`NOT RUN`)**
- `BLK-09` — Windows Authenticode code signing & signature validation — **`BLOCKED`**
- `BLK-10` — Ordered PR integration (`#198 → #199 → #201 → main`) & final signed candidate verification — **`BLOCKED`**

---

## 8. Exact Next Actions

### A. Human Windows Operator (Disposable QA Bench — Can Start Immediately)
1. Download `Sornio-Local-Workspace-Review` from GitHub Actions run **`45635688125`** (before **`2026-12-02T16:36:48Z`**, or from the latest green run on PR `#201`) and copy `docs/pilot/windows-physical-acceptance-package/` to `C:\SornioBench\`.
2. Follow [`EVIDENCE-CAPTURE-GUIDE.md`](../pilot/windows-physical-acceptance-package/EVIDENCE-CAPTURE-GUIDE.md) §3 to capture `00-bench-preflight.json`, `01-machine-and-os-specs.txt`, and `02-installer-signature-verify.txt` confirming SHA-256 `ffc009bee0ad46cce3326a35dbfc3e9d6ab66f3d25acd87e033f93968aac351f` (explicit unsigned QA bench waiver only — never install unsigned on live shop data).
3. Disconnect Wi-Fi and Ethernet completely; execute `IN1`–`IN4`, `PERF1`–`PERF2`, `SC1`–`SC7`, `PR1`–`PR7` (`PR2a`/`PR2b`), `CD1`–`CD3`, `BR1`–`BR4`, `PL1`–`PL7`, and `R1`–`R9`.
4. Archive the complete `evidence-YYYY-MM-DD/` bundle (including thermal paper photos, hashes, reconciliation sheet, and any `BENCH-YYYYMMDD-NNN` defect reports) and attach it to PR `#201`.

### B. Authorized Certificate Owner (In Parallel with Bench QA)
1. Procure a publicly trusted Windows Authenticode Code Signing certificate (EKU `1.3.6.1.5.5.7.3.3`) — either an exportable PFX (works immediately with `WINDOWS_SIGNING_CERT_PFX_BASE64` + `WINDOWS_SIGNING_CERT_PASSWORD`) or Azure Trusted Signing / HSM (notify developer first if HSM/cloud signing integration is needed).
2. Configure repository secrets without pasting secret values into chat, logs, or commits.

### C. Developer / Maintainer (After Bench QA & Signing Secrets Ready)
1. Fix any `Critical`/`High` physical defects found by the Windows operator and re-test on physical hardware.
2. Resolve `#198` checks and merge `#198 → #199 → #201` strictly in order (retiring superseded Dependabot `#200`).
3. Run `windows-local.yml` on `main` with signing secrets active, confirm `signingState: "SIGNED"` and `releaseReady: true`, and have the Windows operator run a final signed-installer `IN1`/`IN2`/`PR2a`/`SC1` smoke verification before Day 1 shop installation.

---

## 9. Explicit Pilot Recommendation

### **RECOMMENDATION: `NO-GO`**

Sornio `0.4.0` is **NOT authorized** to begin a supervised live shop pilot today for three independent, verifiable reasons:

1. **Zero physical device evidence exists (`BLK-01` – `BLK-08`):** Automated CI proves offline packaging, upgrade, SQLCipher integrity, and 10k/50k database performance on a cloud VM, but zero tests have been run on a real Windows 10/11 shop PC with an actual USB HID barcode scanner, 80 mm/58 mm thermal receipt printer, RJ11 cash drawer, or removable USB flash drive.
2. **Installer is unsigned (`BLK-09`):** `Sornio Local Review_0.4.0_x64-setup.exe` carries `signingState: "BLOCKED"`, `releaseReady: false`, and `authenticodeStatus: "NotSigned"` (run `45635688125`), which fails Windows SmartScreen trust and release-integrity controls.
3. **Code is on an unmerged stacked draft PR chain (`BLK-10`):** PR `#201` (draft) depends on PR `#199` (draft) and PR `#198` (open, `UNSTABLE`), so no signed pilot candidate exists on `main`.
