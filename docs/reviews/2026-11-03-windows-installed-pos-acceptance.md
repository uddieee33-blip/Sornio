# Windows installed-POS acceptance — 2026-11-03 (Phase 4)

**Independent audit branch:** `arena/457ce32c-sornio` (PR #144, draft). Final head under test: **`c264cde7`**.
**PR #143 under audit:** `arena/5ed2bd28-sornio` @ `4340d7280f22dd3427c58ed8840aa224444eebd6` — left open/draft/unmerged.

> Verdict: **installed-UI financial acceptance PASS on the audit branch (with the split-credit fix). Real-shop pilot remains NO-GO** — the installer is an unsigned engineering build, runtime scope is a single hosted-runner PC, and production sync stays disabled.

---

## 1. Repository state

| Field | Value |
| --- | --- |
| main | `005f27a7702b37916ae517b7f37360c0e9ce436f` |
| PR #143 head | `4340d7280f22dd3427c58ed8840aa224444eebd6` (OPEN, DRAFT, MERGEABLE, 36 commits) — untouched |
| Audit branch head | `c264cde7` (pushed; PR #144 draft) |
| Previous session check | Phase 3 audit `8b037fe` present; no prior Phase 4 implementation existed |

## 2. Installer provenance (runner-computed, closing the hash gap)

The hash gap from Phase 3 is closed **on the Windows runner**, where the bytes exist:

- `apps/desktop/check-installer.ps1` now writes `dist/native-review/installer-manifest.json` after each install with: installer file name/bytes/**SHA-256**, installed `sornio-desktop.exe` path/bytes/**SHA-256**, `commitSha`, `workflowRunId`, runner OS — and a note that installer-exe, installed-exe and the Actions archive zip are three different byte streams.
- `apps/desktop/check-windows-evidence.py` re-hashes the actual NSIS `*-setup.exe` on the runner and fails unless the manifest's `installerSha256`/`installerBytes` match, and unless a 64-hex installed-exe hash and commit SHA are present. The manifest is uploaded with the installer artifact (workflow updated).
- `apps/desktop/test_windows_evidence.py`: 16/16 locally (fixture + tamper tests for hash/size mismatch, missing exe hash, missing commit).
- Run 41664825287 artifacts (GitHub-reported archive digests; archive **bytes** are not downloadable from this Linux sandbox — Azure blob egress is blocked — so the archive digest is GitHub-reported, while the **installer executable hash was recomputed and verified on the runner**):
  - `Sornio-Local-Workspace-Review` id 13247142464, 222,748,542 bytes, `sha256:b4328524d441cc4de096ab1fabd6b9117551b7d4b91effbe6159231d78d0cd98` (archive zip)
  - `Sornio-Local-Native-Captures` id 13247062813, 1,345,599 bytes, `sha256:d927d24e702d7fb7f50d9f410af17555b4f3935b9123ed26bf9a445230dbc72e`

## 3. UI automation method

`apps/desktop/check-native.py` drives the **unmodified, installed, packaged release exe** on a GitHub-hosted Windows runner via pywinauto UIA + real keyboard input (no DevTools, no injected JS, no mocked IPC), with outbound firewall rules blocking the app and WebView2. Screenshots are captured and hash-verified by `check-windows-evidence.py`.

## 4. Cashier financial test matrix (installed UI unless marked)

| ID | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| UI-01 | Setup, unlock, wrong-password refusal | PASS | run 41664825287 step 19 |
| UI-02 | Stock save + fractional quantities + oversell guard | PASS | same |
| UI-03 | Review-then-cancel is not a sale | PASS | same |
| UI-04 | Cash-only sale ₹53.13, receipt UUID, balances, stock −1.25 | PASS | same |
| UI-05 | Full customer-credit sale ₹31.88 (customer create + phone lookup) | PASS | same |
| UI-06 | **Mixed split ₹6.00 cash + ₹4.63 customer credit via UI, repeated submit keys** | **PASS** | new Phase-4 block; one invoice ID, `Saved total: ₹10.63`, balances cash ₹101.64 / credit ₹4.63 / stock 1.5, screenshot `windows-mixed-cash-credit-sale.png` |
| UI-07 | Forced termination + relaunch: split sale, cash and receivable persist exactly once | **PASS** | `windows-mixed-split-reopened.png`; invoice ID unchanged |
| UI-08 | Reinstall + `--verify-preserved`: credentials, draft, balances 101.64/4.63/1.5, preserved receipt | PASS | step 19 `--verify-preserved` |
| UI-09 | Backup export (real ciphertext, no plaintext secrets), wrong-passphrase refusal, restore | PASS | same |
| UI-10 | Customer partial + full repayment, receipt recovery after restart, statement print | PASS | same |
| UI-11 | Owner creates staff; cashier lacks owner fields and balances; cashier sale; role change; disabled-account refusal | PASS | same |
| UI-12 | Retail cash+UPI split, pending/unverified separation, manual match, return, CA CSV, closing variance | PASS | same |
| UI-13 | Cashier day reopen via owner UI (reason-gated) | PASS | new block |
| UI-14 | Double-submit burst on Confirm (SPACE/ENTER/ENTER/SPACE) | PASS — one operation id, one invoice (busy guard + `retailRef` single id + native replay); contract pinned in `verify-desktop-contract.mjs` (37/37 local) | run 41664825287 |
| N-xx | Native cargo suites (financial matrix, concurrency, crash/rollback, SQLCipher, replication) | PASS (CI-only; no local cargo) | release+debug `cargo test --all-targets`, steps 7–8 |

Not executed through the installed UI (honest): physical printer output, real power loss, multi-PC LAN contention on hardware, WAN outage during checkout. Covered instead by native fault-injection tests and marked UNTESTED for hardware.

## 5. Defect found and fixed

**P0 (release-blocking on main):** `post_split_credit` called `payments::unclaimed()`, which treats the sale's own in-flight `local_retail_pending` row as `OperationConflict`. Installed-UI run 41645332283 (pre-fix) failed the mixed cash+credit sale with exactly "This save ID already belongs to different input". Fix on the audit branch (`7897aa2`, logic identical to PR #143 `1d6d0a2`): reject completed/canceled retail ids explicitly, keep customer-subsystem checks, keep `unclaimed()` on the full-credit `post_sale` path; DB backstop `credit_sale_once` unique index unchanged. With the fix, run 41654520381 got past the conflict (next refusal was the closed day — a test-sequencing issue, fixed in `80cefd9`), and run 41664825287 passed end-to-end.

## 6. CI run references (all on `c264cde7`)

| Workflow | Run ID | Result |
| --- | --- | --- |
| Windows local workspace | 41664825287 | SUCCESS (26/26 steps incl. cargo release+debug, NSIS build, silent install, offline UIA acceptance, manifest, evidence gate, artifact upload) |
| CI | 41664825418 | SUCCESS |
| Workspace browser review | 41664825451 | SUCCESS |

Failed intermediate runs (all diagnosed and fixed, none weakened): 41634278263 (evidence-contract fixture missing manifest), 41636540511 & 41640492106 & 41645332283 (split sale: OperationConflict pre-fix), 41654520381 (day-closed sequencing), 41659347365 (verify-preserved receipt selector).

## 7. Remaining defects / gaps

- P1: unsigned engineering installer (signature status recorded, not signed); archive bytes not independently downloadable from the audit sandbox (runner-side exe hash IS verified).
- P1: no physical printer / power-loss / multi-PC hardware evidence.
- P2: `acks` RLS without FORCE/policy (from Phase 3 audit, unchanged).
- P3: PR #143 title still says "Phase 1" (description now documents all three phases).

## 8. Final release decisions

| Gate | Verdict |
| --- | --- |
| Installed Windows UI acceptance (engineering scope) | **PASS / GO** (run 41664825287) |
| Financial correctness through installed UI (₹600 cash + ₹400 credit class) | **PASS** with the split-credit fix; **FAIL on main without it** |
| Windows installer integrity | **CONDITIONAL GO** — runner-verified exe hashes + manifest; archive digest GitHub-reported; unsigned |
| Crash recovery | **GO for tested cases** (process kill before/after commit, reinstall preserve); power loss UNTESTED |
| Receipt correctness | **PASS** at UI/screenshot level for the flows run; physical printer UNTESTED |
| Staff authorization (UI-level) | **PASS** (cashier restrictions, disabled account) |
| Internal test readiness | **GO** |
| PR #143 merge readiness | **NO-GO for auto-merge; founder review only** (unchanged) |
| Real-shop Windows pilot | **NO-GO** until signed installer, hardware/printer/power evidence, and the fix is in the reviewed branch |
| Production cloud synchronization | **NO-GO** (`productionSyncEnabled=false`, `SCHEMA_VERSION=12` unchanged) |
| Public Android/iOS release | **NO-GO** |

**Recommended next assignment:** get the split-credit fix (PR #143 `1d6d0a2` logic / audit branch `7897aa2`) into the reviewed PR and run a **physical Windows PC pilot protocol**: signed installer, real 58/80 mm printer, power-cut during checkout, two LAN tills competing for the last unit — with `docs/reviews/` evidence per scenario.
