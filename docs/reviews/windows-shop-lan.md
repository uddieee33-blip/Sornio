# Single-shop LAN hub: initial engineering milestone

Base: merged billing milestone #121, main `97bfe2f`. Authorization #122,
customer #123, settlements #124 and backup #125 are unmerged and are not silently
included. This branch is focused on LAN authority and reuses the original invoice,
stock, ledger, billing audit and immutable outbox implementation.

## Authority and availability

Exactly one designated shop hub owns shared inventory and final invoice ordering.
Every computer has its own SQLCipher database and its own Windows-vault device
secret. No computer opens a writable SQLite file across SMB, a NAS or another
computer's shared folder. Clients keep catalogue snapshots, their request queue,
verified receipt copies and an outbox cursor. They do not post a second inventory
or financial ledger locally.

The hub uses the existing SQLite immediate writer transaction and original native
invoice code, extracted into one transaction helper. Price/stock revisions,
quantity, integer paise, original tax/rounding rules and stock checks remain
native. Concurrent requests serialize at the hub. Invoice, stock deduction,
ledger, original billing audit/outbox, device attribution, terminal request outcome
and LAN audit commit together. A failed required write or failed commit exposes
neither a successful receipt nor a partial sale.

Two clients reading the same product revision may both prepare a sale. Only a
request consistent with the current revision/stock can commit. The second may be
refused as stale even when enough stock remains. It must refresh and review a new
operation after explicitly acknowledging the old refusal. This initial milestone
does not silently reprice/rebase a pending sale and has no stock reservations.

| Condition | Available behavior |
| --- | --- |
| No internet, working shop LAN/hub | Normal native cash/credit checkout, shared stock and authorized reports. No internet service, public CA, DNS lookup or cloud account is required. |
| Client temporarily disconnected | Cached catalogue and already received active receipts remain readable; prepared requests and their exact IDs survive restart. Unsaved carts are only screen state. No new shared-stock invoice can be confirmed locally. |
| Reply lost or result uncertain | Keep the same immutable queued request/operation ID. Do not take a second payment or create a replacement sale. Retry against the original hub or recover its original receipt from the outbox. |
| Hub stopped, app closed or PC off | Clients cannot finalize shared-stock sales. There is no automatic second hub, standalone fallback, reservation quota or split-brain election. The physical hub can continue its own local checkout if its app/database are available while its listener is stopped. |
| Hub app reopened | Its encrypted CA/server keys and native grants reopen; the approved listener resumes even while the local hub UI is password-locked. This is an app-owned listener, not an installed Windows background service. |
| Changed hub IP | A client may update only its private LAN address after fresh local authentication; hub/root/business identity and pending IDs stay unchanged. A different server at that address cannot satisfy the pinned trust chain. |

For real shop use choose a fixed private hub IP/port and arrange Windows private
network firewall access. Loopback addresses exercise one machine only. Listening
status proves a bound socket, not reachability from another physical computer.
No firewall, public port forwarding, discovery or network security settings are
changed automatically.

## Pairing and identity

1. On the chosen hub, save the shop draft, unlock and enter its local password
   again to designate the hub at a private IP/port. Native code creates immutable
   random shop/hub IDs, a private shop CA, and a separate TLS server key/certificate.
2. On a fresh client with no local stock, invoices or active checkout, configure
   local password access and export its computer pairing request. Native code
   creates the device ID/key and signed PKCS#10 CSR. Its private key never leaves
   its original encrypted database.
3. Move the **public** request file to the hub. Its administrator freshly
   authenticates, imports and reviews the request, compares its SHA-256 CSR
   fingerprint against the fingerprint shown on the intended client PC, types
   that fingerprint, and chooses Cashier/Manager/Owner computer capability before
   approving it. Native code verifies the CSR signature, ignores applicant-supplied CA/server
   extensions, and issues a ClientAuth-only certificate. Retrying identical
   enrollment returns the same certificate. Changing a registered request is
   refused rather than replacing another identity.
4. Move the public approval file back. Compare its SHA-256 CA fingerprint with
   the fingerprint shown on the actual hub PC through a trusted physical/out-of-
   band channel. Type that hub fingerprint, reauthenticate locally and join.
   Merely trusting the fingerprint printed in an untrusted transferred file is
   insufficient. Native code binds the approval to this device's original CSR/key
   and refuses certificate substitution.

