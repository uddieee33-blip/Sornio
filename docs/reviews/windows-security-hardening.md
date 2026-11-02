# Sornio Windows security hardening — 29 October 2026

Credential follow-up: [authenticated rotation and Owner-authorized staff reset](windows-credential-controls.md)
have since been added. The findings and 40-command/135-test counts below describe
the `ed553c5` security milestone; the follow-up documents current controls and
42-command/140-test evidence. Forgotten-Owner-password and vault-key recovery
remain unresolved.

## Verified scope and review decision

Merged main is `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`, tree
`c1ea1371dc17949d81135fcefab9a12bf52aad72`. Main's shared-password Workspace
has no named-staff RBAC. Open #122–#129 were inspected before changes. This
milestone extends **existing PR #124 against main**, baseline
`2a9883f0ab50b97e5d7d40f8da3c49c695f92366` / tree
`cc818829658862ba264d4a7eec631163c9069a6a`, which already includes the
unmerged #122 authorization and #123 customer-account dependencies.

The scoped runtime is the bundled React/Tauri application and Rust Workspace /
SQLCipher store. Backup #125 and LAN #126 use older, separate authority/schema
implementations and are not included. No branch was merged, credential printed,
encryption fallback introduced, production data migrated or account security /
Actions-spending setting changed. This report does not certify pilot readiness.

## Findings, fixes and residual gates

| Severity / status | Exact evidence and reproduction | Remediation / decision |
| --- | --- | --- |
| High — verified merged-main gap | `packages/local-store/src/access.rs` on main has shared-password unlock and lacks `create_staff`, named principals and role checks. Anyone who knows that password has the same local authority. | The dependency chain included in #124 supplies native RBAC; it is still unmerged. Do not deploy merged main with a claim of cashier/manager isolation. |
| Medium — verified logic, fixed | Baseline `access.rs:37` and `:49` used `require(View)`, which updated `last_activity`. Repeated `workspace_access_status` / `read_local_session` calls therefore renewed idle access. | Those passive queries now use non-renewing `authorize()`. A unit test sets the activity clock near expiry, reads both APIs, asserts the clock is unchanged, then verifies lock after expiry. Native business commands still count as activity; this is not OS keyboard/mouse or suspend detection. |
| Medium — verified CI coverage gap, fixed | Baseline workflow test commands omitted example targets; the new command-dispatch negatives would not run. Root dependency audit used `--omit=dev`, excluding build tooling. | Both native workflows run `cargo test --all-targets` in their applicable profiles. Core CI audits root and desktop dependencies including development tooling, plus both native lockfiles with pinned cargo-audit 0.22.2. |
| Medium — mutable build inputs, hardened | Three relevant workflows used moving action tags / the Rust action branch. | Actions references in `ci.yml`, `workspace-browser.yml`, `windows-local.yml` now use full commits resolved from upstream GitHub refs, including dereferencing rust-cache's annotated tag. This freezes those action sources; it does not independently audit all their code or freeze hosted runner images, Rust stable or advisory data. Other unrelated workflows retain their own inputs. |
| Defense in depth — hardened, no plaintext leak established | `lib.rs:167` now explicitly sets `temp_store=MEMORY` alongside existing cipher memory protection, FULL synchronous writes, foreign keys and recursive triggers. | Encrypted database/WAL/sidecar scans using synthetic markers, plain-connection refusal, reopen and pragma checks pass. This does not demonstrate that the old build leaked temporary data; compile-time defaults may already have kept it in memory. Paging, hibernation and process dumps remain outside this guarantee. |
| High — verified missing recovery controls | The registered command inventory has no password change/reset, owner-loss recovery or credential rotation operation. Account lockout recovery is a timed retry, not password recovery. | No unauthenticated reset was added. Before relying on this as the sole shop system, implement reviewed authenticated rotation/staff reset with revision-based session revocation and transactional audits, and prove encrypted backup/key recovery. A lost Windows-vault key cannot be bypassed with an app password. |
| High — integration gate; no exploit execution claimed | #126 `packages/local-store/src/lan/mod.rs:703` checks certificate/device role; `:724` onward dispatches from that device role. It uses a Store-based, older shared-password branch, not the named native principal in #124. #125 `recovery.rs:471` checks legacy `workspace_access.password_hash`. | Do not combine or ship those branches as human-role-aware LAN or owner-only recovery. Integrate the human-session/device-role intersection, native scope and staff/device revocation before acceptance. No listener, pairing or restore command is registered in this milestone's Windows runtime. |
| High — unverified Windows acceptance | The previous final-head Actions jobs failed before steps; a Windows retry reported runner ID zero. | New-head CI status is recorded in the PR. Windows Credential Manager, installer upgrades, CSP/WebView2 behavior, effective Windows ACLs and physical device revocation require actual Windows evidence. Linux tests cannot establish them. |

