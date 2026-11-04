# D5 — Production Implementation Plan (Proposed, Not Executed)

**SORNIO — Phase 7 / Assignment 3** · Workstream F: Implementation Plan Without Implementation
**Status:** **PROPOSED SEQUENCE ONLY.** No production change described here has been started,
committed or authorized. Production implementation authorization remains **NOT GRANTED**.
**Merge authorization:** NONE.

**Recommended first future production change (after separate founder authorization):**
**Semantic Token Contract + Route-Level AppShell Composition.** This document defines it; it does
not perform it.

---

## 1. Planning principles

1. **Smallest reasonable units.** Each unit is independently reviewable, testable and reversible.
2. **Never restructure checkout and theming simultaneously.** Token work and cashier composition
   are separate units with separate review gates.
3. **Preserve existing checkout, Rust, persistence and native financial boundaries.** The renderer
   never gains financial authority; `packages/local-store`, SQLCipher schema (`SCHEMA_VERSION=12`)
   and native commands stay untouched.
4. **No new runtime dependencies.** React 19, TypeScript, Vite and plain CSS are sufficient.
   Tailwind is not introduced into `apps/desktop`.
5. **Accessible names, IDs and focus behavior are a public contract** with `check-native.py` and
   the `check-*.cjs` suites.
6. **One reviewed production slice at a time**, each behind a full CI run on the exact head.

---

## 2. Implementation units

### U1 — Token introduction (S)

- **Target files:** new `apps/desktop/src/styles/tokens.css` (CSS custom properties only);
  no existing file modified except an isolated `@import` in the bundle entry (future decision).
- **Existing dependencies:** D2 §2 token contract; `lib/theme/palettes.json` and
  `packages/mobile-design/src/tokens.ts` remain untouched.
- **Intended behavior:** custom properties exist for every semantic token in D2 §2.2; nothing
  renders differently yet.
- **Explicit non-goals:** no JSX change, no hardcode removal, no theme rewrite, no dark-mode
  decision (D2 §2.5 item 1 remains a founder decision).
- **Tests:** CSS parse check; token presence/completeness script; contrast re-computation script
  over token values; `node --check` equivalent for CSS.
- **Estimated change risk:** Low — additive file, zero runtime behaviour change.
- **Rollback procedure:** delete the `@import` line and the new file; no data or schema impact.
- **Required evidence:** token inventory diff; contrast table output; no behaviour diff.

### U2 — Theme compatibility mapping (S–M)

- **Target files:** `apps/desktop/src/style.css` (hardcode → token mapping, file-by-file starting
  with focus/buttons/nav); no component JSX.
- **Existing dependencies:** U1.
- **Intended behavior:** desktop UI renders with semantic tokens; focus ring becomes `#246B65`
  / `#7BC2B7` (fixes DEF-1); buttons/nav map to contract tokens.
- **Explicit non-goals:** no dark `@media` removal/replacement (separate founder decision); no
  web/mobile token consolidation; no font changes.
- **Tests:** `check-ui.cjs`, `check-focus.cjs` (focus visibility), contrast script over rendered
  elements, `verify-theme.mjs` (web) unaffected.
- **Estimated change risk:** Low–Medium — visual-only, but touches the focus contract.
- **Rollback procedure:** revert `style.css` diff (single file); tokens.css retained.
- **Required evidence:** focus-ring screenshot before/after; contrast report; existing UI checks
  green on exact head.

### U3 — Navigation shell (M)

- **Target files:** new `apps/desktop/src/workspace/AppShell.tsx` + `NavRail.tsx` (future dirs);
  `main.tsx` gains route composition but keeps all state coordination (`dirtyOwners`,
  `busyOwners`, refresh tokens, lock/reopen prompts, `beforeunload`).
- **Existing dependencies:** U1+U2; `AccessGate.tsx` unchanged.
- **Intended behavior:** dark narrow rail (216/64/48px), `aria-current`, top status bar,
  skip link, landmarks; existing UIA names preserved.
