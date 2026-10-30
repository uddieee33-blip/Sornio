# Native LAN authority checkpoint — 30 October 2026

## A. Baseline and review status

Main remains `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. Work began from verified draft PR #130 head `cd6cf034de303924d41a79673abb5c68b44ccf41`. Implementation commit: `146c96eaf46a0141b263644d7714a9d58fe83479`. The subsequent evidence commit/final head and exact-head CI runs are recorded in [PR #130](https://github.com/uddieee33-blip/DukaanOS/pull/130). No merge, force push, administrative change or public deployment. #126 remains a separate draft; its older device-only listener was not enabled or copied over current identity/financial code.

## B. Integrated native changes

`packages/local-store/src/lan_authority.rs` and `lan-authority-schema.sql` add a deliberately narrow native gateway integrated through `Workspace` in `access.rs`. Owner device enrollment/revocation requires the current Owner session and fresh password. Grants bind certificate fingerprint, business/workspace, generation, capability and revision. Enrollment retries cannot re-enable revoked devices. Device identity and successful operation history are protected against deletion/update/SQLite replacement where appropriate.

Native gateway sessions bind the enrolled device to an individually authenticated human. Every request revalidates device revision/enabled state, human revision/enabled state/expiry, business/workspace and recovery generation. The allowed intersection exposes catalogue reads and cash invoice posting only. A read-only terminal cannot sell even when its human is Owner. No generic callback or remote Owner-management command is exposed. Passive catalogue refresh does not extend the human idle deadline.

Posting reuses `billing::post_into` and its current invoice, stock, customer/payment journal, audit and outbox logic. Both authorities are checked after acquiring the SQLite writer lock, including on retries. The device/user/generation/payload binding and ordering receipt commit in that same transaction. Identical concurrent retries return the same saved receipt; changed payloads, another user/device, or a local invoice claiming the ID are refused. Financial history is not duplicated into a replacement ledger.

**This is a native foundation, not operational LAN.** `VerifiedPeer` and gateway sessions are opaque and non-deserializable; no production constructor exists for verified peer evidence until a reviewed TLS adapter supplies it. Tests construct synthetic peers internally. No socket, listener, token protocol, enrollment UI or Tauri grant command is registered. Current application screens continue using their existing local paths.

## C. Tests and observed failures

[Commands, exact source hashes and actual logs](windows-lan-authority-evidence.txt).

| Verification | Result |
| --- | --- |
| Linux native debug, all targets | **174 passed**, 0 failed: 168 library + 6 command-security |
| Linux native release, all targets | **174 passed**, 0 failed |
| New authority cases | 10 passed: grants, permission intersection/revocation, credential/idle expiry, restart/replay identity, competing sales, concurrent duplicate delivery, required-write rollback, immutable history, restoration fencing, migration |
| Added schema-11 archive recovery case | Passed |
| Frontend TypeScript and production bundle; production bridge; formatting/diff checks | Passed |
| Final desktop browser batch | 10 passed; **1 mocked UI timeout** |
| One unchanged mocked UI retry | Passed; intermittent failure remains unresolved |

Three ignored native cases are subprocess workers invoked by passing parent tests. Browser `ui` and `inventory-refresh` use mocked IPC; the other nine suites use React → native Workspace/SQLCipher through the review bridge. None is Windows/WebView2 or physical hardware evidence.

Recorded failures were not suppressed. Three older migration fixtures initially retained new tables while claiming old schema versions; those fixtures now remove the added tables before their original preservation checks. The new archive-fixture test initially attempted to modify a read-only verification connection; fixture construction now uses a separate writable test connection, while production validation remains read-only. A release link attempt failed with undefined hidden symbols; removing only this package's reproducible release artifacts and rebuilding passed without compiler/check changes. The precise cache/toolchain cause was not established.

Review also reproduced a passive-refresh idle extension in the new gateway (one failing assertion). The fix limits activity renewal to successful posting/replay, and the final full suites pass that assertion. The final mocked UI batch timed out at `check-ui.cjs:130` because `Save local draft` stayed disabled. An earlier run and one unchanged retry passed. Its cause is not established; do not classify this as a resolved application or test defect.

## D. Migration, recovery and Windows evidence

Schema **12** adds two tables and history/identity guards; it does not replace existing tables or rewrite financial records. Migration runs inside the existing transaction. Tests preserve prior invoices/stock and verify rollback on a conflicting partial schema. Older binaries reject schema 12; do not use an older executable to open the upgraded workspace.

`fixtures/recovery-v11-schema.json` freezes the exact pre-change schema. Recovery validation continues accepting genuine schema-11 archives and existing schema-5/6 formats, with current-schema archives verified against schema 12. Tests verify legacy archive restoration and existing migration/financial preservation. Restoring disables archived device grants, increments their revisions, preserves operation history and rotates the workspace generation. Explicit Owner reapproval is required. Old sessions and old-generation operation retries remain rejected after reapproval.

Starting-head core/browser/Windows runs remained failed before execution. Final-head diagnostics are linked in #130. **Current Windows installer and installed-app acceptance: BLOCKED.** No signing, real upgrade, Windows vault/session-lock/print-queue acceptance or physical hardware result is claimed. A [fresh schema-12 backup-screen capture](lan-authority-backup-linux.png) comes from the real application in Linux browser review with synthetic data; it is not Windows evidence or a LAN screen.

## E. Passed boundaries and remaining exposure

Native tests verify that two independently authenticated clients cannot both sell the last stock, and concurrent duplicate requests produce one invoice/operation receipt. Revoked devices, disabled users, password rotation, expired/idle sessions, wrong scopes and mismatched peers are denied. Gateway write/audit failures roll back stock, invoice, ledger and outbox. These are **PASS at the native boundary**, not transport or distributed-system certification.

Recovery still cannot revoke a physically independent original database or merge diverged histories. A trusted recovery passphrase permits offline archive access; SQLCipher cannot protect a compromised live Windows account. Existing UPI/card workflows remain pending/manually reconciled; the gateway currently rejects non-cash tenders. No external payment verification or GST compliance is claimed. Incorrect system time and accounting acceptance remain outstanding.

## F. Exact continuation

1. Investigate the retained intermittent mocked UI timeout without weakening its assertions.
2. Adapt #126's reviewed TLS/certificate work to this opaque peer boundary. Implement real authenticated peer construction, bounded wire messages and named-human token/session lifecycle. Preserve the native user/device/generation checks inside the authoritative transaction.
3. Add Owner pairing/revocation UI and scoped native commands with explicit negative command tests. Add terminal mode and durable client intents: disconnected clients must refuse new shared-stock sales; uncertain operations retain their original ID, payload and generation. Do not silently assign a new generation to old queued work after restore.
4. Test real TLS enrollment/revocation, existing connections, hub process death before/after gateway commit, lost replies, reconnect, restoration-generation quarantine and divergent histories. Native reopen and two-connection tests are not those transport tests. Multi-tender/credit/refund/collection gateway workflows need separate explicit authority and recovery cases.
5. Obtain the account's actual runner-start annotation, resolve only its reported cause and rerun exact-head Linux/browser/Windows checks. Collect the installer, installed-app screenshots and lifecycle results. Main protection and independent review remain release-control gates; no settings were changed.

## G. Decision

**NO-GO; merge HOLD.** Native authority, migrations and recovery have executable evidence. Operational LAN, exact-head hosted execution/Windows acceptance, the intermittent UI result and release controls remain blockers. The listener must remain disabled.

## H. Founder summary

The retail application retains its existing billing, inventory, staff, credit, returns, closing and backup workflows. This checkpoint adds tested native rules for future shop computers, without exposing an unfinished network service. It is not ready for normal-shop use or a controlled Windows pilot. The genuine Linux screenshot is linked above; there is no current Windows installer. The next meaningful milestone is the real TLS/client integration with failure tests, alongside restored Windows runner execution.
