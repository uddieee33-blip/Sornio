//! Production financial-integrity verification (Phase 5 remediation, P5-ADV-003..007).
//!
//! The audited candidate verified restored data *structurally* only
//! (`PRAGMA integrity_check` / `foreign_key_check`); the deep financial verifier
//! was `#[cfg(test)]` and never gated a real restore. This module is production
//! code and runs inside the restore transaction before completion, so a backup
//! whose financial records do not reconcile is rejected and the original
//! database is left untouched.
//!
//! # Design principle
//!
//! A zero-sum ledger is NOT sufficient: two offsetting edits keep the balance
//! while changing the meaning of the posting. Every check below therefore
//! establishes a relationship between a **source business record** and its
//! **financial consequence**, rather than merely testing that totals balance:
//!
//! * invoice payload totals/tender/customer  <-> billing ledger legs
//! * invoice payload line quantities        <-> `local_invoice_stock`
//! * credit-tender invoice                  <-> `local_credit_entries` sale row
//! * credit entry delta                     <-> customer journal receivables leg
//! * retail return source totals            <-> retail journal revenue/tax legs
//! * retail journal operation               <-> `local_retail_activity` source
//!
//! # Deliberate limitations (documented, not invented rules)
//!
//! * **No blanket uniqueness rule on `local_retail_journal`.** `return_invoice`
//!   legitimately calls the journal writer once per refund part, so a return
//!   with two same-method parts produces repeated `(operation_id, account)`
//!   rows — including byte-identical rows for equal amounts. A uniqueness or
//!   "no duplicate row" rule would reject valid history. Duplication is instead
//!   detected *relationally*: duplicating a return's postings doubles its
//!   revenue/tax legs, which then disagree with `local_retail_returns`, and an
//!   operation with no source activity row is rejected as an orphan.
//! * **Customer outstanding is derived, not stored.** `local_customers` has no
//!   balance column; `customers::balance` sums `local_credit_entries`. There is
//!   therefore no stored balance to reconcile against. Integrity is established
//!   by tying every credit entry to its invoice or journal counterpart, and by
//!   requiring the derived outstanding never to be negative (the write paths
//!   reject overpayment).
//! * **Product stock is not reconstructed from invoice movements alone.**
//!   `stock_adjusted` events mutate `local_products` without an
//!   `local_invoice_stock` row, so neither "stock == last invoice after_milli"
//!   nor a naive per-product movement chain is a valid invariant. Only the
//!   per-movement arithmetic, non-negativity, and agreement with the originating
//!   invoice line quantity are asserted.
//! * **Legacy payloads degrade gracefully.** Backups from schema 5..12 may omit
//!   payload fields; `json_extract` then yields NULL and the comparison is NULL
//!   (not a violation), so valid historical records are never rejected for
//!   missing modern fields. Checks that could misfire on NULL are explicitly
//!   guarded.

use crate::StoreError;
use rusqlite::Connection;

#[cfg(test)]
#[path = "financial_tests.rs"]
mod financial_tests;

/// Append the first column of every row returned by `sql` as a violation.
fn push(db: &Connection, out: &mut Vec<String>, sql: &str, label: &str) -> Result<(), StoreError> {
    let mut stmt = db.prepare(sql)?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    for row in rows {
        out.push(format!("{label}: {}", row?));
    }
    Ok(())
}

