# Phase 22 corrective execution — Phase 21B / schema v23

Status: native corrective tests passed; expanded installed-app CI is in progress. This report replaces the interpretation that old
`main`/v12 acceptance establishes anything about the Phase 21B product. It does
not. The prior untracked v12 report is historical baseline evidence only.

## Source recovery

- Repository: `uddieee33-blip/Sornio`.
- PR #184: `arena/729c232c-sornio`, `4c8841d879824c4e2e90bdd81f36f3cea9062270`.
- PR #185: `arena/110fa338-sornio`, `49a244a73ba21b6738961ab736282250d3a19214`.
- PR #186 initially: `arena/5de4cdf3-sornio`, `3bc8d86cb0c3148a4078c1956acca5da453d9fc8`.
  It advanced during execution to `8515830dfdc2e90373b9c39f825b09f594b2f3b5`;
  verified diff changes only its report (6 lines), with no executable-source change.
- `git ls-remote origin 'refs/heads/arena/*' refs/pull/186/head` independently
  confirmed the three published heads and PR #186's head. The configured fetch
  rule is `+refs/heads/*:refs/remotes/origin/*`; the branches exist.
- Recovered with `git fetch origin refs/pull/186/head` and a new worktree on
  `hardening/phase22-native-recovery-20261116`. Both Phase 20 and 21A heads pass
  `git merge-base --is-ancestor <sha> HEAD`. `SCHEMA_VERSION` is **23**.
