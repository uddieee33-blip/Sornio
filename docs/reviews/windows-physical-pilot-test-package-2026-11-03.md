# Sornio — Physical Windows PC Pilot Test Package (Phase 6)

**Date:** 2026-11-03 (UTC)
**Release candidate:** PR #145 head `97b6899475cc3dfa3ff1370f59373401646eecfb` (code head `21a3f7c9`), app version `0.3.0`, product name "Sornio Local Review" (NSIS installer, x86_64 Windows).
**Audience:** a non-developer shop operator. No knowledge of Rust, SQLCipher, GitHub or PostgreSQL is required.
**Status of this document:** instructions only. Physical-device execution in this engineering sandbox is **UNTESTED** — no physical Windows PC or printer is attached here. Do not treat any planned step below as executed.

---

## 1. What you need

* One ordinary Windows 10/11 PC (64-bit), at least 4 GB RAM, 1 GB free disk space.
* The release-candidate installer file from the engineering team, plus its SHA-256 checksum (printed in the release note or `installer-manifest.json`).
* A receipt printer (58 mm or 80 mm thermal, or any A4 printer) — optional for the first pass.
* No internet connection is required for any billing step. You may disconnect Wi-Fi/ethernet after installation to prove offline operation.

## 2. Verify the installer before running it

1. Open PowerShell in the folder containing the installer.
2. Run: `Get-FileHash .\<installer-name>.exe -Algorithm SHA256`
3. Compare the printed hash, character by character, with the official SHA-256 in the release note.
4. If they differ in any character: **stop**. Do not run the installer. Report the mismatch to the engineering team.

## 3. Clean installation

1. If an older Sornio build is installed, uninstall it first (Settings → Apps), then confirm the install folder is empty.
2. Double-click the verified installer and follow the prompts. Note any security warning shown by Windows — unsigned engineering builds will show one; that is expected and recorded as BLOCKED for signing (see report section J).
3. Launch Sornio from the desktop shortcut.

## 4. First-launch checks

1. Create the test business (any shop name, e.g. "Pilot Test Shop").
2. Set the local unlock password when prompted. Write it down — it is required to unlock the database.
3. Confirm the home screen loads without an internet connection.

## 5. Test-business setup and cashier login

1. Add two test products (e.g. "Test Tea ₹10", "Test Biscuit ₹1,000") with stock quantities.
2. Add a test customer with no credit limit (e.g. "Test Customer").
3. Add a cashier staff account; log out of the owner and log in as the cashier.

## 6. Offline billing tests (disconnect the internet first)

* **Cash sale:** sell 1 × Test Tea for cash. Check the receipt total, stock went down by 1, and the cash balance increased.
* **Split sale (critical):** sell 1 × Test Biscuit (₹1,000.00) paying ₹600.00 cash + ₹400.00 on the test customer's credit. Check: exactly one invoice, stock down by exactly 1, cash +₹600.00, customer due ₹400.00, receipt shows ₹600.00 / ₹400.00 split. Press Enter repeatedly fast during checkout — the sale must still appear only once.
* **Repayment:** take ₹200.00 from the customer → due becomes ₹200.00; take the final ₹200.00 → due ₹0.00. Repeat the final payment again — it must be rejected, not double-posted.
* **Return/refund:** return the tea from the first sale; refund posts once; repeating the refund is rejected; stock is restored (or marked damaged if applicable).
* **Daily closing:** after several mixed sales (cash + UPI + credit), close the day, verify expected cash, record a small counted variance, and confirm the audit trail entry.

## 7. Restart and data-preservation tests

1. Close Sornio normally; reopen; confirm all sales, balances and stock are unchanged.
2. Make a sale, then force-close Sornio via Task Manager (End task) immediately after the confirmation appears; reopen; confirm the sale exists exactly once (no duplicate, no loss).
3. Reopen after a full Windows restart; confirm data persists.

## 8. Backup and recovery

1. Create an encrypted backup to a USB drive or a second folder; set a separate backup passphrase.
2. Reopen Sornio and restore from that backup; confirm invoices, balances, stock and audit history match.
3. Try to open the backup with the wrong passphrase — it must be rejected.
4. Restore from an older backup snapshot, then confirm the app tells you clearly which generation you are on (no silent mixing of old and new data).

## 9. Printer tests (if a printer is attached)

1. Print receipts for the cash sale and the split sale. Check the receipt shows shop name, invoice number, date/time, item, quantity, price, total, and the cash/credit split.
2. Test with the printer switched off: the sale must still post exactly once and the app must offer print retry, not a new sale.
3. Switch paper width (58 mm vs 80 mm) in printer settings and reprint.

## 10. Uninstall and reinstall

1. Uninstall Sornio. Reinstall the same verified installer.
2. Launch and confirm the pilot data (invoices, balances) is preserved and no duplicate records appear.

## 11. Results

Record each step as PASS / FAIL / BLOCKED with a photo or screenshot where useful, and send the results plus the installer SHA-256 you verified to the engineering team.
