# SORNIO — Phase 7 / Assignment 1: Independent Windows UX Audit

**Status:** reviewable blueprint only. No production UI, CSS, Tailwind, Rust, SQLCipher, shortcut, financial-test or release change is authorized or included in this work.

**Date:** 2026-11-03 (UTC)
**Working branch:** `arena/2c0afc32-sornio`
**Audit source SHA:** `97b6899475cc3dfa3ff1370f59373401646eecfb` — PR #145 integration head and the code parent of the current `main` merge.
**Product:** Sornio — *Small business, big numbers.*
**Design direction:** SORNIO — PRECISION WORKSPACE.

> Evidence rule used throughout: `Control/data: high` means the workflow, control name, value or state is asserted by `apps/desktop/check-native.py`, `apps/desktop/check-*.cjs`, a verifier, or the React/Rust source. `Visual: unverified` means no installed-app PNG was decoded and viewed in this sandbox. Conceptual wireframes in the companion design-system document are not screenshots.

---

## 1. Repository baseline re-established

### 1.1 Live Git and PR state

| Field | Observed value | Notes |
|---|---|---|
| `main` at audit start | `005f27a7702b37916ae517b7f37360c0e9ce436f` | `build(deps): bump the minor-and-patch group with 6 updates (#140)`. |
| PR #145 at audit start | OPEN, head `97b6899475cc3dfa3ff1370f59373401646eecfb`, base `main`, head branch `arena/2a724501-sornio` | Title: *Phase 5 integration: PR #143 head + unique PR #144 Phase 4 changes + ₹1,000 installed-UI regression*. |
| External change during this audit | PR #145 merged at `2026-11-03T20:57:20Z` by another actor; merge commit `1cc5c798d1eada9a16463213b0776c01e99d36f9` | **This assignment did not merge, close, force-push, deploy or alter PR #145.** |
| `main` at audit end | `1cc5c798d1eada9a16463213b0776c01e99d36f9` | Merge parents: `005f27a` + `97b6899`. `git diff origin/main origin/pr145` is empty. |
| Reviewed integration SHA | `97b6899475cc3dfa3ff1370f59373401646eecfb` | Latest integrated release candidate; now the code parent of `main`. Code head of the ₹1,000 installed-UI regression is `21a3f7c9e5ac5c9941a5a7aadeea09617665155f`. |
| Phase 6 review branch | `arena/72a3d715-sornio` @ `fafef33a8670ea2c8b6fc7d3d5fd1187f517a729` | Read-only. Its release-gate report was written while PR #145 was still OPEN; preserved as historical evidence. |
| Phase 6 report | `docs/reviews/PHASE-6-SINGLE-TILL-PILOT-RELEASE-GATE.md` | Final-head CI matrix recorded PASS; physical PC/printer and code signing remained gates. |
| Current working branch | `arena/2c0afc32-sornio`, based on `005f27a` | Documentation-only branch. Not rebased onto the newer `main` during this assignment. |

PR #145 check-runs on `97b6899` were queried live: `Lint, types, build`, `Contracts, types, security`, `Dependency audit`, `Android debug compile`, `android`, `Real PostgreSQL concurrency`, `iOS simulator compile`, `browser`, `local-windows` and `Vercel Preview Comments` all report SUCCESS. `Supabase Preview` is skipped. The `local-windows` job is run `41709217989`, job `126172575846`.

### 1.2 Application entry point and architecture

| Concern | Source | Finding |
|---|---|---|
| Desktop HTML entry | `apps/desktop/index.html` | `<html lang="en">`, `<div id="root">`, `/src/main.tsx`; `<meta name="color-scheme" content="light dark">`. |
| React entry | `apps/desktop/src/main.tsx` | `createRoot(...).render(<AccessGate>{(onLocked, session) => <App .../>}</AccessGate>)`; one `App` owns global dirty/busy/refresh state. |
| Access shell | `apps/desktop/src/AccessGate.tsx` | First-time setup and unlock are one card; 15-minute inactivity lock; `setup_local_access` / `unlock_workspace` / `read_local_session`; recovery backup panel on the unconfigured screen. |
| Native bridge | `apps/desktop/src/native.ts` | Adds `scope` to every scoped command; native Rust revalidates the session. Scope is explicitly documented as a comparison value, not authority. |
| Desktop styling | `apps/desktop/src/style.css` | 39 long lines of hand-written CSS; four custom properties (`--panel`, `--muted`, `--line`, `--accent`); many literal colours; media queries at 1100/680/480px; automatic `prefers-color-scheme: dark`; `prefers-reduced-motion` support. |
| Build | `apps/desktop/vite.config.ts` | Vite 8.3.5, React dedupe, no PostCSS/Tailwind pipeline in the desktop app. |
| Native window | `apps/desktop/src-tauri/tauri.conf.json` | Title `Sornio · Local workspace review`, 1240×820 default, minimum 760×580, `maximized: true`, NSIS per-user installer, offline WebView2 installer. |
| Capabilities | `apps/desktop/src-tauri/capabilities/local-workspace.json` | Only the bundled `main` window gets workspace, stock, billing, identity, customers, retail and recovery permissions. No filesystem/HTTP/SQL plugin is exposed to the renderer. |
| Rust commands | `apps/desktop/src-tauri/src/main.rs` | `read_cashier_state`, `prepare_local_checkout`, `post_local_invoice`, `prepare_local_retail`, `post_local_retail`, `clear_local_checkout`, `clear_local_retail`, credit/customer/backup/export commands, all behind `with_scoped_workspace`. |

**Not the desktop app:** `app/`, `components/`, `lib/`, `desktop/windows/`, and the Next.js/Tailwind tree are the hosted web product and an older WebView review host. The audited installed Windows app is `apps/desktop/`.

### 1.3 Dependencies and existing token systems

- Desktop app dependencies: React 19.3.1, React DOM 19.3.1, `@tauri-apps/api` ^2, Vite 8.3.5, TypeScript 6.0.3. **No desktop UI component library, icon library, chart library, Tailwind usage or new runtime dependency is present.**
- Root web app: Next.js 16.4.3, Tailwind 4.3.3, `lucide-react`, `recharts`, `@fontsource-variable/inter`, `@fontsource-variable/space-grotesk`. These are not used by the installed Windows cashier UI.
- Existing token systems: `lib/theme/palettes.json` (ten web paints with OKLCH definitions), `packages/mobile-design/src/tokens.ts` (Dawn/Dusk companion tokens, 44px touch target, spacing/type/radius/motion/layout), `lib/motion/tokens.ts` (web motion durations), and the desktop CSS custom properties. The Phase 7 proposal in Document 2 is a **desktop-specific semantic layer**; it does not replace or erase these prior systems.
- Fonts: `apps/desktop/public/fonts/noto-sans-gurmukhi.woff2` is bundled offline with `NotoSansGurmukhi-OFL.txt` (SIL Open Font License 1.1, Copyright 2022 The Noto Project Authors). `apps/desktop/src/locales/pa.json` has 33 receipt/control strings, not a full Punjabi UI catalogue.

### 1.4 Documentation read

`docs/SORNIO-DESIGN-SYSTEM.md`, `docs/SORNIO-VISUAL-SYSTEM.md`, `docs/SORNIO-WORKSPACE-REDESIGN.md`, `docs/design/cash-plus-credit-split.md`, `docs/onboarding-audit.md`, `docs/reviews/operator-ux-review-2026-11-02.md`, `docs/reviews/2026-11-03-windows-installed-pos-acceptance.md`, `docs/reviews/PHASE-5-RELEASE-CANDIDATE-INTEGRATION.md`, `docs/reviews/PHASE-6-SINGLE-TILL-PILOT-RELEASE-GATE.md`, `docs/reviews/windows-pos-printing.md`, `docs/reviews/windows-checkout-focus-2026-10-30.md`, `docs/reviews/windows-physical-pilot-acceptance-plan-2026-11-02.md`, `docs/gst-invoice-requirements.md`, `docs/windows-offline-architecture.md`, `docs/windows-native-roadmap.md`, `docs/platform-delivery.md`, `docs/reliability-rollout.md`, `docs/security-release-gate.md`.

