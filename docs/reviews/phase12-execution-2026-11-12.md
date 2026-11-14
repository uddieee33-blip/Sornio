# Sornio Phase 12 — source publication and product expansion

Date: 12 November 2026, India. Status: implemented feature increments published for review; no production release and no merges.

## Confirmed feature stack

Every row below was confirmed through GitHub and fetched locally. Each PR targets the preceding feature branch (barcode targets the financial repair). Review and merge dependencies in order, after the required gates.

| Work | Branch | Published head | PR |
| --- | --- | --- | --- |
| Financial repair | repair/p0-ci-financial-20261105 | cf58c3ba3fa4638ad95fe838129181c1b83a0fb0 | https://github.com/uddieee33-blip/Sornio/pull/147 |
| Barcode checkout | feature/phase12-barcode-integration | d9c2227f1b8331eae983c7bd67c9299900b98663 | https://github.com/uddieee33-blip/Sornio/pull/148 |
| Split tenders and credit | feature/phase11a-split-payments | 9189930f9ebb3f199e24c523a99d574d226bb2aa | https://github.com/uddieee33-blip/Sornio/pull/149 |
| Offline held bills | feature/phase11b-hold-resume | 7176481b9df418c61671059d8947406f56923275 | https://github.com/uddieee33-blip/Sornio/pull/150 |
| Counter navigation | feature/phase12-counter-navigation | a960c5e522be79974c32e37b4b6f18182391d069 | https://github.com/uddieee33-blip/Sornio/pull/151 |
| Profiles and grocery stock planning | feature/phase12-business-profiles | a48babd3a7a60e012adc3cd1c42359769f4e61aa | https://github.com/uddieee33-blip/Sornio/pull/152 |
| Mobile offline stock-count drafts | feature/phase12-mobile-stock-counts | 2e6eddf4a7f59a5f53099490308f329d4f7fafd3 | https://github.com/uddieee33-blip/Sornio/pull/154 |
| macOS foundation | feature/phase12-macos-foundation | cf87c142c1bd0255e2f3431e74a90149e73ea54c | https://github.com/uddieee33-blip/Sornio/pull/155 |
| Download-focused website | feature/phase12-download-website | 5ea3c8db71a60e00012a1f3bb6f9a76cd6e96d88 | https://github.com/uddieee33-blip/Sornio/pull/156 |

Concurrent repository activity appeared during execution. Recovered source was compared before reuse. Duplicate navigation/profile PR #153 was closed without merging. Its alternative source remains on feature/phase12-counter-restock at c600b16444ea177e56b018a118e2bddf94f8e989; use #151/#152 for the continuing stack.

## Original source preservation

The Phase 11A bundle was verified with Git before recovery. SHA-256: 7e06ae84b4816798ad2eb5846fe91b63337a2c35265f32876739b54168090763. It retains edc879b724bcbfc4496d75659a6f55a1ada2521b and its barcode ancestors 206fc83a9057eda27d99a6c12e7637391c7b1bbc and c929b992317b6b027e8b212b096dae1004c99cb0.

GitHub publication used the authorized integration after terminal authentication failed. Publication commit metadata differs; the barcode tree 00f3f96273e5ca79d34e0420ad98b3095071bd6f and split-payment tree e4a88fcc0b18d218ce70fa3cee3a10ca5000d7d0 exactly match their recovered source trees. Original histories remain in the verified bundle/local recovery refs.

Hold/Resume was recovered from 19 modified/untracked files in an earlier workspace. No completed Phase 11B preservation bundle was found. Its missing test module was completed, and the published implementation was reused after comparing source. The original navigation SHA 9c4438761edf4d28ad0d4399bd3ded2de4c28ba0 was unavailable in inspected Git objects, remote branches and accessible backup search; the published navigation is a rebuilt increment.

## Functional increments and limits

Windows source includes exact-code scanning, measured quantities, cash/UPI/card/credit allocations, held-bill persistence and native checkout binding, counter navigation, profile configuration and a unit-specific grocery stock review. Holding a bill uses a draft table; invoice/stock/payment/debt posting remains in the authoritative native checkout transaction. Newly recovered native behavior has not been compiled in this session.

Android/iPhone/iPad source includes encrypted, per-user/business/product stock-count drafts and accessible adaptive navigation. These drafts do not update authoritative stock or post sales. The companion still uses demo data; live billing/sync is not implemented. Final polish clears old count form state when the account/product scope changes, refuses oversized saved records before parsing, warns when a saved count's source snapshot changes and clarifies cache wiping versus saved counts.

macOS source adds Keychain-backed device-key configuration, native backup dialog eligibility, app/DMG packaging configuration and desktop build commands. It is not a verified Mac build. Cargo.lock files still require regeneration after the new Apple keyring feature dependencies; Cargo --locked builds may reject the stale dependency resolution until that is done on a Cargo-capable host. No lockfiles were hand-edited or verification bypassed.

The standalone static marketing site is apps/marketing, built by `node scripts/build-marketing.mjs`. It contains industry explanations, platform status, launch-pricing/contact information and a guarded download manifest. The manifest contains no release, so download remains disabled. No installer URL was fabricated. A private review deployment is associated with https://sornio-download-preview.uddieee33.chatgpt.site; report its live status only after the deployment service confirms success.

Restaurant tables/KOT/modifiers, salon appointments/staff assignments, gym memberships/attendance/renewals, expiry tracking, supplier workflows, serialized warranties and Windows fingerprint authentication remain future work. The complete cross-platform operating system is not finished.

## Focused verification on the final source stack

- Desktop TypeScript/Vite production build: passed.
- Scanner, split tender, receipt, held-draft, profile/reorder and mobile stock-count tests: 29 passed, including the additional oversized-record regression.
- SQLite schema/migration/invariant checks: 92 passed. These execute SQLite and do not substitute for SQLCipher/Rust financial tests.
- Desktop native-command/capability contracts: 38 passed.
- Mobile domain/contracts: 63 passed.
- Five modified mobile TS/TSX files passed syntax transpilation. Full Expo/React Native semantic typecheck and device execution were not available; no fake native type stubs were used.
- Static marketing build: passed. Release guard checked missing release metadata, off-domain, non-HTTPS and wrong-repository assets; all remained unavailable. A synthetic explicitly verified official-repository URL fixture enabled the control only inside the test VM.
- Website browser review: industry selection/keyboard navigation and unavailable download were inspected. No native POS browser simulation was substituted for installed acceptance.
- Git whitespace checks: passed.

## Outstanding release gates and resources

Cargo is unavailable here. Regenerate both native lockfiles after the Apple dependency change, then compile/debug/release-test the exact candidate. A Windows 10/11 host is still required for native financial correctness, lost-response/restart behavior, physical scanner/printer use, encrypted backup lifecycle and installer/non-admin/upgrade/uninstall acceptance. No repeated blocked Windows attempts or CI reruns were triggered.

A Mac with Xcode is required for Keychain permissions/reopen behavior, SQLCipher build, app/DMG launch, backup dialogs, signing/notarization and lifecycle checks. Android and iOS/iPad device or simulator resources and installed Expo dependencies are required for semantic typechecks, secure persistence/restart and adaptive interaction checks. Distribution credentials are not required to continue source development, but platform signing resources are required before distribution.

No additional GitHub credentials are needed for read-only recovery of published source. To continue, fetch the final-polish branch and review its dependency chain. Main remains 1cc5c798d1eada9a16463213b0776c01e99d36f9 as last checked; no merge or release was performed.