- **Explicit non-goals:** no permission changes; no panel removal from state coordination; no
  rename of UIA control names; no scroll-ownership change for panels yet (U5).
- **Tests:** `check-ui.cjs`, `check-focus.cjs`, `check-authorization.cjs`, `check-native.py`
  (lock/unlock/focus), new rail layout checks.
- **Estimated change risk:** High — touches `main.tsx` coordination and UIA contract.
- **Rollback procedure:** revert `main.tsx` + delete new shell files; state coordination is
  unchanged by design so rollback is a clean revert.
- **Required evidence:** full `windows-local.yml` run on exact head; UIA lock/unlock captures;
  focus screenshots.

### U4 — Header and workspace layout (M)

- **Target files:** new `TopStatus.tsx`, `WorkspaceView.tsx`; `main.tsx` panel composition.
- **Existing dependencies:** U3.
- **Intended behavior:** route-level view container; status region persistent (`aria-live`);
  header shows business · principal · role, `On this PC`, day/offline status.
- **Explicit non-goals:** no checkout logic change; no totals math change; panels keep their
  refresh-token wiring.
- **Tests:** `check-ui.cjs` additions; status region announcement tests; layout assertions at
  required viewports.
- **Estimated change risk:** Medium — composition only.
- **Rollback procedure:** revert composition diff; panels unchanged.
- **Required evidence:** viewport layout captures (5 required + 125%); status region recordings.

### U5 — Focus and accessibility hardening (M)

- **Target files:** focus-ring application across components; forced-colors block
  (`@media (forced-colors: active)`); reduced-motion verification; `aria-live` regions for
  financial state.
- **Existing dependencies:** U2 (tokens), U4 (regions).
- **Intended behavior:** every interactive element has ≥3:1 visible focus; High Contrast uses
  system colours; status text + icon/shape everywhere.
- **Explicit non-goals:** no shortcut changes; no control renames; no functional changes.
- **Tests:** focus visibility sweep (Playwright + UIA), forced-colors rendering, reduced-motion
  assertions, contrast script.
- **Estimated change risk:** Medium — mostly CSS.
- **Rollback procedure:** revert CSS diffs.
- **Required evidence:** focus/forced-colors/reduced-motion captures; contrast report.

### U6 — Viewport constraints (M)

- **Target files:** responsive rules in shell/workspace CSS; rail collapse (216→64→48px); right
  panel narrowing (360–420→320px); total+confirm pinning.
- **Existing dependencies:** U3+U4+U5.
- **Intended behavior:** no horizontal scroll for primary checkout controls at 1280×720,
  1366×768, 1600×900, 1920×1080, and 1280×720 @125% (effective ~1024×576).
- **Explicit non-goals:** no hiding of total/confirm at any required viewport; no truncation of
  financial amounts; no substitute for real 125% measurement.
- **Tests:** **new** WebView2 content-viewport measurement at 125% (D3 W2 item 9); Playwright
  layout assertions at 5 viewports; clipping checks for long mixed-script names.
- **Estimated change risk:** Medium–High — the highest-value untested area.
- **Rollback procedure:** revert CSS media-query/layout diff.
- **Required evidence:** real 125% measurement artifact (blocked in this sandbox — D1 §5.7);
  viewport screenshot matrix.

### U7 — Cashier composition (L) — after U1–U6 and separate authorization

- **Target files:** new `apps/desktop/src/cashier/` composing existing `CheckoutPanel` logic
  (search/cart/payment logic extracted, **not replaced**); persistent totals area.
- **Existing dependencies:** U1–U6 complete and green.
- **Intended behavior:** two-region cashier workspace; F2/F3/F4/Enter/F8/Escape preserved;
  review-before-post; exact-paise split equality; unverified labels.
- **Explicit non-goals:** no new posting path; no `Fill remaining` (unapproved); no UPI/card
  verification claims; no operation-ID changes.
