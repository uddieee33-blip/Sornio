# Phase 22D — what the failing runs actually say, the defect this session introduced and repaired, and the audit that could never have passed

**Work branch:** `arena/9dc8ce9b-sornio` (based on PR #190's head `30012db`)
**Code candidate under test:** `78837b09` (schema v23), unchanged by this report
**Date:** 2026-11-16

Every row below says what ran, where, and at which SHA. A row that did not run
says NOT RUN. Nothing here claims a merge, a deployment, a tag or a closed PR.

---

## A. Source HEAD and PR

| Item | Value |
|---|---|
| Previous PR head | `30012dbfcc2b257999c9b1dfc462c042b8220742` (#190, draft) |
| Phase 22D head | the commit containing this file — see §H |
| Failing run that defined the mission | [43792415789](https://github.com/uddieee33-blip/Sornio/actions/runs/43792415789) |
| Validation runs of this work | [43823414860](https://github.com/uddieee33-blip/Sornio/actions/runs/43823414860) (`7603e8e`), [43824371382](https://github.com/uddieee33-blip/Sornio/actions/runs/43824371382) (`6ebe779`), [43826193212](https://github.com/uddieee33-blip/Sornio/actions/runs/43826193212) (`aafa4a5`), [43826193202](https://github.com/uddieee33-blip/Sornio/actions/runs/43826193202) (`aafa4a5`), [43827276040](https://github.com/uddieee33-blip/Sornio/actions/runs/43827276040) (`3e93f54`), [43827276076](https://github.com/uddieee33-blip/Sornio/actions/runs/43827276076) (`3e93f54`) |

---

## B. Root cause of the Save-dialog defect

The brief said: *"the retail backup Save dialog succeeds before the restart; the
purchasing Save dialog fails after restarting"*. **That is not what the recorded
failures show**, and the difference decides the fix.

Re-reading all ten Windows failures by caller line rather than by exception type:

| Run | Fails at | Caller | Stage at that moment |
|---|---|---|---|
| 43759908030 | `pick_native_file:484` | `check-native.py:1050` | purchasing export |
| 43763847246 | `pick_native_file:484` | `check-native.py:1050` | purchasing export |
| 43766147809 | `assert_stock:213` | `:938` | before the export, on a UI stock string |
| 43766726752 | `assert_stock:213` | `:977` | before the export |
| 43768285117 | `assert_stock:213` | `:977` | before the export |
| 43771459825 | `assert_stock:213` | `:986` | before the export |
| 43777130146 | `pick_native_file:526` | `:1050` | purchasing export |
| 43781963670 | `pick_native_file:554` | `:1050` | purchasing export |
| 43786929707 | `pick_native_file:570` | `:1050` | purchasing export |
| 43792415789 | `pick_native_file:570` | `:1050` | purchasing export |

Three facts follow, and each one changes a conclusion the previous report made:

1. **The purchasing request was never "incomplete".** The argument at `:1050` is
   fully formed; the dialog never returned. No product code runs until it does,
   because `export_local_backup` calls `rfd::FileDialog::save_file()` and only a
   returned path reaches `Store::export` → `publish()` → `persist_noclobber`.
2. **The restart is not the cause.** `:1050` ran in the same process as the
   retail export; the app had been relaunched several times before it and other
   dialogs after those relaunches had worked.
3. **The retail export never "succeeded" in any run that reached the purchasing
   stage in the current flow.** The only retail successes on record are from the
   Windows release-gate runs of 2026-11-01 (`e891048`, `e911af1`), which
   predate the Phase 22 purchasing block entirely. Between 43766147809 and
   43827276040 the flow failed *before* the retail export on the UI-stock
   assertion that Phase 22C later removed — so the purchasing stage had not
   executed since it was written.

**The mechanism that fits every observation.** `sornio-business.sorniobackup`
is the dialog's default name (`main.rs:1030`, `set_file_name`). A save dialog
whose request already names an existing file raises a *confirm file replace*
modal, and a modal owned by the file dialog swallows every later click on its
parent. The recorded history already contains the raw material: the runner
demonstrably does not always accept the typed filename
(`docs/reviews/windows-release-gate-2026-11-01.md`: default name, a
false-positive UIA write, and a mangled `C:\Users\RUNNER.sorniobackup`), so a
press with an unverified field lands on an existing `Documents\sornio-business.sorniobackup`
left by an earlier run in a cached profile or by the retail export, and the
question is never answered. "Six attempts, six presses, dialog still visible" is
exactly what that looks like, and no amount of re-resolving or re-clicking can
resolve it.

**What is *not* claimed.** The artifact archive that would show the dialog's
caption and the modal's identity during the failure is served from
`productionresultssa*.blob.core.windows.net`, which this sandbox cannot reach, so
the replace-prompt mechanism is inferred from the traces and the repository's own
earlier measurements, not photographed at the moment of failure. The new driver
records that evidence on the next failure (`dialog-evidence.jsonl`, §C).

---

## C. Reproduction and correction

### A defect this session introduced, found and repaired

The first version of the new driver added a fallback in `find_filename_edit` —
"the first `Edit` control in the dialog" — for when the titled field is not
found. On a real Windows Save dialog that control is the address or search box.
Text typed there reads back exactly as requested, so the driver reported a
*verified* entry, pressed Save, and the dialog closed on its own default name.

Run 43827276040 is the evidence: it failed **18 seconds into the fixture**, at
the **retail** export's caller line (`:532`), with no purchasing on screen. The
retail export had worked in 43792415789 with a driver that only ever addressed
the titled field. A part of the run that worked stopped working exactly when
this fallback appeared; the regression was mine, and the trace named it.

The selector is now closed: four titled variants (`File name:`, `File name`,
`File &name:`, `Name:`) and automation id `1001`. Nothing is inferred from
position. A dialog whose field cannot be identified is recorded
(`field_missing`, `field_selector`) and treated as a harness failure with
evidence, never a blind write. Two tests pin it.

### The driver, and why it is a module

`apps/desktop/native_dialog.py` + `apps/desktop/test_native_dialog.py` (15 tests,
no Windows, ~20 s):

| Behaviour | Correction |
|---|---|
| Unverified filename | Entry retried up to 3× with slower keystrokes; only UIA read-back counts; `require_verified_entry` refuses to press at all |
| Replace prompt | Any unidentified `#32770` with an affirmative button is recorded and answered before the parent is pressed again |
| Stale handle | Live window re-resolved by title **and** visibility before every attempt; newest match driven |
| Blind retries | Dialog polled until gone after each press; the function cannot return while one is visible |
| "It timed out" | `DialogEvidence` per attempt: handle, class, title, pid, owner, foreground, requested path, selector used, whether the field accepted it, every visible window |
| Silent fallback | The old `driven=False` "the app saved to its own default" path is deleted |

### The regression the task asks for

In the run (`check-native.py`): `export → export again → restart → export → open`,
each step asserting its own archive on disk, three distinct archives required.
Underneath, in the store: `phase22_reliability_tests.rs` →
`backup_export_survives_a_process_restart_and_restores_the_purchasing_ledger`
(partial receipt with 0.250 damaged, export, refused re-export to the same path,
workspace dropped and reopened from disk, export again, both archives preview,
payable 7500, stock 1750). **Both profiles of that test pass on macOS and
Windows** (§H).

Two defects in that test were found by running it, and both were the test's
fault, not the product's: an empty supplier id (`InvalidSupplier`, run
43824371382) and `"approved"` where the store's vocabulary is `"approve"`
(`InvalidPurchaseOrder`, run 43826193202). Both are fixed and commented.

---

## D. Windows installed-app acceptance

**PASS in the last run that reached it** for every scenario up to the export —
supplier create/archive/restore, PO create/submit/approve, partial receiving with
damage excluded (₹75.00), **restart mid-lifecycle recovering ₹75.00 exactly once**,
invoice with variance (₹80.00), partial payment (₹50.00 → ₹30.00 in the current
script), supplier return (₹25.00), full receiving (₹125.00), close, second
restart (₹125.00, Closed).

**NOT RUN after that**: full settlement to ₹0.00, encrypted purchasing export,
restore, preserved-data validation. They sit behind the export that no run has
completed.

One figure in this script was wrong and is corrected: the post-restart stage
demanded ₹75.00 after the ₹5.00 invoice variance had already made the statement
read ₹80.00. It now re-asserts the figure the product displayed before the
restart and pins the accounting that follows (80.00 → 50.00 → 25.00 → 125.00 → 0).

---

## E. Authoritative SQLCipher database audit

Authored in Phase 22C, never executed. Reading it against the product shows it
**could not have passed**, for reasons independent of the dialog:

| Defect | Consequence | Correction |
|---|---|---|
| Expected rice stock 2.5 pcs (1.000 + 1.500) | The script's own retail assertions read 4 → 2.75 → 2.00 → 1.75 → 1.50 before purchasing, and the preserved-data stage reads 3.0 after reinstall. The audit would have failed a correct product. | `OPENING_RICE_MILLI = 1500`, `EXPECTED_RICE_MILLI = 3000` |
| Supplier balance read by the Rust field name, not the wire name | The first supplier assertion aborts the audit before any financial check | reads `balancePaise` / `overduePaise`; the contract test forbids the snake-case keys |
| Restore phrase regex invented | The phrase lives inside the encrypted archive; the store never holds it | the store's provable claim is used: `restore_committed` exists, `backup_id` is 64-hex, `created_at > 0` |

Exactly-once is now asserted where the ledger can prove it: unique operation ids,
ledger kinds in order `receipt, invoice, payment, return, receipt`, damage on
exactly one receipt and never above the received quantity, the return naming the
receipt it reverses, and the order line naming the reconciled product.

**Scheduling.** The step is `if: always()` — a GUI failure no longer skips the
persisted-state audit; the job still fails on the GUI step, the audit still fails
on its own status, `continue-on-error` is forbidden by contract test, and a
BLOCKED audit reports `checksNotRun` item by item. This was observed working in
run 43824371382: step 23 failed first and step 24 still executed.

`test_acceptance_contracts.py` (12 tests) pins the arithmetic in both directions.

---

## F. Backup and restore evidence

| Claim | Established by | Status |
|---|---|---|
| Archive is encrypted, ≥ 4096 bytes, no plaintext secrets | installed-app stage, earlier runs | PASS (2026-11-01 gate) |
| A second export never overwrites the first | `persist_noclobber`; Rust regression | **PASS** (macOS + Windows, §H) |
| Export works after a restart | Rust regression (same sequence at store level) | **PASS** (§H) |
| Same sequence through the real dialogs | `check-native.py` regression | **NOT RUN** (blocked at the retail export in 43827276040) |
| Wrong passphrase refused | installed-app stage | PASS (earlier runs) |
| Restore returns the workspace | installed-app stage + audit re-read | **NOT RUN** in the current flow |

---

## G. macOS acceptance findings

The probe now separates two permissions the earlier report ran together:

| Probe | Question | Field |
|---|---|---|
| `get UI elements enabled` | can System Events automate at all | `accessibilityGranted` |
| `AXIsProcessTrusted()` | may **this process** drive another app's UI | `accessibilityGrantedToProcess` |
| both | is a driver authorable here | `driverFeasibility` |

**Measured at `3e93f54` (run 43827276076):**

```
status=BLOCKED installation=PASS launch=PASS deviceKey=PASS encryptedAtRest=PASS purchasing=BLOCKED
"the runner reports Accessibility for System Events and process trust for this probe,
 so a driver is authorable, but none is implemented in this repository yet"
```

So the remaining macOS work is **authoring a driver**, not waiting for hardware —
reported as such, and purchasing stays BLOCKED. The earlier claim that hosted
runners cannot grant Accessibility is withdrawn for the second time and with the
narrower measurement that decides it.

---

## H. Results by SHA

### Local (this sandbox — no `cargo`/`rustc`, so no Rust result is claimed here)

| Check | Command | Result |
|---|---|---|
| Desktop Python contracts | `python -m unittest discover -s apps/desktop -p "test_*.py"` | **47 tests PASS** |
| Dialog driver contract | `... -p test_native_dialog.py` | **15 tests PASS** |
| Acceptance contracts | `... -p test_acceptance_contracts.py` | **12 tests PASS** |
| Windows release identity | `node scripts/verify-windows-release.mjs` | **40 checks PASS** |
| Desktop contract | `node scripts/verify-desktop-contract.mjs` | **38 checks PASS** |
| Local schema | `npm run verify:local-schema` | **146 checks PASS** |

### CI

| Check | SHA | Run | Status |
|---|---|---|---|
| macOS native tests (debug + release) | `3e93f54` | [43827276076](https://github.com/uddieee33-blip/Sornio/actions/runs/43827276076) | **PASS** — includes the new restart-export regression |
| macOS installed probe | `3e93f54` | same run | install PASS, launch PASS, deviceKey PASS, encryptedAtRest PASS, **purchasing BLOCKED** |
| Windows native tests, debug profile | `3e93f54` | [43827276040](https://github.com/uddieee33-blip/Sornio/actions/runs/43827276040) step 12 | **PASS** — 316 tests, 0 failed |
| Windows native tests, release profile | `3e93f54` | same run, step 13 | **PASS** |
| Windows dialog driver contract | `3e93f54` | same run, step 21 | **PASS** |
| Windows native-check forwarding | `3e93f54` | same run, step 22 | **PASS** |
| Windows installed-app acceptance | `3e93f54` | same run, step 23 | **FAIL** — retail export produced no success message within 60 s (the defect in §C, introduced by this session) |
| Windows store audit | `3e93f54` | same run, step 24 | **FAIL** — ran, as scheduled; blocked because the app left no reconciled workspace |
| Windows native tests at the pre-fix head | `aafa4a5` | [43826193212](https://github.com/uddieee33-blip/Sornio/actions/runs/43826193212) | FAIL — the test's own `"approved"` bug, fixed in `3e93f54` |
| macOS at the pre-fix head | `aafa4a5` | [43826193202](https://github.com/uddieee33-blip/Sornio/actions/runs/43826193202) | FAIL — same test bug |
| Windows at `7603e8e` | `7603e8e` | [43823414860](https://github.com/uddieee33-blip/Sornio/actions/runs/43823414860) | FAIL — same test bug (store suite) |
| macOS at `7603e8e` | `7603e8e` | [43823414917](https://github.com/uddieee33-blip/Sornio/actions/runs/43823414917) | native tests PASS; installed probe BLOCKED for purchasing |

---

## I. Remaining failures and blocked gates

| Gate | Status | Exact reason |
|---|---|---|
| Windows installed-app acceptance | **FAIL** | retail export: dialog closes, no "Encrypted backup saved and verified." within 60 s. Cause identified in §C; correction in the same tree; not yet re-run |
| Windows purchasing export / settlement / restore / preserved data | **NOT RUN** | behind the retail export |
| Authoritative store audit | **FAIL (BLOCKED reason)** | no reconciled workspace to audit; it runs, keeps its status, and names what it could not check |
| macOS purchasing GUI | **BLOCKED** | both Accessibility permissions are present; no driver is authored |
| Signed consumer distribution | **BLOCKED** | no signing identity in CI (unchanged) |
| Physical printer/scanner/power loss, real version upgrade | **NOT RUN** | hardware / not in scope (unchanged) |

---

## J. Phase 23B staging readiness

**Not ready.** The Windows installed-app acceptance is still red, and the
authoritative audit has not yet been able to execute against a reconciled
workspace. Phase 23B staging should wait for one green Windows run of steps 23
and 24 at a single SHA.

This report does not merge, deploy, tag or close anything. #190 stays a draft;
the superseded PRs stay open; v0.3.0 is not tagged. Those need separate approval.
