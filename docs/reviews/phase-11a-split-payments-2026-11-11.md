# Sornio Phase 11A — split payments with customer credit

Date: 2026-11-11. Outcome: **IMPLEMENTED — PARTIALLY VERIFIED**.

The source implementation is complete on `feature/phase11a-split-payments`.
Native compilation/tests, interactive browser checks and Windows acceptance remain blocked in this host. This is not Windows pilot approval.

## Source and preservation

- Starting checkout: `pilot/phase-10d-browser-coverage` at `c929b992317b6b027e8b212b096dae1004c99cb0`, clean.
- The exact preserved barcode candidate was available locally. An independent clone was created; original checkouts and bundles were left untouched.
- Its ancestor `cf58c3ba3fa4638ad95fe838129181c1b83a0fb0` matches the live `repair/p0-ci-financial-20261105` branch, verified using the connector and Git.
- The barcode candidate differs from that base only in the previously preserved scan/confirmation changes, focused tests, workflow test invocation and handoff documents.
- The new feature branch starts at the barcode candidate, preserving the verified financial source and barcode work together.
- Remote `main` was `1cc5c798d1eada9a16463213b0776c01e99d36f9`. No main edit, reset, force push, merge, PR creation or workflow dispatch is part of this assignment.
- The final commit and publication result are supplied in the engineering handoff accompanying this report.

## What was already implemented and what changed

The recovered baseline already had the real native mixed-tender transaction, credit subledger posting, atomic rollback, durable prepared requests and receipt payment records. This phase completes its cashier integration and strengthens the existing native path; it does not introduce a second billing engine.

Native changes:

- Extract a shared integer allocation validator and call it against the native invoice total before invoice, stock or ledger writes. It checks exact reconciliation, positive bounded paise, supported methods, unique payment IDs, valid references and the one-credit-part/customer relationship. Retain the guard at payment insertion for legacy paths.
- Require a live seller session inside split-credit posting itself. Remove its sessionless customer auto-creation fallback; an actual customer in the scoped database is required.
- Add `read_local_customer`, an exact-ID lookup under native `CustomerRead` permission and the existing scoped workspace boundary. This avoids depending on the first 101 fuzzy search results for the selected account. Wire it through Workspace, Tauri registration, build manifest, ACL and the native review bridge.
- Preserve existing request and receipt shapes, operation IDs, replay storage, database schema, credit limits, journals and commit boundaries. No migration is required.

Cashier and receipt changes:

- Group payable, allocated and remaining/overallocated amounts; support cash, UPI, card and customer credit, including three-way allocations.
- Add per-method “Use remaining” shortcuts; do all amount arithmetic in bounded integer paise with the existing fixed-decimal parser.
- Resolve the selected customer natively, show name, outstanding and available credit, block review for missing/unresolved customers and excess credit, and keep native final checks authoritative. Stale lookup replies are discarded. Provide a retry for failed customer-detail reads.
- Show customer name, identity and credit amount on review. Keep the existing explicit confirmation action and scanner Enter guard.
- Restore UPI/card references when recovering an intent. Clear old allocations/references when another window resolves that intent.
- Show **Amount due at sale** from the saved credit allocation, in English and Punjabi. This is the original invoice debt, not the customer's present balance after later collections/returns.
- Keep UPI/card explicitly unverified. Under the existing accounting convention, digital amounts stay in general receivables until manually matched; only the credit portion enters the customer's udhar subledger. Never report a provider settlement.
- Keep the existing 58mm, 80mm and A4 print path. Missing/inconsistent retail breakdowns disable printing rather than inventing a zero balance.

## Exact files changed

| File | Purpose |
| --- | --- |
| `packages/local-store/src/payments.rs` | Shared allocation validation and payment insertion guard. |
| `packages/local-store/src/billing.rs` | Validate allocations against authoritative total before writes. |
| `packages/local-store/src/customers.rs` | Authenticated exact customer lookup; split-credit session enforcement. |
| `packages/local-store/src/access.rs` | Authorized Workspace lookup contract. |
| `packages/local-store/examples/cashier_review_bridge.rs` | Expose exact customer lookup to real native integration tests. |
| `packages/local-store/src/payments_tests.rs` | Six focused Phase 11A native tests with multiple cases. |
| `apps/desktop/src-tauri/src/main.rs` | Scoped Tauri customer command and handler registration. |
| `apps/desktop/src-tauri/build.rs` | Build-time command manifest. |
| `apps/desktop/src-tauri/permissions/workspace.toml` | Customer command capability. |
| `apps/desktop/src/CheckoutPanel.tsx` | Allocations, customer validation, review and recovery integration. |
| `apps/desktop/src/CustomerLookup.tsx` | Exact selected-account details, async response protection and retry. |
| `apps/desktop/src/payment-allocation.ts` | Shared integer preview and original receipt debt validation. |
| `apps/desktop/src/SavedInvoice.tsx` | Original amount due and missing-breakdown print guard. |
| `apps/desktop/src/style.css` | Grouped payment totals and responsive allocation controls. |
| `apps/desktop/src/locales/pa.json` | Punjabi receipt messages. |
| `apps/desktop/test-payment-allocation.mjs` | Allocation, bounds, remainder and receipt-debt tests. |
| `apps/desktop/test-payment-receipt.cjs` | Render the real receipt component in Node. |
| `apps/desktop/package.json` | `test:split-payments` command. |
| `scripts/verify-desktop-contract.mjs` | Verify build manifest as well as handler/ACL/renderer wiring. |
| `docs/reviews/phase-11a-split-payments-2026-11-11.md` | This implementation and evidence report. |

