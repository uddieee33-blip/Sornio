# Windows receipt integration — 30 October 2026

Follow-up: [customer statement print correction](windows-statement-print-2026-10-30.md) fixes the blank-statement CSS interaction introduced here and adds native authorization/snapshot checks to statement printing. The counts below describe this receipt checkpoint; final verification is in the follow-up and PR #130.

This extends existing draft PR #130, parent `86918f462087cb480fa1414f5f39dcc1df8502ef` / tree `c00bc226a6c024062b04c4f7f6860f71837e0c57`. Merged main remains `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. No older review branch is overwritten or merged. The proposed final head and exact-head CI links are recorded in PR #130.

**NO-GO for a shop pilot.** Local testing establishes the behavior below; no current Windows installer, OS print-dialog, physical printer/scanner or installed-app acceptance is claimed.

## Integrated functionality

- Adapt #128's F2 item search, exact-code/single-match Enter, repeated-scan quantity increase, F3 quantity focus, F4 review/Enter confirmation, Escape review cancellation and F8 same-ID recovery to the existing cash/credit/UPI/card/split checkout. Empty/ambiguous search and repeated keydown cannot silently add an item. Existing native integer calculations and pending operation IDs remain authoritative.
- Saved receipts can be reopened by exact ID. Owner/Manager report permissions also allow browsing native receipt history. Cashier/Assistant Manager lookup is restricted to their own attributed invoices, including after checkout acknowledgement; knowing another invoice ID grants no access.
- Add `read_local_invoice` to the Tauri command, build, permission and test registry. The Workspace read snapshot enforces session, scope, revision, recovery generation and per-invoice authority. It exposes no SQL, path, mutable ledger or renderer-selected actor.
- Print preparation reads the native saved invoice before cloning and again after asynchronous font loading. The displayed immutable snapshot must match. Revoked/expired access, an unavailable record, or a changed snapshot stops preparation. Current names/prices and unsaved carts are not substituted into saved invoices.
- Reuse/adapt #128's A4, 58 mm and 80 mm print-only rendering, local Gurmukhi font/OFL licence and Punjabi receipt catalogue. Keep current frozen business name, sale number, legacy fallback, credit reference, original tax/total and explicit unverified digital-payment text. Display the saved UTC timestamp explicitly in IST, matching the native cashier business-day policy rather than depending on the reviewing computer's timezone.
- Punjabi is scoped to available receipt labels; workflow controls and some explanations remain English. The shared web DOM-translation provider was not imported into the native financial screens. No names, amounts, credentials or language preference are written to browser storage.
- Print preparation is cancellable. Lock/unmount removes its private DOM/listeners; a late cancelled job cannot clear or print a newer job. Failed printing/reprinting invokes no financial posting or stock movement. Returning from a print dialog never means paper was produced.
- The browser workflow runs the new native receipt suite and preserves its PDF review artifacts. Windows acceptance exercises exact-code Enter and requests additional genuine setup/unlock/product/credit/repayment/staff/payment/refund captures when a Windows runner can execute. These capture paths are configuration, not current Windows evidence.

No database migration, encryption/key format, dependency manifest/lock, tax posting policy, genuine business record, cloud transport, LAN listener or large theme change was introduced in this follow-up. Schema remains 11. The native SQLCipher/financial architecture and earlier recovery integration are retained.

## Actual verification

Environment: Ubuntu 24.04.3; Rust 1.99.1; Node 24.22.1; Chromium headless 156.0.8078.73. As in the prior checkpoint, Linux native tests use bundled SQLCipher and the installed system OpenSSL provider; normal Windows CI provider settings remain unchanged.

