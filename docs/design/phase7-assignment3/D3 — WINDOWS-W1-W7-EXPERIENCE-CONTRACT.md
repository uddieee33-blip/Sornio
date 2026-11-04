# D3 — Windows W1–W7 Experience Contract

**SORNIO — Phase 7 / Assignment 3** · Workstream C: Windows Experience Contract
**Status:** Implementation-ready specifications. **No production component, route or behaviour was
changed by this assignment.**
**Gate C:** evaluated in §10.

Source mapping is against **current `origin/main` = `1cc5c798d1eada9a16463213b0776c01e99d36f9`**
(verified 2026-11-04). Missing installed-app evidence is carried as an explicit qualification on
each screen (§9).

---

## 0. Cross-screen conventions

- **Grid:** CSS Grid/Flex with logical properties. No fixed per-screen pixel widths; no horizontal
  scrolling for primary checkout controls at required viewports.
- **Required viewports:** 1280×720, 1366×768, 1600×900, 1920×1080 (100%); plus 1280×720 at 125%
  scaling (effective ~1024×576 CSS px). 150% to be measured at implementation.
- **Effective-width behaviour:** at ≤1024 effective CSS px the rail collapses 216px → 64px icon
  rail → 48px; the right payment panel narrows 360–420px → 320px; total + confirm stay pinned.
- **Scroll ownership:** one scroll owner per region; internal vertical scrolling allowed inside
  product results, cart rows, ledger tables. Never the whole page when a workspace is active.
- **Money:** `money(paise)` BigInt/en-IN only; tabular numerals; `₹` + grouping + two decimals.
- **Status:** text + icon/shape + colour (never colour alone).
- **Native authority:** every payment preview states that the native store revalidates before
  posting. Renderer never prices, totals, settles or verifies digital payments.

---

## 1. W1 — Application shell

**1. Existing source components and routes**
- `apps/desktop/src/main.tsx` — `App` component; `AccessGate.tsx` wraps it; `style.css`
  `.desktop-shell` grid `238px 1fr`. Single long `.page` scroll; rail has 3 links
  (Workspace draft / Checkout / Items & stock); topbar 73px.

**2. Proposed visual composition**
- Persistent app shell: dark narrow rail (216px expanded / 64px icon / 48px compact) + top status
  bar + route-level workspace view + optional right panel.
- Rail: wordmark, `aria-current` selected workspace, offline/day/status indicators, lock action.
- Topbar: business name · principal · role; `On this PC` chip; `Day open`; `Lock workspace`.
- Status region: saved / pending / refused / uncertain / offline — persistent, `aria-live`.

**3. Desktop grid and layout behaviour**
- `grid-template-columns: [rail] 216px [workspace] 1fr ([right] 360–420px)`; rail fixed height,
  content scrolls in workspace.
- Responsive gutters: 16px @1280, 24px @1366, 32px @1600, 40px @1920.
- Route title semantics: one `h1` per workspace view; view heading carries business day and
  primary action.

**4. Minimum width and height constraints**
- Window minimum remains 760×580 (Tauri). Operational floor: 1280×720 at 100%.
- At 125% (effective ~1024×576): rail 48px, right panel 320px, primary total/confirm pinned.

**5. Keyboard and focus behavior**
- Skip link → rail → view heading → first working control. `Tab` order matches DOM order.
- F-keys unbound inside nav. No keyboard traps. Focus restoration on lock/reopen prompts
  (existing `restoreFocusRef` pattern preserved).

**6. Accessibility requirements**
- Landmarks: `banner/navigation/main`; skip link; `aria-current` on selected nav; `h1` per view.
- Status region `role=status`/`role=alert` for failures; persist until acknowledged.

**7. Financial and permission boundaries**
- Navigation is orientation, never authorization. Hidden modules show explicit admin explanation,
  never a dead link. Owner/manager-only actions remain native-enforced (`access.rs`).
