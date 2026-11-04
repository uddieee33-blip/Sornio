# Financial correctness

Native `billing.rs` uses bounded integer paise and checked intermediate arithmetic. `phase3_reliability_tests.rs::financial_matrix_posts_supported_allocations_in_integer_paise` executes eight cases, including ₹1,000 = ₹600 cash + ₹400 credit. It checks committed balances, stock, records and journal conservation; the corresponding invalid matrix tests rejection. Digital amounts are recorded as unverified pending matching; recording is not proof of external settlement.

The previous cash-with-customer inconsistency is fixed in `payments.rs`: normal cash invoices may retain an optional customer while retail split invoices still require the customer/credit relationship. The added native test checks receipt, no credit entry, exact replay, restart and single stock deduction. This does not prove every amount, discount, receipt device or recovery combination.
