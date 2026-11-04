# FOUNDER IMPLEMENTATION AUTHORIZATION PACKAGE

**SORNIO — Phase 7 / Assignment 4** · Decision package for the first production UI slice.
**Date:** 2026-11-04 (UTC). **Current authorization state:** production implementation **NOT
GRANTED**; merge **NONE**; billable CI **NONE**.

---

## 1. The decision being requested

Authorize — or decline — the **U1 + U3** production change described below, as a **separate scoped
implementation assignment** with its own PR. Nothing in this package has been implemented.

There are three defensible options:

| Option | Scope | Risk profile | Recommendation |
|---|---|---|---|
| **A. Authorize U1 only** | Add `tokens.css` (declarations + one import). No markup change. | Very low; additive, invisible unless applied | **Recommended** |
| **B. Authorize U1 + U3 together** | Tokens + shell/NavRail composition | Medium–High; touches the component owning shortcut suppression, role gates, dirty/busy | Viable once P0 mitigations are test-pinned |
| **C. Defer everything** until A2/A3 evidence is recovered | None | None | Defensible if visual acceptance must precede any code |

This package supports **A** as the immediate step, with **B** as the follow-on once the P0 regression
tests in §5 exist.

---

## 2. Exact proposed files

**Allowlist — the PR may touch these and only these:**

| Action | Path | Purpose | Size |
|---|---|---|---|
| **new** | `apps/desktop/src/styles/tokens.css` | Semantic token declarations (`--color-*`), additive; no rules applied to components in U1 | small |
| **new** | `apps/desktop/src/workspace/AppShell.tsx` | Shell composition extracted from `main.tsx` — grid, header, content region | small–medium |
| **new** | `apps/desktop/src/workspace/NavRail.tsx` | Rail markup: wordmark, workspace block, nav, footer | small |
| **edit** | `apps/desktop/src/main.tsx` | Compose `<AppShell>`; **no logic edits** — state, role gates, busy/dirty aggregation, focus restore move verbatim | mechanical |

**Explicitly excluded (must appear as zero diff lines):**
`apps/desktop/src/CheckoutPanel.tsx`, `CustomerPanel.tsx`, `InventoryPanel.tsx`, `RetailPanel.tsx`,
`StaffPanel.tsx`, `BackupPanel.tsx`, `CredentialsPanel.tsx`, `SavedCopies.tsx`, `AccessGate.tsx`,
`receipt-print.ts`, `billing-types.ts`, `native.ts`, `index.html`,
`packages/local-store/**` (30 files, 16,038 lines), `apps/desktop/src-tauri/**`, `apps/mobile/**`,
all `check-*.cjs`, `check-native.py`, `scripts/verify-*`, and every `package.json` / lockfile.

**Dependencies added: none.** No router library. No design-system package.

---

## 3. Scope and non-goals

**In scope**
- Introduce semantic tokens as *declarations* mapped from the D2 contract (namespaced `--color-*` so
  they cannot collide with the existing `--panel/--muted/--line/--accent`).
- Compose the shell so that navigation, header and content region have explicit components.
- Preserve every behaviour currently owned by `main.tsx`.

**Out of scope — any of these appearing in the diff is a review failure**
- Restyling the rail, top bar, panels or typography (that is U2/U4, later).
- Changing nav semantics from fragment anchors to history routes.
- Changing any user-visible string, accessible name, class name used by tests, or the document title.
- Touching checkout, financial code, persistence, permissions, printing.
- "Fixing" DEF-1/DEF-7/DEF-8 in this slice (they are token *values* for a later unit; changing them
  now mixes accessibility remediation into an architectural change).
- Enabling anything Android-side, GST, or LAN.

---

## 4. Risk assessment

P0 risks (full register in `APPSHELL-DEPENDENCY-AND-RISK-AUDIT.md` §5):

| ID | Risk | Mitigation required **in the PR** | Residual |
|---|---|---|---|
| R-1 | F8 posts under an open prompt if `.lock-prompt`/`.reopen-prompt` selector breaks | Keep class names; add explicit signal; ship T-15 regression | Low once T-15 exists |
| R-2 | Role gate lost → cashier sees owner panels | Mechanical `owner &&` move; T-41 per-gate snapshot | Low |
| R-3 | `busy` de-raced → re-entrant posting | Aggregate stays in the same component; no store indirection | Low |
| R-4 | Print root moved inside shell → blank receipts | `body` append untouched; T-42 | Low |
| R-5 | Dirty term dropped → backup while dirty | 7-term OR preserved verbatim | Low |
| R-15 | Scope creep into checkout | T-1 file allowlist | Low once enforced |

P1 risks: window title (R-6), `.desktop-shell` class (R-7), accessible-name drift (R-8), token
collision (R-9), dark mode (R-10), `#checkout-search` focus fallback (R-11), route semantics (R-12).

**Aggregate assessment for Option B:** the change is *financially inert by construction* (the shell
issues four lifecycle commands and performs no monetary arithmetic — see
`FINANCIAL-ISOLATION-VERIFICATION.md` §2–3). The risk is **not** financial corruption; it is
**behavioural regression in keyboard/privilege/print**, which is why the P0 tests are merge-blocking.

