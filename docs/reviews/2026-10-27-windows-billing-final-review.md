# Offline Windows billing milestone: final review

## Scope and decision

Review PR #121 against merged PR #120, commit
`fc57404cec4ded352a1d8fcef8efd8a5a53ccfec`. The initial review snapshot was
`1f4a2518e3fd376b633d3ca4253a2a553d79016a`; all 457 tracked blobs were restored
and checked against that GitHub tree before local verification. Review covers
every changed file, including native storage/tests, shared contracts, IPC and
capabilities, React checkout/inventory coordination, workflows and documentation.

Merge is appropriate as an incremental engineering milestone once the final-head
core, browser/native-integration and Windows checks pass. It is not customer
release approval. Do not merge automatically. Final-head run links, outcomes and
installer evidence are recorded in the PR description to avoid a documentation
commit changing the very head whose test result it reports.

## Implemented behavior and guarantees

- Search local inventory, use supported quantities/units, preview shared integer
  money rules, review and confirm cash or credit, and display a committed native
  invoice with a stable operation/invoice identifier. Credit needs a customer
  reference; a reference does not establish a customer master or verified identity.
- SQLCipher with WAL, FULL synchronous writes and foreign keys; one immediate
  SQLite transaction commits the invoice snapshot, aggregated stock deduction,
  balanced cash/receivables/revenue/tax ledger, audit and outbox. Every required
  write checks its affected-row count. Success follows successful commit.
- Exact retries return the saved invoice. Changed payloads under an existing ID,
  stale revisions, combined overselling, invalid money and unsupported payment
  claims are refused. Paise and quantities are integers; Rust uses i128 for
  intermediate arithmetic and cumulative balances reach JavaScript as strings.
- An encrypted prepared request survives reply loss, lock and restart. Checkout
  cancellation and posting share the writer lock; retained cancelled IDs prevent
  late requests reviving a discarded sale. Acknowledgement clears the checkpoint,
  preserving committed financial records.
- Native authorization gates all commands. Renderer prices/totals/paid flags,
  arbitrary paths, SQL and keys are not accepted. Main-window local capabilities
  add only the required billing commands, with no shell/filesystem/network grant.
  The production CSP and Windows key-vault code are unchanged from PR #120.
- Append-only billing tables reject updates, deletes and replacements, including
  after reopening; recursive triggers close SQLite REPLACE's delete-trigger bypass.
  The synthetic integration bridge is a Cargo example, outside shipped Tauri IPC.

## Migrations

V4 to v5 creates invoices, stock movements, ledger, audit and outbox plus immutable
record triggers. V5 to v6 adds the single active checkout and retained cancelled-ID
tables. All pending migration steps run in one writer transaction; the schema
version is rechecked after obtaining the lock. Existing drafts, saved copies,
password/access records, products and inventory history remain. V4 preservation
uses an independent frozen PR #120 schema fixture. Newer schemas and unreadable
encrypted databases fail closed. Downgrading to PR #120 after migration is not
supported; it refuses the newer database rather than resetting it.

This review's stale-read fix requires no additional schema migration.

## Review finding fixed

A background `read_cashier_state` response could arrive after an explicit refresh
or checkout action and replace newer state. That could hide a recovered receipt
or display older inventory; native checkpoint/revision checks still protected
financial posting. Checkout now invalidates background reads when a newer read,
confirmation or acknowledgement starts and ignores obsolete success/error replies.

The real Rust/SQLCipher integration regression holds an older catalogue response,
loads a newer snapshot, releases the old response, and checks that the newer
catalogue remains. Existing commit/retry/restart tests remain in that same flow.
No second posting engine or browser persistence was introduced.

## Verification

Local verification passed on the restored snapshot: full `npm run verify` (including
billing, inventory, accounting, security, shared business-domain, 45 native request
fixtures, 13 money cases and exact checkout display), both TypeScript compilers,
lint and desktop TypeScript/Vite production build. Subsequent edits rerun affected
checks. Local dependencies are cached: ESLint 9.39.5 and PGlite 0.5.10 differ from
the lockfile, so fresh `npm ci` GitHub CI is the authoritative dependency check.
Offline `npm ci` could not fetch uncached packages; no manifest or lockfile was
changed to accommodate the environment.

No local cargo/rustc toolchain is installed. The browser workflow now enforces
formatting for both Rust manifests and runs the real SQLCipher unit/integration
suite in debug and release before building the React-to-Rust fixture. Windows
separately runs release tests, builds the NSIS installer and exercises the actual
release app with outbound traffic blocked for the app and WebView runtime.

Required automated evidence includes rollback at every write/commit boundary,
SQLITE_FULL, process termination, prior-history preservation, exact/changed and
concurrent retries, stale/insufficient stock, migration preservation, immutable
audit/outbox, locked commands, unsupported UPI/paid flags, four units, lost replies,
saved-sale/read failures, old background responses and restart acknowledgement.
Native Windows acceptance verifies cash/credit receipt UUIDs/totals, balances,
stock, invalid-input guards, locking, forced restart and durable acknowledgement.

Before this review, all three workflows passed on `1f4a25`: Windows ran 57 tests,
built the engineering installer and passed native acceptance. Final changes must
pass fresh final-head checks; earlier green runs are not substituted for them.

## Release limitations and remaining work

Use synthetic data only: one local workspace per Windows profile and one active
checkout. Customer release still requires verified owner/business/device scope,
business isolation, staff authorization, customer/dues workflows, receipt history
and printing/export, returns/reversals, GST-compliant numbering and split taxes,
backup/key and account recovery, LAN pairing/conflicts and cloud acknowledgement,
paid entitlement verification, signed installers/updates and physical shop-PC
and peripheral acceptance. Existing hosted accounts/records are not migrated.

UPI/card settlement is unsupported. Outbox reads do not acknowledge delivery or
implement sync. Local password access does not protect against a compromised
Windows profile. History in the same database is not a device-loss backup.
Power removal/controller faults and production customer data were not tested.

No theme redesign, Android, subscription redesign, new runtime dependencies,
lockfile changes, hosted migrations or unrelated application behavior are included.
