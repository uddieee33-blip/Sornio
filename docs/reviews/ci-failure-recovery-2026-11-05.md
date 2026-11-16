# Sornio P0 financial test and Windows CI recovery — 2026-11-05

## Decision

**Local candidate: ready for separately authorized, cost-free hosted acceptance, conditional on confirming the available runner capacity and all automatically triggered workflows. Windows fix remains unverified on Windows.**

**Windows installer, real-shop pilot and release: NO-GO.** No genuine Windows build, installation, launch or installed-app acceptance was performed for this candidate. Do not represent an authorization to run acceptance as an approval to merge or release.

## Repository and execution baseline

- Repository: `uddieee33-blip/Sornio`; `main` was `1cc5c798d1eada9a16463213b0776c01e99d36f9` when inspected.
- Baseline repair branch `fix/ci-release-gate-20261104` was `e0518c1c7f87b5bc8eae59be823c15cea0a7ae8b`. The audited work is on local branch `repair/p0-ci-financial-20261105` and code commit **`0ac1dd5c4387a10ec3771d8f7e111f5ddeef90e0`**, whose parent is that exact baseline. A subsequent documentation-only commit can change the branch head without changing the tested code.
- A full working tree was assembled from GitHub's exact commit and tree metadata and individually hash-verified Git blobs. The exact commit object was independently reconstructed and hash-verified. The checkout is shallow at `e0518c1`, not a complete historical clone. No remote branch or PR was created.
- Open PR search found #126 (LAN, draft) and #127 (GST, non-draft). They and unrelated branches remain untouched. The separate audit branch was `55bb7f21fa53831658648dd2673e1b9dba1a3712`; its three applicable changes were reviewed and selectively reused, not merged wholesale.
- Both original logs explicitly record checkout `e0518c1c7f87b5bc8eae59be823c15cea0a7ae8b`. Source references: [browser run #125](https://github.com/uddieee33-blip/Sornio/actions/runs/41837990229/job/126601797617) and [Windows run #135](https://github.com/uddieee33-blip/Sornio/actions/runs/41838239799/job/126602674892).
- No hosted execution, rerun, remote push, PR, merge, release, visibility change, paid infrastructure, runner or billing change was initiated here.

## Original failures and root causes

### 1. Cash invoice with a customer — production validation defect

Browser run #125 executed `cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml`. Cargo exited 101 and `tee` exited 0; debug reported **204 passed, 3 failed, 6 ignored**. `billing::reliability_tests::cash_credit_and_zero_tax_ledgers_are_correct_per_invoice` failed at `billing_reliability_tests.rs:206` with `InvalidPayment`.

`PostInvoice` accepts a cash invoice carrying a customer ID, but `payments::invoice_posted` applied the retail customer/credit-part equivalence to every tender. An ordinary cash invoice with an identified customer therefore failed even though no credit was involved. The repair limits that equivalence to retail split tenders; a full credit tender still requires a customer. The native transaction now also checks that an identified cash customer exists, failing within the writer transaction rather than storing a dangling customer ID.

Review found a related cross-system defect: `allocationForTender` in replication rejected cash invoices with a customer. Without the additional replication change, the repaired native app could commit an invoice that cloud ingest refused. The repair preserves the customer ID, classifies the entire amount as cash, and creates no debt. Retail split validation remains strict.

### 2. Inventory fixture — wrong product ID

`inventory_recovery::tests::missing_product_multi_row_guard_and_new_delivery_after_ack` failed at `inventory_recovery_tests.rs:355` with `StatementChangedRows(0)`. It created product `item` and then tried to update `rice`. The test now updates the seeded product, retains its two-row guard assertion, and checks that dropping the transaction leaves state unchanged.

### 3. Credit-limit race — stock conflict masked intended test

`payments::phase3::concurrent_credit_limit_never_exceeds_customer_cap` failed at `phase3_reliability_tests.rs:771`: one concurrent operation succeeded, while the other returned `StockConflict` before the credit-limit condition could be observed. The repair assigns the concurrent sales to different sufficiently stocked products but the same customer with a ₹500 cap. It still requires exactly one ₹400 credit sale, one credit-limit or credit-conflict rejection, ₹400 debt, one invoice and one stock deduction. Product revisions are looked up by ID rather than list order.

### 4. Windows vendored OpenSSL — Perl environment mismatch

Windows run #135 executed `cargo test --all-targets --release --locked --manifest-path packages/local-store/Cargo.toml --target-dir apps/desktop/src-tauri/target`. Cargo exited 101 and `tee` exited 0. The `openssl-sys v0.9.117` custom build failed before tests: `perl ./Configure ... VC-WIN64A` exited 2 because `Locale/Maketext/Simple.pm` was missing from `@INC`. Those paths were MSYS-style `/usr/...`; an earlier PowerShell step had found `C:\Strawberry\perl\bin\perl.exe`. The exact executable chosen by the failed Cargo invocation was not logged, so the observed mismatch is strong evidence but not proof of its complete PATH resolution chain.

Both relevant lockfiles select `openssl-src 300.6.1+3.6.3`. Its source chooses `OPENSSL_SRC_PERL`, then `PERL`, then `perl` on PATH. The workflow now selects the existing Strawberry Perl by absolute path, fails closed if it or `IPC::Cmd`/`Locale::Maketext::Simple` is unavailable, exports `OPENSSL_SRC_PERL` and checks that same executable and modules from the subsequent Bash environment. This preserves the real native, installer and exit-propagation gates.

On Linux, an independent build using the **actual locked `openssl-src` version** and a logging wrapper that executed system Perl confirmed that `OPENSSL_SRC_PERL` was used for `./Configure`; the vendored OpenSSL probe completed successfully. This establishes the crate's selection mechanism on Linux, **not** that Strawberry Perl or its modules are present and selected on the Windows runner. That requires genuine Windows execution.

## Code and regression changes

| Files | Change |
| --- | --- |
| `.github/workflows/windows-local.yml` | Explicit Strawberry Perl, module probes and Bash-environment verification; no test or installer bypass. |
| `packages/local-store/src/payments.rs`, `customers.rs` | Permit ordinary cash/customer invoices, validate customer existence transactionally, keep credit/retail rules. |
| `packages/local-store/src/inventory_recovery_tests.rs` | Correct fixture product ID while retaining affected-row and rollback assertions. |
| `packages/local-store/src/phase3_reliability_tests.rs` | Isolate the customer-credit race from stock revisions; add valid customer-cash replay/reopen and missing-customer rollback/retry tests. |
| `packages/replication-cloud/src/payments.ts`, `scripts/verify-replication.mjs` | Accept customer identity on full-cash invoices, verify in-memory and PGlite-backed durable ingest, exact retry, acknowledgement, reload and no customer debt. |

Existing native tests cover the ₹1,000 sale with ₹600 cash plus ₹400 customer credit, stock and ledger effects, receipt, replay, credit limits, insufficient stock, duplicate payment references, refunds and rollback. They were not replaced by mocks or weakened.

## Local validation evidence

All commands ran locally with synthetic data. Rust 1.99.1, Node 24.22.1 and locked dependencies were used. Native tests used bundled SQLCipher with vendored OpenSSL on Linux. The exact baseline was rerun first and reproduced the three failures: **204 passed, 3 failed, 6 ignored**, exit 101. One early candidate debug run ended without a final summary and is excluded from pass claims; the complete rerun below produced normal final summaries and exit 0.

| Command or check | Result and scope |
| --- | --- |
| `cargo fmt --manifest-path packages/local-store/Cargo.toml -- --check` | PASS. |
| `RUST_TEST_THREADS=4 cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml` | PASS, exit 0: **209 passed, 6 ignored**, and 6 example security tests passed. |
| `RUST_TEST_THREADS=4 cargo test --all-targets --release --locked --manifest-path packages/local-store/Cargo.toml` | PASS, exit 0: **209 passed, 6 ignored**, and 6 example security tests passed. |
| Targeted `cargo test --lib` filters `cash_sale_with_`, `cash_credit_and_zero_tax_ledgers`, `missing_product_multi_row_guard`, `concurrent_credit_limit`, `split_cash_and_customer_credit_sale`, `split_sale_validation_credit_limit` | PASS individually, including the new missing-customer rollback/retry and the ₹600/₹400 transaction. |
| `python3 scripts/test-ci-logged-wrappers.py` | PASS: 49 injected failure-propagation cases. These use stubbed external commands and do not establish application correctness. |
| `npm ci --no-audit --no-fund` at root and desktop | PASS. Lockfiles unchanged. |
| `npm run lint` | PASS with 0 errors and 2 existing unused-variable warnings. Targeted ESLint was rerun after adding the last replication assertions: 0 errors, 1 existing warning. |
| `npm run typecheck`, `npm run typecheck:native`, `npm run build` at root; `npm run build` in `apps/desktop` | PASS. Root build used isolated local test environment variables. |
| `npm run verify` | PASS before the final test-only additions. `npm run verify:replication` was rerun afterward and passed **115 checks**, including actual durable ingest on PGlite; this is not a hosted real-PostgreSQL acceptance. |
| `npm run verify:windows-release` | PASS: 40 configuration/identity checks, not a Windows build. Workflow YAML parsed and its explicit Bash blocks passed `bash -n`; PowerShell was not executed here. |
| `cargo build --locked --manifest-path packages/local-store/Cargo.toml --example cashier_review_bridge` and `python3 apps/desktop/check-native-scale.py --bridge <built bridge> --output <temporary output>` | PASS. Isolated Linux stdio/native fixture seeded 1,000 products, 1,000 customers and 1,000 invoices and checked backup and recovery. This is not Windows or physical-hardware evidence. |
| `node scripts/verify-workspace-browser.cjs` against the local production server | PASS: eight portals, responsive pages, modal focus and subscription API transitions using Playwright 1.62.1 with Chromium 153. The originally pinned browser download failed with a truncated archive; the alternate browser was installed locally. |
| The twelve `apps/desktop/check-{ui,focus,inventory-refresh,checkout,receipts,authorization,backup,credentials,customers,statement-print,retail,inventory-recovery}.cjs` scripts | All 12 exited 0 using Linux Chromium 153 and the native bridge where used. `check-ui` and `check-inventory-refresh` explicitly use mocked IPC; the other scripts' native/browser coverage is not Windows Tauri or physical printer testing. Generated tracked review images were restored after testing. |
| Local `openssl-src` probe | PASS on Linux with `OPENSSL_SRC_PERL` pointing to a logging wrapper that executed real system Perl; `./Configure` used that exact path and the vendored OpenSSL build completed. |

Of the six ignored native entries, four are subprocess workers exercised by their parent tests; `native_sqlcipher_apply_https_acks` and `native_sqlcipher_export_pipeline` were not separately executed. Browser acceptance here used a different Chromium build than GitHub Actions. No local check is presented as Windows execution.

## Hosted execution and remaining gates

1. `windows-local.yml`, `workspace-browser.yml` and `replication-postgres.yml` include relevant source paths on pull requests to main; `ci.yml` also runs on PRs to main. Opening a PR for these changes can therefore start all four workflows. A push to a new branch does not match the inspected Actions push filters, but external integrations or preview deployments may still react. Do not push or open a PR until the owner explicitly authorizes the resulting hosted executions and confirms free capacity for all of them.
2. On an authorized exact candidate, check Windows Bash's logged Perl path, the absolute override and both module probes. Then require passing debug and release native suites, actual NSIS build, installation, launch, screenshots/checksum and installed-app acceptance. Distinguish the code commit from any GitHub-generated PR merge commit and preserve raw logs and artifact hashes.
3. Obtain genuine hosted browser and real PostgreSQL verification for the selected exact candidate. PGlite and Linux/browser simulations do not establish Windows, physical scanner/printer, LAN or production replication readiness. Investigate any failing command without weakening checks or automatically rerunning.
4. Before a real-shop pilot, independently assess real printer/scanner behavior, offline operation, physical power interruption, encrypted backup/restore, finance reconciliation and other release gates. Review the cash/customer native and replication contract as one change; do not merge only one side.