Release configuration confirmed from `apps/mobile/app.json:62` and multiple release reports: `productionSyncEnabled=false`; financial `SCHEMA_VERSION=12`; production adapters throw `PRODUCTION_DISABLED`; the desktop SQLCipher ledger is the only financial authority.

---

## 2. Screenshot evidence and inventory

### 2.1 Artifacts located

| Artifact ID | Name | Run ID | Head SHA | Size | Digest | Created / expires | State |
|---:|---|---|---|---:|---|---|---|
| 13269596282 | `Sornio-Local-Native-Captures` | 41709217989 | `97b6899` | 1,420,490 bytes | `sha256:a664bb74b542eea796e3b84f1d951f59109d54d600c845f9dbe392e1f601955c` | 2026-11-03 20:38:33Z / 2026-11-10 20:38:31Z | not expired |
| 13266470821 | `Sornio-Local-Native-Captures` | 41702800767 | `21a3f7c` | 1,415,767 bytes | `sha256:208b77f6f6ebce906e528515be4405230ff501303b1820dab16f91b191001413` | 2026-11-03 19:56:41Z / 2026-11-10 19:56:39Z | not expired |
| 13269341449 | `Sornio-Local-Workspace-Review` | 41709217989 | `97b6899` | 222,749,881 bytes | not re-hashed here | installer/evidence package | not a screenshot set |

The workflow uploads `dist/native-review/` as `Sornio-Local-Native-Captures` (`if: always()`), retention 7 days. `check-windows-evidence.py` requires and pixel-decodes four PNGs: `windows-first-setup.png`, `windows-local-cash-receipt.png`, `windows-retail-closing.png`, `windows-installed-preserved.png`, with width ≥640 and height ≥400. The runner therefore produced real installed-app screenshots; the artifact metadata is authentic.

### 2.2 Retrieval outcome — honest limitation

`gh api .../actions/artifacts/{id}/zip` and an authenticated `curl` both return a 302 to `productionresultssa16.blob.core.windows.net`. That host is outside this sandbox's outbound allowlist (`github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`). `gh api` ends with EOF; `curl` reports `SSL_ERROR_SYSCALL` on the Azure blob host. A secondary web fetch of the signed ZIP returns HTTP 500 because the response is `application/zip`, not text. The artifact was **located but its bytes could not be downloaded or decoded in this workspace**.

Consequently:

1. **Recorded missing artifact:** both installed-app capture archives are present in GitHub but visually inaccessible from this sandbox. This is an egress restriction, not artifact expiry.
2. **Equivalent screenshots in authorized sources:** four committed browser-preview PNGs in `docs/reviews/` were decoded and reviewed: `windows-saved-receipt-browser.png`, `windows-punjabi-receipt-browser.png`, `windows-customer-statement-browser.png`, `windows-recovery-browser-preview.png`. These are **real browser/WebView print-preview images committed to the repository, not screenshots of the installed Windows application**. `docs/brand/sornio-approved-reference.jpeg` was also reviewed as a brand reference, not a UI screenshot.
3. **Corresponding source inspected:** every capture call in `apps/desktop/check-native.py`, the evidence gate, and the React components that render those states.
4. **Image-specific visual conclusions about installed-app PNGs are marked unverified.** No AI-generated concept, browser mock, or source-level assumption is presented as an installed-app screenshot.
5. **No screenshot was invented, altered, replaced or committed.** No oversized binary artifact was added.

### 2.3 Committed browser-preview observations (actual images, not installed app)

| Image | What was actually seen | Confidence |
|---|---|---|
| `docs/reviews/windows-saved-receipt-browser.png` | English saved-receipt preview: receipt-language and paper-layout selects, `Print saved receipt`, saved total `₹5.58`, line item `Rice · 0.125 kg × ₹42.50`, right-aligned line amount near the edge, explicit GST non-compliance notice. Typography is small and the receipt is a long vertical document with generous whitespace. | High for browser preview; not installed app. |
| `docs/reviews/windows-punjabi-receipt-browser.png` | Punjabi receipt selection renders Gurmukhi labels, but status/notice lines remain English and several Gurmukhi lines appear clipped at the left edge. Mixed-script line height and left padding need validation on the real printer and installed app. | High for browser preview; physical print untested. |
| `docs/reviews/windows-customer-statement-browser.png` | A4 customer statement with `Date (IST)`, `Entry / reference`, `Due`, `Change (₹)`, `Balance (₹)` headings. Numeric cells show values such as `1.01` without a `₹` prefix or Indian grouping; the reference cell stacks many lines (`opening_due`, ID, escaped `<not markup>`, invoice, reverses). HTML escaping is visible, which is correct for security, but the ledger is verbose. | High for browser preview; synthetic data. |
| `docs/reviews/windows-recovery-browser-preview.png` | Encrypted backup panel: long explanatory copy, three password/passphrase fields, disabled-looking export/preview buttons, a verified preview with IDs/SHA-256, restore confirmation phrase, and a strong warning. It is a dense, high-consequence form with weak visual grouping. | High for browser preview; synthetic data. |

### 2.4 Installed-app screenshot catalog

All rows below refer to capture names emitted by `check-native.py` at `97b6899` / `21a3f7c`. `Run IDs` are `41709217989` (latest integrated head) and `41702800767` (historical ₹1,000 PASS). `Key UI elements`, `Positive observations`, `Usability defects`, `Accessibility concerns` and `Design opportunities` are derived from the automation assertions and component source, **not from decoded pixels**. Evidence confidence is `Control/data: high; Visual: unverified` unless noted.

