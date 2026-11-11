# Phase 13C — unpaid restaurant checkout recovery

Base: feature/phase13b-restaurant-checkout at f7654691291fb43e36a0b81b707b50ca62a89227 (#159). Main and existing PRs are not merged.

## Implemented source

Schema v16 preserves the immutable v15 restaurant binding as the parent operation. A new immutable attempt table stores each financial payload. A revisioned control row records the active attempt, current cashier, reason and persisted bound/submitting/refused/editable/unknown/settled state. Unbound unpaid orders retain the existing persisted restaurant order state; they have no financial attempt yet. Existing unpaid v15 bindings migrate conservatively to unknown. Paid bindings retain settled status. The frozen v15 backup schema is preserved for compatibility validation.

Native submission writes submitting before invoking the existing retail engine. Posting still uses the existing retail/billing transaction and ledger. The settlement hook updates the order and control row only for the current attempt and only once its authoritative invoice exists. A replay also reconciles a legacy or interrupted operational state against the authoritative saved invoice. Database, transport and unexpected failures never grant edit permission. The renderer obtains the persisted phase from native code; it does not classify timeouts as refusals.

Selected typed validation failures during preparation are also persisted as refused, retaining the original operation identity without creating a financial checkpoint. Selected typed financial validation errors become refused only after a writer-locked check confirms no invoice or retail operation exists for any attempt of that order. Edit requires the current cashier, current revision and the same no-post proof. Amendment validates explicit current prices, menu availability, quantities, tax and allocation totals, then retires the old attempt with the existing retail cancellation tombstone, replaces its pending checkpoint, and appends the new immutable attempt in the same writer transaction. The original order and parent operation remain unchanged. Old attempts cannot post after retirement. Unknown outcomes cannot be amended. Submission names the expected attempt, protecting against stale windows confirming a newer correction.

Cashier transfer requires the native Settings permission (owner), current revision, an enabled staff account in the same business, no posted attempt and no active checkout at the destination. The existing pending request is transferred without changing its financial payload or key. Transfers are denied while submission/recovery is unresolved. Owner/cashier history and accepted kitchen tickets remain intact. A stale prior cashier cannot amend or settle after transfer.

The desktop shows persisted status/reason, Edit unpaid bill, corrected lines/quantities/replacements/add-ons, preparation-correction notes, explicit current-price acceptance, tax/customer/allocation corrections, revised totals and confirmation. Valid local edits remain when correction validation fails. Unknown/submitting states offer recovery only. Restarts restore saved payment/customer details. Corrections are audited; previously dispatched KOT instructions remain historical and are not silently rewritten.

## Verification

Passed: desktop TypeScript/Vite build; 38 native-command/capability source contracts; 92 SQLite schema/migration/invariant checks; focused SQLite checks for conservative v15 migration, attempt and parent immutability, stale revisions, current-attempt-only invoice settlement and table release. Existing restaurant pricing and split-allocation tests: 16 passed.

Five Rust tests were added covering refused checkout correction and single settlement, unknown/stale amendment restriction, takeover authorization/ownership fencing, a database fault followed by recovery of the exact attempt, and a durable refusal during preparation before any payment checkpoint exists. They were NOT compiled or executed: Cargo is unavailable. SQLite tests do not execute Rust, native RBAC, SQLCipher, financial posting or concurrent processes. No Windows workflow, installer run or browser acceptance was attempted.

## Remaining limits

Native debug/release compilation and the new tests must pass before financial correctness can be claimed. Required release work includes crash/restart and concurrent-process execution, ownership revocation, failed commit recovery, encrypted backup/restore upgrades and installed Windows lifecycle/printing. The inherited Apple dependency lockfile work remains outstanding.

Transfer currently requires owner authorization and an account ID; there is no staff picker. An unresolved unknown attempt must be recovered by its assigned cashier before transfer; there is no owner override of unresolved submission. Editable phase and accepted amendments persist, but unsaved local correction text is not autosaved across application termination. Kitchen correction notes are audit records and do not dispatch a replacement KOT. KOT printing, grouped modifiers, receipt order/table annotations and discounts remain separate restaurant increments.

Next: execute the focused native recovery suite on a Cargo-capable host, then add staff selection and an explicit kitchen correction ticket workflow. Keep the existing Windows financial/installer gates intact.
