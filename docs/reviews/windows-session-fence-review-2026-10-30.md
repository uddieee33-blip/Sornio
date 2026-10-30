# Restore/session race review — 30 October 2026

## A. Verified checkpoint

Main: `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. This continuation starts from draft [PR #130](https://github.com/uddieee33-blip/DukaanOS/pull/130) head `e03917e1d8ef27d7177e455fab0123037b08e0a2`, not main. The focused implementation is commit `217108b03ffa5c5042a1505128deff0459b2c9ce`; the subsequent evidence-only commit and final exact-head workflow links are recorded in the PR description. #130 remains draft and unmerged. #126 remains a separate open draft at `129fce1ed9c60aaede0228dd5d41097f1580b938`. No submitted review was returned for #130.

## B. Verified defect and repair

**Confirmed native authorization defect:** `Workspace::login_at` and `provision_owner` authenticated/created the principal in a writer transaction, committed it, and then constructed a session by reading the current recovery generation. A restore on another connection in that gap could give the earlier authentication the new generation. It would survive the intended restore fence if the restored Owner identity/revision still matched.

Reproduction uses two genuine encrypted database connections and the supported Owner-authorized export/preview/restore methods, with synthetic data. A one-shot, thread-local test callback runs the restore immediately after authentication commits and before session publication. The same Owner credentials/revision are preserved, isolating the generation failure. Both login and provisioning tests **failed before the repair** because the returned status remained unlocked. This demonstrates a native concurrency defect; it is not evidence of a remote attack, stolen-credential exploit or tested Windows exploit. The Tauri mutex serializes commands within one process; the native library must also remain safe across connections/processes. The Windows provisioning file lock is not a lifetime workspace lock.

Changes:

- `packages/local-store/src/access.rs`: capture the session inside the transaction; publish it only after successful commit.
- `packages/local-store/src/identity.rs`: require a `Transaction` when constructing a session, preventing these call sites from reading a later generation after commit.
- `packages/local-store/src/credential_tests.rs`: two deterministic regression cases. After restore, status must be locked, Owner permission and native reads/writes must fail, fresh login must succeed, and the refused write must leave no draft.

The scheduling callback exists only under `cfg(test)`. No schema, migration, financial record, operation ID, key policy, permission policy or production listener was changed. Existing native identity, SQLCipher recovery and transaction code were reused.

## C. Executed verification

[Commands, source blob hashes and actual output](windows-session-fence-evidence.txt).

| Check | Environment | Actual result |
| --- | --- | --- |
| Pre-fix regression reproduction | Ubuntu 24.04.3, Rust 1.99.1 | 0 passed, **2 failed** as expected |
| Focused post-fix regressions | Same | 2 passed, 0 failed |
| `cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml` | Same, SQLCipher with local system OpenSSL | **163 passed**, 0 failed: 157 library + 6 command-security |
| Same command with `--release` | Same | **163 passed**, 0 failed |
| `cargo fmt ... -- --check`; `git diff --check` | Same | Both exit 0 |
| Native production bridge build | Same | Exit 0 |
| `npm run build --prefix apps/desktop` | Node 24.22.1 | Type checking and production bundle passed |
| Authorization, credentials and backup browser suites | Linux Chrome 156.0.8078.73, Playwright 1.62.1 | **3 suites passed**, 0 failed in final execution |

Three ignored native tests are subprocess workers invoked by passing parent cases, not three additional passes. The complete native suites also exercised financial rollback, refund crash/retry, concurrent sales/collections/closing, inventory recovery, migration and encrypted recovery cases. Linux browser tests drive the real React application and native Workspace/SQLCipher through a test transport; they do not test Windows IPC or real Windows file dialogs. The initial browser attempt failed before reaching the application because commands had separate loopback namespaces; the evidence records that harness failure and the successful rerun with server/tests together.

## D. CI and Windows deliverables

At the starting exact head, [core 41016050962](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41016050962), [browser 41016050913](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41016050913) and [Windows 41016050915](https://github.com/uddieee33-blip/DukaanOS/actions/runs/41016050915) failed with runner ID **0** and **no steps** across all four jobs. Windows job `123932503368` log retrieval returned `404 BlobNotFound` on this inspection. This is missing execution evidence; the available diagnostics do not establish an account, billing or source-code cause. No checks were weakened or administrative settings changed. Final-head status belongs to the exact runs linked in #130.

**Current Windows installer, installed-application screenshots and lifecycle acceptance: BLOCKED.** No current installer or signing success is claimed. Physical printers/scanners, low-end-PC performance, OS locking, vault loss, upgrades and print queues remain untested on hardware.

A [fresh genuine Linux backup-screen capture](session-fence-backup-linux.png) is available from the passing browser run, with synthetic data and cleared secret fields. It is not a Windows screenshot. Earlier receipts and customer-statement captures remain available in this directory under their original checkpoint evidence.

## E. Financial/security boundaries

The repaired same-database session-generation invariant is **PASS** in both native profiles. The tested existing financial and inventory invariants remain **PASS on Linux**; the tests do not certify accounting/tax compliance or complete Windows security.

Restore remains point-in-time replacement with an encrypted safety copy, not a merge. A retained independent original database cannot be remotely revoked by restoring a second file; diverged operation histories are not reconciled automatically. Lost archive passphrases have no supported bypass. SQLCipher does not protect against a compromised live Windows account. Incorrect system time can misdate transactions. UPI/card entries remain pending or manually reconciled, never provider-verified. GST-compliant invoice integration and accountant acceptance remain outstanding.

## F. LAN and continuation

Source inspection of #126 confirms that its `lan::Request` carries business/hub/device IDs and a command, but no named-human session or recovery generation. `lan::dispatch` selects an enabled device/certificate role; it does not intersect that role with current human authorization. Its operation history binds IDs to devices/payloads, without the current restoration fence. Those are verified source-level integration gaps, not newly executed network-attack tests. Current #130 exposes no LAN listener.

Next safe LAN checkpoint: adapt enrollment and device revocation to the current Owner identity and schema; bind authenticated human sessions to the verified device and hub generation; revalidate both under the authoritative writer transaction; retain original operation IDs and canonical payloads. Extend encrypted snapshot validation and migration fixtures with any added schema. Test revocation on an existing connection, stale-generation recovery, two-client last-stock contention, hub restart and missing replies before enabling transport. Preserve #126's useful TLS and durable-queue work only after compatibility review. Do not wholesale merge its older device-only authority over the integrated runtime.

Separately, the account owner must inspect the failed job's startup annotation and resolve the stated execution blocker. Then run core/browser/Windows on the final proposed head and collect the installer and installed-app captures. Previously observed missing main protection and independent approval remain release-control blockers; no settings were changed here.

## G. Pilot decision

**NO-GO; merge HOLD.** This is a completed, reproduced-and-repaired session-security milestone. Hosted execution/Windows acceptance, secure LAN integration, reconciliation limits and release controls remain unresolved. It does not complete the master directive.

## H. Founder summary

The integration branch still contains the native retail, staff, credit, returns, closing and encrypted-backup workflows described in earlier evidence. This change prevents a concurrent restore from accidentally keeping an earlier login unlocked. Linux verification is passing; a normal shop should not rely on this as an accepted Windows release yet. The genuine capture is linked above. There is no current engineering installer to download. The next useful milestones are authorized runner recovery/Windows acceptance and the native device-plus-human LAN boundary, with the listener kept off until verified.
