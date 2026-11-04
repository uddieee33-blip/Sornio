# SORNIO — Phase 7 / Assignment 4

**Authentic Windows Evidence Recovery & Implementation Preflight**

**Date:** 2026-11-04 (UTC)
**Branch:** `arena/bbc68aef-sornio`
**Base:** `1cc5c798d1eada9a16463213b0776c01e99d36f9` (origin/main)
**Assignment 3 documentation commit (verified):** `a2256d6a6216249a326c86a3a1db872babf36ec4`
**Production code authorization:** NONE · **Merge authorization:** NONE · **Billable CI:** NONE

---

## Final verdict

> # NOT READY — EVIDENCE OR ENGINEERING BLOCKERS REMAIN

Three of nine gates are **BLOCKED** on missing authentic Windows evidence and runtime measurement.
Engineering readiness is *not* the constraint: the design contract, financial isolation proof,
dependency audit and regression plan are complete and executable. The constraint is that the
installed application cannot be observed from this environment.

One narrow step **is** defensible today — **U1 alone** (token declarations, additive, no markup
change) — because it cannot alter keyboard, privilege, print or layout behaviour and therefore does
not depend on the missing visual baseline. That recommendation is made in
[FOUNDER-IMPLEMENTATION-AUTHORIZATION-PACKAGE.md §10](FOUNDER-IMPLEMENTATION-AUTHORIZATION-PACKAGE.md);
**it has not been executed and is not authorized.**

---

## Deliverables

| # | File | Contents |
|---|---|---|
| 1 | [README.md](README.md) | This index, gate verdicts A1–A9, corrections register |
| 2 | [WINDOWS-EVIDENCE-RECOVERY.md](WINDOWS-EVIDENCE-RECOVERY.md) | Artifact metadata, six-step retrieval chain, root-cause determination, conditions to close |
| 3 | [AUTHENTIC-CAPTURE-REVIEW.md](AUTHENTIC-CAPTURE-REVIEW.md) | All 28 captures mapped to W1–W7, review criteria R1–R10, six states missing entirely |
| 4 | [WINDOWS-VIEWPORT-ACCESSIBILITY-MATRIX.md](WINDOWS-VIEWPORT-ACCESSIBILITY-MATRIX.md) | Computed geometry at 7 configurations, contrast audit (39 pairs), 3 defects found |
| 5 | [APPSHELL-DEPENDENCY-AND-RISK-AUDIT.md](APPSHELL-DEPENDENCY-AND-RISK-AUDIT.md) | 17 integration points, dependency map, 15-item risk register |
| 6 | [FINANCIAL-ISOLATION-VERIFICATION.md](FINANCIAL-ISOLATION-VERIFICATION.md) | Six independent proofs, 14 invariants, ₹1,000 reference in integer paise |
| 7 | [U1-U3-REGRESSION-ACCEPTANCE-PLAN.md](U1-U3-REGRESSION-ACCEPTANCE-PLAN.md) | 47 tests across 5 layers with execution status |
| 8 | [FOUNDER-IMPLEMENTATION-AUTHORIZATION-PACKAGE.md](FOUNDER-IMPLEMENTATION-AUTHORIZATION-PACKAGE.md) | Exact files, risks, rollback, merge-blocking tests, recommendation |

Predecessor package (unchanged except the three corrections below):
`docs/design/phase7-assignment3/`

---

## What this assignment actually did

**Performed**
1. Reconciled the live repository (fetch, status, PRs, divergence) — no assumptions carried forward.
2. Recomputed the two disputed counts from the underlying tables and corrected D7; added a third
   provenance correction. Recorded all three as transparent errata.
3. Diagnosed the artifact-retrieval failure to root cause using DNS → TCP → TLS → HTTP layering,
   instead of repeating a failing download.
4. Recomputed **39 WCAG 2.2 contrast pairs** from first principles (proposed tokens + production).
5. Computed **layout geometry at 7 display configurations** and 3 DPI scales from the real stylesheet.
6. Audited the shell for every coupling to keyboard suppression, role gating, dirty/busy state,
   printing, focus restoration and UI Automation — locating each to file and line.
7. Proved financial isolation by six independent means (call-site extraction, arithmetic grep,
   money-path inspection, native authority review, invariant matrix, file-set intersection).
8. Specified 47 executable acceptance tests and classified each as existing / proposed / blocked.

**Deliberately not performed**
- No production React/TS/CSS/Rust edit; no dependency; no schema; no workflow change.
- No test assertion created, changed, weakened or deleted.
- No billable CI run, no Windows run, no installer, no release, no merge, no PR.
- No screenshot, checksum, log or measurement invented.
- TLS certificate validation was never disabled; no credentials were printed or stored.

---

## Corrections applied to Assignment 3

| ID | Where | Correction | Basis |
|---|---|---|---|
| E-1 | D7 §H | "PASS × 7" → **PASS × 8** | Recount: G0, G2, G4, G5, G7, G8, G9, G10 = 8; +2 PARTIAL +1 BLOCKED = 11 = G0–G10. The old tally was internally inconsistent; the gate list was right. |
| E-2 | D7 §E | "8 BLOCKS scenarios" → **9** | Recount of D4 §3: BLOCKS 9 (1, 2, 5, 6, 7, 8, 11, 17, 18) + GATED 8 + TRACK 3 = 20. |
| E-3 | D7 §A | Base commit vs final documentation commit now distinguished | `1cc5c798…` base; `a2256d6a…` output. |
| CORR-1 | D2 token table | Disabled text claim **3.64:1 → 2.69:1** | Independent WCAG recomputation of `#7A8699` on `#D6DEDD`. WCAG exempts inactive controls; the token must never carry meaning. |

