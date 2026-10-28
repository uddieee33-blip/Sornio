# Offline encrypted backup and recovery threat model

Integration workspace based on PR #124 (`85fc6b6`) plus backup PR #125 (`69ed5db`).
Only an authenticated Owner can export or restore an established workspace; a fresh,
empty workspace can recover using the archive's original Owner credentials. This is
local authority, not legal/cloud identity verification. Previous PR results apply to
those original heads, not this integration. Native Windows, browser and final-head CI
must be run on this integrated tree before acceptance. LAN integration remains separate.

## User procedure

1. Save screen edits and finish or durably prepare the current checkout. Open
   **Encrypted backup & recovery** in the installed Windows workspace.
2. Enter the current Owner password and a separate recovery passphrase of 14–128
   characters, confirm it, and choose a new `.sorniobackup` filename through the
   native Windows save dialog. USB/external disks are supported as OS-selected
   destinations. Existing files are never replaced, even after overwrite consent
   in the OS dialog: choose a new name. Cancellation creates no final backup.
3. Wait for “saved and verified”. Keep the recovery passphrase separately from
   the archive, preferably in a password manager or a secure written record.
   Keep at least one verified copy off the original PC and periodically perform
   a test restore into a fresh Windows profile. A backup left only beside the
   original database cannot protect against a lost disk or ransomware.
4. To restore, select the archive with the native open dialog. Enter its recovery
   passphrase and the original Owner password saved inside it. A configured
   destination also requires fresh authentication with its current Owner password.
5. Inspect business ID/name, UTC snapshot timestamp, core schema, invoice/ledger/
   audit/outbox counts, saved-checkout flag and ciphertext SHA-256. Type the exact
   `RESTORE <backup-id-prefix>` phrase and re-enter the passwords. Password inputs
   are cleared after every operation; the preview does not retain them.
6. A complete encrypted safety backup of the current database is first written
   under the native app-data `recovery-safety` directory, using the supplied
   recovery passphrase. Restore refuses if this fails. After success, unlock
   again with the original Owner password. The recovery panel shows the durable
   last-completed restore ID/time, including after a lost reply or restart. Review any saved checkout before
   continuing; committed invoice receipts replay their original IDs/results.

Restore is an explicit point-in-time replacement, **not a financial merge**. Sales
and edits newer than the snapshot disappear from the active workspace and remain
only in the mandatory safety copy. Preserve that copy, reconcile against external
records, and do not independently resume selling on both the original and restored
PC. Restoring a snapshot does not acknowledge or resend an outbox event.

## Data and identity

The snapshot includes all SQLCipher tables, indexes, triggers and rows: saved
business draft/history, access hash/rate-limit state, item catalogue and stock,
inventory events, original invoices and IDs, stock allocations, ledger postings,
billing audit, pending outbox rows, prepared/committed cashier checkpoint and
cancelled operation fences. It also retains immutable recovery audit and a stable
random 256-bit local recovery business ID. This ID is created once transactionally,
independent of the editable business name, and is preserved on a new device.
It does not claim legal/cloud identity or LAN enrollment.

A configured destination, or an unconfigured legacy database that already holds
business data, can restore only its matching recovery business ID.
Another business must use a fresh, unconfigured Windows workspace/profile. No
renderer-selected path, business name, session boolean or preview object can
bypass this check. Preview metadata and the selected source path are held natively;
restore re-verifies the exact ciphertext hash and the live database fingerprint
under its writer lock. Changing either invalidates the preview. A fresh session
generation is committed with restore. Existing sessions are invalidated; mutation
authorization checks the generation again after acquiring the SQLite writer lock.

Recovery storage uses an independent version-1 extension (`local_recovery_*`),
created transactionally on store opening without renumbering core schema 9 or
colliding with its identity/customer/payment migrations. The archive's encrypted manifest records
format 1, original core schema, snapshot ID/time and a canonical logical SHA-256.
Supported archives are format 1 with core schema 5, 6 or 9. Schema 5 and 6 archives
migrate in encrypted staging to schema 9 without replacing invoice IDs or financial rows.
Schema 7 and 8 archives are rejected until their exact legacy schemas are verified.
Unknown/newer formats and schemas, raw database/WAL copies and pre-feature files
without a manifest are rejected; use the matching application version to export
a supported backup. Future schema additions require updating the explicit trusted
schema allowlist and regression fixtures before accepting their backups.

## Encryption and key management

The operational database continues using a random device secret held only by
Windows Credential Manager. Backups do **not** copy/export/wrap that device secret.
`sqlcipher_export` creates a new database directly under the separate recovery
passphrase. SQLCipher 4 defaults provide a fresh random salt, AES-256 encryption,
PBKDF2-HMAC-SHA512 (256,000 iterations) and per-page HMAC-SHA512 authentication.
A SQLCipher raw-key-shaped passphrase is refused. No plaintext database, plaintext
SQL dump, password file, key sidecar or plaintext business metadata is created.
The archive is a single encrypted SQLCipher database, not a compressed ZIP.

The recovery passphrase is an offline decryption capability. Strong independent
passphrases are essential: an attacker with the file can guess without the app's
rate limit. The extra local-password prompt protects the application's workflow;
it is **not** a second independent encryption factor. Someone who knows the
recovery passphrase can use SQLCipher tools to read all archived data, including
the stored local password hash, or deliberately forge a new compatible archive.
There is no publisher signature, remote attestation or guarantee of provenance.
SHA-256 identifies the reviewed ciphertext and detects replacement between
preview and restore; a hash kept beside a file is not proof of authenticity.

