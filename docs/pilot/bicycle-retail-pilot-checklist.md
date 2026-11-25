# Sornio Windows Physical Bench & Supervised Retail Pilot Checklist — Bicycle, Toys & Spare-Parts Shop

**Target release:** Sornio Local Review `0.4.0` (Schema `v24`, offline Windows NSIS per-user installer `com.sornio.localreview`)  
**Pilot shop profile:** Single-PC offline retail bicycle, children's toys, tricycles, baby walkers & spare-parts counter (barcoded items + non-barcode loose workshop spares)  
**Operating mode:** 100% offline Windows 10/11 desktop; encrypted SQLCipher database (`workspace.db`) + Windows Credential Manager device key; manual encrypted `.sorniobackup` on dedicated external USB drive.  
**Release scope disclaimer:** Local non-GST sales receipts; UPI/card payments recorded as unverified until manually reconciled; single counter PC.

---

## Evidence Boundary Rule (Mandatory)

Never conflate verification tiers:

1. **Automated Unit / Native Tests** — proves local SQLCipher invariants, CSV parsing, scan normalization, and signing contracts in synthetic fixtures.
2. **Hosted Windows CI (`windows-local.yml`)** — proves `0.4.0` installer packaging, genuine `0.3.0 -> 0.4.0` upgrade, WebView2-absent offline install, and 10k/50k scale on GitHub-hosted Windows Server runners (no physical printer, barcode gun, cash drawer, or USB stick attached).
3. **Physical Bench Acceptance (Sections 1–5 below)** — **REQUIRED** on a real shop-class Windows 10/11 PC with the shop's own peripherals before Day 0 cutover. Currently **NOT RUN** in cloud CI.
4. **Supervised Real-Shop Pilot (Section 6 below)** — **REQUIRED** live counter operation under owner + operator supervision after Sections 1–5 pass and Authenticode signing is unblocked (or explicitly waived with verified SHA-256 for controlled bench testing only). Currently **NOT RUN**.

---

## 1. Bench Hardware Record & Supported Peripheral Protocols

Fill out before starting any physical bench test. **Do not assume all printers or cash drawers share identical command protocols.**

| Bench Field | Recorded Value |
|---|---|
| Test Date (IST) & Bench Location | |
| Operator / QA Engineer | |
| Windows Edition & Build (`winver`) | |
| CPU / RAM / Free `C:` Disk Space | |
| Installer File & Verified `SHA-256` (`Get-FileHash -Algorithm SHA256`) | |
| Authenticode Signature (`Get-AuthenticodeSignature`) | `Valid` (signed release) or `NotSigned` (controlled bench waiver only) |
| Thermal / Receipt Printer Model, Connection & Driver (`58 mm` / `80 mm` / `A4`) | |
| USB HID Barcode Scanner Model & Configured Suffix (`Enter` / `Tab` / `CR+LF`) | |
| Cash Drawer Model, Interface (`RJ11 via Printer` / `Manual Key` / `None`) & Kick Pin (`Pin 2` / `Pin 5`) | |
| External Backup USB Drive Label, Drive Letter & Free Space | |

### Supported Hardware & Configuration Requirements

