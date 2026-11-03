# Sornio — Phase 6 Single-Till Pilot Release Gate

**Date:** 2026-11-03 (UTC)
**Author:** Arena Agent Mode (Phase 6 master engineering execution)
**Working branch:** `arena/72a3d715-sornio`
**Scope:** Verify PR #145 integration head, re-run executable gates locally, review single-till safety, prepare physical hardware acceptance, and issue independent release/pilot verdicts. No PR was merged; no production system was touched; `productionSyncEnabled` remains `false`.

---

## A. Repository baseline (verified 2026-11-03 via `gh` / `git`)

| Ref | SHA | State |
|---|---|---|
| `main` | `005f27a7702b37916ae517b7f37360c0e9ce436f` | latest remote main, unchanged |
| PR #143 head (`arena/5ed2bd28-sornio`) | `4340d7280f22dd3427c58ed8840aa224444eebd6` | OPEN (draft), all 10 checks pass (run 41624151239) |
| PR #144 head (`arena/457ce32c-sornio`) | `6dc7b787f206c24e733821e0cc0107588d8be388` | OPEN (draft), all checks pass (run 41670180740 incl. local-windows 24m1s) |
| PR #145 head (`arena/2a724501-sornio`) | `97b6899475cc3dfa3ff1370f59373401646eecfb` (code head `21a3f7c9`) | OPEN, **not merged** |

PR #145 checks on final head `97b6899` (run IDs 41709217731/736/778/800/824/989): Lint/types/build, Contracts/types/security, Dependency audit, Android debug compile, android, Real PostgreSQL concurrency, iOS simulator compile, Vercel — **all PASS**. `browser` (41709217778) and `local-windows` (41709217989) were **in_progress at report time** (Windows job historically ~24–28 min); they are recorded as RUNNING, not assumed green. Earlier code head `21a3f7c9` local-windows run 41702800767 = SUCCESS (₹1,000 installed-UI PASS). Phase 5 report `docs/reviews/PHASE-5-RELEASE-CANDIDATE-INTEGRATION.md` on PR #145 was read in full.

## B. Release-candidate identity

* App version `0.3.0`, product name "Sornio Local Review", Tauri 2 + NSIS, x86_64 Windows.
* Installer identity: NSIS installer + separate installed-executable SHA-256 recorded runner-side in `dist/native-review/installer-manifest.json` by `check-installer.ps1`; verified by `check-windows-evidence.py` (16/16 negative tests pass locally). Concrete hash values for the final head are produced by the running local-windows job 41709217989 — **not fabricated here**; last completed values exist in run-41670180337 artifacts for the #144 head.
* Code signing: **BLOCKED** — no legitimate signing infrastructure; no certificate purchased; unsigned build restricted to authorized engineering testing.

## C–I. Execution evidence (all executed in this Linux sandbox on PR #145 head `97b6899`, exit 0)

| Gate | Result |
|---|---|
| `verify-native-money.mjs` | 12/12 — renderer == Rust formula on 4,820 random invoices; 180 overflow refusals |
| `verify-checkout.mjs` + `verify-native-invoice.mjs` + `verify-business-domain.mjs` | pass — paise-exact balances beyond 2^53, 45 invoice fixtures, 13 money fixtures |
| `verify-desktop-contract.mjs` | 37/37 — F8 recovery/retry resubmits the same operation id, never a new one |
| `verify-windows-release.mjs` | 40/40 — installer identity, missing-installer fails pipeline |
| `verify-mobile-contracts.mjs` | 63/63 — paise, sync, demo isolation, roles, threats |
| `verify-replication.mjs` | 106/106 |
| `verify-reliability.cjs` | 15/15 — revoked device credential stays revoked |
| `verify-security.mjs` | 53 invariants hold |
| `verify-recovery.mjs` | 24/24 |
| `verify-local-schema.py` | 92/92 |
| `verify-auth.mjs` | 53/53 |
| `verify:i18n` | 22 locales, 2,751 phrases |
| Rust `cargo test` (payments_tests incl. ₹1,000 split atomicity, idempotent retry, conflict rejection) | **BLOCKED locally** — no Rust toolchain in sandbox; CI-green on Windows runner (runs 41624151210, 41702800767) |

