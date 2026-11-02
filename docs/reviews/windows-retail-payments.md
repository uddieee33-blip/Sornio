# Native retail payments and cashier reconciliation

This milestone builds on native billing, authorization (#122) and customer
accounts (#123). PR #124 now includes that dependency chain and targets `main`
for one combined pilot-correctness review. Neither dependency has been merged.
See [current pilot evidence and blockers](windows-pilot-correctness.md). It does not replace
the invoice engine or the existing general/customer ledgers.

## Recording and verification

The existing cash and credit checkout paths remain available. A new retail
transaction type records cash, UPI and card allocations against the same native
invoice. Allocations must sum exactly to the native invoice total. Cash is
recorded as received. UPI and card start **pending and unverified**, including
when a cashier supplies a reference. No gateway, network check or provider
verification endpoint is implemented. Native output always reports
`externallyVerified: false` and an externally verified total of zero.

Owner/Manager can compare an allocation with a bank/terminal statement and record
its reference, exact statement amount and evidence note. A matching amount is
required. The resulting status is **manually reconciled, not externally
verified**. Active references are normalized and cannot match two allocations on
the same rail. An unrefunded match can be reversed with a reason, retaining both
events and releasing the active reference for an audited correction. Digital
refunds likewise remain pending obligations until a separate manual outgoing
statement match; the app never claims to have sent a bank refund.

Splits support up to eight native cash/UPI/card allocations; the cashier screen
provides one allocation per method. Credit continues through its existing
customer-account workflow. Mixed digital/credit account splits are deliberately
refused rather than creating anonymous customer debt.

## Atomic accounting

The original billing implementation is extracted into one transaction helper;
both original checkout and retail checkout call that helper. It still calculates
native prices/tax, deducts stock, posts revenue/tax, and writes its original audit
and outbox. Retail intent records and journal movements join that same SQLite
writer transaction. The original invoice JSON fields and historical payloads are
retained; `retail` is an additional tender value, accepted only through a valid
retail allocation command.

For retail invoices the existing receivables control debit is offset by recorded
cash. Pending digital amounts remain unresolved receivables, separate from
customer credit balances in the cashier display. A manual match transfers the
remaining allocation into UPI/card clearing. Reversing a match reverses that
journal. Original cash/credit invoices are indexed into the payment register
without posting their cash/revenue twice. Existing customer cash collections
also enter the cashier cash-activity register in their original transaction.

Every new financial operation has an exact native request/receipt, stable ID,
durable per-actor checkpoint, cancellation fence, privileged audit and outbox.
Native authorization is repeated after the SQLite writer lock. A lost response
or restart recovers the same request/receipt; changed requests are refused.
Balances use checked integer arithmetic; cumulative cash/balances cross IPC as
decimal strings. No editable balance or renderer-computed refund is accepted.

## Returns and refunds

Owner/Manager return original invoice line quantities. The native store caps
cumulative quantities at those actually sold and restores the original products
atomically with the refund journals, credit entries where applicable, audit and
outbox. Current prices cannot alter a historical return. Subtotal is allocated
from the original line total using cumulative returned quantities; tax is
allocated cumulatively from the original invoice tax. Final partial returns sum
to the original subtotal/tax exactly, without accumulating rounding drift.

The native quote explicitly shows cash out, customer debt reduction, pending
payment cancellation and pending digital refunds. Suggested allocations consume
pending digital intents first, then cash, then matched digital allocations. A
caller-supplied allocation is still bounded by each original payment and must
sum to the exact return total. A pending digital cancellation produces no cash
refund. A matched digital return creates a refund-payable obligation; its bank
clearing is reduced only by a later manual outgoing statement match.

For an ordinary credit account, a return first reduces outstanding account debt;
only the excess can be recorded as a cash refund, bounded by retained account
cash receipts. Accounts with opening adjustments, write-offs or reversals require
an explicit accounting correction and are refused for automatic credit returns.
This avoids fabricating a cash refund for written-off or otherwise ambiguous
debt. Credit-return entries retain the original invoice reference and update the
existing customer subledger. Customer credit statements describe credit balance
movements; payment/refund registers and the settlement export retain cash refunds.

## Cashier closing

Each native account has an IST business-day cash register. Expected drawer cash
is its declared opening float plus recorded net cash movements. Digital intents,
manual bank matches and unverified transfers never inflate drawer cash. Owner/
Manager declare opening floats and can append reasoned corrections while the day
is open. Cashiers can count/close their own account; Owner/Manager can review
other cashier accounts. Unattributed legacy cash is reported separately and is
never silently assigned to the current cashier.

Closing uses a native activity high-water mark and captures an immutable summary,
count and signed variance. Stale quotes are refused. Sales, credit collections and
cash-affecting returns cannot change a closed day; their entire transaction rolls
back. Owner/Manager may append a counted-cash correction or explicitly reopen the
day with a reason. Bank reconciliation with no drawer-cash movement can continue
without rewriting a saved closing snapshot. Cash registers represent movements
recorded against native user accounts, not an automatically detected shared
physical drawer. Unsupported cash movements remain visible as discrepancies.

Owners can explicitly adopt an interrupted retail, credit or checkout checkpoint
with a reason. Existing financial records retain their original attribution;
retrying a committed operation cannot post it again. An uncommitted operation is
completed under the resolving user's current native permissions. Staff disabling
or a lost terminal therefore need not strand a prepared retail checkout.

## Exports and storage

Owner/Manager can explicitly save a UTF-8 CSV under the business-specific native
app-data settlement-export folder. The command accepts no caller path. It records
a privileged export-prepared audit, writes a temporary file, synchronizes it and
renames it before reporting success. The intentional CA export is plaintext;
the operational database and its keys/passwords remain protected as before.

CSV record types separate payment registers, refund obligations, cash movements,
signed journal entries, manual reconciliation events, opening declarations and
immutable closing snapshots. Filter by record type rather than summing unlike
categories together. Amounts are exact two-decimal rupees; business dates are IST
and timestamps are UTC. Formula-leading text is escaped for spreadsheets. Every
record identifies its verification status; manual matching is never presented as
provider verification. Cross-day matches/refunds retain their own settlement date
and original invoice reference.

Schema 9 adds payment/return/closing records, cash activity and transactional
outbox. It extends the customer-entry kind to include a return by copying all
existing rows, sequences and timestamps inside the migration transaction. Existing
invoices, journals, stock, credential hashes, scope identity and encrypted storage
are preserved. Legacy cash and customer collections are seeded once without
reposting their ledger amounts. There is no data reset, financial-history pruning,
LAN listener, cloud transport, theme, Android or marketing change.

## Verification

Rust coverage includes split invariants, duplicate bank references, statement
amount mismatches, exact retries, restart recovery, rounding across partial
returns, partial cash/digital refunds, all required return/audit write failures,
deferred commit failure, competing collectors/returns, scope/RBAC denial, immutable
history, formula-safe exports, migration and IST midnight boundaries. Existing
billing/customer/authorization tests continue to run.

React integration uses the real Rust Workspace/SQLCipher review bridge. Windows
acceptance builds the actual packaged release and exercises keyboard/UI Automation
with app/WebView outbound traffic blocked, including pending UPI, manual matching,
receipt recovery, stock restoration, pending bank refunds, a real saved CSV and
cash variance. No JavaScript is injected into the Windows acceptance app.

Final run links and results are recorded in the PR. This remains an engineering
milestone; physical printer/terminal/bank integration is not claimed or added.
