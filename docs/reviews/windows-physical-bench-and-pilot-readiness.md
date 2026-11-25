# Sornio Windows Physical Bench Acceptance, Installer Signing & Supervised Retail Pilot Readiness Report

**Date:** 2026-11-25  
**Repository:** `uddieee33-blip/Sornio`  
**Verified code candidate commit:** `33ed291a81c3cf51706c831122f1d73bdcc3d502` (branch `arena/677ba59c-sornio`, draft PR `#201`)  
**Previous Phase 23 baseline commit:** `319dda8fa37544967ee1de99e2da409b70d64d73` (preserved and superseded by `33ed291`)  
**Target desktop version / schema:** Sornio Local Review `0.4.0` / SQLCipher schema `v24`

---

## 1. Executive Readiness Verdict

| Readiness Gate | Verdict | Basis |
|---|---|---|
| **Automated CI, Dependency Security (`cargo audit` & `npm audit`), Cross-Platform Native Tests & Hosted Windows Acceptance (`0.3.0 -> 0.4.0` Upgrade, WebView2-Absent Offline Install, 10k/50k Scale)** | **PASS** | All 8 CI checks green on `33ed291` (`CI`, `Dependency audit`, `Historical SQLCipher`, `Real PostgreSQL concurrency`, `browser`, `macos`, `local-windows`, and `Phase 23 upgrade/offline/scale`). Both `RUSTSEC-2026-0592` (`url`) and `RUSTSEC-2026-0594` (`cookie`) remediated cleanly via official patched crates (`url 2.5.9`, `form_urlencoded 1.2.3`, `cookie 0.18.3`) without weakening `cargo audit`. |
| **Windows Authenticode Release Signing Readiness** | **BLOCKED (external secret required)** | Signing pipeline (`scripts/sign-windows-installer.ps1`) hardened fail-closed, workflow secret forwarding bug fixed, and 11/11 Windows negative/tamper tests + 3/3 cross-platform contract tests **PASS**. However, no organizational Windows EV/OV PFX or Azure Trusted Signing credentials (`WINDOWS_SIGNING_CERT_PFX_BASE64`, `WINDOWS_SIGNING_CERT_PASSWORD`) are provisioned in repository secrets, so built installers remain `signingState: BLOCKED`, `releaseReady: false`, `authenticodeStatus: NotSigned`. |
| **Physical Windows Bench Acceptance (58 mm/80 mm Thermal Printer, English+Gurmukhi Paper Output, USB HID Scanner, RJ11 Cash Drawer, External USB Backup/Restore, OS Process-Termination Bench Drill)** | **NOT RUN** | Cloud GitHub Actions Windows runners have no physical thermal printer, USB HID barcode scanner, RJ11 cash drawer, or removable USB flash drive attached. Bench execution on a real shop-class Windows 10/11 PC using `docs/pilot/bicycle-retail-pilot-checklist.md` is mandatory prior to shop cutover. |
| **Supervised Real-Shop Pilot (Small Bicycle, Toys, Tricycles, Walkers & Spare-Parts Counter)** | **BLOCKED / NOT RUN** | Ready to begin **physical bench testing** immediately with verified SHA-256 checksum (`4b67c9c8c25b473bf8049a5b215eb61b0f7d813202b1995031bfc4024e2df86d`), but **blocked from supervised live shop counter deployment** until (1) physical bench acceptance passes on target hardware and (2) organizational Authenticode signing is provisioned (or an explicit written controlled-pilot waiver with verified SHA-256 is approved for single-PC supervised trial only). |
| **Unattended Production / Multi-Shop Release** | **BLOCKED** | Blocked pending trusted Authenticode signature + RFC 3161 timestamp, completed physical bench sign-off, completed supervised retail pilot sign-off, and clean ordered merge of PR `#198 -> #199 -> #201` onto `main`. |

**Overall Milestone Verdict:** **CONDITIONAL PASS — READY FOR PHYSICAL WINDOWS BENCH ACCEPTANCE; BLOCKED FOR UNSIGNED PRODUCTION / UNATTENDED SHOP DEPLOYMENT.**

---

## 2. Verified Repository & PR Chain Baseline (`main`, `#198`, `#199`, `#201`)

Inspected directly against `origin` via `git` and `gh` on 2026-11-25:

