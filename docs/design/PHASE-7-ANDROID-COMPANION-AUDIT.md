# SORNIO — Phase 7 / Assignment 2: Android Companion Audit

**Status:** NONPRODUCTION READ-ONLY AUDIT + DESIGN PROTOTYPES.  
**All new Android images:** `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` · `DEMO DATA — NOT LIVE` · read-only · `figures may be outdated`.  
**Open first:** [A1–A5 comparison sheet](../phase7-assignment2/assets/android/android-comparison-sheet.png) · [navigable preview](../phase7-assignment2/index.html) · [README](../phase7-assignment2/README.md).

---

## 1. Current Android source baseline — verified on `origin/main`

| Item | Verified value |
|---|---|
| App id / name / version | `com.sornio.companion` / `Sornio` / `0.1.0`, `versionCode 1` |
| Expo config | `appMode: "demo"`, `productionSyncEnabled: false`, `allowBackup: false`, `permissions: []` |
| Blocked permissions | `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `CAMERA`, `RECORD_AUDIO`, `ACCESS_FINE_LOCATION` |
| Stack | Expo SDK 58, React 19.3.0, React Native 0.88.1, TypeScript 6.0.3 |
| App composition | `CompanionApp.tsx`, `CompanionContext.tsx`, `ErrorBoundary.tsx`, custom `AppNavigation.tsx` |
| Demo engine | `CompanionEngine`, `DemoAuth`, `DemoSnapshotAdapter`, `MemoryCache`, `createSecureStore`, persisted session with memory fallback |
| Screens | `HomeScreen`, `InventoryScreen`, `CustomersScreen`, `ActivityScreen`, `SettingsScreen` |
| Navigation | `screensFor(role, portalId)` permission filtering; tablet rail at `tabletMin: 720`, bottom tabs on phone |
| Live adapters | `ProductionAuth.signInLive()` and `ProductionSnapshotAdapter.load()` throw `PRODUCTION_DISABLED`; `parseLiveSnapshot()` exists but is not wired |
| Read-only boundary | `isWriteBlocked(module)` returns true for `R`, `D`, `P` classes; no Android checkout or financial posting screen |
| Theme | `packages/mobile-design/src/tokens.ts` Dawn `#F8F6EF` / ink `#1F2535` / brand `#3343C2`, Dusk `#0E152B`; conflicts with Windows Precision Workspace candidates |
| Web theme | `lib/theme/palettes.json` has 10 OKLCH paints; `verify-theme.mjs` confirms body/muted AA and generated CSS match |
| CI | `mobile.yml`: contracts/types/secret scan, `assembleDebug`, iOS simulator compile. `android-review.yml`: `assembleDebug`, `lintDebug`, `javac NavigationPolicyTest`. Both SUCCESS at PR145 head. |
| Distribution doc | `docs/mobile/ANDROID-DISTRIBUTION.md`: Phase 1 does **not** upload to Google Play; debug signing is review-only; commercial release needs upload keystore outside git, Play App Signing and `bundleRelease` → `.aab` |

**No Android emulator smoke test, installed-APK launch, native screen capture, release signing, Play upload, biometric device test or physical-device verification exists in the inspected workflows.** A green `assembleDebug` is a compile result, not public-release readiness.

---

## 2. Android capability matrix

Status vocabulary is applied literally: **Implemented / Tested / Untested / Proposed / Blocked**. “Tested” here means a CI or local check actually executed, not that a physical device was validated.

