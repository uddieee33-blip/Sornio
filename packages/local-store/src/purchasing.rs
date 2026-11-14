//! Supplier masters, purchase orders, goods receiving and supplier payables.
//!
//! Every posting in this module is atomic (one immediate SQLite transaction),
//! idempotent (operation ids are recorded with their exact request and result),
//! ledger-balanced (journal rows of one operation always sum to zero) and
//! audited at the native boundary. Purchase orders never move stock or create
//! debt; only the receiving, invoice and return postings do.
use crate::{
    billing::{line_total, tax_total, valid_id},
    catalog::MAX_VALUE,
    identity::{self, Permission, Role},
    Store, StoreError,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveSupplier {
    pub operation_id: String,
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub gstin: Option<String>,
    pub address: Option<String>,
    pub payment_terms_days: i64,
    pub notes: String,
    pub archived: bool,
    pub expected_revision: Option<i64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub gstin: Option<String>,
    pub address: Option<String>,
    pub payment_terms_days: i64,
    pub notes: String,
    pub archived: bool,
    pub revision: i64,
    pub balance_paise: String,
    pub overdue_paise: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PurchaseOrderLineInput {
    pub product_id: String,
    pub quantity_milli: i64,
    pub unit_cost_paise: i64,
    pub tax_bps: Option<i64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreatePurchaseOrder {
    pub operation_id: String,
    pub supplier_id: String,
    pub note: String,
    pub lines: Vec<PurchaseOrderLineInput>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePurchaseOrder {
    pub operation_id: String,
    pub id: String,
    pub expected_revision: i64,
    pub note: String,
    pub lines: Vec<PurchaseOrderLineInput>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderLine {
    pub line_index: i64,
    pub product_id: String,
    pub name: String,
    pub sku: String,
    pub unit: String,
    pub quantity_milli: i64,
    pub received_milli: i64,
    pub unit_cost_paise: i64,
    pub tax_bps: i64,
    pub line_subtotal_paise: i64,
    pub tax_paise: i64,
    pub line_total_paise: i64,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrder {
    pub id: String,
    pub number: i64,
    pub supplier_id: String,
    pub supplier_name: String,
    pub status: String,
    pub note: String,
    pub lines: Vec<PurchaseOrderLine>,
    pub subtotal_paise: i64,
    pub tax_paise: i64,
    pub total_paise: i64,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub approved_at: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderSummary {
    pub id: String,
    pub number: i64,
    pub supplier_id: String,
    pub supplier_name: String,
    pub status: String,
    pub total_paise: i64,
    pub revision: i64,
    pub item_count: i64,
    pub updated_at: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionPurchaseOrder {
    pub operation_id: String,
    pub id: String,
    pub expected_revision: i64,
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecidePurchaseOrder {
    pub operation_id: String,
    pub id: String,
    pub expected_revision: i64,
    pub decision: String,
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GoodsReceiptLineInput {
    pub line_index: i64,
    pub product_id: String,
    pub quantity_milli: i64,
    pub damaged_milli: Option<i64>,
    pub note: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostGoodsReceipt {
    pub operation_id: String,
    pub order_id: String,
    pub reference: Option<String>,
    pub note: String,
    pub lines: Vec<GoodsReceiptLineInput>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoodsReceiptLine {
    pub line_index: i64,
    pub product_id: String,
    pub quantity_milli: i64,
    pub damaged_milli: i64,
    pub unit_cost_paise: i64,
    pub line_total_paise: i64,
    pub note: String,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoodsReceipt {
    pub id: String,
    pub order_id: String,
    pub order_number: i64,
    pub supplier_id: String,
    pub reference: Option<String>,
    pub note: String,
    pub lines: Vec<GoodsReceiptLine>,
    pub goods_total_paise: i64,
    pub damaged_total_paise: i64,
    pub order_status: String,
    pub created_at: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostSupplierInvoice {
    pub operation_id: String,
    pub supplier_id: String,
    pub receipt_id: Option<String>,
    pub reference: String,
    pub total_paise: i64,
    pub due_on: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierInvoice {
    pub id: String,
    pub supplier_id: String,
    pub receipt_id: Option<String>,
    pub purchase_order_id: Option<String>,
    pub reference: String,
    pub total_paise: i64,
    pub variance_paise: i64,
    pub due_on: Option<String>,
    pub created_at: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostSupplierPayment {
    pub operation_id: String,
    pub supplier_id: String,
    pub invoice_id: Option<String>,
    pub method: String,
    pub amount_paise: i64,
    pub reference: String,
    pub paid_on: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPayment {
    pub id: String,
    pub supplier_id: String,
    pub invoice_id: Option<String>,
    pub method: String,
    pub amount_paise: i64,
    pub reference: String,
    pub paid_on: Option<String>,
    pub balance_paise: String,
    pub created_at: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostPurchaseReturnLine {
    pub receipt_line: i64,
    pub product_id: String,
    pub quantity_milli: i64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostPurchaseReturn {
    pub operation_id: String,
    pub receipt_id: String,
    pub disposition: String,
    pub refund_method: Option<String>,
    pub reason: String,
    pub lines: Vec<PostPurchaseReturnLine>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseReturn {
    pub id: String,
    pub supplier_id: String,
    pub receipt_id: String,
    pub disposition: String,
    pub refund_method: Option<String>,
    pub total_paise: i64,
    pub reason: String,
    pub created_at: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PostSupplierOpening {
    pub operation_id: String,
    pub supplier_id: String,
    pub amount_paise: i64,
    pub due_on: Option<String>,
    pub reason: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReverseSupplierEntry {
    pub operation_id: String,
    pub target_operation_id: String,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierReceipt {
    pub operation_id: String,
    pub supplier_id: String,
    pub kind: String,
    pub amount_paise: i64,
    pub balance_paise: String,
    pub revision: i64,
    pub created_at: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgingSummary {
    pub current_paise: String,
    #[serde(rename = "days1To30Paise")]
    pub days_1_30_paise: String,
    #[serde(rename = "days31To60Paise")]
    pub days_31_60_paise: String,
    #[serde(rename = "days61To90Paise")]
    pub days_61_90_paise: String,
    #[serde(rename = "days90PlusPaise")]
    pub days_90_plus_paise: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierStatementLine {
    pub sequence: i64,
    pub operation_id: String,
    pub kind: String,
    pub amount_paise: String,
    pub running_balance_paise: String,
    pub created_at: String,
    pub due_on: Option<String>,
    pub reference: Option<String>,
    pub purchase_order_id: Option<String>,
    pub receipt_id: Option<String>,
    pub invoice_id: Option<String>,
    pub reverse_of: Option<String>,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierStatement {
    pub supplier: Supplier,
    pub through: i64,
    pub next_after: i64,
    pub has_more: bool,
    pub opening_balance_paise: String,
    pub closing_balance_paise: String,
    pub aging: AgingSummary,
    pub entries: Vec<SupplierStatementLine>,
}

fn one(db: &Connection, sql: &str, p: impl rusqlite::Params) -> Result<(), StoreError> {
    if db.execute(sql, p)? != 1 {
        return Err(StoreError::InvalidPurchase);
    }
    Ok(())
}
fn add(a: i128, b: i128) -> Result<i128, StoreError> {
    a.checked_add(b).ok_or(StoreError::InvalidPurchase)
}
fn now(db: &Connection) -> Result<String, StoreError> {
    Ok(
        db.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
            r.get(0)
        })?,
    )
}
fn today(db: &Connection) -> Result<String, StoreError> {
    Ok(db.query_row("SELECT date('now','+330 minutes')", [], |r| r.get(0))?)
}
fn valid_date(db: &Connection, value: &str) -> Result<bool, StoreError> {
    if value.len() != 10
        || !value.bytes().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
    {
        return Ok(false);
    }
    let canonical: Option<String> =
        db.query_row("SELECT date(?1,'+0 days')", [value], |r| r.get(0))?;
    Ok(canonical.as_deref() == Some(value))
}
fn plus_days(db: &Connection, date: &str, days: i64) -> Result<String, StoreError> {
    Ok(db.query_row(
        "SELECT date(?1, printf('+%d days', ?2))",
        params![date, days],
        |r| r.get(0),
    )?)
}
fn phone(value: &Option<String>) -> Result<Option<String>, StoreError> {
    let Some(v) = value else { return Ok(None) };
    if v.trim().is_empty() {
        return Ok(None);
    }
    if v.len() > 40
        || v.chars()
            .any(|c| !c.is_ascii_digit() && !" +-()".contains(c))
    {
        return Err(StoreError::InvalidSupplier);
    }
    let normalized: String = v
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '+')
        .collect();
    let digits = normalized.strip_prefix('+').unwrap_or(&normalized);
    if !(7..=15).contains(&digits.len()) || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(StoreError::InvalidSupplier);
    }
    Ok(Some(normalized))
}
fn gstin(value: &Option<String>) -> Result<Option<String>, StoreError> {
    let Some(v) = value else { return Ok(None) };
    let trimmed = v.trim().to_ascii_uppercase();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let bytes = trimmed.as_bytes();
    let pattern_ok = bytes.len() == 15
        && bytes.iter().all(|b| b.is_ascii_alphanumeric())
        && bytes[..2].iter().all(|b| b.is_ascii_digit())
        && bytes[2..7].iter().all(|b| b.is_ascii_uppercase())
        && bytes[7..11].iter().all(|b| b.is_ascii_digit())
        && bytes[11].is_ascii_uppercase()
        && bytes[13] == b'Z';
    if !pattern_ok {
        return Err(StoreError::InvalidSupplier);
    }
    Ok(Some(trimmed))
}
fn short_text(value: &str, max: usize) -> bool {
    value.len() <= max * 4 && value.chars().count() <= max && !value.chars().any(char::is_control)
}
fn optional_text(value: &Option<String>, max: usize) -> Result<Option<String>, StoreError> {
    match value {
        Some(v) => {
            if v.len() > max * 4 || v.chars().count() > max || v.chars().any(char::is_control) {
                return Err(StoreError::InvalidPurchase);
            }
            let trimmed = v.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed.to_string()))
            }
        }
        None => Ok(None),
    }
}
fn replay<T: DeserializeOwned>(
    db: &Connection,
    id: &str,
    kind: &str,
    request: &str,
) -> Result<Option<T>, StoreError> {
    if !valid_id(id) {
        return Err(StoreError::InvalidPurchase);
    }
    crate::payments::unclaimed(db, id)?;
    let old: Option<(String, String, String)> = db
        .query_row(
            "SELECT kind,request,payload FROM local_supplier_ops WHERE operation_id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    if let Some((k, r, p)) = old {
        if k != kind || r != request {
            return Err(StoreError::OperationConflict);
        }
        return Ok(Some(serde_json::from_str(&p)?));
    }
    if db.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_supplier_canceled WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_invoices WHERE id=?1) OR EXISTS(SELECT 1 FROM local_customer_ops WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_pending WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_canceled WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_checkout_canceled WHERE operation_id=?1)",
        [id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    Ok(None)
}
fn unreserved(db: &Connection, id: &str) -> Result<(), StoreError> {
    if db.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_supplier_pending WHERE operation_id=?1)",
        [id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    Ok(())
}
fn record(
    db: &Connection,
    id: &str,
    kind: &str,
    request: &str,
    value: &impl Serialize,
) -> Result<(), StoreError> {
    one(
        db,
        "INSERT INTO local_supplier_ops VALUES(?1,?2,?3,?4)",
        params![id, kind, request, serde_json::to_string(value)?],
    )
}
fn outbox(db: &Connection, id: &str, kind: &str, value: &impl Serialize) -> Result<(), StoreError> {
    let scope = identity::scope(db)?;
    let event =
        serde_json::json!({"version":1,"scope":scope,"kind":kind,"operationId":id,"value":value})
            .to_string();
    one(
        db,
        "INSERT INTO local_supplier_outbox(operation_id,payload) VALUES(?1,?2)",
        params![id, event],
    )
}
/// Verify the session (when present) and write the audit row in one step.
/// Trusted storage tests may operate without a session; shipped IPC cannot.
fn authorize(
    db: &Connection,
    session: &Option<identity::Session>,
    permission: Permission,
    action: &str,
    target: Option<&str>,
) -> Result<Option<identity::Principal>, StoreError> {
    match session {
        Some(s) => {
            let p = identity::verify(db, s, permission)?;
            identity::audit(db, &s.scope, Some(&p), action, target)?;
            Ok(Some(p))
        }
        None => Ok(None),
    }
}
fn balance(db: &Connection, id: &str, through: i64) -> Result<i128, StoreError> {
    let mut q = db.prepare(
        "SELECT amount_paise FROM local_supplier_entries WHERE supplier_id=?1 AND sequence<=?2 ORDER BY sequence",
    )?;
    let rows = q.query_map(params![id, through], |r| r.get::<_, i64>(0))?;
    let mut total = 0i128;
    for row in rows {
        total = add(total, row? as i128)?;
    }
    Ok(total)
}
/// One grouped read for list screens; thousands of suppliers stay interactive.
fn balances(db: &Connection, ids: &[String]) -> Result<Vec<(String, i128)>, StoreError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let json = serde_json::to_string(ids)?;
    let mut q = db.prepare(
        "SELECT supplier_id, COALESCE(SUM(amount_paise),0) FROM local_supplier_entries WHERE supplier_id IN (SELECT value FROM json_each(?1)) GROUP BY supplier_id",
    )?;
    let rows = q.query_map([json], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, sum) = row?;
        out.push((id, sum as i128));
    }
    Ok(out)
}
fn entry(
    db: &Connection,
    id: &str,
    supplier: &str,
    kind: &str,
    amount: i64,
    due: Option<&str>,
    reference: Option<&str>,
    order: Option<&str>,
    receipt: Option<&str>,
    invoice: Option<&str>,
    reverse: Option<&str>,
    reason: &str,
) -> Result<(), StoreError> {
    one(db,"INSERT INTO local_supplier_entries(operation_id,supplier_id,kind,amount_paise,due_on,reference,purchase_order_id,receipt_id,invoice_id,reverse_of,reason) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![id,supplier,kind,amount,due,reference,order,receipt,invoice,reverse,reason])
}
fn journal(
    db: &Connection,
    id: &str,
    supplier: &str,
    account: &str,
    amount: i64,
) -> Result<(), StoreError> {
    one(
        db,
        "INSERT INTO local_supplier_journal VALUES(?1,?2,?3,?4)",
        params![id, supplier, account, amount],
    )
}
fn bump_supplier(db: &Connection, id: &str, expected: i64) -> Result<i64, StoreError> {
    let next = expected.checked_add(1).ok_or(StoreError::InvalidPurchase)?;
    if db.execute(
        "UPDATE local_suppliers SET revision=?1 WHERE id=?2 AND revision=?3",
        params![next, id, expected],
    )? != 1
    {
        return Err(StoreError::SupplierConflict);
    }
    Ok(next)
}
fn add_entry_and_journal(
    db: &Connection,
    op: &str,
    supplier: &str,
    kind: &str,
    amount_paise: i64,
    due_on: Option<&str>,
    reference: Option<&str>,
    order: Option<&str>,
    receipt: Option<&str>,
    invoice: Option<&str>,
    reverse: Option<&str>,
    reason: &str,
    postings: &[(&str, i64)],
) -> Result<(), StoreError> {
    let total = postings
        .iter()
        .try_fold(0i128, |sum, (_, n)| add(sum, *n as i128))?;
    if total != 0 || postings.len() < 2 {
        return Err(StoreError::CreditUnavailable);
    }
    entry(
        db,
        op,
        supplier,
        kind,
        amount_paise,
        due_on,
        reference,
        order,
        receipt,
        invoice,
        reverse,
        reason,
    )?;
    for (account, amount) in postings {
        journal(db, op, supplier, account, *amount)?;
    }
    Ok(())
}
fn payment_account(method: &str) -> Result<&'static str, StoreError> {
    match method {
        "cash" => Ok("cash"),
        "bank" => Ok("bank"),
        "upi" => Ok("upi_clearing"),
        _ => Err(StoreError::InvalidPayable),
    }
}
fn supplier_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<(
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    String,
    bool,
    i64,
)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get::<_, i64>(7)? != 0,
        row.get(8)?,
    ))
}
fn supplier_from_row(
    row: (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        String,
        bool,
        i64,
    ),
    balance_paise: i128,
    overdue_paise: i128,
) -> Supplier {
    let (id, name, phone, gstin, address, terms, notes, archived, revision) = row;
    Supplier {
        id,
        name,
        phone,
        gstin,
        address,
        payment_terms_days: terms,
        notes,
        archived,
        revision,
        balance_paise: balance_paise.to_string(),
        overdue_paise: overdue_paise.to_string(),
    }
}
fn supplier_columns() -> &'static str {
    "id,name,phone,gstin,address,payment_terms_days,notes,archived,revision"
}
fn load_supplier(db: &Connection, id: &str) -> Result<Supplier, StoreError> {
    if !valid_id(id) {
        return Err(StoreError::InvalidSupplier);
    }
    let row = db
        .query_row(
            &format!(
                "SELECT {} FROM local_suppliers WHERE id=?1",
                supplier_columns()
            ),
            [id],
            supplier_row,
        )
        .optional()?
        .ok_or(StoreError::SupplierMissing)?;
    let balance = balance(db, id, i64::MAX)?;
    Ok(supplier_from_row(row, balance, overdue(db, id)?))
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    // Howard Hinnant's algorithm; public domain date math, no dependencies.
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}
fn days_past_due(due: &str, today: &str) -> Result<i64, StoreError> {
    let parse = |value: &str| -> Result<i64, StoreError> {
        let bytes = value.as_bytes();
        if bytes.len() != 10 {
            return Err(StoreError::InvalidPurchase);
        }
        let num = |from: usize, to: usize| -> Result<i64, StoreError> {
            value[from..to]
                .parse::<i64>()
                .map_err(|_| StoreError::InvalidPurchase)
        };
        Ok(days_from_civil(num(0, 4)?, num(5, 7)?, num(8, 10)?))
    };
    Ok(parse(today)? - parse(due)?)
}
#[derive(Default)]
struct AgingBuckets {
    current: i128,
    days_1_30: i128,
    days_31_60: i128,
    days_61_90: i128,
    days_90_plus: i128,
}
impl AgingBuckets {
    fn total_overdue(&self) -> i128 {
        self.days_1_30 + self.days_31_60 + self.days_61_90 + self.days_90_plus
    }
    fn summary(&self) -> AgingSummary {
        AgingSummary {
            current_paise: self.current.to_string(),
            days_1_30_paise: self.days_1_30.to_string(),
            days_31_60_paise: self.days_31_60.to_string(),
            days_61_90_paise: self.days_61_90.to_string(),
            days_90_plus_paise: self.days_90_plus.to_string(),
        }
    }
}
/// FIFO allocation of every credit against every charge, in ledger order.
/// Sequence-aware: a payment can only settle charges posted before it, and
/// carries forward as unapplied credit for charges posted after it.
fn aging(db: &Connection, id: &str) -> Result<AgingBuckets, StoreError> {
    let today = today(db)?;
    let mut buckets = AgingBuckets::default();
    let mut charges: Vec<(String, i128)> = Vec::new();
    let mut charge_index = 0usize;
    let mut unapplied: i128 = 0;
    let mut q = db.prepare(
        "SELECT kind, amount_paise, due_on FROM local_supplier_entries WHERE supplier_id=?1 ORDER BY sequence",
    )?;
    let rows = q.query_map([id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, Option<String>>(2)?,
        ))
    })?;
    for row in rows {
        let (_kind, amount, due) = row?;
        if amount < 0 {
            let mut credit = -(amount as i128);
            while credit > 0 {
                // Advance to the earliest charge with an open balance.
                while charge_index < charges.len() && charges[charge_index].1 <= 0 {
                    charge_index += 1;
                }
                if charge_index >= charges.len() {
                    break;
                }
                let open = &mut charges[charge_index].1;
                let paid = credit.min(*open);
                *open -= paid;
                credit -= paid;
            }
            unapplied = add(unapplied, credit)?;
            continue;
        }
        if amount > 0 {
            let allocated = unapplied.min(amount as i128);
            unapplied -= allocated;
            charges.push((
                due.clone().unwrap_or_else(|| today.clone()),
                amount as i128 - allocated,
            ));
        }
    }
    for (due, open) in charges {
        if open <= 0 {
            continue;
        }
        let past = days_past_due(&due, &today)?;
        if past <= 0 {
            buckets.current += open;
        } else if past <= 30 {
            buckets.days_1_30 += open;
        } else if past <= 60 {
            buckets.days_31_60 += open;
        } else if past <= 90 {
            buckets.days_61_90 += open;
        } else {
            buckets.days_90_plus += open;
        }
    }
    Ok(buckets)
}
fn overdue(db: &Connection, id: &str) -> Result<i128, StoreError> {
    Ok(aging(db, id)?.total_overdue())
}
impl Store {
    pub(crate) fn save_supplier(&mut self, r: SaveSupplier) -> Result<Supplier, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.id)
            || !identity::text(&r.name, 160)
            || !(0..=3650).contains(&r.payment_terms_days)
            || !short_text(&r.notes, 800)
        {
            return Err(StoreError::InvalidSupplier);
        }
        let normalized = phone(&r.phone)?;
        let tax_id = gstin(&r.gstin)?;
        let address = optional_text(&r.address, 500)?;
        let name = r.name.trim().to_string();
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::ManageSuppliers,
            "supplier.saved",
            Some(&r.operation_id),
        )?;
        if let Some(old) = replay::<Supplier>(&tx, &r.operation_id, "supplier.saved", &raw)? {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_suppliers WHERE id=?1)",
            [&r.id],
            |r| r.get(0),
        )?;
        if exists {
            let current = load_supplier(&tx, &r.id)?;
            if r.expected_revision != Some(current.revision) {
                return Err(StoreError::SupplierConflict);
            }
            one(
                &tx,
                "UPDATE local_suppliers SET name=?1,phone=?2,gstin=?3,address=?4,payment_terms_days=?5,notes=?6,archived=?7 WHERE id=?8",
                params![name, normalized, tax_id, address, r.payment_terms_days, r.notes.trim(), r.archived as i64, r.id],
            )?;
            bump_supplier(&tx, &r.id, current.revision)?;
        } else {
            if r.expected_revision.is_some() {
                return Err(StoreError::SupplierMissing);
            }
            let count: i64 =
                tx.query_row("SELECT COUNT(*) FROM local_suppliers", [], |r| r.get(0))?;
            if count >= 50_000 {
                return Err(StoreError::InvalidSupplier);
            }
            one(
                &tx,
                "INSERT INTO local_suppliers(id,name,phone,gstin,address,payment_terms_days,notes,archived,revision) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,1)",
                params![r.id, name, normalized, tax_id, address, r.payment_terms_days, r.notes.trim(), r.archived as i64],
            )?;
        }
        let result = load_supplier(&tx, &r.id)?;
        record(&tx, &r.operation_id, "supplier.saved", &raw, &result)?;
        outbox(&tx, &r.operation_id, "supplier.saved", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn find_suppliers(
        &self,
        search: &str,
        include_archived: bool,
    ) -> Result<Vec<Supplier>, StoreError> {
        if search.len() > 480 {
            return Err(StoreError::InvalidSupplier);
        }
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::SupplierRead)?;
        }
        let term = search.trim().to_lowercase();
        let mut q = tx.prepare(
            "SELECT id FROM local_suppliers WHERE (?2 = 1 OR archived = 0) AND (?1 = '' OR instr(lower(name), ?1) > 0 OR instr(COALESCE(phone,''), ?1) > 0 OR instr(COALESCE(gstin,''), upper(?1)) > 0) ORDER BY archived, name, id LIMIT 101",
        )?;
        let ids: Vec<String> = q
            .query_map(params![term, include_archived as i64], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        let sums = balances(&tx, &ids)?;
        let mut balance_map = std::collections::HashMap::with_capacity(sums.len());
        for (id, sum) in sums {
            balance_map.insert(id, sum);
        }
        let mut result = Vec::with_capacity(ids.len());
        for id in ids {
            let row = tx
                .query_row(
                    &format!(
                        "SELECT {} FROM local_suppliers WHERE id=?1",
                        supplier_columns()
                    ),
                    [&id],
                    supplier_row,
                )
                .optional()?
                .ok_or(StoreError::SupplierMissing)?;
            let amount = balance_map.get(&id).copied().unwrap_or(0);
            result.push(supplier_from_row(row, amount, overdue(&tx, &id)?));
            if result.len() == 101 {
                break;
            }
        }
        tx.commit()?;
        Ok(result)
    }
    /// Advisory duplicate detection for the entry form; never blocks a save.
    pub(crate) fn supplier_duplicates(
        &self,
        name: &str,
        phone: Option<&str>,
        gstin: Option<&str>,
    ) -> Result<Vec<Supplier>, StoreError> {
        if name.len() > 640
            || phone.map(|p| p.len() > 40).unwrap_or(false)
            || gstin.map(|g| g.len() > 15).unwrap_or(false)
        {
            return Err(StoreError::InvalidSupplier);
        }
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::SupplierRead)?;
        }
        let normalized_name = name.trim().to_lowercase();
        let digits: String = phone
            .unwrap_or("")
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect();
        let tax = gstin.unwrap_or("").trim().to_ascii_uppercase();
        let mut q = tx.prepare(
            "SELECT id FROM local_suppliers WHERE (?1 <> '' AND instr(lower(name), ?1) > 0) OR (?2 <> '' AND instr(COALESCE(phone,''), ?2) > 0) OR (?3 <> '' AND gstin = ?3) ORDER BY archived, name LIMIT 20",
        )?;
        let ids: Vec<String> = q
            .query_map(params![normalized_name, digits, tax], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        let sums = balances(&tx, &ids)?;
        let mut balance_map = std::collections::HashMap::with_capacity(sums.len());
        for (id, sum) in sums {
            balance_map.insert(id, sum);
        }
        let mut result = Vec::with_capacity(ids.len());
        for id in ids {
            let row = tx.query_row(
                &format!(
                    "SELECT {} FROM local_suppliers WHERE id=?1",
                    supplier_columns()
                ),
                [&id],
                supplier_row,
            )?;
            let amount = balance_map.get(&id).copied().unwrap_or(0);
            result.push(supplier_from_row(row, amount, 0));
        }
        tx.commit()?;
        Ok(result)
    }
}

fn po_columns() -> &'static str {
    "id,number,supplier_id,status,note,subtotal_paise,tax_paise,total_paise,revision,created_at,updated_at,approved_at"
}
fn load_lines(db: &Connection, order_id: &str) -> Result<Vec<PurchaseOrderLine>, StoreError> {
    let mut q = db.prepare(
        "SELECT line_index,product_id,name,sku,unit,quantity_milli,received_milli,unit_cost_paise,tax_bps,line_subtotal_paise,tax_paise,line_total_paise FROM local_purchase_order_lines WHERE order_id=?1 ORDER BY line_index",
    )?;
    let rows = q.query_map([order_id], |r| {
        Ok(PurchaseOrderLine {
            line_index: r.get(0)?,
            product_id: r.get(1)?,
            name: r.get(2)?,
            sku: r.get(3)?,
            unit: r.get(4)?,
            quantity_milli: r.get(5)?,
            received_milli: r.get(6)?,
            unit_cost_paise: r.get(7)?,
            tax_bps: r.get(8)?,
            line_subtotal_paise: r.get(9)?,
            tax_paise: r.get(10)?,
            line_total_paise: r.get(11)?,
        })
    })?;
    let mut lines = Vec::new();
    for row in rows {
        lines.push(row?);
    }
    Ok(lines)
}
fn load_order(db: &Connection, id: &str) -> Result<PurchaseOrder, StoreError> {
    if !valid_id(id) {
        return Err(StoreError::InvalidPurchaseOrder);
    }
    let row = db
        .query_row(
            &format!(
                "SELECT {} FROM local_purchase_orders WHERE id=?1",
                po_columns()
            ),
            [id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, i64>(7)?,
                    r.get::<_, i64>(8)?,
                    r.get::<_, String>(9)?,
                    r.get::<_, String>(10)?,
                    r.get::<_, Option<String>>(11)?,
                ))
            },
        )
        .optional()?
        .ok_or(StoreError::PurchaseOrderMissing)?;
    let supplier_name: String = db.query_row(
        "SELECT name FROM local_suppliers WHERE id=?1",
        [&row.2],
        |r| r.get(0),
    )?;
    let lines = load_lines(db, id)?;
    Ok(PurchaseOrder {
        id: row.0,
        number: row.1,
        supplier_id: row.2,
        supplier_name,
        status: row.3,
        note: row.4,
        lines,
        subtotal_paise: row.5,
        tax_paise: row.6,
        total_paise: row.7,
        revision: row.8,
        created_at: row.9,
        updated_at: row.10,
        approved_at: row.11,
    })
}
fn prepare_lines(
    db: &Connection,
    inputs: &[PurchaseOrderLineInput],
) -> Result<(Vec<(PurchaseOrderLine, i128, i128)>, i128, i128, i128), StoreError> {
    if inputs.is_empty() || inputs.len() > 500 {
        return Err(StoreError::InvalidPurchaseOrder);
    }
    let mut prepared = Vec::with_capacity(inputs.len());
    let mut subtotal_sum: i128 = 0;
    let mut tax_sum: i128 = 0;
    let mut total_sum: i128 = 0;
    for (index, input) in inputs.iter().enumerate() {
        if !valid_id(&input.product_id)
            || input.quantity_milli <= 0
            || input.quantity_milli > MAX_VALUE
            || !(0..=MAX_VALUE).contains(&input.unit_cost_paise)
        {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let tax_bps = input.tax_bps.unwrap_or(0);
        if !(0..=10_000).contains(&tax_bps) {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let product: Option<(String, String, String)> = db
            .query_row(
                "SELECT name, sku, unit FROM local_products WHERE id = ?1",
                [&input.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let (name, sku, unit) = product.ok_or(StoreError::ProductMissing)?;
        let line_subtotal = line_total(input.quantity_milli, input.unit_cost_paise)?;
        let tax = tax_total(line_subtotal, tax_bps)?;
        let line_total_paise = line_subtotal
            .checked_add(tax)
            .ok_or(StoreError::InvalidPurchaseOrder)?;
        subtotal_sum = add(subtotal_sum, line_subtotal as i128)?;
        tax_sum = add(tax_sum, tax as i128)?;
        total_sum = add(total_sum, line_total_paise as i128)?;
        prepared.push((
            PurchaseOrderLine {
                line_index: index as i64,
                product_id: input.product_id.clone(),
                name,
                sku,
                unit,
                quantity_milli: input.quantity_milli,
                received_milli: 0,
                unit_cost_paise: input.unit_cost_paise,
                tax_bps,
                line_subtotal_paise: line_subtotal,
                tax_paise: tax,
                line_total_paise,
            },
            0,
            0,
        ));
    }
    for bound in [&subtotal_sum, &tax_sum, &total_sum] {
        if *bound > MAX_VALUE as i128 {
            return Err(StoreError::InvalidPurchaseOrder);
        }
    }
    Ok((prepared, subtotal_sum, tax_sum, total_sum))
}
fn write_lines(
    tx: &Transaction<'_>,
    order_id: &str,
    lines: &[(PurchaseOrderLine, i128, i128)],
) -> Result<(), StoreError> {
    for (line, _, _) in lines {
        one(
            tx,
            "INSERT INTO local_purchase_order_lines(order_id,line_index,product_id,name,sku,unit,quantity_milli,received_milli,unit_cost_paise,tax_bps,line_subtotal_paise,tax_paise,line_total_paise) VALUES(?1,?2,?3,?4,?5,?6,?7,0,?8,?9,?10,?11,?12)",
            params![order_id, line.line_index, line.product_id, line.name, line.sku, line.unit, line.quantity_milli, line.unit_cost_paise, line.tax_bps, line.line_subtotal_paise, line.tax_paise, line.line_total_paise],
        )?;
    }
    Ok(())
}
fn active_supplier(tx: &Transaction<'_>, supplier_id: &str) -> Result<(), StoreError> {
    if !valid_id(supplier_id) {
        return Err(StoreError::InvalidSupplier);
    }
    let archived: Option<bool> = tx
        .query_row(
            "SELECT archived != 0 FROM local_suppliers WHERE id = ?1",
            [supplier_id],
            |r| r.get(0),
        )
        .optional()?;
    match archived {
        None => Err(StoreError::SupplierMissing),
        Some(true) => Err(StoreError::InvalidSupplier),
        Some(false) => Ok(()),
    }
}
impl Store {
    pub(crate) fn create_purchase_order(
        &mut self,
        r: CreatePurchaseOrder,
    ) -> Result<PurchaseOrder, StoreError> {
        if !valid_id(&r.operation_id) || !valid_id(&r.supplier_id) || !short_text(&r.note, 800) {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::ManagePurchaseOrders,
            "purchase_order.created",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<PurchaseOrder>(&tx, &r.operation_id, "purchase_order.created", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        active_supplier(&tx, &r.supplier_id)?;
        let (lines, subtotal, tax, total) = prepare_lines(&tx, &r.lines)?;
        let number: i64 = tx.query_row(
            "SELECT COALESCE(MAX(number), 0) + 1 FROM local_purchase_orders",
            [],
            |r| r.get(0),
        )?;
        let actor: Option<String> = self.1.as_ref().map(|s| s.actor_id.clone());
        one(
            &tx,
            "INSERT INTO local_purchase_orders(id,number,supplier_id,status,note,subtotal_paise,tax_paise,total_paise,revision,created_by) VALUES(?1,?2,?3,'draft',?4,?5,?6,?7,1,?8)",
            params![r.operation_id, number, r.supplier_id, r.note.trim(), subtotal as i64, tax as i64, total as i64, actor],
        )?;
        write_lines(&tx, &r.operation_id, &lines)?;
        let result = load_order(&tx, &r.operation_id)?;
        record(
            &tx,
            &r.operation_id,
            "purchase_order.created",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "purchase_order.created", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn update_purchase_order(
        &mut self,
        r: UpdatePurchaseOrder,
    ) -> Result<PurchaseOrder, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.id)
            || r.expected_revision < 1
            || !short_text(&r.note, 800)
        {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::ManagePurchaseOrders,
            "purchase_order.updated",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<PurchaseOrder>(&tx, &r.operation_id, "purchase_order.updated", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let current = load_order(&tx, &r.id)?;
        if current.status != "draft" {
            return Err(StoreError::OrderState);
        }
        if current.revision != r.expected_revision {
            return Err(StoreError::PurchaseOrderConflict);
        }
        let (lines, subtotal, tax, total) = prepare_lines(&tx, &r.lines)?;
        tx.execute(
            "DELETE FROM local_purchase_order_lines WHERE order_id = ?1",
            [&r.id],
        )?;
        write_lines(&tx, &r.id, &lines)?;
        let next = current
            .revision
            .checked_add(1)
            .ok_or(StoreError::InvalidPurchaseOrder)?;
        one(
            &tx,
            "UPDATE local_purchase_orders SET note=?1, subtotal_paise=?2, tax_paise=?3, total_paise=?4, revision=?5, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?6 AND revision=?7",
            params![r.note.trim(), subtotal as i64, tax as i64, total as i64, next, r.id, current.revision],
        )?;
        let result = load_order(&tx, &r.id)?;
        record(
            &tx,
            &r.operation_id,
            "purchase_order.updated",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "purchase_order.updated", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn get_purchase_order(&self, id: &str) -> Result<PurchaseOrder, StoreError> {
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::SupplierRead)?;
        }
        let result = load_order(&tx, id)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn find_purchase_orders(
        &self,
        search: &str,
        status: &str,
        supplier_id: &str,
    ) -> Result<Vec<PurchaseOrderSummary>, StoreError> {
        if search.len() > 240
            || status.len() > 20
            || (!supplier_id.is_empty() && !valid_id(supplier_id))
        {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        if !matches!(
            status,
            "" | "draft"
                | "submitted"
                | "approved"
                | "rejected"
                | "cancelled"
                | "partial"
                | "received"
                | "closed"
        ) {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::SupplierRead)?;
        }
        let term = search.trim().to_lowercase();
        let mut q = tx.prepare(
            "SELECT o.id, o.number, o.supplier_id, s.name, o.status, o.total_paise, o.revision, (SELECT COUNT(*) FROM local_purchase_order_lines l WHERE l.order_id = o.id), o.updated_at FROM local_purchase_orders o JOIN local_suppliers s ON s.id = o.supplier_id WHERE (?1 = '' OR instr(lower(s.name), ?1) > 0 OR instr(CAST(o.number AS TEXT), ?1) > 0) AND (?2 = '' OR o.status = ?2) AND (?3 = '' OR o.supplier_id = ?3) ORDER BY o.number DESC LIMIT 101",
        )?;
        let rows = q.query_map(params![term, status, supplier_id], |r| {
            Ok(PurchaseOrderSummary {
                id: r.get(0)?,
                number: r.get(1)?,
                supplier_id: r.get(2)?,
                supplier_name: r.get(3)?,
                status: r.get(4)?,
                total_paise: r.get(5)?,
                revision: r.get(6)?,
                item_count: r.get(7)?,
                updated_at: r.get(8)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        tx.commit()?;
        Ok(result)
    }
}

fn transition_guard(
    status: &str,
    expected: i64,
    current: &PurchaseOrder,
) -> Result<(), StoreError> {
    if current.status != status {
        return Err(StoreError::OrderState);
    }
    if current.revision != expected {
        return Err(StoreError::PurchaseOrderConflict);
    }
    Ok(())
}
impl Store {
    pub(crate) fn submit_purchase_order(
        &mut self,
        r: TransitionPurchaseOrder,
    ) -> Result<PurchaseOrder, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.id)
            || r.expected_revision < 1
            || r.reason
                .as_ref()
                .map(|t| !short_text(t, 500))
                .unwrap_or(false)
        {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::ManagePurchaseOrders,
            "purchase_order.submitted",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<PurchaseOrder>(&tx, &r.operation_id, "purchase_order.submitted", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let current = load_order(&tx, &r.id)?;
        transition_guard("draft", r.expected_revision, &current)?;
        let next = current
            .revision
            .checked_add(1)
            .ok_or(StoreError::InvalidPurchaseOrder)?;
        one(
            &tx,
            "UPDATE local_purchase_orders SET status='submitted', revision=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND revision=?3",
            params![next, r.id, current.revision],
        )?;
        let result = load_order(&tx, &r.id)?;
        record(
            &tx,
            &r.operation_id,
            "purchase_order.submitted",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "purchase_order.submitted", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn decide_purchase_order(
        &mut self,
        r: DecidePurchaseOrder,
    ) -> Result<PurchaseOrder, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.id)
            || r.expected_revision < 1
            || !matches!(r.decision.as_str(), "approve" | "reject")
            || r.reason
                .as_ref()
                .map(|t| !short_text(t, 500))
                .unwrap_or(false)
            || (r.decision == "reject"
                && r.reason.as_deref().map(str::trim).unwrap_or("").is_empty())
        {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        authorize(
            &tx,
            &self.1,
            Permission::ApprovePurchaseOrder,
            if r.decision == "approve" {
                "purchase_order.approved"
            } else {
                "purchase_order.rejected"
            },
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<PurchaseOrder>(&tx, &r.operation_id, "purchase_order.decided", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let current = load_order(&tx, &r.id)?;
        transition_guard("submitted", r.expected_revision, &current)?;
        let next = current
            .revision
            .checked_add(1)
            .ok_or(StoreError::InvalidPurchaseOrder)?;
        if r.decision == "approve" {
            let approver = self.1.as_ref().map(|s| s.actor_id.clone());
            one(
                &tx,
                "UPDATE local_purchase_orders SET status='approved', revision=?1, approved_by=?2, approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3 AND revision=?4",
                params![next, approver, r.id, current.revision],
            )?;
        } else {
            one(
                &tx,
                "UPDATE local_purchase_orders SET status='rejected', revision=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND revision=?3",
                params![next, r.id, current.revision],
            )?;
        }
        let result = load_order(&tx, &r.id)?;
        record(
            &tx,
            &r.operation_id,
            "purchase_order.decided",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "purchase_order.decided", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn cancel_purchase_order(
        &mut self,
        r: TransitionPurchaseOrder,
    ) -> Result<PurchaseOrder, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.id)
            || r.expected_revision < 1
            || r.reason.as_deref().map(str::trim).unwrap_or("").is_empty()
            || r.reason
                .as_ref()
                .map(|t| !short_text(t, 500))
                .unwrap_or(true)
        {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current = load_order(&tx, &r.id)?;
        // Cancelling an already-approved order is an owner/manager decision and
        // only possible before any stock has moved.
        let permission = if current.status == "approved" {
            Permission::ApprovePurchaseOrder
        } else {
            Permission::ManagePurchaseOrders
        };
        identity::guard(
            &tx,
            &self.1,
            permission,
            "purchase_order.cancelled",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<PurchaseOrder>(&tx, &r.operation_id, "purchase_order.cancelled", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        if !matches!(current.status.as_str(), "draft" | "submitted" | "approved") {
            return Err(StoreError::OrderState);
        }
        if current.revision != r.expected_revision {
            return Err(StoreError::PurchaseOrderConflict);
        }
        let received: i64 = tx.query_row(
            "SELECT COALESCE(SUM(received_milli), 0) FROM local_purchase_order_lines WHERE order_id = ?1",
            [&r.id],
            |r| r.get(0),
        )?;
        if received > 0 {
            return Err(StoreError::OrderState);
        }
        let next = current
            .revision
            .checked_add(1)
            .ok_or(StoreError::InvalidPurchaseOrder)?;
        one(
            &tx,
            "UPDATE local_purchase_orders SET status='cancelled', revision=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND revision=?3",
            params![next, r.id, current.revision],
        )?;
        let result = load_order(&tx, &r.id)?;
        record(
            &tx,
            &r.operation_id,
            "purchase_order.cancelled",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "purchase_order.cancelled", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn close_purchase_order(
        &mut self,
        r: TransitionPurchaseOrder,
    ) -> Result<PurchaseOrder, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.id)
            || r.expected_revision < 1
            || r.reason
                .as_ref()
                .map(|t| !short_text(t, 500))
                .unwrap_or(false)
        {
            return Err(StoreError::InvalidPurchaseOrder);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::ApprovePurchaseOrder,
            "purchase_order.closed",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<PurchaseOrder>(&tx, &r.operation_id, "purchase_order.closed", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let current = load_order(&tx, &r.id)?;
        if !matches!(current.status.as_str(), "received" | "partial") {
            return Err(StoreError::OrderState);
        }
        if current.revision != r.expected_revision {
            return Err(StoreError::PurchaseOrderConflict);
        }
        let next = current
            .revision
            .checked_add(1)
            .ok_or(StoreError::InvalidPurchaseOrder)?;
        one(
            &tx,
            "UPDATE local_purchase_orders SET status='closed', revision=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND revision=?3",
            params![next, r.id, current.revision],
        )?;
        let result = load_order(&tx, &r.id)?;
        record(&tx, &r.operation_id, "purchase_order.closed", &raw, &result)?;
        outbox(&tx, &r.operation_id, "purchase_order.closed", &result)?;
        tx.commit()?;
        Ok(result)
    }
}

impl Store {
    /// Commit a (possibly partial) delivery against an approved order.
    /// Stock, the ledger, the payable subledger and the order state all move
    /// in one transaction; a retry with the same operation id replays the stored result.
    pub(crate) fn post_goods_receipt(
        &mut self,
        r: PostGoodsReceipt,
    ) -> Result<GoodsReceipt, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.order_id)
            || !short_text(&r.note, 800)
            || r.reference
                .as_ref()
                .map(|v| v.len() > 120 || v.chars().any(char::is_control))
                .unwrap_or(false)
            || r.lines.is_empty()
            || r.lines.len() > 500
        {
            return Err(StoreError::InvalidReceipt);
        }
        let reference = optional_text(&r.reference, 120)?;
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::ReceiveStock,
            "purchase.received",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<GoodsReceipt>(&tx, &r.operation_id, "goods_receipt.posted", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let order = load_order(&tx, &r.order_id)?;
        if order.status != "approved" && order.status != "partial" {
            return Err(StoreError::OrderState);
        }
        // Reject duplicate line indexes within one receipt request.
        let mut seen = std::collections::HashSet::with_capacity(r.lines.len());
        for line in &r.lines {
            if !seen.insert(line.line_index) {
                return Err(StoreError::InvalidReceipt);
            }
        }
        let mut prepared: Vec<(GoodsReceiptLine, i128, i128)> = Vec::with_capacity(r.lines.len());
        let mut goods_total: i128 = 0;
        let mut damaged_total: i128 = 0;
        let mut per_line_remaining = std::collections::HashMap::with_capacity(order.lines.len());
        for line in &order.lines {
            per_line_remaining.insert(line.line_index, line.quantity_milli - line.received_milli);
        }
        for input in &r.lines {
            if input.line_index < 0 || input.quantity_milli <= 0 || input.quantity_milli > MAX_VALUE
            {
                return Err(StoreError::InvalidReceipt);
            }
            let damaged = input.damaged_milli.unwrap_or(0);
            if damaged < 0 || damaged > input.quantity_milli {
                return Err(StoreError::InvalidReceipt);
            }
            if input
                .note
                .as_ref()
                .map(|n| n.len() > 400 || n.chars().any(char::is_control))
                .unwrap_or(false)
            {
                return Err(StoreError::InvalidReceipt);
            }
            let po_line = order
                .lines
                .iter()
                .find(|l| l.line_index == input.line_index && l.product_id == input.product_id)
                .ok_or(StoreError::InvalidReceipt)?;
            let remaining = per_line_remaining
                .get_mut(&input.line_index)
                .ok_or(StoreError::InvalidReceipt)?;
            if input.quantity_milli > *remaining {
                return Err(StoreError::InvalidReceipt);
            }
            *remaining -= input.quantity_milli;
            let good = input.quantity_milli - damaged;
            let good_value = if good > 0 {
                line_total(good, po_line.unit_cost_paise)? as i128
            } else {
                0
            };
            let damaged_value = if damaged > 0 {
                line_total(damaged, po_line.unit_cost_paise)? as i128
            } else {
                0
            };
            goods_total = add(goods_total, good_value)?;
            damaged_total = add(damaged_total, damaged_value)?;
            prepared.push((
                GoodsReceiptLine {
                    line_index: input.line_index,
                    product_id: input.product_id.clone(),
                    quantity_milli: input.quantity_milli,
                    damaged_milli: damaged,
                    unit_cost_paise: po_line.unit_cost_paise,
                    // The line carries the value that enters inventory and payables:
                    // arrived units less damaged ones, at the purchase-order cost.
                    line_total_paise: if good > 0 {
                        line_total(good, po_line.unit_cost_paise)?
                    } else {
                        0
                    },
                    note: input.note.clone().unwrap_or_default(),
                },
                good as i128,
                damaged as i128,
            ));
        }
        if goods_total > MAX_VALUE as i128 || damaged_total > MAX_VALUE as i128 {
            return Err(StoreError::InvalidReceipt);
        }
        let goods_total_i64 = goods_total as i64;
        let damaged_total_i64 = damaged_total as i64;
        let actor = self.1.as_ref().map(|s| s.actor_id.clone());
        one(
            &tx,
            "INSERT INTO local_goods_receipts(id,order_id,supplier_id,reference,note,goods_total_paise,damaged_total_paise,created_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![r.operation_id, r.order_id, order.supplier_id, reference, r.note.trim(), goods_total_i64, damaged_total_i64, actor],
        )?;
        for (line, good, _) in &prepared {
            one(
                &tx,
                "INSERT INTO local_goods_receipt_lines(receipt_id,line_index,product_id,quantity_milli,damaged_milli,unit_cost_paise,line_total_paise,note) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![r.operation_id, line.line_index, line.product_id, line.quantity_milli, line.damaged_milli, line.unit_cost_paise, line.line_total_paise, line.note],
            )?;
            if *good > 0 {
                let updated = tx.execute(
                    "UPDATE local_products SET stock_milli = stock_milli + ?1, revision = revision + 1 WHERE id = ?2 AND stock_milli + ?1 <= ?3",
                    params![*good as i64, line.product_id, MAX_VALUE],
                )?;
                if updated != 1 {
                    return Err(StoreError::InvalidStock);
                }
                one(
                    &tx,
                    "INSERT INTO local_purchase_stock_events(operation_id,product_id,kind,delta_milli,receipt_id) VALUES(?1,?2,'goods_received',?3,?4)",
                    params![r.operation_id, line.product_id, *good as i64, r.operation_id],
                )?;
            }
            let updated = tx.execute(
                "UPDATE local_purchase_order_lines SET received_milli = received_milli + ?1 WHERE order_id = ?2 AND line_index = ?3 AND received_milli + ?1 <= quantity_milli",
                params![line.quantity_milli, r.order_id, line.line_index],
            )?;
            if updated != 1 {
                return Err(StoreError::StockConflict);
            }
        }
        // Recompute the order state from the authoritative line counters.
        let (ordered, received): (i64, i64) = tx.query_row(
            "SELECT COALESCE(SUM(quantity_milli),0), COALESCE(SUM(received_milli),0) FROM local_purchase_order_lines WHERE order_id = ?1",
            [&r.order_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let next_status = if received >= ordered {
            "received"
        } else if received > 0 {
            "partial"
        } else {
            "approved"
        };
        let next = order
            .revision
            .checked_add(1)
            .ok_or(StoreError::InvalidReceipt)?;
        one(
            &tx,
            "UPDATE local_purchase_orders SET status=?1, revision=?2, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3 AND revision=?4",
            params![next_status, next, r.order_id, order.revision],
        )?;
        // Post the goods accrual: inventory in, payables up, at purchase-order cost.
        if goods_total > 0 {
            let today = today(&tx)?;
            let terms: i64 = tx.query_row(
                "SELECT payment_terms_days FROM local_suppliers WHERE id = ?1",
                [&order.supplier_id],
                |r| r.get(0),
            )?;
            let due = plus_days(&tx, &today, terms)?;
            let supplier = load_supplier(&tx, &order.supplier_id)?;
            add_entry_and_journal(
                &tx,
                &r.operation_id,
                &order.supplier_id,
                "goods_received",
                goods_total_i64,
                Some(&due),
                reference.as_deref(),
                Some(&r.order_id),
                Some(&r.operation_id),
                None,
                if r.note.trim().is_empty() {
                    "Goods received"
                } else {
                    r.note.trim()
                },
                &[
                    ("inventory", goods_total_i64),
                    ("payables", -goods_total_i64),
                ],
            )?;
            bump_supplier(&tx, &order.supplier_id, supplier.revision)?;
        }
        let result = GoodsReceipt {
            id: r.operation_id.clone(),
            order_id: r.order_id.clone(),
            order_number: order.number,
            supplier_id: order.supplier_id.clone(),
            reference: reference.clone(),
            note: r.note.trim().to_string(),
            lines: prepared.into_iter().map(|(line, _, _)| line).collect(),
            goods_total_paise: goods_total_i64,
            damaged_total_paise: damaged_total_i64,
            order_status: next_status.to_string(),
            created_at: now(&tx)?,
        };
        record(&tx, &r.operation_id, "goods_receipt.posted", &raw, &result)?;
        outbox(&tx, &r.operation_id, "goods_receipt.posted", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn list_goods_receipts(
        &self,
        order_id: &str,
    ) -> Result<Vec<GoodsReceipt>, StoreError> {
        if !valid_id(order_id) {
            return Err(StoreError::InvalidReceipt);
        }
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::SupplierRead)?;
        }
        let mut q = tx.prepare(
            "SELECT id, order_id, supplier_id, reference, note, goods_total_paise, damaged_total_paise, created_at FROM local_goods_receipts WHERE order_id = ?1 ORDER BY created_at, id LIMIT 200",
        )?;
        let rows = q.query_map([order_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, String>(7)?,
            ))
        })?;
        let (number, order_status): (i64, String) = tx
            .query_row(
                "SELECT number, status FROM local_purchase_orders WHERE id = ?1",
                [order_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or(StoreError::PurchaseOrderMissing)?;
        let mut result = Vec::new();
        for row in rows {
            let (
                id,
                order_id,
                supplier_id,
                reference,
                note,
                goods_total,
                damaged_total,
                created_at,
            ) = row?;
            let mut lq = tx.prepare(
                "SELECT line_index,product_id,quantity_milli,damaged_milli,unit_cost_paise,line_total_paise,note FROM local_goods_receipt_lines WHERE receipt_id = ?1 ORDER BY line_index",
            )?;
            let lines = lq
                .query_map([&id], |r| {
                    Ok(GoodsReceiptLine {
                        line_index: r.get(0)?,
                        product_id: r.get(1)?,
                        quantity_milli: r.get(2)?,
                        damaged_milli: r.get(3)?,
                        unit_cost_paise: r.get(4)?,
                        line_total_paise: r.get(5)?,
                        note: r.get(6)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            result.push(GoodsReceipt {
                id,
                order_id,
                order_number: number,
                supplier_id,
                reference,
                note,
                lines,
                goods_total_paise: goods_total,
                damaged_total_paise: damaged_total,
                order_status: order_status.clone(),
                created_at,
            });
        }
        tx.commit()?;
        Ok(result)
    }
}

fn outstanding_for_invoice(db: &Connection, invoice_id: &str) -> Result<i64, StoreError> {
    let total: Option<i64> = db
        .query_row(
            "SELECT total_paise FROM local_supplier_invoices WHERE id = ?1",
            [invoice_id],
            |r| r.get(0),
        )
        .optional()?;
    let total = total.ok_or(StoreError::InvalidPayable)?;
    let allocated: i64 = db.query_row(
        "SELECT COALESCE(SUM(amount_paise), 0) FROM local_supplier_payments WHERE invoice_id = ?1",
        [invoice_id],
        |r| r.get(0),
    )?;
    total
        .checked_sub(allocated)
        .ok_or(StoreError::InvalidPayable)
}
impl Store {
    /// Record a supplier invoice. When linked to a receipt, the difference
    /// between the invoice and the accrual already posted at receipt time is
    /// booked as an invoice variance; a standalone invoice accrues payables
    /// against the purchases account.
    pub(crate) fn post_supplier_invoice(
        &mut self,
        r: PostSupplierInvoice,
    ) -> Result<SupplierInvoice, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.supplier_id)
            || r.receipt_id.as_ref().map(|s| !valid_id(s)).unwrap_or(false)
            || !identity::text(&r.reference, 80)
            || !(1..=MAX_VALUE).contains(&r.total_paise)
            || r.due_on
                .as_ref()
                .map(|d| valid_date(&self.0, d).map(|ok| !ok).unwrap_or(true))
                .unwrap_or(false)
        {
            return Err(StoreError::InvalidPayable);
        }
        let reference = r.reference.trim().to_string();
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        authorize(
            &tx,
            &self.1,
            Permission::PaySuppliers,
            "supplier_invoice.posted",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<SupplierInvoice>(&tx, &r.operation_id, "supplier_invoice.posted", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let supplier = load_supplier(&tx, &r.supplier_id)?;
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_supplier_invoices WHERE supplier_id = ?1 AND reference = ?2)",
            params![r.supplier_id, reference],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(StoreError::InvalidPayable);
        }
        let today_s = today(&tx)?;
        let (purchase_order_id, goods_total, receipt_due) = match &r.receipt_id {
            Some(receipt_id) => {
                if tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM local_supplier_invoices WHERE receipt_id = ?1)",
                    [receipt_id],
                    |r| r.get::<_, bool>(0),
                )? {
                    return Err(StoreError::InvalidPayable);
                }
                let row: Option<(String, String, i64, String, String)> = tx
                    .query_row(
                        "SELECT supplier_id, order_id, goods_total_paise, created_at, id FROM local_goods_receipts WHERE id = ?1",
                        [receipt_id],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                    )
                    .optional()?;
                let (receipt_supplier, order_id, goods_total, receipt_created, _) =
                    row.ok_or(StoreError::InvalidPayable)?;
                if receipt_supplier != r.supplier_id {
                    return Err(StoreError::InvalidPayable);
                }
                let receipt_date = receipt_created.get(..10).unwrap_or(&today_s).to_string();
                let due = plus_days(&tx, &receipt_date, supplier.payment_terms_days)?;
                (Some(order_id), goods_total as i128, due)
            }
            None => (
                None,
                0,
                plus_days(&tx, &today_s, supplier.payment_terms_days)?,
            ),
        };
        let due_on = r.due_on.clone().or(Some(receipt_due));
        let variance = r.total_paise as i128 - goods_total;
        if variance < i64::MIN as i128 || variance > MAX_VALUE as i128 {
            return Err(StoreError::InvalidPayable);
        }
        let variance_i64 = variance as i64;
        if let Some(receipt_id) = &r.receipt_id {
            if variance != 0 {
                add_entry_and_journal(
                    &tx,
                    &r.operation_id,
                    &r.supplier_id,
                    "invoice_variance",
                    variance_i64,
                    due_on.as_deref(),
                    Some(&reference),
                    purchase_order_id.as_deref(),
                    Some(receipt_id),
                    Some(&r.operation_id),
                    None,
                    "Invoice differs from the receipt accrual",
                    &[("inventory", variance_i64), ("payables", -variance_i64)],
                )?;
            }
        } else {
            // No receipt to anchor the accrual: goods or services billed in advance.
            let amount = r.total_paise;
            add_entry_and_journal(
                &tx,
                &r.operation_id,
                &r.supplier_id,
                "supplier_invoice",
                amount,
                due_on.as_deref(),
                Some(&reference),
                None,
                None,
                Some(&r.operation_id),
                None,
                "Supplier invoice",
                &[("purchases", amount), ("payables", -amount)],
            )?;
        }
        let actor = self.1.as_ref().map(|s| s.actor_id.clone());
        one(
            &tx,
            "INSERT INTO local_supplier_invoices(id,supplier_id,receipt_id,reference,total_paise,due_on,created_by) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![r.operation_id, r.supplier_id, r.receipt_id.as_deref(), reference, r.total_paise, due_on, actor],
        )?;
        bump_supplier(&tx, &r.supplier_id, supplier.revision)?;
        let result = SupplierInvoice {
            id: r.operation_id.clone(),
            supplier_id: r.supplier_id.clone(),
            receipt_id: r.receipt_id.clone(),
            purchase_order_id,
            reference,
            total_paise: r.total_paise,
            variance_paise: variance_i64,
            due_on: due_on.clone(),
            created_at: now(&tx)?,
        };
        record(
            &tx,
            &r.operation_id,
            "supplier_invoice.posted",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "supplier_invoice.posted", &result)?;
        tx.commit()?;
        Ok(result)
    }
    /// Record a supplier payment. Invoice-bound payments may never exceed the
    /// invoice's open balance; an unallocated payment is the explicit advance
    /// workflow and carries the balance negative (supplier credit in our favour).
    pub(crate) fn post_supplier_payment(
        &mut self,
        r: PostSupplierPayment,
    ) -> Result<SupplierPayment, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.supplier_id)
            || r.invoice_id.as_ref().map(|s| !valid_id(s)).unwrap_or(false)
            || !(1..=MAX_VALUE).contains(&r.amount_paise)
            || !identity::text(&r.reference, 120)
            || r.paid_on
                .as_ref()
                .map(|d| valid_date(&self.0, d).map(|ok| !ok).unwrap_or(true))
                .unwrap_or(false)
        {
            return Err(StoreError::InvalidPayable);
        }
        let account = payment_account(&r.method)?;
        let paid_on = match &r.paid_on {
            Some(d) => Some(d.clone()),
            None => Some(today(&self.0)?),
        };
        let reference = r.reference.trim().to_string();
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        authorize(
            &tx,
            &self.1,
            Permission::PaySuppliers,
            "supplier_payment.posted",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<SupplierPayment>(&tx, &r.operation_id, "supplier_payment.posted", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let supplier = load_supplier(&tx, &r.supplier_id)?;
        if let Some(invoice_id) = &r.invoice_id {
            let owner: Option<String> = tx
                .query_row(
                    "SELECT supplier_id FROM local_supplier_invoices WHERE id = ?1",
                    [invoice_id],
                    |r| r.get(0),
                )
                .optional()?;
            if owner.as_deref() != Some(r.supplier_id.as_str()) {
                return Err(StoreError::InvalidPayable);
            }
            if r.amount_paise > outstanding_for_invoice(&tx, invoice_id)? {
                return Err(StoreError::Overpayment);
            }
        }
        add_entry_and_journal(
            &tx,
            &r.operation_id,
            &r.supplier_id,
            "payment",
            -r.amount_paise,
            None,
            Some(&reference),
            None,
            None,
            r.invoice_id.as_deref(),
            None,
            "Supplier payment",
            &[("payables", r.amount_paise), (account, -r.amount_paise)],
        )?;
        let actor = self.1.as_ref().map(|s| s.actor_id.clone());
        one(
            &tx,
            "INSERT INTO local_supplier_payments(id,supplier_id,invoice_id,method,amount_paise,reference,paid_on,created_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![r.operation_id, r.supplier_id, r.invoice_id.as_deref(), r.method, r.amount_paise, reference, paid_on, actor],
        )?;
        let revision = bump_supplier(&tx, &r.supplier_id, supplier.revision)?;
        let balance_after = balance(&tx, &r.supplier_id, i64::MAX)?;
        let result = SupplierPayment {
            id: r.operation_id.clone(),
            supplier_id: r.supplier_id.clone(),
            invoice_id: r.invoice_id.clone(),
            method: r.method.clone(),
            amount_paise: r.amount_paise,
            reference,
            paid_on: paid_on.clone(),
            balance_paise: balance_after.to_string(),
            created_at: now(&tx)?,
        };
        let _ = revision;
        record(
            &tx,
            &r.operation_id,
            "supplier_payment.posted",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "supplier_payment.posted", &result)?;
        tx.commit()?;
        Ok(result)
    }
    /// Configure an opening balance for a supplier. Owner-only and always audited.
    pub(crate) fn post_supplier_opening(
        &mut self,
        r: PostSupplierOpening,
    ) -> Result<SupplierReceipt, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.supplier_id)
            || r.amount_paise == 0
            || !(-MAX_VALUE..=MAX_VALUE).contains(&r.amount_paise)
            || !identity::text(&r.reason, 500)
            || r.due_on
                .as_ref()
                .map(|d| valid_date(&self.0, d).map(|ok| !ok).unwrap_or(true))
                .unwrap_or(false)
        {
            return Err(StoreError::InvalidPayable);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        authorize(
            &tx,
            &self.1,
            Permission::CorrectPayables,
            "payable.opening",
            Some(&r.operation_id),
        )?;
        if let Some(s) = &self.1 {
            let p = identity::verify(&tx, s, Permission::CorrectPayables)?;
            if p.role != Role::Owner {
                return Err(StoreError::Forbidden);
            }
        }
        if let Some(old) = replay::<SupplierReceipt>(&tx, &r.operation_id, "payable.opening", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let supplier = load_supplier(&tx, &r.supplier_id)?;
        let today_s = today(&tx)?;
        let due_on = r.due_on.clone().unwrap_or_else(|| today_s.clone());
        let amount = r.amount_paise;
        // Sign convention: positive amount means we owe the supplier.
        add_entry_and_journal(
            &tx,
            &r.operation_id,
            &r.supplier_id,
            "opening_due",
            amount,
            Some(&due_on),
            None,
            None,
            None,
            None,
            None,
            &r.reason,
            &[("opening_equity", amount), ("payables", -amount)],
        )?;
        let revision = bump_supplier(&tx, &r.supplier_id, supplier.revision)?;
        let result = SupplierReceipt {
            operation_id: r.operation_id.clone(),
            supplier_id: r.supplier_id.clone(),
            kind: "opening_due".into(),
            amount_paise: amount,
            balance_paise: balance(&tx, &r.supplier_id, i64::MAX)?.to_string(),
            revision,
            created_at: now(&tx)?,
        };
        record(&tx, &r.operation_id, "payable.opening", &raw, &result)?;
        outbox(&tx, &r.operation_id, "payable.opening", &result)?;
        tx.commit()?;
        Ok(result)
    }
    /// Reverse one payment, opening balance, invoice variance or standalone
    /// invoice accrual. Receipts and returns are reversed through their own
    /// workflows; history is never rewritten in place.
    pub(crate) fn reverse_supplier_entry(
        &mut self,
        r: ReverseSupplierEntry,
    ) -> Result<SupplierReceipt, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.target_operation_id)
            || !identity::text(&r.reason, 500)
        {
            return Err(StoreError::InvalidPayable);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        authorize(
            &tx,
            &self.1,
            Permission::CorrectPayables,
            "payable.reversed",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<SupplierReceipt>(&tx, &r.operation_id, "payable.reversed", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let original: Option<(String, String, i64, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = tx
            .query_row(
                "SELECT supplier_id, kind, amount_paise, due_on, reference, purchase_order_id, receipt_id, invoice_id FROM local_supplier_entries WHERE operation_id = ?1",
                [&r.target_operation_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
            )
            .optional()?;
        let (supplier_id, kind, amount, _due, _reference, order, receipt, invoice) =
            original.ok_or(StoreError::InvalidPayable)?;
        if !matches!(
            kind.as_str(),
            "payment" | "opening_due" | "invoice_variance" | "supplier_invoice" | "adjustment"
        ) {
            return Err(StoreError::InvalidPayable);
        }
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_supplier_entries WHERE reverse_of = ?1)",
            [&r.target_operation_id],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(StoreError::InvalidPayable);
        }
        let mut q = tx.prepare(
            "SELECT account, amount_paise FROM local_supplier_journal WHERE operation_id = ?1",
        )?;
        let rows = q.query_map([&r.target_operation_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?;
        let mut postings_owned: Vec<(String, i64)> = Vec::new();
        for row in rows {
            let (account, value) = row?;
            let negated = value.checked_neg().ok_or(StoreError::InvalidPayable)?;
            postings_owned.push((account, negated));
        }
        let postings: Vec<(&str, i64)> = postings_owned
            .iter()
            .map(|(account, value)| (account.as_str(), *value))
            .collect();
        add_entry_and_journal(
            &tx,
            &r.operation_id,
            &supplier_id,
            "reversal",
            -amount,
            None,
            None,
            order.as_deref(),
            receipt.as_deref(),
            invoice.as_deref(),
            Some(&r.target_operation_id),
            &r.reason,
            &postings,
        )?;
        let supplier = load_supplier(&tx, &supplier_id)?;
        let revision = bump_supplier(&tx, &supplier_id, supplier.revision)?;
        let result = SupplierReceipt {
            operation_id: r.operation_id.clone(),
            supplier_id: supplier_id.clone(),
            kind: "reversal".into(),
            amount_paise: -amount,
            balance_paise: balance(&tx, &supplier_id, i64::MAX)?.to_string(),
            revision,
            created_at: now(&tx)?,
        };
        record(&tx, &r.operation_id, "payable.reversed", &raw, &result)?;
        outbox(&tx, &r.operation_id, "payable.reversed", &result)?;
        tx.commit()?;
        Ok(result)
    }
}

impl Store {
    /// Send received goods back to the supplier. Supplier-credit returns reduce
    /// the payable; refunds return money to cash/bank/UPI without touching the
    /// payable. Stock is deducted atomically and cannot go below zero.
    pub(crate) fn post_purchase_return(
        &mut self,
        r: PostPurchaseReturn,
    ) -> Result<PurchaseReturn, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.receipt_id)
            || !matches!(r.disposition.as_str(), "supplier_credit" | "refund")
            || !identity::text(&r.reason, 500)
            || r.lines.is_empty()
            || r.lines.len() > 500
        {
            return Err(StoreError::InvalidReturn);
        }
        let refund_account = match (r.disposition.as_str(), r.refund_method.as_deref()) {
            ("supplier_credit", None) => None,
            ("supplier_credit", Some(_)) => return Err(StoreError::InvalidReturn),
            ("refund", Some(method)) => {
                Some(payment_account(method).map_err(|_| StoreError::InvalidReturn)?)
            }
            ("refund", None) => return Err(StoreError::InvalidReturn),
        };
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::Refund,
            "purchase.returned",
            Some(&r.operation_id),
        )?;
        if let Some(old) =
            replay::<PurchaseReturn>(&tx, &r.operation_id, "purchase_return.posted", &raw)?
        {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let receipt: Option<(String, String, Option<String>, String)> = tx
            .query_row(
                "SELECT supplier_id, order_id, reference, id FROM local_goods_receipts WHERE id = ?1",
                [&r.receipt_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?;
        let (supplier_id, order_id, receipt_reference, receipt_id) =
            receipt.ok_or(StoreError::InvalidReturn)?;
        let supplier = load_supplier(&tx, &supplier_id)?;
        let mut seen = std::collections::HashSet::with_capacity(r.lines.len());
        struct PreparedReturnLine {
            receipt_line: i64,
            product_id: String,
            quantity_milli: i64,
            unit_cost_paise: i64,
            line_total_paise: i64,
        }
        let mut prepared: Vec<PreparedReturnLine> = Vec::with_capacity(r.lines.len());
        let mut goods_total: i128 = 0;
        for input in &r.lines {
            if !seen.insert(input.receipt_line)
                || input.quantity_milli <= 0
                || input.quantity_milli > MAX_VALUE
            {
                return Err(StoreError::InvalidReturn);
            }
            let line: Option<(String, i64, i64, i64)> = tx
                .query_row(
                    "SELECT product_id, quantity_milli, damaged_milli, unit_cost_paise FROM local_goods_receipt_lines WHERE receipt_id = ?1 AND line_index = ?2",
                    params![receipt_id, input.receipt_line],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?;
            let (product_id, received, damaged, unit_cost_paise) =
                line.ok_or(StoreError::InvalidReturn)?;
            if product_id != input.product_id {
                return Err(StoreError::InvalidReturn);
            }
            // Good units already accepted back for this receipt line.
            let already_returned: i64 = tx.query_row(
                "SELECT COALESCE(SUM(l.quantity_milli), 0) FROM local_purchase_return_lines l JOIN local_purchase_returns r ON r.id = l.return_id WHERE r.receipt_id = ?1 AND l.receipt_line = ?2",
                params![receipt_id, input.receipt_line],
                |r| r.get(0),
            )?;
            let returnable = (received - damaged) - already_returned;
            if input.quantity_milli > returnable {
                return Err(StoreError::InvalidReturn);
            }
            let value = line_total(input.quantity_milli, unit_cost_paise)? as i128;
            goods_total = add(goods_total, value)?;
            prepared.push(PreparedReturnLine {
                receipt_line: input.receipt_line,
                product_id,
                quantity_milli: input.quantity_milli,
                unit_cost_paise,
                line_total_paise: line_total(input.quantity_milli, unit_cost_paise)?,
            });
        }
        if goods_total > MAX_VALUE as i128 {
            return Err(StoreError::InvalidReturn);
        }
        let goods_total_i64 = goods_total as i64;
        let actor = self.1.as_ref().map(|s| s.actor_id.clone());
        one(
            &tx,
            "INSERT INTO local_purchase_returns(id,supplier_id,receipt_id,disposition,refund_method,total_paise,reason,created_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![r.operation_id, supplier_id, receipt_id, r.disposition, r.refund_method.as_deref(), goods_total_i64, r.reason.trim(), actor],
        )?;
        for line in &prepared {
            one(
                &tx,
                "INSERT INTO local_purchase_return_lines(return_id,receipt_line,product_id,quantity_milli,unit_cost_paise,line_total_paise) VALUES(?1,?2,?3,?4,?5,?6)",
                params![r.operation_id, line.receipt_line, line.product_id, line.quantity_milli, line.unit_cost_paise, line.line_total_paise],
            )?;
            let updated = tx.execute(
                "UPDATE local_products SET stock_milli = stock_milli - ?1, revision = revision + 1 WHERE id = ?2 AND stock_milli >= ?1",
                params![line.quantity_milli, line.product_id],
            )?;
            if updated != 1 {
                return Err(StoreError::InvalidReturn);
            }
            one(
                &tx,
                "INSERT INTO local_purchase_stock_events(operation_id,product_id,kind,delta_milli,receipt_id,return_id) VALUES(?1,?2,'purchase_return',?3,?4,?5)",
                params![r.operation_id, line.product_id, -line.quantity_milli, receipt_id, r.operation_id],
            )?;
        }
        match r.disposition.as_str() {
            "supplier_credit" => {
                add_entry_and_journal(
                    &tx,
                    &r.operation_id,
                    &supplier_id,
                    "return_credit",
                    -goods_total_i64,
                    None,
                    receipt_reference.as_deref(),
                    Some(&order_id),
                    Some(receipt_id.as_str()),
                    None,
                    None,
                    &r.reason,
                    &[
                        ("payables", goods_total_i64),
                        ("inventory", -goods_total_i64),
                    ],
                )?;
            }
            "refund" => {
                let account = refund_account.ok_or(StoreError::InvalidReturn)?;
                // Money comes back; the payable is untouched. The refund is
                // visible in the journal and the return record.
                let postings: [(&str, i64); 2] =
                    [(account, goods_total_i64), ("inventory", -goods_total_i64)];
                let total: i128 = postings.iter().map(|(_, n)| *n as i128).sum();
                if total != 0 {
                    return Err(StoreError::CreditUnavailable);
                }
                for (account, amount) in postings {
                    journal(&tx, &r.operation_id, &supplier_id, account, amount)?;
                }
            }
            _ => return Err(StoreError::InvalidReturn),
        }
        let revision = bump_supplier(&tx, &supplier_id, supplier.revision)?;
        let _ = revision;
        let result = PurchaseReturn {
            id: r.operation_id.clone(),
            supplier_id,
            receipt_id: receipt_id.clone(),
            disposition: r.disposition.clone(),
            refund_method: r.refund_method.clone(),
            total_paise: goods_total_i64,
            reason: r.reason.trim().to_string(),
            created_at: now(&tx)?,
        };
        record(
            &tx,
            &r.operation_id,
            "purchase_return.posted",
            &raw,
            &result,
        )?;
        outbox(&tx, &r.operation_id, "purchase_return.posted", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn list_purchase_returns(
        &self,
        supplier_id: &str,
    ) -> Result<Vec<PurchaseReturn>, StoreError> {
        if !valid_id(supplier_id) {
            return Err(StoreError::InvalidSupplier);
        }
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::SupplierRead)?;
        }
        let mut q = tx.prepare(
            "SELECT id, supplier_id, receipt_id, disposition, refund_method, total_paise, reason, created_at FROM local_purchase_returns WHERE supplier_id = ?1 ORDER BY created_at DESC, id LIMIT 200",
        )?;
        let rows = q.query_map([supplier_id], |r| {
            Ok(PurchaseReturn {
                id: r.get(0)?,
                supplier_id: r.get(1)?,
                receipt_id: r.get(2)?,
                disposition: r.get(3)?,
                refund_method: r.get(4)?,
                total_paise: r.get(5)?,
                reason: r.get(6)?,
                created_at: r.get(7)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        tx.commit()?;
        Ok(result)
    }
}

fn statement(
    db: &Connection,
    id: &str,
    after: i64,
    through: Option<i64>,
    limit: Option<i64>,
) -> Result<SupplierStatement, StoreError> {
    let maximum: i64 = db.query_row(
        "SELECT COALESCE(MAX(sequence),0) FROM local_supplier_entries",
        [],
        |r| r.get(0),
    )?;
    let end = through.unwrap_or(maximum);
    if after < 0 || end < after || end > maximum {
        return Err(StoreError::InvalidPurchase);
    }
    let s = load_supplier(db, id)?;
    let opening = balance(db, id, after)?;
    let closing = balance(db, id, end)?;
    let bucket_summary = aging(db, id)?.summary();
    let mut q = db.prepare("SELECT sequence,operation_id,kind,amount_paise,created_at,due_on,reference,purchase_order_id,receipt_id,invoice_id,reverse_of,reason FROM local_supplier_entries WHERE supplier_id=?1 AND sequence>?2 AND sequence<=?3 ORDER BY sequence LIMIT ?4")?;
    let mut running = opening;
    let rows = q.query_map(params![id, after, end, limit.unwrap_or(-1)], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, Option<String>>(5)?,
            r.get::<_, Option<String>>(6)?,
            r.get::<_, Option<String>>(7)?,
            r.get::<_, Option<String>>(8)?,
            r.get::<_, Option<String>>(9)?,
            r.get::<_, Option<String>>(10)?,
            r.get::<_, String>(11)?,
        ))
    })?;
    let mut entries = Vec::new();
    for row in rows {
        let (seq, op, kind, amount, date, due, reference, order, receipt, invoice, reverse, reason) =
            row?;
        running = add(running, amount as i128)?;
        entries.push(SupplierStatementLine {
            sequence: seq,
            operation_id: op,
            kind,
            amount_paise: amount.to_string(),
            running_balance_paise: running.to_string(),
            created_at: date,
            due_on: due,
            reference,
            purchase_order_id: order,
            receipt_id: receipt,
            invoice_id: invoice,
            reverse_of: reverse,
            reason,
        });
    }
    let next_after = entries.last().map(|e| e.sequence).unwrap_or(after);
    let has_more: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_supplier_entries WHERE supplier_id=?1 AND sequence>?2 AND sequence<=?3)",
        params![id, next_after, end],
        |r| r.get(0),
    )?;
    Ok(SupplierStatement {
        supplier: s,
        through: end,
        next_after,
        has_more,
        opening_balance_paise: opening.to_string(),
        closing_balance_paise: closing.to_string(),
        aging: bucket_summary,
        entries,
    })
}
impl Store {
    pub(crate) fn supplier_statement(
        &self,
        id: &str,
        after: i64,
        through: Option<i64>,
    ) -> Result<SupplierStatement, StoreError> {
        if !valid_id(id) {
            return Err(StoreError::InvalidSupplier);
        }
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::SupplierRead)?;
        }
        let result = statement(&tx, id, after, through, Some(100))?;
        tx.commit()?;
        Ok(result)
    }
}

/// The schema file is the single source of truth for both tables and the
/// append-only triggers over them. It must stay idempotent-free: SQLite has
/// no IF NOT EXISTS for tables, so it may only ever run once per database.
pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("purchasing-schema.sql"))?;
    Ok(())
}

#[cfg(test)]
#[path = "purchasing_tests.rs"]
mod tests;
