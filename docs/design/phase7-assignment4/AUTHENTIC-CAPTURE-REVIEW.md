# AUTHENTIC CAPTURE REVIEW

**SORNIO — Phase 7 / Assignment 4** · Review register for installed-Windows captures.
**Date:** 2026-11-04 (UTC).

---

## 1. Review status — read this first

**Screens reviewed as authentic installed-Windows pixels: 0 of 28.**
**States that cannot be reviewed because no capture exists for them at all: 6 (listed in §5).**

The capture inventory below is derived from the **capture driver source** (`apps/desktop/check-native.py`),
which is a reproducible repository artefact, not from image files. Image content was never available
(see `WINDOWS-EVIDENCE-RECOVERY.md`). Consequently this document is a **review register with a
blocked verdict**, not a visual review.

Every row is therefore `NOT REVIEWED — BLOCKED (artifact bytes unreachable)`. Rows are not marked
"pass", "compliant", or "verified" on any visual criterion.

---

## 2. Complete capture inventory (28 files, from `check-native.py`)

| # | File | What the driver captures | Maps to |
|---|---|---|---|
| 1 | `windows-first-setup.png` | First-run local access setup (password creation) | W7 |
| 2 | `windows-unlock.png` | Locked workspace / unlock screen | W7 |
| 3 | `windows-installed-preserved.png` | Reinstall-preserved data verification surface | W7 |
| 4 | `windows-local-saved.png` | Workspace draft saved; shell + rail + status panel | W1 |
| 5 | `windows-local-restored.png` | Saved copy restored | W1 |
| 6 | `windows-product-creation.png` | Product/item creation form | W4 |
| 7 | `windows-local-stock.png` | Stock adjustment surface | W4 |
| 8 | `windows-local-cash-receipt.png` | Cash sale saved + receipt | W2 |
| 9 | `windows-local-checkout.png` | Cashier panel: search, cart, totals, confirm | W2 |
| 10 | `windows-customer-credit-sale.png` | Credit sale to a customer | W5 |
| 11 | `windows-local-locked.png` | Locked state after lock action | W1/W7 |
| 12 | `windows-local-reopened.png` | Restart → reopened pending/uncertain sale | W6 |
| 13 | `windows-local-next-sale-reopened.png` | Next operation after recovery | W6 |
| 14 | `windows-local-failure.png` | Failure / uncertain-result presentation | W6 |
| 15 | `windows-mixed-cash-credit-sale.png` | Mixed cash + credit sale (pre-₹1,000 reference) | W3 |
| 16 | `windows-mixed-split-reopened.png` | Restart after mixed split | W3/W6 |
| 17 | `windows-thousand-split-sale.png` | **₹1,000 = ₹600 cash + ₹400 credit reference transaction** | W3 |
| 18 | `windows-thousand-split-reopened.png` | Restart after the ₹1,000 split | W3/W6 |
| 19 | `windows-customer-partial-repayment.png` | Partial credit repayment | W5 |
| 20 | `windows-customer-ledger.png` | Customer credit ledger history | W5 |
| 21 | `windows-owner-staff.png` | Owner staff administration | W7 |
| 22 | `windows-staff-disabled.png` | Cashier-restricted controls disabled | W7/W2 |
| 23 | `windows-retail-pending-payment.png` | Retail operation with pending/unverified payment | W3 |
| 24 | `windows-retail-closing.png` | Cashier day closing | W7 |
| 25 | `windows-retail-reconciliation.png` | Reconciliation view | W7 |
| 26 | `windows-retail-return-refund.png` | Return/refund review | W2/W5 |
| 27 | `windows-backup-preview.png` | Encrypted backup preview | W7 |
| 28 | `windows-backup-restored.png` | Backup restore result | W7 |

Additional driver outputs referenced in code but not part of the 28-file capture set include the
statement-print and settlement-CSV paths exercised by `check-statement-print.cjs` and the credit
entry flows.

---

## 3. W1–W7 coverage matrix

