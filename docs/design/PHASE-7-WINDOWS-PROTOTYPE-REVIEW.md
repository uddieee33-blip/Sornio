# SORNIO — Phase 7 / Assignment 2: Windows Prototype Review

**Status:** NONPRODUCTION DESIGN REVIEW.  
**All images:** `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` · synthetic demonstration data · no installed-app screenshot.  
**Open first:** [navigable preview](../phase7-assignment2/index.html) · [README](../phase7-assignment2/README.md) · [direction comparison](../phase7-assignment2/assets/windows/comparison/direction-comparison.png).

---

## 1. What was actually built

Two complete, distinct Windows directions were rendered as static PNGs at 1366×768 for W1–W7, with additional cashier captures at 1280×720, 1366×768, 1600×900, 1920×1080 and an effective 125% scaling viewport of ~1024×576. The same synthetic sale and financial workflow appear in both directions. No React, Tauri, Rust, SQLCipher, financial posting, network call or production data is invoked.

| Direction | Visual identity | Geometry | Navigation | Payment region |
|---|---|---|---|---|
| **A — Precision Retail** | Deep `#182333` narrow icon rail, light `#F7F8FA` workspace, white surfaces, teal `#246B65` actions | Dense, 6px radii, 12px gaps, 36px rows, flat surfaces | 64px icon rail at 1366×768 | Persistent right panel; subtotal/tax/total/review always visible |
| **B — Refined Commerce** | Same semantic colours, more white space, grouped totals, soft `#E7EEE9` regions | Generous, 12px radii, 18px gaps, 44px rows, subtle offset shadows | Label-led dark rail, 180px at 1366×768 | Persistent right panel with grouped summary and optional guidance |

Both use the same synthetic `₹1,161.56` cashier example; W3 uses the required `₹1,000.00` invoice with `₹600.00` cash and `₹400.00` customer credit.

---

## 2. Direct review links

### Direction A — Precision Retail
[W1 shell](../phase7-assignment2/assets/windows/direction-a/W1-application-shell.png) · [W2 cashier](../phase7-assignment2/assets/windows/direction-a/W2-cashier-workspace.png) · [W3 split reconciliation](../phase7-assignment2/assets/windows/direction-a/W3-split-payment-reconciliation.png) · [W4 inventory](../phase7-assignment2/assets/windows/direction-a/W4-inventory.png) · [W5 customer credit](../phase7-assignment2/assets/windows/direction-a/W5-customer-credit.png) · [W6 recovery](../phase7-assignment2/assets/windows/direction-a/W6-transaction-recovery.png) · [W7 onboarding](../phase7-assignment2/assets/windows/direction-a/W7-business-onboarding.png)

### Direction B — Refined Commerce
[W1 shell](../phase7-assignment2/assets/windows/direction-b/W1-application-shell.png) · [W2 cashier](../phase7-assignment2/assets/windows/direction-b/W2-cashier-workspace.png) · [W3 split reconciliation](../phase7-assignment2/assets/windows/direction-b/W3-split-payment-reconciliation.png) · [W4 inventory](../phase7-assignment2/assets/windows/direction-b/W4-inventory.png) · [W5 customer credit](../phase7-assignment2/assets/windows/direction-b/W5-customer-credit.png) · [W6 recovery](../phase7-assignment2/assets/windows/direction-b/W6-transaction-recovery.png) · [W7 onboarding](../phase7-assignment2/assets/windows/direction-b/W7-business-onboarding.png)

### Responsive and comparison evidence
[1280×720 vs 1920×1080 side-by-side](../phase7-assignment2/assets/windows/comparison/responsive-side-by-side-1280-vs-1920.png) · [four-viewport matrix](../phase7-assignment2/assets/windows/comparison/responsive-matrix.png) · [125% scaling](../phase7-assignment2/assets/windows/comparison/responsive-125-percent.png) · [A/B comparison](../phase7-assignment2/assets/windows/comparison/direction-comparison.png) · [responsive capture directory A](../phase7-assignment2/assets/windows/direction-a/responsive/) · [responsive capture directory B](../phase7-assignment2/assets/windows/direction-b/responsive/).

---

## 3. W1–W7 specification review

