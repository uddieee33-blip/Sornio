# Phase 18I — targeted staff-session sign-out

Verified baseline: Phase 18H `a70be3cd8525f71f30f9a0c1a9f8c6066ca9f4a3`, draft #179, schema v21. No merges/main changes/releases.

## Functional source

Administrators can select an observed LAN session belonging to another employee, confirm the scope, save the immutable request, submit it and recover the same result after restart or a lost reply. Desktop uses the existing native pending-operation panel; Android/iPhone/iPad use the shared encrypted operational outbox. The request carries actor/business/device scope, target employee/revision, operation ID and an opaque random session handle. Native Staff permission is checked independently; kitchen supervision alone is insufficient. Remote self-sign-out is refused; existing app-lock/device-management controls remain available for the administrator's own access.

The native transaction deletes only the session matching the observed handle, employee, revision and current generation. A replacement login on the same device receives a different handle. A delayed old request returns its durable receipt or already_inactive and cannot delete that newer session. Current staff revisions are checked when the observed session still exists. Sign-out does not revoke device approval: the employee may sign in again if still authorised. It does not change staff responsibilities, principal revisions, financial roles, invoices, payments, stock, debt, checkout or table state.

Deletion, immutable operational receipt and security audit commit together through the existing Phase 18F/G journal. Duplicate IDs replay the recorded outcome; changed payloads fail. Known refusals/conflicts require acknowledgement before another request. Unknown outcomes retain their original command and query authoritative status before resend. Recovery is explicit after reconnection/reauthentication; revoked administrators cannot bypass current permissions with cached metadata.

## Storage and compatibility

Schema v21 → v22 adds a session-handle mapping to existing session records. Handles are random public references, not bearer tokens or token hashes. Existing sessions are backfilled without rotating their credentials. New logins receive a new handle in the login transaction. Session deletion cascades the corresponding mapping; the immutable request/result journal retains its public reference. The existing session table and its seven-column layout remain unchanged.

Access reports disclose public handles and staff revision only when includeSessionHandles is requested. Old requests retain the prior response shape, and new mobile controls require the verified hub's staff.signout.v1 capability. Native assignment/responsibility payloads omit the new optional field, preserving existing canonical identities. Trusted v21 backup schema was generated from actual migrations after validating against the trusted v20 control; restore checks remain intact. No dependency lockfile edits.

## Focused evidence

Passed: desktop TypeScript/Vite build; mobile TypeScript; all 85 shared-domain tests (6 new sign-out/report cases); 63 mobile and 38 desktop contracts; 92 schema checks; actual SQLite migration/exact-session deletion tests with old-session backfill, rollback/cascade, wrong actor/revision/generation rejection, same-device replacement-login preservation and unchanged staff/device/financial rows; existing access-report, responsibility, assignment and staff SQL checks; whitespace checks.

Two new Rust tests cover file-backed restart/replay/reauthentication safety and non-admin rejection/legacy report compatibility. These are unexecuted because native toolchains remain unavailable. SQL/TypeScript checks do not verify Rust security, SQLCipher or installed platforms.

## Release limits

Native compilation/Rust execution, Windows/macOS installer/lifecycle and financial acceptance, Android/Apple module builds, secure storage and real-device LAN/TLS/restart/sign-out behaviour remain mandatory gates. Valid sessions are not proof of online devices. Desktop login windows are not remotely enumerated or ended by this feature. The capability ends one observed other-employee LAN session; it neither blocks future sign-in nor changes device approval. Security receipts/audit are retained natively; a dedicated searchable session-action timeline is future work. No production-readiness claim.

Next functional increment: paginated security-action audit for session sign-outs and device revocations.
