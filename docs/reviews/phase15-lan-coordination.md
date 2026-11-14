# Phase 15: authenticated restaurant LAN coordination

Date: 2026-11-12. Implemented source; native LAN interoperability has not been executed.

## Verified base and published stack

Fetched Phase 14C from origin and verified PR #163 at `2334f310847f44eab591469c41a03090c2982b2b`, tree `8231286721615e18f38b4739f2cdb82d24764997`.

| Branch | Published commit | Draft PR | Base |
| --- | --- | --- | --- |
| feature/phase15a-lan-hub | e41f6234a812590f7d9a6871d908da22694f0b66 | https://github.com/uddieee33-blip/Sornio/pull/164 | feature/phase14c-macos-compatibility |
| feature/phase15b-mobile-lan-coordination | 88c9a0ca6a81255eb91b009eaeea9d8aadae0e28 | https://github.com/uddieee33-blip/Sornio/pull/165 | feature/phase15a-lan-hub |

The Phase 15C recovery branch targets Phase 15B; its publication SHA is recorded in its PR. Local logical commits remain preserved. Terminal push authentication was unavailable, so publication used authorized GitHub Git-data operations with exact tree-hash comparisons. No merge, main mutation or manual workflow dispatch.

## Native hub and trust boundary

The Tauri application owns a bounded HTTPS listener. The owner explicitly selects a private IPv4 interface/port; wildcard, public and low-port binding is refused. Non-private peers are rejected. The listener is off on application launch until enabled, and a locked/idle desktop refuses requests. It caps concurrent workers, request sizes, request time and the global request budget. The operational route allowlist has no checkout or financial endpoint.

Certificate chain and private-key PEM files are selected through native dialogs, validated as a matching pair and stored inside the existing SQLCipher database. The database key retains the existing Windows Credential Manager/macOS Keychain foundation. Private key data is never returned through renderer IPC.

Mobile uses Expo's native fetch with redirects refused, bounded replies and timeouts. It retains ordinary OS certificate-chain and hostname validation. The shop must provision a certificate for its hub hostname, or explicitly install and trust its private CA on each device. Android declares user/system CA anchors while refusing cleartext; the config plugin preserves that policy during prebuild. iOS declares local-network use and keeps ATS arbitrary loads disabled. No certificate bypass or auto-trusted discovery is implemented. Manual HTTPS address entry is the functioning source path; automatic discovery remains deferred.

Pairing first verifies the shop and hub IDs copied from the owner's desktop over HTTPS. The phone generates a random 256-bit per-device credential using expo-crypto and saves it in SecureStore before enrolment. The owner compares a derived device code in person, selects the native employee and approves a revision-guarded grant. Pending requests expire in five minutes and can be renewed without changing device identity. Approved grants expire after 30 days; explicit owner renewal preserves the device but invalidates prior sessions. Revocation is immediate and permanent for that identity. No credential is placed in a QR code, audit payload or source file.

Device approval alone does not authorize orders: the assigned employee must authenticate with the existing native password/RBAC checks. Staff sessions last 15 minutes, remain only in mobile memory and lock when the app backgrounds. Every request revalidates staff revision, business, restore generation, device grant and session. Acceptance rechecks device/session state after acquiring the SQLite writer lock. Device enrolment, approval/revocation, connection and operation results have native audit records.

## Restaurant acceptance and recovery

Protocol v1 includes explicit hub/business/order identity, authenticated actor, expected revision, stable operation ID, menu IDs, whole portions, accepted price in integer paise and notes. Shared contracts and native validation reject unsupported, unavailable, stale or incorrectly priced items. Menu prices are not silently substituted.

Acceptance and its immutable operation result commit in one native transaction. A reused ID with another device, actor, generation or payload conflicts. Repeated accepted delivery returns the stored result. New orders cannot overwrite occupied tables; additions to an existing order require its revision and ownership. Accepted item snapshots are durable batches and are visible to the desktop and authenticated mobile workspace before kitchen dispatch.

