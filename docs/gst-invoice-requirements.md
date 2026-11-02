# GST invoicing — what exists, and the minimum that is missing

**Status: Sornio cannot issue a GST tax invoice today and must not claim it can.** The
printed receipt already states "Local sales receipt. GST tax-invoice compliance is not
claimed", which is the correct position and must stay until every item in §4 is
implemented *and* verified.

This document is an engineering gap analysis against Rule 46 of the CGST Rules (contents
of a tax invoice) and the arithmetic requirements around it. It is not legal advice; a
chartered accountant must sign off the invoice format for each supported business
scenario before any document says "Tax Invoice".

## 1. What the code actually computes

Source of truth: `packages/local-store/src/billing.rs` at commit `103cd9d`.

```rust
pub fn line_total(quantity: i64, price: i64) -> Result<i64, StoreError> {   // quantity = milli-units
    amount((quantity as i128 * price as i128 + 500) / 1000)                // half-up to the paise
}
pub fn tax_total(subtotal: i64, bps: i64) -> Result<i64, StoreError> {      // bps = 0..=10000
    amount((subtotal as i128 * bps as i128 + 5000) / 10000)                // half-up
}
```

* Integer paise throughout, `i128` intermediates, bounded to ₹90,00,00,00,000. No floats
  anywhere in the money path (verified by grep and by `verify-native-money`).
* **One tax rate for the whole invoice** (`PostInvoice.tax_basis_points`), applied **once
  to the subtotal**. Not per line, not split into components.
* The renderer's preview and the native writer agree to the paise across 4,820
  randomised invoices (`npm run verify:money`, executed).

This arithmetic is correct *as generic percentage tax*. It is not GST arithmetic, for the
reasons in §3.

## 2. What the stored invoice contains

`billing::Invoice`, persisted as immutable JSON in `local_invoices.payload`:

| Field | Present | Contents |
| --- | --- | --- |
| `id` | yes | operation id (idempotency key) |
| `invoiceNumber` | yes | `S-{sequence:012}`, e.g. `S-000000000142` |
| `businessId`, `businessName` | yes | copied at posting time |
| `createdAt` | yes | UTC timestamp with milliseconds |
| `lines[]` | yes | `productId, name, unit, quantityMilli, unitPricePaise, totalPaise` |
| `subtotalPaise`, `taxPaise`, `totalPaise` | yes | |
| `taxBasisPoints` | yes | single invoice-wide rate |
| `tender`, `customerId` | yes | `cash` / `credit` / `retail`, customer reference for credit |

A serial number is allocated from `sqlite_sequence` inside the same writer transaction as
the sale, so concurrent invoices cannot collide and numbers never have gaps caused by
rollback (verified by test identifiers recorded in the previous audit; not re-executed
here).

## 3. Why that is not a GST tax invoice

| # | Requirement | Reality in Sornio | Severity |
| --- | --- | --- | --- |
| 1 | **Supplier GSTIN** must be printed | no GSTIN field anywhere in the codebase | blocking |
| 2 | **Supplier name, address and state code** | only `businessName` exists | blocking |
| 3 | **Recipient** name/address/GSTIN for B2B | only an optional free `customerId` | blocking for B2B |
| 4 | **Place of supply / inter-state** | not modelled; no state code on business or customer | blocking for inter-state |
| 5 | **HSN or SAC code per line** | not modelled | blocking |
| 6 | **Taxable value and rate per line** | one invoice-wide rate | blocking |
| 7 | **CGST + SGST (intra-state) or IGST (inter-state)** split | one undifferentiated `taxPaise` | blocking |
| 8 | Invoice **serial** ≤16 chars, unique per financial year per registration | `S-000000000142` is global and never resets per FY | high |
| 9 | **"Tax Invoice"** title, invoice date vs supply date | receipt says the opposite (by design) | high |
| 10 | **Reverse charge** flag, signature/QR where required | absent | high (scenario) |
| 11 | **Nil/exempt/zero-rated** treatment | no concept of exempt lines | medium (scenario) |
| 12 | **Credit notes** for returns with GST adjustment | returns reverse revenue/tax internally but emit no credit-note document | high |
| 13 | Rounding of each tax **component** | single half-up on total tax | medium |

GST rounding is also not merely "round the total": CGST and SGST are each computed and
rounded, which can differ by a paise from halving a single rounded tax figure. Matching
this is a calculation change, not a formatting change.

## 4. Minimum work for a compliant invoice

In dependency order. This is deliberately the *minimum*, not a full compliance product.

1. **Schema 13 — statutory business profile** (additive migration, no rewrite of applied
   migrations):
   `legal_name`, `trade_name`, `gstin` (15 chars, checksum-validated), `address` lines,
   `state_code` (2 digits), `pincode`, plus contact. Store `registration_type` so an
   unregistered shop can issue a **"Bill of Supply"** instead of a tax invoice.
2. **Schema 13 — per-product tax data**: `hsn_sac`, `gst_rate_bps`, `is_exempt`.
   The invoice-wide `tax_basis_points` stays for backward compatibility with existing
   invoices; new invoices take each line's rate from the product snapshot.
3. **Per-line tax + component split** in `post_into`: compute `cgst`/`sgst` when
   `business.state_code == place_of_supply`, else `igst`; round each component half-up
   independently; assert `cgst + sgst + igst == taxPaise` inside the same transaction.
   Post to `tax_payable` with three accounts (or a component column) so the ledger and
   GSTR summaries agree with the invoice.
4. **Financial-year serial series**: `{FY}/{sequence}` per registration, reset on 1 April,
   allocated under the existing writer transaction. Keep `invoiceNumber` schema intact;
   add the new series as a new field so stored invoices remain byte-identical.
5. **Invoice document fields**: GSTIN, address, state, place of supply, recipient block,
   HSN column, rate column, taxable value, CGST/SGST/IGST columns, total in words,
   "Tax Invoice" vs "Bill of Supply" title. The receipt renderer must refuse to print a
   tax invoice when a required field is missing, rather than printing a partial one.
6. **Credit notes** for returns: a GST-visible document referencing the original invoice
   number and date, with its own series.
7. **Tests**: per-line rounding properties (component sums equal the line tax), intra vs
   inter-state routing, FY rollover and serial uniqueness under concurrency, refusal to
   print an incomplete tax invoice, and a regression set of real invoices recomputed
   independently.

Items 1–2 are additive and safe. Items 3 and 4 touch the posting transaction and are the
highest-risk changes in this area; they need the native suite running before merge.

## 5. What this means for the pilot

A shop that is **not** GST-registered can use Sornio today for internal records, provided
every document stays labelled as a local sales receipt — which it currently is. A
GST-registered shop **cannot** use Sornio as its invoicing system, because it cannot
produce a document that satisfies Rule 46. That is a business decision to be taken with
the owner's accountant, not an engineering detail to be glossed over in a pilot review.
