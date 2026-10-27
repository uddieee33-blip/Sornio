# Native offline billing transaction milestone

Based on merged PR #120. Windows only; no theme or Android changes.

The native command `post_local_invoice` now commits the invoice snapshot,
aggregated stock movements, balanced cash/credit ledger entries, append-only
audit event and immutable versioned outbox event in one SQLCipher transaction.
The command returns success only after commit. A repeated exact request returns
its original invoice without posting again; changed input with the same invoice
operation ID is refused. Invoice IDs are scoped to invoice posting.

## IPC contract

`post_local_invoice({ request: { operationId, lines, taxBasisPoints, tender,
customerId } })`, where each line is `{ productId, expectedRevision,
quantityMilli }`. Tender is exactly `cash` or `credit`. Credit requires a bounded
stable customer reference. This is a reference, not verified customer onboarding.
Names, units and prices are read from native catalogue records; renderer prices,
totals, arbitrary SQL and paths are not accepted. Maximum 100 lines; quantities
use thousandths, prices integer paise, tax whole basis points (0–10000).
Revisions are positive JavaScript-safe integers. Shared request fixtures cover
IDs, required fields, cash/credit customer rules, unknown fields and numeric
limits in both TypeScript preflight and native validation. Native validation
always runs again; renderer preflight has no write authority.

Native authority uses positive half-up integer arithmetic with i128 intermediate
products, checked totals capped at 9,000,000,000,000 paise. The shared TypeScript
`calculateNativeInvoice` uses BigInt and the same fixtures under
`packages/business-domain/fixtures/native-invoices.json`. This is a bounded
native contract alongside the existing hosted calculator, whose public behavior
is preserved. Each line rounds before summation; tax rounds once on subtotal.

Repeated product lines retain their line totals but deduct their combined
quantity once and increment the product revision once. Stale revisions or
insufficient combined stock refuse the entire invoice. Stock movements are in
`local_invoice_stock`, separate from manual catalogue adjustment history.

Cash debits `cash`; credit debits `receivables` against its customer reference.
Revenue and tax payable are credited separately. Signed amounts sum to zero.
No UPI/card settlement is supported or inferred.

`list_local_invoices({after:0})` and `read_billing_outbox({after:0})` return at most
100 records ordered by increasing sequence. Continue with the final sequence.
Every command requires native unlock. Outbox reads do not acknowledge delivery;
there is no renderer mutation/acknowledgement API, network sender, or completed
sync protocol. Do not transmit these review events as production business data
before verified business/device scoping and authentication are implemented.

Schema v5 migrates v4 without clearing catalogue, password or drafts. All posted
billing tables reject updates/deletes. A draft restore cannot rewind invoices.
Every store connection enables recursive triggers so `INSERT OR REPLACE` also
fires the delete guard and cannot bypass append-only records.
Corrections/refunds will require new reversing operations, not edits to bills.

## Verification

Rust tests cover shared rounding fixtures, cash/credit balancing and attribution,
restart and retry, changed operation IDs, duplicate-line overselling, stale
connections, rollback at each invoice/stock/ledger/audit/outbox write boundary,
actual SQLITE_FULL, subprocess death before commit, locked reads/writes,
immutability and preservation through the v4 migration. Shared-domain tests
exercise TypeScript against the same request and money vectors and invalid/overflow
inputs. Additional tests cover multi-line rounding, simultaneous exact retries,
failure after earlier product deductions or a ledger debit, successful retry after
rollback, and replace/update/delete rejection after reopening the database.
CI separately compiles the native Windows command and capability manifest and
runs release SQLCipher/Credential Manager tests.

## Scope

This PR implements the native posting API and durable records. A cashier bill
editor, receipt printing, customer master/dues collection, returns, GST-compliant
invoice numbering and split taxes, business identity/isolation, staff roles,
backup/key recovery, LAN transport, cloud acknowledgement and signed distribution
remain separate milestones. The existing native UI smoke test exercises draft
and stock workflows; it is not a claim of end-to-end cashier billing acceptance.
Use synthetic data in this single-profile engineering review.

## Reliability review

The review found one additional posting defect: SQLite can report a successful
statement with zero changed rows (for example, a trigger using `RAISE(IGNORE)`).
The stock update and billing inserts previously ignored that count. A regression
reproduced successful posting without the required stock change. Posting now
requires one affected product per stock update and one inserted row for every
invoice, movement, ledger, audit and outbox write; an omitted write aborts the
transaction. The previously fixed `INSERT OR REPLACE` bypass remains covered.

Tests in `packages/local-store/src/billing_reliability_tests.rs` use real encrypted
SQLite files and exact before/after row snapshots, including existing sales and
SQLite sequence state. They supplement the existing billing tests:

| Scenario | Automated evidence |
| --- | --- |
| Complete atomic sale | Multi-product sale with repeated product lines checks exact aggregated movements, per-invoice ledger, invoice snapshot and matching audit/outbox payloads; reopening preserves all rows. |
| Write failure | Abort each invoice, product, movement, ledger, audit and outbox write after an earlier committed sale; every financial row remains unchanged, including after reopen. |
| Failure at commit | A deferred foreign-key violation allows all posting inserts but fails `COMMIT`; every effect rolls back and the operation can retry. |
| Silently omitted write | `RAISE(IGNORE)` at each required write must return failure and preserve the complete pre-sale state. |
| Exact retry | Repeated and simultaneous identical requests preserve all rows and return the original invoice, including after process restart. |
| Changed retry | Changes to quantity, revision, product, tax, customer or tender under the same successful operation ID are rejected without side effects. |
| Insufficient stock | Existing repeated-line oversell and new distinct-sale race tests reject overselling and preserve state. |
| Process restart | A child posts through the password-gated Workspace API and exits without destructors; a new Workspace locks, unlocks, recovers the committed sale and safely retries. |
| Cash/credit accounting | Exact debit/credit rows are checked separately per invoice, including customer attribution and zero-tax posting. |
| Unverified UPI | Valid-shaped requests with UPI tender/references, paid/status fields or renderer verification claims are rejected by both TypeScript and native deserialization. Credit remains receivables. |
| Concurrent/stale operations | Two different sale IDs race for the same revision/stock; exactly one commits, the other conflicts. Existing stale-connection tests remain. |
| PR #120 migration | An independent frozen v4 schema preserves every draft, saved copy, access row, product and inventory event; legacy operation retries, password unlock and subsequent billing still work. |
| Audit/outbox failure | Both erroring and silently skipped inserts abort the financial transaction, preserving prior committed history. |

The v4 fixture is copied from the schema statements in merged PR #120
(`fc57404cec4ded352a1d8fcef8efd8a5a53ccfec`); its source files were checked against
that GitHub commit. It does not create a v5 database and then remove its tables.
All fixture identities, passwords, keys and transactions are synthetic.

The process restart regression exercises the native store and Workspace used by
the desktop commands. It is not an automated cashier-screen interaction. The
existing Windows GUI smoke still covers stock/drafts, since a cashier UI has not
been implemented. Power removal, disk/controller faults, LAN delivery and
production customer data have not been tested by this suite.

Local execution for this review: all 50 native Rust tests passed in both debug
and release profiles on Linux. Full repository verification passed, including 45
shared request-validation fixtures and 13 money cases. Repository lint, both
TypeScript compilers, the desktop production frontend build, Rust formatting and
`git diff --check` passed. Updated-commit Windows results must be read from PR
#121 checks; these local results do not certify a Windows installer or cashier UI.