- **Dirty/busy navigation restrictions:** existing `dirtyOwners`/`busyOwners` coordination and
  `beforeunload` must be preserved; navigation during busy checkout is blocked, not silently
  allowed.

**8. Existing tests affected**
- `check-ui.cjs`, `check-focus.cjs`, `check-authorization.cjs`, `check-native.py` (UIA names,
  lock/unlock, focus races), `check-installer.ps1` lifecycle stages.

**9. New tests required**
- Layout regression at 1280×720/1366×768/1600×900/1920×1080 + 125%; rail collapse behaviour;
  status region announcements; `aria-current` assertions; no-dead-link assertion for hidden
  modules.

**10. Implementation dependencies**
- Semantic token contract (D2 §2) must land first. `main.tsx` keeps state coordination; new
  route-level shell composes it.

**11. Explicitly prohibited behaviour changes**
- Renaming UIA control names; removing `beforeunload`/dirty coordination; changing lock/unlock
  semantics; granting renderer-side permissions; removing the `On this PC` local-only identity.

---

## 2. W2 — Cashier interface

**1. Existing source components and routes**
- `apps/desktop/src/CheckoutPanel.tsx` (553 lines); checkout is one panel in the long mixed-module
  scroll; `retailRef` + `operationId` (crypto.randomUUID) idempotency; split inputs
  (`split-cash`, `split-upi`, `split-card`, `split-credit`, `split-ref-upi`, `split-ref-card`).

**2. Proposed visual composition**
- Dedicated two-region cashier workspace: center region (search/results/cart) + pinned right
  panel (customer, totals, payment allocation, confirm).
- Persistent totals area: subtotal · tax · **TOTAL ₹1,000.00** (grouped totals, refinement R1),
  with `Confirm sale` / `Review sale` / `Start next sale` / `F8 recover`.
- Stable quantity controls with stock ceiling feedback; price/discount visibility per line.

**3. Desktop grid and layout behaviour**
- Center region takes remaining width; right panel 360–420px (320px at ≤1024 effective).
- Cart is a table with sticky header; internal vertical scroll for long carts; no horizontal
  scroll at any required viewport.

**4. Minimum width and height constraints**
- 1280×720 baseline: search, first results, cart head and persistent totals all visible without
  scrolling the right panel; totals/confirm never clipped.
- 125%: totals + confirm pinned (this is the stress test — cannot be substituted by shrinking a
  static screenshot; must be measured in a real WebView2 viewport).

**5. Keyboard and focus behavior**
- **Preserve exactly:** F2 search, F3 quantity cycle, F4 review, Enter add exact code / confirm,
  F8 recover pending sale, Escape cancel. `event.repeat` and IME composition guards remain.
- Enter on exact SKU adds/increments; on multiple matches requires selection; scanner cadence
  (rapid Enter) must not double-fire.
- Review → confirm auto-focus; success heading after posting.

**6. Accessibility requirements**
- `aria-live` total announcement (existing `output` element preserved); search `role=searchbox`
  semantics via label; cart table `scope`; quantity inputs labelled with product + unit; errors
  associated with fields and announced.
- 44px primary confirm; visible focus on every control.

**7. Financial and permission boundaries**
- Exact-paise split equality (`cash + upi + card + credit === totalPaise`) is a hard client rule;
  native `payments.rs` remains authoritative.
- `customerId` required iff a credit part exists. UPI/card explicitly `unverified`.
- Operation ID is generated once and reused on retry; no new operation ID on selection or refresh.
- Review-before-post: no sale posts without `Confirm sale`; previews always labelled as previews.

**8. Existing tests affected**
- `check-checkout.cjs`, `check-focus.cjs`, `check-receipts.cjs`, `check-native.py` (cashier
  blocks, repeated-submit burst, scanner-cadence blocks), `check-ui.cjs`.

