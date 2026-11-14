# Sornio — Controlled Single-PC Windows Physical Pilot Acceptance Plan

- **Document ID**: `SORNIO-PILOT-PLAN-2026-11-02`
- **Release Scope**: **CONTROLLED SINGLE-PC WINDOWS PILOT ONLY** (Non-GST local sales receipt; manual/unverified digital payment recording; single counter PC; no multi-PC LAN sync; no cloud sync)
- **Target Package**: `Sornio Local Review_0.3.0_x64-setup.exe` (`com.sornio.localreview`, Schema `v12`)
- **Mandatory Electrical & Hardware Safety Rule**: **NEVER disconnect live mains power, pull a wall plug, or switch off an ungrounded power strip to test crash recovery.** All interruption checks in Step 11 MUST use controlled OS process termination (`Stop-Process -Name "sornio-desktop" -Force` in PowerShell or `taskkill /IM sornio-desktop.exe /T /F` in Command Prompt).

---

## Pilot Machine & Peripheral Pre-Flight Record

| Field | Recorded Value |
| --- | --- |
| Test Date (IST) & Location | |
| Operator / QA Engineer Name | |
| Windows Edition, Version & Build (`winver`) | |
| CPU / RAM / Free Disk Space | |
| Clean Windows User Profile Created for Test? (`YES/NO`) | |
| Pre-Existing Edge WebView2 Runtime Version (if any) | |
| Installer Filename | `Sornio Local Review_0.3.0_x64-setup.exe` |
| Verified Installer `SHA-256` (`Get-FileHash -Algorithm SHA256`) | |
| Authenticode Status (`Get-AuthenticodeSignature`) | Expected: `NotSigned` (controlled pilot exception only) |
| USB Barcode Scanner Make / Model & Mode (HID Keyboard) | |
| Receipt / Statement Printer Make / Model & Paper Width (`58 mm` / `80 mm` / `A4`) | |
| Dedicated External USB Flash Drive Label for Backup Test | |

---

## 15-Step Physical Windows Counter Acceptance Checklist

Every step must be executed sequentially on the physical Windows counter PC with Wi-Fi off and Ethernet unplugged from Step 1 onward. **Any single `FAIL` blocks physical shop pilot entry until resolved and re-verified.**

### Step 1 — Clean Windows User Account Offline Installation
- **Procedure**:
  1. Disconnect Ethernet and disable Wi-Fi (enable Airplane Mode).
  2. Log into a fresh standard Windows local user account with no prior `%LOCALAPPDATA%\com.sornio.localreview` directory.
  3. Verify installer hash with `Get-FileHash ".\Sornio Local Review_0.3.0_x64-setup.exe" -Algorithm SHA256`.
  4. Launch the NSIS installer, document any Windows SmartScreen prompt (expected on unsigned pilot build), complete per-user installation, and launch Sornio while still offline.
- **Pass Criteria**: App installs per-user without UAC elevation failure (or offline WebView2 bootstrapper behavior is explicitly recorded if system runtime was absent), opens the native window (`Sornio — Local workspace review`), and shows the initial **Set up local access** screen with zero network errors.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (SmartScreen prompt, WebView2 behavior, install path, photo/screenshot ref)**: `__________________________________________________`

### Step 2 — Owner Setup & Local Vault Provisioning
- **Procedure**:
  1. Enter **Business name for setup**, **Owner name**, **Account name** (`owner`), **Local password** (strong pilot password, stored securely offline), and **Confirm password**.
  2. Click **Set up local access**.
  3. Save a business draft note in **Keep a local draft**, click **Lock workspace**, test unlocking with an intentionally wrong password, then unlock with the real Owner password.
- **Pass Criteria**: Workspace unlocks into Owner view; `%LOCALAPPDATA%\com.sornio.localreview\workspace.db` is created and encrypted (not readable as `SQLite format 3` plaintext); Windows Credential Manager (`cmdkey /list` or Credential Manager UI) holds `com.sornio.localreview` vault entry; wrong password fails closed without unlocking.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Vault entry present, wrong-password alert verified)**: `__________________________________________________`

### Step 3 — Staff Account Creation & Role Restrictions
- **Procedure**:
  1. Under **Staff access** (Owner session), create a `cashier` account (e.g., `counter-1`) and click **Create staff account**.
  2. Click **Lock workspace** and unlock as `counter-1`.
  3. Inspect visible controls: verify `counter-1` can use **Checkout** and **Counted drawer cash**, and **cannot** see Owner business draft, staff administration, backup controls, aggregate `Cash recorded` / `Credit receivable` totals, or stock adjustment controls.
  4. Lock workspace and log back in as `owner`.
- **Pass Criteria**: Cashier account unlocks cleanly, sees only counter-scoped controls, and is blocked from Owner/Manager reports, catalog edits, and backup/staff administration.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Cashier screen photo/notes)**: `__________________________________________________`

