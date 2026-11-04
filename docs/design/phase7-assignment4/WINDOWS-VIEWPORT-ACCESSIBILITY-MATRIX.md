# WINDOWS VIEWPORT & ACCESSIBILITY MATRIX

**SORNIO — Phase 7 / Assignment 4** · Layout and accessibility preflight.
**Date:** 2026-11-04 (UTC). **Production files modified:** none.

---

## 1. Method — what is measured, what is predicted, what is blocked

| Evidence type | Definition | Available here? |
|---|---|---|
| **RUNTIME MEASUREMENT (installed)** | WebView2 / installed Tauri app at real DPI | **No** — no Windows host, no WebView2, no display |
| **RUNTIME MEASUREMENT (browser)** | Chromium at a CSS viewport with mocked IPC | **No** — Playwright and a browser binary are not installed; installing them would add tooling and still not satisfy installed-app acceptance |
| **COMPUTED FROM SOURCE** | WCAG 2.2 arithmetic and CSS geometry derived from the actual stylesheet | **Yes — executed in this assignment, reproducible** |
| **PREDICTION** | Reasoned expectation without arithmetic | Avoided wherever a computation was possible |

Everything numeric below is **COMPUTED FROM SOURCE** unless explicitly labelled otherwise. Nothing
here is an installed-application measurement, and the viewport gate therefore cannot pass.

Sources: `apps/desktop/src/style.css` (12,489 bytes, 39 minified lines), `apps/desktop/src/main.tsx`,
`apps/desktop/src/CheckoutPanel.tsx`, `apps/desktop/index.html`.

---

## 2. Computed layout geometry

Inputs from source: `.desktop-shell{grid-template-columns:238px 1fr}`; `.page{max-width:1320px;
padding:36px 42px 60px}`; `.workspace-grid{grid-template-columns:minmax(0,1fr) 265px;gap:24px}`;
`.topbar{height:73px}`; breakpoints `1100px` (rail→200px, `.page` padding→28px, side panel hidden),
`850px` (inventory forms 1 column), `680px` (block layout, rail becomes a strip), `480px`.

Effective CSS viewport width = physical width ÷ DPI scale.

| Configuration | Effective CSS viewport | Rail | Main column | Page content | Grid main col | Side panel |
|---|---|---|---|---|---|---|
| 1280×720 @100% | 1280×720 | 238 | 1042 | 958 | 669 | 265 |
| 1366×768 @100% | 1366×768 | 238 | 1128 | 1044 | 755 | 265 |
| 1600×900 @100% | 1600×900 | 238 | 1362 | **1236** (1320 cap) | 947 | 265 |
| 1920×1080 @100% | 1920×1080 | 238 | 1682 | **1236** (1320 cap) | 947 | 265 |
| 1280×720 @125% | **1024×576** | 200 | 824 | 768 | 768 | hidden |
| 1366×768 @125% | **1093×614** | 200 | 893 | 837 | 837 | hidden |
| 1280×720 @150% | **853×480** | 200 | 653 | 597 | 597 | hidden |

Observations that follow arithmetically:

1. **The basis caps at 1320px.** Above 1600px the workspace stops growing; 1920 wastes 600px of
   horizontal space. Direction A's dense workspace does not benefit from extra width — a design
   constraint to resolve in U6, not a bug.
2. **125% scaling crosses the 1100px breakpoint at 1280 and 1366.** Both commonly-used shop
   resolutions therefore drop into the compressed variant: 200px rail, hidden side panel, tighter
   padding. Any U1+U3 design that assumes the wide layout at 1280×720 will be wrong at 125% DPI.
3. **At 150% (853×480 CSS) the content column is 597px** with 379px of usable vertical space below
   the top bar. This is below any viewport floor specified in Assignment 3 — see §6.

---

## 3. Vertical space and the persistence finding

Usable height below the top bar and page top padding (computed):

| Configuration | CSS height | Usable below topbar + padding |
|---|---|---|
| 1280×720 @100% | 720 | 611 |
| 1366×768 @100% | 768 | 659 |
| 1600×900 @100% | 900 | 791 |
| 1920×1080 @100% | 1080 | 971 |
| 1280×720 @125% | 576 | **475** |
| 1366×768 @125% | 614 | 513 |
| 1280×720 @150% | 480 | **379** |

