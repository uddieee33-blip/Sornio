# Native Windows customers and credit ledger

Depends on native authorization PR #122. Review this PR against
`feature/windows-native-authorization` until that milestone merges; then retarget
it to `main`. No authorization or billing implementation is duplicated.

## Shop workflow

Owner, Manager and Assistant Manager can maintain customer name, optional phone
and immutable shop-specific customer ID. Phone numbers are normalized, optional,
and are not authentication credentials. Checkout searches names, IDs and phones
and continues to use the existing cash/credit invoice contract. A credit sale
must reference an existing account. Migrated invoice references automatically
become accounts, retaining their original reference and financial history.

The customer panel shows account balances, transaction history, credit terms,
and full printable statements. It supports partial/full **cash** repayments.
No digital payment settlement is claimed. Owner corrections cover opening dues,
write-offs and a once-only reversal of these entries or a repayment; these do not
refund an invoice or rewrite sales/tax. Reasons are mandatory for corrections.

Owners can move an existing unpaid credit invoice to the correct customer.
The original invoice stays immutable; paired transfer entries retain source and
destination history. To avoid silently reallocating prior collections, a source
account with any repayment or adjustment history must use an explicit correction.
Historical linking may exceed a prospective limit; it never hides existing debt.

## Financial guarantees

- Money inputs are integer paise bounded by the existing native money limit.
  Cumulative balances use checked `i128` arithmetic and decimal strings across IPC.
  There is no writable customer balance field.
- Credit sales add the subledger entry and verify the current account limit inside
  the original invoice/stock/general-ledger/audit/outbox SQLite writer transaction.
  Any refusal or failed required write rolls back every effect.
- Repayments post cash debit / receivables credit and the matching customer entry,
  operation receipt, revision, privileged audit and outbox in one immediate
  transaction. Full/partial payment cannot create a negative account balance.
- Stable operation IDs retain exact canonical requests and committed receipts.
  Changed retries are refused. Account revisions serialize concurrent collectors.
  Prepared requests persist in the encrypted database per native actor. Lost
  replies and process restarts recover that exact request/receipt after login.
  Acknowledgement removes only the checkpoint; cancellation retains an ID fence.
- Financial entries, journals, operation receipts, outbox, cancellation fences and
  privileged audit are append-only, including SQLite `REPLACE` protection.
  Corrections post additional balanced entries; no delete/reset command is exposed.
- Aging allocates each collection to then-existing charges in due-date/sequence
  order. Settled sales cannot hide newly entered backdated dues. Due dates and
  aging use Indian calendar dates (IST); stored timestamps remain UTC. A due date
  becomes overdue on the following IST date. Term edits affect future sales only.
- Statement pagination has a fixed sequence snapshot and exact running balances.
  Native print rendering includes the entire snapshot, escapes customer text and
  includes original invoice/reversal references. Printing uses the existing
  WebView print dialog; no arbitrary file, shell, navigation or network permission
  is added. Physical printer output remains hardware-dependent.

## Native authorization and isolation

| Capability | Owner | Manager | Assistant Manager | Cashier |
| --- | --- | --- | --- | --- |
| Customer lookup, account history, statement, cash collection | Yes | Yes | Yes | Yes |
| Create/edit name and phone | Yes | Yes | Yes | No |
| Set credit limits and terms, overdue account report | Yes | Yes | No | No |
| Opening corrections, write-offs, reversals, invoice linking | Yes | No | No | No |

Assistant-created accounts start with a zero limit and 30-day terms; policy edits
require Owner/Manager. Existing policy is preserved during name/phone edits.
Every command uses the native scoped Workspace boundary. Sensitive writes verify
principal revision, enabled state, business/workspace identity and permissions
again after acquiring the writer lock. React visibility is only a usability aid.

Each business retains its own encrypted database and immutable identity. Caller
scope compares against that identity; it cannot select a database. New outbox
envelopes include business/workspace scope for future transport validation.
Native sessions remain in memory and expire/lock as before. No passwords,
encryption keys or authentication tokens are returned or written to browser
storage. This milestone adds no LAN listener, cloud sync or shared database file.
Future LAN replication must preserve scoped identities, source audit attribution,
operation IDs, authorization and conflict checks; scope alone grants no authority.

## Migration and verification

Schema 8 creates the customer subledger without changing invoice payloads,
original billing journals, catalogue, credentials, encryption or existing outbox.
Schema 7 credit references are seeded once in the same migration transaction;
old invoices preserve timestamps and acquire 30-day default terms, no limit.
Back up the encrypted database and its native key/vault before deploying as usual;
opening a newer schema with an older binary fails closed.

Rust tests cover full/partial collection, exact retry/conflict, overpayment,
writer races, cancellation/post races, audit/write/commit failures, reopen
recovery, limits rolling back original invoices, reversals, linking, aging,
append-only history, statement pagination/escaping, large exact balances,
authorization denials, separate business databases and schema 7 migration.
React integration uses a real Rust Workspace/SQLCipher subprocess and injects
lost replies/process termination, not a mock financial engine. Existing billing,
authorization and mocked access suites continue to run. Windows Actions tests
the release binary through keyboard/UI Automation with outbound firewall blocks
for the app and WebView, including profile/phone lookup, collections, restart
recovery and a native printable statement. The test never injects JavaScript into
the Windows app.

Verified run counts and links are recorded in the PR once CI completes. Review
installer artifacts remain engineering builds; no release or auto-merge is enabled.