**9. New tests required**
- Layout at 5 required viewports (total/confirm visibility); 125% content-viewport measurement;
  long mixed-script product names (wrap, no truncation of amounts); 100-line cart usability;
  search latency on shop-class hardware (targets in D2 §10 are proposals, not claims).

**10. Implementation dependencies**
- W1 shell first; `CheckoutPanel` logic is composed, not replaced; `billing-types.ts` `money()`
  untouched.

**11. Explicitly prohibited behaviour changes**
- Renaming `Confirm sale`/`Review sale`/`Retry same sale`/`Start next sale`/`Print saved receipt`;
  changing F2/F3/F4/Enter/F8/Escape semantics; floating-point money; new posting path; weakening
  exact-split equality; auto-verifying UPI/card.

---

## 3. W3 — Split-payment reconciliation

**Reference transaction (must be preserved exactly):**

| Field | Value |
|---|---|
| Invoice total | ₹1,000.00 |
| Cash payment | ₹600.00 |
| Customer credit | ₹400.00 |
| Remaining allocation | ₹0.00 |

**1. Existing source components and routes**
- `CheckoutPanel.tsx` split fieldset + `prepare_local_retail`/`post_local_retail` (native);
  `packages/local-store/src/billing.rs:321-344` (split credit part), `payments.rs` (part sum
  equality), `customers.rs:480+` `post_split_credit` (P0 fix on main), `credit_sale_once` unique
  index.

**2. Proposed visual composition**
- Allocation table: Method | Amount | Status — Cash `● recorded`, UPI `○ pending — unverified`,
  Card `○ pending — unverified`, Customer credit `▢ outstanding`.
- Grouped totals (R1): subtotal, tax, total; **allocated ₹600.00 + ₹400.00 = ₹1,000.00**;
  remaining ₹0.00; native revalidation notice.
- Preview clearly differentiated from native posting: `PREVIEW ONLY — NOT POSTED`.

**3. Desktop grid and layout behaviour**
- The allocation table sits in the pinned right payment panel (W2); status column narrow but text
  never truncated; at 125% the table rows stay actionable.

**4. Minimum width and height constraints**
- All four methods + amounts + status + remaining visible at 1280×720 and at 125% effective
  viewport without horizontal scroll.

**5. Keyboard and focus behavior**
- Tab order cash → upi → card → credit; Enter confirms review; Escape cancels review.
- Keyboard-driven amount entry with exact-paise validation messages (`Split payment amounts must
  equal the invoice total exactly`).

**6. Accessibility requirements**
- Status text + icon/shape (never colour alone); `aria-live` remaining-balance updates; labels
  associated with inputs; unverified wording mandatory for UPI/card.

**7. Financial and permission boundaries**
- Allocation arithmetic must be exact; all financial amounts derive from authoritative state
  (native `read_cashier_state`).
- Preview is differentiated from native posting; success appears only after authoritative
  confirmation.
- Customer identification and credit-limit validation remain enforced natively
  (`post_split_credit` validates limit, amount > 0, amount ≤ total).
- Unverified payment instruments must never be represented as settled.
- No frontend-only workaround for native financial limitations.
- **`Fill remaining` is NOT approved** until its arithmetic, interaction semantics and native
  validation boundary are fully specified (see D6 open decisions).

**8. Existing tests affected**
- `check-checkout.cjs`, `check-native.py` (mixed cash+credit blocks: `windows-mixed-cash-credit-sale.png`,
  `windows-thousand-split-sale.png`, `windows-thousand-split-reopened.png`, `windows-mixed-split-reopened.png`),
  native `payments_tests.rs` / `billing_reliability_tests.rs`.

**9. New tests required**
- Exact ₹1,000.00 = ₹600.00 + ₹400.00 regression through the new presentation (UI + native);
  remaining-balance announcement; credit-without-customer refusal; over-allocation refusal;
  allocation mismatch scenario (D4 §scenarios 12, 15).

**10. Implementation dependencies**
- W2 composition; native `prepare_local_retail`/`post_local_retail` untouched; `post_split_credit`
  untouched.