Pairing files contain certificates/CSRs and shop/device metadata, not database
secrets, private keys or plaintext passwords. OS save/open dialogs own paths;
the renderer cannot select a database path or make arbitrary network requests.
Pairing files are written without overwriting an existing filename. If a file
save is cancelled after enrollment/configuration commits, the native configuration
is retained; export/approve the same request again rather than generating another
identity. There is no automatic unpair/reset or conversion of a data-bearing till
back into a separate stock authority.

This is local shop identity, not legal/cloud verification or hardware attestation.
Merged main still has a shared local password: holders of the hub password share
its local administrator authority. These computer capabilities do not claim to
implement individual staff accounts. Before a staff-enabled release, integrate
#122 and authorize the intersection of user permissions and approved device
capabilities, with its verified workspace scope and session revocation.

## Transport and native permissions

Transport is bounded, version-1 length-framed JSON over mandatory TLS 1.3 using
rustls' standard certificate-chain, hostname, validity and signature verification.
No custom accept-any-certificate verifier, insecure mode, bearer pairing token or
TLS downgrade is provided. The client trusts only the explicitly approved shop
CA; it validates the fixed server DNS SAN `sornio.shop` while connecting directly
to the configured IP. The server requires ClientAuth certificates from its shop
CA. No packet claims its own role.

After TLS proves private-key possession, every command checks exact approved leaf
certificate hash, device ID, business ID, hub ID, current enabled flag and role
inside the hub writer transaction. Disabling/changing a device takes effect for
subsequent commands, including resumed TLS sessions. Unknown, spoofed, wrong-shop,
revoked and insufficient-role requests return no business data or successful
financial result. Required denial audit writes fail closed.

| Native capability | Cashier computer | Manager/Owner computer | Local hub administrator |
| --- | --- | --- | --- |
| Current catalogue and stock | Yes | Yes | Yes |
| Post native cash/credit sale | Yes | Yes | Yes |
| Recover own exact operation/receipt | Yes | Yes | Yes |
| Receive invoice outbox history | Own committed operations only | Authorized shop history | Original local outbox |
| Shop invoice report | Denied | Yes | Yes |
| Correct inventory, create catalogue, enroll/change/disable computers | Denied remotely | Denied remotely in this milestone | Yes, existing native stock operations; enrollment/grant changes require fresh password |

Client mode fences local inventory mutation and invoice posting natively, including
inside original writer transactions to prevent a second process racing pairing.
Hiding stock-entry controls is only usability. The hub listener deliberately uses
mutual-TLS/device authority rather than the hub UI's unlocked boolean; locking the
owner screen must not stop authorized tills. Client commands still require their
local native password session. Previously delivered data cannot be recalled from
a disconnected device; revocation prevents new access/commits, not knowledge of
old receipts or physical possession of an old cache.

Keys are stored only in SQLCipher and native TLS memory. Native password arguments
are zeroized; private configuration is never serialized over IPC or logged.
Native key buffers/configuration serializations are zeroized where owned. This
is not protection against malware, memory inspection or a compromised signed-in
Windows profile. Copying a device database together with its vault secret clones
that identity and is unsupported; there is no hardware-bound enrollment claim.

Only RFC1918 IPv4, loopback or IPv6 ULA addresses are accepted; wildcard/public
addresses and hostnames are refused. The listener accepts at most eight concurrent
connections, bounds requests to 64 KiB and responses to 8 MiB, applies socket
read/write timeouts, and processes one command per connection. Approved peers or
hostile LAN traffic can still deny service; Internet-facing deployment and
comprehensive DoS resistance are not claimed. The certificate validity interval
is 2020–2100 to support offline clocks, but invalid clocks still fail TLS; clock
checks are never disabled. Revocation is checked from the native database rather
than an internet CRL service. Operational key rotation/CA replacement remains a
future explicit migration.

## Durable synchronization and accounting

The client records the exact bounded request before attempting network posting.
Its durable attempted marker precedes sending. The hub's globally unique operation
ID is bound to device and canonical request; a changed body or another device
cannot retrieve/reuse it. Successful, rejected and cancelled terminal outcomes
are immutable. A committed outcome is replayed exactly, including after restart;
a prior rejection never changes to success merely because stock was replenished.

Unsent queued requests may be cancelled atomically on the client. Once attempted,
unknown requests require an online hub cancellation fence. Posting/cancelling are
ordered by the hub writer lock; cancellation that discovers an already committed
invoice durably retains that receipt and refuses to discard it as unsaved. Local
cancellation decisions and attempted markers also share the client writer lock
so two app processes cannot race them. Unknown results cannot become editable
fresh sales just because a connection failed.

