# APPSHELL DEPENDENCY AND RISK AUDIT

**SORNIO — Phase 7 / Assignment 4** · Independent preflight audit of the proposed **U1 + U3**
implementation slice (semantic token contract + route-level AppShell composition).
**Date:** 2026-11-04 (UTC). **Code modified:** none. All findings are read-only observations of
`1cc5c798…`.

---

## 1. Scope of the audited slice

| Unit | Proposed change | Files |
|---|---|---|
| **U1** | Introduce semantic token contract | new `apps/desktop/src/styles/tokens.css`; one import line in `main.tsx` |
| **U3** | Route-level AppShell composition | new `apps/desktop/src/workspace/AppShell.tsx`, `workspace/NavRail.tsx`; `main.tsx` composition change |

Everything else — checkout, Rust, persistence, native permissions, print, tests — must remain
byte-identical. This audit establishes how hard that actually is.

---

## 2. Current shell anatomy (verified, with evidence)

| Fact | Evidence |
|---|---|
| Root is a 2-column grid: fixed rail + main | `style.css` `.desktop-shell{grid-template-columns:238px 1fr;min-height:100vh}` |
| Rail is a `<aside>` with wordmark link, workspace block, 3-link `<nav aria-label="Workspace">`, footer | `main.tsx:153-158` |
| Navigation is **fragment anchors, not routes** | `main.tsx:156` → `href="#main"`, `#checkout`, `#inventory-heading` |
| Nav exposes **3** destinations; the page renders **10** interactive panels | `main.tsx:156` vs `main.tsx:165-193` |
| All panels are stacked children of one `.page` div | `main.tsx:161-195` |
| Header is a static `<header class="topbar">` with identity + lock button | `main.tsx:160` |
| No CSS positioning exists anywhere | 0 `position:` declarations in `style.css` |
| Theme is 4 CSS custom properties only | `:root{--panel;--muted;--line;--accent}` in `style.css` |
| Dark mode inverts the whole app via media query | `@media(prefers-color-scheme:dark)` block |
| Shell owns every dirty/busy flag | `main.tsx:73-75`, `main.tsx:137` |
| Shell owns role gating | `main.tsx:31-33`, `167`, `190`, `192`, `193` |

---

## 3. Integration points (IP) — what a shell change can break

Severity: **P0** = financial/privilege/print corruption risk · **P1** = test or accessibility contract
broken · **P2** = cosmetic/visual regression.

### P0 — financial and privilege correctness

