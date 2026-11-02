# iOS and iPadOS distribution foundation

Phase 1 does **not** submit to App Store Connect or TestFlight.

| Item | Value |
| --- | --- |
| Bundle id | `com.sornio.companion` |
| Display name | Sornio |
| Version | 0.1.0 |
| Build | 1 |
| Devices | iPhone and iPad (`supportsTablet: true`) |
| Encryption | `ITSAppUsesNonExemptEncryption = false` (exempt / no non-exempt crypto claimed) |

## Privacy

Face ID usage string states session unlock, not gym attendance.
ATS arbitrary loads are off.
No custom URL auth callback.

## Signing

No certificates are in this repository. Simulator compilation does not need a
paid Apple Developer account. Device and TestFlight builds will.

## TestFlight (later)

1. Apple Developer membership (not created here).
2. Signed archive from Xcode or `xcodebuild -archive`.
3. Privacy Nutrition labels, privacy policy, account deletion.
4. Review notes that Phase 1 is demo until live sync exists.

A successful TypeScript build is **not** an iOS build.
A successful Android APK is **not** iOS evidence.
