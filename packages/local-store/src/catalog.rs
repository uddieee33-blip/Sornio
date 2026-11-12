//! Bounded inventory on the encrypted device store, with native staff guards
//! and atomic recoverable receipts. Outbox storage does not imply active sync.
use crate::{Store, StoreError};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

pub const MAX_VALUE: i64 = 9_000_000_000_000;
const MAX_PRODUCTS: i64 = 5_000;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub sku: String,
    pub unit: String,
    pub unit_price_paise: i64,
    pub stock_milli: i64,
    pub revision: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddProduct {
    pub operation_id: String,
    pub name: String,
    pub sku: String,
    pub unit: String,
    pub unit_price_paise: i64,
    pub opening_stock_milli: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdjustStock {
    pub operation_id: String,
    pub product_id: String,
    pub expected_revision: i64,
    pub delta_milli: i64,
    pub reason: String,
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(
        "CREATE TABLE local_products (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs','kg','litre','metre')),
        unit_price_paise INTEGER NOT NULL CHECK(unit_price_paise BETWEEN 0 AND 9000000000000),
        stock_milli INTEGER NOT NULL CHECK(stock_milli BETWEEN 0 AND 9000000000000),
        revision INTEGER NOT NULL CHECK(revision > 0)
    );
    CREATE UNIQUE INDEX local_products_sku ON local_products(sku) WHERE sku <> '';
    CREATE TABLE local_inventory_events (
        operation_id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL REFERENCES local_products(id),
        kind TEXT NOT NULL CHECK(kind IN ('product_added','stock_adjusted')),
        request TEXT NOT NULL,
        result TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TRIGGER local_inventory_no_update BEFORE UPDATE ON local_inventory_events
        BEGIN SELECT RAISE(ABORT, 'Inventory history is append only'); END;
    CREATE TRIGGER local_inventory_no_delete BEFORE DELETE ON local_inventory_events
        BEGIN SELECT RAISE(ABORT, 'Inventory history is append only'); END;
    PRAGMA user_version = 4;",
    )?;
    Ok(())
}

fn valid_id(value: &str) -> bool {
    (1..=80).contains(&value.len())
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

fn text_valid(value: &str, max: usize, allow_empty: bool) -> bool {
    value.len() <= max * 4
        && value.chars().count() <= max
        && (allow_empty || !value.trim().is_empty())
        && !value.chars().any(char::is_control)
}

fn product_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        name: row.get(1)?,
        sku: row.get(2)?,
        unit: row.get(3)?,
        unit_price_paise: row.get(4)?,
        stock_milli: row.get(5)?,
        revision: row.get(6)?,
    })
}

fn replay(
    tx: &Transaction<'_>,
    id: &str,
    kind: &str,
    request: &str,
) -> Result<Option<Product>, StoreError> {
    let previous: Option<(String, String, String)> = tx
        .query_row(
            "SELECT kind, request, result FROM local_inventory_events WHERE operation_id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    match previous {
        Some((old_kind, old_request, result)) if old_kind == kind && old_request == request => {
            Ok(Some(serde_json::from_str(&result)?))
        }
        Some(_) => Err(StoreError::OperationConflict),
        None => Ok(None),
    }
}

fn record(
    tx: &Transaction<'_>,
    id: &str,
    kind: &str,
    request: &str,
    product: &Product,
) -> Result<(), StoreError> {
    crate::inventory_recovery::one(
        tx,
        "INSERT INTO local_inventory_events(operation_id, product_id, kind, request, result)
        VALUES(?1, ?2, ?3, ?4, ?5)",
        params![
            id,
            product.id,
            kind,
            request,
            serde_json::to_string(product)?
        ],
    )?;
    Ok(())
}

impl Store {
    pub(crate) fn list_products(&self) -> Result<Vec<Product>, StoreError> {
        let mut query = self.0.prepare(
            "SELECT id, name, sku, unit, unit_price_paise, stock_milli, revision
            FROM local_products ORDER BY name COLLATE NOCASE, id LIMIT 5001",
        )?;
        let products = query
            .query_map([], product_row)?
            .collect::<Result<Vec<_>, _>>()?;
        if products.len() > MAX_PRODUCTS as usize {
            return Err(StoreError::CatalogFull);
        }
        Ok(products)
    }

