# Phase 3 — Reliability and release gate

**Verdict: NO-GO**

Sornio is not safe to merge, not safe for a real-shop pilot, and not safe for production cloud synchronization. Native SQLCipher posting, a CI HTTPS ingest into real PostgreSQL, and a Windows installer lifecycle exist. They are not a production release.

This document is an independent gate review. Green checks are evidence of the checks that ran, not of production readiness.

`productionSyncEnabled` remains `false`. `SCHEMA_VERSION` remains `12`. PR #143 stays draft. Founder merge only.

---

## A. Executive verdict

**NO-GO**

| Decision | Status | Why |
| --- | --- | --- |
| Safe to continue development | Yes | Native financial posting and the SQLCipher → TLS → PostgreSQL pipeline are real. |
| Safe for founder code review | Yes | Draft PR #143 is the review surface. |
| Safe to merge | **No** | Remaining Windows artifact independence, live-sync disablement, and this commit’s new tests must finish on the actual head. |
| Safe for controlled internal testing | Conditional | Offline desktop review installer on a GitHub-hosted Windows runner only. |
| Safe for real-shop pilot | **No** | Live sync is off; cloud is not a second ledger; shopkeeper UX for interrupted operations is incomplete. |
| Safe for production cloud synchronization | **No** | `productionSyncEnabled=false` by design. |
| Safe for public mobile distribution | **No** | Companion is demo/offline. Do not submit stores. |

---

## B. Repository state

Recorded at review start, then updated for this commit.

