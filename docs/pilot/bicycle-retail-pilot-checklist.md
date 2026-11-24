# Sornio Windows First-Shop Pilot Checklist — Bicycle Retail & Spare-Parts Shop

**Target release:** Sornio Local Review `0.4.0` (Schema `v24`, offline Windows NSIS per-user installer)  
**Pilot shop profile:** Retail bicycle & spare-parts counter (barcoded bicycles/tyres/tubes/accessories + non-barcode loose parts such as brake wire, spokes, ball bearings, and workshop consumables)  
**Operating mode:** 100% offline Windows desktop; encrypted local SQLCipher database + Windows Credential Manager device key; manual encrypted USB backup.

---

## 1. Pre-Pilot Machine & Hardware Acceptance (Physical Bench — Cannot Be Simulated)

The following items **cannot** be proved by CI automation and **must** be executed on the shop's own Windows PC and peripherals before taking real customer money:

| # | Physical Check | Expected Result | Sign-Off |
|---|---|---|---|
| H1 | **Offline install without internet** | Disconnect Ethernet/Wi-Fi. Run `Sornio Local Review_0.4.0_x64-setup.exe` from USB under the shop's normal Windows user account (no admin rights required for per-user app install if WebView2 is present; note WebView2 offline runtime install may request UAC elevation if WebView2 was never installed). Verify app opens cleanly with network disconnected. | `[ ]` |
| H2 | **USB HID barcode scanner** | Plug in the shop's physical USB scanner. Configure suffix in **Business & settings → Counter hardware & receipt defaults** (`Enter or Tab`, `Enter only`, or `Tab only`). Scan a leading-zero barcode (e.g. `0089011122233`): item adds to cart in one scan; rapid accidental double-trigger (<250 ms) is ignored; deliberate second scan increments quantity to `2`; unknown barcode displays fallback prompt without corrupting cart. | `[ ]` |
| H3 | **Physical receipt printer (58 mm / 80 mm / A4)** | Select the shop's installed Windows printer in **Counter hardware & receipt defaults** and save. Print both an **English** receipt and a **Punjabi (ਪੰਜਾਬੀ)** receipt. Confirm Gurmukhi glyphs render crisply without tofu/boxes, prices/totals align inside paper margins, and paper cut/feed behaves properly. | `[ ]` |
| H4 | **Printer offline / paper-out fault test** | Lift the thermal cover or unplug the printer USB cable after saving a test sale. Attempt print: confirm the invoice remains saved once (never duplicated or reversed), the operator sees clear guidance not to re-bill, and **Reprint saved receipt** prints a clearly marked `REPRINT` / `ਦੁਬਾਰਾ ਛਪਾਈ` copy once paper/power is restored. | `[ ]` |
| H5 | **Physical cash drawer (if installed)** | If an RJ11 drawer is wired through the thermal printer, configure Windows printer driver drawer kickout (`Pin 2` / `Pin 5`) and record the contract mode in **Counter hardware & receipt defaults**. Complete a cash test sale and verify the drawer opens once on receipt print. If no drawer or manual key drawer is used, set `No cash drawer` or `Manual key-opened drawer`. | `[ ]` |
| H6 | **Unexpected power-loss / hard-off test (test DB only)** | Using a **disposable test workspace** (never live shop data!), start checkout, cut power / hard-restart Windows, reopen Sornio, confirm pending checkout recovers cleanly without duplicate invoice or negative stock. | `[ ]` |
| H7 | **Encrypted USB backup & restore drill** | Insert the shop's dedicated backup USB drive (e.g. `E:\SornioBackups`). Record the destination reminder in **Counter hardware & receipt defaults**. Export a `.sorniobackup`, verify the file cannot be read as plaintext SQLite, preview it with the recovery passphrase, and verify restore succeeds cleanly on a test workspace. | `[ ]` |

---

## 2. Shop Onboarding Procedure (Day 0)

1. **Verify installer integrity before running:**
   - Compare `Get-FileHash <installer.exe> -Algorithm SHA256` against the release manifest `sha256`.
   - Confirm Windows SmartScreen expectation: until an OV/EV Authenticode certificate is configured, Windows SmartScreen will show an unknown-publisher warning; pilot operators must verify the exact SHA-256 hash before approving execution.
2. **Owner account provisioning:**
   - Launch Sornio, create the **Owner** account with a strong password stored securely offline (never shared with counter cashiers).
   - Set **Business name** and **Business type** (`General store`) under **Business & settings**.
3. **Staff access separation:**
   - Create separate **Cashier** accounts for counter staff under **Business & settings → Staff access**. Cashiers can bill, accept payments, and view their own receipts, but cannot change hardware settings, delete/edit history, or export/restore backups.
4. **Configure counter hardware defaults:**
   - Open **Business & settings → Counter hardware & receipt defaults**.
   - Click **Refresh printers**, select the shop's receipt printer, pick default paper width (`58mm`, `80mm`, or `a4`) and receipt language (`English` or `ਪੰਜਾਬੀ`), set barcode scanner suffix (`Enter or Tab`), cash drawer mode, and backup USB reminder note. Save.