- **Tests:** all `check-checkout.cjs`, `check-focus.cjs`, `check-receipts.cjs`, `check-native.py`
  cashier blocks; new 125% total/confirm visibility test; ₹1,000 split regression.
- **Estimated change risk:** **Critical** — operation ID, shortcuts, split equality, print
  snapshot.
- **Rollback procedure:** revert composition; `CheckoutPanel.tsx` logic retained in original form.
- **Required evidence:** full CI + installed-UI run on exact head; mixed-split capture review.

### U8 — Regression coverage (M)

- **Target files:** new Playwright/UIA cases from D4 §3; `verify-desktop-contract.mjs` additions.
- **Existing dependencies:** the unit under test.
- **Intended behavior:** every BLOCKS-severity scenario from D4 has an automated regression.
- **Explicit non-goals:** no assertion weakening; no prototype-only substitutes for production
  tests; no skipping.
- **Tests:** the tests themselves.
- **Estimated change risk:** Low (test code), but gates everything else.
- **Rollback procedure:** N/A (tests only).
- **Required evidence:** coverage matrix update (D7 G6).

### U9 — Visual verification (M)

- **Target files:** none (process).
- **Intended behavior:** authentic installed-app captures reviewed at every milestone: run
  `windows-local.yml` on the exact reviewed head, durably archive artifacts with SHA-256
  outside Actions retention, visually review all 28 catalogued captures, record a reviewed
  manifest.
- **Explicit non-goals:** no browser render or prototype promoted to installed evidence; no
  paid CI without authorization.
- **Tests:** `check-windows-evidence.py` gate; reviewed capture manifest.
- **Estimated change risk:** N/A (process).
- **Rollback procedure:** N/A.
- **Required evidence:** reviewed capture manifest with SHA-256 (currently BLOCKED in this
  sandbox — D1 §5.7; requires authorized retrieval or a new run).

---

## 3. Dependency and sequencing summary

```
U1 tokens → U2 theme mapping → U3 navigation shell → U4 header/workspace
  → U5 focus/a11y → U6 viewport constraints → U7 cashier composition
  → U8 regression coverage (parallel, per-unit) → U9 visual verification (per-unit)
```

- **Hard ordering rule:** U7 (checkout composition) waits for U1–U6 **and** a separate founder
  authorization. Theming (U1/U2) and checkout (U7) are never merged in one change set.
- **Parallelizable:** U8 regression cases are written alongside each unit.
- **Founder-decision gates inside the plan:** dark-theme policy (before U2 hardcode mapping
  completes), density mode default (before U6), `Fill remaining` spec (before any W3 helper work),
  cycle/hardware template IDs (before any W7 template work).

---

## 4. Issues requiring separate founder decisions (carried to D6)

| ID | Issue | Why it needs a decision |
|---|---|---|
| FDR-1 | Dark theme policy for desktop (remove or fully spec) | Affects financial surface inversion; accessibility risk |
| FDR-2 | Density mode default (Comfortable recommended) | Layout and hit-target trade-off |
| FDR-3 | `Fill remaining` arithmetic/interaction/native-boundary spec | Financial interaction change, currently unapproved |
| FDR-4 | Cycle/hardware retail template IDs (map to `general` for V1?) | Onboarding scope honesty |
| FDR-5 | 150% DPI and physical hardware measurement authorization | Requires hardware/CI authorization |
| FDR-6 | Code signing provider | Blocks pilot/release gates |
| FDR-7 | Authorize U1+U3 as the first production slice | Production implementation authorization is required per change set |

---

## 5. What this plan does NOT do

- No production file is created or modified by this assignment.
- No dependency, workflow, schema, permission, Rust or test change.
- No PR opened, merged or closed; no release; no deploy.
- No Android change; no GST (#127) or LAN (#126) integration.
- No claim that any unit has been implemented or verified.