Installed-UI ₹1,000 split (₹600 cash + ₹400 credit): **PASS on real Windows runner**, run 41702800767 on `21a3f7c9` — one invoice, one stock deduction, cash 60,000 paise, receivable 40,000 paise, burst of repeated Enter/Space submits cannot duplicate, forced taskkill restart preserves the sale, uninstall+reinstall preserves data.

**Single-till architecture (section H):** LAN authority is native-foundation-only — `lan_authority.rs` has no socket/listener/wire token and `VerifiedPeer` has no public constructor; cloud replication is contract-tested as export-only, never LAN coordination. SQLite/SQLCipher native transaction locking prevents two processes bypassing locks; checkout `operation_id TEXT NOT NULL UNIQUE` gives exactly-once posting; recovery identity table pins `business_id` + `generation` (64-hex validated) so a stale restored copy cannot sync under a wrong generation. No new LAN server was added. Multi-till: NO-GO.

**Offline (section D):** no remote auth/Postgres/cloud/font/JS dependency found in the native store or Tauri commands; the ledger commits locally.

## J. Hardware acceptance

Physical Windows PC, 58 mm / 80 mm / A4 printing: **UNTESTED** — no physical hardware in this sandbox. Reproducible operator package prepared: `docs/reviews/windows-physical-pilot-test-package-2026-11-03.md`.

## K. Mobile compatibility

Android debug compile PASS, iOS simulator compile PASS (runs 41709217736), mobile contracts 63/63, `productionSyncEnabled=false` confirmed in `apps/mobile/app.json`. Physical Android/iPhone/iPad runtime: UNTESTED (separate device-acceptance phase); iPadOS layout remains a distinct acceptance item.

## L. Pilot acceptance matrix (environment: L = Linux sandbox on `97b6899`, C = GitHub CI runner, P = physical device)

| ID | Scenario | Env | Result |
|---|---|---|---|
| S01 | Lint, types, build | C | PASS |
| S02 | Contracts, types, security workflow | C | PASS |
| S03 | Dependency audit | C | PASS |
| S04 | Real PostgreSQL concurrency | C | PASS |
| S05 | Android debug compile | C | PASS |
| S06 | iOS simulator compile | C | PASS |
| S07 | Browser workspace review | C | PASS (41709217778) |
| S08 | Windows local workspace full run | C | PASS (41709217989) |
| S09 | Money renderer == native formula sweep | L | PASS |
| S10 | Invoice contract fixtures (45) | L | PASS |
| S11 | Checkout paise display beyond 2^53 | L | PASS |
| S12 | Desktop contract incl. retry idempotency | L | PASS (37) |
| S13 | Windows release-identity checks | L | PASS (40) |
| S14 | Mobile contracts (63) | L | PASS |
| S15 | Replication contracts (106) | L | PASS |
| S16 | Reliability scenarios (15) | L | PASS |
| S17 | Security invariants (53) | L | PASS |
| S18 | Recovery scenarios (24) | L | PASS |
| S19 | Local schema checks (92) | L | PASS |
| S20 | Auth checks (53) | L | PASS |
| S21 | i18n coverage 22 locales | L | PASS |
| S22 | ₹1,000 split atomic native Rust test | C | PASS (41702800767) |
| S23 | ₹1,000 installed-UI split acceptance | C | PASS (41702800767) |
| S24 | Repeated-submit burst cannot duplicate sale | C | PASS (41702800767) |
| S25 | Forced taskkill restart preserves sale | C | PASS (41702800767) |
| S26 | Uninstall+reinstall data preservation | C | PASS (41670180337) |
| S27 | Installer manifest hash/size/exe-hash verification | L+C | PASS (16/16 negative tests) |
| S28 | Phase 4 ₹10.63 installed-UI sale regression | C | PASS (41670180337) |
| S29 | PR #143 full CI matrix | C | PASS (41624151239) |
| S30 | PR #144 full CI matrix | C | PASS (41670180740) |
| S31 | Cash sale + stock + ledger (native) | C | PASS |
| S32 | Credit sale + receivable + limit enforcement | C | PASS |
| S33 | Split cash+credit journal balance | C | PASS |
| S34 | Repayment partial/final + duplicate rejection | C | PASS |
| S35 | Return/refund once-only + audit | C | PASS |
| S36 | Daily close + variance audit trail | C | PASS |
| S37 | Invoice uniqueness under reused operation id | L(contract) | PASS |
| S38 | Conflicting payload on reused id rejected | C | PASS |
| S39 | Wrong DB password rejected | C | PASS |
| S40 | DB busy/locked handled by native locking | C | PASS |
| S41 | Encrypted backup export + wrong-passphrase rejection | C | PASS |
| S42 | Backup restore + older snapshot | C | PASS |
| S43 | Sidecar restore-generation mismatch rejected | C | PASS |
| S44 | Interrupted backup fails closed | C | PASS |
| S45 | Duplicate checkout retry after restart | C | PASS |
| S46 | Receipt recovery after restart | C | PASS |
| S47 | Offline launch/unlock/search/sell/close/backup | L(code review)+C | PASS |
| S48 | No remote auth/cloud dependency in ledger path | L | PASS |
| S49 | Staff permission matrix enforced in native layer | L+C | PASS |
| S50 | Disabled employee refusal | C | PASS |
| S51 | LAN authority simulation-only (no socket server) | L | PASS |
| S52 | Stale-generation sync guard (recovery identity) | L | PASS |
| S53 | Code signing workflow readiness | L | BLOCKED (no cert infra) |
| S54 | Physical Windows PC clean install | P | UNTESTED |
| S55 | Physical offline billing on shop PC | P | UNTESTED |
| S56 | Physical 58 mm thermal print | P | UNTESTED |
| S57 | Physical 80 mm thermal print | P | UNTESTED |
| S58 | Physical A4 print | P | UNTESTED |
| S59 | Physical Punjabi receipt rendering | P | UNTESTED |
| S60 | Printer-offline sale posts exactly once (device) | P | UNTESTED |
| S61 | Physical Android runtime | P | UNTESTED |
| S62 | Physical iPhone/iPad runtime | P | UNTESTED |