- **Receipt printing:** Any Windows 10/11 printer with an installed Windows spooler driver (`58 mm` thermal roll, `80 mm` thermal roll, or `A4` laser/inkjet). Sornio prints via the native WebView2 / Windows print spooler (`window.print()`) with CSS page sizing (`58mm`, `80mm`, `a4`) and bundled `Noto Sans Gurmukhi` for Punjabi (`ਪੰਜਾਬੀ`) text. No direct raw-USB serial printing is assumed; verify the Windows printer driver's paper width matches Sornio's selected layout.
- **Barcode scanners:** Standard **USB HID Keyboard-Wedge** 1D/2D scanners (presenting as a Windows HID keyboard). Serial/RS-232 COM-port or proprietary OPOS-only scanners are **not** supported without vendor keyboard-wedge mode enabled. Configure scanner suffix to `Enter` (`CR`) or `Tab` and match it in **Business & settings → Counter hardware & receipt defaults**.
- **Cash drawers:**
  - **RJ11 printer-driven drawers:** Actuated by the thermal printer's Windows driver when a receipt prints (`Pin 2`: ESC/POS `1B 70 00 19 FA`; `Pin 5`: ESC/POS `1B 70 01 19 FA`, recorded in `workstation_settings.rs::cash_drawer_escpos_command`). Configure drawer kick-on-print in the Windows Printer Preferences dialog for that thermal driver and record the pin mode in Sornio.
  - **Unsupported / non-ESC-POS / manual drawers:** Select `Manual key-opened drawer` or `No cash drawer` in Sornio. Sornio never blocks checkout if no cash drawer is attached and never claims a drawer physically opened.
- **External backup storage:** Standard FAT32/exFAT/NTFS USB flash drive mounted with a Windows drive letter (e.g., `E:\SornioBackups`). Keep a separate offline copy of the recovery passphrase away from the USB drive.

---

## 2. Workstream C — Physical Windows Peripheral Acceptance Matrix

