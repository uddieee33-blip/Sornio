# Sornio — Physical Hardware & Supervised Retail Pilot Readiness Report

**Date:** 2026-11-25  
**Repository:** `uddieee33-blip/Sornio`  
**Working Branch:** `arena/677ba59c-sornio`  
**Pull Request:** Draft PR `#201` (`arena/677ba59c-sornio` → base `repair/windows-foundation-ci-20261119`, preserving chain `#201 → #199 → #198 → main`)  
**Verified Code Commit (8/8 Live CI PASS):** `d2d3071c8fbce282a42556476c453b512b7a317d`  
**Overall Physical Hardware Validation Status:** **`BLOCKED`** *(no physical Windows POS workstation, USB HID barcode scanner, thermal receipt printer, or cash drawer is attached to this cloud sandbox or GitHub-hosted CI runners)*  
**Supervised Retail Pilot Go/No-Go Verdict:** **`NOT READY — BLOCKED`** *(do not begin a supervised live shop pilot until physical hardware acceptance evidence and Authenticode installer signing exist)*

---

## 1. Implementation Summary

This milestone prepared Sornio's Windows desktop POS build (`0.4.0`, SQLCipher schema `v24`) for genuine physical counter acceptance and a future controlled supervised shop pilot without altering core financial accounting math, atomic SQLite/SQLCipher transaction boundaries, idempotency guarantees, RBAC, append-only audit logs, or offline-first operation.

### 1.1 Authoritative Baseline & Scope Discipline

Before modifying any code, the live GitHub PR dependency chain `#201 → #199 → #198 → main` was inspected against remote commits, base branches, merge state, and file overlaps:

- **Implemented & Verified on Automated CI (Linux, macOS, Windows runners):** SQLCipher schema `v24`, genuine `0.3.0 → 0.4.0` Windows in-place upgrade with pre-migration backup and downgrade refusal, clean WebView2-absent offline NSIS installation (`290.21 MB`), 10k-product / 50k-invoice Windows native scale benchmark (`150.54` postings/s, `16.03 MB` peak RSS), zero-advisory `cargo audit` (`url 2.5.9`, `form_urlencoded 1.2.3`, `cookie 0.18.3`) and `npm audit`, hardened Authenticode signing + `-VerifyManifest` tamper checks (11/11 PowerShell tests PASS), mid-shift backup/restore and controlled interruption reliability tests.
- **Physical Testing Required (Cannot Be Substituted by CI or Simulation):** Real USB HID barcode scanner timing/suffix/IME behavior, real 80 mm / 58 mm thermal receipt printing via vendor Windows spooler drivers, RJ-11 cash drawer pulse via printer driver, USB hot-unplug/reconnect, out-of-paper/cover-open spooler error recovery, genuine Windows workstation AC power-loss recovery, and cashier counter usability under real shop pacing.

### 1.2 Hardware, POS Performance & Recovery Hardenings Implemented

Five targeted engineering hardenings were implemented and verified on `1203365` + `d2d3071`:

1. **Bounded Windows Printer Detection & Spooler Fault Reporting (`apps/desktop/src-tauri/src/main.rs`):**
   - `detect_local_printers()` previously ran a blocking `powershell.exe` `Get-CimInstance Win32_Printer` subprocess with no timeout and ignored hardware error states. A hung Windows Print Spooler or offline USB thermal driver could stall the Tauri command indefinitely.
   - Hardened `detect_local_printers()` to spawn with a **bounded 5-second timeout** (`kill()` + `wait()` on overrun), cleanly degrade to an explicit error message instead of hanging POS workflows, and inspect Win32 `DetectedErrorState` (`Low Paper`, `No Paper`, `Cover Open`, `Paper Jam`, `Offline`, `Error`, `Door Open`, etc.) alongside `PrinterStatus` and `WorkOffline`.
2. **Receipt Printer Disconnect/Error Visibility & Post-Print Status Refresh (`apps/desktop/src/SavedInvoice.tsx`):**
   - Added live `printerMissing` detection when the workstation's configured default receipt printer disappears from Windows' installed printer list (e.g., USB unplugged or driver removed).
   - Surfaces a non-blocking warning banner with **Re-check printers** action so the cashier can immediately re-probe spooler status or fall back to Windows' system print dialog without blocking or corrupting the already-committed invoice.
   - Triggers a live printer status refresh after `window.print()` returns so mid-print spooler errors (paper out, lid open, offline) appear immediately before the next reprint attempt.