| Capability | Source evidence | Status | Honest detail |
|---|---|---|---|
| A1 Shop overview / metrics / recent activity / alerts | `HomeScreen.tsx`, `demo.ts` | **Implemented** | Synthetic demo snapshot; `DEMO` freshness label; no live business record. |
| A2 Inventory search, SKU, quantity, low-stock filter | `InventoryScreen.tsx`, `demo.ts` | **Implemented** | Read-only view; no stock write from Android. |
| A3 Customer balances, lookup, credit limit, statement rows | `CustomersScreen.tsx`, `demo.ts` | **Implemented** | Restricted by `canSeeCustomers` to owner/manager/auditor in contracts; still demo data. |
| A4 Activity search/filter, references, narrative, status, amount | `ActivityScreen.tsx` | **Implemented** | Read-only presentation; pending/unverified and refund-pending states are text-labelled. |
| A5 Connectivity / sync status | `connectivity.ts`, `statusCopy.ts`, `sync.ts`, `SettingsScreen.tsx` | **Implemented** | `describeSync()` includes offline, stale, interrupted, reauth, revoked, never-synced and `DEMO` copy. |
| Settings: appearance, refresh, cache wipe, sign out, device | `SettingsScreen.tsx`, `ThemeProvider.tsx` | **Implemented** | Local display/session controls only; not financial writes. |
| Permission-filtered navigation | `capabilities.ts`, `AppNavigation.tsx` | **Implemented** | `screensFor(role, portalId)`; custom rail/tab bar; no checkout screen. |
| Demo isolation / paise strings / role / cache / threat contracts | `verify-mobile-contracts.mjs` | **Tested** | 63 checks passed on extracted `main` in isolated `/tmp` toolchain; not full CI and not a device test. |
| Android debug compile | `.github/workflows/android-review.yml`, `mobile.yml` | **Tested** | `assembleDebug` + `lintDebug` SUCCESS at `97b6899…`; debug key only. |
| iOS simulator compile / iPad layout | `mobile.yml`, `AppNavigation.tsx`, `CustomersScreen.tsx` | **Tested** / **Untested** | Simulator compile green; actual iPad Split View, rotation and touch runtime untested. |
| Web theme AA | `verify-theme.mjs` | **Tested** | 10 paints, body/muted AA, generated `palettes.json` match. |
| Physical Android device launch / emulator smoke | No workflow step found | **Untested** | No APK install, home-screen launch, rotation, biometric prompt or offline airplane-mode evidence. |
| Installed-APK native screenshots | No artifact decoded in sandbox | **Untested** | Android artifact `13267861820` metadata exists; download failed with Azure `EOF`. |
| Real business authentication | `DemoAuth` / `ProductionAuth` | **Blocked** | Live auth throws `PRODUCTION_DISABLED`; demo auto sign-in is not real authentication. |
| Live snapshot / replication | `productionSyncEnabled=false`, `production.ts` | **Blocked** | `ProductionSnapshotAdapter` throws `PRODUCTION_DISABLED`; no deployed live sync. |
| Biometric unlock device behavior | `security/biometrics.ts` exposes helpers | **Untested** | Helper code exists; actual wiring and device prompt need independent verification. |
| Encrypted persistent business cache on phone | `MemoryCache`, `secureStore`, `sessionStore` | **Untested** | Session may persist; business records remain in memory, not encrypted phone storage. |
| Android checkout / sale posting / repayment posting | No screen, no command in mobile source | **Blocked** | Must remain blocked unless separately authorized and fully tested. |
| Android release AAB / upload keystore / Play App Signing | `ANDROID-DISTRIBUTION.md` | **Blocked** | Future AAB, never debug key; no keystore or Play submission in repo. |
| Public Play release | No store submission | **Blocked** | Data safety, privacy policy, account deletion, billing policy and closed-testing rule unresolved. |
| Cross-platform PRECISION WORKSPACE tokens for Android | Assignment 2 proposal only | **Proposed** | Prototypes use Windows semantic colours; current Dawn/Dusk conflict needs a founder decision, not a silent code change. |
| Full Punjabi/Hindi Android localization | `apps/mobile/src/i18n/en.ts`; no verified `pa` mobile catalogue found | **Proposed** | Desktop `pa.json` has 33 receipt/checkout phrases; Android translations must be separately verified. |
| Tablet/large-screen runtime | Layout code exists | **Untested** | `tabletMin: 720`, wide rail and split customer list exist in source; runtime untested. |
| High-contrast / 200% font scaling on device | `allowFontScaling`, `maxFontSizeMultiplier=1.6`, `touch=44` | **Untested** | Source has good primitives; physical accessibility testing not executed. |

