# Phase 5 — Final Financial Integrity Remediation (IV-NEW-001 / P5-ADV-007)

**Status: IMPLEMENTED AND REGRESSION-VERIFIED. NOT CLOSED.**
**This report does not declare GO.** The finding stays open until the independent
verification agent reproduces the correction from a clean checkout.

| Item | Value |
|---|---|
| Branch | `arena/76ac88ca-sornio` |
| Implementation base | `d79a6e89fd7590c2806efd2d9bd2d46d3dada537` |
| Independent audit commit | `96eb330049c4f8409fea7b9051d5776629a15cb8` |
| `main` baseline | `1cc5c798d1eada9a16463213b0776c01e99d36f9` — **untouched, not merged** |
| Finding addressed | IV-NEW-001 (a.k.a. P5-ADV-007), duplicate sale journal |
| Prior verdict | NO-GO (`phase5-independent-remediation-verification.md`) |
| Verdict after this change | **Still NO-GO** — pending independent reproduction |

---

## 1. The vulnerability, reproduced independently

The attack was **not** dismissed as unrealistic. It was reproduced from a clean
`git archive` of `d79a6e8` in a separate filesystem workspace, using only the
public production API to create a legitimate sale, then a plain SQL `INSERT` to
duplicate that sale's journal legs — an operation the append-only triggers
explicitly permit.

**Exact ₹4,250 scenario, before the fix** (`phase5-final-financial-evidence/ba-before.txt`):

```
BA01 AFTER corruption : [("cash", 4250), ("receivables", -4250), ("cash", 4250), ("receivables", -4250)]
BA01 cash=8500 receivables=-8500 zero_sum=0
BA01 violations() => []
BA01 verify()     => Ok(())
BA01 PRODUCTION RESTORE => Ok(".../sornio-before-restore-5f88951b....sorniobackup")
BA01 invoices before=1 after=1 fence=false
BA01 VERDICT: CORRUPTED BACKUP ACCEPTED (defect present)
```

Cash inflated ₹4,250 → ₹8,500 and receivables −₹4,250 → −₹8,500, while the ledger
stayed perfectly zero-sum, `violations()` returned an empty vector, `verify()`
returned `Ok(())`, and the **production `restore()` committed the corruption**.

**Same probe, after the fix** (`phase5-final-financial-evidence/ba-after.txt`):

```
BA01 AFTER corruption : [("cash", 4250), ("receivables", -4250), ("cash", 4250), ("receivables", -4250)]
BA01 cash=8500 receivables=-8500 zero_sum=0
BA01 violations() => ["retail sale journal disagrees with recorded cash payments: ba-sale",
                      "retail sale journal is not exactly one posting set: ba-sale"]
BA01 verify()     => Err(FinancialInconsistency)
BA01 PRODUCTION RESTORE => Err(FinancialInconsistency)
BA01 invoices before=1 after=1 fence=false
BA01 VERDICT: CORRUPTED BACKUP REJECTED (defect fixed)
```

The probe source is preserved verbatim as
`phase5-final-financial-evidence/ba_probe.rs.txt` so the comparison is replayable.
It asserts nothing, so the identical file runs against both trees.

---

## 2. Root cause trace

### 2.1 How a sale is created and posted

| Stage | Location | Behaviour |
|---|---|---|
| Retail request | `payments.rs` `prepare_retail` / `post_retail` | `Request { operation_id, action: Action::Sale { invoice, payments } }` |
| Invoice row | `billing.rs:255–283` | Builds `Invoice { subtotal_paise, tax_paise, total_paise, tax_basis_points, tender, customer_id }`, serialises to JSON, `INSERT INTO local_invoices(sequence,id,request,payload)` at `:277` |
| Invoice → journal | `billing.rs:349` calls `payments::invoice_posted` | `invoice_posted` defined at `payments.rs:571` |
| **Sale journal legs** | **`payments.rs:639`** | `journal(db, &i.id, None, &[("cash", cash), ("receivables", -cash)])` — retail tender only |
| Journal writer | `payments.rs:309` `fn journal`, `INSERT` at `:324` | Guards `sum == 0`; **omits zero-valued legs entirely** |
| Activity row | `local_retail_activity` | One row, `kind='invoice'`, `operation_id UNIQUE` |

`cash` is the sum of the invoice's **cash** payment parts. A digital-only
(UPI/card) sale therefore writes **no journal legs at all** and its activity
amount is `0`. This was measured empirically, not assumed.

