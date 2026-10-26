# Windows first, download website second — 26 October 2026

## Recovered plan and current instruction

The earlier plan proposed a shared repository with separate public website and
React/Tauri desktop applications. Windows owns local business operation through
SQLite; the website presents the product, plans and a verified Windows download.
LAN multiuser operation follows local billing, then authenticated cloud
backup/sync and subscriptions. Android follows Windows. Keep the eight
business-specific consoles and extract shared domain logic rather than replacing
them with a generic dashboard.

The owner's latest direction is Windows first; a separate one-page public landing
page should use stronger parallax and real screen captures of the installed
product, not generated depictions of dashboards. Remove public demo/workspace
entry points from that final marketing site. Plans and downloads stay public;
private business operations belong in the installed app.

## Product decisions carried forward

- The name is **Sornio**, without “OS”. Keep a restrained, curved, premium
  interface for long counter shifts, with light/dark treatment and fast operation
  on ordinary shop PCs. Heavy scroll/parallax belongs to the public landing page;
  respect reduced motion and keep billing interactions responsive.
- Preserve all eight business-specific consoles. Memberships belong to gyms;
  Udhar Khata belongs to grocery/kiryana. Do not replace these with one generic
  workspace as native features are ported.
- Plans are **Basic, Growth and Team**. Confirm their capability limits and
  prices before advertising or enforcing them. Owner/manager purchase controls,
  verified payments and scoped offline entitlements are part of implementation;
  selecting a plan in the UI cannot unlock a paid entitlement by itself.
- Platform sequence: **Windows → Android phones/tablets → iOS → iPadOS → macOS**.
  Build shared rules and sync boundaries now; each platform still needs its own
  native acceptance and release gates. Windows remains the current delivery focus.
- Keep owner → business → bank/GST → plan/payment onboarding in the migration
  scope, alongside offline billing, stock, receipt language/CA exports, roles and
  eventual UPI reconciliation. Draft storage is not that onboarding or billing.

## Repository boundaries

| Location | Responsibility | Status |
| --- | --- | --- |
| Root Next.js app | Existing hosted product and public pages | Existing; keep records accessible during migration |
| `apps/desktop` | Bundled React screens, Tauri native commands and installer | First local draft/storage slice |
| `packages/local-store` | Native encrypted SQLite and schema migrations | Draft persistence with revision checks |
| `apps/website` | Separate public marketing/download application | Planned extraction after Windows parity |
| Shared domain/UI packages | Reuse the existing billing rules, portal mapping and visual tokens | Extraction still required |
| `desktop/windows` | Older connected review host | Do not label offline-complete |

Do not move the existing Next.js tree wholesale just to achieve these names.
Extract one bounded unit at a time, with regression checks and explicit adapters
for hosted APIs versus local native commands.

## Delivery sequence

1. **Bundled startup and local storage.** Independent local UI, encrypted SQLite,
   versioned migrations, fail-closed native key provisioning, restart checks and
   a Windows review installer. The first slice stores only sample workspace drafts.
   Draft recovery now retains the latest 20 encrypted copies and restores into
   a new revision. This is local edit recovery, not database/device-loss backup.
2. **Identity and domain parity.** Provision a verified business online, import its
   initial data, add offline unlock/roles and separate business/staff keys. Share
   the existing portal mapping, money calculations and validation. Do not duplicate
   financial rules or rely on a frontend role flag.
3. **Atomic offline operation.** Commit bills, stock, cash/dues, audit and immutable
   outbox together with stable operation IDs. Success follows durable commit.
   Prove restart, full disk, failed writes and power interruption. Support receipts,
   scanning, backup and recovery with migration/rollback checks.
4. **LAN, then cloud.** Pair a shop hub securely, authenticate staff/device commands,
   deduplicate operations and expose conflicts. Add optional authenticated remote
   backup/sync afterward; the website never receives a direct database key.
5. **Subscriptions and distribution.** Signed scoped offline entitlements, expiry/
   clock-rollback rules, signed updates/installers and real Windows hardware tests.
   Publish a real versioned installer with its hash before enabling public download.
6. **Public website.** Extract the one-page marketing/download site. Replace public
   app/demo calls to action with download/setup. Use native app captures containing
   synthetic sample data, labeled truthfully, for layered parallax sequences.
   Preserve reduced-motion support and a lightweight fallback on slower devices.
7. **Android.** Port the shared rules with secure device sync, device acceptance,
   signed App Bundle and the Play release requirements. No launch claim before
   the actual release gates pass.

## Security meaning of the split

Moving from browser access to installed software changes deployment and local
availability; it does not automatically make the data safe. Authentication,
authorization, encryption, recovery, signed updates and scoped sync APIs still
matter. The API must enforce business/device scope even when a caller is not the
official desktop client. Removing a public link or checking a user-agent header
is not an authorization boundary.

The first local review has no network/sync client and does not upload its sample
drafts. It is intentionally separate from existing production records. Do not
disable hosted account access until import, account recovery and native feature
parity are proven; otherwise the older connected Windows host would also fail.

## Evidence and remaining acceptance

Local frontend build and encrypted-store tests are recorded in the PR. The new
Windows workflow must compile/test native Credential Manager integration, build
the installer and verify the native window save/reopen flow. Browser-only screenshots
or mocked IPC do not establish Windows acceptance. Signing, full desktop parity,
multi-account separation and two-PC tests remain required before customer release.

