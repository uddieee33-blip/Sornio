# Windows local access — 26 October 2026

The native draft app previously opened stored content immediately. Review 0.2.0
adds password setup and an offline lock/unlock screen; all draft data commands
require an unlocked session held by the Rust process. The local credential does
not create a verified business account or authorize a paid plan.

## Data and access behavior

- Schema v3 adds one initialized access record without changing saved drafts or
  recovery copies. An unset hash permits first-time setup; a missing record is
  an error, not an invitation to replace credentials.
- Setup uses an OS-generated random salt and Argon2id, with 19 MiB memory, two
  iterations, one lane and 32-byte output. Stored verification parameters are
  bounded before hashing. Only a hash is retained in the encrypted database.
- A second process cannot overwrite configured credentials. A successful setup
  or unlock opens only that process's session, and only after the SQLite access
  write commits. Failed writes and malformed hashes never grant access.
- Five failed attempts impose a persisted 60-second wait. Reopen or rolling the
  clock backward does not clear it. As with the device key, this is not a defense
  against someone executing arbitrary code with control of the Windows profile,
  database files and system clock.
- Every load, save, history list and restore goes through the authorized native
  wrapper. The UI receives a status and safe error code/message; it never receives
  a password hash, database key, arbitrary SQL/path or a role-setting command.
- Argon2 and SQLite operations execute off the UI thread under one native mutex.
  Explicit lock revokes the session. Closing/restarting the app loses the session.
  Locking one process does not revoke a separately unlocked process.
- The UI asks before discarding unsaved edits when locking. A failed lock leaves
  fields intact. Password form values clear after an authentication attempt, and
  the native command's owned password string is zeroized. This does not guarantee
  wiping all IPC/runtime copies. Ordinary browsers show only an installed
  app message, with no local-storage/IndexedDB fallback.

## Validation and limits

Local SQLCipher tests cover every locked data command, restart, cross-process
setup refusal, persistent attempt limits, failed access writes, v2 migration,
invalid passwords, bounded malformed hashes, unique salts and missing metadata.
The existing draft/history regression tests remain included.

Desktop TypeScript/Vite builds and interaction checks cover setup confirmation,
lock cancellation, failed lock, unlock errors, hidden locked content, recovery
copies, stale writes and narrow/light/dark access. The browser harness uses
mocked IPC. The Windows workflow exercises the normal release binary with
outbound traffic blocked for both the app and WebView; its acceptance adds real
password setup, manual lock/unlock and wrong-password refusal after termination.

This remains an unsigned test-data review. Verified identity/import, owner and
staff roles, per-business isolation, credential change/recovery, idle lock and
session revocation, production billing/stock/ledger/outbox, backups, LAN/cloud
sync, verified paid entitlements and physical hardware acceptance remain.

Reference: [RustCrypto Argon2 0.5.3](https://docs.rs/argon2/0.5.3/argon2/).
