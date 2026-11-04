# U1–U3 REGRESSION ACCEPTANCE PLAN

**SORNIO — Phase 7 / Assignment 4** · Executable acceptance tests for the future U1+U3 production PR.
**Date:** 2026-11-04 (UTC). **Tests executed in this assignment: none** (no toolchain, browser or
Windows host in this environment). Every row therefore carries an explicit **execution status**.

---

## 1. Conventions

**Layers** — a test only counts at the layer where it actually runs:

| Layer | Environment | Trust level |
|---|---|---|
| **L1** | Static repository inspection (`git`, `grep`, file lists) | High — deterministic |
| **L2** | Node verifiers (`scripts/verify-*.mjs`, 34 scripts) and Rust `cargo test` | High — deterministic |
| **L3** | Playwright Chromium with mocked IPC (`check-*.cjs`, 12 suites, 1,525 lines) | Behavioural, **not** installed-app |
| **L4** | Windows UIA against the installed app (`check-native.py`, `check-native-scale.py`) | **Authoritative for installed behaviour** |
| **L5** | Physical hardware / shop pilot | Highest, unavailable |

**Status vocabulary** — `EXISTING` (suite already in the repo, unchanged), `PROPOSED` (must be written
in the U1+U3 PR), `BLOCKED` (cannot run without Windows host or hardware).
**Execution status in this assignment** — `NOT EXECUTED` for all rows. No result is claimed.

A test may not be reported as passing because it exists. Only an executed run with an attached
artifact counts.

---

## 2. Repository integrity

| ID | Test | Layer | Preconditions | Assertion | Expected | Artifact | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| T-1 | File allowlist enforcement | L1 | PR checkout | `git diff --name-only <base>...HEAD` ⊆ {`src/styles/tokens.css`, `src/workspace/AppShell.tsx`, `src/workspace/NavRail.tsx`, `src/main.tsx`} | Exact match, empty difference | `git diff --name-only` log | A8 | **PROPOSED** |
| T-2 | Financial surface unchanged | L1 | PR checkout | `git diff --name-only <base>...HEAD \| grep -E 'packages/local-store/\|src-tauri/'` | empty | same log | A6 | **PROPOSED** |
| T-3 | No dependency change | L1 | PR checkout | `git diff package.json apps/desktop/package.json` and `*.lock` | empty | diff | A8 | **PROPOSED** |
| T-4 | Test assertions unweakened | L1 | PR checkout | review diff of `check-*.cjs`, `check-native.py`, `scripts/verify-*` | no deleted/loosened assertion without founder sign-off | review record | A8 | **PROPOSED** |
| T-5 | Desktop contract intact | L2 | repo root | `node scripts/verify-desktop-contract.mjs` | 37 invariants pass | stdout | A5 | EXISTING · NOT EXECUTED |
| T-6 | Theme invariants | L2 | repo root | `node scripts/verify-theme.mjs` | pass | stdout | A4 | EXISTING · NOT EXECUTED |
| T-7 | Motion invariants | L2 | repo root | `node scripts/verify-motion.mjs` | 7 invariants pass (no transaction-completion motion) | stdout | A4 | EXISTING · NOT EXECUTED |
| T-8 | i18n catalogues | L2 | repo root | `node scripts/verify-i18n.mjs` | 22 catalogues / 2,751 phrases resolve | stdout | A4 | EXISTING · NOT EXECUTED |

---

## 3. Financial isolation

| ID | Test | Layer | Preconditions | Assertion | Expected | Artifact | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| T-9 | Native money suite | L2 | Rust toolchain | `cargo test -p local-store` | all pass incl. `billing_reliability_tests`, `payments_tests`, `customers_tests` | test log | A6 | EXISTING · NOT EXECUTED |
| T-10 | Money formatting invariants | L2 | repo root | `node scripts/verify-native-money.mjs` | 12 invariants; 4,820-invoice sweep; 180 overflow refusals | stdout | A6 | EXISTING · NOT EXECUTED |
| T-11 | Checkout verifier | L2 | repo root | `node scripts/verify-checkout.mjs` | pass | stdout | A6 | EXISTING · NOT EXECUTED |
| T-12 | Mixed split unchanged | L3+L4 | mocked IPC / installed app | existing `check-checkout.cjs` split cases + native `windows-thousand-split-sale.png` block | ₹1,000.00 = ₹600.00 + ₹400.00 + ₹0.00; one invoice; balanced ledger | capture + log | A6 | EXISTING · NOT EXECUTED |
| T-13 | No new financial state in UI | L1 | PR diff | grep added lines for money arithmetic / new native commands | none added | diff | A6 | **PROPOSED** |

---