/// Collect every financial-invariant violation. An empty vector means the
/// financial records reconcile with their source business records.
pub(crate) fn violations(db: &Connection) -> Result<Vec<String>, StoreError> {
    let mut v = Vec::new();

    // ------------------------------------------------------------------
    // 1. Sales and ledger consistency (invoice payload <-> ledger legs).
    // ------------------------------------------------------------------
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         WHERE NOT EXISTS(SELECT 1 FROM local_billing_ledger l WHERE l.invoice_id=i.id)",
        "invoice missing ledger postings",
    )?;
    push(
        db,
        &mut v,
        "SELECT invoice_id FROM local_billing_ledger GROUP BY invoice_id HAVING SUM(amount_paise)<>0",
        "billing ledger imbalance",
    )?;
    // Exactly one settlement leg, and it must be the tender's account.
    push(
        db,
        &mut v,
        "SELECT invoice_id FROM local_billing_ledger WHERE account IN ('cash','receivables')
         GROUP BY invoice_id HAVING COUNT(*)<>1",
        "invoice settlement leg not unique",
    )?;
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         JOIN local_billing_ledger l ON l.invoice_id=i.id AND l.account IN ('cash','receivables')
         WHERE l.amount_paise <> CAST(json_extract(i.payload,'$.totalPaise') AS INTEGER)
            OR (json_extract(i.payload,'$.tender') IS NOT NULL
                AND l.account <> CASE json_extract(i.payload,'$.tender')
                                 WHEN 'cash' THEN 'cash' ELSE 'receivables' END)
            OR (json_extract(i.payload,'$.customerId') IS NOT NULL
                AND COALESCE(l.customer_id,'') <> json_extract(i.payload,'$.customerId'))",
        "invoice settlement leg disagrees with invoice",
    )?;
    // Revenue must equal the invoice subtotal, not merely offset the debit.
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         WHERE json_extract(i.payload,'$.subtotalPaise') IS NOT NULL
           AND (SELECT COUNT(*) FROM local_billing_ledger l
                WHERE l.invoice_id=i.id AND l.account='revenue')<>1",
        "invoice revenue leg not unique",
    )?;
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         JOIN local_billing_ledger l ON l.invoice_id=i.id AND l.account='revenue'
         WHERE l.amount_paise <> -CAST(json_extract(i.payload,'$.subtotalPaise') AS INTEGER)",
        "invoice revenue disagrees with invoice subtotal",
    )?;
    // Tax leg must exist exactly when the invoice charges tax, and match it.
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         WHERE CAST(json_extract(i.payload,'$.taxPaise') AS INTEGER) > 0
           AND NOT EXISTS(SELECT 1 FROM local_billing_ledger l
                          WHERE l.invoice_id=i.id AND l.account='tax_payable')",
        "invoice missing tax posting",
    )?;
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         WHERE CAST(json_extract(i.payload,'$.taxPaise') AS INTEGER) = 0
           AND EXISTS(SELECT 1 FROM local_billing_ledger l
                      WHERE l.invoice_id=i.id AND l.account='tax_payable')",
        "invoice has tax posting without tax",
    )?;
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         JOIN local_billing_ledger l ON l.invoice_id=i.id AND l.account='tax_payable'
         WHERE l.amount_paise <> -CAST(json_extract(i.payload,'$.taxPaise') AS INTEGER)",
        "invoice tax disagrees with invoice tax",
    )?;
    push(
        db,
        &mut v,
        "SELECT id FROM local_invoices
         WHERE CAST(json_extract(payload,'$.subtotalPaise') AS INTEGER)
             + CAST(json_extract(payload,'$.taxPaise') AS INTEGER)
             <> CAST(json_extract(payload,'$.totalPaise') AS INTEGER)",
        "invoice totals do not add up",
    )?;

    // ------------------------------------------------------------------
    // 2. Inventory movement arithmetic and missing stock postings.
    // ------------------------------------------------------------------
    push(
        db,
        &mut v,
        "SELECT id FROM local_products WHERE stock_milli<0",
        "negative inventory stock",
    )?;
    push(
        db,
        &mut v,
        "SELECT invoice_id||'/'||product_id FROM local_invoice_stock
         WHERE after_milli<>before_milli-quantity_milli",
        "invoice stock arithmetic broken",
    )?;
    // Every billed line must have a stock movement of exactly that quantity.
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         WHERE json_extract(i.payload,'$.lines') IS NOT NULL
           AND EXISTS(
             SELECT 1 FROM json_each(i.payload,'$.lines') ln
             WHERE NOT EXISTS(
               SELECT 1 FROM local_invoice_stock s
               WHERE s.invoice_id=i.id
                 AND s.product_id=json_extract(ln.value,'$.productId')
                 AND s.quantity_milli=CAST(json_extract(ln.value,'$.quantityMilli') AS INTEGER)))",
        "invoice line missing matching stock movement",
    )?;
    // ...and no stock movement may exist without its billed line.
    push(
        db,
        &mut v,
        "SELECT s.invoice_id||'/'||s.product_id FROM local_invoice_stock s
         JOIN local_invoices i ON i.id=s.invoice_id
         WHERE json_extract(i.payload,'$.lines') IS NOT NULL
           AND NOT EXISTS(
             SELECT 1 FROM json_each(i.payload,'$.lines') ln
             WHERE json_extract(ln.value,'$.productId')=s.product_id
               AND CAST(json_extract(ln.value,'$.quantityMilli') AS INTEGER)=s.quantity_milli)",
        "stock movement without matching invoice line",
    )?;

    // ------------------------------------------------------------------
    // 3. Customer credit outstanding and repayment/journal consistency.
    // ------------------------------------------------------------------
    push(
        db,
        &mut v,
        "SELECT operation_id FROM local_customer_journal
         GROUP BY operation_id HAVING SUM(amount_paise)<>0",
        "customer journal imbalance",
    )?;
    // A credit sale must produce its receivable. (Detects a deleted sale entry,
    // which silently understates customer outstanding.)
    push(
        db,
        &mut v,
        "SELECT i.id FROM local_invoices i
         WHERE json_extract(i.payload,'$.tender')='credit'
           AND NOT EXISTS(
             SELECT 1 FROM local_credit_entries c
             WHERE c.invoice_id=i.id AND c.kind='sale'
               AND c.amount_paise=CAST(json_extract(i.payload,'$.totalPaise') AS INTEGER)
               AND c.customer_id=json_extract(i.payload,'$.customerId'))",
        "credit sale missing matching credit entry",
    )?;
    // The reverse direction: a sale receivable must belong to a credit invoice
    // of exactly that value.
    push(
        db,
        &mut v,
        "SELECT c.operation_id FROM local_credit_entries c
         WHERE c.kind='sale'
           AND NOT EXISTS(
             SELECT 1 FROM local_invoices i
             WHERE i.id=c.invoice_id
               AND json_extract(i.payload,'$.tender')='credit'
               AND CAST(json_extract(i.payload,'$.totalPaise') AS INTEGER)=c.amount_paise)",
        "credit entry without matching credit invoice",
    )?;
    // Every non-sale credit entry that posts to the customer journal must equal
    // that journal's receivables leg. This holds for repayment, opening_due,
    // write_off and reversal by construction (the entry stores the balance
    // delta, which is exactly the receivables movement).
    push(
        db,
        &mut v,
        "SELECT c.operation_id||'/'||c.customer_id FROM local_credit_entries c
         WHERE c.kind<>'sale'
           AND EXISTS(SELECT 1 FROM local_customer_journal j
                      WHERE j.operation_id=c.operation_id AND j.customer_id=c.customer_id)
           AND COALESCE((SELECT SUM(j.amount_paise) FROM local_customer_journal j
                         WHERE j.operation_id=c.operation_id
                           AND j.customer_id=c.customer_id
                           AND j.account='receivables'),0) <> c.amount_paise",
        "credit entry disagrees with customer journal",
    )?;
    // Derived outstanding must never be negative (write paths reject overpayment).
    push(
        db,
        &mut v,
        "SELECT customer_id FROM local_credit_entries
         GROUP BY customer_id HAVING SUM(amount_paise)<0",
        "customer outstanding is negative",
    )?;

    // ------------------------------------------------------------------
    // 4. Retail journal: source-backed operations and return reconciliation.
    // ------------------------------------------------------------------
    push(
        db,
        &mut v,
        "SELECT operation_id FROM local_retail_journal GROUP BY operation_id HAVING SUM(amount)<>0",
        "retail journal imbalance",
    )?;
    // Every retail posting must belong to a recorded retail operation. Injected
    // or orphaned postings (including duplicated synthetic operations) fail here.
    push(
        db,
        &mut v,
        "SELECT DISTINCT j.operation_id FROM local_retail_journal j
         WHERE NOT EXISTS(SELECT 1 FROM local_retail_activity a
                          WHERE a.operation_id=j.operation_id)",
        "retail journal without source operation",
    )?;
    // A return's revenue/tax legs must equal the recorded return totals, so
    // duplicating a return's balanced postings is detected relationally.
    push(
        db,
        &mut v,
        "SELECT r.id FROM local_retail_returns r
         WHERE EXISTS(SELECT 1 FROM local_retail_journal j WHERE j.operation_id=r.id)
           AND (COALESCE((SELECT SUM(j.amount) FROM local_retail_journal j
                          WHERE j.operation_id=r.id AND j.account='revenue'),0) <> r.subtotal
             OR COALESCE((SELECT SUM(j.amount) FROM local_retail_journal j
                          WHERE j.operation_id=r.id AND j.account='tax_payable'),0) <> r.tax)",
        "retail return journal disagrees with return totals",
    )?;

    // ------------------------------------------------------------------
    // 5. Replication outbox idempotency keys (defense against on-disk damage).
    // ------------------------------------------------------------------
    for (table, key, label) in [
        (
            "local_billing_outbox",
            "invoice_id",
            "billing outbox duplicate operation",
        ),
        (
            "local_customer_outbox",
            "operation_id",
            "customer outbox duplicate operation",
        ),
        (
            "local_retail_outbox",
            "operation_id",
            "retail outbox duplicate operation",
        ),
        (
            "local_inventory_outbox",
            "operation_id",
            "inventory outbox duplicate operation",
        ),
    ] {
        push(
            db,
            &mut v,
            &format!("SELECT {key} FROM {table} GROUP BY {key} HAVING COUNT(*)>1"),
            label,
        )?;
    }

    Ok(v)
}

/// Reject financially inconsistent data. Called inside the restore transaction
/// before the completion transition, so a rejection rolls the import back and
/// leaves the original database and the recovery fence intact.
pub(crate) fn verify(db: &Connection) -> Result<(), StoreError> {
    if !violations(db)?.is_empty() {
        return Err(StoreError::FinancialInconsistency);
    }
    Ok(())
}