| # | Filename | Screen represented | Key UI elements / asserted state | Positive observations | Usability defects | Accessibility concerns | Design opportunities | Evidence confidence |
|---:|---|---|---|---|---|---|---|---|
| 1 | `windows-first-setup.png` | First-time setup / locked access card | Business name, business type, owner name, account name, local password, confirm password, `Set up local access`; backup recovery entry. | Fails closed offline; password never sent to hosted service; setup and unlock share one calm card. | Single dense form; business type labels are raw IDs (`general`, `kirana`…) on unlock setup; no guided explanation of what the type changes. | `autoFocus` password, labels present; 10px eyebrow/small body; no full Punjabi UI. | Guided 3-step setup with a deterministic business-template preview; keep native identity boundary. | High control/data; visual unverified. |
| 2 | `windows-unlock.png` | Locked workspace on later launches | Account name, local password, `Unlock workspace`; wrong-password refusal asserted. | Wrong password keeps workspace locked; restart always starts locked. | Error message occupies a small alert region; no persistent password-recovery affordance by design. | Alert has `role=alert`; focus behavior after failure should be tested with UIA. | Clear lock reason, remaining attempt/wait status, and keyboard focus to password. | High control/data; visual unverified. |
| 3 | `windows-local-saved.png` | Workspace draft saved | `Save local draft`, revision status, `Saved to this PC…`. | Confirms local persistence without internet. | Vestigial draft form precedes the cashier workspace and is not a shop task. | Status uses `role=status` / `aria-live=polite`. | Replace with a compact business-day header; retire draft marketing copy from the operator path. | High control/data; visual unverified. |
| 4 | `windows-local-restored.png` | Saved-copy restore | `Restore saved copy 1`, revision 3 message. | Explicit discard/restore flow with revision history. | Administrative recovery is on the same scroll canvas as checkout. | Focus restoration implemented for the reopen prompt. | Put recovery in Admin, not Counter. | High control/data; visual unverified. |
| 5 | `windows-product-creation.png` | Add local item | Item name, code, unit, price, opening stock; `Save item on this PC`. | Exact decimal inputs and native stock persistence. | Two side-by-side forms plus a long item list; 5 fields per item and no importer. | Labels and `required` present; 11px labels/12px inputs. | Operational table with inline creation, reorder signals, import placeholder only if implemented later. | High control/data; visual unverified. |
| 6 | `windows-local-stock.png` | Stock adjustment result | `4 pcs`, `Acknowledge item save`, reason field. | Two-step durable receipt prevents duplicate inward. | Two clicks per SKU; acknowledgement is mandatory and repetitive. | `pending-stock` is a plain div; no status icon/region semantics. | Status chip `Saved — acknowledgement pending` with explicit next action. | High control/data; visual unverified. |
| 7 | `windows-local-cash-receipt.png` | Cash sale receipt | `Saved invoice ID`, `Saved total: ₹53.13`, `Cash received`, `Start next sale`. | Stable UUID, exact paise, grouped en-IN currency. | Receipt appears inside the same long page; line amount can sit near the right edge in the browser preview. | Receipt heading receives focus; `lang=en-IN`; print notice is explicit. | Dedicated success state with receipt actions and unmistakable next-sale transition. | High control/data; visual unverified. |
| 8 | `windows-customer-credit-sale.png` | Full credit sale | Customer ID/name/phone/limit, credit sale receipt `₹31.88`, balances. | Native credit-limit enforcement; phone lookup populates customer reference. | Customer creation requires a manual alphanumeric slug; credit and checkout are separate stacked panels. | Form labels present; no `aria-invalid` on many validation paths. | Active-customer chip with outstanding/limit; auto-generated slug with override. | High control/data; visual unverified. |
| 9 | `windows-local-checkout.png` | Checkout after credit sale | Search, cart, tax, transaction type, totals, review/confirm. | F2/F3/F4/F8/Enter/Escape map is visible in one dense hint line. | All checkout controls are in one vertical column; total and confirm can leave the viewport on 720p. | `aria-live` status and labelled inputs present; focus ring contrast fails WCAG AA. | Two-region cashier workspace with sticky total/confirm. | High control/data; visual unverified. |
| 10 | `windows-local-locked.png` | Locked workspace | Password card only; business/search/receipt controls absent. | `assert_locked` proves sensitive controls are unmounted. | 15-minute idle lock may interrupt a sale if no input; status of unsaved cart is not shown on lock card. | Locked state has clear heading; screen-reader announcement should be verified. | Explain that an unresolved sale checkpoint is preserved. | High control/data; visual unverified. |
| 11 | `windows-local-reopened.png` | Restart / preserved receipt | Same saved invoice UUID and balances after forced termination. | Crash/restart recovery preserves the exact sale once. | Recovery state is not visually distinguished from a fresh sale. | `role=status` message present. | Persistent `Recovered saved sale` banner with operation ID. | High control/data; visual unverified. |
| 12 | `windows-local-next-sale-reopened.png` | Acknowledged checkpoint after restart | No `Retry same sale`; balances unchanged. | Acknowledgement clears the checkpoint without changing money. | Next-sale transition relies on a button far down the page. | Focus returns to search via `pendingFocus`. | Explicit `Ready for next sale` state. | High control/data; visual unverified. |
| 13 | `windows-backup-preview.png` | Verified backup preview | `RESTORE <hex>` phrase, IDs, SHA-256, counts, cleared password fields. | High-friction destructive confirmation; passwords cleared after preview. | Dense long form; destructive and informational copy share equal weight. | `role=group` preview; high-contrast warning text not guaranteed. | Stepper with a distinct danger zone and confirmation summary. | High control/data; visual unverified. |
| 14 | `windows-backup-restored.png` | Post-restore workspace | Original note/balances restored; staff accounts disabled. | Safety backup and point-in-time restore semantics preserved. | Restore result may be described only in a status line. | `role=status` / `alert` used elsewhere; post-restore focus needs UIA test. | Dedicated recovery result screen with what changed and what remains disabled. | High control/data; visual unverified. |
| 15 | `windows-customer-partial-repayment.png` | Partial repayment | `Saved credit entry ID`, balances `₹63.13` / `₹21.88`. | Review/cancel does not mutate ledger; exact repayment receipt. | Manual amount entry; no remaining-balance helper. | Review auto-focuses confirm and supports Escape. | Show outstanding before/after and a `Settle in full` option. | High control/data; visual unverified. |
| 16 | `windows-customer-ledger.png` | Customer statement prepared | `Customer transaction history`, table, `Print customer statement`. | Native statement escaping and snapshot reauthorization before print. | Long multi-line reference column; numeric columns lack per-cell ₹ prefix. | `<table>` with headings but no `scope`; small 12px text. | Tabular numeric columns, sticky header, compact reference disclosure. | High control/data; visual unverified. |
| 17 | `windows-owner-staff.png` | Owner creates staff | Staff name/account/password/role; `Create staff account`. | Owner-only native authorization; disabled-account refusal. | Admin controls appear below financial panels on one page. | Form labels present; password autoComplete set. | Admin workspace with permission matrix and explicit native-authority note. | High control/data; visual unverified. |
| 18 | `windows-staff-disabled.png` | Disabled staff refused | Wrong-password/locked state after disabling. | Disabled account cannot unlock. | No distinction in lock card between wrong password, disabled account and rate limit. | Alert text present. | Specific, non-leaking refusal copy with retry guidance. | High control/data; visual unverified. |
| 19 | `windows-retail-pending-payment.png` | Retail cash + UPI split | `Pending — unverified`, invoice ID, payment register. | UPI is explicitly not externally verified and not counted as cash. | Invoice must be typed/copied into a separate filter. | Status label is text, not colour only — good. | `Open in returns/payments` action from the saved receipt. | High control/data; visual unverified. |
| 20 | `windows-retail-reconciliation.png` | Manual statement match | `Manually matched — not externally verified`, `Externally verified: ₹0.00`. | Manual match is distinct from external verification. | Several fields (`reference`, `statement amount`, `evidence`) are far from the payment row. | Text status is explicit. | Contextual reconciliation drawer anchored to the payment row. | High control/data; visual unverified. |
| 21 | `windows-retail-return-refund.png` | Return and refund | `Digital refund pending ₹5.63`, stock restored to 1.75, condition selector. | Native quote shows cash out, credit reduction, pending digital refund and canceled pending payment before confirm. | Return reason input is inside a lower fieldset, separate from cashier-day controls. | `requireReason()` now focuses the reason field and emits an alert. | Return workflow with invoice lookup, eligible lines, stock treatment and audit evidence in one panel. | High control/data; visual unverified. |
| 22 | `windows-retail-closing.png` | Cashier closing | `Expected cash ₹85.01 · Counted ₹85.00 · Variance -₹0.01`. | Exact paise variance; closing is immutable and reopen is reason-gated. | Expected/counted/variance are prose lines, not a reconciliation table. | Text is readable but small; no colour-only variance signal. | Expected / Counted / Variance ledger with explicit sign and explanation. | High control/data; visual unverified. |
| 23 | `windows-mixed-cash-credit-sale.png` | ₹10.63 = ₹6.00 cash + ₹4.63 credit | Split inputs, receipt, balances `₹101.64` / `₹4.63`. | Repeated submit keys still produce one invoice; same operation ID on retry. | Cash and credit amounts must both be typed manually; no live remaining badge. | Unverified labels are textual; good. | Allocation table with `Remaining ₹0.00` and `Fill remaining` helper. | High control/data; visual unverified. |
| 24 | `windows-mixed-split-reopened.png` | Mixed split after forced restart | Same invoice ID and balances. | Exactly-once persistence across process kill. | Recovery is visually similar to a normal saved receipt. | Status message is polite but not a distinct landmark. | `Recovered — no duplicate sale created` banner. | High control/data; visual unverified. |
| 25 | `windows-thousand-split-sale.png` | ₹1,000.00 = ₹600.00 cash + ₹400.00 credit | Receipt names `native-customer-2`, grouped `₹1,000.00`, both payment parts, balances `₹701.64` / `₹404.63`. | Release-blocking financial regression passes through the installed UI with a burst of repeated Enter/Space. | Split entry requires manual arithmetic and a fresh no-limit customer because earlier customer limit was ₹50. | Grouped en-IN amount is correct; Gurmukhi print not exercised here. | Keep exact copy of split breakdown; make credit-limit headroom visible before selection. | High control/data; visual unverified. |
| 26 | `windows-thousand-split-reopened.png` | ₹1,000 split after restart | Same invoice ID, total and balances. | Restart preserves the ₹1,000 sale exactly once. | No visually separate recovery state. | Focus/announcement unverified. | Distinct success/recovery state taxonomy. | High control/data; visual unverified. |
| 27 | `windows-installed-preserved.png` | Reinstall `--verify-preserved` | Draft, history, balances, preserved ₹1,000 receipt. | Uninstall/same-version reinstall preserves encrypted data. | `Local review` copy remains on a preserved production-like workspace. | UIA control names asserted. | Environment badge derived from build configuration, not hardcoded in cashier chrome. | High control/data; visual unverified. |
| 28 | `windows-local-failure.png` | Conditional failure capture | Captured only inside the exception handler; no control text is dumped to logs. | Fail-safe evidence without leaking passwords/customer data. | Expected to be absent from a green run. | N/A in successful run. | Do not treat as a normal screen. | Conditional; visual unverified. |

