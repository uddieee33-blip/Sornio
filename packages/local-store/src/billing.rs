//! Authoritative cash/credit posting. No renderer prices/totals or digital settlement.
use crate::{catalog::MAX_VALUE, Store, StoreError};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[cfg(test)]
#[path = "billing_reliability_tests.rs"]
mod reliability_tests;

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
    Retail,
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
impl PostInvoice {
    /// Keep the IPC contract aligned with business-domain's shared validation fixtures.
    pub(crate) fn validate(&self) -> Result<(), StoreError> {
        if !valid_id(&self.operation_id)
            || self.lines.is_empty()
            || self.lines.len() > 100
            || !(0..=10000).contains(&self.tax_basis_points)
            || self.customer_id.as_ref().is_some_and(|s| !valid_id(s))
            || (self.tender == Tender::Credit && self.customer_id.is_none())
        {
            return Err(StoreError::InvalidInvoice);
        }
        for line in &self.lines {
            if !valid_id(&line.product_id)
                || !(1..=9_007_199_254_740_991).contains(&line.expected_revision)
                || !(1..=MAX_VALUE).contains(&line.quantity_milli)
            {
                return Err(StoreError::InvalidInvoice);
            }
        }
        Ok(())
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invoice_number: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_name: Option<String>,
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
pub(crate) fn valid_id(s: &str) -> bool {
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
fn insert_one(
    tx: &rusqlite::Transaction<'_>,
    sql: &str,
    values: impl rusqlite::Params,
) -> Result<(), StoreError> {
    let changed = tx.execute(sql, values)?;
    if changed != 1 {
        return Err(rusqlite::Error::StatementChangedRows(changed).into());
    }
    Ok(())
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
pub(crate) fn post_into(
    tx: &rusqlite::Transaction<'_>,
    session: &Option<crate::identity::Session>,
    request: PostInvoice,
    prepared: bool,
    retail: Option<&[crate::payments::PaymentPart]>,
) -> Result<Invoice, StoreError> {
    request.validate()?;
    if (request.tender == Tender::Retail) != retail.is_some() {
        return Err(StoreError::InvalidPayment);
    }
    let raw = serde_json::to_string(&request)?;
    crate::identity::guard(
        &tx,
        session,
        crate::identity::Permission::Sell,
        "sale.posted",
        Some(&request.operation_id),
    )?;
    crate::identity::checkout_actor(&tx, session)?;
    crate::payments::invoice_id_check(tx, &request.operation_id, retail.is_some())?;
    let previous: Option<(String, String)> = tx
        .query_row(
            "SELECT request,payload FROM local_invoices WHERE id=?1",
            [&request.operation_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((old, payload)) = previous {
        crate::identity::invoice_reader(&tx, session, &request.operation_id)?;
        if old != raw {
            return Err(StoreError::OperationConflict);
        }
        return Ok(serde_json::from_str(&payload)?);
    }
    let canceled: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_checkout_canceled WHERE operation_id=?1)",
        [&request.operation_id],
        |r| r.get(0),
    )?;
    if canceled {
        return Err(StoreError::CheckoutActive);
    }
    if prepared {
        let checkpoint: Option<String> = tx
            .query_row(
                "SELECT request FROM local_checkout WHERE singleton=1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if checkpoint.as_deref() != Some(raw.as_str()) {
            return Err(StoreError::CheckoutActive);
        }
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
    let last_sequence: Option<i64> = tx
        .query_row(
            "SELECT seq FROM sqlite_sequence WHERE name='local_invoices'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    let sequence = last_sequence
        .unwrap_or(0)
        .checked_add(1)
        .ok_or(StoreError::InvalidInvoice)?;
    let (business_id, business_name): (String, String) = tx.query_row(
        "SELECT business_id,business_name FROM local_identity WHERE singleton=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let invoice = Invoice {
        id: request.operation_id.clone(),
        invoice_number: Some(format!("S-{sequence:012}")),
        business_id: Some(business_id),
        business_name: Some(business_name),
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
    insert_one(
        &tx,
        "INSERT INTO local_invoices(sequence,id,request,payload) VALUES(?1,?2,?3,?4)",
        params![sequence, invoice.id, raw, payload],
    )?;
    insert_one(
        &tx,
        "INSERT INTO local_invoice_actors(invoice_id,actor_id) VALUES(?1,?2)",
        params![invoice.id, session.as_ref().map(|s| s.actor_id.as_str())],
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
        let changed = tx.execute(
            "UPDATE local_products SET stock_milli=?1,revision=?2 WHERE id=?3 AND revision=?4",
            params![before - quantity, next_revision, id, revision],
        )?;
        if changed != 1 {
            return Err(StoreError::StockConflict);
        }
        insert_one(&tx,"INSERT INTO local_invoice_stock(invoice_id,product_id,quantity_milli,before_milli,after_milli) VALUES(?1,?2,?3,?4,?5)",params![invoice.id,id,quantity,before,before-quantity])?;
    }
    let account = if invoice.tender == Tender::Cash {
        "cash"
    } else {
        "receivables"
    };
    insert_one(&tx,"INSERT INTO local_billing_ledger(invoice_id,account,customer_id,amount_paise) VALUES(?1,?2,?3,?4)",params![invoice.id,account,invoice.customer_id,total])?;
    insert_one(
        &tx,
        "INSERT INTO local_billing_ledger(invoice_id,account,amount_paise) VALUES(?1,'revenue',?2)",
        params![invoice.id, -subtotal],
    )?;
    if tax > 0 {
        insert_one(&tx,"INSERT INTO local_billing_ledger(invoice_id,account,amount_paise) VALUES(?1,'tax_payable',?2)",params![invoice.id,-tax])?;
    }
    if invoice.tender != Tender::Retail {
        crate::customers::post_sale(tx, session, &invoice)?;
    } else if let Some(parts) = retail {
        // Split tender: only the credit part becomes customer debt; the rest
        // of the invoice total stays in receivables until paid or matched.
        let credit = parts
            .iter()
            .filter(|p| p.method == "credit")
            .try_fold(0i64, |v, p| {
                v.checked_add(p.amount_paise).ok_or(StoreError::InvalidPayment)
            })?;
        if credit > 0 {
            let customer_id = invoice
                .customer_id
                .clone()
                .ok_or(StoreError::InvalidCredit)?;
            crate::customers::post_split_credit(tx, session, &invoice, &customer_id, credit)?;
        } else if invoice.customer_id.is_some() {
            return Err(StoreError::InvalidPayment);
        }
    }
    crate::payments::invoice_posted(tx, session, &invoice, retail)?;
    let event=serde_json::json!({"version":1,"kind":"invoice.posted","operationId":invoice.id,"invoice":invoice}).to_string();
    insert_one(
        &tx,
        "INSERT INTO local_billing_audit(invoice_id,payload) VALUES(?1,?2)",
        params![invoice.id, event],
    )?;
    insert_one(
        &tx,
        "INSERT INTO local_billing_outbox(invoice_id,payload) VALUES(?1,?2)",
        params![invoice.id, event],
    )?;
    Ok(invoice)
}
impl Store {
    pub(crate) fn post_invoice(&mut self, request: PostInvoice) -> Result<Invoice, StoreError> {
        self.post_invoice_inner(request, false)
    }
    pub(crate) fn post_prepared_invoice(
        &mut self,
        request: PostInvoice,
    ) -> Result<Invoice, StoreError> {
        self.post_invoice_inner(request, true)
    }
    fn post_invoice_inner(
        &mut self,
        request: PostInvoice,
        prepared: bool,
    ) -> Result<Invoice, StoreError> {
        request.validate()?;
        if request.tender == Tender::Retail {
            return Err(StoreError::InvalidPayment);
        }
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let invoice = post_into(&tx, &self.1, request, prepared, None)?;
        #[cfg(test)]
        if std::env::var("SORNIO_TEST_BILL_CRASH_PHASE").as_deref() == Ok("before_commit") {
            std::process::exit(88);
        }
        tx.commit()?;
        Ok(invoice)
    }
    /// Read an immutable receipt under Workspace's authenticated read snapshot.
    /// Cashiers/assistants may read their own receipts; report roles may read all.
    pub(crate) fn read_invoice(&self, id: &str) -> Result<Invoice, StoreError> {
        if !valid_id(id) {
            return Err(StoreError::InvalidInvoice);
        }
        crate::identity::invoice_reader(&self.0, &self.1, id)?;
        let payload: String = self
            .0
            .query_row(
                "SELECT payload FROM local_invoices WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or(StoreError::InvoiceMissing)?;
        Ok(serde_json::from_str(&payload)?)
    }
    pub(crate) fn list_invoices(&self, after: i64) -> Result<Vec<InvoiceRecord>, StoreError> {
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
    pub(crate) fn billing_outbox(&self, after: i64) -> Result<Vec<OutboxRecord>, StoreError> {
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
    fn invoice_numbers_are_transactional_unique_and_stable_on_retry() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = Store::open(&path, KEY).unwrap();
        s.add_product(product()).unwrap();
        let first = s.post_invoice(bill()).unwrap();
        assert_eq!(first.invoice_number.as_deref(), Some("S-000000000001"));
        let mut next = bill();
        next.operation_id = "next-sale".into();
        next.lines[0].expected_revision = 2;
        s.0.execute_batch("CREATE TRIGGER fail_number BEFORE INSERT ON local_billing_outbox BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
        assert!(s.post_invoice(next.clone()).is_err());
        s.0.execute_batch("DROP TRIGGER fail_number").unwrap();
        let second = s.post_invoice(next.clone()).unwrap();
        assert_eq!(second.invoice_number.as_deref(), Some("S-000000000002"));
        drop(s);
        let mut reopened = Store::open(&path, KEY).unwrap();
        assert_eq!(reopened.post_invoice(bill()).unwrap(), first);
        assert_eq!(reopened.post_invoice(next).unwrap(), second);
        let mut legacy = serde_json::to_value(first).unwrap();
        legacy.as_object_mut().unwrap().remove("invoiceNumber");
        assert!(serde_json::from_value::<Invoice>(legacy)
            .unwrap()
            .invoice_number
            .is_none());
    }
    #[test]
    fn shared_request_validation_contract() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../business-domain/fixtures/native-invoice-contract.json"
        ))
        .unwrap();
        for fixture in fixtures["requests"].as_array().unwrap() {
            let accepted = serde_json::from_value::<PostInvoice>(fixture["input"].clone())
                .is_ok_and(|request| request.validate().is_ok());
            assert_eq!(
                accepted,
                fixture["valid"].as_bool().unwrap(),
                "{}",
                fixture["name"]
            );
        }
        let mut request = bill();
        request.lines = vec![request.lines[0].clone(); 100];
        assert!(request.validate().is_ok());
        request.lines.push(request.lines[0].clone());
        assert!(request.validate().is_err());
    }
    #[test]
    fn shared_multi_line_money_contract_posts_authoritative_totals() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../business-domain/fixtures/native-invoice-contract.json"
        ))
        .unwrap();
        for fixture in fixtures["calculations"].as_array().unwrap() {
            let directory = tempfile::tempdir().unwrap();
            let mut store = Store::open(&directory.path().join("s.db"), KEY).unwrap();
            let mut request = bill();
            request.lines.clear();
            request.tax_basis_points = fixture["taxBasisPoints"].as_i64().unwrap();
            for (index, line) in fixture["lines"].as_array().unwrap().iter().enumerate() {
                let mut item = product();
                item.operation_id = format!("item-{index}");
                item.sku = format!("SKU-{index}");
                item.unit_price_paise = line["unitPricePaise"].as_i64().unwrap();
                item.opening_stock_milli = MAX_VALUE;
                store.add_product(item.clone()).unwrap();
                request.lines.push(BillLine {
                    product_id: item.operation_id,
                    expected_revision: 1,
                    quantity_milli: line["quantityMilli"].as_i64().unwrap(),
                });
            }
            let before = store.list_products().unwrap();
            let result = store.post_invoice(request);
            if let Some(expected) = fixture.get("result") {
                let invoice = result.unwrap();
                assert_eq!(
                    serde_json::json!({
                        "lineTotalsPaise": invoice.lines.iter().map(|line| line.total_paise).collect::<Vec<_>>(),
                        "subtotalPaise": invoice.subtotal_paise,
                        "taxPaise": invoice.tax_paise,
                        "totalPaise": invoice.total_paise,
                    }),
                    *expected,
                    "{}",
                    fixture["name"]
                );
            } else {
                assert!(
                    matches!(result, Err(StoreError::InvalidInvoice)),
                    "{}",
                    fixture["name"]
                );
                assert_eq!(store.list_products().unwrap(), before);
                assert_eq!(count(&store, "local_invoices"), 0);
                assert_eq!(count(&store, "local_billing_outbox"), 0);
            }
        }
    }
    #[test]
    fn later_product_or_ledger_failure_rolls_back_and_operation_can_retry() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = Store::open(&directory.path().join("s.db"), KEY).unwrap();
        store.add_product(product()).unwrap();
        let mut beans = product();
        beans.operation_id = "beans".into();
        beans.sku = "BEANS".into();
        store.add_product(beans).unwrap();
        let before = store.list_products().unwrap();
        let mut request = bill();
        request.lines[0].quantity_milli = 11000;
        request.lines.push(BillLine {
            product_id: "beans".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        });
        // Deduction uses sorted IDs: beans is already written when rice oversells.
        assert!(matches!(
            store.post_invoice(request.clone()),
            Err(StoreError::InvalidStock)
        ));
        assert_eq!(store.list_products().unwrap(), before);
        request.lines[0].quantity_milli = 1000;
        // Fail on the second ledger row, after both stock rows and the debit exist.
        store.0.execute_batch("CREATE TRIGGER fail_revenue BEFORE INSERT ON local_billing_ledger WHEN NEW.account='revenue' BEGIN SELECT RAISE(ABORT,'write failure'); END;").unwrap();
        assert!(store.post_invoice(request.clone()).is_err());
        assert_eq!(store.list_products().unwrap(), before);
        for table in [
            "local_invoices",
            "local_invoice_stock",
            "local_billing_ledger",
            "local_billing_audit",
            "local_billing_outbox",
        ] {
            assert_eq!(count(&store, table), 0);
        }
        store.0.execute_batch("DROP TRIGGER fail_revenue").unwrap();
        store.post_invoice(request).unwrap();
        assert_eq!(count(&store, "local_invoices"), 1);
        assert_eq!(count(&store, "local_billing_outbox"), 1);
        assert!(store
            .list_products()
            .unwrap()
            .iter()
            .all(|item| item.stock_milli == 9000 && item.revision == 2));
    }
    #[test]
    fn posted_records_reject_replace_update_and_delete_after_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("s.db");
        let mut store = Store::open(&path, KEY).unwrap();
        store.add_product(product()).unwrap();
        let invoice = store.post_invoice(bill()).unwrap();
        drop(store);
        let store = Store::open(&path, KEY).unwrap();
        for table in [
            "local_invoices",
            "local_invoice_stock",
            "local_billing_ledger",
            "local_billing_audit",
            "local_billing_outbox",
        ] {
            assert!(
                store
                    .0
                    .execute(
                        &format!("INSERT OR REPLACE INTO {table} SELECT * FROM {table}"),
                        []
                    )
                    .is_err(),
                "replacement must fail: {table}"
            );
            assert!(store
                .0
                .execute(&format!("UPDATE {table} SET rowid=rowid"), [])
                .is_err());
            assert!(store
                .0
                .execute(&format!("DELETE FROM {table}"), [])
                .is_err());
        }
        assert_eq!(store.list_invoices(0).unwrap()[0].invoice, invoice);
        assert_eq!(store.billing_outbox(0).unwrap().len(), 1);
    }
    #[test]
    fn simultaneous_exact_retries_post_once() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("s.db");
        let mut first = Store::open(&path, KEY).unwrap();
        first.add_product(product()).unwrap();
        let mut second = Store::open(&path, KEY).unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let other = barrier.clone();
        let thread = std::thread::spawn(move || {
            other.wait();
            first.post_invoice(bill()).unwrap()
        });
        barrier.wait();
        let invoice = second.post_invoice(bill()).unwrap();
        assert_eq!(thread.join().unwrap(), invoice);
        assert_eq!(second.list_products().unwrap()[0].stock_milli, 8750);
        for table in [
            "local_invoices",
            "local_invoice_stock",
            "local_billing_audit",
            "local_billing_outbox",
        ] {
            assert_eq!(count(&second, table), 1);
        }
        assert_eq!(count(&second, "local_billing_ledger"), 3);
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
        s.0.execute(
            "UPDATE workspace_access SET password_hash=?1",
            [crate::access::hash_password("Existing billing password").unwrap()],
        )
        .unwrap();
        crate::lan_authority::remove_fixture_tables(&s.0);
        s.0.execute_batch("DROP TABLE local_inventory_pending; DROP TABLE local_inventory_outbox; DROP TABLE local_inventory_actors; DROP TABLE local_retail_outbox; DROP TABLE local_retail_pending; DROP TABLE local_retail_canceled; DROP TABLE local_retail_events; DROP TABLE local_retail_journal; DROP TABLE local_retail_activity; DROP TABLE local_retail_return_items; DROP TABLE local_retail_return_parts; DROP TABLE local_retail_refunds; DROP TABLE local_retail_returns; DROP TABLE local_retail_payments; DROP TABLE local_retail_float_corrections; DROP TABLE local_retail_floats; DROP TABLE local_retail_closings; DROP TABLE local_retail_ops; DROP TABLE local_customer_journal; DROP TABLE local_customer_outbox; DROP TABLE local_customer_pending; DROP TABLE local_customer_canceled; DROP TABLE local_credit_entries; DROP TABLE local_customer_ops; DROP TABLE local_customers; DROP TABLE local_checkout_canceled; DROP TABLE local_checkout; DROP TABLE local_invoice_actors; DROP TABLE local_identity_audit; DROP TABLE local_principals; DROP TABLE local_identity; DROP TABLE local_billing_outbox; DROP TABLE local_billing_audit; DROP TABLE local_billing_ledger; DROP TABLE local_invoice_stock; DROP TABLE local_invoices; PRAGMA user_version=4;").unwrap();
        drop(s);
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