| Screen | Required content | Direction A / B equivalence | Financial honesty check |
|---|---|---|---|
| **W1 Application shell** | Brand identity, shop identity, operator, navigation, offline/online status, business day status, main workspace, clear billing route | A uses compact icon rail and four module cards; B uses labelled rail and softer cards. Both show `Sharma General Store`, `Ravi (Owner)`, `Day open`, `On this PC · Offline` and `Open billing`. | Every screen carries the footer `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE · SYNTHETIC DATA · NOT INSTALLED WINDOWS APP`. |
| **W2 Cashier workspace** | Product search, barcode-ready input, results, active cart, quantities, price totals, customer selection, payment section, final checkout action | A shows 4 result rows, 2 cart lines, `F2`, exact SKU chip, `Review sale · F4`; B shows the same with larger rows and a grouped totals card. Both pin subtotal `₹1,106.25`, tax `₹55.31`, total `₹1,161.56`. | Right panel says `Preview only. Native store revalidates before posting.` |
| **W3 Split-payment reconciliation** | `₹1,000.00` invoice, cash `₹600.00`, credit `₹400.00`, allocated/remaining, credit status, native revalidation notice, successful result state | A/B differ only in geometry. Both show `Cash`, `Customer credit`, `UPI`, `Card`, `Allocated ₹1,000.00`, `Remaining ₹0.00`, `Ravi Kumar · Available ₹1,600.00`, `Confirm sale`. | Two distinct states are shown: `PREVIEW ONLY — NOT POSTED` and `AFTER NATIVE CONFIRMATION — Sale saved on this PC · Invoice S-000000000042 · No duplicate sale`. The prototype never implies the frontend posted the sale. |
| **W4 Inventory** | Product list, search, SKU, available qty, price, stock info, action hierarchy | A compact table; B roomier table. Both include long product names, low-stock labels, `+ Add item` primary and `Record stock change` secondary. | `Saved — acknowledgement pending` status is text + shape, not colour alone. |
| **W5 Customer credit** | Customer identity, outstanding, credit availability, transactions, repayments, clear monetary status | A/B show `Customers / Udhar`, `ਗਾਹਕ ਉਧਾਰ`, `Ravi Kumar`, outstanding `₹400.00`, limit `₹2,000.00`, available `₹1,600.00`, statement rows and repayment `₹200.00`. | `Repayment ₹200.00 · saved` is a synthetic status; no real customer record is implied. |
| **W6 Transaction recovery** | Pending/uncertain operation, clear explanation, safe retry, original transaction identity, no duplicate sale, recovery status | A/B show `RESULT UNCERTAIN — RETRY SAME SALE`, original operation ID `9f2c4a10-…`, preserved cart, `Retry same sale · F8`, `No duplicate sale will be created`, `No new operation ID`. | Retry language explicitly says native revalidation decides the outcome and a retry never starts a second sale. |
| **W7 Business onboarding** | Business-type question, V1 retail templates, only implemented modules enabled, concept-only AI clearly separated | Four options: `Grocery / kirana`, `Cycle & spare parts`, `Small hardware`, `General retail`. Right panel lists `Billing`, `Stock`, `Customers / Udhar`, `Payments`, `Day closing`, `Backup & recovery`. | `CONCEPT ONLY — NOT ENABLED` box states descriptive profile / future AI never posts a sale or changes permissions. Hardware/cycle labels are marked proposed; current build uses the general-retail module set. |

---

## 4. Design alternatives evaluation — nine criteria

Scores are 1–5, 5 best; they are design-review judgements, not measured production results.

| Criterion | Direction A | Direction B | Notes |
|---|---:|---:|---|
| 1280×720 / 125% reliability | **5** | 3 | A keeps more rows and shorter vertical stack; B suppresses secondary guidance at 125% but keeps total/confirm visible. |
| Cashier speed and scanning | **5** | 4 | A’s density reduces eye travel; B’s generous rows cost vertical space. |
| Keyboard reach and focus clarity | 5 | 5 | Both preserve F2/F3/F4/Enter/F8/Escape hints and a 2px accent focus ring. |
| Financial clarity | **5** | 5 | B’s grouped total is elegant; A’s flat total is more legible at small scale. |
| WCAG 2.2 AA / High Contrast resilience | 5 | 5 | Same semantic colours and text+shape statuses; no colour-only meaning. |
| Localization and long mixed-script names | **5** | 4 | A’s compact but wider centre column tolerates long product names better at 1280. |
| Implementation risk from current source | **5** | 3 | A is a smaller structural delta from the existing dense desktop panels. |
| Brand cohesion with Android companion | 4 | **5** | B’s cards/rounding map more naturally to phone cards, though it must not copy desktop. |
| Founder-requested “premium but calm” identity | 4 | **5** | B is more refined; A is more utilitarian. |
| **Weighted recommendation** | **Recommended baseline** | **Refinements to borrow** | Both are acceptable for review; neither is approved for production. |