**Screenshots located:** 28 unique installed-app PNG names across two artifacts; a successful run is expected to contain 27 because `windows-local-failure.png` is conditional.
**Screenshots visually reviewed:** 0 installed-app PNGs; 4 committed browser-preview PNGs and 1 brand-reference JPEG.
**Missing / inaccessible:** 27 installed-app PNGs from the green run (plus conditional failure image), because Azure blob egress is blocked.
**UI screens identified:** setup, unlock, draft/recovery, inventory, checkout, cash receipt, credit sale, lock, restart recovery, backup preview/restore, repayment, statement, staff, disabled account, retail pending/match/return/closing, mixed split, ₹1,000 split, reinstall preservation.

---

## 3. Source-to-screen mapping

### 3.1 Implementation status

Legend: **Implemented** = present and exercised in the installed app or real native tests; **Partial** = present but narrow or not a complete module; **Simulated / test-only** = CI fixture or review-only; **Proposed** = no implementation in the audited source.

| Module | Status | Rendering component(s) | Visibility / state | Navigation | Permissions |
|---|---|---|---|---|---|
| Application shell | Implemented | `main.tsx` `App`, `style.css .desktop-shell` | `session` from `AccessGate`; `snapshot !== null`; global `busy` / `dirty` | No router; one scroll page | Native `LocalSession`; `invoke()` adds scope |
| Sidebar / navigation | Implemented, partial | `main.tsx:153-158` | Always visible on desktop; hidden below 680px | Three anchors: `#main`, `#checkout`, `#inventory-heading`; `selected` hardcoded on Workspace draft | No permission filtering of links |
| Header | Implemented | `main.tsx:160` | Always visible | `Lock workspace` button | Any unlocked session; native lock command |
| Home dashboard | Partial / vestigial | `main.tsx:162-185` | Owner draft form + marketing side panel; `status-panel` | Top of one page | Owner sees draft form; all roles see status/side panel |
| Retail checkout | Implemented | `CheckoutPanel.tsx` | `native && snapshot`; local `ready`, `busy`, `pending`, `invoice`, `review`, `historyOpen` | `#checkout` anchor; no route | `Sell` in native; `reportsAllowed` gates balances/receipts |
| Product catalog / inventory | Implemented | `InventoryPanel.tsx` | `native && snapshot`; `canAdd`, `canCorrect`; `pending` receipt | `#inventory-heading` anchor | `canAdd = role !== cashier`; `canCorrect = owner or manager`; native still authorizes |
| Customer management | Implemented | `CustomerPanel.tsx`, `CustomerLookup.tsx` | Always rendered after snapshot; `selected`, `statement`, `review`, `pending` | Scroll only | `manage = role !== cashier`; `policy = owner/manager`; `correct = owner` |
| Customer credit ledger / repayments | Implemented | `CustomerPanel.tsx` | `selected` statement; `kind` = repayment/opening_due/write_off/reversal | Scroll only | Native `CollectCredit` / correction permissions; `refusedCodes` includes `credit_limit`, `overpayment` |
| Returns / refunds | Implemented | `RetailPanel.tsx` | `view.invoice` loaded by typed invoice ID; `quote`, `review`, `pending` | Scroll only | `manager` or `owner`; owner-only checkpoint adoption |
| Daily closing | Implemented | `RetailPanel.tsx` | `view.summary`; `float`, `counted`, `why`, `closingId`, `state` | Scroll only | Manager/owner corrections; cashier can review closing |
| Reports | Partial | `CheckoutPanel.tsx` balances and saved receipts; `RetailPanel.tsx` CA CSV | `reportsAllowed` from `CashierState`; manager export | Scroll only | Native report permission; manager-only CSV |
| Staff management | Implemented | `StaffPanel.tsx` | `owner` only in `main.tsx:190` | Scroll only | Owner-only; native `Staff` permission |
| Passwords / credentials | Implemented | `CredentialsPanel.tsx` | All sessions see own password change; owner sees staff reset | Scroll only | Native `Settings` / owner password |
| Backup / restore | Implemented | `BackupPanel.tsx` | Owner only; also on unconfigured access screen | Scroll only | Native `Settings`; owner/recovery passphrase/original password |
| Business settings | Partial | `AccessGate.tsx` setup + `main.tsx` draft form | Setup-time business name/type; draft business name/type/note | No settings route | Setup is unscoped; draft is owner-only |
| Authentication / unlock | Implemented | `AccessGate.tsx` | `access.configured`, `access.unlocked`, `session`, 15-min idle lock | Replaces entire app | Native password/session; renderer never owns authority |
| First-time setup | Implemented | `AccessGate.tsx` | `!access.configured`; recovery backup available | Single card | `setup_local_access`, one-owner guard |
| Receipt preview / print | Implemented | `SavedInvoice.tsx`, `receipt-print.ts`, `CustomerPanel.tsx` statement print | `invoice` state or receipt lookup; `layout`, `language`, `busy` | Within checkout / customer panel | Reauthorizes snapshot through native reads; print does not post |
| Dedicated device settings | Proposed | none | none | none | none |
| Adaptive workspace / AI onboarding | Partial foundation only | `dailyWorkspace()` in `packages/business-domain/src/daily-workspace.ts`; `businessType` in setup | Desktop shows only a text description in the draft form | none | Native role still authoritative |
| Discounts | Not implemented | `SavedInvoice.tsx` explicitly says `Discounts: not recorded in this invoice.` | N/A | N/A | N/A |

### 3.2 Interaction, state and test matrix

