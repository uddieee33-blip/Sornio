# SORNIO — Phase 7 / Assignment 2: Implementation Approval Package

**Status:** FOUNDER APPROVAL PACKAGE — stop here.  
**Production implementation authorization:** **NOT YET GRANTED**.  
**Automatic merge authorization:** **NONE**.  
**Target context:** December 10–15, 2026 release is a **subject-to-gates** target, not a commitment.  
**Production files modified by this assignment:** **0**.

---

## 1. Executive summary

This package delivers two real Windows design directions, W1–W7, four viewport sizes, 125% scaling, comparison sheets, Android A1–A5, a navigable preview, an evidence report, a Windows prototype review, an Android audit, and a cross-platform experience contract. It does **not** deliver production UI, a merge, a deployment, live sync, Android checkout, GST integration, LAN integration, or a public-launch claim.

The founder must now choose a direction and explicitly approve scope. Until that decision is recorded, no production implementation may begin.

---

## 2. Founder decisions requested

| # | Decision | Recommended answer | Why |
|---:|---|---|---|
| 1 | Windows design direction | **Direction A — Precision Retail**, with three B refinements | Best 720p/125% reliability, lower implementation delta, cashier speed. B is the alternative. |
| 2 | Borrow B refinements? | Yes: grouped totals, 12px noncritical radii, subtle payment-panel depth | Premium feel without sacrificing pinned total/confirm |
| 3 | Reject B labelled rail at 1280×720 / 125%? | Yes | Consumes centre width; A’s icon rail is safer |
| 4 | Cross-platform token source | New semantic PRECISION WORKSPACE contract, not a silent rewrite of 10 web themes or Dawn/Dusk | Three systems currently disagree |
| 5 | Punjabi V1 scope | Receipt-only, reuse existing 33 verified phrases; physical Gurmukhi print gate | Full UI/Hindi localization is untested and separately funded |
| 6 | `Fill remaining` | Defer | Any allocation helper needs native split regression |
| 7 | Cycle/hardware template IDs | Defer; map to `general` for V1 | No current `PortalId`; do not pretend a module exists |
| 8 | Android financial posting / live sync | **No** | Read-only companion; `productionSyncEnabled=false` |
| 9 | GST PR #127 / LAN PR #126 | Keep isolated | Separate compliance and multi-till workstreams |
| 10 | Code signing / Play release | Fund as separate gates | No certificate, release AAB, Play upload or device test exists |
| 11 | Physical pilot | **NO-GO** until 15-step plan passes | Unsigned installer, printer/scanner/Gurmukhi/USB/WebView2 gates open |
| 12 | Draft PR | Optional, clearly labelled `NONPRODUCTION DESIGN REVIEW` | Not opened by this assignment |
| 13 | Minimum effective CSS viewport | Approve 1024×576 @125% as V1 floor; 150% to be measured | Prototype evidence covers 125%, not 150% hardware |
| 14 | Device-capability evidence threshold | Define `Tested` = CI + installed/physical evidence, not compile only | Avoids false readiness claims |
| 15 | First implementation slice | App shell + semantic tokens only, zero financial logic change | Smallest reversible step |
| 16 | Release target | Keep Dec 10–15 tentative | Gates, not a date, decide readiness |

---

## 3. Recommended design direction and reasoning

**Recommended:** Direction A — Precision Retail.  
**Alternative:** Direction B — Refined Commerce.

Reasoning:

- The product is an offline-first counter POS for grocery/kirana/cycle-spares/hardware shops; keyboard speed and 1280×720 reliability outrank decorative generosity.
- Direction A keeps the existing dense desktop vocabulary while fixing the structural problem: a long mixed-module scroll becomes a focused cashier route with a persistent payment panel.
- Direction A’s 64px icon rail preserves more centre width for long mixed-script product names at 125% scaling.
- Direction B is visually more premium and maps better to Android cards, but its labelled rail, 44px rows and extra guidance consume vertical space; at 125% the prototype must hide secondary guidance.
- Neither direction changes financial semantics. Both show the same `₹1,000.00 = ₹600.00 + ₹400.00` split, native revalidation notice and safe F8 recovery.

---

## 4. Proposed implementation sequence — **not authorized yet**

Only after founder approval:

1. **7.0 Evidence + approval gate** — founder records direction, scope, open decisions and stop conditions.
2. **7A.1 Semantic token contract** — isolated `tokens.css` or equivalent; no production JSX/CSS replacement; verify AA and High Contrast.
3. **7A.2 App shell composition** — new route-level shell with existing `AccessGate`, `main.tsx` dirty/busy coordination and unchanged UIA names.
4. **7A.3 Cashier layout** — reuse existing `CheckoutPanel` logic; change composition only; preserve F2/F3/F4/Enter/F8/Escape, `operationId`, review-before-post and native confirmation.
5. **7A.4 Split allocation presentation** — add allocated/remaining/status presentation only; native `payments.rs` remains authoritative.
6. **7A.5 Inventory / Customers / Recovery / Onboarding views** — one at a time, each behind a reviewed change set.
7. **7B Regression suite** — UIA/Playwright cashier, split, print, Punjabi, 720p/125%, High Contrast, reduced motion, scanner cadence, crash/retry.
8. **7C Installed Windows acceptance** — rerun `windows-local.yml` on the reviewed commit, durably archive authentic captures with SHA-256, visually review them.
9. **7D Physical pilot** — 15-step real-shop PC / printer / scanner / Gurmukhi / USB / WebView2 / SmartScreen plan.
10. **7E Separate Android review** — emulator/device, signing, Play readiness; still read-only.
11. **7F Founder release decision** — distinct gate; no automatic merge or deploy.

**Proposed first production implementation task (after approval only):** add an isolated semantic token contract and a route-level `AppShell` composition that leaves `CheckoutPanel`, `native.ts`, Rust, SQLCipher, schema, permissions, keyboard handlers and test assertions unchanged; run the full existing verification suite and a new 1280×720/125% layout regression. This is a proposal, not work performed here.

---

## 5. Risk matrix

| Risk | Severity | Likelihood | Mitigation | Gate |
|---|---|---|---|---|
| Visual redesign renames UIA/Playwright control names | High | Medium | Preserve exact names; coordinated test update | 7B UIA regression |
| Total/confirm moves below 720p or 125% viewport | High | Medium | Pinned right panel; compact rules; rendered checks | 7B layout regression |
| Frontend split preview mistaken for native posting | Critical | Low | `PREVIEW ONLY — NOT POSTED` and native revalidation notice | 7A.4 + installed UI |
| Retry creates a new `operationId` / duplicate sale | Critical | Low | Same-ID F8 contract; `verify-desktop-contract.mjs` | 7B / 7C |
| Gurmukhi matras clipped in print | High | Medium | OFL font, verified phrases, 58/80 mm/A4 physical print | 7D step 10 |
| Colour-only status becomes inaccessible | Medium | Medium | Text + shape + colour; High Contrast test | 7B |
| Cross-platform token rewrite breaks AA | Medium | Medium | Semantic contract; contrast computation; no silent theme rewrite | 7A.1 |
| Android stale cache shown as real-time balance | High | Medium | Demo/freshness labels; read-only boundary | 7E device review |
| Android silently becomes financial posting terminal | Critical | Low | No checkout screen; `PRODUCTION_DISABLED`; founder decision | Change-control gate |
| GST PR #127 or LAN PR #126 accidentally integrated | Critical | Low | Keep isolated; no merge in this assignment | Change-control gate |
| Unsigned installer / SmartScreen warning in shop | High | High | Code-signing provider and clean-machine test | 7D |
| Physical printer/scanner/power/WAN failure | High | High | 15-step physical plan; no pilot until pass | 7D |
| Public release claimed from green CI | Critical | Medium | Distinct verdicts; no deploy | 7F |
| Artifact evidence expires / remains inaccessible | Medium | High | Durable archive with SHA-256 before pilot | 7C |

---

## 6. Change-control gates — explicit

No production change may proceed unless **all** apply:

1. Founder has explicitly approved a direction and scope in writing.
2. `Production implementation authorization` changes from `NOT YET GRANTED` to a recorded decision; `Automatic merge authorization` remains `NONE`.
3. No merge, force-push, history rewrite, release, deploy, billing change, or protected-branch push is performed.
4. Production financial logic, schema, payment code, routes, permissions, test assertions, dependencies, Rust/SQLCipher, `SCHEMA_VERSION=12`, `productionSyncEnabled=false`, GST PR #127 and LAN PR #126 remain untouched.
5. Android checkout, live sync, release signing and Play upload remain out of scope unless separately authorized and fully tested.
6. Every change set is documentation/isolated-prototype-only until approval, then one reviewed production slice at a time.
7. Full CI is required once production code/dependencies/tests change; it is **not** required for this assignment’s documentation/isolated prototypes.
8. Authentic captures, browser renders and design prototypes remain separately labelled.
9. Synthetic data only; no credentials, private customer information, confidential data or oversized binaries.
10. Any failed gate stops the sequence; keep evidence and report.

---

## 7. Release gates and current verdicts

Current `origin/main` `docs/reviews/release-evidence-manifest-2026-11-02.json` states:

- `singlePcPhysicalShopPilot.decision = "NO-GO"` — blocked until all 15 steps in `docs/reviews/windows-physical-pilot-acceptance-plan-2026-11-02.md` pass on the actual shop-class Windows PC with real thermal/A4 printer, USB barcode scanner, Gurmukhi paper output, USB backup media, and clean-machine WebView2/SmartScreen handling.
- `publicCommercialRelease.decision = "NO-GO"` — installer is unsigned, cross-version upgrade untested, runtime-absent offline WebView2 bootstrap unverified on physical hardware, GST tax-invoice compliance out of scope, digital payments have no automated external verification, and physical pilot results do not yet exist.

Additional current-main gates: `2026-11-03-windows-installed-pos-acceptance.md`, `2026-11-03-pr143-reliability-release-gate.md`, `windows-release-gate-2026-11-01.md`, `windows-evidence-quality-gate-2026-11-01.md`. The installed-POS acceptance document reports engineering-scope PASS on the audit branch but explicitly keeps **real-shop pilot NO-GO**, production sync **NO-GO**, and public Android/iOS release **NO-GO**.

| Gate | Verdict |
|---|---|
| Design evidence | **PARTIAL** — authentic installed-app pixel review blocked |
| Windows prototype | **READY FOR FOUNDER REVIEW** |
| Android companion prototype | **READY FOR FOUNDER REVIEW** |
| Android companion product | **NO-GO for public release** |
| Production UI implementation | **NOT AUTHORIZED** |
| Real-shop physical pilot | **NO-GO** |
| Public commercial release | **NO-GO** |
| Production cloud synchronization | **NO-GO** (`productionSyncEnabled=false`) |
| GST statutory invoicing | **SEPARATE / NOT CLAIMED** |
| Multi-till LAN | **SEPARATE / ISOLATED** |

---

## 8. Validation summary

Full CI was **not triggered** because only documentation and isolated nonproduction prototype assets changed; repeated expensive CI runs would add no evidence for these files. Instead:

- 16 local verifier checks were previously executed on extracted current `main` in an isolated `/tmp` TypeScript/@types/node/@electric-sql/pglite toolchain, all passing: `verify-local-schema.py` 92, `verify-desktop-contract.mjs` 37, `verify-mobile-contracts.mjs` 63, `verify-native-money.mjs` 12 (4,820 random invoices / 180 overflow refusals), `verify-checkout.mjs`, `verify-native-invoice.mjs` 45 + 13, `verify-business-domain.mjs`, `verify-replication.mjs` 106, `verify-windows-release.mjs` 40, `verify-security.mjs` 53, `verify-auth.mjs` 53, `verify-recovery.mjs` 24, `verify-reliability.cjs` 15, `verify-i18n.mjs` 22 catalogues / 2,751 phrases, `verify-theme.mjs` 10 paints, `verify-motion.mjs` 7 invariants / 248 files. These are local checks on extracted source, **not full CI**, and they triggered no CI.
- New prototype validation covers PNG decode/size, manifest paths, classification labels, W1–W7/A1–A5 coverage, four required viewports, 125% scaling, comparison sheets, `node --check prototype.js`, HTML reference resolution, WCAG contrast ratios, Indian currency grouping, exact labels, synthetic-data declarations and production-source integrity. Results are in [VALIDATION.md](../phase7-assignment2/VALIDATION.md).
- `git status` before commit showed only the new untracked `docs/design/phase7-assignment2/` directory and new documentation files; no production file was modified.

---

## 9. Final readiness verdicts — distinct, not collapsed

| Category | Verdict |
|---|---|
| **Design evidence** | **PARTIAL** — source, CI metadata, four browser previews and new side-by-side prototypes exist; authentic installed-app screenshots reviewed = 0; pixel-level installed-app review BLOCKED. |
| **Windows prototype** | **READY FOR FOUNDER REVIEW** — Direction A/B, W1–W7, 1280×720 / 1366×768 / 1600×900 / 1920×1080, 125%, comparison sheets and navigable preview. |
| **Android companion** | **PROTOTYPE READY / PRODUCT NO-GO** — A1–A5 are honest demo/read-only/stale-labelled; debug compile only, no device/emulator/signing/Play/live-sync readiness. |
| **Production UI** | **NOT AUTHORIZED** — founder approval required; no production code/CSS/component/dependency/test change made. |
| **Real-shop pilot** | **NO-GO** — 15-step physical hardware, signing, WebView2/SmartScreen, printer/scanner and Gurmukhi gates unresolved. |
| **Public release** | **NO-GO** — unsigned installer, no physical pilot, GST out of scope, digital verification absent, no Android release artifact or store submission. |

These verdicts must not be collapsed into a single “GO”.

---

## 10. Stop condition

**Stop for founder approval.** Do not implement production UI, merge PRs, deploy, claim public-launch readiness, integrate GST PR #127 or LAN PR #126, add Android checkout, enable live synchronization, or modify production code. The next action is a recorded founder decision on the requested choices above.
