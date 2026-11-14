# Phase 18E — kitchen staff management increment

Verified base: `feature/phase18d-kitchen-queue`, published `4c1e84e0a539fb261b50fe5297338b7276b14913`, draft #174. Its dependencies remain unmerged.

## Implemented source

Native kitchen responsibilities are separate from base retail roles. Owner-managed preparer/supervisor grants on cashier accounts explicitly restrict those accounts to kitchen/view permissions; native Sell, refunds, credit collection, staff administration and other non-kitchen permissions are refused. Existing owner/manager behaviour is retained; managers supervise preparation. Removing the kitchen responsibility restores the base role, with explicit owner confirmation in the UI. Responsibility changes use principal revision guards and expire existing desktop/mobile staff sessions.

Ticket assignments are distinct from restaurant order/checkout ownership. Native supervisors assign/reassign Pending, Preparing or Ready tickets using ticket revision CAS. Enabled, business-scoped targets are checked. Assignment increments the ticket revision, so prior preparation commands conflict; a preparer must hold that ticket's current assignment. Unassigned legacy tickets retain the existing cashier ownership rules. Owners/managers/supervisors have native supervision authority. Assignment does not mutate order revisions, checkout control, payments, stock, debt or table occupancy.

The desktop board exposes responsibility configuration, assigned employees, employee workload, My Tickets, per-employee filters, assignment/reassignment controls and recent assignment audit. The existing native kitchen command carries stable operation IDs: matching successful retries replay the stored result; conflicting payloads fail. Definitive conflicts refresh current data; uncertain desktop responses retain the same command for retry while the workspace is open.

Android/iPhone/iPad use the existing authenticated pinned-HTTPS workspace and durable kitchen-transition queue. They show native ticket assignments, My Kitchen Tickets and the most recent assignment audit. Kitchen-only employees can obtain approved-device staff sessions and submit permitted preparation transitions, but native order submission/checkout still require Sell. The draft controls reflect native canSell metadata; UI flags never grant authority. Responsibility/assignment changes in this increment are performed on desktop; mobile supervisor assignment controls are not implemented.

## Persistence and compatibility

Explicit schema v18 → v19 migration adds kitchen responsibilities, ticket assignments and append-only idempotent assignment/grant events, without changing stored ticket or financial table shapes. Native identity verification remains authoritative and checks grants from the database on each action. The recovery v18 trusted-schema fixture was generated from the real migration chain, with the generator first matching the existing trusted v17 fixture exactly. The restore path recognises v18 backups before migrating; no trust check was weakened.

## Verification

Passed: desktop TypeScript/Vite build; mobile TypeScript; all 61 shared-domain tests; 63 mobile contracts; 38 desktop contracts; 92 schema/migration checks; native SQL tests for staff assignment CAS, immutable audit, duplicate IDs, terminal-ticket guards, unchanged financial/order rows and v18-to-v19 old-ticket preservation; existing kitchen, paid-kitchen and hub SQLite checks; diff checks. Two Rust regression cases cover kitchen-only permission denial, assigned preparation, stale assignment/replay and conflicting grant payloads, but are **unexecuted** because Cargo/native toolchains remain unavailable.

## Explicit remaining scope

This is the staff-management increment authorised for separate publication. Recent assignment history is bounded to 100 events; it is not the requested complete searchable preparation-history feature. Paginated date/status/item/table/staff history, transition/completion timeline UI and mobile supervisor assignment remain the next dependent increment. Existing historical transitions remain in native restaurant events; no past assignment/completion records were invented. Desktop pending assignment requests are retained in memory for retry, not in an encrypted restart outbox; after restart, staff must refresh the authoritative ticket revision/audit before issuing another command. Mobile preparation recovery retains the existing encrypted persistent outbox.

Windows/macOS Rust compilation, native RBAC/SQLCipher execution, installed UI and real Android/Apple LAN/TLS interoperability remain pending. No release readiness is claimed. Native financial correctness, installer/lifecycle and supported-device acceptance remain mandatory gates. No existing PR was merged or CI checks disabled.