    pub(crate) fn add_product(&mut self, request: AddProduct) -> Result<Product, StoreError> {
        if !valid_id(&request.operation_id)
            || !text_valid(&request.name, 120, false)
            || !text_valid(&request.sku, 80, true)
            || !matches!(request.unit.as_str(), "pcs" | "kg" | "litre" | "metre")
            || !(0..=MAX_VALUE).contains(&request.unit_price_paise)
            || !(0..=MAX_VALUE).contains(&request.opening_stock_milli)
        {
            return Err(StoreError::InvalidProduct);
        }
        // Preserve the exact bounded request so reusing an operation ID with
        // different input is rejected, even if it normalizes to the same item.
        let payload = serde_json::to_string(&request)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        crate::identity::guard(
            &tx,
            &self.1,
            crate::identity::Permission::AddItem,
            "inventory.item_created",
            Some(&request.operation_id),
        )?;
        if let Some(product) = replay(&tx, &request.operation_id, "product_added", &payload)? {
            crate::inventory_recovery::reader(&tx, &self.1, &request.operation_id)?;
            return Ok(product);
        }
        crate::inventory_recovery::guard(&tx, &self.1, &request.operation_id)?;
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM local_products", [], |r| r.get(0))?;
        if count >= MAX_PRODUCTS {
            return Err(StoreError::CatalogFull);
        }
        let sku = request.sku.trim().to_ascii_uppercase();
        if !sku.is_empty()
            && tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM local_products WHERE sku = ?1)",
                [&sku],
                |r| r.get::<_, bool>(0),
            )?
        {
            return Err(StoreError::DuplicateSku);
        }
        let product = Product {
            id: request.operation_id.clone(),
            name: request.name.trim().into(),
            sku,
            unit: request.unit,
            unit_price_paise: request.unit_price_paise,
            stock_milli: request.opening_stock_milli,
            revision: 1,
        };
        crate::inventory_recovery::one(&tx,"INSERT INTO local_products(id, name, sku, unit, unit_price_paise, stock_milli, revision)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6, 1)", params![product.id, product.name, product.sku,
                product.unit, product.unit_price_paise, product.stock_milli])?;
        record(
            &tx,
            &request.operation_id,
            "product_added",
            &payload,
            &product,
        )?;
        crate::inventory_recovery::committed(
            &tx,
            &self.1,
            &request.operation_id,
            "product_added",
            &product,
        )?;
        tx.commit()?;
        Ok(product)
    }

    pub(crate) fn adjust_stock(&mut self, request: AdjustStock) -> Result<Product, StoreError> {
        if !valid_id(&request.operation_id)
            || !valid_id(&request.product_id)
            || request.expected_revision <= 0
            || request.delta_milli == 0
            || !(-MAX_VALUE..=MAX_VALUE).contains(&request.delta_milli)
            || !text_valid(&request.reason, 200, false)
        {
            return Err(StoreError::InvalidProduct);
        }
        let payload = serde_json::to_string(&request)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        crate::identity::guard(
            &tx,
            &self.1,
            crate::identity::Permission::CorrectStock,
            "inventory.corrected",
            Some(&request.operation_id),
        )?;
        if let Some(product) = replay(&tx, &request.operation_id, "stock_adjusted", &payload)? {
            crate::inventory_recovery::reader(&tx, &self.1, &request.operation_id)?;
            return Ok(product);
        }
        crate::inventory_recovery::guard(&tx, &self.1, &request.operation_id)?;
        let mut product = tx
            .query_row(
                "SELECT id, name, sku, unit, unit_price_paise, stock_milli, revision
            FROM local_products WHERE id = ?1",
                [&request.product_id],
                product_row,
            )
            .optional()?
            .ok_or(StoreError::ProductMissing)?;
        if product.revision != request.expected_revision {
            return Err(StoreError::StockConflict);
        }
        let next = product
            .stock_milli
            .checked_add(request.delta_milli)
            .ok_or(StoreError::InvalidProduct)?;
        if !(0..=MAX_VALUE).contains(&next) {
            return Err(StoreError::InvalidStock);
        }
        product.stock_milli = next;
        product.revision = product
            .revision
            .checked_add(1)
            .ok_or(StoreError::InvalidProduct)?;
        crate::inventory_recovery::one(&tx,
            "UPDATE local_products SET stock_milli = ?1, revision = ?2 WHERE id = ?3 AND revision = ?4",
            params![product.stock_milli, product.revision, product.id, request.expected_revision],
        )?;
        record(
            &tx,
            &request.operation_id,
            "stock_adjusted",
            &payload,
            &product,
        )?;
        crate::inventory_recovery::committed(
            &tx,
            &self.1,
            &request.operation_id,
            "stock_adjusted",
            &product,
        )?;
        tx.commit()?;
        Ok(product)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    pub(crate) fn sample() -> AddProduct {
        AddProduct {
            operation_id: "product-1".into(),
            name: "Private rice sample".into(),
            sku: " rice-1 ".into(),
            unit: "kg".into(),
            unit_price_paise: 4250,
            opening_stock_milli: 1250,
        }
    }
    fn change(revision: i64, delta: i64) -> AdjustStock {
        AdjustStock {
            operation_id: "adjust-1".into(),
            product_id: "product-1".into(),
            expected_revision: revision,
            delta_milli: delta,
            reason: "Counted delivery".into(),
        }
    }
    #[test]
    fn stock_and_idempotency_survive_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut s = Store::open(&path, KEY).unwrap();
        let p = s.add_product(sample()).unwrap();
        assert_eq!(p.sku, "RICE-1");
        assert_eq!(s.add_product(sample()).unwrap(), p);
        let adjusted = s.adjust_stock(change(1, 2750)).unwrap();
        assert_eq!(adjusted.stock_milli, 4000);
        drop(s);
        let mut s = Store::open(&path, KEY).unwrap();
        assert_eq!(s.adjust_stock(change(1, 2750)).unwrap(), adjusted);
        assert_eq!(s.list_products().unwrap(), vec![adjusted]);
        assert_eq!(
            s.0.query_row("SELECT COUNT(*) FROM local_inventory_events", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        drop(s);
        for f in std::fs::read_dir(dir.path()).unwrap() {
            let bytes = std::fs::read(f.unwrap().path()).unwrap();
            assert!(!bytes
                .windows(b"Private rice sample".len())
                .any(|w| w == b"Private rice sample"));
        }
    }
    #[test]
    fn stale_connections_negative_stock_and_changed_retries_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut a = Store::open(&path, KEY).unwrap();
        let mut b = Store::open(&path, KEY).unwrap();
        a.add_product(sample()).unwrap();
        a.adjust_stock(change(1, 1000)).unwrap();
        let mut stale = change(1, 500);
        stale.operation_id = "stale-1".into();
        assert!(matches!(
            b.adjust_stock(stale),
            Err(StoreError::StockConflict)
        ));
        assert!(matches!(
            a.adjust_stock(change(1, 2000)),
            Err(StoreError::OperationConflict)
        ));
        let mut negative = change(2, -2251);
        negative.operation_id = "negative-1".into();
        assert!(matches!(
            a.adjust_stock(negative),
            Err(StoreError::InvalidStock)
        ));
        let mut different = sample();
        different.name = "Different item".into();
        assert!(matches!(
            a.add_product(different),
            Err(StoreError::OperationConflict)
        ));
        let mut duplicate = sample();
        duplicate.operation_id = "product-2".into();
        duplicate.sku = "Rice-1".into();
        assert!(matches!(
            a.add_product(duplicate),
            Err(StoreError::DuplicateSku)
        ));
        assert_eq!(a.list_products().unwrap()[0].stock_milli, 2250);
    }
    #[test]
    fn failed_event_write_rolls_back_stock_and_product_creation() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(&dir.path().join("store.db"), KEY).unwrap();
        s.0.execute_batch("CREATE TRIGGER fail_events BEFORE INSERT ON local_inventory_events BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
        assert!(s.add_product(sample()).is_err());
        assert!(s.list_products().unwrap().is_empty());
        s.0.execute_batch("DROP TRIGGER fail_events;").unwrap();
        s.add_product(sample()).unwrap();
        s.0.execute_batch("CREATE TRIGGER fail_events BEFORE INSERT ON local_inventory_events BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
        assert!(s.adjust_stock(change(1, 1000)).is_err());
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 1250);
        assert_eq!(s.list_products().unwrap()[0].revision, 1);
    }
    #[test]
    fn malformed_values_and_history_rewrites_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(&dir.path().join("store.db"), KEY).unwrap();
        for field in 0..5 {
            let mut p = sample();
            match field {
                0 => p.unit_price_paise = -1,
                1 => p.opening_stock_milli = MAX_VALUE + 1,
                2 => p.name = " ".into(),
                3 => p.unit = "unknown".into(),
                _ => p.operation_id = "bad/id".into(),
            }
            assert!(matches!(s.add_product(p), Err(StoreError::InvalidProduct)));
        }
        s.add_product(sample()).unwrap();
        assert!(s
            .0
            .execute(
                "UPDATE local_inventory_events SET kind = 'stock_adjusted'",
                []
            )
            .is_err());
        assert!(s
            .0
            .execute("DELETE FROM local_inventory_events", [])
            .is_err());
        s.0.pragma_update(None, "query_only", true).unwrap();
        assert!(s.adjust_stock(change(1, 1000)).is_err());
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 1250);
    }

    #[test]
    fn version_three_migration_keeps_drafts_password_and_locking() {
        use crate::{access::Workspace, Draft};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut s = Store::open(&path, KEY).unwrap();
        let draft = Draft {
            business_name: "Existing sample".into(),
            business_type: "kirana".into(),
            note: "Keep this".into(),
        };
        s.save(0, draft.clone()).unwrap();
        s.0.execute(
            "UPDATE workspace_access SET password_hash=?1",
            [crate::access::hash_password("Existing local password").unwrap()],
        )
        .unwrap();
        crate::lan_authority::remove_fixture_tables(&s.0);
        crate::schema_rollback::drop_tables_newer_than(&s.0, 3);
        s.0.execute_batch("DROP TABLE local_inventory_pending; DROP TABLE local_inventory_outbox; DROP TABLE local_inventory_actors; DROP TABLE local_retail_outbox; DROP TABLE local_retail_pending; DROP TABLE local_retail_canceled; DROP TABLE local_retail_events; DROP TABLE local_retail_journal; DROP TABLE local_retail_activity; DROP TABLE local_retail_return_items; DROP TABLE local_retail_return_parts; DROP TABLE local_retail_refunds; DROP TABLE local_retail_returns; DROP TABLE local_retail_payments; DROP TABLE local_retail_float_corrections; DROP TABLE local_retail_floats; DROP TABLE local_retail_closings; DROP TABLE local_retail_ops; DROP TABLE local_customer_journal; DROP TABLE local_customer_outbox; DROP TABLE local_customer_pending; DROP TABLE local_customer_canceled; DROP TABLE local_credit_entries; DROP TABLE local_customer_ops; DROP TABLE local_customers; DROP TABLE local_checkout_canceled; DROP TABLE local_checkout; DROP TABLE local_invoice_actors; DROP TABLE local_identity_audit; DROP TABLE local_principals; DROP TABLE local_identity; DROP TABLE local_billing_outbox; DROP TABLE local_billing_audit; DROP TABLE local_billing_ledger; DROP TABLE local_invoice_stock; DROP TABLE local_invoices; DROP TABLE local_inventory_events; DROP TABLE local_products; PRAGMA user_version = 3;").unwrap();
        drop(s);
        let s = Store::open(&path, KEY).unwrap();
        assert_eq!(s.load().unwrap().draft, Some(draft));
        assert!(s.list_products().unwrap().is_empty());
        let mut w = Workspace::new(s);
        assert!(w.status().unwrap().configured);
        assert!(matches!(w.list_products(), Err(StoreError::Locked)));
        w.unlock("Existing local password").unwrap();
        w.add_product(sample()).unwrap();
        w.lock();
        assert!(matches!(w.list_products(), Err(StoreError::Locked)));
    }

    #[test]
    fn full_database_does_not_leave_a_partial_stock_change() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.db");
        let mut s = Store::open(&path, KEY).unwrap();
        s.add_product(sample()).unwrap();
        let pages: i64 =
            s.0.pragma_query_value(None, "page_count", |r| r.get(0))
                .unwrap();
        s.0.pragma_update(None, "max_page_count", pages + 1)
            .unwrap();
        let mut failed = false;
        for index in 0..1000 {
            let before = s.list_products().unwrap();
            let events: i64 =
                s.0.query_row("SELECT COUNT(*) FROM local_inventory_events", [], |r| {
                    r.get(0)
                })
                .unwrap();
            let mut request = change(before[0].revision, 1);
            request.operation_id = format!("fill-{index}");
            request.reason = "x".repeat(200);
            match s.adjust_stock(request) {
                Ok(_) => {}
                Err(StoreError::Database(error)) => {
                    assert_eq!(
                        error.sqlite_error_code(),
                        Some(rusqlite::ErrorCode::DiskFull)
                    );
                    assert_eq!(s.list_products().unwrap(), before);
                    assert_eq!(
                        s.0.query_row("SELECT COUNT(*) FROM local_inventory_events", [], |r| r
                            .get::<_, i64>(0))
                            .unwrap(),
                        events
                    );
                    drop(s);
                    assert_eq!(
                        Store::open(&path, KEY).unwrap().list_products().unwrap(),
                        before
                    );
                    failed = true;
                    break;
                }
                Err(error) => panic!("Unexpected failure: {error}"),
            }
        }
        assert!(
            failed,
            "The size limit must actually force a full-database error"
        );
    }
}
