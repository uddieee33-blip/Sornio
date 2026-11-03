# Sornio companion (Android, iPhone, iPad)

Shared React Native + Expo application. Phase 1 is a demonstration companion:
read-only screens, labelled DEMO data, no live financial writes.

This package does **not** replace `mobile/android/`, the existing Java WebView
review build.

## Identifiers

| Platform | Identifier | Version |
| --- | --- | --- |
| Android | `com.sornio.companion` | 0.1.0 / versionCode 1 |
| iOS / iPadOS | `com.sornio.companion` | 0.1.0 / build 1 |

The WebView review app remains `com.sornio.app`.

## Develop

```sh
cd apps/mobile
npm ci
npx expo start
```

Expo SDK 58, React 19.3.0, React Native 0.88.1, TypeScript 6.0.3.

## Native compile

```sh
npx expo prebuild --platform android
cd android && ./gradlew :app:assembleDebug

npx expo prebuild --platform ios
xcodebuild -workspace ios/Sornio.xcworkspace -scheme Sornio -configuration Debug -sdk iphonesimulator
```

Linux CI can prebuild Android. iOS compilation needs a macOS runner with Xcode.
This workspace does not contain Apple signing certificates.

## What Phase 1 does not do

- Write invoices, stock, credit or expenses
- Talk to production Supabase with a service-role key
- Persist an encrypted ledger on the phone
- Claim Google Play or App Store readiness
