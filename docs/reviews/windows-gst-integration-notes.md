# Windows GST invoicing: integration notes

Status: native arithmetic foundation plus integration checklist. The helper is
not connected to invoice posting or IPC. It does not produce GST invoices,
financial returns or statutory credit notes and is not a compliance certification. Reviewed against main
`97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6` on 2026-10-28.

## Merged-engine constraints

The merged native billing engine has one invoice-wide tax rate and records one
tax-payable ledger account. Its durable operation ID is not a financial-year
invoice series. It has no per-item HSN/SAC, registration/transaction context,
individual staff authorization, customer-account ledger, return or credit-note
engine. The latter capabilities are proposed by open PRs #122, #123 and #124;
they are not on main. Do not treat their migrations or APIs as already merged.

## Regulatory review anchors

- [CBIC invoice rules](https://cbic-gst.gov.in/gst-invoice-rules.html): tax
  invoice particulars, including supplier details, financial-year unique
  serial, recipient details where applicable, HSN/SAC and tax components.
- [CBIC CGST rules as published in 2020](https://cbic-gst.gov.in/pdf/20082020_CGST-Rules-2017-Part-A-Rules.pdf): the serial is at most 16 characters; check subsequent amendments before release.
- [CBIC CGST amendment 26/2022](https://cbic-gst.gov.in/pdf/central-tax/ct26-2022.pdf): example of additional recipient requirements for specified online supplies; unsupported cases need explicit rejection.
- [CBIC FAQ](https://cbic-gst.gov.in/hindi/sectoral-faq.html): unregistered
  persons cannot issue GST tax invoices; same-state versus interstate treatment
  depends on location of supplier and legally determined place of supply.
- [CBIC IGST Act](https://cbic-gst.gov.in/hindi/IGST-bill-e.html): place of
  supply has statutory exceptions; destination-state selection alone is not a
  universal determination rule.

These sources include historical texts, not a complete consolidated current
law. Check current amendments, state-specific rules, e-invoicing applicability,
HSN notifications, credit-note rules and actual tax rates with a qualified CA
before customer use. No fixed e-invoicing threshold is assumed here.

## Integration and acceptance checklist

- [ ] Add the migration after the actual merged authorization, customer and
  returns schemas; preserve original immutable invoices and operation IDs.
- [ ] Store supplier registration status and validate GSTIN; unregistered
  workflows must not label documents GST tax invoices or collect GST as tax.
- [ ] Define supported domestic supply assumptions, state/UT tax treatment,
  recipient details, HSN/SAC requirements, tax categories and effective rates.
  Explicitly reject or flag unsupported scenarios instead of guessing.
- [ ] Specify integer-paise line, rate, component and aggregate rounding;
  include inclusive/exclusive, half-paise, odd-component and overflow fixtures.
  Verify the chosen policy with a CA and keep historic rounded components.
- [ ] Allocate a compliant invoice-series number under the same writer lock as
  posting; bind it to the transaction, exact replay and business/FY. Document
  cancellation, rollback, clock corrections and never silently reuse an issued
  number. GSTIN/series changes and multi-device authority need explicit policy.
- [ ] Preserve original line tax details in proportional returns and credit
  notes; cumulative partial returns must reproduce original amounts exactly.
  Never mutate issued invoices or assume every refund qualifies as a tax credit.
- [ ] Retain customer ledger, inventory, audit, outbox, permissions and
  operation receipt atomically through the shared native transaction engine.
- [ ] Validate historical invoice serialization and migration, concurrent
  numbering, cross-FY boundaries, repeat requests, failed writes and restart.
- [ ] Produce readable invoices and formula-safe, exact-money CA exports with
  recorded supply and component details; validate Windows print/export paths.
- [ ] Run real native and Windows acceptance plus the existing regression and
  security checks. Document unsupported returns, UTGST, cess, composition,
  e-invoicing/IRN, e-way bills, reverse charge, exports, mixed exemptions,
  discounts, services and place-of-supply exceptions until implemented.


## Implemented arithmetic policy v1

`packages/local-store/src/gst.rs` uses only integer arithmetic with i128
intermediates and the existing store money bounds. It introduces no alternative
ledger, posting function, authorization boundary or renderer accounting logic.
No database migration, schema-version bump or change to historic invoices occurs.

1. Extend quantity (thousandths of a unit) by unit-price paise and round half up
   to paise once per line. Zero-priced lines are mathematically allowed; the
   posting engine remains responsible for sale validation.
2. Exclusive pricing calculates combined tax on the rounded extension. Inclusive
   pricing extracts combined tax as gross × rate / (10000 + rate); taxable value
   is the difference. The caller supplies the combined rate in basis points.
3. Interstate uses IGST. For supported intra-state calculations, combined rounded
   tax is split with any odd paise assigned to CGST, the remainder to SGST. This
   is a proposed deterministic product policy, not a claim that law mandates it;
   CA review of component-level rounding remains outstanding. UTGST is not modeled.
4. An unregistered calculation requires zero GST rate. A numeric rate within the
   arithmetic bounds is not evidence of a lawful item classification or rate.
5. Cumulative return arithmetic scales the original taxable value and combined
   original tax. It allocates the returned tax between its original components
   hierarchically so none can decrease as returned quantity increases. Full return
   exactly reproduces the original snapshot. The future transactional return
   engine must subtract the prior cumulative result, validate return quantities
   under its writer lock and apply statutory credit-note eligibility separately.

This paise policy is not an implementation of tax-return liability settlement or
rounding under CGST section 170. No rounding adjustment account is posted.

Six checked fixtures include registered intra/interstate, inclusive/exclusive,
small values, half-paise boundaries and unregistered pricing. Property-style tests
check every return quantity from 0 through 1000 for 99 prices, four example
rates and both modeled supply types. These rates are test values, not a rate table.
Existing invoice/restart/retry/concurrency/rollback tests remain unchanged.

## Additional official reference and limits

The [GST IRP advisory dated 27 March 2025](https://einvoice6.gst.gov.in/content/revised-time-limit-for-e-invoice-reporting-for-businesses-with-aato-of-%E2%82%B910-crores-above/)
describes an e-invoice reporting time limit effective April 2025 for a defined
turnover group. That reporting limit must not be mistaken for the separate
turnover threshold determining e-invoice applicability. No IRN generation,
signed QR, government reporting or current applicability determination is
implemented by this foundation. Recheck later amendments at release.

## PR review recommendation

This is a reviewable arithmetic foundation, not the requested complete invoicing
milestone. Do not enable GST invoice issuance or merge it as complete GST support.
Invoice configuration/GSTIN/HSN validation, durable FY sequencing, shared posting
integration, statutory credit notes, customer invoice rendering, CA export and
Windows acceptance all remain unchecked above. The main-branch dependency gap
must be resolved without importing unmerged changes as if they were merged.