| Module | Keyboard | Financial / durable operations | Loading, disabled, empty, failed | Existing UI behavior protected by tests | Redesign risks |
|---|---|---|---|---|---|
| Shell / nav | Tab, anchor links; `Escape` closes lock/reopen prompts; focus restoration refs | `load_workspace`, `save_workspace`, `restore_workspace`, `lock_workspace` | `opening/ready/saving/error`; `dirty`, `busy`, `beforeunload` | `check-ui.cjs`, `check-focus.cjs`, `check-authorization.cjs`, `check-native.py` | Moving panels into separate views must preserve shared dirty/busy coordination and prompt focus. |
| Checkout | F2 search, F3 quantity, F4 review, F8 retry pending, Enter add/confirm, Escape cancel review/history | `read_cashier_state`, `prepare_local_checkout`, `post_local_invoice`, `prepare_local_retail`, `post_local_retail`, `clear_local_checkout`, `clear_local_retail`, `list_local_invoices`, `read_local_invoice` | `ready`, `busy`, `failed`, `refused`, `pending`, `invoice`, `review`, `historyOpen`, `readGeneration`, `submitting` | `check-checkout.cjs`, `check-receipts.cjs`, `check-focus.cjs`, `check-retail.cjs`, `check-native.py`, `verify-desktop-contract.mjs`, `verify-native-money.mjs` | Accessible names (`Search items for sale`, `Review sale`, `Confirm sale`, `Saved invoice ID`, `Start next sale`, `Retry same sale`) are UIA/Playwright contracts. Do not change operation-ID lifecycle. |
| Inventory | Tab / form submit; no module shortcut | `list_local_products`, `pending_local_inventory`, `add_local_product`, `adjust_local_stock`, `acknowledge_local_inventory` | `ready`, `busy`, `pending`, `savedInventory`, `failed`, `openedToken !== refreshToken` | `check-inventory-recovery.cjs`, `check-inventory-refresh.cjs`, `check-native.py` | A table redesign must retain add/adjust/acknowledge labels and refresh-token behavior. |
| Customers / credit | Tab; Escape in review; Enter in receipt lookup | `find_local_customers`, `save_local_customer`, `read_customer_statement`, `prepare_local_credit`, `post_local_credit`, `pending_local_credit`, `clear_local_credit`, `link_local_credit`, statement print | `ready`, `busy`, `pending`, `receipt`, `review`, `refused`, `statement`, `html` | `check-customers.cjs`, `check-statement-print.cjs`, `check-native.py` | Preserve statement snapshot reauthorization before `window.print()` and native HTML escaping. |
| Retail / closing / returns | Tab; Escape in review; reason focus jump | `read_local_retail`, `quote_local_return`, `prepare_local_retail`, `post_local_retail`, `clear_local_retail`, `export_local_settlements`, `take_over_local_payment` | `ready`, `busy`, `pending`, `review`, `refused`, `quote`, `exported` | `check-retail.cjs`, `check-native.py`, `verify-replication.mjs` | Keep refund/pending/unverified text; do not make digital payments appear verified. |
| Staff / credentials / backup | Tab; password autocomplete | `list_local_staff`, `create_local_staff`, `change_local_staff`, `change_local_password`, `reset_local_staff_password`, `choose_local_backup`, `export_local_backup`, `preview_local_backup`, `restore_local_backup`, `read_last_restore` | `busy`, `failed`, `dirty`, `blockedByDraft`, `open` | `check-authorization.cjs`, `check-credentials.cjs`, `check-backup.cjs`, `check-native.py`, `test_windows_evidence.py` | Backup is destructive; preserve two-step confirmation, cleared passwords, safety backup and lock-on-failure. |
| Receipt / statement print | `Ctrl+P` inside `SavedInvoice`; print button; language/layout selects | `read_local_invoice`, `read_local_retail`, `read_customer_statement` | `busy`, `notice`, print-root abort on session lock | `check-receipts.cjs`, `check-statement-print.cjs`, `check-native.py` | Printing must remain non-posting and re-check the immutable snapshot. |

### 3.3 Existing user journeys (source-level interaction counts)

Counts below are **explicit control interactions in the source or automation**, not measured operator time.

| Journey | Current interactions | Source |
|---|---|---|
| First-time setup | Install → launch → 6 setup fields/actions (`business name`, `business type`, `owner name`, `account name`, `password`, `confirm`) → `Set up local access` → workspace opens with all panels. | `AccessGate.tsx`, `check-native.py:191-200`, `docs/onboarding-audit.md`. |
| Cash sale | `F2` → type exact SKU → `Enter` → optionally `F3` + quantity → `F4` → `Enter` on focused `Confirm sale` → `Start next sale`. Six core keyboard actions for one line; more for quantity edits. | `CheckoutPanel.tsx:394-449,474-549`; `check-native.py:270-290`. |
| Split cash + credit | Add item → set tax → select `UPI / card / split` → find/select customer → type cash → type credit → `Review sale` → `Confirm sale`. Eight or more interactions; no remaining-balance helper. | `CheckoutPanel.tsx:524-549`; `check-native.py:650-670,720-748`; `operator-ux-review-2026-11-02.md` P2. |
| Add/adjust inventory | Type 5 item fields → `Save item on this PC` → `Acknowledge item save`. Seven interactions per SKU; stock change adds select/quantity/reason/save/acknowledge. | `InventoryPanel.tsx:145-176`; `check-native.py:251-264`. |
| Customer repayment | Open customer → amount → `Review credit entry` → `Confirm credit entry` → `Start next credit entry`. Five interactions; cancel review is safe. | `CustomerPanel.tsx:140-160`; `check-native.py:495-520`. |
| Return | Type invoice ID in payment-record filter → reason → return quantities/condition → `Calculate native return` → `Review invoice return` → `Confirm retail operation` → `Start next retail operation`. | `RetailPanel.tsx:74-100`; `check-native.py:609-633`. |
| Daily closing | Type counted cash → `Review cashier closing` → `Confirm retail operation`; reopen adds reason + review + confirm. Shared reason field is in a lower fieldset. | `RetailPanel.tsx:74-100`; `check-native.py:633-650`. |
| Receipt recovery | `Find saved receipt` → type/paste exact UUID → `Enter`/`Open saved receipt` → print or `Back to checkout`. | `CheckoutPanel.tsx:480-488`; `SavedInvoice.tsx`. |

---

## 4. Independent UX audit

### 4.1 A. Visual hierarchy

- The page opens with a 32–51px marketing headline `Your business. Right here.` and a `A STRONGER FOUNDATION` side panel before an operator reaches a working control (`main.tsx:162,185`; `style.css:3`).
- The local-storage status panel is a gradient card with a large icon, while the sale total is a 16px line inside a dense panel (`style.css:3,33`). The most important financial number is not the most prominent number.
- Primary and secondary buttons share the same filled style except for `.quiet-button`; destructive actions such as `Discard edits and lock`, `Create safety backup and restore`, `Disable <user>` and `Review cashier day reopening` are not visually separated from ordinary actions.
- Panel radius is 24px, controls 12px, chips 30px; geometry is rounded but inconsistent with the more disciplined 14px/24px web guidance in `docs/SORNIO-DESIGN-SYSTEM.md`.
- Information density is simultaneously too low at the top (marketing whitespace) and too high inside Retail/Backup (long prose, many fields, no grouping).

### 4.2 B. Navigation

- All modules are stacked on one document (`main.tsx:165-193`). A cashier must scroll past Workspace draft to reach Checkout, then past Inventory, Customers, Retail, Staff, Credentials, Backup and Saved copies to reach closing/admin. Prior `operator-ux-review-2026-11-02.md` already classified this as deferred P2.
- The sidebar has only three anchors and hardcodes `className="selected"` on `Workspace draft` (`main.tsx:156`). It never reflects the user's actual section. There is no `aria-current`.
- There is no route state, no back/forward workspace history, and no orientation beyond the browser scroll position. Anchor jumps can land mid-panel; `scroll-margin-top` exists only on `.checkout-panel`.
- Modules that a cashier must not use are still rendered and merely hidden by role; this is safe natively but increases page length and cognitive load.

### 4.3 C. Forms

- Labels are generally explicit and associated (`htmlFor`/`id`), fieldsets and legends are used, and `required`, `maxLength`, `inputMode`, `pattern`, `autoComplete` are present in many forms. These are strong existing patterns.
- Validation is mostly a single `role=alert/status` message at the top of each panel. `CheckoutPanel` computes `problemFieldId` and focuses the field on `F4`, but most inputs do not receive `aria-invalid` or `aria-describedby` linking to the error.
- `RetailPanel` previously had a silent dead-click when a required reason was missing; `requireReason()` now emits an alert and focuses `#retail-reason` (`operator-ux-review-2026-11-02.md`). The reason field is still physically far from the closing/float controls it validates.
- Long forms (backup restore, retail returns, customer creation) have excessive vertical scrolling. Required-field indicators are browser-native rather than a consistent visible convention.
- Action names are mostly clear (`Review sale`, `Retry same sale`, `Start next sale`), but `Transaction type: UPI / card / split` hides the fact that customer credit is also a split method.

### 4.4 D. Financial usability

Strong existing behavior:

- All money is integer paise. `money(paise)` uses `BigInt` and `Intl.NumberFormat('en-IN')`; `parseFixedDecimal` rejects exponent notation and more than 2/3 decimals; `calculateNativeInvoice` uses BigInt half-up arithmetic (`billing-types.ts`, `fixed-decimal.ts`, `native-invoice.ts`).
- Split payments must equal the invoice total exactly; a credit part requires a customer; UPI/card are labelled unverified; customer credit remains outstanding; native Rust repeats validation and owns posting (`CheckoutPanel.tsx:300-330`, `payments.rs:593-638`).
- `operationId` is generated once in `postNew()` and persisted before posting; `confirm(pending)` retries the exact request; `submitting` / `readGeneration` / `retailRef` prevent duplicate submits and stale reads.
- `refusedCodes` distinguishes definitively refused operations from uncertain ones; `Edit refused sale` appears only for a refusal. `Retry same sale` and `F8` preserve the same ID.
- `SavedInvoice` re-reads the native invoice (and retail payments) immediately before print and refuses if the snapshot changed. Printing never posts a sale.
- The ₹1,000 = ₹600 cash + ₹400 credit scenario passed through the installed UI with repeated submit keys and after forced restart (`check-native.py:720-757`; run 41702800767).

Design gaps:

- Successful, pending, refused and failed states are visually similar prose/banners. A busy cashier needs an unmistakable state taxonomy with icon + text + shape, not colour alone.
- The current total is a 16px preview line; no persistent `Remaining to allocate` indicator for split payments. The operator review explicitly deferred a `Fill remaining` helper.
- Cash, UPI, card and credit allocation are four vertically stacked labelled inputs plus optional references; allocation is not presented as a reconciliation table.
- Receipt recovery requires a UUID; there is no direct `Open in returns` or `Open in payments` from a saved receipt.
- Daily closing variance is prose, not a clearly signed reconciliation row.

### 4.5 E. Accessibility

| Criterion | Current evidence | Finding |
|---|---|---|
| Keyboard navigation | F2/F3/F4/F8/Escape/Enter in checkout; Ctrl+P in receipt; Escape in customer/retail reviews; focus restoration in lock/reopen prompts; `check-focus.cjs` regression. | Strong foundation; shortcuts are documented in one dense hint line. No shortcut for customer selector, payment allocation, next sale or receipt printing beyond Ctrl+P. |
| Visible focus | `:focus-visible{outline:3px solid #829fce;outline-offset:4px}` (`style.css:3`). | Contrast of `#829fce` on `#FFFFFF` is **2.69:1**, below WCAG 2.2 AA 1.4.11's 3:1 non-text requirement. On dark `#1E2733` it is better but not specified as a token. |
| Screen-reader naming | `aria-label`, `aria-labelledby`, `aria-live`, `role=alert/status`, `aria-busy`, `fieldset`/`legend`, labelled inputs, `output aria-live=polite`. | Good naming overall. Review prompts are inline `role=group`, not modal dialogs; no `aria-current` on nav; statement `<th>` lacks `scope`; many errors are not associated with the invalid field. |
| Colour contrast | Current text `#253244`/white = 12.98:1; muted `#6C7584`/white = 4.65:1; button `#304D70`/white = 8.67:1. | Body text passes AA. Focus ring fails; soft selected surfaces and borders are below 3:1 and must not be the only boundary/state cue. |
| Form semantics | Native labels, `required`, `inputMode`, `pattern`, `fieldset`. | Missing systematic `aria-invalid`, `aria-describedby`, required-field indicators, and grouped error summaries. |
| Touch / pointer targets | `button` padding `13px 16px`, font 11px; topbar button `9px 12px`, font 10px; `packages/mobile-design/src/tokens.ts` defines `touch: 44`. | Many controls are below 44×44 CSS px; undesirable on touch-enabled Windows devices and for low-precision mouse use. |
| Text scaling | CSS uses px and `clamp()`; browser zoom scales px, but Windows text scaling and mixed-script line height need explicit testing. | Body 12px, labels 11px, eyebrow/status 10px are small for an all-day counter app. Gurmukhi needs extra line height and left padding. |
| Accessible errors | `role=alert` messages, `aria-live`, focus to problem field on F4, reason-field focus. | Error text is not always programmatically tied to the control; no persistent error summary for long forms. |
| Reduced motion | `@media(prefers-reduced-motion:reduce)` disables animation/transition and forces `scroll-behavior:auto` (`style.css:38`). | Good existing pattern; retain. |
| High contrast | `prefers-color-scheme: dark` is supported; no explicit `forced-colors: active` rules found. | Windows High Contrast needs system-colour mapping and a focus outline that survives forced colours. |

### 4.6 F. Retail practicality

- **Keyboard-heavy workflow:** F2/F3/F4/Enter is well designed and test-protected; exact SKU priority, `event.repeat`, `isComposing`, and `defaultPrevented` guards protect against scanner key-repeat and IME collisions.
- **Barcode input:** implemented as a keyboard wedge into `#checkout-search`; no dedicated scanner API. Physical scanner timing is UNTESTED (`docs/reviews/windows-pos-printing.md`, physical pilot plan Step 5).
- **Long catalogs:** checkout shows the first 50 matches; inventory shows first 100; no virtualization. This bounds DOM work but can hide the needed item unless the operator refines the search.
- **Small displays:** Tauri minimum is 760×580; CSS hides the entire nav below 680px. At 1280×720 with 125% scaling the effective CSS viewport is ~1024×576, where the single-column checkout will require scrolling to reach totals/confirm.
- **Noisy environments:** state is conveyed by small prose; no persistent high-salience success/failure banner.
- **Staff with limited technical experience:** raw UUIDs, operation IDs, `revision`, `basis points`, and `Pending — unverified` are accurate but not operator-friendly. The UI should keep IDs copyable while adding plain-language state.
- **English / Punjabi:** full desktop UI is English; `pa.json` covers 33 receipt/control strings only. Gurmukhi font is bundled under OFL. The committed Punjabi browser preview shows partial localization and possible left-edge clipping; physical print is untested.

---

## 5. Findings and severity

**Critical defects: 0.** No verified evidence in the audited source of money loss, duplicate posting, unauthorized native bypass, or a completely keyboard-inaccessible core flow. PR #145's installed-UI and native financial acceptance are green. Critical is reserved for verified financial/data-loss or total task blockage, not aesthetic preference.