## Executed verification

| Check | Actual result |
| --- | --- |
| `npm run build --prefix apps/desktop` | PASS: TypeScript and Vite production bundle, including the final UI changes. |
| `node --test apps/desktop/test-payment-allocation.mjs apps/desktop/test-scan.mjs` | PASS: 17 tests (14 allocation/debt and 3 barcode regressions). |
| `node --test apps/desktop/test-payment-receipt.cjs` | PASS: 3 tests rendering the real React receipt; no browser or physical-print claim. |
| Targeted ESLint on changed TS/TSX, new JS tests and desktop-contract verifier | PASS, 0 errors/warnings. |
| `node scripts/verify-desktop-contract.mjs` | PASS: 38 static boundary/permission/keyboard/translation checks. The first execution caught the missing customer ACL; production wiring was corrected, with no assertion weakened. |
| `node scripts/verify-checkout.mjs` | PASS: existing exact-paise display, large balance and fractional-quantity checks. |
| `git diff --check` | PASS. |
| `cargo test --locked --manifest-path packages/local-store/Cargo.toml --lib phase11a` | BLOCKED: `cargo: command not found`. No native tests or native compile claimed. Rust formatter is also unavailable. |
| One Chromium availability probe | BLOCKED: `socket() failed: Operation not permitted` during browser startup. No browser acceptance suite was repeatedly attempted. |
| Installed Windows/Tauri/scanner/printer acceptance | BLOCKED: no accessible Windows host. |

The existing local Node dependencies were reused; no dependency versions or lockfiles were changed. No stale compiled Rust bridge was used as evidence for this candidate.

## Required cases and evidence boundary

The new `phase11a_*` Rust tests are present but unexecuted here. Their fixtures exercise the real SQLite/native implementation, not a mock ledger.

| Required case | Added native coverage | Executed supporting check |
| --- | --- | --- |
| ₹1,000 cash-only | Tender matrix and legacy path regression | Allocation/debt unit case |
| ₹1,000 UPI-only | Tender matrix, pending status and no external verification | Allocation/debt unit case |
| ₹600 cash + ₹400 credit | Tender matrix, customer statement, stock and replay | Allocation and actual React receipt render |
| Three allocations | Cash + UPI + credit matrix | Allocation and actual React receipt render |
| Below invoice total | Full financial/stock snapshot rollback | One-paise shortage |
| Above invoice total | Full financial/stock snapshot rollback | One-paise excess |
| Credit exceeds limit | Refusal snapshot and cashier policy bypass denial | Native execution blocked |
| Missing/invalid customer | Shape rejection, missing exact account, exact lookup | Native execution blocked |
| Insufficient stock | Refusal snapshot | Native execution blocked |
| Repeated operation ID | Snapshot equality after exact replay | Existing static retry wiring checks |
| Interrupted/uncertain checkout | Restart before posting, restart after committed response loss, late write failure and retry | Existing static recovery wiring checks |
| Unauthorized credit manipulation | Locked session; cashier policy/write-off denial | Command scope/ACL static checks |
| Customer statement and receipt | Only credit portion in statement with invoice link | Actual React receipt render and missing-breakdown print guard |

## Remaining limits and next assignment

No known new source defect remains from the executable checks. Rust compilation and native financial behavior on this exact candidate are still unverified, as are interactive customer selection, cashier focus and printed layout. The new credit-limit UI is a preview; another till may change the available balance, and the existing writer-transaction check must accept or refuse the final sale.

Before integrating this branch, run the focused native tests and native/browser checkout on a capable host; Windows acceptance remains a separate release gate. Continue independent implementation meanwhile.

Recommended next implementation assignment: **offline held bills / resume sale**, using durable drafts with explicit cashier ownership, never deducting stock or creating receivables until the existing checkout commits. Keep this work on a separate branch.
