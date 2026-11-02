# Advanced failure and release-gate review — 30 October 2026

Starting checkpoint: draft PR #130, `7dabef1add3caa48c92afd31276186a8831bbb31`, tree `986d5a119d91aacf1c15dc38a227e66f351e1773`. Main remains `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`. Final proposed SHA and exact-head CI results are recorded in PR #130. This is a focused verification increment, not completion of Windows/LAN acceptance.

## Verified findings and administrative evidence

- Main's branch API reports `protected: false`, protection disabled, required checks empty, enforcement off. This is a verified release-control gap, not an application exploit. No protection/settings changes were made. The protection endpoint separately returns 403 `Resource not accessible by integration`; the rulesets endpoint returns 403 with a private-plan eligibility message. Neither error establishes why Actions jobs fail.
- All four jobs across parent-head Windows 40951880292, core 40951880262 and browser 40951880138 fail with runner ID 0, empty runner names and no steps. Windows job 123721834943 log retrieval returns 404 BlobNotFound. The check-run endpoint is outside the supported connector's allowed resources. These are startup/execution-evidence failures; underlying account/infrastructure cause remains unknown. Compilation, tests and packaging have not run on those runners.
- No submitted PR reviews were returned at inspection. Automated self-review is not an independent human approval.

Account owner action: open the failed Windows job's startup annotation; inspect runner availability and the specific account execution gate named there. Correct only the reported cause, then rerun Windows/core/browser on the final proposed head. Do not change visibility, billing, permissions or security settings based on speculation.

Recommended main controls, subject to account-owner authorization and private-plan support: require PRs, at least one independent approval, dismiss stale approvals, require approval of the latest push, resolve conversations, require an up-to-date base and successful GitHub Actions checks `Lint, types, build`, `Dependency audit`, `browser`, `local-windows`; block force pushes/deletion and bypass. Exact-head installed-app evidence and explicit pilot approval remain additional release requirements. Policy references: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches and https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets . No administrative change is included in this PR.

## New executable adversarial cases

Affected files: `packages/local-store/src/payments.rs`, `payments_tests.rs`, `recovery/tests.rs`.

- `refund_process_death_preserves_atomicity_and_exact_retry`: a separate authenticated process exits immediately before or after the refund transaction commits, bypassing graceful connection destruction. Reopening must preserve the preimage before commit or the full committed refund after commit; original-ID retry must produce one return, correct cash/stock, balanced journals and no second business effect. A changed payload with the same ID must fail. Authentication audits are excluded from financial-state equality because the child legitimately logs in.
- `concurrent_closing_and_sale_have_one_serialized_outcome`: eight independent two-connection races must yield either a committed close plus refused sale, or a committed sale plus stale-close refusal. No outcome may combine a successful zero-cash close with an unaccounted sale.
- `duplicate_restore_with_old_preview_cannot_replace_the_workspace_twice`: after a committed restore and fresh login, the original preview must be stale; a repeated restore must preserve the new generation and database digest.
- `restored_copy_does_not_revoke_an_independent_original_or_merge_operation_histories`: restores a second file and deliberately submits conflicting payloads under the same ID to original and restored files. This test demonstrates the distributed limitation: each independent database can accept its own operation. A passing test here is evidence of the hazard, not a passing distributed exactly-once or LAN gate.

The refund hooks are guarded by `#[cfg(test)]`, including all environment-variable handling. They do not exist in production builds. No migration, production posting policy, native permission, key format or legitimate record was changed. Synthetic data only.

Executed native debug and release: **161 passed per profile, zero failed** (155 library + six command-security tests; three subprocess workers exercised by passing parents). [Commands and actual output](windows-advanced-failure-evidence.txt). No additional production posting defect was reproduced in these cases; the independent-fork limitation and main protection gap remain unresolved. Earlier checkpoint evidence remains valid for its named SHA, not automatically a fresh run on this increment.

## Backup and LAN reconciliation boundary

Existing tests cover encrypted snapshots, wrong/missing credentials, corruption, substitutions after preview, schema rejection, write/commit failures, process termination during restore, generation invalidation on the replaced database, staff disabling and financial-table preservation. These do not provide remote revocation of a physically retained old database or merge independently diverged histories.

A restored workspace is a chosen point in time. Later records remain in its mandatory encrypted preimage backup, not automatically in the active database. Stop old terminals before resuming on a restored authority. Losing the recovery passphrase prevents supported archive decryption; the application also requires the archived Owner password. The recovery passphrase is the archive encryption key: the Owner-password check is an application authorization step, not a second independent encryption layer or external signature. Compromise of that encryption secret permits offline access/tampering; SQLCipher is not protection against a compromised live Windows account.

LAN design gate, not implemented network acceptance: bind each request to business/workspace, hub certificate identity, enrolled device identity/revision, named-human session/revision, recovery generation, original operation ID and canonical payload hash. Verify the intersection of device and human permissions after acquiring the hub writer lock. Commit result, ordering checkpoint and audit/outbox atomically. After restore, rotate authority generation and quarantine old client checkpoints; never silently replay absent post-backup IDs. Revocation must invalidate existing connections/sessions. A disconnected terminal may retain an uncertain request but cannot post a new shared-stock sale. Reconnection must query the same ID/result before retry; conflicting payloads must fail. No direct writable SQLite sharing.

Required outstanding transport tests: real mutually authenticated connections; forged hub/device/human identity; revoked device on an existing connection; credential rotation; two clients competing for last stock; response loss on either side of commit; hub kill/restart; stale-generation retry after restore; divergent-history detection and explicit reconciliation. Current local-store multi-connection tests validate database ordering, not these transport claims. #126's older device-role-only listener remains disabled.

## Windows and accounting limits

The packaged tree remains `apps/desktop` → `apps/desktop/src-tauri` → `packages/local-store`. Local-only Tauri capabilities expose bounded scoped commands; release CSP excludes remote frames/network destinations, renderer SQL/path/key access is absent, and devtools are disabled. These source controls and Linux negative tests do not establish Windows exploit resistance. Windows Credential Manager, ACL/symlink behavior, OS session lock/suspend, vault loss, actual upgrade, file-picker destinations, installer/uninstall preservation, logs and OS print queues require direct Windows acceptance. An app cannot retract queued paper or data already returned to a compromised renderer.

UPI/card remain pending or manually reconciled, never externally verified. Supported split methods are cash/UPI/card/credit under native sum/line limits; no payment provider or automatic bank confirmation exists. Cash variance is an attributable discrepancy, not proof of missing/stolen funds. Timestamps/business days use local system time with IST conversion; an incorrect Windows clock can misdate records. No trusted offline clock-attestation or automatic historical re-dating is claimed. GST arithmetic is not integrated compliant invoicing; accountant/tax review remains required.

No current-head installer, installed Windows screenshots, signing, physical printer/scanner, low-end-PC benchmark or two-PC hardware acceptance exists. Earlier Linux browser/PDF captures remain labelled synthetic Linux review evidence. Same-version reinstall is not true upgrade acceptance.

## Decision and continuation

**NO-GO; merge HOLD.** Runner execution, main protection/review controls, installed Windows evidence and secure LAN reconciliation remain blockers. Finish executing the focused native cases, preserve exact logs and final source hashes, then obtain authorized platform diagnostics and actual Windows acceptance. Do not merge, deploy publicly or infer release readiness from Linux success.
