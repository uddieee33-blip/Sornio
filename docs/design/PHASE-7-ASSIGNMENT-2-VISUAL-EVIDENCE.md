# SORNIO — Phase 7 / Assignment 2: Independent Visual Evidence Report

**Status:** NONPRODUCTION DESIGN REVIEW · documentation and isolated prototypes only.  
**Date:** 2026-11-04 (Asia/Kolkata).  
**Production implementation authorization:** NOT YET GRANTED. **Automatic merge authorization:** NONE.  
**Classification rule:** the three labels below are never mixed.

- `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE` — a real screenshot produced by the installed Tauri Windows app.
- `BROWSER RENDER — NOT INSTALLED WINDOWS APP` — a browser/print render or source-grounded reconstruction.
- `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` — a new design illustration made for this review.

---

## 1. Live repository baseline re-established

| Item | Verified state |
|---|---|
| Current `origin/main` | `1cc5c798d1eada9a16463213b0776c01e99d36f9` |
| Working branch | `arena/2c0afc32-sornio` — fixed by Arena; a different branch cannot be created here |
| Working branch HEAD before this assignment | `b515d2a49829979c2087295f6b375b9df8449e68` — clean |
| Phase 7 Assignment 1 documents | Five `docs/design/PHASE-7-*.md` files are present on the working branch; **absent from `origin/main`** |
| Phase 7 on `main` | `git ls-tree -r --name-only origin/main docs/design | grep PHASE-7` returned empty |
| Open PRs | **#127** `Add native GST arithmetic foundation and invoicing compliance checklist` — non-draft, `feature/windows-gst-invoicing`; **#126** `Add native single-shop LAN hub and durable multi-till checkout` — draft, `feature/windows-shop-lan` |
| PR for this branch | None (`gh pr list --head arena/2c0afc32-sornio --state all` returned `[]`) |
| PR #145 | Merged externally into `main` as `1cc5c798…` on 2026-11-03T20:57:20Z; parents `005f27a…` and `97b6899…` |
| Newest native capture run | `41709217989`, `Windows local workspace`, head `97b689947`, SUCCESS, 2026-11-03T20:04:51Z |
| Newest `main` push CI | `41717305075`, `CI`, head `1cc5c798d`, SUCCESS, 2026-11-03T20:57:24Z |
| Newer installed-app capture run after `main` CI | **None found** in `gh run list --limit 12` |

The five Assignment 1 documents were **not copied into `main`** and were **not overwritten**. They remain inputs to this review, not approved specifications. `origin/main` was inspected read-only via `git archive` into `/tmp/sornio-main-a2`; no production file was modified.

---

## 2. Authentic capture recovery attempt — exact outcome

Metadata retrieved live from the GitHub API proves these artifacts exist and are not expired, but the bytes could not be downloaded in this sandbox. The failure is outbound Azure blob egress, not artifact expiration.

| Artifact | Run / head | Size | SHA-256 | `expired` | Purpose |
|---|---|---:|---|---|---|
| `Sornio-Local-Native-Captures` `13269596282` | `41709217989` / `97b6899…` | 1,420,490 B | `a664bb74b542eea796e3b84f1d951f59109d54d600c845f9dbe392e1f601955c` | false | Latest installed-app captures |
| `Sornio-Local-Native-Captures` `13266470821` | `41702800767` / `21a3f7c…` | 1,415,767 B | `208b77f6f6ebce906e528515be4405230ff501303b1820dab16f91b191001413` | false | Earlier installed-app captures |
| Companion debug APK `13267017643` | `41709217736` / `97b6899…` | 50,052,080 B | `82255df411ad774dac555a0a2373dd49e8553e14d5e75c239c6c2ccd0139ab8b` | false | Debug Android build |
| `Sornio-Android-review` `13267861820` | `41709217824` / `97b6899…` | 60,825 B | `a2035514d6fb709ae962bbebd87ca76b8c2e3ab6a26ac4253ac580c0134b6597` | false | Android review package |

Exact `gh run download` failures, recorded in `/tmp/sornio-a2-downloads/{native,browser,android}.log`; signed SAS URLs are omitted here because they are temporary credentials:

- native run `41709217989`: `Get "https://productionresultssa16.blob.core.windows.net/actions-results/…zip?…": EOF`, exit 1.
- browser review run `41709217778`: `Get "https://productionresultssa15.blob.core.windows.net/actions-results/…zip?…": EOF`, exit 1.
- Android review run `41709217824`: `Get "https://productionresultssa32.blob.core.windows.net/actions-results/…zip?…": EOF`, exit 1.

