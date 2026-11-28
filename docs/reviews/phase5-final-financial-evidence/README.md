# Phase 5 final financial integrity remediation — evidence

All logs are `.txt` because the repository `.gitignore` excludes `*.log`.
Every gate below was run on the final working tree that became the remediation
commit, on Linux, with `--locked` and `RUST_TEST_THREADS=2`.

| File | What it proves | Outcome |
|---|---|---|
| `ba-before.txt` | Exact ₹4,250 duplicate-sale-journal probe on **pre-fix** `d79a6e8` (separate `git archive` tree, separate target dir) | corrupted backup **ACCEPTED**, `violations()=[]`, `verify()=Ok`, `restore()=Ok` |
| `ba-after.txt` | Identical probe on the **fixed** tree | corrupted backup **REJECTED**, `restore()=Err(FinancialInconsistency)`, original DB preserved |
| `ba_probe.rs.txt` | Verbatim probe source (asserts nothing, so it runs on both trees) | — |
| `before-fix-reproduction.txt` | The **same 16 new tests** run against pre-fix `d79a6e8` | **6 passed / 10 failed**, EXIT 101 — the 10 failures are exactly the corruption-detection tests |
| `final-financial-tests.txt` | The 16 new adversarial tests on the fixed tree, via the real `export`→`preview`→`restore` API | **16 / 0 / 0**, EXIT 0 |
| `final_financial_tests.rs.txt` | Verbatim copy of the new test file | — |
| `full-suite-final.txt` | Authoritative full Rust suite, `--all-targets` | **253 / 0 / 7** + doc-tests **7 / 0**, EXIT 0 |
| `recovery-tests-clean.txt` | Recovery group after the temporary probe was removed | **75 / 0 / 3**, EXIT 0 |
| `financial-corruption.txt` | Pre-existing `rem_r3_*` financial corruption tests | **10 / 0**, EXIT 0 |
| `security-governance.txt` | `cashier_review_bridge` governance example | **7 / 0**, EXIT 0 |
| `migration-tests.txt` | Migration suite | **14 / 0**, EXIT 0 |
| `crash-consistency.txt` | Five-phase crash consistency | **1 / 0**, EXIT 0 |
| `postgres-durable.txt` | **Real disposable PostgreSQL 16.2**, real migration SQL, concurrent duplicate ingestion + rollback | **36 / 0**, EXIT 0 |
| `replication-harness.txt` | `scripts/verify-replication.mjs` | **129 checks passed**, EXIT 0 |
| `cloud-tsc.txt` | Cloud TypeScript: project `--noEmit` **and** `--strict` emit | both **0 errors** |
| `cloud-behavioral.txt` | In-memory cloud dedup contract | **18 / 0**, EXIT 0 |
| `clippy.txt` | `cargo clippy --all-targets` | EXIT 0; 17 lib + 2 test warnings, all pre-existing, **0 in changed files** |
| `fmt.txt` | `cargo fmt --check` | EXIT 0 |

## Notes on integrity

* `before-fix-reproduction.txt` intentionally exits **101**. That is the required
  negative control: it demonstrates the new tests fail without the fix.
* The pre-fix tree was produced with `git archive d79a6e8` into a separate
  filesystem workspace and built with its own `CARGO_TARGET_DIR`, so no binary
  from the fixed tree could be reused.
* `recovery-tests-clean.txt` supersedes an earlier recovery-group run that also
  contained a temporary `ba_probe` test. The probe was removed before the final
  commit; the clean count is 75 (baseline 59 + 16 new).
* The 7 ignored tests are unchanged from baseline and none were added by this
  change: 5 are subprocess crash workers exercised by their passing parent
  tests, 2 are manual native-to-HTTPS pipeline stages requiring an external
  `SORNIO_NATIVE_OUTBOX_DIR` fixture (not exercised here).
* PostgreSQL success was measured by executing SQL against a live server, never
  inferred from TypeScript compilation.
