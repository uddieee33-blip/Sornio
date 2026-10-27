//! Authoritative cash/credit posting. No renderer prices/totals or digital settlement.
use crate::{catalog::MAX_VALUE, Store, StoreError};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BillLine {
    pub product_id: String,
    pub expected_revision: i64,
    pub quantity_milli: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Tender {
    Cash,
    Credit,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostInvoice {
    pub operation_id: String,
    pub lines: Vec<BillLine>,
    pub tax_basis_points: i64,
    pub tender: Tender,
    pub customer_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostedLine {
    pub product_id: String,
    pub name: String,
    pub unit: String,
    pub quantity_milli: i64,
    pub unit_price_paise: i64,
    pub total_paise: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Invoice {
    pub id: String,
    pub created_at: String,
    pub lines: Vec<PostedLine>,
    pub subtotal_paise: i64,
    pub tax_paise: i64,
    pub total_paise: i64,
    pub tax_basis_points: i64,
    pub tender: Tender,
    pub customer_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceRecord {
    pub sequence: i64,
    pub invoice: Invoice,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxRecord {
    pub sequence: i64,
    pub invoice_id: String,
    pub payload: String,
}
fn valid_id(s: &str) -> bool {
    (1..=80).contains(&s.len())
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
fn amount(n: i128) -> Result<i64, StoreError> {
    if !(0..=MAX_VALUE as i128).contains(&n) {
        return Err(StoreError::InvalidInvoice);
    }
    Ok(n as i64)
}
/// Positive half-up arithmetic; same fixed-unit contract and fixtures as business-domain.
pub fn line_total(quantity: i64, price: i64) -> Result<i64, StoreError> {
    if !(1..=MAX_VALUE).contains(&quantity) || !(0..=MAX_VALUE).contains(&price) {
        return Err(StoreError::InvalidInvoice);
    }
    amount((quantity as i128 * price as i128 + 500) / 1000)
}
pub fn tax_total(subtotal: i64, bps: i64) -> Result<i64, StoreError> {
    if !(0..=MAX_VALUE).contains(&subtotal) || !(0..=10000).contains(&bps) {
        return Err(StoreError::InvalidInvoice);
    }
    amount((subtotal as i128 * bps as i128 + 5000) / 10000)
}
pub(crate) fn migrate(tx: &rusqlite::Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("billing-schema.sql"))?;
    for table in [
        "local_invoices",
        "local_invoice_stock",
        "local_billing_ledger",
        "local_billing_audit",
        "local_billing_outbox",
    ] {
        for action in ["UPDATE", "DELETE"] {
            tx.execute_batch(&format!("CREATE TRIGGER {table}_no_{action} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Posted billing records are immutable'); END;"))?;
        }
    }
    Ok(())
}
impl Store {
    pub fn post_invoice(&mut self, request: PostInvoice) -> Result<Invoice, StoreError> {
        if !valid_id(&request.operation_id)
            || request.lines.is_empty()
            || request.lines.len() > 100
            || !(0..=10000).contains(&request.tax_basis_points)
            || request.customer_id.as_ref().is_some_and(|s| !valid_id(s))
            || (request.tender == Tender::Credit && request.customer_id.is_none())
        {
            return Err(StoreError::InvalidInvoice);
        }
        for l in &request.lines {
            if !valid_id(&l.product_id)
                || l.expected_revision <= 0
                || !(1..=MAX_VALUE).contains(&l.quantity_milli)
            {
                return Err(StoreError::InvalidInvoice);
            }
        }
        let raw = serde_json::to_string(&request)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let previous: Option<(String, String)> = tx
            .query_row(
                "SELECT request,payload FROM local_invoices WHERE id=?1",
                [&request.operation_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((old, payload)) = previous {
            if old != raw {
                return Err(StoreError::OperationConflict);
            }
            return Ok(serde_json::from_str(&payload)?);
        }
        let mut quantities: BTreeMap<String, (i64, i64)> = BTreeMap::new();
        let mut lines = Vec::new();
        let mut subtotal = 0i64;
        for l in &request.lines {
            let (name, unit, price, revision): (String, String, i64, i64) = tx
                .query_row(
                    "SELECT name,unit,unit_price_paise,revision FROM local_products WHERE id=?1",
                    [&l.product_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?
                .ok_or(StoreError::ProductMissing)?;
            if revision != l.expected_revision {
                return Err(StoreError::StockConflict);
            }
            let q = quantities
                .entry(l.product_id.clone())
                .or_insert((0, revision));
            q.0 =
                q.0.checked_add(l.quantity_milli)
                    .ok_or(StoreError::InvalidInvoice)?;
            let total = line_total(l.quantity_milli, price)?;
            subtotal = amount(subtotal as i128 + total as i128)?;
            lines.push(PostedLine {
                product_id: l.product_id.clone(),
                name,
                unit,
                quantity_milli: l.quantity_milli,
                unit_price_paise: price,
                total_paise: total,
            });
        }
        if subtotal == 0 {
            return Err(StoreError::InvalidInvoice);
        }
        let tax = tax_total(subtotal, request.tax_basis_points)?;
        let total = amount(subtotal as i128 + tax as i128)?;
        let now: String = tx.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
            r.get(0)
        })?;
        let invoice = Invoice {
            id: request.operation_id.clone(),
            created_at: now,
            lines,
            subtotal_paise: subtotal,
            tax_paise: tax,
            total_paise: total,
            tax_basis_points: request.tax_basis_points,
            tender: request.tender,
            customer_id: request.customer_id,
        };
        let payload = serde_json::to_string(&invoice)?;
        tx.execute(
            "INSERT INTO local_invoices(id,request,payload) VALUES(?1,?2,?3)",
            params![invoice.id, raw, payload],
        )?;
        for (id, (quantity, revision)) in quantities {
            let before: i64 = tx.query_row(
                "SELECT stock_milli FROM local_products WHERE id=?1",
                [&id],
                |r| r.get(0),
            )?;
            if quantity > before {
                return Err(StoreError::InvalidStock);
            }
            let next_revision = revision.checked_add(1).ok_or(StoreError::InvalidInvoice)?;
            tx.execute(
                "UPDATE local_products SET stock_milli=?1,revision=?2 WHERE id=?3 AND revision=?4",
                params![before - quantity, next_revision, id, revision],
            )?;
            tx.execute("INSERT INTO local_invoice_stock(invoice_id,product_id,quantity_milli,before_milli,after_milli) VALUES(?1,?2,?3,?4,?5)",params![invoice.id,id,quantity,before,before-quantity])?;
        }
        let account = if invoice.tender == Tender::Cash {
            "cash"
        } else {
            "receivables"
        };
        tx.execute("INSERT INTO local_billing_ledger(invoice_id,account,customer_id,amount_paise) VALUES(?1,?2,?3,?4)",params![invoice.id,account,invoice.customer_id,total])?;
        tx.execute("INSERT INTO local_billing_ledger(invoice_id,account,amount_paise) VALUES(?1,'revenue',?2)",params![invoice.id,-subtotal])?;
        if tax > 0 {
            tx.execute("INSERT INTO local_billing_ledger(invoice_id,account,amount_paise) VALUES(?1,'tax_payable',?2)",params![invoice.id,-tax])?;
        }
        let event=serde_json::json!({"version":1,"kind":"invoice.posted","operationId":invoice.id,"invoice":invoice}).to_string();
        tx.execute(
            "INSERT INTO local_billing_audit(invoice_id,payload) VALUES(?1,?2)",
            params![invoice.id, event],
        )?;
        tx.execute(
            "INSERT INTO local_billing_outbox(invoice_id,payload) VALUES(?1,?2)",
            params![invoice.id, event],
        )?;
        tx.commit()?;
        Ok(invoice)
    }
    pub fn list_invoices(&self, after: i64) -> Result<Vec<InvoiceRecord>, StoreError> {
        if after < 0 {
            return Err(StoreError::InvalidInvoice);
        }
        let mut s=self.0.prepare("SELECT sequence,payload FROM local_invoices WHERE sequence>?1 ORDER BY sequence LIMIT 100")?;
        let rows = s.query_map([after], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (seq, payload) = row?;
            out.push(InvoiceRecord {
                sequence: seq,
                invoice: serde_json::from_str(&payload)?,
            });
        }
        Ok(out)
    }
    pub fn billing_outbox(&self, after: i64) -> Result<Vec<OutboxRecord>, StoreError> {
        if after < 0 {
            return Err(StoreError::InvalidInvoice);
        }
        let mut s=self.0.prepare("SELECT sequence,invoice_id,payload FROM local_billing_outbox WHERE sequence>?1 ORDER BY sequence LIMIT 100")?;
        let rows = s.query_map([after], |r| {
            Ok(OutboxRecord {
                sequence: r.get(0)?,
                invoice_id: r.get(1)?,
                payload: r.get(2)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{access::Workspace, catalog::AddProduct};
    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    fn product() -> AddProduct {
        AddProduct {
            operation_id: "rice".into(),
            name: "Sample rice".into(),
            sku: "RICE".into(),
            unit: "kg".into(),
            unit_price_paise: 4250,
            opening_stock_milli: 10000,
        }
    }
    fn bill() -> PostInvoice {
        PostInvoice {
            operation_id: "bill-1".into(),
            lines: vec![BillLine {
                product_id: "rice".into(),
                expected_revision: 1,
                quantity_milli: 1250,
            }],
            tax_basis_points: 500,
            tender: Tender::Cash,
            customer_id: None,
        }
    }
    fn count(s: &Store, table: &str) -> i64 {
        s.0.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }
    #[test]
    fn shared_rounding_vectors() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../business-domain/fixtures/native-invoices.json"
        ))
        .unwrap();
        for f in fixtures.as_array().unwrap() {
            let line = line_total(
                f["quantity"].as_i64().unwrap(),
                f["price"].as_i64().unwrap(),
            )
            .unwrap();
            assert_eq!(line, f["line"].as_i64().unwrap());
            let tax = tax_total(line, f["bps"].as_i64().unwrap()).unwrap();
            assert_eq!(tax, f["tax"].as_i64().unwrap());
            assert_eq!(line + tax, f["total"].as_i64().unwrap());
        }
        assert!(line_total(MAX_VALUE, MAX_VALUE).is_err());
        assert!(line_total(0, 100).is_err());
        assert!(tax_total(1, 10001).is_err());
    }
    #[test]
    fn cash_credit_restart_and_exact_retry() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("store.db");
        let mut s = Store::open(&path, KEY).unwrap();
        s.add_product(product()).unwrap();
        let cash = s.post_invoice(bill()).unwrap();
        assert_eq!(cash.total_paise, 5579);
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 8750);
        drop(s);
        let mut s = Store::open(&path, KEY).unwrap();
        assert_eq!(s.post_invoice(bill()).unwrap(), cash);
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 8750);
        let mut credit = bill();
        credit.operation_id = "bill-2".into();
        credit.lines[0].expected_revision = 2;
        credit.tender = Tender::Credit;
        credit.customer_id = Some("customer-1".into());
        s.post_invoice(credit).unwrap();
        assert_eq!(count(&s, "local_invoices"), 2);
        assert_eq!(count(&s, "local_billing_outbox"), 2);
        let balance: i64 =
            s.0.query_row(
                "SELECT SUM(amount_paise) FROM local_billing_ledger",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(balance, 0);
        let cash_count: i64 =
            s.0.query_row(
                "SELECT COUNT(*) FROM local_billing_ledger WHERE account='cash'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(cash_count, 1);
        let dues:i64=s.0.query_row("SELECT amount_paise FROM local_billing_ledger WHERE account='receivables' AND customer_id='customer-1'",[],|r|r.get(0)).unwrap();
        assert_eq!(dues, 5579);
        assert_eq!(s.billing_outbox(1).unwrap().len(), 1);
        assert_eq!(s.list_invoices(1).unwrap().len(), 1);
        let audit: String =
            s.0.query_row(
                "SELECT payload FROM local_billing_audit WHERE invoice_id='bill-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(audit, s.billing_outbox(0).unwrap()[0].payload);
        let mut changed = bill();
        changed.tax_basis_points = 0;
        assert!(matches!(
            s.post_invoice(changed),
            Err(StoreError::OperationConflict)
        ));
    }
    #[test]
    fn repeated_lines_are_aggregated_and_overselling_is_atomic() {
        let d = tempfile::tempdir().unwrap();
        let mut s = Store::open(&d.path().join("s.db"), KEY).unwrap();
        s.add_product(product()).unwrap();
        let mut b = bill();
        b.lines[0].quantity_milli = 6000;
        b.lines.push(b.lines[0].clone());
        assert!(matches!(
            s.post_invoice(b.clone()),
            Err(StoreError::InvalidStock)
        ));
        assert_eq!(count(&s, "local_invoices"), 0);
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 10000);
        b.lines[0].quantity_milli = 1000;
        b.lines[1].quantity_milli = 2000;
        s.post_invoice(b).unwrap();
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 7000);
        assert_eq!(s.list_products().unwrap()[0].revision, 2);
        assert_eq!(count(&s, "local_invoice_stock"), 1);
    }
    #[test]
    fn failures_at_every_write_boundary_rollback_all_effects() {
        for table in [
            "local_invoices",
            "local_invoice_stock",
            "local_billing_ledger",
            "local_billing_audit",
            "local_billing_outbox",
        ] {
            let d = tempfile::tempdir().unwrap();
            let path = d.path().join("s.db");
            let mut s = Store::open(&path, KEY).unwrap();
            s.add_product(product()).unwrap();
            s.0.execute_batch(&format!("CREATE TRIGGER fail_post BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'write failure'); END;")).unwrap();
            assert!(s.post_invoice(bill()).is_err());
            drop(s);
            let s = Store::open(&path, KEY).unwrap();
            for t in [
                "local_invoices",
                "local_invoice_stock",
                "local_billing_ledger",
                "local_billing_audit",
                "local_billing_outbox",
            ] {
                assert_eq!(count(&s, t), 0);
            }
            assert_eq!(s.list_products().unwrap()[0].stock_milli, 10000);
            assert_eq!(s.list_products().unwrap()[0].revision, 1);
        }
    }
    #[test]
    fn stale_connection_validation_lock_and_immutability() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut a = Store::open(&path, KEY).unwrap();
        a.add_product(product()).unwrap();
        let mut b = Store::open(&path, KEY).unwrap();
        a.post_invoice(bill()).unwrap();
        let mut stale = bill();
        stale.operation_id = "bill-2".into();
        assert!(matches!(
            b.post_invoice(stale),
            Err(StoreError::StockConflict)
        ));
        for t in [
            "local_invoices",
            "local_invoice_stock",
            "local_billing_ledger",
            "local_billing_audit",
            "local_billing_outbox",
        ] {
            assert!(a.0.execute(&format!("DELETE FROM {t}"), []).is_err());
        }
        let mut invalid = bill();
        invalid.tender = Tender::Credit;
        assert!(matches!(
            a.post_invoice(invalid),
            Err(StoreError::InvalidInvoice)
        ));
        assert!(serde_json::from_value::<PostInvoice>(serde_json::json!({"operationId":"x","lines":[],"taxBasisPoints":0,"tender":"upi","customerId":null})).is_err());
        let mut w = Workspace::new(a);
        assert!(matches!(w.post_invoice(bill()), Err(StoreError::Locked)));
        assert!(matches!(w.list_invoices(0), Err(StoreError::Locked)));
        assert!(matches!(w.billing_outbox(0), Err(StoreError::Locked)));
        w.setup("Billing test password").unwrap();
        assert_eq!(w.list_invoices(0).unwrap().len(), 1);
        w.lock();
        assert!(matches!(w.billing_outbox(0), Err(StoreError::Locked)));
    }
    #[test]
    fn v4_migration_preserves_catalogue_and_access() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = Store::open(&path, KEY).unwrap();
        s.add_product(product()).unwrap();
        s.0.execute_batch("DROP TABLE local_billing_outbox; DROP TABLE local_billing_audit; DROP TABLE local_billing_ledger; DROP TABLE local_invoice_stock; DROP TABLE local_invoices; PRAGMA user_version=4;").unwrap();
        let mut w = Workspace::new(s);
        w.setup("Existing billing password").unwrap();
        drop(w);
        let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
        w.unlock("Existing billing password").unwrap();
        assert_eq!(w.list_products().unwrap()[0].stock_milli, 10000);
        w.post_invoice(bill()).unwrap();
    }
    #[test]
    fn full_disk_rolls_back_invoice_stock_ledger_audit_and_outbox() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = Store::open(&path, KEY).unwrap();
        s.add_product(product()).unwrap();
        let pages: i64 =
            s.0.pragma_query_value(None, "page_count", |r| r.get(0))
                .unwrap();
        s.0.pragma_update(None, "max_page_count", pages + 2)
            .unwrap();
        let mut failed = false;
        for index in 0..1000 {
            let before = s.list_products().unwrap();
            let invoices = count(&s, "local_invoices");
            let ledger = count(&s, "local_billing_ledger");
            let mut b = bill();
            b.operation_id = format!("fill-{index}");
            b.lines[0].expected_revision = before[0].revision;
            b.lines[0].quantity_milli = 1;
            match s.post_invoice(b) {
                Ok(_) => {}
                Err(StoreError::Database(e)) => {
                    assert_eq!(e.sqlite_error_code(), Some(rusqlite::ErrorCode::DiskFull));
                    assert_eq!(s.list_products().unwrap(), before);
                    for t in [
                        "local_invoices",
                        "local_invoice_stock",
                        "local_billing_audit",
                        "local_billing_outbox",
                    ] {
                        assert_eq!(count(&s, t), invoices);
                    }
                    assert_eq!(count(&s, "local_billing_ledger"), ledger);
                    drop(s);
                    assert_eq!(
                        Store::open(&path, KEY).unwrap().list_products().unwrap(),
                        before
                    );
                    failed = true;
                    break;
                }
                Err(e) => panic!("Unexpected error: {e}"),
            }
        }
        assert!(failed);
    }
    #[test]
    fn crash_worker() {
        if let Some(path) = std::env::var_os("SORNIO_TEST_CRASH_DB") {
            let mut s = Store::open(std::path::Path::new(&path), KEY).unwrap();
            let tx = s.0.transaction().unwrap();
            tx.execute("UPDATE local_products SET stock_milli=0", [])
                .unwrap();
            tx.execute(
                "INSERT INTO local_invoices(id,request,payload) VALUES('interrupted','{}','{}')",
                [],
            )
            .unwrap();
            std::process::exit(88);
        }
    }
    #[test]
    fn process_death_before_commit_preserves_stock_and_records() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = Store::open(&path, KEY).unwrap();
        s.add_product(product()).unwrap();
        drop(s);
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "billing::tests::crash_worker"])
            .env("SORNIO_TEST_CRASH_DB", &path)
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(88));
        let s = Store::open(&path, KEY).unwrap();
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 10000);
        assert_eq!(count(&s, "local_invoices"), 0);
    }
}
