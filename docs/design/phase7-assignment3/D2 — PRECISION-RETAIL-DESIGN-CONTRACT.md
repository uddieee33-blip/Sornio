# D2 — Precision Retail Design Contract

**SORNIO — Phase 7 / Assignment 3** · Workstream B: Production Design System Contract
**Status:** Proposed specification only. **No production CSS, JSX, TSX, token file or dependency was
modified or created by this assignment.**
**Founder-approved direction:** Direction A — Precision Retail, with three approved Direction-B
refinements (see §1.2).
**Gate B:** evaluated in §6.

All contrast ratios below were computed with the WCAG 2.x relative-luminance formula. They are
proposals to be re-verified at implementation time on the exact shipped token values; they are not
claims about current production rendering.

---

## 1. Approved design direction and refinements

### 1.1 Direction A — Precision Retail (approved, frozen as design intention)

Core characteristics (founder-approved):

- Narrow, dark navigation rail
- Dense, light operational workspace
- Persistent payment and totals area
- Clear visual hierarchy
- Strong keyboard-first operation
- Minimal unnecessary movement
- High-contrast information architecture
- English and Punjabi support
- Practical usability on standard Windows shop computers

### 1.2 Three approved Direction-B refinements (design intentions, subject to viewport and
accessibility validation)

| # | Refinement | Approved use | Hard constraints |
|---|---|---|---|
| R1 | Grouped financial totals for easier reconciliation | Subtotal / tax / total grouped with clear labels in checkout, payment panel, receipts, statements | Grouping must not hide any figure; exact paise values unchanged; amounts still produced by `money()` |
| R2 | 12px corner radii for noncritical controls where space permits | Modals, secondary panels, noncritical chips | Primary confirm buttons and payment-critical controls keep a restrained geometry; radii must not reduce hit area or focus visibility |
| R3 | Subtle visual depth on the payment panel only | Payment/totals panel may use a restrained shadow | No depth on navigation, tables, cart rows, or status surfaces; no glass/glow; depth must not reduce contrast below AA |

### 1.3 Direction B is not approved as the primary production design

Direction B (Refined Commerce) remains the rejected alternative: its labelled rail, 44px rows and
extra guidance consume vertical space at 125% scaling and reduce centre width for long
mixed-script names at 1280×720. Direction B prototypes remain available for comparison only.

---

## 2. B1 — Semantic design tokens

### 2.1 Token philosophy

Tokens express **semantic purpose**, never raw colour. `color.financial.warning` (a state) is
preferred to `color.orange500` (a paint). Each token in §2.2 carries: purpose, mapped usage,
accessibility assessment (contrast ratio on its intended surface) and an implementation
recommendation. Unresolved decisions are listed in §2.5, never silently assumed.

### 2.2 Proposed core token contract (illustrative CSS names — NOT IMPLEMENTED)

