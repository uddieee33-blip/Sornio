# Sornio master engineering execution — 31 October 2026

**Decision: suitable for controlled internal testing with synthetic data. NO-GO for a real-shop pilot or commercial rollout. No merge or release is approved by this report.**

This is a fresh repository inspection and engineering increment, not a claim that the full master assignment is complete. Native tests, JSON command tests, browser tests, installed Windows acceptance and physical hardware evidence have different scopes. Their results must not be substituted for each other.

## A. Executive engineering summary

The integrated desktop source has a substantial native financial core: transactional billing and stock, persistent operation identity, staff permissions, customer credit, manual digital-payment reconciliation, returns, closing and encrypted recovery. These features are largely absent from current main. The active integration remains draft PR #130.

The confirmed defect corrected here is unconditional restocking on returns. Previously every returned unit increased available inventory, with no way to record damaged or otherwise non-restocked goods. The correction adds a validated disposition to each returned invoice line, commits the disposition with the existing immutable operation, and restores only sellable quantities. Refund eligibility, customer credit, journals, audit and outbox remain in the existing writer transaction.

The work also adds direct tests for refund/repayment and correction/checkout races, simultaneous successful invoice numbering, corrupted encrypted database refusal, legacy request serialization, damaged-return recovery and scale. No parallel ledger, transport, cloud gateway or new database framework was added.

Release-critical gaps remain: current installed Windows evidence, actual version upgrade, full three-step native onboarding, the required cash-plus-credit split workflow, complete statutory invoice integration, operational authenticated LAN transport and physical shop acceptance. These prevent a pilot recommendation even when native tests pass.

## B. Exact repository baseline

