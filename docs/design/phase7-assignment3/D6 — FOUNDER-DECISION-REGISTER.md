# D6 — Founder Decision Register

**SORNIO — Phase 7 / Assignment 3** · Resolved decisions, open questions, evidence dependencies and
actions requiring explicit founder approval.
**Date:** 2026-11-04. **Production implementation authorization:** NOT GRANTED. **Merge
authorization:** NONE.

---

## 1. Resolved decisions (recorded, with evidence)

| ID | Decision | Status | Evidence |
|---|---|---|---|
| R-1 | Windows design direction: **Direction A — Precision Retail** approved as the production design direction | RESOLVED (founder-approved, this assignment) | Assignment text §1; Assignment 2 approval package decision #1 |
| R-2 | Three Direction-B refinements approved as design intentions: grouped totals (R1), 12px noncritical radii (R2), subtle payment-panel depth (R3) | RESOLVED (founder-approved, subject to viewport/a11y validation) | Assignment text §1 |
| R-3 | Direction B not approved as primary production design | RESOLVED | Assignment text §1.3 of D2 |
| R-4 | Mixed cash+credit split payment implemented on main | RESOLVED (code merged) | `billing.rs:321-344`, `customers.rs:480+`, PR #145 |
| R-5 | Phase-4 P0 split-credit fix is on main (no `unclaimed()` on in-flight pending row) | RESOLVED (code merged) | `customers.rs:480-508` verified live |
| R-6 | Android companion remains demo/read-only; `productionSyncEnabled=false` | RESOLVED (boundary preserved) | `apps/mobile/app.json:62` |
| R-7 | GST PR #127 and LAN PR #126 remain isolated; not integrated | RESOLVED (both OPEN + CONFLICTING, verified live) | `gh pr list` 2026-11-04 |
| R-8 | Phase 7 Assignment 1 documents exist only on the design branch `arena/2c0afc32-sornio`; absent from main | RESOLVED (verified live) | D1 §3.2 |
| R-9 | `Fill remaining` remains unapproved | RESOLVED (deferred) | D3 W3 §7; D5 FDR-3 |
| R-10 | Real-shop pilot remains NO-GO; public release remains NO-GO | RESOLVED (carried from release manifest) | `release-evidence-manifest-2026-11-02.json` via D4 §5 |

---

## 2. Open questions (not decided; no implementation may assume an answer)

| ID | Question | Options | Why it matters | Blocks |
|---|---|---|---|---|
| O-1 | Dark theme policy for the desktop app | (a) Remove dark `@media` inversion; (b) Fully specified dark token set with complete contrast table; (c) Leave unchanged for V1 | Financial surface inversion accessibility risk (D2 §2.5.1) | U2 theme mapping completion |
| O-2 | Density mode default | Comfortable (44px rows) recommended; Compact (36px) alternative | Hit targets vs density trade-off (D2 §5) | U6 viewport work |
| O-3 | `Fill remaining` specification | Defer (current); or fund a full spec: arithmetic, interaction semantics, native validation boundary | Financial interaction change; unapproved (D3 W3) | Any W3 helper work |
| O-4 | Cycle/hardware retail template identifiers | Map to `general` for V1 (recommended); or verify real `PortalId`s | Onboarding scope honesty (D3 W7) | W7 template work |
| O-5 | 150% DPI + physical hardware measurement | Authorize hardware/CI measurement or defer | 125% is specified; 150% unmeasured (D3 W2) | Physical pilot gate |
| O-6 | Code signing provider | None exists; unsigned = engineering-only | SmartScreen/pilot/release blocker | Pilot + public release |
| O-7 | Minimum effective CSS viewport floor | 1024×576 @125% proposed as V1 floor; 150% to be measured | Layout contract at small effective sizes | U6 |
| O-8 | `Inter` in the desktop bundle | Bundle (licence verify) or rely on system stack only | Font licensing/bundling (D2 §3.2) | U2/typography work |
| O-9 | Full workspace Punjabi localization | Receipt-only V1 (recommended); full UI phase separately funded | Localization scope (D2 §3.4) | Any W-screen Punjabi UI work |
| O-10 | Device-capability evidence threshold definition | `Tested` = CI + installed/physical evidence, not compile-only | Prevents false readiness claims (Assignment 2 decision #14) | Release gate wording |

---

## 3. Evidence dependencies (what must be obtained before claims can change)

| ID | Missing evidence | Current state | What it would enable | How to obtain |
|---|---|---|---|---|
| E-1 | Authentic installed-Windows capture bytes (artifacts 13269596282 / 13266470821) | Metadata verified; bytes unreachable (Azure egress block); SHA-256 are GitHub-reported | Visual verification of W1–W7; Gate A | Download from Actions UI on a host that can reach Azure blobs, before artifact expiry (7-day retention); hash and archive outside Actions |
| E-2 | 125% (and 150%) effective viewport measurement | Specified, not measured; sandbox has no WebView2 | Gate B/G6 125% test | Real WebView2 run at 1280×720 @125% during U6/U9 |
| E-3 | Physical printer/scanner/power-loss/Gurmukhi hardware evidence | Absent | Physical pilot gate | Physical pilot plan execution (15-step, unsigned-installer NO-GO) |
| E-4 | Signed installer / certificate infrastructure | Absent | Pilot + public release | Separate funding/decision (O-6) |
| E-5 | Cross-version upgrade recovery evidence | Partial (reinstall-preserved only) | Scenario 8 BLOCKS gate | Upgrade-path test with signed artifacts |
| E-6 | Real-shop LAN multi-till evidence | PR #126 isolated | Multi-till claims | Separate LAN workstream (PR #126), not this assignment |

---

## 4. Actions requiring explicit founder approval (do NOT proceed without it)

| # | Action | Authorization needed | Current authorization |
|---|---|---|---|
| 1 | Begin any production implementation (first slice: U1 tokens + U3 AppShell composition) | Explicit scoped implementation assignment | **NOT GRANTED** |
| 2 | Merge or close any PR | None in this assignment | NONE |
| 3 | Trigger billable CI / Windows hardware runs | Per-run authorization | NOT REQUESTED |
| 4 | Integrate GST PR #127 | Separate compliance decision | Prohibited here |
| 5 | Integrate LAN PR #126 | Separate multi-till decision | Prohibited here |
| 6 | Enable replication / Android production sync | Separate decision | Prohibited (`productionSyncEnabled=false`) |
| 7 | Android billing / financial posting | Separate decision | Prohibited |
| 8 | Real-shop physical pilot | 15-step plan pass + signed installer | NO-GO |
| 9 | Public/commercial release | All release gates green | NO-GO |
| 10 | Publish a release or deploy | Release decision | NONE |
| 11 | Force-push / history rewrite | Never | Prohibited |
| 12 | Weaken or skip any test assertion | Never | Prohibited |

---

## 5. Register maintenance

This register is the single source for "what was decided vs what is open." Any future assignment
that changes a row must record the change date, the changer (founder vs agent) and the evidence
that justified it. Silent assumptions are prohibited by assignment rule and by Gate B/G10.