**IP-1 · Shortcut suppression depends on a DOM selector owned by the shell.**
`CheckoutPanel.tsx:393` guards the global keydown handler with
`if (document.querySelector('.lock-prompt, .reopen-prompt')) return;`.
These two class names are assigned by the **shell** (`main.tsx:164`, `main.tsx:178`). The guard exists
so that F2/F3/F4/**F8** cannot fire while an unsaved-changes prompt is open — F8 re-confirms a pending
sale.
*If U3 renames, wraps, or relocates those prompts, the selector silently stops matching.* There is no
error, no warning: F8 becomes live underneath a modal prompt, and a cashier answering a lock prompt
can post a second sale. **This is the single most dangerous coupling in the codebase.** Mitigation:
replace the selector with an explicit shared signal (context/ref) **and** keep the class names until
the UIA suite is migrated; add a regression test that opens the lock prompt and asserts F8 does not
post. Severity **P0**.

**IP-2 · Role gates are inline in the component U3 would refactor.**
`owner` (`main.tsx:31`) gates the draft form (`167`), `StaffPanel` (`190`), `BackupPanel` (`192`) and
`SavedCopies` (`193`). `canAdd`/`canCorrect` (`32-33`) gate inventory edits (`187`).
If any gate is dropped or re-scoped while panels move to routes, a cashier gains staff/backup access.
Note the gates are **render-time only** — native commands still enforce permission (defence in depth)
— but the UI would present controls that the native layer will refuse, which is itself a
misleading-UI defect. Severity **P0**.

**IP-3 · `busy` is the only thing stopping re-entrant posting from the keyboard.**
`main.tsx:137` aggregates 8 busy flags; the value is passed to checkout as `disabled`, and
`CheckoutPanel.tsx:392` returns early when `disabled || busy`. If shell restructuring defers or
de-races this value (e.g. moving busy state into a route component that mounts later, or deriving it
from a store), the early-return can miss the window during `Saving…`. Mitigation: keep the busy
aggregate in the same component that renders checkout, and keep the existing
`submitting`/`repeat`/`isComposing` guards untouched. Severity **P0**.

**IP-4 · Print isolation is `body`-scoped, not shell-scoped.**
`receipt-print.ts:41-42` appends a print root to `document.body` and relies on
`@media print{body>:not([data-sornio-print-root]){display:none!important}}`; `style.css` additionally
has `@media print{#root{display:none!important}}`.
If a refactor renders the receipt **inside** the shell (a tempting "keep it in the app" change), print
output becomes blank or partial without any test failing until a physical print. `check-receipts.cjs:79,91`
asserts `.desktop-shell` is not visible in print — that catches the "receipt inside shell" case only if
the print root is a `body` child. Severity **P0**.

**IP-5 · `dirty` aggregation gates backup and locking.**
`main.tsx:73-75` computes `draftDirty`/`otherDirty`/`dirty`; `BackupPanel` is disabled by an explicit
7-term OR at `main.tsx:192`; `beforeunload` is registered at `main.tsx:95`. Loss of any term allows a
backup while a form is dirty, or an unguarded close. Severity **P0** (data-loss class).

### P1 — test, accessibility and automation contracts

**IP-6 · The UIA suite addresses controls by accessible name, and 55+ names are asserted.**
`check-native.py` locates controls via `child_window(title=…, control_type=…)`. Verified names include
`Search items for sale`, `Confirm sale`, `Review sale`, `Retry same sale`, `Saved invoice ID`,
`Saved credit entry ID`, `Saved retail operation ID`, `Local password`, `Business name`,
`Business name for setup`, `Workspace note`, `Quantity change`, `Item to adjust`, `Transaction type`,
`Credit limit (₹, blank for no limit)`, `Role for native-cashier`, `Print customer statement`,
`Verify and preview backup`, `Verified backup preview`, `Restore saved copy 1/2/3`,
`Lock workspace`, `Unlock workspace`, `Set up local access`, `Save local draft`, and more.
Several tests also assert **absence** (`assert not …child_window(title="Confirm sale")`), so moving a
control off-screen or into a collapsed region changes the accessibility tree and breaks assertions.
**Any label, glyph, or visibility change in the shell or panels is a UIA contract change.**

**IP-7 · The window title is a hard test dependency.**
`check-native.py:188` attaches with `window(title_re="Sornio.*Local workspace review")`. The string
comes from `index.html` `<title>Sornio — Local workspace review</title>`. Changing the document title
breaks **every** native test at attach time. U3 must not touch `index.html`'s title.

**IP-8 · `.desktop-shell` is asserted by the print tests.**
`check-receipts.cjs:79` and `:91`. Renaming the root class silently breaks print assertions.

**IP-9 · Verbatim copy is asserted.**
Playwright asserts status sentences such as
`Checkout is ready. Totals are previews until the sale is saved.`,
`Saved to this PC. You can close and reopen Sornio.`, `Sale saved on this PC`,
`Customer accounts are up to date.`, `Payment records are up to date.`,
`Saved item change acknowledged.`, and region names `Customers & credit`,
`Printable customer statement`, `Staff access`, plus heading `Welcome back.`
Rewriting microcopy as part of a visual refresh breaks these tests legitimately — which is why the
microcopy decisions must be an explicit, reviewed part of U3, not an incidental side effect.

**IP-10 · Focus restoration falls back to `#checkout-search`.**
`main.tsx:51-53`: after dismissing a prompt, focus returns to the previously focused element if still
connected, **else** `document.getElementById('checkout-search')`. If the id is renamed or checkout is
mounted lazily (route-switched), that fallback silently no-ops and focus lands on `<body>` — a
keyboard-trap-adjacent defect that only a real tab-through would reveal.

**IP-11 · `style.css` already defines 4 custom properties that the token layer will collide with.**
`--panel`, `--muted`, `--line`, `--accent` are consumed throughout. Introducing
`--color-…` names alongside them is safe; reusing or redefining these four will create
cascade-order bugs that are invisible without a visual diff. Import order between `tokens.css` and
`style.css` is therefore behaviour, not style.

**IP-12 · `index.html` declares `color-scheme: light dark` and the app honours OS dark mode.**
Any token set that is light-only will be layered under an active dark media query, producing mixed
themes. This is why founder decision O-1 (dark policy) gates U2/U3.

**IP-13 · Nav is anchor-based, so "routes" change focus and scroll semantics.**
Today `href="#checkout"` scrolls the document and sets no focus. A route-level shell typically
represents navigation as history state + focus movement to the new heading. That is a **behavioural
change** (scroll position, back-button, focus) beyond visual restyling, and must be declared as such
in the PR.

**IP-14 · The nav exposes 3 of 10 panels.**
Customers, retail day, staff, credentials, backup, saved copies and printing have no rail entry; they
are reachable only by scrolling. A route-level shell forces an explicit decision (show 10 items?
group them?), which is a product decision, not a styling one.

### P2 — visual

**IP-15** · `clamp(32px,3.5vw,51px)` typography is viewport-driven, so screenshots differ per width.
**IP-16** · `.rail` padding 32/22 and 38px brand mark define the current rail rhythm; a 216px rail
per D2 changes the mark and label spacing.
**IP-17** · The `@media(max-width:1100px)` block hides `.revision` and `.side-panel`; a new layout that
ignores these breakpoints will not reproduce on 125% DPI (§4 of the viewport matrix).

---

## 4. Dependency map (blast radius of U1 + U3)

| File | Role in the slice | Coupled to | Covered by |
|---|---|---|---|
| `src/main.tsx` (201 lines) | shell, state, role gates, focus restore | every panel; `#checkout-search`; `.lock-prompt`/`.reopen-prompt` | check-ui, check-focus, check-authorization, check-backup, check-native |
| `src/style.css` (39 lines) | all visual rules, print rules, dark mode | `.desktop-shell` (print test), token vars | check-receipts, check-statement-print |
| `src/CheckoutPanel.tsx` (553) | **not in slice** — but reads shell classes/ids | IP-1, IP-3, IP-10 | check-checkout, check-focus, check-native |
| `src/receipt-print.ts` | **not in slice** — body-scoped print root | IP-4 | check-receipts, check-statement-print |
| `index.html` | title + `color-scheme` | IP-7, IP-12 | every native test |
| `src/AccessGate.tsx` | pre-shell access screen | shell mount point | check-credentials, check-ui |
| `src/locales/pa.json` | Punjabi catalogue | receipt/statement fonts | verify-i18n |
| `check-native.py` | 28 captures, 55+ names | IP-6, IP-7 | Windows CI only |

**Not coupled to the slice (must stay untouched):** `packages/local-store/src/*` (30 files, 16,038
lines), all `billing*.rs`, `payments.rs`, `customers.rs`, `checkout.rs`, `inventory_recovery.rs`,
`recovery.rs`, `access.rs`, `identity.rs`, the four `*-schema.sql` files, `src-tauri/*`, and
`apps/mobile/*`.

---

## 5. Risk register

| ID | Risk | Sev | Likelihood | Mitigation | Verification |
|---|---|---|---|---|---|
| R-1 | F8 fires under an open prompt after `.lock-prompt` rename | **P0** | Medium | Keep class names; add explicit shared signal; explicit regression test | New UIA test: open lock prompt → send F8 → assert no invoice |
| R-2 | Role gate lost during extraction → cashier sees owner panels | **P0** | Medium | Mechanical move of `owner &&` conditions; snapshot test per role | check-authorization + new render-gate test for all 3 roles |
| R-3 | `busy` de-raced → double submission window | **P0** | Low–Medium | Keep aggregate in same component; no store indirection | check-checkout double-submit + UIA burst |
| R-4 | Receipt root moved inside shell → blank print | **P0** | Low | Body append stays; print CSS untouched | check-receipts print assertions + physical print (blocked) |
| R-5 | Dirty-term dropped → backup while dirty | **P0** | Low | Preserve the 7-term OR verbatim | check-backup dirty-gate test |
| R-6 | Window title changed → all native tests fail to attach | P1 | Low | Do not touch `index.html` title | CI attach step |
| R-7 | `.desktop-shell` renamed → print assertions break | P1 | Medium | Keep root class name through V1 | check-receipts |
| R-8 | Accessible names drift → UIA suite fails | P1 | High if copy is rewritten | Treat microcopy as reviewed scope; update tests in the same PR with founder sign-off | check-native (Windows) |
| R-9 | Token layer collides with `--panel/--muted/--line/--accent` | P1 | Medium | Namespace as `--color-*`; explicit import order | Visual diff + `verify-theme.mjs` |
| R-10 | Light-only tokens under active dark media query | P1 | High | Decide O-1 before U2 | Forced dark-mode run |
| R-11 | Focus fallback `#checkout-search` no longer resolves | P1 | Medium | Keep id; add focus-after-prompt test | check-focus |
| R-12 | Routes change scroll/back/focus semantics silently | P1 | High | Declare as behavioural change; explicit acceptance | New navigation test |
| R-13 | Layout ignores ≤1100 breakpoint → breaks at 125% DPI | P2 | Medium | Verify at 1024×576 CSS | U6/U9 measurement |
| R-14 | Nav expands 3 → 10 items without a product decision | P2 | High | Founder decision required (O-11, new) | Review |
| R-15 | Scope creep: "while we're here" checkout restyle | **P0** | Medium | U7 hard-gated; PR file allowlist enforced | Repo-integrity gate |

---

## 6. Components and integration points requiring regression coverage

Exhaustive list for the future PR's test plan:

1. Global keydown handler — F2, F3, F4, F8, Escape, in all 4 contexts (idle, review open, pending, prompt open).
2. `.lock-prompt` / `.reopen-prompt` suppression of shortcuts.
3. Focus restoration after prompt dismissal (connected element and disconnected fallback).
4. `busy` propagation during `Saving…`, `Opening…`, and each panel's busy flag.
5. Dirty aggregation: backlog of 7 terms + `beforeunload`.
6. Role rendering for owner / manager / cashier / restricted (4 roles as encoded).
7. Print: receipt and statement isolation from the shell.
8. Lock/unlock transition and `AccessGate` mount.
9. Inventory refresh token propagation after posting.
10. Nav reachability of every panel currently reachable by scroll.
11. Accessible names of all shell-level and checkout-level controls.
12. Window title regex attach.
13. Tab order across shell → checkout → panels.
14. Focus visibility contrast on every surface (post-token).
15. Forced-colours / High Contrast behaviour (blocked until a Windows host exists).
16. 125% DPI at 1280×720 and 1366×768 (blocked).

---

## 7. What U3 must explicitly NOT do

- Must not touch `CheckoutPanel.tsx`, `receipt-print.ts`, any `packages/local-store/**`, `src-tauri/**`.
- Must not rename `.desktop-shell`, `.lock-prompt`, `.reopen-prompt`, or `#checkout-search`.
- Must not change `index.html`'s `<title>`.
- Must not change any string asserted by `check-*.cjs` or `check-native.py`.
- Must not add a router library or any new dependency.
- Must not move the print root inside the application tree.
- Must not convert the 4 existing custom properties into new meanings.

---

## 8. Verdict

**A5 — AppShell integration risks identified: PASS.**

Every mechanism by which a shell refactor could damage financial correctness, privileges, printing,
keyboard integrity or the automation contract has been located to a specific file and line, with a
severity, a mitigation and a verification test. The audit is complete enough that an engineering agent
could implement U1+U3 without discovering a new class of breakage mid-flight — and it establishes that
**U3 is not a styling task**: it touches the component that owns shortcut suppression, role gating and
dirty/busy coordination.

Findings R-1, R-2, R-3, R-4, R-5 and R-15 are P0 and are the reason the recommended first PR is
deliberately narrow and file-allowlisted.