```css
/* Proposed semantic token contract — documentation only, not a production stylesheet */
:root {
  color-scheme: light;

  /* Application background and surfaces */
  --color-bg-app: #F7F8FA;            /* app canvas */
  --color-bg-subtle: #F1F3F5;         /* recessed regions */
  --color-surface-default: #FFFFFF;   /* panels, tables, inputs */
  --color-surface-raised: #FFFFFF;    /* raised card + shadow (payment panel, R3) */
  --color-surface-soft-accent: #E7EEE9; /* selection tint — never sole cue */

  /* Navigation rail (dark) */
  --color-nav: #182333;
  --color-nav-selected: #243449;
  --color-nav-text: #FFFFFF;
  --color-nav-text-muted: #C7D0DC;
  --color-nav-marker: #7BC2B7;        /* 3px selected-view marker */

  /* Text hierarchy */
  --color-text-primary: #182333;
  --color-text-secondary: #667085;
  --color-text-on-soft-accent: #52606D;
  --color-text-on-nav: #FFFFFF;
  --color-text-disabled: #7A8699;

  /* Borders and separators */
  --color-border-subtle: #D8DEE6;     /* decorative */
  --color-border-control: #7A8699;    /* interactive boundaries ≥3:1 */
  --color-border-strong: #667085;
  --color-divider: #E4E7EC;

  /* Focus indicators */
  --color-focus-ring: #246B65;        /* on light surfaces, 6.24:1 */
  --color-focus-ring-on-nav: #7BC2B7; /* on nav, 7.72:1 */

  /* Primary and secondary actions */
  --color-action-primary: #246B65;
  --color-action-primary-hover: #1D5A55;
  --color-action-primary-pressed: #164A46;
  --color-action-primary-disabled-surface: #D6DEDD;
  --color-action-primary-disabled-text: #667085;
  --color-action-secondary-surface: #FFFFFF;
  --color-action-secondary-text: #246B65;
  --color-action-secondary-border: #A8C1BD;
  --color-action-secondary-hover: #F1F7F5;
  --color-action-secondary-pressed: #E7EEE9;

  /* Financial and status semantics */
  --color-financial-success-text: #1B6E4A;     --color-financial-success-surface: #E7F4EC;
  --color-financial-warning-text: #8A5A00;     --color-financial-warning-surface: #FFF4D6;
  --color-financial-error-text: #A4262C;       --color-financial-error-surface: #FDECEC;
  --color-financial-debt-text: #7A3E00;        --color-financial-debt-surface: #FFF1DE;
  --color-financial-pending-text: #6B4E00;      --color-financial-pending-surface: #FFF4D6;
  --color-financial-confirmed-text: #1B6E4A;    --color-financial-confirmed-surface: #E7F4EC;
  --color-financial-reconciliation-text: #2C5E8A; --color-financial-reconciliation-surface: #EAF2FA;

  /* Offline and synchronization */
  --color-offline-text: #33415C;     --color-offline-surface: #E9EDF5;
  --color-sync-text: #33415C;        --color-sync-surface: #E9EDF5;

  /* Elevation and shadow (payment panel only, R3) */
  --shadow-raised: 0 1px 2px rgba(16,24,40,.06);
  --shadow-payment-panel: 0 1px 2px rgba(16,24,40,.06), 0 2px 8px rgba(16,24,40,.05);
  --shadow-modal: 0 12px 32px rgba(16,24,40,.14);

  /* Density and spacing */
  --space-0: 0px; --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-16: 64px;

  /* Corner radii (R2) */
  --radius-control: 6px;      /* inputs, buttons */
  --radius-panel: 10px;       /* cards, panels */
  --radius-modal: 12px;       /* noncritical modals (R2) */
  --radius-chip: 999px;

  /* Typography */
  --font-stack: "Segoe UI Variable","Segoe UI",Inter,system-ui,"Nirmala UI","Noto Sans Gurmukhi","Sornio Gurmukhi",sans-serif;
  --font-money: "Segoe UI Variable","Segoe UI",Inter,system-ui,sans-serif; /* tabular numerals */
}
```

### 2.3 Token accessibility assessment (proposed values)

| Semantic role | Token | Value | Surface / text | Ratio | Assessment |
|---|---|---|---|---:|---|
| App background | `color.bg.app` | #F7F8FA | — | — | Neutral canvas; no text directly on it below 4.5:1 |
| Surface | `color.surface.default` | #FFFFFF | — | — | Base for all panels |
| Surface (soft accent) | `color.surface.softAccent` | #E7EEE9 | — | 1.15:1 vs white | **Never the sole selection cue** — always paired with edge or text label |
| Navigation | `color.nav` | #182333 | white text | 15.82:1 | AA large/normal; deep but not pure black |
| Navigation selected | `color.nav-selected` | #243449 | white text | 12.63:1 | Marker `#7BC2B7` adds 7.72:1 |
| Primary text | `color.text.primary` | #182333 | on white/app bg | 15.82 / 15.03:1 | AA |
| Secondary text | `color.text.secondary` | #667085 | on white / app bg | 4.97 / 4.68:1 | AA normal text |
| Secondary text on soft accent | `color.text.onSoftAccent` | #52606D | on #E7EEE9 | 5.47:1 | AA (replaces #667085 at 4.22:1, rejected on soft accent) |
| Disabled text | `color.text.disabled` | #7A8699 | on disabled fill #D6DEDD | 3.64:1 | Non-text boundary; disabled controls also non-interactive and `aria-disabled` |
| Border (control) | `color.border.control` | #7A8699 | on white / app bg | 3.69 / 3.47:1 | AA non-text ≥3:1 |
| Focus ring | `color.focus.ring` | #246B65 | on white / app bg | 6.24 / 5.87:1 | AA non-text ≥3:1; **replaces current #829fce (2.69:1, FAILS)** |
| Focus ring on nav | `color.focus.ring.onNav` | #7BC2B7 | on nav #182333 | 7.72:1 | AA non-text |
| Primary action | `color.action.primary` | #246B65 | white label | 6.24:1 | AA text; hover #1D5A55 → 7.94:1; pressed #164A46 → 9.99:1 |
| Secondary action | `color.action.secondary.*` | white / #246B65 / #A8C1BD | — | 6.24:1 text | Border is supplemented by text and shape |
| Financial success | `color.financial.success.*` | #1B6E4A / #E7F4EC | tinted surface | 5.49:1 (6.22:1 on white) | AA |
| Financial warning | `color.financial.warning.*` | #8A5A00 / #FFF4D6 | tinted surface | 5.41:1 | AA |
| Financial error | `color.financial.error.*` | #A4262C / #FDECEC | tinted surface | 6.36:1 | AA |
| Financial debt | `color.financial.debt.*` | #7A3E00 / #FFF1DE | tinted surface | 7.51:1 | AA |
| Financial pending | `color.financial.pending.*` | #6B4E00 / #FFF4D6 | tinted surface | 7.06:1 | AA |
| Financial confirmed | `color.financial.confirmed.*` | #1B6E4A / #E7F4EC | tinted surface | 5.49:1 | AA |
| Financial reconciliation | `color.financial.reconciliation.*` | #2C5E8A / #EAF2FA | tinted surface | 6.04:1 | AA |
| Offline / sync | `color.offline.*` | #33415C / #E9EDF5 | tinted surface | — | Text + icon + shape; exact ratio re-verified at implementation |

