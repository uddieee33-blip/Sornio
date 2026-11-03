# Sornio — Phase 5 Release Candidate Integration Report

**Date:** 2026-11-03 (UTC)
**Author:** Arena Agent Mode (Phase 5 master engineering execution)
**Branch:** `arena/2a724501-sornio` — integration commit `df399ce07de82d033dc1ef6226ad6f6ac2a1d597`
**Scope:** Reconcile PR #143 (Phase 1–3) with PR #144 (Phase 4), add the release-blocking ₹1,000 installed-UI regression, verify the combined candidate, and produce an evidence-based release verdict. Neither PR #143 nor PR #144 was merged; no history was rewritten; no production service was touched.

---

## A. Repository reconciliation (executed, not assumed)

| Ref | SHA (verified via `git ls-remote` / `gh pr view` on 2026-11-03) | State |
|---|---|---|
| `main` | `005f27a7702b37916ae517b7f37360c0e9ce436f` | latest remote main |
| PR #143 head (`arena/5ed2bd28-sornio`) | `4340d7280f22dd3427c58ed8840aa224444eebd6` | OPEN, MERGEABLE, checks SUCCESS |
| PR #144 head (`arena/457ce32c-sornio`) | `6dc7b787f206c24e733821e0cc0107588d8be388` | OPEN, MERGEABLE, checks SUCCESS |
| Session branch `arena/2a724501-sornio` | `df399ce` (this work) | active |

Merge bases (all three): `005f27a` — both PRs branch directly from current main, so the three-way comparison is clean with no concurrent main movement. No other agent's commits were overwritten; the only concurrent branches are unrelated `arena/*` scratch branches.

