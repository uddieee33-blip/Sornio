# Phase 18G — durable responsibility management

Verified baseline: `feature/phase18f-mobile-supervisor-recovery`, `71f8e0d0a20c42d7dd80b4aba5b42c2b60492cb3`, draft #177, native schema v20. No merges/main changes/releases.

## Source delivered

Native responsibility changes now reuse Phase 18F's scoped operational request/receipt journal and transaction runner. The immutable command identifies the initiating actor/business, target employee, expected staff revision, operation ID and responsibility. Desktop saves before submission; mobile uses the shared encrypted operational outbox. Both recover the same command/result after restart or an uncertain response. Accepted duplicate requests replay their receipt; conflicting payloads fail. Confirmed refusals/conflicts require explicit acknowledgement and refreshed authoritative data before another command. No financial engine or separate staff database was added.

Owner-level native Staff permission remains mandatory. Kitchen supervisors do not gain administrative authority, and self/owner-target changes are refused. The existing native responsibility mutation was extracted into one shared helper: target/business checks, principal revision CAS, grant update, target-session deletion, immutable audit event and durable result all commit together. Current permissions and authenticated device/session/generation are checked before mutation; cached flags cannot grant authority. Request-kind validation prevents the assignment endpoint being used for responsibility escalation.

Responsibilities are preparation employee, kitchen supervisor, explicit revoked access, or explicit restore-base-role access. The previous “none” behaviour restores the base role and may restore cashier billing authority; desktop/mobile confirmations explain this. Revoked access is distinct: cashier accounts retain financial restrictions and lose kitchen authority. Existing owner/manager financial RBAC roles are not rewritten. Native staff snapshots expose current prepare/supervise/bill capabilities for directory display.

Desktop responsibility editing uses the same persistent pending-operation panel as assignments. A shared outstanding desktop request blocks another assignment or responsibility command until its confirmed result is acknowledged. Android/iPhone/iPad add a searchable, collapsible directory/editor, capability display, immutable saved-request review, prepared/submitting/unknown/accepted/refused/conflict feedback, recent responsibility audit and explicit recovery. Administration controls require native canManageStaff and a freshly verified hub advertising staff.responsibility.v1. My/Team kitchen queues and assignment recovery remain available. On authoritative access/expiry refusal, the mobile root locks staff access, clears cached snapshot/password and preserves encrypted drafts and unresolved requests. Enforcement at the hub is immediate; UI detection follows the existing foreground polling/request flow, not an invented push service.

## Storage and compatibility

Schema v20 → v21 extends only the kitchen grant constraint to support explicit revoked access, copying existing grant rows. Existing principal roles/revisions, sessions, operational receipts, assignments, financial tables and audit history are preserved by migration. New optional request fields omit themselves for old assignment payloads so v20 canonical assignment identity remains unchanged; a Rust regression case records this contract. The same native journal stores both command types, while mobile namespaces isolate their pending queues by verified shop/account/device.

A trusted v20 recovery schema was generated from actual migration SQL after checking the generator against trusted v19. Old backups are validated against their correct schema before migration. No lockfile dependency resolution was hand edited.

## Development verification

Passed: desktop TypeScript/Vite build; mobile TypeScript; all 76 shared-domain tests (6 new responsibility cases plus all Phase 18F assignment cases); 63 mobile and 38 desktop contracts; 92 native-schema SQLite checks; responsibility SQL tests for v20 upgrade, grant/pending-request/session preservation, real staff-revision CAS/business predicates, session invalidation, rollback/immutable receipts and unchanged financial rows; existing assignment/staff/preparation-history/paid-kitchen SQL checks; whitespace checks.

Three new Rust cases cover file-backed responsibility restart/replay and old-authority invalidation, non-admin/self-escalation rejection with explicit revocation, and canonical v20 payload compatibility. They are **unexecuted**. No Rust compilation, native RBAC/SQLCipher result or installed-device success is claimed.

## Release limitations

Cargo/platform toolchains and supported physical devices remain unavailable. Mandatory native financial/security execution, Windows/macOS installer/lifecycle acceptance, Android/Apple native builds, secure persistence and actual LAN/TLS/revocation/restart interaction remain release gates. Recovery is explicit after reconnection/reauthentication; there is no background replay. Responsibility audit UI shows the existing bounded recent history, not an unlimited archive. Older clients that cannot represent revoked access require coordinated application upgrade. Native-volume performance and multi-device UI timing still need verification.

Next functional increment: paginated per-employee responsibility audit and active-session visibility with controlled revocation.
