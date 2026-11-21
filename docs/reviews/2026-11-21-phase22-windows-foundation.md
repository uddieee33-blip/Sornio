# Phase 22 Windows financial foundation — engineering verification

**Windows execution resumed on November 21.** GitHub assigned runner 1000002753 to [Windows job 136865393129](https://github.com/uddieee33-blip/Sornio/actions/runs/44910600711/job/136865393129) on commit `d6ac1a4c71cd6df96b187f155fe0bc42583da03e`. The local matrix below records verification available before that job finished. Consult PR #199 and its linked jobs for the installed-app verdict. The account annotation below describes the November 19 attempts.

## Source and provenance

| Item | Verified value |
| --- | --- |
| Repository and branch | `uddieee33-blip/Sornio` · `repair/windows-foundation-ci-20261119` |
| [Integration PR #198](https://github.com/uddieee33-blip/Sornio/pull/198) | Open, head `98d285cba1aa244c17b3264755dc986ed98eed74`, base `1cc5c798d1eada9a16463213b0776c01e99d36f9` |
| [Corrective PR #199](https://github.com/uddieee33-blip/Sornio/pull/199) | Open draft targeting the #198 head. Starting head `e4cb278ec3c01d29cd2411a0f851e44c1b1175e4` contains the integration commit. |
| Implementation in this report | `c6473faf1d4a005e20fc806149c10a97bdba36bd`, tree `82b059e7fe6ecfe07c1732f660a4218595acb5dd`. Git's local tree hash matched the GitHub tree. Commit `d6ac1a4c71cd6df96b187f155fe0bc42583da03e` added the initial report only. |
| Independent execution | Linux x86_64, Rust/Cargo 1.100.0, Python 3.12.14, Node 24.22.3, npm 11.19.1. Shared production Rust code, financial posting, migrations and credential storage have no source changes in this repair. |

## GitHub runner admission

The public REST API returned `visibility=public`, `archived=false` and `disabled=false`. On the starting repair head, all five runs were attempt 1 and all seven jobs concluded `failure`. Every job had `runner_id=0`, an empty runner name and `steps=[]`. All were created at 13:26:46 UTC on November 19. GitHub's check annotations on **each job** identify recent failed account payments or a spending limit. The annotation does not disclose which applies. Repository Actions permissions, workflow-permission settings and runner inventory returned HTTP 401 through the public API. No account billing values were available.

| Run | Job | Runner request | Time to conclusion |
| --- | --- | --- | --- |
| [Windows](https://github.com/uddieee33-blip/Sornio/actions/runs/44533513955) | [local-windows](https://github.com/uddieee33-blip/Sornio/actions/runs/44533513955/job/135592777709) | windows-latest | 2 s |
| [Browser](https://github.com/uddieee33-blip/Sornio/actions/runs/44533513903) | [browser](https://github.com/uddieee33-blip/Sornio/actions/runs/44533513903/job/135592777314) | ubuntu-latest | 2 s |
| [CI](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514183) | [Historical SQLCipher compatibility](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514183/job/135592778401) | ubuntu-latest | 2 s |
| [CI](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514183) | [Dependency audit](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514183/job/135592778929) | ubuntu-latest | 2 s |
| [CI](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514183) | [Lint, types, build](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514183/job/135592781607) | ubuntu-latest | 3 s |
| [macOS](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514101) | [macos](https://github.com/uddieee33-blip/Sornio/actions/runs/44533514101/job/135592778540) | macos-latest | 2 s |
| [PostgreSQL](https://github.com/uddieee33-blip/Sornio/actions/runs/44533513994) | [Real PostgreSQL concurrency](https://github.com/uddieee33-blip/Sornio/actions/runs/44533513994/job/135592779911) | ubuntu-latest | 2 s |

The Windows, CI and macOS workflows set distinct concurrency groups and disable in-progress cancellation. The browser and PostgreSQL workflows have no concurrency group. The PR base matches the branch filters and GitHub created the jobs. macOS also carried an arm64 capacity notice. The common account annotation explains the pre-execution failures across all three operating systems. Job records and annotations are independently retrievable at `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` and `GET /repos/{owner}/{repo}/check-runs/{job_id}/annotations`.

Earlier runs on #198 *did* obtain runners. The [Linux browser job](https://github.com/uddieee33-blip/Sornio/actions/runs/43866309838/job/133295642912) reported Rust E0433 at the unconditional device module reference. The [Windows job](https://github.com/uddieee33-blip/Sornio/actions/runs/43866309734/job/133330756898) reached the installed fixture, failed to focus Export after 600 Tab presses, and separately failed its purchasing audit. That evidence belongs to #198.

## Checks after runner admission resumed

All seven jobs on `d6ac1a4` obtained hosted runners. [Dependency audit](https://github.com/uddieee33-blip/Sornio/actions/runs/44910600727/job/136865393220), [historical SQLCipher compatibility](https://github.com/uddieee33-blip/Sornio/actions/runs/44910600727/job/136865393351) and [PostgreSQL concurrency](https://github.com/uddieee33-blip/Sornio/actions/runs/44910600704/job/136865392987) passed. The [general CI job](https://github.com/uddieee33-blip/Sornio/actions/runs/44910600727/job/136865393425) passed lint, lockfile verification and both type checks. It stopped at `verify:desktop-copy`. The original local umbrella verification was run before the final UI label edit and missed this failure.

The checker treated the order-line value `Sample native rice (NATIVE-RICE)` as static product copy. The repair in `scripts/verify-desktop-copy-contract.mjs` renders the literal cell template from SupplierPanel using the product name and SKU actually entered in the installed fixture. On the corrected tree, the checker accepted all 423 UI expectations and full `npm run verify` passed. In a separate negative-control checkout, changing the expected SKU to `WRONG-SKU` reproduced the failing checker result. The installed UI still requires the actual rice/SKU cell.

On `e97952348fe114d5d7b23f15e7881d884bc4588c`, all three [CI jobs](https://github.com/uddieee33-blip/Sornio/actions/runs/44911672248), [browser](https://github.com/uddieee33-blip/Sornio/actions/runs/44911672249), [PostgreSQL](https://github.com/uddieee33-blip/Sornio/actions/runs/44911672324) and [macOS](https://github.com/uddieee33-blip/Sornio/actions/runs/44911672270) passed.

## Installed Windows evidence and dialog repair

[Windows job 136865393129](https://github.com/uddieee33-blip/Sornio/actions/runs/44910600711/job/136865393129) on `d6ac1a4` passed debug and release Rust, the Windows credential vault and restart suite, the scale workload, PowerShell forwarding and the NSIS build. The unsigned installer SHA-256 was `ce9296d81390b4fba47c6c4b73e857b37a4fd00790dfe2254dc92e86ea7cf9e7`. The installed executable started, created and unlocked its isolated workspace, posted the offline cash and credit sales and reopened with ₹53.13 cash, ₹31.88 credit and 2 pieces in stock.

The first export saved an encrypted file through the keyboard fallback. The second opened the expected Save window, but filename discovery returned no edit control and the driver submitted the default name. The captured Windows **Confirm Save As** prompt explicitly names the first archive and asks to replace it. The driver stopped with the modal still open. The independent audit reached the real device-backed store, found zero of the expected one supplier and exited nonzero. Purchasing, mixed tender, restored purchasing balances and reinstall had not yet been reached. [Download native screenshots, installer digest, diagnostics and audit](https://github.com/uddieee33-blip/Sornio/actions/runs/44910600711/artifacts/14711416602). The downloaded ZIP SHA-256 was `095d96d160fc37893c1f54afb8bf0d470980ae179b85acded15e7bb4448a5baa`.

The dialog driver had called WindowSpecification methods on an already resolved UIA wrapper. An inaccurate test double implemented both interfaces. The correction enumerates visible, enabled Edit descendants with the filename label or automation ID, scopes dialogs to the installed process, and requires exact keyboard read-back before Save or Open. Each export requires a fresh destination and verifies that the archive named by the product is that exact file. Strict mode leaves overwrite prompts untouched. The installed run now captures activation method, dialog identity and field read-back in `native-dialog.jsonl`. An initially offscreen Export button is brought into verified keyboard focus before requesting its real Invoke pattern. All 57 local Python contracts passed, including strict overwrite refusal and filename lookup on a wrapper without specification methods. These contracts do not establish a Windows acceptance pass.

## Repair and regression coverage

| File | Correction or verification |
| --- | --- |
| `packages/local-store/examples/cashier_review_bridge.rs` | Applied the formatter to the existing conditional Linux refusal. Linux all-target compilation passed. With device mode selected on Linux, the executable returned 3 and created neither a device directory nor a fixture database. The Windows/macOS path still uses the device credential provider. |
| `apps/desktop/check-native.py` | All four export attempts now enter fresh Owner and recovery credentials. The previous second attempt skipped this after BackupPanel cleared its fields, leaving Export disabled. Each attempt uses the visible, enabled UIA button or the existing verified keyboard fallback, waits for the native Save dialog, and verifies the UI-reported archive on disk against its SHA-256. The restart sequence requires three distinct files and opens the third through the OS dialog. Purchasing records the product-reported path, backup ID and digest. The order fixture selects rice by keyboard text and checks the rendered rice SKU before submitting. The earlier first-item selection could select ghee after the mixed-tender fixture added it. |
| `apps/desktop/native_activation.py` and `test_native_activation.py` | Reviewed the existing #199 implementation and ran all five contracts. It requires a visible and enabled control and issues a genuine UIA Invoke. Its caller first waits for existence. Keyboard fallback rechecks visibility, enabled state and actual focus before pressing Space. Windows dialog observation remains open. |
| `apps/desktop/check-purchasing-store.py` | Corrected the ₹100 unit cost to 10,000 paise and checked the actual store kinds: goods_received, invoice_variance, payment, return_credit, goods_received. Row reconciliation runs even if the GUI stopped before exporting. Full success now also requires the restored database's backup ID and the archive digest to match the UI export receipt. Missing evidence returns a nonzero result. |
| `apps/desktop/check-purchasing-audit-regression.py` | Creates a disposable encrypted store, writes actual purchase transactions, exports, settles, restores and reopens. Exercises the same row and recovery assertions used by the installed audit, plus missing receipt, wrong digest and wrong backup ID. The installed audit always opens its workspace through device mode. |
| `.github/workflows/windows-local.yml` | Runs the audit regression and acceptance contracts. The independent persisted audit retains `if: always()`, passes the recorded export receipt and terminates with `exit $LASTEXITCODE`. The obsolete trailing PowerShell arguments are absent. |
| `apps/desktop/test_acceptance_contracts.py` | Guards every installed-harness Export against skipping credential entry. |
| `apps/desktop/check-backup.cjs` | Verifies that export clears all three fields, disables the button, and enables it after re-entry. A second real store request against the browser fixture's fixed destination must refuse overwrite and preserve the original bytes. |
| `apps/desktop/check-ui.cjs` | Restricted the draft revision check to draft operations and scoped the conflict assertion to the local-storage alert. Previously an unrelated supplier read produced a second copy of the same draft-conflict alert. |
| `apps/desktop/check-suppliers.cjs` | Exercises keyboard selection with ghee sorting ahead of rice. Waits for the invoice reference in a visible statement row after a return. The immediate count could sample the UI before the statement refreshed. |

## Execution results

| Check | Result | Evidence |
| --- | --- | --- |
| Python driver and evidence contracts | PASS | 55 tests: 5 UIA activation, 17 Save/Open dialog, 13 acceptance contract, 4 install-data and 16 Windows-evidence tests. |
| PowerShell audit and CI exit handling | PASS on Linux | PowerShell 7.7 parsed and executed the actual workflow step against an empty disposable profile. Python wrote BLOCKED and the shell returned 1. All 49 repository workflow-wrapper success/failure cases passed. Actual positive installed audit execution remains a Windows gate. |
| TypeScript and repository integrity | PASS locally after the copy-check correction | Root standard and native typecheck, ESLint, Next production build, desktop TypeScript/Vite build, 20 allocation/receipt/scan tests, full `npm run verify`, both native lockfile checks, Rust formatting for both manifests, and Git integrity checks. Includes 146 local schema checks, 38 desktop contracts and 12 money contracts. |
| Linux Rust debug and release | PASS | Each profile: 315 library, 2 compatibility and 8 example tests passed, 0 failures and 8 ignored in the default invocation. Includes rollback at intermediate writes, exact retry, mixed tenders, credit/RBAC, supplier receipts and returns, migrations and encrypted restore. Four pre-existing unreachable-pattern warnings in the fixture dispatcher. |
| Historical encrypted upgrade | PASS | Built the fixture writer at `614bd29a565427e5c0588dbe9719f34a37ee403a`: SQLCipher 4.6.1 / SQLite 3.46.1 / v22. Current build measured SQLCipher 4.20.0 / SQLite 3.54.1 / v23. The compatibility suite reopened a copy, checked financial rows and balances, rejected a wrong key and retained the original fixture bytes. |
| Purchasing audit regression | PASS | The five real ledger effects in paise were +7500, +500, −3000, −2500, +10000. The payable reached zero after settlement. Restore and reopen returned 12,500 paise and 3,000 milli-units of rice. A missing receipt returned BLOCKED. Incorrect digest and restore ID independently failed. |
| Crash and acknowledgement | PASS | 386 supplier payments, 78 forced process terminations, −38,600 paise closing balance. Exact retry and balance reconciled after every operation in a 60.6-second session. |
| Native financial workload | PASS | 5,000 products, 10,000 customers, 50,000 invoices, 1,000 suppliers and 5,000 purchase orders. Cash, stock, balanced invoice journals and absence of draft-order debt reconciled after reopen and encrypted restore. Separate 1,000-product/customer/invoice fixture passed its damaged-return replay, cash and inventory checks. |
| Linux browser acceptance | PASS | All 13 desktop suites passed, including checkout, receipts, purchasing, authorization, customer credit, settlement, recovery and keyboard focus. The workspace suite passed for eight portals. Browser contracts use the repository's mix of UI-only fixtures and real native/SQLCipher integration. Playwright 1.62.1 used its matching Chrome headless shell. Full Chromium was denied a process-singleton socket by this host. A first local backup invocation used a directory for a screenshot file argument and failed at screenshot capture. The corrected invocation completed the restore and restart. |
| Replication and dependency gates | PASS | Disposable PostgreSQL 16: 71 ingest/concurrency checks, 123 native-envelope HTTPS checks, Rust envelope export and acknowledgment tests. npm high-severity thresholds passed (10 moderate root findings, zero desktop findings). cargo-audit 0.22.2 returned 0 on both lockfiles with one store warning and four desktop warnings. |
| Windows-only PowerShell forwarding contract | BLOCKED locally | The test builds a `python.cmd` fixture. On Linux, PowerShell selected the installed Python interpreter and the attempted native driver import failed at pywinauto. Run the existing test under Windows. |
| Windows native debug/release, NSIS build/install and installed UI | BLOCKED on the local host | The seven November 19 jobs executed zero steps. This local host is Linux. No new installer manifest, WebView2/vault unlock, OS dialog capture, installed transaction audit or reinstall evidence was produced here. |

## Reproduction and remaining gate

Begin on the #199 repair branch. Use the locked dependencies and disposable workspaces. The native library and audit tests can be reproduced on Linux with the commands below. The CI workflow contains the historical writer, browser, workload and PostgreSQL commands.

```sh
npm ci
npm ci --prefix apps/desktop
python -m unittest discover -s apps/desktop -p 'test_*.py'
npm run typecheck && npm run typecheck:native && npm run lint && npm run build
npm run build --prefix apps/desktop && npm run test:split-payments --prefix apps/desktop
npm run verify && npm run verify:cargo-lock
cargo fmt --manifest-path packages/local-store/Cargo.toml -- --check
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo test --locked --all-targets --manifest-path packages/local-store/Cargo.toml
cargo test --locked --release --all-targets --manifest-path packages/local-store/Cargo.toml
cargo build --locked --example cashier_review_bridge --manifest-path packages/local-store/Cargo.toml
python apps/desktop/check-purchasing-audit-regression.py --bridge packages/local-store/target/debug/examples/cashier_review_bridge
```

1. Hosted admission has resumed. If a future job again has runner ID zero and the same annotation, the account owner can inspect **Billing & plans** or provide the job ID to GitHub Support. An admitted, executing job requires no billing intervention.
2. Follow the automatically triggered **Windows local workspace** job for `repair/windows-foundation-ci-20261119`. Confirm the source SHA, a nonzero runner ID and executed steps. An alternative is a clean, disposable Windows machine with an interactive desktop and the workflow's toolchain. Run the steps of `.github/workflows/windows-local.yml` in order from that checkout, under the same Windows account. The installer script requires an empty review profile, WebView2 and rights to set the temporary outbound firewall rules.
3. Retain the debug and release Rust results, installer and executable hashes, launch/unlock and offline cash/credit/split/stock evidence. Require the three distinct verified exports and real Open dialog, the purchasing result, and the persisted SQLCipher audit with its archive hash and restore ID. Check the installer lifecycle report for stopped-data preservation through uninstall and same-version reinstall. A successful local fixture cannot supply any of these Windows artifacts.
4. Review **Sornio-Local-Native-Captures** and **Sornio-Local-Workspace-Review** for that run before changing the acceptance verdict. Physical printer/scanner, physical power loss, cross-version installer upgrade and installation on an offline machine missing WebView2 have separate coverage and remain untested here.
