# SORNIO — Phase 7 Design System: PRECISION WORKSPACE

**Status:** proposed specification only. No CSS, Tailwind configuration, production component, font asset, runtime dependency or application behavior is changed by this document.

**Audit source:** `97b6899475cc3dfa3ff1370f59373401646eecfb` (PR #145 integration head; code parent of current `main`).
**Primary platform:** Windows desktop, offline-first, `productionSyncEnabled=false`.
**Companion documents:** `PHASE-7-WINDOWS-UX-AUDIT.md`, `PHASE-7-CASHIER-WORKSPACE-BLUEPRINT.md`, `PHASE-7-ADAPTIVE-WORKSPACE-CONCEPT.md`, `PHASE-7-IMPLEMENTATION-ROADMAP.md`.

---

## 1. Design philosophy

> **The website must impress. The application must help people work.**

Sornio's desktop application is an all-day financial instrument, not a marketing canvas. The proposed direction is **PRECISION WORKSPACE**: premium, minimal, serious, effortless and reliable.

| Principle | Defensible usability benefit | Rejected alternative |
|---|---|---|
| Light-first operational surfaces | Higher legibility in bright shops and on low-cost TN panels; less adaptation cost when printing or comparing paper receipts. | Cinematic dark website styling; automatic dark inversion of financial tables. |
| Deep charcoal navigation | Separates global orientation from working surfaces without adding another colour to financial data. | A permanently coloured/accent sidebar that competes with totals and status. |
| Soft neutral surfaces and restrained accent | Accent is reserved for the primary action, focus and selection; financial status is not decorative. | Gradients, glass, glows, animated backgrounds, noisy dashboards. |
| Strong typography and tabular numbers | Reduces misreading of `₹1,000.00`, `₹600.00`, `₹400.00` and long product names. | Decorative display type in operational screens; proportional figures in money columns. |
| Disciplined geometry | Predictable control boundaries and alignment lower scanning effort across modules. | Per-screen radii, arbitrary padding and oversized 24px cards. |
| Compact data where necessary | Long catalogs and ledgers remain usable without hiding financial actions. | A generic analytics dashboard with unnecessary metric cards. |
| Immediate, subtle feedback | A cashier knows a key press was received without waiting for an animation. | Success animations that delay or obscure posting results. |
| Text + icon + shape for status | Works for colour-vision deficiency, high contrast, photocopies and thermal print. | Colour-only cash/credit/pending/error meaning. |
| Offline and low-end practicality | No cloud font/image fetch, no GPU effects, no large chart runtime in the cashier path. | Web-only components that require network or heavy rendering. |

The existing `docs/SORNIO-DESIGN-SYSTEM.md`, `docs/SORNIO-VISUAL-SYSTEM.md`, `lib/theme/palettes.json` and `packages/mobile-design/src/tokens.ts` remain the sources for brand/web/companion themes. This document defines a **desktop semantic layer** that can later map to those systems; it does not erase or duplicate their useful prior work.

---

## 2. Colour system

### 2.1 Assessment of the founder's starting candidates

Contrast ratios below were computed with the WCAG relative-luminance formula. AA targets: ≥4.5:1 for normal text, ≥3:1 for large text and non-text UI boundaries/focus indicators.

| Candidate role | Value | On / with | Ratio | Assessment |
|---|---|---|---:|---|
| App background | `#F7F8FA` | — | — | Keep as `color.bg.app`. |
| Surface | `#FFFFFF` | — | — | Keep as `color.surface.default`. |
| Navigation | `#182333` | `#FFFFFF` text | 15.82:1 | Keep; deep but not pure black. |
| Primary text | `#182333` | `#FFFFFF` | 15.82:1 | Keep. |
| Secondary text | `#667085` | `#FFFFFF` | 4.97:1 | Keep on white/app background. |
| Secondary text | `#667085` | `#F7F8FA` | 4.68:1 | Keep, but avoid on soft accent. |
| Secondary text | `#667085` | `#E7EEE9` | 4.22:1 | **Reject on soft accent**; use `#52606D` (5.47:1) there. |
| Primary accent | `#246B65` | `#FFFFFF` | 6.24:1 | Keep; AA for text, links, focus and primary fill. |
| Primary accent | `#246B65` | `#F7F8FA` | 5.87:1 | Keep. |
| White on accent | `#FFFFFF` | `#246B65` | 6.24:1 | Keep for primary button label. |
| Soft accent | `#E7EEE9` | `#246B65` | 5.29:1 | Use only as a surface; add a `1px #246B65` edge or text label when it conveys selection. |
| Current focus ring | `#829fce` | `#FFFFFF` | 2.69:1 | **Replace**; fails AA non-text contrast. |

### 2.2 Proposed semantic tokens

CSS names are illustrative only; no stylesheet is modified in this assignment.

```css
/* Illustrative proposed token contract — NOT IMPLEMENTED */
:root {
  color-scheme: light;
  --color-bg-app: #F7F8FA;
  --color-bg-subtle: #F1F3F5;
  --color-surface-default: #FFFFFF;
  --color-surface-raised: #FFFFFF;
  --color-surface-soft-accent: #E7EEE9;
  --color-nav: #182333;
  --color-nav-selected: #243449;
  --color-nav-text: #FFFFFF;
  --color-nav-text-muted: #C7D0DC;
  --color-text-primary: #182333;
  --color-text-secondary: #667085;
  --color-text-on-soft-accent: #52606D;
  --color-text-on-accent: #FFFFFF;
  --color-text-disabled: #7A8699;
  --color-border-subtle: #D8DEE6;
  --color-border-control: #7A8699;       /* 3.69:1 on white, 3.47:1 on app bg */
  --color-border-strong: #667085;
  --color-divider: #E4E7EC;
  --color-focus-ring: #246B65;           /* 6.24:1 on white */
  --color-focus-ring-on-nav: #7BC2B7;    /* 7.72:1 on nav */
  --color-action-primary: #246B65;
  --color-action-primary-hover: #1D5A55;
  --color-action-primary-pressed: #164A46;
  --color-action-secondary-surface: #FFFFFF;
  --color-action-secondary-text: #246B65;
  --color-action-secondary-border: #A8C1BD;
  --color-action-disabled-surface: #D6DEDD;
  --color-action-disabled-text: #667085;
  --color-status-success-text: #1B6E4A;
  --color-status-success-surface: #E7F4EC;
  --color-status-warning-text: #8A5A00;
  --color-status-warning-surface: #FFF4D6;
  --color-status-error-text: #A4262C;
  --color-status-error-surface: #FDECEC;
  --color-status-debt-text: #7A3E00;
  --color-status-debt-surface: #FFF1DE;
  --color-status-pending-text: #6B4E00;
  --color-status-pending-surface: #FFF4D6;
  --color-status-confirmed-text: #1B6E4A;
  --color-status-confirmed-surface: #E7F4EC;
  --color-status-reconciliation-text: #2C5E8A;
  --color-status-reconciliation-surface: #EAF2FA;
}
```

| Semantic role | Token / value | Required states | Accessibility evidence |
|---|---|---|---|
| App background | `bg.app #F7F8FA` | static | Neutral canvas; no text directly on it below 4.5:1. |
| Surface layers | `surface.default #FFFFFF`; `surface.raised #FFFFFF` + shadow; `surface.softAccent #E7EEE9` | default, hover, selected | Soft accent alone is 1.15:1 against white; never the sole selection cue. |
| Text hierarchy | primary `#182333`, secondary `#667085`, on soft accent `#52606D`, on nav `#FFFFFF`/`#C7D0DC` | default, disabled | 15.82, 4.97, 5.47 and 15.82:1 respectively on intended surfaces. |
| Borders | subtle `#D8DEE6`, control `#7A8699`, strong `#667085`, divider `#E4E7EC` | default, hover, focus, error | Control border is ≥3:1 on white/app; subtle borders are decorative only. |
| Focus rings | `#246B65` on light, `#7BC2B7` on nav | focus-visible, forced-colors | 6.24:1 / 7.72:1; 2–3px solid outline + 2px offset. |
| Primary action | `#246B65` → hover `#1D5A55` → pressed `#164A46` → disabled `#D6DEDD`/`#667085` | hover, focus, pressed, disabled, busy | White label ratios 6.24 / 7.94 / 9.99:1. Disabled text 3.64:1 on disabled fill; disabled controls are also `aria-disabled` and non-interactive. |
| Secondary action | white surface, `#246B65` text, `#A8C1BD` border | hover `#F1F7F5`, focus, pressed `#E7EEE9` | Text 6.24:1; border is supplemented by text and shape. |
| Selected navigation | `#243449` surface, `#FFFFFF` text, 3px `#7BC2B7` left marker | selected, hover, focus | 12.63:1 text; marker 7.72:1 on nav. |
| Success / confirmed payment | text `#1B6E4A`, surface `#E7F4EC` | default | 6.22:1 on white, 5.49:1 on tinted surface. |
| Warning / pending payment | text `#8A5A00` or `#6B4E00`, surface `#FFF4D6` | default | 5.41 / 7.06:1 on tinted surface. |
| Error / refused | text `#A4262C`, surface `#FDECEC` | default | 6.36:1 on tinted surface. |
| Customer debt / credit outstanding | text `#7A3E00`, surface `#FFF1DE` | default | 7.51:1 on tinted surface. |
| Financial reconciliation | text `#2C5E8A`, surface `#EAF2FA` | default | 6.04:1 on tinted surface. |
| Disabled controls | surface `#D6DEDD`, text `#667085`, border `#B8C4C1` | disabled | 3.64:1 text on fill; shape and `disabled` state also communicate. |

### 2.3 Status must never be colour alone

| Meaning | Required text | Icon / shape | Example |
|---|---|---|---|
| Cash recorded | `Cash recorded` | solid circle `●` | `● Cash recorded ₹600.00` |
| UPI / card pending | `Pending — unverified` | hollow circle `○` + dashed outline | `○ UPI pending — unverified ₹50.00` |
| Customer credit / debt | `Customer credit — outstanding` | outline tag `▢` | `▢ Customer credit — outstanding ₹400.00` |
| Confirmed / saved sale | `Sale saved on this PC` | check `✓` in a square | `✓ Sale saved on this PC` |
| Uncertain result | `Result uncertain — retry same sale` | warning triangle `△` | `△ Result uncertain — retry same sale` |
| Refused | `Refused — edit this sale` | octagon-ish `⛔` shape | `⛔ Refused — edit this sale` |
| Reconciliation variance | `Variance -₹0.01` | signed `+`/`-` and explanation | `Variance -₹0.01 · counted less than expected` |

### 2.4 Dark / high-contrast policy

- The operational desktop app should declare `color-scheme: light` and **not automatically invert financial surfaces** on `prefers-color-scheme: dark`. The current `style.css:6` dark block is a candidate for future removal or replacement by a fully reviewed dark token set.
- A founder-approved dark theme, if ever added, must provide a complete contrast table and preserve the same text/icon/shape status encoding.
- `@media (forced-colors: active)` must use system colours (`Canvas`, `CanvasText`, `Highlight`, `HighlightText`, `ButtonText`, `GrayText`), a `Highlight` focus outline, and must not rely on box shadows or background images. No custom colour may be required to understand a financial state.

---

## 3. Typography

### 3.1 Font stack and licensing

Proposed stack:

```css
/* Illustrative only — NOT IMPLEMENTED */
font-family: "Segoe UI Variable", "Segoe UI", Inter, system-ui,
             "Nirmala UI", "Noto Sans Gurmukhi", "Sornio Gurmukhi",
             sans-serif;
```

- `Segoe UI Variable` / `Segoe UI` are Windows system fonts; no new licence or network fetch is required.
- `Inter` is already a root web dependency; verify its packaged licence before extending it to the desktop bundle. Do not introduce a proprietary font without written licence verification.
- Gurmukhi fallback uses Windows `Nirmala UI` / `Raavi` and the already bundled `noto-sans-gurmukhi.woff2` under **SIL Open Font License 1.1** (`apps/desktop/public/fonts/NotoSansGurmukhi-OFL.txt`).
- Mixed-script line height must be at least `1.5` with `overflow-wrap:anywhere` for product/customer names and extra inline start padding for Gurmukhi matras. The committed Punjabi browser preview shows why this is necessary.
- `font-synthesis: none` is already set; preserve it so faux bold does not distort Gurmukhi.

### 3.2 Type scale

| Role | Size / line-height | Weight | Notes |
|---|---|---|---|
| Page heading | 24 / 32 px | 600 | One per workspace view; no marketing H1 in counter path. |
| Section heading | 18 / 24 px | 600 | Panel and drawer titles. |
| Body | 14 / 20 px | 400 | Minimum for all-day work; replaces current 12px body. |
| Small / metadata | 12 / 16 px | 400–500 | Timestamps, revision, helper text; never primary financial values. |
| Input label | 12 / 16 px | 600 | Always associated with its control. |
| Button label | 14 / 20 px | 600 | No 10/11px action labels. |
| Table heading | 12 / 16 px | 600 | `scope` attributes, restrained letter-spacing, not uppercase-only for Gurmukhi. |
| Numerical value | 14 / 20 px | 500 | `font-variant-numeric: tabular-nums lining-nums`. |
| Monetary column | 14 / 20 px, right aligned | 500 | Always `₹` + en-IN grouping + two decimals. |
| Invoice total | 24 / 32 px | 600 | `₹1,000.00`, tabular, never truncated. |
| Receipt total | 16 / 24 px print | 600 | 80mm/58mm print scale may be smaller but must remain legible and grouped. |

All amounts continue to be produced by `money(paise: number|string)` using `BigInt` and `Intl.NumberFormat('en-IN')`. UI redesign must never divide paise by 100 with floating point, never use `toLocaleString()` on a JS number for a persisted balance, and never replace `₹1,000.00` with `₹1000` / `1000.00`.

---

## 4. Spacing

| Token | Value | Intended use |
|---|---:|---|
| `space.0` | 0 | flush table cells / icon alignment |
| `space.1` | 4 | icon-label gap, compact chip padding |
| `space.2` | 8 | control internal gaps, status icon gap |
| `space.3` | 12 | form label-to-control, button gaps |
| `space.4` | 16 | toolbar spacing, card padding compact, grid gaps at 1280 |
| `space.5` | 20 | comfortable control padding |
| `space.6` | 24 | form sections, panel padding, modal padding |
| `space.8` | 32 | workspace gutters at 1600, section separation |
| `space.10` | 40 | page gutters at 1920, large modal padding |
| `space.16` | 64 | maximum empty-state / setup spacing |

| Area | Comfortable | Compact |
|---|---|---|
| Sidebar padding | 20px horizontal / 24px vertical | 12px / 16px |
| Toolbar spacing | 16px between groups | 8px |
| Form sections | 24px | 16px |
| Tables | 44px row height, 12px cell padding | 36px row height, 8px cell padding |
| Modals | 32px padding | 24px |
| Buttons | 44px height, 16px horizontal padding | 36px height, 12px |
| Invoice / payment panel | 24px padding, 16px between rows | 16px, 8px |
| Dashboard / content | 24–32px | 16px |
| Responsive gutters | 16px @1280, 24px @1366, 32px @1600, 40px @1920 | 12/16/24/32px |

---

## 5. Geometry

| Element | Proposed geometry | Rationale |
|---|---|---|
| Border radius | inputs/buttons 6px; cards/panels 10px; modals 12px; chips 999px | Disciplined, not the current mixed 12/13/19/24/28/30px. |
| Button height | 44px comfortable / 36px compact, min-width 88px | Reaches the existing mobile `touch: 44` token; larger primary confirm 48px. |
| Input height | 40px comfortable / 36px compact | Consistent with button height and Windows conventions. |
| Card / panel | 1px `#D8DEE6` border, 10px radius, no gradient | Flat surface for financial data. |
| Table row | 44px / 36px, 1px `#E4E7EC` divider | Predictable scanning. |
| Modal / drawer | 480px (confirm), 640px (form), 800px (table), max 90vw | No full-screen modal for routine checkout. |
| Shadows | raised `0 1px 2px rgba(16,24,40,.06)`; modal `0 12px 32px rgba(16,24,40,.14)` | Subtle depth only; no glass/glow. |
| Borders | 1px control `#7A8699`; error 2px `#A4262C`; focus 2–3px ring | Boundaries and focus meet non-text contrast. |
| Dividers | 1px `#E4E7EC` | Decorative only. |
| Sidebar | 216px expanded / 64px icon rail / 48px at effective ≤1024 CSS px | Keeps labels readable without stealing 1280px checkout width. |
| Right checkout panel | 360–420px depending on viewport | Confirms/allocations remain visible. |
| Print | `@page` 58mm→52mm, 80mm→74mm, A4→12mm margins | Preserves the current `receipt-print.ts` print contract; print CSS is screen-independent. |

---

## 6. Motion

| Interaction | Target duration | Behavior |
|---|---:|---|
| Button pressed feedback | 0–90ms | Background/border change only; no scale/lift that moves the pointer target. |
| Focus ring | 0–80ms | Opacity/colour transition; ring is never absent. |
| Hover | 0–90ms | Surface/border change; no transform. |
| Modal / drawer entrance | 100–140ms | Opacity + ≤4px translate; no layout-affecting animation. |
| Navigation view change | 0–100ms | Cross-fade or instant; no sliding carousel. |
| Toast / status banner | instant appearance, ≥5s or until acknowledged | No auto-dismiss for financial errors. |
| Transaction completion | **no celebratory animation** | State text and receipt appear immediately; result is never delayed or obscured. |
| Reduced motion | 0ms | `@media(prefers-reduced-motion:reduce)` removes all transitions/animations and respects the existing pattern. |

No continuous animation, parallax, gradient shimmer, number-counting animation, or WebGL/canvas effect belongs in the cashier path.

---

## 7. Density modes (for consideration only; not implemented)

| Mode | Row / control height | When it helps | Risk |
|---|---|---|---|
| Comfortable | 44px rows, 40px inputs, 24px panel padding | New staff, touch screens, 125–150% Windows scaling, high-glare environments, training. | Fewer rows visible; more scrolling in long catalogs. |
| Compact | 36px rows, 36px inputs, 16px padding | Experienced keyboard cashiers, 1366×768, large carts, long ledgers. | Smaller targets; must still meet 44px for primary/destructive actions and never reduce financial text below 14px. |

Both modes use the same tokens, DOM, accessible names and calculations. Density is a presentation preference only; it must never change the number of cart lines, the operation ID, or the posting path. Default recommendation: **Comfortable** until physical operator testing says otherwise.

---

## 8. Core component specification

Dimensions use comfortable mode unless stated. `Risk` refers to future implementation against the existing UIA/Playwright contracts. Every component must preserve its current accessible name where an existing test asserts it.

| # | Component | Purpose / hierarchy | Dimensions | Required states | Accessibility / keyboard | Error handling | Reuse / risk |
|---:|---|---|---|---|---|---|---|
| 1 | Application shell | Global grid: nav, top status, main view, optional right panel. | nav 216/64px, topbar 56px, gutters per viewport | loading, locked, ready, session-locked, day-closed | landmarks `banner/navigation/main`, skip link, `aria-current` in nav | global session/day alert, focus restoration | Used by every workspace. High risk: must preserve `dirty`/`busy` coordination in `main.tsx`. |
| 2 | Sidebar navigation | Workspace orientation, not authorization. | 216px expanded / 64px icon / 48px narrow | selected, hover, focus, collapsed, disabled module hidden | `aria-current`, labelled icons, Tab order, F-keys unbound inside nav | hidden module has an explicit Admin explanation, never a dead link | Reused across views. Medium risk: hardcoded `selected` must be replaced without changing UIA names. |
| 3 | Section header | Page title, business day, one primary and secondary actions. | 56–72px tall | loading, error, permission-restricted | `h1`/`h2`, `aria-describedby` status | error summary region | Reused across modules. Low risk. |
| 4 | Button | Primary, secondary, quiet, danger. | 44px / compact 36px; min 88px | default, hover, focus, pressed, busy, disabled, destructive confirm | native `<button>`, `aria-busy`, `aria-disabled`, Enter/Space, visible focus | never disabled without an explanation; destructive requires explicit label | Single primitive. High risk if labels change: pywinauto uses exact names. |
| 5 | Input | Text, numeric, password, search, date. | 40px, 6px radius | default, focus, filled, invalid, disabled, readOnly, busy | `<label for>`, `aria-invalid`, `aria-describedby`, `inputMode`, autocomplete | inline message + focus to first invalid | Reused. Medium risk: preserve IDs such as `checkout-search`, `sale-quantity-*`, `saved-invoice-id`. |
| 6 | Search field | Product/customer/invoice lookup. | 44px, leading search icon, clear action | empty, typing, results, no results, loading, error | `type=search`, `role=searchbox` semantics via label, Enter handling, Escape clear | `No matching items` empty state, never silent | Reused across checkout/inventory/customers/receipts. High risk: preserve exact-SKU priority and scanner guards. |
| 7 | Select menu | Bounded choices: unit, tender, language, paper, role. | 40px | default, focus, open, selected, disabled | native `<select>`, label, keyboard arrow/Enter | invalid selection message | Reused. Low risk; keep exact option labels until tests are updated. |
| 8 | Combobox | Long product/customer/invoice lists with typeahead. | 40px input + listbox max 320px | empty, loading, results, no results, selected, disabled | `aria-expanded`, `aria-controls`, `aria-activedescendant`, Arrow/Enter/Escape, roving focus | no-results text, selection ambiguity error | Future replacement for raw UUID lookups. Medium risk: must not introduce a new posting path. |
| 9 | Data table | Products, cart, ledger, payments, staff. | 44/36px rows, sticky header | empty, loading, populated, selected, error, scroll | `<table>` with `scope`, caption, Tab/arrow navigation where needed, no colour-only status | inline row error + summary | Reused. Medium risk: statement print snapshot must remain stable. |
| 10 | Status indicator | Saved / pending / refused / uncertain / unverified / debt / reconciliation. | 24px chip, 12px text | each semantic state | text + icon + shape, `role=status` for the region, `aria-live` for changes | persistent for financial errors; no auto-dismiss | Reused. High value; no colour alone. |
| 11 | Financial amount display | All currency values. | 14px tabular; total 24px | normal, negative, zero, disabled, loading placeholder | `₹` + en-IN grouping + 2 decimals, `aria-label` for screen readers if needed | never show `NaN`, exponent or ungrouped amount | Reused. Critical risk: preserve `BigInt`/`money()`; no float division. |
| 12 | Customer selector | Active customer for credit or split-credit sale. | 40px combobox + 32px summary chip | none selected, selected, outstanding, limit exceeded, disabled | labelled search, `Use customer <id>`-style accessible name, Escape closes | `Customer required for credit`, `Credit limit exceeded` from native | Extends `CustomerLookup.tsx`. High risk: preserve outstanding/limit text and native validation. |
| 13 | Product selector | Barcode-ready item lookup and result rows. | 44px search + 56px two-line rows | empty, results, no results, out of stock, in cart, disabled | exact SKU/ID priority, Enter adds exact/single match, repeat/IME guards | `Choose one item`, `Out of stock`, stock-ceiling messages | Wraps existing `add()` logic. Critical risk: no new operation ID on selection. |
| 14 | Quantity input | Thousandths-of-unit entry. | 40px, right aligned, unit suffix | default, focus, invalid, over-stock, disabled | `inputMode=decimal`, label includes product+unit, `aria-describedby` stock helper | `Check quantities against available stock` | Reused. Critical risk: preserve `parseFixedDecimal(...,3)` and `sale-quantity-<index>` IDs. |
| 15 | Payment allocation control | Cash/UPI/card/credit split against one total. | 4 rows × 40px + summary | empty, partial, exact, over, invalid, credit-without-customer, disabled | labelled amounts, optional unverified references, Tab order cash→upi→card→credit, no colour-only method | `Split payment amounts must equal the invoice total exactly` | New presentation over existing `paymentAmounts`. Critical risk: exact paise sum, customer requirement, unverified labels. |
| 16 | Confirmation dialog / review group | Final review before posting or destructive action. | 480–640px, 24–32px padding | open, busy, success, refused, uncertain, cancelled | focus moves to confirm, Escape cancels, focus returns to trigger, `role=group`/`dialog` with label | explicit error and same-ID retry | Reused. Critical risk: `Confirm sale`, `Confirm credit entry`, `Confirm retail operation` names and Enter behavior. |
| 17 | Error dialog | Blocking errors requiring acknowledgement. | 480px | open, acknowledged | `role=alertdialog`, focus to heading/acknowledge, Escape only if non-destructive | full native error text, no hidden technical stack | New primitive. Medium risk: do not mask native error codes. |
| 18 | Toast notification | Non-financial confirmations only. | 320×56px | info, success, warning, dismissible | `role=status`, not focus-stealing, reduced motion | financial errors use persistent banner, not toast | New primitive. Low risk. |
| 19 | Empty state | No products/customers/receipts/history. | min 120px | empty, loading, error | heading + next action, `aria-live` when result of search | `No matching sale items`, `Your saved items will appear here` | Reused. Low risk. |
| 20 | Loading state | Native reads and posting. | inline skeleton / spinner 16px | loading, ready, failed | `aria-busy`, `role=status`, no fake progress | `Checkout could not be opened. Refresh checkout to retry.` | Reused. Medium risk: stale-read generation must remain. |
| 21 | Receipt preview | Immutable saved sale, print layout/language. | A4/58mm/80mm print widths | saved, recovered, printing, print-failed | `lang=en-IN|pa-IN`, heading focus, `Ctrl+P`, print notice | snapshot reauthorization failure → reopen receipt | Wraps `SavedInvoice.tsx`. Critical risk: print must not post; preserve snapshot check. |
| 22 | Keyboard shortcut hint | Discoverable shortcuts without clutter. | 16px inline chip or `?` popover | collapsed, open | `aria-label`, no conflict with text entry, reduced motion | none | New. Low risk; do not change bindings. |
| 23 | Permission-restricted state | Explains unavailable actions without pretending to authorize. | inline panel | hidden, restricted, locked, disabled | `aria-disabled`, explanatory text, no focus trap | `Unlock this workspace to continue` | New. Medium risk: native authority remains in Rust; UI never grants. |
| 24 | Backup / recovery notice | High-consequence point-in-time restore. | 640px section / danger zone | idle, preview verified, restoring, restored, failed, locked | explicit confirmation phrase, danger styling not colour-only, focus to first field | fail closed, lock on sensitive failure, safety backup notice | Wraps `BackupPanel.tsx`. Critical risk: preserve two-step passwords, SHA-256 preview, staff disabling and `onLocked`. |

---

## 9. States

Every interactive component must define: default, hover, focus-visible, pressed, selected, busy, disabled, invalid, empty, loading, saved, refused and uncertain where applicable. Financial states are additionally:

| State | Required visible copy | Allowed next actions | Forbidden |
|---|---|---|---|
| `Preview only` | `Preview only. The native store checks prices, stock and totals before saving.` | Edit cart, Review sale | Claiming a sale was saved |
| `Review` | `Review the items and transaction type, then confirm this sale.` | Confirm, Edit sale, Escape | Posting on Escape |
| `Busy / posting` | `Confirming sale on this PC…` | none; controls disabled | Generating a second operation ID |
| `Saved` | `Sale saved on this PC`, receipt, `Start next sale` | Print, Find receipt, Next sale | Reposting the same cart |
| `Saved — refresh failed` | `Sale was saved. Stock or balances could not be refreshed. Refresh checkout before the next sale.` | Refresh checkout | Treating the sale as failed |
| `Result uncertain` | `The sale result is uncertain. Retry the same sale; do not enter it again.` | `Retry same sale` / F8 | New operation ID, clearing cart silently |
| `Refused` | Native refusal text + `Edit refused sale` | Edit or clear refused checkpoint | Retrying a changed payload under the same ID |
| `Recovered saved invoice` | `Recovered the saved invoice from this PC.` | Start next sale | Creating a duplicate sale |

---

## 10. Responsive design and Windows performance

### 10.1 Responsive rules

- Required desktop viewports: **1280×720, 1366×768, 1600×900, 1920×1080**. Detailed cashier column math is in `PHASE-7-CASHIER-WORKSPACE-BLUEPRINT.md`.
- No horizontal scrolling for primary checkout controls at any required viewport. Internal vertical scrolling is allowed only inside product results, cart rows and ledger tables.
- Tauri minimum window remains 760×580; below ~1024 effective CSS px (e.g. 1280 physical at 125% scaling) the nav collapses to a 48px icon rail, nonessential table columns hide, and the right checkout panel narrows to 320px while total + confirm remain pinned.
- Layout uses CSS Grid/Flex and logical properties, not fixed per-screen pixel widths. Text uses rem/px that scale with browser zoom; test Windows 100/125/150% scaling explicitly.
- Print CSS is a separate root (`receipt-print.ts` already isolates `[data-sornio-print-root]`); screen density and dark/high-contrast preferences must not alter printed amounts.

### 10.2 Performance expectations — proposed targets, not measured results

The prior `docs/reviews/windows-pos-printing.md` records Linux/JSDOM timings on a 254-SKU fixture (e.g. product filtering p50 2.25ms, exact lookup 6.74ms, keyboard cart entry 22.88ms). Those are **historical measurements on a different environment**, not Windows shop-hardware benchmarks and not claims made by this assignment.

Future implementation should validate, on an ordinary Windows shop PC with no discrete GPU:

| Target | Proposed validation method |
|---|---|
| Search keystroke → visible filtered result without perceptible lag | Instrument React state update and paint on the packaged app with a 1,000-SKU synthetic catalogue; compare against a human-observed baseline, not an invented number. |
| Enter → cart row visible immediately | Installed-UI UIA timing plus screenshot at the next frame. |
| F4 → confirm focused and enabled | Existing `check-focus.cjs` / `check-checkout.cjs` keyboard assertions. |
| Confirm → saved state without duplicate posting | Existing repeated-submit burst in `check-native.py` and native idempotency tests. |
| Large cart (up to 100 lines) remains usable | Render 100-line cart; verify total/confirm stay visible and scrolling does not unmount the receipt. |
| Low-memory / low-end hardware | Run on the physical pilot PC with other shop apps open; record input latency and any WebView reload. |
| No high-performance graphics | Code review: no WebGL, canvas chart, blur/backdrop-filter, continuous animation or large image asset in the cashier path. |
| Print preparation does not block checkout | Confirm print root is isolated and `window.print()` failure leaves the saved sale unchanged. |

---

## 11. Accessibility and localization design rules

- Target **WCAG 2.2 AA** where applicable. Desktop-specific interpretation: UIA control names in WebView2, physical keyboard operation, Windows High Contrast, DPI scaling, and print output are all part of the accessible surface.
- Focus: 2–3px ring with ≥3:1 against adjacent colours, visible on every interactive element, never removed for mouse users.
- Targets: 44×44 CSS px for primary, destructive and touch-capable controls; compact 36px only for dense table row actions.
- Semantics: one `main`, labelled `navigation`, `h1` per view, `aria-current`, `<table>` with `scope`, `<label for>`, `fieldset/legend`, `aria-invalid`, `aria-describedby`, `aria-busy`, `role=alert/status`.
- Errors: text + programmatic association + focus to first invalid control; financial errors persist until resolved.
- Text scaling: 200% browser zoom and Windows 150% scaling must not clip totals, truncate UUIDs without a copy action, or overlap Gurmukhi.
- High contrast: `forced-colors: active` system colours; status still uses text/icon/shape.
- Reduced motion: honour `prefers-reduced-motion`, preserve the existing CSS rule.
- English UI: default. Punjabi: currently receipt-only (`pa.json`, 33 keys); full workspace localization is a future, separately tested phase.
- Indian currency: `₹` + `en-IN` grouping + two decimals, e.g. `₹1,000.00`, never `₹1000`, `1000.00` or `₹1.000,00`.
- Indian number grouping: `1,00,000.00` where applicable; `Intl.NumberFormat('en-IN')` remains formatting-only.
- Mixed script: explicit `lang` on receipt/statement content, `dir=ltr` where needed, Gurmukhi-capable font stack, no clipping of matras, long product/customer names wrap rather than truncate financial columns.
- Screen readers where supported: UIA/Playwright names must remain stable; a visual redesign must not rename `Confirm sale`, `Saved invoice ID`, `Retry same sale`, `Start next sale`, `Review credit entry`, `Confirm retail operation`, `Print saved receipt` without a coordinated test update.

---

## 12. Appendix A — textual wireframes

These are **conceptual ASCII/text wireframes, not screenshots**. They describe future design only. Each includes layout, actions, focus, empty/loading/error and responsive behavior.

### A.1 First-time setup

```
┌──────────────────────────────────────────────────────────────┐
│ SORNIO  ·  Set up this PC                    [Offline · local] │
│ Step 1 of 3  ●────────○────────○                              │
│ Business identity                                            │
│  Business name [________________]  Type [General retail ▾]    │
│  Template preview: Counter · Stock · Khata · Day close        │
│  [Back]                              Primary [Continue →]     │
│ Step 2: Owner account  Step 3: Confirm offline workspace      │
└──────────────────────────────────────────────────────────────┘
```
Primary: `Continue`, final `Set up local access`. Secondary: `Back`, `Restore encrypted backup`. Focus: first field on step entry, first invalid field on error, final confirm on last step. Empty: required-field indicators. Loading: `Creating local access…` with disabled form. Error: field-associated + summary, native refusal text, no data reset. Responsive: single centered 480px card; at ≤1024 effective px reduce gutters, never stack currency/identity fields. Keyboard: Tab/Shift+Tab, Enter submits, Escape never discards silently.

### A.2 Main application shell

```
┌──────────┬────────────────────────────────────────────────────────────┐
│ SORNIO   │ Sample local store · Ravi · Cashier   [On this PC] [Day open]│
│ ▣ Counter│────────────────────────────────────────────────────────────│
│ ▢ Stock  │ Counter                         [? Shortcuts] [Lock]        │
│ ▢ Khata  │ ┌────────── Center work region ──────────┬─ Right panel ─┐  │
│ ▢ Day    │ │ Search / cart / ledger                 │ Totals / pay  │  │
│ ▢ Admin  │ │ ...                                   │ ...           │  │
│          │ └───────────────────────────────────────┴───────────────┘  │
│ [Offline]│ status region: saved / pending / refused / uncertain        │
└──────────┴────────────────────────────────────────────────────────────┘
```
Primary: workspace view activation. Secondary: help, lock. Focus: skip link → nav → view heading → first working control. Empty/loading: view-level skeleton, never a blank panel. Error: persistent shell status with native text. Responsive: 216px nav → 64px icon rail → 48px at ≤1024 effective px; right panel can collapse but never hides total/confirm. `aria-current` marks active view.

### A.3 Cashier workspace

```
┌── Nav ┬─────────────────────── Center ───────────────────────┬── Right ──┐
│       │ [F2] Search items / scan  [____________________] [Clear]│ Customer  │
│       │ Results (first 50)                                     │ [Find… ▾] │
│       │ ▸ Rice   NATIVE-RICE  1.5 pcs  ₹42.50     [Add]        │ Outstanding│
│       ├───────────────────────────────────────────────────────┤ Invoice    │
│       │ Current sale · 2 lines                    [Remove row]  │ Subtotal   │
│       │ Qty [1.000]  Rice  ₹42.50/pcs  line ₹42.50            │ Tax        │
│       │ Qty [0.250]  Ghee ₹1,000.00   line ₹250.00            │ TOTAL      │
│       │                                                       │ ₹1,000.00 │
│       │                                                       │ [Confirm] │
└───────┴───────────────────────────────────────────────────────┴───────────┘
```
Primary: `Review sale` → `Confirm sale`. Secondary: `Find saved receipt`, `Refresh checkout`, `Remove`. Focus: search on entry, F3 quantity, F4 review, confirm auto-focus, success heading after posting. Empty: `No matching sale items` / `Add at least one item`. Loading: `Opening checkout…`, disabled fieldset. Error: field-associated split/stock/customer messages. Responsive: right panel pinned; center list scrolls; no horizontal scroll.

### A.4 Payment allocation panel

```
┌─ Checkout and payment ───────────────────────────────┐
│ Active customer: native-customer-2  [Change]          │
│ No credit limit · Outstanding ₹0.00                   │
│ Invoice total                            ₹1,000.00    │
│ ┌ Method ───────────── Amount ───── Status ───────┐  │
│ │ ● Cash              [ 600.00 ]  Cash recorded   │  │
│ │ ○ UPI               [   0.00 ]  Unverified      │  │
│ │ ○ Card              [   0.00 ]  Unverified      │  │
│ │ ▢ Customer credit    [ 400.00 ]  Outstanding    │  │
│ └────────────────────────────────────────────────┘  │
│ Allocated ₹1,000.00 · Remaining ₹0.00                 │
│ [Fill remaining into: Cash ▾]      [Review sale →]    │
└──────────────────────────────────────────────────────┘
```
Primary: `Review sale`. Secondary: `Fill remaining`, `Change customer`. Focus: customer combobox → cash → upi → card → credit → fill → review. Empty: all zeros, remaining equals total. Loading: allocation inputs disabled while native state reads. Error: exact-sum and credit-customer messages with `aria-invalid`. Responsive: method labels wrap, amounts remain right aligned and `₹` prefixed; never hide remaining.

### A.5 Transaction success state

```
┌──────────────────────────────────────────────────────────┐
│ ✓  SALE SAVED ON THIS PC                     [status]     │
│ Saved total                               ₹1,000.00       │
│ Receipt  S-000…   Invoice ID  [UUID] [Copy]               │
│ ● Cash received ₹600.00                                   │
│ ▢ Customer credit ₹400.00 · native-customer-2             │
│ Items / subtotal / tax / total (immutable snapshot)        │
│ Primary [Start next sale →]   [Print receipt] [Find receipt]│
│ Notice: Printing does not change the saved sale.           │
└──────────────────────────────────────────────────────────┘
```
Primary: `Start next sale`. Secondary: print, find receipt, copy ID. Focus: success heading, then primary. Empty: not applicable; a missing payment breakdown shows `Legacy record — use saved invoice ID`. Loading: none after posting. Error: print failure is separate and does not alter sale. Responsive: actions wrap; total never wraps or truncates. No success animation.

### A.6 Transaction failure / retry state

```
┌──────────────────────────────────────────────────────────┐
│ △  RESULT UNCERTAIN — RETRY SAME SALE        [alert]      │
│ The exact request is kept on this PC. Do not enter it again│
│ Confirmation ID [UUID] [Copy]                             │
│ Cart is preserved. No new operation ID will be generated.  │
│ Primary [Retry same sale · F8]   [Edit refused sale]*      │
│ *only when the native store definitively refused it         │
└──────────────────────────────────────────────────────────┘
```
Primary: `Retry same sale`. Secondary: `Edit refused sale` only for `refusedCodes`. Focus: retry button when focus would otherwise be on `body`. Empty: not applicable. Loading: `Confirming sale on this PC…`. Error: shows native text, never hides unresolved state. Responsive: banner persists above the right panel; copy ID wraps.

### A.7 Product management

```
┌─ Items & stock ────────────────────────────────────────────┐
│ [Search items / SKU____________] [Add item]  [Reload]       │
│ 128 items · 3 low stock                                      │
│ ┌ Name / SKU ───────── Unit ─ Price ─── Stock ─ Revision┐  │
│ │ Rice   NATIVE-RICE    pcs   ₹42.50   1.5     4        │  │
│ │ Ghee   P5-GHEE-1000   pcs ₹1,000.00  1.0     2        │  │
│ └───────────────────────────────────────────────────────┘  │
│ [Record stock change]  [Stock history]                     │
└───────────────────────────────────────────────────────────┘
```
Primary: `Add item` / `Save item on this PC`. Secondary: `Reload`, `Record stock change`, `Acknowledge item save`. Focus: search → table → create drawer first field. Empty: `Your saved items will appear here`. Loading: `Opening items on this PC…`. Error: duplicate SKU, stock conflict, pending receipt chip. Responsive: hide revision column at ≤1366, keep name/price/stock.

### A.8 Customer ledger

```
┌─ Customers & credit ───────────────────────────────────────┐
│ [Search name / phone / ID______] [Create customer]          │
│ Selected: Asha · statement-account                           │
│ Outstanding ₹106.05 · Overdue ₹0.00 · Limit ₹500.00         │
│ [Cash repayment] [Statement] [Corrections ▾]                │
│ ┌ Date ─ Entry / ref ─ Due ─ Change (₹) ─ Balance (₹) ┐    │
│ │ 30/10 opening_due …        ₹1.01          ₹1.01     │    │
│ └──────────────────────────────────────────────────────┘   │
│ [Prepare full customer statement] [Print customer statement]│
└───────────────────────────────────────────────────────────┘
```
Primary: `Create customer` / `Confirm credit entry`. Secondary: statement print, corrections, load more history. Focus: search → open customer → first repayment field → confirm. Empty: `No customer accounts`. Loading: 150ms debounced lookup with `aria-busy`. Error: `overpayment`, `credit_limit`, statement-changed reauthorization. Responsive: reference column collapses to a disclosure; numeric columns remain visible.

### A.9 Daily closing

```
┌─ Day close · 2026-11-03 (IST) ─────────────────────────────┐
│ State: OPEN   Cashier: owner                                │
│ ┌ Expected drawer cash ─────────────────────── ₹85.01 ┐   │
│ │ Counted drawer cash        [ 85.00 ]               │   │
│ │ Variance                  -₹0.01  counted less     │   │
│ └─────────────────────────────────────────────────────┘   │
│ Payment breakdown: cash / UPI pending / card pending / credit│
│ Primary [Review cashier closing]  Secondary [Save CA CSV]    │
│ Closed state: [Reopen day] requires adjacent reason field    │
└───────────────────────────────────────────────────────────┘
```
Primary: `Review cashier closing` → `Confirm retail operation`. Secondary: CSV, reopen, correction. Focus: counted cash → review confirm → success receipt. Empty: no summary yet → `Refresh payment records`. Loading: `Opening payment records…`. Error: `day_closed`, `duplicate_settlement`, variance explanation. Responsive: breakdown wraps; expected/counted/variance never wrap.

### A.10 Business configuration

```
┌─ Admin ────────────────────────────────────────────────────┐
│ Tabs: Business | Staff & permissions | Receipts | Backup | Devices│
│ Business: name, type, offline notice, statutory fields*       │
│ Staff: [Create staff account]  role matrix, enable/disable   │
│ Receipts: paper layout, language, printer test*              │
│ Backup: [Export encrypted backup…] [Choose…] [Verify…]       │
│ DANGER ZONE  Type RESTORE <hex>  [Create safety backup…]     │
│ Devices*: detected / supported / configured / test / error   │
│ *future only; do not show as implemented                     │
└───────────────────────────────────────────────────────────┘
```
Primary: one save per section; restore is the only destructive primary. Secondary: reload, cancel, close. Focus: tab list → first field → section save; restore focuses confirmation phrase. Empty: `No staff accounts`, `No backup selected`. Loading: `Working with the encrypted backup…`. Error: fail-closed lock, wrong passphrase, preview mismatch. Responsive: tabs become a vertical section list; danger zone remains last and never collapses into a menu.

---

## 13. Review gate

This design system is ready for founder review, not implementation. Before any production CSS/component work, the following must be decided: light-only vs separately reviewed dark theme, default density, minimum supported effective viewport, full Punjabi UI scope, and whether the physical Windows/artifact evidence gap will be closed first.
