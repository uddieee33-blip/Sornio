# Android distribution foundation

Phase 1 does **not** upload to Google Play.

| Item | Value |
| --- | --- |
| Application id | `com.sornio.companion` |
| Version name | 0.1.0 |
| Version code | 1 |
| Min SDK | Expo 58 default (confirm at prebuild; target 35+) |
| Debug artifact | `assembleDebug` APK |
| Release artifact | future AAB, never the debug key |

## Permissions

Internet is required. Camera, location, microphone and storage are blocked in
`app.json`. Expo's debug template may still declare `SYSTEM_ALERT_WINDOW` and
`VIBRATE`; strip them before a Play upload. Biometric permissions are for
session unlock only.

`android:allowBackup` is false in the Expo config.

## Signing

Debug signing is for review. Repeated CI keys differ. Commercial release needs:

1. A dedicated upload keystore, stored outside git.
2. Play App Signing.
3. `bundleRelease` → `.aab`.

Do not use the WebView id `com.sornio.app`.

## Play Console (later)

Internal testing first. New personal developer accounts created after
13 November 2023 still need the 12-tester / 14-day closed testing rule unless
Google changes it — re-check at submission. Data safety, privacy policy,
account deletion, and billing policy (Sornio software vs shop UPI) remain.

See also `docs/google-play-release.md` for the WebView track.
