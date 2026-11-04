# D7 — Phase 7 Assignment 3 Acceptance Report

**SORNIO — Authentic Windows Verification, Design Contract Freeze & Implementation Readiness**
**Date:** 2026-11-04 (UTC). **Status:** NONPRODUCTION DESIGN REVIEW — documentation complete.
**Production implementation authorization:** NOT GRANTED. **Merge authorization:** NONE.
**Standard:** RELIABILITY FIRST. PRECISION ALWAYS. SET THE STANDARD.

---

## A. Repository state

| Field | Value |
|---|---|
| Branch | `arena/bbc68aef-sornio` (authorized Arena branch) |
| Base commit (origin/main at assignment start) | `1cc5c798d1eada9a16463213b0776c01e99d36f9` |
| HEAD at assignment start | `1cc5c798d1eada9a16463213b0776c01e99d36f9` (identical to origin/main; 0/0 divergence) |
| Final documentation commit (Assignment 3 output) | `a2256d6a6216249a326c86a3a1db872babf36ec4` — 1 commit ahead of base, 8 files added, all under `docs/design/phase7-assignment3/` |
| Working tree | clean before this assignment's documentation files; only `docs/design/phase7-assignment3/` added |
| Clone | shallow (single commit locally); design-branch artifacts verified via GitHub API |
| PRs | #145 MERGED (current main); #144/#134/#131/#129/#128/#125/#123 CLOSED; #127 (GST) and #126 (LAN) OPEN+CONFLICTING, untouched |
| Changes made by this assignment | **Documentation only** — `docs/design/phase7-assignment3/` (8 files). No production source, dependency, workflow, test, schema or permission change. |

---

## B. Evidence

**Authentic installed-Windows captures: found as metadata, NOT reviewed as pixels — BLOCKED.**

- Artifacts `Sornio-Local-Native-Captures` 13269596282 (run 41709217989, head `97b6899…`, 1,420,490 B,
  sha256 `a664bb74…`) and 13266470821 (run 41702800767, head `21a3f7c…`, 1,415,767 B,
  sha256 `208b77f6…`) — metadata verified live, `expired=false`.
- Retrieval attempts: `gh run download`, `gh api …/zip`, `curl -L` — all redirect to
  `productionresultssa{10,16}.blob.core.windows.net`, unreachable from this sandbox (TLS
  `SSL_ERROR_SYSCALL`). Prior attempts (2026-11-03) failed identically (Azure EOF). No capture bytes
  were saved, viewed or fabricated.
- The 28 capture names catalogued by `check-native.py` and the 4 required by
  `check-windows-evidence.py` are recorded in D1 §5.4 as the expected coverage.
- Classification preserved throughout: browser renders (`docs/reviews/*-browser.png`) and design
  prototypes (design branch `assets/`) are labelled as such and never promoted.

**Verdict: Gate A — BLOCKED.** An unavailable Windows machine and unreachable artifact bytes are a
blocker, not a pass. Planning work proceeded with the limitation explicitly labelled.

---

## C. Design contract

- Direction A — Precision Retail fully specified: dark narrow rail, dense light workspace,
  persistent totals, keyboard-first operation, EN+Punjabi support (D2 §1).
- Semantic token contract with purpose/mapping/accessibility/recommendation for every core token;
  unresolved decisions listed (D2 §2.4–2.5). Contrast values computed by WCAG luminance formula
  (to be re-verified at implementation).
- Three approved refinements specified with hard constraints: grouped totals (R1), 12px noncritical
  radii (R2), subtle payment-panel depth only (R3) (D2 §1.2).
- Typography/localization: Segoe UI/Inter/Nirmala/Noto-Gurmukhi stack; EN default, receipt-only
  Punjabi V1; money via `money()` BigInt/en-IN; clipping tests specified (D2 §3).
- Visual state model: 10 states, none colour-only (D2 §4).
- Theme migration plan: desktop plain CSS → semantic tokens; three existing token systems mapped,
  not consolidated; dark-theme policy flagged for founder decision (D2 §7).
- **Conflicts identified:** current production focus ring `#829fce` = 2.69:1 fails AA (DEF-1);
  desktop has no token layer (hardcoded hex); three unrelated theme systems.

---

## D. Experience review (W1–W7)

All seven screens have implementation-ready contracts with 11 required fields each: source mapping,
composition, grid/layout, min dimensions, keyboard/focus, accessibility, financial/permission
boundaries, existing tests affected, new tests required, dependencies, prohibited changes (D3 §1–7).

- W1 shell: 216/64/48px rail, `aria-current`, status region, dirty/busy coordination preserved.
- W2 cashier: F2/F3/F4/Enter/F8/Escape preserved exactly; pinned totals; 125% stress test specified
  but **not measurable in this sandbox**.
- W3 split: ₹1,000.00 = ₹600.00 + ₹400.00 reference preserved; native authority; `Fill remaining`
  remains unapproved.
