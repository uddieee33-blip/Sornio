# Sornio Windows Physical Acceptance Package (v0.4.0 / Schema v24)

This self-contained package gives a human QA engineer or pilot operator everything required to execute **physical Windows hardware acceptance** on a real shop-class PC before authorizing a supervised retail pilot.

> **Mandatory Evidence Boundary:** Automated CI and hosted GitHub Windows runners **do not have** physical thermal printers, USB HID barcode scanners, RJ11 cash drawers, or removable USB flash drives attached. Every physical bench test starts as **`NOT RUN`** (or **`BLOCKED`** if hardware/signing is absent) and may only be marked **`PASS`** after real execution on physical Windows 10/11 hardware with recorded observations.

---

## Package Contents

| File | Purpose |
|---|---|
| [`README.md`](README.md) | Installation instructions, supported hardware requirements, preflight steps, and scoring rules |
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

1. **Obtain the release artifact and manifest** from the verified build (`Sornio Local Review_0.4.0_x64-setup.exe` and `phase23-release-manifest.json`).
2. **Run the read-only preflight check** in PowerShell **before** installing:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-physical-bench-prereqs.ps1 `
     -InstallerPath ".\Sornio Local Review_0.4.0_x64-setup.exe" `
     -ExpectedSha256 "<SHA256_FROM_MANIFEST>" `
     -OutputJsonPath ".\bench-preflight.json"
   ```
   - Confirm `sha256Matches = true`.
   - Confirm `authenticodeStatus`:
     - For **supervised live shop pilot**: **MUST be `Valid`** with a valid RFC 3161 timestamp (`timestampVerified = true`).
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

## 3. Scoring & Release-Gate Rules

Mark every individual test ID across the 4 procedure files with one of four strict verdicts:

- **`PASS`**: Executed on physical Windows 10/11 hardware with all pass criteria observed and logged.
- **`FAIL`**: Executed on physical Windows hardware and did not meet pass criteria. Log a defect using [`defect-report-template.md`](defect-report-template.md). Any `FAIL` on financial accuracy, recovery integrity, printer fault safety, or scanner cart integrity **blocks supervised shop pilot**.
- **`BLOCKED`**: Required prerequisite hardware, driver, or signed release build was unavailable.
- **`NOT RUN`**: Not yet executed on physical hardware.

**Go / No-Go Rule for Supervised Shop Pilot:** Every applicable physical bench check (`PR1`–`PR7`, `CD1`–`CD3`, `SC1`–`SC7`, `BR1`–`BR4`, `PL1`–`PL7`, and the Reconciliation Checklist) must be **`PASS`** (with zero open High/Critical defects) AND the installer must carry a trusted Authenticode signature + RFC 3161 timestamp (`signingState: SIGNED`, `releaseReady: true`).
