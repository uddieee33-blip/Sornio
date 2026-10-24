# Sornio handoff audit — 24 October 2026

Continuation verified on 25 October 2026 (India time).

**Recommendation: hold PR #104; do not merge or call this release-ready yet.** Its industry-specific direction is correct, and none of the eight original portal module sets was removed. Bank-data access and the missing business address still need separate implementation and staging verification. The follow-up branch fixes a smaller set of independently reviewable defects without changing a database schema.

## References checked

- Main: `b46e75f53fca011741701bfaa7671347cb7c6d81` (merged #103).
- [PR #104](https://github.com/uddieee33-blip/DukaanOS/pull/104): OPEN, not merged, mergeable; head `bedae1d4463cdb642308f0739010fd17ee590c12`. GitHub lint/types/build and production dependency audit succeeded; Vercel status succeeded; Supabase Preview was skipped. These statuses establish build results, not hosted onboarding or staging correctness.
- [PR #20](https://github.com/uddieee33-blip/DukaanOS/pull/20): original portal blueprints at head `005f6a4f1795c8f007dcc4ebb60c951bb44a810b`.
- [PR #100](https://github.com/uddieee33-blip/DukaanOS/pull/100): generic admin regrouping, merge `7538a6714187416fce212abd12b4c8ebc5e69d8d`.
- [PR #79](https://github.com/uddieee33-blip/DukaanOS/pull/79) and [PR #91](https://github.com/uddieee33-blip/DukaanOS/pull/91): owner onboarding and dedicated owner/bank screens are requirements to retain.

## Main, PR #104, and this follow-up

| Requirement | Current main | Only in PR #104 | Follow-up / remaining gap |
| --- | --- | --- | --- |
| Landing and centered sign-in/create-account experience | Present from #103 | Retained | No replacement |
| All eight original portal module sets | Present in `lib/portals/blueprints.ts` | Preserved, with scan added to selected retail types | No modules removed |
| Purpose-built everyday home and navigation | Generic home/groups obscure the original trade design | `lib/portals/daily-workspace.ts`, trade labels in `lib/workspace.ts`, trade-specific metrics, jobs and focus panels in `components/cockpit/simple-home.tsx` | Action affordances now also check the verified role |
| Trial entitlements without irrelevant navigation | Trial reveals extra navigation | `lib/portals/portal-provider.tsx` separates full trial entitlement from explicit Everything On presentation | Existing role/API guards retained; live override tests remain |
| Owner → business → bank/tax setup | Three-step flow and remote profile persistence already exist | Dedicated business step previews the chosen console; owner/bank fields and GSTIN improved | Business address is still missing in UI, model, wire format and schema |
| Hosted save before `/home` | Remote save exists | Remote save precedes local completion/template changes | Check local template result and portal publication; failed publication keeps the form open |
| Supplied bank/UPI fields validate; cash-only setup works | Server silently drops some invalid optional values | Browser validation improved | Server rejects invalid/truncated/conflicting values; local profile action rejects malformed account/IFSC/holder input |
| Bank details masked and private | Setup masks display; business settings exposes an unmasked input; database members can read bank JSON | Bank setup input masked by default | Settings input now masked with an explicit reveal control; **database privacy is not fixed** |
| Receipt/UPI totals and Khata | Shared accounting engine exists; portal Khata uses opening balances | Portal Khata uses current ledger balance; daily metrics use recorded payments | Existing billing/accounting/shopkeeper tests pass; no settlement verification is inferred |
| Premium system across operational pages | Shared cards/buttons/forms with inconsistent treatments | New home/setup/navigation surfaces | Shared screen-only control, type, focus, card, table and empty-state refinements; page-by-page visual acceptance still pending |

The original/current blueprint comparison evaluated module sets for every portal: **zero removed modules in all eight**. Their focus kinds also remain: gym renewals, café reorder, kirana udhaar, salon appointments, electronics/boutique reorder, services appointments and general recent activity.

The new everyday homes use the existing operational engine: kirana billing/Khata; gym check-ins/renewals; café counter bills/menu/pantry; salon and services day books; electronics/boutique catalogue, stock and billing; general basic operations. This does not establish that deeper features such as a restaurant kitchen order queue, electronics warranty lifecycle or fashion variant management are implemented. Those need their own functional inventory and acceptance tests; do not market them from a portal name alone.

## Concrete fixes in this branch

- `lib/sync/profile.ts`: validate raw optional payment details before the tolerant legacy decoder can erase/truncate them. Reject invalid UPI/IFSC/account numbers, conflicting collection IDs, missing IFSC/holder for a supplied account, and malformed bank payloads. Keep cash-only setup valid and allow-list credentials out of the payload.
- `app/api/profile/route.ts`: return failure when the business metadata update errors or returns no saved row, before attempting the owner-profile upsert. A zero-row UPDATE can otherwise look successful under RLS. This is still two writes, not an atomic database transaction.
- `app/onboarding/page.tsx`: check template application and hosted portal-publication results before showing success or navigating.
- `lib/store.tsx`: reject invalid bank settings before mutating local profile state.
- `lib/portals/daily-access.ts`, `components/cockpit/simple-home.tsx`, `components/layout/command-palette.tsx`: filter daily write actions and setup prompts using verified identity permissions. Demo mode explicitly uses owner capabilities. Unknown identities fail closed. Read-only workspace links remain available; these UI checks do not replace server authorization.
- `app/sornio-controls.css`, `components/ui/{Button,Card,EmptyState}.tsx`, `app/layout.tsx`: restrained shared surfaces and controls, readable table headings, consistent type/focus states, no shared card lift or button scaling, screen-only CSS and reduced-motion handling. Existing theme tokens are retained; no new runtime dependency.
- `app/(console)/business/page.tsx`: associated form labels, accessible status/error feedback, masked account input and a stationary collection QR.
- `.github/workflows/ci.yml`: run CI for a stacked PR targeting `feature/sornio-business-workspaces` as well as main.
- Locale catalogues contain both new validation keys. The two messages currently use English fallbacks in the 22 non-English catalogues; key/slot parity does not mean these messages have been translated.

## Merge / release blockers

1. **Sensitive bank data is readable by tenant members.** `supabase/schema.sql` defines both `"Business members view the owner profile"` and `foundation_profile_read` as member-readable SELECT policies on `owner_profiles`; authenticated users have SELECT grants. The `bank` JSON contains the full account number. `lib/sync/profile-server.ts` reads `*`, and `/api/profile` returns it. Masking an input or redacting this API alone does not protect direct database API reads. Separate shared receipt identity/collection UPI data from owner-restricted bank data, or implement an equivalently restricted read/write boundary. Review all existing permissive policies together and prove it under actual RLS. No such migration was run or bundled here.
2. **Business address is not persisted.** Add an explicit model/wire/database field and a tested migration; do not hide it in the free-text description. Decide which category-specific fields are required without blocking cash-only or unregistered businesses.
3. **Profile/business writes are not atomic.** The follow-up stops false success on an update error. A silently filtered metadata UPDATE is now rejected too. If metadata succeeds and profile upsert fails, metadata can still change. Retry is possible, but an atomic RPC/transaction plus concurrency tests is needed for a stronger persistence guarantee.
4. **Hosted/browser verification is incomplete.** Local tests cannot prove provider cookies, real RLS, second-device restore, or responsive layout. The earlier preview was authentication-protected and no bypass was created. The managed preview launcher also failed before serving the app. This continuation has no installed local Chromium binary, so it does not add a browser acceptance claim. Do not equate Vercel success with a visual or end-to-end review.

## Checks executed locally

| Check | Result / scope |
| --- | --- |
| `npm run verify` | Passed all 25 verification scripts, including billing, accounting, inventory, auth, onboarding, profile, security, team, local database/RLS, recovery, rendering and workspace checks |
| `npm run verify:onboarding` | 66 focused assertions, including failed hosted publication and template application; uses the actual finish function with controlled dependencies |
| `npm run verify:profile` | 48 scenarios; actual parser and endpoint compiled, endpoint exercised with a policy-aware fake client; not a hosted Supabase test |
| `npm run verify:workspace` | 33 scenarios across eight portal configurations and four roles, plus provider tests for invalid bank edits, unflushed-payment preservation and account-scope changes |
| `npm run typecheck` | Passed TypeScript 6 compiler |
| `npm run typecheck:native` | Passed TypeScript 7 native compiler |
| `npm run lint` | Passed |
| `npm run build` | Passed production Next.js webpack build; local worker count constrained with `CIRCLE_NODE_TOTAL=2` and `RAYON_NUM_THREADS=2` |
| `git diff --check` | Passed |

The database scripts run locally (including PGlite); no staging or production database was modified. No Windows installer, basic Windows hardware, LAN networking, Android companion, or production security review was validated in this pass.

## Exact remaining acceptance tests

Use a non-production environment and separate owner, manager, cashier, auditor and unrelated-tenant accounts. Preserve evidence for each result.

| Test | Required observation |
| --- | --- |
| First signup: kirana and gym | Account → owner → business → optional bank/UPI/GST → correct console; kirana has billing/stock/Khata and no memberships; gym has members/check-ins/renewals and no retail-first home |
| Remaining six categories | Desktop sidebar, mobile navigation, command palette, metrics, setup jobs and focus panels agree with business type; existing tools remain reachable |
| Returning owner | Relogin and second-device/cleared-storage login restore server profile and chosen console without re-entering setup |
| Incomplete setup/direct URL | `/home` and every console bookmark cannot bypass missing required hosted owner/business data; database read failures do not imply completion |
| Interrupted save | Fail metadata update, profile upsert, portal publication, browser refresh and network response in turn; no premature success/navigation, retained input, clear retry; verify stored state after retry |
| Staff | Invite redemption and role changes cannot create a new owner setup or escalate permissions; mutation APIs reject disallowed writes even when called directly |
| RLS/private bank storage | Cashier/auditor and unrelated tenant cannot SELECT or mutate full bank data through PostgREST/RPC; owner-authorized edits work; shared receipt name/UPI remains usable where permitted |
| Payment and tax input | Blank optional fields accepted; valid UPI produces only an unverified collection preview; invalid supplied UPI/IFSC/account/GSTIN rejected in UI/API; saved destination and QR agree after relogin |
| Financial records | Cash, UPI, card and bank receipts, partial payments, refunds/reversals and Khata opening balance + ledger movements yield correct totals without double counting; a QR/UTR alone never establishes settlement |
| Trial/plan/Everything On | Free/trial/paid/expired cases preserve trade defaults; explicit authorized override respects role and plan restrictions; direct URLs behave consistently |
| Visual/accessibility | Review landing, auth, onboarding and every operational page at 1440, 1024, 768 and 390px; keyboard-only entry, focus, errors/loading/empty states, screen-reader labels, all themes and reduced motion |
| Staging/release | Test any future migration on staging, hosted end-to-end flow, Windows wrapper and basic shop hardware; test recovery/backup and LAN/offline behavior before making corresponding capability claims |

No main merge, production deployment, credential change, access-protection change or database migration is part of this branch.
