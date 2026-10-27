# Windows local stock checkpoint — 27 October 2026

## Product direction

Windows is the current delivery focus, with a ten-day working target around
6 November. Theme/public landing work follows Windows; Android follows that.
This is a target for verified progress, not a statement that customer release
gates have passed. Do not spend the Windows period expanding other platforms.

The owner is considering **three or four subscription tiers**. Count, names,
prices, device limits and feature boundaries remain provisional; existing
Basic/Growth/Team references do not settle the new proposal. No pricing or
entitlement behavior changes in this checkpoint.

Restaurant idea, recorded for later review: staff take orders on iPads; orders
reach the restaurant counter/kitchen and produce the corresponding bill without
re-entry. The restaurant chooses digital delivery or physical printing. Keep
open orders distinct from finalized bills and confirmed payments. Table/service
flow, amendments, kitchen acknowledgement, device pairing, offline behavior,
receipt delivery and tier eligibility still need decisions. This idea does not
change the Windows-first priority or commit to an iPad implementation yet.

## Implemented in local review 0.3.0

- Items and counted stock now have their own encrypted SQLite tables, separate
  from the workspace draft and its saved-copy recovery. Restoring a draft does
  not restore or rewind stock.
- Add an item with an optional item code, unit, integer-paise price and opening
  count. Stock uses thousandths, so 1.250 kg is stored as 1250 rather than float
  arithmetic. Four units are supported: pieces, kilograms, litres and metres.
- Record a signed stock change and reason. Negative resulting stock, stale
  revisions, duplicate item codes and invalid/oversized input are refused.
- Every mutation and its append-only event commit in the same transaction.
  Stable operation IDs make an exact retry return the prior result without
  applying the change twice. Reusing an ID for different input is refused.
- Native access checks protect every item read/write command. The renderer
  cannot authorize itself. Uncertain replies retain the same request for retry;
  a committed save followed by a failed refresh is reported as saved and blocks
  further edits until counts reload.
- Added bounded item search/listing. Unsaved item edits participate in the
  explicit discard-before-lock guard. An in-flight stock save disables locking.
- Shared-package extraction now works with the existing compiler-based checks,
  accounting import rewriting and localization phrase discovery. Existing
  translations are retained; desktop review UI remains English.

## Validation and limits

Local encrypted-store suite: 25 tests pass, including stock restart/retry,
stale connections, duplicate codes, atomic rollback, actual SQLITE_FULL,
schema-v3 migration preserving drafts/password, and native access gates.
Desktop production bundle, lint, both repository TypeScript compilers, full
repository verification and hosted production build pass. Browser mocked-IPC
acceptance passes the stock flow, validation, lost-reply retry, negative/stale
stock refusal and committed-save/failed-refresh behavior. Current Windows
release acceptance is required separately; its result belongs in the PR and
must not be inferred from these local checks. The Windows script now covers a fractional item, stock delivery,
forced termination and persisted count after unlock/reopen under firewall rules.

Single Windows-profile engineering review, synthetic data only. This does not
provision verified owner/business identity, isolate multiple businesses, assign
staff roles, post sales/payments/ledger entries, or implement barcode scanning,
receipts, device-loss backup, LAN/cloud sync, paid entitlements or release signing.
Stock event history is not a backup or a completed sync outbox.

## Next Windows implementation boundary

Connect catalogued items to durable local bills: stable bill operation IDs,
transactional aggregated stock deduction, cash/credit ledger and audit/outbox
commit, restart recovery and receipts. Digital references alone must never
confirm settlement. Carry verified identity, business isolation, staff roles,
backup/key recovery and two-PC acceptance through the release plan before
customer deployment.
