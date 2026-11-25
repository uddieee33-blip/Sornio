# Sornio Windows Physical Acceptance Package (v0.4.0 / Schema v24)

This self-contained package gives a human QA engineer or pilot operator everything required to execute **physical Windows hardware acceptance** on a real shop-class PC before authorizing a supervised retail pilot.

> **Mandatory Evidence Boundary:** Automated CI and hosted GitHub Windows runners **do not have** physical thermal printers, USB HID barcode scanners, RJ11 cash drawers, or removable USB flash drives attached. Every physical bench test starts as **`NOT RUN`** (or **`BLOCKED`** if hardware/signing is absent) and may only be marked **`PASS`** after real execution on physical Windows 10/11 hardware with recorded observations.

---

## Package Contents

| File | Purpose |
|---|---|
| [`README.md`](README.md) | Installation instructions, supported hardware requirements, preflight steps, physical install/upgrade/performance IDs (`IN1`–`IN4`, `PERF1`–`PERF2`), and scoring rules |
| [`EVIDENCE-CAPTURE-GUIDE.md`](EVIDENCE-CAPTURE-GUIDE.md) | Mandatory operator evidence capture protocol, directory layout, PowerShell evidence snippets, secret hygiene, and strict rule separating CI/simulations from physical evidence |
| [`verify-physical-bench-prereqs.ps1`](verify-physical-bench-prereqs.ps1) | Safe read-only Windows PowerShell preflight script that records Windows build, installer SHA-256, Authenticode status, installed Windows printers (`WorkOffline`/`PrinterStatus`/`DetectedErrorState`), attached USB HID input devices, and removable USB drives |
| [`printer-and-cash-drawer-test-procedure.md`](printer-and-cash-drawer-test-procedure.md) | 58 mm / 80 mm / A4 thermal receipt printing (English + Gurmukhi), printer disconnect/paper-out/retry, marked reprints, and RJ11 cash drawer (or manual/none mode) test procedures |
| [`barcode-scanner-test-procedure.md`](barcode-scanner-test-procedure.md) | USB HID keyboard-wedge scanner tests: leading zeroes, Enter/Tab/CR+LF suffixes, POS field-switching safety, rapid scans, unplug/replug, and simultaneous multi-device counter operation |
| [`backup-restore-and-power-loss-procedure.md`](backup-restore-and-power-loss-procedure.md) | Mid-shift external USB encrypted backup, clean-PC restore, corrupt/wrong-key rejection, and disposable-workspace controlled process-termination power-loss recovery drills |
| [`transaction-reconciliation-checklist.md`](transaction-reconciliation-checklist.md) | Exact paisa-by-paisa sales, tender, stock, customer credit, supplier payable, daily cash close, and audit reconciliation worksheet |
| [`defect-report-template.md`](defect-report-template.md) | Standardized shop-floor defect template for logging hardware, printing, scanner, recovery, or reconciliation failures |
| [`pilot-starter-catalog.csv`](pilot-starter-catalog.csv) | Validated starter CSV catalog (bicycles, tricycles, baby walkers, ride-on toys, accessories, and loose workshop spares) for bench and Day 0 import |

---

## 1. Supported Hardware & Operating Requirements

| Component | Supported Configuration | Unsupported / Explicit Boundaries |
|---|---|---|
| **Workstation OS** | Windows 10 (64-bit, 21H2+) or Windows 11 (64-bit), standard non-admin user account, >= 4 GB RAM (>= 8 GB recommended), >= 2 GB free on `C:` | 32-bit Windows, Linux/macOS shop counters (not targeted for this Windows pilot) |
| **Network Mode** | **100% offline** (Wi-Fi disabled, Ethernet unplugged) for install, boot, billing, printing, and USB backup | No internet, cloud sync, or online payment gateway required or assumed |
| **Receipt Printer** | Any Windows 10/11 printer with an installed Windows spooler driver (`58 mm` thermal roll, `80 mm` thermal roll, or `A4` desktop printer). Uses native Windows print dialog (`window.print()`) with CSS roll width profiles and bundled `Noto Sans Gurmukhi`. | Direct raw USB/serial ESC/POS port bypass without a Windows print driver is **not** used. Verify driver paper size matches Sornio layout. |
| **Barcode Scanner** | **USB HID Keyboard-Wedge** 1D/2D scanner configured with `Enter` (`CR`), `Tab`, or `CR+LF` suffix. | Serial RS-232 COM-port or OPOS-only scanners unless switched to USB HID Keyboard-Wedge mode. |
| **Cash Drawer** | **Option A:** RJ11 cash drawer plugged into a thermal printer whose Windows driver triggers ESC/POS drawer kick on print (`Pin 2`: `1B 70 00 19 FA` or `Pin 5`: `1B 70 01 19 FA`). **Option B:** Manual key-opened drawer or no drawer (`Manual key-opened drawer` / `No cash drawer` mode in Sornio). | Standalone USB-serial / proprietary API drawers without Windows thermal-driver RJ11 trigger are not directly actuated by Sornio; select `Manual key-opened drawer` or `No cash drawer`. |
| **External Backup Media** | Standard FAT32 / exFAT / NTFS removable USB flash drive mounted with a Windows drive letter (e.g., `E:\SornioBackups`) | Cloud-only folders without local offline copy |