### 2.4 Token purpose, mapped usage and implementation recommendation (Gate B table)

| Token group | Purpose | Mapped usage | Accessibility assessment | Implementation recommendation |
|---|---|---|---|---|
| `color.bg.app`, `color.bg.subtle` | Canvas differentiation | App background; recessed regions | No text directly below 4.5:1 | Introduce as CSS custom properties; map existing `--panel`/`--bg` in `style.css` |
| `color.surface.*` | Elevation hierarchy | Panels, tables, raised payment panel (R3) | Soft accent never sole cue | Add `--shadow-payment-panel` to payment panel class only |
| `color.nav.*` | Global orientation | Rail background, selected state, marker | 12.63–15.82:1 text; 7.72:1 marker | Keep dark rail; selected state uses `aria-current` + marker + text |
| `color.text.*` | Legibility hierarchy | Body, secondary, on-accent, disabled | All ≥4.5:1 except disabled (3.64:1 non-text) | Map to existing Tailwind text tokens in web app; desktop uses plain CSS |
| `color.border.*`, `color.divider` | Boundary & separation | Controls, fields, tables, dividers | Control ≥3:1; subtle/divider decorative | Borders remain 1px; focus replaces border as primary boundary on focus |
| `color.focus.ring*` | Keyboard focus | Every interactive element | 6.24 / 7.72:1 — **fixes current #829fce 2.69:1 failure** | `:focus-visible { outline: 2–3px solid; outline-offset: 2px }`; never removed for mouse users |
| `color.action.*` | Action hierarchy | Primary/secondary buttons, confirm | 6.24:1 label; disabled 3.64:1 + non-interactive | Preserve exact UIA button names (`Confirm sale` etc.) |
| `color.financial.*` | Financial state semantics | Status chips, ledger rows, totals grouping | All ≥4.5:1 text; never colour alone (§B3) | Status chips always carry text + icon/shape |
| `color.offline.*` | Connectivity honesty | Offline banner, sync status | Text + icon | Must not be confused with financial-success colouring |
| `shadow-*` | Depth (R3, payment panel only) | Payment panel, modals | No contrast loss | No shadow on nav/tables/status |
| `space-*`, `radius-*` | Density and geometry | All components | 44px targets; 6/10/12/999px radii | See §5 geometry table |
| `font-stack`, `font-money` | Typography | All text; money columns | Tabular numerals; Gurmukhi fallback | See §3 |

### 2.5 Unresolved token decisions (listed, not assumed)

1. **Dark theme for the desktop app:** `style.css:6` contains a dark `@media` block that inverts
   financial surfaces. Decision required: remove, or replace with a fully reviewed dark token set
   (complete contrast table + same text/icon/shape status encoding). The contract above is
   light-first.
2. **Density mode toggle:** comfortable (44px) vs compact (36px) is proposed but not decided;
   default recommendation is Comfortable. Requires founder decision before implementation.
