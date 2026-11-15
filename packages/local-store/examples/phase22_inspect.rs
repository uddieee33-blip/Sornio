//! Read-only reconciliation of a synthetic phase22 fixture, never a shop file.
use rusqlite::{Connection, OpenFlags};
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).expect("synthetic database path");
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    db.pragma_update(
        None,
        "key",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    )?;
    let scalar = |sql: &str| -> rusqlite::Result<i64> { db.query_row(sql, [], |r| r.get(0)) };
    let integrity: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    println!(
        "{}",
        json!({
            "schema": scalar("PRAGMA user_version")?, "integrity": integrity,
            "products": scalar("SELECT COUNT(*) FROM local_products")?,
            "customers": scalar("SELECT COUNT(*) FROM local_customers")?,
            "invoices": scalar("SELECT COUNT(*) FROM local_invoices")?,
            "suppliers": scalar("SELECT COUNT(*) FROM local_suppliers")?,
            "purchaseOrders": scalar("SELECT COUNT(*) FROM local_purchase_orders")?,
            "supplierJournalUnbalancedOperations": scalar("SELECT COUNT(*) FROM (SELECT operation_id FROM local_supplier_journal GROUP BY operation_id HAVING SUM(amount_paise)<>0)")?,
            "supplierEntriesPaise": scalar("SELECT COALESCE(SUM(amount_paise),0) FROM local_supplier_entries")?,
            "stockMilli": scalar("SELECT COALESCE(SUM(stock_milli),0) FROM local_products")?,
            "cipher": db.query_row("PRAGMA cipher_version", [], |r| r.get::<_, String>(0))?,
        })
    );
    Ok(())
}
