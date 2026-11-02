# Sornio — Physical Windows Pilot Acceptance Execution Record

- **Document ID**: `SORNIO-PILOT-EXEC-2026-11-02`
- **Companion plan**: `docs/reviews/windows-physical-pilot-acceptance-plan-2026-11-02.md` (procedures live there; this document captures results)
- **Release under test**: `Sornio Local Review_0.3.0_x64-setup.exe` — `com.sornio.localreview`, schema `v12`
- **Source commit**: `baabf5fe35462de22d8a4d6132e29b3873fc919d` (tree `871c48be587de15c35728494a9b6e80e308b3b22`)
- **Scope**: CONTROLLED SINGLE-PC WINDOWS PILOT. No LAN, no GST tax invoice, no automated payment settlement, no public distribution.
- **Baseline status of every stage in this record**: `UNTESTED`

> **Pre-execution position.** No authorized operator has yet run this checklist on physical shop hardware. Every stage below is recorded as **UNTESTED** against the current build. Nothing in this document is evidence of physical success. Automated Windows VM results are recorded separately in `docs/reviews/windows-pilot-main-baseline-2026-11-02.json` and are explicitly *not* a substitute for these stages.

---

## Safety rules binding this session

1. **Never** pull mains power, unplug the UPS, or switch off a power strip to test recovery. Step 11 uses operating-system process termination only.
2. **Never** use live customer names, phone numbers, real debts, or real money. Use synthetic fixtures only (`cust-pilot-1`, `+91 98765 00001`, ₹ amounts from the plan).
3. **Never** bypass, disable, or suppress a Windows SmartScreen or Authenticode warning to make an unsigned build appear trusted. If a prompt appears, photograph it and record it as an observed fact.
4. If the target hardware or peripheral is unavailable, the affected stage stays **UNTESTED**. It must not be marked PASS by inference.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `PASS` | Performed on the physical pilot PC; every pass criterion observed; evidence reference recorded. |
| `FAIL` | Performed; one or more pass criteria not met. A defect record is mandatory. |
| `UNTESTED` | Not performed, or hardware unavailable. Never used as a passive default for a stage that was actually run. |
| `BLOCKED` | Cannot be performed because a prerequisite stage failed. Naming the blocking stage is mandatory. |

## Session header (fill before Stage 1)

| Field | Value |
| --- | --- |
| Session ID | |
| Test date (IST) | |
| Operator name and role | |
| Engineering reviewer name | |
| Windows edition / version / build (`winver`) | |
| CPU / RAM / free disk (GB) | |
| Fresh standard user profile created? | `YES` / `NO` |
| Pre-existing WebView2 runtime version | |
| Installer SHA-256 (`Get-FileHash -Algorithm SHA256`) | |
| Installer SHA-256 matched `installer-artifact.json`? | `YES` / `NO` |
| Authenticode status (`Get-AuthenticodeSignature`) | |
| Barcode scanner make / model / mode | |
| Printer make / model / paper width | |
| Backup USB drive label | |

---

## The 15 stages

### Stage 01 — Clean offline Windows installation
- **Test ID**: `SORNIO-PILOT-01`
- **Expected result**: Per-user install completes without UAC elevation failure; application launches offline and shows the **Set up local access** screen with zero network errors; any SmartScreen prompt is photographed and recorded verbatim.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:
- **Notes** (record whether the WebView2 runtime was already present — this determines whether offline bootstrap was genuinely exercised):