3. **Offline/sync token exact ratios:** proposed values need re-computation at implementation;
   no measured contrast exists for these two groups yet.
4. **`Inter` in the desktop bundle:** already a root web dependency; licence and bundling decision
   required before extending it to the desktop bundle.
5. **Cross-platform token mapping:** web `lib/theme/palettes.json` (10 OKLCH paints) and mobile
   `packages/mobile-design/src/tokens.ts` remain separate; mapping is a Phase 7F concern, not part
   of the Windows contract.

---

## 3. B2 — Typography and localization

### 3.1 Type scale (proposed)

| Role | Size / line-height | Weight | Notes |
|---|---|---|---|
| Page heading | 24 / 32 px | 600 | One per workspace view; no marketing H1 in counter path |
| Section heading | 18 / 24 px | 600 | Panel and drawer titles |
| Body | 14 / 20 px | 400 | Minimum for all-day work (replaces current 12px body) |
| Small / metadata | 12 / 16 px | 400–500 | Timestamps, revision, helper text; never primary financial values |
| Input label | 12 / 16 px | 600 | Always associated with its control |
| Button label | 14 / 20 px | 600 | No 10/11px action labels |
| Table heading | 12 / 16 px | 600 | `scope` attributes; not uppercase-only for Gurmukhi |
| Numerical value | 14 / 20 px | 500 | `font-variant-numeric: tabular-nums lining-nums` |
| Monetary column | 14 / 20 px, right aligned | 500 | `₹` + en-IN grouping + two decimals |
| Invoice total | 24 / 32 px | 600 | `₹1,000.00`, tabular, never truncated |
| Receipt total | 16 / 24 px (print) | 600 | 58/80mm scale may reduce size but stays legible and grouped |

### 3.2 Font stack and fallback requirements

```css
font-family: "Segoe UI Variable","Segoe UI",Inter,system-ui,
             "Nirmala UI","Noto Sans Gurmukhi","Sornio Gurmukhi",sans-serif;
```

- `Segoe UI Variable`/`Segoe UI` are Windows system fonts — **no font available only in the design
  environment may be assumed present on the target Windows machine**. Never reference design-phase
  fonts as installed.
- Gurmukhi fallback: Windows `Nirmala UI`/`Raavi` plus the already-bundled
  `noto-sans-gurmukhi.woff2` (SIL OFL 1.1, licence text at
  `apps/desktop/public/fonts/NotoSansGurmukhi-OFL.txt`).
- Mixed-script line height ≥ 1.5 with `overflow-wrap: anywhere` for product/customer names; extra
  inline start padding for Gurmukhi matras. `font-synthesis: none` (already set) must be preserved
  so faux bold does not distort Gurmukhi.
- **Clipping tests required:** long customer names, long mixed-script product descriptions, very
  long currency strings — names wrap, financial columns never truncate.

### 3.3 Currency and number rules

- All amounts continue to be produced by `money(paise)` using `BigInt` and
  `Intl.NumberFormat('en-IN')`. **Never** divide paise by 100 with floating point; never
  `toLocaleString()` a JS number for a persisted balance; never render `₹1000`, `1000.00` or
  `₹1.000,00`.
- Financial amounts remain legible without truncation that hides meaning: totals never ellipsize;
  ledger/statement rows may wrap text but keep the amount column intact and right-aligned.
- Receipts: `₹` + en-IN grouping + two decimals; Punjabi receipt keeps verified `pa.json` phrases
  (33 keys) with explicit `lang` on content.

### 3.4 Localization scope

- English UI is the default. Punjabi is currently receipt-only; full workspace Punjabi
  localization is a future, separately tested phase. Mixed-script product descriptions use the
  Gurmukhi-capable stack; navigation labels stay English until a full localization phase is funded.

---

## 4. B3 — Visual state model

No financial state may depend on colour alone. Every state pairs **text + icon/shape** (+ colour):

