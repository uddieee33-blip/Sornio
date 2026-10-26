# Theme, subscriptions and Windows checkpoint — 26 October 2026

Baseline: main `cd64d4868c1aaa7625e031c3972827ca4e0b8484`; PRs 106–109 are merged. PR 110 stays independent.

## Included in PR 111

- Curved metrics/detail panels and responsive controls follow the workspace theme. Native customer/import dialogs preserve background inertness, Escape and trigger focus. Explicit Tab/Shift+Tab wrapping fixes the failing browser check.
- Subscription cards retain a supported interval from an incoming plan link. Paid access and grace dates are separate. Moving to Starter requires review; cancel preserves the current entitlement. Mutations are serialized, errors release busy state and successful plan changes clear stale checkout instructions.
- Existing prices, manual UPI verification and business-bound activation keys remain. No recurring provider or automatic renewal is introduced.
- Windows reconnect retains its last safe route. The workflow adds a per-user setup EXE, Start menu/optional desktop shortcuts and uninstall. Its Windows runner checks installation, removal and preservation of the owner's WebView profile.
- Public marketing stays at `/`, the workspace at `/home`, and `/install` separates native setup from browser installation. A download link appears only after a real public HTTPS .exe URL is configured.
- The Android connected review project/navigation checks remain included. Later release work is recorded in `docs/google-play-release.md`.
- English and all 22 scheduled-language catalogs are updated. Existing translations are reused. New phrases were generated with IndicTrans2 because the Google translation transport did not complete here. Both translation tools now protect the Sornio brand. Automated translations need native-language editorial review.

## Local validation

Production build, lint, both TypeScript compilers and full `npm run verify` pass. Owner/plan checks cover 16 database assertions and 25 plan lifecycle/billing groups; key-console checks also pass.

Chromium acceptance and screenshot review pass for all eight daily homes in light/dark themes, detailed pages at 320/390/768/1440px, bidirectional dialog focus, Escape and focus restoration. Real local subscription API checks cover dates, interval selection, canceled/confirmed downgrade, checkout without paid activation and invalid-key refusal. Public landing/install pages fit desktop/mobile screens and show no nonexistent download. Sessions are isolated local fixtures, not production bank/account tests.

Final-head GitHub CI and native installer checks must pass before review readiness. Builds do not prove real-device scanner/printer behavior or hosted sign-in.

## Production work remaining

Windows is still a connected WebView host. Bundled runtime/UI, encrypted SQLite, device unlock, atomic billing/stock/ledger/outbox writes, signed offline entitlements, LAN pairing and conflict-safe sync remain. Crash/disk-full/retry tests, two-PC/device acceptance, signing and public distribution are release gates. See `docs/windows-offline-architecture.md`.

Android still needs device integration/process continuity, signing and a release App Bundle, Play account/listing/declarations and the applicable test track. Review Play monetization requirements before exposing the software checkout in Android. Neither platform is offline-complete or production-launch-complete.