### 2.2 Operation identifiers and journal relationships

* The journal's `operation_id` **is** the invoice id for a sale.
* `payments-schema.sql:10` — `CREATE INDEX retail_operation_journal ON local_retail_journal(operation_id);` — **non-unique**. Nothing limits how many legs an operation may carry.
* `local_retail_activity.operation_id` is `UNIQUE`, so the activity row cannot be duplicated — but the journal can.
* `local_retail_outbox.operation_id` is `UNIQUE` (`payments-schema.sql:21`).
* Append-only triggers (`payments.rs:1737–1756`, 14 retail tables × UPDATE/DELETE; `billing.rs:134–147`, 5 billing tables) block `UPDATE` and `DELETE` but **permit `INSERT`**. Duplication is therefore reachable on disk without defeating any trigger.
* Other `journal` callers — `payments.rs:1347` (ManualMatch), `:1372` (ReverseMatch), `:1425` (refund manual match) — each use **their own** operation id, so sale legs are never shared with them. This was checked to rule out false positives.

### 2.3 Why restore verification missed it

`recovery/financial.rs` §4 contained only:

1. per-operation zero-sum imbalance;
2. journal-without-activity orphan detection;
3. **return-only** revenue/tax reconciliation against `local_retail_returns`.

Duplicating **both** legs of a sale:

* keeps `SUM(amount) = 0` → check 1 passes;
* leaves the activity row present → check 2 passes;
* touches no return rows → check 3 is not applicable.

There was **no sale-side source-record-to-journal relationship at all**. That is
the whole defect.

### 2.4 Why return duplication *was* caught but sale duplication was not

Returns reconcile their revenue/tax legs against the stored
`local_retail_returns` totals, so doubling the legs breaks that equality. Sales
had no equivalent anchor — the recorded cash payments in
`local_retail_payments` were never compared to the journal. The asymmetry, not a
missing balance check, is the root cause.

### 2.5 The invariant chosen — and the one explicitly rejected

A blanket `UNIQUE(operation_id, account)` was **considered and rejected**. It is
unsafe: a legitimate multi-part return posts one journal batch **per refund
part**, so accounts repeat within one operation. Measured on a valid two-part
cash refund:

```
fin08 repeated (operation,account) groups in VALID history = 2
fin08 violations on valid multipart history: []
```

A unique index would have rejected that valid history. **No schema change was
made.**

The invariant actually enforced is a **combination**, scoped to sales only:

1. **Source-record-to-journal amount relationship** — Σ cash legs equals Σ recorded cash payment parts, and Σ receivables legs equals its negation.
2. **Operation-level idempotency (cardinality)** — exactly one posting set per sale operation: one `cash` leg and one `receivables` leg when Σ cash ≠ 0, otherwise zero of each.
3. **Account/domain restriction** — a sale operation may carry only `cash` and `receivables`, with `customer_id IS NULL`.
4. **Source existence** — a `kind='invoice'` activity row must reference an existing `local_invoices` row.

Rule 2 is what catches the adversarial variant that halves each leg to keep the
sums correct — rule 1 alone would miss it. Rules are scoped
`json_extract(i.payload,'$.tender')='retail'`, so legacy payloads without a
`tender` field evaluate to `NULL` and are exempt rather than falsely rejected.

---

## 3. Exact code changes

Total: **86 added lines across 2 existing files, plus 1 new test file. No
deletions. No schema change. No migration. No change to posting semantics.**

```
 packages/local-store/src/recovery.rs           |  3 +
 packages/local-store/src/recovery/financial.rs | 83 ++++++++++++++++++++++++++
 2 files changed, 86 insertions(+)
 packages/local-store/src/recovery/final_financial_tests.rs   (new, 740 lines)
```

### 3.1 `packages/local-store/src/recovery/financial.rs`

Four checks appended to `violations()` immediately after the existing
return-totals check, before §5 (outbox idempotency). Violation labels and line
numbers in the committed file:

| Line | Label |
|---|---|
| 346 | `retail sale journal disagrees with recorded cash payments` |
| 366 | `retail sale journal is not exactly one posting set` |
| 378 | `retail sale journal has unexpected account or customer` |
| 388 | `retail sale activity without source invoice` |

The module doc-comment gained the two new relationship bullets and a paragraph
under *Deliberate limitations* explaining the sale/return asymmetry and why the
cardinality rule is sale-scoped.