### Stage 02 — Owner setup and encrypted local vault
- **Test ID**: `SORNIO-PILOT-02`
- **Expected result**: Workspace unlocks into Owner view; `%LOCALAPPDATA%\com.sornio.localreview\workspace.db` exists and does **not** begin with `SQLite format 3`; Windows Credential Manager holds the `com.sornio.localreview` vault entry; a wrong password fails closed without unlocking.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 03 — Staff authentication and native authorization
- **Test ID**: `SORNIO-PILOT-03`
- **Expected result**: `counter-1` unlocks; sees only counter-scoped controls; is refused Owner/Manager reports, catalog edits, staff administration and backup controls. Owner re-login restores full access.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 04 — Product creation and three-decimal stock
- **Test ID**: `SORNIO-PILOT-04`
- **Expected result**: Three items persist with exact prices; weighed item carries three decimals (`25.500` kg → `30.500` kg after a `+5.000` delivery); all appear in Checkout.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 05 — Physical USB barcode scanner
- **Test ID**: `SORNIO-PILOT-05`
- **Expected result**: Five rapid scans of the same barcode yield cart quantity exactly `5` with no dropped digits, no residual SKU text in the search box and no premature submit; an unregistered barcode raises an alert and adds nothing.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 06 — Keyboard-only cash checkout
- **Test ID**: `SORNIO-PILOT-06`
- **Expected result**: `F2`/`F3`/`F4`/`Escape`/`Enter` drive a complete sale without a mouse. `Escape` from review posts nothing. The sale posts once with a stable `Saved invoice ID`; `Cash recorded` rises by exactly ₹346.88; stock reads `18 pcs` and `29.250 kg`.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 07 — Split sale ₹600 cash + ₹400 credit
- **Test ID**: `SORNIO-PILOT-07`
- **Expected result**: `₹599.99 + ₹400.00` is refused with `Split payment amounts must equal the invoice total exactly.`; the corrected `₹600.00 + ₹400.00` posts exactly one invoice of ₹1,000.00, one stock deduction, `Cash recorded` +₹600.00 and `Credit receivable` +₹400.00 with a balanced journal. An unverified UPI split shows `Pending — unverified` and is excluded from drawer cash.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 08 — Credit sale and partial repayment
- **Test ID**: `SORNIO-PILOT-08`
- **Expected result**: Customer due moves ₹400.00 → ₹520.00 → ₹320.00; global `Credit receivable` reads ₹320.00; `Cash recorded` +₹200.00; the customer statement lists both credit sales and the repayment in running-balance order.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 09 — Physical English receipt printing
- **Test ID**: `SORNIO-PILOT-09`
- **Expected result**: Paper receipt is legible with no horizontal clipping and shows shop name, sale number, `Saved invoice ID`, IST timestamp, `Cash received ₹600.00`, `Customer credit ₹400.00`, line items, `Saved total: ₹1,000.00` and the notice `Local sales receipt. GST tax-invoice compliance is not claimed.` The statement prints cleanly. Cancelling the print dialog leaves the ledger untouched and never claims paper was produced.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference** (attach photo of physical paper):
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 10 — Physical Punjabi Gurmukhi receipt printing
- **Test ID**: `SORNIO-PILOT-10`
- **Expected result**: Paper renders crisp Gurmukhi (`ਵਿਕਰੀ ਇਸ ਕੰਪਿਊਟਰ ਉੱਤੇ ਸੰਭਾਲੀ ਗਈ`, `ਨਕਦ ਪ੍ਰਾਪਤ ਹੋਇਆ`, `ਗਾਹਕ ਉਧਾਰ`, `ਸਥਾਨਕ ਵਿਕਰੀ ਦੀ ਰਸੀਦ। ਜੀਐਸਟੀ ਟੈਕਸ ਬਿੱਲ ਦੀ ਪਾਲਣਾ ਦਾ ਦਾਅਵਾ ਨਹੀਂ ਕੀਤਾ ਜਾਂਦਾ।`) with zero tofu boxes (`□`), no broken matras, and no clipped currency columns.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference** (attach photo of physical Punjabi paper):
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 11 — Process-failure recovery rehearsal (no power pull)
- **Test ID**: `SORNIO-PILOT-11`
- **Expected result**: Case A — an unconfirmed review posts no invoice and deducts no stock. Case B — after `Stop-Process -Name "sornio-desktop" -Force` following a committed sale, the app reopens without SQLCipher corruption, recovers the exact `Saved invoice ID`, does not double-deduct stock or double-count cash, and clears on **Start next sale**.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:
- **Attestation**: I confirm mains power remained connected throughout. `YES` / `NO`:

### Stage 12 — Encrypted backup export to USB
- **Test ID**: `SORNIO-PILOT-12`
- **Expected result**: `.sorniobackup` (≥ 4096 bytes) written to the USB drive; `Get-FileHash` after safe eject/reinsert matches the app-reported SHA-256 byte-for-byte; the file does not begin with `SQLite format 3`.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 13 — Backup integrity and restoration
- **Test ID**: `SORNIO-PILOT-13`
- **Expected result**: A wrong recovery passphrase is refused. A valid restore locks the workspace, writes a pre-restore safety backup into `recovery-safety`, restores exact pre-backup note/stock/cash/credit state, and disables staff accounts until the Owner re-enables them.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 14 — Returns, refund safeguards and cash closing
- **Test ID**: `SORNIO-PILOT-14`
- **Expected result**: A damaged return does not restock; cash and pending-refund obligations update correctly; expected/counted/variance reconcile to the paisa; a closed day refuses further sales with `day_closed` unless the Owner reopens it with a reason.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

### Stage 15 — Same-version uninstall and reinstall
- **Test ID**: `SORNIO-PILOT-15`
- **Expected result**: After uninstall the `workspace.db` SHA-256 is unchanged; reinstalling the identical `0.3.0` installer prompts for **Unlock workspace**, never fresh setup; all invoices, stock, credit balances and closing history survive. Cross-version upgrade is out of scope and must not be attempted.
- **Actual result**:
- **Status**: `UNTESTED`
- **Evidence reference**:
- **Tester**:
- **Date**:
- **Defect record**:

---

## Sign-off gate

| Item | Value |
| --- | --- |
| Stages PASS | `___ / 15` |
| Stages FAIL | `___` |
| Stages UNTESTED | `___` |
| Stages BLOCKED | `___` |
| Any P0 or P1 defect raised? | `YES` / `NO` |
| **Pilot entry decision** | `[ ] GO` (15/15 PASS, zero P0/P1) `[ ] NO-GO` |
| Operator signature and timestamp | |
| Engineering reviewer signature and timestamp | |

**Rule**: 15/15 PASS with zero open P0/P1 defects is the only path to `GO` for the controlled single-PC pilot. Any FAIL keeps the pilot at NO-GO. This gate does not authorize a public commercial release under any outcome.