## 4. Keyboard integrity

| ID | Test | Layer | Preconditions | Assertion | Expected | Artifact | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| T-14 | Shortcut matrix | L3 | mocked IPC | F2 (search), F3 (cart), F4 (review), Enter (confirm flow), Escape (cancel), F8 (retry) each from idle, search-focused, cart-focused, review-open | Each behaves exactly as before | stdout | A5 | EXISTING (`check-focus.cjs`) · NOT EXECUTED |
| T-15 | **F8 suppressed under prompt** | L3 | lock prompt open with dirty state | press F8 | **no posting**; prompt remains; `review`/`pending` unchanged | stdout | A5/R-1 | **PROPOSED (new, P0)** |
| T-16 | Key-repeat suppression | L3/L4 | installing app / mock | hold Enter, `event.repeat`, IME composing | single posting | log | A5 | EXISTING (`CheckoutPanel` guards + `check-checkout.cjs`) · NOT EXECUTED |
| T-17 | Scanner cadence at busy boundary | L4 | installed app | send scanner keystrokes during `Saving…` | input ignored or queued; no second posting; no corruption | capture + log | A5 | **PROPOSED** (D4 scenario 3) |
| T-18 | Focus restoration after prompt | L3 | prompt open from a known control | dismiss | focus returns to that control; if unmounted → `#checkout-search`; never `<body>` | stdout | A5/R-11 | **PROPOSED** |
| T-19 | Tab order | L3+L4 | app loaded | full tab traverse | shell → header → checkout → panels; no trap; no skipped control | log | A4 | EXISTING partial (`check-focus.cjs`) / **PROPOSED** full · NOT EXECUTED |

---

## 5. Accessibility

| ID | Test | Layer | Preconditions | Assertion | Expected | Artifact | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| T-20 | Token contrast arithmetic | L2 | `tokens.css` | recompute every declared pair | meeting §4.1 of the viewport matrix; DEF-1 resolved to ≥3:1; DEF-7 resolved to ≥4.5:1 | script output | A4 | **PROPOSED** (script specified in A4) |
| T-21 | Focus visibility | L3 | app loaded | tab through; sample ring vs adjacent background | ≥3:1 on white **and** app canvas | screenshots | A4 | **PROPOSED** (DEF-8 regression) |
| T-22 | Accessible names preserved | L4 | installed app | attach via `title_re="Sornio.*Local workspace review"`; enumerate 55+ names | all present; no absence-assertion broken | UIA dump | A5 | EXISTING (`check-native.py`) · NOT EXECUTED |
| T-23 | Financial state announcements | L4 | installed app | trigger confirmed / pending / uncertain / refused | `aria-live` announces each; distinct text | capture + log | A4 | EXISTING partial · NOT EXECUTED |
| T-24 | High Contrast / forced-colours | L4/L5 | Windows host, HC theme | load app in HC mode | system colours honoured; no invisible control | capture | A4 | **BLOCKED** |
| T-25 | Reduced motion | L3 | `prefers-reduced-motion: reduce` | load app | 0ms animation/transition preserved | stdout | A4 | EXISTING (`verify-motion.mjs`) · NOT EXECUTED |
| T-26 | Gurmukhi rendering | L3+L5 | long mixed-script names | render cart/receipt | no clipped matras; no amount truncation; print legible | screenshots + physical print | A4 | EXISTING partial / **BLOCKED** for physical |

---

## 6. Viewport integrity

| ID | Test | Layer | Preconditions | Assertion | Expected | Artifact | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| T-27 | 1280×720 | L3 | mocked IPC | measure content width, fold, horizontal scroll | 958px content; no clipping of confirmation | measurements | A4 | **PROPOSED** |
| T-28 | 1366×768 | L3 | as above | as above | 1044px content | measurements | A4 | **PROPOSED** |
| T-29 | 1600×900 | L3 | as above | as above | 1236px content (cap) | measurements | A4 | **PROPOSED** |
| T-30 | 1920×1080 | L3 | as above | as above | 1236px content (cap) | measurements | A4 | **PROPOSED** |
| T-31 | 125% DPI equivalent | L3/L4 | 1024×576 CSS viewport | totals + confirm visible and actionable | both visible without vertical search | capture | R-13 | **BLOCKED** at L4; L3 proposed |
| T-32 | 150% DPI | L3/L4 | 853×480 CSS | layout usable; no overlap | best-effort; documented | capture | A4 | **BLOCKED** |
| T-33 | DPI re-measure at implemented shell | L4 | Windows host | `check-native-scale.py` | pass | captures | A4 | EXISTING · **BLOCKED** |
| T-34 | Text enlargement | L3 | 200% browser zoom | no loss of confirmation | controls reachable | capture | A4 | **PROPOSED** |