3. **O(1) Large-Catalog Barcode Indexing & Accidental Quantity-Field Scan Guard (`apps/desktop/src/scan.ts`, `apps/desktop/src/CheckoutPanel.tsx`, `apps/desktop/test-scan.mjs`):**
   - Replaced linear `.find()` scans across `products` during barcode lookup with a memoized O(1) `Map<string, Product>` (`buildSkuIndex` + `findProductByScan`) so 10,000+ SKU catalogs resolve HID bursts instantaneously.
   - Added `isAccidentalBarcodeInQuantityField(rawValue, skuIndex)` to detect when a cashier's keyboard focus is inside a line-item **Qty** input and they scan a barcode instead of typing a quantity. Rather than silently setting line quantity to `8901234567890` (or crashing validation), Checkout intercepts the burst, preserves the prior line quantity, adds/increments the scanned SKU as its own cart item, and shows an inline recovery notice.
4. **Bounded Large-Catalog `<select>` Rendering in Inventory (`apps/desktop/src/InventoryPanel.tsx`):**
   - Added a `MAX_PRODUCT_SELECT_OPTIONS = 100` cap with an inline filter search box on stock-adjustment and barcode-label product selectors so 10,000-product catalogs do not freeze WebView2 DOM layout by rendering 10,000 `<option>` nodes.
5. **Mid-Shift Active-Session Backup & Post-Recovery Financial Reconciliation Test (`packages/local-store/src/phase23_reliability_tests.rs`):**
   - Added `backup_during_active_shift_and_post_recovery_reconciliation_preserves_all_invariants`: exercises an active multi-cashier shift with retail cash/UPI/credit split sales, supplier purchasing, partial customer credit receipt, **mid-shift encrypted backup export**, post-backup mutations, full `restore()` from the mid-shift backup, verification that non-owner staff are safely disabled on restore (`recovery.staff_disabled`), owner re-enablement, post-recovery sale posting, and strict verification of exact integer-paise cash, customer credit, stock milli-units, audit-chain integrity, and duplicate-payment idempotency replay.

### 1.3 Reproducible Windows Physical Acceptance Package (`docs/pilot/windows-physical-acceptance-package/`)

Created an 8-file standalone acceptance kit designed for a human bench tester on a physical Windows 10/11 workstation:

| File | Purpose |
| --- | --- |
| `README.md` | Master runbook, installer verification, hardware requirements, pass/fail/blocked rules, and sign-off sheet |
| `verify-physical-bench-prereqs.ps1` | PowerShell preflight script checking Windows OS version, disk space, SHA-256 of the `.exe` installer, Authenticode signature status, Print Spooler service, connected printers, and HID devices |
| `printer-and-cash-drawer-test-procedure.md` | Step-by-step physical tests `PR1`–`PR7` (80 mm/58 mm thermal printing, Punjabi script rendering, reprint, cover-open/no-paper, USB unplug/reconnect, spooler restart) and `CD1`–`CD3` (RJ-11 cash drawer pulse via driver) |
| `barcode-scanner-test-procedure.md` | Step-by-step physical tests `SC1`–`SC7` (rapid HID scans, leading-zero barcodes, focus switching, accidental scan inside Qty field, unknown barcode handling, USB unplug/reconnect, simultaneous printer+scanner load) |
| `backup-restore-and-power-loss-procedure.md` | Step-by-step physical tests `BR1`–`BR4` (mid-shift encrypted backup, external USB export, preview/wrong-passphrase refusal, full restore + staff re-enablement) and `PL1`–`PL7` (taskkill during checkout, hard AC power cut, stale lock recovery, double-click idempotency, WAL integrity) |
| `transaction-reconciliation-checklist.md` | Counter-level financial reconciliation sheet (`R1`–`R9`: integer paise cash, UPI, customer credit, stock quantities, void/returns, audit log continuity) |
| `defect-report-template.md` | Standardized defect report template capturing build SHA, hardware model/driver, exact steps, expected vs. actual, severity (`P0`–`P3`), and pilot-blocking disposition |
| `pilot-starter-catalog.csv` | Realistic 11-SKU bicycle, toy, and spare-parts starter CSV (including leading-zero SKU and metre units) — directly validated in CI by `apps/desktop/test-csv-import.mjs` |

### 1.4 Security & Release Packaging Audit Summary

- **Dependency Audits:** Strict `cargo audit` (zero `--ignore` suppressions) and `npm audit` both **PASS** on `d2d3071` (`Dependency audit` check `139282899786`). All previously flagged transitive Rust advisories (`RUSTSEC-2026-0592` in `url`/`form_urlencoded` and `RUSTSEC-2026-0594` in `cookie`) are resolved in `apps/desktop/src-tauri/Cargo.lock` (`url 2.5.9`, `form_urlencoded 1.2.3`, `cookie 0.18.3`).
- **Installer Authenticode Signing:** Fail-closed signing and tamper verification (`scripts/sign-windows-installer.ps1`, `scripts/test-windows-signing.ps1` 11/11 PASS, `scripts/test-signing-manifest-contract.py` 3/3 PASS) are verified on Windows CI. However, **no production code-signing certificate secrets (`WINDOWS_SIGNING_CERT_PFX_BASE64`, `WINDOWS_SIGNING_CERT_PASSWORD`) are configured in repository secrets**, so CI builds are honestly emitted with `signingState: BLOCKED`, `releaseReady: false`, and `authenticodeStatus: NotSigned`.
- **Backup & Local Vault Security:** Local database is encrypted at rest via SQLCipher (`4.20.0`, tested backward-compatible with `4.6.1`), workspace key is stored in Windows Credential Manager (DPAPI/OS vault) and verified preserved across `0.3.0 → 0.4.0` upgrades, and external `.sornio-backup` exports require user-supplied passphrase encryption and never expose plaintext secrets in logs or manifests.

