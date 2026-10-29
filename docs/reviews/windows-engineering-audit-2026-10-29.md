# Sornio Windows engineering audit — 29 October 2026

**Decision: hold real-money shop use and public release.** The merged application has a tested standalone billing foundation, but several essential operational and security workflows are absent. Two financial/inventory defects were reproduced, and a third was reproduced under database fault injection. A bounded stock-write fix and a development-dependency patch are included in the existing review PR #129. The major integration gaps remain open.

## Scope and provenance

Repository: [uddieee33-blip/DukaanOS](https://github.com/uddieee33-blip/DukaanOS).

Audited merged main: **97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6**, PR #121. Its complete source tree was reconstructed from GitHub, with all **458 blobs** checked against their Git blob hashes. The local Git tree exactly matched remote tree **c1ea1371dc17949d81135fcefab9a12bf52aad72** before changes.

All eight open PRs were inspected before changes were proposed. Their Windows/native/shared-domain files were read at the head SHAs below. They are separate snapshots, not features assumed to exist on main. No PR was merged, no deployment was performed, and no repository security or billing setting was changed.

The reviewed Windows user story is: cashier interface → Tauri allowlisted command → native Workspace authorization → SQLCipher transaction → durable receipt → stock/ledger refresh. The separate hosted WebView launcher, CI, installer configuration, shared calculations and unmerged staff/customer/payment/recovery/LAN work were also inspected.

Evidence classifications:

- **Reproduced defect:** exercised against the actual code or real Workspace/SQLCipher fixture.
- **Verified missing workflow / integration blocker:** established from command registration, imports, schema and source inspection; not an invented runtime exploit.
- **Untested risk:** plausible from source, requiring additional experiments; kept out of the verified-defect count.

High means an operational/security blocker for the intended shop product. Medium means a material correctness, integration or verification gap. Low means a limited exposure or maintenance issue. No critical remotely exploitable vulnerability was demonstrated.

[Machine-readable evidence, test output excerpts, exact PR heads and CI runs](https://github.com/uddieee33-blip/DukaanOS/blob/review/windows-controlled-pilot-hardening/docs/reviews/windows-audit-evidence-2026-10-29.json).

## Open PR state

| PR | Exact head | Base | What is present on that branch | Current head Actions |
| --- | --- | --- | --- | --- |
| [#122](https://github.com/uddieee33-blip/DukaanOS/pull/122) | 6631eb04efb0cc155d2352113d744ddd2dea748d | main | Native staff roles, scoped identity, schema 7 | Core, browser/native and Windows succeeded |
| [#123](https://github.com/uddieee33-blip/DukaanOS/pull/123) | e41f88941d7c9fc88905a01adfa15d2c504f55d7 | #122 branch | Customer accounts/credit collections, schema 8 | All three succeeded |
| [#124](https://github.com/uddieee33-blip/DukaanOS/pull/124) | 85fc6b6d9a4ac57b879923cc343225a9f8067239 | #123 branch | Settlements, returns, closing, schema 9 | All three failed before recorded job steps |
| [#125](https://github.com/uddieee33-blip/DukaanOS/pull/125) | 69ed5db0106dfa2dbca1d157f98bc9dce0e7b586 | main, draft | Backup/recovery extension on shared-password schema 6 | All three failed |
| [#126](https://github.com/uddieee33-blip/DukaanOS/pull/126) | 129fce1ed9c60aaede0228dd5d41097f1580b938 | main, draft | Device-authenticated LAN on schema 6 | All three failed before recorded job steps |
| [#127](https://github.com/uddieee33-blip/DukaanOS/pull/127) | 345cd2b6d0db2bb4b83769a0d0b0c04ec4e0737c | main | GST arithmetic module, not an invoicing integration | All three failed |
| [#128](https://github.com/uddieee33-blip/DukaanOS/pull/128) | 08575a2ed7d17d826bc3961278901164b89b5e2b | main | Keyboard/receipt printing UI | All three failed |
| [#129](https://github.com/uddieee33-blip/DukaanOS/pull/129) | b1045b104298433c5669c02f7f6eb5eb1f460687 before this audit | main | Installer lifecycle hardening and pilot report | All three failed before recorded job steps; updated by this audit |

Main itself has successful web CI [40501876591](https://github.com/uddieee33-blip/DukaanOS/actions/runs/40501876591). Its returned checks are “Lint, types, build”, “Dependency audit” and skipped “Supabase Preview”. This is not current Windows installer acceptance. For failed PR runs inspected in detail, GitHub returned completed/failed jobs with **steps: null and logs_url: null**. That proves missing execution evidence; the underlying account/runner-start reason was not independently established in this audit. Earlier successful runs do not certify later heads.

## Prioritized findings

| ID | Severity | Classification | Finding | Disposition |
| --- | --- | --- | --- | --- |
| F01 | High | Reproduced defect | Uncertain inventory edits lose their operation identity across restart | Open |
| F02 | High | Verified security gap | Merged runtime has one shared password, full authority and no native session expiry | Open; #122 addresses much of this |
| F03 | High | Verified missing workflow | Saved copies cannot recover financial data, lost credentials or a lost device | Open |
| F04 | High | Verified missing workflows | Credit can be issued, but collections, digital settlements, returns and closing are absent from main | Open |
| F05 | High | Verified integration blocker | Staff/customer/payment, backup and LAN branches do not form one compatible runtime | Open |
| F06 | Medium | Reproduced fault-injection defect | Ignored required inventory writes can report success with inconsistent history/stock | Fixed in this PR |
| F07 | Medium | Reproduced cross-engine defect | Hosted/shared and native rounding disagree on ordinary supported decimal inputs | Open |
| F08 | Medium | Verified runtime integration gaps | Receipt history, business-specific operations and GST are not integrated into merged Windows | Open |
| F09 | Medium | Verified coverage gap | Main builds an installer but accepts a build-directory executable; upgrade/signing/update behavior remains unverified | Existing #129 hardening preserved; Windows execution pending |
| F10 | Medium | Verified release/CI gap | Green web CI does not gate all native/dependency surfaces; main is unprotected | Open |
| F11 | Low for Windows | Verified development-dependency advisory | Root lint dependency contains vulnerable Zod; it is absent from shipped production tree | Patched to 4.6.7 |
| F12 | Low, CI diagnostics | Verified logging exposure | Main Windows failure handler dumps control text to logs | Existing #129 redaction preserved |

### F01 — Inventory retry identity is not durable

**References:** [InventoryPanel.tsx:27](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src/InventoryPanel.tsx#L27), [submit:63](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src/InventoryPanel.tsx#L63), [new adjustment ID:114](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src/InventoryPanel.tsx#L114), [native event replay:97](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/catalog.rs#L97).

The UI retains an uncertain inventory request only in React state. Native event replay is safe when the original ID is retained, but no native inventory checkpoint restores that request after process/window loss. The posting checkpoint implemented for checkout does not cover item/stock edits.

**Reproduction, executed with synthetic data and the actual React UI/Workspace/SQLCipher bridge:**

1. Create an item with 10 kg.
2. Submit a +2 kg delivery; let native storage commit, then drop the success reply.
3. Verify stock is 12 kg and “Retry item save” is visible.
4. Kill the native process, restart it, reload the page and unlock.
5. The pending retry is gone. Re-enter the same delivery.
6. The UI creates a different operation ID and stock becomes 14 kg.

Evidence: afterLostReply=12000, retryAfterRestart=0, afterReentry=14000, two distinct operation IDs. This is a duplicate *business event after re-entry*, not failure of native exact-ID idempotency.

**Recommendation:** persist inventory intent before mutation in encrypted native storage; recover the exact actor/scope/request/ID and receipt until acknowledged or safely canceled. Add lost-prepare, lost-post, process-kill and reopen tests for both creation and stock corrections. Do not store shop mutation payloads in plaintext browser storage. A durable workflow/migration should be reviewed alongside the staff branch; it is not silently introduced in this bounded audit fix.

### F02 — Shared-password authority and unlimited native session

**References:** [Workspace authority:25](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/access.rs#L25), [require_unlock:215](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/access.rs#L215), [adjust_stock:252](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/access.rs#L252).

On main the native authority is a boolean “unlocked”, not a principal or permission set. Every holder of the local password can change stock, change business drafts, restore draft history, read invoices and read aggregate balances. There is no account revocation, actor-attributed staff audit or native idle/absolute expiry.

**Reproduction/evidence:** unlock the synthetic Workspace and call adjust_local_stock directly; no user/role/scope argument is required. Source inspection confirms all relevant methods use the same boolean gate. The existing locked-command tests pass, so this is excessive authority *after valid shared authentication*, not a demonstrated unauthenticated unlock bypass. Session expiry absence is source-verified; no hours-long unattended-PC test was needed or claimed.

**Recommendation:** review and integrate #122 first, test its role/disable changes under concurrent writer locks, and reissue legacy shared credentials before staff use. Its migration deliberately preserves the old shared password as legacy owner authority; migration cannot identify which previous password holder is the legal owner. Credential change/recovery remains separate work.

The Windows vault protects a random database key against other profiles. A compromised signed-in Windows profile can access its secrets; the UI password is not a separate disk-encryption factor. This limitation is documented, not reported as a newly discovered cryptographic bypass.

### F03 — No independent financial recovery on main

**References:** [saved_copies:207](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/lib.rs#L207), [draft-only restore:228](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/lib.rs#L228), [vault failure behavior:14](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/device.rs#L14), [registered commands:234](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src-tauri/src/main.rs#L234).

Saved copies contain the business-name/type/note draft and are stored in the same database. They do not restore invoices, inventory, ledger, outbox or a missing device key. Main has no independent encrypted export/import command and no password reset/rotation/recovery flow.

**Reproduction/evidence:** inspect a saved copy: its payload is Draft, not a financial snapshot. Invoke restore_workspace after posting a sale: that path restores only Draft. Existing wrong-key tests preserve the unreadable original and refuse access, which is correct fail-closed behavior. A physical lost-device restore was not performed.

**Impact:** device/profile/vault loss, unrecoverable corruption or forgotten credentials can make business records unavailable. Encryption, WAL and same-file draft history are not independent backups.

**Recommendation:** adapt #125 to the merged schema/identity before release, enforce native Owner authority, and prove restore on a fresh Windows profile/new PC with independent media, wrong-passphrase/corruption refusal and retained original files. Keep financial and LAN restore epochs consistent. Do not “recover” by deleting the access row or regenerating a key over existing data.

### F04 — Financial workflows stop at cash/credit sale posting

**References:** [Tender:22](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/billing.rs#L22), [credit reference validation:37](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/billing.rs#L37), [checkout UI:200](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src/CheckoutPanel.tsx#L200), [command set:234](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src-tauri/src/main.rs#L234).

Main accepts a syntactically valid arbitrary customer reference for credit. It has no native customer account lookup/credit policy, repayment, UPI/card settlement, split payment, return/refund or cashier closing command.

**Reproduction/evidence:** post a credit sale through the tested checkout, then inspect the visible controls and registered command set: there is no collection or return path. Cash/credit posting itself passed real UI/native tests. No UPI confirmation bug is asserted: digital settlement does not exist on this baseline.

**Recommendation:** integrate #122 → #123 → #124 in dependency order, retain exact IDs and immutable financial history, and verify their combined customer/retail journals and exports. Never model a UPI transfer as cash or externally verified merely to fit the older Tender enum. #124 source keeps externally_verified false for manual reconciliation; preserve that distinction.

### F05 — The open branches are not one integrated security/recovery/LAN system

**References:** [#122 schema 7:100](https://github.com/uddieee33-blip/DukaanOS/blob/6631eb04efb0cc155d2352113d744ddd2dea748d/packages/local-store/src/lib.rs#L100), [#123 schema 8:119](https://github.com/uddieee33-blip/DukaanOS/blob/e41f88941d7c9fc88905a01adfa15d2c504f55d7/packages/local-store/src/lib.rs#L119), [#124 schema 9:130](https://github.com/uddieee33-blip/DukaanOS/blob/85fc6b6d9a4ac57b879923cc343225a9f8067239/packages/local-store/src/lib.rs#L130), [#125 archive validation:262](https://github.com/uddieee33-blip/DukaanOS/blob/69ed5db0106dfa2dbca1d157f98bc9dce0e7b586/packages/local-store/src/recovery.rs#L262), [#126 administrative authority:96](https://github.com/uddieee33-blip/DukaanOS/blob/129fce1ed9c60aaede0228dd5d41097f1580b938/packages/local-store/src/access.rs#L96).

#125 and #126 retain core schema 6 and the shared local-password model. #125 accepts only its explicit core-5/6 schema/extension definitions. #126 does not implement #122 human principals or the intersection of human role and device capability, nor #123/#124 financial adapters. Its restore/revocation epoch integration is unresolved.

**Verification:** these incompatibilities are established from exact source snapshots and schema/command contracts. Each branch's native tests were executed separately; no combined merge/migration acceptance is claimed. The backup validator rejects unsupported schemas; this report does not claim it silently drops schema-9 data.

**Recommendation:** retain both drafts. Integrate against one chosen staff/customer/settlement schema, then test migration from actual v6/v7/v8/v9 fixtures, backup+restore of every table and pending operation, and stale client requests after hub rollback. Enforce the user-role/device-grant intersection inside the authoritative transaction. Re-run concurrent last-unit checkout, human disable, device revocation, uncertain replies and restore-epoch rejection together.

### F06 — Ignored required stock/history writes can falsely succeed

**References on main:** [event insert:127](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/catalog.rs#L127), [stock update:253](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/catalog.rs#L253).

These statements propagated SQL errors but ignored affected-row counts. SQLite RAISE(IGNORE) can report success with zero changed rows.

**Reproduction, executed against real SQLCipher:** add a synthetic BEFORE INSERT trigger on local_inventory_events that calls RAISE(IGNORE), then add an item or adjust stock. Main reports success without the idempotency/history record. Alternatively ignore the product UPDATE: main reports an updated product and commits a stock event while actual stock stays unchanged. Three new tests all failed on unchanged main.

**Impact/limit:** mutation/history inconsistency and unsafe later replay under an ignored-write fault. This is a database fault-injection result, not evidence that ordinary users can install triggers or exploit an unauthenticated SQL endpoint.

**Fix:** require exactly one changed row for product creation, stock update and required event insertion; include the expected revision in the stock UPDATE predicate. Failure aborts the same existing transaction. No migration, new authority or replacement financial engine was added.

Tests now verify rollback, reopen, exact retry and unchanged persisted state. Final native suite: **59 debug + 59 release tests passed**.

### F07 — Duplicate calculators disagree by one paise

**References:** [shared floating-point calculation:25](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/business-domain/src/invoice-calculation.ts#L25), [native-contract BigInt calculation:72](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/business-domain/src/native-invoice.ts#L72), [Rust exact arithmetic:120](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/billing.rs#L120).

**Reproduction, executed by transpiling the actual modules:**

- calculateInvoice([{name:'Synthetic', category:'Audit', quantity:4.85, unitPrice:0.50}], 0) → total **2.42 rupees**.
- calculateNativeInvoice([{quantityMilli:4850, unitPricePaise:50}], 0) → totalPaise **243**.

The first multiplies binary floating-point values before rounding; adding Number.EPSILON does not reliably implement decimal half-up arithmetic. Native Windows preview/posting use the integer contract and agree; the mismatch concerns cross-platform consistency and future integration.

**Recommendation:** define one exact accepted decimal/unit/rounding contract and share differential fixtures across every calculator, including half-paise ties. Preserve original posted records; changing arithmetic must not rewrite historic invoices. Not patched here because the older hosted calculator accepts a different input domain and changing it requires explicit compatibility tests.

### F08 — Complete-looking modules do not establish a complete Windows product

**References:** [mounted Windows UI:127](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src/main.tsx#L127), [industry description only:135](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src/main.tsx#L135), [saved receipt:6](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src/SavedInvoice.tsx#L6), [immutable invoice shape:68](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/billing.rs#L68), [#127 GST module:1](https://github.com/uddieee33-blip/DukaanOS/blob/345cd2b6d0db2bb4b83769a0d0b0c04ec4e0737c/packages/local-store/src/gst.rs#L1).

| Capability | Actual merged runtime state |
| --- | --- |
| Invoice history | Native list_local_invoices exists, but merged React does not invoke it. After acknowledging a receipt, no screen reopens historical receipts. Records remain in the database. |
| Receipt printing | No print path on main; #128 is unmerged. Browser PDF/style tests would not establish physical printer compatibility. |
| Business-specific operations | Business type changes a description. Hosted membership/appointments/industry consoles are not mounted into bundled Windows. |
| GST | Main stores a scalar tax rate/amount. #127 adds arithmetic but no Tauri command or native billing hook. |
| Immutable invoice context | Main's Invoice lacks business identity/address/GST component snapshots and durable business invoice series. |

**Reproduction/evidence:** complete and acknowledge a synthetic sale; inspect subsequent UI and imports. Trace the native list API and GST module to their callers. These are source-verified reachability and workflow gaps, not data deletion or a legal compliance determination.

**Recommendation:** implement the actual needed receipt/history and business workflow adapters against native authority. Integrate tax snapshots in the posting transaction before claiming GST invoicing. Obtain separate jurisdiction/tax review rather than treating arithmetic fixtures as statutory compliance.

### F09 — Installer, upgrade and distribution acceptance is incomplete

**References:** [main workflow uses build-directory EXE:46](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/.github/workflows/windows-local.yml#L46), [Tauri installer configuration:33](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/src-tauri/tauri.conf.json#L33), [separate hosted launcher:Home](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/desktop/windows/NavigationPolicy.cs#L5).

Main builds NSIS, then tests target/release/sornio-desktop.exe. That verifies the built app, not actual installation/uninstallation. The second Windows package is a connected WebView host pointing to the website; its installer tests cannot certify the offline Tauri app.

**Existing #129 improvement retained:** execute the actual installed EXE, block app/WebView outbound traffic, fingerprint stopped data, uninstall/reinstall the same version, reopen with original credentials, and check final preservation. Fresh-runner guards refuse existing profiles. Its four Python preservation-helper tests passed locally.

**Still untested:** PowerShell execution, actual NSIS lifecycle, genuine version-to-version upgrade, missing-WebView2 offline install, Windows vault on this host, signature/SmartScreen behavior and update authenticity. Configuration declares an offline WebView installer, but no runtime-absent machine was tested. The application remains an unsigned engineering build with no tested signed update path.

**Recommendation:** require final-head Windows results and a clean representative shop PC; test actual older-to-newer data migration and downgrade refusal. Establish signed distribution/update handling before public release. Preserve the distinction between the two Windows products.

### F10 — CI/repository controls leave native assurance gaps

**References:** [main security job:71](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/.github/workflows/ci.yml#L71), [Windows triggers:2](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/.github/workflows/windows-local.yml#L2), [browser/native workflow:2](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/.github/workflows/workspace-browser.yml#L2).

The main dependency audit scans the root production npm tree, not the separate desktop lockfile or Rust lockfiles. Native/browser workflows run on matching PRs/manual dispatch, not main pushes. The main branch API returned protected=false and required-status enforcement off. These facts explain how “main CI is green” can coexist with missing current Windows execution.

**Reproduction/evidence:** compare workflow triggers/commands and the returned main check list. Read-only branch metadata was retrieved; no attempt to bypass a gate or change repository controls was made.

**Recommendation:** add coverage for desktop npm and both Rust lockfiles with target-aware advisory triage, preserve required native/Windows checks for relevant PRs, and configure reviewed branch protection/rulesets. A passing dependency scanner does not prove code reachability, safe migrations or operational correctness.

### F11 — Development dependency advisory; limited Windows exposure

**Reference:** [main package-lock.json:7715](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/package-lock.json#L7715), [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Fresh full-root npm audit reported high-severity constrained-collection memory exhaustion for **zod 4.6.5**, through eslint-config-next → eslint-plugin-react-hooks. npm ls zod --omit=dev was empty; root production audit and the entire desktop npm tree had zero findings. It was not demonstrated in the Windows runtime.

**Bounded fix:** update only that transitive development lock entry to **4.6.7**; preserve all other lock entries/platform metadata. Fresh install, lint and full-root npm audit pass; final audit reports zero findings. No major framework, runtime dependency or package manifest was changed.

Rust cargo-audit against database commit 40f5be6fb12ed93fc591bf4ab23b7d793b3f2239 reported **zero vulnerability advisories** for both locks. The desktop lock has informational proc-macro-error maintenance and glib unsoundness warnings. cargo tree for x86_64-pc-windows-msvc returned neither package, so these lock-wide warnings are not presented as reachable Windows vulnerabilities. They still merit target-specific maintenance tracking.

### F12 — Windows test failure diagnostics can disclose screen text

**Reference on main:** [check-native.py:250](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/apps/desktop/check-native.py#L250).

Main's failure handler prints descendant control window_text values. Test fixtures are synthetic, but reusing that diagnostic against real shop data could put business/customer text into Actions logs.

**Evidence:** source inspection, not a real-data exposure experiment. No live records or secrets were printed during this audit.

**Disposition:** existing #129 removal of the text/value dump is preserved. Screenshots remain synthetic test artifacts; no screenshot is claimed to be redaction-safe for customer data. Keep sensitive diagnostics opt-in and avoid uploading real profiles.

## What was positively verified

- Tauri uses explicit custom command capabilities for the bundled main window; no generic filesystem/SQL/shell privilege is granted. Renderer input does not select the database path or encryption key.
- Every merged sensitive data operation is gated natively by Workspace unlock. Renderer-only flags do not authorize the actual store.
- Random key provisioning is native; password strings are wrapped in Zeroizing at Tauri; Argon2id salts and verification parameters are bounded; persisted attempt limiting survives reopening.
- SQLCipher availability/wrong-key behavior is checked before migration. Migrations take the writer lock and re-read version. WAL, FULL synchronous, foreign keys and recursive triggers are enabled.
- Billing obtains prices from native catalogue records, uses checked integer arithmetic, validates revisions/stock under an immediate writer transaction, and commits invoice/stock/ledger/audit/outbox together.
- Exact invoice retries return the original receipt and reject changed input. Durable checkout checkpoints and cancellation fences survived lost replies/restarts in the real UI/native tests.
- Existing concurrency, full-database, required-write, commit-failure, process-termination, immutable-history and migration tests passed. These do not certify arbitrary hardware power-loss durability.
- No match was found by a limited current-tree scan for specific private-key/API-token patterns. Native errors avoid raw SQL/key/password content. This is not a full historical secret scan or a proof that no secret exists.

## Executed verification

Local environment: Linux x86_64, Node 24.22.1, Rust 1.99.1, Chromium Headless Shell 156.0.8078.73. Exact npm lockfiles were installed. The initial vendored OpenSSL Linux build failed in generated assembler; native tests then used system OpenSSL with OPENSSL_NO_VENDOR=1, explicit system include/library paths, and unchanged Cargo manifests/locks. This qualification applies to all local Rust results.

| Check | Result and scope |
| --- | --- |
| Unchanged merged main native tests | 56 debug + 56 release passed |
| Added ignored-write regressions before fix | 3 failed, reproducing F06 |
| Final native tests | 59 debug + 59 release passed |
| Existing mocked desktop access/stock UI | Passed; IPC mocked |
| Existing real React → Workspace/SQLCipher checkout | Passed on main and final source; Tauri transport replaced by test bridge |
| Inventory crash/re-entry reproduction | F01 reproduced using real UI/store and native process kill |
| Calculator differential | F07 reproduced using actual transpiled modules |
| Root lint and both TS compilers | Passed; final dependency lint also passed |
| Full repository npm verification | Passed, including shared/native contract and business-domain fixtures |
| Desktop TypeScript/Vite production build | Passed |
| Root Next production build | Passed |
| Installer preservation helper | 4 passed; not an NSIS/PowerShell execution |
| Rust formatting, Python syntax and git diff whitespace checks | Passed |
| npm audit, root production and desktop full tree | Zero findings before fixes |
| npm audit, full root including development | One Zod advisory before patch; zero after patch |
| cargo-audit, both Rust locks | Zero vulnerability advisories; platform-specific informational warnings described in F11 |

Separate exact-head native debug runs, after forcing package rebuilds where shared build-cache reuse could mislead:

| Unmerged PR snapshot | Passed | Ignored | Acceptance limit |
| --- | --- | --- | --- |
| #122 | 66 | 0 | Native staff tests; not merged main |
| #123 | 88 | 0 | Native customer tests; separate branch |
| #124 | 112 | 0 | Native settlement/return tests; separate branch |
| #125 | 65 | 1 | Worker-only subprocess entry ignored directly, exercised by parent |
| #126 | 67 | 1 | Worker-only subprocess entry ignored directly, exercised by parent |
| #127 | 60 | 0 | Arithmetic module tests; no GST UI integration |

The initial stale shared-target results for #123/#124 were discarded. Accepted runs explicitly cleaned the package first and recompiled the intended source. #128's new printing UI was source-reviewed; its branch-specific browser/printer suite was not rerun. A test count from a different branch is not evidence for a merged combined product.

Re-run native checks with:

~~~sh
cargo test --locked --manifest-path packages/local-store/Cargo.toml
cargo test --release --locked --manifest-path packages/local-store/Cargo.toml
cargo build --locked --manifest-path packages/local-store/Cargo.toml --example cashier_review_bridge
npm ci
npm run lint
npm run typecheck
npm run typecheck:native
npm run verify
npm run build
npm ci --prefix apps/desktop
npm run build --prefix apps/desktop
npm audit --json
npm audit --prefix apps/desktop --json
cargo audit --file packages/local-store/Cargo.lock --json
cargo audit --file apps/desktop/src-tauri/Cargo.lock --json
~~~

Run check-ui.cjs and check-checkout.cjs with the desktop server and a compatible Playwright browser; the latter uses the real native bridge. Actual Windows verification is .github/workflows/windows-local.yml and check-installer.ps1 on a fresh hosted Windows runner. Never point synthetic acceptance at a shop profile.

## Suspicions and untested scenarios

1. **LAN slow-client exhaustion — untested risk.** [transport.rs:165](https://github.com/uddieee33-blip/DukaanOS/blob/129fce1ed9c60aaede0228dd5d41097f1580b938/packages/local-store/src/lan/transport.rs#L165) limits workers to eight before authentication; [serve:213](https://github.com/uddieee33-blip/DukaanOS/blob/129fce1ed9c60aaede0228dd5d41097f1580b938/packages/local-store/src/lan/transport.rs#L213) has per-socket read timeouts rather than an absolute handshake deadline. Slow private-network peers may starve real tills. Add a controlled loopback slow-handshake/slot-reclamation test and a total deadline. No denial-of-service attack against a deployed system was attempted.
2. **History-size performance — unmeasured risk.** [checkout.rs:183](https://github.com/uddieee33-blip/DukaanOS/blob/97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6/packages/local-store/src/checkout.rs#L183) scans accumulated asset-ledger rows on each cashier state read; catalogue reads return up to 5,000 items. Native posting correctness tests do not establish acceptable latency after months of trading on a modest shop PC.
3. **Physical Windows assurance — unknown.** Actual clean install/upgrade/uninstall, vault loss/recovery, two physical LAN clients/firewall behavior, certificate/key lifecycle, printer/scanner drivers, USB-media faults, abrupt power loss and long-running recovery were not tested here.
4. **Combined migration/recovery — unknown.** Passing separate branch tests does not prove preservation when schema 7/8/9, recovery and LAN extensions coexist. Cross-version fixtures and restored hub/stale-client tests remain required.
5. **Security completeness — unknown.** No comprehensive penetration test, historic secret scan, binary signature validation, live cloud-data audit or formal cryptographic review was performed. No statement here certifies a public production launch.

## Fixes and next engineering order

This audit updates **one existing PR, #129, against main**. It preserves that PR's installer lifecycle scripts/report/redaction, adds the stock row-count guards and three regression tests, patches only the Zod development lock entry, and adds this report/evidence. It changes no native schema, posted historical data, tax policy, theme, Android feature, account billing setting or repository protection.

Recommended order:

1. Review this bounded hardening diff; require fresh final-head core/native/Windows execution before merge.
2. Integrate staff #122, then customer #123 and settlement #124, preserving reviewed transactional guarantees.
3. Implement durable inventory request recovery for F01 and align the exact decimal contract for F07.
4. Rebase/adapt backup #125 to the actual merged schema/Owner boundary; prove independent restore.
5. Integrate LAN #126 with human/device authorization, all financial operations and restore epochs.
6. Finish the actual receipt/tax/industry runtime paths needed for the first pilot, then perform signed distribution, clean-machine and physical-shop acceptance.

**Release recommendation remains NO-GO for real-money shop operation on the audited baseline.** A merge recommendation for a narrowly tested engineering fix is separate from approval to entrust customer money and records to the full product.