Additional attempts through signed Azure URLs, `fetch_page`, proxies, Jina, job logs, artifact pages, unauthenticated API and raw octet-stream paths also returned non-binary or failed output. No native ZIP/APK/PNG bytes were saved.

**Authentic installed-app screenshots visually reviewed in this sandbox: 0.**  
**Founder-supplied screenshot gallery found under `/home/user`: none.**  
No screenshot in this assignment is labelled `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE`.

`apps/desktop/check-native.py` catalogues **28 unique installed-app capture names**; a green run is expected to produce 27 plus conditional `windows-local-failure.png`. `check-windows-evidence.py` requires four: `windows-first-setup.png`, `windows-local-cash-receipt.png`, `windows-retail-closing.png`, `windows-installed-preserved.png`. The 28 catalogued names are:

`windows-backup-preview.png`, `windows-backup-restored.png`, `windows-customer-credit-sale.png`, `windows-customer-ledger.png`, `windows-customer-partial-repayment.png`, `windows-first-setup.png`, `windows-installed-preserved.png`, `windows-local-cash-receipt.png`, `windows-local-checkout.png`, `windows-local-failure.png`, `windows-local-locked.png`, `windows-local-next-sale-reopened.png`, `windows-local-reopened.png`, `windows-local-restored.png`, `windows-local-saved.png`, `windows-local-stock.png`, `windows-mixed-cash-credit-sale.png`, `windows-mixed-split-reopened.png`, `windows-owner-staff.png`, `windows-product-creation.png`, `windows-retail-closing.png`, `windows-retail-pending-payment.png`, `windows-retail-reconciliation.png`, `windows-retail-return-refund.png`, `windows-staff-disabled.png`, `windows-thousand-split-reopened.png`, `windows-thousand-split-sale.png`, `windows-unlock.png`.

CI metadata and the in-repo docs state that installed-UI financial acceptance, including the `₹1,000.00 = ₹600.00 cash + ₹400.00 credit` regression, passed on the audit branch. That is **CI-reported evidence**, not a visually reviewed capture in this sandbox. It does not close the physical-hardware, code-signing or pilot gates.

---

## 3. Visual evidence inventory

| Evidence | Exact classification | Reviewed here? | What it can / cannot prove |
|---|---|---|---|
| Artifact `13269596282` / `13266470821` metadata | `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE`, not decoded | Metadata only | Proves artifact existence, size, digest, run and non-expiry. Does **not** prove visual content. |
| 28 names in `check-native.py` | Expected installed-app captures | Source text only | Proves expected coverage. Does **not** show pixels. |
| `docs/reviews/windows-saved-receipt-browser.png` | `BROWSER RENDER — NOT INSTALLED WINDOWS APP` | Yes, re-reviewed | 80 mm print controls, `Sale saved on this PC`, sale `S-000000000001`, saved invoice ID `131e9e50-25eb-4483-bd1f-b1f424223df3`, `30/10/2026, 1:42:24 am IST`, `Rice · 0.125 kg × ₹42.50`, subtotal `₹5.31`, tax `₹0.27 (5%)`, total `₹5.58`, and explicit GST non-compliance disclaimer. |
| `docs/reviews/windows-punjabi-receipt-browser.png` | `BROWSER RENDER — NOT INSTALLED WINDOWS APP` | Yes, re-reviewed | Translated button/headings but mixed English printer/sale/date/original-record strings and apparent left-edge Gurmukhi clipping. Does not prove installed-app print output. |
| `docs/reviews/windows-customer-statement-browser.png` | `BROWSER RENDER — NOT INSTALLED WINDOWS APP` | Yes, re-reviewed | Synthetic print layout with `Asha <shop> ਪੰਜਾਬੀ`, `Snapshot 105 · Outstanding 106.05`, five `statement-row-00*` rows and literal `<not markup>`. |
| `docs/reviews/windows-recovery-browser-preview.png` | `BROWSER RENDER — NOT INSTALLED WINDOWS APP` | Yes, re-reviewed | Encrypted backup controls, `Schema 11`, synthetic backup ID/SHA, restore confirmation phrase, safety-backup wording. `Schema 11` is historical preview text, not current schema identity; current `SCHEMA_VERSION=12`. |
| `docs/brand/sornio-approved-reference.jpeg` | Approved brand reference | Yes, Assignment 1 | Brand direction only, not application UI. |
| New `phase7-assignment2/assets/browser-render/current-source-reconstruction.html` / `.png` | `BROWSER RENDER — NOT INSTALLED WINDOWS APP` and `SOURCE-GROUNDED RECONSTRUCTION` | Generated and reviewed | Static DOM/CSS reconstruction from `origin/main` `apps/desktop/src/main.tsx` / `style.css`. Not a React runtime capture and not the installed app. |
| All new Windows/Android PNGs under `phase7-assignment2/assets/` | `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` | Generated and visually reviewed | Design communication only. No production posting, no real data, no installed-app screenshot. |