The original transactional outbox is retained; it is not acknowledged/deleted by
this LAN transport. A bounded scan advances through at most 20 global events per
sync, applying native role filtering. A client atomically saves visible events,
cache and cursor; replay is deduplicated. Each own receipt delivery includes its
native original request hash before it may resolve an existing local queue item.
Manager-visible events from another device cannot become this device's receipt.
Receiving an event never re-runs invoice/stock/ledger posting on the client.
Catalogue snapshots are current at their hub transaction; old event history can
need further refreshes. A direct exact-ID retry resolves a pending request without
waiting for history backfill. Checkout balances on clients are that computer's
confirmed receipts, not silently substituted whole-shop totals.

The separate version-1 LAN extension leaves core schema 6 and existing IDs/data
intact. The business/hub IDs, certificate material, device grants, append-only LAN
audit/outcomes, encrypted client queue/cache/cursor and original outbox survive
normal restart. Write failures and process termination before commit roll back;
a crash after commit but before reply is an uncertain client result that exact
replay resolves. There is no distributed transaction across client/hub: a failed
local receipt write after hub commit remains uncertain until retry/outbox recovery.

## Remaining release gates

This is one working hub and paired-native-client engineering milestone, not full
multi-PC production readiness. Automated loopback tests do not establish physical
Windows Ethernet/Wi-Fi, router isolation, firewall, sleep/hibernate, DHCP, printer,
network partition, power-loss hardware or concurrent counter/performance acceptance.
The hub is a single availability authority; there is no disconnected final selling,
stock quota protocol, failover, replicated writable ledger, automatic repair,
remote inventory administration or cloud sync. Duplicate installations of a hub
with copied credentials must never run independently.

An unavailable/revoked terminal with an uncertain sale requires checking the hub's
saved invoice ID/report and restoring its authorized device access if appropriate;
never invent a replacement operation ID or take another payment. Do not clone a
store or silently issue new business/hub IDs to resolve an uncertain operation.

Backup #125 must be integrated deliberately before protecting a LAN shop. Its
trusted-schema allowlist must include this extension, and hub restore/rollback
needs an explicit recovery epoch, peer re-enrollment/reconciliation and fencing of
old operations/grants. Restoring/cloning an old hub database while clients keep
newer receipts can resurrect revoked grants or duplicate financial intent; it is
unsupported in this initial milestone. Certificate/private-key backup and lost-
device recovery likewise require a documented future protocol. Owner/staff #122
and sibling billing/customer changes require integration and re-verification
rather than parallel copies of native engines.

## Evidence

Native tests exercise two-client last-unit concurrency, TLS identities and role/
scope denial, required-write rollback, operation/request/device conflicts, exact
retry, cancellation, local receipt-write recovery, cached disconnection, endpoint
change, encrypted restart and real child-process termination before/after hub
commit. React acceptance runs three native processes with two cashier windows,
public-file pairing/fingerprint approval, real TLS checkout competition, offline
queueing, hub/client process kills, reconnect and receipt recovery. Windows CI
runs the same Rust network/concurrency/kill cases and packaged native UIA checks
hub designation, bound listener, unchanged financial state and persisted trust
after forced restart. Actual results and any unexecuted gates are recorded in the
PR; no passing Windows/hardware result should be inferred from these test definitions.

Local acceptance on 2026-10-28: 66 Rust tests pass in both debug and release
(one ignored child-worker entry point is explicitly executed by its parent test),
including all 10 LAN cases. The three-process/two-client real TLS React acceptance,
existing real native cashier integration and mocked access/UI regressions pass.
Desktop production bundling, ESLint, both repository TypeScript checks and the
complete shared-domain/repository verification suite pass; production npm audit
reports zero known vulnerabilities. Local Linux Rust tests use system OpenSSL
with bundled SQLCipher; Windows CI keeps the existing vendored OpenSSL build.
Local browser checks use Chrome headless 136; CI installs its pinned Playwright
browser independently. A Linux host cannot establish Windows vault, packaged
Tauri, file-dialog or physical-network acceptance. Those gates need the actual
Windows workflow and hardware results; the PR records their status separately.

References: [rustls mutual client authentication](https://docs.rs/rustls/0.23.46/rustls/server/struct.WebPkiClientVerifier.html),
[rcgen verified CSR parsing](https://docs.rs/rcgen/0.14.10/rcgen/struct.CertificateSigningRequestParams.html),
[SQLite transactions](https://www.sqlite.org/lang_transaction.html),
[Windows socket binding security](https://learn.microsoft.com/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse).