---

## 3. A1–A5 prototype review

| Screen | Link | Required content | Freshness / read-only treatment |
|---|---|---|---|
| **A1 Shop overview** | [PNG](../phase7-assignment2/assets/android/previews/A1-shop-overview.png) | Shop identity, `Day open`, sales/collections/outstanding/low-stock synthetic metrics, recent activity | `DEMO DATA — NOT LIVE · figures may be outdated`; `Last sync: demo copy, 04 Nov 09:12 IST`; every activity row `read-only`. |
| **A2 Inventory overview** | [PNG](../phase7-assignment2/assets/android/previews/A2-inventory-overview.png) | Search, name, SKU, available qty, OK/Low stock status | `View only · no stock changes from Android`; `Read-only` chip; low-stock status uses text + shape. |
| **A3 Customer balances** | [PNG](../phase7-assignment2/assets/android/previews/A3-customer-balances.png) | Customer identity, outstanding, limit, available credit, repayment/statement history | `Udhar / khata · demo copy, not live`; each row `Data may be outdated · read-only`; outstanding `₹400.00` is synthetic. |
| **A4 Activity** | [PNG](../phase7-assignment2/assets/android/previews/A4-activity.png) | Recent activity, references, timestamps, narrative, status, amount | `View only`; `Saved`, `Pending — unverified`, `Refund pending` are text + shape, never colour alone. |
| **A5 Connectivity / sync** | [PNG](../phase7-assignment2/assets/android/previews/A5-connectivity-and-sync-status.png) | Online, offline, last successfully synchronized, data may be outdated, authentication required, synchronization failed | `Live cloud sync is not enabled in Phase 1`; `productionSyncEnabled = false`; `No live replication deployed`. |

The [A1–A5 comparison sheet](../phase7-assignment2/assets/android/android-comparison-sheet.png) shows all five together. The designs are phone-first cards with a 44px bottom tab bar, not shrunken Windows tables. They share the Windows semantic colours but deliberately use mobile geometry and a different navigation model.

---

## 4. Identity, navigation and design-system conflict

The current Android Dawn/Dusk palette (`#F8F6EF`, `#1F2535`, `#3343C2`, `#0E152B`) does **not** match the Windows candidate tokens (`#F7F8FA`, `#FFFFFF`, `#182333`, `#667085`, `#246B65`, `#E7EEE9`). The web theme system is a third source with 10 OKLCH paints. Assignment 2 prototypes therefore propose a **semantic mapping**, not a mechanical copy:

| Semantic role | Windows prototype | Current Android Dawn | Proposed contract |
|---|---|---|---|
| Page | `#F7F8FA` | `#F8F6EF` | One shared `color.bg.app`; exact value needs founder decision |
| Ink | `#182333` | `#1F2535` | One shared `color.text.primary` |
| Brand / accent | `#246B65` | `#3343C2` | One shared `color.action.primary`; do not silently recolor production |
| Surface | `#FFFFFF` | `#FFFEFA` | Shared white/lift surface with AA text |
| Soft accent | `#E7EEE9` | `#F5E6C8` demo | Shared `color.surface.soft`; Android demo banner may remain distinct |

**No production theme file was changed.** The prototypes are isolated PNGs and HTML only.

---

## 5. Data freshness, authentication and read-only boundaries

