# SORNIO — Phase 7 Implementation Roadmap

**Status:** recommended future sequence only. **Do not begin implementation automatically.** This document and its four companions are the complete deliverable for Assignment 1.

**Audit source:** `97b6899475cc3dfa3ff1370f59373401646eecfb` (PR #145 integration head; code parent of current `main`).
**Current `main`:** `1cc5c798d1eada9a16463213b0776c01e99d36f9` (external merge of PR #145 during this audit).
**Working branch:** `arena/2c0afc32-sornio`, based on `005f27a7702b37916ae517b7f37360c0e9ce436f`.
**Non-negotiable boundary:** `productionSyncEnabled=false`, `SCHEMA_VERSION=12`, PR #145 and existing financial tests preserved, current application behavior unchanged, no production dependency change.

---

## 1. Critical evaluation of the proposed future sequence 7A–7F

| Phase | Proposed scope | Evaluation | Recommended change |
|---|---|---|---|
| **7A** | Complete design system and application shell | Necessary first, but too large as one milestone: it mixes a non-visual token contract with navigation changes that can break `App`'s dirty/busy coordination and UIA focus tests. | Split into **7A.1 token/a11y contract** and **7A.2 shell/navigation**. Keep light-first tokens and remove automatic dark financial-surface inversion only as a separately reviewed decision. |
| **7B** | Cashier workspace redesign | Highest user value, but depends on 7A.2's view shell. It must not be implemented before the founder approves the two-primary-region correction to the literal three-region proposal. | Keep as second implementation milestone; add a hard gate for installed-app screenshot evidence and keyboard regression. |
| **7C** | Inventory, customers, returns, closing, settings | Correct sequence, but lighter specs are safer than full rewrites. Every module has UIA/Playwright contracts and native refresh-token semantics. | Keep after 7B; implement view-level composition first, do not rename controls or change posting paths. |
| **7D** | Business profile and onboarding | Premature if it adds statutory fields or a mutable historical business name. Existing setup already captures `businessType` but does not use it. | Move after 7C; scope to deterministic profile/preview only. GSTIN/legal address/FSSAI are future product requirements, not design-only additions. |
| **7E** | Adaptive workspace, manual customization, optional AI | Highest architectural risk. AI must not infer permissions, hardware support or financial policy; web `dailyWorkspace()` links are dead ends on desktop. | Keep late. Deterministic registry + manual customization first; AI advisory only and fully optional. No schema migration in this assignment. |
| **7F** | Platform consistency and final audit | Correct as a final check, but cross-platform token mapping should not precede Windows physical hardware acceptance. | Keep last; add Windows 100/125/150% DPI, physical printer/scanner, High Contrast, screen reader and packaging checks. |

### Added prerequisite: 7.0 Evidence and approval gate

Before any production UI work:

1. Founder reviews the five Phase 7 documents and explicitly approves the blueprint.
2. Retrieve or re-run the `Sornio-Local-Native-Captures` artifact in an authorized environment; visually review all current installed-app screenshots and record a reviewed manifest.
3. Execute the physical Windows pilot package: clean offline install, USB HID scanner, 58/80mm/A4 printer, Punjabi paper output, forced process termination, backup media, 1280×720 at 125/150% scaling.
4. Resolve the code-signing gate (no certificate infra exists; unsigned builds remain engineering-only).
5. Re-run the full `npm run verify` chain and `local-windows` job on the exact head before any UI change.
6. Confirm no open P0 financial, authorization or hardware finding.

**7.0 is not a design task; it is an evidence and release-safety gate.** Phase 7 documentation does not close it.

---

## 2. Recommended sequence

| Step | Milestone | Depends on | Complexity | Regression risk | Acceptance criteria / exit gate |
|---|---|---|---|---|---|
| 7.0 | Evidence + founder approval | Physical PC, artifact access, signing decision | M — coordination | None to code | Reviewed screenshot manifest, physical pilot result, explicit founder approval. |
| 7A.1 | Token + accessibility contract | 7.0 | S–M | Low: documentation and a future isolated token stylesheet | Contrast table for every semantic token, focus ≥3:1, forced-colors rules, 44px targets, reduced motion, en-IN/Gurmukhi rules. No app behavior change. |
| 7A.2 | Application shell + workspace views | 7A.1 | L | **High:** `main.tsx` dirty/busy/refresh coordination, lock/reopen focus, `beforeunload`, UIA names | Existing `check-ui.cjs`, `check-focus.cjs`, `check-authorization.cjs`, `check-native.py` pass; `aria-current`; no panel removed from state coordination. |
| 7B | Cashier two-primary-region workspace | 7A.2 | L | **Critical:** operation ID, shortcuts, split equality, print snapshot | All existing checkout/receipt/retail/focus/native tests pass; ₹1,000 split and repeated-submit burst pass; required viewports show total/confirm; new layout/fill-remaining/status tests pass. |
| 7C | Operational module views | 7B | M–L | High: inventory acknowledgement, customer statement reauthorization, returns reason, closing variance | Existing inventory/customer/retail/backup/authorization tests pass; no UIA label rename without coordinated test change; no new posting path. |
| 7D | Deterministic business profile + onboarding | 7C | M | Medium: setup values, historical receipt immutability | `setup_local_access` contract unchanged, business name/type do not mutate receipts, offline setup works, invalid profile falls back to general retail. |
| 7E | Adaptive workspace | 7D | L | High: hidden financial paths, permissions, schema | Registry contains only implemented modules; manual overrides are reversible; offline fully works; AI is advisory, opt-in, redacted and absent by default; no `SCHEMA_VERSION` change in this assignment. |
| 7F | Platform consistency + audit | 7E | M | Medium: web/mobile token drift, cross-platform claims | Web/mobile design systems mapped, not overwritten; no new runtime dependency; Windows performance targets validated on physical hardware; accessibility and localization audit. |
| Gate | Founder-approved implementation PR(s) | 7F | — | — | Separate PRs per milestone, all CI green, no protected-branch push, no merge without founder instruction. |

Complexity bands: **S** = isolated documentation/CSS token work; **M** = several components with existing contracts; **L** = cross-cutting shell/financial-state coordination.

---

## 3. Proposed component architecture (illustrative only)

```
apps/desktop/src/
  main.tsx                     # keep as global state coordinator
  AccessGate.tsx               # keep
  native.ts, access.ts         # keep native authority
  billing-types.ts             # keep BigInt/en-IN money
  workspace/                   # future, NOT CREATED
    AppShell.tsx
    NavRail.tsx
    TopStatus.tsx
    WorkspaceView.tsx
    WorkspaceRegistry.ts
    WorkspacePreferences.ts    # future; requires schema decision
  cashier/                     # future, NOT CREATED
    CashierWorkspace.tsx       # composes existing CheckoutPanel logic
    ProductDiscovery.tsx
    CartTable.tsx
    CustomerSelector.tsx
    PaymentAllocation.tsx
    ReviewSummary.tsx
    SaleResult.tsx
    ReceiptPanel.tsx
  ui/                          # future, NOT CREATED
    Button.tsx, Input.tsx, Select.tsx, Combobox.tsx,
    DataTable.tsx, StatusIndicator.tsx, Amount.tsx,
    Dialog.tsx, EmptyState.tsx, LoadingState.tsx
  styles/                      # future, NOT CREATED
    tokens.css
    layout.css
    components.css
    high-contrast.css
```

Architecture rules:

1. **No new runtime dependency.** React 19.3.1, TypeScript, Vite and plain CSS are sufficient. Tailwind is not introduced into `apps/desktop`.
2. `App` still owns `dirtyOwners`, `busyOwners`, refresh tokens, lock/reopen prompts and `beforeunload`.
3. `CheckoutPanel` business logic is extracted/composed, **not replaced** with a new calculation layer.
4. Tokens are CSS custom properties; high-contrast and print overrides are separate files but ship in the same bundle.
5. Accessible names, IDs and focus behavior are treated as a public contract with `check-native.py` / `check-*.cjs`.
6. No renderer-side filesystem, SQL, raw path, network, auth or financial authority is added. Tauri capabilities remain unchanged.
7. `SavedInvoice`, `receipt-print.ts`, `CustomerPanel` statement printing and `BackupPanel` safety behavior are wrapped, not rewritten from scratch.
8. Web `app/`, `components/`, `lib/` and mobile `apps/mobile/` stay outside this work until 7F mapping.

---

## 4. Dependency and order constraints

| Dependency | Why it gates later work |
|---|---|
| Installed-app screenshot review | Visual conclusions in this audit are qualified; design sign-off needs authentic current pixels. |
| Physical Windows printer/scanner pilot | Browser print previews and keyboard wedge tests do not prove paper output, Gurmukhi contrast, driver margins or HID timing. |
| Code signing | Phase 6 records BLOCKED; unsigned builds are engineering-only. |
| `check-native.py` / `check-*.cjs` / verifiers | They assert exact UIA names, focus, operation IDs, `₹1,000.00`, restart/reinstall and role boundaries. |
| `main.tsx` dirty/busy coordination | Separating views without preserving it could allow lock/restore with unsaved work. |
| Native Rust authority | All money, stock, credit, session and restore decisions remain in `packages/local-store`. |
| `productionSyncEnabled=false` | Adaptive workspace must not imply cloud or multi-till synchronization. |
| `SCHEMA_VERSION=12` | Persisting preferences needs a separately reviewed migration; do not change schema in this assignment. |
| Founder approval | User explicitly said stop and present blueprint; no implementation is automatic. |

---

## 5. Regression risks and required guardrails

| Risk | Guardrail |
|---|---|
| Duplicate sale from a redesigned confirm path | Keep one `postNew()` per checkout, `submitting` ref, `prepare_*` before `post_*`, repeated Enter/Space burst test, same operation ID on F8. |
| Changed split arithmetic | Keep `parseFixedDecimal(...,2)`, BigInt paise, exact sum and one credit part; `Fill remaining` is presentation-only. |
| Unverified digital payment shown as verified | Preserve `unverified`, `Pending — unverified`, `Externally verified: ₹0.00`, and text/icon/shape status. |
| Float corruption of large balances | Never divide cumulative paise by 100 with a JS number; keep `money()` and `billing-types.ts` warning. |
| Receipt print posts or mutates a sale | Keep `SavedInvoice.print()` snapshot reauthorization; print failure leaves ledger unchanged. |
| Customer credit limit bypass | Native `credit_limit` remains authoritative; UI only explains available credit. |
| Stock posted twice | Native revision fencing, `local_invoice_stock`, and installed-UI balances remain tested. |
| Permission escalation through navigation | Registry visibility is not authorization; Rust `with_scoped_workspace` remains the gate. |
| Lost focus for keyboard cashiers | Keep F2/F3/F4/F8/Escape/Enter, `pendingFocus`, review/confirm focus, `Start next sale` → search, and lock/reopen focus restoration. |
| Lock/restore during unsaved work | Preserve `dirty`/`busy` sets and `beforeunload`; add cross-view regression test. |
| Punjabi receipt clipping | Bundled OFL Gurmukhi font, mixed-script line height/padding, physical 58/80mm/A4 validation. |
| Dark/High Contrast status ambiguity | Light-first operational theme, `forced-colors` system colours, never colour-only status. |
| Production sync accidentally enabled | `productionSyncEnabled=false`; no replication adapter, flag or cloud setting change. |
| Schema drift | `SCHEMA_VERSION=12` and `verify-local-schema.py` remain unchanged in this assignment. |
| Test assertion weakening | Do not edit existing financial assertions to accommodate UI changes; add new UI tests instead. |
| New dependency / licence risk | No new runtime dependency; verify any font licence before bundling. |

---

## 6. Testing strategy

Unchanged existing gates that must stay green after any future implementation:

- `apps/desktop/check-native.py`, `check-checkout.cjs`, `check-receipts.cjs`, `check-retail.cjs`, `check-focus.cjs`, `check-authorization.cjs`, `check-ui.cjs`, `check-customers.cjs`, `check-backup.cjs`, `check-inventory-recovery.cjs`, `check-inventory-refresh.cjs`, `check-statement-print.cjs`, `check-credentials.cjs`, `check-windows-evidence.py`, `test_windows_evidence.py`.
- `scripts/verify-native-money.mjs`, `verify-desktop-contract.mjs`, `verify-checkout.mjs`, `verify-native-invoice.mjs`, `verify-mobile-contracts.mjs`, `verify-replication.mjs`, `verify-local-schema.py`, full `npm run verify`.
- Rust `cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml` in debug and release on the Windows runner.
- CI `Lint, types, build`, `Contracts, types, security`, `Dependency audit`, `browser`, `local-windows`, Android/iOS compile and PostgreSQL checks.
- Physical pilot package: clean offline install, scanner, 58/80mm/A4 print, Punjabi output, process kill, backup restore, Windows scaling.

New tests are **proposed** in `PHASE-7-CASHIER-WORKSPACE-BLUEPRINT.md` section 6 and must be additive. No existing financial test assertion is changed in this assignment.

---

## 7. Open product decisions

1. Approve two-primary-region cashier layout, or require a literal 320px left context strip at ≥1600px only.
2. Approve light-first operational theme and decide whether a separately reviewed dark theme is ever required.
3. Default density: comfortable vs compact; physical operator testing should decide.
4. Minimum supported effective CSS viewport at 125/150% Windows scaling.
5. Full Punjabi UI localization scope vs receipt-only localization.
6. Whether statutory business fields (GSTIN, legal name, FSSAI, tax invoice) are a funded product requirement; they are not implemented today.
7. Whether to add `Fill remaining` and, if so, which tender receives the remainder by default.
8. Whether customer slug auto-generation may be added without changing native ID constraints.
9. Whether a `cycle-parts` template ID is approved or mapped to `general`/`electronics`.
10. Whether salon/gym/cafe templates may hide `items & stock` by default.
11. Device capability evidence threshold for `tested` status; physical printer/scanner results are currently untested.
12. Code-signing provider and release identity; no certificate infrastructure exists.
13. Who may change workspace configuration and whether manager changes require owner approval.
14. Where adaptive preferences are persisted without changing `SCHEMA_VERSION=12` in this assignment.
15. Whether cross-platform token mapping should include the ten-theme web palette or only semantic roles.
16. Whether the 15-minute idle lock should show an unresolved-sale explanation before locking.

---

## 8. Design Decision Records

Each record below uses exactly ten fields: (1) ID/Title, (2) Evidence, (3) Decision, (4) Alternatives, (5) Usability benefit, (6) Accessibility impact, (7) Financial/regression risk, (8) Dependencies/complexity, (9) Acceptance evidence, (10) Status/open decision.

### DDR-01
1. **ID/Title:** DDR-01 — Dedicated workspace views instead of one long scroll page.
2. **Evidence:** `main.tsx:153-193` renders all modules stacked; `operator-ux-review-2026-11-02.md` deferred top-level tabs; three sidebar anchors with hardcoded `selected`.
3. **Decision:** Introduce Counter, Stock, Khata, Day close and Admin views in one shell while keeping `App` as global state coordinator.
4. **Alternatives:** Keep one page; add a router and new component library; hide panels with CSS only.
5. **Usability benefit:** Fewer repeated scroll actions, clear orientation, no administrative controls in the cashier path.
6. **Accessibility impact:** Add `aria-current`, landmarks, one `h1` per view, skip link, stable focus order.
7. **Financial/regression risk:** High — dirty/busy/refresh coordination and UIA names could break.
8. **Dependencies/complexity:** 7A.2, L; depends on token contract and existing test inventory.
9. **Acceptance evidence:** `check-ui.cjs`, `check-focus.cjs`, `check-authorization.cjs`, `check-native.py` pass; cross-view dirty-state test added.
10. **Status/open decision:** Proposed; founder approval and physical screenshot review required.

### DDR-02
1. **ID/Title:** DDR-02 — Two primary cashier regions plus a narrow global rail.
2. **Evidence:** Literal 320px left + 238px rail + 400px right leaves too little width at 1280×720; current checkout is one column (`CheckoutPanel.tsx:474-549`).
3. **Decision:** 216/64/48px nav, flexible center discovery/cart, 320–420px pinned right checkout/payment/result; optional context strip only at ≥1600px.
4. **Alternatives:** Literal three-region layout; single column; duplicate sidebars.
5. **Usability benefit:** Total and confirm stay visible; long product names fit; less pointer travel.
6. **Accessibility impact:** No horizontal scroll, 200% zoom/150% DPI validation, pinned status region.
7. **Financial/regression risk:** Critical — must preserve focus, shortcuts, operation ID and split validation.
8. **Dependencies/complexity:** 7A.2 → 7B, L; new composition only, no new calculation layer.
9. **Acceptance evidence:** Viewport regression tests, F2/F3/F4/F8 suite, ₹1,000 split installed-UI test, repeated-submit burst.
10. **Status/open decision:** Proposed; founder must approve deviation from literal three-region brief.

### DDR-03
1. **ID/Title:** DDR-03 — Light-first PRECISION WORKSPACE tokens.
2. **Evidence:** Brand reference `#0D1117`/`#475A72`; candidate palette contrast evidence; current focus `#829fce` is 2.69:1; current dark scheme auto-inverts financial surfaces.
3. **Decision:** Use `#F7F8FA` app, `#FFFFFF` surface, `#182333` nav/text, `#667085` secondary, `#246B65` action/focus, semantic status surfaces; no automatic dark inversion of financial data.
4. **Alternatives:** Keep current blue/gradient theme; apply website cobalt/ivory; cinematic dark app.
5. **Usability benefit:** Brighter all-day legibility, restrained accent reserved for primary action, status not decorative.
6. **Accessibility impact:** AA text/focus evidence, forced-colors mapping, text/icon/shape status, 44px controls, reduced motion.
7. **Financial/regression risk:** Low for tokens; medium if high-contrast/dark CSS changes affect print or UIA.
8. **Dependencies/complexity:** 7A.1, S–M; no new dependency or font licence decision outside Inter verification.
9. **Acceptance evidence:** Contrast table for every token, forced-colors smoke test, receipt and statement print unaffected.
10. **Status/open decision:** Proposed; separately reviewed dark theme is an open decision.

### DDR-04
1. **ID/Title:** DDR-04 — 14px body, 44px controls, tabular en-IN money.
2. **Evidence:** Current 10–13px body/labels (`style.css:3,33`), 11px buttons; committed statement preview shows ungrouped numeric cells; `mobile-design` token `touch:44`.
3. **Decision:** Minimum 14px body, 12px metadata only, 40/44px controls, `font-variant-numeric: tabular-nums`, `₹1,000.00`.
4. **Alternatives:** Keep compact 12px; use proportional figures; truncate long names.
5. **Usability benefit:** Faster reading in noisy/glare-prone shops, fewer alignment errors, better touch/low-precision mouse use.
6. **Accessibility impact:** Meets text-scaling and target-size goals; Gurmukhi line-height/padding; no amount clipping.
7. **Financial/regression risk:** Medium — changing DOM/CSS must not alter `money()` output or receipt strings.
8. **Dependencies/complexity:** 7A.1/7B, M; coordinated with table component.
9. **Acceptance evidence:** 200% zoom, 150% DPI, `₹1,000.00` assertions, Gurmukhi physical print check.
10. **Status/open decision:** Proposed; compact density default is open.

### DDR-05
1. **ID/Title:** DDR-05 — Explicit financial state taxonomy, never colour-only.
2. **Evidence:** `pending-stock` plain div, `refusedCodes`, `SavedInvoice` legacy notice, `Pending — unverified`, `Externally verified: ₹0.00`.
3. **Decision:** Standard states for preview, review, posting, saved, refresh-failed, uncertain, refused, recovered and print-failed with text + icon + shape.
4. **Alternatives:** Coloured dots only; toast-only errors; single generic error line.
5. **Usability benefit:** Unambiguous recovery path; no duplicate sale after uncertain result.
6. **Accessibility impact:** `role=status/alert`, persistent financial errors, focus to retry, survives High Contrast.
7. **Financial/regression risk:** Critical — state must map exactly to native refusal/uncertain results and preserve same operation ID.
8. **Dependencies/complexity:** 7B, M; wraps existing `pending`/`invoice`/`refusedCodes` logic.
9. **Acceptance evidence:** `verify-desktop-contract.mjs`, restart/F8 test, print-does-not-post test, string-presence UI test.
10. **Status/open decision:** Proposed; no copy change to protected UIA labels without coordinated test update.

### DDR-06
1. **ID/Title:** DDR-06 — Split allocation table with live remaining and optional fill helper.
2. **Evidence:** `CheckoutPanel.tsx:300-330,524`; operator review P2; ₹1,000 = ₹600 cash + ₹400 credit installed-UI regression.
3. **Decision:** Show total, four methods, allocated, remaining, `Fill remaining into <tender>`, and exact-sum validation; customer credit requires customer.
4. **Alternatives:** Keep four stacked inputs; auto-balance silently; allow unverified payments to appear settled.
5. **Usability benefit:** Less manual arithmetic, earlier validation, clearer cash vs debt.
6. **Accessibility impact:** Text/icon/shape per method, labelled amount fields, no colour-only method meaning.
7. **Financial/regression risk:** Critical — helper is presentation-only; BigInt paise, exact sum, one credit part and native validation stay.
8. **Dependencies/complexity:** 7B, M; uses existing `paymentAmounts`/`paymentReferences`.
9. **Acceptance evidence:** Existing ₹1,000 split + new fill-remaining test; `Externally verified: ₹0.00` preserved.
10. **Status/open decision:** Proposed; default fill tender is an open decision.

### DDR-07
1. **ID/Title:** DDR-07 — Deterministic templates and manual customization before any AI.
2. **Evidence:** `AccessGate` captures `businessType`; `dailyWorkspace()` is deterministic but links to hosted-web routes that do not exist in the desktop app; `productionSyncEnabled=false`.
3. **Decision:** Build a registry of implemented desktop modules, static reviewed templates, owner overrides and offline fallback to general retail; AI is advisory only, later.
4. **Alternatives:** AI-first onboarding; reuse web templates unchanged; hide modules based on inferred business type.
5. **Usability benefit:** Relevant modules without dead links or invented features; reversible owner control.
6. **Accessibility impact:** All configuration is keyboard accessible and labelled; hidden modules remain discoverable.
7. **Financial/regression risk:** High if a template hides posting/recovery paths or alters permissions; mitigated by core-module protection and native authority.
8. **Dependencies/complexity:** 7D/7E, M–L; schema persistence is a separate decision.
9. **Acceptance evidence:** Pure resolver unit tests, offline sell/close/backup with AI absent, authorization tests, restore-generation tests.
10. **Status/open decision:** Proposed; new `cycle-parts` ID, statutory fields and preference storage remain open.

### DDR-08
1. **ID/Title:** DDR-08 — Honest device capability states.
2. **Evidence:** `windows-pos-printing.md` print boundary; physical pilot Steps 5/9/10; `mobile/FEATURE-MATRIX.md` hardware exclusions; no desktop device-settings module.
3. **Decision:** Future `admin.devices` shows detected / supported / configured / tested separately; keyboard-wedge scanning and print preparation are implemented, physical scanner/printer are untested, Windows Hello/cash drawer/LAN/cloud are not available.
4. **Alternatives:** Claim hardware support from OS detection; show a generic toggle; advertise AI/Windows Hello as available.
5. **Usability benefit:** Owners know what to test and what is not supported; fewer false assumptions at a shop counter.
6. **Accessibility impact:** Capability status uses text and shape, never a coloured dot alone.
7. **Financial/regression risk:** Medium — device tests must never post a sale or alter ledger; native file picker paths remain authoritative.
8. **Dependencies/complexity:** 7E/7F, M; depends on physical pilot evidence.
9. **Acceptance evidence:** Physical scanner, 58/80mm/A4 print, Punjabi paper output, print cancellation leaves balances unchanged.
10. **Status/open decision:** Proposed; evidence threshold for `tested` is open.

---

## 9. Financial preservation statement

This assignment preserves all of the following without modification:

- PR #145, PR #143/#144 histories, current `main` merge, and the Phase 6 review branch.
- Existing financial tests and assertions.
- SQLCipher/Rust code, `SCHEMA_VERSION=12`, integer-paise arithmetic, split-credit posting, stock revisions, credit limits, idempotent operation IDs, restore generation and native permissions.
- Current replication implementation and `productionSyncEnabled=false`.
- Current application behavior, keyboard shortcuts, checkout flow, receipts, backup/restore and printed output.
- `apps/desktop/src/style.css`, Tailwind/PostCSS configuration, desktop dependencies, `tauri.conf.json`, capabilities and CSP.
- No PR merge, force-push, release, deploy, protected-branch push, production styling change, backend change or AI/runtime dependency was performed.

**Production files changed in this assignment: 0.** Only the five `docs/design/PHASE-7-*.md` files are added, on the authorized working branch.

---

## 10. Stop condition

Implementation must not begin automatically. The next action is founder review of the five documents, followed by an explicit decision on scope, evidence gaps, open product decisions and the 7.0 gate. No production UI, CSS, component, shortcut, Rust, SQLCipher, test assertion, schema, dependency or release change is to be made until that decision is recorded.