- Existing CI checked out GitHub's merge commit
  `991be38042db0c7ade615940ca196a17de0899c3` (parents #185 and #186).
  `git diff 3bc8d86 991be38` changes only
  `docs/reviews/phase21a-release-blockers-2026-11-15.md`; executable source is
  identical. These are merge-candidate results, not a claim that CI used the
  literal head SHA.

## Existing CI inspected, not rerun

All links are under `https://github.com/uddieee33-blip/Sornio/actions/runs/`.
Selected verbatim logs are in `phase22-evidence/pr186-job-*.txt`.

| Test group | Run / job | Verdict and actual scope |
| --- | --- | --- |
| Linux native debug | 43751829430 / 132927271050 | PASS: 307 library tests, 2 SQLCipher compatibility tests, 8 native command-security tests; 6 subprocess helpers intentionally ignored and exercised by parents. Library duration 281.82 s. |
| Linux native release | same | PASS: 307 + 2 + 8; library duration 165.29 s. Includes all 28 purchasing-hub integration cases in each profile. |
| Desktop browser → native purchasing | same | PASS: real SQLCipher bridge; supplier create/edit/archive/restore, PO submit/approve, damaged receiving, invoice variance, partial payment, return, replay and role boundaries. Log at 19:32:20Z. No installed-app claim. |
| macOS native debug/release and unsigned bundle | 43751829398 / 132927270859 | PASS: 308 + 2 + 8 in each profile, library 236.44 / 106.04 s. Installed macOS GUI lifecycle: NOT RUN. |
| Windows native release/debug | 43751829408 / 132927270889 | PASS steps; logs show 308 + 2 + 8 in each profile, library 751.15 / 872.82 s. Whole workflow subsequently completed PASS. Downloaded artifact 14178569992, verified archive SHA-256 c4d7a9b1cfff4679c27b8020497c99c4169912d43f554cef1be22db26e8331d5, inspected installed-executable manifest and lifecycle JSON, and viewed the actual supplier screenshot. This is the original supplier smoke, not the new full purchasing lifecycle. |
| iPhone interactive | 43751829466 / 132930002425 | PASS: 6 native UI tests, 268.881 s. General navigation/session behavior, not purchasing lifecycle. |
| iPad interactive | 43751829466 / 132930002459 | PASS: 6 native UI tests, 204.971 s. General tablet behavior, not purchasing lifecycle. |
| Headless mobile | 43751829466 / 132927511423 | PASS, including purchasing protocol and UI runtime suites. Reference transport; not native purchasing-device evidence. |
| Other existing workflows | 43751829417, 43751829358, 43751829479 | Overall success reported for CI, Android review build and PostgreSQL replication; this report makes no additional suite-count claim without logs. |

## Reproduced defects and minimal fixes

The initial two failures were reproduced on #186 product source with new tests before any
product patch. Failing log: `phase22-evidence/native-before.log`.

1. **Recovery identity mismatch.** A mobile envelope could journal one operation
   ID while the authoritative supplier operation posted another. Reject unequal
   or missing request IDs as `InvalidDraft` before lookup or writes.
2. **Transient database failures became permanent refusals.** An injected SQLite
   write failure rolled back the payment, then `unknown_refusal` was journalled
   permanently. Only recognized business errors now become durable refusals;
   storage and unexpected errors propagate without a hub decision row. After
   removing the fault, the identical request commits once and replays identically.

3. **Reversed invoice allocations still counted as paid.** The separately published
   `ef913ce` finding was reviewed and independently reproduced here: replacing a
   fully reversed bank payment failed with `Overpayment` after reopen. Both the
   authoritative allocation check and mobile invoice snapshot now exclude payment
   rows that have append-only reversals. The existing payment/reversal history is
   retained. Added native replacement/replay and mobile outstanding regressions.
   Evidence: `phase22-evidence/reversal-before.log`.

Focused rerun: **31 passed, 0 failed** (9.78 s), including the original failures.
Later expanded purchasing run: **32 passed, 0 failed, 1 subprocess worker ignored**
(33.23 s). It adds disk-backed restart, encrypted purchasing backup/restore and
wrong-passphrase refusal, plus a real child-process exit after payment commit
and before journal insertion. Native payable, stock, payment counts and balanced
journals are asserted; receipt/invoice/payment/return remain authoritative.

## Additional executable validation

- Concurrent cashiers: PASS, one invoice and one stock deduction; the second
  stale-revision sale is refused. Duration 5.15 s.
- Schema verifier: PASS, 146 checks. Purchasing protocol verifier: PASS, 64 checks.
- Synthetic scale: **PASS**, 5,000 products / 10,000 customers / 50,000 invoices /
  1,000 suppliers / 5,000 draft purchase orders, all created through native APIs.
  395.10 s wall time; 212.01 invoice postings/s; peak RSS 140,333,056 bytes;
  sampled CPU 255.76 s; encrypted DB 181,522,432 bytes; backup 179,638,272 bytes.
  Thirty query bundles (catalogue, customer/supplier/order search, cashier state)
  had median 321.33 ms and max 490.10 ms. Reopen+unlock 1,203.89 ms.
  Exact counts, cash 500,000,000 paise, stock 450,000,000 milli-units, balanced
  journals, no debt from draft orders, restart and backup/restore all reconcile.
  This first run used #186 plus the working-tree patch, as recorded explicitly
  in `native-workload.json`; it is supplementary development-tree evidence,
  not a clean-commit claim. The published workflow records executable and source
  hashes for subsequent runs.
- Controlled purchasing session: **PASS**, 60.004 s of actual loop execution,
  125 payments, 25 forced process kills, final payable -12,500 paise, reconciled
  after each payment and exact replay. Evidence: `phase22-evidence/purchasing-soak.json`.
- Full local debug regression first attempt: **FAIL**, 309 passed / 2 failed / 7
  ignored. Two subprocess parents could not launch their executable (ENOENT)
  because this session rebuilt/replaced the test binary while they were running.
  This is a test-orchestration error. The complete sequential rerun passed:
  **312 library + 2 SQLCipher compatibility + 8 native command-security tests**,
  zero failures, 8 ignored workers/workloads. Library duration 241.01 s;
  compatibility 4.34 s; security 11.06 s. Original failures are retained.

After the additional reversal fix, the affected native purchasing/migration/
recovery tests passed **50 tests, 0 failed, 1 subprocess worker ignored** in
24.06 s. The Windows release identity verifier passed 40 checks.

Full release-profile validation of **published c5eb40b57c2aca7147cb2122c8487a3f43099544**:
**314 library + 2 SQLCipher compatibility + 8 native security passed**, zero
failures; 8 deliberate workers/workloads ignored. Library execution 138.90 s,
compatibility 0.84 s, security 2.03 s; compilation took 2m19s separately.
Evidence: `phase22-evidence/regression-release.log`.

The first new CI run found a copy-verifier false negative for dynamic purchasing
labels. Root cause: its token vocabulary retained the source closing quote in
`Approved'`, `Received'` and `Closed'`. Trimming delimiter quotes fixes the
analysis; the supplier fixture ID uses the existing reviewed fixture-data map.
422 expectations pass locally, and an injected stale “Make this PC yours.”
expectation still fails closed. The older scale script also mislabeled Windows
results as Linux; its metadata now reports `platform.platform()`. Neither change
alters product code or removes a financial assertion.

Local environment: Debian 13.6, Linux x86_64, Rust 1.100.0. Rust was successfully
installed in this session; there is no remaining local Rust-toolchain blocker.
Development-tree runs identify #186 plus the hardening diff; they must not be
mistaken for unmodified #186 results. CI will record the published hardening SHA.

## Installed acceptance extension and remaining gates

`check-native.py` now drives the actual installed Windows release application
through supplier creation/archive/restore; draft → submit → approve; partial
receiving with damaged goods; invoice variance; bank payment; supplier-credit
return; remaining receipt; close; forced restart; purchasing-data encrypted
backup/restore; and same-version reinstall preservation. Native UI statement
assertions reconcile **7,500 + 500 - 3,000 - 2,500 + 10,000 = 12,500 paise**.
This new extension is **NOT RUN** until the Windows CI runner executes it.
Python syntax verification is not installed acceptance.

Published release workload on c5eb40b also passed: **112.78 s**, 864.90 invoice
postings/s, median/max query bundle 92.34/129.51 ms, reopen+unlock 171.10 ms,
peak process RSS 186,658,816 bytes and sampled CPU 112.27 s. Test executable
SHA-256: `8fcf1f068c31440139c33b3dd161f6673fab75831ab5735ab1cf4e65bc63abdd`.
The only uncommitted files at its start were the copy verifier and old scale
metadata script; all Rust source matches c5eb40b and per-file hashes are retained.
Matched closed-file schema-v23 database growth: 974,848 → 181,522,432 bytes
(180,547,584 bytes), measured without double-counting the WAL.

The browser workflow now executes the full requested native dataset and a timed
crash/replay session, captures CPU/RSS, elapsed time, database growth, query
latency and throughput, and uploads the outputs with its existing artifacts.
No financial assertion was removed or weakened. Unmodified successful mobile
simulator jobs are not being rerun by these desktop/native path changes.

Still NOT RUN: native iPhone/iPad purchasing lifecycle against the real desktop
hub; installed macOS purchasing GUI; physical devices/LAN/TLS; physical power
loss; multi-hour soak; workloads above the product's 5,000-product ceiling.
Unsigned CI installers are engineering test artifacts, not consumer releases.
No merge, release or production deployment is authorized or performed.

Publication uses the connected GitHub API because terminal Git has no push
credentials. Another hardening branch named `hardening/phase22-correct-stack`
was discovered at `3bb6dc35750eed66e4fc1fd5fab9191e05e1d37e` during publication.
It was inspected and left untouched; this isolated branch avoids overwriting
that separately published work.