KOT dispatch remains explicit. One accepted batch links to one durable ticket; repeated dispatch returns without creating another ticket. Dispatch retains accepted prices. Checkout refuses to bind while undispatched batches remain, preventing accepted items from disappearing from the bill. Existing checkout pricing, stock/credit checks and Phase 13C recovery remain authoritative. Acceptance and kitchen dispatch never create invoices/payments, deduct stock, increase debt, settle an order or release a table. Also fixes the inherited open-order INSERT to name its columns after schema v15 added settlement linkage.

Mobile has a bounded outbox with one unresolved request per hub/device/employee. Its immutable request is securely committed before transport. Every send/retry queries operation status first and resends only the identical request when no result exists. Timeouts, session failures and uncertain responses stay unknown; editing, acknowledgement and new IDs remain blocked. Confirmed acceptance/refusal requires explicit acknowledgement. A refused draft retains its items; staff can refresh and explicitly accept current revisions/prices, or append retained items to a different current table order after confirmation. Confirmed hub items are never overwritten automatically.

Local drafts autosave after a short debounce, flush on back navigation, and attempt a secure save on backgrounding. A sudden termination before that save can still lose the most recent unsaved keystrokes. Submitted requests are always persisted before transport. Chunked records commit their manifest last; ASCII JSON avoids Unicode surrogate splitting in native storage. Accepted confirmations keep compact durable receipts so long multilingual notes cannot overflow the outbox when the hub result is saved. Historical encrypted chunks are retained; full garbage collection is deferred. A revoked identity's unresolved request requires owner review through the desktop audit; it cannot silently discard the operation or recover using another device identity.

## Desktop/mobile interfaces

Desktop adds hub controls, native certificate import, enrolment approvals, employee binding, grant renewal/revocation, current-session expiry, received results, operational audit and accepted-batch dispatch. Session validity is displayed without claiming that a device is currently reachable or that a printer delivered paper.

The existing mobile restaurant workspace opens an authenticated shop connection screen. Real native hub staff identity is separate from the companion demo account. Phone layouts are vertical; wide tablets show tables/orders beside draft/submission controls. Menu browsing, table/takeaway details, assignment, undispatched accepted items and KOT progress come from authenticated hub responses. Companion drafts can be copied only to the matching business, with explicit review of current hub prices. Mobile financial settlement remains unavailable.

## Focused checks

Passed on the final code changes:

- Desktop TypeScript/Vite production build.
- Full mobile TypeScript check using installed Expo/React Native dependencies.
- Sixteen focused shared LAN/restaurant tests, including reply loss, final-result save failure, immutable retries, refusal, expired/revoked-session recovery restrictions, cross-screen contention and offline persistence.
- 63 existing mobile contract checks and 38 desktop contracts.
- Strict shared restaurant/LAN TypeScript.
- 92 schema checks and focused SQLite hub history, deferred linkage, KOT identity, revoked-device and expiry predicates.
- Expo public config resolution, including local-network declaration, ATS and LAN security plugin.
- Whitespace/diff checks.

Six focused native Rust tests were added but could not execute because Cargo is unavailable. SQLite checks execute the schema and predicates, not Rust/RBAC/TLS behavior. Schema 18 explicitly migrates schema 17 and preserves its backup schema fixture.

## Remaining gates and next increment

Rust compilation and Cargo.lock regeneration, native SQLCipher/RBAC/concurrency/crash-restart behavior, installed Windows/macOS acceptance, TLS certificate lifecycle, firewall/private-network permission behavior, and real Android/iOS/iPadOS LAN/SecureStore interoperability remain unverified. No device is claimed synchronized on the strength of source checks alone. Manual certificates/private DNS, IPv4-only binding, owner-only enrolment administration, whole-portion restaurant items, bounded snapshot sizes and manual recovery/refresh are current limitations. No automatic discovery, background submission service, mobile payment or cloud coordination is shipped.

Next functional priority: execute the exact stack on an equipped desktop and two mobile devices, fix native/interoperability defects, then add trusted discovery and guided certificate/device provisioning using the same authority protocol. Preserve financial and installed-app release gates before distribution.