---

## 2. Exact Branch, Commit, and PR Chain

| Attribute | Value |
| --- | --- |
| **Repository** | `uddieee33-blip/Sornio` |
| **Current Working Branch** | `arena/677ba59c-sornio` |
| **Active Pull Request** | Draft PR `#201` (`https://github.com/uddieee33-blip/Sornio/pull/201`) |
| **PR `#201` Base Branch** | `repair/windows-foundation-ci-20261119` (PR `#199`) — preserved untouched |
| **Verified Code Commit (8/8 CI PASS)** | `d2d3071c8fbce282a42556476c453b512b7a317d` |
| **Milestone Feature Commits on `#201`** | `1203365` (hardware/catalog/recovery hardenings + 8-file physical acceptance package), `d2d3071` (`rustfmt` formatting fix), plus this report commit |
| **Merge / Release / Deploy Action Taken** | **NONE** (strictly prohibited until physical acceptance and signing blockers clear) |

### Full PR Dependency Chain & Overlap Analysis

| PR | Branch | Base | HEAD SHA | State | Mergeable / Status | Overlap Notes |
| --- | --- | --- | --- | --- | --- | --- |
| — | `main` | — | `1cc5c798d1eada9a16463213b0776c01e99d36f9` | Default | — | Repository root baseline |
| `#198` | `arena/9bbe1260-sornio` | `main` | `98d285cba1aa244c17b3264755dc986ed98eed74` | Open (non-draft) | `MERGEABLE` / `UNSTABLE` | 183 commits, 383 files; foundation for `#199` |
| `#199` | `repair/windows-foundation-ci-20261119` | `arena/9bbe1260-sornio` | `0a9ec374b3a8d877c6332f33d5ba1d23e5f8c0f9` | Open (draft) | `MERGEABLE` / `CLEAN` | 12 commits, 15 files (`#198 ∩ #199` = 10 files) |
| `#201` | `arena/677ba59c-sornio` | `repair/windows-foundation-ci-20261119` | `d2d3071c8fbce282a42556476c453b512b7a317d` *(+ this report)* | Open (draft) | `MERGEABLE` / 8/8 CI PASS | `#199 ∩ #201` = 2 files (`.github/workflows/windows-local.yml`, `packages/local-store/examples/cashier_review_bridge.rs`); `#198 ∩ #201` = 32 files |