Because `violations()` feeds `verify()`, and `verify()` is already called at
`recovery.rs:1457` **inside the restore transaction, before the completion
transition**, the new rules reject a corrupted backup **before commit**. The
import rolls back; the original database and the recovery fence survive
untouched. No new call site was needed.

### 3.2 `packages/local-store/src/recovery.rs`

Three lines, test-module wiring only:

```rust
#[cfg(test)]
#[path = "recovery/final_financial_tests.rs"]
mod final_financial_tests;
```

### 3.3 `packages/local-store/src/recovery/final_financial_tests.rs` (new)

16 adversarial tests, 740 lines. Helpers: `v()`, `legs()`, `duplicate_journal()`,
`retail_sale()`, `sale_4250()`, `restore_round_trip()`, `assert_rejected()`,
`prod_verify()`, and `mutate_without_guard()`.

**Harness note worth recording.** `recovery::validate` compares the archive
schema against a freshly migrated reference store, and `fingerprint` →
`digest_inner` (`recovery.rs:710–713`) hashes the SQL of every `sqlite_schema`
row **including triggers**. Dropping even one append-only trigger therefore makes
the archive fail as `InvalidBackup` at export/preview — *before* the financial
gate runs, which would have produced a false pass. `mutate_without_guard()`
drops the guard, injects the corruption, then **re-creates the byte-identical
trigger SQL**, so the schema stays intact and the **financial verifier** is
provably the component doing the rejecting.

---

## 4. Adversarial tests — all 10 required scenarios, via the production restore API

Every corruption test calls the real `export` → `preview` → `restore` sequence,
not just the standalone verifier. `restore_round_trip()` additionally proves the
original database is preserved (invoice count delta 0, fence not tripped).

| # | Test | Scenario | Result |
|---|---|---|---|
| 1 | `fin01_duplicate_sale_journal_4250_scenario` | **Exact previously failing ₹4,250 case** | `Err(FinancialInconsistency)`; both sale labels |
| 2 | `fin02_missing_sale_journal` | All sale legs deleted | `Err(FinancialInconsistency)` |
| 3 | `fin02b_partial_missing_sale_journal` | Receivables leg deleted | `Err(FinancialInconsistency)`; amount + imbalance |
| 4 | `fin03_incorrect_cash_posting` | Cash 4250→4950, offset to stay balanced | `Err(FinancialInconsistency)`; amount label |
| 5 | `fin04_incorrect_receivables_posting` | Receivables → −9999, offset | `Err(FinancialInconsistency)`; amount label |
| 6 | `fin05_incorrect_revenue_posting_on_sale` | Balanced revenue/refund_payable pair on a sale | `Err(FinancialInconsistency)`; unexpected-account |
| 7 | `fin06_incorrect_tax_posting_on_sale` | Balanced tax_payable pair on a sale | `Err(FinancialInconsistency)`; unexpected-account |
| 8 | `fin06b_taxed_sale_is_accepted_and_tax_tamper_detected` | Valid 18% sale accepted; tax leg tampered | valid `[]`; tampered `Err(FinancialInconsistency)` |
| 9 | `fin07_duplicate_operation_with_altered_payload` | API op-id reuse **and** on-disk duplicate outbox row | API `Err(OperationConflict)`; on-disk detected + schema gate `InvalidBackup` |
| 10 | `fin07b_duplicate_with_halved_amounts_keeps_sums` | Duplicate with halved legs (sums correct) | `Err(FinancialInconsistency)`; **only** cardinality label fires |
| 11 | `fin08_legitimate_multipart_return_accepted` | Valid 2-part cash refund, accounts repeat | `[]` and **restore `Ok`** |
| 12 | `fin09_multiple_legitimate_sales_accepted` | 4 valid sales incl. UPI-only (zero legs) | `[]` and **restore `Ok`** |
| 13 | `fin09b_duplicate_one_of_many_sales_rejected` | 1 of 3 sales duplicated | `Err(FinancialInconsistency)` |
| 14 | `fin10_historical_legacy_payload_compatibility` | Legacy `'{}'` payload | no sale labels; orphan still caught |
| 15 | `fin10b_valid_history_restore_is_not_rejected` | Healthy history | **restore `Ok`** |
| 16 | `fin11_synthetic_sale_without_invoice_rejected` | Activity + balanced journal, no invoice | `Err(FinancialInconsistency)`; without-source-invoice |

