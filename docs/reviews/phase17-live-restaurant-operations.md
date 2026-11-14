# Phase 17: discovery, trusted connections and live restaurant operations

## Source and publication

Verified PR #167 and fetched its published head `fa42d54b438851e8e176d878fda3fa8086b1a412`. Verified the actual dependency chain through PRs #166, #165 and #164 before implementation. Work is stacked, with no merges or main changes.

| Branch | Published head | Draft PR | Base |
| --- | --- | --- | --- |
| feature/phase17a-lan-discovery | 27b4310f20820677eae02c3eb8a96489cfda35c5 | https://github.com/uddieee33-blip/Sornio/pull/168 | feature/phase16-hub-setup |
| feature/phase17b-trusted-pairing | d58f96e78dd360d406a913efde42fb6355dbe5c7 | https://github.com/uddieee33-blip/Sornio/pull/169 | feature/phase17a-lan-discovery |

Phase 17C targets Phase 17B; its confirmed publication SHA is recorded in that PR. Authorized GitHub Git-data publication preserves exact source trees while retaining local logical commits. No manual CI dispatches or lockfile hand edits.

## Implemented source paths

**Windows/macOS hub:** native `_sornio._tcp.local.` DNS-SD advertising is scoped to the explicitly selected private IPv4 interface. Public protocol/shop/hub/origin/certificate metadata has no credential, staff grant or financial record. Enable requests advertising; disable, certificate replacement, listener failure and runtime cleanup unregister/shut down it. Stable instance identity and client deduplication avoid accumulating duplicate rows. Discovery errors retain HTTPS/manual-card fallback. macOS local-network/Bonjour usage is declared; Windows continues normal private binding/firewall requirements. An advertisement request is not proof that another device received it.

**Android:** the existing app has a local Expo module using NsdManager, bounded queued resolution and removal/foreground refresh handling. Android 17 local-network permission is declared/requested, with denied-permission guidance. A bounded private-address cache re-resolves service addresses for older Android versions without system `.local` DNS. That address hint leaves the HTTPS hostname unchanged and never replaces TLS hostname/chain verification or certificate pinning.

**iPhone/iPad:** the same local module uses NetServiceBrowser/NetService with Bonjour/local-network declarations. Native URLSession handles pinned requests; there is no separate application. Phone layout remains vertical; tablet-sized windows can show tables and draft/menu review side by side, including portrait iPads when text size permits.

**Discovery and trust:** nearby results are untrusted hints. Previously confirmed/saved shops are labelled without treating a matching advertisement as authentication. Manual addresses, QR cards and saved shortcuts remain available. A credential-free native HTTPS probe validates ordinary OS chain/date/hostname trust and obtains the actual leaf SHA-256 fingerprint. First connections and certificate changes require explicit comparison with the owner's desktop. Confirmed pins persist alongside existing business/device identity. Enrolment approval and native employee sign-in remain separate checks.

Every credential/order request checks the pin on its actual TLS connection before HTTP headers/body. Android retains default OkHttp verification and checks the leaf in a network interceptor before CallServerInterceptor; iOS evaluates normal SSL hostname/chain policy before accepting the trust challenge and compares the leaf. Routes, redirects, sizes and timeouts are bounded. No trust-all callback, custom anchor override, HTTP fallback or unpinned Expo-fetch fallback exists. Certificates that fail normal trust still require repair/OS trust provisioning. Public cards may carry a fingerprint but no reusable credential.

**Live operations:** the app opens directly into shop discovery/connection; companion demo bootstrap occurs only when explicitly selected. Authenticated staff immediately receive real hub tables, menu, assignments, accepted batches and KOT progress. Reviewed submissions persist before sending and use the existing revision-guarded native acceptance path. The desktop restaurant workspace and incoming-order/audit view refresh from native persistence. Desktop KOT state changes become visible on connected mobile screens; mobile KOT-state mutation is not added.

Live refresh is foreground-only, single-flight and guarded against stale responses. Failures back off to 30 seconds. Desktop passive-scope/read commands do not renew idle authority. Mobile refresh does not extend native staff-session expiry or the desktop's idle deadline. Revisions refresh without overwriting local drafts; desktop unsent item lists are separated by order.

User-submitted requests may resume after a foreground reconnection: durable metadata marks that intention, and recovery queries the recorded operation before resending the identical request. Old queue-only drafts remain manual. Pause controls retain unknown outcomes and do not permit amendment/acknowledgement without a final hub result. Native role, grant, generation, menu-price and revision validation still apply on delivery. No mobile financial settlement, automatic KOT dispatch, stock posting, customer debt or table release is added.

## Focused checks

Passed on this stack:

- Desktop TypeScript/Vite build and full mobile TypeScript.
- 31 shared discovery/trust/setup/restaurant/refresh tests: malformed hints/cards, duplicate/removal/expiry handling, certificate review states, legacy pairing compatibility, immutable lost-response recovery, bounded/concurrent secure storage, reconnect intention/pause and single-flight/stale-result refresh.
- 63 existing mobile contracts and 38 desktop contracts.
- 92 real SQLite schema checks plus focused hub history/session predicates and the migrated open-order SQL guard.
- Android and Apple autolinking each resolve exactly one SornioLan native module. Expo public configuration resolves network declarations.
- Strict shared TypeScript and diff whitespace checks.

These are not native or physical-network acceptance. Two passive-idle Rust tests were added; they and the existing six hub Rust tests remain unexecuted because Cargo is unavailable. Kotlin/Swift compilers and native platform hosts are unavailable here. Cargo.lock generation remains required through Cargo, including new mdns-sd/url dependencies. No financial/security gate was removed.

## Remaining verification and functionality gaps

Windows/macOS builds, mDNS registration/goodbyes/interface changes, firewall and Apple privacy behavior, Android permission/DNS behavior, URLSession/OkHttp pre-send pin enforcement, certificate expiry/rotation, native SecureStore/restart/concurrency behavior and real-device interoperability all require equipped-host acceptance. Native financial and installed-app release gates remain mandatory. No platform is declared production-ready or physically synchronized from these source checks.

Shop TLS material and trust must still be provisioned. For LAN-only resolution, use a certificate-covered `.local` hostname advertised by the hub; other certificate hostnames require working private DNS. Guest Wi-Fi isolation or blocked multicast can prevent discovery, so cards/manual setup remain necessary. Broad local-network access is requested for the core restaurant LAN workflow; no camera/location permission is added. Discovery support requires a rebuilt native app, not an Expo Go or JS-only update.

Automatic CA issuance/installation, device attestation, LAN financial settlement and mobile kitchen-state editing remain unimplemented. Refresh uses bounded polling rather than push; the hub's existing request budget remains enforced. Revoked devices and unresolved operations still require owner review rather than silent discard or reassignment to another identity.

Next priority: compile and exercise this exact native stack with one desktop and two mobile devices, regenerate native locks, and repair observed interoperability defects. Then improve certificate provisioning and operational push coordination without changing financial authority.
