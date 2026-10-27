# Bundled Windows cashier checkout

Continues PR #121 on `feature/windows-native-billing`. The React/Tauri Windows
interface now offers inventory search, quantities in the catalogue unit, a shared
integer-money preview, cash/credit selection, explicit review/confirmation, a
saved native invoice ID, and stock/ledger refresh. It uses the existing native
billing transaction engine. No React posting or browser-storage billing engine
was added.

## Confirmation and recovery

1. The cashier selects items, edits quantities (up to three decimals in each
   saved unit), selects tax/cash/credit, and reviews the shared-domain preview.
   Prices and units are read from the local catalogue. Credit requires a stable
   customer reference. UPI and renderer paid flags remain unsupported.
2. Confirmation generates one operation ID and freezes the exact request.
   `prepare_local_checkout({request})` commits that request to encrypted SQLite
   before `post_local_invoice({request})` can run.
3. The authorized post command uses the existing invoice transaction. For a new
   invoice it checks the prepared request under the same SQLite writer lock used
   for invoice, aggregated stock, ledger, audit and outbox writes. It never accepts
   a renderer price or total. An exact successful retry returns the original bill.
4. Only a committed native invoice response, or a subsequent native read of that
   committed invoice, renders “Sale saved on this PC”. A request in progress or a
   lost reply displays neither a completed sale nor a fabricated receipt.
5. The encrypted checkpoint stays until the cashier acknowledges the saved bill
   with Start next sale. Unlock/restart recovers either the waiting request or its
   committed receipt. Retry same sale preserves the complete ID and payload.
6. A definitive validation/stock refusal can reopen the cart for editing.
   `clear_local_checkout({operationId,saved:false})` verifies that no invoice was
   committed and removes the matching checkpoint under the writer lock. A late
   confirmation after cancellation is refused. A persistent cancelled-ID record
   also refuses delayed preparation retries; editing uses a fresh ID. Clearing a saved checkout similarly
   checks `saved:true`; repeating an acknowledged clear is safe.

Unknown failures preserve the request and lock its fields. A failed stock/balance
read after a successful post preserves the receipt and blocks the next sale until
refresh. Another window cannot replace an active checkpoint with different input.
There is currently one active checkout per local workspace; LAN multi-cashier
routing remains a separate milestone.

## Native reads and migration

Schema v6 adds `local_checkout` without rewriting existing financial records.
V4 and v5 data migrate forward. The frozen PR #120 fixture and existing migration
regressions remain in the native suite.

`read_cashier_state` reads catalogue, checkpoint/receipt and cash/receivables
balances in one SQLite snapshot. Cumulative balances are decimal paise strings,
accumulated natively with i128, so they remain exact beyond JavaScript's safe
integer range. The UI formats them with BigInt and calls the shared
`calculateNativeInvoice` only for cart previews. Individual prices/totals remain
bounded native integer paise.

All added commands use the native password-gated Workspace and the existing
main-window local-billing capability. Locking unmounts private screens. Neither
passwords nor checkout requests, invoices, catalogue data or balances are written
to localStorage/sessionStorage. In-progress writes disable lock/mutation controls.
Unsaved cart edits use the existing discard guard; prepared requests are recovered
from encrypted storage. The UI limits rendered search results to 50 and memoizes
catalogue lookups/search results; it adds no UI framework or runtime dependency.

## Automated verification

- Native unit/integration tests cover prepared request and receipt recovery,
  authorization, read-only preparation failure, failed outbox posting followed by
  restart/retry, cancellation racing confirmation across connections, acknowledged
  clears, v5 preservation, and cumulative amounts above JS safe integers. They
  supplement all existing invoice atomicity/idempotency/migration regressions.
- `apps/desktop/check-checkout.cjs` runs the real React UI against the real Rust
  Workspace and SQLCipher through a JSON-lines review transport. It holds posting
  to prove no early success; tests cash/credit, kg/litre/metre/pcs, invalid quantities,
  missing credit reference, lost post reply/exact retry, lost committed reply and
  native-process restart recovery, lost prepare reply/restart/retry, stale stock,
  saved-sale/read-failure recovery, dirty lock guard, protected screens and small
  viewports. No financial engine is mocked. The fixture uses only synthetic data
  and is not part of the shipped Tauri application.
- The existing mocked-IPC access/inventory UI suite still runs independently.
- `apps/desktop/check-native.py` now performs cash and credit checkout in the
  unmodified Windows release through accessibility controls, checks receipt IDs,
  balances and stock, then force-terminates and verifies the recovered receipt.
  The Windows workflow blocks outbound traffic for the app and WebView runtime.
- Shared-domain request/money fixtures, exact display formatting, repository
  verification/lint/typechecks and the bundled frontend production build remain
  required checks. The browser workflow also builds/runs the Rust-backed cashier
  integration fixture. Current execution results are recorded in PR #121.

## Remaining scope

Customer master/dues collection, printing/export, returns, split-tax/GST invoice
numbering, staff roles, verified business/device identity, backup/key recovery,
LAN/cloud transport/acknowledgement and signed public distribution remain. This
is an engineering build using synthetic data. No theme, marketing or Android
work is included.