| Screen | Required by assignment | Captures that would evidence it | Review status |
|---|---|---|---|
| **W1** Application shell and navigation | yes | 4, 5, 11 | **NOT REVIEWED — BLOCKED** |
| **W2** Cashier and product search | yes | 8, 9, 26 | **NOT REVIEWED — BLOCKED** |
| **W3** Split payment and customer credit | yes | 15, 16, **17**, 18, 23 | **NOT REVIEWED — BLOCKED** |
| **W4** Inventory and stock adjustments | yes | 6, 7 | **NOT REVIEWED — BLOCKED** |
| **W5** Customer account and credit ledger | yes | 10, 19, 20, 26 | **NOT REVIEWED — BLOCKED** |
| **W6** Interrupted transaction and recovery | yes | 12, 13, 14, 16, 18 | **NOT REVIEWED — BLOCKED** |
| **W7** Retail onboarding and settings | yes | 1, 2, 3, 11, 21, 22, 24, 25, 27, 28 | **NOT REVIEWED — BLOCKED** |

Structural remark (not a visual claim): every W1–W7 screen is *covered by at least one capture in
the driver*, so the capture plan is adequate. What is missing is delivery, not design of evidence.

---

## 4. What a genuine review would have to establish (acceptance criteria)

Recorded now so the review is executable the moment bytes arrive, without renegotiating criteria.

| # | Criterion | Method |
|---|---|---|
| R1 | Rail width and workspace offset match the §4 geometry contract | Pixel measurement of rail edge against image width |
| R2 | Focus indicator is visibly present on the focused control at ≥3:1 | Inspect focused-state captures; sample ring vs adjacent pixels |
| R3 | "Confirm sale" is visible and actionable in the first fold at the captured viewport | Locate control relative to image height |
| R4 | Totals and payment allocation are visible simultaneously with the cart | Inspect W2/W3 images |
| R5 | ₹1,000.00 / ₹600.00 / ₹400.00 / ₹0.00 appear exactly in `windows-thousand-split-sale.png` | OCR-free visual read; record exact strings |
| R6 | Uncertain state is visually distinct from confirmed and from failed | Compare 14 against 8 |
| R7 | No financial state relies on colour alone (glyph + text present) | Inspect status indicators |
| R8 | Gurmukhi renders without clipped matras in receipt/ledger views | Inspect customer/receipt captures for `ਸੋਨੀਓ` and item names |
| R9 | No horizontal clipping of confirmation controls at the captured width | Inspect right edge of images |
| R10 | Capture is genuinely the installed app, not a browser | Window chrome, title-bar/frame presence; corroborate with run logs |

Criteria R1–R10 are **unexecuted**. None may be reported as met.

---

## 5. Missing capture states (no capture exists at all)

These states are not covered by any of the 28 captures and would remain uncovered even if the
archives were retrieved:

| # | Missing state | Why it matters | Status |
|---|---|---|---|
| M1 | Windows High Contrast / forced-colours mode | Gate A4 accessibility requirement | **MISSING — no capture; no CI step produces one** |
| M2 | 125% and 150% DPI on a real display | The assignment's DPI stress requirement | **MISSING — driver captures at native scaling only; 125% cannot be produced by resizing** |
| M3 | Reduced-motion state | Accessibility requirement | **MISSING** (no distinct visual state captured) |
| M4 | Large/invalid invoice total rendering in the installed UI | D4 scenario 19 | **MISSING** |
| M5 | Urdu/Gurmukhi long mixed-script product name overflow | D4 scenario 18 partial | **MISSING** (browser render only) |
| M6 | Print output on physical paper (58mm and A4) | D4 scenarios 13/14, pilot step 10 | **MISSING — requires physical hardware** |

M1–M4 could be produced by an authorised Windows run at low cost; M5 partially; M6 requires hardware.

---

## 6. Classification discipline (enforced)

| Artefact class | Where it lives | May it satisfy Gate A3? |
|---|---|---|
| `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE` | Not in this environment | Yes, once actually reviewed |
| `BROWSER RENDER — NOT INSTALLED WINDOWS APP` | `docs/reviews/*` (repo) and `assets/browser-render/` (design branch) | **No** |
| `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` | design branch `arena/2c0afc32-sornio` `assets/` | **No** |
| `COMPUTED FROM SOURCE` (layout/contrast arithmetic) | `WINDOWS-VIEWPORT-ACCESSIBILITY-MATRIX.md` | **No** |

No artefact in this package is promoted across these classes.

---

## 7. Verdict

**A3 — Authentic Windows visual verification: BLOCKED.** 0/28 captures reviewed, 0 image bytes
available, 6 required states entirely absent from the capture plan. The review criteria and the
coverage map are now fixed so the work is executable without redesign once delivery is possible.