Native Tauri password arguments are wrapped in `Zeroizing` and SQLCipher memory
security remains enabled. React has short-lived password fields only, with no
local/session storage, logging or URLs. JavaScript cannot guarantee immediate
memory erasure; OS memory, swap/hibernation, malware or a compromised signed-in
Windows profile are outside this boundary. Encryption cannot prevent deletion,
ransomware, physical damage or malicious actions by a legitimate credential holder.

## Consistency, integrity and failures

An immediate SQLite transaction holds the source writer lock while
`sqlcipher_export` copies one committed snapshot. It includes committed WAL data;
it never copies a live database file separately from its WAL. Other writers wait.
The financial posting engine is unchanged. An uncommitted sale is either absent
or fully committed before the snapshot acquires its lock.

The snapshot is built in a random, access-restricted encrypted temporary file in
the destination directory. The manifest is finalized; SQLCipher page authentication,
SQLite integrity and foreign-key checks run; then the file is synchronized and
published atomically without replacing an existing filename. A final filename is
never published while still under construction. Required recovery audit writes
fail closed. `backup_prepared` records an attempt; `backup_exported` is written only
after publication. A lost success reply can leave a valid backup; choose/verify
that file rather than overwrite it. A late audit/storage error can likewise leave
a valid published file, so preserve it and verify it. The original business data
is never modified by failed export.

Import copies at most 512 MiB of ciphertext into private encrypted staging. Before
running migrations or application writes, it checks supported schema, exact
compiled table/index/trigger definitions, manifest, all page HMACs, logical digest,
SQLite integrity and foreign keys. Unexpected executable schema is rejected.
The original archive is opened only for reading and is never migrated in place.
This feature caps archives at 512 MiB; larger workspaces need an explicitly tested
larger-database workflow. No decompression or unbounded archive extraction occurs.

After the safety copy succeeds, the native database's contents are replaced inside
one immediate transaction, retaining the destination's device encryption key and
file/WAL identity. Schema/data import, restored identity, fresh session generation
and append-only `restore_committed` record commit together. Any SQL error, full
storage or process termination before commit rolls the entire replacement back.
There is no live-file rename/swap that can leave another process writing to an old
inode. Foreign-key enforcement is re-enabled after success or error. A committed
restore followed by a lost reply remains committed and locked; the old preview
cannot silently execute it again. Reopen/unlock and inspect the restored records.

A forced termination can leave encrypted temporary/staging files and encrypted
journals. They are never presented as completed backups or used automatically.
Retry with a new export filename or re-select the valid archive and preview again.
Keep original database, WAL and Windows profile intact. The test suite kills real
child processes before backup publication and after dropping target tables inside
an uncommitted restore, then reopens and verifies complete financial state.

`sync_all`, SQLite FULL synchronous mode and atomic publication protect normal
process interruption; they cannot guarantee a USB controller honestly flushed its
cache. Safely eject external media and verify the copied archive on another device.
No claim of arbitrary power-loss durability, forensic secure deletion, removable
media hardware acceptance or ransomware-resistant storage is made.

## What cannot be recovered

- Unsaved screen edits, incomplete/noncommitted transactions and post-snapshot
  financial changes, except those retained in a later safety/other backup.
- External documents, statement CSVs, print spool jobs, installed app binaries,
  Windows vault entries, peripherals, cloud/LAN configuration or device licenses.
- A destroyed/missing archive without another valid copy, or an archive whose
  recovery passphrase is lost. There is no vendor master key or encryption bypass.
- An original Owner password forgotten for this snapshot: this build preserves
  and requires it; there is no reset/ownership-transfer flow. Use a different valid
  snapshot whose original credentials are known. Preserve the files for a future
  explicitly designed credential-recovery protocol; do not delete the access row.
- A missing Windows database key using the raw operational database alone. Do not
  regenerate a key over existing data. A valid independent archive can be restored
  on a fresh Windows profile/new PC using both archived credentials. If the current
  database is unreadable or its vault key is absent, this version will not overwrite
  it in place: preserve it and use that fresh destination recovery procedure.

## Acceptance

Native tests cover committed/pending financial preservation, exact receipt replay,
wrong credentials, corruption/truncation, unknown executable schema, cross-business
refusal, stale preview, storage-full rollback, old-schema migration, immutable audit,
session revocation and real process termination. React acceptance exercises the
real Workspace/SQLCipher fixture. Windows acceptance uses packaged release keyboard/
UI Automation, native save/open dialogs and real ciphertext with outbound app/
WebView traffic blocked. It checks wrong passphrase rejection, cleared inputs,
preview, safety-backed restore and financial state after restart. CI runs the
forced-termination Rust cases on Windows too. Final run results belong in the PR;
unexecuted checks must not be reported as passed.

References: [SQLCipher export/key/integrity API](https://www.zetetic.net/sqlcipher/sqlcipher-api/),
[SQLCipher design](https://www.zetetic.net/sqlcipher/design/),
[SQLite atomic commit](https://www.sqlite.org/atomiccommit.html),
[SQLite WAL durability](https://www.sqlite.org/wal.html).
