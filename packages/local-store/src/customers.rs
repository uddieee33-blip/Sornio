//! Customer receivables subledger, always posted with its general-ledger journal.
//! No editable balance and no digital-payment settlement claim.
use crate::{
    billing::{valid_id, Invoice, Tender},
    catalog::MAX_VALUE,
    identity::{self, Permission, Role},
    Store, StoreError,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveCustomer {
    pub operation_id: String,
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub credit_limit_paise: Option<i64>,
    pub credit_days: i64,
    pub expected_revision: Option<i64>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CreditKind {
    Repayment,
    OpeningDue,
    WriteOff,
    Reversal,
}
impl CreditKind {
    fn key(&self) -> &'static str {
        match self {
            Self::Repayment => "repayment",
            Self::OpeningDue => "opening_due",
            Self::WriteOff => "write_off",
            Self::Reversal => "reversal",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreditRequest {
    pub operation_id: String,
    pub customer_id: String,
    pub expected_revision: i64,
    pub kind: CreditKind,
    pub amount_paise: i64,
    pub reason: String,
    pub due_on: Option<String>,
    pub reverse_of: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinkCredit {
    pub operation_id: String,
    pub invoice_id: String,
    pub customer_id: String,
    pub source_revision: i64,
    pub target_revision: i64,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub credit_limit_paise: Option<i64>,
    pub credit_days: i64,
    pub revision: i64,
    pub balance_paise: String,
    pub overdue_paise: String,
    pub available_credit_paise: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CreditReceipt {
    pub operation_id: String,
    pub customer_id: String,
    pub kind: String,
    pub amount_paise: i64,
    pub balance_paise: String,
    pub revision: i64,
    pub created_at: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCredit {
    pub request: CreditRequest,
    pub receipt: Option<CreditReceipt>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementLine {
    pub sequence: i64,
    pub operation_id: String,
    pub kind: String,
    pub amount_paise: String,
    pub running_balance_paise: String,
    pub created_at: String,
    pub due_on: Option<String>,
    pub invoice_id: Option<String>,
    pub reverse_of: Option<String>,
    pub reason: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    pub customer: Customer,
    pub through: i64,
    pub next_after: i64,
    pub has_more: bool,
    pub opening_balance_paise: String,
    pub closing_balance_paise: String,
    pub entries: Vec<StatementLine>,
}

fn one(db: &Connection, sql: &str, p: impl rusqlite::Params) -> Result<(), StoreError> {
    if db.execute(sql, p)? != 1 {
        return Err(StoreError::CreditUnavailable);
    }
    Ok(())
}
fn add(a: i128, b: i128) -> Result<i128, StoreError> {
    a.checked_add(b).ok_or(StoreError::InvalidCredit)
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
fn phone(value: &Option<String>) -> Result<Option<String>, StoreError> {
    let Some(v) = value else { return Ok(None) };
    if v.trim().is_empty() {
        return Ok(None);
    }
    if v.len() > 40
        || v.chars()
            .any(|c| !c.is_ascii_digit() && !" +-()".contains(c))
    {
        return Err(StoreError::InvalidCustomer);
    }
    let normalized: String = v
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '+')
        .collect();
    let digits = normalized.strip_prefix('+').unwrap_or(&normalized);
    if !(7..=15).contains(&digits.len()) || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(StoreError::InvalidCustomer);
    }
    Ok(Some(normalized))
}
fn replay<T: DeserializeOwned>(
    db: &Connection,
    id: &str,
    kind: &str,
    request: &str,
) -> Result<Option<T>, StoreError> {
    if !valid_id(id) {
        return Err(StoreError::InvalidCredit);
    }
    crate::payments::unclaimed(db, id)?;
    let old: Option<(String, String, String)> = db
        .query_row(
            "SELECT kind,request,payload FROM local_customer_ops WHERE operation_id=?1",
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
    if db.query_row("SELECT EXISTS(SELECT 1 FROM local_invoices WHERE id=?1) OR EXISTS(SELECT 1 FROM local_customer_canceled WHERE operation_id=?1)",[id],|r|r.get::<_,bool>(0))?{return Err(StoreError::OperationConflict);}
    Ok(None)
}
fn unreserved(db: &Connection, id: &str) -> Result<(), StoreError> {
    if db.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_customer_pending WHERE operation_id=?1)",
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
        "INSERT INTO local_customer_ops VALUES(?1,?2,?3,?4)",
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
        "INSERT INTO local_customer_outbox(operation_id,payload) VALUES(?1,?2)",
        params![id, event],
    )
}
fn balance(db: &Connection, id: &str, through: i64) -> Result<i128, StoreError> {
    let mut q=db.prepare("SELECT amount_paise FROM local_credit_entries WHERE customer_id=?1 AND sequence<=?2 ORDER BY sequence")?;
    let rows = q.query_map(params![id, through], |r| r.get::<_, i64>(0))?;
    let mut total = 0i128;
    for row in rows {
        total = add(total, row? as i128)?;
    }
    Ok(total)
}
fn overdue(db: &Connection, id: &str) -> Result<i128, StoreError> {
    let mut charges = Vec::<(String, i64, i128)>::new();
    let mut unapplied = 0i128;
    let mut q=db.prepare("SELECT e.sequence,e.kind,e.amount_paise,e.due_on,e.invoice_id FROM local_credit_entries e WHERE e.customer_id=?1 AND NOT EXISTS(SELECT 1 FROM local_credit_entries r WHERE r.reverse_of=e.operation_id) ORDER BY e.sequence")?;
    let rows = q.query_map([id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<String>>(4)?,
        ))
    })?;
    for row in rows {
        let (seq, kind, amount, due, invoice) = row?;
        if matches!(kind.as_str(), "repayment" | "write_off" | "return") {
            let mut credit = -(amount as i128);
            charges.sort_by(|a, b| (&a.0, a.1).cmp(&(&b.0, b.1)));
            for (_, _, due) in &mut charges {
                let paid = credit.min(*due);
                *due -= paid;
                credit -= paid;
            }
            unapplied = add(unapplied, credit)?;
        }
        if matches!(kind.as_str(), "sale" | "link_in" | "opening_due") {
            if let Some(invoice) = invoice {
                let latest:i64=db.query_row("SELECT MAX(sequence) FROM local_credit_entries WHERE invoice_id=?1 AND kind IN ('sale','link_in')",[invoice],|r|r.get(0))?;
                if latest != seq {
                    continue;
                }
            }
            // Collections settle only charges already present at their sequence.
            // Reversals may leave unapplied credit, which carries forward.
            let paid = unapplied.min(amount as i128);
            unapplied -= paid;
            charges.push((
                due.ok_or(StoreError::CreditUnavailable)?,
                seq,
                amount as i128 - paid,
            ));
        }
    }
    charges.sort_by(|a, b| (&a.0, a.1).cmp(&(&b.0, b.1)));
    let date = today(db)?;
    let mut total = 0i128;
    for (due, _, amount) in charges {
        if due < date {
            total = add(total, amount)?;
        }
    }
    Ok(total)
}
fn customer(db: &Connection, id: &str) -> Result<Customer, StoreError> {
    if !valid_id(id) {
        return Err(StoreError::InvalidCustomer);
    }
    let row:Option<(String,Option<String>,Option<i64>,i64,i64)>=db.query_row("SELECT name,phone,credit_limit_paise,credit_days,revision FROM local_customers WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional()?;
    let (name, phone, limit, days, revision) = row.ok_or(StoreError::CustomerMissing)?;
    let amount = balance(db, id, i64::MAX)?;
    if amount < 0 {
        return Err(StoreError::CreditUnavailable);
    }
    Ok(Customer {
        id: id.into(),
        name,
        phone,
        credit_limit_paise: limit,
        credit_days: days,
        revision,
        balance_paise: amount.to_string(),
        overdue_paise: overdue(db, id)?.to_string(),
        available_credit_paise: limit.map(|l| (l as i128 - amount).max(0).to_string()),
    })
}
fn bump(db: &Connection, id: &str, expected: i64) -> Result<i64, StoreError> {
    let next = expected.checked_add(1).ok_or(StoreError::InvalidCredit)?;
    if db.execute(
        "UPDATE local_customers SET revision=?1 WHERE id=?2 AND revision=?3",
        params![next, id, expected],
    )? != 1
    {
        return Err(StoreError::CreditConflict);
    }
    Ok(next)
}
fn entry(
    db: &Connection,
    id: &str,
    customer: &str,
    kind: &str,
    amount: i64,
    due: Option<&str>,
    invoice: Option<&str>,
    reverse: Option<&str>,
    reason: &str,
) -> Result<(), StoreError> {
    one(db,"INSERT INTO local_credit_entries(operation_id,customer_id,kind,amount_paise,due_on,invoice_id,reverse_of,reason) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![id,customer,kind,amount,due,invoice,reverse,reason])
}
fn journal(
    db: &Connection,
    id: &str,
    customer: &str,
    account: &str,
    amount: i64,
) -> Result<(), StoreError> {
    one(
        db,
        "INSERT INTO local_customer_journal VALUES(?1,?2,?3,?4)",
        params![id, customer, account, amount],
    )
}
fn validate_credit(db: &Connection, r: &CreditRequest) -> Result<(), StoreError> {
    if !valid_id(&r.operation_id)
        || !valid_id(&r.customer_id)
        || r.expected_revision < 1
        || r.reason.len() > 800
        || r.reason.chars().any(char::is_control)
    {
        return Err(StoreError::InvalidCredit);
    }
    if r.kind == CreditKind::Reversal {
        if r.amount_paise != 0
            || !r.reverse_of.as_ref().is_some_and(|s| valid_id(s))
            || !identity::text(&r.reason, 200)
            || r.due_on.is_some()
        {
            return Err(StoreError::InvalidCredit);
        }
    } else if !(1..=MAX_VALUE).contains(&r.amount_paise) || r.reverse_of.is_some() {
        return Err(StoreError::InvalidCredit);
    }
    if r.kind == CreditKind::OpeningDue {
        if !identity::text(&r.reason, 200)
            || !r
                .due_on
                .as_ref()
                .is_some_and(|s| valid_date(db, s).unwrap_or(false))
        {
            return Err(StoreError::InvalidCredit);
        }
    } else if r.due_on.is_some() {
        return Err(StoreError::InvalidCredit);
    }
    if r.kind == CreditKind::WriteOff && !identity::text(&r.reason, 200) {
        return Err(StoreError::InvalidCredit);
    }
    Ok(())
}
fn permission(r: &CreditRequest) -> Permission {
    if r.kind == CreditKind::Repayment {
        Permission::CollectCredit
    } else {
        Permission::CorrectCredit
    }
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("customers-schema.sql"))?;
    for table in [
        "local_customer_ops",
        "local_credit_entries",
        "local_customer_journal",
        "local_customer_outbox",
        "local_customer_canceled",
    ] {
        for action in ["UPDATE", "DELETE"] {
            tx.execute_batch(&format!("CREATE TRIGGER {table}_no_{action} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Credit history is append only'); END;"))?;
        }
    }
    tx.execute("INSERT INTO local_customers(id,name,credit_limit_paise,credit_days,revision) SELECT DISTINCT customer_id,customer_id,NULL,30,1 FROM local_billing_ledger WHERE account='receivables'",[])?;
    tx.execute("INSERT INTO local_credit_entries(operation_id,customer_id,kind,amount_paise,due_on,invoice_id,reason,created_at) SELECT l.invoice_id,l.customer_id,'sale',l.amount_paise,date(json_extract(i.payload,'$.createdAt'),'+330 minutes','+30 days'),l.invoice_id,'Migrated credit sale',json_extract(i.payload,'$.createdAt') FROM local_billing_ledger l JOIN local_invoices i ON i.id=l.invoice_id WHERE l.account='receivables' ORDER BY i.sequence",[])?;
    Ok(())
}
/// Called inside the original invoice transaction. The original invoice JSON is unchanged.
pub(crate) fn post_sale(
    tx: &Transaction<'_>,
    session: &Option<identity::Session>,
    invoice: &Invoice,
) -> Result<(), StoreError> {
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_customer_ops WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_pending WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_canceled WHERE operation_id=?1)",
        [&invoice.id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    crate::payments::unclaimed(tx, &invoice.id)?;
    if invoice.tender != Tender::Credit {
        // A cash invoice may identify an existing customer without creating a
        // credit entry. Refuse stale or forged customer IDs in this transaction.
        if let Some(customer_id) = invoice.customer_id.as_deref() {
            customer(tx, customer_id)?;
        }
        return Ok(());
    }
    let id = invoice
        .customer_id
        .as_ref()
        .ok_or(StoreError::InvalidCredit)?;
    if session.is_none() {
        tx.execute(
            "INSERT OR IGNORE INTO local_customers VALUES(?1,?1,NULL,NULL,30,1)",
            [id],
        )?;
    }
    let c = customer(tx, id)?;
    let next = add(
        c.balance_paise
            .parse::<i128>()
            .map_err(|_| StoreError::CreditUnavailable)?,
        invoice.total_paise as i128,
    )?;
    if c.credit_limit_paise
        .is_some_and(|limit| next > limit as i128)
    {
        return Err(StoreError::CreditLimit);
    }
    let due: String = tx.query_row(
        "SELECT date(?1,'+330 minutes',printf('+%d days',?2))",
        params![invoice.created_at, c.credit_days],
        |r| r.get(0),
    )?;
    entry(
        tx,
        &invoice.id,
        id,
        "sale",
        invoice.total_paise,
        Some(&due),
        Some(&invoice.id),
        None,
        "Credit sale",
    )?;
    bump(tx, id, c.revision)?;
    Ok(())
}
/// Split retail sale: only the credit part of the invoice increases the
/// customer's debt. The paid parts were already banked or remain in
/// receivables through the retail journal, exactly like a full credit sale's
/// unpaid remainder. Runs inside the original invoice transaction.
pub(crate) fn post_split_credit(
    tx: &Transaction<'_>,
    session: &Option<identity::Session>,
    invoice: &Invoice,
    customer_id: &str,
    amount: i64,
) -> Result<(), StoreError> {
    if !(1..=MAX_VALUE).contains(&amount) || amount > invoice.total_paise {
        return Err(StoreError::InvalidCredit);
    }
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_customer_ops WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_pending WHERE operation_id=?1) OR EXISTS(SELECT 1 FROM local_customer_canceled WHERE operation_id=?1)",
        [&invoice.id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    // Retail post already holds local_retail_pending for this invoice id.
    // unclaimed() treats that in-flight row as a conflict, which would abort
    // the credit part of a split cash+credit sale after cash/UPI/card posted.
    // Completed or canceled retail rows sharing this id are still rejected.
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_retail_ops WHERE id=?1) OR EXISTS(SELECT 1 FROM local_retail_canceled WHERE id=?1)",
        [&invoice.id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    if session.is_none() {
        tx.execute(
            "INSERT OR IGNORE INTO local_customers VALUES(?1,?1,NULL,NULL,30,1)",
            [customer_id],
        )?;
    }
    let c = customer(tx, customer_id)?;
    let next = add(
        c.balance_paise
            .parse::<i128>()
            .map_err(|_| StoreError::CreditUnavailable)?,
        amount as i128,
    )?;
    if c.credit_limit_paise
        .is_some_and(|limit| next > limit as i128)
    {
        return Err(StoreError::CreditLimit);
    }
    let due: String = tx.query_row(
        "SELECT date(?1,'+330 minutes',printf('+%d days',?2))",
        params![invoice.created_at, c.credit_days],
        |r| r.get(0),
    )?;
    entry(
        tx,
        &invoice.id,
        customer_id,
        "sale",
        amount,
        Some(&due),
        Some(&invoice.id),
        None,
        "Split sale credit",
    )?;
    bump(tx, customer_id, c.revision)?;
    Ok(())
}
pub(crate) fn quote_invoice_return(
    db: &Connection,
    invoice: &str,
    amount: i64,
) -> Result<(String, i64, i64), StoreError> {
    let id:String=db.query_row("SELECT customer_id FROM local_credit_entries WHERE invoice_id=?1 AND kind IN ('sale','link_in') ORDER BY sequence DESC LIMIT 1",[invoice],|r|r.get(0))?;
    if db.query_row("SELECT EXISTS(SELECT 1 FROM local_credit_entries WHERE customer_id=?1 AND kind IN ('opening_due','write_off','reversal'))",[&id],|r|r.get::<_,bool>(0))? {return Err(StoreError::ComplexCreditReturn);}
    let c = customer(db, &id)?;
    let balance = c
        .balance_paise
        .parse::<i128>()
        .map_err(|_| StoreError::InvalidCredit)?;
    let debt = balance.min(amount as i128) as i64;
    let cash = amount - debt;
    let mut received = 0i128;
    {
        let mut q=db.prepare("SELECT amount_paise FROM local_customer_journal WHERE customer_id=?1 AND account='cash' UNION ALL SELECT amount FROM local_retail_journal WHERE customer_id=?1 AND account='cash'")?;
        for row in q.query_map([&id], |r| r.get::<_, i64>(0))? {
            received = add(received, row? as i128)?;
        }
    }
    if cash as i128 > received {
        return Err(StoreError::InvalidPayment);
    }
    Ok((id, debt, cash))
}
pub(crate) fn invoice_return(
    db: &Connection,
    session: &Option<identity::Session>,
    op: &str,
    invoice: &str,
    amount: i64,
    why: &str,
) -> Result<(String, i64, i64), StoreError> {
    if let Some(s) = session {
        identity::verify(db, s, Permission::Refund)?;
    }
    let (id, debt, cash) = quote_invoice_return(db, invoice, amount)?;
    let c = customer(db, &id)?;
    if debt > 0 {
        entry(db, op, &id, "return", -debt, None, Some(invoice), None, why)?;
    }
    bump(db, &id, c.revision)?;
    Ok((id, debt, cash))
}

impl Store {
    pub(crate) fn save_customer(&mut self, r: SaveCustomer) -> Result<Customer, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.id)
            || !identity::text(&r.name, 120)
            || !(0..=3650).contains(&r.credit_days)
            || r.credit_limit_paise
                .is_some_and(|l| !(0..=MAX_VALUE).contains(&l))
        {
            return Err(StoreError::InvalidCustomer);
        }
        let normalized = phone(&r.phone)?;
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::ManageCustomers,
            "customer.saved",
            Some(&r.operation_id),
        )?;
        if let Some(old) = replay(&tx, &r.operation_id, "customer.saved", &raw)? {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_customers WHERE id=?1)",
            [&r.id],
            |r| r.get(0),
        )?;
        if exists {
            let old = customer(&tx, &r.id)?;
            if r.expected_revision != Some(old.revision) {
                return Err(StoreError::CreditConflict);
            }
            if (old.credit_limit_paise, old.credit_days) != (r.credit_limit_paise, r.credit_days) {
                if let Some(s) = &self.1 {
                    identity::verify(&tx, s, Permission::CreditPolicy)?;
                }
            }
            one(&tx,"UPDATE local_customers SET name=?1,phone=?2,credit_limit_paise=?3,credit_days=?4 WHERE id=?5",params![r.name,normalized,r.credit_limit_paise,r.credit_days,r.id])?;
            bump(&tx, &r.id, old.revision)?;
        } else {
            if r.expected_revision.is_some() {
                return Err(StoreError::CustomerMissing);
            }
            if let Some(s) = &self.1 {
                let p = identity::verify(&tx, s, Permission::ManageCustomers)?;
                if p.role == Role::AssistantManager
                    && (r.credit_limit_paise != Some(0) || r.credit_days != 30)
                {
                    return Err(StoreError::Forbidden);
                }
            }
            let count: i64 =
                tx.query_row("SELECT COUNT(*) FROM local_customers", [], |r| r.get(0))?;
            if count >= 50000 {
                return Err(StoreError::InvalidCustomer);
            }
            one(
                &tx,
                "INSERT INTO local_customers VALUES(?1,?2,?3,?4,?5,1)",
                params![
                    r.id,
                    r.name,
                    normalized,
                    r.credit_limit_paise,
                    r.credit_days
                ],
            )?;
        }
        let result = customer(&tx, &r.id)?;
        record(&tx, &r.operation_id, "customer.saved", &raw, &result)?;
        outbox(&tx, &r.operation_id, "customer.saved", &result)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn find_customers(
        &self,
        search: &str,
        overdue_only: bool,
    ) -> Result<Vec<Customer>, StoreError> {
        if search.len() > 480 {
            return Err(StoreError::InvalidCustomer);
        }
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(
                &tx,
                s,
                if overdue_only {
                    Permission::Reports
                } else {
                    Permission::CustomerRead
                },
            )?;
        }
        let ids: Vec<String> = {
            let mut q=tx.prepare("SELECT id FROM local_customers WHERE instr(lower(id),lower(?1))>0 OR instr(lower(name),lower(?1))>0 OR instr(COALESCE(phone,''),?1)>0 ORDER BY name,id")?;
            let rows = q.query_map([search], |r| r.get(0))?;
            rows.collect::<Result<_, _>>()?
        };
        let mut result = Vec::new();
        for id in ids {
            let c = customer(&tx, &id)?;
            if !overdue_only || c.overdue_paise != "0" {
                result.push(c);
                if result.len() == 101 {
                    break;
                }
            }
        }
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn prepare_credit(&mut self, r: CreditRequest) -> Result<(), StoreError> {
        validate_credit(&self.0, &r)?;
        let raw = serde_json::to_string(&r)?;
        let s = self.1.clone().ok_or(StoreError::Locked)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            permission(&r),
            "credit.prepared",
            Some(&r.operation_id),
        )?;
        let previous: Option<String> = tx
            .query_row(
                "SELECT request FROM local_customer_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(old) = previous {
            return if old == raw {
                Ok(())
            } else {
                Err(StoreError::CheckoutActive)
            };
        }
        if replay::<CreditReceipt>(&tx, &r.operation_id, "credit.posted", &raw)?.is_some() {
            return Ok(());
        }
        unreserved(&tx, &r.operation_id)?;
        customer(&tx, &r.customer_id)?;
        one(
            &tx,
            "INSERT INTO local_customer_pending VALUES(?1,?2,?3)",
            params![s.actor_id, r.operation_id, raw],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn pending_credit(&self) -> Result<Option<PendingCredit>, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        let tx = self.0.unchecked_transaction()?;
        identity::verify(&tx, s, Permission::CollectCredit)?;
        let raw: Option<String> = tx
            .query_row(
                "SELECT request FROM local_customer_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        let result = if let Some(raw) = raw {
            let request: CreditRequest = serde_json::from_str(&raw)?;
            let payload: Option<String> = tx
                .query_row(
                    "SELECT payload FROM local_customer_ops WHERE operation_id=?1",
                    [&request.operation_id],
                    |r| r.get(0),
                )
                .optional()?;
            Some(PendingCredit {
                request,
                receipt: payload.map(|p| serde_json::from_str(&p)).transpose()?,
            })
        } else {
            None
        };
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn clear_credit(&mut self, id: &str, saved: bool) -> Result<(), StoreError> {
        if !valid_id(id) {
            return Err(StoreError::InvalidCredit);
        }
        let s = self.1.as_ref().ok_or(StoreError::Locked)?.clone();
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::CollectCredit,
            "credit.acknowledged",
            Some(id),
        )?;
        let active: Option<String> = tx
            .query_row(
                "SELECT operation_id FROM local_customer_pending WHERE actor_id=?1",
                [&s.actor_id],
                |r| r.get(0),
            )
            .optional()?;
        let posted:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM local_customer_ops WHERE operation_id=?1 AND kind='credit.posted')",[id],|r|r.get(0))?;
        if active.is_none() {
            let canceled: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM local_customer_canceled WHERE operation_id=?1)",
                [id],
                |r| r.get(0),
            )?;
            if (saved && posted) || (!saved && !posted && canceled) {
                return Ok(());
            }
        }
        if active.as_deref() != Some(id) || posted != saved {
            return Err(StoreError::CheckoutActive);
        }
        if !saved {
            one(&tx, "INSERT INTO local_customer_canceled VALUES(?1)", [id])?;
        }
        one(
            &tx,
            "DELETE FROM local_customer_pending WHERE actor_id=?1 AND operation_id=?2",
            params![s.actor_id, id],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn post_credit(
        &mut self,
        r: CreditRequest,
        prepared: bool,
    ) -> Result<CreditReceipt, StoreError> {
        validate_credit(&self.0, &r)?;
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            permission(&r),
            "credit.posted",
            Some(&r.operation_id),
        )?;
        if let Some(old) = replay(&tx, &r.operation_id, "credit.posted", &raw)? {
            return Ok(old);
        }
        if prepared {
            let s = self.1.as_ref().ok_or(StoreError::Locked)?;
            let pending: Option<String> = tx
                .query_row(
                    "SELECT request FROM local_customer_pending WHERE actor_id=?1",
                    [&s.actor_id],
                    |r| r.get(0),
                )
                .optional()?;
            if pending.as_deref() != Some(raw.as_str()) {
                return Err(StoreError::CheckoutActive);
            }
        }
        let c = customer(&tx, &r.customer_id)?;
        if c.revision != r.expected_revision {
            return Err(StoreError::CreditConflict);
        }
        let before = c
            .balance_paise
            .parse::<i128>()
            .map_err(|_| StoreError::CreditUnavailable)?;
        let mut postings = Vec::<(String, i64)>::new();
        let (delta, amount, due) = match r.kind {
            CreditKind::Repayment => {
                postings.push(("cash".into(), r.amount_paise));
                postings.push(("receivables".into(), -r.amount_paise));
                (-r.amount_paise, r.amount_paise, None)
            }
            CreditKind::OpeningDue => {
                postings.push(("receivables".into(), r.amount_paise));
                postings.push(("opening_equity".into(), -r.amount_paise));
                (r.amount_paise, r.amount_paise, r.due_on.as_deref())
            }
            CreditKind::WriteOff => {
                postings.push(("bad_debt".into(), r.amount_paise));
                postings.push(("receivables".into(), -r.amount_paise));
                (-r.amount_paise, r.amount_paise, None)
            }
            CreditKind::Reversal => {
                let target = r.reverse_of.as_ref().ok_or(StoreError::InvalidCredit)?;
                let original:Option<(String,i64)>=tx.query_row("SELECT kind,amount_paise FROM local_credit_entries WHERE operation_id=?1 AND customer_id=?2",params![target,r.customer_id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
                let (kind, amount) = original.ok_or(StoreError::InvalidCredit)?;
                if !matches!(kind.as_str(), "repayment" | "opening_due" | "write_off")
                    || tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM local_credit_entries WHERE reverse_of=?1)",
                        [target],
                        |r| r.get::<_, bool>(0),
                    )?
                {
                    return Err(StoreError::InvalidCredit);
                }
                let mut q=tx.prepare("SELECT account,amount_paise FROM local_customer_journal WHERE operation_id=?1 AND customer_id=?2")?;
                let rows = q.query_map(params![target, r.customer_id], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
                })?;
                for row in rows {
                    let (account, value) = row?;
                    postings.push((
                        account,
                        value.checked_neg().ok_or(StoreError::InvalidCredit)?,
                    ));
                }
                (
                    -amount,
                    amount.checked_abs().ok_or(StoreError::InvalidCredit)?,
                    None,
                )
            }
        };
        let after = add(before, delta as i128)?;
        if after < 0 {
            return Err(StoreError::Overpayment);
        }
        let total = postings
            .iter()
            .try_fold(0i128, |sum, (_, amount)| add(sum, *amount as i128))?;
        if total != 0 || postings.len() != 2 {
            return Err(StoreError::CreditUnavailable);
        }
        let receipt = CreditReceipt {
            operation_id: r.operation_id.clone(),
            customer_id: r.customer_id.clone(),
            kind: r.kind.key().into(),
            amount_paise: amount,
            balance_paise: after.to_string(),
            revision: c.revision.checked_add(1).ok_or(StoreError::InvalidCredit)?,
            created_at: now(&tx)?,
        };
        record(&tx, &r.operation_id, "credit.posted", &raw, &receipt)?;
        entry(
            &tx,
            &r.operation_id,
            &r.customer_id,
            r.kind.key(),
            delta,
            due,
            None,
            r.reverse_of.as_deref(),
            &r.reason,
        )?;
        let cash_delta = postings
            .iter()
            .filter(|(a, _)| a == "cash")
            .map(|(_, n)| *n)
            .sum();
        crate::payments::activity_at(
            &tx,
            &self.1,
            &r.operation_id,
            "credit_entry",
            cash_delta,
            Some(&receipt.created_at),
        )?;
        for (account, amount) in postings {
            journal(&tx, &r.operation_id, &r.customer_id, &account, amount)?;
        }
        bump(&tx, &r.customer_id, c.revision)?;
        outbox(&tx, &r.operation_id, "credit.posted", &receipt)?;
        tx.commit()?;
        Ok(receipt)
    }
    pub(crate) fn link_credit(&mut self, r: LinkCredit) -> Result<CreditReceipt, StoreError> {
        if !valid_id(&r.operation_id)
            || !valid_id(&r.invoice_id)
            || !valid_id(&r.customer_id)
            || !identity::text(&r.reason, 200)
        {
            return Err(StoreError::InvalidCredit);
        }
        let raw = serde_json::to_string(&r)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        identity::guard(
            &tx,
            &self.1,
            Permission::CorrectCredit,
            "credit.linked",
            Some(&r.operation_id),
        )?;
        if let Some(old) = replay(&tx, &r.operation_id, "credit.linked", &raw)? {
            return Ok(old);
        }
        unreserved(&tx, &r.operation_id)?;
        let source:Option<(String,i64,String)>=tx.query_row("SELECT customer_id,amount_paise,due_on FROM local_credit_entries WHERE invoice_id=?1 AND kind IN ('sale','link_in') ORDER BY sequence DESC LIMIT 1",[&r.invoice_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?;
        let (source, amount, due) = source.ok_or(StoreError::InvalidCredit)?;
        if source == r.customer_id {
            return Err(StoreError::InvalidCredit);
        }
        let old = customer(&tx, &source)?;
        let target = customer(&tx, &r.customer_id)?;
        if old.revision != r.source_revision || target.revision != r.target_revision {
            return Err(StoreError::CreditConflict);
        }
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_credit_entries WHERE customer_id=?1 AND kind IN ('repayment','write_off','opening_due','reversal','return'))",[&source],|r|r.get::<_,bool>(0))?{return Err(StoreError::CreditAlreadyCollected);}
        let after = add(
            target
                .balance_paise
                .parse()
                .map_err(|_| StoreError::CreditUnavailable)?,
            amount as i128,
        )?;
        let receipt = CreditReceipt {
            operation_id: r.operation_id.clone(),
            customer_id: r.customer_id.clone(),
            kind: "link_in".into(),
            amount_paise: amount,
            balance_paise: after.to_string(),
            revision: target
                .revision
                .checked_add(1)
                .ok_or(StoreError::InvalidCredit)?,
            created_at: now(&tx)?,
        };
        record(&tx, &r.operation_id, "credit.linked", &raw, &receipt)?;
        entry(
            &tx,
            &r.operation_id,
            &source,
            "link_out",
            -amount,
            Some(&due),
            Some(&r.invoice_id),
            None,
            &r.reason,
        )?;
        entry(
            &tx,
            &r.operation_id,
            &r.customer_id,
            "link_in",
            amount,
            Some(&due),
            Some(&r.invoice_id),
            None,
            &r.reason,
        )?;
        journal(&tx, &r.operation_id, &source, "receivables", -amount)?;
        journal(&tx, &r.operation_id, &r.customer_id, "receivables", amount)?;
        bump(&tx, &source, old.revision)?;
        bump(&tx, &r.customer_id, target.revision)?;
        outbox(&tx, &r.operation_id, "credit.linked", &receipt)?;
        tx.commit()?;
        Ok(receipt)
    }
    pub(crate) fn customer_statement(
        &self,
        id: &str,
        after: i64,
        through: Option<i64>,
    ) -> Result<Statement, StoreError> {
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::CustomerRead)?;
        }
        let result = statement(&tx, id, after, through, Some(100))?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn print_customer_statement(
        &self,
        id: &str,
        through: Option<i64>,
    ) -> Result<String, StoreError> {
        let tx = self.0.unchecked_transaction()?;
        if let Some(s) = &self.1 {
            identity::verify(&tx, s, Permission::CustomerRead)?;
        }
        let s = statement(&tx, id, 0, through, None)?;
        let business: String = tx.query_row(
            "SELECT business_name FROM local_identity WHERE singleton=1",
            [],
            |r| r.get(0),
        )?;
        let mut html=format!("<article><h1>Customer statement</h1><p>{}</p><h2>{}</h2><p>Account: {} · Phone: {}</p><p>Snapshot: {} · Outstanding: {}</p><table><thead><tr><th>Date (IST)</th><th>Entry / reference</th><th>Due</th><th>Change (₹)</th><th>Balance (₹)</th></tr></thead><tbody>",escape(&business),escape(&s.customer.name),escape(&s.customer.id),escape(s.customer.phone.as_deref().unwrap_or("—")),s.through,paise(&s.closing_balance_paise)?);
        for e in &s.entries {
            html.push_str(&format!(
                "<tr><td>{}</td><td>{}<br>{}<br>{}<br>Invoice: {} · Reverses: {}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                escape(&tx.query_row::<String, _, _>("SELECT strftime('%d/%m/%Y %H:%M',?1,'+330 minutes')", [&e.created_at], |r| r.get(0))?),
                escape(&e.kind),
                escape(&e.operation_id),
                escape(&e.reason),
                escape(e.invoice_id.as_deref().unwrap_or("—")),
                escape(e.reverse_of.as_deref().unwrap_or("—")),
                escape(e.due_on.as_deref().unwrap_or("—")),
                paise(&e.amount_paise)?,
                paise(&e.running_balance_paise)?
            ));
        }
        html.push_str("</tbody></table><p>Cash repayments only. Credit history is retained; corrections are separate entries.</p></article>");
        tx.commit()?;
        Ok(html)
    }
}
fn statement(
    db: &Connection,
    id: &str,
    after: i64,
    through: Option<i64>,
    limit: Option<i64>,
) -> Result<Statement, StoreError> {
    let maximum: i64 = db.query_row(
        "SELECT COALESCE(MAX(sequence),0) FROM local_credit_entries",
        [],
        |r| r.get(0),
    )?;
    let end = through.unwrap_or(maximum);
    if after < 0 || end < after || end > maximum {
        return Err(StoreError::InvalidCredit);
    }
    let c = customer(db, id)?;
    let opening = balance(db, id, after)?;
    let closing = balance(db, id, end)?;
    let mut q=db.prepare("SELECT sequence,operation_id,kind,amount_paise,created_at,due_on,invoice_id,reverse_of,reason FROM local_credit_entries WHERE customer_id=?1 AND sequence>?2 AND sequence<=?3 ORDER BY sequence LIMIT ?4")?;
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
            r.get::<_, String>(8)?,
        ))
    })?;
    let mut entries = Vec::new();
    for row in rows {
        let (seq, op, kind, amount, date, due, invoice, reverse, reason) = row?;
        running = add(running, amount as i128)?;
        entries.push(StatementLine {
            sequence: seq,
            operation_id: op,
            kind,
            amount_paise: amount.to_string(),
            running_balance_paise: running.to_string(),
            created_at: date,
            due_on: due,
            invoice_id: invoice,
            reverse_of: reverse,
            reason,
        });
    }
    let next_after = entries.last().map(|e| e.sequence).unwrap_or(after);
    let has_more:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM local_credit_entries WHERE customer_id=?1 AND sequence>?2 AND sequence<=?3)",params![id,next_after,end],|r|r.get(0))?;
    Ok(Statement {
        customer: c,
        through: end,
        next_after,
        has_more,
        opening_balance_paise: opening.to_string(),
        closing_balance_paise: closing.to_string(),
        entries,
    })
}
fn escape(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '&' => "&amp;".into(),
            '<' => "&lt;".into(),
            '>' => "&gt;".into(),
            '"' => "&quot;".into(),
            '\'' => "&#39;".into(),
            _ => c.to_string(),
        })
        .collect()
}
fn paise(s: &str) -> Result<String, StoreError> {
    let n = s
        .parse::<i128>()
        .map_err(|_| StoreError::CreditUnavailable)?;
    let a = n.checked_abs().ok_or(StoreError::CreditUnavailable)?;
    Ok(format!(
        "{}{}.{:02}",
        if n < 0 { "-" } else { "" },
        a / 100,
        a % 100
    ))
}

#[cfg(test)]
#[path = "customers_tests.rs"]
mod tests;
