//! Offline payment intent, manual reconciliation, returns and drawer closing.
//! No local operation can manufacture external/provider verification.
use crate::{
    billing::{self, Invoice, PostInvoice, Tender},
    catalog::MAX_VALUE,
    identity::{self, Permission, Session},
    Store, StoreError,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaymentPart {
    pub id: String,
    pub method: String,
    pub amount_paise: i64,
    pub reference: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReturnLine {
    pub line_index: usize,
    pub quantity_milli: i64,
    // Omit the legacy default so saved operation request bytes remain stable.
    #[serde(default, skip_serializing_if = "ReturnDisposition::is_sellable")]
    pub disposition: ReturnDisposition,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReturnDisposition {
    #[default]
    Sellable,
    Damaged,
    NoRestock,
}
impl ReturnDisposition {
    fn is_sellable(&self) -> bool {
        *self == Self::Sellable
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RefundPart {
    pub payment_id: String,
    pub amount_paise: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Action {
    Sale {
        invoice: PostInvoice,
        payments: Vec<PaymentPart>,
    },
    Match {
        payment_id: String,
        expected_revision: i64,
        reference: String,
        statement_amount_paise: i64,
        evidence: String,
    },
    ReverseMatch {
        payment_id: String,
        expected_revision: i64,
        reason: String,
    },
    Return {
        invoice_id: String,
        expected_revision: i64,
        lines: Vec<ReturnLine>,
        refunds: Vec<RefundPart>,
        reason: String,
    },
    MatchRefund {
        refund_id: String,
        expected_revision: i64,
        reference: String,
        statement_amount_paise: i64,
        evidence: String,
    },
    Float {
        day: String,
        username: String,
        amount_paise: i64,
    },
    CorrectFloat {
        opening_id: String,
        amount_paise: i64,
        reason: String,
    },
    Close {
        day: String,
        username: String,
        through: i64,
        counted_paise: i64,
    },
    CorrectClose {
        closing_id: String,
        counted_paise: i64,
        reason: String,
    },
    Reopen {
        closing_id: String,
        reason: String,
    },
}
impl Action {
    pub(crate) fn permission(&self) -> Permission {
        match self {
            Self::Sale { .. } | Self::Close { .. } => Permission::Sell,
            Self::Return { .. } => Permission::Refund,
            _ => Permission::Reconcile,
        }
    }
    fn key(&self) -> &'static str {
        match self {
            Self::Sale { .. } => "sale",
            Self::Match { .. } => "manual_match",
            Self::ReverseMatch { .. } => "match_reversed",
            Self::Return { .. } => "return",
            Self::MatchRefund { .. } => "refund_manual_match",
            Self::Float { .. } => "opening_float",
            Self::CorrectFloat { .. } => "opening_float_corrected",
            Self::Close { .. } => "drawer_closed",
            Self::CorrectClose { .. } => "closing_corrected",
            Self::Reopen { .. } => "drawer_reopened",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub operation_id: String,
    pub action: Action,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub operation_id: String,
    pub kind: String,
    pub data: Value,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pending {
    pub request: Request,
    pub receipt: Option<Receipt>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: String,
    pub invoice_id: String,
    pub method: String,
    pub amount_paise: i64,
    pub refundable_paise: i64,
    pub status: String,
    pub revision: i64,
    pub reference: String,
    pub externally_verified: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Refund {
    pub id: String,
    pub invoice_id: String,
    pub method: String,
    pub amount_paise: i64,
    pub status: String,
    pub revision: i64,
    pub reference: String,
    pub externally_verified: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnQuote {
    pub cash_out_paise: i64,
    pub credit_reduction_paise: i64,
    pub pending_digital_refund_paise: i64,
    pub canceled_digital_paise: i64,
    pub invoice: Invoice,
    pub revision: i64,
    pub subtotal_paise: i64,
    pub tax_paise: i64,
    pub total_paise: i64,
    pub suggested_refunds: Vec<RefundPart>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub day: String,
    pub username: String,
    pub actor_id: String,
    pub through: i64,
    pub opening_float_paise: i64,
    pub opening_float_id: Option<String>,
    pub net_cash_paise: String,
    pub expected_cash_paise: String,
    pub counted_cash_paise: Option<i64>,
    pub variance_paise: Option<String>,
    pub cash_recorded_paise: String,
    pub digital_recorded_paise: String,
    pub digital_pending_paise: String,
    pub manually_matched_paise: String,
    pub externally_verified_paise: String,
    pub refund_pending_paise: String,
    pub unattributed_cash_paise: String,
    pub closing_id: Option<String>,
    pub state: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub summary: DaySummary,
    pub pending: Option<Pending>,
    pub invoice: Option<Invoice>,
    pub payments: Vec<Payment>,
    pub refunds: Vec<Refund>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Export {
    pub file_name: String,
    pub csv: String,
}

fn one(db: &Connection, sql: &str, p: impl rusqlite::Params) -> Result<(), StoreError> {
    if db.execute(sql, p)? != 1 {
        return Err(StoreError::PaymentConflict);
    }
    Ok(())
}
fn sum(a: i128, b: i128) -> Result<i128, StoreError> {
    a.checked_add(b).ok_or(StoreError::InvalidPayment)
}
fn variance(counted: i64, expected: &str) -> Result<String, StoreError> {
    let expected = expected
        .parse::<i128>()
        .map_err(|_| StoreError::InvalidPayment)?;
    Ok((counted as i128)
        .checked_sub(expected)
        .ok_or(StoreError::InvalidPayment)?
        .to_string())
}
fn now(db: &Connection) -> Result<String, StoreError> {
    Ok(
        db.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
            r.get(0)
        })?,
    )
}
pub(crate) fn today(db: &Connection) -> Result<String, StoreError> {
    Ok(db.query_row("SELECT date('now','+330 minutes')", [], |r| r.get(0))?)
}
fn day_at(db: &Connection, date: &str) -> Result<String, StoreError> {
    Ok(db.query_row("SELECT date(?1,'+330 minutes')", [date], |r| r.get(0))?)
}
fn valid_day(db: &Connection, day: &str) -> Result<(), StoreError> {
    if day.len() != 10
        || !day.bytes().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
    {
        return Err(StoreError::InvalidPayment);
    }
    let d: Option<String> = db.query_row("SELECT date(?1,'+0 days')", [day], |r| r.get(0))?;
    if d.as_deref() != Some(day) || day > today(db)?.as_str() {
        return Err(StoreError::InvalidPayment);
    }
    Ok(())
}
fn reference(s: &str) -> Result<String, StoreError> {
    if s.len() > 320 {
        return Err(StoreError::InvalidPayment);
    }
    let s = s
        .split_whitespace()
        .collect::<String>()
        .to_ascii_uppercase();
    if !(6..=80).contains(&s.len())
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_/ .".contains(&b))
    {
        return Err(StoreError::InvalidPayment);
    }
    Ok(s)
}
fn reason(s: &str) -> Result<(), StoreError> {
    if !identity::text(s, 200) {
        return Err(StoreError::InvalidPayment);
    }
    Ok(())
}
fn actor(session: &Option<Session>) -> Option<&str> {
    session.as_ref().map(|s| s.actor_id.as_str())
}
fn journal(
    db: &Connection,
    id: &str,
    customer: Option<&str>,
    rows: &[(&str, i64)],
) -> Result<(), StoreError> {
    if rows
        .iter()
        .try_fold(0i128, |s, (_, v)| sum(s, *v as i128))?
        != 0
    {
        return Err(StoreError::InvalidPayment);
    }
    for (a, n) in rows {
        if *n != 0 {
            one(db,"INSERT INTO local_retail_journal(operation_id,customer_id,account,amount) VALUES(?1,?2,?3,?4)",params![id,customer,a,n])?;
        }
    }
    Ok(())
}
fn clearing(method: &str) -> Result<&'static str, StoreError> {
    match method {
        "upi" => Ok("upi_clearing"),
        "card" => Ok("card_clearing"),
        _ => Err(StoreError::InvalidPayment),
    }
}
pub(crate) fn unclaimed(db: &Connection, id: &str) -> Result<(), StoreError> {
    if db.query_row("SELECT EXISTS(SELECT 1 FROM local_retail_ops WHERE id=?1) OR EXISTS(SELECT 1 FROM local_retail_pending WHERE id=?1) OR EXISTS(SELECT 1 FROM local_retail_canceled WHERE id=?1)",[id],|r|r.get::<_,bool>(0))?{return Err(StoreError::OperationConflict);}
    Ok(())
}
pub(crate) fn invoice_id_check(db: &Connection, id: &str, retail: bool) -> Result<(), StoreError> {
    if !retail {
        unclaimed(db, id)?;
    }
    Ok(())
}
pub(crate) fn available(db: &Connection, id: &str) -> Result<(), StoreError> {
    if !billing::valid_id(id)||db.query_row("SELECT EXISTS(SELECT 1 FROM local_invoices WHERE id=?1) OR EXISTS(SELECT 1 FROM local_customer_ops WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_pending WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_canceled WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_checkout_canceled WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_retail_canceled WHERE id=?1)",[id],|r|r.get::<_,bool>(0))?{return Err(StoreError::OperationConflict);}
    Ok(())
}
fn replay(db: &Connection, r: &Request, raw: &str) -> Result<Option<Receipt>, StoreError> {
    let row: Option<(String, String)> = db
        .query_row(
            "SELECT request,payload FROM local_retail_ops WHERE id=?1",
            [&r.operation_id],
            |q| Ok((q.get(0)?, q.get(1)?)),
        )
        .optional()?;
    if let Some((request, payload)) = row {
        if request != raw {
            return Err(StoreError::OperationConflict);
        }
        return Ok(Some(serde_json::from_str(&payload)?));
    }
    Ok(None)
}
pub(crate) fn ensure_open(
    db: &Connection,
    actor: Option<&str>,
    day: &str,
) -> Result<(), StoreError> {
    if let Some(actor) = actor {
        let s:Option<String>=db.query_row("SELECT state FROM local_retail_closings WHERE actor_id=?1 AND day=?2 ORDER BY sequence DESC LIMIT 1",params![actor,day],|r|r.get(0)).optional()?;
        if s.as_deref().is_some_and(|s| s != "reopened") {
            return Err(StoreError::DayClosed);
        }
    }
    Ok(())
}
pub(crate) fn activity(
    db: &Connection,
    session: &Option<Session>,
    id: &str,
    kind: &str,
    cash: i64,
) -> Result<(), StoreError> {
    activity_at(db, session, id, kind, cash, None)
}
pub(crate) fn activity_at(
    db: &Connection,
    session: &Option<Session>,
    id: &str,
    kind: &str,
    cash: i64,
    date: Option<&str>,
) -> Result<(), StoreError> {
    let date = date.map(str::to_owned).map(Ok).unwrap_or_else(|| now(db))?;
    let day = day_at(db, &date)?;
    if cash != 0 || matches!(kind, "invoice" | "credit_entry" | "invoice_return") {
        ensure_open(db, actor(session), &day)?;
    }
    one(db,"INSERT INTO local_retail_activity(operation_id,actor_id,day,kind,cash_delta,created_at) VALUES(?1,?2,?3,?4,?5,?6)",params![id,actor(session),day,kind,cash,date])
}
fn state(db: &Connection, id: &str) -> Result<Payment, StoreError> {
    let row: (String, String, i64, String) = db
        .query_row(
            "SELECT invoice_id,method,amount,reference FROM local_retail_payments WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?
        .ok_or(StoreError::InvalidPayment)?;
    let returned: i64 = db.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM local_retail_return_parts WHERE payment_id=?1",
        [id],
        |r| r.get(0),
    )?;
    let revision: i64 = db.query_row(
        "SELECT (SELECT COUNT(*) FROM local_retail_events WHERE subject=?1)+(SELECT COUNT(*) FROM local_retail_return_parts WHERE payment_id=?1)",
        [id],
        |r| r.get(0),
    )?;
    let last:Option<(String,String)>=db.query_row("SELECT kind,reference FROM local_retail_events WHERE subject=?1 ORDER BY sequence DESC LIMIT 1",[id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
    let matched = last.as_ref().is_some_and(|(k, _)| k == "matched");
    let pending_refund:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM local_retail_refunds f WHERE f.payment_id=?1 AND NOT EXISTS(SELECT 1 FROM local_retail_events e WHERE e.subject=f.id AND e.kind='refund_matched'))",[id],|r|r.get(0))?;
    let status = if returned == row.2 {
        if row.1 == "cash" {
            "cash_refund_recorded"
        } else if row.1 == "credit" {
            "credit_returned"
        } else if !matched {
            "canceled"
        } else if pending_refund {
            "refund_pending"
        } else {
            "refund_manually_reconciled"
        }
    } else if row.1 == "cash" {
        "recorded"
    } else if row.1 == "credit" {
        "credit_due"
    } else if matched {
        "manually_reconciled"
    } else {
        "pending"
    };
    Ok(Payment {
        id: id.into(),
        invoice_id: row.0,
        method: row.1,
        amount_paise: row.2,
        refundable_paise: row
            .2
            .checked_sub(returned)
            .filter(|n| *n >= 0)
            .ok_or(StoreError::InvalidPayment)?,
        status: status.into(),
        revision,
        reference: last
            .filter(|(k, _)| k == "matched")
            .map(|(_, r)| r)
            .unwrap_or(row.3),
        externally_verified: false,
    })
}
fn manual_net(db: &Connection, p: &Payment) -> Result<i128, StoreError> {
    let op:Option<String>=db.query_row("SELECT operation_id FROM local_retail_events WHERE subject=?1 AND kind='matched' AND NOT EXISTS(SELECT 1 FROM local_retail_events n WHERE n.subject=?1 AND n.sequence>local_retail_events.sequence) ORDER BY sequence DESC LIMIT 1",[&p.id],|r|r.get(0)).optional()?;
    let Some(op) = op else { return Ok(0) };
    let received: i64 = db.query_row(
        "SELECT amount FROM local_retail_journal WHERE operation_id=?1 AND account=?2",
        params![op, clearing(&p.method)?],
        |r| r.get(0),
    )?;
    let sent:i64=db.query_row("SELECT COALESCE(SUM(f.amount),0) FROM local_retail_refunds f WHERE f.payment_id=?1 AND EXISTS(SELECT 1 FROM local_retail_events e WHERE e.subject=f.id AND e.kind='refund_matched')",[&p.id],|r|r.get(0))?;
    Ok(received as i128 - sent as i128)
}
fn invoice(db: &Connection, id: &str) -> Result<Invoice, StoreError> {
    let p: String = db
        .query_row(
            "SELECT payload FROM local_invoices WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or(StoreError::InvalidInvoice)?;
    Ok(serde_json::from_str(&p)?)
}
fn invoice_payments(db: &Connection, id: &str) -> Result<Vec<Payment>, StoreError> {
    let mut q =
        db.prepare("SELECT id FROM local_retail_payments WHERE invoice_id=?1 ORDER BY rowid")?;
    let ids = q
        .query_map([id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter().map(|id| state(db, id)).collect()
}
fn refund(db: &Connection, id: &str) -> Result<Refund, StoreError> {
    let row:(String,String,i64)=db.query_row("SELECT p.invoice_id,r.method,r.amount FROM local_retail_refunds r JOIN local_retail_payments p ON p.id=r.payment_id WHERE r.id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?.ok_or(StoreError::InvalidPayment)?;
    let count: i64 = db.query_row(
        "SELECT COUNT(*) FROM local_retail_events WHERE subject=?1",
        [id],
        |r| r.get(0),
    )?;
    let reference: Option<String> = db
        .query_row(
            "SELECT reference FROM local_retail_events WHERE subject=?1 AND kind='refund_matched'",
            [id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(Refund {
        id: id.into(),
        invoice_id: row.0,
        method: row.1,
        amount_paise: row.2,
        status: if reference.is_some() {
            "manually_reconciled"
        } else {
            "pending"
        }
        .into(),
        revision: count,
        reference: reference.unwrap_or_default(),
        externally_verified: false,
    })
}
fn insert_event(
    db: &Connection,
    s: &Option<Session>,
    op: &str,
    subject: &str,
    kind: &str,
    reference: &str,
    reason: &str,
) -> Result<(), StoreError> {
    one(db,"INSERT INTO local_retail_events(operation_id,subject,kind,reference,reason,actor_id) VALUES(?1,?2,?3,?4,?5,?6)",params![op,subject,kind,reference,reason,actor(s)])
}
fn ref_free(
    db: &Connection,
    method: &str,
    reference: &str,
    outbound: bool,
) -> Result<(), StoreError> {
    let sql = if outbound {
        "SELECT EXISTS(SELECT 1 FROM local_retail_events e JOIN local_retail_refunds p ON p.id=e.subject WHERE p.method=?1 AND e.reference=?2 AND e.kind='refund_matched')"
    } else {
        "SELECT EXISTS(SELECT 1 FROM local_retail_events e JOIN local_retail_payments p ON p.id=e.subject WHERE p.method=?1 AND e.reference=?2 AND e.kind='matched' AND NOT EXISTS(SELECT 1 FROM local_retail_events n WHERE n.subject=e.subject AND n.sequence>e.sequence))"
    };
    if db.query_row(sql, params![method, reference], |r| r.get::<_, bool>(0))? {
        return Err(StoreError::DuplicateSettlement);
    }
    Ok(())
}
fn target(db: &Connection, s: &Option<Session>, username: &str) -> Result<String, StoreError> {
    let id: String = db
        .query_row(
            "SELECT id FROM local_principals WHERE username=?1 AND business_id=(SELECT business_id FROM local_identity WHERE singleton=1)",
            [identity::username(username)?],
            |r| r.get(0),
        )
        .optional()?
        .ok_or(StoreError::InvalidPayment)?;
    if let Some(s) = s {
        if id != s.actor_id {
            identity::verify(db, s, Permission::Reports)?;
        }
    } else {
        return Err(StoreError::Locked);
    }
    Ok(id)
}

/// Validate the complete allocation against the native total before mutating
/// inventory or either ledger. The same guard also protects legacy posting.
pub(crate) fn validate_allocation(
    parts: &[PaymentPart],
    total: i64,
    customer: Option<&str>,
    retail: bool,
) -> Result<(), StoreError> {
    if parts.is_empty()
        || parts.len() > 8
        || parts
            .iter()
            .try_fold(0i128, |v, p| sum(v, p.amount_paise as i128))?
            != total as i128
    {
        return Err(StoreError::InvalidPayment);
    }
    let mut ids = BTreeSet::new();
    let mut credit_parts = 0usize;
    for p in parts {
        if !billing::valid_id(&p.id)
            || !ids.insert(&p.id)
            || !(1..=MAX_VALUE).contains(&p.amount_paise)
            || !matches!(p.method.as_str(), "cash" | "upi" | "card" | "credit")
            || p.reference.len() > 80
            || (!p.reference.is_empty() && reference(&p.reference).is_err())
            || (p.method == "credit" && customer.is_none())
        {
            return Err(StoreError::InvalidPayment);
        }
        if p.method == "credit" {
            credit_parts += 1;
        }
    }
    if credit_parts > 1 || (retail && (credit_parts == 1) != customer.is_some()) {
        return Err(StoreError::InvalidPayment);
    }
    Ok(())
}

pub(crate) fn invoice_posted(
    db: &Connection,
    s: &Option<Session>,
    i: &Invoice,
    parts: Option<&[PaymentPart]>,
) -> Result<(), StoreError> {
    let fallback = vec![PaymentPart {
        id: i.id.clone(),
        method: if i.tender == Tender::Cash {
            "cash"
        } else {
            "credit"
        }
        .into(),
        amount_paise: i.total_paise,
        reference: String::new(),
    }];
    let parts = parts.unwrap_or(&fallback);
    validate_allocation(
        parts,
        i.total_paise,
        i.customer_id.as_deref(),
        i.tender == Tender::Retail,
    )?;
    let mut cash = 0i64;
    for p in parts {
        one(
            db,
            "INSERT INTO local_retail_payments VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                p.id,
                i.id,
                p.method,
                p.amount_paise,
                p.reference.trim().to_ascii_uppercase(),
                i.created_at
            ],
        )?;
        if p.method == "cash" {
            cash = cash
                .checked_add(p.amount_paise)
                .ok_or(StoreError::InvalidPayment)?;
        }
    }
    if i.tender == Tender::Retail {
        // Cash is banked immediately; upi/card parts stay in receivables until
        // statement match, and the credit part stays there as customer debt
        // until repayment, mirroring a full credit sale.
        journal(db, &i.id, None, &[("cash", cash), ("receivables", -cash)])?;
    }
    activity_at(db, s, &i.id, "invoice", cash, Some(&i.created_at))?;
    Ok(())
}
pub(crate) fn pending_digital(db: &Connection) -> Result<i128, StoreError> {
    let mut q =
        db.prepare("SELECT id FROM local_retail_payments WHERE method IN ('upi','card')")?;
    let ids = q
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut n = 0;
    for id in ids {
        let p = state(db, &id)?;
        if p.status == "pending" {
            n = sum(n, p.refundable_paise as i128)?;
        }
    }
    Ok(n)
}
fn round(n: i128, d: i128) -> Result<i64, StoreError> {
    if n < 0 || d <= 0 {
        return Err(StoreError::InvalidPayment);
    }
    i64::try_from((n + d / 2) / d).map_err(|_| StoreError::InvalidPayment)
}
fn quote(db: &Connection, id: &str, lines: &[ReturnLine]) -> Result<ReturnQuote, StoreError> {
    let inv = invoice(db, id)?;
    if lines.is_empty() || lines.len() > 100 {
        return Err(StoreError::InvalidPayment);
    }
    let revision: i64 = db.query_row(
        "SELECT COUNT(*) FROM local_retail_returns WHERE invoice_id=?1",
        [id],
        |r| r.get(0),
    )?;
    let mut requested = BTreeMap::new();
    for l in lines {
        if l.line_index >= inv.lines.len()
            || l.quantity_milli < 1
            || requested.insert(l.line_index, l.quantity_milli).is_some()
        {
            return Err(StoreError::InvalidPayment);
        }
    }
    let (old_sub,old_tax):(i64,i64)=db.query_row("SELECT COALESCE(SUM(subtotal),0),COALESCE(SUM(tax),0) FROM local_retail_returns WHERE invoice_id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?)))?;
    let mut cumulative = 0i64;
    for (index, l) in inv.lines.iter().enumerate() {
        let returned:i64=db.query_row("SELECT COALESCE(SUM(x.quantity),0) FROM local_retail_return_items x JOIN local_retail_returns r ON r.id=x.operation_id WHERE r.invoice_id=?1 AND x.line_index=?2",params![id,index as i64],|r|r.get(0))?;
        let after = returned
            .checked_add(*requested.get(&index).unwrap_or(&0))
            .ok_or(StoreError::InvalidPayment)?;
        if after > l.quantity_milli {
            return Err(StoreError::InvalidPayment);
        }
        cumulative = cumulative
            .checked_add(round(
                l.total_paise as i128 * after as i128,
                l.quantity_milli as i128,
            )?)
            .ok_or(StoreError::InvalidPayment)?;
    }
    let sub = cumulative
        .checked_sub(old_sub)
        .ok_or(StoreError::InvalidPayment)?;
    let tax = round(
        inv.tax_paise as i128 * cumulative as i128,
        inv.subtotal_paise as i128,
    )?
    .checked_sub(old_tax)
    .ok_or(StoreError::InvalidPayment)?;
    let total = sub.checked_add(tax).ok_or(StoreError::InvalidPayment)?;
    if sub < 0 || tax < 0 {
        return Err(StoreError::InvalidPayment);
    }
    let mut pay = invoice_payments(db, id)?;
    pay.sort_by_key(|p| {
        if p.status == "pending" {
            0
        } else if p.method == "credit" {
            1
        } else if p.method == "cash" {
            2
        } else {
            3
        }
    });
    let mut left = total;
    let mut suggested = Vec::new();
    for p in pay {
        let n = left.min(p.refundable_paise);
        if n > 0 {
            suggested.push(RefundPart {
                payment_id: p.id,
                amount_paise: n,
            });
            left -= n;
        }
    }
    if left != 0 {
        return Err(StoreError::InvalidPayment);
    }
    let (mut cash_out, mut debt, mut pending_refund, mut canceled) = (0i64, 0i64, 0i64, 0i64);
    for part in &suggested {
        let p = state(db, &part.payment_id)?;
        if p.method == "cash" {
            cash_out += part.amount_paise;
        } else if p.method == "credit" {
            let (_, d, c) = crate::customers::quote_invoice_return(db, id, part.amount_paise)?;
            cash_out += c;
            debt += d;
        } else if p.status == "pending" {
            canceled += part.amount_paise;
        } else {
            pending_refund += part.amount_paise;
        }
    }
    Ok(ReturnQuote {
        cash_out_paise: cash_out,
        credit_reduction_paise: debt,
        pending_digital_refund_paise: pending_refund,
        canceled_digital_paise: canceled,
        invoice: inv,
        revision,
        subtotal_paise: sub,
        tax_paise: tax,
        total_paise: total,
        suggested_refunds: suggested,
    })
}
fn return_invoice(
    db: &Transaction<'_>,
    s: &Option<Session>,
    op: &str,
    id: &str,
    expected: i64,
    lines: &[ReturnLine],
    parts: &[RefundPart],
    why: &str,
) -> Result<Value, StoreError> {
    reason(why)?;
    let q = quote(db, id, lines)?;
    if q.revision != expected {
        return Err(StoreError::PaymentConflict);
    }
    if parts.len() > 8
        || parts
            .iter()
            .try_fold(0i128, |v, p| sum(v, p.amount_paise as i128))?
            != q.total_paise as i128
    {
        return Err(StoreError::InvalidPayment);
    }
    one(db,"INSERT INTO local_retail_returns(id,invoice_id,subtotal,tax,total,reason) VALUES(?1,?2,?3,?4,?5,?6)",params![op,id,q.subtotal_paise,q.tax_paise,q.total_paise,why])?;
    let mut stock = BTreeMap::<String, i64>::new();
    for l in lines {
        one(
            db,
            "INSERT INTO local_retail_return_items VALUES(?1,?2,?3)",
            params![op, l.line_index as i64, l.quantity_milli],
        )?;
        if !l.disposition.is_sellable() {
            continue;
        }
        let n = stock
            .entry(q.invoice.lines[l.line_index].product_id.clone())
            .or_default();
        *n = n
            .checked_add(l.quantity_milli)
            .ok_or(StoreError::InvalidStock)?;
    }
    let stock_restored = !stock.is_empty();
    for (id, qty) in stock {
        let (before, rev): (i64, i64) = db.query_row(
            "SELECT stock_milli,revision FROM local_products WHERE id=?1",
            [&id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let after = before
            .checked_add(qty)
            .filter(|n| *n <= MAX_VALUE)
            .ok_or(StoreError::InvalidStock)?;
        one(
            db,
            "UPDATE local_products SET stock_milli=?1,revision=?2 WHERE id=?3 AND revision=?4",
            params![
                after,
                rev.checked_add(1).ok_or(StoreError::InvalidStock)?,
                id,
                rev
            ],
        )?;
    }
    journal(
        db,
        op,
        None,
        &[
            ("revenue", q.subtotal_paise),
            ("tax_payable", q.tax_paise),
            ("refund_payable", -q.total_paise),
        ],
    )?;
    let mut ids = BTreeSet::new();
    let mut cash = 0i64;
    let mut obligations = Vec::new();
    for (index, p) in parts.iter().enumerate() {
        let st = state(db, &p.payment_id)?;
        if st.invoice_id != id
            || p.amount_paise <= 0
            || p.amount_paise > st.refundable_paise
            || !ids.insert(&p.payment_id)
        {
            return Err(StoreError::InvalidPayment);
        }
        let mut debt = 0;
        let mut cash_out = 0;
        if st.method == "cash" {
            cash_out = p.amount_paise;
            journal(
                db,
                op,
                None,
                &[("refund_payable", cash_out), ("cash", -cash_out)],
            )?;
        } else if st.method == "credit" {
            let (customer, due, out) =
                crate::customers::invoice_return(db, s, op, id, p.amount_paise, why)?;
            debt = due;
            cash_out = out;
            journal(
                db,
                op,
                Some(&customer),
                &[
                    ("refund_payable", p.amount_paise),
                    ("receivables", -debt),
                    ("cash", -cash_out),
                ],
            )?;
        } else if st.status == "pending" {
            journal(
                db,
                op,
                None,
                &[
                    ("refund_payable", p.amount_paise),
                    ("receivables", -p.amount_paise),
                ],
            )?;
        } else if st.status == "manually_reconciled" {
            let rid = format!("refund:{op}:{index}");
            one(
                db,
                "INSERT INTO local_retail_refunds VALUES(?1,?2,?3,?4,?5)",
                params![rid, op, p.payment_id, st.method, p.amount_paise],
            )?;
            obligations.push(rid);
        } else {
            return Err(StoreError::InvalidPayment);
        }
        cash = cash
            .checked_sub(cash_out)
            .ok_or(StoreError::InvalidPayment)?;
        one(
            db,
            "INSERT INTO local_retail_return_parts VALUES(?1,?2,?3,?4,?5)",
            params![op, p.payment_id, p.amount_paise, debt, cash_out],
        )?;
    }
    activity(db, s, op, "invoice_return", cash)?;
    Ok(
        json!({"invoiceId":id,"subtotalPaise":q.subtotal_paise,"taxPaise":q.tax_paise,"totalPaise":q.total_paise,"cashOutPaise":-cash,"pendingRefundIds":obligations,"stockRestored":stock_restored,"returnLines":lines}),
    )
}

fn summary(
    db: &Connection,
    s: &Option<Session>,
    day: &str,
    username: &str,
) -> Result<DaySummary, StoreError> {
    valid_day(db, day)?;
    let id = target(db, s, username)?;
    let through: i64 = db.query_row(
        "SELECT COALESCE(MAX(sequence),0) FROM local_retail_activity",
        [],
        |r| r.get(0),
    )?;
    let opening:Option<(String,i64)>=db.query_row("SELECT f.id,COALESCE((SELECT c.amount FROM local_retail_float_corrections c WHERE c.opening_id=f.id ORDER BY c.rowid DESC LIMIT 1),f.amount) FROM local_retail_floats f WHERE f.actor_id=?1 AND f.day=?2",params![id,day],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
    let float = opening.as_ref().map(|(_, n)| *n).unwrap_or(0);
    let mut cash = 0i128;
    let mut unknown = 0i128;
    let mut query = db.prepare(
        "SELECT actor_id,cash_delta FROM local_retail_activity WHERE day=?1 AND sequence<=?2",
    )?;
    for row in query.query_map(params![day, through], |r| {
        Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?))
    })? {
        let (a, n) = row?;
        if a.as_deref() == Some(&id) {
            cash = sum(cash, n as i128)?;
        } else if a.is_none() {
            unknown = sum(unknown, n as i128)?;
        }
    }
    let mut recorded = 0i128;
    let mut digital = 0i128;
    let mut pending = 0i128;
    let mut matched = 0i128;
    let mut q=db.prepare("SELECT p.id FROM local_retail_payments p JOIN local_invoice_actors a ON a.invoice_id=p.invoice_id WHERE a.actor_id=?1 AND date(p.created_at,'+330 minutes')=?2")?;
    for pid in q.query_map(params![id, day], |r| r.get::<_, String>(0))? {
        let p = state(db, &pid?)?;
        if p.method == "cash" {
            recorded = sum(recorded, p.amount_paise as i128)?;
        } else if p.method == "upi" || p.method == "card" {
            digital = sum(digital, p.amount_paise as i128)?;
            if p.status == "pending" {
                pending = sum(pending, p.refundable_paise as i128)?;
            }
            matched = sum(matched, manual_net(db, &p)?)?;
        }
    }
    let mut refund_pending = 0i128;
    let mut q=db.prepare("SELECT r.id FROM local_retail_refunds r JOIN local_retail_returns x ON x.id=r.operation_id JOIN local_retail_activity a ON a.operation_id=x.id WHERE a.actor_id=?1 AND a.day=?2")?;
    for rid in q.query_map(params![id, day], |r| r.get::<_, String>(0))? {
        let r = refund(db, &rid?)?;
        if r.status == "pending" {
            refund_pending = sum(refund_pending, r.amount_paise as i128)?;
        }
    }
    let last:Option<(String,String,String)>=db.query_row("SELECT id,state,payload FROM local_retail_closings WHERE actor_id=?1 AND day=?2 ORDER BY sequence DESC LIMIT 1",params![id,day],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?;
    let captured = last
        .as_ref()
        .filter(|(_, state, _)| state != "reopened")
        .map(|(_, _, p)| serde_json::from_str::<DaySummary>(p))
        .transpose()?;
    Ok(DaySummary {
        day: day.into(),
        username: username.into(),
        actor_id: id,
        through,
        opening_float_paise: float,
        opening_float_id: opening.map(|(id, _)| id),
        net_cash_paise: cash.to_string(),
        expected_cash_paise: sum(float as i128, cash)?.to_string(),
        counted_cash_paise: captured.as_ref().and_then(|x| x.counted_cash_paise),
        variance_paise: captured.and_then(|x| x.variance_paise),
        cash_recorded_paise: recorded.to_string(),
        digital_recorded_paise: digital.to_string(),
        digital_pending_paise: pending.to_string(),
        manually_matched_paise: matched.to_string(),
        externally_verified_paise: "0".into(),
        refund_pending_paise: refund_pending.to_string(),
        unattributed_cash_paise: if s
            .as_ref()
            .is_some_and(|s| identity::verify(db, s, Permission::Reports).is_ok())
        {
            unknown.to_string()
        } else {
            "0".into()
        },
        closing_id: last.as_ref().map(|(id, _, _)| id.clone()),
        state: last.map(|(_, s, _)| s).unwrap_or_else(|| "open".into()),
    })
}
fn close_row(
    db: &Connection,
    id: &str,
    summary: &DaySummary,
    state: &str,
) -> Result<(), StoreError> {
    one(
        db,
        "INSERT INTO local_retail_closings(id,actor_id,day,state,payload) VALUES(?1,?2,?3,?4,?5)",
        params![
            id,
            summary.actor_id,
            summary.day,
            state,
            serde_json::to_string(summary)?
        ],
    )
}
fn validate(r: &Request) -> Result<(), StoreError> {
    if !billing::valid_id(&r.operation_id) {
        return Err(StoreError::InvalidPayment);
    }
    match &r.action {
        Action::Sale { invoice, payments } => {
            invoice.validate()?;
            // A retail sale may split the tender across cash/upi/card parts
            // plus at most one "credit" part that books the remainder as
            // customer credit. The credit part exists iff a customer is set.
            let credit_parts = payments.iter().filter(|p| p.method == "credit").count();
            if invoice.operation_id != r.operation_id
                || invoice.tender != Tender::Retail
                || payments.is_empty()
                || payments.len() > 8
                || credit_parts > 1
                || (credit_parts == 1) != invoice.customer_id.is_some()
                || payments.iter().any(|p| {
                    !billing::valid_id(&p.id)
                        || !matches!(p.method.as_str(), "cash" | "upi" | "card" | "credit")
                        || !(1..=MAX_VALUE).contains(&p.amount_paise)
                        || p.reference.len() > 80
                })
            {
                return Err(StoreError::InvalidPayment);
            }
        }
        Action::Match {
            reference: r,
            evidence,
            ..
        }
        | Action::MatchRefund {
            reference: r,
            evidence,
            ..
        } => {
            reference(r)?;
            reason(evidence)?;
        }
        Action::CorrectFloat { reason: r, .. }
        | Action::ReverseMatch { reason: r, .. }
        | Action::Return { reason: r, .. }
        | Action::CorrectClose { reason: r, .. }
        | Action::Reopen { reason: r, .. } => reason(r)?,
        _ => {}
    }
    let date_shape = |day: &str| {
        day.len() == 10
            && day.bytes().enumerate().all(|(i, b)| {
                if i == 4 || i == 7 {
                    b == b'-'
                } else {
                    b.is_ascii_digit()
                }
            })
    };
    let money = |n: i64| (0..=MAX_VALUE).contains(&n);
    let revision = |n: i64| (0..=9_007_199_254_740_991).contains(&n);
    let bad = match &r.action {
        Action::Sale { .. } => false,
        Action::Match {
            payment_id,
            expected_revision,
            statement_amount_paise,
            ..
        } => {
            !billing::valid_id(payment_id)
                || !revision(*expected_revision)
                || *statement_amount_paise < 1
                || !money(*statement_amount_paise)
        }
        Action::MatchRefund {
            refund_id,
            expected_revision,
            statement_amount_paise,
            ..
        } => {
            refund_id.is_empty()
                || refund_id.len() > 160
                || !refund_id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_:".contains(&b))
                || !revision(*expected_revision)
                || *statement_amount_paise < 1
                || !money(*statement_amount_paise)
        }
        Action::ReverseMatch {
            payment_id,
            expected_revision,
            ..
        } => !billing::valid_id(payment_id) || !revision(*expected_revision),
        Action::Return {
            invoice_id,
            expected_revision,
            lines,
            refunds,
            ..
        } => {
            !billing::valid_id(invoice_id)
                || !revision(*expected_revision)
                || lines.is_empty()
                || lines.len() > 100
                || refunds.len() > 8
                || lines
                    .iter()
                    .any(|l| l.line_index >= 100 || !(1..=MAX_VALUE).contains(&l.quantity_milli))
                || refunds.iter().any(|p| {
                    !billing::valid_id(&p.payment_id) || !(1..=MAX_VALUE).contains(&p.amount_paise)
                })
        }
        Action::Float {
            day,
            username,
            amount_paise,
        } => !date_shape(day) || identity::username(username).is_err() || !money(*amount_paise),
        Action::CorrectFloat {
            opening_id,
            amount_paise,
            ..
        } => !billing::valid_id(opening_id) || !money(*amount_paise),
        Action::Close {
            day,
            username,
            through,
            counted_paise,
        } => {
            !date_shape(day)
                || identity::username(username).is_err()
                || *through < 0
                || !money(*counted_paise)
        }
        Action::CorrectClose {
            closing_id,
            counted_paise,
            ..
        } => !billing::valid_id(closing_id) || !money(*counted_paise),
        Action::Reopen { closing_id, .. } => !billing::valid_id(closing_id),
    };
    if bad {
        return Err(StoreError::InvalidPayment);
    }
    Ok(())
}

pub(crate) fn prepare_into(
    tx: &Transaction<'_>,
    session: &Option<Session>,
    r: Request,
) -> Result<bool, StoreError> {
    validate(&r)?;
    let raw = serde_json::to_string(&r)?;
    let s = session.clone().ok_or(StoreError::Locked)?;
    identity::guard(
        &tx,
        session,
        r.action.permission(),
        "retail.prepared",
        Some(&r.operation_id),
    )?;
    let old: Option<String> = tx
        .query_row(
            "SELECT request FROM local_retail_pending WHERE actor_id=?1",
            [&s.actor_id],
            |q| q.get(0),
        )
        .optional()?;
    if let Some(old) = old {
        return if old == raw {
            Ok(false)
        } else {
            Err(StoreError::CheckoutActive)
        };
    }
    if replay(&tx, &r, &raw)?.is_some() {
        return Ok(false);
    }
    available(&tx, &r.operation_id)?;
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_retail_pending WHERE id=?1)",
        [&r.operation_id],
        |q| q.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    if matches!(r.action, Action::Sale { .. }) {
        crate::held_bills::guard_checkout(tx, session, &r.operation_id)?;
        sale_clear(&tx)?;
    }
    one(
        &tx,
        "INSERT INTO local_retail_pending VALUES(?1,?2,?3)",
        params![s.actor_id, r.operation_id, raw],
    )?;
    Ok(true)
}

impl Store {
    pub(crate) fn prepare_retail(&mut self, r: Request) -> Result<(), StoreError> {
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        if prepare_into(&tx, &self.1, r)? {
            tx.commit()?;
        }
        Ok(())
    }
    pub(crate) fn pending_retail(&self) -> Result<Option<Pending>, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, s, Permission::Sell)?;
        let raw: Option<String> = self
            .0
            .query_row(
                "SELECT request FROM local_retail_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        raw.map(|raw| {
            let request: Request = serde_json::from_str(&raw)?;
            let receipt = replay(&self.0, &request, &raw)?;
            Ok(Pending { request, receipt })
        })
        .transpose()
    }
    pub(crate) fn clear_retail(&mut self, id: &str, saved: bool) -> Result<(), StoreError> {
        if !billing::valid_id(id) {
            return Err(StoreError::InvalidPayment);
        }
        let s = self.1.as_ref().ok_or(StoreError::Locked)?.clone();
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::Sell,
            if saved {
                "retail.acknowledged"
            } else {
                "retail.canceled"
            },
            Some(id),
        )?;
        let old: Option<String> = tx
            .query_row(
                "SELECT id FROM local_retail_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        let posted: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_retail_ops WHERE id=?1)",
            [id],
            |r| r.get(0),
        )?;
        let canceled: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_retail_canceled WHERE id=?1)",
            [id],
            |r| r.get(0),
        )?;
        if old.is_none() && ((saved && posted) || (!saved && canceled && !posted)) {
            return Ok(());
        }
        if old.as_deref() != Some(id) || saved != posted {
            return Err(StoreError::CheckoutActive);
        }
        if !saved {
            one(&tx, "INSERT INTO local_retail_canceled VALUES(?1)", [id])?;
        }
        one(
            &tx,
            "DELETE FROM local_retail_pending WHERE actor_id=?1 AND id=?2",
            params![s.actor_id, id],
        )?;
        if !saved {
            crate::held_bills::cancel_checkout(&tx, id)?;
            crate::restaurant_recovery::canceled(&tx, id)?;
        }
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn post_retail(&mut self, r: Request) -> Result<Receipt, StoreError> {
        validate(&r)?;
        let raw = serde_json::to_string(&r)?;
        let s = self.1.clone().ok_or(StoreError::Locked)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        // Authority first, writes after the replay check. `guard` records an audit
        // row, so calling it before `replay` made a retried retail operation
        // return the stored receipt while appending a second event for a sale that
        // happened once. `verify` checks the same permission and session, including
        // the recovery generation, without writing; the first authoritative posting
        // is audited below.
        identity::verify(&tx, &s, r.action.permission())?;
        if let Some(v) = replay(&tx, &r, &raw)? {
            return Ok(v);
        }
        identity::guard(
            &tx,
            &self.1,
            r.action.permission(),
            r.action.key(),
            Some(&r.operation_id),
        )?;
        available(&tx, &r.operation_id)?;
        let pending: Option<String> = tx
            .query_row(
                "SELECT request FROM local_retail_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        if pending.as_deref() != Some(&raw) {
            return Err(StoreError::CheckoutActive);
        }
        let id = &r.operation_id;
        let data = match &r.action {
            Action::Sale { invoice, payments } => {
                if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_checkout)", [], |r| {
                    r.get::<_, bool>(0)
                })? {
                    return Err(StoreError::CheckoutActive);
                }
                let inv = billing::post_into(&tx, &self.1, invoice.clone(), false, Some(payments))?;
                json!({"invoice":inv,"payments":invoice_payments(&tx,&inv.id)?,"externallyVerified":false})
            }
            Action::Match {
                payment_id,
                expected_revision,
                reference: r,
                statement_amount_paise,
                evidence,
            } => {
                let p = state(&tx, payment_id)?;
                if p.revision != *expected_revision
                    || p.status != "pending"
                    || p.refundable_paise <= 0
                    || *statement_amount_paise != p.refundable_paise
                    || !matches!(p.method.as_str(), "upi" | "card")
                {
                    return Err(StoreError::PaymentConflict);
                }
                let r = reference(r)?;
                ref_free(&tx, &p.method, &r, false)?;
                journal(
                    &tx,
                    id,
                    None,
                    &[
                        (clearing(&p.method)?, p.refundable_paise),
                        ("receivables", -p.refundable_paise),
                    ],
                )?;
                insert_event(&tx, &self.1, id, payment_id, "matched", &r, evidence)?;
                activity(&tx, &self.1, id, "manual_match", 0)?;
                json!({"payment":state(&tx,payment_id)?,"warning":"Manual statement match only. Not externally verified."})
            }
            Action::ReverseMatch {
                payment_id,
                expected_revision,
                reason,
            } => {
                let p = state(&tx, payment_id)?;
                if p.revision != *expected_revision
                    || p.status != "manually_reconciled"
                    || p.refundable_paise != p.amount_paise
                {
                    return Err(StoreError::PaymentConflict);
                }
                journal(
                    &tx,
                    id,
                    None,
                    &[
                        ("receivables", p.amount_paise),
                        (clearing(&p.method)?, -p.amount_paise),
                    ],
                )?;
                insert_event(
                    &tx,
                    &self.1,
                    id,
                    payment_id,
                    "unmatched",
                    &p.reference,
                    reason,
                )?;
                activity(&tx, &self.1, id, "match_reversed", 0)?;
                json!({"payment":state(&tx,payment_id)?})
            }
            Action::Return {
                invoice_id,
                expected_revision,
                lines,
                refunds,
                reason,
            } => return_invoice(
                &tx,
                &self.1,
                id,
                invoice_id,
                *expected_revision,
                lines,
                refunds,
                reason,
            )?,
            Action::MatchRefund {
                refund_id,
                expected_revision,
                reference: r,
                statement_amount_paise,
                evidence,
            } => {
                let f = refund(&tx, refund_id)?;
                if f.revision != *expected_revision
                    || f.status != "pending"
                    || *statement_amount_paise != f.amount_paise
                {
                    return Err(StoreError::PaymentConflict);
                }
                let r = reference(r)?;
                ref_free(&tx, &f.method, &r, true)?;
                journal(
                    &tx,
                    id,
                    None,
                    &[
                        ("refund_payable", f.amount_paise),
                        (clearing(&f.method)?, -f.amount_paise),
                    ],
                )?;
                insert_event(&tx, &self.1, id, refund_id, "refund_matched", &r, evidence)?;
                activity(&tx, &self.1, id, "refund_manual_match", 0)?;
                json!({"refund":refund(&tx,refund_id)?,"warning":"Manual refund statement match only. Not externally verified."})
            }
            Action::Float {
                day,
                username,
                amount_paise,
            } => {
                valid_day(&tx, day)?;
                if !(0..=MAX_VALUE).contains(amount_paise) {
                    return Err(StoreError::InvalidPayment);
                }
                let a = target(&tx, &self.1, username)?;
                ensure_open(&tx, Some(&a), day)?;
                if tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM local_retail_floats WHERE actor_id=?1 AND day=?2)",
                    params![a, day],
                    |r| r.get::<_, bool>(0),
                )? {
                    return Err(StoreError::PaymentConflict);
                }
                one(
                    &tx,
                    "INSERT INTO local_retail_floats VALUES(?1,?2,?3,?4)",
                    params![id, a, day, amount_paise],
                )?;
                activity(&tx, &self.1, id, "opening_float", 0)?;
                json!({"summary":summary(&tx,&self.1,day,username)?})
            }
            Action::CorrectFloat {
                opening_id,
                amount_paise,
                reason,
            } => {
                if !(0..=MAX_VALUE).contains(amount_paise) {
                    return Err(StoreError::InvalidPayment);
                }
                let (a, day): (String, String) = tx
                    .query_row(
                        "SELECT actor_id,day FROM local_retail_floats WHERE id=?1",
                        [opening_id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()?
                    .ok_or(StoreError::InvalidPayment)?;
                ensure_open(&tx, Some(&a), &day)?;
                one(
                    &tx,
                    "INSERT INTO local_retail_float_corrections VALUES(?1,?2,?3,?4)",
                    params![id, opening_id, amount_paise, reason],
                )?;
                activity(&tx, &self.1, id, "opening_float_corrected", 0)?;
                json!({"openingId":opening_id,"amountPaise":amount_paise})
            }
            Action::Close {
                day,
                username,
                through,
                counted_paise,
            } => {
                if !(0..=MAX_VALUE).contains(counted_paise) {
                    return Err(StoreError::InvalidPayment);
                }
                let mut x = summary(&tx, &self.1, day, username)?;
                ensure_open(&tx, Some(&x.actor_id), day)?;
                if x.through != *through {
                    return Err(StoreError::PaymentConflict);
                }
                let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM local_checkout WHERE actor_id=?1) OR EXISTS(SELECT 1 FROM local_customer_pending WHERE actor_id=?1) OR EXISTS(SELECT 1 FROM local_retail_pending WHERE actor_id=?1 AND id<>?2)",params![x.actor_id,id],|r|r.get(0))?;
                if pending {
                    return Err(StoreError::CheckoutActive);
                }
                x.counted_cash_paise = Some(*counted_paise);
                x.variance_paise = Some(variance(*counted_paise, &x.expected_cash_paise)?);
                x.closing_id = Some(id.clone());
                x.state = "closed".into();
                close_row(&tx, id, &x, "closed")?;
                json!({"closing":x})
            }
            Action::CorrectClose {
                closing_id,
                reason: _,
                ..
            }
            | Action::Reopen {
                closing_id,
                reason: _,
            } => {
                let raw: String = tx
                    .query_row(
                        "SELECT payload FROM local_retail_closings WHERE id=?1",
                        [closing_id],
                        |r| r.get(0),
                    )
                    .optional()?
                    .ok_or(StoreError::InvalidPayment)?;
                let mut x: DaySummary = serde_json::from_str(&raw)?;
                let latest:String=tx.query_row("SELECT id FROM local_retail_closings WHERE actor_id=?1 AND day=?2 ORDER BY sequence DESC LIMIT 1",params![x.actor_id,x.day],|r|r.get(0))?;
                if latest != *closing_id || x.state == "reopened" {
                    return Err(StoreError::PaymentConflict);
                }
                if let Action::CorrectClose { counted_paise, .. } = &r.action {
                    if !(0..=MAX_VALUE).contains(counted_paise) {
                        return Err(StoreError::InvalidPayment);
                    }
                    x.counted_cash_paise = Some(*counted_paise);
                    x.variance_paise = Some(variance(*counted_paise, &x.expected_cash_paise)?);
                    x.state = "corrected".into();
                } else {
                    x.state = "reopened".into();
                }
                x.closing_id = Some(id.clone());
                close_row(&tx, id, &x, &x.state)?;
                json!({"closing":x})
            }
        };
        let receipt = Receipt {
            operation_id: id.clone(),
            kind: r.action.key().into(),
            data,
        };
        one(
            &tx,
            "INSERT INTO local_retail_ops VALUES(?1,?2,?3)",
            params![id, raw, serde_json::to_string(&receipt)?],
        )?;
        let scope = identity::scope(&tx)?;
        one(
            &tx,
            "INSERT INTO local_retail_outbox(operation_id,payload) VALUES(?1,?2)",
            params![
                id,
                json!({"version":1,"scope":scope,"actorId":s.actor_id,"receipt":receipt})
                    .to_string()
            ],
        )?;
        #[cfg(test)]
        crash_point(id, "before_commit");
        tx.commit()?;
        #[cfg(test)]
        crash_point(id, "after_commit");
        Ok(receipt)
    }
    pub(crate) fn retail_view(
        &self,
        day: &str,
        username: &str,
        invoice_id: Option<&str>,
    ) -> Result<View, StoreError> {
        let tx = self.0.unchecked_transaction()?;
        let summary = summary(&tx, &self.1, day, username)?;
        let pending = self.pending_retail()?;
        let (inv, pay, refunds) = if let Some(id) = invoice_id {
            if let Some(s) = &self.1 {
                identity::invoice_reader(&tx, &Some(s.clone()), id)?;
            }
            let i = invoice(&tx, id)?;
            let p = invoice_payments(&tx, id)?;
            let mut q=tx.prepare("SELECT r.id FROM local_retail_refunds r JOIN local_retail_payments p ON p.id=r.payment_id WHERE p.invoice_id=?1 ORDER BY r.rowid")?;
            let ids = q
                .query_map([id], |r| r.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            let f = ids
                .iter()
                .map(|id| refund(&tx, id))
                .collect::<Result<Vec<_>, _>>()?;
            (Some(i), p, f)
        } else {
            (None, vec![], vec![])
        };
        tx.commit()?;
        Ok(View {
            summary,
            pending,
            invoice: inv,
            payments: pay,
            refunds,
        })
    }
    pub(crate) fn quote_retail_return(
        &self,
        id: &str,
        lines: &[ReturnLine],
    ) -> Result<ReturnQuote, StoreError> {
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::Refund)?;
        }
        let q = quote(&tx, id, lines)?;
        tx.commit()?;
        Ok(q)
    }
    pub(crate) fn takeover_payment(&mut self, id: &str, why: &str) -> Result<String, StoreError> {
        reason(why)?;
        let s = self.1.clone().ok_or(StoreError::Locked)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::Settings,
            "payment.checkpoint_adopted",
            Some(id),
        )?;
        for (table, idcol, kind) in [
            ("local_retail_pending", "id", "retail"),
            ("local_customer_pending", "operation_id", "credit"),
            ("local_checkout", "operation_id", "checkout"),
        ] {
            let old: Option<String> = tx
                .query_row(
                    &format!("SELECT actor_id FROM {table} WHERE {idcol}=?1"),
                    [id],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(old) = old {
                if old == s.actor_id {
                    tx.commit()?;
                    return Ok(kind.into());
                }
                let exists: bool = tx.query_row(
                    &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE actor_id=?1)"),
                    [&s.actor_id],
                    |r| r.get(0),
                )?;
                if exists {
                    return Err(StoreError::CheckoutActive);
                }
                one(
                    &tx,
                    &format!("UPDATE {table} SET actor_id=?1 WHERE {idcol}=?2 AND actor_id=?3"),
                    params![s.actor_id, id, old],
                )?;
                identity::audit_details(
                    &tx,
                    &s,
                    "payment.checkpoint_adopted",
                    id,
                    json!({"previousActorId":old,"reason":why,"kind":kind}),
                )?;
                tx.commit()?;
                return Ok(kind.into());
            }
        }
        Err(StoreError::InvalidPayment)
    }
}

// Only subprocess regression tests can activate these points. Neither the
// hook nor its environment-variable handling exists in production builds.
#[cfg(test)]
fn crash_point(id: &str, phase: &str) {
    if std::env::var("SORNIO_RETAIL_CRASH_ID").ok().as_deref() == Some(id)
        && std::env::var("SORNIO_RETAIL_CRASH_PHASE").ok().as_deref() == Some(phase)
    {
        std::process::exit(if phase == "before_commit" { 88 } else { 89 });
    }
}
fn sale_clear(db: &Connection) -> Result<(), StoreError> {
    if db.query_row("SELECT EXISTS(SELECT 1 FROM local_checkout) OR EXISTS(SELECT 1 FROM local_retail_pending WHERE json_extract(request,'$.action.kind')='sale')",[],|r|r.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}
    Ok(())
}
pub(crate) fn old_sale_clear(db: &Connection) -> Result<(), StoreError> {
    if db.query_row("SELECT EXISTS(SELECT 1 FROM local_retail_pending WHERE json_extract(request,'$.action.kind')='sale')",[],|r|r.get::<_,bool>(0))?{return Err(StoreError::CheckoutActive);}
    Ok(())
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("payments-schema.sql"))?;
    // Extend the entry kind without changing a single existing financial row.
    tx.execute_batch("CREATE TABLE local_credit_entries_new (sequence INTEGER PRIMARY KEY AUTOINCREMENT,operation_id TEXT NOT NULL,customer_id TEXT NOT NULL REFERENCES local_customers(id),kind TEXT NOT NULL CHECK(kind IN ('sale','repayment','opening_due','write_off','reversal','link_in','link_out','return')),amount_paise INTEGER NOT NULL CHECK(typeof(amount_paise)='integer' AND amount_paise<>0 AND amount_paise BETWEEN -9000000000000 AND 9000000000000),due_on TEXT,invoice_id TEXT REFERENCES local_invoices(id),reverse_of TEXT,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(operation_id,customer_id)); INSERT INTO local_credit_entries_new SELECT * FROM local_credit_entries; DROP TABLE local_credit_entries; ALTER TABLE local_credit_entries_new RENAME TO local_credit_entries; CREATE UNIQUE INDEX credit_sale_once ON local_credit_entries(invoice_id) WHERE kind='sale'; CREATE UNIQUE INDEX credit_reverse_once ON local_credit_entries(reverse_of) WHERE reverse_of IS NOT NULL; CREATE INDEX customer_credit_history ON local_credit_entries(customer_id,sequence); CREATE INDEX credit_invoice_links ON local_credit_entries(invoice_id,sequence);")?;
    for action in ["UPDATE", "DELETE"] {
        tx.execute_batch(&format!("CREATE TRIGGER local_credit_entries_no_{action} BEFORE {action} ON local_credit_entries BEGIN SELECT RAISE(ABORT,'Credit history is append only'); END;"))?;
    }
    let invoices = {
        let mut q=tx.prepare("SELECT i.payload,a.actor_id FROM local_invoices i LEFT JOIN local_invoice_actors a ON a.invoice_id=i.id ORDER BY i.sequence")?;
        let rows = q.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    for (raw, actor) in invoices {
        let i: Invoice = serde_json::from_str(&raw)?;
        invoice_posted(tx, &None, &i, None)?;
        one(tx,"UPDATE local_retail_activity SET actor_id=?1,day=?2,created_at=?3 WHERE operation_id=?4",params![actor,day_at(tx,&i.created_at)?,i.created_at,i.id])?;
    }
    let old = {
        let mut q=tx.prepare("SELECT j.operation_id,j.amount_paise,json_extract(o.payload,'$.createdAt'),(SELECT a.actor_id FROM local_identity_audit a WHERE a.target=j.operation_id AND a.action='credit.posted' ORDER BY a.sequence LIMIT 1) FROM local_customer_journal j JOIN local_customer_ops o ON o.operation_id=j.operation_id WHERE j.account='cash'")?;
        let rows = q.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    for (id, cash, date, actor) in old {
        one(tx,"INSERT INTO local_retail_activity(operation_id,actor_id,day,kind,cash_delta,created_at) VALUES(?1,?2,?3,'legacy_credit_cash',?4,?5)",params![id,actor,day_at(tx,&date)?,cash,date])?;
    }
    for table in [
        "local_retail_ops",
        "local_retail_canceled",
        "local_retail_payments",
        "local_retail_events",
        "local_retail_journal",
        "local_retail_activity",
        "local_retail_returns",
        "local_retail_return_items",
        "local_retail_return_parts",
        "local_retail_refunds",
        "local_retail_floats",
        "local_retail_float_corrections",
        "local_retail_closings",
        "local_retail_outbox",
    ] {
        for action in ["UPDATE", "DELETE"] {
            tx.execute_batch(&format!("CREATE TRIGGER {table}_no_{action} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Settlement history is append only'); END;"))?;
        }
    }
    Ok(())
}
fn csv_text(s: &str) -> String {
    let trimmed = s.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    let prefix = if trimmed.starts_with(['=', '+', '-', '@']) {
        "'"
    } else {
        ""
    };
    format!("\"{prefix}{}\"", s.replace('"', "\"\""))
}
fn decimal(n: i128) -> String {
    format!(
        "{}{}.{:02}",
        if n < 0 { "-" } else { "" },
        n.abs() / 100,
        n.abs() % 100
    )
}
fn csv_row(
    out: &mut String,
    typ: &str,
    day: &str,
    time: &str,
    actor: &str,
    op: &str,
    invoice: &str,
    account: &str,
    status: &str,
    n: i128,
    reference: &str,
    note: &str,
) {
    let cells = [typ, day, time, actor, op, invoice, account, status];
    out.push_str(&cells.map(csv_text).join(","));
    out.push(',');
    out.push_str(&decimal(n));
    out.push(',');
    out.push_str(&csv_text(reference));
    out.push(',');
    out.push_str(&csv_text(note));
    out.push_str(",false\r\n");
}
impl Store {
    pub(crate) fn export_retail(&mut self, day: &str) -> Result<Export, StoreError> {
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        valid_day(&tx, day)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::Reports,
            "settlements.export_prepared",
            Some(day),
        )?;
        let scope = identity::scope(&tx)?;
        let mut out=String::from("record_type,business_day_ist,timestamp_utc,actor_id,operation_id,invoice_id,account_or_method,status,amount_rupees,reference,note,externally_verified\r\n");
        let stamp = now(&tx)?;
        csv_row(
            &mut out,
            "scope",
            day,
            &stamp,
            &s.actor_id,
            "",
            "",
            "",
            "snapshot",
            0,
            "",
            &format!(
                "Business {} / workspace {}. Manual records are not provider verification.",
                scope.business_id, scope.workspace_id
            ),
        );
        {
            let mut q=tx.prepare("SELECT p.id,p.created_at,COALESCE(a.actor_id,'legacy-unattributed') FROM local_retail_payments p LEFT JOIN local_invoice_actors a ON a.invoice_id=p.invoice_id WHERE date(p.created_at,'+330 minutes')=?1 ORDER BY p.rowid")?;
            for row in q.query_map([day], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })? {
                let (id, date, actor) = row?;
                let p = state(&tx, &id)?;
                csv_row(
                    &mut out,
                    "payment_register",
                    day,
                    &date,
                    &actor,
                    &id,
                    &p.invoice_id,
                    &p.method,
                    &p.status,
                    p.amount_paise as i128,
                    &p.reference,
                    "Original amount; status as of export. Pending is not collected or verified.",
                );
            }
        }
        {
            let mut q=tx.prepare("SELECT r.id,a.created_at,COALESCE(a.actor_id,'legacy-unattributed'),r.operation_id FROM local_retail_refunds r JOIN local_retail_activity a ON a.operation_id=r.operation_id WHERE a.day=?1 ORDER BY r.rowid")?;
            for row in q.query_map([day], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })? {
                let (id, date, actor, op) = row?;
                let f = refund(&tx, &id)?;
                csv_row(
                    &mut out,
                    "refund_obligation",
                    day,
                    &date,
                    &actor,
                    &op,
                    &f.invoice_id,
                    &f.method,
                    &f.status,
                    -(f.amount_paise as i128),
                    &f.reference,
                    "Digital refund obligation; manual match is not external verification.",
                );
            }
        }
        {
            let mut q=tx.prepare("SELECT operation_id,COALESCE(actor_id,'legacy-unattributed'),kind,cash_delta,created_at FROM local_retail_activity WHERE day=?1 ORDER BY sequence")?;
            for row in q.query_map([day], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })? {
                let (id, actor, kind, n, time) = row?;
                csv_row(
                    &mut out,
                    "cash_movement",
                    day,
                    &time,
                    &actor,
                    &id,
                    "",
                    "cash",
                    &kind,
                    n as i128,
                    "",
                    "Drawer cash only; do not add register rows to ledger rows.",
                );
            }
        }
        {
            let mut q=tx.prepare("SELECT e.operation_id,e.kind,e.reference,e.reason,COALESCE(e.actor_id,'legacy-unattributed'),a.created_at,COALESCE(p.invoice_id,rp.invoice_id),COALESCE(p.method,f.method),(SELECT j.amount FROM local_retail_journal j WHERE j.operation_id=e.operation_id AND j.account IN ('upi_clearing','card_clearing') LIMIT 1) FROM local_retail_events e JOIN local_retail_activity a ON a.operation_id=e.operation_id LEFT JOIN local_retail_payments p ON p.id=e.subject LEFT JOIN local_retail_refunds f ON f.id=e.subject LEFT JOIN local_retail_payments rp ON rp.id=f.payment_id WHERE a.day=?1 ORDER BY e.sequence")?;
            for row in q.query_map([day], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, i64>(8)?,
                ))
            })? {
                let (id, kind, reference, reason, actor, time, inv, method, n) = row?;
                csv_row(
                    &mut out,
                    "manual_reconciliation",
                    day,
                    &time,
                    &actor,
                    &id,
                    &inv,
                    &method,
                    &kind,
                    n as i128,
                    &reference,
                    &reason,
                );
            }
        }
        {
            let mut q=tx.prepare("SELECT f.id,f.actor_id,f.amount,'opening_float','' FROM local_retail_floats f WHERE f.day=?1 UNION ALL SELECT c.id,f.actor_id,c.amount,'opening_float_corrected',c.reason FROM local_retail_float_corrections c JOIN local_retail_floats f ON f.id=c.opening_id WHERE f.day=?1")?;
            for row in q.query_map([day], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })? {
                let (id, actor, n, kind, reason) = row?;
                csv_row(
                    &mut out,
                    "opening_declaration",
                    day,
                    "",
                    &actor,
                    &id,
                    "",
                    "cash",
                    &kind,
                    n as i128,
                    "",
                    &reason,
                );
            }
        }
        {
            let sql="SELECT l.invoice_id,l.account,l.amount_paise,json_extract(i.payload,'$.createdAt'),COALESCE(a.actor_id,'legacy-unattributed'),l.invoice_id FROM local_billing_ledger l JOIN local_invoices i ON i.id=l.invoice_id LEFT JOIN local_invoice_actors a ON a.invoice_id=i.id WHERE date(json_extract(i.payload,'$.createdAt'),'+330 minutes')=?1 UNION ALL SELECT j.operation_id,j.account,j.amount_paise,json_extract(o.payload,'$.createdAt'),COALESCE((SELECT actor_id FROM local_identity_audit WHERE target=j.operation_id AND action='credit.posted' ORDER BY sequence LIMIT 1),'legacy-unattributed'),'' FROM local_customer_journal j JOIN local_customer_ops o ON o.operation_id=j.operation_id WHERE date(json_extract(o.payload,'$.createdAt'),'+330 minutes')=?1 UNION ALL SELECT j.operation_id,j.account,j.amount,a.created_at,COALESCE(a.actor_id,'legacy-unattributed'),COALESCE((SELECT invoice_id FROM local_retail_returns WHERE id=j.operation_id),(SELECT invoice_id FROM local_retail_payments WHERE id=json_extract(o.request,'$.action.paymentId')),json_extract(o.request,'$.action.invoice.operationId'),'') FROM local_retail_journal j JOIN local_retail_activity a ON a.operation_id=j.operation_id LEFT JOIN local_retail_ops o ON o.id=j.operation_id WHERE a.day=?1";
            let mut q = tx.prepare(sql)?;
            for row in q.query_map([day], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                ))
            })? {
                let (id, account, n, time, actor, inv) = row?;
                csv_row(
                    &mut out,
                    "journal",
                    day,
                    &time,
                    &actor,
                    &id,
                    &inv,
                    &account,
                    "posted",
                    n as i128,
                    "",
                    "Signed debit/credit paise converted exactly to rupees.",
                );
            }
        }
        {
            let mut q = tx.prepare(
                "SELECT c.id,c.payload,COALESCE((SELECT a.created_at FROM local_identity_audit a WHERE a.target=c.id AND a.action IN ('drawer_closed','closing_corrected','drawer_reopened') ORDER BY a.sequence LIMIT 1),''),COALESCE(json_extract(o.request,'$.action.reason'),'') FROM local_retail_closings c LEFT JOIN local_retail_ops o ON o.id=c.id WHERE c.day=?1 ORDER BY c.sequence",
            )?;
            for row in q.query_map([day], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })? {
                let (id, payload, time, reason) = row?;
                let x: DaySummary = serde_json::from_str(&payload)?;
                for (name, n) in [
                    (
                        "expected_cash",
                        x.expected_cash_paise
                            .parse::<i128>()
                            .map_err(|_| StoreError::InvalidPayment)?,
                    ),
                    ("counted_cash", x.counted_cash_paise.unwrap_or(0) as i128),
                    (
                        "variance",
                        x.variance_paise
                            .as_deref()
                            .unwrap_or("0")
                            .parse::<i128>()
                            .map_err(|_| StoreError::InvalidPayment)?,
                    ),
                ] {
                    csv_row(
                        &mut out,
                        "closing_snapshot",
                        day,
                        &time,
                        &x.actor_id,
                        &id,
                        "",
                        name,
                        &x.state,
                        n,
                        "",
                        &format!("Immutable snapshot through {}. {}", x.through, reason),
                    );
                }
            }
        }
        tx.commit()?;
        Ok(Export {
            file_name: format!("Sornio-settlements-{day}.csv"),
            csv: out,
        })
    }
}
#[cfg(test)]
#[path = "phase3_reliability_tests.rs"]
mod phase3;
#[cfg(test)]
#[path = "payments_tests.rs"]
mod tests;
