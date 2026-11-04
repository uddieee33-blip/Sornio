# SORNIO — Phase 7 / Assignment 3

**Authentic Windows Verification, Design Contract Freeze & Implementation Readiness**

**Status:** NONPRODUCTION DESIGN REVIEW — documentation, evidence index and planning artifacts
only. **Production implementation authorization:** NOT GRANTED. **Merge authorization:** NONE.
**Date:** 2026-11-04.

This package converts the founder-approved Direction A (Precision Retail) into an evidence-backed,
testable implementation specification. **No production code, CSS, JSX, TSX, Rust, schema, dependency,
workflow or test was modified.** No PR was opened, merged or closed. No billable CI was triggered.

---

## Deliverables

| File | Contents |
|---|---|
| [D1 — REPOSITORY-AND-EVIDENCE-BASELINE.md](D1 — REPOSITORY-AND-EVIDENCE-BASELINE.md) | Live repository state, PR inventory, artifact provenance, evidence-recovery attempts, capture limitations, evidence verdict |
| [D2 — PRECISION-RETAIL-DESIGN-CONTRACT.md](D2 — PRECISION-RETAIL-DESIGN-CONTRACT.md) | Approved design system, semantic tokens, theme migration plan, typography/localization, visual state model, accessibility acceptance |
| [D3 — WINDOWS-W1-W7-EXPERIENCE-CONTRACT.md](D3 — WINDOWS-W1-W7-EXPERIENCE-CONTRACT.md) | Seven-screen composition/interaction specifications, layout constraints, component mapping, prohibited changes |
| [D4 — FINANCIAL-SAFETY-AND-REGRESSION-MATRIX.md](D4 — FINANCIAL-SAFETY-AND-REGRESSION-MATRIX.md) | Financial invariants, 20 risk scenarios, test coverage, missing verification, hard release gates |
| [D5 — PRODUCTION-IMPLEMENTATION-PLAN.md](D5 — PRODUCTION-IMPLEMENTATION-PLAN.md) | Proposed sequence of isolated production changes with rollback, risk and evidence requirements |
| [D6 — FOUNDER-DECISION-REGISTER.md](D6 — FOUNDER-DECISION-REGISTER.md) | Resolved decisions, open questions, evidence dependencies, actions requiring approval |
| [D7 — PHASE-7-ASSIGNMENT-3-ACCEPTANCE-REPORT.md](D7 — PHASE-7-ASSIGNMENT-3-ACCEPTANCE-REPORT.md) | Final report: gate-by-gate verdicts G0–G10, blockers, remaining risks, final verdicts |

---

## Evidence classification (strict)

Every artifact in this package and its sources carries exactly one label:

- `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE` — real screenshots from the installed
  Tauri/WebView2 app (produced by `windows-local.yml` / `check-native.py`). **None were visually
  reviewed in this sandbox — Gate A is BLOCKED (D1 §5.7).**
- `BROWSER RENDER — NOT INSTALLED WINDOWS APP` — committed browser/print previews
  (`docs/reviews/*-browser.png`).
- `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` — the Phase 7 prototype PNGs (see below).

No browser screenshot or prototype is ever promoted to authentic installed-app evidence.

---

## Original Assignment 2 approved visuals (design branch `arena/2c0afc32-sornio`, head `f0b8e019`)

The approved visuals live on the design branch (not on main). Read them via the GitHub branch:

- Direction comparison and responsive sheets:
  `docs/design/phase7-assignment2/assets/windows/comparison/`
  (`direction-comparison.png`, `responsive-matrix.png`,
  `responsive-side-by-side-1280-vs-1920.png`, `responsive-125-percent.png`)
- Direction A prototypes W1–W7:
  `docs/design/phase7-assignment2/assets/windows/direction-a/`
  (`W1-application-shell.png` … `W7-business-onboarding.png`)
- Responsive captures:
  `docs/design/phase7-assignment2/assets/windows/direction-a/responsive/`
  (W2 at 1280×720, 1366×768, 1600×900, 1920×1080, 125% @1024×576)
- Direction B prototypes W1–W7:
  `docs/design/phase7-assignment2/assets/windows/direction-b/`
- Android companion prototypes A1–A5:
  `docs/design/phase7-assignment2/assets/android/previews/`
- Navigable preview: `docs/design/phase7-assignment2/index.html`
- Validation record: `docs/design/phase7-assignment2/VALIDATION.md`
- Machine-readable labels: `docs/design/phase7-assignment2/manifest.json`

All of the above are `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` with synthetic demonstration
data. The Assignment 2 report itself is
`docs/design/PHASE-7-ASSIGNMENT-2-VISUAL-EVIDENCE.md` on the same branch.

---

## Current gate verdicts (summary)

| Gate | Verdict |
|---|---|
| G0 Repository integrity | PASS |
| G1 Windows evidence | **BLOCKED** |
| G2 Design contract | PASS |
| G3 Accessibility | PARTIAL |
| G4 W1–W7 contracts | PASS |
| G5 Financial safety | PASS |
| G6 Regression readiness | PARTIAL |
| G7 Android isolation | PASS |
| G8 Production isolation | PASS |
| G9 Implementation readiness | PASS |
| G10 Evidence integrity | PASS |

Full rationale: D7 §H.

---

## Bottom line

The design direction is frozen and fully specified; implementation planning is ready. Authentic
installed-Windows evidence remains blocked pending authorized artifact retrieval (or a new
Windows run). **Production implementation is not authorized.** The founder's approved design
direction is not permission to implement it.