**Recommendation:** choose **Direction A — Precision Retail** as the Windows baseline, then borrow three Direction B refinements after 720p validation: softer grouping of totals, 12px radii on noncritical cards, and subtle depth on the persistent payment panel only. Do **not** adopt B’s labelled rail at 1280×720 or its extra guidance text at 125% scaling. This keeps reliability ahead of decoration.

---

## 5. Responsive and 125% scaling review

| Physical viewport | Effective CSS at 125% | Direction A result | Direction B result | Primary controls |
|---|---|---|---|---|
| 1280×720 | 1024×576 | Compact 48px rail, 320px right panel, 3 result rows, no secondary guidance | 48px labelled rail is compressed, 3 result rows, no secondary guidance | Search, subtotal, tax, total, `Review sale · F4` all visible |
| 1366×768 | 1092×614 | 64px icon rail, 384px right panel, full 4-row result list | 180px labelled rail, 384px right panel, full 4-row result list | All primary controls visible |
| 1600×900 | 1280×720 | 72px icon rail, 400px right panel, more whitespace | 216px labelled rail, 400px right panel, grouped summary | All primary controls visible |
| 1920×1080 | 1536×864 | 80px icon rail, 420px right panel; extra space is whitespace | 240px labelled rail, 420px right panel; extra space is whitespace | All primary controls visible |

The [side-by-side sheet](../phase7-assignment2/assets/windows/comparison/responsive-side-by-side-1280-vs-1920.png) compares both directions at 1280×720 and 1920×1080. The [125% sheet](../phase7-assignment2/assets/windows/comparison/responsive-125-percent.png) shows the effective ~1024×576 CSS viewport. No prototype uses horizontal scrolling for primary checkout controls. These are rendered PNG checks, not physical Windows DPI tests.

---

## 6. Colour, contrast and tokens

The founder’s six candidate values were **explored, not hard-coded as production tokens**. Prototypes use them as illustrative semantic values; production tokenization requires founder approval.

| Role | Value | Against | Ratio | Decision |
|---|---|---|---:|---|
| App background | `#F7F8FA` | — | — | Keep candidate |
| Surface | `#FFFFFF` | — | — | Keep candidate |
| Navigation / primary text | `#182333` | `#FFFFFF` | 15.82:1 | AA/AAA text; keep |
| Secondary text | `#667085` | `#FFFFFF` | 4.97:1 | AA; keep |
| Secondary text | `#667085` | `#F7F8FA` | 4.68:1 | AA; keep |
| Secondary text | `#667085` | `#E7EEE9` | 4.22:1 | **Reject on soft accent**; use `#52606D` (5.47:1) |
| Primary accent | `#246B65` | `#FFFFFF` | 6.24:1 | AA text/focus/fill; keep |
| White on accent | `#FFFFFF` | `#246B65` | 6.24:1 | AA primary button label |
| Accent on app bg | `#246B65` | `#F7F8FA` | 5.87:1 | AA |
| Accent on soft accent | `#246B65` | `#E7EEE9` | 5.29:1 | AA on soft surface with edge/text |
| Current focus ring | `#829fce` | `#FFFFFF` | 2.69:1 | **Reject**; fails AA non-text contrast |
| Proposed nav focus | `#7BC2B7` | `#182333` | 7.72:1 | AA focus indicator |

Status colours additionally use text and shape: `● Cash recorded / Saved`, `▢ Customer credit — outstanding`, `△ Pending / Preview only`, `! Authentication required`, `× Synchronization failed`, `✓ Saved / Synced`. Removing all colour still leaves the meaning intact.

---

## 7. Typography, currency and localization review