Repository: [uddieee33-blip/DukaanOS](https://github.com/uddieee33-blip/DukaanOS).

| Reference | Exact inspected commit | State and engineering decision |
| --- | --- | --- |
| main | `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6` | Current merged baseline; includes #121. Do not restart integration here. |
| #120 | `7e2922430f872acc2f939494e55f8a338099ca3a` | Merged historical baseline. Historical Windows success does not verify the current candidate. |
| #121 | `5e5111e05a2a53bf9d1fd6ea80b2548b2c6ce773` | Merged; native checkout foundation. |
| #122 | `6631eb04efb0cc155d2352113d744ddd2dea748d` | Open; authorization reused through integration, not independently merged. |
| #123 | `e41f88941d7c9fc88905a01adfa15d2c504f55d7` | Open; customer-credit dependency. |
| #124 | `20e36b7a5d94af961d85b1f252769feb6c21cf51` | Open; integrated payment/security dependency. |
| #125 | `69ed5db0106dfa2dbca1d157f98bc9dce0e7b586` | Open; standalone recovery was adapted to combined schemas in #130. |
| #126 | `129fce1ed9c60aaede0228dd5d41097f1580b938` | Open; old standalone transport must not overwrite newer human/device/generation authority. |
| #127 | `345cd2b6d0db2bb4b83769a0d0b0c04ec4e0737c` | Open; GST arithmetic foundation is not integrated statutory invoicing. |
| #128 | `08575a2ed7d17d826bc3961278901164b89b5e2b` | Open; relevant printing work already adapted in integration. |
| #129 | `364f42b2896f19aa070d5d853769d0212e7d9503` | Open; relevant inventory/lifecycle work already adapted. |
| #130 | `6043f52b0d166044766eedf2d5a1e76c8fce7595` | Open draft, mergeable at inspection; correct engineering parent, rechecked before publication. |

#130's tree is `949686eaab3984bac519261674e65bd17d8cfc89`; main's tree is `c1ea1371dc17949d81135fcefab9a12bf52aad72`. A recursive remote tree inspection returned 536 files. Every one of the 146 locally present repository files matched its remote Git blob; none differed before edits. The checkout is partial: 390 remote files are absent locally, including most root web sources and four installer icons. This is not a full local packaging checkout. The desktop, native library, shared domain and relevant workflows are present.

Work branch: `hardening/financial-recovery-audit-2026-10-31`, based remotely on the inspected #130 commit. The accompanying draft change targets `integration/windows-finance-recovery`; it does not merge or replace #130 or main. The published candidate SHA is recorded in that PR's description. Exact tested file hashes are in [source-manifest.json](master-execution-2026-10-31/source-manifest.json).

The local retained checkout has historical checkpoint commits with different SHAs from GitHub. Those local checkpoint SHAs are not represented as upstream commits. Publication uses the verified upstream tree as its base, changing only the reviewed files.

### Initial component findings matrix

PASS means evidence for the stated environment, not global product approval.

| Component inspected | Classification | Evidence and limitation |
| --- | --- | --- |
| React cashier, inventory, customer, staff and recovery panels | PARTIAL | Local services, pending receipts, retry handling and native calls exist. Desktop compiler passes; current browser execution is blocked. |
| Native checkout/inventory writer transactions | PASS, native | Required-row checks, immediate writer transactions, durable receipts, bounded integers and concurrency/failure tests. Windows boundary remains unverified. |
| Payment allocation and digital states | PARTIAL | Cash/UPI/card splits implemented; pending and manual matching remain distinct from provider verification. Cash-plus-credit split is unsupported. |
| Customer credit and collection | PASS, native | Partial/full payments, excess-payment refusal, customer revisions and immutable journals. Complex adjusted-credit returns can deliberately refuse. |
| Returns | FAIL initially; corrected, native PASS | Prior unconditional restocking; dispositions now enforced and persisted. Browser change is not runtime-verified here. |
| Daily closing | PASS, native | Writer-lock cutoff, stale-summary refusal, opening corrections, variance and closing/sale concurrency. |
| Native authorization and business scope | PASS, native | Four roles, direct command denials, current session revisions, generation checks and protected receipt reads. |
| SQLCipher/migrations | PASS, native | Cipher capability required; bad key/corruption refusal, transaction rollback, legacy schema preservation. Windows vault acceptance blocked. |
| Encrypted backup/restore | PARTIAL overall | Native export/restore/kill/full-database tests pass; OS picker, Windows profile recovery and physical media remain untested. |
| LAN authority | PARTIAL | Human/device intersection and generation tests exist; no production peer constructor/listener/pairing UI/wire lifecycle is enabled. |
| Native onboarding/bank/GST details | MISSING required flow | Current setup does not deliver the required owner → business → bank/GST/UPI sequence. |
| Windows installer/runtime/offline lifecycle | BLOCKED | Current Actions jobs never execute. This host has no Windows runtime. |
| Root web build/security migration workflows | NOT TESTED locally | Partial checkout; older web/cloud evidence does not establish current native correctness. |
| Representative scale | PARTIAL | 1,000-product/customer/invoice native scenario measured; 10,000 products exceed the current 5,000-item cap. |
| Printer/scanner/signing/true version upgrade | NOT TESTED | No applicable physical hardware, current installer or signed update chain. |

## C. Work completed and change report

### Confirmed defect and root cause

`payments::return_invoice` previously aggregated every returned line into stock and always emitted `stockRestored: true`. `ReturnLine` had no stock disposition. Neither the native request nor UI could express damaged or non-restocked returns.

`ReturnDisposition` now accepts only `sellable`, `damaged` and `no_restock`. Missing disposition means the historical sellable behavior. Serialization omits that default, preserving previously stored canonical request bytes and exact operation retry identity. Unknown values are rejected at deserialization. Changing disposition while reusing an operation ID conflicts with the stored request.

Every return still records all returned quantities for eligibility and financial reversal. Only sellable lines contribute to available-stock updates, aggregated by product. The committed receipt includes the per-line decisions and an accurate aggregate `stockRestored` flag. This flag means at least one line was restocked; use `returnLines` for mixed returns.

Disposition is retained in immutable `local_retail_ops.request`, the saved receipt and existing outbox. There is **no schema migration**, no rewriting of applied migrations, no deletion of financial rows and no operation-ID replacement. Schema remains **12**. Reconciliation consumers must read the durable disposition: returned quantity alone is no longer equivalent to quantity restored to sellable inventory. This does not create a separate damaged-goods warehouse or disposal/cost-accounting module. An older binary may reject a disposition-bearing pending request; resolve it with the supported version, not a downgrade.

### Files changed

| Files | Purpose |
| --- | --- |
| `packages/local-store/src/payments.rs` | Native disposition contract, selective stock restoration, truthful receipt. |
| `packages/local-store/src/payments_tests.rs` | Compatibility, rollback/restart/replay, mixed-line/property cases, two financial races, invoice-number concurrency and corruption refusal. |
| `packages/local-store/src/recovery/tests.rs` | Encrypted restoration of a completed damaged return, recovering the same receipt without another refund or stock addition. |
| `apps/desktop/src/retail-types.ts`, `RetailPanel.tsx` | Typed per-line condition selection, dirty-state preservation, quote invalidation and explicit return review. |
| `apps/desktop/check-retail.cjs` | Real-native browser scenario now checks a damaged return does not increase sellable stock. Updated but blocked from execution here. |
| `apps/desktop/check-native-scale.py` | Reusable isolated native command/scale/restart/backup test with measured timings and no network dependency. |
| Three relevant Actions workflows | Add the integration target branch to PR checks; run scale/native recovery acceptance on Linux and Windows. No checks are removed or weakened. |
| This report and evidence directory | Baseline, exact source hashes, executed results, failures and release gates. |

The new scale fixture initially used an unsupported industry identifier and then assumed login returned the session object. Both fixture errors were corrected to the actual `general` identifier and explicit `read_local_session` contract. No product validation was weakened. A new replay test initially compared a pre-login audit snapshot to a post-login snapshot; it was corrected to compare immediately before/after replay, while independently asserting persisted stock and money. Initial failures are retained in the evidence notes.

## D. Verification results and financial invariants

### Commands and environments

Fresh Rust 1.99.1, Linux x86_64, real Workspace/SQLCipher, synthetic databases. Local Linux builds used system OpenSSL (`OPENSSL_NO_VENDOR=1`, explicit include/library paths) while retaining bundled SQLCipher. Repository Cargo dependencies/features and Windows vendored-OpenSSL configuration are unchanged. No unencrypted fallback was used.

`PROPTEST_RNG_SEED=20261031`, `RUST_TEST_THREADS=4`, `CARGO_BUILD_JOBS=2` were used for final suites. The fixed seed supports reproduction; it is not exhaustive exploration of arbitrary business histories.

```sh
cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml
cargo test --all-targets --release --locked --manifest-path packages/local-store/Cargo.toml
cargo fmt --manifest-path packages/local-store/Cargo.toml -- --check
cargo build --locked --manifest-path packages/local-store/Cargo.toml --example cashier_review_bridge
python3 apps/desktop/check-native-scale.py --bridge packages/local-store/target/debug/examples/cashier_review_bridge --output native-scale.json
npm run build --prefix apps/desktop
node scripts/verify-business-domain.mjs
node scripts/verify-native-invoice.mjs
node scripts/verify-checkout.mjs
python3 -m unittest discover -s apps/desktop -p test_install_data.py
npm audit --prefix apps/desktop --package-lock-only --audit-level=high --json
```

Targeted ESLint, JavaScript/Python syntax checks, parsing all three changed workflow YAML files, and `git diff --check` were also executed. ESLint retains an existing Next pages-directory configuration notice. Desktop TypeScript and production Vite bundle pass. Root application build/typechecking were not claimed from the partial checkout.

| Check | Result |
| --- | --- |
| Final debug native suite | 183 passed: 177 library + 6 command-security; zero failures. Three ignored worker entries are exercised by passing parent tests. |
| Final release native suite | 183 passed: 177 library + 6 command-security; zero failures. Three ignored worker entries are exercised by passing parent tests. |
| Focused post-fix return/recovery suite | 13 passed, zero failed before the final additional race/number/corruption coverage. |
| Pre-fix payment regressions | 28 passed, 2 expected failures, 1 subprocess worker ignored. Both new failures reject unsupported disposition. |
| Shared domain | Passed; invoice arithmetic, immutable inputs and eight industry definitions. |
| Native request/money contracts | Passed: 45 request fixtures and 13 money fixtures. |
| Checkout display | Passed: exact large balances, negative/zero balances and fractional quantities. |
| Installer preservation helper | 4 passed; tests the helper, not an installed Windows application. |
| Desktop dependency advisory response | Zero reported vulnerabilities in the lockfile audit response. Not proof against all vulnerabilities. |
| Rust advisory scan | cargo-audit 0.22.2: no reported vulnerabilities in 107 local-store or 451 Tauri dependencies; Tauri retains two informational warnings, detailed below. |
| Current browser run | BLOCKED by local socket restrictions; no browser pass or new screenshot claimed. |
| Current Windows acceptance | BLOCKED; no current installer/runtime evidence. |

RustSec advisory database: 1,395 entries, fetched commit `2295466c4e9df26647fd67d8fa1c705ac2fc7f81`, updated 30 October 2026. The second scan reused that database with `--no-fetch`. The Tauri lockfile retains `RUSTSEC-2024-0370` for unmaintained `proc-macro-error 1.0.4` and `RUSTSEC-2024-0429` for unsound `glib 0.18.5` iterator implementations. These warnings were not suppressed. Target-specific reachability was not established; do not interpret the vulnerability count as a clean bill of health for every platform dependency.

Initial local compilation encountered missing retained dependency rlibs; cleaning the affected local build products enabled fresh compilation. A later release link attempt failed with missing local test symbols; a clean rebuild of the local package was performed without changing optimizations, disabling tests or modifying product source. These are recorded build failures, not passing runs.

### Financial invariant matrix

Selectors below are actual Rust test identifiers; abbreviated module paths refer to `packages/local-store/src`. Final native debug/release logs provide their execution evidence. PASS is restricted to that native test environment.

| # | Invariant / implementation | Test identifiers and result | Remaining limit |
| --- | --- | --- | --- |
| 1 | Sale/invoice/stock/ledger/audit/outbox share `billing::post_into` transaction | `billing::reliability_tests::committed_sale_contains_complete_aggregated_records_and_replays_unchanged`; PASS native | Installed Tauri path not current-verified. |
| 2 | Failed posting has no partial effects | `commit_time_failure_rolls_back_invoice_stock_ledger_audit_and_outbox`, `payments::tests::every_return_write_and_audit_failure_roll_back_stock_journals_and_retry`; PASS native | Hardware power-loss semantics remain untested. |
| 3 | Durable IDs prevent duplicate business effects | `billing::tests::simultaneous_exact_retries_post_once`, `payments::tests::damaged_return_refunds_once_without_reintroducing_sellable_stock`; PASS native | No exactly-once network delivery claim. |
| 4 | Local digital records cannot manufacture verification | `payments::tests::split_sale_uses_original_invoice_and_never_verifies_digital_payments`; PASS native | No provider integration; manual match remains separately labelled. |
| 5 | Conditional revision/stock writes prevent overselling | `lan_authority::tests::two_native_clients_competing_for_last_stock_cannot_oversell`, `stock_correction_and_sale_race_never_commits_both_stale_intents`; PASS native | Native peers are synthetic transport evidence. |
| 6 | Cumulative refund/quantity limits | `payments::tests::competing_partial_returns_cannot_restore_or_refund_more_than_was_sold`, `generated_non_restock_returns_preserve_refund_limits_and_stock`; PASS native | Broader commercial return policies not implemented. |
| 7 | Repayment retry cannot collect twice | `customers::tests::prepared_cash_collection_survives_restart_exact_retry_and_acknowledgement`, `simultaneous_collections_cannot_double_collect_a_stale_balance`; PASS native | Real cashier acceptance pending. |
| 8 | Native permission/session checks | `access::tests::every_role_is_enforced_by_native_data_methods`, command-security role denials; PASS native | Windows IPC/runtime boundary pending. |
| 9 | Native business/workspace comparison | `access::tests::scope_and_sessions_cannot_cross_business_databases`; PASS native | Not an audit of all hosted web endpoints. |
| 10 | Restore fences stale authority and preserves completed operation receipts | `recovery::tests::damaged_return_backup_restores_the_saved_result_without_restock_or_refund_replay`, LAN generation restore test; PARTIAL overall | Point-in-time replacement is not reconciliation with an independently retained original. |
| 11 | Hub must be authoritative for shared-shop transactions | `lan_authority::tests::peer_human_scope_permission_and_revocation_are_intersected_on_every_request`; PARTIAL | No enabled production transport, pairing UI or disconnected-client acceptance. |
| 12 | Established local financial session has no internet dependency | File-backed native tests and stdio scale/restart pass; PARTIAL overall | Firewall-blocked installed Windows acceptance is not executed. |
| 13 | Committed finance is immutable; corrections traceable | `billing::tests::posted_records_reject_replace_update_and_delete_after_reopen`, customer journal and recovery audit immutability; PASS native | Restoring an older point preserves newer state in a safety copy; no automatic history merge. |
| 14 | Deterministic bounded money | Shared fixtures, `shared_rounding_vectors`, `cash_variance_preserves_large_integer_values_and_refuses_overflow`; PASS core, PARTIAL invoicing | Generic configured tax rate is not complete statutory GST invoicing. |
| 15 | Unknown response resolved using the same durable ID | `committed_billing_survives_process_exit_relock_unlock_and_exact_retry`, native scale damaged-return restart; PASS native | Updated browser recovery path remains blocked here. |

### Measured native scale

Dataset: 1,000 products, 1,000 customers, 1,000 cash invoices; all synthetic and isolated. The fixture checks invoice pagination, authoritative stock and cash after process termination/restart and identical damaged-return replay, then creates an actual encrypted backup. Command serialization uses real Workspace/SQLCipher; it is not Tauri IPC, browser rendering or physical Windows evidence.

| Measurement on this Linux host | Result |
| --- | --- |
| Create and acknowledge 1,000 products | 2,718.202 ms total |
| Create 1,000 customer profiles | 1,445.521 ms total |
| Post 1,000 invoices, including prepare/post/acknowledge | 4,383.512 ms total |
| Return all 1,000 products across stdio, 30 samples | 19.904 ms median; 28.112 ms maximum |
| Customer search among 1,000, 30 samples | 5.992 ms median; 8.774 ms maximum |
| Cashier state with that history, 30 samples | 20.958 ms median; 29.459 ms maximum |
| Encrypted backup, one sample | 2,225.035 ms; 7,376,896 bytes |
| Settlement export serialization, five samples | 183.889 ms median; 204.173 ms maximum |

These are observed timings, not performance budgets or predictions for modest shop PCs. Other native checks were running on the host. There was no 10,000-product benchmark: the current explicit maximum is 5,000 products, so the requested 10,000-product operating envelope is unsupported.

## E. Unresolved blockers and Windows acceptance report

### Actual Actions diagnostics

For the inspected #130 head, the current returned jobs are:

| Run | Job | Actual result |
| --- | --- | --- |
| [41103335761](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41103335761) | Windows `124225694208` | Failure, `steps=null`, `logs_url=null`; zero artifacts. |
| [41103335905](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41103335905) | Browser `124225694799` | Failure, `steps=null`, `logs_url=null`. |
| [41103335542](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41103335542) | Core `124225694980`, audit `124225694356` | Both failure, `steps=null`, `logs_url=null`. |

The Windows log download returns 404 `BlobNotFound`. Check metadata exposes startup annotation counts, but the connector rejects the annotations endpoint. The current startup annotation's cause could not be independently read. The founder's allowance-renewal report and historical account evidence are not promoted into a verified diagnosis of this run. No code compilation/test outcome can be inferred from an unstarted job. Main reports `protected=false`, with required status-check enforcement off; #130 has no submitted reviews at this inspection. Release protection and independent review remain gates, and no settings were changed. Billing, repository visibility, account permissions and security settings were not changed.

Candidate-head CI status and exact publication references belong to the accompanying PR inspection; these baseline run IDs must not be relabelled as candidate-head results.

Locally, the Playwright browser download failed; an independently obtained Chrome binary started far enough to report that its required local socket could not be created (`Operation not permitted`). The environment's approval policy rejected an escalated launch. No sandbox bypass was attempted afterward. Compiler/native/stdio checks continued. The changed browser regression is registered for execution in an environment that permits browser processes.

| Windows requirement | Status and actual evidence |
| --- | --- |
| Current NSIS installer generation | BLOCKED; no Windows build executed and local checkout lacks icons. |
| Clean installation and installed application launch | BLOCKED. |
| Owner → business → bank/GST/UPI onboarding | MISSING complete native flow. |
| Offline local authentication, sales, credit, returns and closing | PARTIAL: native checks pass; installed firewall-blocked flow unexecuted. |
| Windows Credential Manager, OS lock and fresh-profile recovery | BLOCKED current runtime acceptance. |
| Encrypted local restart | Native PASS; current installed Windows restart BLOCKED. |
| Backup/restore through Windows file dialogs | BLOCKED; native engine tests are separate evidence. |
| Uninstall/reinstall data preservation | Helper PASS; actual lifecycle BLOCKED. Existing script explicitly tests same-version reinstall, not a real version upgrade. |
| Actual upgrade with an existing encrypted shop | NOT TESTED on Windows. Native old-schema preservation tests do not replace this. |
| Installer signature, SmartScreen/update chain | NOT TESTED/current signing strategy incomplete. |
| Genuine current Windows screenshots | None captured. No Linux/browser image is presented as Windows evidence. |
| Printer/scanner, removable media, router/firewall, low-end PC, power interruption | NOT TESTED physically. |

## F. Financial/security/recovery risks

| Risk / subsystem | Status | Severity / likelihood | Business impact and corrective action |
| --- | --- | --- | --- |
| Damaged returns reappearing as sellable | Corrected; native PASS | High / plausible before correction | False available stock and resale of unsellable goods. Run updated browser and Windows return acceptance before release. |
| Actual Windows boundary unverified | BLOCKED | Critical / unknown | Cannot trust installation, vault, offline operation or recovery on the target platform. Restore runner execution using its actual diagnostic, then execute current-head installed acceptance. |
| LAN transport absent | PARTIAL | Critical / certain for multi-PC use | No complete shared-shop product. Keep listener disabled until TLS pairing, human session lifecycle, durable client intents, revocation, outage and restore reconciliation pass. Never share live SQLite over LAN. |
| Restore of older backup / separate old PC | PARTIAL | Critical / plausible | Local generation changes cannot revoke an independent retained original or merge divergent histories. Preserve safety copies, reconcile newer transactions explicitly, and verify old-device refusal before multi-PC acceptance. |
| Required payment combinations incomplete | PARTIAL | High / certain when requested | Cash-plus-credit cannot be represented by current retail splits. Extend the existing customer ledger and transaction with regression coverage before promising it. |
| Native onboarding and statutory invoice integration incomplete | MISSING/PARTIAL | High / certain | A general shop cannot complete the required setup/invoicing process. Integrate these on current transaction and recovery architecture; obtain appropriate invoice/accounting review. |
| Lost recovery credentials | PARTIAL policy | High / plausible | Archive recovery requires its separate phrase and the archived owner's credential. No silent reset or encryption bypass exists. Complete documented owner recovery acceptance on a fresh Windows profile. |
| Scale envelope | PARTIAL | Medium / certain above cap | 10,000 products are currently unsupported. Add paginated/search APIs and appropriate query/index measurements before lifting the guard. |
| External payment verification | PARTIAL by design | High if misrepresented / controlled currently | No gateway verification exists. UPI/card remain pending or explicitly manually reconciled, with `externallyVerified=false`; do not relabel them as provider verified. |
| Physical devices, drivers, upgrades and distribution | NOT TESTED | High / unknown | Shop interruption or missing output is possible. Run a defined installed-hardware checklist and signed distribution/update acceptance. |

Native authorization checks cover owner, manager, assistant manager and cashier; disabled/expired accounts, cross-business scope, privilege modification, after-writer-lock revocation and protected commands. Recovery is owner-only with fresh authentication; archives remain encrypted and validated against trusted schemas, integrity/content hashes and a preview bound to the current workspace. Wrong credentials, corrupt/truncated archives, stale previews, ignored required writes, full-database and abrupt restore failures are tested. Restoring disables archived grants and rotates generation. These controls are evidence for the native implementation, not a completed external security audit.

## G. Windows pilot readiness and next-milestone roadmap

| Release level | Recommendation |
| --- | --- |
| Further development | YES. Use the integrated branch and preserve its tested financial/recovery core. |
| Controlled internal testing | YES, synthetic data and explicit limitations. |
| Limited supervised real-shop pilot | NO-GO. Target-platform, workflow and applicable operational gates remain open. |
| Broader commercial rollout | NO-GO. A pilot itself is not yet approved. |

After these critical gates close, order later work by operational impact: printer/scanner and selected-industry acceptance; supervised pilot feedback; safe customer/product import; support/recovery procedures; subscription/licensing; optional cloud backup/sync; Android planning. Do not start mobile or marketing work as a substitute for closing target-platform gates.

### Future import readiness assessment

Products and customers have stable identifiers, bounded integer quantities/money, revision checks and auditable native mutations. Product SKU uniqueness is enforced only for nonempty SKUs; phone/name matching is not a safe customer identity rule. Product creation currently derives its product identity from an operation ID. There is no complete external-source mapping or audited batch importer in this native tree.

Plan a business-scoped `(source, entity type, external ID)` mapping with independent import operation IDs, source fingerprints and resumable outcomes. Preview mappings, normalized units, duplicates and rejected rows before committing. Keep same-ID retries stable and reject conflicting contents; a new import batch must not silently overwrite an older financial operation. Respect restore generations and customer/catalog revisions.

Opening debt must enter through reviewed opening-balance or correction ledger semantics, with provenance and reconciliation, rather than overwriting a cached balance. Historical invoices/collections/refunds must not be forged from a single imported customer total. Preserve original source references, a reversible correction plan and an English error/reconciliation export. Avoid importing payment screenshots as verified settlements. The 5,000-product limit and lack of indexed native catalogue search need resolution before a large migration promise. No importer was built during this increment.

## H. Next three engineering priorities

1. **Obtain current Windows evidence.** Read the actual Actions startup annotation, resolve only the confirmed execution problem through authorized account action, then run installed offline authentication/billing/credit/returns/closing/recovery and genuine version-upgrade acceptance. Retain installer hashes, screenshots, logs and vault results.
2. **Complete the single-PC pilot workflow on this core.** Finish required native three-step onboarding, bank/GST/UPI details, cash-plus-credit allocation and selected-shop invoice/printing requirements. Add recovery/operator acceptance and measure on a modest Windows PC. Keep unsupported workflows explicit.
3. **Complete applicable multi-PC authority and recovery.** Adapt the older #126 transport to current human/device authority and generation fencing. Add secure pairing/revocation, durable client intent status and actual two-client TLS/outage/reconnect/restore tests before enabling it.

## I. Founder-level summary

The native core is substantial and testable. This work fixes a concrete inventory error: damaged returns can be refunded without being put back into available stock. It preserves previous request identities and financial history, and adds adversarial checks and measured scale evidence.

The passing native results demonstrate what ran on Linux with real encrypted storage and synthetic data. They do not provide a current installed Windows application, complete onboarding, all payment combinations or an operational multi-PC LAN product. A shop should not rely on this candidate as its sole sales, inventory or credit record yet.

Keep main unchanged and the integration under review. The next release gate is an installed, offline Windows candidate with verified recovery and the required shop workflow. The decision remains **internal testing only; no real-shop pilot approval**.

## Appendix: assignment's 40 adversarial cases

All PASS entries below are native Linux checks unless explicitly stated. Full logs contain qualified identifiers. This matrix does not claim 40 independent end-to-end Windows tests.

| # | Requested case | Evidence / status |
| --- | --- | --- |
| 01 | Last-unit concurrent checkout | PASS: `two_native_clients_competing_for_last_stock_cannot_oversell`; no real network transport. |
| 02 | Duplicate operation ID | PASS: `simultaneous_exact_retries_post_once`. |
| 03 | Changed payload under reused ID | PASS: `changed_operation_data_never_changes_committed_state`; changed disposition also conflicts. |
| 04 | Crash before commit | PASS: `uncommitted_billing_process_exit_rolls_back_every_effect_before_exact_retry`. |
| 05 | Crash after commit | PASS: `committed_billing_survives_process_exit_relock_unlock_and_exact_retry`. |
| 06 | Response lost after commit | PASS native receipt/restart/replay tests and scale fixture; current browser BLOCKED. |
| 07 | Repeated retry | PASS: exact checkout, credit and payment replay tests. |
| 08 | Falsely successful unverified UPI | PASS: `upi_references_and_renderer_paid_flags_cannot_settle_an_invoice`. |
| 09 | Duplicate allocation | PASS: `simultaneous_exact_settlement_retries_post_once`, split validation. |
| 10 | Split reconciliation | PASS: `generated_split_returns_conserve_money_stock_and_closing`; cash-plus-credit unsupported. |
| 11 | Partial repayment | PASS: `partial_full_repayments_and_general_ledger_balances_are_atomic_and_exact`. |
| 12 | Concurrent repayments | PASS: `simultaneous_collections_cannot_double_collect_a_stale_balance`. |
| 13 | Overpayment | PASS: `overpayment_changed_ids_and_stale_account_versions_never_mutate_history`. |
| 14 | Duplicate refund | PASS: refund crash/retry tests and damaged-return saved-receipt replay. |
| 15 | Excess return quantity | PASS: `competing_partial_returns_cannot_restore_or_refund_more_than_was_sold`. |
| 16 | Refund/repayment race | PASS: `refund_and_repayment_race_conserves_cash_debt_and_damaged_stock`. |
| 17 | Correction/checkout race | PASS: `stock_correction_and_sale_race_never_commits_both_stale_intents`. |
| 18 | Closing race | PASS: `concurrent_closing_and_sale_have_one_serialized_outcome`. |
| 19 | Concurrent invoice numbers | PASS: `concurrent_successful_invoices_receive_distinct_durable_numbers`. |
| 20 | Invalid quantities/prices | PASS: shared validation fixtures and catalogue malformed-input tests. |
| 21 | Money overflow | PASS: money contract fixtures and large balance/variance refusal. |
| 22 | Tax rounding | PASS generic arithmetic: shared vectors and cumulative partial returns; full GST integration remains incomplete. |
| 23 | Unauthorized cashier command | PASS: direct command-security and native role tests. |
| 24 | Cross-business access | PASS: scoped command and separate encrypted-database tests. |
| 25 | Revoked device | PASS native authority: `peer_human_scope_permission_and_revocation_are_intersected_on_every_request`; TLS boundary absent. |
| 26 | Corrupted database | PASS: `corrupt_encrypted_database_is_rejected_without_replacement`. |
| 27 | Wrong database credentials | PASS: `wrong_key_does_not_replace_data`. |
| 28 | Interrupted schema migration | PARTIAL: transactional migration failure/collision rollback and frozen old-schema preservation; no dedicated process-death-during-migration acceptance. |
| 29 | Corrupt backup | PASS: `wrong_passwords_corruption_truncation_newer_schema_and_unknown_sql_fail_closed`. |
| 30 | Interrupted restoration | PASS: `forced_termination_does_not_publish_partial_backup_or_commit_partial_restore`. |
| 31 | Replay after restore | PASS native generation/pending receipt checks; PARTIAL for an independent old PC/divergent histories. |
| 32 | LAN outage during checkout | BLOCKED: no enabled operational LAN transport. |
| 33 | Hub recovery/request replay | PARTIAL: native-authority reopen/reply-loss tests; actual hub process/TLS/reconnect untested. |
| 34 | Disk full | PASS deterministic native tests using database storage limits; no actual Windows volume exhaustion. |
| 35 | Restart after billing | PASS: native process-exit tests and 1,000-invoice stdio fixture. |
| 36 | Upgrade existing encrypted data | PASS native legacy migration fixtures; Windows application version upgrade BLOCKED. |
| 37 | Repeated outbox processing | PARTIAL: durable immutable outbox/read/retry evidence; no enabled external consumer or synchronization processor to verify. |
| 38 | Concurrent settlement updates | PASS: simultaneous exact settlement and competing bank-reference tests. |
| 39 | Refund partially paid invoice | PASS native partial-credit collection/return and pending/matched digital return cases. |
| 40 | Random financial reconciliation | PARTIAL: reproducible generated credit and split/return/closing/disposition sequences; no universal long mixed state-machine campaign claimed. |

Evidence files are under [master-execution-2026-10-31](master-execution-2026-10-31). A failed or unexecuted check is never counted as passed.