---

## 4. Pixel-level Windows UX review — honestly deferred

A true pixel-level review requires the installed-app PNG bytes. Because the Azure egress fails, the following is **source-grounded and browser-preview-grounded**, not pixel-level installed-app analysis.

### 4.1 Source-to-screen evidence matrix

| Screen / journey | Source evidence | Verified visual finding | Proposed improvement | Risk if visual change reaches production |
|---|---|---|---|---|
| W1 Application shell | `apps/desktop/src/main.tsx:153-186`; `style.css` rail/topbar | One long `main.page` with marketing heading, status panel and stacked panels; rail has only three links | Persistent app shell, compact topbar, route-level navigation, shop/operator/day/offline status | Renaming UIA control names or breaking `beforeunload`/dirty coordination |
| W2 Cashier | `CheckoutPanel.tsx:474+`; `checkout-panel` CSS | Checkout is one panel in a long mixed-module scroll; total/confirm can fall below 720p | Dedicated two-region cashier route, sticky total and confirm, internally scrolling results | Moving total/confirm without preserving F2/F3/F4/Enter/F8/Escape and stable operation ID |
| W3 Split reconciliation | `CheckoutPanel.tsx` payment rows; `payments.rs` | Manual arithmetic and dense row controls; CI asserts `₹1,000.00` split | Allocation table with remaining, exact cash/credit, status shapes, native-revalidation notice | Frontend “valid” state being mistaken for native posting |
| W4 Inventory | `InventoryPanel.tsx:145+` | Long form/table in same page; add/correct controls compete with checkout | Focused stock route, search, priority actions, revision/low-stock status | Hiding owner capability or allowing a stale stock revision to post |
| W5 Customer credit | `CustomerPanel.tsx:154+` | Outstanding/overdue/limit in one dense paragraph; ledger below | Clear outstanding, available limit, statement, repayment and status | Silent credit-limit override or colour-only debt status |
| W6 Recovery | `SavedCopies.tsx`, `BackupPanel.tsx`, `main.tsx` dirty coordination | Backup/restore/recovery are separate lower-page panels; `Schema 11` appears in an older preview | Dedicated “result uncertain → safe retry” state with original operation ID | A retry minting a new operation ID or a second sale |
| W7 Onboarding | `main.tsx` first-workspace form; `dailyWorkspace()` templates | Business type is a select inside a general draft form; web portal IDs include salon/gym/cafe | Deterministic V1 profile chooser, only implemented modules enabled | Pretending hardware/cycle template IDs or AI modules exist |
| Saved receipt | `SavedInvoice.tsx`; committed browser preview | Correct `₹5.58` English print preview; GST non-claim | Preserve wording; add grouped `₹1,000.00` regression screenshot | Claiming GST compliance or changing print snapshot reauthorization |
| Punjabi receipt | `pa.json`; committed browser preview | Mixed English strings and apparent Gurmukhi clipping in older browser preview | Verified translation reuse, OFL Gurmukhi font, physical print gate | Silently overwriting verified translations or shipping clipped matras |
| Staff/access | `StaffPanel.tsx`, `CredentialsPanel.tsx`, `access.rs` | Owner-only controls exist but are stacked | Keep native authority; only hide navigation | Renderer granting a permission |
| Payments/closing | `RetailPanel.tsx` | Explicit “unverified” digital-payment wording | Preserve text + shape, never imply verification | Colour-only status or automatic UPI verification claim |
| Lock/unlock | `AccessGate.tsx` | Password gate exists | Keep exact UIA names and focus behaviour | Focus loss or inaccessible error state |
| Backup/restore | `BackupPanel.tsx` | Encrypted backup, wrong-passphrase refusal, confirmation phrase | Keep confirmation copy and safety backup | Bypassing dirty/busy guards |
| Current theme | `style.css`; `lib/theme/palettes.json`; `packages/mobile-design/src/tokens.ts` | Desktop plain CSS, web 10 OKLCH paints, mobile Dawn/Dusk warm ivory/cobalt | One semantic token contract, not three unrelated palettes | A cross-platform token rewrite breaking AA or print |
| Current focus | `style.css` `#829fce` on white = 2.69:1 | Fails AA non-text contrast | Replace with `#246B65` / `#7BC2B7` focus tokens | Removing focus for mouse users |
| 720p / 125% | `main.tsx` long page; Assignment 1 viewport math | Primary total/confirm can leave the initial viewport | Pinned right panel, compact rows, no horizontal scroll | Hiding remaining/total/confirm at 125% scaling |

