# Phase 18J — searchable session and device security history

Verified source baseline: Phase 18I branch `feature/phase18i-targeted-session-signout`, commit `820b978e5e18734042d692f95a3b306e1e177b16`, draft PR #180. This increment targets that dependency. No merges, releases, financial changes or schema migration.

## Functional implementation

A native read model projects existing append-only identity audit records for device approval, device revocation and staff-session sign-out results. Session results are joined to the existing immutable operational journal, scoped by recorded business and actor. Accepted sign-outs, already-inactive sessions and refused requests are shown distinctly. Missing legacy receipts remain explicitly unrecorded; no historical device-to-employee ownership is inferred from today's device configuration.

Queries support action, performing employee, literal text (public employee/device/request identifiers and current names), UTC date range and descending sequence cursor. At most 50 records are returned; the interface requests 25. Sequence cursors handle tied timestamps and new events without repeating older pages. Queries scope both business and workspace. Native Staff permission is required, independently of cached client permissions. Existing authenticated LAN session validation and TLS pinning remain in force.

Windows/macOS kitchen staff controls now include a keyboard-accessible security history panel. Android/iPhone/iPad staff access controls include a touch-friendly history panel with wrapping filters and bounded result cards inside the existing responsive workspace. Pages replace rather than accumulate. Changed filters block pagination until a new query. Failed connections retain the explicitly dated prior confirmed page and provide retry guidance; read queries never queue mutations or fabricate offline results.

The new capability `staff.security-history.v1` gates mobile access on verified hubs. Native Android/iOS HTTPS allowlists add only the read endpoint. Old hubs retain existing access reports and sign-out recovery. No trust policy changes, dependencies or lockfile edits. No extra database or financial ledger. Schema remains v22; no audit records are rewritten.

## Focused verification

Passed: desktop TypeScript/Vite build; mobile TypeScript; 91 shared-domain tests, including six new security-history cases; 63 mobile and 38 desktop contract checks; all 92 schema checks. The actual native read SQL was exercised against migrated SQLite for bounded/tied-time pages, stable pagination after new inserts, business/workspace/action/actor/date/literal-search isolation, durable accepted/refused outcomes, missing historical receipts, credential redaction and current-name semantics. Existing session sign-out, staff-access, responsibility and assignment SQLite checks passed. Whitespace checks passed.

Two new Rust tests cover native Staff permission and invalid query rejection. They are unexecuted because Cargo/native toolchains remain unavailable. SQL/TypeScript evidence does not establish Rust or SQLCipher correctness. Native compilation, security tests, installed Windows/macOS behaviour, mobile native builds, real-device LAN/TLS and release acceptance remain pending. Browser/device interaction was not executed.

## Practical limits and next increment

This view covers the three recorded action types only; failed enrolments, logins and responsibility events remain in their existing views. Names are current directory labels; historical actor role is the recorded snapshot. Older incomplete records are not reconstructed. Text search uses SQLite's built-in case folding, which is ASCII-oriented; non-ASCII names remain searchable by matching their stored text. Output is bounded, but text filters may scan older audit rows on large databases. No export or live polling is added.

Next recommended increment: integrate security history directly into Shop LAN hub management, with filtered links from device rows and clearer reauthentication guidance after administrative session expiry.