The line references above refer to the relevant reviewed version; local-store
files below are under `packages/local-store/src/` unless specified otherwise.

## Native authority and command coverage

The direct command suite is
`packages/local-store/examples/security/tests.rs`; its parent is the existing
`cashier_review_bridge` synthetic transport. It invokes real Workspace methods
and SQLCipher through JSON dispatch, bypassing React controls. It is not the
actual Tauri IPC runtime. Static tests additionally require the Tauri command
registry, build manifest and capability permission list to agree.

All **40 native commands** are accounted for: **four public entry points**
(`workspace_access_status`, `setup_local_access`, `unlock_workspace`,
`lock_workspace`) and **36 sensitive commands / 61 sensitive request variants**.
For every sensitive variant, locked and disabled sessions are refused. Every
scoped variant is refused for both a foreign business ID and foreign workspace
ID. `read_local_session` intentionally has no caller scope and still requires a
valid native session. Public bootstrap cannot replace an existing owner, and
bad credentials cannot unlock it. Unknown SQL/key/reset commands are refused.

The role expectations are explicit in the test table, independently of
`Role::allows()`. Manager, Assistant Manager and Cashier make direct calls to
every prohibited variant, including all retail and credit correction actions.
Existing positive workflow/role tests continue to exercise permitted operations.

| Operation | Owner | Manager | Assistant Manager | Cashier |
| --- | --- | --- | --- | --- |
| Inventory/customer lookup, own checkout, cash credit collection, customer statements | Yes | Yes | Yes | Yes |
| Item creation and customer name/phone maintenance | Yes | Yes | Yes | No |
| Stock correction, reports, credit policy, returns/refunds, manual reconciliation, cash-opening/correction, settlement export | Yes | Yes | No | No |
| Staff administration, workspace settings/history, credit corrections/linking, privileged audit/outbox, interrupted-payment takeover | Yes | No | No | No |
| Own cashier-day close | Yes | Yes | Yes | Yes |

Some commands have additional conditions: viewing another cashier's drawer,
invoice receipt attribution, customer-policy fields and closed-day mutations are
validated natively. Credit correction tests cover opening dues, write-offs and
reversals separately from repayment. Retail tests cover sale, close, match,
reverse-match, return, refund matching, float/correction and reopening.

`identity.rs:184` verifies scope, principal business, enabled state, revision,
role and eight-hour absolute expiry. `access.rs:107` checks fifteen-minute command
inactivity; sessions are memory-only. Role changes/disabling increment revisions;
mutations recheck authority after taking the database writer lock. Tests exercise
role-change races, cross-connection disabling, stale sessions, hard/idle expiry,
restart, append-only audit and financial rollback on audit/write failure.

## Credentials, storage, inputs and privacy

- `access.rs:166` / `login_at()` implements persistent per-account and database-wide
  failed-attempt budgets: five failures cause a sixty-second delay. Unknown users
  do bounded dummy Argon2 work; disabled users cannot unlock. Malformed hashes and
  ignored/failed counter writes fail closed. Clock rollback can prolong denial;
  this is an availability limitation, not a clock-tamper defense.
  A hostile local caller can deliberately impose the shared cooldown; the global
  budget trades availability for resistance to username-cycling attacks.
- `access.rs:682` uses Argon2id v19, 19 MiB, two passes, parallelism one, a random
  128-bit salt and a 32-byte hash. Passwords are bounded to 10–128 characters /
  512 bytes; PHC parameters/length are bounded before verification. No plaintext
  app password is persisted. Tauri password arguments and vault-key wrappers use
  `Zeroizing`; no claim is made that every JS, OS or cryptographic-library copy
  is immediately erased.
- `device.rs:11` obtains a random 256-bit database key from Windows Credential
  Manager. Missing vault entries with an existing database fail closed; first-use
  provisioning uses a process lock. `lib.rs:139` validates keys, requires SQLCipher
  support and reads an encrypted page before migration. Wrong keys do not reset
  data. The app password authorizes an already-open encrypted store; it is not
  the vault key. The protection boundary excludes a compromised Windows profile
  or local administrator.
- Native session expiry blocks subsequent commands. Previously returned customer
  data can remain in renderer memory or on screen; timed screen concealment,
  Windows suspend/resume and OS-session-lock acceptance were not established here.