### Step 4 — Product Creation & Opening Stock
- **Procedure**:
  1. In **Items & stock**, add at least three real counter items:
     - Barcode packaged item (`pcs`, e.g., `Atta 20kg`, price `₹1000.00`, opening stock `10`),
     - Second barcoded item (`pcs`, e.g., `Tea 250g`, price `₹120.00`, opening stock `20`),
     - Loose weighed item (`kg`, e.g., `Basmati Rice`, price `₹85.50`, opening stock `25.500`).
  2. Click **Save item on this PC** and **Acknowledge item save** for each item.
  3. Record one positive delivery adjustment (`+5.000` kg on `Basmati Rice`, reason `Pilot opening delivery`) and acknowledge.
- **Pass Criteria**: All three items appear in **Saved local items** and **Checkout** with exact prices and 3-decimal stock (`30.5 kg` for `Basmati Rice`).
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Item count & stock balances)**: `__________________________________________________`

### Step 5 — Physical USB Barcode Scanner Rapid Scan Test
- **Procedure**:
  1. Press `F2` to focus **Search items for sale**.
  2. Scan the physical barcode on `Tea 250g` five times rapidly using the shop's USB HID barcode scanner without touching mouse or keyboard.
  3. Scan unknown, partial, leading-zero and duplicate/ambiguous codes; record the result. Scan a kg/litre/metre item and enter its quantity explicitly.
- **Pass Criteria**: Five rapid valid scans add `Tea 250g` once and increment its cart quantity to `5` with no premature submission. Unknown, partial or ambiguous codes do not add a wrong item; leading zeroes remain intact. Measured items request quantity rather than automatically incrementing. Test the actual scanner with focus in search.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Scanner scan speed, cart quantity `5`, unknown-code behavior)**: `__________________________________________________`

### Step 6 — Cash Sale (`F2` / `F3` / `F4` / `Escape` / focused `Alt+Enter`)
- **Procedure**:
  1. With `Tea 250g` in cart, press `F3` to focus quantity, type `2`, press `Enter`, then add `1.250` kg of `Basmati Rice`.
  2. Press `F4` to open **Review sale**. Scan a code while the confirm button is focused and verify its plain Enter does not post. Press `Escape` to cancel safely, then press `F4` and focused `Alt+Enter` (or click **Confirm sale**) to confirm the **Cash** sale.
- **Pass Criteria**: Sale saves once with a stable UUID (`Saved invoice ID`) and sequential sale number; `Cash recorded` increases by the exact paise total (`2 × ₹120.00 + 1.250 × ₹85.50 = ₹240.00 + ₹106.88 = ₹346.88`); stock deducts to `18 pcs` and `29.25 kg`.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (`Saved invoice ID`, sale number, `Cash recorded`)**: `__________________________________________________`

### Step 7 — Split Sale (`₹1,000 = ₹600 Cash + ₹400 Credit` & Unverified UPI Notice)
- **Procedure**:
  1. In **Customers & credit**, create customer `cust-pilot-1` (`Pilot Credit Customer`, phone `+91 98765 00001`, credit limit `₹2,000.00`).
  2. Click **Start next sale**, add `1` unit of `Atta 20kg` (`₹1,000.00`, Tax `0%`), set **Transaction type** to `UPI / card / split`.
  3. Select customer `cust-pilot-1`, enter `599.99` Cash + `400.00` Customer credit and verify **Review sale** stays disabled (`Split payment amounts must equal the invoice total exactly.`).
  4. Correct Cash to `600.00` and Customer credit to `400.00`, review (`F4`), and confirm by clicking **Confirm sale** or using focused `Alt+Enter`.
  5. Repeat one small split sale with `UPI` (`₹50.00`, optional reference `PILOTUPI001`) + `Cash` (`₹70.00`) for `1 × Tea 250g` (`₹120.00`).
- **Pass Criteria**: `₹1,000.00` invoice posts once; `Cash recorded` increases by exactly `₹600.00` and `Credit receivable` increases by exactly `₹400.00`; on the UPI split sale, UPI (`₹50.00`) appears as `Pending — unverified` (`Externally verified: ₹0.00`) in **Payments & closing** and is NOT counted in drawer cash.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Split invoice UUIDs, cash/credit/pending-UPI totals)**: `__________________________________________________`

### Step 8 — Credit Sale & Partial Cash Repayment
- **Procedure**:
  1. Sell `1` unit of `Tea 250g` (`₹120.00`) on full **Credit** to `cust-pilot-1` (bringing customer due from `₹400.00` to `₹520.00`), then click **Start next sale**.
  2. Open `cust-pilot-1` in **Customers & credit**, enter **Cash repayment** of `₹200.00` with reason `Pilot counter cash collection`, click **Review credit entry**, test `Escape` cancel, then review and click **Confirm credit entry** -> **Start next credit entry**.
