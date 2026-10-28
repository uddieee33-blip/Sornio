# Sornio Windows controlled-pilot readiness

Assessment date: 28 October 2026. Verified merged baseline:
`97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6` (billing #121).

**Decision: NO-GO for a real-customer/real-money shop pilot at this baseline.**
This report is not production-release approval. A supervised synthetic-data
rehearsal is a different activity and must not become the shop's system of record.
No merge, software release, signing-key provisioning or account/billing change is
performed by this milestone.

## Evidence classes and assessed coverage

Local tests use synthetic data in a Linux process. Packaged acceptance requires
the actual Windows artifact and WebView/OS controls. Physical acceptance requires
identified shop PCs and peripherals, operator observation and recorded results.
Passing one class never implies passing either of the others.

| Area | Local verified evidence | Packaged Windows / hardware status |
| --- | --- | --- |
| Native encryption, migration and passwords | 56 Rust debug + 56 release tests passed on this baseline. Includes encrypted reopen, wrong-key preservation, old-schema migration, unsupported-schema refusal, password salts, lock/restart and failed-attempt persistence. | Fresh packaged acceptance not executed here. Windows vault test is in the existing Windows test suite; its fresh result is required. No memory-forensics or compromised-profile protection is claimed. |
| Inventory, cash/credit checkout | Native tests cover integer money, immutable invoice history, exact retries, concurrent last-unit sales, required-write/full-disk/commit rollback, audit/outbox atomicity and pending checkout. | Existing Windows UIA test exercises synthetic cash/credit, quantities, stock guards, balances and receipt restart recovery. New workflow runs it from the installed path, not the build directory; execution is pending. |
| Clean install/reinstall/uninstall | Preservation-helper tests: 4 passed. Same-size corruption and WAL loss change the fingerprint; missing/empty databases fail; manifests contain hashes/sizes only. YAML and Python syntax checked. | New hosted-runner script installs NSIS, blocks installed app/WebView outbound traffic, creates native fixtures, uninstalls/reinstalls, checks stopped-file preservation and reopens with original credentials. This is automation added, not a passed Windows result. |
| Actual version upgrade | No prior released version was installed and upgraded. | **Untested. Same-version reinstall is not an upgrade.** A real previous-version installer, recorded hash, source schema and target artifact are required. |
| Fully offline operation | Native engine has no cloud financial dependency. | Process-level outbound firewall blocks remain. A runner already has WebView2; absent-runtime, completely air-gapped installation and entire-machine network blocking are untested. |
| Staff, customer accounts, repayments | **Absent from merged main.** Shared password and a simple invoice customer reference are not individual roles or customer accounts. | PRs [#122](https://github.com/uddieee33-blip/DukaanOS/pull/122), [#123](https://github.com/uddieee33-blip/DukaanOS/pull/123) remain unmerged. No end-to-end result is credited to them here. |
| Payments, returns, refunds, closing | **Absent from merged main.** Offline cash/credit recording is not UPI/card verification or settlement. | [#124](https://github.com/uddieee33-blip/DukaanOS/pull/124) remains unmerged. No pilot acceptance of these flows exists on this baseline. |
| Two clients / LAN / hub outage / revocation | **Absent from merged main.** Standalone PCs must not be used as independent authorities for shared stock. | [#126](https://github.com/uddieee33-blip/DukaanOS/pull/126) is an unmerged draft; cross-role authorization and restore-epoch integration remain unresolved. No physical LAN result. |
| Encrypted backups and restoration | **Absent from merged main.** Saved draft revisions are not a recoverable encrypted financial backup. | [#125](https://github.com/uddieee33-blip/DukaanOS/pull/125) is an unmerged draft. No real-data pilot until a tested independent restore works, including lost-device/vault cases within its documented limits. |
| Invoice accuracy / printer / scanner | Existing native synthetic amount fixtures pass. | GST [#127](https://github.com/uddieee33-blip/DukaanOS/pull/127) and POS/printing [#128](https://github.com/uddieee33-blip/DukaanOS/pull/128) remain unmerged. No physical A4/thermal printer, scanner, drawer or statutory invoice acceptance. Results from their separate branches do not establish main readiness. |
| Crash / corruption / power interruption | Native tests cover forced process termination, stale writes and rollback; the helper detects changed ciphertext files. | Process kill is not power failure. Torn sectors, controller caches, removable media, antivirus interference, filesystem corruption and recovery from a damaged live database remain untested; no safe automated repair is claimed. |
| First-time usability / low-end PC | No first-time shopkeeper study or representative hardware measurement was performed in this milestone. | Record hardware, runtime, catalogue size, memory, launch/search/post/recovery timings and operator errors on a modest Windows PC before approval. No laptop-speed or printing claims are inferred from hosted CI. |

## Changes in this review

- Installed-artifact acceptance replaces build-directory-only execution. It keeps
  the existing native UIA scenarios and firewall rules and adds data-preserving
  uninstall/reinstall/reopen checks. No test coverage or permission was disabled.
- The installer lifecycle refuses to run outside an ephemeral GitHub-hosted
  Windows runner and refuses existing installation/data paths. It never cleans a
  real profile to make a test pass. It is not a customer install/uninstall tool.
- Preservation evidence hashes the stopped database, WAL/SHM when present and
  provisioning lock. It is **not** a backup, SQLCipher integrity check or proof of
  encryption. Old-password/vault reopen and UI state are checked separately.
- The artifact SHA-256 and observed Authenticode status are recorded. The script
  writes passed lifecycle results only after every stage succeeds. A failed or
  missing result must not be classified as passed.
- Failure diagnostics no longer print native UI text/values. Control types and
  state remain available. Test screenshots still contain synthetic fixture data;
  do not reuse this diagnostic collection with real customer data.
- Workflow permissions remain `contents: read`; no signing secret, updater,
  public upload or automatic release was added. Existing engineering artifacts
  retain the existing seven-day retention; they are not a public distribution.

PowerShell/installer execution is Windows-only and has not been run locally.
Local YAML parsing does not validate NSIS/PowerShell behavior. Fresh Actions logs
and the resulting `dist/native-review/installer-lifecycle-result.json` are required
for packaged acceptance. Absence/failure of Actions startup is an execution
blocker, not a source-code regression and not a pass.

## Security and data-loss risks

1. A lost Windows profile/credential-vault entry, forgotten local password,
   damaged database or lost disk can make this baseline's finances unrecoverable.
   Do not delete app data, overwrite the database or regenerate keys to clear an
   error. Preserve the original disk/profile for investigation. No backup exists
   on main to make a real-money pilot safe.
2. All holders of the existing shared password have the same local access. No
   legal ownership verification, per-person staff control or ownership transfer
   exists in this baseline. A compromised Windows profile is outside its local
   password boundary. Native error/memory/log redaction needs ongoing review.
3. Database transaction durability does not establish survival of arbitrary
   hardware power loss. A UPS and tested recovery procedure reduce operational
   exposure but are not a substitute for independent validated backups.
4. Invoice money tests do not provide GST, financial-year numbering, receipt or
   tax-credit-note compliance. Cash is a local record; digital money must be
   reconciled outside this baseline. Do not promise a refund/settlement occurred.
5. Uninstallation is supposed to preserve both app data and the existing vault
   identity. The new test checks that expectation; until it executes, preservation
   is not verified. Backup, retention and user-requested deletion must remain
   separate explicit workflows.

## Installer, warnings, runtime and update strategy

The current artifact is a per-user NSIS engineering installer with embedded
WebView2 offline-installer configuration. The Windows workflow has no configured
code-signing step; observed artifact signature status must be inspected, not
assumed. WebView2 is a required runtime. An already-provisioned runner cannot
prove that a runtime-absent offline shop machine installs successfully.

For a future supervised pilot, distribute only an explicitly reviewed immutable
artifact from an access-controlled location, with its source commit, SHA-256,
recorded signing status and known-limit handover. No auto-update is configured.
Require a tested safety backup and a maintenance window before a version upgrade;
never replace a live database or downgrade an unknown newer schema. Because this
baseline lacks that backup procedure, real-data upgrade approval is blocked.

A production signing plan must use a protected signing identity/service,
time-stamped signatures, independently verified publisher identity and protected
review/release environments. Keep private keys and financial data out of source,
logs and artifacts. Signing and updater credentials have not been created here.
Any future updater needs its own signed-update verification, rollback/schema
compatibility policy, offline fallback and failure acceptance.

Microsoft notes that signing does not guarantee immediate SmartScreen reputation;
Windows warning behavior must be tested on actual target PCs. Do not disable
SmartScreen, Defender or Windows account security to make installation succeed.
WebView2 security updates and offline servicing need an explicit operator plan.

Official references checked on 28 October 2026:

- [Tauri Windows installer / runtime modes](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri NSIS silent install](https://v2.tauri.app/distribute/microsoft-store/)
- [Microsoft WebView2 distribution](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)
- [Microsoft code-signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options)
- [Microsoft SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)

## Blockers and pilot acceptance record

### Before any supervised real-data shop pilot

- [ ] Resolve the Actions execution gate; run all required workflows on the exact
  reviewed integration head. Do not weaken checks or change billing implicitly.
- [ ] Integrate/review the required native milestones in dependency order; rerun
  main's end-to-end financial, authorization and recovery scenarios together.
- [ ] Complete an independent encrypted backup/restore rehearsal and demonstrate
  failure-safe recovery with original credentials and correct business identity.
- [ ] Pass actual clean installation, real version upgrade, restart, uninstall,
  reinstall and vault/data-preservation acceptance on representative Windows.
- [ ] Decide single-PC versus authoritative hub. For LAN, verify two actual PCs,
  revocation/outage/restore conflicts and no new shared-stock sales while offline.
- [ ] Approve accurate customer invoice/receipt behavior for the pilot's actual
  legal/tax status and test the named printer/scanner on the shop PC.
- [ ] Observe first-time operator tasks and modest-hardware timing; record errors,
  training, recovery time, power/network/peripheral behavior and support ownership.
- [ ] Define scope, consent, rollback/stop conditions, daily reconciliation,
  retained evidence and a named supervisor. Start with synthetic data. Real-data
  operation needs explicit acceptance against the completed integration, not this
  report's existence. Never use two independently writable stock authorities.

### Additional blockers to public release

A consistent verified signed distribution/update channel, supported OS/runtime
matrix, independent security review, legally adequate invoices/tax workflows,
credential/key recovery, repeatable fleet upgrades, privacy/log-retention policy,
printer/peripheral compatibility matrix, backup monitoring/restore drills,
load/performance acceptance and operational support/incident procedures remain
required. Controlled-pilot approval would not waive any of these release gates.

For every future trial record: exact source/artifact hashes, signing status, OS and
WebView versions, install/upgrade source, schema, synthetic/real-data classification,
PC/peripheral models, network/power conditions, operator/supervisor, observed
results, failures and evidence links. Never record passwords, keys or database
contents in that acceptance log.
