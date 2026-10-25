# Theme and platform completion checkpoint — 26 October 2026

Baseline: main `cd64d4868c1aaa7625e031c3972827ca4e0b8484`; PRs 106–109 are merged.
PR 110 remains independent and is not included here.

## Implemented

- Detail-screen metrics now use the same curved surfaces as the daily home.
  Removed blurred decorative backgrounds and hover movement from repeated figures;
  long amounts wrap instead of disappearing behind truncation.
- Responsive heading actions, bounded search fields, table focus feedback and
  curved product details preserve the selected appearance palette.
- Customer and CSV-import dialogs use native modal behavior, background inertness,
  keyboard focus containment, Escape, trigger-focus restoration and viewport limits.
- Windows reconnect remembers the last permitted app route and blocks overlapping
  initialization; native toolbar uses restrained neutral styling and DPI scaling.
  Navigation rules have a standalone .NET verification project.
- Android connected review project, fixed origin policy, reconnect screen, document
  picker, allowed external links, system/keyboard insets and APK workflow added.
  No native bridge or provider credentials are included.
- Browser acceptance workflow checks all eight daily homes in light/dark layouts,
  narrow detailed screens and modal keyboard behavior; screenshots are artifacts.

## Validation and release gates

The theme changes pass the full local verification suite, lint, both TypeScript
compilers and production webpack build. Local visual testing is blocked because
the Chromium download produced an invalid archive. The browser workflow must pass
and its screenshots must be reviewed before theme acceptance. Android/.NET SDKs
are unavailable locally; their workflows must compile/test before native artifacts
are claimed. Device installation, camera/printer behavior and real hosted accounts
are not established by a passing build.

## Still required for the requested finished products

Windows is still a connected WebView host. Implement bundled UI/runtime, encrypted
SQLite, device unlock, atomic billing/stock/ledger/outbox writes, signed offline
entitlements, LAN pairing and synchronization with explicit conflict handling.
Crash/disk-full/retry tests and two-PC/real-printer acceptance are release gates.
See `docs/windows-offline-architecture.md` for the existing delivery contract.

Android currently shares the hosted workspace. Native camera/file export/printing,
auth callback handling, process-state continuity, release signing and device tests
remain. Remote owner/staff views depend on proven tenant/role-scoped cloud sync.
Neither platform is represented as production complete or offline complete.