- `apps/desktop/src-tauri/src/main.rs` routes scoped commands through
  `with_scoped_workspace`; caller scope cannot choose a database. There is no
  generic SQL/file/shell/key endpoint. Capabilities are local-only for window
  `main`, with six explicit command groups. Production CSP limits scripts and
  connections to bundled/native IPC sources; that configuration is inspected,
  not proven by a Linux browser test.
- User values bind SQL parameters. Generated SQL identifiers in reviewed financial
  code come from fixed native table lists. The injection regression treats a
  destructive-looking search as data, rejects a SQL-shaped username and confirms
  staff records survive. Nested identity/domain requests reject unknown fields;
  adding renderer `role: owner` / `actorId` cannot grant authority.
- Settlement export takes no renderer path. Native date validation and scope/role
  checks precede filesystem access; filenames live under the native business
  export directory. Traversal/NUL date cases are refused by the backend. Hostile
  symlinks/reparse points and effective Windows-directory ACLs were not executed.
- `StoreError` display messages redact database/parser payloads. New synthetic
  marker tests check database sidecars and user-facing errors; existing account
  serialization/audit tests check password/hash absence, and printable statements
  escape customer text. Intentional receipts/statements/CSV contain authorized
  customer/payment data; CSV is plaintext and needs an owner handling policy.
  Full OS crash dumps, browser heap residue, telemetry pipelines and external
  diagnostics were not captured or certified secret-free.

## Supply chain and build secrets

Root and desktop lockfile npm audits included development dependencies and reported
zero vulnerability entries. Cargo-audit 0.22.2 reported zero vulnerability entries
for both native locks using RustSec DB commit
`40f5be6fb12ed93fc591bf4ab23b7d793b3f2239` (28 October 2026).
The Tauri cross-platform lock retains informational `glib` unsoundness
RUSTSEC-2024-0429 and unmaintained `proc-macro-error` RUSTSEC-2024-0370 warnings.
Windows-target dependency queries for both reported no dependency path; these
warnings were not silently suppressed or described as fixed.

The three relevant PR workflows have `contents: read`, use no application secrets
and do not use `pull_request_target`. Checkout credential persistence is disabled
so downstream build scripts do not inherit credentials saved by checkout.
Existing synthetic browser-session constants
are test identities. Other scheduled/maintenance and legacy packaging workflows
remain separate surfaces. No claim is made that all repository history or all
third-party installer/toolchain payloads were secret-scanned or independently
verified. Signing/updater provenance and release-key custody remain release gates.

## Reproduction and limits

Final clean debug and release runs each passed **129 library tests plus six
command-security tests (135 passed, zero failed)**. One subprocess worker is
ignored as a standalone test and explicitly executed by its passing parent.
Rust formatting, three workflow YAML/pin/permission checks and all four lockfile
advisory scans completed. No React changes were made or new UI acceptance claimed.

See [security test output](windows-security-test-evidence.txt). Run from repo root:

```sh
RUST_TEST_THREADS=4 CARGO_BUILD_JOBS=2 cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml
RUST_TEST_THREADS=4 CARGO_BUILD_JOBS=2 cargo test --all-targets --release --locked --manifest-path packages/local-store/Cargo.toml
cargo test --locked --manifest-path packages/local-store/Cargo.toml --example cashier_review_bridge -- --nocapture
cargo fmt --manifest-path packages/local-store/Cargo.toml -- --check
cargo audit --file packages/local-store/Cargo.lock
cargo audit --file apps/desktop/src-tauri/Cargo.lock
npm audit --package-lock-only --audit-level=high
npm audit --prefix apps/desktop --package-lock-only --audit-level=high
```

Linux tests use bundled SQLCipher with system OpenSSL (`OPENSSL_NO_VENDOR=1`),
Rust 1.99.1 and Node 24.22.1. Native financial race tests still create explicit
competing connections/threads; the four-thread setting bounds independent test
harness jobs. An earlier overlapping run recorded an inventory subprocess-test
failure before cancellation without a captured cause. The final isolated runs
are the acceptance evidence; resource-stress behavior is not established by them.
No new UI behavior or packaged Windows test was claimed from this native milestone.

Residual pilot blockers: successful Windows CI/install/upgrade acceptance;
authenticated credential rotation and owner recovery design; tested native-key
backup restoration; human/device permission intersection before LAN integration;
signed distribution and actual shop-PC/profile/ACL acceptance. Existing accounting
and payment-verification gates in the pilot report still apply.
