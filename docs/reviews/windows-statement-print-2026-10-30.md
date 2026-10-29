# Customer statement printing correction — 30 October 2026

This extends draft PR #130 from `f84773770abb6f5e450239c0a8aeddd1cef9e11c` / tree `b49438b20ccd2456150380ac8178653723f754e3`. Main remains `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. The final proposed SHA, remote-tree verification and exact-head CI results are recorded in PR #130. No other review branch was rewritten or merged.

## Reproduced defect and correction

The receipt follow-up introduced a regression: its print CSS hides `#root`, while the older customer-statement button still called `window.print()` on content inside that root. A prepared statement could therefore print blank. The existing customer test counted printer calls but did not verify print-media visibility.

The strengthened existing customer test fails on the parent code with `Prepared customer statement must not be blank in print media: 0 !== 1`. It passes after the correction. [Before/after output and executed verification](windows-statement-print-evidence.txt) retain this deliberate reproduction failure separately from the passing final checks.

Receipts and statements now use the same single print job. Only the prepared document is cloned outside the application root. A4 statement styles repeat table headers, wrap references and keep rows together. The former conflicting application-wide customer print styles were removed.

Statement preparation calls the existing native `render_customer_statement` before cloning and again after asynchronous font loading. The returned HTML must match the prepared native snapshot, and the same customer/snapshot must still be open. Native session, scope, role, account revocation and recovery-generation checks remain authoritative. A changed rendered snapshot is cleared and must be prepared again. Printer failure leaves the preview available for retry; success text asks the user to check the actual output rather than claiming paper was produced.

Clearing, changing or unmounting a statement cancels only that document's print job. Receipt and statement jobs replace one another rather than leaving overlapping print trees. Native lock/revocation removes the private view and pending print DOM. The app cannot retract data already returned to a renderer, paper or an OS print queue.

There are no new native commands, dependencies, migrations, key-format changes, historical amount changes or production-data operations. Schema remains 11. Customer permissions are unchanged; the Cashier continues to have the existing native customer-read permission, and printing must re-establish it.

Vite also reported that the receipt JSON catalogue was imported from its public-asset directory. It now lives under desktop source and is bundled through a regular JSON import. Catalogue contents and receipt wording are unchanged; the bundled font and its licence remain public assets.

## Verification scope

The new `check-statement-print.cjs` uses two independent native Workspace/SQLCipher connections: the UI's human session and an Owner administration session. All data is synthetic. Its 105 real append-only credit entries exceed the screen's 100-row page, total exactly 10,605 paise, and are all included in the printable snapshot.

Tested behavior includes printer refusal/retry, escaped customer/reason text, Punjabi-name font rendering, native snapshot change before printing and while fonts are suspended, receipt/statement job replacement, and Cashier disablement while fonts are suspended. Account history, saved invoices, stock, balances and the billing outbox are compared before/after printing; no additional renderer financial posts occur. Authorization denial prevents the final OS print call and clears the private view.

The synthetic A4 PDF was parsed and rendered for review: **11 pages, all 105 operation references exactly once, table headers on every page, no application controls and no text outside page margins**. First/last-page visual inspection found no clipped text or missing Punjabi glyphs. Visual QA also caught a missing Punjabi font on the on-screen statement; it now uses the bundled font, with a regression assertion and a fresh capture. This is a headless Chromium PDF, not physical printing or an installed Windows executable.

The browser workflow runs this additional suite and uploads its PDF and screenshot through the existing review artifact mechanism when Actions can execute. Exact commands, operating system, counts and output are in the linked evidence file.

Final executed checks: **157 debug + 157 release native passes, zero failures per profile; 11 browser suites passed; four preservation-helper cases passed**. Shared-domain checks, TypeScript/Vite production bundle, changed-file ESLint and JS syntax passed. The final server log has no public-asset import warning. Two ignored native subprocess workers are exercised by passing parents.

## Founder-accessible evidence

- [Actual customer statement screen](windows-customer-statement-browser.png): Linux React/native review capture with synthetic data.
- [Unmodified application-generated 105-entry PDF](windows-customer-statement-synthetic.pdf): a synthetic print review artifact, not a certified accounting export or Windows printer result.
- [Previous receipt/recovery integration](windows-receipt-integration-2026-10-30.md) and [master threat model/gates](windows-master-integration-2026-10-30.md).

## Remaining release gates

At the start of this follow-up, all three workflows on parent `f847737` still failed before runner allocation/steps. The accessible APIs do not establish the underlying cause. Final-head runs/results are recorded in PR #130; a failed startup is not classified as a source compilation/test failure or as a successful installer build.

Windows vault, OS file/print dialogs, actual installer/offline/upgrade acceptance, signing, physical printer/scanner, low-end shop PC and two-PC LAN remain unverified. Native three-step onboarding and GST invoice integration remain incomplete. No LAN listener is enabled by this correction.

**Merge: HOLD. Pilot: NO-GO.** The next platform gate is an executing Windows runner and exact-head installed-app evidence. Continue the named-human/device and restore-generation adaptation of #126 separately within the same dependency-aware integration checkpoint; do not enable its older authority model.
