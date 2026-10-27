# Native Windows owner and staff authorization

## Scope

Continue merged billing PR #121 from main
`97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. No theme, Android,
marketing, cloud database or billing-rules redesign. Keep SQLCipher and the
Windows Credential Manager key boundary unchanged.

An owner provisions business name/type, their name, a unique account name and a
10–128 character password. All credentials use independent random Argon2id salts
with bounded verification parameters. Native IPC wraps password strings in
`Zeroizing`; passwords and hashes never appear in command responses or audit
payloads. The renderer clears password fields after each attempt and stores no
credentials/session in browser storage.

## Permissions

Every shipped sensitive IPC command enters native `Workspace`. Renderer checks
only simplify the visible controls; calling IPC directly does not bypass Rust.

| Capability | Owner | Manager | Assistant Manager | Cashier |
| --- | --- | --- | --- | --- |
| Read business name/type and local catalogue | Yes | Yes | Yes | Yes |
| Prepare, post, recover and acknowledge own sales | Yes | Yes | Yes | Yes |
| Recover another staff member's active checkout | Yes | No | No | No |
| Add catalogue items and opening stock | Yes | Yes | Yes | No |
| Stock corrections, including negative adjustments | Yes | Yes | No | No |
| Aggregate cash/credit balances and invoice reports | Yes | Yes | No | No |
| Business settings, private notes, saved-copy history/restore | Yes | No | No | No |
| Create/enable/disable staff or assign staff roles | Yes | No | No | No |
| Read identity audit / billing outbox | Yes | No | No | No |
| Post refunds/reversals | Unavailable | Unavailable | Unavailable | Unavailable |

Refund posting has no native command or engine yet. This change grants no new
financial operation, receipt deletion, settled UPI/card claim or outbox delivery.
The owner account cannot be disabled/demoted, staff creation cannot assign Owner,
and stale staff revisions cannot overwrite newer changes. Account names are
case-insensitive ASCII letters/numbers/dash/underscore. At most 100 retained
accounts (including disabled accounts); disabled identities are not deleted.

## Identity and isolation

Each encrypted database receives independent CSPRNG 256-bit business and workspace
IDs. SQLite rejects identity-ID replacement/deletion. Every data command requires
an expected `{businessId, workspaceId}` scope and compares it to the database and
the authenticated native session. Scope never selects a database or grants a role.
Only authenticated `read_local_session` returns the scope. No IPC accepts keys,
SQL, paths, user IDs as session claims, or renderer roles as authority.

One database is bound to one business/workspace; its existing invoice/catalogue
IDs remain stable, and records cannot be addressed in another database by
reusing an operation ID. Two isolated business databases and a transplanted
in-memory session are tested. This build still opens **one local business per
Windows profile**. It does not add a multi-business switcher or import/move data.

“Verified” here means the credential and immutable scope have been verified
against this local encrypted store. It is not legal business verification,
cloud-account verification or trust in an arbitrary copied database. A compromised
Windows profile can access its Credential Manager secrets, as before.

## Session and concurrency rules

Sessions live only in native memory, bind actor, scope and account revision,
expire after eight hours and refuse commands after 15 minutes of inactivity.
The UI also locks on idle. Restart always requires login. Disabling an account
or changing its role increments its revision; previously authenticated sessions
fail on their next command, including other application processes. A failed login
clears any prior session.

Authorization and every mutation share the same SQLite immediate transaction:
permission checks repeat **after** acquiring the writer lock, so a queued stale
operation cannot execute using permissions checked before revocation. Protected
reads check authorization in their SQLite snapshot. No network or hosted service
is needed to authenticate or authorize.

Authentication has persistent per-account and database-wide failed-attempt
budgets (five failures, 60-second cooldown); cycling unknown account names does
not avoid the budget. Failed-attempt state must commit before an authentication
failure returns. Successful session publication follows the authentication/audit
commit. Password verification and SQLite waits stay off the native UI thread.
Lock always clears the in-memory session even if its audit cannot be written.

Prepared checkout and completed-invoice attribution prevent a cashier from
reading, replaying, confirming or discarding another actor's sale. Owner recovery
is retained. Old receipts have unknown historical attribution and can be recovered
by Owner or read through authorized Manager reports, not by cashiers. Native
responses redact aggregate balances and private draft notes for restricted roles.

## Append-only audit

New `local_identity_audit` rows include local business/workspace, native actor ID
and role, action, target, timestamp and safe JSON details. Staff creation/change
includes account snapshots (before/after for changes), never password material.
Provisioning, staff changes, settings, stock operations, checkout and posting
require their audit write within the same transaction; an ignored/failed audit
insert aborts the mutation. Successful exact financial replay does not duplicate
financial records. Login failure audits persist with the failed-attempt update.
Native dispatch records permission/scope denials using actual native identity,
never request-supplied actor fields. Lock/denial auditing is best effort during a
storage fault; access still fails closed. UPDATE, DELETE and SQLite REPLACE cannot
rewrite audit or invoice attribution, including after reopening.

## Schema migration: v6 → v7

The existing migration writer transaction creates local identity, principals,
identity audit and invoice-attribution tables and adds actor attribution to the
active checkout. All older pending migrations are in that same transaction.
Prior financial records, drafts, history, inventory and operation IDs are kept.
A frozen PR #120 fixture and independent encrypted v6 fixture verify preservation.

An existing review password migrates to username `owner` with the same password
hash and failed-attempt state. There were no individual staff identities in v6:
anyone who already knew that shared review password remains a holder of its
legacy owner authority. This migration cannot establish which previous password
holder is the legal owner. No unlocked session migrates. Existing checkout
attribution is unknown and reserved for owner recovery. A fresh unconfigured
store requires owner provisioning; configuration cannot overwrite an existing
owner. Newer schemas/unreadable databases still fail closed. Downgrading to v6
is unsupported and rejected by that version.

## Verification and release limits

Rust tests cover the full role matrix through actual data methods, every locked
sensitive operation, owner protection, role/disable revocation across connections,
writer-lock revocation, cross-business scope/session isolation, private-note and
report redaction, checkout ownership and completed-receipt replay, unique salts,
persistent rate limiting/clock rollback, native idle/absolute expiry, immutable
audit, provisioning/audit failure rollback and migration/regression behavior.

The React/SQLCipher test exercises all four roles, raw IPC bypass attempts, real
cashier posting, role-change lockout and disabled-account refusal. Existing
lost-reply/idempotency/restart/stock tests continue. Windows acceptance runs the
actual release binary through keyboard/UIA with application and WebView network
blocked, and now adds staff creation, restricted checkout, role assignment and
disabled-login refusal. Final CI outcomes are recorded in the PR body.

This remains an engineering build. No password change/reset/recovery, ownership
transfer, business switching, LAN transport, pairing, device enrollment or cloud
identity federation is implemented. Future LAN peers must authenticate to a
trusted store authority, retain these business/workspace/account revisions and
use the same native authorization boundary. This PR does not export password
hashes/keys or accept peer-supplied roles as a shortcut. Credential revocation on
disconnected independent replicas is not solved; no such replication is enabled.
Signed installer/update, clean-machine installation/upgrade/uninstall, physical
shop-PC testing, backups/key recovery, GST numbering and printing/returns remain
customer-release gates. The pre-existing hosted Supabase migration-history error
is outside this local authorization change.