---

## 7. Compatibility (routes and panels)

| ID | Test | Layer | Preconditions | Assertion | Expected | Artifact | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| T-35 | Cashier flow intact | L3 | mocked IPC | add item → qty → review → confirm | unchanged | stdout | A5 | EXISTING (`check-checkout.cjs`) · NOT EXECUTED |
| T-36 | Inventory flow | L3 | mocked IPC | add/adjust/acknowledge | unchanged | stdout | A5 | EXISTING (`check-inventory-recovery`, `check-inventory-refresh`) · NOT EXECUTED |
| T-37 | Customer credit flow | L3 | mocked IPC | credit sale, repayment, ledger | unchanged | stdout | A5 | EXISTING (`check-customers.cjs`) · NOT EXECUTED |
| T-38 | Retail day | L3 | mocked IPC | open/close/reconcile | unchanged | stdout | A5 | EXISTING (`check-retail.cjs`) · NOT EXECUTED |
| T-39 | Recovery | L3 | mocked IPC | crash → reopen → retry same id | unchanged | stdout | A5 | EXISTING (`check-inventory-recovery.cjs`) · NOT EXECUTED |
| T-40 | Backup/restore | L3 | mocked IPC | preview, restore | unchanged | stdout | A5 | EXISTING (`check-backup.cjs`) · NOT EXECUTED |
| T-41 | Authorization | L3 | 4 roles | owner/manager/cashier/restricted render gates | **owner-only panels absent for cashier**; no privilege leak | stdout | A5/R-2 | EXISTING (`check-authorization.cjs`) + **PROPOSED** per-gate snapshot · NOT EXECUTED |
| T-42 | Print isolation | L3 | mocked IPC, print media | receipt + statement print | root is `body` child; shell hidden; no blank print | stdout | A5/R-4 | EXISTING (`check-receipts`, `check-statement-print`) · NOT EXECUTED |
| T-43 | Every panel reachable | L3 | app loaded | navigate via new shell | all 10 panels reachable; no dead route; no unreachable panel | stdout | A5/R-14 | **PROPOSED** |
| T-44 | Nav focus/back semantics | L3 | app loaded | navigate between routes, press Back | documented behaviour; focus moves to heading; no lost dirty state | log | A5/R-12 | **PROPOSED** |

---

## 8. Rollback

| ID | Test | Layer | Preconditions | Assertion | Expected | Artifact | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| T-45 | Clean revert | L1 | PR branch | `git revert <U1+U3 commit>` on top of main | applies without conflict; app builds | revert log | A9 | **PROPOSED** |
| T-46 | Post-revert behaviour | L3 | reverted tree | run `check-ui.cjs`, `check-checkout.cjs` | identical to pre-slice behaviour | stdout | A9 | **PROPOSED** |
| T-47 | Additive-only assets | L1 | reverted tree | new files deleted, `main.tsx` restored | no orphan imports; build passes | build log | A9 | **PROPOSED** |

---

## 9. Release-gate mapping

| Gate | Tests that must pass | Blocking today? |
|---|---|---|
| A1 Repository/document integrity | T-1…T-4 | No — runnable at PR time |
| A5 AppShell integration | T-5, T-14…T-19, T-22, T-35…T-44 | Partly — L4 tests **BLOCKED** |
| A6 Financial isolation | T-2, T-9…T-13 | No — L2 runnable |
| A7 Regression completeness | T-15, T-18, T-20, T-21, T-27…T-34, T-41, T-43, T-44 (the PROPOSED set) | **Yes** — must be written before the PR merges |
| A4 Layout/accessibility | T-20, T-21, T-24, T-26, T-27…T-34 | **Yes** — L4 items **BLOCKED** |
| A9 Slice readiness | T-45…T-47 | No |

---

## 10. Honest status summary

| Category | Existing | Proposed (must be written) | Blocked (no host) | Executed here |
|---|---|---|---|---|
| Repository integrity | 0 | 4 | 0 | 0 |
| Financial isolation | 4 | 1 | 0 | 0 |
| Keyboard | 3 | 3 | 1 | 0 |
| Accessibility | 4 | 4 | 2 | 0 |
| Viewport | 1 | 5 | 3 | 0 |
| Compatibility | 8 | 3 | 0 | 0 |
| Rollback | 0 | 3 | 0 | 0 |

**No test in this plan has been run in this assignment.** The plan is judged executable on its
specification quality (A7), not on results. Ten `PROPOSED` tests are P0/P1 and must exist before the
slice can merge; four `BLOCKED` tests cannot be satisfied in this environment at all.