| Check | Result |
| --- | --- |
| `cargo test --locked --all-targets --manifest-path packages/local-store/Cargo.toml` | **157 passed**: 151 library + six command-security tests; 0 failed. Two subprocess workers are invoked by their passing parents, not counted as standalone passes. |
| Same command with `--release` | **157 passed**, 0 failed, same subprocess handling. |
| Native registry/negative cases | **48 commands / 69 sensitive request variants**, including locked, wrong-scope and disabled sessions; ownership/acknowledgement/missing-ID tests added. |
| Existing nine browser suites + `check-receipts.cjs` | **10 suites passed**: two mocked-IPC suites and eight actual React → Workspace/SQLCipher suites. Review transport and print-dialog stubs are not Tauri/WebView2/physical acceptance. |
| Shared-domain checks | Passed: rounding/input grid, eight workspace definitions, 45 request fixtures, 13 money fixtures, exact display. |
| Desktop TypeScript + production Vite bundle | Passed; bundled Punjabi font matches the source asset byte-for-byte. |
| Changed-file ESLint, Rust format, JS/Python syntax and preservation helper | Passed; four helper tests. ESLint emits the existing partial-checkout pages-directory notice, not a changed-file lint error. |

[Executed commands and output](windows-receipt-test-evidence.txt).

Receipt tests check empty/ambiguous input, key-repeat protection, exact SKU priority, saved paise/tax, printer refusal/retry, three CSS/PDF layouts, print-only content, original business snapshot after a draft rename, Punjabi text/font, historical reprint, cancelled async job isolation, Cashier ownership and disabling a Cashier while font loading is suspended. Saved invoices, stock, balances and outbox remain equal across print/reprint; **zero extra financial posts** are observed.

The final synthetic sample's F4-review/Enter-commit measurement under 4× browser CPU throttling is recorded in the log. It excludes human typing and is not a shop-PC benchmark or a before/after speed claim.

All four generated sample PDFs (A4, narrow 58/80 mm content, Punjabi) were rendered and inspected. Each has one page and only receipt content. Narrow templates measure 52/74 mm content width in browser CSS; the PDF review does not prove a thermal driver's physical page size, feed length, margins or cutter support. A4/thermal English and Punjabi renderings were visually checked with no clipping or missing receipt glyphs. Visual QA caught missing glyphs in the language/print controls; those controls now use the same bundled font. The Punjabi PDF test was corrected to use print media rather than the screen layout.

An existing backup test read the newly mounted note before its asynchronous workspace load finished. It now first asserts the restored note directly from native storage, waits for that value to reach the screen, then checks the UI. The expected note and financial assertions remain unchanged, and the full backup flow passes.

## Accessible visual evidence

- [English saved receipt](windows-saved-receipt-browser.png).
- [Punjabi receipt and controls](windows-punjabi-receipt-browser.png).

These are genuine React/native review captures with synthetic data on Linux. They are **not Windows screenshots** or generated mockups. Print review PDFs are automated test artifacts; the existing Actions upload step collects them when the browser workflow can execute.

## Remaining boundaries and continuation

The same Windows Actions startup blocker remains until exact-head jobs actually allocate a runner and execute. No Windows build, signing, vault, offline installation, OS file-dialog, print-dialog, physical hardware or actual version-upgrade result is inferred from Linux/browser success. Previous successful #123 installers/captures remain historical and do not contain this integration.

Authorization is checked before handing a saved snapshot to the OS print flow. The app cannot retract paper, a queued OS print job or data already returned to a compromised renderer. Native receipt lookup protects new disclosure; it does not promise remote erasure of already-retrieved data. Windows suspend/session-lock and driver behavior still need direct acceptance.

GST invoice integration/compliance is incomplete. This is an original sales receipt; later collections, returns/refunds and ledger history remain separate records. Legacy invoices lacking a frozen shop name are labelled as such, not printed under today's business name. Receipt language support is partial, not whole-product Punjabi localisation.

Next checkpoint: resolve the Actions runner-startup gate from accessible platform diagnostics, then run CI, browser/native and installed Windows acceptance on the exact proposed head. Review the resulting engineering installer and real screenshots. Continue #126 against this integrated schema with named-human/device permission intersection and restore-generation reconciliation; do not enable its older device-role-only listener. Native three-step onboarding, GST/accountant review, all vertical workflows and physical shop acceptance remain unfinished.

**Merge recommendation: HOLD. Pilot decision: NO-GO.**