- W4 inventory: no parallel state machine; `checkout_active` gating preserved.
- W5 credit: no stale figures as authoritative; limit enforcement native.
- W6 recovery: original operation ID preserved; uncertain/refused/confirmed/retry states distinct;
  duplicate prevention evidence required, not asserted.
- W7 onboarding: templates/schemas untouched; cycle/hardware IDs unresolved → `general` for V1.

**Unresolved behavior:** every screen's visual acceptance depends on authentic capture review
(BLOCKED). The 125% stress test is specified but has no measurement artifact.

---

## E. Financial reliability

- 14 invariants (I1–I14) enumerated and verified against current main (D4 §1): integer-paise
  money, native calculations, atomic checkout, split validation, credit constraints, stock
  semantics, idempotency, recovery, backup/restore, SQLCipher (`SCHEMA_VERSION=12`), permissions,
  offline-first, print authorization, business rules.
- 6 defects recorded as defects, including the split-credit P0 (now fixed on main via PR #145) and
  the still-present focus-ring contrast failure (D4 §2).
- 20 risk scenarios specified with risk/expected behavior/existing evidence/missing coverage/
  proposed regression/severity/release consequence (D4 §3).
- Existing test evidence inventory: `check-*.cjs` Playwright suites, `check-native.py` UIA suite,
  `check-installer.ps1`, `test_windows_evidence.py`, `verify-*.mjs` verifiers, native cargo suites
  (`billing_reliability_tests.rs`, `payments_tests.rs`, `customers_tests.rs`,
  `inventory_recovery_tests.rs`, `authorization_tests.rs`, `credential_tests.rs`,
  `phase3_reliability_tests.rs`, `replication_matrix_tests.rs`).
- Missing automated coverage identified per scenario; **9** scenarios are BLOCKS-severity
  (1, 2, 5, 6, 7, 8, 11, 17, 18).

---

## F. Accessibility

- Measured/computed contrast: all proposed token ratios satisfy WCAG 2.2 AA targets (normal text
  ≥4.5:1; non-text ≥3:1) — computed values in D2 §2.3, re-verification required at implementation.
- Proposed interaction compliance: visible focus ≥3:1 everywhere (fixes DEF-1), no keyboard traps,
  logical tab order, stable UIA names, forced-colors system colours, reduced-motion support.
- Unverified Windows behavior identified: real screen-reader output through WebView2/UIA,
  `forced-colors` in the packaged runtime, 150%/mixed-DPI, scanner cadence, physical Gurmukhi print
  (D2 §6.3). None claimed as verified.

---

## G. Implementation proposal (recommended first future production slice)

**Semantic Token Contract + Route-Level AppShell Composition** (D5 §2 U1+U3):

- Files: new `apps/desktop/src/styles/tokens.css`; new `apps/desktop/src/workspace/{AppShell,NavRail}.tsx`;
  `main.tsx` gains route composition while keeping all state coordination.
- Dependencies: none beyond the repo's existing React 19/Vite/TypeScript stack; no new runtime
  dependency.
- Tests: `check-ui.cjs`, `check-focus.cjs`, `check-authorization.cjs`, `check-native.py` unchanged
  contracts + new layout/focus/contrast checks.
- Rollback: revert `main.tsx` diff; delete new files; tokens.css additive and self-contained.
- Risk: Medium–High (touches shell coordination and UIA contract) — the reason it is the first
  **separate** authorized slice, and the reason checkout (U7) waits for a later, separate
  authorization.
- **This remains a proposal. No implementation has begun.**

---

## H. Acceptance gates (G0–G10)

| Gate | Requirement | Verdict | Objective evidence |
|---|---|---|---|
| G0 | Repository integrity: correct live state, no unauthorized changes, clear provenance | **PASS** | `git fetch`/`git status`/`git rev-parse` verified 2026-11-04: HEAD=origin/main, clean tree, branch=arena/bbc68aef-sornio; D1 §1 |
| G1 | Windows evidence: authentic captures reviewed or explicitly BLOCKED | **BLOCKED** | Artifact metadata verified (D1 §5.2); bytes unreachable (Azure egress); 0 captures visually reviewed; no fabrication |
| G2 | Design contract: Direction A fully specified incl. 3 refinements | **PASS** | D2 §1–§2; refinement constraints in D2 §1.2; token table with purpose/mapping/a11y/recommendation |
| G3 | Accessibility: tokens/layout meet documented thresholds; untested platform behavior identified | **PARTIAL** | Computed contrast table (D2 §2.3); thresholds documented (D2 §6); untested behaviors listed (D2 §6.3); production focus-ring defect recorded (DEF-1); values not yet measured on shipped code |
| G4 | W1–W7: all seven screens source-mapped, testable contracts | **PASS** | D3 §1–§7 (11 items each) + traceability table §8; missing installed evidence carried as qualification §9 |
| G5 | Financial safety: all invariants preserved by proposed design | **PASS** | D4 §1 invariants; §3 20 scenarios; defects recorded §2; presentation-layer-only change boundary |
| G6 | Regression readiness: matrix identifies existing/missing/blocked checks | **PARTIAL** | D4 §3 covers existing evidence + missing coverage + proposed tests; tests not yet implemented (correct — no implementation authorized); 125% measurement blocked |
| G7 | Android isolation: no Android source/checkout/auth/sync changes | **PASS** | No Android files touched; boundaries preserved (`productionSyncEnabled=false` verified); D6 R-6 |
| G8 | Production isolation: no production source/deps/workflows/tests modified | **PASS** | `git status` after assignment shows only `docs/design/phase7-assignment3/` additions; no other diff |
| G9 | Implementation readiness: first slice defined with file scope, tests, rollback, risk | **PASS** | D5 §2 U1/U3; D7 §G summary; proposal not executed |
| G10 | Evidence integrity: claims trace to reproducible sources; prototype/installed never conflated | **PASS** | D1 evidence categories; every artifact/branch/commit referenced live-verified; classification labels in D1/D3/D7; no browser/prototype promoted to installed evidence |

**Gate summary:** PASS × 8 (G0, G2, G4, G5, G7, G8, G9, G10), PARTIAL × 2 (G3, G6),
BLOCKED × 1 (G1), FAIL × 0.

No gate is marked PASS purely because a document exists: each PASS cites live-verified state or
computed/documented evidence; G1 and the PARTIAL gates carry their blockers explicitly.

---

## I. Founder decisions required

See D6. Highlights:

- **To unblock implementation:** authorize the first production slice (U1+U3) as a scoped
  implementation assignment (D6 §4 item 1).
- **Open product decisions:** dark-theme policy (O-1), density default (O-2), `Fill remaining`
  (O-3), cycle/hardware template IDs (O-4), 150% measurement authorization (O-5), code signing
  (O-6).
- **Evidence actions:** retrieve/durably archive authentic captures before expiry (E-1); run a
  125% WebView2 measurement (E-2); execute the physical pilot only after the unsigned-installer
  and hardware gates (E-3/E-4).

---

## J. Final verdict — separate readiness lines

| Readiness line | Verdict | Basis |
|---|---|---|
| Design specification readiness | **READY** | D2–D5 complete, cross-referenced, evidence-grounded |
| Authentic Windows evidence readiness | **BLOCKED** | Gate A; no capture bytes reachable; 0 reviewed |
| Production implementation planning readiness | **READY** | First slice scoped with files/tests/rollback/risk (D5) |
| Production implementation authorization | **NOT GRANTED** | Assignment rules; D6 §4 |
| Real-shop pilot readiness | **NO-GO** | Unsigned installer; printer/scanner/power/Gurmukhi hardware evidence absent; capture evidence blocked |
| Public-release readiness | **NO-GO** | Release manifest 2026-11-02; upgrade path untested; GST out of scope |

---

## Errata — corrections applied in Assignment 4 (2026-11-04)

Three objectively verifiable reporting inconsistencies were identified in this report and
recomputed from the underlying tables. Original statements are preserved in the history of this file;
the corrections are recorded here for traceability.

| # | Location | As originally reported | Recomputed / corrected | Basis of recomputation |
|---|---|---|---|---|
| E-1 | §H gate summary | "PASS × 7" | **PASS × 8** | Counting §H table rows: G0, G2, G4, G5, G7, G8, G9, G10 = 8 PASS; G3, G6 = PARTIAL; G1 = BLOCKED. 8+2+1 = 11 = G0–G10, so the tally is internally consistent at 8. The "× 7" was a transcription error; the parenthesised gate list was already correct. |
| E-2 | §E financial reliability | "8 scenarios are BLOCKS-severity (1, 2, 5, 6, 7, 8, 11, 17, 18)" | **9 scenarios** | Recount of D4 §3 severity column: BLOCKS = 1, 2, 5, 6, 7, 8, 11, 17, 18 (9); GATED = 3, 4, 9, 10, 12, 15, 16, 20 (8); TRACK = 13, 14, 19 (3). 9+8+3 = 20 = the required scenario count. The listed numbers were correct; the count word was wrong. |
| E-3 | §A repository state | HEAD shown as the base commit only | Base commit and final documentation commit now distinguished | Assignment 3 output commit is `a2256d6a6216249a326c86a3a1db872babf36ec4`; base was `1cc5c798…`. The original row captured pre-commit state. |

**No test results, measurements or evidence were altered by these corrections.** Only arithmetic
and provenance labelling were fixed. Two further findings that this assignment's independent
measurement exposed (a D2 token contrast figure and two production contrast defects) are recorded in
`../phase7-assignment4/WINDOWS-VIEWPORT-ACCESSIBILITY-MATRIX.md` §4 and are not retro-applied here.

---

## Stop condition

Deliverables complete and validated; no production source changes; documentation committed on the
authorized working branch `arena/bbc68aef-sornio` (commit recorded in the session record). No PR
opened or merged. No implementation begun. **Stopping for founder review.**

The founder's approved design direction is not permission to implement it. No production changes
may begin until the founder separately authorizes the scoped implementation assignment.
