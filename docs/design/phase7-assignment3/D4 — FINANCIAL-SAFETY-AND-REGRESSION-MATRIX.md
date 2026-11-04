# D4 — Financial Safety and Regression Matrix

**SORNIO — Phase 7 / Assignment 3** · Workstream D: Financial and Reliability Safety
**Status:** Risk review and regression specification. **No production financial logic, schema,
test or assertion was modified by this assignment.**
**Gate D:** evaluated in §4.

Source of truth: current `origin/main` = `1cc5c798d1eada9a16463213b0776c01e99d36f9` (verified
2026-11-04). All "existing test evidence" references trace to test files present on main or to
Phase 4/5 review records; none was re-executed in this sandbox (no Rust toolchain reachable here,
per environment constraints — see D1 §8).

---

## 1. Financial invariants the approved design must not alter

| # | Invariant | Current evidence on main |
|---|---|---|
| I1 | Integer-paise money representation | `billing-types.ts` `money(paise: BigInt)`; native `i64` paise throughout `packages/local-store` |
| I2 | Native financial calculations | No renderer prices/totals/settlements (`billing.rs` header contract) |
| I3 | Atomic checkout | Single transaction per sale; native refusal codes propagated to UI |
| I4 | Split-payment validation | Exact-paise sum equality (`cash + upi + card + credit === totalPaise`) in `CheckoutPanel.tsx` and `payments.rs` |
| I5 | Customer-credit constraints | `post_split_credit` limit check (`CreditLimit`), amount > 0, amount ≤ total; `credit_sale_once` unique index |
| I6 | Stock-deduction semantics | QuantityMilli aggregation (PR #142); oversell guard; `checkout_active` catalog gating |
| I7 | Idempotency and operation IDs | `operationId` (crypto.randomUUID) + `retailRef`; replay protection in `payments.rs`; `credit_sale_once` |
| I8 | Transaction recovery | Pending sale preserved across lock/relaunch; F8 same-ID retry; `recovery.rs` |
| I9 | Backup and restore behavior | Owner password + recovery passphrase; ciphertext+SHA-256 verification; safety backup; staff disable post-restore; `RESTORE <12-hex>` phrase |
| I10 | SQLCipher persistence | SQLCipher-encrypted local store; `SCHEMA_VERSION=12` (`packages/local-store/src/lib.rs:150`) |
| I11 | Native permission enforcement | `access.rs` roles (owner/manager/assistant_manager/cashier); renderer never grants permissions |
| I12 | Offline-first operation | No network required for sale/stock/credit; `windows-local.yml` runs with app+WebView2 firewall-blocked |
| I13 | Printing authorization | Print after save only; statement print re-verifies snapshot; print root isolated (`receipt-print.ts`) |
| I14 | Existing business rules | Day closing variance, damaged-return restocking rules, closing-count corrections (Phase 4/5 hardening) |

**Approval status of these invariants:** none is altered by the Direction A design contract (D2/D3).
The proposed visual changes are presentation-layer only.

---

## 2. Defects recorded as defects (not redesigned away)

| ID | Defect | Status on main | Recorded consequence |
|---|---|---|---|
| DEF-1 | `#829fce` focus ring = 2.69:1 — fails WCAG 2.2 AA non-text contrast | **Still present** (`style.css:6` focus rule) | Documented as accessibility defect; fixed by proposed `color.focus.ring` token in D2 §2.2 — implementation-phase item, not silently changed |
| DEF-2 | Mixed cash+credit split sale refused on pre-fix audit branch (`OperationConflict` from in-flight pending row) | **Fixed on main** (PR #145, `post_split_credit` no longer calls `unclaimed()` on pending) | Regression pinned: `check-native.py` mixed split blocks + native tests |
| DEF-3 | `Fill remaining` allocation helper not available | By design (deferred in operator-UX review) | Remains unapproved until arithmetic/interaction/native-boundary spec exists (D6) |
| DEF-4 | `Schema 11` text in older recovery browser preview vs current `SCHEMA_VERSION=12` | Preview text only, not production behaviour | Recorded; current schema identity is 12 |
| DEF-5 | Unsigned engineering installer; no certificate infrastructure | Present | Blocks real-shop pilot and public release (D6, D7) |
| DEF-6 | Physical printer/power-loss/multi-PC hardware evidence absent | Present | Blocks physical pilot (D6 decision register) |

---

## 3. Risk scenarios (20)

Severity scale: **Critical** = financial-loss or data-corruption potential; **High** = blocks a
required gate; **Medium** = quality/consistency risk; **Low** = polish.
Release consequence: **BLOCKS** = must pass before any release decision; **GATED** = must pass
before the affected milestone; **TRACK** = monitor, does not independently block.

| # | Scenario | Risk | Expected behavior | Existing test evidence | Missing automated coverage | Proposed regression test | Severity | Release consequence |
|---|---|---|---|---|---|---|---|---|
| 1 | Double-click checkout confirmation | Two `post_local_retail` calls race | One invoice, one ledger row, one stock move; second call replays or refuses | `check-native.py` repeated-submit burst (SPACE/ENTER/ENTER/SPACE); `verify-desktop-contract.mjs` 37; native replay tests | None identified beyond burst — add explicit double-click mouse test | Add Playwright double-click on `Confirm sale` asserting one `operationId` and one invoice; keep native burst | Critical | BLOCKS |
| 2 | Rapid repeated keyboard submission | Scanner/key-repeat storms | `event.repeat` and IME guards suppress repeats; one posting | `CheckoutPanel.tsx` repeat/`isComposing` guards; `check-checkout.cjs` | Key-repeat through WebView2 on packaged app (not browser) | UIA key-repeat storm test in `check-native.py` asserting single invoice | Critical | BLOCKS |
| 3 | Scanner input during transaction processing | Scan while `busy` | Input ignored or queued safely; no malformed operation; UI shows busy state | `check-focus.cjs` focus-race pattern; `submitting.current` ref guard | Scanner cadence at `busy` boundary not automated | Add scanner-cadence test at busy boundary (UIA send-keys during `Saving…`) asserting no second posting and no lost input corruption | High | GATED |
| 4 | Offline operation | Network absent mid-shift | Full sale/stock/credit/backup flows work; no false online claims | `windows-local.yml` runs with firewall blocking app+WebView2; native offline tests | None — offline is CI-verified but not on physical hardware | Physical-shop offline scenario in pilot plan (D6); add local WebView2 offline toggle test | High | GATED |
| 5 | App interruption after posting | Kill after commit, before UI update | Committed sale persists exactly once; reopen shows saved receipt | `check-native.py` force-termination blocks (`windows-local-reopened.png`, `windows-mixed-split-reopened.png`); `crash_before_commit` native tests | Kill between commit and receipt render | Extend UIA kill-timing sweep (before/after commit) asserting single invoice + preserved receipt | Critical | BLOCKS |
| 6 | Unknown transaction result | Crash after send, before response | UI shows `Result uncertain — retry same sale` with original operation ID; retry posts once | `check-native.py` `windows-local-failure.png` block; `recovery.rs` tests | Pixel-level uncertain-state presentation (prototype only) | Installed-UI uncertain-state screenshot + same-ID retry assertion after simulated crash | Critical | BLOCKS |
| 7 | Retry with the original operation ID | F8 after uncertainty | Same ID, same payload → one sale; changed payload under same ID → conflict | `duplicate_mixed_sale_request_posts_once`; `changed_payload_under_same_operation_id_conflicts`; F8 UI blocks | None beyond native — add UI-level same-ID contract test | UIA F8 retry regression pinning operation ID equality in `verify-desktop-contract.mjs` | Critical | BLOCKS |
| 8 | Restart and recovery | Reboot mid-sale | Pending sale recovered; no duplicate; draft/credentials/balances preserved | `check-installer.ps1` `--verify-preserved`; `cash_credit_restart_and_exact_retry`; reinstall-preserved block | Cross-version upgrade recovery | Upgrade-path recovery test (install older build data, upgrade, verify) — requires signed upgrade evidence | High | BLOCKS |
| 9 | Insufficient inventory | Quantity exceeds stock at confirm | Refusal with stock message; no partial commit | Oversell guard (UI-02); native stock tests | Cart-edit race at confirm time | Add cart-edit-then-confirm race test asserting refusal and unchanged stock | High | GATED |
| 10 | Customer-credit limit exceeded | Credit part above limit | `CreditLimit` refusal; no invoice, no stock move, no ledger row | `mixed_sale_exceeding_credit_limit_is_refused_atomically` (design-doc test list); `CreditLimit` code | UI presentation of refusal in new allocation table | Allocation-table credit-limit refusal UI test + native atomicity re-run | High | GATED |
| 11 | Mixed cash-plus-credit checkout | ₹1,000 = ₹600 + ₹400 split | Exact allocation; balances cash +600/credit +400; one invoice; ledger balanced | `windows-thousand-split-sale.png` block; native `mixed_cash_and_credit_commits_one_sale_with_balanced_ledger`; UI-06/UI-14 | None — CI-verified on integration head; pixel review blocked | Re-run on reviewed commit + visually review capture artifact (D1 §5) | Critical | BLOCKS |
| 12 | Payment allocation mismatch | Parts ≠ total | Refusal `Split payment amounts must equal the invoice total exactly`; no posting | Exact-equality client rule; native sum check | None beyond rule — add edge-case sweep (0.01 paise off, over-allocation, negative) | Paise-edge allocation sweep test (UI + native) | High | GATED |
| 13 | Print requested before confirmation | Print on unsaved sale | No print path exists; UI disables print until saved | Print authorization after save (I13); no pre-save print control | None | Add negative test: print control unavailable until `Confirm sale` succeeds | Medium | TRACK |
| 14 | Print retried after confirmation | Retry print after save | Prints the same saved receipt; no re-posting | `check-receipts.cjs`; `Print saved receipt` UIA name | Print-retry-after-restart | Add print-after-restart regression (receipt idempotent, no repost) | Medium | TRACK |
| 15 | Manager-only action by cashier | Cashier attempts owner action | Native refusal; UI shows permission message; no data change | `check-authorization.cjs`; `windows-staff-disabled.png`; role gates in `main.tsx` | None beyond current — add allocation-table credit-edit by cashier case | Add cashier credit-limit-edit refusal test in new W3 presentation | High | GATED |
| 16 | Dirty form interrupted by navigation | Lock/reopen during unsaved edits | Prompt with `Continue editing` / `Discard edits`; focus restored; no silent loss | `check-focus.cjs`; `main.tsx` prompts (`lockPrompt`, `reopenPrompt`) | None | Keep existing prompt regressions; add W1 shell nav-during-busy assertion | High | GATED |
| 17 | Screen scaling obscuring confirmation controls | 125% scaling hides total/confirm | Total + confirm remain pinned and actionable at 125% effective viewport | **None — no automated 125% measurement exists** | Full 125% content-viewport measurement (D3 W2) | Add WebView2 1280×720 @125% layout regression asserting total/confirm visible and actionable | High | BLOCKS |
| 18 | Punjabi item names and receipt rendering | Gurmukhi clipping/mixed strings | Wrapped text; no clipped matras; verified `pa.json` phrases; print legible | `verify-i18n.mjs` 22 catalogues/2,751 phrases; `windows-punjabi-receipt-browser.png` (browser render) | Physical Gurmukhi print; installed-app Punjabi rendering | Physical print gate (pilot step 10); installed-UI Punjabi receipt screenshot | High | BLOCKS |
| 19 | Very large invoice totals | Exponent/NaN/drift above 2^53 paise | Exact BigInt rendering; no float drift | `verify-native-money.mjs` 4,820 random invoices/180 overflow refusals | None beyond money verifier — add UI rendering of large totals | Add UI test rendering ₹1,00,00,00,000.00-class totals in totals panel + receipt | Medium | TRACK |
| 20 | Stale or conflicting UI state | Background refresh overwrites cart | `readGeneration` prevents stale overwrite; refresh tokens gate panels | `CheckoutPanel.tsx` `readGeneration`; `check-inventory-refresh.cjs`; `check-checkout.cjs` refresh tests | None beyond current | Add W1-shell refresh-token regression for new composition | High | GATED |

---

## 4. Gate D evaluation

| Requirement | Status | Evidence |
|---|---|---|
| All listed financial invariants preserved by proposed design | ✅ | §1 — design contract is presentation-layer only (D2/D3); native boundaries untouched |
| Existing defects recorded as defects | ✅ | §2 (DEF-1…DEF-6); none redesigned away silently |
| Risk scenarios specified with required fields | ✅ | §3 — 20 scenarios × 7 fields |
| Existing test evidence identified | ✅ | §3 "Existing test evidence" column traces to main test files and Phase 4/5 records |
| Missing automated coverage identified | ✅ | §3 "Missing automated coverage" column; Gate G6 matrix in D7 |
| Proposed regression tests specified | ✅ | §3 "Proposed regression test" column |
| No proposed visual interaction bypasses native validation | ✅ | All 20 scenarios: expected behavior keeps native authority (I1–I14) |
| Reliability contract not weakened | ✅ | No assertion weakened or disabled in this assignment; nothing implemented |

**Gate D verdict: PASS** on documentation — the proposed design preserves every financial
invariant, defects are recorded as defects, and every risk scenario has expected behavior plus
identified coverage gaps. **Qualification:** scenarios marked BLOCKS cannot pass until installed
evidence and the 125% measurement exist (D1 §5.7); this gate certifies the *specification*, not the
implementation.

---

## 5. Hard release gates (carried from prior review records)

| Gate | Source | Current state |
|---|---|---|
| Installed Windows UI acceptance (engineering scope) | Phase 4 review, run 41664825287 | PASS on audit branch (with split-credit fix, now on main) |
| Financial correctness through installed UI (₹600 + ₹400 class) | Phase 4 UI-06/UI-14 | PASS on integration head; pixel re-review pending (D1 §5) |
| Real-shop Windows pilot | `release-evidence-manifest-2026-11-02.json` | **NO-GO** — unsigned installer, printer/scanner/power/Gurmukhi hardware evidence absent |
| Public commercial release | same manifest | **NO-GO** — unsigned installer, upgrade path untested, GST out of scope, digital verification absent |
| Production cloud synchronization | `productionSyncEnabled=false` (apps/mobile/app.json:62) | **NO-GO** |
| Android public release | Phase 4 review | **NO-GO** |
| GST statutory invoicing (PR #127) | open PR, conflicting | **SEPARATE / NOT CLAIMED** |
| Multi-till LAN (PR #126) | open PR, draft, conflicting | **SEPARATE / ISOLATED** |
