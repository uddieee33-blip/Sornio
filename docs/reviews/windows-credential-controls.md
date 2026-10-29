# Authenticated credential controls — 29 October 2026

This follow-up extends PR #124 from security baseline
`ed553c50d4bd795095b6f0216a660d4bf63275cb`. Merged main remains
`97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. It closes the missing authenticated
password-rotation and staff-reset controls identified in the security report.
Forgotten-owner-password and missing-vault-key recovery remain unavailable.

## Native behavior and trust boundary

- `packages/local-store/src/access.rs:343`, `change_password()`: an enabled,
  unexpired native user must provide their current password. The account comes
  from the native session; the renderer cannot choose another principal. All four
  roles can change their own credential. Success revokes every session for that
  principal, including the caller, through a revision increment and requires a
  new login. Owner rotation also removes the obsolete shared-password verifier
  from `workspace_access`; it does not remove or replace the owner identity.
- `access.rs:382`, `reset_staff_password()`: requires native Owner authority,
  fresh Owner-password verification and the target's expected revision. It
  refuses Owner targets, preserves the staff role and enabled/disabled state,
  increments the target revision and revokes that staff member's existing
  sessions. Manager, Assistant Manager and Cashier cannot invoke it even when
  supplying the correct Owner password while signed in under their own role.
- Both reuse the existing Argon2id hashing, random salts and persistent login
  budgets. Bad fresh-authentication attempts clear the current session and count
  toward the same five-attempt/sixty-second budget. They do not create a separate
  unlimited password-verification oracle. Wrong scope and role are refused before
  reauthentication.
- After fresh login, permission/revision are verified again under the SQLite
  immediate writer lock. Hash, revision and credential audit commit together;
  Owner legacy-verifier cleanup is in that same transaction. Ignored/aborted audit
  writes and deferred foreign-key failure at COMMIT roll back credential changes.
  The preceding successful login's audit/counter changes are intentionally an
  independent committed authentication event.
- Audit actions are `credentials.password_changed` and
  `credentials.staff_password_reset`, with native business/workspace, actor and
  target attribution. Passwords and PHC hashes are absent from those events and
  API results. Only the new salted verifier is persisted in the credential row.

Tauri registration is in `apps/desktop/src-tauri/src/main.rs:324` and `:338`,
with build-manifest and local-identity capability entries. Both commands require
native scope. Current/new password strings are wrapped in `Zeroizing` before
the blocking Workspace closure. SQLCipher, its device key, schema version and
financial operation IDs remain unchanged; app-password rotation is not database
key rotation.

## Windows interface and uncertain outcomes

`apps/desktop/src/CredentialsPanel.tsx` is mounted in the bundled application.
Every signed-in role sees self-service rotation; only the Owner sees staff reset.
The native boundary enforces that policy independently of navigation.

Password/confirmation fields use password inputs, remain out of browser storage,
and clear after completed attempts. Staff reset offers a native account refresh
and displays current role/disabled state. Busy and dirty-work guards include the
staff and credential panels; unfinished checkout/inventory/customer/closing work
must be resolved before a credential operation that may lock the session.
Successful self-service rotation returns to the sign-in screen.

The UI never automatically retries a credential mutation. A lost self-change
reply can mean the new credential already committed: lock/sign in using the new
password, then try the previous one only if the new one is refused, subject to
the native attempt limit. A lost staff-reset reply is resolved by refreshing the
native staff account/revision before consciously issuing another reset. A retry
with the old expected revision is refused. No plaintext credential or derived
request fingerprint is stored for replay, and no external exactly-once guarantee
is made.

## Verification actually run

- Full `cargo test --all-targets --locked` and its release equivalent each passed
  **134 library tests plus six command-security tests (140 passed, zero failed)**.
  One ignored standalone worker is explicitly invoked by its parent crash test.
- Five new credential tests cover wrong current/Owner secrets, session revocation
  across connections, disabled-account preservation, Owner-target refusal, stale
  revisions, persistent reauthentication budgets, required-audit IGNORE/ABORT
  rollback and deferred COMMIT failure. Final assertions for pending-checkout /
  stock/draft preservation and legacy-verifier removal were rerun in both profiles.
  Explicit checks also verify absence of credential events after failed writes
  and exactly one after successful retry.
- Direct JSON dispatch coverage now accounts for **42 native commands and 63
  sensitive request variants**. New commands participate in locked, disabled,
  foreign business/workspace and role-denial tests, plus registry/build/capability
  consistency checks.
- `apps/desktop/check-credentials.cjs` passed against the actual React interface
  and real Rust Workspace/SQLCipher subprocess: unsaved-work guard, fresh-auth
  Owner staff reset, second-session revocation, direct cashier reset refusal,
  password-confirmation mismatch refusal, dropped committed self-change and staff
  reset replies, account refresh, old/new login behavior, Owner/Cashier rotation,
  cleared secret inputs and empty browser storage. It is wired into browser CI.
- Existing native authorization browser integration and mocked access/inventory UI
  suites passed. Final desktop TypeScript/production build and changed-file ESLint
  passed; ESLint emitted a Next pages-directory notice in the partial checkout.
  Local-store/Tauri formatting and locked Tauri metadata checks passed. Dependency
  locks are unchanged; this follow-up does not claim a fresh dependency advisory
  scan or a rerun of every unrelated repository check.

Exact output is in [credential test evidence](windows-credential-test-evidence.txt).
Linux used Rust 1.99.1, Node 24.22.1, Chromium 156.0.8078.73, bundled SQLCipher
with system OpenSSL (`OPENSSL_NO_VENDOR=1`), four independent test-harness threads
and two Cargo build jobs. The browser test uses the review bridge, not Tauri IPC
or WebView2. The final-head Actions status belongs in the PR; it is a separate
acceptance gate.

## Remaining risks and release gates

Owner credential-loss recovery, ownership transfer and missing Windows-vault-key
recovery are still unsupported. There is no unauthenticated reset or plaintext
database fallback. Establish a reviewed recovery design and proven encrypted
database/key restoration before using the app as the sole shop record. Backup
#125 and LAN #126 still require integration with named principals and current
schema/revocation semantics; they were not silently added here.

Native revocation blocks future requests; it cannot erase customer data already
returned to another renderer or a dump. JavaScript/OS copies of passwords are not
claimed to be immediately zeroized. Existing offline password-strength, Windows
profile compromise, wall-clock/lockout availability and physical-device risks
remain. Credential-reset races rely on the writer lock and expected revisions;
this follow-up does not claim exhaustive concurrent-credential stress testing.

Actual packaged Windows/vault/install/upgrade acceptance, account/ACL and
suspend/lock behavior, signed distribution, physical hardware, backup restoration
and the accounting/payment gates remain required. No merge, deployment,
production-data migration or external message/payment was performed.