### 3.1 There is no persistent region anywhere in the app

`grep -o "position:[a-z]*" src/style.css` returns **zero matches**. The stylesheet contains **no
`position` declarations at all** — no `sticky`, no `fixed`, no `absolute`, no `relative`.

This is a *verified structural fact*, not an inference, and it settles several open questions at once:

- The navigation rail is a grid item inside `.desktop-shell{min-height:100vh}`. When content exceeds
  the viewport the document grows and **the rail scrolls away with the page**. There is no fixed
  navigation.
- The totals block and the "Confirm sale" control are ordinary in-flow content, so **no totals or
  confirmation control is persistent at any viewport or DPI**.
- Scroll ownership is a single document scroll. Only three regions scroll internally
  (`overflow:auto` ×3: `.checkout-results` max-height 260px, `.inventory-list` max-height 520px,
  `.saved-copies` max-height 480px).

### 3.2 Consequence for confirmation visibility

In DOM order, `CheckoutPanel` is the **third** block inside `.page` (after the heading and the status
panel — `main.tsx:163-165`), and "Confirm sale" is the **last** interactive element of that panel
(`CheckoutPanel.tsx:546`). Above it sit the balances line, saved-receipts list, receipt lookup,
product search, results list, cart list, tax/tender/customer inputs, and the review summary.

Because nothing is pinned, the distance from the top of the checkout panel to "Confirm sale" is
bounded only by cart length. At 475px of usable height (125% DPI on 720p) even an empty cart cannot
show heading → cart → review → confirm together.

**What this proves without a runtime:** there is no mechanism by which confirmation can stay visible
during scrolling, at any configuration. **What it does not prove:** the exact pixel offset at which
"Confirm sale" falls below the fold for a given cart size — that requires a runtime measurement and
is **BLOCKED** (§6).

This is the strongest single justification for Direction A's persistent payment panel, now with a
verifiable mechanism rather than an assertion.

---

## 4. Contrast audit — independent recomputation

Recomputed with the WCAG 2.2 relative-luminance formula (`(L1+0.05)/(L2+0.05)`, sRGB linearisation at
the 0.04045 knee) rather than trusting either Assignment 3 or the stylesheet.

### 4.1 Proposed Direction A tokens (D2 re-verification)

| Pair | Computed | Required | Result vs D2 claim |
|---|---|---|---|
| White on nav `#182333` | 15.82:1 | 4.5 | MATCH |
| White on nav-selected `#243449` | 12.63:1 | 4.5 | MATCH |
| `#182333` on white | 15.82:1 | 4.5 | MATCH |
| `#182333` on app bg `#F7F8FA` | **14.89:1** | 4.5 | claim 15.03 — Δ0.14 (rounding) |
| `#667085` on white | 4.97:1 | 4.5 | MATCH |
| `#667085` on app bg | 4.68:1 | 4.5 | MATCH |
| `#52606D` on soft accent `#E7EEE9` | 5.47:1 | 4.5 | MATCH |
| `#7A8699` on disabled fill `#D6DEDD` | **2.69:1** | 3.0 | **claim 3.64 — WRONG (see §4.3, CORR-1)** |
| `#7A8699` on white | 3.69:1 | 3.0 | MATCH |
| `#7A8699` on app bg | 3.47:1 | 3.0 | MATCH |
| `#246B65` on white | 6.24:1 | 3.0 | MATCH |
| `#246B65` on app bg | 5.87:1 | 3.0 | MATCH |
| `#7BC2B7` on nav | 7.72:1 | 3.0 | MATCH |
| White on `#246B65` | 6.24:1 | 4.5 | MATCH |
| White on hover `#1D5A55` | 7.94:1 | 4.5 | MATCH |
| White on pressed `#164A46` | 9.99:1 | 4.5 | MATCH |
| `#1B6E4A` on `#E7F4EC` | 5.49:1 | 4.5 | MATCH |
| `#1B6E4A` on white | 6.22:1 | 4.5 | MATCH |
| `#8A5A00` on `#FFF4D6` | 5.41:1 | 4.5 | MATCH |
| `#A4262C` on `#FDECEC` | 6.36:1 | 4.5 | MATCH |
| `#7A3E00` on `#FFF1DE` | 7.51:1 | 4.5 | MATCH |
| `#6B4E00` on `#FFF4D6` | 7.06:1 | 4.5 | MATCH |
| `#2C5E8A` on `#EAF2FA` | 6.04:1 | 4.5 | new (not previously computed) |
| `#33415C` on `#E9EDF5` | 8.72:1 | 4.5 | new |
| `#C7D0DC` on nav | 10.16:1 | 4.5 | new |
| Soft accent vs white | 1.18:1 | — | claim 1.15 — Δ0.03; confirms "never sole cue" |

