# Inventory and credit

`billing.rs` checks product revision, aggregates quantities, rejects insufficient stock and records stock movement within the sale transaction. `customers.rs` calculates the balance and credit limit under the transaction. Native tests cover last-unit races, retries, returns, repayment, limits, rollback and durable entries. Credit-race test originally raced the same product and failed first with `StockConflict`, leaving its credit-limit assertion unproven. The amended fixture uses distinct products, requires one success/one credit rejection and checks one invoice, ₹400 debt and combined stock. This is one race scenario, not a proof for all concurrent operations.

The inventory recovery guard test had targeted `rice` although its fixture created `item`, so it failed before the intended multi-row guard. Corrected fixture passed; production inventory logic was not changed for this finding.