**11. Explicitly prohibited behaviour changes**
- Changing split equality rule; relaxing customer requirement for credit; presenting UPI/card as
  verified; frontend-only posting; altering `credit_sale_once`; approving `Fill remaining`
  implicitly through layout work.

---

## 4. W4 — Inventory

**1. Existing source components and routes**
- `InventoryPanel.tsx` (176 lines); native: `list_local_products`, `add_local_product`,
  `adjust_local_stock`, `pending_local_inventory`, `acknowledge_local_inventory`;
  `inventory_recovery.rs`; QuantityMilli stock aggregation (PR #142).

**2. Proposed visual composition**
- Focused stock route: search, product/variant rows with stock quantity, availability status,
  warnings, adjustment controls, audit/revision info.
- Status shapes: available (●), low stock (○ warning), out of stock (⛔), revision stale (△).

**3. Desktop grid and layout behaviour**
- Table-first; columns: product/variant, SKU/barcode, stock, availability, actions, revision.
- At ≤1024 effective px, non-essential columns hide; stock quantity and warnings stay visible.

**4. Minimum width and height constraints**
- Table remains readable at 1280×720; warnings never clipped; action buttons reachable.

**5. Keyboard and focus behavior**
- Search-first entry; Enter edits first result; adjustments use existing two-step acknowledge
  flow (`Save item` → `Acknowledge item save`).

**6. Accessibility requirements**
- Table `scope`/caption; availability never colour-only; revision/stale states announced.

**7. Financial and permission boundaries**
- **Do not create a parallel inventory state machine.** All stock state derives from native
  inventory commands; the renderer shows `checkout_active` gating (catalog edits blocked while
  checkout checkpoint unresolved) — preserve it.
- `canAdd`/`canCorrect` role gates preserved.

**8. Existing tests affected**
- `check-inventory-recovery.cjs`, `check-inventory-refresh.cjs`, `check-checkout.cjs`
  (checkout_active gating), `check-native.py` (stock blocks).

**9. New tests required**
- Layout at required viewports; warning visibility; revision-stale presentation; non-essential
  column hiding at 125%.

**10. Implementation dependencies**
- W1 shell; native inventory commands unchanged.

**11. Explicitly prohibited behaviour changes**
- Parallel stock state; renderer-side stock writes; removing checkout_active gating; changing
  acknowledge semantics (duplicate stock inward protection).

---

## 5. W5 — Customer credit

**1. Existing source components and routes**
- `CustomerPanel.tsx` (182 lines) + `CustomerLookup.tsx`; native: `save_local_customer`,
  `find_local_customers`, `prepare_local_credit`, credit ledger (`customers.rs`); statement print
  (`check-statement-print.cjs`, `receipt-print.ts`).

**2. Proposed visual composition**
- Clear blocks: current credit balance (outstanding), credit limit / available, repayments, ledger
  history, failed/reversed operations.
- Status: outstanding (▢), overdue (△), within limit (●), limit exceeded (⛔).

**3. Desktop grid and layout behaviour**
- Summary cards + ledger table; internal scroll for long ledgers; amounts tabular right-aligned.

**4. Minimum width and height constraints**
- Balance + limit + last ledger row visible at 1280×720; no truncation of balances.

**5. Keyboard and focus behavior**
- Lookup by phone/name/ID; Escape closes lookup; repayment uses review-then-confirm with
  auto-focused confirm (existing pattern).

**6. Accessibility requirements**
- Debt status text + shape; `aria-live` balance updates; labels associated; statement print
  re-verifies snapshot consistency (existing behaviour preserved).

**7. Financial and permission boundaries**
- No stale or unverified figures presented as authoritative — balances always come from native
  read; credit-limit refusal (`CreditLimit`) shown natively.
- Cashier role restrictions preserved (cashier lacks owner fields/balances per role).

**8. Existing tests affected**
- `check-customers.cjs`, `check-statement-print.cjs`, `check-checkout.cjs` (customer selection),
  `check-native.py` (customer blocks).

**9. New tests required**
- Balance/limit display at required viewports; limit-exceeded presentation; stale-read handling;
  statement print snapshot regression.

**10. Implementation dependencies**
- W1 shell; native customer commands unchanged.

**11. Explicitly prohibited behaviour changes**
- Renderer-side balance computation; presenting cached/stale figures as current; bypassing
  credit-limit validation; changing statement print authorization flow.

---

## 6. W6 — Transaction recovery

**1. Existing source components and routes**
- `SavedCopies.tsx`, `BackupPanel.tsx`, `main.tsx` dirty coordination; native: `recovery.rs`,
  `pending_local_retail`, `clear_local_retail`, `restore_workspace`, `list_workspace_copies`,
  `choose_local_backup`, `preview_local_backup`, `restore_local_backup`; `check-installer.ps1`
  `--verify-preserved`.

**2. Proposed visual composition**
- Dedicated recovery state: `△ Result uncertain — retry same sale` with **original operation ID**
  displayed and `↺ Retry same sale (F8)` primary action; confirmed failure (`⛔ Refused — edit
  this sale`); successful completion (`✓ Sale saved on this PC`); safe retry availability stated
  explicitly.
- Restart recovery: pending sale survives relaunch; checkpoint preserved.

**3. Desktop grid and layout behaviour**
- Recovery state occupies the checkout workspace (not a lower-page panel); operation ID is
  selectable/copyable but never editable.

**4. Minimum width and height constraints**
- Recovery state + retry action visible at 1280×720 without scrolling away.

**5. Keyboard and focus behavior**
- F8 retries with the same operation ID; Enter on retry; Escape returns to draft state.
- Retry must not mint a new operation ID or clear the cart silently.

**6. Accessibility requirements**
- `role=alert` for uncertain/refused; `aria-live` recovery status; operation ID announced;
  focus moves to retry control.

**7. Financial and permission boundaries**
- Preserve the original operation identity. Retry must not generate a second sale.
- UI distinguishes confirmed failure / unknown outcome / successful completion / safe retry
  availability.
- **Do not assert duplicate prevention is verified without native test evidence** — the existing
  idempotency tests (`duplicate_mixed_sale_request_posts_once`, repeated-submit burst in
  `check-native.py`) are the current evidence; new presentation must re-run them.

**8. Existing tests affected**
- `check-retail.cjs`, `check-inventory-recovery.cjs`, `check-installer.ps1`, `check-native.py`
  (reopened/restored blocks), `verify-desktop-contract.mjs`.

**9. New tests required**
- Recovery state presentation at required viewports; same-ID retry regression; uncertain-outcome
  visual contract; backup restore presentation.

**10. Implementation dependencies**
- W1 shell; native recovery/replication untouched (`productionSyncEnabled=false`).

**11. Explicitly prohibited behaviour changes**
- New operation ID on retry; silent cart clearing; treating unknown outcome as failure or success;
  weakening backup confirmation phrase / safety-backup requirements; replication enablement.

---

## 7. W7 — Onboarding

**1. Existing source components and routes**
- `AccessGate.tsx` (unlock), `main.tsx` first-workspace draft form (`business-name`,
  `business-type`, `workspace-note`); `setup_local_access` native command; `dailyWorkspace()`
  templates (web portal IDs: salon/gym/cafe/kirana/general).

**2. Proposed visual composition**
- Deterministic 3-step setup: business identity (name + type + template preview) → owner account →
  confirm offline workspace. Step indicator; Back/Continue; final `Set up local access`.
- Template preview: Counter · Stock · Khata · Day close (only implemented modules enabled).

**3. Desktop grid and layout behaviour**
- Single centered 480px card; at ≤1024 effective px reduce gutters; never stack currency/identity
  fields.

**4. Minimum width and height constraints**
- 480px card fits at 1280×720 with step indicator and actions visible.

**5. Keyboard and focus behavior**
- First field focused on step entry; first invalid field on error; final confirm on last step;
  Enter submits; Escape never discards silently.

**6. Accessibility requirements**
- Field labels associated; error summary + focus to first invalid; loading state disables form
  with `aria-busy`; no silent data reset.

**7. Financial and permission boundaries**
- **Do not change existing industry templates, schemas or business setup behaviour.**
- Cycle/hardware retail template identifiers remain unresolved until verified — map to `general`
  for V1; do not pretend a module exists.
- Offline setup works without network; invalid profile falls back to general retail.

**8. Existing tests affected**
- `check-installer.ps1` (first-setup stage), `check-authorization.cjs` (setup/unlock),
  `verify-onboarding.mjs`, `check-native.py` (`windows-first-setup.png`, `windows-unlock.png`).

**9. New tests required**
- Step navigation keyboard/focus; error focus behaviour; template preview at required viewports;
- offline first-setup regression.

**10. Implementation dependencies**
- W1 shell; `setup_local_access` contract unchanged.

**11. Explicitly prohibited behaviour changes**
- Adding statutory fields (GSTIN/legal address/FSSAI) as design-only additions; mutating
  historical business name; changing `setup_local_access` semantics; enabling unimplemented
  templates.

---

## 8. Screen-to-source traceability summary

| Screen | Source (current main) | Prototype (design branch) | Missing qualification |
|---|---|---|---|
| W1 shell | `main.tsx`, `style.css` | `W1-application-shell.png` (A/B) | Installed-app capture not reviewable here |
| W2 cashier | `CheckoutPanel.tsx` | `W2-cashier-workspace.png` + 5 responsive captures | Installed-app capture + 125% measurement blocked |
| W3 split | `CheckoutPanel.tsx`, `billing.rs`, `payments.rs`, `customers.rs` | `W3-split-payment-reconciliation.png` | ₹1,000 split CI-verified on integration head; pixel review blocked |
| W4 inventory | `InventoryPanel.tsx`, inventory native commands | `W4-inventory.png` | Installed-app capture blocked |
| W5 credit | `CustomerPanel.tsx`, `CustomerLookup.tsx`, customers native | `W5-customer-credit.png` | Installed-app capture blocked |
| W6 recovery | `SavedCopies.tsx`, `BackupPanel.tsx`, recovery native | `W6-transaction-recovery.png` | Installed-app capture blocked |
| W7 onboarding | `AccessGate.tsx`, `main.tsx`, `setup_local_access` | `W7-business-onboarding.png` | Installed-app capture blocked; cycle/hardware template IDs unresolved |

---

## 9. Installed-app evidence qualification (carries to every screen)

Per Workstream A (D1 §5): authentic installed-Windows captures were **not retrievable** in this
sandbox (Azure blob egress block; no Windows machine). Every W-screen specification above is
**source-grounded**, and its visual verification remains pending authentic capture review. No
browser render or prototype is promoted to installed-app evidence.

---

## 10. Gate C evaluation

| Requirement | Status | Evidence |
|---|---|---|
| Every W1–W7 screen has implementation-ready spec | ✅ | §1–§7 (11 items each) |
| Traceable mapping to present application | ✅ | §8 traceability table + source references |
| Missing installed-app evidence remains visible | ✅ | §9 qualification + D1 §5.7 |
| W3 reference transaction preserved | ✅ | §3 reference table; native code verified on main |
| Prohibited behaviour changes listed | ✅ | item 11 per screen |
| New tests required identified | ✅ | item 9 per screen + D4 matrix |

**Gate C verdict: PASS** on specification readiness. **Qualification:** visual acceptance of the
prototypes against real installed-app rendering is BLOCKED (D1 §5.7); the 125% stress test is
specified but not measurable in this sandbox.