| ID | Severity | Affected screen(s) | Evidence | User consequence | Recommended design correction |
|---|---|---|---|---|---|
| H-01 | High | All modules | `main.tsx:153-193`; operator review P2 | One long scroll mixes cashier, owner draft, inventory, khata, closing, staff, passwords and destructive backup; repeated navigation and lost context during a sale. | Dedicated workspace views (`Counter`, `Stock`, `Khata`, `Day close`, `Admin`) inside one shell; keep financial state coordination centralized. |
| H-02 | High | Checkout, split payment | `CheckoutPanel.tsx:474-549`; `style.css:33`; Tauri 1240×820 / 1280×720 target | Product search, cart, tax, tender, customer, four split amounts, totals, review and confirm are one vertical column; total/confirm can fall below the fold on 720p or 125% scaling. | Two primary work regions (discovery/cart + checkout/payment) with a narrow collapsible global rail; sticky total and confirm. |
| H-03 | High | All screens, especially receipt/statement | `style.css:3,33,35,37`; committed statement/receipt previews | 10–13px body/labels and small controls reduce all-day readability; numeric cells can omit ₹ prefix/grouping and Gurmukhi lines can clip. | Minimum 14px body, 12px metadata only, 44px controls, tabular `₹1,000.00` formatting, Gurmukhi line-height/padding validation. |
| H-04 | High | All focusable controls | `style.css:3`; computed contrast | Focus outline `#829fce` is 2.69:1 on white, below WCAG 2.2 AA non-text contrast; keyboard users may lose focus. | Semantic focus token with ≥3:1 on every adjacent surface, 2px/3px outline plus offset, `forced-colors` mapping. |
| H-05 | High | Split payment | `CheckoutPanel.tsx:300-330,524`; operator review P2 | Exact-sum split requires manual arithmetic; no live `Remaining` or `Fill remaining`; wrong allocation is discovered late. | Allocation table with total, allocated, remaining, explicit `Fill remaining` target, and textual validation. Preserve exact paise equality. |
| H-06 | High | Punjabi receipt | `windows-punjabi-receipt-browser.png`; `pa.json` (33 keys); `SavedInvoice.tsx` | Mixed-script receipt shows partial English fallback and possible Gurmukhi clipping; a shopkeeper/customer may misread a financial document. | Full receipt-string coverage, mixed-script typography rules, print-root padding, physical 58/80mm and A4 Gurmukhi acceptance. Installed-app visual remains unverified. |
| M-01 | Medium | Sidebar | `main.tsx:156` | `selected` is hardcoded; no `aria-current` or active-section tracking. | `aria-current="page"`/view, selected token, and section heading in top status. |
| M-02 | Medium | All screens | `style.css:6` | Automatic dark inversion changes financial surfaces without a reviewed semantic status palette; light-first principle is not enforced. | Light-first operational theme; remove automatic dark inversion of financial surfaces; separately reviewed dark theme only if founder approves. |
| M-03 | Medium | Customer creation / checkout | `CustomerPanel.tsx`; operator review P2 | Manual `[A-Za-z0-9_-]+` customer slug is required; phone lookup exists but slug creation is friction. | Auto-generated stable slug from name/phone with visible override; never change native ID semantics. |
| M-04 | Medium | Inventory | `InventoryPanel.tsx:145-176`; operator review P2 | Two-step acknowledgement per SKU is safe but click-heavy; no batch goods-inward. | Keep durable acknowledgement; group multiple lines into one reviewed inward operation only in a later, separately tested phase. |
| M-05 | Medium | Returns | `RetailPanel.tsx`; `check-native.py:609-618` | Manager must copy/paste a UUID into a separate filter; no `Open in returns` from receipt. | Receipt action menu to open payment/return context with the invoice ID already bound. |
| M-06 | Medium | Closing corrections | `RetailPanel.tsx`; operator review P1/P3 | Shared reason field sits in the return fieldset even for float/closing corrections; focus jump helps but layout is disjointed. | Contextual reason field adjacent to the correction being confirmed. |
| M-07 | Medium | Saved receipt / customer statement | Committed browser previews; `SavedInvoice.tsx`, `CustomerPanel.tsx` | Statement numeric cells use header-level `(₹)` and ungrouped values; receipt line amount is close to right edge. | Right-aligned tabular `₹` amounts, no truncation, explicit currency per cell or unambiguous column header, print padding. |
| M-08 | Medium | Home / reports | `main.tsx:162-185`; `reportsAllowed` | No operational dashboard; marketing draft and side panel occupy prime space; reports are a gate on balances/receipts only. | Replace with a compact business-day status strip; do not add decorative dashboard cards. |
| M-09 | Medium | Evidence process | Artifact API + blocked Azure egress | Installed-app screenshots cannot be visually reviewed in this sandbox; visual conclusions must remain qualified. | Re-run artifact download in an authorized environment before design sign-off; attach a reviewed screenshot manifest. |
| M-10 | Medium | Device settings | No device component; `windows-pos-printing.md`; physical pilot plan | Scanner/printer/Windows Hello status is invisible; hardware presence could be mistaken for support. | Future device-settings screen with detected/supported/configured/tested states and explicit unsupported notices. |
| L-01 | Low | All screens | `main.tsx:162,159` | `Local review · 0.3.0` / `Use test data only` is hardcoded into operator chrome. | Derive an environment badge from build config; keep required pilot transparency but remove from GA path. |
| L-02 | Low | Status panel / access screen | `style.css:3,23` | Gradient status panel and radial access-screen glow conflict with a calm precision workspace. | Flat semantic surfaces; gradients belong to marketing site, not cashier. |
| L-03 | Low | Heading | `main.tsx:162` | Large marketing headline consumes vertical space above checkout. | Replace with page title and business-day context. |
| L-04 | Low | Side panel | `main.tsx:185` | `A home on your desktop` marketing copy appears during work. | Move to onboarding/help; not in the counter path. |
| L-05 | Low | Dark mode | `style.css:6` | Dark mode uses hardcoded gradient and button colours rather than semantic tokens. | If a dark theme is approved, define it as a complete token set with contrast evidence. |

### Strong existing design patterns to preserve

1. Integer-paise BigInt arithmetic and en-IN grouped `₹1,000.00` display.
2. Native-first authorization: renderer role/visibility never grants permission; `scope` is a comparison value.
3. Two-step `prepare_*` → `post_*` → `clear_*` checkpoint lifecycle with stable `operationId`.
4. `Retry same sale` / F8 never generates a new operation ID; uncertain and refused states are distinguished in code.
5. Repeated-submit guards (`submitting`, `busy`, disabled fieldsets, `readGeneration`).
6. Explicit `UPI (unverified)`, `Card (unverified)`, `Pending — unverified`, `Externally verified: ₹0.00` copy.
7. Review-before-post with auto-focused confirm and Escape cancellation in checkout, credit and retail flows.
8. `role=alert/status`, `aria-live`, labelled controls, fieldsets, `aria-busy`, and reduced-motion support.
9. Bundled OFL Gurmukhi font and immutable receipt snapshot reauthorization before print.
10. Print is explicitly not transaction posting; GST compliance is not claimed.
11. Dirty/busy coordination prevents locking or restoring while other panels have unsaved work.
12. Prior P1 fixes: dead-click reason alert/focus and keyboard focus on confirmation prompts.

---

## 6. Before-and-after UX analysis

`Current` is observed in source, automation or committed browser previews. `Proposed` is a design target, not an implemented or measured result. Interaction reductions are design targets requiring validation with the existing installed-UI suite.

