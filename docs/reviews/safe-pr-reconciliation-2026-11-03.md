# Safe PR reconciliation — 3 November 2026

Independent review of live GitHub state. Historical main
`baabf5fe35462de22d8a4d6132e29b3873fc919d` is **not** current main.

This document records what GitHub confirmed. It does not merge #126 or #127.
It does not publish an installer as a commercial release.

## A. Main SHAs

| Role | SHA |
| --- | --- |
| Historical baseline (assignment) | `baabf5fe35462de22d8a4d6132e29b3873fc919d` (#142) |
| Current `origin/main` | `005f27a7702b37916ae517b7f37360c0e9ce436f` |
| Tip message | `build(deps): bump the minor-and-patch group with 6 updates (#140)` |

Main after the historical SHA:

1. `1cc94f99ded8c8565030ea9d65947f4bcb07cdb3` — #137 squash
2. `e52aa12ea060f57617150427390dfdf1174844b2` — #138 squash
3. `abc15d87b2d83201414f8b7b90151c175c24c52d` — #139 squash
4. `005f27a7702b37916ae517b7f37360c0e9ce436f` — #140 squash

Merged by `uddieee33-blip` at 2026-11-02T18:39:19Z … 18:39:49Z.
This session did **not** re-merge them.

Repository merge policy: squash, merge-commit and rebase are all allowed.
`delete_branch_on_merge` is false. Branch protection API returned 403 to this
integration; required checks were inferred from observed PR check rolls.

## B. Initial open-PR inventory (live)

Observed after `git fetch` on 2026-11-02:

| PR | Title | State | Head |
| --- | --- | --- | --- |
| #143 | feat(mobile): Phase 1 Expo companion | draft, MERGEABLE, UNSTABLE | `047ba25…` then this session |
| #127 | Native GST arithmetic foundation | open, CONFLICTING | `345cd2b6d0db2bb4b83769a0d0b0c04ec4e0737c` |
| #126 | Native single-shop LAN hub | draft, CONFLICTING | `129fce1ed9c60aaede0228dd5d41097f1580b938` |

#137–#140 were already **MERGED**, not open.

## C. Dependency PRs already on main

### #137 `actions/setup-python` v5 → v7

- Files: `.github/workflows/refresh-catalogues.yml`, `windows-local.yml`
- Pin on main: `actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` (v7.1.0)
- Compatibility: v7 uses Node 24 and removes `pip-install`. Workflows pass only `python-version: '3.12'`.
- Windows job on the PR: **pass** (24m0s), run `41407442371`
- Merge commit: `1cc94f99ded8c8565030ea9d65947f4bcb07cdb3`

### #138 `android-actions/setup-android` v3 → v4

- File: `.github/workflows/android-review.yml` (`@v4` tag, not SHA-pinned)
- Compatibility: v4 drops the removed Google `tools` SDK package; this workflow already names `platform-tools platforms;android-35 build-tools;35.0.0`.
- Android job on the PR: **pass** (1m13s), run `41407525951`, artifact `Sornio-Android-review` 60,830 bytes, expires 2026-11-09T07:38:54Z
- Merge commit: `e52aa12ea060f57617150427390dfdf1174844b2`

### #139 `actions/upload-artifact` v4.6.2 → v7.0.2

- Files: `android-review.yml`, `windows-desktop.yml`, `windows-local.yml`
- Pin on Windows workflows: `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9` (v7.0.2)
- Compatibility: v6/v7 Node 24 + ESM. Callers still use `name` + `path` (no `archive: false`).
- Android job: **pass**. Windows job: **pass** (32m50s), run `41407534364`
- Artifacts still present: `Sornio-Local-Workspace-Review` 222,743,803 bytes; `Sornio-Local-Native-Captures` 1,276,345 bytes; expire 2026-11-09T08:10Z
- Merge commit: `abc15d87b2d83201414f8b7b90151c175c24c52d`

### #140 grouped npm minor/patch (6)

| Package | From | To |
| --- | --- | --- |
| lucide-react | ^1.61.0 | ^1.65.0 |
| next | 16.4.2 | 16.4.3 |
| eslint-config-next | 16.4.2 | 16.4.3 |
| @types/node | 26.6.5 | 26.6.6 |
| postcss | 8.5.31 | 8.5.32 |
| @electric-sql/pglite | ^0.5.11 | ^0.5.13 |

- PR CI: Lint/types/build **pass** (includes `npm run verify`); dependency audit **pass**
- Windows and Android **did not run** on #140 (path filters omit `package.json` / lockfile)
- Main push CI after #140: run `41502707974` **success** (8m47s). Intermediate #138/#139 main-push CI runs were cancelled by the next push.
- Merge commit: `005f27a7702b37916ae517b7f37360c0e9ce436f`

No database migrations. No native financial source changes in these four PRs.

## D. Dependency PRs blocked by this session

None of #137–#140 were blocked. They were already merged. This session did not merge them a second time.

Unrelated open Dependabot branches exist (`download-artifact-8`, `setup-dotnet-6`, `setup-java-6`, leftover `setup-android-4`). **Not merged.**

## E. Windows and Android CI

### Windows release candidate (assignment run)

[Run 41457796087](https://github.com/uddieee33-blip/Sornio/actions/runs/41457796087) — PR #142, `local-windows` **success**, 28m48s.

Artifacts **not expired**:

| Artifact | ID | Bytes | Expires |
| --- | --- | --- | --- |
| Sornio-Local-Workspace-Review | 13149371946 | 222,744,930 | 2026-11-09T14:28:06Z |
| Sornio-Local-Native-Captures | 13149486747 | 1,278,398 | 2026-11-09T14:28:14Z |

Job steps 9–22 all succeeded, including encrypted-store tests, NSIS build, installer lifecycle, evidence gate, and both uploads.

This environment cannot download Azure blob artifact zips, so **inner files and installer SHA-256 were not re-hashed here**. Do not treat the GitHub zip digest as `artifactSha256` or `installerSha256`.

Expected installer glob from the product pipeline: `Sornio Local Review_0.3.0_x64-setup.exe` (unsigned engineering review).

### Android

Latest WebView review on current companion PR: Android review package **success** (1m28s). #138/#139 Android jobs succeeded as above. No Android job runs automatically on main **push**.

### Main after #140

CI workflow (lint, types, `npm run verify`, build, audit) **success**. Windows local, workspace browser and Android review **did not run** on that push.

## F. PR #126 — deferred (do not merge)

- Branch preserved: `feature/windows-shop-lan` @ `129fce1ed9c60aaede0228dd5d41097f1580b938`
- Draft. `mergeable: CONFLICTING`. Merge-base with main: `97bfe2f` (#121). Main is **82 commits** ahead.
- Unique work: 31 files, +4306/−179, including `packages/local-store/src/lan/**`
- Schema: PR `SCHEMA_VERSION = 6`. Main `SCHEMA_VERSION = 12` plus `lan_authority` (gated, not a multi-till hub).
- Windows job `40676249636` **failed** at “Test encrypted storage, Windows vault and two-client TLS LAN recovery”. Installer steps skipped.
- `git merge-tree` vs current main: **18 content conflicts**, including `billing.rs`, `checkout.rs`, `access.rs`, `lib.rs`, Cargo locks, Tauri permissions, CheckoutPanel.

Required before a dedicated future integration:

1. Rebase onto schema 12; do not lower `user_version`.
2. Reconcile with `lan_authority`, staff principals, customer credit, retail payments/returns, recovery allowlists and restore generations.
3. Device-certificate LAN roles are not individual staff accounts.
4. Recovery archives must explicitly allow new LAN tables; restore must fence old queued operations.
5. Payment contracts on main (split cash+credit, returns, refunds) are absent from the LAN command set.
6. Re-run Windows encrypted-store + LAN recovery until that job is green.
7. Physical two-PC Ethernet/Wi-Fi remains a release gate.

Do not cherry-pick its native accounting edits onto main.

## G. PR #127 — deferred (do not merge)

- Branch preserved: `feature/windows-gst-invoicing` @ `345cd2b6d0db2bb4b83769a0d0b0c04ec4e0737c`
- Open, not draft. `mergeable: CONFLICTING`. Same merge-base `97bfe2f`.
- Unique work: `gst.rs`, fixtures, notes, `pub mod gst` — **no schema migration**, no posting path.
- Arithmetic still matches current native money: `i64` paise, `quantity_milli`, `MAX_VALUE = 9_000_000_000_000`.
- `merge-tree` vs main: conflict only in `packages/local-store/src/lib.rs` (module list).

Reusable after a clean rebase that only adds `pub mod gst;` and re-runs native tests. Still **not** compliant invoicing.

Still required: GSTIN/registration state, HSN/SAC, place of supply, invoice series, CGST/SGST/IGST posting inside the writer lock, credit notes, returns against tax snapshots, GSTR/e-invoice/e-way, CA-reviewed rounding, Windows UI acceptance.

Review state was not changed (no conversion to draft without founder authorization).

## H. Release-artifact preservation

- GitHub Actions retention only (7 days). Manifest on main already records `archivedToDurableStore: false`.
- `scripts/preserve-windows-artifacts.ps1` **does not exist** on main.
- Checksum fields are **different documents**, not a bug in the live gate:
  - `installer-artifact.json` → `artifactSha256`
  - `windows-evidence-verification.json` → `installerSha256`
  - GitHub artifact zip digest is a third hash
- No GitHub Release exists. Unsigned NSIS was **not** published as a commercial product.
- Durable archival remains **incomplete**. Founder must download both artifacts from run 41457796087 (and the earlier #141 run 41407861190 if still needed) **before 2026-11-09**.

## I. CI and PowerShell archival corrections

Still present on main:

1. `windows-local.yml`, `workspace-browser.yml`, `android-review.yml` have `pull_request` + `workflow_dispatch` only. **No `push` to main.**
2. Path filters omit `package.json` / `package-lock.json`, so #140-class npm bumps skip Windows/Android.
3. No archival script to validate on a Windows runner.

A separate correction PR was **not** opened from this session: work is bound to `arena/5ed2bd28-sornio` (companion draft #143). Mixing untested release automation into that PR was refused.

Recommended future PR (do not merge until Windows/Android CI on that PR is green):

```yaml
# windows-local.yml (same idea for workspace-browser.yml / android-review.yml)
on:
  push:
    branches: [main]
    paths:
      - 'apps/desktop/**'
      - 'packages/business-domain/**'
      - 'packages/local-store/**'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/windows-local.yml'
  pull_request:
    # keep existing stacked-draft bases
    paths: [ /* same as push */ ]
  workflow_dispatch:
```

Keep `permissions: contents: read`. Do not add an untested `preserve-windows-artifacts.ps1`.

Companion secret scan on #143 was a false positive on `apps/mobile/node_modules` (Chrome CrUX demo API key in debugger frontend). Scan now excludes `node_modules`.

## J. Remaining risks

- Windows/Android evidence for current main (#140 npm bumps) is inferred from hosted `npm run verify`, not a fresh installer job on `005f27a`.
- Artifacts expire 2026-11-09; no durable store.
- 15 moderate npm audit findings, **dev-only** (`npm audit --omit=dev` = 0). Do not `audit fix --force`.
- `android-review.yml` uses floating action tags (`setup-android@v4`, `upload-artifact@v7.0.2`) unlike SHA-pinned Windows workflows.
- ubuntu-latest migration to Ubuntu 26 from 2026-10-19 (GitHub notice).
- Branch protection details not readable (403).
- Companion Android/iOS compile jobs were skipped because the shared secret scan failed; fix is in this companion branch, not yet proven on Actions.

## K. Final open-PR inventory

| PR | State | Merge |
| --- | --- | --- |
| #143 | draft companion | keep; reconciling with main |
| #127 | open GST foundation | keep; do not merge |
| #126 | draft LAN hub | keep; do not merge |

#137–#140 closed/merged. No branches were deleted by this session.

## L. Founder actions required

1. Download `Sornio-Local-Workspace-Review` and `Sornio-Local-Native-Captures` from https://github.com/uddieee33-blip/Sornio/actions/runs/41457796087 before 2026-11-09T14:28:06Z. Store them outside GitHub Actions. Record the **file** SHA-256 of the `*-setup.exe`, not only the zip digest.
2. Do not install that unsigned binary as a shop production release.
3. Do not merge #126 or #127.
4. Optional: convert #127 to draft. Not done here.
5. Authorize a **separate** CI-trigger PR for main-push Windows/browser/Android path filters. Do not merge it until those jobs pass.
6. Review companion draft #143 after Actions re-runs (secret-scan fix + main reconcile).
7. Leave Dependabot leftover branches alone unless a new authorized review covers them.

## Local verification executed on the reconciled companion tree

Node v22.22.3 (repo engines 24.x; CI uses 24). Results:

- `npm run typecheck` PASS
- `npm run typecheck:native` PASS
- `npm run lint` PASS
- `npm run verify:mobile-contracts` PASS (63 checks)
- `npm run verify` PASS, including 64 accounting, 92 schema, 12 money, 31 desktop-contract, 40 windows-release identity checks
- `npm audit --omit=dev` 0 vulnerabilities

Cargo/SQLCipher on Windows and `check-installer.ps1` were **not** re-run in this Linux sandbox.