**25 of 26 pairs meet their threshold; 1 does not (disabled text, exempt-by-spec — §4.3).** The
Direction A palette is sound. The one wrong figure is corrected in D2 via an errata note.

### 4.2 Current production stylesheet (measured against the shipped colours)

| Pair | Computed | Required | Result |
|---|---|---|---|---|
| `--muted` `#6c7584` on white | 4.65:1 | 4.5 | PASS |
| `--muted` `#6c7584` on app bg `#f5f6f7` | **4.30:1** | 4.5 | **FAIL — new defect DEF-7** |
| Body `#253244` on app bg | 11.99:1 | 4.5 | PASS |
| White on button `#304d70` | 8.67:1 | 4.5 | PASS |
| `.selected` `#294969` on `#eaf0f7` | 8.13:1 | 4.5 | PASS |
| Focus `#829fce` on white | **2.69:1** | 3.0 | **FAIL — DEF-1 (already recorded)** |
| Focus `#829fce` on app bg `#f5f6f7` | **2.49:1** | 3.0 | **FAIL — new defect DEF-8** |
| Dark: `#e2e8f1` on `#161d27` | 13.76:1 | 4.5 | PASS |
| Dark: `--muted` `#9aa9ba` on `#161d27` | 7.07:1 | 4.5 | PASS |
| Dark: `#142135` on `#8eadd2` | 6.97:1 | 4.5 | PASS |
| Dark: `.selected` `#d1e2f7` on `#2d3c50` | 8.50:1 | 4.5 | PASS |
| Dark: focus `#829fce` on `#161d27` | 6.29:1 | 3.0 | PASS |

**10 of 13 meet threshold; 3 fail.**

### 4.3 Findings requiring action

**CORR-1 — D2 disabled-token figure was wrong.** `#7A8699` on `#D6DEDD` is **2.69:1**, not 3.64:1.
WCAG explicitly exempts *inactive* UI components from 1.4.3/1.4.11, so a truly disabled control is
not a conformance failure — but the token must never carry meaning. Corrected in D2 with an errata
note; implementation must pair it with `aria-disabled` plus a non-colour cue.

**DEF-7 (new) — secondary text fails AA on the app canvas.** `--muted` `#6c7584` on `#f5f6f7` is
**4.30:1**, below the 4.5:1 requirement for normal text. It is used for `.muted` (12px), `.eyebrow`
(10px), `.rail-bottom` (11px), `.status-panel p` (11px), `.form-footer p` (10px), `.intro` (12px),
`.history-notice` (11px), `.copy-note` (12px) and more — all **normal-size** text, so the 4.5:1
requirement applies with no large-text relief. This is a live accessibility defect in production that
Assignment 3 did not record. `color.text.secondary #667085` on `#F7F8FA` = 4.68:1 fixes it.

**DEF-8 (new) — the focus ring is worse off white.** `#829fce` on the app canvas `#f5f6f7` is
**2.49:1**, not the 2.69:1 recorded for white surfaces. Since the ring is drawn *outside* the control
(`outline-offset:4px`), the adjacent background — not the control's own fill — determines the ratio.
On panels the ring sits partly over white (2.69:1); on the app canvas it is 2.49:1. Both fail the
3:1 non-text requirement; the defect is marginally worse than recorded, and the fix
(`color.focus.ring #246B65` = 6.24:1 white / 5.87:1 app bg) is unchanged.

