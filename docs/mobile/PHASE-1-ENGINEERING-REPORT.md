# Phase 1 engineering report — Sornio companion

## A. Executive summary

Phase 1 establishes one shared React Native + Expo companion for Android,
iPhone and iPad. Desktop remains the financial authority. The phone displays
labelled DEMO snapshots through validated integer-paise contracts. Live cloud
sync, Google Play and App Store submission are explicitly **not** in this
phase.

## B. Repository baseline

- Main SHA: `baabf5fe35462de22d8a4d6132e29b3873fc919d`
- Branch: `arena/5ed2bd28-sornio`
- Existing `mobile/android` WebView project is preserved (`com.sornio.app`)
- New companion id: `com.sornio.companion`

## C. Cross-platform framework decision

Chosen: **Expo SDK 58 + React Native 0.88.1 + React 19.3.0 + TypeScript 6.0.3**.

Justification:

- Matches the repository TypeScript 6 line and React 19 family
- Expo 58 engines include Node 22.13 and 24.3
- `expo-secure-store` and `expo-local-authentication` cover Keystore / Keychain
  and session biometrics without a second app
- Continuous Native Generation produces both Gradle and Xcode projects from
  `apps/mobile/app.json`

Rejected:

- Two native apps with duplicated business logic
- Wrapping Next.js in a second WebView as the long-term companion
- Flutter / Kotlin Multiplatform (would fork the TypeScript domain)
- Expo Router (extra routing layer for five screens)

## D. Android implementation

Real code: Expo config, generated `apps/mobile/android` (`namespace` /
`applicationId` `com.sornio.companion`, versionCode 1), shared TypeScript UI.

Local debug APK: **BLOCKED** — this environment has no JDK.

CI: `.github/workflows/mobile.yml` job `android` runs `expo prebuild` and
`./gradlew :app:assembleDebug`.

The Java WebView review workflow is unchanged.

## E. iOS / iPadOS implementation

Real code: `supportsTablet: true`, bundle `com.sornio.companion`, Face ID
usage string for session unlock only, generated `apps/mobile/ios`.

Local simulator compile: **BLOCKED** — Linux host, no Xcode.

CI: macOS job runs CocoaPods and `xcodebuild` for `iphonesimulator` with
signing disabled.

A TypeScript pass is not an iOS pass.

## F. Shared code analysis

Truly shared:

- `packages/mobile-contracts` (money, sync, adapters, feature matrix, engine)
- `packages/mobile-design`
- `apps/mobile/src` screens, navigation, theme

Platform-specific:

- Expo SecureStore (Keystore / Keychain)
- Local authentication
- Gradle / Xcode project files
- Connectivity via `expo-network`

## G. UI / UX foundation

Five screens: Home, Activity, Inventory, Customers, Settings.

Phone: bottom tabs. Tablet / iPad: side rail and customer list/detail.

Dawn / Dusk tokens, 44pt targets, dynamic type, reduce-motion subscription,
demo banner on every financial surface.

## H. Synchronization architecture

See `HYBRID-SYNC-V1.md`. Production adapter throws `PRODUCTION_DISABLED` and
refuses demo sessions. Demo adapter refuses live sessions. No silent fallback.

## I. Security assessment

No service-role keys. No vault key. Session JSON only in the secure-store
port. Business records are memory-only. Threat table in
`SECURITY-THREAT-MODEL.md`.

## J. Feature matrix

See `FEATURE-MATRIX.md`. Every catalogue module is classified. Financial
writes are D/R. Hardware modules are D.

## K. Testing and CI

| Check | Command | Environment | Outcome |
| --- | --- | --- | --- |
| Companion contracts | `npm run verify:mobile-contracts` | Node 22.22.3 | PASS (63 checks) |
| Root typecheck | `npm run typecheck` | typescript 6.0.3 | PASS |
| Root typecheck native | `npm run typecheck:native` | typescript-native 7.0.2 | PASS |
| Root lint | `npm run lint` | eslint 10 | PASS |
| Companion tsc | `cd apps/mobile && npx tsc --noEmit` | Expo 58 | PASS |
| Android debug APK (local) | `./gradlew :app:assembleDebug` | Linux, no JDK | BLOCKED |
| iOS simulator (local) | `xcodebuild ... iphonesimulator` | Linux, no Xcode | BLOCKED |
| Root `npm run verify` | full hosted suite | skipped; lint + both compilers already pass | NOT RUN |
| Workflow | `.github/workflows/mobile.yml` | GitHub Actions | evidence after push |

## L. Pull request

Draft Phase 1 PR: https://github.com/uddieee33-blip/Sornio/pull/143
from `arena/5ed2bd28-sornio`. Do not merge automatically.

## M. Remaining risks

- No real-device evidence
- No live read API
- Encrypted durable cache not implemented (honestly memory-only)
- Expo adds `SYSTEM_ALERT_WINDOW` on Android debug; remove before Play
- iOS CI depends on `macos-latest` availability for this org

## N. Phase 2 recommendation

Implement native outbox → authenticated cloud projections. Exact assignment:
`PHASE-2-ASSIGNMENT.md`.

## Independent verdicts

1. Shared mobile foundation: **GO**
2. Android development build: **BLOCKED** locally / CI to prove
3. iOS simulator build: **BLOCKED** locally / CI to prove
4. Production cloud synchronization: **NO-GO**
5. Google Play release: **NO-GO**
6. Apple App Store release: **NO-GO**
