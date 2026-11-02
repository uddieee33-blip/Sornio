# Sornio Android connected review build

This project packages the hosted Sornio workspace in an Android WebView.
The shared React Native companion lives in `apps/mobile` (`com.sornio.companion`)
and does not replace this review package. See `docs/mobile/ANDROID-WEBVIEW-MIGRATION.md`. The same
Dawn/Dusk and appearance controls drive the web content on Android and Windows.
It is an initial connected companion, not an offline Android database or a Play
Store release. No APK is claimed until the Android review workflow succeeds.

Build with JDK 17, Android SDK 35 and Gradle 8.11.1:

```sh
cd mobile/android
gradle :app:assembleDebug :app:lintDebug
```

The GitHub `Android review package` workflow installs these tools, tests the URL
policy and publishes `Sornio-Android-review/app-debug.apk`. Its debug signing key
is for review; it is not a durable release identity. Repeated CI runs can produce
different debug keys, so retain the earlier app/data until unsynced work is safely
exported or synchronized. Release signing and distribution remain pending.

The app starts at the fixed HTTPS production origin. It ignores incoming intent
URLs, keeps other origins out of the WebView, refuses cleartext, file access,
mixed content and certificate errors, and has no JavaScript/native bridge.
External links need a user gesture and an allowed scheme. Provider document
selection allows CSV/backup input without general storage permissions. OS backups
are disabled so they do not silently copy the browser session to another device.

Review limitations: camera capture, browser downloads/printing and passkeys need
browser handoff. The handoff opens the current screen and can require a separate
browser login. No push notifications, deep-link authentication callback, offline
cold start, device pairing or LAN synchronization is implemented. Rotating the
activity reloads the home screen; saved records use the existing app persistence,
but unsaved form drafts do not survive recreation.

Before release: install on real Android devices, test sign-in/out, owner setup,
all eight businesses, theme persistence, billing, interrupted connections, retry,
keyboard/insets, process death, CSV import, payment-app return and accessibility.
Use only disposable records until native acceptance has passed.

References: [AGP 8.9 compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes),
[WebView file access](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion).