New defects found by measurement (not present in Assignment 3):

| ID | Defect | Measured | Requirement |
|---|---|---|---|
| **DEF-7** | Secondary text `--muted #6c7584` on app canvas `#f5f6f7` | **4.30:1** | 4.5:1 for normal text — **FAIL** |
| **DEF-8** | Focus ring `#829fce` on app canvas (worse than on white) | **2.49:1** | 3:1 non-text — **FAIL** (DEF-1 recorded 2.69:1 on white) |

Neither is fixed — repair is a later, separately authorized unit.

---

## Acceptance gates

| Gate | Required outcome | Verdict | Basis |
|---|---|---|---|
| **A1** | Repository and document integrity | **PASS** | HEAD `a2256d6`, 1 commit ahead of `1cc5c798…`, clean tree, branch as authorized; docs cross-linked and validated; PRs #127/#126 still open + conflicting and untouched |
| **A2** | Existing artifact recovery | **BLOCKED** | Both artifacts live (`expired:false`, expire 2026-11-10) and GitHub returns HTTP 302 to storage; TLS is terminated by the sandbox egress proxy (`SSL_ERROR_SYSCALL`, `size=0`). **0 bytes.** Structural, not transient |
| **A3** | Authentic Windows visual verification | **BLOCKED** | 0/28 captures reviewed; 6 required states absent from the capture plan entirely (High Contrast, 125%, 150%, reduced motion, large totals, physical print) |
| **A4** | Layout and accessibility evidence | **BLOCKED** | Computed work complete (geometry ×7, contrast ×39) and 3 real defects found; but zero runtime measurement — no WebView2, no Windows host, no browser binary |
| **A5** | AppShell integration risks identified | **PASS** | 17 integration points with file:line; 15-item risk register with severity, mitigation and verification test; includes 6 P0 mechanisms |
| **A6** | Financial logic isolated | **PASS** | Shell issues only 4 lifecycle commands, zero monetary arithmetic; financial commands confined to 4 excluded panels; 16,038 Rust lines outside the allowlist; native authority confirmed at `customers.rs:480` / `billing.rs:323` |
| **A7** | Regression plan executable and complete | **PASS** | 47 tests across 5 layers, each with preconditions, assertions, artifact and gate; existing vs proposed vs blocked separated; 10 merge-blocking tests named |
| **A8** | Production remains untouched | **PASS** | `git status` clean before documentation; only `docs/design/` additions; no dependency, workflow, schema, permission or test change |
| **A9** | First implementation slice ready for founder authorization | **PASS** | Exact 4-file allowlist, non-goals, P0 mitigations, rollback (one command, no data migration), merge-blocking tests, and a split recommendation (U1 now / U3 after guards) |

**Totals: 6 PASS · 0 PARTIAL · 3 BLOCKED · 0 FAIL.**

Three BLOCKED gates are the reason the overall verdict is NOT READY, even though every gate that
depends on engineering work passes.

---

## Reproducibility

| Computation | Method | Re-runnable |
|---|---|---|
| Artifact metadata / expiry | `gh api repos/…/actions/artifacts/<id>` | yes |
| Failure chain | `getent hosts`, `/dev/tcp` probe, `openssl s_client`, `curl -sSL` with validation **on** | yes |
| Contrast ratios | WCAG 2.2 sRGB linearisation, `(L1+0.05)/(L2+0.05)` | yes — formula stated in §4 of the matrix |
| Layout geometry | Arithmetic on `style.css` declarations and breakpoints | yes |
| Persistence claim | `grep -o "position:[a-z]*" style.css` → 0 matches | yes |
| Shell call sites | Extraction of every `invoke('…')` in `main.tsx` | yes |
| Counts | Parsed from the D7 gate table and D4 severity column | yes |

---

## Evidence classification (enforced)

| Class | Present in this package | May satisfy A3? |
|---|---|---|
| `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE` | **none** | yes, once reviewed |
| `BROWSER RENDER — NOT INSTALLED WINDOWS APP` | referenced only | no |
| `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` | referenced only (design branch) | no |
| `COMPUTED FROM SOURCE` | contrast, geometry, call-site, persistence | no |

No artefact was promoted between classes, and no image was created.

---

## Path to readiness (shortest legitimate route)

1. **Download the two artifacts before 2026-11-10** from a host with unrestricted egress; verify the
   SHA-256 and archive them outside Actions. → closes A2, and A3 once R1–R10 are executed.
2. **One authorized Windows run** (billable) for the six missing states: High Contrast, 125%, 150%,
   reduced motion, large totals, long mixed-script names. → closes the residue of A4.
3. **Authorize U1** as specified. → first production slice without touching behaviour.
4. **Authorize U3** only after T-15, T-18, T-41, T-42 exist. → shell composition with its guards.

Steps 1–2 need founder authorization for access and CI; steps 3–4 need a scoped implementation
assignment. None has been performed.

---

## Compliance statement

Restrictions honoured in full: no production React/TS/CSS/Rust edit, no SQLCipher or schema change, no
design-system package, no checkout/payment/permission change, no GST #127 or LAN #126 integration, no
replication or Android sync enablement, no Android billing, no merge/close/force-push, no release, no
billable CI, no browser preview promoted to installed evidence, no pilot or public-release claim, and
no treatment of design approval as implementation approval.

**SET THE STANDARD.**
