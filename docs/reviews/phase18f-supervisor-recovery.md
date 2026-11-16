# Phase 18F — mobile supervisor assignment and durable recovery

Verified baseline: `feature/phase18e-preparation-history`, `026b3a5f340ac5ebefbb5f45ecab4adb37b554ce`, draft #176. Dependencies #175 and #174 remain unmerged. No existing branch/main rewrite or release.

## Implemented source

Mobile supervisor controls extend the existing React Native kitchen view: searchable eligible employees, current assignees, workload counts, ticket selection, saved assignment review, submission/recovery and explicit final-result acknowledgement. My Kitchen Tickets and Team Kitchen Tickets reuse the shared queue; recent audit and searchable history remain available. Native `canAssign` metadata gates the picker, while Rust independently requires KitchenSupervise. Older hubs remain read-only until a fresh verified connection advertises `kitchen.assignments.v1`. Phones use the existing touch controls and iPad retains its existing tablet workspace; no second app/backend was created.

The encrypted mobile outbox contains at most one assignment per shop/device/account. Persisted phases are prepared, queued, submitting, unknown, accepted, refused and conflict. Commands and IDs survive restarts. Persistence precedes transport; uncertain outcomes query `/v1/assignment-operation` before resending the exact command to `/v1/kitchen-assign`. Final receipts are bounded and validated. Changed payloads remain blocked until a definitive result is acknowledged and the native workspace is refreshed. Failures/revocation never imply refusal or silently discard a command. Foreign scopes fail closed; commands are retained rather than replayed under another account. Recovery is explicit after reconnection/sign-in, not an unauthorised background replay.

Native assignment processing reuses Phase 18E's extracted authoritative assignment helper. It revalidates supervisor/device/staff/business/generation, validates the target, compares ticket revisions, and commits the assignment, accepted audit event and immutable receipt in one immediate transaction. Known non-posting refusals commit a durable receipt containing current revision/assignee. Unexpected errors roll back and remain uncertain. Concurrent/duplicate commands replay their scoped receipt; payload conflicts and operation-ID collisions across command types are refused. LAN device slots are distinct from the desktop slot, including when a mobile enrolment uses the text “desktop”.

Windows/macOS desktop controls now save the native request before submission. Prepared and final requests reload after restart/sign-in, and safe recovery consults the native receipt before mutation. The pending request blocks new assignments until accepted/refused acknowledgement. The same native receipt store handles desktop and LAN requests; there is no business ledger. Responsibility configuration remains owner-managed through its existing path.

## Persistence and financial boundaries

Schema v19 → v20 adds an operational request/receipt table with immutable identity/final-result guards, final-only acknowledgement and a single outstanding desktop assignment per account/workspace generation. Existing v19 data and financial/ticket shapes are preserved. A trusted v19 backup-schema fixture was generated from actual migrations, after confirming the generator exactly matched trusted v18; restore checks remain intact. No Cargo.lock edits.

Assignments modify ticket revision, preparation assignee, operational audit/result and active-device timestamp only. They do not create invoices, collect payments, deduct stock, increase debt, alter checkout ownership/state, reopen paid bills or release tables. Paid-order preparation continues.

## Focused checks

Passed: desktop TypeScript/Vite build; mobile TypeScript; 70 shared-domain tests (seven new assignment recovery cases); 63 mobile and 38 desktop contract checks; 92 migration/schema checks; actual SQLite migration/recovery guards, CAS rollback/replay, immutable results, duplicate IDs and unchanged financial/order records; existing staff/history/paid-kitchen SQL checks; whitespace checks. Trusted v19 recovery generation matched v18 control.

Four new Rust cases cover file-backed desktop reopen/replay, durable stale refusal/financial boundaries, authenticated LAN replay/revocation and non-supervisor rejection. These are **not executed** because Cargo/native tooling remains unavailable. SQLite and TypeScript evidence do not verify Rust authorization, SQLCipher or installed devices.

## Remaining release work

Native compilation/Rust tests, Windows/macOS installer and lifecycle acceptance, TLS/OS permissions, secure storage, mobile native-module builds and real-device LAN interoperability remain mandatory. Manual same-request recovery is implemented; automatic background replay is intentionally absent. Large-volume history performance, dedicated request-retention administration and supervisor assignment UX on actual phones/tablets need verification. UI responsibility-change requests still use their pre-existing in-memory retry path; this assignment adds durable ticket-assignment recovery. Native journal history is retained; the bounded client queues do not purge unresolved commands.
