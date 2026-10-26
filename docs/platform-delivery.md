# Windows, Android and shopkeeper workflow

The public landing page is `/`, the business workspace starts at `/home`, and
`/install` separates native Windows setup from browser installation. The Windows
workflow builds a complete review ZIP and a per-user preview setup EXE, with
automated install/uninstall and profile-preservation checks. A real public HTTPS
installer URL must be configured before the public download button appears.
Both Windows packages remain unsigned and connected. The Android project in
`mobile/android` builds a debug APK for review. A signed Android App Bundle and
Play Store listing remain future work; see `docs/google-play-release.md`.

## Included

- `/home` starts with everyday jobs in plain language. Only jobs available under the current portal and plan are shown. The existing detailed overview remains accessible.
- Owner → business → optional bank/UPI/GST setup remains at `/onboarding`, with a direct review link from home. Business form fields have associated labels and business-type instructions use simpler wording.
- The installed app starts at `/home`; the manifest adds bill, payment and customer shortcuts. Server authentication, tenant checks and onboarding still apply to shortcuts.
- The service worker caches only `/offline.html`. It never caches account HTML, API responses, invoices or customer records. Reloading while offline shows reconnect guidance; this is not a complete offline desktop application.
- Customer dues have automatically prepared SMS and WhatsApp drafts under Customers → SMS & WhatsApp payment reminders. Values come from the current ledger, include partial collections, exclude settled/credit balances and require a valid phone number. Opening a draft does not imply sending or delivery. These manual drafts do not require a paid messaging integration; the mobile carrier may charge for SMS.
- `desktop/windows` hosts the production service in a Windows app window. It restricts embedded navigation to the verified production origin and opens supported external links with Windows. It stores the WebView2 profile separately under the user's local app data, offers Home/Back/Refresh controls and shows a retry path when the service cannot load. It contains no privileged JavaScript bridge or credentials.

## Still required before claiming native or automated delivery

1. Run real installation acceptance on Windows Edge/Chrome and Android Chrome, including uninstall/reinstall, taskbar/home-screen launch and authenticated sessions. Browser UI emulation cannot establish actual OS installation.
2. Build and inspect the Windows review ZIP and setup EXE, then test installation
   and the application on Windows 10/11 with actual scanner/printer hardware.
   WebView2 Evergreen and connectivity are required for cold launch. A fully
   offline Windows build needs the local runtime, encrypted database, operation
   sync and signed offline entitlement in `docs/windows-offline-architecture.md`.
   The preview installer does not implement that architecture. Code signing and
   public distribution remain required before a production Windows release.
3. Verify hosted signup → confirmation → owner details → business details → optional payment setup → home, then logout and second-device login against staging. Existing local/compiler/database checks do not prove hosted auth or two-device sync.
4. Connect an official messaging provider before enabling automatic sends. For the user's free-for-now constraint, no billable resource is provisioned in this patch. Validate the provider account, sender number, templates, recipient permissions and actual cost first. India domestic SMS setup depends on the provider's DLT registration process.
5. Implement durable tenant-scoped schedules/outbox, idempotency, retries, delivery-status webhooks and cancellation after payment before unattended sending. Browser timers and `wa.me`/`sms:` links are not automatic delivery. Do not store provider secrets in browser state or mark a message delivered merely because a provider accepted a request.

## Checks

`npm run verify` includes shopkeeper summary/reminder regressions and service-worker privacy tests. Run lint, both TypeScript compilers and the production build before release. New copy uses English fallbacks in non-English catalogues pending native review. Static offline copy is English.

References: [Windows PWA installation](https://learn.microsoft.com/microsoft-edge/progressive-web-apps-chromium/ux), [Chrome installation UI](https://web.dev/articles/customize-install), [WhatsApp platform pricing](https://whatsappbusiness.com/products/platform-pricing/), [India SMS requirements](https://www.twilio.com/en-us/guidelines/in/sms).
