# Physical Bench Evidence Capture Guide (Sornio Windows v0.4.0)

This protocol defines **exactly how a human Windows operator must collect, name, store, and verify evidence** during physical hardware acceptance on a real Windows 10/11 counter PC.

---

## 1. Non-Negotiable Evidence Rule

> **HARD RULE:** Screenshots of GitHub Actions CI, cloud Windows runners, browser simulations, `window.print()` PDF previews, source-code inspection, and automated unit/integration test outputs **CANNOT substitute for physical device evidence.**
>
> A physical test ID (`IN1`–`IN4`, `PERF1`–`PERF2`, `SC1`–`SC7`, `PR1`–`PR7`, `CD1`–`CD3`, `BR1`–`BR4`, `PL1`–`PL7`, `R1`–`R9`) may be marked **`PASS`** **only** after a human operator executes the procedure on real physical Windows 10/11 hardware and archives the required physical evidence below.

---

## 2. Mandatory Evidence Folder Layout

Create one dated evidence folder per bench run on the bench PC (for example, `C:\SornioBench\evidence-2026-11-26\`):

```text
evidence-YYYY-MM-DD/
├── 00-bench-preflight.json              # Output of verify-physical-bench-prereqs.ps1
├── 01-machine-and-os-specs.txt          # CPU, RAM, disk free space, Spooler, WebView2
├── 02-installer-signature-verify.txt    # Get-FileHash + Get-AuthenticodeSignature + VerifyManifest
├── 03-run-log.md                        # Completed per-test results table (copied from Section 4)
├── 04-reconciliation-checklist.md       # Completed transaction-reconciliation-checklist.md (R1-R9)
├── 05-defects.md                        # One defect-report-template.md entry per FAIL (or "None")
├── photos/                              # Smartphone photos of printed thermal paper, drawer, USB rig
│   ├── PR2a_80mm-english-receipt.jpg
│   ├── PR2b_58mm-english-receipt.jpg
│   ├── PR3_punjabi-receipt.jpg
│   ├── PR5_reprint-banner.jpg
│   └── CD1_drawer-open.jpg
├── screenshots/                         # Windows screenshots of Sornio UI & error/recovery states
│   ├── IN2_offline-setup-and-csv-import.png
│   ├── SC4_qty-field-scan-recovery.png
│   ├── PR6_paper-out-warning.png
│   ├── PR7_printer-missing-recheck.png
│   ├── BR2_wrong-passphrase-refused.png
│   └── PL2_f8-retry-recovered-sale.png
└── hashes/                              # SHA-256 & encrypted-header checks (BR1-BR4, PL1-PL7)
    ├── BR1_backup-header-and-sha256.txt
    └── PL1-PL7_workspace-db-hashes.txt
```

**File naming rule:** Prefix every screenshot, photo, video, and log file with its exact test ID (`<TEST_ID>_<short-description>.<ext>`), e.g., `SC4_qty-field-scan-recovery.png` or `PR3_gurmukhi-80mm.jpg`.

---

## 3. Mandatory Pre-Run Capture Commands (Run Before Installing)

Run these read-only PowerShell commands on the physical Windows bench PC before starting `IN1`–`IN4`:

### 3.1 Run the Preflight Collector (`00-bench-preflight.json`)

```powershell
cd C:\SornioBench\windows-physical-acceptance-package
powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-physical-bench-prereqs.ps1 `
  -InstallerPath "C:\SornioBench\Sornio Local Review_0.4.0_x64-setup.exe" `
  -ExpectedSha256 "<EXACT_SHA256_FROM_RELEASE_MANIFEST>" `
  -OutputJsonPath "C:\SornioBench\evidence-YYYY-MM-DD\00-bench-preflight.json"
```

### 3.2 Capture Machine Specifications, Disk Type/Space, Print Spooler & WebView2 (`01-machine-and-os-specs.txt`)

```powershell
$out = "C:\SornioBench\evidence-YYYY-MM-DD\01-machine-and-os-specs.txt"
@(
  "=== TIMESTAMP (UTC) ==="
  (Get-Date).ToUniversalTime().ToString("o")
  "=== OS ==="
  (Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture | Out-String)
  "=== CPU & RAM ==="
  (Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, MaxClockSpeed | Out-String)
  (Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, @{N='TotalRamGB';E={[Math]::Round($_.TotalPhysicalMemory/1GB,2)}} | Out-String)
  "=== SYSTEM DISK (C:) ==="
  (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID, FileSystem, @{N='SizeGB';E={[Math]::Round($_.Size/1GB,2)}}, @{N='FreeGB';E={[Math]::Round($_.FreeSpace/1GB,2)}} | Out-String)
  (Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object FriendlyName, MediaType, HealthStatus | Out-String)
  "=== PRINT SPOOLER SERVICE ==="
  (Get-Service -Name Spooler | Select-Object Name, Status, StartType | Out-String)
  "=== WINDOWS KEYBOARD LAYOUTS ==="
  (Get-WinUserLanguageList | Select-Object LanguageTag, Autonym, InputMethodTips | Out-String)
  "=== WEBVIEW2 RUNTIME (PRE-INSTALL) ==="
  (Get-ItemProperty -Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}","HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue | Select-Object pv, name | Out-String)
) | Set-Content -LiteralPath $out -Encoding utf8
```

### 3.3 Capture Installer Checksum & Authenticode Verification (`02-installer-signature-verify.txt`)

```powershell
$exe = "C:\SornioBench\Sornio Local Review_0.4.0_x64-setup.exe"
$manifest = "C:\SornioBench\phase23-release-manifest.json"
$out = "C:\SornioBench\evidence-YYYY-MM-DD\02-installer-signature-verify.txt"

$hash = Get-FileHash -LiteralPath $exe -Algorithm SHA256
$sig  = Get-AuthenticodeSignature -FilePath $exe
@(
  "File: $exe"
  "SHA256: $($hash.Hash.ToLowerInvariant())"
  "AuthenticodeStatus: $($sig.Status)"
  "StatusMessage: $($sig.StatusMessage)"
  "SignerSubject: $(if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '<NONE>' })"
  "SignerThumbprint: $(if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { '<NONE>' })"
  "SignerNotAfterUtc: $(if ($sig.SignerCertificate) { $sig.SignerCertificate.NotAfter.ToUniversalTime().ToString('o') } else { '<NONE>' })"
  "TimeStamperSubject: $(if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { '<NONE>' })"
) | Set-Content -LiteralPath $out -Encoding utf8

# For a signed pilot/release candidate, ALSO run fail-closed manifest verification (must exit 0):
# .\scripts\sign-windows-installer.ps1 -InstallerPath $exe -OutputManifestPath $manifest -VerifyManifest -RequireSignature
```

---

## 4. Mandatory Fields Per Test Record (`03-run-log.md`)

Every executed test (whether `PASS`, `FAIL`, or `BLOCKED`) **must** record all 9 fields below:

| Field | Required Content |
|---|---|
| **1. Test ID & Result** | Exact ID (`IN1`–`IN4`, `PERF1`–`PERF2`, `SC1`–`SC7`, `PR1`–`PR7` incl. `PR2a`/`PR2b`, `CD1`–`CD3`, `BR1`–`BR4`, `PL1`–`PL7`, `R1`–`R9`) and strict verdict: `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. |
| **2. Windows Version & Machine Specs** | Reference to `01-machine-and-os-specs.txt` (Windows Edition + Build, CPU, RAM, HDD/SSD, C: free GB). |
| **3. Sornio Version & Installer SHA-256** | Product version (`0.4.0`), exact SHA-256 from `00-bench-preflight.json`, and Authenticode status (`Valid` vs. `NotSigned` bench waiver). |
| **4. Device Model, Connection Type & Driver Version** | Exact hardware model (e.g., `Epson TM-T82III`, `Honeywell 1900g`), connection (`USB 2.0`, `LAN`, `RJ11 via Printer Pin 2`), Windows driver name/version (from `00-bench-preflight.json` or Device Manager), scanner suffix (`Enter`/`Tab`), and active Windows keyboard layout (`en-US`/`en-IN`). |
| **5. Reproduction Steps** | Exact actions taken, including any deviations from the procedure script (e.g., exact invoice total, SKU scanned, cable unplugged). |
| **6. Expected vs. Actual Behavior** | Procedure pass criterion side-by-side with exact observed behavior, timing (in seconds/ms for `IN2`, `PERF1`, `PERF2`), and verbatim UI alert text. |
| **7. Logs & Screenshots / Photographs** | Filenames inside `photos/` and `screenshots/` (thermal receipt photos must clearly show paper edges, prices, totals, Gurmukhi glyphs, and `REPRINT` header when applicable). |
| **8. Recovery / Reconciliation Evidence** | For `BR1`–`BR4`, `PL1`–`PL7`, and `R1`–`R9`: before/after `workspace.db` SHA-256, `.sorniobackup` SHA-256 and first-16-byte ciphertext check (proving header != `SQLite format 3`), invoice/operation IDs, and completed `04-reconciliation-checklist.md`. |
| **9. Defect ID & Severity** | `None` if `PASS`; if `FAIL`, exact ID (`BENCH-YYYYMMDD-NNN`), severity (`Critical`/`High`/`Medium`/`Low`), and blocking disposition recorded in `05-defects.md`. |

---

## 5. Safe PowerShell Snippets for Recovery & Backup Evidence (`hashes/`)

Use these read-only snippets (compatible with both Windows PowerShell 5.1 and PowerShell 7) for `BR1`–`BR4`, `PL1`–`PL7`, and `R8`:

```powershell
# 1. Record live SQLCipher database SHA-256 and confirm encrypted header (must NOT equal "SQLite format 3")
$db = "$env:LOCALAPPDATA\com.sornio.localreview\workspace.db"
$dbHash = (Get-FileHash -LiteralPath $db -Algorithm SHA256).Hash.ToLowerInvariant()
$dbHdr  = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($db)[0..15])
"workspace.db sha256=$dbHash headerIsPlainSqlite=$($dbHdr.StartsWith('SQLite format 3'))"

