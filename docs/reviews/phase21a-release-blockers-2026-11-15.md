# Phase 21A — release blockers (2026-11-15)

Branch `arena/110fa338-sornio`, PR #185 (based on Phase 20's `arena/729c232c-sornio`; retargets to `main` when #184 lands).

## Current state — all green on `4b28571`

Every required check passes on the head commit. Evidence:

| Gate | Result |
|---|---|
| Lint, types, build | pass |
| Contracts, types, security | pass |
| Dependency audit | pass |
| Real PostgreSQL concurrency | pass |
| Historical SQLCipher compatibility (4.6.1 → 4.20.0) | pass |
| browser (native debug+release tests, browser acceptance, UI acceptance) | pass |
| macOS desktop workspace | pass |
| local-windows (installer verification) | pass |
| Android / iOS simulator / iPad & iPhone simulator + interactive acceptance | pass |
| Replication PostgreSQL | pass |
| Supabase Preview | skipped by design |

Local verification mirrored the CI jobs: `npm run verify` (all verifiers incl. `verify:desktop-contract`, 38 checks), `npm run lint`, `npm run typecheck` + `typecheck:native`, `npm run build`, `npm run i18n:check`; `cargo test --offline --all-targets` in debug and release (279 lib + 2 sqlcipher_compat + 8 native security cases); `scripts/verify-local-schema.py` (146 checks); `node apps/desktop/check-suppliers.cjs` exits 0 against the real native backend fixture; supplier purchasing UI acceptance printed verbatim.

## What changed to get here

- `build.rs` now declares all 93 native commands (the build-time manifest predated the 20 purchasing commands; `verify:desktop-contract` was red at HEAD).
- `SupplierPanel`: action-result messages are no longer stomped by the background refresh; archive/restore is exposed with a fresh read before the write; archived suppliers are marked; the HTML `pattern` attributes are valid `/v` regexes.
- `cashier_review_bridge` drives the real purchasing Workspace methods; `suspect_local_supplier_duplicates` is now dispatched.
- Native security suite covers the 20 purchasing commands with valid payloads; capability expectation includes `local-purchasing`; `cancel_purchase_order` verifies the minimum role before reading the order (denials are now `Forbidden`, not `PurchaseOrderMissing`, at the native boundary).
- `sqlcipher_compat` no longer opens the delivered historical fixture in place: a sub-ceiling fixture is migrated on open (WAL checkpoint on drop), so the open/migration/record checks run on a byte-identical copy and the delivered file is asserted byte-identical at the end. Verified against a v22 fixture written by the Phase 20 build (SHA-256 unchanged).

## Blockers — none of these may be waived silently

1. **Maintainer sign-off on the `rustix` advisory.** It is transitive (bundled OpenSSL/SQLCipher on Linux), it is *not* suppressed, and it has not received a release-blocking risk acceptance. Until a maintainer signs it off, no release. RUSTSEC-2026-0459 / CVE-2026-119375 itself is fixed by the Phase 20 dependency floor.
2. **Mobile purchasing is not implemented.** `suppliers` stays `Planned` in `packages/mobile-contracts` with honest copy. A release advertising purchasing covers the desktop workstation only, or waits for the mobile track.
3. **No signed-installer native click-through of `SupplierPanel`.** Purchasing acceptance is bridge-level UI acceptance plus the native debug/release suites, not a pywinauto installer keyboard pass. It remains on the release checklist; do not claim native Windows keyboard acceptance for purchasing yet.
4. **Merge sequencing.** #185 must land after #184; only then retargets to `main`. No release, tag, or deploy is authorized by this document or by the green checks.
5. **Historical SQLCipher evidence contract changed.** The compat test now proves: the real 4.6.1 fixture opens on a copy, migrates, reads back records, and the delivered fixture is byte-identical afterwards. The "opening never rewrites any byte" phase was removed for sub-ceiling fixtures because it contradicted the designed migration-on-open (it was only ever satisfiable at a fixed ceiling). Release evidence must quote the new wording, not the old one.

## Explicit non-claims

Mobile purchasing; native Windows keyboard acceptance for purchasing; release/merge/deploy approval; any change to `main`; any waiver of the two risk items above.

## Open follow-ups (not blockers, but owed)

- Signed-installer purchasing acceptance (`apps/desktop/check-native.py` extension).
- Mobile purchasing implementation ticket (schema exists in v23; no mobile database or screens yet).
- Track B / hardware LAN verification (unchanged by this phase).