| State | Text | Icon / shape | Example rendering |
|---|---|---|---|
| Draft | `Draft — not saved` | hollow square | `▢ Draft — not saved` |
| Pending | `Pending — waiting for confirmation` | hollow circle `○` | `○ Pending — waiting for confirmation` |
| Processing | `Saving…` / `Processing — do not leave` | spinner-free solid dot `●` | `● Saving…` |
| Confirmed | `Sale saved on this PC` | check `✓` in square | `✓ Sale saved on this PC` |
| Failed (confirmed refusal) | `Refused — edit this sale` | octagon `⛔` | `⛔ Refused — edit this sale` |
| Uncertain (unknown outcome) | `Result uncertain — retry same sale` | warning triangle `△` | `△ Result uncertain — retry same sale` |
| Offline | `Offline — local only` |断开 ring `◯` | `◯ Offline — local only` |
| Retry available | `Retry same sale` (F8) | circular arrow `↺` | `↺ Retry same sale (F8)` |
| Permission denied | `Manager or owner required` | lock `🔒` | `🔒 Manager or owner required` |
| Read-only | `Read-only` | eye `◉` | `◉ Read-only` |

Additional financial-state rules:

- `Cash recorded` (●) / `UPI pending — unverified` (○ dashed) / `Customer credit — outstanding` (▢)
  are the three payment-line states in the split panel.
- Unverified digital payments (UPI/card) are **never** coloured as settled; the word
  `unverified` is mandatory and the existing `UPI (unverified…)` / `Card (unverified…)` labels are
  preserved.
- Reconciliation variance is shown as signed text (`Variance -₹0.01 · counted less than expected`),
  never colour alone.
- Pending/uncertain/failed financial messages persist until acknowledged; they never auto-dismiss.

---

## 5. B3 geometry, density and elevation

| Element | Proposed geometry | Rationale |
|---|---|---|
| Border radius | controls 6px; panels 10px; modals 12px (R2); chips 999px | Disciplined; replaces current mixed 12/13/19/24/28/30px |
| Button height | 44px comfortable / 36px compact; min-width 88px; primary confirm 48px | 44px touch target |
| Input height | 40px comfortable / 36px compact | Consistent with buttons and Windows conventions |
| Card / panel | 1px `#D8DEE6` border, 10px radius, no gradient | Flat surface for financial data |
| Table row | 44px / 36px; 1px `#E4E7EC` divider | Predictable scanning |
| Modal / drawer | 480px confirm, 640px form, 800px table; max 90vw | No full-screen modal for routine checkout |
| Sidebar / rail | 216px expanded / 64px icon rail / 48px at effective ≤1024 CSS px | Preserves 1280px checkout width |
| Right checkout panel | 360–420px; narrows to 320px at ≤1024 effective px | Total + confirm remain pinned |
| Elevation | raised `0 1px 2px rgba(16,24,40,.06)`; payment panel adds `0 2px 8px rgba(16,24,40,.05)` (R3); modal `0 12px 32px rgba(16,24,40,.14)` | Subtle depth only; payment panel only |

Density modes (comfortable/compact) are presentation preferences only: same tokens, DOM,
accessible names and calculations. Density must never change cart lines, operation ID, or posting
path.

---

## 6. B4 — Accessibility acceptance

### 6.1 WCAG 2.2 AA thresholds (documented)

- Normal text contrast ≥ 4.5:1 — proposed tokens satisfy this (§2.3).
- Large text (≥18.66px bold / ≥24px) ≥ 3:1 — all proposed text tokens exceed.
- Meaningful non-text controls and state indicators ≥ 3:1 where applicable — focus rings
  (6.24/7.72:1), control borders (3.69/3.47:1), selected-nav marker (7.72:1).
- **A focus ring is not acceptable merely because surrounding text has sufficient contrast** —
  the ring itself must meet the 3:1 non-text threshold. Current production `#829fce` at 2.69:1
  **fails**; the proposed `#246B65`/`#7BC2B7` tokens fix this.
- Visible keyboard focus on every interactive element; never removed for mouse users.
- No keyboard traps; logical tab order; meaningful accessible names.
- Screen-reader and Windows UI Automation compatibility: UIA control names used by
  `check-native.py`/`check-*.cjs` (`Confirm sale`, `Saved invoice ID`, `Retry same sale`,
  `Start next sale`, `Review credit entry`, `Confirm retail operation`, `Print saved receipt`)
  must remain stable unless a coordinated test update is approved.
- Reduced-motion support: `@media (prefers-reduced-motion: reduce)` removes all transitions and
  animations; no continuous animation in the cashier path.
- High Contrast / forced-colours: `@media (forced-colors: active)` uses system colours
  (`Canvas`, `CanvasText`, `Highlight`, `HighlightText`, `ButtonText`, `GrayText`), a `Highlight`
  focus outline, and no reliance on box shadows or background images. Status remains text + icon +
  shape.

### 6.2 Desktop-specific requirements (Windows)