- **Windows fonts:** no new production font is introduced. Static PNGs use system DejaVu Sans / DejaVu Sans Mono; Gurmukhi uses a temporary TTF conversion of the repository’s bundled `noto-sans-gurmukhi.woff2` under SIL OFL 1.1. The OFL text and generation notes are in [FONT-LICENSES.md](../phase7-assignment2/FONT-LICENSES.md) and [GENERATION.md](../phase7-assignment2/GENERATION.md).
- **Tabular Indian currency:** monetary columns use DejaVu Sans Mono and right alignment. Production should use `font-variant-numeric: tabular-nums` with `Intl.NumberFormat('en-IN')`. Examples are `₹1,000.00`, `₹600.00`, `₹400.00`, `₹1,161.56`, `₹12,450.00`; never an ungrouped four-digit rupee value or a continental decimal comma.
- **Gurmukhi:** `apps/desktop/src/locales/pa.json` contains **33 exact phrase mappings**, including `Sale saved on this PC`, `Cash received`, `Customer credit`, `Search items for sale`, `Review sale`, `Confirm sale`, `Retry same sale`, `Subtotal: {{0}} · Tax: {{1}}`, `Saved total: {{0}}`. The older Punjabi browser preview’s mixed English strings therefore do **not** prove the source lacks translations. `verify-i18n.mjs` reported 22 web catalogues covering 2,751 phrases; that is separate from the desktop receipt catalogue.
- **Shaping limitation:** Pillow’s basic layout engine performs glyph coverage but not full complex Gurmukhi shaping. The source-grounded browser HTML uses the original OFL WOFF2. Physical 58/80 mm/A4 Gurmukhi print output remains an untested hardware gate.
- **Mixed script:** W2 and W5 include Gurmukhi + English content; long product/customer names wrap rather than truncate money columns. Devanagari/Hindi script rendering is not claimed in the static PNGs.

---

## 8. Accessibility and interaction review — WCAG 2.2 AA target

| Area | Prototype treatment | Production gate still required |
|---|---|---|
| Focus | 2px `#246B65` ring on search/input; visible for keyboard and mouse | UIA names and focus order in WebView2 |
| Contrast | Normal text ≥4.5:1; large text and UI boundaries ≥3:1 | Windows High Contrast / `forced-colors: active` |
| Targets | Primary buttons 40–44px; dense rows 30–44px | 44×44 CSS px for primary/destructive/touch-capable controls |
| Semantics | One app shell, labelled navigation implied, one H1 per view in text | Real DOM: `main`, `nav`, `h1`, `aria-current`, `table scope`, `label for`, `role=alert/status` |
| Errors | Text + icon + shape; financial errors persist | Programmatic association and focus to first invalid control |
| Text scaling | 125% scaling PNG check; 200% browser zoom not physically rendered | 200% zoom / 150% Windows scaling on hardware |
| Reduced motion | No animation in PNGs; `prototype.css` honours `prefers-reduced-motion` | Preserve existing CSS motion rule |
| Screen readers | Control names intentionally familiar | Do not rename `Confirm sale`, `Saved invoice ID`, `Retry same sale`, `Print saved receipt` without coordinated test updates |

---

## 9. Financial workflow equivalence and limitations

Both directions preserve the same **conceptual** workflow: search → exact SKU → cart → customer/tender → review → native confirm → saved receipt / uncertain retry. The prototype is a static picture; it cannot execute or weaken the following production invariants: integer-paise `BigInt`, exact split equality, native credit/role authority, stable `operationId`, F8 same-ID retry, repeated-submit/stale-read guards, review-before-post/Escape/focus restoration, print snapshot reauthorization, `productionSyncEnabled=false`, `SCHEMA_VERSION=12`, and GST non-claim.

**Known prototype limitations:** not interactive cashier software; no real barcode scanner; no WebView2/UIA; no physical DPI or High Contrast test; no installed-app screenshot; no real financial posting; no real customer data. Direction B at 125% intentionally hides `Find saved receipt` and the tip to keep total/confirm visible — this is a design decision, not a production behaviour.

---

## 10. Verdict

**Windows prototype readiness: READY FOR FOUNDER DESIGN REVIEW.** Two genuinely different directions, W1–W7, four required viewport sizes, 125% scaling, side-by-side comparisons and a navigable preview exist. **Production UI implementation readiness: NOT AUTHORIZED** until the founder chooses a direction and records approval.
