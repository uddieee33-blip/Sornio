# Phase 23 — Windows Upgrade, Offline Installation & Retail Pilot Readiness Review

**Work branch:** `arena/677ba59c-sornio` (draft PR [#201](https://github.com/uddieee33-blip/Sornio/pull/201) targeting `repair/windows-foundation-ci-20261119`)
**Verified code candidate:** `27d859aef7ad13c193f0da030c939b8263e3b68f` (schema v24, desktop version `0.4.0`), unchanged by this report
**Baseline `0.3.0` upgrade source:** verified Phase 22 Windows installer from run [44943752020](https://github.com/uddieee33-blip/Sornio/actions/runs/44943752020) (`Sornio Local Review_0.3.0_x64-setup.exe`, SHA-256 `581db471576a0ccfda67d3ea9ccf8eedc9b3ceb31d854625a2480d75c0f6a998`)
**Date:** 2026-11-24

Every assertion below names the exact commit SHA, workflow run, and measured
output. Items that cannot be proved in cloud CI (code-signing certificate
secrets, upstream unpatched transitive Rust advisories, and physical retail
counter peripherals) are explicitly marked **BLOCKED** or **BENCH REQUIRED**
rather than claimed green.

---

## 1. Executive Pilot-Readiness Verdict

**Verdict: CONDITIONALLY READY FOR BENCH ACCEPTANCE — NOT YET SIGNED FOR UNATTENDED SHOP DEPLOYMENT**

- **Software, upgrade, offline installation, reliability, and 10k/50k scale:** **PASS** on real GitHub-hosted Windows (`Windows-2025Server-10.0.26100-SP0`), Linux, and macOS CI runs.
- **Release code signing:** **BLOCKED** — `Sornio Local Review_0.4.0_x64-setup.exe` is currently `NotSigned` because `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD` are not yet provisioned in repository secrets. The signing and RFC 3161 timestamping pipeline (`scripts/sign-windows-installer.ps1`) is wired and verified to fail closed when configured.
- **Desktop dependency audit (`cargo audit`):** **BLOCKED UPSTREAM** — `packages/local-store/Cargo.lock` has **0 advisories**, while `apps/desktop/src-tauri/Cargo.lock` triggers 2 upstream advisories with `patched: none` (`url` `RUSTSEC-2026-0592` and `cookie` `RUSTSEC-2026-0594`). Audit controls were deliberately kept strict and not suppressed.
- **Physical shop peripherals:** **BENCH REQUIRED** — thermal 58 mm / 80 mm printing, physical USB HID barcode gun cadence, RJ11 cash-drawer pulse actuation, physical USB backup drive restore, and real AC power-cut testing must be signed off on a shop-class Windows PC using `docs/pilot/bicycle-retail-pilot-checklist.md`.

---

## 2. CI & Verification Matrix

| Workflow / Gate | Commit SHA | Run ID | Status | Key Verified Evidence |
|---|---|---|---|---|
| `Windows local workspace` (`local-windows`) | `27d859a` | [45476905134](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905134) | **PASS** | Release & debug SQLCipher + security tests, `0.4.0` NSIS installer build (`290.21 MB`), Phase 22 offline app/recovery/lifecycle acceptance, independent OS-vault purchasing audit, native screenshots |
| `Windows local workspace` (`Phase 23 upgrade (0.3.0 -> 0.4.0), offline install & 10k/50k scale`) | `27d859a` | [45476905134](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905134) | **PASS** | Genuine `0.3.0 -> 0.4.0` in-place upgrade (`upgrade-1`..`upgrade-8`), clean WebView2-absent offline install (`116.71 s`), 10k products / 50k invoices benchmark (`520.91 s`, `14.7 MB` peak RSS) |
| `Workspace browser review` (`browser`) | `27d859a` | [45476905153](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905153) | **PASS** | `cargo fmt --check`, debug & release native store tests (326 lib + 8 security command tests), all 12 Playwright desktop UI suites, customer-data workload |
| `Replication PostgreSQL` | `27d859a` | [45476905078](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905078) | **PASS** | PostgreSQL outbox projection and replication verification |
| `macOS desktop workspace` | `de1abf7` | [45456348944](https://github.com/uddieee33-blip/Sornio/actions/runs/45456348944) | **PASS** | Full Rust suite, security command tests, macOS desktop bundle & acceptance (note: `27d859a` run [45476905077](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905077) was cancelled by GitHub Actions macOS arm64 runner capacity before execution; `27d859a` modified only Windows PowerShell acceptance scripts) |
| `CI` — `Lint, types, build` | `27d859a` | [45476905229](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905229) | **PASS** | ESLint (0 errors), TypeScript `tsc` + `tsgo` (0 errors), Vite desktop build, 25/25 desktop unit tests, 38/38 desktop contract checks, 40/40 Windows release checks, 146/146 schema checks |
| `CI` — `Historical SQLCipher compatibility (4.6.1 to 4.20.0)` | `27d859a` | [45476905229](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905229) | **PASS** | Historical SQLCipher 4.6.1 -> 4.20.0 fixture opens cleanly |
| `CI` — `Dependency audit` | `27d859a` | [45476905229](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905229) | **BLOCKED UPSTREAM** | `packages/local-store/Cargo.lock`: 0 advisories; `apps/desktop/src-tauri/Cargo.lock`: unpatched upstream `url` (`RUSTSEC-2026-0592`) and `cookie` (`RUSTSEC-2026-0594`) |

---

## 3. Release Artifact & Signing Status

From `PHASE23_RELEASE_MANIFEST` in run [45476905134](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905134) (`local-windows`, commit `27d859aef7ad13c193f0da030c939b8263e3b68f`):

| Field | Measured Value |
|---|---|
| Installer filename | `Sornio Local Review_0.4.0_x64-setup.exe` |
| Product / File version | `0.4.0` / `0.4.0` (`com.sornio.localreview`, `allowDowngrades: false`) |
| Installer size | `304,302,409` bytes (`290.21 MB`, NSIS LZMA + bundled offline WebView2 Evergreen Standalone Installer + stripped LTO Rust binary) |
| Installer SHA-256 | `f1295596a886eb4ac58e1637abc75acdeb191ea9295591948021e578e067570a` |
| Authenticode status | **`NotSigned`** (`signingState: "BLOCKED"`) |
| Uploaded CI artifacts | `Sornio-Local-Workspace-Review` (`304,377,671` bytes), `Sornio-Local-Native-Captures` (`1,693,672` bytes), `Sornio-Phase23-Evidence` (`5,681` bytes) |

**Required owner action to unblock signing:** Provision an OV/EV Windows Authenticode PFX certificate (or Azure Trusted Signing), configure `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD` in GitHub Actions repository secrets, and execute `windows-local.yml`. `scripts/sign-windows-installer.ps1` will then sign with SHA-256 + RFC 3161 timestamping and verify `AuthenticodeStatus == Valid`.

---

## 4. Genuine `0.3.0 -> 0.4.0` Windows In-Place Upgrade Evidence

Verified in run [45476905134](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905134) (`Phase 23 upgrade (0.3.0 -> 0.4.0), offline install & 10k/50k scale`) via `apps/desktop/check-upgrade.ps1`:

1. **`upgrade-1` (Install baseline `0.3.0`):** Installed the verified Phase 22 `0.3.0` NSIS installer (`581db471576a...`) cleanly into `%LOCALAPPDATA%\SornioUpgradeAcceptance` and confirmed executable `FileVersion = 0.3.0`.
2. **`upgrade-2` (Seed `0.3.0` workspace offline):** Blocked outbound network for `sornio-desktop.exe` and `msedgewebview2.exe` via Windows Firewall, drove the full `0.3.0` offline retail + purchasing + backup workflow, and confirmed ciphertext-at-rest (`workspace.db` starts with SQLCipher ciphertext, not `SQLite format 3`).
3. **`upgrade-3` (In-place upgrade `0.3.0 -> 0.4.0`):** Ran `Sornio Local Review_0.4.0_x64-setup.exe /S` directly over `0.3.0` without uninstalling, confirming executable `FileVersion = 0.4.0`.
4. **`upgrade-4` (Upgraded `0.4.0` offline reopen):** Reopened `0.4.0` offline with original owner/staff credentials and confirmed all prior retail sales, credit accounts, stock, suppliers, POs, and receipts survived (`--verify-preserved`).
5. **`upgrade-5` (Automatic pre-migration encrypted safety backup):** Verified `open_with_migration_backup` created `migration-backups/pre-migration-v23-to-v24-*.db` before mutating schema v23 -> v24 and confirmed the safety copy is SQLCipher ciphertext.
6. **`upgrade-6` (Independent OS-vault store & v24 workstation settings audit):** Opened the upgraded workspace via `cashier_review_bridge.exe` using Windows Credential Manager (`device::initialize`), passed `check-purchasing-store.py` financial reconciliation, and verified `read_workstation_settings` (`revision: 1`, default `80mm`) -> `save_workstation_settings` (`58mm`, `pa`, `TVS RP-3200`, `enter_or_tab`, `escpos_pin2`, `revision: 2`) -> re-read persistence.
7. **`upgrade-7` (Single-instance workspace lock):** Confirmed `0.4.0` acquires and holds an exclusive OS lock on `workspace.lock` while running and cleanly releases it on process exit.
8. **`upgrade-8` (Downgrade refusal):** Launched the preserved `0.3.0` binary against the upgraded schema v24 database and confirmed `0.3.0` refused to open/modify `workspace.db` (SHA-256 unchanged), followed by clean silent uninstall.

---

## 5. Clean Offline Windows Installation Evidence (WebView2 Absent)

From `PHASE23_OFFLINE_INSTALL_EVIDENCE` in run [45476905134](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905134) (`apps/desktop/check-offline-install.ps1`):

| Check | Measured Result |
|---|---|
| Pre-existing runner WebView2 version | `157.0.4341.46` |
| WebView2 removal attempted | `true` (Microsoft installer exit code `19`) |
| WebView2 version after removal | **`null` (genuinely uninstalled prior to offline install)** |
| Windows Firewall outbound block on `0.4.0` installer | **Active (`firewallBlockedInstallStatus: "PASS"`)** |
| Clean runtime-absent offline install status | **`PASS`** (bundled offline WebView2 installer + Sornio installed without internet) |
| Measured offline install duration | **`116.71` seconds** |
| Offline first launch & workspace initialization | **`true`** (app + WebView2 outbound blocked) |
| Uninstall data preservation (`workspace.db` SHA-256) | **`true`** (binary removed, encrypted database preserved byte-for-byte) |

---

## 6. Measured 10,000-Product / 50,000-Invoice Windows Scale Benchmark

From `PHASE23_WORKLOAD_METRICS` in run [45476905134](https://github.com/uddieee33-blip/Sornio/actions/runs/45476905134) (`scripts/run-phase23-workload.py` executing `phase23_reliability_tests::phase23_ten_thousand_products_and_fifty_thousand_invoices_benchmark` in release mode on Windows with SQLCipher encryption, WAL mode, and `PRAGMA synchronous = FULL`):

| Metric | Measured Value |
|---|---|
| Host environment | `Windows-2025Server-10.0.26100-SP0`, `4` logical cores, `15.99 GB` RAM |
| Dataset counts | **10,000 products**, **5,000 customers**, **1,000 suppliers**, **50,000 invoices** (schema v24) |
| Total wall-clock time | **`520.906 s`** (`520.585 s` native) |
| Stage timings | 10k products: `94.557 s` · 5k customers: `22.231 s` · 1k suppliers: `4.640 s` · 50k invoices: `398.248 s` |
| Sustained invoice write throughput | **`125.55` native postings/second** (`synchronous=FULL`) |
| Initial startup + owner setup | **`409.34 ms`** |
| Cold reopen + Argon2id unlock at 10k/50k scale | **`202.90 ms`** |
| 10,000-product catalog search (30 samples, indexed `COLLATE NOCASE`) | **median `5.79 ms`**, **max `9.75 ms`** |
| Checkout invoice post at 10k/50k scale (200 samples) | **median `5.95 ms`**, **p95 `14.08 ms`**, **max `66.22 ms`** |
| Receipt read by ID at 50k-invoice scale (30 samples) | **median `0.28 ms`**, **max `0.38 ms`** |
| Peak process-tree RSS | **`14.70 MB`** |
| Encrypted database file growth | `4,096` bytes -> **`167,116,800` bytes (`159.37 MiB`)** |
| Post-reopen financial reconciliation | **`PASS`** — 10,000 products, 50,000 invoices, `950,000,000` milli-stock, and `500,000,000` paise cash reconciled exactly |

---

## 7. Key Phase 23 Changes Delivered

- **Storage, Migration & Reliability (`packages/local-store`):**
  - Schema v24 (`local_workstation_settings` singleton with optimistic-concurrency `revision` and `local_products_name_nocase` index), `MAX_PRODUCTS = 25_000`, and `fixtures/recovery-v23-schema.json` + updated `fixtures/schema-fingerprint.json` (291 DDL statements).
  - `Store::open_with_migration_backup` creates an atomic fsynced pre-migration encrypted backup in `migration-backups/` before running any schema upgrade; refuses to mutate the DB if backup creation fails (`StoreError::MigrationBackupFailed`).
  - `WorkspaceInstanceLock` + `device::initialize_desktop` enforce OS-backed single-instance workspace locking (`workspace.lock`) released automatically on crash/exit.
  - `StoreError::user_message` maps SQLite `DiskFull`, `DatabaseBusy`/`Locked`, `ReadOnly`, and `DatabaseCorrupt` into actionable, non-leaking shop-operator guidance.
  - Added `phase23_reliability_tests.rs` covering v23 -> v24 migration backup & backup-failure refusal, v23 encrypted backup restore into v24, crash/truncated-WAL recovery, full bicycle/retail pilot workflow simulation, and the 10k/50k scale benchmark.
- **Desktop Backend & Installer (`apps/desktop/src-tauri`):**
  - Bumped to `0.4.0`, enabled `allowDowngrades: false`, `digestAlgorithm: "sha256"`, NSIS `compression: "lzma"`, per-user `currentUser` install, offline WebView2 bundling, and `[profile.release]` `strip`/`lto`/`codegen-units = 1`.
  - Added `read_workstation_settings`, `save_workstation_settings`, and `list_local_printers` (96 registered commands total, all covered by capability permissions and negative RBAC tests in `packages/local-store/examples/security/tests.rs`).
- **Desktop Counter & Hardware Readiness UI (`apps/desktop/src`):**
  - `WorkstationSettingsPanel.tsx` for paper layout (`58mm`/`80mm`/`a4`), default receipt language (`en`/`pa`), Windows printer selection, USB HID barcode suffix mode (`enter`/`tab`/`enter_or_tab`), cash-drawer mode (`none`/`manual_only`/`escpos_pin2`/`escpos_pin5`), and backup destination note.
  - `SavedInvoice.tsx` + `locales/pa.json` (32 receipt phrases with bundled `Noto Sans Gurmukhi` font), visible `REPRINT — Copy of original saved receipt` badge on reprints/reopened receipts (while preserving the `'Print saved receipt'` button contract), on-screen print preview (`58mm`/`80mm`/`a4`), and offline/stopped Windows printer warning.
  - `scan.ts` + `CheckoutPanel.tsx` USB HID barcode control-character stripping, leading-zero preservation, configurable `Enter`/`Tab` suffix handling, and trailing CR/LF suffix absorption without dropping rapid consecutive piece scans.
  - `csv-import.ts` + `InventoryPanel.tsx` bulk CSV catalog import using exact integer paise (`fixed-decimal.ts`) with duplicate-SKU/format validation and row-level error reporting.
- **Operator & Pilot Runbook (`docs/pilot/bicycle-retail-pilot-checklist.md`):**
  - Physical bench hardware sign-off checklist, Day 0 bicycle/retail shop onboarding, 13 operational pilot test scenarios, and power-cut/corrupt-file/printer-offline/upgrade-rollback incident runbook.

---

## 8. Remaining Prerequisites Before First Live Shop Pilot

1. **Code Signing (Owner / Release Ops):** Configure `WINDOWS_SIGNING_CERT_PFX_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD`, rebuild `0.4.0` via `windows-local.yml`, and verify `authenticodeStatus == Valid` in `PHASE23_RELEASE_MANIFEST` to eliminate Windows SmartScreen "Unknown publisher" blocks.
2. **Upstream Rust Advisory Watch (`apps/desktop/src-tauri/Cargo.lock`):** Monitor upstream fixes for `url` (`RUSTSEC-2026-0592`) and `cookie` (`RUSTSEC-2026-0594`) in Tauri's dependency tree and refresh `Cargo.lock` once patched releases publish.
3. **Physical Bench Acceptance (`docs/pilot/bicycle-retail-pilot-checklist.md`):** Execute and sign off on a physical Windows 10/11 PC with a real 58 mm / 80 mm thermal printer (English + Gurmukhi test receipts), physical USB HID barcode scanner, RJ11 cash drawer (if used), external USB backup stick, and a controlled AC power-cut test before going live at a retail counter.