**Dark-mode nuance.** Every dark-mode pair measured here passes (6.29–13.76:1). Assignment 3
characterised dark mode as a *contrast* risk; the measurements do not support that. The real dark-mode
risk is **semantic inversion of financial surfaces** (a red error tint on a dark canvas, a "success"
green judged against a different background) plus the fact that `prefers-color-scheme` currently
inverts the whole app with no per-token review. Recommendations in D2 §7 stand, but the rationale
should be corrected from "contrast" to "semantic-state inversion". Founder decision O-1 is unchanged.

---

## 5. Per-viewport matrix (assignment §4 checklist)

| Requirement | Status | Evidence |
|---|---|---|
| 1280×720 baseline | **COMPUTED** (geometry, §2); **BLOCKED** (runtime) | Arithmetic confirms 958px content, 669px grid column, 611px fold |
| 1366×768 | **COMPUTED**; **BLOCKED** (runtime) | 1044px content, 659px fold |
| 1600×900 | **COMPUTED**; **BLOCKED** (runtime) | 1236px content (cap reached), 791px fold |
| 1920×1080 | **COMPUTED**; **BLOCKED** (runtime) | Same 1236px content as 1600 — cap |
| 125% DPI | **COMPUTED**; **BLOCKED** (runtime) | 1024×576 CSS; crosses the 1100px breakpoint |
| 150% DPI | **COMPUTED only**; **BLOCKED** | 853×480 CSS, 597px column, 379px fold — below any stated floor |
| Punjabi/Gurmukhi rendering | **ASSET VERIFIED**; **BLOCKED** (pixels) | `public/fonts/noto-sans-gurmukhi.woff2` present (11,400 B) with `NotoSansGurmukhi-OFL.txt`; `@font-face` + `unicode-range` correct; `lang="pa"` catalogue `src/locales/pa.json` (4,370 B) |
| Keyboard focus visibility | **COMPUTED FAIL**; **BLOCKED** (runtime) | DEF-1/§4.2: ring 2.49–2.69:1 |
| Checkout confirmation visibility | **COMPUTED STRUCTURAL**; **BLOCKED** (pixels) | §3.1–3.2: zero positioned elements |
| Persistent totals / payment panel | **COMPUTED ABSENT**; **BLOCKED** | §3.1: no persistence mechanism exists |
| Scrolling and overflow | **COMPUTED**; **BLOCKED** | One document scroll; 3 internal `overflow:auto` regions |
| Windows High Contrast | **BLOCKED** | No `forced-colors` handling in CSS; no capture (M1); untestable here |
| Reduced motion | **COMPUTED PRESENT**; **BLOCKED** | `@media(prefers-reduced-motion:reduce)` disables animation/transition; no runtime proof |

---

## 6. Viewport floor determination (new)

Arithmetic yields a concrete recommendation:

- At **125%** on 1280×720 the content column is **768px** and the fold 475px — tight but workable.
- At **150%** on 1280×720 the column is **597px** and the fold **379px**. At that size a
  cart + review + confirmation cannot coexist without an aggressive compact mode.

**Proposal (for founder decision, not implementation):** declare **1024×576 CSS (1280×720 @125%) as
the supported V1 floor** and treat 150% at 1280×720 as *best-effort, not certified*. This matches
Assignment 3's floor, now with arithmetic behind it, and should be written into U6's acceptance
criteria. It does **not** authorise skipping the measurement — the floor still has to be measured
once a WebView2 host exists.

Related: the Tauri minimum window size in Assignment 3's contract (760×580) is **not** visible in
this stylesheet. `index.html` has no size constraints; the window minimum lives in Tauri
configuration. It must be re-verified in U6 rather than assumed.

---

## 7. Verdict

| Item | Verdict |
|---|---|
| Layout geometry computed and reproducible | **PASS** |
| Persistence/confirmation-visibility mechanism determined | **PASS (computed)** |
| Contrast of proposed Direction A tokens | **PASS** for 25/26; 1 corrected (WCAG-exempt case) |
| Production contrast conformance | **FAIL** — 3 pairs below threshold (DEF-1, DEF-7, DEF-8) |
| Runtime measurement at any viewport or DPI | **BLOCKED** |
| Windows High Contrast behaviour | **BLOCKED** |
| **Gate A4 overall** | **BLOCKED** (blocked runtime items dominate; computed work is complete) |
