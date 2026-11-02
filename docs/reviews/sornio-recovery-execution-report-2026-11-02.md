# Sornio — Repository Recovery, PR Integration & Windows Release Finalization

**Document ID**: `SORNIO-RECOVERY-EXEC-2026-11-02`
**Session branch**: `arena/1dcef404-sornio` (active, not locked)
**Repository**: `uddieee33-blip/Sornio` (public, `viewerPermission: ADMIN`)
**Execution date**: 2026-11-02
**Company principle**: SET THE STANDARD

> Everything in this report was executed or re-verified in this session. Where a
> step could not be executed, it is marked **BLOCKED** with the exact cause — no
> result below is inferred from an earlier session.

---

## A. Executive Summary

PR #142 was **already merged** before this session began. It was not re-merged,
not re-run, and its history was not rewritten. No repository mutation was needed
to reach the intended baseline: `main` is already at the PR #142 squash commit.

The substantial deliverable of this session was **reconciliation**:

1. **Verified** the post-merge `main` locally against every gate the assignment
   named that can run in this sandbox — all passed.
2. **Closed** the five authorized historical PRs (#134, #131, #123, #129, #125),
   each only after proving its content is present on `main`, each with a written
   evidence comment. **All five were closed without merging.**
3. **Preserved** PR #126, PR #127 and all four Dependabot PRs untouched.
4. **Preserved** all source branches; deleted nothing; changed no protection rules.

Two items are genuinely blocked in this environment and are **not** claimed as
done:

- **Workflow dispatch is refused (HTTP 403)** — the sandbox holds a permissionless
  GitHub App installation token. `workspace-browser.yml` and `windows-local.yml`
  therefore could not be dispatched against `main`.
- **Artifact download is blocked** — artifact ZIPs redirect to
  `*.blob.core.windows.net`, which is outside this sandbox's egress allowlist.
  Artifact digests were instead verified through the GitHub API metadata.

A material mitigating finding: **`main` @ `baabf5f` and the Windows-tested PR #142
head `e13a930` have the byte-identical Git tree `871c48be587de15c35728494a9b6e80e308b3b22`.**
The full Windows acceptance run (Rust release + debug, SQLCipher, NSIS install,
UIA screenshots, installer preservation) therefore exercised exactly the code now
on `main`. This is strong evidence — but it is not the same as a workflow run
attached to `main`'s SHA, and this report does not pretend otherwise.

---

## B. Initial and Final Main SHA

| | SHA | Notes |
|---|---|---|
| Historical previous main (assignment) | `37e8cf71fb297c9b8e76acb3637abf7ccdb78ddb` | Confirmed as parent of `baabf5f` |
| **Initial main (session start)** | `baabf5fe35462de22d8a4d6132e29b3873fc919d` | Read from `git ls-remote` |
| **Final main (session end)** | `baabf5fe35462de22d8a4d6132e29b3873fc919d` | **Unchanged** — zero commits pushed to `main` |
| PR #142 head | `e13a930549d45b141d85ee8f7c8deeef470d7396` | Tree `871c48b…` — identical to `main` |
| Native schema | `SCHEMA_VERSION = 12` | `packages/local-store/src/lib.rs:149` |

`main` was never written to in this session. There was nothing to merge, so there
was nothing to push.

---

## C. PR #142 Merge Evidence

Already merged. **Not merged again.**

| Field | Value |
|---|---|
| PR | [#142](https://github.com/uddieee33-blip/Sornio/pull/142) |
| Title | fix(accounting): QuantityMilli stock aggregation, BigInt COGS & Windows pilot readiness |
| State | **MERGED** |
| Merged at | `2026-11-02T15:41:34Z` |
| Merged by | `uddieee33-blip` |
| Method | **Squash** — `baabf5f` has one parent, `37e8cf7` |
| Merge commit | `baabf5fe35462de22d8a4d6132e29b3873fc919d` |
| Head / base | `e13a930` → `main` |
| Commits squashed | 5 |
| Files changed | 14 (+918 / −77) |

**Pre-merge gates, verified after the fact on the PR head** — every required check
on `e13a930` was green:

| Check | Result |
|---|---|
| Lint, types, build | success |
| Dependency audit | success |
| browser | success |
| local-windows | success |
| Vercel Preview Comments | success |
| Supabase Preview | skipped |

Branch protection is enforced by ruleset **`Uddieee`** (`id 24486631`,
`enforcement: active`, target `branch`). The ruleset was **not modified**.

---

## D. Post-Merge CI Results

### D.1 Attached to the final `main` SHA — PASS

`ci.yml` triggered automatically on the push to `main`:

| Run | Workflow | SHA | Conclusion |
|---|---|---|---|
| [`41474089057`](https://github.com/uddieee33-blip/Sornio/actions/runs/41474089057) | CI | `baabf5f` | **success** |

Jobs: `Lint, types, build` → success · `Dependency audit` → success.

### D.2 Not attached to the final `main` SHA — BLOCKED

| Workflow | Automatic on push to main? | Dispatch attempted | Result |
|---|---|---|---|
| `workspace-browser.yml` | No (only `pull_request` + `workflow_dispatch`) | `gh workflow run workspace-browser.yml --ref main` | **HTTP 403** |
| `windows-local.yml` | No (only `pull_request` + `workflow_dispatch`) | `gh workflow run windows-local.yml --ref main` | **HTTP 403** |

**Exact blocker.** The sandbox credential is a GitHub **App installation token**
with `x-accepted-github-permissions: allows_permissionless_access=true` and no
OAuth scopes. It can read repository data but cannot create `workflow_dispatch`
events. `gh api repos/…/actions/permissions` and
`…/branches/main/protection` return `403 Resource not accessible by integration`
for the same reason. This is a credential-scope limit, not a repository fault.
No bypass was attempted.

**Mitigation actually achieved.** The two workflows *did* run to success on the
PR head `e13a930`, whose tree is **identical** to `main` `baabf5f`
(`871c48be587de15c35728494a9b6e80e308b3b22`):

| Run | Workflow | SHA | Conclusion |
|---|---|---|---|
| [`41457796087`](https://github.com/uddieee33-blip/Sornio/actions/runs/41457796087) | Windows local workspace | `e13a930` | **success** (`local-windows`) |
| [`41457796158`](https://github.com/uddieee33-blip/Sornio/actions/runs/41457796158) | Workspace browser review | `e13a930` | **success** (`browser`) |

**Required follow-up for the founder** (one command each, on a token with
`actions: write`):

```bash
gh workflow run windows-local.yml --ref main
gh workflow run workspace-browser.yml --ref main
```

### D.3 Local verification executed on `main` @ `baabf5f`

| Command | Result |
|---|---|
| `npm ci` | pass (418 packages) |
| `npm run lint` | **pass** (clean) |
| `npm run typecheck` | **pass** — typescript 6.0.3, no errors |
| `npm run typecheck:native` | **pass** — tsgo 7.0.2, no errors |
| `npm run verify` | **pass** (exit 0, full 30-suite chain) |
| `npm run build` | **pass** — Next.js production build |
| `npm run build --prefix apps/desktop` | **pass** — tsc + vite, 38 modules |
| `npm run verify:accounting` | **64 passed, 0 failed** |
| `npm run verify:billing` | **25 passed, 0 failed** |
| `npm run verify:money` | **12 passed, 0 failed** |
| `npm run verify:business-domain` | **pass** (invoice, 45+13 fixtures, checkout) |
| `npm run verify:windows-release` | **40 checks passed** |

**Not executable locally — BLOCKED:** `cargo test` for
`packages/local-store` (Rust release and debug profiles). This sandbox has no
`rustc`/`cargo`, and the Rust toolchain download hosts are outside the egress
allowlist. The Rust/SQLCipher suites were last proven green by the Windows run on
`e13a930` (see D.2), which is tree-identical to `main`.

**Environment note:** this sandbox runs **Node v22.22.3**, while the repo declares
`node: 24.x` and CI uses Node 24. `npm ci` emitted `EBADENGINE` warnings; every
gate still passed. The authoritative Node-24 result is CI run `41474089057`.

---

## E. Historical PR Closures

All five were closed **without merging**, after independent verification.
Source branches were **preserved** (no deletions).

| PR | Branch | State | Verification basis | Merged? |
|---|---|---|---|---|
| [#134](https://github.com/uddieee33-blip/Sornio/pull/134) | `test/windows-evidence-verification-2026-11-01` | **CLOSED** | Literal ancestor of `main`; 0 missing commits; `git diff` empty | No |
| [#131](https://github.com/uddieee33-blip/Sornio/pull/131) | `hardening/financial-recovery-audit-2026-10-31` | **CLOSED** | Literal ancestor of `main`; 0 missing commits; empty diff; damaged-return code re-verified | No |
| [#123](https://github.com/uddieee33-blip/Sornio/pull/123) | `feature/windows-customer-credit` | **CLOSED** | Literal ancestor of `main`; 0 missing commits; empty diff | No |
| [#129](https://github.com/uddieee33-blip/Sornio/pull/129) | `review/windows-controlled-pilot-hardening` | **CLOSED** | Superseded; branch on **schema v6** vs main **v12** | No |
| [#125](https://github.com/uddieee33-blip/Sornio/pull/125) | `feature/windows-encrypted-backup` | **CLOSED** | Superseded; branch on **schema v6**; `recovery.rs` strictly smaller than main's | No |

Each PR carries a detailed closure comment with the ancestry proof and the
capability-by-capability reconciliation. Verified through the API:

```
PR#134 CLOSED merged=null
PR#131 CLOSED merged=null
PR#123 CLOSED merged=null
PR#129 CLOSED merged=null
PR#125 CLOSED merged=null
```

### Why #129 and #125 could not be ancestry-proven — and what was proven instead

Both branches fork from `97bfe2f` and were **not** ancestors of `main`, so the
usual proof did not apply. Content comparison was used:

**#129** — required functionality is on `main` in a stronger form:
`catalog.rs` inline `changed != 1` guards → centralized
`inventory_recovery::one()` with the same `StatementChangedRows` semantics, plus
`identity::guard` RBAC and `inventory_recovery::reader` actor scoping that the
branch lacks; rollback tests against `RAISE(IGNORE)` triggers now exist across
nine suites. Its four Windows lifecycle scripts (`check-installer.ps1`,
`check-install-data.py`, `test_install_data.py`, `check-native.py`) all exist on
`main` and are gated by `verify:windows-release`. Only three documentation files
remain unique, all superseded by newer review documents.

**#125** — `main`'s `recovery.rs` (751 lines) and `recovery/tests.rs` (1145 lines)
strictly supersede the branch's 575 / 498. Every test function on the branch
exists on `main`, plus 13 more. The single function without a direct counterpart,
`initialize()`, is replaced by `recovery::migrate()`, which additionally binds the
recovery identity to the real business scope and rejects mismatches. Only
`docs/reviews/windows-encrypted-backup.md` is absent from `main` (documentation
only).

---

## F. Deferred PRs — untouched

| PR | Branch | State | Intent |
|---|---|---|---|
| [#126](https://github.com/uddieee33-blip/Sornio/pull/126) | `feature/windows-shop-lan` | **OPEN** (draft) | Multi-PC LAN hub — future integration |
| [#127](https://github.com/uddieee33-blip/Sornio/pull/127) | `feature/windows-gst-invoicing` | **OPEN** | GST invoicing — future integration |
| [#137](https://github.com/uddieee33-blip/Sornio/pull/137) | `dependabot/github_actions/actions/setup-python-7` | **OPEN** | Dependabot, deferred |
| [#139](https://github.com/uddieee33-blip/Sornio/pull/139) | `dependabot/github_actions/actions/upload-artifact-7.0.2` | **OPEN** | Dependabot, deferred |
| [#140](https://github.com/uddieee33-blip/Sornio/pull/140) | `dependabot/npm_and_yarn/minor-and-patch-589694237c` | **OPEN** | Dependabot, deferred |
| [#138](https://github.com/uddieee33-blip/Sornio/pull/138) | `dependabot/github_actions/android-actions/setup-android-4` | **OPEN** | Dependabot, deferred |

No merge, close, rebase or branch deletion was performed on any of them.

---

## G. Windows Installer Evidence and SHA-256

Source SHA of the evidence: **`e13a930549d45b141d85ee8f7c8deeef470d7396`**
(tree-identical to final `main` `baabf5f`).
Run: [`41457796087`](https://github.com/uddieee33-blip/Sornio/actions/runs/41457796087)
— `Windows local workspace`, event `pull_request`, conclusion **success**.

### Artifact archive digests — independently re-verified via API

| Artifact | ID | Size | `sha256:` digest (API) | Matches historical record |
|---|---|---|---|---|
| `Sornio-Local-Workspace-Review` | `13149371946` | 222,744,930 B | `2b6bfaf5d60c2438b22e6596367ad37ab5253923b7a76c4c08d6b85e5e399449` | ✅ **exact match** |
| `Sornio-Local-Native-Captures` | `13149486747` | 1,278,398 B | `1c70021fd649c37dbbe14b274d759b575435d6016c8c25f05ae0608d6ca89e38` | ✅ **exact match** |
| `Sornio-workspace-review` (browser run `41457796158`) | `13148078256` | 9,967,137 B | `c9a6617045be911df37a5a31b7bfb5ee70069b48a624deaa3b11ea150074ade9` | — |

Both digests quoted in the assignment were reproduced exactly from live GitHub
metadata. Expiry: **2026-11-09T14:28:06Z** and **2026-11-09T14:28:14Z** — neither
is expired at time of writing.

### Inner NSIS installer SHA-256 — NOT AVAILABLE, not claimed

The `*-setup.exe` digest is computed *inside* the artifact by
`apps/desktop/check-windows-evidence.py` (emits `installerSha256`). Because the
artifact could not be downloaded (see H), **the inner executable checksum for
this run is not reported here.** Archive ZIP digests are not installer checksums
and are never conflated with them in this document.

Related, previously recorded values (earlier run `41407861190`, PR #141 head
`fc927d6`) remain valid for that run only and live in
`docs/reviews/release-evidence-manifest-2026-11-02.json`.

### Signing status

The installer is an **unsigned engineering build**. `codeSigning.signed = false`;
SmartScreen warning expected. Nothing in this report describes it as a signed
consumer release.

---

## H. Artifact Archival Status — **BLOCKED**

| Attempt | Result |
|---|---|
| `gh api .../artifacts/13149486747/zip` | 0 bytes |
| `curl -L` following redirect | `302`, 0 bytes |
| Redirect target | `https://productionresultssa32.blob.core.windows.net/…` |

The blob host is **outside this sandbox's egress allowlist**
(`github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`,
`pypi.org`, `files.pythonhosted.org`). Artifacts therefore reside **only** in
GitHub Actions temporary storage and are **not** archived in durable storage.

**Status: `durableArchival.archivedToDurableStore = false` — unchanged.**

### Exact URLs for founder retrieval

```
Installer ZIP:
https://api.github.com/repos/uddieee33-blip/Sornio/actions/artifacts/13149371946/zip
Native captures ZIP:
https://api.github.com/repos/uddieee33-blip/Sornio/actions/artifacts/13149486747/zip
Browser review ZIP:
https://api.github.com/repos/uddieee33-blip/Sornio/actions/artifacts/13148078256/zip
Run page:
https://github.com/uddieee33-blip/Sornio/actions/runs/41457796087
```

### Verification procedure (run before 2026-11-09)

```bash
# 1. Download (needs a token with actions:read; -L follows the blob redirect)
gh api repos/uddieee33-blip/Sornio/actions/artifacts/13149371946/zip > installer.zip
gh api repos/uddieee33-blip/Sornio/actions/artifacts/13149486747/zip > native.zip

# 2. Prove the archive ZIP digests first
sha256sum installer.zip   # expect 2b6bfaf5d60c2438b22e6596367ad37ab5253923b7a76c4c08d6b85e5e399449
sha256sum native.zip      # expect 1c70021fd649c37dbbe14b274d759b575435d6016c8c25f05ae0608d6ca89e38

# 3. Extract, then record the INNER installer checksum separately (Windows)
Expand-Archive installer.zip -DestinationPath installer
Get-FileHash -Algorithm SHA256 installer\*.exe
Get-AuthenticodeSignature installer\*.exe   # expect NotSigned

# 4. Cross-check the evidence manifest that ships inside the artifact
Expand-Archive native.zip -DestinationPath native
type native\windows-evidence*.json   # contains installerSha256
```

Keep the PR-head evidence (`e13a930`) and any future post-merge-main evidence as
**separate** records. They must not be merged into one checksum.

---

## I. Financial and Security Verification

### Repeated SKU — PASS (asserted by executable tests, run in this session)

`npm run verify:accounting` → **64 passed, 0 failed**, including verbatim:

- `ok  validateSaleStock aggregates 0.1 + 4.01 as exact 4110 QuantityMilli (4.11)`
- `ok  0.1 + 4.01 posts exact ₹2.06 COGS (eliminating 1-paisa float drift), clean movement note, single stock deduction and balanced journal`
- `ok  multiple duplicate SKU lines emit one stock movement per physical SKU, exact half-up paise COGS (₹11.23) and balanced receivables`
- `ok  zero-value sales and integer overflows in repeated quantities or COGS are explicitly rejected`
- `ok  idempotent operation replay preserves single stock deduction and exact ledger entries while rejecting altered payloads`
- `ok  postSale never falls back to legacy float money() rounding`

0.1 + 4.01 = **4.11** at ₹0.50 → 4.11 × 0.50 = 2.055 → half-up → **₹2.06** ✅

### Split payment ₹1,000 = ₹600 cash + ₹400 credit — PASS

Enforced by `packages/local-store/src/payments_tests.rs:1618`
`split_cash_and_customer_credit_sale_posts_one_atomic_sale` (request parts
`cash 60000` / `credit 40000` paise). Assertions present in the test:

| Invariant | Assertion |
|---|---|
| Exactly one invoice | `list_invoices(0).len() == 1` |
| Exactly one stock deduction | `stock_milli == 90000` and one `local_invoice_stock` row |
| Exactly one billing audit row | `local_billing_audit` count `== 1` |
| Exactly one outbox row | `local_billing_outbox` count `== 1` |
| Correct customer credit entry | exactly one `local_credit_entries` row; customer `balance_paise == "40000"` |
| Cash / credit balances | `cash_paise == "60000"`, `credit_paise == "40000"` |
| Balanced journal | `journals_balance(&s)` |
| Exact replay without duplication | `post_retail(r.clone()) == out`, snapshots unchanged |
| Altered replay refused | `split_sale_req(cash 50000/credit 50000)` → `Err(OperationConflict)`, snapshots unchanged |
| UPI/Card not falsely bank-verified | `!payments.iter().any(\|p\| p.externally_verified)`; dedicated test `split_sale_uses_original_invoice_and_never_verifies_digital_payments` |
| Survives restart | state identical after reopen with credentials |

### Security posture

| Control | Evidence |
|---|---|
| SQLCipher at rest | `PRAGMA cipher_version` gate on open; empty cipher → refuse start (`lib.rs:169`); `cipher_memory_security=ON` |
| Native RBAC | `identity.rs` `Permission` enum (`View`, `Sell`, `AddItem`, `CustomerRead`, `ManageCustomers`, `CollectCredit`, `CorrectCredit`, `Reports`, `Settings`, …); cashier `matches!(permission, View | Sell | CustomerRead | CollectCredit)` — no admin credit or policy rights |
| Guarded inventory writes | `inventory_recovery::one()` fails on `changed != 1`; `guard()` enforces one active operation per actor; `reader()` scopes reads to actor unless Owner |
| Restore authorization | `Permission::Settings` verified against the archived store; confirmation phrase; fingerprint + `file_sha256` re-check; revoked staff not reactivated |
| Encryption of backups | SQLCipher snapshots only — `//! … No plaintext database, device key export, or password reset` |
| Dependency audit | CI job `Dependency audit` success on `main` |

**Explicit non-claims.** GST tax-invoice compliance is **not** verified (out of
scope; PR #127 still open). No UPI/Card payment is described as bank-settled —
the code deliberately records digital payments as unverified.

---

## J. Remaining Engineering Risks

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | `windows-local.yml` / `workspace-browser.yml` never ran **on** `main`'s SHA | **High** | Mitigated by identical tree; not equivalent for audit purposes. Needs a `workflow_dispatch` on a write-scoped token. |
| 2 | No Rust test executed in this session | **High** | No `cargo` in sandbox; relies on the tree-identical Windows run. |
| 3 | Artifacts expire **2026-11-09** and are not archived | **High** | 7-day retention window; irreversible loss after expiry. |
| 4 | Installer is unsigned | **High** | Expected SmartScreen block on shop PCs; blocks commercial release. |
| 5 | Local verification ran on Node 22, repo requires 24 | Medium | All gates passed; CI on 24 is authoritative. |
| 6 | Cross-version installer upgrade path untested | Medium | Only same-version reinstall preservation is covered. |
| 7 | 39 branches carry commits not reachable from `main` | Medium | Unreconciled work — must not be bulk-deleted (see K). |
| 8 | Physical printer/scanner never exercised | **High** | No CI result can substitute. |

---

## K. Repository Cleanup Classification

Analysis only. **No branch was deleted and no protection rule altered.**

`119` non-main remote branches classified:

- **`80` merged ancestors** (0 commits ahead of `main` — fully contained):
  *delete-safe after independent founder authorization.*
- **`39` with unique commits** — *do not delete; require individual review.*

**Must keep (mandated):**

```
main
feature/windows-shop-lan                     # PR #126
feature/windows-gst-invoicing                # PR #127
dependabot/github_actions/actions/setup-python-7
dependabot/github_actions/actions/upload-artifact-7.0.2
dependabot/github_actions/android-actions/setup-android-4
dependabot/npm_and_yarn/minor-and-patch-589694237c
```

**Preserved by this session** (closed-PR sources, retained deliberately):

```
test/windows-evidence-verification-2026-11-01      # closed PR #134
hardening/financial-recovery-audit-2026-10-31      # closed PR #131
feature/windows-customer-credit                    # closed PR #123
review/windows-controlled-pilot-hardening          # closed PR #129  (schema v6 — do not revive)
feature/windows-encrypted-backup                   # closed PR #125  (schema v6 — do not revive)
arena/d8cb03c5-sornio                              # PR #142 source; content in main via squash
```

**Open-PR base references.** After the five closures, no open PR bases on any
branch slated for cleanup. PR #126, #127 and the four Dependabot PRs all target
`main`. The stacked bases `integration/windows-finance-recovery` and
`hardening/financial-recovery-audit-2026-10-31` are now referenced by no open PR
(both are merged ancestors, so delete-safe once authorized).

Branches with unreconciled unique work that warrant a founder decision before any
deletion include `feature/windows-native-billing` (11 commits ahead),
`feature/shared-business-domain` (3), `feature/sornio-brand-and-theme-shell-20261024`
(7), `arena/cc22b3f8-dukaanos` (18) and `codex/owner-plan-foundation` (2). They are
**not** classified as safe.

---

## L. Physical Pilot Readiness

The acceptance plan exists and is complete:
[`docs/reviews/windows-physical-pilot-acceptance-plan-2026-11-02.md`](./windows-physical-pilot-acceptance-plan-2026-11-02.md)
— **all 15 stages present**, matching the required scope exactly:

1. Clean Windows user account offline installation
2. Owner setup & local vault provisioning
3. Staff account creation & role restrictions
4. Product creation & opening stock
5. Physical USB barcode scanner rapid-scan test
6. Cash sale (`F2`/`F3`/`F4`/`Escape`/`Enter`)
7. Split sale (₹1,000 = ₹600 cash + ₹400 credit) & unverified-UPI notice
8. Credit sale & partial cash repayment
9. English receipt & statement printing on **physical** printer
10. Punjabi (ਪੰਜਾਬੀ) Gurmukhi receipt printing on **physical** printer
11. Safe process-termination simulation (**no power-pull** — explicit safety rule)
12. Encrypted backup export to external USB media
13. Backup verification & full point-in-time restore
14. Authorized return (sellable vs damaged) & daily cashier closing
15. Same-version reinstall data preservation check

**No stage has been executed on physical hardware.** Steps 1–15 remain
un-evidenced on a real shop PC. CI proves software behaviour on a synthetic
Windows runner; it proves nothing about a thermal printer, a USB HID scanner,
Gurmukhi paper rendering, or a physical USB stick.

Synthetic data only for any rehearsal. Physical pilot remains **NO-GO**.

---

## M. Final GO / NO-GO Verdicts

| # | Scope | Verdict | Basis |
|---|---|---|---|
| 1 | **Repository integration** | **GO** | PR #142 merged; `main` `baabf5f` clean; CI green on that SHA; all local gates pass; five historical PRs reconciled and closed without merging; deferred and protected work untouched; `main` unmodified by this session. |
| 2 | **Automated Windows release candidate** | **CONDITIONAL GO** | Tree-identical Windows run `41457796087` green (Rust release+debug, SQLCipher, NSIS, UIA, preservation); artifact digests match. **Conditions:** (a) dispatch `windows-local.yml` + `workspace-browser.yml` on `main` with a write-scoped token; (b) archive both artifacts with SHA-256 before **2026-11-09**; (c) record the inner `*-setup.exe` checksum separately from the archive digest. |
| 3 | **Controlled physical single-PC pilot** | **NO-GO** | Zero of the 15 physical stages executed. Installer unsigned. Requires the real shop PC, real printer, real scanner and real USB media. |
| 4 | **Public commercial release** | **NO-GO** | Unsigned installer (no Authenticode/EV); cross-version upgrade path untested; clean-PC WebView2 bootstrap unverified on hardware; GST compliance unverified; no bank-settled digital payment verification; no physical pilot results. |

---

## Non-negotiable requirements — compliance

| Requirement | Status |
|---|---|
| Never force-push | ✅ No force-push performed |
| Never bypass branch protections | ✅ Ruleset `Uddieee` untouched |
| Never weaken test gates | ✅ No test, workflow or assertion modified |
| Never fabricate CI results | ✅ 403s reported as BLOCKED, not as passes |
| Never merge obsolete feature branches | ✅ Zero merges performed in this session |
| Never delete protected or unfinished branches | ✅ Zero deletions |
| Never expose secrets | ✅ No tokens or secrets written |
| Never claim GST compliance without verification | ✅ Explicitly not claimed |
| Never claim bank-settled UPI/Card without external confirmation | ✅ `externally_verified` proven false |
| Never claim physical hardware verification from CI | ✅ Pilot marked NO-GO |
| Never perform unrelated feature development | ✅ Documentation and reconciliation only |

**SORNIO — Small business, big numbers.**
SET THE STANDARD.