Disconnect Wi-Fi and Ethernet before running Steps P1–P4. Mark each check `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. **Any `FAIL` blocks supervised shop pilot.**

### 2A. Thermal Printing Acceptance (`58 mm` and `80 mm`)

| ID | Check | Execution Steps & Expected Result | Result |
|---|---|---|---|
| TP1 | **58 mm & 80 mm layout profiles** | Select `58mm` (and `80mm` if hardware available) in **Counter hardware & receipt defaults**, match paper size in Windows print dialog, print test sale. No clipped digits, prices/totals align cleanly within roll margins, paper feeds/cuts properly. | `[ ]` |
| TP2 | **English & Gurmukhi (`ਪੰਜਾਬੀ`) rendering** | Print one English receipt and one Punjabi (`ਪੰਜਾਬੀ`) receipt on the physical thermal printer. Confirm Gurmukhi script (`ਸੰਭਾਲੀ ਰਸੀਦ`, `ਕੁੱਲ ਰਕਮ`, `ਦੁਬਾਰਾ ਛਪਾਈ`) renders crisply via bundled `Noto Sans Gurmukhi` without tofu boxes (`□□□`) or broken matras. | `[ ]` |
| TP3 | **Long product names** | Bill an item with a 60+ character name (e.g., `Kids Deluxe Folding 3-in-1 Musical Steel Tricycle with Canopy & Push Bar`). Verify line wraps cleanly on 58 mm / 80 mm without overwriting quantity or price columns. | `[ ]` |
| TP4 | **Large multi-line invoice (25+ lines)** | Post a 25-line invoice mixing cycles, toys, spares, and loose items. Print and confirm roll feeds continuously without page-break truncation and footer totals/disclaimers remain legible. | `[ ]` |
| TP5 | **Multiple copies & marked reprints** | Reopen a saved invoice under **Find saved receipt**, print twice. Confirm receipt paper visibly prints `REPRINT — Copy of original saved receipt` / `ਦੁਬਾਰਾ ਛਪਾਈ — ਮੂਲ ਸੰਭਾਲੀ ਰਸੀਦ ਦੀ ਕਾਪੀ`, while invoice count, stock, and cash totals stay unchanged. | `[ ]` |
| TP6 | **Paper-out & disconnected-printer fault** | Save a test sale, then lift the thermal paper cover or unplug printer USB. Refresh printers / attempt print: confirm Sornio shows the offline/stopped printer warning, the sale remains saved exactly once (operator does NOT re-bill), and printing succeeds after reloading paper / reconnecting USB. | `[ ]` |
| TP7 | **Totals & financial formatting accuracy** | Compare printed subtotal, tax, tender breakdown (Cash / unverified UPI / Customer credit), and `Amount due at sale` against the saved screen values to the exact paisa (`₹0.00`). Confirm non-GST local receipt notice appears. | `[ ]` |

### 2B. USB HID Barcode Scanner Acceptance

| ID | Check | Execution Steps & Expected Result | Result |
|---|---|---|---|
| BS1 | **Keyboard-wedge plug & leading-zero preservation** | Focus Checkout search (`F2`), scan leading-zero barcode `0089011100001`. Item adds in one scan without stripping leading zeroes. | `[ ]` |
| BS2 | **Configurable Enter / Tab suffixes** | Test `Enter only`, `Tab only`, and `Enter or Tab` settings in **Counter hardware & receipt defaults** matching scanner suffix programming; confirm configured suffix submits scan while empty `Tab` preserves keyboard navigation. | `[ ]` |
| BS3 | **Rapid consecutive scans & piece auto-increment** | Scan the same `pcs` item 5 times rapidly. Confirm quantity increments accurately to `5`, checkout total updates identically to `5 × unit price`, and no stray Enter prematurely posts the sale. | `[ ]` |
| BS4 | **Duplicate / trailing CR+LF event handling** | Program scanner for `CR+LF` suffix (if supported) and scan 3 times; confirm trailing empty LF suffix does not flash false errors or corrupt cart. Scan a weighed (`kg`/`metre`) item twice and confirm Sornio prompts for explicit quantity rather than guessing `1`. | `[ ]` |
| BS5 | **Product-not-found & ambiguous-SKU handling** | Scan an unknown barcode (`9999999999999`) and a partial SKU: confirm clear non-destructive alert, cart unchanged, focus ready for next scan. | `[ ]` |
| BS6 | **Scanner unplug / replug mid-cart recovery** | Add 2 items to cart, physically unplug USB scanner for 5 seconds, plug back into another USB port, press `F2`, scan a 3rd item. Confirm active cart survives intact and scanning resumes immediately without restarting Sornio. | `[ ]` |

### 2C. Cash Drawer Acceptance

| ID | Check | Execution Steps & Expected Result | Result |
|---|---|---|---|
| CD1 | **RJ11 pulse on completed cash payment (supported printer)** | With RJ11 drawer attached to thermal printer and Windows driver drawer-kick configured (`Pin 2` or `Pin 5`), complete a Cash sale and print receipt. Verify drawer opens once. | `[ ]` |
| CD2 | **No accidental opening on cancelled / failed / unprinted flows** | Open **Review sale** (`F4`) and press `Escape` (cancelled), attempt a credit-limit-exceeded sale (refused), and cancel the print dialog. Confirm drawer does **not** open on any cancelled or refused transaction. | `[ ]` |
| CD3 | **Unsupported / manual-key hardware behavior** | Set cash drawer mode to `Manual key-opened drawer` or `No cash drawer` on a workstation without an RJ11 drawer. Complete Cash and UPI sales; confirm zero errors, zero blocked checkouts, and honest status text. | `[ ]` |

### 2D. External USB Backup & Restore Acceptance

| ID | Check | Execution Steps & Expected Result | Result |
|---|---|---|---|
| EB1 | **USB drive detection & encrypted export** | Insert dedicated backup USB drive (e.g., `E:\SornioBackups`), record note in **Counter hardware & receipt defaults**, export `.sorniobackup` with strong recovery passphrase. Confirm file is written with size > 0 and does **not** start with `SQLite format 3`. | `[ ]` |
| EB2 | **Backup integrity verification** | Run **Preview backup** on the exported USB file with both wrong passphrase (must reject) and correct passphrase (must show matching shop identity, counts, and confirmation phrase `RESTORE <12 hex>`). | `[ ]` |
| EB3 | **Clean-workstation restore drill** | Copy the USB `.sorniobackup` to a clean disposable Windows user profile / second test PC, install Sornio offline, restore from USB, unlock with original owner password, and reconcile item counts, stock, customer balances, and supplier payables. | `[ ]` |
| EB4 | **Missing / disconnected USB recovery** | Attempt export to an unplugged or read-only USB path (or unplug USB before export). Confirm Sornio fails safely with actionable error and existing `%LOCALAPPDATA%\com.sornio.localreview\workspace.db` SHA-256 is completely unchanged. | `[ ]` |

---

## 3. Workstream D — Controlled Power-Loss & Interruption Recovery Acceptance (Disposable Test Workspace Only)

**SAFETY RULE:** **NEVER** perform interruption tests on live customer data, and **NEVER** pull live AC mains plugs in an unsafe electrical setup. On the physical bench, use a **disposable test Windows profile / workspace** and controlled abrupt OS termination (`Stop-Process -Name "sornio-desktop" -Force` in PowerShell or `taskkill /IM sornio-desktop.exe /T /F`), plus controlled VM/test-PC hard reboot only on disposable test data.

Automated native SQLCipher proof for Scenarios R1–R9 lives in `packages/local-store/src/phase23_reliability_tests.rs` (`restart_during_checkout_and_supplier_payment_preserves_idempotency`, `controlled_interruption_across_split_retail_backup_and_rbac_preserves_invariants`, `v23_to_v24_migration_creates_encrypted_safety_backup_and_preserves_all_data`, `corrupted_truncated_and_wrong_key_backups_fail_closed`) and `packages/local-store/src/device.rs` (`workspace_instance_lock_blocks_second_holder_and_releases_on_drop`). Execute the matching physical Windows bench drills below:

| ID | Interruption Boundary | Bench Procedure & Required Pass Criteria | Native CI | Bench |
|---|---|---|---|---|
| R1 | **Database integrity & WAL recovery** | Terminate `sornio-desktop.exe` forcefully right after posting a sale; relaunch Sornio and unlock. Confirm clean startup, WAL recovery completes, ciphertext header intact, and all prior committed sales remain readable. | `PASS` | `[ ]` |
| R2 | **Interruption during prepared checkout (before post)** | Prepare a checkout, force-kill `sornio-desktop.exe`, relaunch, unlock, press `F8` (**Retry same sale**). Confirm zero duplicate invoices, exact 1× stock deduction, and preserved `operationId`. | `PASS` | `[ ]` |
| R3 | **Interruption during split Cash + UPI + Credit sale** | Prepare a 3-way split sale (`₹1,000 Cash + ₹750 UPI + ₹750 Credit`), force-kill before confirmation finishes, reopen. Confirm **no partial payment rows**, **no partial credit entry**, and idempotent retry commits all 3 parts atomically once. | `PASS` | `[ ]` |
| R4 | **Duplicate retry after post already committed** | Replay the exact same `operationId` after restart (both checkout and supplier payment). Confirm idempotent replay returns identical record without double-charging cash, stock, or supplier payables. | `PASS` | `[ ]` |
| R5 | **Interrupted backup export (partial USB file)** | Cancel/remove target or leave truncated partial `.sorniobackup` file on USB. Confirm `workspace.db` SHA-256 is untouched, **Preview backup** rejects the truncated file cleanly, and a subsequent clean export + restore succeeds. | `PASS` | `[ ]` |
| R6 | **Workspace lock cleanup after crash** | While Sornio is open, launch a second copy (confirm single-instance lock refusal message). Force-kill the first process (`Stop-Process -Force`), then launch Sornio again. Confirm OS immediately released `workspace.lock` and startup succeeds cleanly. | `PASS` | `[ ]` |
| R7 | **RBAC & append-only auditability after recovery** | After crash recovery and backup restore, sign in as a `cashier` account. Confirm cashier cannot modify workstation settings, export/restore backups, or mutate audit history; owner audit log remains append-only and intact. | `PASS` | `[ ]` |

---

## 4. Day 0 Shop Onboarding Procedure (Bicycle, Toys, Tricycles, Walkers & Accessories)

1. **Verify installer provenance before execution:**
   - Run `Get-FileHash ".\Sornio Local Review_0.4.0_x64-setup.exe" -Algorithm SHA256` and match against `phase23-release-manifest.json`.
   - Run `Get-AuthenticodeSignature ".\Sornio Local Review_0.4.0_x64-setup.exe"`. For unattended shop pilot, require `Status = Valid` and a valid RFC 3161 timestamp (`TimeStamperCertificate` present).
2. **Owner account provisioning & business profile:**
   - Launch Sornio offline, create the **Owner** account with a strong password kept offline, set shop name and business type (`General store`).
3. **Staff RBAC setup:**
   - Create separate **Cashier** accounts under **Business & settings → Staff access** for counter staff. Never share the Owner password at the billing counter.
4. **Configure counter hardware defaults:**
   - Open **Business & settings → Counter hardware & receipt defaults**, click **Refresh printers**, select the shop's thermal printer, choose paper layout (`58mm`/`80mm`/`a4`), receipt language (`English` or `ਪੰਜਾਬੀ`), barcode suffix (`Enter or Tab`), cash drawer mode, and USB backup destination reminder (`E:\SornioBackups`). Save.
5. **Bulk CSV catalog import (realistic bicycle & kids-shop starter template):**
   - Open **Items & stock → Bulk CSV product import (for shop setup)** and import the shop's prepared catalog:
     ```csv
     name,sku,unit,price_rupees,opening_stock
     Hero Ranger 26T Mountain Bicycle,0089011100001,pcs,7450.00,4
     Atlas Goldline 26T City Bicycle,0089011100002,pcs,6500.00,5
     Kids Steel Tricycle with Canopy & Bell,0089011100003,pcs,2499.00,6
     Musical Folding Baby Walker (8-Wheel),0089011100004,pcs,1850.50,8
     Battery Ride-On Toy Jeep 12V,0089011100005,pcs,9200.00,2
     Ralson 26x1.95 Bicycle Tyre,0089011100006,pcs,380.00,30
     26in Butyl Inner Tube,0089011100007,pcs,140.00,40
     Alloy Bicycle Bell & LED Tail Light Combo,0089011100008,pcs,320.00,25
     Kids Safety Helmet (Adjustable),0089011100009,pcs,550.00,12
     Loose Brake Cable (Workshop Roll),,metre,45.00,50
     Loose Galvanised Spokes Bundle,,pcs,8.50,200
     ```
   - Reconcile imported SKU count, integer-paise prices, and opening stock quantities against physical shelf counts.
6. **Add regular credit customers & wholesale suppliers:**
   - Create authorized credit customers under **Customers & udhaar** with explicit **Credit limit** and **Credit days**.
   - Create cycle/toy/parts wholesalers under **Suppliers & purchases**.

---

## 5. Workstream E — Supervised Retail Shop Pilot Acceptance (15 Operational Scenarios)

Execute all 15 scenarios sequentially on the shop's bench/pilot PC with Wi-Fi and Ethernet disconnected. Record observed outcomes honestly (`PASS` / `FAIL` / `BLOCKED` / `NOT RUN`).

| # | Operational Scenario | Acceptance Criteria | Result |
|---|---|---|---|
| S1 | **Business setup & offline boot** | Shop name, owner account, and encrypted local workspace initialize cleanly with zero network connectivity. | `[ ]` |
| S2 | **Initial CSV inventory import** | Import realistic cycles, tricycles, baby walkers, ride-on toys, accessories, and loose spares CSV; verify zero malformed rows and exact paise pricing. | `[ ]` |
| S3 | **Product & barcode configuration** | Confirm leading-zero barcodes scan directly into Checkout while non-barcode loose items (`Loose Brake Cable`, `Loose Galvanised Spokes`) are found quickly by name search. | `[ ]` |
| S4 | **Opening stock reconciliation** | Post one verified opening stock adjustment with reason and acknowledge; verify shelf count matches Sornio stock to 3 decimals. | `[ ]` |
| S5 | **Opening cash float** | Record morning drawer float (e.g., `₹2,000.00`) under **Payments & closing**. | `[ ]` |
| S6 | **Cash sale (bicycle + accessories)** | Scan `Hero Ranger 26T Mountain Bicycle` + `Kids Safety Helmet`, confirm Cash sale, verify exact stock decrement (`-1` each) and cash balance increase. | `[ ]` |
| S7 | **Mixed Cash + UPI sale (ride-on toy / tricycle)** | Sell `Battery Ride-On Toy Jeep 12V` (`₹9,200.00`) as `₹5,000.00` Cash + `₹4,200.00` UPI with reference; verify UPI is flagged **unverified** and excluded from expected drawer cash. | `[ ]` |
| S8 | **Customer record & authorized credit sale** | Sell `Kids Steel Tricycle` + `Musical Folding Baby Walker` on split Cash + Credit to an authorized customer; verify credit limit enforcement refuses any over-limit sale. | `[ ]` |
| S9 | **Partial credit repayment & statement** | Collect partial cash repayment under **Customers & udhaar**; verify updated running balance and clean customer statement printout. | `[ ]` |
| S10 | **Receipt printing (English, Punjabi & reprint)** | Print English and Gurmukhi receipts on the shop thermal printer; reopen historical receipt and verify marked `REPRINT` copy leaves balances untouched. | `[ ]` |
| S11 | **Returns & corrections (sellable & damaged)** | Process 1 damaged inner-tube return (refund issued, stock **not** restocked) and 1 unopened helmet sellable return (refund issued, stock restocked `+1`). | `[ ]` |
| S12 | **Supplier PO, damaged receiving & payment** | Receive 10 tyres with 1 damaged (`9` good into stock), post supplier invoice and partial bank payment; verify remaining payable equals exact accepted value minus payment. | `[ ]` |
| S13 | **Staff RBAC enforcement** | Switch to a Cashier login; confirm Cashier can bill and count drawer cash but is blocked from hardware settings, staff admin, backup/restore, and aggregate owner reports. | `[ ]` |
| S14 | **Daily cash closing** | Count physical drawer cash at closing and post daily close; verify expected cash equals `opening float + cash sales + cash repayments - cash refunds` with exact zero/explicit variance. | `[ ]` |
| S15 | **Encrypted USB backup, restart & recovery** | Export `.sorniobackup` to external USB, verify preview, restart Windows completely offline, reopen Sornio, confirm all daily balances survive, and test clean restore on a disposable test profile. | `[ ]` |

---

## 6. Operator Incident Quick-Reference

- **"Sornio is already open for this workspace on this PC":** Switch to the running Sornio window on the taskbar; do not launch a second copy.
- **"Disk storage is full on this PC":** Free space on `C:` (never delete `%LOCALAPPDATA%\com.sornio.localreview\workspace.db`), then retry.
- **Printer offline / out of paper after sale saved:** Never re-bill the customer. Reload paper or reconnect USB, then use **Print saved receipt** (reprints automatically carry the `REPRINT` / `ਦੁਬਾਰਾ ਛਪਾਈ` banner).
- **Upgrade & downgrade safety:** Installing a newer Sornio release preserves `%LOCALAPPDATA%\com.sornio.localreview` and writes an automatic encrypted pre-migration copy under `migration-backups\`. Never downgrade to an older Sornio binary over a newer schema.
- **Critical files never to delete:** Never delete `%LOCALAPPDATA%\com.sornio.localreview\` or remove the Windows Credential Manager entry `com.sornio.localreview` / `workspace-database` without a verified `.sorniobackup` on external USB and its recovery passphrase.