- Physical keyboard operation (F2/F3/F4/Enter/F8/Escape) preserved as-is unless separately
  authorized.
- Windows High Contrast and DPI scaling (100/125/150%) as part of the accessible surface.
- Print output (58/80mm, A4) remains legible and grouped; screen density and theme must not alter
  printed amounts (`receipt-print.ts` print root is isolated).
- 44×44 CSS px targets for primary/destructive/touch-capable controls; 36px compact only for dense
  table row actions.
- Text scaling: 200% browser zoom and Windows 150% scaling must not clip totals, truncate UUIDs
  without a copy action, or overlap Gurmukhi.

### 6.3 Platform behavior identified as untested (must not be claimed as verified)

- Real screen-reader output through WebView2/UIA on the packaged app.
- `forced-colors` behaviour in the actual WebView2 runtime.
- Windows 150% DPI and mixed-DPI monitor behaviour.
- Scanner key-repeat cadence through the packaged WebView2 window.
- Physical print output (Gurmukhi paper).

These are implementation-phase verification items; none is claimed as verified here.

---

## 7. Theme migration plan (mapping existing systems to the contract)

### 7.1 Existing theme systems (duplicates/conflicts identified)

| System | Location | Scope | Conflict |
|---|---|---|---|
| Desktop plain CSS | `apps/desktop/src/style.css` | Windows app UI | Uses raw hex (`#304d70` buttons, `#829fce` focus, `#eaf0f7` selected) with no semantic layer; dark `@media` block inverts surfaces |
| Web paints | `lib/theme/palettes.json`, `app/themes.css`, `lib/theme/paints.generated.json` | Web app, 10 OKLCH paints + Dawn/Dusk | Different colour space and naming; Dawn/Dusk are brand/marketing themes |
| Mobile design tokens | `packages/mobile-design/src/tokens.ts` | Android/iOS companion | Separate geometry; must not be silently merged into Windows |

**Duplicate/conflicting definitions:** three unrelated token systems describe "theme" for three
platforms. The desktop app has **no** token layer at all — it hardcodes colours. This contract
introduces a desktop semantic layer that can later map to the web/mobile systems; it does not
erase or consolidate the existing systems.

### 7.2 Migration mapping (proposal, not implementation)

| Existing desktop hardcode | Maps to proposed token | Note |
|---|---|---|
| `#304d70` button fill | `color.action.primary` (#246B65) | Improves contrast; name preserved |
| `#829fce` focus outline | `color.focus.ring` (#246B65) / `onNav` (#7BC2B7) | AA fix |
| `#eaf0f7` selected nav | `color.nav-selected` (#243449) + marker | Dark rail selection |
| `--panel`, `--line`, `--muted` | `color.surface.*`, `color.border.*`, `color.text.secondary` | CSS variable introduction |
| dark `@media` inversion | unresolved (§2.5 item 1) | Founder decision required |

### 7.3 Migration sequence (future, not executed)

1. Add isolated `tokens.css` (custom properties only, no JSX/CSS replacement).
2. Map desktop hardcodes to tokens file-by-file, starting with `style.css`.
3. Verify contrast table, focus ring, forced-colors, reduced motion.
4. Keep web `lib/theme/*` and mobile `tokens.ts` untouched; cross-platform mapping is Phase 7F.

---

## 8. Gate B evaluation

| Requirement | Status | Evidence |
|---|---|---|
| Every proposed core semantic token has purpose | ✅ | §2.4 table |
| Mapped usage | ✅ | §2.4 table |
| Accessibility assessment | ✅ | §2.3 ratio table (computed, to be re-verified at implementation) |
| Implementation recommendation | ✅ | §2.4 table + §7 migration plan |
| Unresolved token decisions listed | ✅ | §2.5 (5 items) |
| Three approved refinements specified with constraints | ✅ | §1.2 |
| Typography + localization constraints for EN/Punjabi/mixed/money/receipts | ✅ | §3 |
| State model without colour-only meaning | ✅ | §4 |
| WCAG 2.2 AA + Windows requirements documented | ✅ | §6 |
| Untested platform behavior identified | ✅ | §6.3 |

**Gate B verdict: PASS** on documentation completeness — every token carries purpose, mapping,
accessibility assessment and recommendation, and unresolved decisions are listed rather than
assumed. **Qualification:** token contrast values are computed proposals, not measured on shipped
code; platform behaviours in §6.3 remain untested and are flagged as such in D7.
