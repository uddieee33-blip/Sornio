# Sornio Windows integration checkpoint — 30 October 2026

**NO-GO for a real-shop pilot. Review-only integration; synthetic data only.**
Receipt follow-up: [authenticated lookup, keyboard checkout and receipt printing](windows-receipt-integration-2026-10-30.md) extends this checkpoint. Its current counts are 157 native passes per profile and 10 browser suites. The 155-test/9-suite evidence below belongs to the earlier recovery checkpoint `86918f4`; current head/CI are in PR #130.


## A. Repository baseline and dependency graph

Live GitHub inspection confirmed main `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`, tree `c1ea1371dc17949d81135fcefab9a12bf52aad72`. It remains unchanged. Its core CI run [40501876591](https://github.com/uddieee33-blip/DukaanOS/actions/runs/40501876591) succeeded; returned main checks do not establish current packaged Windows acceptance.

This checkpoint is based on #124 `20e36b7a5d94af961d85b1f252769feb6c21cf51`, tree `193142bb277eba69a59225de39bb361bab940192`. Relevant local source blobs were matched to GitHub Git blob hashes before edits. The local repository is a partial Windows/shared-domain checkout, not a claim that every root web file was rebuilt.

The verified commit dependency is main → #122 authorization → #123 credit → #124 payments/security/credential hardening → this recovery integration. #123 targets the #122 branch; #124 contains their commits and targets main. No PR was merged or closed. All eight historical PRs remain open; #125/#126 are drafts. Exact heads, file-change inventories, checks and review submissions are in [the baseline inventory](windows-master-baseline-2026-10-30.json). No submitted reviews were returned at inspection.

| Existing work | Reuse / integration decision |
| --- | --- |
| #122 / #123 / #124 | Reuse the existing named principals, native permissions, transactional invoice/credit/payment engines, encrypted migrations, durable IDs, credential rotation and staff reset. They form this branch's foundation; they are still absent from main. |
| #125 | Adapt its SQLCipher export, archive validation, native picker UI and atomic safety-backed restore to the combined schema and individual Owner authority. A prior unpublished local integration candidate was treated as unverified source and reworked/retested. |
| #129 | Reuse required-row-count stock fixes already present in #124. Reuse/adapt installed-executable lifecycle scripts and remove diagnostic control-text dumping; do not overwrite the newer staff/credit/retail acceptance. |
| #126 | Deferred. Actual `lan/mod.rs` dispatch authenticates device certificate/grant/role, not a named human session; it does not implement current financial APIs or restore-generation fencing. No LAN listener or commands are enabled here. |
| #127 | Arithmetic foundation inspected; GST invoice integration/compliance remains unimplemented. Do not merge its older lib.rs over current migrations. |
| #128 | Adapted in the linked receipt follow-up: keyboard checkout, protected saved receipt lookup, print-only layouts and Punjabi font/labels. Physical/Windows printing remains unverified. |

The packaged application is `apps/desktop` (Vite/React) → `apps/desktop/src-tauri` → `packages/local-store`. Tauri's frontendDist is `../dist`. The root Next application and separate web-launcher workflow are not proof of native desktop acceptance.

## B. Completed engineering work

- Schema **11** adds recovery identity/generation and append-only recovery audit inside the existing migration transaction. Schemas 1–10 still upgrade through their existing migrations. No financial table replacement or balance reset is used for upgrades.
- Snapshot creation exports the **entire committed SQLCipher workspace**, encrypted with a separate recovery passphrase, with integrity/schema/content validation before publication. The Windows device key is not exported. Existing destination files are never overwritten.
- The current enabled Owner must already have native authority and freshly authenticate to export, preview or restore an established workspace. Cashier, Assistant Manager and Manager cannot gain recovery permission by supplying an Owner password. Only a pristine unconfigured target can enter fresh-device recovery without a live Owner; the archived Owner password and independent recovery passphrase are still required.
- The archived Owner verifier comes from `local_principals`, including after authenticated password rotation removed the old shared verifier. Original #125 schema-5/6 archive schemas have an explicit trusted fixture and migrate into named identity while preserving business identity. Unrecognized intermediate/newer schemas are refused.
- Preview is held natively, bound to archive SHA-256 and a live-workspace fingerprint. Restore reopens/revalidates the source, refuses substitution/stale previews, creates an independently encrypted safety copy, and replaces the active point-in-time workspace in one database transaction. Failure rolls back the replacement.
- Every session includes the native recovery generation. After restore, older connections cannot use their old session to read or write. A successful restore returns locked. Archived staff identities are retained but disabled with incremented revisions and audit attribution until the Owner reviews them.
- Backup controls are integrated with Owner/staff UI, draft/busy guards, cleared secret inputs, lost-reply handling and fresh-target recovery. Wrong archived credentials remove the private workspace and retain a useful login-screen error.
- Native commands, build registry and local-only capability list agree. No generic SQL, key-reading, renderer-selected path or unauthenticated password-reset command was added.
- Adapted #129's installer lifecycle acceptance to the newer combined runtime: installed executable, outbound app/WebView firewall block, ciphertext preservation across uninstall/reinstall, original vault unlock and saved financial state. Same-version reinstall is explicitly **not** an actual version upgrade. These Windows checks are configured, not executed locally.
- Authorization browser acceptance now tolerates an already-observed revocation lock while still requiring the lock screen and inaccessible private data; it does not demand clicking a button already removed by an in-flight native denial.

Main's reproduced inventory restart and required-write defects and the 4.85 × ₹0.50 rounding disagreement were already fixed on #124 and retained. Shared/domain fixtures were rerun: supported quantity is integer thousandths, price is integer paise, half-up line rounding gives ₹2.43. Historical posted amounts were not rewritten.

## C. Executed verification

Environment: Ubuntu 24.04.3, Rust 1.99.1, Node 24.22.1, Python 3.12.14, Chromium headless 156.0.8078.73. Linux tests used bundled SQLCipher with the installed system OpenSSL provider (`OPENSSL_NO_VENDOR=1`, explicit include/library directories). Manifests retain vendored OpenSSL for normal CI; this is not Windows provider/vault acceptance.

| Command / check | Actual result |
| --- | --- |
| Baseline `cargo test --locked --all-targets --manifest-path packages/local-store/Cargo.toml` | 134 library + 6 command-security tests passed; 0 failed; one subprocess-only entry invoked by its parent. |
| Integrated same command | **149 library + 6 command-security = 155 passed; 0 failed**. Two standalone subprocess workers are ignored when enumerated directly and invoked by their passing parent tests. |
| Integrated command with `--release` | **155 passed; 0 failed**, same worker treatment. |
| All nine `apps/desktop/check-*.cjs` suites listed in evidence | Passed: two mocked-IPC suites and seven React → real Workspace/SQLCipher suites. JSON-lines review transport and synthetic file picker are not Tauri/WebView2 or OS-dialog acceptance. |
| `npm run verify:business-domain` | All three scripts passed, including 45 request fixtures, 13 money fixtures, cross-engine half-paise examples/input grid, exact display and eight workspace definitions. |
| `npm run build --prefix apps/desktop` | TypeScript + production Vite bundle passed. |
| Changed-file ESLint, Rust formatting, JS syntax, Python syntax | Passed. ESLint emitted a pages-directory notice because the web source tree is partial; it reported no changed-file lint error. |
| `python -m unittest discover -s apps/desktop -p test_install_data.py` | **4 passed**, covering ciphertext-file preservation evidence. This helper test is not an installer execution. |
| Locked Tauri metadata | Passed; both dependency locks updated deliberately for recovery dependencies. No Tauri/Windows compilation is inferred. |
| Root + desktop full npm lockfile audits | 0 vulnerabilities each. |
| Both Rust lockfile `cargo audit` scans | 0 entries in vulnerability lists. Tauri lock retains informational glib unsoundness and proc-macro-error unmaintained warnings: glib is the non-Windows GTK path; proc-macro-error is build tooling. These are not silently described as a universally clean supply chain. |

[Recorded commands, actual outputs and audit summaries](windows-master-test-evidence.txt). Full root web lint/types/build were not rerun in this partial checkout; final-head core CI is still required.

The first recovery run exposed legacy summaries querying newer tables and a changed cross-business error precedence. They were fixed, then their regressions and the full suites passed. A browser regression also exposed a discarded recovery error on the login screen; it was repaired. No tests were removed, security checks weakened, or failing assertions hidden.

## D. Windows deliverables and visual evidence

**No current-head Windows installer or genuine current-head Windows screenshot has been produced.** Local Linux/frontend/bridge results cannot establish an installed Windows application. New NSIS, installed-executable, Windows Credential Manager, file-dialog, offline firewall and lifecycle acceptance require successfully allocated Windows runners. Signing is not established; no signed distribution is claimed.

[Actual recovery UI capture](windows-recovery-browser-preview.png) is the real React screen backed by SQLCipher through the Linux review transport. It is **not a Windows screenshot**, an AI mockup or a physical-hardware test. It uses synthetic data.

Previously successful #123 head `e41f88941d7c9fc88905a01adfa15d2c504f55d7` still has an [older engineering installer](https://github.com/uddieee33-blip/DukaanOS/actions/runs/40607511476/artifacts/12781578763) and [genuine older Windows captures](https://github.com/uddieee33-blip/DukaanOS/actions/runs/40607511476/artifacts/12781863402). Artifact metadata was rechecked: not expired, scheduled expiry 4 November 2026 UTC. **They do not contain this integration or establish its acceptance.** Use only for historical engineering review with synthetic data.

Current-head CI links/results are recorded in the PR. Earlier #124 Windows run [40890555058](https://github.com/uddieee33-blip/DukaanOS/actions/runs/40890555058) and core run [40890555046](https://github.com/uddieee33-blip/DukaanOS/actions/runs/40890555046) returned failed jobs with no runner name and no steps. The connected API could not read the check-run annotation endpoint, so a current startup cause is not established. No account billing/spending limits, repository security settings or runner permissions were changed.

Printer/scanner, USB/removable-media behavior, physical two-PC Wi-Fi/Ethernet, sleep/resume, real low-end PC performance, real power interruption, actual version upgrade, offline installation on a machine lacking WebView2, and signed installer/update behavior remain **UNTESTED**.

## E. Threat model and financial/security assessment

Estimates below concern the intended shop deployment; they are not measured attack probabilities. A malicious administrator or compromised Windows profile/process can obtain live plaintext or use the app's vault access. SQLCipher is not a defense against every such attacker.

| Threat | Severity / likelihood | Existing/current defenses | Remaining exposure |
| --- | --- | --- | --- |
| Unauthorized local app access / device loss | High / plausible | Argon2id, no default account secret, native idle/hard expiry, restart lock, vault-backed encrypted DB | Windows ACL/session/suspend acceptance and compromised-profile resistance not established |
| Stolen credentials / guessing | High / plausible | Persistent per-account/global attempt budgets, native sessions, credential rotation/reset and revision revocation | Offline theft attacks; forgotten Owner secret/ownership transfer unsupported |
| Staff abuse / privilege escalation / modified IPC | High / plausible | Named principals, explicit roles, scope/revision checks at boundary and writer lock; command-negative tests | Real Windows transport acceptance remains blocked |
| Cross-business requests | High / plausible | Scope comparison never selects a DB; business-bound principals; restore business checks | No multi-business switcher or cloud identity federation |
| Compromised renderer | High / plausible | Local-only capability; no arbitrary SQL/path/key commands; Rust reauthorization | An unlocked compromised renderer can exercise its user's legitimate permissions and see already-returned data |
| DB theft / tampering | High / plausible | SQLCipher authentication/encryption, vault key, memory-only temp data, wrong-key refusal | Malware/admin/dumps/hibernation outside guarantee; no remote tamper-proof audit service |
| Failed migration | High / plausible | Transactional schema 11, required writes, legacy data/rollback tests | Packaged Windows upgrade and real interruption acceptance pending |
| Backup theft | High / plausible | Separate passphrase; encrypted snapshot/temp files; no device-key export; secret inputs cleared | Losing both credentials prevents recovery; weak/reused passphrases and offline attacks remain risks |
| Backup substitution / corrupt archive | High / plausible | Trusted schema, integrity/content checks, file SHA-256 binding, explicit native preview, safety copy, atomic restore | Anyone controlling both backup secrets can intentionally rewrite backup data; no external notarization claimed |
| Restoring revoked staff | High / plausible | New generation invalidates sessions; restored staff disabled until Owner review | Original separate PC is not remotely wiped/disabled; do not sell on both copies |
| LAN interception / replay / impersonation / revoked till | High / plausible when enabled | LAN is not registered or enabled in this integration | #126 must add named-human/device intersection, immediate revocation and generation fencing before integration |
| Financial replay / lost acknowledgements | High / plausible | Stable IDs, durable pending state, exact payload comparison, required-row checks, transactional journals/audit/outbox | Restoring an older point in time is not a distributed reconciliation protocol |
| Logs / secret leakage | High / plausible | Redacted native errors; removed UI control-value dumps; synthetic-only captures | Screenshots must stay synthetic; vault/process dumps and account-level access not eliminated |
| Supply chain / installer | High / plausible | Pinned relevant actions, locked dependencies, fresh audits, no persisted checkout credentials | Current Windows compile/install missing; unsigned/reputation/update chain not established; informational Rust warnings retained |

Passed native invariants include all-or-nothing financial writes, retry effects, stock accounting, partial/full credit collection, return/refund reconciliation, cash closing/variance, exact money and unverified UPI/card separation. Recovery additionally preserves every financial-table row through a combined credit/repayment/split-UPI/return/closing scenario, preserves pending inventory and operation replay, refuses substitution/corruption, and rolls back interrupted/full-disk restores. Existing financial property/concurrency tests remain enabled.

Recovery generation protects connections to the **replaced database**. It does not revoke a physically separate original PC, implement LAN rollback reconciliation or prevent two independently retained databases selling the same stock. Original #126's network protocol must not be enabled on this branch without that design and tests.

Restoration deliberately selects a point in time and replaces the active workspace only after an encrypted preimage safety copy and explicit confirmation. Newer records remain in that safety copy; this is not an automatic merge or automatic replay of post-backup transactions. No genuine business data was used, reset, migrated or restored during this work.

## F. Precise continuation handoff

1. Keep this integration branch/PR as the checkpoint. Fetch its exact latest head; do not restart from main or blindly merge the older branches over it. Reconfirm main and every dependency head if other work proceeds.
2. Repository/account owner: open the current failed workflow run → failed job/startup annotation. Inspect Actions availability/usage/spending gate and runner availability there. Restore execution only through an explicitly authorized account/configuration action; do not change security settings or suppress checks. Current connector access cannot establish that annotation's cause.
3. Rerun **CI**, **Workspace browser review**, and **Windows local workspace** on the exact proposed head. Inspect installed release-app acceptance, actual OS file pickers, firewall/offline behavior, vault, safety-backed restore, uninstall/reinstall data preservation and uploaded installer/screenshots. Same-version reinstall does not satisfy upgrade testing.
4. Review schema 11 and frozen #125 schema-5/6 importer. Extend external/physical recovery testing before relying on it as the sole shop backup. Missing vault key for an existing profile remains a refusal; supported recovery is into a fresh unconfigured profile using both archive credentials, not a secret bypass.
5. Integrate #126 with this named human identity, every required financial command and recovery generation. Require device/human permission intersection under the hub writer lock, denied disconnected sales, old-client reconciliation after restore and two-client oversell/restart/replay tests. Keep listener disabled until verified.
6. The receipt follow-up adapts #128 to current snapshots; complete Windows/driver/peripheral acceptance. Integrate #127 only through current posting/return transactions and reviewed tax requirements. CA review, full three-step native onboarding/bank details, invoice history/industry-specific native workflows, compliant GST invoices and physical peripherals remain separate incomplete gates. Existing eight business definitions were preserved; this checkpoint does not deliver every vertical.
7. Perform a final review and obtain mandatory operational/security evidence before approving any controlled pilot. Public release is a separate decision. No automatic merge, force-push, public deployment or release is authorized by this checkpoint.

## G. Pilot gates

| Gate | Status | Evidence / limit |
| --- | --- | --- |
| Native RBAC/isolation/negative behaviors | PASS — Linux scope | 155-test suites and direct command negatives; Windows boundary acceptance pending |
| Atomic finance, exact money, replay and stock | PASS — Linux scope | Full suites, shared contracts, actual React/native scenarios |
| Encrypted backup, restore and generation | PASS — Linux scope | Recovery/property/rollback/kill tests, real native browser flow; physical Windows/profile acceptance pending |
| Desktop TypeScript/production frontend | PASS | Actual compiler and production bundle |
| Exact-head CI / installed Windows release | BLOCKED | Must allocate and execute runner jobs; missing execution is not a pass |
| Windows vault, OS dialogs, offline installer and lifecycle | BLOCKED | Implemented acceptance requires Windows execution |
| Named-human multi-PC LAN and restore reconciliation | BLOCKED | #126 architecture incompatible with integrated authority/financial schema |
| GST invoice/compliance, full onboarding and native vertical workflows | UNTESTED / incomplete | Arithmetic foundation is not compliant invoicing or a complete shop product |
| Physical peripherals, shop-PC performance, true upgrade and signing | UNTESTED | No physical hardware or signed release evidence |

**Decision: NO-GO.** Mandatory platform/security/operational and product-integration gates remain open. Passing Linux checks does not approve a shop to rely on this as its sole financial system.

## H. Founder-readable status

The proposed code combines named staff accounts, stock, billing, credit collections, manual payment reconciliation, returns, closing, password controls and encrypted recovery in one desktop source tree. Linux tests and the real React/native review fixture exercise these together. Main and old downloadable builds do not automatically gain these changes.

A normal shopkeeper should not use this integration for real money yet. The current installer and current Windows screenshots are missing because Windows acceptance has not executed. The linked browser capture shows the implemented recovery UI; the older #123 artifacts show an earlier real Windows build. The next meaningful milestone is an installed, offline Windows recovery candidate with genuine captures, followed by human-authorized LAN integration and physical shop acceptance.