| Ref / PR | Branch | Base -> Head SHA | State | Mergeable / State | Commits vs Base | Files Changed | Latest Check Summary |
|---|---|---|---|---|---|---|---|
| `origin/main` | `main` | `1cc5c798d1eada9a16463213b0776c01e99d36f9` | Default branch | — | — | — | Baseline (`schema v4` historical anchor) |
| **PR `#198`** | `arena/9bbe1260-sornio` | `main` (`1cc5c798`) -> `98d285cb` | Open (non-draft) | `MERGEABLE` / `UNSTABLE` | 183 | 383 | Phase 22 Windows foundation (`schema v23`, desktop `0.3.0`); `local-windows`/`browser` failed prior to PR `#199` repair |
| **PR `#199`** | `repair/windows-foundation-ci-20261119` | `arena/9bbe1260-sornio` (`98d285cb`) -> `0a9ec374` | Open (draft) | `MERGEABLE` / `CLEAN` | 12 | 15 | All 7 checks **PASS** (unblocked Phase 22 Windows native acceptance & CI) |
| **PR `#201`** | `arena/677ba59c-sornio` | `repair/windows-foundation-ci-20261119` (`0a9ec374`) -> `33ed291a` (+ this report commit) | Open (draft) | `MERGEABLE` / `CLEAN` (on `33ed291a`) | 10 (at `33ed291a`) | 51 | **8/8 checks PASS** on `33ed291a` (including `Dependency audit`, `local-windows`, `Phase 23 upgrade/offline/scale`, `browser`, `macos`, `Historical SQLCipher`, `Real PostgreSQL`, `Lint/types/build`) |

**Ancestry Verification:** Strict linear ancestry verified (`git merge-base --is-ancestor`):  
`origin/main` (`1cc5c798`) ⊂ PR `#198` (`98d285cb`) ⊂ PR `#199` (`0a9ec374`) ⊂ PR `#201` (`319dda8f` -> `33ed291a`).

**File Overlap Matrix:**
- `PR #198 ∩ PR #199` = 10 files (`.github/workflows/windows-local.yml`, desktop check/test scripts, `packages/local-store/examples/cashier_review_bridge.rs`, `scripts/verify-desktop-copy-contract.mjs`).
- `PR #199 ∩ PR #201` = 2 files (`.github/workflows/windows-local.yml`, `packages/local-store/examples/cashier_review_bridge.rs`).
- `PR #198 ∩ PR #201` = 32 files (desktop app, local-store, workflows, contract scripts).
- Separate open PR **`#200`** (`dependabot/npm_and_yarn/minor-and-patch-c0a042c0a0` targeting `main`) touches npm lockfiles independently and must not be merged ahead of `#198 -> #199 -> #201` without rebasing and re-running full desktop/Windows CI.
- Older open draft PRs **`#151`–`#197`** are historical stacked phase branches whose commits are already rolled up into PR `#198` (`main..#198` = 183 commits); none were modified, closed, or merged in this milestone.

**Verified CI Runs for Code Candidate `33ed291a81c3cf51706c831122f1d73bdcc3d502`:**

