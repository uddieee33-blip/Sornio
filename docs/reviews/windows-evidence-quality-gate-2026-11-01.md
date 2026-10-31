# Windows engineering evidence gate — 1 November 2026

**Decision:** real-shop pilot **NO-GO**. This review adds consistency checks to existing Windows acceptance; it does not provide new installed-Windows evidence.

## Baseline

- Parent: draft PR #131, head at branch creation c4777a1f1b077b9c1419b3d1722c30ffd841f3c4.
- Main: 97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6.
- Exact-parent Actions: Windows [41211503154](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41211503154), browser [41211503143](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41211503143), core [41211503150](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41211503150).
- All returned exact-parent jobs had failure conclusions **before test steps**, with steps=null and logs_url=null. This does not diagnose the runner-start cause or prove a code failure.
- Separate Linux native results are documented on PR #131. Those are not Windows acceptance.

## Added coverage

A Python validator checks the **same artifact that the installer lifecycle test actually installed** by comparing its SHA-256 to captured metadata. It rejects:

1. Missing or multiple NSIS review installers.
2. Missing, malformed or inconsistent lifecycle JSON.
3. Acceptance marked only "started-not-passed".
4. Any required offline/uninstall/reinstall lifecycle check not equal to "passed".
5. Missing or undecodable native PNG screenshots for first setup, cash receipt, closing, and preserved-data reopen.
6. Any premature claim that a true version upgrade, WebView2-absent installation, or physical peripheral/power-loss test has been executed under the current contract.

The lifecycle script records "passed" **only after its existing native fixture, uninstallation, same-version reinstall and final preservation checks complete**. A failed earlier step leaves the artifact at "started-not-passed".

The validator writes dist/native-review/windows-evidence-verification.json with checksums and explicit scope. It deliberately reports consumerPilotDecision: blocked even when its **engineering** evidence passes. It does not authenticate the image subject, independently verify a screenshot was captured on genuine Windows hardware, prove signing, or certify real-shop usability.

## Executed local verification

The new eleven Python synthetic regression tests passed on the authoring environment. They validate the evidence checker itself using a fake installer, generated images, and dummy lifecycle metadata. Two additional tests exercise the command-line entry point, require a blocked pilot decision on success and ensure a failure cannot generate a success JSON artifact. **They do not execute a Windows installer, native Rust tests or any shop workflow.**

Reproduce:

python -m unittest discover -s apps/desktop -p test_windows_evidence.py -v

The Windows workflow runs this unittest after installing its existing Python dependencies and runs the validator after native lifecycle acceptance. The current GitHub Actions runner-start failure remains an external blocker until actual steps are recorded.

## Remaining mandatory gates

- Restore working Windows and browser CI on the exact PR head; distinguish account/infrastructure problems from source problems.
- Build and install the actual offline Tauri application on supported Windows.
- Test a **true previous-version-to-current-version upgrade**, not merely same-version reinstall.
- Check installer behavior without a preinstalled WebView2 runtime.
- Exercise a physical thermal/A4 printer and low-end shop PC, or explicitly limit the supported release scope.
- Reproduce and correct the cash-plus-customer-credit mixed settlement problem in the native financial transaction.
- Complete native first-use onboarding and financial/tax invoice semantics before shop release.
- Evaluate comprehension and task completion with genuine users comfortable in Punjabi, Hindi and/or English; automated UI tests are not a substitute.

**No main merge, production migration, business data access, deployment, account changes, or release approval is authorized by this review.**
