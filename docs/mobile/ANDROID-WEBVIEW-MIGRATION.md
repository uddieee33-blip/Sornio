# Migration plan: `mobile/android` WebView → shared companion

The Java WebView project is **preserved**. It remains the connected review
package for wrapping the hosted workspace (`com.sornio.app`).

## Keep

- Navigation policy and its 29 URL tests
- HTTPS-only, no JS bridge, no cleartext, no mixed content
- Disabled backups, no file://, certificate errors cancelled
- `.github/workflows/android-review.yml`
- Review APK artifact path

## Supersession

| Track | Package | Purpose |
| --- | --- | --- |
| Review WebView | `mobile/android` | Hosted workspace in a hardened WebView |
| Companion | `apps/mobile` | Offline-capable, read-only, shared RN |

Do not reuse `com.sornio.app` for the companion. The companion id is
`com.sornio.companion`.

## Steps (future)

1. Keep shipping the WebView APK until Hybrid Sync V1 has a proven read API.
2. Run both CI workflows.
3. When live sync exists, move testers to the companion.
4. Retire the WebView only after Play listing, device tests and a documented
   cutover. Do not delete the tree in that same change.