> **Related PR Note:** Dependabot PR `#200` targets an older dependency baseline and should remain held until the `#198 → #199 → #201` chain lands (or be superseded by `#201`'s already-patched `Cargo.lock`). Historical superseded drafts (`#151`–`#197`) were not touched.

---

## 3. Hardware Compatibility Matrix

This matrix explicitly distinguishes **what the codebase implements and automated CI tests** from **actual physical-device verification** (which remains `BLOCKED` until executed on a physical Windows counter bench).

| Hardware / Capability | Integration Mechanism in Sornio `0.4.0` | Automated CI Evidence | Physical Hardware Status | Notes & Limits |
| --- | --- | --- | --- | --- |
| **USB HID Barcode Scanner (1D/2D keyboard-wedge)** | Standard OS HID keyboard input (`Enter`/`Tab` suffix), O(1) `skuIndex` lookup, Qty-field accidental scan guard (`scan.ts`, `CheckoutPanel.tsx`) | Unit tests (`apps/desktop/test-scan.mjs`, 10k-SKU lookup + accidental Qty-field scan recovery) PASS | **`BLOCKED`** (`SC1`–`SC7` not run on physical scanner) | Requires US/English keyboard layout on scanner firmware; non-English Windows IME active during scan can mangle characters and must be tested in `SC2`/`SC3`. |
| **80 mm Thermal Receipt Printer (USB / LAN via Windows Print Spooler)** | Windows `Get-CimInstance Win32_Printer` discovery (5 s timeout + `DetectedErrorState`), WebView2 `@page` 80 mm CSS layout + `window.print()`, missing-printer warning (`SavedInvoice.tsx`) | `detect_local_printers` compiled & bundled on Windows (`local-windows` PASS); receipt HTML/Punjabi contract verified | **`BLOCKED`** (`PR1`–`PR7` not run on physical thermal printer) | Relies on vendor Windows spooler driver (e.g., Epson TM-T82/TM-T88, TVS RP3200, Rugtek, Xprinter). Direct raw ESC/POS USB/TCP byte streaming is **not implemented**. |
| **58 mm Thermal Receipt Printer (Windows Print Spooler)** | Configurable 58 mm paper profile in `WorkstationSettingsPanel` + `@page` 58 mm receipt CSS | Contract & UI build PASS | **`BLOCKED`** (`PR2` not run on physical 58 mm printer) | Must verify Punjabi/Gurmukhi font wrapping and totals alignment on physical 58 mm roll. |
| **RJ-11 Cash Drawer (Printer-Driven Kick)** | Triggered indirectly by the thermal printer's Windows driver "Open Cash Drawer Before/After Print" preference during receipt printing | None (driver-level hardware pulse) | **`BLOCKED`** (`CD1`–`CD3` not run on physical printer+drawer) | Sornio does **not** emit raw ESC/POS `ESC p` (`0x1B 0x70`) kick bytes directly; cash drawer support **requires** a printer driver option to pulse RJ-11 on print. |
| **Direct USB / Serial (COM) Cash Drawer or Standalone ESC/POS Kick** | **Not implemented** | N/A | **`UNSUPPORTED`** | Out of scope for `0.4.0`; do not procure standalone USB-serial drawers without an RJ-11 thermal printer driver kick. |
| **Multi-Device Simultaneous Operation (HID Scanner + USB Thermal Printer + RJ-11 Drawer + USB Backup Drive)** | Independent OS subsystems (HID input, Windows Print Spooler, filesystem backup export) | Logic paths verified independently | **`BLOCKED`** (`SC7` / `BR2` not run with simultaneous physical devices) | Must confirm USB hub power stability and zero focus stealing during print dialog / backup export. |
| **Device Disconnect / Reconnect & Printer Error Recovery** | 5 s timeout on `detect_local_printers()`, `DetectedErrorState` reporting, `printerMissing` banner + live refresh, committed invoice immune to print failure | Unit/compile/contract verified; invoice persists before print is invoked | **`BLOCKED`** (`PR4`–`PR7`, `SC6` not run on physical devices) | Financial commit occurs atomically in SQLCipher **before** printing; printer faults cannot corrupt financial data, but physical UX must be verified. |

---

## 4. Automated Test Results

### 4.1 Local Verification Suites (Executed on `1203365` / `d2d3071`)

| Suite | Command | Result | Count / Scope |
| --- | --- | --- | --- |
| Desktop POS & CSV unit tests | `node --test apps/desktop/test-{scan,csv-import,desktop-shortcuts,held-bills,payment-allocation}.mjs` | **PASS** | **31 / 31** (includes 10k-item indexed barcode lookup, Qty-field accidental scan guard, and direct validation of `docs/pilot/windows-physical-acceptance-package/pilot-starter-catalog.csv`) |
| Cargo lockfile integrity | `node scripts/verify-cargo-lock.mjs` | **PASS** | **24 / 24** |
| Desktop contract & Punjabi i18n | `node scripts/verify-desktop-contract.mjs` | **PASS** | **38 / 38** |
| Windows release packaging contract | `node scripts/verify-windows-release.mjs` | **PASS** | **40 / 40** |
| Local SQLCipher schema & fixtures | `python3 scripts/verify-local-schema.py` | **PASS** | **146 / 146** |
| Signing & manifest contract | `python3 scripts/test-signing-manifest-contract.py -v` | **PASS** | **3 / 3** |

### 4.2 Live GitHub Actions CI Results on Commit `d2d3071c8fbce282a42556476c453b512b7a317d` (8/8 PASS)

| Check Run | Workflow Run ID | Check Job ID | Conclusion | Key Verified Evidence |
| --- | --- | --- | --- | --- |
| **Real PostgreSQL concurrency** | `45635688063` | `139280371977` | **PASS** | Concurrent server/replication invariants |
| **Dependency audit** | `45635688283` | `139282899786` | **PASS** | Strict `cargo audit` (0 advisories, 0 suppressions) + `npm audit` (0 advisories) |
| **Lint, types, build** | `45635688283` | `139282900392` | **PASS** | ESLint, TypeScript, Vite & desktop frontend build |
| **Historical SQLCipher compatibility (4.6.1 to 4.20.0)** | `45635688283` | `139282908920` | **PASS** | Legacy SQLCipher ciphertext open/migration compatibility |
| **browser** | `45635688117` | `139280372208` | **PASS** | `cargo fmt --check`, Rust tests, browser review suite |
| **macos** | `45635688200` | `139294915210` | **PASS** | macOS native local-store & desktop build/tests |
| **local-windows** | `45635688125` | `139298192043` | **PASS** | Release & debug SQLCipher store tests (including new mid-shift backup/restore reconciliation test), Windows `0.4.0` NSIS installer build (`304,306,144` bytes / `290.21 MB`, SHA-256 `ffc009bee0ad46cce3326a35dbfc3e9d6ab66f3d25acd87e033f93968aac351f`), `WINDOWS_SIGNING_TESTS_PASSED 11/11`, `-VerifyManifest`, installed offline app, recovery, and uninstall data preservation |
| **Phase 23 upgrade (0.3.0 -> 0.4.0), offline install & 10k/50k scale** | `45635688125` | `139352055594` | **PASS** | Genuine `0.3.0 → 0.4.0` in-place upgrade (`upgrade-1`..`upgrade-8`), clean WebView2-absent (`157.0.4341.46 → null`) firewall-blocked offline install (`119.72 s`, `offlineFirstLaunchPassed: true`, `uninstallDataPreserved: true`), and 10k/50k Windows scale benchmark (details below) |

*(Note: `Supabase Preview` check `139280305436` was `skipped` per repository configuration.)*

### 4.3 Measured Windows 10k / 50k Scale Benchmark (`d2d3071`, Job `139352055594`)

- **Runner Environment:** `Windows-2025Server-10.0.26100-SP0`, 4 cores, `15.99 GB` RAM
- **Dataset:** `10,000` products, `50,000` invoices, `5,000` customers, `1,000` suppliers (SQLCipher schema `v24`)
- **Total Wall Time:** `434.61 s` (`150.54` native postings/s)
- **Startup (with setup):** `408.48 ms` | **Reopen (with vault unlock):** `196.77 ms`
- **Catalog Search Latency (30 samples):** median `5.55 ms`, max `9.35 ms`
- **Checkout Post Latency (200 samples):** median `5.12 ms`, p95 `11.19 ms`, max `57.28 ms`
- **Receipt Read Latency (30 samples):** median `0.21 ms`, max `0.37 ms`
- **Memory & Storage:** Peak RSS `16.03 MB`, final encrypted DB size `167,116,800` bytes (`159.38 MiB`)
- **Reconciliation:** `PASS: 10,000 products, 50,000 invoices, 950,000,000 milli-stock and 500,000,000 paise cash reconciled after reopen`

### 4.4 Release Artifact Manifest Recorded on `d2d3071`

- **Installer File:** `Sornio Local Review_0.4.0_x64-setup.exe`
- **Size:** `304,306,144` bytes (`290.21 MB`)
- **SHA-256:** `ffc009bee0ad46cce3326a35dbfc3e9d6ab66f3d25acd87e033f93968aac351f`
- **Signing State:** `BLOCKED` (`releaseReady: false`, `authenticodeStatus: NotSigned`)

---

## 5. Physical Acceptance Checklist

Every physical bench test below is strictly separated from automated CI results. **Zero physical bench tests have been executed on real retail hardware; therefore every physical test is recorded as `BLOCKED` (prerequisite hardware absent) / `NOT RUN`.**

### 5.1 Bench Prerequisites & Offline Installation

| ID | Test Case | Automated CI Proxy? | Physical Device Verdict | Blocking Reason / Required Evidence |
| --- | --- | --- | --- | --- |
| `PRE-1` | Run `verify-physical-bench-prereqs.ps1` on physical Windows 10/11 POS PC | No | **`BLOCKED` (`NOT RUN`)** | Requires physical Windows PC; attach script JSON/console output |
| `PRE-2` | Verify installer SHA-256 (`ffc009bee...`) & Authenticode status | Manifest verified on CI (`NotSigned`) | **`BLOCKED` (`NOT RUN`)** | Requires physical bench & signed release candidate for pilot |
| `PRE-3` | Offline install on physical PC with network cable/Wi-Fi disconnected & starter CSV import (`pilot-starter-catalog.csv`) | Firewall-blocked CI VM passed; CSV parser unit-tested | **`BLOCKED` (`NOT RUN`)** | Requires physical Windows desktop install + visual verification |

### 5.2 USB HID Barcode Scanner (`docs/pilot/windows-physical-acceptance-package/barcode-scanner-test-procedure.md`)

| ID | Test Case | Physical Verdict | Required Evidence |
| --- | --- | --- | --- |
| `SC1` | Rapid sequential scan of 10+ printed EAN-13 / Code-128 labels into Checkout | **`BLOCKED` (`NOT RUN`)** | Scanner model, scan timing, screenshot/invoice ID |
| `SC2` | Leading-zero SKU scan (e.g. `00123456`) preserving exact SKU match | **`BLOCKED` (`NOT RUN`)** | Confirmed cart line matches leading-zero SKU |
| `SC3` | Scan while switching between Checkout search, customer field, and payment field | **`BLOCKED` (`NOT RUN`)** | Verified no misrouted keystrokes or corrupted input |
| `SC4` | Accidental barcode scan while cursor is inside line-item **Qty** input | **`BLOCKED` (`NOT RUN`)** | Verified original Qty preserved, scanned SKU added, inline notice shown |
| `SC5` | Unknown/unregistered barcode scan error handling & immediate recovery | **`BLOCKED` (`NOT RUN`)** | Non-blocking error, cart intact, next valid scan succeeds |
| `SC6` | USB scanner hot-unplug mid-shift and reconnect to same/different USB port | **`BLOCKED` (`NOT RUN`)** | Scanner resumes cleanly without restarting Sornio |
| `SC7` | Simultaneous scanner + thermal printer + cash drawer load (20 back-to-back bills) | **`BLOCKED` (`NOT RUN`)** | Zero dropped scans, zero missed prints, zero focus traps |

### 5.3 Thermal Receipt Printer & Cash Drawer (`docs/pilot/windows-physical-acceptance-package/printer-and-cash-drawer-test-procedure.md`)

| ID | Test Case | Physical Verdict | Required Evidence |
| --- | --- | --- | --- |
| `PR1` | 80 mm thermal receipt print (English + numbers + totals + GST/business header) | **`BLOCKED` (`NOT RUN`)** | Photo of physical receipt + printer model/driver version |
| `PR2` | 58 mm thermal receipt print & alignment check (if 58 mm unit used) | **`BLOCKED` (`NOT RUN`)** | Photo of physical 58 mm receipt or N/A if 80 mm only |
| `PR3` | Punjabi (Gurmukhi) receipt print legibility & glyph rendering | **`BLOCKED` (`NOT RUN`)** | Photo of physical Punjabi receipt |
| `PR4` | Reprint saved invoice after cashier shift handoff / app restart | **`BLOCKED` (`NOT RUN`)** | Photo of reprint + confirmed no duplicate financial posting |
| `PR5` | Print attempt with printer **out of paper** or **cover open** | **`BLOCKED` (`NOT RUN`)** | Invoice stays committed; spooler error surfaces; reprint succeeds after reload |
| `PR6` | Thermal printer **USB unplugged** mid-shift → `printerMissing` warning → reconnect + **Re-check printers** | **`BLOCKED` (`NOT RUN`)** | Screenshot of `printerMissing` warning & recovery reprint |
| `PR7` | Windows Print Spooler stopped/restarted while Sornio is open | **`BLOCKED` (`NOT RUN`)** | `detect_local_printers` respects 5 s timeout; POS checkout never hangs |
| `CD1` | RJ-11 cash drawer opens automatically on cash sale receipt print | **`BLOCKED` (`NOT RUN`)** | Video/log confirming printer driver kick opens drawer |
| `CD2` | Cash drawer kick behavior on UPI-only / credit-only sale vs. cash sale | **`BLOCKED` (`NOT RUN`)** | Documented driver behavior & cashier SOP note |
| `CD3` | Cash drawer disconnected / manual key override — no block on Sornio checkout | **`BLOCKED` (`NOT RUN`)** | Confirmed sales commit normally without drawer connected |

### 5.4 Backup, Restore & Power-Loss Recovery (`docs/pilot/windows-physical-acceptance-package/backup-restore-and-power-loss-procedure.md`)

| ID | Test Case | Automated CI Proxy? | Physical Verdict | Required Evidence |
| --- | --- | --- | --- | --- |
| `BR1` | Mid-shift encrypted `.sornio-backup` creation during active billing | Native Rust test PASS | **`BLOCKED` (`NOT RUN`)** | Physical backup file timestamp, size, SHA-256 |
| `BR2` | External USB flash drive backup export, safe eject, re-insert & preview | Local filesystem tested | **`BLOCKED` (`NOT RUN`)** | Confirmed external USB export & preview metadata |
| `BR3` | Wrong-passphrase restore refusal (current workspace remains untouched) | Native Rust test PASS | **`BLOCKED` (`NOT RUN`)** | Screenshot of error + confirmed existing bills intact |
| `BR4` | Full restore from mid-shift backup → verify staff disabled → owner re-enables cashier → resume billing | Native Rust test PASS | **`BLOCKED` (`NOT RUN`)** | Log of owner unlock, staff re-enable, and post-restore bill |
| `PL1` | Forced `taskkill /F /IM` during checkout / immediately after checkout | Controlled Rust interruption test PASS | **`BLOCKED` (`NOT RUN`)** | Verified atomic commit or clean rollback, zero partial rows |
| `PL2` | Hard AC power loss (pull plug / UPS off) during idle & active billing on physical SSD/NTFS | Not possible on CI VM | **`BLOCKED` (`NOT RUN`)** | Reboot verification, `PRAGMA integrity_check`, exact cash/stock check |
| `PL3` | Stale instance lock recovery after abrupt crash/power loss | `upgrade-7` tested on CI | **`BLOCKED` (`NOT RUN`)** | App relaunches cleanly without manual lock file deletion |
| `PL4` | Rapid double-click / double-Enter on Checkout Confirm (idempotency check) | Native Rust replay test PASS | **`BLOCKED` (`NOT RUN`)** | Confirmed exactly 1 invoice & 1 stock deduction |
| `PL5` | Unexpected crash during backup export (partial `.tmp` cleanup) | Atomic rename tested in Rust | **`BLOCKED` (`NOT RUN`)** | Live DB unaffected; no corrupt backup marked valid |
| `PL6` | Windows reboot & offline reopen with OS Credential Manager vault unlock | CI reinstall/upgrade tested | **`BLOCKED` (`NOT RUN`)** | Confirmed login works after cold boot with no internet |
| `PL7` | Pre-migration safety backup verified after upgrade on physical bench | `upgrade-5` tested on CI | **`BLOCKED` (`NOT RUN`)** | Confirmed backup artifact present in workspace backup folder |

### 5.5 Transaction Reconciliation (`docs/pilot/windows-physical-acceptance-package/transaction-reconciliation-checklist.md`)

| ID | Reconciliation Gate | Physical Verdict |
| --- | --- | --- |
| `R1`–`R9` | Opening/closing cash in paise, UPI totals, customer credit ledger, stock milli-units, returns/voids, split payments, post-power-loss delta, post-restore audit-chain continuity, and cashier RBAC boundary check | **`BLOCKED` (`NOT RUN`)** |

---

## 6. Known Defects and Risks

1. **Unsigned Windows Installer (`P0` Release / Pilot Blocker):**
   - Because `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD` are not configured, `Sornio Local Review_0.4.0_x64-setup.exe` is `NotSigned`. Windows Defender SmartScreen will warn or block installation on real shop PCs, creating severe operational risk and anti-tamper exposure.
2. **No Direct ESC/POS Raw Spooler or Serial Cash-Drawer Command (`P1` Hardware Scope Constraint):**
   - Printing uses WebView2 `window.print()` through the Windows Print Spooler, and cash-drawer opening relies on the printer driver's RJ-11 kick setting. Shops using printers whose Windows driver lacks an automatic cash-drawer trigger—or using standalone USB/serial cash drawers—will not get automatic drawer kicks.
3. **Browser `window.print()` Cannot Confirm Physical Paper Output (`P2` Operational Risk):**
   - WebView2's `window.print()` resolves when the print dialog closes, not when the thermal print head finishes feeding paper. Sornio mitigates this by refreshing `detect_local_printers()` after print to inspect `DetectedErrorState` and keeping one-click **Reprint** immediately available, but cashiers must visually confirm paper output before handing over goods.
4. **Windows IME / Non-English Keyboard Layout Interference with USB HID Scanners (`P2` Counter Risk):**
   - If a cashier switches Windows input language to Punjabi (Gurmukhi) while scanning barcodes, a keyboard-wedge HID scanner may inject Gurmukhi characters instead of ASCII digits. Must be tested in `SC2`/`SC3` and mitigated in counter SOP (keep Windows input method on English for scanning; Sornio's Punjabi UI/receipts do not require OS Gurmukhi IME).
5. **WebView2-Dependent Physical Display & Print Dialog Latency (`P2` Usability Risk):**
   - Although clean WebView2-absent installation succeeded in `119.72 s` on a Windows Server 2025 CI VM, physical low-spec retail PCs (e.g., 4–8 GB RAM, HDD/budget SSD, Windows 10 Home) may exhibit slower first-launch or print-dialog latency and must be timed during physical bench acceptance.
6. **Backup Passphrase Custody Risk (`P2` Operational Risk):**
   - Encrypted `.sornio-backup` files cannot be recovered if the shop owner forgets the export passphrase. Physical pilot SOP must mandate offline sealed storage of the backup passphrase.
7. **Unmerged Multi-PR Dependency Chain (`P1` Integration Risk):**
   - Draft PR `#201` builds on draft PR `#199`, which builds on open PR `#198` (`UNSTABLE` on older checks). Merging out of order or rebasing without preserving `#199` and `#198` could drop foundation fixes or introduce conflicts across 32 shared files.
8. **CI Runner Deprecation Warning (`P3` Maintenance Note):**
   - GitHub Actions emits a non-blocking warning that `actions/checkout` / `actions/setup-node` target Node 20 and are forced onto Node 24; pin updates should be handled in a separate maintenance PR after `#201`.

---

## 7. Remaining Blockers Before Supervised Retail Pilot

**Verdict: Sornio is `NOT READY` for a supervised live retail pilot.** All three gates below must be closed with verifiable evidence before starting Day 1 in a real shop:

1. **Blocker 1 — Physical Windows Counter Bench Acceptance (`BLOCKED`):**
   - Execute the complete acceptance package (`docs/pilot/windows-physical-acceptance-package/`) on a real Windows 10/11 counter workstation connected to the exact target USB HID barcode scanner, 80 mm/58 mm thermal receipt printer, and (if used) RJ-11 cash drawer.
   - Achieve **100% `PASS`** on all applicable `PRE`, `SC`, `PR`, `CD`, `BR`, `PL`, and `R1`–`R9` checks with **zero open `P0`/`P1` defects**, and archive photos/logs/reconciliation sheets.
2. **Blocker 2 — Production Windows Authenticode Code Signing (`BLOCKED`):**
   - Provision an EV/OV Windows code-signing certificate (or Azure Trusted Signing), configure `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD` in GitHub Actions secrets, run `windows-local.yml`, and verify the emitted `PHASE23_RELEASE_MANIFEST` reports `signingState: "SIGNED"`, `releaseReady: true`, `authenticodeStatus: "Valid"`, `codeSigningEkuVerified: true`, and `timestampVerified: true`.
3. **Blocker 3 — Clean Integration of PR Chain `#198 → #199 → #201` (`OPEN`):**
   - Review, resolve any remaining checks on `#198`, and merge `#198`, then `#199`, then `#201` in dependency order (keeping Dependabot `#200` held/closed as superseded), then cut the signed pilot candidate build from `main`.

---

## 8. Precise Instructions for the Next Human Tester

Follow these steps in exact order on a physical Windows 10 (21H2+) or Windows 11 x64 counter workstation:

### Step 1 — Obtain & Verify the Exact Build Artifact
1. Open GitHub Actions workflow run **`45635688125`** (`Windows local workspace` on commit `d2d3071c8fbce282a42556476c453b512b7a317d` in PR `#201`) and download the `Sornio Local Review_0.4.0_x64-setup.exe` artifact *(or, once Blocker 2 is cleared, download the signed release build and its manifest JSON)*.
2. Copy the installer and the folder `docs/pilot/windows-physical-acceptance-package/` onto the physical Windows bench PC (e.g., `C:\SornioBench\`).
3. Open PowerShell as a standard user (or Administrator for spooler tests) and run:
   ```powershell
   cd C:\SornioBench\windows-physical-acceptance-package
   .\verify-physical-bench-prereqs.ps1 `
     -InstallerPath "C:\SornioBench\Sornio Local Review_0.4.0_x64-setup.exe" `
     -ExpectedSha256 "ffc009bee0ad46cce3326a35dbfc3e9d6ab66f3d25acd87e033f93968aac351f"
   ```
4. Confirm SHA-256 matches exactly, Print Spooler is `Running`, your thermal printer appears in the detected list, and record the Authenticode status (`NotSigned` for unsigned bench validation; must be `Valid` before any shop pilot).

### Step 2 — Perform Genuine Offline Installation & Starter Catalog Seed
1. Physically unplug Ethernet and disable Wi-Fi on the bench PC.
2. Run `Sornio Local Review_0.4.0_x64-setup.exe` (for unsigned bench builds only, approve SmartScreen *"More info → Run anyway"* and record that SmartScreen prompted).
3. Launch **Sornio Local Review**, complete initial Owner setup, create one **Cashier** account, and configure Workstation Settings (shop header, 80 mm/58 mm paper width, default thermal receipt printer).
4. Import `pilot-starter-catalog.csv` from `docs/pilot/windows-physical-acceptance-package/` and verify all 11 SKUs (including leading-zero SKU and metre units) import with exact rupee/paise prices.

### Step 3 — Execute Physical Hardware & Reliability Test Procedures
Run every test in order and mark each ID `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN` with real timestamps, photos, and logs:
1. **Barcode Scanner (`SC1`–`SC7`):** Follow `barcode-scanner-test-procedure.md` (especially `SC4` accidental scan inside the **Qty** field and `SC6` USB unplug/reconnect).
2. **Thermal Printer & Cash Drawer (`PR1`–`PR7`, `CD1`–`CD3`):** Follow `printer-and-cash-drawer-test-procedure.md` (verify English & Punjabi receipts, out-of-paper/cover-open recovery, USB unplug `printerMissing` banner + **Re-check printers**, and RJ-11 drawer pulse).
3. **Backup, Restore & Power Loss (`BR1`–`BR4`, `PL1`–`PL7`):** Follow `backup-restore-and-power-loss-procedure.md` using a real external USB flash drive and a real hard AC power cut (`PL2`) on the bench workstation.
4. **Transaction Reconciliation (`R1`–`R9`):** Complete `transaction-reconciliation-checklist.md` against physical cash/UPI/credit counts and stock balances after power-loss recovery and backup restore.

### Step 4 — Record Defects & Evidence Gate
1. For any `FAIL`, file a defect using `defect-report-template.md` with exact hardware model, driver version, screenshots/photos, and Sornio build commit (`d2d3071c8fbce282a42556476c453b512b7a317d`).
2. Attach completed checklists, receipt photos, prerequisite script output, and reconciliation totals back to PR `#201` (or the release tracking issue).
3. **Do not start the supervised shop pilot** until:
   - All `P0`/`P1` defects are fixed and re-tested on physical hardware;
   - Every applicable physical acceptance check is `PASS` with archived evidence;
   - The installer is Authenticode-signed (`releaseReady: true`, `authenticodeStatus: Valid`); and
   - The PR chain `#198 → #199 → #201` is merged cleanly.
