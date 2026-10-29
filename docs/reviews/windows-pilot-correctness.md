# Windows pilot financial and inventory correctness

Review date: 29 October 2026. This is engineering evidence, **not approval to use
Sornio as a shop's sole accounting record or a GST-compliant invoice system**.

## Baseline and scope

Merged `main` was verified as `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`
(tree `c1ea1371dc17949d81135fcefab9a12bf52aad72`). Open PRs #122–#129 were
reviewed before implementation. This update extends #124, whose previous head was
`85fc6b6d9a4ac57b879923cc343225a9f8067239`, and targets **main**. Its existing
authorization (#122), customer-credit (#123), payments, returns and closing code
is included for one combined review; none of those PRs was merged.

Backup #125, LAN #126, GST foundation #127 and printing #128 are **not** silently
included. The bounded required-stock-write checks and Zod lockfile correction
overlap #129 intentionally. Coordinate those overlapping changes during review.
The original Rust transaction helpers, scoped Workspace boundary and SQLCipher
store remain authoritative. No replacement financial engine or cloud transport
was introduced.

## Verified defects and scoped fixes

| Priority | Verified problem and reproduction | Change and evidence |
| --- | --- | --- |
| High | Inventory save commits, its reply is lost, then the renderer/native process restarts. Previously the UI lost its in-memory operation ID; re-entering a +2 kg delivery could record it twice (10 → 12 → 14). | Schema 10 atomically records actor, inventory event, outbox and an unacknowledged receipt with the stock write. A second ID is refused until acknowledgement. Restart displays the saved receipt; exact retry stays at 12 kg. `inventory_recovery.rs:44`, `inventory_recovery.rs:81`, `InventoryPanel.tsx:72`; real browser/native reproduction in `check-inventory-recovery.cjs`. |
| High | A required inventory write suppressed by a SQLite `RAISE(IGNORE)` trigger could report success while a product/event write was absent. Ordinary SQL errors are not the only failure mode. | Every required stock, event, actor, pending and outbox mutation must affect exactly one row. Faults at each write, deferred COMMIT failure, and process termination leave either the entire effect or none. `catalog.rs:125`, `inventory_recovery.rs:33`, `inventory_recovery_tests.rs:106` and `:131`. |
| Medium | Shared floating-point calculation rounded 4.85 units × ₹0.50 to ₹2.42, while the native integer contract yields ₹2.43. | The shared presentation adapter now uses the existing fixed-decimal/BigInt calculator. Five half-paise cases and a deterministic input grid cover the discrepancy; native fixtures still agree. `packages/business-domain/src/invoice-calculation.ts:12`, `scripts/verify-business-domain.mjs`. |
| Medium | Saved native receipts had operation UUIDs but no human-readable monotonic sale number or frozen business-name snapshot. | New invoices allocate `S-000000000001` style numbers from the existing invoice sequence inside the same transaction and freeze business ID/name. Rollback does not consume the number; exact retry returns the original receipt. Historical payloads remain readable and unchanged. `billing.rs:243`, `billing.rs:432`, `SavedInvoice.tsx`. This is an internal sale number, not a statutory GST numbering implementation. |
| High advisory; development dependency | The root lock pinned Zod 4.6.5; a fresh npm audit reported GHSA-mrhx-c7xc-m3w5. | Reused the already-reviewed three-field lockfile correction from #129 to 4.6.7. No desktop runtime dependency changed. Root and desktop lockfile audits report zero vulnerabilities after the correction. |

Native paths above are under `packages/local-store/src/`; UI paths under
`apps/desktop/src/`; browser scripts under `apps/desktop/`. Line numbers identify
this reviewed source version, not a promise they remain stable after edits.

## Requested workflow verification

| Requirement | Evidence on the combined source | Boundary or remaining gap |
| --- | --- | --- |
| Atomic checkout, invoice, stock, ledger, audit/outbox | `billing.rs:149` is shared by original and split checkout. `payments.rs:1258` adds payment effects to the same immediate writer transaction. Required-write/COMMIT fault tests compare persisted state and retry after reopening. | Verified against real SQLCipher on Linux; packaged Windows execution remains a separate gate. |
| Stable IDs / exactly-once effects | Prepared checkout, credit and retail requests survive restart. Canonical requests and saved receipts reject changed retries. Inventory now has a durable post-commit receipt and per-actor fence. Exact simultaneous retries, competing requests, cancellation races and lost-reply UI tests pass. | Exactly once applies to a retained local database and the same operation ID. It is not a distributed guarantee, an external payment guarantee, or protection against independently acknowledged/re-entered transactions. Restoring an old database can roll back the ID history. |
| Cash, card, UPI, credit and splits | Cash/credit checkout, partial/full cash collections, and cash/card/UPI splits use the same native invoice. Split allocations must equal the native total. `payments_tests.rs`, `customers_tests.rs`, `check-checkout.cjs`, `check-customers.cjs`, `check-retail.cjs`. | Cash + customer-credit or digital + customer-credit splits are explicitly unsupported. Customer-credit repayment is cash only. Do not accept those unsupported tenders operationally. |
| UPI verification | Supplied references and renderer paid/verified flags cannot confirm payment. Digital allocations begin pending; amount/reference mismatches and duplicate bank-reference matches are refused. Native payment/refund output always has `externallyVerified: false`. | Owner/Manager can record **manual reconciliation** against a statement; this is not provider verification. No PSP/gateway verification or bank settlement feed exists. The app does not send refunds. |
| Partial/full credit repayment | `customers.rs:757` posts customer entries, cash/receivables journal, receipt, audit, outbox and cash activity atomically. Generated partial/full collections, overpayment refusal, stale revisions, concurrent collectors and restart/exact retries pass. | Complex accounts with adjustments/write-offs need an explicit accounting correction for some returns; automatic ambiguous refunds fail closed. |
| Returns/refunds and reversals | `payments.rs:746` caps cumulative returned quantities, restores stock and reverses original revenue/tax amounts in one transaction. Partial-return totals converge exactly to the original sale. Pending digital intents cancel receivables without fictional cash refunds; matched digital returns create refund obligations. | Physical stock condition, actual cash handover and bank refund execution require human verification. No physical/printer/terminal acceptance is claimed. |
| Daily cash closing | `payments.rs:888` derives expected cash from opening float and native cash activity; counted cash and signed variance are frozen with an activity high-water mark. Stale quotes/duplicate closings/late cash mutations are rejected; corrections/reopening append history. | IST business day and per-native-user drawer model. Shared physical drawers, shifts spanning midnight, expenses/deposits and device-clock tampering require operational controls or further implementation. |
| Numbering, rounding, money and tax | Integer paise and thousandth-unit quantities, checked intermediates, native authoritative prices, bounded input precision, half-up line/tax rounding, cumulative return allocation and transactional internal numbering. Property tests exercise tax rates 0–30%; existing boundary fixtures include accepted/rejected extremes. | Scalar tax arithmetic only. No rate/classification/compliance guarantee, financial-year series, GST registration or place-of-supply logic. See accounting gate below. |
| Invalid/unauthorized/duplicate requests | Negative/zero/out-of-range quantities, insufficient stock, stale revision, forged payment fields, role denial, revoked sessions and mismatched scopes are refused natively. Writer-lock authorization is exercised independently of React visibility. | Local Windows-profile compromise is outside this boundary. A storage fault can prevent a denial audit from persisting; access still fails closed. |
| Business isolation and audit completeness | Separate encrypted stores and immutable native business/workspace scope; caller scope cannot choose a database. Successful financial effects include actor-linked append-only audit/outbox. New inventory actors/outbox reject UPDATE, DELETE and REPLACE. New invoice payloads freeze business identity. | Historic inventory records retain unknown actor rather than inventing attribution; no historical inventory outbox is fabricated. No LAN/cloud transport or tamper-proof remote audit anchor is implemented. |

## Automated verification actually run

Exact output excerpts, including test names, are in
[windows-pilot-test-evidence.txt](windows-pilot-test-evidence.txt).

- `cargo test --locked --manifest-path packages/local-store/Cargo.toml`:
  **126 passed, 0 failed, 1 ignored**. The ignored inventory worker is invoked
  explicitly by its passing parent subprocess test; it is not untested coverage.
- The same suite with `--release`: **126 passed, 0 failed, 1 ignored**.
- Three Proptest properties, 32 generated cases each per profile, check split-sale/
  return conservation, invalid-split/failed-write rollback and partial/full credit
  repayment. They assert stock restoration, balanced journals, exact tax/refund
  totals, zero residual balances, native cash variance and replay invariants.
  These are bounded randomized checks, not exhaustive proofs.
- Real child-process termination immediately before invoice commit and after
  commit, plus before/after inventory commit; reopen and exact retry. Injected
  statement failures and deferred foreign-key failures at COMMIT verify rollback
  separately from successful restarts. Power loss/storage-controller failure was
  not simulated.
- Six browser suites passed: mocked access UI and real Rust Workspace/SQLCipher
  authorization, checkout, customers, retail and inventory-recovery integrations.
  Lost replies, killed native subprocesses, stale reads, stock refresh, denied raw
  IPC calls and empty browser storage were exercised. The injected test bridge is
  **not the Tauri/WebView2/Windows vault boundary**.
- Full `npm run verify`, lint, both TypeScript compilers, desktop production build
  and hosted production build passed. Rust formatting, locked Tauri metadata and
  Windows acceptance Python syntax passed. The Windows script was updated for the
  explicit inventory acknowledgement; syntax is not execution evidence.
- Rust lockfile audits: no vulnerability entries; Tauri retains informational
  `glib` unsoundness and `proc-macro-error` maintenance warnings in its cross-platform
  lock. Root/desktop npm lockfile audits: zero vulnerabilities after Zod correction.
  Audits are advisory snapshots, not a proof of exploit absence.

Environment: Linux, Rust 1.99.1, Node 24.22.1, Chromium 156.0.8078.73. Bundled
SQLCipher was tested with system OpenSSL using `OPENSSL_NO_VENDOR=1`, because the
container cannot assemble the locked vendored OpenSSL build. Windows vendored
OpenSSL, Credential Manager and WebView2 were not executed here. Node dependencies
were reused from the installed lock-matching audit workspace; final Zod lock and
installed version agree. No dependency-install success on Windows is inferred.

Reproduction commands (from repository root):

```sh
cargo test --locked --manifest-path packages/local-store/Cargo.toml
cargo test --release --locked --manifest-path packages/local-store/Cargo.toml
cargo build --locked --manifest-path packages/local-store/Cargo.toml --example cashier_review_bridge
npm ci
npm ci --prefix apps/desktop
npm run verify
npm run lint
npm run typecheck
npm run typecheck:native
npm run build --prefix apps/desktop
npm run build
```

With `npm run dev --prefix apps/desktop` running on 127.0.0.1:1420 and Playwright
installed, run `node apps/desktop/check-{ui,authorization,checkout,customers,retail,inventory-recovery}.cjs`
individually (shell brace expansion is a list, not one invocation per file).
Each script accepts URL then Chromium executable path. `SORNIO_REVIEW_BRIDGE` can
select an alternate debug fixture path; omit it for the default Cargo target.
See `.github/workflows/workspace-browser.yml` for the executable CI sequence.

## Remaining pilot-blocking gates

1. **Actual Windows final-head acceptance:** build/install the final revision,
   run the offline UI Automation workflow and inspect its results/artifacts.
   Test clean install, upgrade from schema 6/7/8/9, launch/relock, signed distribution
   and the actual shop PC. Existing PR prose or green older runs do not establish
   final-head correctness. Consult the PR's current checks for observed CI state.
2. **Recoverable data and credentials:** backup #125 is separate and predates
   this schema/authorization combination. Prove backup + native-key recovery onto
   another PC, including pending receipts, all journals, inventory, audit and
   invoice-number continuity. Never copy just a live WAL database file and assume
   it is complete. No rollback-to-old-backup exactly-once guarantee is made.
3. **Accounting/GST validation:** a qualified accountant must validate shop
   registration/status, document type/required fields, GSTIN/HSN/SAC mapping,
   taxable/exempt items, inclusive/exclusive prices, discounts, applicable rates,
   place of supply and CGST/SGST/IGST allocation, rounding policy, financial-year
   numbering, credit/debit notes, returns and any applicable e-invoicing/reporting
   obligations. PR #127's arithmetic foundation is not integrated here. Internal
   sale numbers and scalar tax totals do not demonstrate statutory compliance.
4. **Payment operations:** define independent bank/terminal-statement checks,
   unsettled-payment handling and outgoing-refund confirmation. Do not label or
   release goods on the assumption that a typed UPI reference proves payment.
   The application records manual reconciliation; a trusted online verification
   integration remains absent. Unsupported credit splits/digital collections need
   implementation before using them in a pilot.
5. **Scope and reconciliation:** keep the pilot to one business on one controlled
   PC, with named staff and a documented per-user cash-drawer procedure. LAN #126,
   shared database files and multiple independently restored tills are outside
   this evidence. Reconcile daily against physical stock/cash and independent
   sales/payment records. Credentials, recovery/rotation and disabled-staff receipt
   recovery require an owner procedure; new inventory receipts remain per actor.

No evidence here establishes crash safety against failed hardware, disk exhaustion
at every filesystem boundary, malicious local administrators, printer correctness,
actual bank settlement, or real-shop accounting acceptance. No merge, deployment,
production-data migration or external payment was performed.
