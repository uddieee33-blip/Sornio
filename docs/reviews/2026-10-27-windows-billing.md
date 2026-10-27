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