- **Pass Criteria**: Customer outstanding balance updates to `₹320.00`; global `Credit receivable` reads `₹320.00`; `Cash recorded` increases by `₹200.00`; customer statement table records both credit sales and the `₹200.00` repayment in running-balance order.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (`Saved credit entry ID`, customer balance `₹320.00`)**: `__________________________________________________`

### Step 9 — English Receipt & Statement Printing on Physical Printer
- **Procedure**:
  1. Reopen the `₹1,000.00` split receipt via **Find saved receipt**, select the shop's physical paper layout (`58 mm`, `80 mm`, or `A4`), keep language set to `English`, and click **Print saved receipt**.
  2. In **Customers & credit**, open `cust-pilot-1`, click **Prepare full customer statement**, and click **Print customer statement**.
  3. Also test cancelling the Windows print dialog once to confirm cancelling does not mutate balances or claim paper printed.
- **Pass Criteria**: Physical paper receipt prints legibly without horizontal clipping, showing shop name, sale number, `Saved invoice ID`, IST timestamp, `Cash received ₹600.00`, `Customer credit ₹400.00`, line items, `Saved total: ₹1,000.00`, and explicit notice `Local sales receipt. GST tax-invoice compliance is not claimed.` Customer statement prints cleanly; print cancellation leaves ledger untouched.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Attach physical receipt & statement photo ref)**: `__________________________________________________`

### Step 10 — Punjabi (`ਪੰਜਾਬੀ`) Gurmukhi Receipt Printing on Physical Printer
- **Procedure**:
  1. With the `₹1,000.00` split receipt open, switch **Receipt language / ਰਸੀਦ ਦੀ ਭਾਸ਼ਾ** to `ਪੰਜਾਬੀ`.
  2. Click **ਸੰਭਾਲੀ ਰਸੀਦ ਛਾਪੋ** and print to the physical thermal/A4 printer.
- **Pass Criteria**: Printed paper renders crisp Gurmukhi glyphs (`ਵਿਕਰੀ ਇਸ ਕੰਪਿਊਟਰ ਉੱਤੇ ਸੰਭਾਲੀ ਗਈ`, `ਨਕਦ ਪ੍ਰਾਪਤ ਹੋਇਆ`, `ਗਾਹਕ ਉਧਾਰ`, `ਸਥਾਨਕ ਵਿਕਰੀ ਦੀ ਰਸੀਦ। ਜੀਐਸਟੀ ਟੈਕਸ ਬਿੱਲ ਦੀ ਪਾਲਣਾ ਦਾ ਦਾਅਵਾ ਨਹੀਂ ਕੀਤਾ ਜਾਂਦਾ।`) with zero tofu boxes (`□`), broken matras, or clipped right-hand currency columns (`₹600.00`, `₹400.00`, `₹1,000.00`).
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Attach physical Punjabi receipt photo ref)**: `__________________________________________________`

### Step 11 — Safe Process-Termination Simulation During Active Work (NO Power-Pull!)
- **Procedure**:
  1. **Safety check**: Keep PC mains/UPS power connected normally. Open a separate PowerShell terminal ready with `Stop-Process -Name "sornio-desktop" -Force`.
  2. **Case 11A (Pre-confirm review)**: Add `1 × Tea 250g` to cart, press `F4` to enter **Review sale** (do NOT click **Confirm sale**), then run `Stop-Process -Name "sornio-desktop" -Force`. Reopen Sornio and unlock.
  3. **Case 11B (Post-commit unacknowledged receipt)**: Add `1 × Tea 250g`, confirm Cash sale, wait until `Sale saved on this PC` appears (do NOT click **Start next sale**), then run `Stop-Process -Name "sornio-desktop" -Force`. Reopen Sornio and unlock.
- **Pass Criteria**:
  - After **11A**: Unconfirmed review did NOT post an invoice or deduct stock.
  - After **11B**: App unlocks without SQLCipher corruption, automatically recovers the exact `Saved invoice ID` receipt (`Recovered the saved invoice from this PC.`), does NOT double-deduct stock or double-count cash, and clears cleanly once **Start next sale** is clicked.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (11A stock unchanged; 11B recovered UUID & single deduction)**: `__________________________________________________`

### Step 12 — Encrypted Backup Export to External USB Media
- **Procedure**:
  1. Insert the dedicated pilot USB flash drive.
  2. Ensure all forms are clean (no unsaved draft/cart edits), click **Open backup controls**, enter **Current Owner password**, enter a strong 14+ character **Recovery passphrase** (recorded separately from Owner password), confirm it, and click **Export encrypted backup…**.
  3. Save `<shop>-pilot-test.sorniobackup` onto the USB drive, record the displayed `Backup ID` and `SHA-256`, safely eject/reinsert the USB drive, and verify `Get-FileHash` on the USB file matches the app-reported `SHA-256`.