| Workflow | Run ID | Jobs & Outcome |
|---|---|---|
| **CI** | [`45598118617`](https://github.com/uddieee33-blip/Sornio/actions/runs/45598118617) | `Lint, types, build` (**PASS**), `Dependency audit` (**PASS**), `Historical SQLCipher compatibility (4.6.1 to 4.20.0)` (**PASS**) |
| **Windows local workspace** | [`45598118720`](https://github.com/uddieee33-blip/Sornio/actions/runs/45598118720) | `local-windows` (**PASS**, 32/32 steps, `WINDOWS_SIGNING_TESTS_PASSED 11/11`), `Phase 23 upgrade (0.3.0 -> 0.4.0), offline install & 10k/50k scale` (**PASS**) |
| **Workspace browser review** | [`45598118524`](https://github.com/uddieee33-blip/Sornio/actions/runs/45598118524) | `browser` (**PASS**, `cargo fmt --check`, 325+ native debug/release SQLCipher tests, Playwright acceptance) |
| **macOS desktop workspace** | [`45598118518`](https://github.com/uddieee33-blip/Sornio/actions/runs/45598118518) | `macos` (**PASS**, arm64 native debug/release tests + `--locked` Tauri build) |
| **Replication PostgreSQL** | [`45598118578`](https://github.com/uddieee33-blip/Sornio/actions/runs/45598118578) | `Real PostgreSQL concurrency` (**PASS**) |

---

## 3. Windows Authenticode Signing Audit & Status (Workstream A)

### 3.1 Real Defect Caught & Fixed During Audit

1. **Missing GitHub Actions secret forwarding bug (FIXED):** Prior to this milestone, `.github/workflows/windows-local.yml` invoked `scripts/sign-windows-installer.ps1` **without** mapping `secrets.WINDOWS_SIGNING_CERT_PFX_BASE64`, `secrets.WINDOWS_SIGNING_CERT_PASSWORD`, or `vars.WINDOWS_SIGNING_TIMESTAMP_URL` into the step's `env:` block. Even if repository owners had provisioned those secrets, signing would have stayed silently `BLOCKED`. Fixed in `.github/workflows/windows-local.yml`.
2. **PowerShell strict-mode stderr redaction hazard (FIXED):** Under `Set-StrictMode -Version Latest` + `$ErrorActionPreference = 'Stop'`, invoking `signtool.exe ... 2>&1` threw raw `RemoteException` errors before secret redaction ran. Fixed in `scripts/sign-windows-installer.ps1` by isolating native `signtool.exe` stderr capture with `$ErrorActionPreference = 'Continue'` in `try/finally`, followed by explicit `Remove-SecretText` sanitization.

### 3.2 Signing Security Invariants Implemented (`scripts/sign-windows-installer.ps1`)

| Control | Implementation | Automated Test Proof | Status |
|---|---|---|---|
| **SHA-256 Authenticode + RFC 3161 timestamping** | `signtool.exe sign /fd SHA256 /tr <url> /td SHA256` + `signtool.exe verify /pa /tw` | `scripts/test-windows-signing.ps1` cases 8 & 9 + `scripts/test-signing-manifest-contract.py` | **PASS** |
| **Certificate validity window & Code Signing EKU** | Loads PFX via `X509KeyStorageFlags::EphemeralKeySet`; enforces `HasPrivateKey`, `NotBefore <= UtcNow <= NotAfter`, and EKU OID `1.3.6.1.5.5.7.3.3` before signing and after signing | `scripts/test-windows-signing.ps1` cases 5, 6, 7 | **PASS** |
| **Fail-closed partial / invalid secrets** | Rejects cert-without-password, password-without-cert, invalid Base64, corrupt PFX, wrong password, and invalid TSA URL | `scripts/test-windows-signing.ps1` cases 3, 4, 5, 8 | **PASS** |
| **Zero secret leakage & temp PFX wiping** | Redacts both PFX Base64 and password from every exception/tool output; zero-overwrites temp `.pfx` bytes before deletion in `finally` | `scripts/test-windows-signing.ps1` `-ForbiddenSecrets` assertions across cases 3–9 | **PASS** |
| **Unsigned / self-signed cannot claim `SIGNED` / `releaseReady`** | `releaseReady = ($signingState -eq 'SIGNED' -and $statusText -eq 'Valid' -and $ekuVerified -and $timestampVerified)`; post-sign self-signed/untrusted chain fails closed | `scripts/test-windows-signing.ps1` cases 1, 2, 11 | **PASS** |
| **Manifest tamper & installer correspondence (`-VerifyManifest`)** | Independently re-hashes installer SHA-256, verifies exact `fileName`, `sizeBytes`, live `Get-AuthenticodeSignature`, EKU, thumbprint, and RFC 3161 timestamp | `scripts/test-windows-signing.ps1` cases 1, 2, 10, 11 + `scripts/test-signing-manifest-contract.py` + wired into `windows-local.yml` Step 16 | **PASS** |
| **Organizational signing credentials provisioned in GitHub Secrets** | Checked via live `windows-local.yml` run `45598118720` (`signingState: BLOCKED`, `authenticodeStatus: NotSigned`; GitHub integration token lacks `actions/secrets` admin read scope HTTP 403) | `PHASE23_RELEASE_MANIFEST` annotation on `33ed291` | **BLOCKED** |

### 3.3 Exact Verified Release Manifest (`33ed291`, Run `45598118720`)

- **File:** `Sornio Local Review_0.4.0_x64-setup.exe`
- **Size:** `304,299,762` bytes (`290.20 MB`)
- **SHA-256:** `4b67c9c8c25b473bf8049a5b215eb61b0f7d813202b1995031bfc4024e2df86d`
- **Signing State:** `BLOCKED` (`releaseReady: false`, `authenticodeStatus: NotSigned`, `codeSigningEkuVerified: false`, `timestampVerified: false`)
- **Required GitHub Repository Configuration (Owner Action):**
  - Repository Secret `WINDOWS_SIGNING_CERT_PFX_BASE64`: Base64-encoded PKCS#12 (`.pfx`) organizational EV/OV Windows Code Signing certificate containing the private key and Code Signing EKU (`1.3.6.1.5.5.7.3.3`), or switch signing step to Azure Trusted Signing.
  - Repository Secret `WINDOWS_SIGNING_CERT_PASSWORD`: PFX decryption passphrase.
  - Optional Repository Variable `WINDOWS_SIGNING_TIMESTAMP_URL`: RFC 3161 SHA-256 TSA URL (defaults to `http://timestamp.digicert.com`).

---

## 4. Rust Security Advisory Investigation & Policy Decision (Workstream B)

### 4.1 Investigation & Reachability Findings

Direct inspection of `rustsec/advisory-db`, `rust-lang/crates.io-index`, and `apps/desktop/src-tauri/Cargo.lock` reversed the earlier Phase 23 assumption that no upstream patches were available — **both advisories have official non-yanked patched releases on crates.io**:

| Advisory | Crate & Vulnerable Range | Dependency Path in Sornio | Sornio Reachability | Official Upstream Patch | Action Taken |
|---|---|---|---|---|---|
| **`RUSTSEC-2026-0592`** (`GHSA-hrj5-67jp-wqp9`, published 2026-11-20) | `url <= 2.5.8` — uncontrolled recursion (DoS stack overflow) in `Url::origin()` / `url::quirks::origin()` on deeply nested `blob:` URLs | Direct in `apps/desktop/src-tauri` (`hub_discovery.rs`) and transitive via `tauri` 2.10.3 / `tauri-utils` / `wry` / `reqwest` / `tauri-plugin-dialog`. **Not present** in `packages/local-store/Cargo.lock`. | **Mitigated at call site & now patched:** `apps/desktop/src-tauri/src/hub_discovery.rs:24,64` enforces `u.scheme() == "https"` and `origin.len() <= 230` before calling `u.origin().ascii_serialization()`, rejecting `blob:` URLs. Transitive Tauri/WebView URL parsing is now protected by the patched crate. | **`url 2.5.9`** (2026-11-20, cksum `f00cd2407bb42c0ef17be88d4cf020f5cceffd121665bac9b8b9493a369b3b1a`) + **`form_urlencoded 1.2.3`** (cksum `afa489199eaffb1211795df1c6236ce1ad0d41a6fa45250add73e3b02420f06e`) | **PATCHED** in `apps/desktop/src-tauri/Cargo.lock` |
| **`RUSTSEC-2026-0594`** (`GHSA-8wcq-xq25-7fhm`, published 2026-11-23, CVSS 7.0) | `cookie >= 0.14.0, < 0.18.3` — AES-GCM nonce reuse in `cookie::PrivateJar::add` / `add_original` after Unix `fork()` | Transitive only via `tauri 2.10.3 -> tauri-runtime 2.10.1 / tauri-runtime-wry 2.10.1 -> wry 0.54.2 -> cookie 0.18.x` (without `private` feature enabled). **Not present** in `packages/local-store/Cargo.lock`. | **Unreachable on Windows & in Sornio:** advisory explicitly states Windows is unaffected (no `fork()`), and Sornio never enables `cookie`'s `private` feature or calls `PrivateJar`. Now also patched at dependency level. | **`cookie 0.18.3`** (2026-11-23, cksum `d55f2d6c30eeec7d5c6f98bd4395d4abb1895629eab97ee6522d340623615f8a`) | **PATCHED** in `apps/desktop/src-tauri/Cargo.lock` |

### 4.2 Policy Verification & Audit Outcome

- **No advisory suppressions added:** `.github/workflows/ci.yml` continues running strict `cargo audit` with zero `--ignore` flags and zero weakened policies.
- **No `Cargo.toml` dependency additions/removals:** Transitive constraints (`percent-encoding 2.3.2`, `time 0.3.55`, `version_check 0.9.5`, `idna 1.1.0`, `serde 1.0.229`) were already satisfied in `apps/desktop/src-tauri/Cargo.lock`.
- **Verification Verdict:** **PASS** — `cargo audit` passed on both `apps/desktop/src-tauri/Cargo.lock` and `packages/local-store/Cargo.lock` in CI run [`45598118617`](https://github.com/uddieee33-blip/Sornio/actions/runs/45598118617), and `--locked` builds succeeded across Windows (`45598118720`), macOS (`45598118518`), and Linux (`45598118524`).
- **Ongoing Advisory Reassessment Policy:** Keep strict `cargo audit` blocking in `CI` (`Dependency audit`); if a future upstream RustSec advisory has no patched crates.io release, never suppress it silently — open a documented tracking issue, assess reachability, and reassess weekly until upstream ships a verified patch.

---

## 5. Physical Windows Peripheral Acceptance Plan & Results (Workstream C)

Physical hardware procedures and protocol assumptions have been expanded and formalized in **`docs/pilot/bicycle-retail-pilot-checklist.md`** (Sections 1 & 2).

### 5.1 Documented Hardware & Protocol Assumptions

- **Thermal & A4 printing (`TP1`–`TP7`):** Uses Windows print spooler via WebView2 (`window.print()`) with CSS `@page` profiles (`58mm`, `80mm`, `a4`) and bundled `Noto Sans Gurmukhi` for Punjabi (`ਪੰਜਾਬੀ`) receipts. Requires a standard Windows 10/11 printer driver configured to match the roll paper width. No raw USB serial printer bypass is assumed.
- **USB HID barcode scanners (`BS1`–`BS6`):** Assumes standard USB HID Keyboard-Wedge 1D/2D scanners emitting characters + configurable suffix (`Enter`, `Tab`, or `CR+LF`). Serial COM-port or proprietary OPOS-only scanners require switching to HID Keyboard-Wedge mode.
- **Cash drawers (`CD1`–`CD3`):** Printer-driven RJ11 cash drawers are triggered by the thermal printer's Windows driver on print (`Pin 2`: ESC/POS `1B 70 00 19 FA`; `Pin 5`: ESC/POS `1B 70 01 19 FA`, documented in `workstation_settings.rs`). Manual key-opened or absent drawers are first-class supported modes (`Manual key-opened drawer` / `No cash drawer`) and never block checkout.
- **External USB backup media (`EB1`–`EB4`):** Standard FAT32/exFAT/NTFS removable USB drive mounted with a Windows drive letter (`E:\SornioBackups`); backup archives are encrypted `.sorniobackup` files verified via preview confirmation (`RESTORE <12 hex>`) before destructive overwrite.

### 5.2 Physical Peripheral Acceptance Status

| Category | Automated / Contract Coverage | Physical Bench Status | Notes |
|---|---|---|---|
| **58 mm / 80 mm Thermal Printing + English & Gurmukhi Paper Rendering (`TP1`–`TP7`)** | **PASS** (31 Punjabi locale phrases verified by `verify-desktop-contract.mjs`, reprint marking & print-authority recheck verified) | **NOT RUN** | Requires physical 58 mm / 80 mm thermal printer on Windows 10/11 bench PC |
| **USB HID Barcode Scanner (`BS1`–`BS6`)** | **PASS** (`scan-input` / `csv-import` leading-zero, suffix, debounce, and Checkout shortcut contracts verified) | **NOT RUN** | Requires physical USB HID scanner plugged/unplugged mid-cart on Windows bench PC |
| **RJ11 Cash Drawer (`CD1`–`CD3`)** | **PASS** (ESC/POS kick codes, settings persistence, and non-blocking manual/none modes tested natively) | **NOT RUN** | Requires physical RJ11 cash drawer connected via thermal printer + Windows driver kick-on-print verification |
| **External USB Encrypted Backup & Clean-PC Restore (`EB1`–`EB4`)** | **PASS** (encrypted export, wrong-key/corrupt rejection, safety backup, and full restore verified natively and on hosted Windows) | **NOT RUN** | Requires physical removable USB flash drive & second disposable Windows profile/PC restore drill |

---

## 6. Controlled Power-Loss & Interruption Recovery Acceptance (Workstream D)

**Safety Policy:** All interruption tests operate exclusively on disposable test workspaces — never on production shop data and never via unsafe live AC mains disconnection. Physical bench drills use controlled OS process termination (`Stop-Process -Name "sornio-desktop" -Force`) on a disposable Windows profile (`docs/pilot/bicycle-retail-pilot-checklist.md` Section 3).

### 6.1 Automated Native SQLCipher & Hosted Windows Recovery Proof

| Recovery Invariant | Test / Proof Location | Automated / Hosted CI Verdict | Physical Bench Verdict |
|---|---|---|---|
| **Database integrity, ciphertext header & WAL recovery after abrupt drop (`R1`)** | `phase23_reliability_tests.rs::controlled_interruption_across_split_retail_backup_and_rbac_preserves_invariants` (`PRAGMA integrity_check == ok`, non-SQLite ciphertext header) | **PASS** (Windows, macOS, Linux CI `33ed291`) | **NOT RUN** |
| **Interruption during prepared checkout before post + idempotent retry (`R2`)** | `phase23_reliability_tests.rs::restart_during_checkout_and_supplier_payment_preserves_idempotency` | **PASS** (Windows, macOS, Linux CI `33ed291`) | **NOT RUN** |
| **Interruption during 3-way split Cash+UPI+Credit checkout — zero partial payments/credit/stock (`R3`)** | `phase23_reliability_tests.rs::controlled_interruption_across_split_retail_backup_and_rbac_preserves_invariants` (verifies `local_invoices=0`, `local_retail_payments=0`, `local_credit_entries=0`, untouched stock/credit before retry; exact `1`/`3`/`1` atomic commit + idempotent replay after retry) | **PASS** (Windows, macOS, Linux CI `33ed291`) | **NOT RUN** |
| **Idempotent duplicate retry after restart (retail & supplier payment) (`R4`)** | `phase23_reliability_tests.rs::restart_during_checkout_and_supplier_payment_preserves_idempotency` + split-checkout replay | **PASS** (Windows, macOS, Linux CI `33ed291`) | **NOT RUN** |
| **Interrupted backup export (truncated partial archive) leaves live DB untouched & rejects corrupt file (`R5`)** | `phase23_reliability_tests.rs::corrupted_truncated_and_wrong_key_backups_fail_closed` + `controlled_interruption_...` | **PASS** (Windows, macOS, Linux CI `33ed291`) | **NOT RUN** |
| **Single-instance `workspace.lock` blocks concurrent launch & OS releases cleanly on termination (`R6`)** | `device.rs::workspace_instance_lock_blocks_second_holder_and_releases_on_drop` + Windows `check-upgrade.ps1` `upgrade-7` | **PASS** (Windows CI `45598118720`) | **NOT RUN** |
| **RBAC, post-restore staff-disabled audit (`recovery.staff_disabled`), append-only ledgers & balanced journals after recovery (`R7`)** | `phase23_reliability_tests.rs::controlled_interruption_across_split_retail_backup_and_rbac_preserves_invariants` + `verify-local-schema.py` (146 guards) | **PASS** (Windows, macOS, Linux CI `33ed291`) | **NOT RUN** |
| **Automatic encrypted pre-migration safety backup (`v23 -> v24`) & downgrade refusal (`0.3.0` vs `v24`)** | `phase23_reliability_tests.rs::v23_to_v24_migration_creates_encrypted_safety_backup_and_preserves_all_data` + `check-upgrade.ps1` `upgrade-5`, `upgrade-8` | **PASS** (Windows CI `45598118720`) | **NOT RUN** |

---

## 7. Supervised Bicycle-Shop Pilot Readiness Checklist Summary (Workstream E)

`docs/pilot/bicycle-retail-pilot-checklist.md` now provides an end-to-end Day 0 setup and 15-scenario supervised acceptance procedure tailored to a small offline **bicycle, children's toys, tricycles, baby walkers, accessories & workshop spare-parts shop**:

- **Realistic starter catalog & CSV import coverage:** `apps/desktop/test-csv-import.mjs` now verifies realistic bicycle, kids tricycle, folding baby walker, 12V ride-on toy jeep, alloy bell/light combo, and non-barcode loose workshop spokes CSV import with exact integer-paise arithmetic and leading-zero SKU preservation (**3/3 PASS**).
- **Synthetic end-to-end retail day verification:** `phase23_reliability_tests.rs::synthetic_bicycle_shop_pilot_scenarios_a_through_g_reconcile_cleanly` proves opening float, cash/UPI/credit sales, credit limit enforcement, partial credit repayment, damaged vs. sellable returns, supplier PO/damaged receiving/payment, daily cash closing, and encrypted backup/restore reconciliation (**PASS** across Windows, macOS, Linux on `33ed291`).
- **Supervised Shop Pilot Execution (`S1`–`S15` in checklist):** **NOT RUN** — must be executed with the shop owner and counter operator only after Physical Bench Acceptance passes.

---

## 8. Evidence Matrix (Automated / Hosted Windows / Physical Bench / Supervised Shop)

| Acceptance Area | Tier 1: Automated Unit / Native | Tier 2: Hosted Windows CI (`33ed291`, Run `45598118720`) | Tier 3: Physical Windows Bench | Tier 4: Supervised Real Shop |
|---|---|---|---|---|
| **Lint, TypeScript (`tsc` + `tsgo`), i18n, Desktop & Release Contracts, 146 Schema Guards** | **PASS** | **PASS** (`45598118617`) | N/A | N/A |
| **Dependency Security (`npm audit` + strict `cargo audit` on both lockfiles)** | **PASS** (`verify-cargo-lock`) | **PASS** (`45598118617`, 0 advisories) | N/A | N/A |
| **Historical SQLCipher (`4.6.1 -> 4.20.0`) & PostgreSQL Concurrency** | **PASS** | **PASS** (`45598118617`, `45598118578`) | N/A | N/A |
| **macOS & Browser Acceptance (`cargo fmt`, 325+ native tests, Playwright)** | **PASS** | **PASS** (`45598118518`, `45598118524`) | N/A | N/A |
| **Windows `0.4.0` NSIS Offline Installer Build & Installed Lifecycle (`check-installer.ps1`)** | **PASS** | **PASS** (`304,299,762` B, `290.2 MB`, SHA-256 `4b67c9c8...`) | **NOT RUN** | **NOT RUN** |
| **Genuine `0.3.0 -> 0.4.0` In-Place Upgrade, Vault Preservation, Lock & Downgrade Refusal** | **PASS** | **PASS** (`upgrade-1`..`upgrade-8`) | **NOT RUN** | **NOT RUN** |
| **Clean WebView2-Absent + Firewall-Blocked Offline Install (`check-offline-install.ps1`)** | **PASS** | **PASS** (`157.0.4341.46 -> null`, `104.83 s`, `offlineFirstLaunchPassed: true`, `uninstallDataPreserved: true`) | **NOT RUN** | **NOT RUN** |
| **10,000 Products / 50,000 Invoices Windows Scale Benchmark (`run-phase23-workload.py`)** | **PASS** | **PASS** (`657.75 s`, `98.82` postings/s, checkout median `6.57 ms` / p95 `21.66 ms`, search median `5.80 ms`, receipt median `0.22 ms`, peak RSS `16.74 MB`, DB `167,116,800` B) | **NOT RUN** | **NOT RUN** |
| **Signing Script Fail-Closed Negative & Tamper Contract** | **PASS** (3/3 Python contract) | **PASS** (`WINDOWS_SIGNING_TESTS_PASSED 11/11` + `-VerifyManifest`) | **NOT RUN** | **NOT RUN** |
| **Trusted Organizational Authenticode Signature + RFC 3161 Timestamp** | N/A | **BLOCKED** (no org cert secret configured; `NotSigned`, `releaseReady: false`) | **BLOCKED** (requires org cert or signed-off bench SHA-256 waiver) | **BLOCKED** |
| **Controlled Power-Loss / Interruption Recovery (`R1`–`R7`)** | **PASS** (native SQLCipher tests) | **PASS** (native + `workspace.lock` tests) | **NOT RUN** | **NOT RUN** |
| **Physical Thermal Printer (58/80 mm, EN + Gurmukhi), HID Scanner, RJ11 Drawer, USB Backup** | **PASS** (protocol & UI contracts only) | **NOT RUN** (no physical peripherals on hosted runner) | **NOT RUN** | **NOT RUN** |
| **Supervised 15-Scenario Bicycle/Toy Shop Counter Pilot** | **PASS** (synthetic store + CSV tests) | **NOT RUN** | **NOT RUN** | **NOT RUN** |

---

## 9. Release & PR Integration Review (`#198 -> #199 -> #201`) (Workstream F)

### 9.1 Dependency-Chain Technical Audit

| Review Dimension | PR `#198` (`98d285cb`) | PR `#199` (`0a9ec374`) | PR `#201` (`33ed291a`) | Cross-PR Compatibility |
|---|---|---|---|---|
| **Schema & Migrations** | `v4 -> v23` (billing, identity, credit, payments, recovery, LAN, restaurant, kitchen, purchasing) | No schema change | `v23 -> v24` (`workstation_settings` singleton, `local_products_name_nocase` index, `MAX_PRODUCTS = 25_000`) | **PASS** — `verify-local-schema.py` (146 checks) proves clean `v4 -> v24` upgrade and `v23 -> v24` migration backup |
| **SQLCipher Compatibility** | Bundled SQLCipher 4.x | Preserved | Preserved + Historical `4.6.1 -> 4.20.0` CI **PASS** | **PASS** |
| **Installer & Upgrade Packaging** | `0.3.0` NSIS per-user offline installer | Fixed Windows acceptance harness & copy contract | `0.4.0` NSIS (`allowDowngrades: false`, LZMA, genuine `0.3.0 -> 0.4.0` upgrade, WebView2-absent install) | **PASS** — clean 2-file overlap between `#199` and `#201` |
| **Backup / Restore & Recovery** | Encrypted `.sorniobackup` with preview & staff-disable on restore | Preserved | Pre-migration safety backup, `WorkspaceInstanceLock`, controlled split-retail/backup/RBAC crash test | **PASS** |
| **Financial & Security Invariants** | Integer-paise BigInt math, atomic checkout, append-only triggers, RBAC, 0 network calls in renderer | Preserved | Preserved + 3 negative RBAC tests + `url 2.5.9`/`cookie 0.18.3` security patches (`cargo audit` **PASS**) | **PASS** |
| **Cross-Platform Builds & Provenance** | `local-windows` & `browser` failed prior to `#199` | All 7 checks **PASS** | **8/8 checks PASS** on `33ed291a`; installer provenance hash recorded; Authenticode `BLOCKED` pending org secret | **PASS** (code); **BLOCKED** (org signing secret) |

### 9.2 Exact Safe Merge Order (Do Not Merge Automatically)

Because `#198 -> #199 -> #201` form a strict linear stacked branch chain and `#198` alone fails `local-windows`/`browser` before `#199`'s harness repair:

1. **Pre-merge prerequisite:** Do **not** merge `#198` to `main` in isolation if `main` branch protection requires every merge commit on `main` to pass `local-windows` and `browser`. Instead, either:
   - **Recommended Option A (Preserve Stacked History):**
     1. Review and merge **PR `#199`** into **`#198`'s branch (`arena/9bbe1260-sornio`)** first (standard merge commit, keeping `#199` linear). Re-verify `CI` + `Windows local workspace` + `browser` green on `#198`.
     2. Review and merge **PR `#198`** (now containing `#199`'s verified CI repairs) into **`main`**.
     3. Re-target **PR `#201`**'s base branch from `repair/windows-foundation-ci-20261119` to **`main`**, verify zero diff noise / green checks on `main`, mark ready for review, and merge **PR `#201`** into **`main`**.
   - **Alternative Option B (Single Consolidated Cutover):** If maintainers prefer a single reviewed integration commit on `main`, re-target `#201` directly to `main` (it is a strict superset of `#198` and `#199`), merge `#201` after full review, and subsequently close `#198`, `#199`, and superseded historical drafts `#151`–`#197`.
2. **PR `#200` (Dependabot npm updates):** Hold until after `#201` lands on `main`, then rebase `#200` and re-run `CI` + `Windows local workspace` + `browser`.

---

## 10. Open Blockers, Risk Register, and Required Owner Actions

| ID | Risk / Blocker | Severity | Status | Required Owner Action |
|---|---|---|---|---|
| **B1** | **No organizational Windows Authenticode certificate configured** (`WINDOWS_SIGNING_CERT_PFX_BASE64`, `WINDOWS_SIGNING_CERT_PASSWORD`). Unsigned `.exe` triggers Windows SmartScreen warnings and cannot certify publisher identity. | **High (Release Blocker)** | **BLOCKED** | Procure an organizational EV/OV Windows Code Signing certificate (or Azure Trusted Signing), configure `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD` in GitHub Repository Secrets, and re-run `windows-local.yml` to obtain `signingState: SIGNED` and `releaseReady: true`. |
| **B2** | **Physical Windows peripheral acceptance not yet executed** (58 mm/80 mm thermal paper output in English + Gurmukhi, USB HID barcode scanner, RJ11 cash drawer pulse, external USB backup/restore on real shop PC). | **High (Pilot Blocker)** | **NOT RUN** | Execute `docs/pilot/bicycle-retail-pilot-checklist.md` Sections 1–3 on a physical Windows 10/11 bench PC with the shop's exact printer, scanner, cash drawer, and USB stick; attach signed-off bench log and receipt photos. |
| **B3** | **Supervised real-shop retail pilot not yet executed** (Day 0 onboarding + 15 operational counter scenarios `S1`–`S15`). | **High (Deployment Blocker)** | **NOT RUN** | Execute Section 4 & Section 5 of `docs/pilot/bicycle-retail-pilot-checklist.md` under owner + operator supervision after B2 passes and B1 is resolved (or explicitly waived for controlled single-PC bench trial only). |
| **R1** | **GitHub Actions Node 20 runner deprecation notices** (`actions/checkout`, `actions/setup-node` forced onto Node 24 in older workflow pin SHAs). | **Low (Maintenance)** | **MONITOR** | Refresh action SHAs in a follow-up maintenance PR after `#201` merges. |
| **R2** | **Non-GST local billing & unverified UPI scope** | **Operational Scope** | **DOCUMENTED** | Ensure pilot shop owner acknowledges Sornio `0.4.0` issues local non-GST receipts and marks UPI/card tenders as unverified until manually reconciled. |

---

## 11. Remaining Pre-Pilot and Pre-Deployment Gates

- **Before Physical Bench Start:** **READY NOW** — download `Sornio Local Review_0.4.0_x64-setup.exe` from run [`45598118720`](https://github.com/uddieee33-blip/Sornio/actions/runs/45598118720) and verify `SHA-256 = 4b67c9c8c25b473bf8049a5b215eb61b0f7d813202b1995031bfc4024e2df86d`.
- **Before Supervised Live Shop Pilot:**
  1. Complete and pass **Physical Bench Acceptance** (`TP1`–`TP7`, `BS1`–`BS6`, `CD1`–`CD3`, `EB1`–`EB4`, `R1`–`R7`) on the target Windows 10/11 counter PC.
  2. Provision trusted organizational Authenticode signing (`B1`) and verify `Get-AuthenticodeSignature` returns `Valid` with RFC 3161 timestamp (`signingState: SIGNED`, `releaseReady: true`).
  3. Complete ordered PR merge (`#199 -> #198 -> main`, then `#201 -> main`) so the pilot installs from a tagged `main` release build.
- **Before Unattended Multi-Shop Deployment:**
  1. Complete at least 7–14 consecutive business days of **Supervised Real-Shop Pilot** (`S1`–`S15`) with zero unexplained financial discrepancies, verified daily USB backups, and verified clean-PC restore drill.

---

## 12. Exact Next Steps Before Supervised Shop Pilot

1. **Repository Owner (Signing):** Add `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD` (plus optional `WINDOWS_SIGNING_TIMESTAMP_URL`) in GitHub Settings → Secrets and variables → Actions, then trigger `Windows local workspace` to confirm `signingState: SIGNED`, `releaseReady: true`, and `-VerifyManifest -RequireSignature` pass.
2. **QA / Pilot Operator (Physical Bench):** On a disposable offline Windows 10/11 bench PC connected to the target 58 mm/80 mm thermal printer, USB HID barcode scanner, RJ11 cash drawer (if used), and external USB drive, run `docs/pilot/bicycle-retail-pilot-checklist.md` Sections 1–3 (`TP1`–`TP7`, `BS1`–`BS6`, `CD1`–`CD3`, `EB1`–`EB4`, `R1`–`R7`) and archive the signed-off results and receipt photographs.
3. **Maintainers (Integration):** Merge `#199 -> #198 -> main`, re-target `#201` to `main`, verify green checks, merge `#201 -> main`, and tag `v0.4.0`.
4. **Shop Owner + Operator (Supervised Pilot):** Install the signed `v0.4.0` build offline on the shop counter PC, execute Day 0 onboarding and scenarios `S1`–`S15` from `docs/pilot/bicycle-retail-pilot-checklist.md`, and perform daily cash-closing + external USB encrypted backup verification.
