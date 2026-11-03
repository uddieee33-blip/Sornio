# Phase 1 native build report — PR #143

Verified against live GitHub on 2026-11-02 / 2026-11-03. Do not treat this
companion as a Play or App Store release.

## A. Executive summary

The Android debug compile failed because `react-native-safe-area-context@5.6.2`
still called Paper’s `UIManagerModule.uiImplementation`. React Native 0.88
removed that API under Expo SDK 58’s New Architecture.

The Expo-bundled `react-native-safe-area-context@5.10.1` was installed. It
updates insets through Fabric state or `setViewLocalData` only.

On commit `7b343f6497303197c76e025d716b59b500b379f2`, GitHub Actions run
[41511352532](https://github.com/uddieee33-blip/Sornio/actions/runs/41511352532)
passed **shared contracts, Android `assembleDebug`, and iOS simulator compile**.
The prior native-fix commit `5e5e7f1` passed the same three jobs on run
[41509718207](https://github.com/uddieee33-blip/Sornio/actions/runs/41509718207).

Production cloud sync remains disabled. No financial writes were added.

## B. Exact git state

| Ref | SHA |
| --- | --- |
| `origin/main` | `005f27a7702b37916ae517b7f37360c0e9ce436f` |
| Verified PR head | `7b343f6497303197c76e025d716b59b500b379f2` |
| Branch | `arena/5ed2bd28-sornio` |
| PR | [#143](https://github.com/uddieee33-blip/Sornio/pull/143) (draft, MERGEABLE) |

New commits on this assignment:

- `393a91b` `fix(mobile): compile SafeAreaView against React Native 0.88`
- `5e5e7f1` `ci(mobile): prove secret scanning and record the debug APK identity`
- `7b343f6` `docs(mobile): record Android/iOS native compile evidence for PR #143`

## C. Android root-cause analysis

Evidence:

1. CI job `Android debug compile` on run `41506775645` failed at
   `:app:assembleDebug` / `:react-native-safe-area-context:compileDebugKotlin`.
2. Installed `SafeAreaView.kt` (5.6.2) contained
   `uiManager.uiImplementation.dispatchViewUpdates(-1)`.
3. `UIManagerModule.kt` in `react-native@0.88.1` has **no** `uiImplementation`
   member. `setViewLocalData` remains as a no-op stub.
4. `apps/mobile/app.json` sets `newArchEnabled: true`.
5. Expo SDK 58 `bundledNativeModules.json` lists
   `react-native-safe-area-context: ~5.10.1`.
6. Upstream 5.10.1 `SafeAreaView.kt` no longer references `uiImplementation`.
7. Expensify’s SDK 58 notes: bump safe-area-context **before** RN 0.88.

Correction: pin `react-native-safe-area-context` to `~5.10.1` (resolved 5.10.1).
JS usage (`SafeAreaProvider`, `useSafeAreaInsets`) is unchanged.

Forbidden shortcuts were not used: the library was not removed, Kotlin was not
disabled, `node_modules` was not patched, and the Android job remains required.

## D. Dependency compatibility

| Package | Version |
| --- | --- |
| expo | 58.0.22 |
| react | 19.3.0 |
| react-native | 0.88.1 |
| react-native-safe-area-context | 5.10.1 (from 5.6.2) |
| expo-secure-store | 58.0.2 |
| expo-local-authentication | 58.0.2 |
| expo-network | 58.0.4 |
| typescript | 6.0.3 |
| New Architecture | enabled |
| applicationId / bundle | `com.sornio.companion` |

## E. Android verification

Workflow run: [41511352532](https://github.com/uddieee33-blip/Sornio/actions/runs/41511352532)
Job: [125504081282](https://github.com/uddieee33-blip/Sornio/actions/runs/41511352532/job/125504081282)
Outcome: **success** (prebuild, `assembleDebug`, identity, artifact upload)

| Field | Value |
| --- | --- |
| APK path | `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` |
| Artifact name | `Sornio-companion-android-debug` |
| Artifact ID | `13174430942` |
| APK SHA-256 | `9dcb7ab316c0141a1d9d073b16e1315537c90a3ae337d817a16fcb364193f81b` |
| GitHub zip digest | `sha256:04e5f274e7a2aa58b853cf39be92af7a7f0821303777af92a58fe7ef910c8d91` |
| Zip size | 50,052,067 bytes |
| Expires | 2026-11-09T19:44:33Z |
| App version | 0.1.0 (`versionCode` 1) |
| Package | `com.sornio.companion` (`aapt dump badging`) |
| Signing | debug keystore (`android/app/debug.keystore`) |
| Build commit | `7b343f6497303197c76e025d716b59b500b379f2` |
| Emulator smoke | **not run** (no emulator in this environment or the CI job) |

The zip digest is **not** the inner APK file hash. Both are recorded.

Not published to Google Play.

## F. iOS verification

Same run `41511352532`, job
[125504081293](https://github.com/uddieee33-blip/Sornio/actions/runs/41511352532/job/125504081293)
**success**: prebuild, CocoaPods, `xcodebuild` iphonesimulator, unsigned Debug.

Bundle `com.sornio.companion`, `supportsTablet: true`. Simulator launch and UI
navigation were **not** executed. No TestFlight / IPA / App Store claim.

Remaining CI warnings: Node 20 deprecation on `actions/checkout@v4` /
`setup-node@v4`; macOS arm64 queue notice.

## G. Shared tests (commit `7b343f6`)

| Check | Result |
| --- | --- |
| `npm run verify:mobile-contracts` | PASS (63 checks: paise, sync, demo isolation, roles, cache, threats) |
| `apps/mobile` `tsc --noEmit` | PASS (CI + local) |
| Secret scan + synthetic `SUPABASE_SERVICE_ROLE` canary | PASS |
| Root `npm run typecheck` | PASS |
| Root `npm run lint` | PASS |
| Root CI lint/types/build | PASS (`41509718113`) |
| Root dependency audit | PASS |
| Legacy `mobile/android` review | PASS (1m24s) |
| Root `npm run verify` | previously PASS on the reconciled tree; not re-run after this native pin |

## H. Security review

- No service-role keys, vault keys or production private keys in companion sources.
- Scanner ignores `node_modules` (avoids Chrome CrUX demo key false positive).
- Scanner **must** match a synthetic `SUPABASE_SERVICE_ROLE` canary before scanning the tree.
- Session JSON remains in SecureStore; snapshots stay memory-only.
- `extra.productionSyncEnabled: false`. Production adapter still throws `PRODUCTION_DISABLED`.
- Biometrics unlock the companion session only.
- Client roles do not grant financial writes.

## I. Dependency audit (`apps/mobile`)

`npm audit`: **11 moderate**, 0 high/critical.

Root advisories:

- `glob` 13.0.6 — GHSA-3g3m-2fjr-6pw4 (AbortSignal cancellation)
- `minimatch` 10.2.6 — GHSA-g3hv-75wg-m249 (DoS via globparts)

Path: `expo@58.0.22` → `@expo/cli` / config / fingerprint / metro-config.
`npm audit fix` wants **expo@51.0.39** (major downgrade). **Rejected.**
These are Expo CLI / prebuild toolchain issues, not the companion runtime
bundle. Residual risk accepted for Phase 1.

## J. CI/CD evidence

| Workflow | Run | Result |
| --- | --- | --- |
| Mobile companion | `41511352532` | **success** (shared + Android + iOS on `7b343f6`) |
| Mobile companion (native-fix head) | `41509718207` | **success** (shared + Android + iOS on `5e5e7f1`) |
| CI | `41509718113` | **success** |
| Android review package (WebView) | `41509718103` | **success** |

`mobile.yml` permissions remain `contents: read`. Android and iOS jobs still
require the shared job. The Android job is not optional.

## K. Regression risk

- Windows / `packages/local-store` / SQLCipher: **unchanged**
- Legacy `mobile/android` (`com.sornio.app`): **unchanged**
- PRs #126 and #127: **not merged**
- Financial write surface: still none on mobile

## L. PR #143 review

Draft, `MERGEABLE` / `CLEAN` at the verified native-build head. **Do not
auto-merge.** Founder review remaining: read this report, confirm the debug APK
artifact, and decide when to undraft.

Outstanding: no emulator/simulator *runtime* smoke; production sync still
disabled; unsigned debug APK only.

## M. Next phase (Hybrid Sync Phase 2)

Do not start live financial replication until:

1. Founder accepts PR #143.
2. A dedicated live-read adapter exists on the desktop/cloud side.
3. `productionSyncEnabled` remains false until that adapter is tested.
4. Encrypted durable snapshot cache is designed.
5. Runtime smoke on a device or emulator is recorded.

## Verdicts

| Area | Verdict |
| --- | --- |
| Shared mobile architecture | **GO** |
| Android debug compilation | **GO** |
| iOS simulator compilation | **GO** |
| Android runtime verification | **UNTESTED** |
| iOS runtime verification | **UNTESTED** |
| Security baseline | **GO** |
| PR #143 merge readiness | **GO** for founder review (keep draft; do not auto-merge) |
| Production cloud sync | **NO-GO** |
| Google Play publication | **NO-GO** |
| App Store publication | **NO-GO** |
