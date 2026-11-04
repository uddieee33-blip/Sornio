# Risk-ranked regression scenario matrix

All PASS entries below refer to the Linux synthetic fixtures described in TEST-EXECUTION-REPORT.md; source/test location is under `packages/local-store/src/` unless a script path is specified. Each named test provides its exact preconditions, inputs and assertions. These are **27 grouped scenarios**, not a claim of 100 independently catalogued scenarios; the native harness executes many additional cases. BLOCKED and NOT RUN are not passes. P0 denotes the potential consequence, not a confirmed defect.

| ID | Risk | Preconditions / input | Expected behavior | Implementation / test evidence | Result |
|---|---|---|---|---|---|
| M01 | P1 | ₹1,000 cash / credit | one invoice, exact totals | phase3 financial_matrix_posts_supported_allocations_in_integer_paise | PASS |
| M02 | P0 | ₹600 cash + ₹400 credit | one sale, stock and ₹400 debt | phase3 financial_matrix_posts_supported_allocations_in_integer_paise | PASS |
| M03 | P1 | UPI / card and mixed cash | digital remains pending, exact allocation | phase3 financial_matrix_posts_supported_allocations_in_integer_paise; check-retail.cjs | PASS |
| M04 | P0 | under/over/invalid allocation | reject without partial rows | phase3 financial_matrix_rejects_invalid_allocations_without_partial_effects | PASS |
| M05 | P1 | cash with customer | retain customer, no debt, restart replay once | phase3 cash_sale_with_customer_replays_without_creating_credit | PASS |
| I01 | P0 | two sales / last unit | one commits, no oversell | phase3 last_unit_inventory_race_never_oversells | PASS |
| I02 | P1 | stale stock / correction race | refuse stale intent | payments_tests stock_correction_and_sale_race_never_commits_both_stale_intents | PASS |
| I03 | P1 | damaged return | no sellable stock restoration | payments_tests damaged_return_refunds_once_without_reintroducing_sellable_stock | PASS |
| C01 | P0 | competing credit sales / ₹500 cap | one ₹400 sale, reject other | phase3 concurrent_credit_limit_never_exceeds_customer_cap | PASS |
| C02 | P1 | partial/full repayment; overpayment | correct ledger and reject overpayment | customers_tests; check-customers.cjs | PASS |
| R01 | P0 | same operation retry | same receipt, one effect | billing_reliability_tests committed_sale_contains_complete_aggregated_records_and_replays_unchanged | PASS |
| R02 | P0 | changed payload under same ID | reject, preserve committed state | billing_reliability_tests changed_operation_data_never_changes_committed_state | PASS |
| R03 | P0 | same ID concurrent | single business effect | phase3 same_invoice_id_concurrent_posts_once | PASS |
| A01 | P0 | split sale write failure | rollback all financial rows | phase3 split_sale_mid_write_failures_leave_no_partial_financial_rows | PASS |
| A02 | P0 | process death before/after commit | rollback or recover committed result | phase3 split_sale_process_death_before_and_after_commit | PASS |
| A03 | P1 | SQLCipher wrong key / restart | refuse wrong key and preserve sale | phase3 sqlcipher_wrong_key_and_reopen_preserve_split_sale | PASS |
| B01 | P0 | backup corruption and wrong passwords | fail closed | recovery/tests.rs wrong_passwords_corruption_truncation_newer_schema_and_unknown_sql_fail_closed | PASS |
| B02 | P0 | restore interruption | no partial restore or backup | recovery/tests.rs forced_termination_does_not_publish_partial_backup_or_commit_partial_restore | PASS |
| S01 | P0 | role/scope and revocation | native denials and audit | authorization_tests; check-authorization.cjs | PASS |
| K01 | P1 | F8 while prompt open / pending | no post, focus retained/restored | check-checkout.cjs | PASS |
| K02 | P1 | F8 while posting | no second invocation | check-checkout.cjs | PASS |
| P01 | P1 | 58mm/80mm/A4 PDF layouts, Punjabi font | three browser renderings without new post | check-receipts.cjs | PASS |
| D01 | P1 | v4 migration and constraints | preserve fixture, enforce guards | scripts/verify-local-schema.py | PASS |
| W01 | P1 | installed patched Windows / physical printer | native install and physical output | no Windows host | BLOCKED |
| W02 | P2 | Windows viewport/scaling, high contrast, motion | readable usable at requested settings | no Windows host | BLOCKED |
| W03 | P1 | real power interruption / storage durability | recover to consistent state | no hardware fixture | BLOCKED |
| X01 | P1 | live replication / Android sync | no production activation | two replication tests ignored; no live system | NOT RUN |