---

## 5. Tests that must exist and pass before merge

Merge-blocking, and all currently **PROPOSED** (to be authored in the PR):

| ID | Test | Blocks |
|---|---|---|
| T-1 | File allowlist enforced | Any file outside §2 |
| T-2 | Zero diff under `packages/local-store/**` and `src-tauri/**` | — |
| T-15 | F8 does not post while a prompt is open | R-1 |
| T-18 | Focus restoration after prompt dismissal | R-11 |
| T-41 | Per-role render gates (owner/manager/cashier/restricted) | R-2 |
| T-42 | Receipt + statement print isolation | R-4 |
| T-43 | All 10 panels reachable through the new shell | R-14 |
| T-20 | Token contrast recomputation | Accessibility claim |
| T-45/46/47 | Clean revert + post-revert behaviour | Rollback |

Must also pass unchanged (existing suites): `verify-desktop-contract.mjs` (37), `verify-motion.mjs`
(7), `verify-native-money.mjs` (12), `verify-theme.mjs`, `cargo test -p local-store`, and
`check-ui/focus/checkout/receipts/authorization/backup/customers/retail/inventory-*` (12 suites).

**Not available in this environment and therefore not a merge precondition for Option A:**
L4 Windows/UIA suites, DPI measurements, physical print. For Option B, at minimum
`check-native.py` attach + a UIA name dump must be run on an authorized Windows host before merge,
because R-7/R-8 can only be proven there.

---

## 6. Rollback

| Mechanism | Procedure | Verified by |
|---|---|---|
| **Revert commit** | `git revert <U1+U3>` — new files are additive and unreferenced after revert; `main.tsx` returns to current composition | T-45 |
| **Feature disable** | `tokens.css` import comment-out restores today's exact visuals; no component depends on the tokens until U2 | T-47 |
| **Behavioural safety** | Because no logic is edited, revert restores keyboard/role/print behaviour byte-identically | T-46 |
| **Data safety** | No schema, migration, or persistence change — rollback cannot touch user data | By construction |

Rollback cost: one command, no data migration, no follow-up patch.

---

## 7. Remaining blockers (unchanged by this package)

| Blocker | State | Consequence for the decision |
|---|---|---|
| A2 artifact recovery | **BLOCKED** — TLS terminated by egress proxy; 0 bytes | Cannot review the *historical* installed captures |
| A3 authentic visual verification | **BLOCKED** — 0/28 reviewed; 6 required states absent from the capture plan | Visual acceptance of any slice cannot be evidenced at L4 |
| A4 runtime layout/DPI | **BLOCKED** — no WebView2/Windows host | 125%/150% and High Contrast cannot be measured |
| Windows/UIA regression | **BLOCKED** here | R-7/R-8 cannot be proven before merge |
| Physical print/hardware | **BLOCKED** | Pilot only |

**Residual risk if Option A is authorized while these are blocked:** low and bounded — U1 changes no
markup, so it cannot alter keyboard, privilege, print, or layout behaviour. It also cannot be *seen*
in the installed app until U2 applies the tokens, so it does not depend on the missing visual baseline.

**Residual risk if Option B is authorized while these are blocked:** moderate — the change itself is
code-safe by construction and testable at L3, but its **acceptance cannot be closed** without an L4
run, so the PR would have to be merged with the visual/accessibility gates explicitly deferred.

---

## 8. Conditions this package recommends attaching to any authorization

1. The PR is limited to the §2 allowlist and a reviewer confirms zero diff elsewhere (T-1).
2. The ten merge-blocking tests in §5 exist and pass; no existing assertion is weakened (T-4).
3. `index.html`, `CheckoutPanel.tsx`, `receipt-print.ts` and all financial files are untouched.
4. Nav remains the same three fragment anchors; converting to routes requires a **separate** decision
   (R-12/R-14, new founder question O-11).
5. DEF-1/DEF-7/DEF-8 are **not** remediated in this slice.
6. If Option B proceeds, an authorized Windows run is scheduled to close L4 acceptance before the
   slice is called complete.
7. No merge, no release, no billable CI, no Android/GST/LAN work is implied by the authorization.

---

## 9. What authorization would still NOT permit

Merging (needs review), releasing, publishing an installer, claiming pilot readiness, enabling
`productionSyncEnabled`, integrating #127/#126, adding dependencies, changing tests, or touching
checkout. Authorization for U1+U3 is authorization for those four files only.

---

## 10. Recommendation

**Authorize Option A (U1 alone) now; hold U3 until the P0 regression tests exist.** U1 is additive,
financially inert, invisible-to-behaviour, and cannot regress anything; U3 is a genuine behavioural
change to the most safety-critical UI component in the product and deserves its guard tests first.

The evidence gaps (A2/A3/A4) do **not** block U1 and do block the *acceptance* of U3 — which is the
strongest argument for splitting the two.