| Screen | Attribute | Current UI | Proposed UI | Expected benefit |
|---|---|---|---|---|
| First-time setup | Navigation | One card, 6 fields, raw business-type IDs, backup panel below. | Guided 3-step setup: business identity → owner access → workspace template, with progress and offline notice. | Orientation and fewer errors; no change to native `setup_local_access`. |
| First-time setup | Information hierarchy | Marketing headline and password help share one visual level. | One primary action per step; explicit `Saved on this PC only` status. | Clarity. |
| First-time setup | Workflow complexity | 6 fields + submit. | Same required fields, grouped; template selection is deterministic preview only. | Design target: no extra posting path. |
| First-time setup | Error handling | Single `role=alert`; wrong secrets fail closed. | Field-level `aria-invalid` + summary, focus to first error. | Faster recovery. |
| First-time setup | Accessibility | Labels/autocomplete present; English only. | 14px body, 44px controls, Gurmukhi-capable strings, high-contrast focus. | WCAG 2.2 AA target. |
| App shell | Navigation | 3 hardcoded anchors; all modules stacked; selected never changes. | 5 workspace views + `aria-current`, persistent business/operator/offline/day status. | Fewer repeated scroll actions; orientation. |
| App shell | Information hierarchy | Marketing H1 + gradient status + side panel. | Compact page title + business-day strip; no decorative cards. | Cashier sees working context first. |
| App shell | Workflow complexity | Reaching Day close requires scrolling past 7+ panels. | One nav activation. | Design target: 1 nav action vs repeated scrolling; validate. |
| App shell | Error handling | Global status per panel. | Shell-level connection/session/day alerts with a single status taxonomy. | Less ambiguity. |
| App shell | Accessibility | No `aria-current`; 10px metadata. | Landmarks, `aria-current`, 12px min metadata, forced-colors support. | Screen-reader and low-vision support. |
| Checkout | Navigation | Search→cart→tax→tender→customer→split→review all in one column. | Center discovery/cart + right checkout/payment; sticky total/confirm. | Total and confirm stay visible. |
| Checkout | Information hierarchy | 16px total line; 11px hints; many equal-weight buttons. | 24px invoice total, one primary confirm, compact secondary actions. | Faster confirmation. |
| Checkout | Workflow complexity | ~6 core keyboard actions for a one-line cash sale; ~8+ for split. | Same financial steps, fewer focus/scroll transitions; `Fill remaining` for split. | Design target: fewer pointer/scroll actions; no measured time claim. |
| Checkout | Error handling | Single message; F4 focuses problem field. | Field-associated errors + persistent status region + explicit refused/uncertain/saved states. | Reliability. |
| Checkout | Accessibility | Good labels/shortcuts; focus ring fails contrast; small controls. | ≥3:1 focus, 44px controls, tabular amounts, shortcut hints as a help popover. | Keyboard/low-vision support. |
| Payment allocation | Navigation | Four stacked inputs inside a fieldset; customer lookup above. | Right-panel allocation table with active customer, total, allocated, remaining. | Correct split at a glance. |
| Payment allocation | Information hierarchy | `Split customer credit amount (₹)` buried among inputs. | `₹1,000.00 total · ₹600.00 cash · ₹400.00 credit · ₹0.00 remaining`. | Cash vs credit clarity. |
| Payment allocation | Workflow complexity | Manual arithmetic for remaining amount. | Live remaining + explicit fill target; exact sum still required. | Fewer arithmetic errors; financial invariant unchanged. |
| Payment allocation | Error handling | Equality error only after preview/review. | Immediate non-blocking validation plus review summary. | Earlier recovery. |
| Payment allocation | Accessibility | Text labels; no colour-only status. | Text+icon+shape for unverified/credit/cash; never colour alone. | Accessible status. |
| Transaction success | Navigation | `SavedInvoice` appears inline; `Start next sale` below it. | Dedicated success region with receipt, print, find receipt, next sale. | Unmistakable posting. |
| Transaction success | Information hierarchy | `Saved total` 16px; UUID in a readonly input. | `SALE SAVED` status + large total + copyable ID. | Trust. |
| Transaction success | Workflow complexity | Print/recovery/next sale are separate buttons. | One primary `Start next sale`; secondary `Print` / `Find receipt`. | Faster next customer. |
| Transaction success | Error handling | Print failure notice only. | Print is independent; sale state remains saved if print fails. | No duplicate sale. |
| Transaction success | Accessibility | Heading focused; `lang` set. | `role=status` success landmark, focus to success heading, no delayed animation. | Screen-reader clarity. |
| Failure / retry | Navigation | `pending-stock` div with UUID and `Retry same sale`. | Persistent state banner with `Result uncertain` / `Refused` / `Saved — acknowledgement pending`. | No ambiguity. |
| Failure / retry | Information hierarchy | UUID and prose are prominent; action is small. | Plain-language state first, operation ID copyable second, same-ID retry primary. | Correct recovery. |
| Failure / retry | Workflow complexity | F8 or button retry. | Same; no new ID, no re-entry of cart. | Preserves exactly-once. |
| Failure / retry | Error handling | `refusedCodes` distinguishes refusal; `Edit refused sale` conditional. | Explicit refused vs uncertain copy and available actions. | Avoids duplicate sales. |
| Failure / retry | Accessibility | `role=alert/status` message. | Persistent `aria-live` region, focus to retry when body has focus. | Keyboard recovery. |
| Product management | Navigation | Two side-by-side forms + list on one page. | Search-first table with create/edit drawer and stock history. | Long-catalog usability. |
| Product management | Information hierarchy | Item count chip; form and list equal weight. | Stock availability and reorder signal first; create secondary. | Operational clarity. |
| Product management | Workflow complexity | 7 interactions per SKU including acknowledgement. | Keep acknowledgement; group repeated lines only in a later tested phase. | Safety retained. |
| Product management | Error handling | Panel-level message; pending receipt. | Field errors + durable receipt chip. | Recovery. |
| Product management | Accessibility | Labels/required; small type. | 44px rows/controls, table headers with `scope`, wrap long names. | Readability. |
| Customer ledger | Navigation | Search list, create form, selected account, statement, link form all stacked. | Customer lookup → account header → tabs/elements for statement, repayment, corrections. | Outstanding balance first. |
| Customer ledger | Information hierarchy | Outstanding/overdue/limit in prose; statement table below. | Prominent balance chip, credit-limit headroom, tabular statement. | Credit decisions. |
| Customer ledger | Workflow complexity | Repayment 5 interactions. | Same native operations; `Settle in full` target only after validation. | Fewer arithmetic errors. |
| Customer ledger | Error handling | `refusedCodes` and review/cancel. | Field-associated errors and explicit `Saved credit entry` state. | Reliability. |
| Customer ledger | Accessibility | `<table>` without `scope`; 12px text. | `scope`, tabular `₹`, sticky headers, 44px actions. | Ledger readability. |
| Daily closing | Navigation | Cashier-day, invoice register, returns, CSV and recovery in one panel. | Dedicated Day close view with expected/counted/variance and payment breakdown. | Closing confidence. |
| Daily closing | Information hierarchy | Variance in a sentence. | Reconciliation table with signed variance and explanation. | Audit clarity. |
| Daily closing | Workflow complexity | Counted cash → review → confirm; reopen requires reason far away. | Same operations with contextual reason field. | Fewer mis-clicks. |
| Daily closing | Error handling | `day_closed`, `duplicate_settlement` text; immutable closing. | Explicit closed/reopened state and reason history. | Audit evidence. |
| Daily closing | Accessibility | Text status, no colour-only signal. | Text+icon state, high-contrast variance sign. | Accessible reconciliation. |
| Business configuration | Navigation | Staff, passwords, backup, draft and setup scattered. | Admin view grouped into Business, Staff & permissions, Receipts, Backup & recovery, Devices (future). | Fewer hidden admin modules. |
| Business configuration | Information hierarchy | Long paragraphs and many equal-weight fields. | Sections with one primary action each; destructive danger zone. | Lower cognitive load. |
| Business configuration | Workflow complexity | Restore requires preview + re-entered passwords + phrase. | Keep high-friction safety; add a stepper and clearer summary. | Safety without confusion. |
| Business configuration | Error handling | Fail-closed lock on restore error. | Same, with explicit result screen. | No silent failure. |
| Business configuration | Accessibility | Labels/groups; 10–12px copy. | Larger body, 44px controls, forced-colors danger styling. | High-consequence form accessibility. |

---

## 7. Evidence references

| Reference | What it proves |
|---|---|
| `git fetch`, `git ls-remote`, `gh pr view 145`, `gh api .../check-runs` | Live main/PR/merge state and green final-head checks. |
| `apps/desktop/check-native.py` | 28 installed-app screenshot capture points; exact UIA control names, financial values, keyboard bursts, restart/reinstall assertions. |
| `apps/desktop/check-windows-evidence.py` | Four required PNGs are pixel-decoded on the Windows runner; evidence gate also validates installer manifest. |
| `apps/desktop/src/main.tsx` | Single-page shell, stacked panels, navigation, state coordination, role visibility. |
| `apps/desktop/src/style.css` | Current tokens, focus ring, type sizes, geometry, dark mode, reduced motion, print isolation. |
| `apps/desktop/src/CheckoutPanel.tsx` | Shortcuts, preview validation, split logic, operation-ID lifecycle, pending/success states, accessible names. |
| `apps/desktop/src/{Inventory,Customer,Retail,Staff,Credentials,Backup}Panel.tsx`, `SavedInvoice.tsx`, `AccessGate.tsx`, `CustomerLookup.tsx` | Module behavior and protected UI names. |
| `packages/business-domain/src/{fixed-decimal,native-invoice}.ts`, `apps/desktop/src/billing-types.ts` | Integer paise, exact decimal parsing, en-IN grouping. |
| `packages/local-store/src/{billing,payments,access}.rs` | Native posting, split-credit validation, credit limit, session/permission authority. |
| `docs/reviews/operator-ux-review-2026-11-02.md` | Prior independent operator findings and deferred P2/P3 items. |
| `docs/reviews/PHASE-5-RELEASE-CANDIDATE-INTEGRATION.md`, `docs/reviews/PHASE-6-SINGLE-TILL-PILOT-RELEASE-GATE.md` | Release-candidate identity, ₹1,000 installed-UI PASS, physical hardware gates. |
| `docs/reviews/windows-pos-printing.md` | Print boundary, Gurmukhi font licensing/coverage, prior timing measurements on Linux/JSDOM (not Windows shop hardware). |
| Committed `docs/reviews/windows-*-browser.png` | Actual browser print/recovery previews, visually reviewed here; explicitly not installed-app screenshots. |

**Audit completeness:** source, workflows, tests, prior reviews and artifact metadata are complete; installed-app pixel review is blocked by sandbox egress and must be closed in an authorized Windows/artifact-download environment before design sign-off.