- **Pass Criteria**: `.sorniobackup` file exists on USB (`>= 4096` bytes), `Get-FileHash` matches displayed `SHA-256` byte-for-byte, and file header is encrypted ciphertext (does NOT begin with `SQLite format 3`).
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (`Backup ID`, verified USB `SHA-256`)**: `__________________________________________________`

### Step 13 — Backup Verification & Full Point-in-Time Restore
- **Procedure**:
  1. Make one post-backup change (e.g., update **Workspace note** to `Post-backup temporary note` and save draft).
  2. In **Encrypted backup & recovery**, click **Choose encrypted backup…** and select the `.sorniobackup` file from the USB drive.
  3. Test **Verify and preview backup** once with an intentionally wrong **Recovery passphrase** (must refuse), then run **Verify and preview backup** with the real Owner password + Recovery passphrase.
  4. Verify invoice/ledger counts in **Verified backup preview**, re-enter passwords, type the exact `RESTORE <12-hex>` phrase, and click **Create safety backup and restore**.
  5. Unlock with the Owner password, verify state reverted to the backup snapshot, verify a mandatory pre-restore safety backup exists in `%LOCALAPPDATA%\com.sornio.localreview\recovery-safety`, and note that restored staff accounts (`counter-1`) are disabled until Owner review.
- **Pass Criteria**: Wrong passphrase refused; valid restore locks workspace, creates pre-restore safety backup, restores exact pre-backup note/stock/cash/credit balances, and disables staff accounts until explicitly re-enabled by Owner.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Safety backup filename, restored balances, staff disabled check)**: `__________________________________________________`

### Step 14 — Authorized Return (Sellable vs Damaged) & Daily Cashier Closing
- **Procedure**:
  1. In **Payments & closing**, enter the UPI+Cash split invoice ID in **Invoice ID for payment records**, enter return quantity `1` with condition `Damaged — keep out of stock`, enter reason `Damaged pack test`, click **Calculate native return**, review, and confirm. Verify stock does NOT increase for the damaged return while cash/pending-refund obligations update accurately.
  2. Using a separate eligible synthetic sale, process a sellable return and verify that exactly the returned quantity is restored once and the refund/credit balances reconcile.
  2. Optionally click **Save CA settlement CSV** and inspect the exported CSV (`externally_verified` column must be `false` on all rows).
  3. Physically count drawer cash, enter **Declared opening float (₹)** (if used) and **Counted drawer cash (₹)**, click **Review cashier closing**, and click **Confirm retail operation**.
  4. Attempt to post a new sale on the closed business date for that cashier (must be refused with `day_closed` unless Owner/Manager explicitly reopens the day with a reason).
- **Pass Criteria**: Damaged return keeps damaged unit out of sellable stock; closing summary records exact `Expected drawer cash`, `Counted`, and `Variance` to the paisa; closed day blocks silent post-close sales.
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Expected cash, counted cash, variance, closed-day refusal)**: `__________________________________________________`

### Step 15 — Same-Version Reinstall Data Preservation Check
- **Procedure**:
  1. Close Sornio cleanly and confirm `sornio-desktop.exe` is not running in Task Manager.
  2. Record `Get-FileHash` of `%LOCALAPPDATA%\com.sornio.localreview\workspace.db`.
  3. Uninstall `Sornio Local Review 0.3.0` via Windows **Installed Apps** (or the NSIS uninstaller), verify `%LOCALAPPDATA%\com.sornio.localreview\workspace.db` remains intact, then reinstall the **exact same `0.3.0` installer** (`Sornio Local Review_0.3.0_x64-setup.exe`).
  4. Launch Sornio offline and unlock with the Owner password.
- **Pass Criteria**: App prompts for **Unlock workspace** (NEVER fresh setup), unlocks with original Owner credentials, and preserves all invoices, stock counts, customer credit balances, and daily closing history intact. *(Note: Cross-version upgrades e.g. `0.3.0 -> 0.4.0` remain untested and are NOT authorized during pilot without a verified migration build.)*
- **Result**: `[ ] PASS`  `[ ] FAIL`
- **Observed Evidence (Reopened revision, preserved cash/credit/closing records)**: `__________________________________________________`

---

## Pilot Sign-Off Gate

- **Total Steps Passed**: `____ / 15`
- **Any Failing Step?**: `[ ] NO (15/15 PASS — Eligible for Controlled Single-PC Pilot)`  `[ ] YES (BLOCKED — Do NOT deploy to live counter)`
- **Operator Signature & Timestamp**: `__________________________________________________`
- **Engineering Reviewer Signature & Timestamp**: `__________________________________________________`