Mapping to the 10 mandated scenarios: duplicate sale journal → 1, 10, 13; missing
sale journal → 2, 3; incorrect cash → 4; incorrect receivables → 5; incorrect
revenue → 6; incorrect tax → 7, 8; duplicate operation with altered payload → 9;
legitimate multi-part return → 11; multiple legitimate sales → 12; historical
compatibility → 14, 15.

**Result: 16 passed / 0 failed / 0 ignored**
(`phase5-final-financial-evidence/final-financial-tests.txt`).

### 4.1 The tests genuinely fail on the pre-fix code

The identical test file was copied onto a clean `git archive` of `d79a6e8`
(`grep -c "retail sale journal"` on that tree's `financial.rs` = **0**) and run
with a separate `CARGO_TARGET_DIR`:

```
test result: FAILED. 6 passed; 10 failed; 0 ignored; 0 measured; 244 filtered out
EXIT_CODE=101
[fin01] verifier violations: []
[fin01] expected a violation containing "retail sale journal", got []
```

The 10 failures are exactly the corruption-detection tests (fin01, fin02, fin02b,
fin03, fin04, fin05, fin06, fin07b, fin09b, fin11). The 6 passes are the
valid-history and API-guard tests, which correctly passed before the fix too —
confirming the fix adds detection without changing legitimate behaviour.
Evidence: `before-fix-reproduction.txt`.

---

## 5. Regression results — no skipped tests, no weakened assertions

All run on the final tree, `--locked`, `RUST_TEST_THREADS=2`.

| Gate | Result | Exit | Evidence |
|---|---|---|---|
| Full Rust suite (`--all-targets`) | **253 passed / 0 failed / 7 ignored** + doc-tests **7 / 0** | 0 | `full-suite-final.txt` |
| New adversarial financial tests | **16 / 0 / 0** | 0 | `final-financial-tests.txt` |
| Security governance (`cashier_review_bridge`) | **7 / 0** | 0 | `security-governance.txt` |
| Recovery group | **75 / 0 / 3** | 0 | `recovery-tests-clean.txt` |
| Financial corruption (`rem_r3_*`) | **10 / 0** | 0 | `financial-corruption.txt` |
| Migration | **14 / 0** | 0 | `migration-tests.txt` |
| Five-phase crash consistency | **1 / 0** | 0 | `crash-consistency.txt` |
| **PostgreSQL durable deduplication** | **36 / 0** | 0 | `postgres-durable.txt` |
| Replication governance harness | **129 checks passed** | 0 | `replication-harness.txt` |
| Cloud TypeScript (`--noEmit` project + `--strict` emit) | **0 errors, both** | 0 | `cloud-tsc.txt` |
| Cloud behavioural dedup contract | **18 / 0** | 0 | `cloud-behavioral.txt` |
| `cargo fmt --check` | clean | 0 | `fmt.txt` |
| `cargo clippy --all-targets` | 0 errors; 17 lib + 2 test warnings, **all pre-existing, 0 in changed files** | 0 | `clippy.txt` |

Baseline was **237 / 0 / 7**; now **253 / 0 / 7** — the delta is exactly the 16 new
tests. Recovery went 59 → 75, the same +16.

**Ignored-test accounting (unchanged from baseline, zero added):**

* 5 are `#[ignore = "subprocess crash worker …"]` in `inventory_recovery_tests.rs:291`, `payments_tests.rs:1452`, `phase3_reliability_tests.rs:847`, `recovery/phase5_tests.rs:692`, `recovery/tests.rs:418`. They are **not skipped coverage** — their parent tests spawn them as subprocesses, and those parents ran and passed.
* 2 are `#[ignore]` manual pipeline stages in `replication_matrix_tests.rs:391,498` (`native_sqlcipher_export_pipeline`, `native_sqlcipher_apply_https_acks`). They require an external `SORNIO_NATIVE_OUTBOX_DIR` fixture produced by a separate native-to-HTTPS run. Pre-existing, identical at baseline, **not exercised here** — recorded honestly rather than claimed.

`grep` confirms **no `#[ignore]` was added** by this change and no assertion was
relaxed. Two clippy warnings initially introduced by the new test file
(`unused_mut`, `needless_range_loop`) were **fixed**, not suppressed.

### 5.1 PostgreSQL durable path — actually executed

A disposable PostgreSQL **16.2** server was provisioned (pip `pgserver`), bound to
`127.0.0.1:55432`, database `sornio_verify` dropped and recreated for the run. No
production credentials or data. The real migration SQL was applied and the
compiled TypeScript ingest path exercised, including:

```
CONCURRENT results: [4 × {"operationId":"v-bill-1","cursor":"3","duplicate":true}]
PASS: all 4 concurrent duplicate ingests succeed (no deadlock/serialization failure)
PASS: concurrent duplicates still produce exactly ONE event row (got 1, want 1)
PASS: concurrent duplicate ingestion does not double-count outstanding (5000, want 5000)
CONCURRENT NEW results: [{"cursor":"7","duplicate":false}, 3 × {"error":"DUPLICATE_SEQUENCE"}]
PASS: replayed invoice appears exactly once in the durable snapshot (got 1, want 1)
DURABLE POSTGRES VERIFY: 36 passed, 0 failed
```

Success was **not** inferred from TypeScript compilation.

---

## 6. What was deliberately not changed

* **No schema change, no new index, no migration.** `user_version` stays 9. A blanket `UNIQUE(operation_id, account)` was rejected as unsafe (§2.5).
* **No change to posting logic.** `payments.rs` and `billing.rs` are untouched; legitimate multi-part returns, UPI-only sales, mixed-tender sales and taxed sales post exactly as before.
* **No new restore call site.** The existing in-transaction gate at `recovery.rs:1457` is reused, so rejection-before-commit and original-database preservation are inherited, not re-implemented.
* **Legacy payloads exempt, not rejected.** Tender-scoped predicates degrade to `NULL` for field-less historical payloads.

---

## 7. Remaining blockers

1. **Independent reproduction outstanding — the finding is NOT closed.** This report is the implementer's account. Per the standing instruction, the independent verification agent must reproduce the correction from a clean checkout of the commit below before IV-NEW-001 / P5-ADV-007 can close. **No GO is declared.**
2. **Windows acceptance still impossible.** No Windows machine, no `/mnt/c`, WSLInterop, MSVC/mingw, `cargo-tauri`, webkit2gtk, rustup or Wine in this environment. All results here are Linux. Windows acceptance remains an explicit release blocker and has **not** been substituted.
3. **P5-ADV-008 still open** (raw-SQL lockout reset while fenced). Unchanged by this work; previously accepted only under a documented threat model, since `Store::open` returns `RecoveryCorrupt` and none of the 50 Tauri commands accept raw SQL.
4. **P5-ADV-010 still open** (malformed publisher generations accepted by the generation-only check). Unchanged.
5. **P5-ADV-011 still open** (style). Unchanged.
6. **`clippy -D warnings` still exits 101** on 21 pre-existing lines outside the remediation files. The project gate is plain clippy (exit 0), which passes. Not introduced here.
7. **2 manual replication pipeline stages not exercised** (§5), pre-existing.
8. **Residual scope of the new invariant.** The sale-side rules reconcile against `local_retail_payments` and `local_invoices`. An attacker who corrupts the *source* payment rows **and** the journal consistently would satisfy these relationships; that class is bounded by the append-only triggers on the source tables and by the structural/schema gates, but it is not claimed to be closed by this change.

---

## 8. Evidence and preservation

New evidence directory: **`docs/reviews/phase5-final-financial-evidence/`** — 19
files, including every gate log, the before/after probe outputs, the pre-fix
failure run, and verbatim copies of the new test file and probe
(`final_financial_tests.rs.txt`, `ba_probe.rs.txt`). Logs use `.txt` because
`.gitignore` excludes `*.log`.

**All previous reports and evidence preserved unchanged:**

| Artifact | Files |
|---|---|
| `phase5-independent-adversarial-audit.md`, `phase5-adversarial-findings.json` | — |
| `phase5-adversarial-evidence/` | 12 |
| `phase5-remediation-report.md`, `phase5-cloud-dedup-contract.md` | — |
| `phase5-remediation-evidence/` | 20 |
| `phase5-independent-remediation-verification.md` | — |
| `phase5-independent-verification-evidence/` | 37 |

---

## 9. Verdict

**NO-GO.**

The duplicate-sale-journal defect is corrected and the correction is demonstrated
at the production restore boundary, with the exact ₹4,250 scenario rejected, all
16 adversarial tests passing, the same tests failing 10/16 on the pre-fix tree,
and the full regression green including real PostgreSQL durable deduplication.
The goal — that a mathematically balanced but financially corrupted database
cannot pass production recovery verification — is met for the demonstrated attack
class.

The verdict remains **NO-GO** because independent reproduction has not yet
happened and the Windows, 008, 010 and 011 blockers above are still open. Closure
requires the independent verification agent, not this report.