| Field | Value |
| --- | --- |
| Main SHA | `005f27a7702b37916ae517b7f37360c0e9ce436f` |
| Working branch | `arena/5ed2bd28-sornio` |
| PR | [#143](https://github.com/uddieee33-blip/Sornio/pull/143) open, **draft**, `MERGEABLE` / `CLEAN` |
| Previous verified head | `4747cdabb528cc6bf5cee4547ccb7d179962aa4d` |
| This review’s code | see git log on this branch after `test(local-store): Phase 3 financial reliability matrix` |
| Base | `main` |
| Schema | `SCHEMA_VERSION = 12` |
| Mobile live sync | `apps/mobile/app.json` `extra.productionSyncEnabled: false` |

Do not merge without founder authorization. Do not force-push.

### CI on `4747cda` (previous head)

Every required GitHub check completed **SUCCESS** on SHA `4747cda`:

| Workflow | Run ID | Result |
| --- | --- | --- |
| Replication PostgreSQL | [41612920372](https://github.com/uddieee33-blip/Sornio/actions/runs/41612920372) | SUCCESS |
| Workspace browser review | [41612920118](https://github.com/uddieee33-blip/Sornio/actions/runs/41612920118) | SUCCESS |
| Windows local workspace | [41612920113](https://github.com/uddieee33-blip/Sornio/actions/runs/41612920113) | SUCCESS |
| CI | [41612920213](https://github.com/uddieee33-blip/Sornio/actions/runs/41612920213) | SUCCESS |
| Mobile companion | [41612920127](https://github.com/uddieee33-blip/Sornio/actions/runs/41612920127) | SUCCESS |
| Android review package | [41612920111](https://github.com/uddieee33-blip/Sornio/actions/runs/41612920111) | SUCCESS |

Supabase Preview was SKIPPED. Vercel preview SUCCESS. Those are not financial gates.

CI on **this** commit must be recorded in section M after the workflows finish. Do not copy `4747cda` results onto a newer SHA.

---

## C. Financial correctness

### Split-credit `unclaimed()` change

The previously failing sale was:

* Invoice ₹1,000
* Cash ₹600
* Customer credit ₹400

`post_split_credit` used to call `payments::unclaimed()`, which treats `local_retail_pending` as `OperationConflict`. `prepare_retail` already owns that pending row for the in-flight sale. The credit leg therefore aborted after cash/UPI/card parts had been written in the same transaction — and the transaction rolled back, so the export never produced envelopes. That was a correctness bug in the conflict check, not a ledger leak: SQLite rolled back. The shopkeeper would have seen a failed sale, not ₹600 cash without ₹400 credit. The bug still blocked a supported payment class.

**Fix (kept):** do not call `unclaimed()` from `post_split_credit`.

**Tightening in this review:** still reject `local_retail_ops` and `local_retail_canceled` for the same invoice id. That is not a restore of `unclaimed()`. In-flight `local_retail_pending` remains allowed.

### Why the remaining checks are sufficient on current call paths

`post_split_credit` is reached only from `billing::post_into` when `tender == Retail` and a credit part exists. `post_invoice` refuses `Tender::Retail`. `post_retail` is the only caller that passes payment parts.

Before `post_into`:

1. `post_retail` replays `local_retail_ops` (exact retry, conflict on different payload).
2. `available()` rejects existing invoices, customer ops/pending/canceled, checkout canceled, and retail canceled.
3. Pending request bytes must match.
4. `sale_clear()` allows only one prepared retail sale at a time.

Inside `post_split_credit`:

1. Amount in `1..=MAX_VALUE` and `<= invoice.total_paise`.
2. Customer ops/pending/canceled for this invoice id conflict.
3. Completed or canceled retail ops for this invoice id conflict.
4. Credit-limit check uses integer paise against the customer subledger.
5. Unique index `credit_sale_once` on `local_credit_entries(invoice_id) WHERE kind='sale'`.

`post_sale` (full credit tender) still calls `unclaimed()`. Do not copy the split-credit skip onto that path.

All of the above runs inside one Immediate SQLite transaction in `post_retail`. Credit-limit failure after invoice insert still rolls back stock, ledger, payments and outbox.

### Supported allocations (integer paise)

Rice fixture in the new matrix: ₹100 / kg, 10 kg = ₹1,000 = 100000 paise.

| Allocation | Cash | Digital pending | Customer debt |
| --- | ---: | ---: | ---: |
| ₹1,000 cash | 100000 | 0 | 0 |
| ₹1,000 UPI | 0 | 100000 | 0 |
| ₹1,000 card | 0 | 100000 | 0 |
| ₹1,000 credit | 0 | 0 | 100000 |
| ₹600 cash + ₹400 UPI | 60000 | 40000 | 0 |
| ₹600 cash + ₹400 credit | 60000 | 0 | 40000 |
| ₹250 cash + ₹750 card | 25000 | 75000 | 0 |
| ₹300 cash + ₹300 UPI + ₹400 credit | 30000 | 30000 | 40000 |

Rejected without partial effects: empty, negative, zero, unknown method, credit without customer, customer without credit, two credit parts, overpayment, underpayment, duplicate payment ids, missing customer, credit-limit exceeded.

Digital payments stay `externally_verified = false`. Manual statement match is not provider verification.

---

## D. Test matrix

Statuses:

* **PASS** — executed on the named SHA with assertions completing.
* **PENDING** — added in this review; not PASS until CI on this SHA finishes.
* **UNTESTED** — no execution environment here.
* **BLOCKED** — cannot be executed with available hosts.

New automated tests live in `packages/local-store/src/phase3_reliability_tests.rs` (`payments::phase3::*`). They are **PENDING** until the workflows on this commit complete.

### D1. Financial posting (new)

| ID | Risk | Scenario | Expected | Test | Env | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F-001 | P0 | ₹1,000 cash | cash 100000, 1 invoice, stock −10 kg | `financial_matrix_posts_supported_allocations_in_integer_paise` | native SQLCipher | PENDING |
| F-002 | P0 | ₹1,000 UPI | digital pending 100000, not credit | same | native | PENDING |
| F-003 | P0 | ₹1,000 card | digital pending 100000, not credit | same | native | PENDING |
| F-004 | P0 | ₹1,000 credit | customer debt 100000 | same | native | PENDING |
| F-005 | P0 | ₹600 cash + ₹400 UPI | split preserved | same | native | PENDING |
| F-006 | P0 | ₹600 cash + ₹400 credit | cash 60000, debt 40000, one invoice | same | native | PENDING |
| F-007 | P0 | ₹250 cash + ₹750 card | split preserved | same | native | PENDING |
| F-008 | P0 | ₹300 cash + ₹300 UPI + ₹400 credit | three-way | same | native | PENDING |
| F-009 | P0 | reopen after each of F-001–F-008 | same balances | same | native | PENDING |
| F-010 | P0 | outbox + stock movement exist | one stock row, one billing outbox | same | native | PENDING |
| F-011 | P0 | journals sum to zero | billing ledger 0, retail journal 0 | same | native | PENDING |
| F-012 | P0 | no `externallyVerified` | all payment rows false | same | native | PENDING |
| F-013 | P0 | empty payment | InvalidPayment, no rows | `financial_matrix_rejects_invalid_allocations_without_partial_effects` | native | PENDING |
| F-014 | P0 | negative amount | InvalidPayment | same | native | PENDING |
| F-015 | P0 | zero amount | InvalidPayment | same | native | PENDING |
| F-016 | P0 | unknown method `wallet` | InvalidPayment | same | native | PENDING |
| F-017 | P0 | credit without customer | InvalidPayment | same | native | PENDING |
| F-018 | P0 | customer without credit part | InvalidPayment | same | native | PENDING |
| F-019 | P0 | two credit parts | InvalidPayment | same | native | PENDING |
| F-020 | P0 | overpayment | post fails, snapshot unchanged | same | native | PENDING |
| F-021 | P0 | underpayment | post fails, snapshot unchanged | same | native | PENDING |
| F-022 | P0 | duplicate payment ids | InvalidPayment, snapshot unchanged | same | native | PENDING |
| F-023 | P0 | missing customer | CustomerMissing, snapshot unchanged | same | native | PENDING |
| F-024 | P0 | credit limit ₹300 vs ₹400 credit | CreditLimit, no stock move | same | native | PENDING |
| F-025 | P0 | rejection count cannot shrink to 0 | `assert_eq!(rejected, 12)` | same | native | PENDING |

### D2. Split-credit identity (new)

| ID | Risk | Scenario | Expected | Test | Status |
| --- | --- | --- | --- | --- | --- |
| S-001 | P0 | exact retry of ₹600+₹400 | one invoice, one debt row | `split_credit_reused_canceled_and_customer_ids_conflict` | PENDING |
| S-002 | P0 | same id, different split | OperationConflict | same | PENDING |
| S-003 | P0 | canceled retail id reused | OperationConflict | same | PENDING |
| S-004 | P0 | customer save operation id reused as sale | OperationConflict | same | PENDING |
| S-005 | P0 | other staff posts prepared split | CheckoutActive, no invoice | `second_staff_cannot_steal_a_prepared_split_sale` | PENDING |

### D3. Existing native financial tests (PASS on `4747cda`)

Windows `41612920113` and browser `41612920118` ran `cargo test --all-targets` successfully. Non-ignored tests below therefore **PASS** on `4747cda`. They are not automatically PASS on a later SHA.

| ID | Test | Domain |
| --- | --- | --- |
| E-001 | `payments::tests::split_cash_and_customer_credit_sale_posts_one_atomic_sale` | split ₹600+₹400 |
| E-002 | `payments::tests::split_sale_validation_credit_limit_and_atomicity_are_enforced_natively` | limit / unbalanced |
| E-003 | `payments::tests::split_sale_repayment_and_credit_return_reconcile_without_duplicates` | repayment + return |
| E-004 | `payments::tests::split_sale_uses_original_invoice_and_never_verifies_digital_payments` | mixed digital |
| E-005 | `payments::tests::changed_or_unbalanced_splits_and_forged_verification_are_refused_atomically` | forged verified |
| E-006 | `replication::replication_matrix_tests::native_financial_matrix_posts_seven_supported_sales` | seven-sale matrix |
| E-007 | `billing::reliability_tests::committed_sale_contains_complete_aggregated_records_and_replays_unchanged` | invoice completeness |
| E-008 | `billing::reliability_tests::cash_credit_and_zero_tax_ledgers_are_correct_per_invoice` | ledger |
| E-009 | `billing::reliability_tests::changed_operation_data_never_changes_committed_state` | idempotency |
| E-010 | `customers::tests::credit_limits_are_checked_inside_original_invoice_transaction` | credit limit |
| E-011 | `customers::tests::partial_full_repayments_and_general_ledger_balances_are_atomic_and_exact` | repayment |
| E-012 | `customers::tests::overpayment_changed_ids_and_stale_account_versions_never_mutate_history` | overpayment |
| E-013 | `payments::tests::manual_match_checks_amount_reference_and_reversal_retains_history` | manual match |
| E-014 | `payments::tests::duplicate_bank_reference_cannot_settle_two_payments_even_with_spacing` | settlement id |
| E-015 | `payments::tests::pending_payment_returns_cancel_receivables_without_fake_cash_or_bank_refunds` | pending return |
| E-016 | `payments::tests::cash_and_credit_customer_returns_keep_existing_ledger_totals_consistent` | returns |
| E-017 | `payments::tests::partial_returns_restore_exact_stock_and_round_cumulatively_to_original_total` | partial return |
| E-018 | `payments::tests::damaged_return_refunds_once_without_reintroducing_sellable_stock` | damaged |
| E-019 | `payments::tests::closing_variance_is_native_and_closed_drawer_blocks_late_atomic_sales` | drawer |
| E-020 | `payments::tests::settlement_history_and_exports_are_append_only_formula_safe_and_exact` | CSV |
| E-021 | `checkout` / billing zero-tax and cash paths | cash tender |
| E-022 | `customers::tests::accounting_corrections_are_append_only_balanced_and_reversible_once` | corrections |
| E-023 | `payments::tests::generated_split_returns_conserve_money_stock_and_closing` | proptest 32 |
| E-024 | `payments::tests::generated_invalid_split_and_mid_transaction_failure_never_partially_commit` | proptest 32 |
| E-025 | `payments::tests::generated_non_restock_returns_preserve_refund_limits_and_stock` | proptest 32 |

### D4. Concurrency

| ID | Scenario | Test | Status |
| --- | --- | --- | --- |
| C-001 | Two cashiers, last unit | `phase3::last_unit_inventory_race_never_oversells` | PENDING |
| C-002 | Three cashiers, two units | `phase3::three_cashiers_two_units_never_oversell` | PENDING |
| C-003 | Same invoice id, different payload | `phase3::same_invoice_id_concurrent_posts_once` | PENDING |
| C-004 | Concurrent credit toward a ₹500 cap | `phase3::concurrent_credit_limit_never_exceeds_customer_cap` | PENDING |
| C-005 | Two retail prepares | `phase3::two_retail_sale_prepares_serialize_at_pending` | PENDING |
| C-006 | Distinct parallel invoices | `payments::tests::concurrent_successful_invoices_receive_distinct_durable_numbers` | PASS `4747cda` |
| C-007 | Stock correction vs sale | `payments::tests::stock_correction_and_sale_race_never_commits_both_stale_intents` | PASS `4747cda` |
| C-008 | Refund vs repayment | `payments::tests::refund_and_repayment_race_conserves_cash_debt_and_damaged_stock` | PASS `4747cda` |
| C-009 | Competing returns | `payments::tests::competing_partial_returns_cannot_restore_or_refund_more_than_was_sold` | PASS `4747cda` |
| C-010 | Competing bank references | `payments::tests::competing_staff_cannot_match_one_bank_reference_to_two_allocations` | PASS `4747cda` |
| C-011 | Close vs sale | `payments::tests::concurrent_closing_and_sale_have_one_serialized_outcome` | PASS `4747cda` |
| C-012 | Racing distinct sales oversell | `billing::reliability_tests::racing_distinct_sales_cannot_oversell_or_duplicate_records` | PASS `4747cda` |
| C-013 | Last stock via LAN clients | `lan_authority` `two_native_clients_competing_for_last_stock_cannot_oversell` | PASS `4747cda` |
| C-014 | Simultaneous settlement retries | `payments::tests::simultaneous_exact_settlement_retries_post_once` | PASS `4747cda` |
| C-015 | Simultaneous collections | `customers::tests::simultaneous_collections_cannot_double_collect_a_stale_balance` | PASS `4747cda` |
| C-016 | Inventory requests across connections | `inventory_recovery` `exact_and_competing_inventory_requests_serialize_across_connections` | PASS `4747cda` |

### D5. Crash / fault injection

| ID | Checkpoint | Mechanism | Test | Status |
| --- | --- | --- | --- | --- |
| K-001 | Before commit (split ₹600+₹400) | process exit 88 | `split_sale_process_death_before_and_after_commit` | PENDING |
| K-002 | After commit, before caller | process exit 89 | same | PENDING |
| K-003 | After invoice insert | abort trigger | `split_sale_mid_write_failures_leave_no_partial_financial_rows` | PENDING |
| K-004 | After inventory deduction | abort trigger | same | PENDING |
| K-005 | After billing ledger | abort trigger | same | PENDING |
| K-006 | After credit entry | abort trigger | same | PENDING |
| K-007 | After payment rows | abort trigger | same | PENDING |
| K-008 | After retail journal | abort trigger | same | PENDING |
| K-009 | After billing outbox | abort trigger | same | PENDING |
| K-010 | After retail outbox | abort trigger | same | PENDING |
| K-011 | Uncommitted billing process death | env crash | `billing::reliability_tests::uncommitted_billing_process_exit_rolls_back_every_effect_before_exact_retry` | PASS `4747cda` |
| K-012 | Committed billing process death | env crash | `committed_billing_survives_process_exit_relock_unlock_and_exact_retry` | PASS `4747cda` |
| K-013 | Refund process death | env crash | `payments::tests::refund_process_death_preserves_atomicity_and_exact_retry` | PASS `4747cda` |
| K-014 | Inventory process death | env crash | `inventory_recovery::tests::process_termination_preserves_inventory_atomicity` | PASS `4747cda` |
| K-015 | Backup/restore process death | env crash | `recovery::tests::forced_termination_does_not_publish_partial_backup_or_commit_partial_restore` | PASS `4747cda` |
| K-016 | Deferred commit failure | trigger | `payments::tests::deferred_commit_failure_never_returns_a_refund_receipt_or_partial_stock` | PASS `4747cda` |
| K-017 | Ignored required billing writes | trigger | `billing::reliability_tests::ignored_required_writes_must_abort_the_sale` | PASS `4747cda` |
| K-018 | Subledger failure rolls back invoice | trigger | `customers::tests::subledger_failure_rolls_back_original_invoice_stock_general_ledger_and_outbox` | PASS `4747cda` |

Not implemented as process-kill points (covered by abort triggers or marked UNTESTED): HTTPS mid-response on a shop WAN, PostgreSQL restart mid-ingest outside CI, power loss of the Windows host during NSIS install.

### D6. SQLCipher / SQLite

| ID | Scenario | Test | Status |
| --- | --- | --- | --- |
| Q-001 | Wrong encryption key | `phase3::sqlcipher_wrong_key_and_reopen_preserve_split_sale` | PENDING |
| Q-002 | Reopen with correct key | same | PENDING |
| Q-003 | Copy db+WAL+SHM after split sale | `phase3::wal_copy_of_live_database_preserves_committed_split_sale` | PENDING |
| Q-004 | Corrupt page rejected | `payments::tests::corrupt_encrypted_database_is_rejected_without_replacement` | PASS `4747cda` |
| Q-005 | Encrypted draft survives reopen | `lib::tests::encrypted_draft_survives_close_and_reopen` | PASS `4747cda` |
| Q-006 | Wrong backup password / truncation | `recovery::tests::wrong_passwords_corruption_truncation_newer_schema_and_unknown_sql_fail_closed` | PASS `4747cda` |
| Q-007 | Restore generation resets sidecar | `replication::tests::restore_generation_resets_cursors` | PASS `4747cda` |
| Q-008 | Sidecar last-write-wins | `replication::tests::sidecar_last_write_wins_without_corrupting_primary_key` | PASS `4747cda` |
| Q-009 | SCHEMA_VERSION 12 migrations | recovery + billing frozen migrations | PASS `4747cda` |
| Q-010 | Copy without WAL while writer active | consistent snapshot API | **UNTESTED** — export checkpoints then copies; live writer snapshot is not separately proven |

### D7. Replication / PostgreSQL

Executed on `4747cda` run `41612920372`:

| ID | Scenario | Evidence | Status |
| --- | --- | --- | --- |
| R-001 | Native SQLCipher export of seven sales | workflow step “Export native SQLCipher outbox envelopes” | PASS `4747cda` |
| R-002 | Envelopes over TLS into PostgreSQL | `scripts/verify-replication-native-https.mjs` | PASS `4747cda` |
| R-003 | Sidecar HTTPS acks | `native_sqlcipher_apply_https_acks` | PASS `4747cda` |
| R-004 | Expired token | native-https script | PASS `4747cda` |
| R-005 | Owner token cannot ingest | same | PASS `4747cda` |
| R-006 | Wrong TLS certificate | same | PASS `4747cda` |
| R-007 | Tampered digest | same | PASS `4747cda` |
| R-008 | Payload TEXT mutation | same | PASS `4747cda` |
| R-009 | Malformed JSON | same | PASS `4747cda` |
| R-010 | Lost-ack retry duplicate=true | same | PASS `4747cda` |
| R-011 | Conflicting payload same operation id | same | PASS `4747cda` |
| R-012 | Cross-tenant envelope | same | PASS `4747cda` |
| R-013 | Restart hydrate seven invoices | same | PASS `4747cda` |
| R-014 | Mixed cash+credit stays split in snapshot | same | PASS `4747cda` |
| R-015 | SHA-256 of SQLCipher TEXT = PG digest | same | PASS `4747cda` |
| R-016 | Real PG ≥2 connections | `verify-replication-postgres.mjs` | PASS `4747cda` |
| R-017 | Fail closed without DATABASE_URL | script `failClosed()` | PASS (code review) |
| R-018 | Native FailTransport then EchoTransport | `native_financial_matrix_posts_seven_supported_sales` | PASS `4747cda` |
| R-019 | Independent SHA-256 of outbox TEXT | `phase3::outbox_sha256_matches_independent_hasher_of_sqlcipher_text` + NIST vectors in `payload_digest_is_native_text` | PENDING (new) / tautology **removed** |
| R-020 | Production WAN timeout / reset / prolonged outage | shop network | **UNTESTED** |
| R-021 | PostgreSQL restart during ingest | CI postgres service restart | **UNTESTED** |
| R-022 | Invalid TLS of a public CA vs staging | staging uses ephemeral self-signed in CI | CI PASS; public CA **UNTESTED** |

### D8. Security / tenant isolation

| ID | Scenario | Evidence | Status |
| --- | --- | --- | --- |
| X-001 | Missing/expired/stolen token | native-https | PASS `4747cda` |
| X-002 | Publisher vs owner role | native-https | PASS `4747cda` |
| X-003 | Cross-business envelope | native-https | PASS `4747cda` |
| X-004 | Native RBAC | `payments::tests::native_rbac_and_cross_business_denials_do_not_depend_on_react` | PASS `4747cda` |
| X-005 | Every role enforced | `authorization_tests::every_role_is_enforced_by_native_data_methods` | PASS `4747cda` |
| X-006 | Locked workspace | `locked_workspace_denies_all_sensitive_commands` | PASS `4747cda` |
| X-007 | Cross-business sessions | `scope_and_sessions_cannot_cross_business_databases` | PASS `4747cda` |
| X-008 | Disabled employee | `disabling_and_role_changes_revoke_sessions_across_connections` | PASS `4747cda` |
| X-009 | PG RLS policies present | `packages/replication-cloud/sql/20261103000000_native_financial_replication.sql` ENABLE/FORCE RLS | PASS (schema) |
| X-010 | Restricted PG role cannot read other business | `scripts/verify-replication.mjs` `SET ROLE sornio_cashier_login` | PASS on earlier Phase 3 postgres jobs; reconfirm on this SHA’s postgres script |
| X-011 | SQL injection via operation id | `valid_id` alphanumeric/`-`/`_` only | PASS (code + invalid id tests) |
| X-012 | Replayed envelopes | duplicate ack | PASS `4747cda` |
| X-013 | Mobile production sync | `productionSyncEnabled=false` | PASS (config) |
| X-014 | Revoked device ingest | replication-cloud auth | partial — see remaining blockers |
| X-015 | Oversized HTTPS body | staging ingest limits | **UNTESTED** independently in this review |
| X-016 | Downgrade to HTTP | `listenStagingIngest` TLS only in CI | PASS CI; production HTTPS termination **UNTESTED** |

### D9. Windows

| ID | Gate | Evidence | Status |
| --- | --- | --- | --- |
| W-001 | rustfmt | browser workflow on `4747cda` | PASS `4747cda` |
| W-002 | Native unit+integration (release) | Windows step “Test encrypted storage…” | PASS `4747cda` |
| W-003 | Native debug (overflow checks) | Windows debug cargo test | PASS `4747cda` |
| W-004 | TypeScript / ESLint | CI “Lint, types, build” | PASS `4747cda` |
| W-005 | Desktop production build | “Build independent Windows installer” | PASS `4747cda` |
| W-006 | NSIS installer generated | artifact `Sornio-Local-Workspace-Review` | PASS `4747cda` |
| W-007 | Installer installed (silent) | `apps/desktop/check-installer.ps1` on github-hosted Windows | PASS `4747cda` |
| W-008 | App launched offline | `Invoke-NativeCheck` after firewall block | PASS `4747cda` |
| W-009 | Encrypted DB create / reopen | native check + `--verify-preserved` | PASS `4747cda` |
| W-010 | Cashier financial workflow through UI | human shopkeeper session | **UNTESTED** |
| W-011 | Independent SHA-256 of installer zip bytes | Azure blob host not reachable from this sandbox | **BLOCKED** here; GitHub-reported digest recorded below |
| W-012 | Windows runtime of **this** commit | not `4747cda` | PENDING |

### D10. Mobile / browser

| ID | Gate | Evidence | Status |
| --- | --- | --- | --- |
| M-001 | Android review package | run `41612920111` | PASS `4747cda` |
| M-002 | Android debug compile | Mobile companion | PASS `4747cda` |
| M-003 | iOS simulator compile | Mobile companion | PASS `4747cda` |
| M-004 | Mobile TS / contracts / security | Mobile companion | PASS `4747cda` |
| M-005 | Browser rustfmt + cargo test debug/release | `41612920118` | PASS `4747cda` |
| M-006 | productionSyncEnabled false | `apps/mobile/app.json` | PASS |
| M-007 | Store submission | — | **NO** — do not submit |
| M-008 | Physical iPhone / Play device | — | **UNTESTED** |

Scenario count in this table set is well above 100 when F, S, E, C, K, Q, R, X, W and M rows are included. Additional native tests exist in `authorization_tests`, `credential_tests`, `recovery/tests`, `lan_authority/tests`, `catalog`, `checkout`, and `device` (Windows). They ran as part of `cargo test --all-targets` on `4747cda`.

---

## E. Concurrency findings

* SQLite Immediate transactions serialize writers. Optimistic `expected_revision` on products means a stale checkout is `StockConflict`, not a silent oversell.
* Only one prepared retail *sale* may exist at a time (`sale_clear`). Two cashiers cannot both hold an in-flight retail sale. Cash/credit `post_invoice` does not use that gate and is covered by racing invoice tests.
* Customer credit limit uses `revision` bump. Concurrent credit sales produce one commit and one `CreditLimit` or `CreditConflict`, never a debt above the cap (asserted).
* Same invoice id with different payloads must result in exactly one invoice row.

No oversell or double invoice was accepted as a legal outcome in these tests. Results for the new races are PENDING until CI.

---

## F. Fault injection

Abort triggers at invoice, stock, ledger, credit, payments, journals and outbox inserts must leave the pre-post snapshot unchanged, then the cashier can retry. Process death before commit must leave zero invoices and zero customer debt for the split sale; death after commit must keep ₹600 cash + ₹400 credit and make retry idempotent.

Those new assertions are PENDING. Existing billing/refund/inventory/recovery crash tests PASS on `4747cda`.

---

## G. Replication verification

On `4747cda` / run `41612920372`:

Native SQLCipher (tempfile live db, WAL checkpoint, copy db+WAL+SHM) → TEXT payloads → HTTPS with certificate verification → real PostgreSQL 16 → sidecar acks → reopen seven invoices, credit `140000` paise.

That is the intended production *shape*. It is still CI, still staging tokens, still `productionSyncEnabled=false`.

Self-comparison `assert_eq!(payload_sha256(x), payload_sha256(x))` has been removed. Digests now compare to an independent `Sha256::digest` and to NIST empty/`abc` vectors.

---

## H. Security findings

* Native identity is the authority for local writes. Renderer roles are not trusted.
* Staging ingest rejects expired tokens, owner-as-publisher, wrong TLS CA, tampered digests, mutated payload TEXT, malformed JSON, and cross-business envelopes.
* PostgreSQL schema enables and forces RLS on events, invoices, inventory, customers, cursors, acks, statements, pending retail. Policies key off `jwt_claim('business_id')`.
* Companion production sync remains disabled.
* Gaps: independent verification of every RLS policy with a non-admin role on **this** SHA; revoked-device matrix beyond existing auth tests; production TLS termination; oversized-body limits.

---

## I. Windows evidence

### `4747cda` / run `41612920113`

Installer artifact (GitHub-reported, **not** independently hashed in this sandbox):

| Artifact | Size | Artifact id | GitHub digest | Expires |
| --- | --- | --- | --- | --- |
| `Sornio-Local-Workspace-Review` | 222751879 | 13220833588 | `sha256:fb6c4fdf88cf8d39ef17faac38bf47294658c7c3f03b8c37ffd6ad6018e7b0c1` | 2026-11-10T10:07:47Z |
| `Sornio-Local-Native-Captures` | 1279643 | 13220559299 | `sha256:845a95bdf8bfe3b1fd847861d9119f4236f64d12b2c1eed45e6ad5ef406d9916` | 2026-11-10T10:07:55Z |

The sandbox cannot follow the Azure blob redirect, so these are **not** SHA-256 of downloaded zip bytes. See also `docs/mobile/WINDOWS-EVIDENCE-41457796087.md` for the earlier run (different SHA, expires 2026-11-09).

`check-installer.ps1` on the GitHub-hosted Windows runner: silent NSIS install, WebView2-located, outbound firewall block, native fixture, uninstall/reinstall data preservation, `--verify-preserved` reopen. That is installer + offline launch evidence, not a shopkeeper clicking through a ₹600+₹400 sale in the UI.

### This commit

Windows gates must be re-run because `packages/local-store/**` changed. Until that job finishes, W-002–W-009 are PENDING for the new SHA.

---

## J. Mobile evidence

On `4747cda`: Android review package SUCCESS, Android debug compile SUCCESS, iOS simulator compile SUCCESS, mobile contracts/types/security SUCCESS. Companion extra `productionSyncEnabled: false`. No store submission. No physical-device run in this review.

---

## K. Remaining blockers

### P0

1. Do not merge PR #143. Do not enable `productionSyncEnabled`.
2. New Phase 3 tests in this commit are not PASS until CI on this SHA is green.
3. Independent SHA-256 of Windows installer *bytes* still cannot be computed in this sandbox.
4. Live shop network failure (timeout, reset, multi-hour outage) is UNTESTED.

### P1

1. Windows UI cashier workflow (human) UNTESTED.
2. PostgreSQL restart during ingest UNTESTED.
3. RLS with restricted roles on this exact SHA should be re-confirmed in the postgres job logs.
4. Copying a live SQLCipher file without a checkpoint, under an active writer, is not separately proven (export path checkpoints first).

### P2

1. Physical iOS / Android devices UNTESTED.
2. Oversized HTTPS body / production TLS termination UNTESTED.
3. Public-store distribution is out of scope and must stay out.

### P3

1. Draft PR title still says “Phase 1 Expo companion”; that is housekeeping, not a financial defect.
2. GitHub-reported zip digests expire with Actions retention.

---

## L. Release recommendation

| Question | Answer |
| --- | --- |
| Continue development? | Yes |
| Founder review of draft #143? | Yes |
| Merge? | **No** |
| Controlled internal testing of the review installer? | Only on throwaway machines, never a shop profile |
| Real-shop pilot? | **No** |
| Production cloud sync? | **No** |
| Public mobile? | **No** |

---

## M. This-commit CI (fill after workflows finish)

| Workflow | Run ID | SHA | Result | Notes |
| --- | --- | --- | --- | --- |
| Replication PostgreSQL | _pending_ | _pending_ | _pending_ | Must include native export + TLS ingest |
| Workspace browser review | _pending_ | _pending_ | _pending_ | rustfmt + debug/release cargo test |
| Windows local workspace | _pending_ | _pending_ | _pending_ | cargo test + installer lifecycle |
| CI | _pending_ | _pending_ | _pending_ | |
| Mobile companion | _pending_ | _pending_ | _pending_ | |
| Android review package | _pending_ | _pending_ | _pending_ | |

Until section M is filled with real run IDs on this SHA, new tests stay PENDING and the release verdict stays **NO-GO**.
