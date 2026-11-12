# Phase 18 — integration and mobile kitchen operations

Baseline: verified Phase 17C `c2262ccd55b049ea4cdb63bb5de5d3862805780f`, PR #170; ancestors Phase 17B `d58f96e78dd360d406a913efde42fb6355dbe5c7` (#169), Phase 17A `27b4310f20820677eae02c3eb8a96489cfda35c5` (#168). No merges or main changes.

## Published integration dependency

Phase 18A: `feature/phase18a-native-integration`, commit `0cd7cf923e250c7d0df83768317b81842e9be9a1`, draft [PR #171](https://github.com/uddieee33-blip/Sornio/pull/171), targeting Phase 17C. Its local source-equivalent commit is `0dba54e2aa03046078845a413a0d6308c4562dcf` (tree `6e6f2d71b8372c408707bc99f60ea5ae5fe4c94e`).

- Live workspace parser accepts the native transport's bounded 262144-character payload; offline imports keep their 60000-character limit.
- A verified shop's changed HTTPS address requires explicit review, retains the existing device credential, and preserves unknown operations. Certificate replacement still requires fingerprint confirmation; normal OS trust and per-connection leaf pin enforcement remain mandatory.

## Functional source added in Phase 18B

- Authenticated `/v1/kitchen-state` uses the same Rust `transition_ticket` helper as desktop preparation controls: Pending → Preparing → Ready → Served only. Native Sell permission, current order ownership/control, business identity, valid staff/device sessions, ticket revision and unpaid order status are checked. Table/order financial revisions are not advanced by preparation work.
- Ticket change, append-only restaurant event, immutable hub operation receipt and audit commit in one immediate SQLite transaction. A same-device/actor/generation request replays its durable result; a different payload under the same operation ID fails. Stale revisions return a durable refusal with current ticket state/revision. Revocation invalidates sessions before replay or mutation.
- Android/iOS native pinned-HTTPS allowlists include the kitchen route. Capability `kitchen.transitions.v1` keeps old hubs read-only until upgraded and reconnected.
- React Native kitchen workspace uses real hub tickets, portions, notes and assignment names. Phone table/kitchen selectors and the existing tablet two-column workspace keep order drafts alongside operational views. Only confirmed snapshots display progress; locally queued/unknown commands are labeled separately. Acknowledgement refreshes tickets before enabling another action.
- One bounded encrypted kitchen outbox per enrolled employee/device survives restarts. It shares the existing order outbox's durable status-query-first mechanism while preserving separate storage namespaces and old order record formats. Network/TLS/session/storage failures remain unknown. Foreground reconnection retries the same operation; the cashier can pause recovery. Sign-in after background lock restores the saved command.
- Windows/macOS shared hub UI identifies kitchen results and ticket revisions in incoming operation history. Platform printing, Keychain and existing checkout recovery are retained.

No financial endpoint, payment ledger, automatic dispatch, inventory deduction, customer debt, table release, cloud coordination or certificate-authority installation was added. Schema v18 remains unchanged; no migration is needed because existing operational event/result tables hold these records.

## Development evidence

Executed on Linux, 2026-11-12:

- Desktop TypeScript + Vite production build: passed.
- Mobile TypeScript and strict shared kitchen/domain TypeScript: passed.
- All business-domain Node tests: 50 passed, including 8 new kitchen tests and 3 Phase 18A integration tests.
- Mobile contracts: 63 passed. Desktop contracts: 38 passed.
- Native-schema SQLite replay/guards: 92 passed; hub immutable-history/session SQL checks passed.
- `scripts/test-mobile-kitchen.py`: actual native SQL executed against the migrated schema; strict state/revision guards, rollback, duplicate/stale updates, closed-order refusal and no financial writes passed. This does not execute Rust RBAC or SQLCipher.
- `git diff --check`: passed.
- Four new native Rust test cases cover replay/status recovery, conflicting payloads, transitions, stale revisions, owner/cashier isolation, business/revocation checks and financial boundaries. **Not executed here.**

## Outstanding release gates and limitations

Cargo/rustc, Swift/Xcode, Android toolchains and supported physical devices are unavailable in this session. Native compilation, Cargo.lock regeneration and Rust tests were not run. Lockfiles were not hand edited. No real desktop + Android + Apple LAN exercise was possible. No TLS, discovery, certificate provisioning, OS network permission, secure-storage, printing or real-device interoperability success is claimed.

Native kitchen views intentionally cover unpaid orders only, matching existing desktop visibility; settled-order kitchen tracking remains a later feature. Role/ownership refusals use existing Sell/control permissions rather than introducing a separate kitchen role. Snapshot refresh is polling, not a push synchronisation service. Existing workspace size limits still apply. Normal OS certificate trust must be provisioned explicitly by the owner; fingerprint confirmation alone does not make an untrusted certificate valid.

Next functional priority: native compilation with Cargo-generated lockfile resolution and one desktop/two-device LAN exercise, then kitchen staffing permissions and post-payment preparation visibility without relaxing checkout authority. Windows native financial correctness, installer/lifecycle acceptance and installed-device verification remain mandatory before distribution. Source implementation is not a production-readiness claim.