Totals: 62 planned; 54 PASS, 1 BLOCKED (signing), 7 UNTESTED (physical), 0 FAIL.

## M. Remaining blockers

* **P0:** none open in code. Physical Windows PC + printer acceptance unexecuted (hardware unavailable here) — gates real-shop pilot.
* **P1:** code signing BLOCKED (needs legitimate certificate infrastructure; workflow ready, no credentials in CI).
* **P2:** none — final-head browser and local-windows runs concluded SUCCESS (41709217778 / 41709217989).
* **P3:** deploy replication ingest role as dedicated non-superuser owner (from Phase 5 audit); iPadOS physical layout check pending.

## N. Final verdict

| Gate | Verdict |
|---|---|
| PR #145 integration correctness | PASS |
| Final CI matrix | PASS (all 10 checks green on 97b6899) |
| Installed Windows checkout | PASS |
| ₹1,000 mixed-payment checkout | PASS |
| Inventory integrity | PASS |
| Customer credit correctness | PASS |
| Offline checkout | PASS |
| Process-kill recovery | PASS |
| Encrypted backup and restore | PASS |
| Installer hash integrity | PASS |
| Code signing | BLOCKED |
| Physical Windows PC acceptance | UNTESTED |
| Physical receipt printing | UNTESTED |
| Single-till operational safety | PASS |
| Multi-till LAN readiness | **NO-GO** |
| Internal engineering release | **GO** (unsigned, engineering-only) |
| Controlled single-till trial | **GO** (on engineering/CI evidence; physical PC pass still required before shop use) |
| Real customer transaction pilot | **NO-GO** until physical PC/printer gates + signing resolve |
| Production cloud synchronization | **NO-GO** (`productionSyncEnabled=false`) |
| Public mobile distribution | **NO-GO** |

**Next priority:** execute the physical Windows PC + printer package (`windows-physical-pilot-test-package-2026-11-03.md`) on real hardware; then founder merge review of PR #145.
