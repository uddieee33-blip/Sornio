# Sornio — Windows Foundation acceptance package

Status: **template and procedure. No Windows execution has been performed for this package.**
Milestone: `foundation` (install, start, offline trading, recover). Hardware and the full shop pilot
are a later milestone and are explicitly out of scope here.

| Field | Value |
|---|---|
| Package authored | 2026-11-27 |
| Branch | `arena/475a4866-sornio` |
| Code under test | HEAD of this branch (verify the exact SHA in the form below) |
| Product | `Sornio Local Review` 0.3.0, `com.sornio.localreview`, NSIS `currentUser`, WebView2 `offlineInstaller` |
| Machine-readable schema | `docs/windows/foundation-acceptance.schema.json` |
| Example record | `docs/windows/foundation-acceptance.example.json` |
| Validator | `node scripts/verify-windows-foundation-evidence.mjs --record <file>` |

**How to read the states.** Every gate is recorded as exactly one of:

| State | Meaning |
|---|---|
| `passed` | Executed on the Windows workstation, evidence attached, validator accepts it. |
| `failed` | Executed, did not meet the expectation. Blocks the milestone. |
| `not-run` | Not executed. **Never** counts as a pass. |
| `blocked` | Cannot be executed in the available environment (e.g. no barcode scanner attached). |

A record only validates when every required gate is `passed`, every `blocked` gate carries a reason,
and the two hardware gates are honestly marked `blocked` if no hardware was attached. **This package
cannot pass without a physical Windows workstation.**

---

## 1. What is already covered, and what this package adds

Do not repeat work that CI already does. `.github/workflows/windows-local.yml` already builds the
NSIS installer on `windows-latest`, runs the full `local-store` suite in both release and debug
profiles, installs the app, and captures screenshots. `apps/desktop/check-windows-evidence.py`
already gates installer hash, commit SHA and four screenshots.

This package adds what a hosted runner cannot give:

| Gap | Why CI cannot close it | Gate here |
|---|---|---|
| A real Windows workstation, not a fresh runner VM | Runner VMs are ephemeral and pre-provisioned | W-01 |
| Upgrade from an **existing schema-12 shop database** | CI only reinstalls the same version | W-05 |
| WebView2 absent → offline installer fallback | `offlineInstaller` is configured but the fallback path is never exercised on a runner with WebView2 present | W-02 |
| A real offline day of trading with power/network events | Runner tests are scripted, not operated | W-06, W-07 |
| Owner recovery on a machine that actually locked out | Requires prior state | W-08, W-09 |
| NTFS ACLs on the encrypted database | Runner is NTFS but the ACLs are never inspected | W-12 |
| USB HID barcode scanner, thermal printer, cash drawer | No peripherals are attached to CI | H-13, H-14, H-15 |

---

## 2. Hardware and software prerequisite sheet

Fill this in **before** touching the gates. A gate result whose environment row is blank is not
acceptable evidence.

| Item | Record |
|---|---|
| Workstation make/model | |
| Windows edition + build (`winver`) | |
| CPU / RAM / free disk | |
| WebView2 Runtime version (or "absent") | |
| Local Windows account name and type (standard/admin) | |
| Installer file name | |
| Installer SHA-256 (`Get-FileHash -Algorithm SHA256`) | |
| Installed EXE path and SHA-256 | |
| Code commit SHA under test | |
| Database file path (`%LOCALAPPDATA%\…`) | |
| Schema version before upgrade | |
| Schema version after upgrade | |
| Barcode scanner make/model/interface | |
| Thermal printer make/model/driver | |
| Cash drawer make/model/trigger | |
| Tester name and date | |

---

## 3. Gate procedure

### W-01-installation — Windows installation

1. On a machine with **no prior Sornio install**, run the NSIS `*-setup.exe`.
2. Confirm it installs per-user with no UAC administrator prompt.
3. Confirm the install location and that a Start-menu entry exists.
   **Expect:** the app launches to first-run setup. **Evidence:** `evidence/W-01-install.png`,
   `installer-manifest.json`, the PowerShell transcript.

### W-02-webview2 — WebView2 runtime