# 2. Record exported .sorniobackup SHA-256 and confirm encrypted header
$bak = "E:\SornioBackups\sornio-business.sorniobackup"
$bakHash = (Get-FileHash -LiteralPath $bak -Algorithm SHA256).Hash.ToLowerInvariant()
$bakHdr  = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($bak)[0..15])
"backup sha256=$bakHash size=$((Get-Item $bak).Length) headerIsPlainSqlite=$($bakHdr.StartsWith('SQLite format 3'))"
```

---

## 6. Secret & Privacy Hygiene (Mandatory)

- **NEVER** record or screenshot real shop owner passwords, cashier passwords, `.sorniobackup` recovery passphrases, Windows user passwords, or Authenticode certificate passwords/PFX files in any evidence file, defect report, or PR comment.
- **NEVER** upload a live shop `workspace.db` or `.sorniobackup` containing real customer personal data to GitHub; use synthetic bench accounts and `pilot-starter-catalog.csv` for bench acceptance.
- Always archive the completed `evidence-YYYY-MM-DD/` bundle (minus any credentials) and attach the summary (`00-bench-preflight.json`, `01-machine-and-os-specs.txt`, `02-installer-signature-verify.txt`, `03-run-log.md`, `04-reconciliation-checklist.md`, `05-defects.md`, and receipt photos) to the PR / release sign-off record.