### 4.2 Features that should remain visually recognizable

- `Sornio` wordmark, `On this PC`, `Local workspace`, `Lock workspace`, `Checkout`, `Items & stock`, `Customers & credit`.
- Exact control names used by UIA/CI: `Confirm sale`, `Review sale`, `Retry same sale`, `Print saved receipt`, `Saved invoice ID`, `Start next sale`, `Review credit entry`, `Confirm retail operation`.
- Keyboard hints `F2`, `F3`, `F4`, `Enter`, `F8`, `Escape`.
- `₹` + `en-IN` grouping + two decimals; integer paise; explicit `unverified` UPI/card; explicit GST non-claim.
- Saved-on-this-PC copy, encrypted backup confirmation phrase, and “review before posting”.

### 4.3 Features needing structural redesign

- Long mixed-module scrolling checkout → dedicated route/workspace.
- Total/confirm possibly below 720p → persistent right payment panel.
- 10–13px operational type → 13–14px minimum in compact desktop rows, larger totals.
- Weak focus ring → AA focus token.
- Manual split arithmetic → explicit allocated/remaining reconciliation, while native revalidation remains authoritative.
- Partial Punjabi receipt rendering → verified translation reuse plus physical Gurmukhi print gate.
- Three token systems → one semantic contract, with Android geometry intentionally different.

---

## 5. High-priority design findings carried into the prototypes

1. **Reliability over decoration:** a verified transaction outranks an animation. The prototype uses no motion.
2. **720p first:** 1280×720 and 125% scaling are treated as primary constraints, not afterthoughts.
3. **Financial clarity:** total, remaining, confirm, success, failure, pending and retry must be visible and text-labelled.
4. **Native authority:** every payment preview says the native store revalidates before posting.
5. **Readable Indian retail vocabulary:** Billing, Stock, Customers / Udhar, Payments, Day closing, Counter, Khata.
6. **No false real-time claim:** Android always says `DEMO DATA — NOT LIVE` and `figures may be outdated`.
7. **Honest evidence:** prototypes are never captions for authentic captures; browser renders are never installed-app screenshots.

---

## 6. Prototype evidence generated for this assignment

All files below are isolated under `docs/design/phase7-assignment2/`. The [concise README](phase7-assignment2/README.md) and [navigable preview](phase7-assignment2/index.html) contain direct links.

| Deliverable | Link | Classification |
|---|---|---|
| Navigable preview, W1–W7 + A1–A5 | [index.html](phase7-assignment2/index.html) | `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` |
| Direction comparison sheet | [direction-comparison.png](phase7-assignment2/assets/windows/comparison/direction-comparison.png) | `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` |
| 1280×720 / 1920×1080 side-by-side | [responsive-side-by-side-1280-vs-1920.png](phase7-assignment2/assets/windows/comparison/responsive-side-by-side-1280-vs-1920.png) | `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` |
| Four-viewport matrix | [responsive-matrix.png](phase7-assignment2/assets/windows/comparison/responsive-matrix.png) | `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` |
| 125% scaling check | [responsive-125-percent.png](phase7-assignment2/assets/windows/comparison/responsive-125-percent.png) | `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` |
| Android A1–A5 sheet | [android-comparison-sheet.png](phase7-assignment2/assets/android/android-comparison-sheet.png) | `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` |
| Source-grounded browser render | [current-source-reconstruction.html](phase7-assignment2/assets/browser-render/current-source-reconstruction.html) | `BROWSER RENDER — NOT INSTALLED WINDOWS APP` |
| Machine-readable labels | [manifest.json](phase7-assignment2/manifest.json) | Metadata only |

---

## 7. Evidence limitations and conclusion

- No installed-app PNG was decoded or visually reviewed here.
- No newer native capture run exists after the `main` push CI in the inspected run list.
- No founder gallery was found in the workspace.
- The four committed browser/print previews are useful but cannot prove installed Windows rendering, physical Gurmukhi printing, scanner cadence or WebView2/SmartScreen behaviour.
- The new prototypes are synthetic, static and nonproduction; they cannot post a sale, verify a real balance or test a device.

**Design evidence readiness:** PARTIAL — strong source, CI metadata, browser previews and new side-by-side prototypes; authentic installed-app pixel review remains BLOCKED. This is sufficient to compare two design directions, **not** sufficient to approve production UI, a real-shop pilot or public release.