1. Record whether `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
   exists (WebView2 present) or not.
2. If absent: install from the bundled offline installer and confirm the app still starts **with no
   network connection**.
3. If present: record that the fallback path could not be exercised and mark this gate `blocked`
   with that reason. Do not mark it `passed`.
   **Evidence:** `evidence/W-02-webview2.txt` (the registry query output), screenshot of the app
   running offline.

### W-03-startup-shutdown — Tauri startup and shutdown

1. Launch from the Start menu. Measure cold start to first usable screen.
2. Close with the window X. Reopen. Confirm no orphan process remains
   (`Get-Process sornio-desktop`).
3. Force-kill while a draft sale is open, relaunch, confirm the app recovers rather than crashing.
   **Evidence:** `evidence/W-03-lifecycle.txt` (process listings + timings).

### W-04-sqlcipher-init — SQLCipher database initialisation on NTFS

1. After first-run setup, locate the encrypted database file.
2. Confirm it is not readable as plaintext: `findstr /C:"CREATE TABLE" <db>` must find nothing, and a
   text editor must show no schema or names.
3. Confirm the file lives under the per-user app data path, not `Program Files`.
   **Evidence:** `evidence/W-04-database.txt` (file path, size, `findstr` output).

### W-05-schema-upgrade — Schema-12 to schema-13 upgrade

This is the gate CI cannot cover at all.

1. Start from an **existing shop database written by the previous release** (schema 12). Record its
   schema version and a financial snapshot: cash total, customer outstanding, stock for three
   products, last invoice number.
2. Install and launch the new build over it.
3. Confirm the app opens without a recovery prompt, the schema is now 13, and **every recorded
   financial figure is unchanged**.
4. Confirm a sale can be posted after the upgrade and that the v13 recovery tables
   (`local_recovery_identity`, `local_recovery_operations`, `local_recovery_fence`) exist.
   **Expect:** no data loss, no figure drift. **Evidence:** `evidence/W-05-upgrade-before.json`,
   `evidence/W-05-upgrade-after.json`, screenshots of the balances before and after.
   **If no schema-12 database can be produced, mark `blocked` with the reason.** Do not simulate it
   and call it passed.

### W-06-offline-billing — Offline billing

1. Disable every network adapter on the machine.
2. Post a cash sale, a UPI sale, a card sale and a split cash+credit sale.
3. Confirm each produces a receipt with a stable invoice number, balances move exactly once, and
   stock decrements correctly.
4. Repeat one submit with a double-click to confirm exactly one invoice id is minted.
   **Evidence:** `evidence/W-06-offline-billing/` (one screenshot per sale), a CSV of the balances.

### W-07-offline-inventory — Offline inventory operations

1. Still offline: add a product, adjust stock up and down, attempt an oversell (must be refused),
   and confirm a fractional quantity is rejected where the product is unit-only.
2. Restart the app and confirm the stock figures persisted.
   **Evidence:** `evidence/W-07-inventory/`.

### W-08-recovery — Recovery and owner re-authentication

1. With trading data present, run a backup export to a USB drive.
2. Deliberately corrupt or remove the live database (record how).
3. Launch the app: expect the recovery/fence path, not a crash.
4. Recover using the Owner password. Confirm the app returns to a usable state with the data intact.
5. Confirm the password prompt is rate-limited: five wrong attempts must lock out and the lockout must
   survive an app restart.
   **Evidence:** `evidence/W-08-recovery/` (screenshots incl. the lockout), the recovered row counts.

### W-09-restart — Application restart

1. Post a sale, close the app, reopen it, confirm balances and the invoice list are identical.
2. Confirm pending/retail state is not double-counted across the restart.
3. Confirm a mid-sale force-kill leaves no partial invoice.
   **Evidence:** `evidence/W-09-restart/`.

### W-10-backup-restore — Backup and restore

1. Export a backup; record its SHA-256.
2. Restore it into a clean install; confirm the financial snapshot matches the export.
3. Confirm a **tampered** backup (flip one byte) is rejected at preview, not silently imported.
4. Confirm a backup with a deliberately inconsistent ledger is rejected by the financial verifier.
   **Evidence:** `evidence/W-10-backup/` (both rejection screenshots included).

### W-11-install-uninstall — NSIS installation and uninstallation

1. Uninstall from Settings → Apps. Confirm the app is removed.
2. Confirm the **owner data is preserved** (the uninstaller must not delete the encrypted database).
3. Reinstall and confirm the previous data reopens with the same balances.
4. Confirm a second uninstall with "remove data" (if offered) behaves as documented.
   **Evidence:** `evidence/W-11-uninstall/`.

### W-12-ntfs-acls — Database file permissions and NTFS ACLs

1. Run `icacls "<database path>"` and `icacls "<app data folder>"`.
2. Confirm only the installing user (and Administrators/SYSTEM as required) can read the file.
3. Confirm `%LOCALAPPDATA%` redirection or roaming does not expose the file to other profiles.
   **Expect:** no `Everyone`, `Users`, or `Authenticated Users` read/write ACE on the database.
   **Evidence:** `evidence/W-12-acl.txt` (verbatim `icacls` output).

### H-13-barcode-scanner — USB HID barcode scanner (hardware milestone)

1. Attach the scanner. Confirm it enumerates as a keyboard-wedge HID device.
2. Scan a product barcode into the search/scan field while the app has focus.
3. Confirm the scan resolves a product and that a scan into a password field cannot leak into the log.
   **If no scanner is attached, mark `blocked` with the reason.** A keyboard typing the same digits is
   **not** evidence of scanner support and must not be recorded as `passed`.

### H-14-thermal-printer — Thermal printer (hardware milestone)

1. Attach the printer; print a receipt and a customer statement.
2. Confirm totals render exactly (paise), the cut triggers, and a printer-offline condition produces a
   clear error without corrupting the sale.
   **If no printer is attached, mark `blocked`.**

### H-15-cash-drawer — Cash drawer (hardware milestone, where supported)

1. Confirm the drawer opens only on the documented trigger (cash sale / explicit no-sale, if the
   product supports it).
2. Confirm a failed print or a cancelled sale does not open the drawer.
   **If the product does not support a drawer on this hardware, mark `blocked` and record the reason.**

---

## 4. Recording the result

1. Copy `docs/windows/foundation-acceptance.example.json` to a working file.
2. Fill in every field. Leave no gate `not-run` if you intend to claim the milestone.
3. Run the validator:

```powershell
node scripts/verify-windows-foundation-evidence.mjs --record .\foundation-acceptance.json
```

4. The validator fails unless: the schema is well-formed, every required gate is `passed`, every
   `blocked` gate has a non-empty reason, `hardwareClaimed` matches the hardware gate states, and the
   commit SHA matches the checked-out HEAD.
5. Attach the whole `evidence/` tree and the JSON to the acceptance record. Hashes are recorded, not
   screenshots alone.

## 5. Explicit non-claims

Completing this package **does not** mean:

* the app is signed for consumer distribution (the build is an unsigned engineering build);
* it was tested on more than the recorded workstation;
* hardware works beyond the recorded make/model;
* the product is ready for a real shop. That requires the hardware milestone plus a usability study,
  and it is a separate decision.