Blob-level confirmation of the known finding: `packages/local-store/src/customers.rs` is blob `dbe252a7dc11b0b359364cc34c8042c1c37187f9` on **both** PR heads (differs from main's `b8d41f5e…`). The split-credit correction was **already present** in PR #143 and was **not** re-applied.

## B. PR #143 / #144 integration — file-by-file decisions

Three-way file comparison (`main` vs `pr143` vs `pr144`): 165 files changed on #143, 9 on #144, overlap = 2 files.

| File | Decision | Rationale |
|---|---|---|
| `packages/local-store/src/customers.rs` | **Retained as-is (identical blob on both heads)** | Split-credit `post_split_credit` fix already present; re-cherry-picking would duplicate |
| `.github/workflows/windows-local.yml` | **Three-way merged**: kept #143's Perl-on-PATH step + annotated installer-build error reporting; added #144's `dist/native-review/installer-manifest.json` artifact upload | Both sides changed the same file from main; neither side's change subsumes the other |
| `apps/desktop/check-native.py` | **Took #144's version, then added the Phase 5 ₹1,000 regression** (see C) | #143 did not touch this file; #144's Phase 4 installed-UI test retained in full |
| `apps/desktop/check-installer.ps1` | **Took #144's version** | Runner-side `Write-InstallerManifest` (installer + installed-exe SHA-256, commit, run id) |
| `apps/desktop/check-windows-evidence.py` | **Took #144's version** | Verifies manifest hash/size/exe-hash/commit against the actual installer bytes |
| `apps/desktop/test_windows_evidence.py` | **Took #144's version** | +5 manifest negative tests; executed locally: 16/16 pass |
| `scripts/verify-desktop-contract.mjs` | **Took #144's version** | +5 idempotency contract checks; executed locally: 37/37 pass |
| `docs/reviews/2026-11-03-windows-installed-pos-acceptance.md` | **Integrated** | Phase 4 acceptance evidence (run 41664825287) |
| `docs/reviews/2026-11-03-pr143-reliability-release-gate.md` | **Integrated** | Phase 4 independent audit of #143 |
| All 163 other #143 files (mobile companion, replication scripts, Rust tests, docs) | **Retained wholesale** (base of the integration is the #143 head) | Phase 1–3 correctness preserved |

Result: integration HEAD `df399ce` differs from PR #143 head in exactly the 8 Phase 4 files above; it differs from PR #144 head in the 165 Phase 1–3 files #144 never had. No duplicated test blocks; no conflicting hunks remained after the workflow three-way merge.

## C. Financial correctness

**Native layer (executed evidence exists in tree, CI-green on #143 head):** `split_cash_and_customer_credit_sale_posts_one_atomic_sale` in `packages/local-store/src/payments_tests.rs` is exactly the required scenario — invoice `100000` paise = `60000` cash + `40000` customer credit — asserting one invoice, one stock deduction (`local_invoice_stock` count = 1), one outbox event, two payment rows (cash 60000 `recorded`, credit 40000 `credit_due`), balances `60000`/`40000`, exactly one `local_credit_entries` row, idempotent exact retry (same result, no new rows), changed-request conflict, `journals_balance`, and restart persistence. Ran green in `windows-local` run 41624151210 on `4340d728`.

**Installed-UI layer (new in this branch, `df399ce`):** `apps/desktop/check-native.py` now drives the ₹1,000.00 acceptance scenario through the *packaged installed application* on a clean disposable shop: clears the customer's ₹50 limit via the owner UI, creates a ₹1,000.00 item, posts 1 × ₹1,000.00 as ₹600.00 cash + ₹400.00 credit split with a burst of repeated submit keys (`{ENTER}{ENTER}{SPACE}`), then asserts: unique new invoice UUID, receipt total **₹1,000.00**, receipt payment breakdown **₹600.00 / ₹400.00** naming `native-customer-1`, balances **₹701.64 cash / ₹404.63 credit / 1.5 pcs** (exactly one deduction; a duplicate sale would move cash to ₹1,301.64), forced-termination restart preserving the same invoice id and total. `--verify-preserved` (run after same-version reinstall) now asserts the ₹1,000.00 receipt and ₹701.64/₹404.63 balances survive reinstall — covering restart + reinstall + recovery-without-duplicate. Deep DB assertions (no duplicate payment/credit/outbox rows, journal balance) are covered by the native test above; the UI test deliberately never touches the database directly.

**Local execution on this branch:** the UI test cannot run in this Linux sandbox (no Windows/WebView2) — it is wired into `windows-local.yml` and will execute on the CI run for `df399ce` (see J). The ₹10.63 Phase 4 installed-UI sale remains green from run 41664825287 / 41670180337 on the #144 head; its code is unchanged here except the surrounding new test.

## D. Windows verification

- Installer build + install + lifecycle + offline launch + UIA acceptance: PASS on #144 head (runs 41664825287 @ `c264cde`, 41670180337 @ `6dc7b787`, both SUCCESS, workflow "Windows local workspace").
- The same workflow on this integration branch adds the ₹1,000 regression (CI run recorded in J once complete).
- Restart/reinstall persistence: covered by `check-native.py` forced-`taskkill` restart and `--verify-preserved` after silent uninstall/reinstall (data preserved), green on #144 head.

## E. Installer integrity

- `check-installer.ps1` `Write-InstallerManifest` records on the building runner: `commitSha`, `workflowRunId`, installer filename, byte size, **installer SHA-256**, and a separate **installed-executable SHA-256**; `check-windows-evidence.py` verifies the manifest's installer hash equals the hash of the installer file actually hashed, size matches, exe hash is hex-64, commit SHA present. Negative tests executed locally on this branch: 16/16 (`test_windows_evidence.py`), including hash-mismatch, size-mismatch, missing-exe-hash, missing-commit, missing-manifest rejections.
- The three digests are kept distinct: GitHub artifact archive hash (reported by Actions API), NSIS installer hash, installed executable hash. Actual values for #144 head are in the run-41670180337 artifact `Sornio-Local-Workspace-Review` (`installer-manifest.json`); they will be regenerated for `df399ce` by its own CI run — no hash is fabricated or substituted here.
- **Code signing:** no legitimate signing infrastructure exists in the repo (no signtool/certificate workflow; `signatureStatus` is recorded as evidence only). Verdict: **BLOCKED/UNTESTED**. Requirement documented: a trusted code-signing certificate (e.g., EV cert via a secure signing service or an HSM-backed CI secret) must sign the NSIS installer before any consumer release; no self-signed certificate will be treated as publisher identity. No certificate was purchased.

## F. Replication regression (executed on this branch)

- Contract suite: `npm run verify` → `verify-replication.mjs` **106/106 checks passed** locally on `df399ce` (exit 0; full `verify` chain green).
- **Real server PostgreSQL (new execution evidence, this branch):** isolated PostgreSQL 16-class instance (pgserver, throwaway, no production touched) + `DATABASE_URL` → `scripts/verify-replication-postgres.mjs` → **71 checks passed on server PostgreSQL** (exit 0): transactional ingest, dedup, cursor, durable acks, projection reconstruction, concurrency. CI equivalent: "Replication PostgreSQL" run 41624151597 SUCCESS on `4340d728`.
- Native SQLCipher→TLS→Postgres export (`verify-replication-native-https.mjs`, cargo-driven): **BLOCKED locally** (no Rust toolchain in this Linux sandbox; fails closed by design, exit 2, not a pass). CI-verified on #143 head: runs 41623767727 / 41624151210 SUCCESS (native export + TLS ingest + tampered/invalid-JWT rejection).
- TLS-only transmission, SHA-256 payload verification, integer-paise serialization: contract-checked (106 checks) and CI-green.

## G. Security — PostgreSQL RLS re-audit (executed, isolated Postgres)

New execution evidence on this branch: the real migration `packages/replication-cloud/sql/20261103000000_native_financial_replication.sql` applied to a throwaway pgserver instance; **13/13 checks passed**:

1. **Which role accesses `acks`?** Only the privileged ingest connection (table owner). No app role has any GRANT on `acks` and no policy exists — publisher, cashier, and even another tenant's owner all get `42501 permission denied` on SELECT/INSERT.
2. **Does that role bypass RLS?** Yes — RLS is ENABLE without FORCE, so the table owner is not bound. Verified with a dedicated non-superuser, non-BYPASSRLS owner role: acks INSERT succeeds.
3. **Cross-tenant access via acks?** Impossible for app roles (no grant + no policy = deny-all). Verified.
4. **Is FORCE RLS appropriate?** **No.** Proven by experiment: with `FORCE ROW LEVEL SECURITY` and no policies, the same ingest owner's INSERT is *denied* (`new row violates row-level security policy`) — FORCE would break durable acknowledgements. Blindly applying FORCE is therefore wrong; the correct control is the existing missing-grant + owner-only access.
5. **Would new policies interfere with ingestion?** Yes, if combined with FORCE; policies for app roles on `acks` are unnecessary because no app role needs acks (the sidecar file is the client-side ack store).
6. **Restricted role reading unauthorized acks?** No — denied (42501).
7. **Privilege escalation?** No — cashier login cannot `SET ROLE sornio_owner` (42501); role membership is granted server-side only.
8. **Migration required?** No schema change made. Remaining hardening note (P2): deploy the ingest connection as a dedicated non-superuser owner of `native_replication` only (not the `postgres` superuser), so a compromised ingest credential cannot read other schemas. This is a deployment/migration decision — deliberately **not** applied here.

Additional isolation proofs: publisher can insert events for its own tenant but is RLS-denied for another tenant (`WITH CHECK` violation); cashier sees only own-tenant **posted** invoices (pending and other-tenant rows hidden); cashier cannot read `customers` or `pending_retail`. Severity of the documented acks gap: **LOW (P2)** — fail-closed by default-deny, not exploitable by any app role; residual risk is limited to the privileged ingest connection itself.

## H. Hardware readiness (physical-shop pilot)

Executed on real hardware in this sandbox: **none** (no Windows PC, printers, or shop LAN here). Honest status per device class:

| Test | Status |
|---|---|
| Windows PC clean install + launch | PASS (CI runner, runs above) — physical shop PC UNTESTED |
| 58 mm / 80 mm / A4 physical receipt print | UNTESTED (no printer). Layouts (58/80/A4), Punjabi + English receipt text, currency formatting, split payment lines are contract-checked in code; physical print quality reserved for hardware |
| Offline billing | PASS (installed acceptance blocks outbound network for app + WebView2) |
| Restart recovery | PASS (forced taskkill restart, CI) |
| Network interruption | PASS at ledger level (offline fixture); physical NIC interruption UNTESTED |
| Two cashier devices / LAN contention | **See below — simulation only** |
| Backup/restore | PASS (encrypted backup, wrong-passphrase refusal, restore-generation fencing, CI) |
| Staff login / RBAC | PASS (owner/cashier restrictions, disabled-account refusal, CI installed-UI) |
| Daily cash closing | PASS (exact variance ₹-0.01 case, CI) |

**Manual pilot protocol (for a disposable test shop, no developer tools needed):** see Appendix 1 below — plain-language steps using only the installed app, a printer, and two PCs, with pass/fail checkboxes. Interruption testing uses normal app close / safe OS shutdown only — no power cuts, no electrical experiments. All testing uses nonproduction accounts and disposable records.

## I. Mobile readiness (companion audit — no live sync enabled)

`productionSyncEnabled=false` confirmed in `apps/mobile/app.json` (unchanged). No posting path exists in the companion; desktop SQLCipher ledger remains the only financial authority.

| Platform | Result |
|---|---|
| TypeScript compilation | PASS locally on `df399ce` (`tsc --noEmit` in `apps/mobile`, exit 0) |
| Contracts | PASS — 63/63 mobile contract checks (`verify-mobile-contracts.mjs`) |
| Android native build | CI PASS on `4340d728` — "Android review package" run 41624151287 SUCCESS (debug APK compile + aapt package identity + SHA-256 recorded); physical device/emulator launch UNTESTED here |
| iOS simulator build | CI PASS on `4340d728` — "Mobile companion" run 41624151239 SUCCESS (iOS simulator compile); physical iPhone UNTESTED |
| iPadOS tablet usability | **Functional tablet layout exists in code** (verified by inspection): `tabletMin: 720` breakpoint, wide-screen rail navigation in `AppNavigation.tsx` (portrait and landscape), split customer list/detail in `CustomersScreen.tsx`, wrapping metric grid in `HomeScreen.tsx`, 44 pt touch targets (`touch = 44` in design tokens), safe-area insets via `react-native-safe-area-context`. Simulator compile green; **actual iPad runtime (Split View, rotation, touch) UNTESTED** — no iOS device/simulator in this sandbox. No code changes were needed; none made |
| Demo mode / offline state / auth failure / read-only | Covered by contract checks + CI; runtime on devices UNTESTED |

No Google Play / App Store submission made or planned; no production sync endpoint deployed.

## J. CI evidence

| Workflow / run | SHA | Result |
|---|---|---|
| Windows local workspace — 41664825287 | `c264cde` (#144) | SUCCESS (Phase 4 ₹10.63 installed-UI acceptance) |
| Windows local workspace — 41670180337 | `6dc7b787` (#144 head) | SUCCESS (installer manifest end-to-end) |
| Windows local workspace — 41624151210 | `4340d728` (#143 head) | SUCCESS |
| Replication PostgreSQL — 41624151597 | `4340d728` | SUCCESS |
| CI — 41624151225 / Browser review — 41624151580 | `4340d728` | SUCCESS |
| Mobile companion — 41624151239 / Android review package — 41624151287 | `4340d728` | SUCCESS |
| Windows local workspace on **this branch `df399ce`** | `df399ce` | **triggered by push; see PR checks** (the ₹1,000 installed-UI regression executes there) |
| Local execution on `df399ce` (this sandbox) | `df399ce` | `npm run verify` exit 0 (incl. 106 replication + 37 desktop-contract + 63 mobile-contract + 40 windows-release checks); `typecheck` exit 0; `lint` 0 errors; `test_windows_evidence.py` 16/16; `test_install_data.py` 4/4; `verify-replication-postgres.mjs` on isolated server PostgreSQL **71/71**; isolated RLS audit **13/13** |

## K. Remaining defects / risks

- **P0:** none known on the integration branch. (The pre-fix split-credit `OperationConflict` was the last P0 and is fixed identically on both PR heads, blob `dbe252a`.)
- **P1:** ₹1,000 installed-UI regression is new in `df399ce` and has **not yet executed** — it runs on the branch's Windows CI; until that run is green the gate in §14 stays UNTESTED, not PASS. Two-till LAN: authority layer is **in-process only** (`lan_authority.rs`: "No socket, listener, pairing UI or wire token") — the 16-scenario concurrency matrix (incl. last-unit races with 2–3 cashiers) passes in CI, but that is a *simulation* against one SQLite DB, not two PCs over a real LAN.
- **P2:** `acks` RLS posture (documented, fail-closed, §G); ingest connection should be a dedicated non-superuser owner at deploy time; revoked-device ingest matrix partial; physical hardware (printers, iPad, shop LAN) untested; Windows code signing BLOCKED (no infrastructure); native SQLCipher export not runnable in this Linux sandbox (CI-only).

## L. Release gate verdicts

| Gate | Verdict |
|---|---|
| Phase 1–4 integration | **PASS** (file-level reconciliation executed; `df399ce` contains all five phase capabilities; local suites green) |
| ₹1,000 installed-UI split sale | **UNTESTED** until the `df399ce` Windows CI run completes (native-layer equivalent PASS in CI) |
| Financial ledger integrity | **PASS** (native matrix + journal balance, CI-green on both heads; installed-UI ₹10.63 green) |
| Windows installer build | **PASS** (CI) |
| Windows runtime | **PASS** (CI, installed app) |
| Installer checksum integrity | **PASS** (manifest verified against actual bytes, CI + 16/16 local negative tests) |
| Genuine installer signing | **BLOCKED** (no signing infrastructure; unsigned engineering builds only) |
| Physical receipt printing | **UNTESTED** (no printer hardware) |
| Two-till LAN correctness | **UNTESTED over real LAN** (in-process simulation PASS only) → multi-till pilot **NO-GO** |
| Backup and recovery | **PASS** (CI: encrypted backup/restore, wrong-passphrase refusal, reinstall preservation) |
| PostgreSQL isolation | **PASS** (13/13 isolated-Postgres RLS checks executed on this branch + CI) |
| Android development build | **PASS** (CI) |
| iOS development build | **PASS** (CI simulator compile) |
| iPadOS tablet usability | **UNTESTED at runtime** (tablet layout exists in code; simulator compile PASS) |
| Founder merge review | **NO-GO pending founder review of PRs #143/#144 and this integration PR** |
| Internal test release | **GO (conditional)** — after the `df399ce` Windows CI run goes green |
| Real-shop pilot | **NO-GO** — physical hardware, two-till LAN, and signing untested; single-PC disposable pilot possible only after hardware protocol (Appendix 1) passes on real equipment |
| Production synchronization | **NO-GO** (`productionSyncEnabled=false` retained; acks hardening P2 open) |
| Public mobile release | **NO-GO** (no store submission; device runtime untested) |

---

## Appendix 1 — Physical Windows pilot acceptance protocol (plain language, disposable test shop)

Requirements: one clean Windows PC (per-user install, no admin needed), Sornio installer from the reviewed CI artifact + its `installer-manifest.json`, one thermal printer (58 mm or 80 mm) and optionally an A4 printer, internet *off* for the offline tests, two PCs for the LAN test. Use only the test shop account and throwaway records.

1. **Install & launch:** run the installer, confirm the installed `sornio-desktop.exe` SHA-256 matches `installer-manifest.json`, launch the app, set up the local password. ☐
2. **Receipt print:** make a small cash sale, print on 58 mm; repeat on 80 mm; repeat on A4 if used. Check shop name, date/time, item lines, total, payment line, invoice ID are legible and correct. ☐
3. **Punjabi receipt:** switch receipt language to Punjabi, print again, verify text renders. ☐
4. **Offline billing:** disconnect Wi-Fi/LAN, complete a full sale; verify it saves and the receipt prints. ☐
5. **Restart:** close the app normally, reopen, confirm the sale and balances are unchanged. Then force-close the app (Task Manager → End task) mid-idle, reopen, confirm unchanged. ☐ (Do **not** cut power or pull cables.)
6. **Network interruption:** start a sale, disconnect the network before confirming, confirm the sale locally; verify the ledger is intact and no duplicate appears after reconnecting. ☐
7. **Backup & restore:** export an encrypted backup, reinstall the same version, restore, confirm all sales/customers/stock return. ☐
8. **Staff login:** create a staff account as owner; log in as staff; confirm staff cannot see owner reports or edit items/customers; make a staff sale. ☐
9. **Daily closing:** count the drawer, enter counted cash, confirm the variance is shown exactly. ☐
10. **Two tills (LAN) — currently NO-GO:** connect two PCs on the same LAN, both open the same shop; have both tills sell the last unit simultaneously. Expected (once a real LAN hub ships): exactly one succeeds, the other gets a clear conflict, stock never goes negative, no duplicate invoice/credit. Record actual behavior. ☐

Record every step with a photo/screenshot and the installer manifest; attach to the pilot review. Any failure → stop, keep the records, report.