- `CompanionContext.tsx` auto-signs into `DemoAuth`, loads `DemoSnapshotAdapter`, stores the session with `createSecureStore`, and refreshes demo data when the app becomes active.
- `MemoryCache` means business records are not persisted in encrypted phone storage; stale cached figures must never be presented as verified real-time balances.
- `describeSync()` explicitly says `Demonstration figures. Not a live business record.`, `Offline. Last synced … These figures may be out of date.`, `Refresh interrupted. Cached figures may be out of date.`, `This device can no longer read this business.`
- `ProductionAuth` / `ProductionSnapshotAdapter` throw `PRODUCTION_DISABLED`; `parseLiveSnapshot()` rejects a demo session, non-live snapshot, wrong `businessId`, or non-`desktop-outbox` source.
- `productionSyncEnabled=false` is preserved. The future `packages/replication-cloud` contract tests include tenant-isolated RLS, publisher/reader separation, restore generation, operation IDs, SHA-256 payload digests and cursor/acks. These are **contract tests / in-memory `CloudStore`**, not deployed live synchronization.
- A documented open gap remains: `native_replication.acks` has RLS `ENABLE` without `FORCE`/policy; the ingest connection must be a dedicated non-superuser owner at deploy time. Revoked-device ingest coverage is partial.

---

## 6. Android distribution, signing, emulator and release gates

| Gate | Current status | Required before any public claim |
|---|---|---|
| Debug APK compile | PASS in CI (`assembleDebug`) | Already sufficient for engineering review only |
| APK identity / SHA-256 | Recorded in CI metadata | Durable archive and independent hash verification still needed |
| Emulator / physical device launch | UNTESTED | Install debug APK, launch, rotate, offline/online, biometric prompt, font scaling, screen reader |
| Native Android screenshots | NOT DECODED here | Provide authentic device captures separately labelled; do not substitute design PNGs |
| Release signing | BLOCKED | Dedicated upload keystore outside git; never debug key |
| Release artifact | BLOCKED | `bundleRelease` → `.aab`, not debug APK |
| Play App Signing / upload | BLOCKED | Play Console, internal testing first, 12-tester/14-day rule re-check |
| Data safety / privacy / account deletion / billing policy | UNRESOLVED | Complete before store submission |
| `SYSTEM_ALERT_WINDOW` / `VIBRATE` from Expo debug template | UNRESOLVED | Strip before Play upload |
| Live auth / sync | BLOCKED | `productionSyncEnabled=false`; `PRODUCTION_DISABLED`; full auth, RLS, revocation and device tests |
| Public Android/iOS release | **NO-GO** | No store submission; device runtime untested |

---

## 7. WCAG 2.2 AA / localization review for Android

- **Touch targets:** `packages/mobile-design/src/tokens.ts` sets `touch = 44`; prototypes use a 72px bottom nav and large cards.
- **Text scaling:** `primitives.tsx` uses `allowFontScaling` and `maxFontSizeMultiplier={1.6}` on metric values. Physical 200% / large-font testing is still untested.
- **Semantics:** source uses `accessibilityRole`, `accessibilityLabel`, `accessibilityState` and `accessibilityRole="alert"` for demo/error states. Prototype PNGs cannot expose real accessibility semantics.
- **Contrast:** prototype text uses the verified Windows semantic tokens; current Dawn/Dusk AA was not recomputed here and must be checked before any theme unification.
- **Status:** text + shape + colour; no colour-only meaning.
- **Localization:** `apps/mobile/src/i18n/en.ts` is English. Desktop `pa.json` has 33 verified receipt/checkout phrases; the web i18n verifier reports 22 catalogues / 2,751 phrases, but that is not an Android Punjabi catalogue. Verified Android translations are **Proposed**, not implemented.
- **Currency:** `₹` + `en-IN` grouping + two decimals; integer-paise strings in contracts; no JS-number balance.

---

## 8. What must not be claimed

- No claim that Android is a real-time view of shop balances.
- No claim that a stale cached figure is a verified balance.
- No claim that the companion can post a sale, repayment, stock change or checkout.
- No claim that a debug compile implies public release readiness.
- No claim that biometrics, live auth, encrypted business cache or release signing are production-ready.
- No claim that these PNGs are authentic Android screenshots.

---

## 9. Verdict

**Android design-prototype readiness: READY FOR FOUNDER REVIEW** — A1–A5 are rendered, labelled and honest about demo/read-only/stale data.  
**Android companion product readiness: NO-GO for public release** — live sync remains blocked, device runtime untested, release signing and Play submission absent, and Android checkout must remain out of scope unless separately authorized and fully tested.