---

## 2. Offline Windows Installation Instructions

1. **Obtain the release artifact and manifest** from the verified build (`Sornio-Local-Workspace-Review` artifact zip containing `Sornio Local Review_0.4.0_x64-setup.exe`, `installer-manifest.json`, and `phase23-release-manifest.json`). Note that GitHub Actions artifacts expire after **7 days** — archive the verified installer and manifest offline before expiry.
2. **Run the read-only preflight check** in PowerShell **before** installing (and follow [`EVIDENCE-CAPTURE-GUIDE.md`](EVIDENCE-CAPTURE-GUIDE.md) to record CPU, disk free space, Print Spooler status, and pre-existing WebView2 version):
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-physical-bench-prereqs.ps1 `
     -InstallerPath ".\Sornio Local Review_0.4.0_x64-setup.exe" `
     -ExpectedSha256 "<SHA256_FROM_MANIFEST>" `
     -OutputJsonPath ".\bench-preflight.json"
   ```
   - Confirm `sha256Matches = true`.
   - Confirm `authenticodeStatus`:
     - For **supervised live shop pilot**: **MUST be `Valid`** with Code Signing EKU (`1.3.6.1.5.5.7.3.3`) and a valid RFC 3161 timestamp (`timestampVerified = true`, manifest `signingState = "SIGNED"`, `releaseReady = true`).
     - For **disposable physical bench QA only**: unsigned (`NotSigned`) is permitted **only** with verified matching `SHA-256` and explicit QA bench waiver; never deploy an unsigned installer to live shop production.
3. **Disconnect network completely** (turn off Wi-Fi and unplug Ethernet cable).
4. **Install Sornio per-user** (no Administrator elevation required):
   - Double-click `Sornio Local Review_0.4.0_x64-setup.exe` (or run `.\Sornio Local Review_0.4.0_x64-setup.exe /S` for unattended bench install).
   - Confirm bundled offline WebView2 Runtime installs cleanly if absent, and Sornio launches offline without requesting internet access.
5. **Provision disposable bench workspace:**
   - Create an **Owner** account (`owner`) and a **Cashier** account (`cashier1`) with distinct strong passwords.
   - Open **Business & settings → Counter hardware & receipt defaults**, click **Refresh printers**, select the attached thermal printer, paper width (`58mm` or `80mm`), default language (`English` or `ਪੰਜਾਬੀ`), scanner suffix (`Enter or Tab`), cash drawer mode, and USB backup folder note (`E:\SornioBackups`), then save.
   - Open **Items & stock → Bulk CSV product import**, paste the contents of [`pilot-starter-catalog.csv`](pilot-starter-catalog.csv), and import all 11 starter items.

---

## 3. Physical Installation, Upgrade & Low-Spec PC Performance Acceptance (`IN1`–`IN4`, `PERF1`–`PERF2`)

Record physical results for installation, upgrade, and target shop-class PC responsiveness before running peripheral tests:

| ID | Scenario | Exact Execution Steps | Required Pass Criteria | Result (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) | Evidence Ref |
|---|---|---|---|---|---|
| **IN1** | **Installer SHA-256 & Authenticode preflight** | Run `verify-physical-bench-prereqs.ps1` against the downloaded `.exe` and manifest SHA-256; for a signed pilot candidate also run `scripts/sign-windows-installer.ps1 -VerifyManifest -RequireSignature`. | `sha256Matches = true`; for pilot candidate `authenticodeStatus = Valid`, `timestampVerified = true`, `releaseReady = true` (record SmartScreen prompt separately if unsigned bench-QA build). | `NOT RUN` | |
| **IN2** | **Offline per-user installation on physical Windows 10/11 PC** | Disconnect Wi-Fi & Ethernet; run `Sornio Local Review_0.4.0_x64-setup.exe` as a standard non-admin Windows user; measure install wall time and first offline launch. | Completes without admin elevation or internet; offline WebView2 bootstraps if absent; Owner + Cashier setup and 11-row `pilot-starter-catalog.csv` import succeed cleanly. | `NOT RUN` | |
| **IN3** | **Physical `0.3.0 → 0.4.0` in-place upgrade & downgrade refusal (if upgrading existing workstation)** | On a disposable Windows bench profile seeded with `0.3.0`, run `0.4.0` installer offline; verify pre-migration backup, vault unlock, and v24 data preservation; verify `0.3.0` refuses to open upgraded v24 DB. *(Mark `NOT APPLICABLE` only if pilot starts exclusively on greenfield `0.4.0` PCs and record waiver.)* | Zero data loss, OS Credential Manager vault key preserved, pre-migration backup created, downgrade refused cleanly. | `NOT RUN` | |
| **IN4** | **Cold Windows reboot & offline reopen** | Reboot the physical Windows PC with Wi-Fi and Ethernet still disconnected; launch `Sornio Local Review` and sign in as Owner and Cashier. | App starts cleanly offline, OS vault unlocks SQLCipher DB without re-setup, and all seeded items/settings remain intact. | `NOT RUN` | |
| **PERF1** | **Low-spec shop PC cold launch & print-dialog latency** | On target shop-class hardware (record CPU, RAM, HDD/SSD in `EVIDENCE-CAPTURE-GUIDE.md`), time 3 cold app launches (stopwatch from icon click to sign-in screen), 3 catalog searches, and 3 print-dialog openings. | Recorded latencies are acceptable for shop counter cadence (flag any cold launch > 10 s, search > 500 ms, or print dialog > 5 s as a usability defect). | `NOT RUN` | |
| **PERF2** | **Sustained counter pace on shop PC (10 consecutive scan-bill-print cycles)** | Run 10 back-to-back barcode-scan → checkout → thermal receipt print cycles on the target shop PC while observing Task Manager RAM/CPU. | No UI freeze, no WebView2 crash, no runaway memory growth, and smooth cashier flow from bill 1 through bill 10. | `NOT RUN` | |

---

## 4. Scoring & Release-Gate Rules

Mark every individual test ID across all procedure files with one of four strict verdicts:

- **`PASS`**: Executed on physical Windows 10/11 hardware with all pass criteria observed and logged per [`EVIDENCE-CAPTURE-GUIDE.md`](EVIDENCE-CAPTURE-GUIDE.md).
- **`FAIL`**: Executed on physical Windows hardware and did not meet pass criteria. Log a defect using [`defect-report-template.md`](defect-report-template.md). Any `FAIL` on financial accuracy, recovery integrity, printer fault safety, or scanner cart integrity **blocks supervised shop pilot**.
- **`BLOCKED`**: Required prerequisite hardware, driver, or signed release build was unavailable.
- **`NOT RUN`**: Not yet executed on physical hardware.

**Go / No-Go Rule for Supervised Shop Pilot:** Every applicable physical bench check (`IN1`–`IN4`, `PERF1`–`PERF2`, `PR1`–`PR7` including `PR2a`/`PR2b`, `CD1`–`CD3`, `SC1`–`SC7`, `BR1`–`BR4`, `PL1`–`PL7`, and Reconciliation `R1`–`R9`) must be **`PASS`** (with zero open High/Critical defects), backed by archived physical evidence per [`EVIDENCE-CAPTURE-GUIDE.md`](EVIDENCE-CAPTURE-GUIDE.md), AND the installer must carry a trusted Authenticode signature + RFC 3161 timestamp (`signingState: SIGNED`, `releaseReady: true`).
