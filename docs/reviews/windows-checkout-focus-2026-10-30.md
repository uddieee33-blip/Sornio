# Checkout focus / acceptance reliability — 30 October 2026

## A. Baseline

Main: `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. Starting draft PR #130 head: `e3bc4d999928c1aa85e64e618f87cc573f77207a`. Focus repair: `82a6ef3dd85bc0bdefa54bdfe1b55a34d9ef2f55`. Customer-test repair: `59fcaf73aae634330c4c727cf517a2bc25da64e1`. Final evidence commit, proposed head and CI links are recorded in [PR #130](https://github.com/uddieee33-blip/DukaanOS/pull/130). No merge or administrative change.

## B. Verified defects and changes

**Application defect:** `apps/desktop/src/CheckoutPanel.tsx` focused item search unconditionally when an asynchronous checkout read made it ready. A user already editing another form could have subsequent typing redirected into search. The delayed-response regression produced `activeId=checkout-search`, unchanged note, text in search and disabled draft-save button. This matches the symptoms of the earlier intermittent mocked UI timeout; its original run did not record focus, so this does not establish the cause of every historical timeout.

The focus effect now preserves controls outside checkout and active editable controls inside it. Initial cashier entry and explicit checkout refresh/F2 continue to focus search. The new `apps/desktop/check-focus.cjs` uses real React/Workspace/SQLCipher and holds only the checkout read response. It verifies correct typing destination, enabled save, persisted note, explicit keyboard navigation and zero invoices. It failed before the fix and passed afterward. `.github/workflows/workspace-browser.yml` runs this regression with the existing suite.

**Test synchronization defect:** the customer suite saw a prepared statement and immediately asserted the print-call counter while fonts and the second native authorization were still pending. This continuation reproduced `0 !== 1` at `check-customers.cjs:136`. The test now holds font readiness, requires zero premature print calls, releases the gate, waits for the application's print-completion status, then requires exactly one call. This changes `apps/desktop/check-customers.cjs` only; printing authorization and production print behavior are unchanged. No sleeps or removed assertions were introduced.

## C. Verification

[Exact commands, source hashes and actual output](windows-checkout-focus-evidence.txt). Ubuntu 24.04.3 / Node 24.22.1 / Playwright 1.62.1 / Chrome 156.0.8078.73:

| Check | Actual outcome |
| --- | --- |
| Deterministic delayed checkout, before fix | Failed: typing moved into search; note unchanged; save disabled |
| Same regression after fix | Passed, including persisted edit and explicit cashier focus |
| Desktop TypeScript/production build | Passed |
| Targeted ESLint and diff checks | Exit 0; existing Next pages-directory configuration notice retained |
| Broad 12-suite browser batch | 11 passed, 1 customer print-counter timing failure |
| Customer suite after synchronization repair | Passed |
| Dedicated 105-row statement-print suite after repair | Passed |

All 12 distinct suites have passing results for the relevant final code: focus, UI, inventory refresh, checkout, receipts, authorization, credentials, customers, statement printing, retail and inventory recovery. The initial failure remains in the evidence; this is not a claim of an uninterrupted green first batch. Two suites mock IPC; ten drive the native review bridge. Synthetic response delays and print-dialog transport are identified in the scripts. Native source is unchanged: the prior checkpoint's 174 debug and 174 release passes remain its recorded evidence, without claiming a fresh Rust run here.

## D. CI and Windows

The inspected parent-head browser/core/Windows runs remained failed with no runner or job steps and no artifacts. Windows job `124055177936` log retrieval returned `404 BlobNotFound`. Final-head runs and diagnostics are linked from #130. Available diagnostics do not establish the underlying account/infrastructure cause. No check or permission was weakened.

Current installer, installed-Windows screenshots, Windows vault/upgrade/OS-lock acceptance and physical printer/scanner/low-end-PC results remain **BLOCKED or UNTESTED**. Existing genuine Linux screen captures remain available in this directory; this increment has no new Windows image or installer. No hardware acceptance is implied by the print tests.

## E. Financial and security assessment

No Rust, schema, ledger, operation ID, permission or stored financial record changed. Existing checkout/credit/payment/refund/inventory/backup and authorization browser cases passed. The focus regression creates no invoice and saves its synthetic draft through native authorization. The print test retains native reauthorization, sensitive-data checks and existing financial-state assertions.

The schema-12 native LAN authority remains gated: its peer type has no production constructor, and no listener, pairing UI or LAN command is enabled. Restore disables device grants and fences the replaced database. Independently retained originals and diverged histories still require reconciliation; these changes do not resolve that limitation. UPI remains pending/manually reconciled, and GST compliance is not certified.

## F. Continuation

The next LAN milestone remains a reviewed TLS adapter and named-human session protocol, Owner pairing/revocation commands/UI, durable client intent and disconnected-sale refusal. Test real peer revocation, hub termination, lost replies and restore-generation quarantine before enabling transport. Separately resolve the account's actual runner-start blocker, then collect the Windows installer and installed-application evidence on the proposed head. Main protection/independent review remain release gates.

## G. Pilot decision

**NO-GO; merge HOLD.** The reproduced focus bug and print-test race are repaired with executed regressions. Operational LAN and mandatory Windows/release evidence remain incomplete.

## H. Founder summary

Checkout loading now preserves typing in another form instead of redirecting it into item search. Cashier keyboard navigation still works. Native retail/credit/returns/closing/backup workflows remain on the draft integration branch. It is not yet an accepted shop release. Genuine Linux captures are linked in #130; no current Windows installer is available. The next meaningful product milestone is secure real LAN communication plus Windows acceptance when runners execute.
