# Windows offline operation: delivery contract

## What the current build can and cannot do

The Windows EXE in `desktop/windows` embeds the hosted Next.js app. It can keep
the *already open* client screen and its local encrypted business records
working when connectivity is lost. The store saves account-scoped records on
this device and retries cloud sync when it reconnects. A cold launch or a
server-rendered route that was never loaded still needs the host. The service
worker intentionally holds only the generic reconnect page; caching private
server responses would put tenant data and stale access decisions into a
shared browser cache. This EXE is **not yet an offline Windows product**.

The offline warning is now explicit about those limits. A sale or invoice can
record cash locally in an open session. While the device reports offline, the
ledger rejects UPI, card and bank-transfer collection as paid; create an unpaid
invoice instead, then confirm the external settlement when connectivity is
available. `navigator.onLine === true` proves neither bank settlement nor cloud
sync. The existing reference-based digital collection is a manual record and
still needs real reconciliation; a QR by itself is a payment request.

## Target architecture

The Windows application must ship its business UI and essential runtime inside
the package. Local navigation, login to a previously provisioned device,
catalogue, customer ledger, stock, bills, receipts, cash payments, expenses,
reports, backup and restore must use an encrypted per-business local database
without contacting the host. The first account sign-in and initial data import
need a connection; a returning owner unlocks the locally provisioned business
with a device credential. Separate businesses and staff on one PC must have
separate keys and roles. Locking or signing out removes decrypted data from
memory and does not silently erase unsynced work.

Every financial action must be committed transactionally to local storage
before the UI says "saved" or prints a final receipt. Bills, stock movements,
customer dues, cash ledger entries and audit events must share one durable
operation ID. Closing the app or losing power after a successful response must
not lose or duplicate that operation. If storage fails or fills, block the sale
with a visible recovery path; never quietly switch to memory-only data.

The sync outbox is append-only, tenant-scoped and survives restart. Operations
carry stable UUIDs, business and actor IDs, local sequence, timestamp, base
revision and their accounting effects. On reconnect, fetch remote changes,
deduplicate by operation ID, upload in order and acknowledge only committed
server results. A retry must be safe after an unknown response. No last-write-
wins replacement of stock or payments: show a conflict for human resolution
when another device changed the same item. Keep an immutable audit history.

The server must issue a signed, scoped entitlement for a bounded offline period
after an online check. The local app verifies the signature and expiry without
trusting a stored boolean or accepting clock rollback. Purchase, renewal and
first activation require a connection. Previously paid features can continue
within a defined offline lease, with a clear countdown and an owner-visible
path if it expires. This policy needs a product decision before release.

UPI QR can be shown from preconfigured payee details, but the app must not
mark a digital payment received until there is reliable confirmation from the
bank/provider or a clearly labeled, auditable manual confirmation. Ordinary
network payments, cloud sync, remote team invitations, automatic SMS/WhatsApp
delivery, online subscription purchase and cross-device changes inherently
need connectivity. Offline invoices can remain unpaid and reconcile later.
Some separately supported payment instruments may offer their own offline
rails; this app cannot assume them or claim their settlement.

## Implementation order

1. Package the local runtime and versioned UI assets with the Windows EXE.
   Cold-launch it with the network disabled; opening every daily-work screen
   must not require a Next.js server response.
2. Add encrypted local database, migrations, device unlock and account-scoped
   onboarding import. Never store a provider secret in the desktop package.
3. Move billing, stock and cash ledger commands to transactional local writes.
   Add crash/restart and disk-full tests before accepting a "saved" result.
4. Implement operation-based sync plus conflict review on the existing
   authenticated business API. Test two devices changing stock and the same
   customer concurrently, lost responses, retry and duplicate submissions.
5. Add signed offline entitlements and explicit renewal policy, then verify
   on real Windows hardware with printer, barcode scanner and power cuts.
6. Connect provider-confirmed digital settlement and messaging separately.

## Release acceptance

On a previously set up Windows PC: unplug the network and restart the PC.
Unlock the correct business, scan a product, issue and print a bill, collect
cash, record a due and expense, change stock, run a report and restart again.
Every record must survive. A digital QR request must remain unpaid until
confirmed. Reconnect, sync twice, inspect the server and a second device; all
operations appear exactly once and any conflicts are explicit. Repeat with a
full disk, corrupt local store, expired entitlement, two staff accounts, two
businesses and a failed update. Do not call the app fully offline before this
passes on Windows hardware.