5. **Load product catalog (Bulk CSV + non-barcode spares):**
   - Open **Items & stock → Bulk CSV product import (for shop setup)**.
   - Prepare a CSV with columns `name,sku,unit,price_rupees,opening_stock`:
     ```csv
     name,sku,unit,price_rupees,opening_stock
     Atlas Goldline 26T Bicycle,8901112223334,pcs,6500.00,5
     Ralson 26x1.95 Tyre,8901112223341,pcs,380.00,30
     26in Butyl Inner Tube,8901112223358,pcs,140.00,40
     Loose Brake Cable,,metre,45.00,50
     ```
   - Import and verify item count and opening stock quantities match physical shelf count.
6. **Add regular credit customers & wholesale suppliers:**
   - Add workshop/regular credit customers under **Customers & udhaar** with explicit **Credit limit** and **Credit days**.
   - Add bicycle/spare-parts wholesalers under **Suppliers & purchases**.

---

## 3. Pilot Verification Scenarios (13 End-to-End Bicycle Shop Scenarios)

Run all 13 scenarios on a disposable pilot database before live cutover (and verify automated native coverage in `packages/local-store/src/phase23_reliability_tests.rs::synthetic_bicycle_retail_pilot_reconciles_end_to_end`):

1. **Opening cash float:** Record morning opening float (e.g. ₹2,000.00) under **Payments & closing**.
2. **Cash bicycle sale:** Scan bicycle barcode → review → confirm Cash sale → verify stock decrements by 1 and receipt prints cleanly.
3. **Mixed Cash + UPI bicycle sale:** Sell a ₹6,500.00 bicycle as ₹4,000.00 Cash + ₹2,500.00 UPI (with UPI reference note) → confirm UPI displays as **unverified** until manually matched against bank statement.
4. **Multi-quantity spare-parts sale:** Scan `2×` tyres + `3×` inner tubes + search non-barcode `2.5 metre` loose brake cable → confirm exact integer-paise subtotal and total.
5. **Customer credit (udhaar) & limit check:** Sell spares on split Cash + Credit to a credit customer → verify customer balance increases by exact credit portion only; verify an invoice exceeding the credit limit is refused natively.
6. **Partial credit repayment:** Collect ₹300.00 cash repayment under **Customers & udhaar** → verify customer balance drops by ₹300.00 and statement prints accurately.
7. **Damaged return (no restock):** Process a customer return of 1 pinched inner tube with disposition `Damaged` → verify cash refund reduces expected drawer cash while sellable tube stock is **not** falsely incremented.
8. **Sellable return (restocked):** Process a customer return of an unopened accessory with disposition `Sellable` → verify stock increments cleanly and refund matches original tender bounds.
9. **Historical receipt reprint:** Reopen an earlier invoice under **Find saved receipt** → preview → print → confirm `REPRINT` / `ਦੁਬਾਰਾ ਛਪਾਈ` badge appears and invoice count/ledger balances do not change.
10. **Supplier PO, damaged goods receipt & payable:** Create/approve a Purchase Order for 10 tyres, receive 10 with `1` damaged → verify only `9` good tyres enter sellable stock and supplier payable reflects accepted value.
11. **Supplier invoice & partial payment:** Post supplier invoice against receipt and pay partial amount via bank/NEFT → verify remaining supplier payable balance matches `invoice - payment`.
12. **Daily cash closing:** Count physical cash drawer at end of day and post closing under **Payments & closing** → verify expected cash equals `opening float + cash sales - cash refunds` with exact zero/explicit variance.
13. **End-of-day encrypted backup & restore check:** Export encrypted `.sorniobackup` to external USB drive, verify file size > 0, and retain the recovery passphrase offline separately from the USB drive.

---

## 4. Operator Incident Quick-Reference

- **"Sornio is already open for this workspace on this PC":** Another Sornio window is already running. Switch to the existing window on the taskbar instead of opening a second copy.
- **"Disk storage is full on this PC":** Free disk space on `C:` (delete temporary downloads/media, never delete `%LOCALAPPDATA%\com.sornio.localreview\workspace.db`), then retry. Previous saved invoices remain intact.
- **Printer out of paper / offline after sale saved:** Never re-bill the customer. Reload paper or reconnect USB, then click **Reprint saved receipt** (or reopen via **Find saved receipt**).
- **Upgrade safety:** Upgrading to a newer Sornio Windows installer preserves `%LOCALAPPDATA%\com.sornio.localreview` and automatically writes an encrypted pre-migration safety copy under `%LOCALAPPDATA%\com.sornio.localreview\migration-backups\`. Never downgrade to an older Sornio version over a newer database; older binaries will refuse to open a newer schema rather than corrupting it.
- **What never to delete:** Do not delete `%LOCALAPPDATA%\com.sornio.localreview\` and do not clear the Windows Credential Manager entry `com.sornio.localreview` / `workspace-database` without a verified encrypted backup and its recovery passphrase.
