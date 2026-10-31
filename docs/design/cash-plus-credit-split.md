# Design: cash + customer-credit split payment

**Status: NOT IMPLEMENTED.** This is a reviewed implementation plan, deliberately not
committed as code, because no Rust compiler is reachable in this environment (no
`rustc`/`cargo`; `crates.io` and `static.rust-lang.org` are blocked). Shipping unverified
changes to the posting transaction would be worse than shipping none: the defect class is
"a sale commits with a wrong ledger", and it would sit unchecked while CI runners are
refused.

Implement exactly this, run `cargo test --all-targets --locked --manifest-path
packages/local-store/Cargo.toml`, then re-run `npm run verify`. Nothing else changes.

## The gap, precisely

A customer paying ₹300 cash and ₹200 on khata cannot be recorded. Three independent
refusals sit in the way:

| Location | Code | Effect |
| --- | --- | --- |
| `billing.rs:20` | `enum Tender { Cash, Credit, Retail }` | a sale is exactly one tender |
| `billing.rs:319` | `if invoice.tender != Tender::Retail { customers::post_sale(...) }` | a retail sale **never** touches the credit ledger |
| `payments.rs:606,629,1025` | `tender == Retail` forbids `method == "credit"` and `customer_id.is_some()` | a retail split cannot carry a credit part |
| `payments.rs:631` | `journal(... &[("cash", cash), ("receivables", -cash)])` | the ledger records only the cash portion |

So today the cashier must pick one tender and misstate the other side of the transaction.
That is a *data accuracy* problem, not a UI problem.

## The change, minimal and additive

Keep `Tender` untouched. A mixed payment **is** a retail sale with a `credit` part — that
is exactly what "retail" already means (multi-part payment against one invoice).

### 1. `billing.rs` — allow a credit part on a retail tender

In `post_into`, after the stock loop, replace the unconditional retail skip:

```rust
// Existing behaviour preserved: a non-retail sale posts its whole total to credit.
// New: a retail sale may carry a `credit` payment part, and only that part becomes
// a receivable. `customers::post_sale` stays the single writer of the credit ledger.
```

* `retail: Option<&[PaymentPart]>` already reaches `post_into`, so the credit amount is
  available before `invoice_posted` runs.
* Compute `credit_paise = parts.iter().filter(|p| p.method == "credit").sum()`.
* If `credit_paise > 0`, require `request.customer_id` (else `InvalidInvoice`) and call
  `customers::post_sale_for_amount(tx, session, &invoice, credit_paise)`.
* `customers::post_sale` gains an `amount: i64` parameter instead of using
  `invoice.total_paise`; the existing credit-tender call site passes `invoice.total_paise`,
  so its behaviour is byte-identical. The credit entry still writes
  `invoice_id = invoice.id`, so the `credit_sale_once` unique index keeps
  "one credit row per invoice" intact.

### 2. `payments.rs` — accept the credit part and journal it

* `validate`: drop the blanket `customer_id.is_some()` refusal for retail; require
  `customer_id.is_some()` *iff* a `credit` part exists.
* `invoice_posted`: allow `method == "credit"` for `Tender::Retail`, and journal
  `[("cash", cash), ("receivables", -(cash + credit))]` — receivables now nets to the
  unpaid remainder, which is what the credit ledger also records. Keep the existing
  `local_retail_payments` row for the credit part with `reference = ''`.
* The payment-sum check already forces `Σ parts == total_paise`, so cash + credit + any
  UPI/card must equal the invoice total; no new arithmetic, no new rounding.

### 3. `access.rs`

No change. `post_retail` already requires `Permission::Sell`; the credit part is *recorded*
inside the same operation, not collected, so `CollectCredit` is not needed. Do **not**
widen permissions for this.

### 4. Renderer (`CheckoutPanel.tsx`, `retail-types.ts`)

* Add `credit` to the retail split inputs alongside cash/upi/card, enabled only when a
  customer is selected; show the resulting outstanding balance before confirmation.
* Keep the existing client-side rule "split amounts must equal the invoice total exactly".
* Reuse the existing pending-operation fencing; no new submission path.

## Required tests (add to `payments_tests.rs` / `billing_reliability_tests.rs`)

1. `mixed_cash_and_credit_commits_one_sale_with_balanced_ledger` — journal nets to zero;
   `receivables` equals the credit part; the credit ledger balance equals the credit part.
2. `mixed_sale_without_customer_is_refused` — `customer_id` absent ⇒ `InvalidInvoice`,
   nothing committed.
3. `mixed_sale_exceeding_credit_limit_is_refused_atomically` — no invoice, no stock move,
   no ledger row.
4. `duplicate_mixed_sale_request_posts_once` — same operation id twice ⇒ one invoice.
5. `changed_payload_under_same_operation_id_conflicts`.
6. `crash_before_commit_leaves_no_partial_mixed_sale` — crash hook `before_commit`.
7. `partial_repayment_after_mixed_sale_reduces_the_credit_remainder_only` — cash part
   untouched, drawer unaffected.
8. `return_of_mixed_sale_refunds_cash_and_reduces_credit_correctly`.
9. `mixed_sale_rejects_a_zero_or_negative_credit_part`.
10. `split_of_cash_credit_and_upi_still_requires_an_exact_total`.

## Backward compatibility

* No schema change: `local_retail_payments.method` already allows `credit`; the credit
  ledger table is unchanged.
* Existing invoices serialise identically — a cash-only retail sale produces exactly the
  same request bytes as before, so stored operations still replay to the same receipt.
* Old binaries reading a new mixed-sale receipt will show the credit payment as
  `credit_due`; they will not corrupt it. Do not downgrade mid-shift.

## Risk

This touches the one transaction that must never be wrong. Merging it without a green
`cargo test` is not acceptable. It is a two-file change plus one signature change, and the
ten tests above are the acceptance bar.
