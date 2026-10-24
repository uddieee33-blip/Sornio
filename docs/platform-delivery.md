# Windows, Android and shopkeeper workflow

The first delivery is an installable web app. `/install` gives Windows and Android instructions and uses the browser installation prompt when available. This change does not produce an EXE, MSIX, APK or Play Store listing. The existing product name is preserved.

## Included

- `/home` starts with everyday jobs in plain language. Only jobs available under the current portal and plan are shown. The existing detailed overview remains accessible.
- Owner → business → optional bank/UPI/GST setup remains at `/onboarding`, with a direct review link from home. Business form fields have associated labels and business-type instructions use simpler wording.
- The installed app starts at `/home`; the manifest adds bill, payment and customer shortcuts. Server authentication, tenant checks and onboarding still apply to shortcuts.
- The service worker caches only `/offline.html`. It never caches account HTML, API responses, invoices or customer records. Reloading while offline shows reconnect guidance; this is not a complete offline desktop application.
- Customer dues have automatically prepared SMS and WhatsApp drafts under Customers → SMS & WhatsApp payment reminders. Values come from the current ledger, include partial collections, exclude settled/credit balances and require a valid phone number. Opening a draft does not imply sending or delivery. These manual drafts do not require a paid messaging integration; the mobile carrier may charge for SMS.

## Still required before claiming native or automated delivery

1. Run real installation acceptance on Windows Edge/Chrome and Android Chrome, including uninstall/reinstall, taskbar/home-screen launch and authenticated sessions. Browser UI emulation cannot establish actual OS installation.
2. Decide whether downloadable native packages are required beyond the web app. Packaging requires a verified production origin, update strategy, signing/distribution decisions, and scanner/printer acceptance on the target hardware. Do not publish an unsigned installer as a finished production release.
3. Verify hosted signup → confirmation → owner details → business details → optional payment setup → home, then logout and second-device login against staging. Existing local/compiler/database checks do not prove hosted auth or two-device sync.
4. Connect an official messaging provider before enabling automatic sends. For the user's free-for-now constraint, no billable resource is provisioned in this patch. Validate the provider account, sender number, templates, recipient permissions and actual cost first. India domestic SMS setup depends on the provider's DLT registration process.
5. Implement durable tenant-scoped schedules/outbox, idempotency, retries, delivery-status webhooks and cancellation after payment before unattended sending. Browser timers and `wa.me`/`sms:` links are not automatic delivery. Do not store provider secrets in browser state or mark a message delivered merely because a provider accepted a request.

## Checks

`npm run verify` includes shopkeeper summary/reminder regressions and service-worker privacy tests. Run lint, both TypeScript compilers and the production build before release. New copy uses English fallbacks in non-English catalogues pending native review. Static offline copy is English.

References: [Windows PWA installation](https://learn.microsoft.com/microsoft-edge/progressive-web-apps-chromium/ux), [Chrome installation UI](https://web.dev/articles/customize-install), [WhatsApp platform pricing](https://whatsappbusiness.com/products/platform-pricing/), [India SMS requirements](https://www.twilio.com/en-us/guidelines/in/sms).
