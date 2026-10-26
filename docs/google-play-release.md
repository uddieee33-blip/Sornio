# Android release after the Windows milestone

The current `mobile/android` project is a connected review companion and builds
a debug APK. It is not a Google Play release. Keep the Windows offline/database
work ahead of the next Android implementation milestone.

Before a Play submission:

1. Finish and test account sign-in/callbacks, role-scoped business access,
   reconnect and process recreation, file exports, camera scanning and printing
   on real supported devices. A hosted WebView does not establish offline/LAN
   operation or correct device behavior.
2. Settle Android monetization before shipping the web subscription checkout
   inside the app. Sornio's own paid software features differ from a shop's UPI
   collections for physical goods/services. Review the applicable Play Billing
   or eligible alternative/external-payment program for each release market;
   an embedded UPI checkout is not automatically eligible. The current website
   uses manual renewal and payment-verified activation keys, not auto-renewal.
3. Confirm the current Play target API requirement, finalize application ID and
   versioning, configure release signing/Play App Signing and protect upload
   credentials outside the repository. Build a signed Android App Bundle (`.aab`)
   for Google Play; the debug APK is only for review.
4. Prepare an accurate listing, screenshots, privacy policy, Data safety and
   content/target-audience declarations, account-deletion flow where required,
   and valid review-account instructions. Describe actual shipped behavior.
5. Use internal testing first, then the required testing track. New personal
   developer accounts created after 13 November 2023 currently need at least
   12 opted-in testers continuously for 14 days before applying for production
   access. Completing that period does not guarantee production approval.

Official references checked on 26 October 2026:

- [App Bundles](https://developer.android.com/guide/app-bundle)
- [Payments policy and program exceptions](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Android privacy checklist](https://developer.android.com/privacy-and-security/about)

Recheck these requirements in the actual Play Console account at release time.
