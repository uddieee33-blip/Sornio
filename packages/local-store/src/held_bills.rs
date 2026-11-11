//! Cashier-owned encrypted drafts. Only the existing billing transaction posts money.
use crate::{
    billing::{self, PostInvoice, Tender},
    catalog::{Product, MAX_VALUE},
    customers::Customer,
    identity::{self, Permission, Session},
    payments::{self, PaymentPart},
    Store, StoreError,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Line {
    pub product_id: String,
    pub quantity_milli: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Allocation {
    pub method: String,
    pub amount_paise: i64,
    pub reference: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftInput {
    pub lines: Vec<Line>,
    pub tax_basis_points: i64,
    pub tender: Tender,
    pub customer_id: Option<String>,
    pub payments: Vec<Allocation>,
    pub note: String,
}
impl DraftInput {
    fn validate(&self) -> Result<(), StoreError> {
        let mut products = BTreeSet::new();
        let mut methods = BTreeSet::new();
        if self.lines.is_empty() || self.lines.len() > 100
            || !(0..=10000).contains(&self.tax_basis_points)
            || self.note.chars().count() > 80 || self.note.chars().any(char::is_control)
            || self.customer_id.as_ref().is_some_and(|id| !billing::valid_id(id))
            || self.lines.iter().any(|l| !billing::valid_id(&l.product_id)
                || !(1..=MAX_VALUE).contains(&l.quantity_milli) || !products.insert(&l.product_id))
            || self.payments.len() > 4
            || self.payments.iter().any(|p| !matches!(p.method.as_str(), "cash"|"upi"|"card"|"credit")
                || !(1..=MAX_VALUE).contains(&p.amount_paise) || !methods.insert(&p.method)
                || p.reference.len() > 80 || p.reference.chars().any(char::is_control))
        {
            return Err(StoreError::InvalidHeldBill);
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    pub version: i64,
    pub input: DraftInput,
    pub products: Vec<Product>,
    pub customer: Option<Customer>,
    pub total_paise: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bill {
    pub id: String,
    pub revision: i64,
    pub state: String,
    pub updated_at: String,
    pub draft: Draft,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumed {
    pub bill: Bill,
    pub warnings: Vec<String>,
    pub current_total_paise: Option<i64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Save { draft: DraftInput },
    Resume,
    Discard,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mutation {
    pub id: String,
    pub expected_revision: i64,
    pub action: Action,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Prepare {
    pub id: String,
    pub expected_revision: i64,
    pub invoice: PostInvoice,
    pub payments: Option<Vec<PaymentPart>>,
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("held_bills_schema.sql"))?;
    Ok(())
}
fn actor<'a>(db: &Connection, session: &'a Option<Session>) -> Result<&'a str, StoreError> {
    let s = session.as_ref().ok_or(StoreError::Locked)?;
    identity::verify(db, s, Permission::Sell)?;
    Ok(&s.actor_id)
}
fn row(db: &Connection, id: &str, owner: &str) -> Result<Bill, StoreError> {
    let (actor, revision, state, raw, updated_at): (String, i64, String, String, String) = db.query_row(
        "SELECT actor_id,revision,state,payload,updated_at FROM local_held_bills WHERE id=?1", [id],
        |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)),
    ).optional()?.ok_or(StoreError::HeldBillConflict)?;
    if actor != owner { return Err(StoreError::Forbidden); }
    let draft: Draft = serde_json::from_str(&raw).map_err(|_| StoreError::InvalidHeldBill)?;
    draft.input.validate()?;
    if draft.version != 1 || draft.products.len() != draft.input.lines.len()
        || total(&draft.input, &draft.products)? != draft.total_paise
    { return Err(StoreError::InvalidHeldBill); }
    Ok(Bill { id: id.into(), revision, state, draft, updated_at })
}
fn product(db: &Connection, id: &str) -> Result<Option<Product>, StoreError> {
    Ok(db.query_row("SELECT id,name,sku,unit,unit_price_paise,stock_milli,revision FROM local_products WHERE id=?1", [id], |r|
        Ok(Product { id:r.get(0)?,name:r.get(1)?,sku:r.get(2)?,unit:r.get(3)?,unit_price_paise:r.get(4)?,stock_milli:r.get(5)?,revision:r.get(6)? })
    ).optional()?)
}
fn total(input: &DraftInput, products: &[Product]) -> Result<i64, StoreError> {
    let mut subtotal = 0i64;
    for l in &input.lines {
        let p = products.iter().find(|p| p.id == l.product_id).ok_or(StoreError::InvalidHeldBill)?;
        subtotal = subtotal.checked_add(billing::line_total(l.quantity_milli, p.unit_price_paise)?)
            .filter(|n| *n <= MAX_VALUE).ok_or(StoreError::InvalidHeldBill)?;
    }
    subtotal.checked_add(billing::tax_total(subtotal, input.tax_basis_points)?)
        .filter(|n| *n <= MAX_VALUE).ok_or(StoreError::InvalidHeldBill)
}
fn snapshot(db: &Connection, input: DraftInput) -> Result<Draft, StoreError> {
    input.validate()?;
    let products = input.lines.iter().map(|l| product(db, &l.product_id)?.ok_or(StoreError::ProductMissing))
        .collect::<Result<Vec<_>, StoreError>>()?;
    let customer = input.customer_id.as_deref().map(|id| crate::customers::customer(db, id)).transpose()?;
    let total_paise = total(&input, &products)?;
    Ok(Draft { version: 1, input, products, customer, total_paise })
}
fn resumed(db: &Connection, bill: Bill) -> Result<Resumed, StoreError> {
    let mut warnings = Vec::new();
    let mut current = Vec::new();
    for l in &bill.draft.input.lines {
        let old = bill.draft.products.iter().find(|p| p.id == l.product_id).ok_or(StoreError::InvalidHeldBill)?;
        match product(db, &l.product_id)? {
            None => warnings.push(format!("{} is no longer available. Remove it before checkout.", old.name)),
            Some(p) => {
                if p.unit_price_paise != old.unit_price_paise { warnings.push(format!("The price of {} changed. Review the updated total.", p.name)); }
                if p.unit != old.unit { warnings.push(format!("The selling unit of {} changed. Check its quantity.", p.name)); }
                if p.stock_milli < l.quantity_milli { warnings.push(format!("Not enough stock for {}. Reduce its quantity or remove it.", p.name)); }
                else if p.stock_milli != old.stock_milli { warnings.push(format!("Available stock for {} changed.", p.name)); }
                current.push(p);
            }
        }
    }
    let current_total_paise = total(&bill.draft.input, &current).ok();
    let credit = if bill.draft.input.tender == Tender::Credit { current_total_paise.unwrap_or(bill.draft.total_paise) }
        else if bill.draft.input.tender == Tender::Retail { bill.draft.input.payments.iter().filter(|p| p.method == "credit").map(|p| p.amount_paise).sum() }
        else { 0 };
    if let Some(id) = &bill.draft.input.customer_id {
        match crate::customers::customer(db, id) {
            Ok(c) => {
                if bill.draft.customer.as_ref().is_none_or(|old| old.revision != c.revision) {
                    warnings.push("Customer details or credit availability changed. Review the account before checkout.".into());
                }
                if credit > 0 && c.available_credit_paise.as_ref().is_some_and(|v| v.parse::<i128>().map_or(true, |v| credit as i128 > v)) {
                    warnings.push("The credit allocation exceeds this customer's available credit. Change the payment split.".into());
                }
            }
            Err(StoreError::CustomerMissing) => warnings.push("The saved customer is unavailable. Select an existing customer.".into()),
            Err(e) => return Err(e),
        }
    } else if credit > 0 { warnings.push("Select a customer before using credit.".into()); }
    if bill.draft.input.tender == Tender::Retail && Some(bill.draft.input.payments.iter().map(|p| p.amount_paise).sum::<i64>()) != current_total_paise {
        warnings.push("Draft payment allocations do not match the current total. Adjust them before checkout.".into());
    }
    Ok(Resumed { bill, warnings, current_total_paise })
}
fn clear_pending(db: &Connection, owner: &str) -> Result<(), StoreError> {
    if db.query_row("SELECT EXISTS(SELECT 1 FROM local_checkout) OR EXISTS(SELECT 1 FROM local_retail_pending WHERE actor_id=?1)", [owner], |r| r.get::<_,bool>(0))? {
        return Err(StoreError::CheckoutActive);
    }
    Ok(())
}
/// An active draft must be explicitly held/discarded or bound to the checkout.
/// A renderer cannot detach it and mint another invoice ID in a stale window.
pub(crate) fn guard_checkout(db: &Connection, session: &Option<Session>, operation: &str) -> Result<(), StoreError> {
    if let Some(s) = session {
        if db.query_row("SELECT EXISTS(SELECT 1 FROM local_held_bills WHERE actor_id=?1 AND state IN ('active','checkout') AND (checkout_id IS NULL OR checkout_id<>?2)) OR EXISTS(SELECT 1 FROM local_held_bills WHERE checkout_id=?2 AND actor_id<>?1)", params![s.actor_id,operation], |r| r.get::<_,bool>(0))? {
            return Err(StoreError::HeldBillConflict);
        }
    }
    Ok(())
}
pub(crate) fn complete(db: &Connection, operation: &str) -> Result<(), StoreError> {
    db.execute("UPDATE local_held_bills SET state='completed',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE checkout_id=?1 AND state='checkout'", [operation])?;
    Ok(())
}
pub(crate) fn cancel_checkout(db: &Connection, operation: &str) -> Result<(), StoreError> {
    db.execute("UPDATE local_held_bills SET state='active',revision=revision+1,checkout_id=NULL,checkout_request=NULL,last_request='',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE checkout_id=?1 AND state='checkout'", [operation])?;
    Ok(())
}
pub(crate) fn active(db: &Connection, session: &Option<Session>) -> Result<Option<Resumed>, StoreError> {
    let Some(s) = session else { return Ok(None); };
    let id: Option<String> = db.query_row("SELECT id FROM local_held_bills WHERE actor_id=?1 AND state='active'", [&s.actor_id], |r| r.get(0)).optional()?;
    id.map(|id| resumed(db, row(db,&id,&s.actor_id)?)).transpose()
}

impl Store {
    pub(crate) fn list_held_bills(&self) -> Result<Vec<Bill>, StoreError> {
        let tx = self.0.unchecked_transaction()?;
        let owner = actor(&tx,&self.1)?;
        let ids = tx.prepare("SELECT id FROM local_held_bills WHERE actor_id=?1 AND state IN ('held','active') ORDER BY updated_at DESC,id LIMIT 101")?
            .query_map([owner], |r| r.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?;
        let bills = ids.iter().map(|id| row(&tx,id,owner)).collect::<Result<Vec<_>,_>>()?;
        tx.commit()?;
        Ok(bills)
    }
    pub(crate) fn mutate_held_bill(&mut self, r: Mutation) -> Result<Resumed, StoreError> {
        if !billing::valid_id(&r.id) || !(0..9_007_199_254_740_990).contains(&r.expected_revision) { return Err(StoreError::InvalidHeldBill); }
        let raw = serde_json::to_string(&r)?;
        let tx = self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let owner = actor(&tx,&self.1)?;
        let existing: Option<(String,i64,String)> = tx.query_row("SELECT actor_id,revision,last_request FROM local_held_bills WHERE id=?1", [&r.id], |q| Ok((q.get(0)?,q.get(1)?,q.get(2)?))).optional()?;
        if let Some((who, revision, previous)) = &existing {
            if who != owner { return Err(StoreError::Forbidden); }
            if *revision == r.expected_revision + 1 && previous == &raw { return resumed(&tx, row(&tx,&r.id,owner)?); }
            if *revision != r.expected_revision { return Err(StoreError::HeldBillConflict); }
        } else if r.expected_revision != 0 || !matches!(&r.action, Action::Save { .. }) { return Err(StoreError::HeldBillConflict); }
        clear_pending(&tx,owner)?;
        let previous = existing.as_ref().map(|_| row(&tx,&r.id,owner)).transpose()?;
        if previous.as_ref().is_some_and(|b| !matches!(b.state.as_str(), "held"|"active")) { return Err(StoreError::HeldBillConflict); }
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_held_bills WHERE actor_id=?1 AND state IN ('active','checkout') AND id<>?2)", params![owner,r.id], |q| q.get::<_,bool>(0))? { return Err(StoreError::HeldBillConflict); }
        let (state,draft) = match &r.action {
            Action::Save { draft } => ("held",snapshot(&tx,draft.clone())?),
            Action::Resume => ("active",previous.as_ref().ok_or(StoreError::HeldBillConflict)?.draft.clone()),
            Action::Discard => ("discarded",previous.as_ref().ok_or(StoreError::HeldBillConflict)?.draft.clone()),
        };
        if existing.is_none() && tx.query_row("SELECT COUNT(*) FROM local_held_bills WHERE actor_id=?1 AND state IN ('held','active','checkout')", [owner], |q| q.get::<_,i64>(0))? >= 100 { return Err(StoreError::HeldBillLimit); }
        let payload = serde_json::to_string(&draft)?;
        if existing.is_none() {
            tx.execute("INSERT INTO local_held_bills(id,actor_id,revision,state,payload,updated_at,last_request) VALUES(?1,?2,1,?3,?4,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?5)",params![r.id,owner,state,payload,raw])?;
        } else if tx.execute("UPDATE local_held_bills SET revision=revision+1,state=?1,payload=?2,last_request=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?4 AND revision=?5", params![state,payload,raw,r.id,r.expected_revision])? != 1 { return Err(StoreError::HeldBillConflict); }
        identity::guard(&tx,&self.1,Permission::Sell,"held_bill.changed",Some(&r.id))?;
        let result = resumed(&tx,row(&tx,&r.id,owner)?)?;
        tx.commit()?;
        Ok(result)
    }
    pub(crate) fn prepare_held_checkout(&mut self, r: Prepare) -> Result<(), StoreError> {
        r.invoice.validate()?;
        let raw = serde_json::to_string(&r)?;
        let tx = self.0.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let owner = actor(&tx,&self.1)?;
        let bill = row(&tx,&r.id,owner)?;
        let old: Option<String> = tx.query_row("SELECT checkout_request FROM local_held_bills WHERE id=?1", [&r.id], |q| q.get(0))?;
        if old.as_deref() == Some(&raw) && matches!(bill.state.as_str(),"checkout"|"completed") { return Ok(()); }
        if bill.state != "active" || bill.revision != r.expected_revision { return Err(StoreError::HeldBillConflict); }
        clear_pending(&tx,owner)?;
        payments::available(&tx,&r.invoice.operation_id)?;
        payments::unclaimed(&tx,&r.invoice.operation_id)?;
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM local_held_bills WHERE checkout_id=?1)", [&r.invoice.operation_id], |q| q.get::<_,bool>(0))? { return Err(StoreError::OperationConflict); }
        let input = DraftInput {
            lines: r.invoice.lines.iter().map(|l| Line { product_id:l.product_id.clone(),quantity_milli:l.quantity_milli }).collect(),
            tax_basis_points:r.invoice.tax_basis_points,tender:r.invoice.tender.clone(),customer_id:r.invoice.customer_id.clone(),
            payments:r.payments.as_deref().unwrap_or(&[]).iter().map(|p| Allocation { method:p.method.clone(),amount_paise:p.amount_paise,reference:p.reference.clone() }).collect(),
            note:bill.draft.input.note,
        };
        let payload = serde_json::to_string(&snapshot(&tx,input)?)?;
        tx.execute("UPDATE local_held_bills SET state='checkout',revision=revision+1,payload=?1,checkout_id=?2,checkout_request=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?4 AND revision=?5",params![payload,r.invoice.operation_id,raw,r.id,r.expected_revision])?;
        if r.invoice.tender == Tender::Retail {
            let parts = r.payments.ok_or(StoreError::InvalidPayment)?;
            payments::prepare_into(&tx,&self.1,payments::Request { operation_id:r.invoice.operation_id.clone(),action:payments::Action::Sale { invoice:r.invoice,payments:parts } })?;
        } else {
            if r.payments.is_some() { return Err(StoreError::InvalidPayment); }
            crate::checkout::prepare_into(&tx,&self.1,r.invoice)?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
