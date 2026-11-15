//! Mobile purchasing protocol over the authenticated LAN hub.
//!
//! This is a **narrow mobile-facing surface** over the Phase 21A purchasing
//! module. It never re-implements purchasing: every write is delegated to the
//! same `Store::*` methods the desktop Tauri commands already call, so the
//! integer-paise totals, revision compare-and-set, RBAC guard, balanced ledger
//! and append-only triggers stay the only authority.
//!
//! Three things are added here that the desktop IPC does not need:
//!
//! 1. **A device-scoped operation journal.** Purchasing writes use the hub's
//!    existing v18 `local_hub_operations` journal — the same table, and therefore
//!    the same append-only triggers and the same exactly-once recovery contract,
//!    that restaurant orders already rely on. No new table and no schema bump:
//!    the kind is stored inside the request document, so a purchasing operation
//!    can never be mistaken for an order (or vice versa) and a phone gets one
//!    lookup surface for every hub command it ever sent.
//! 2. **Refusals are durable results, not transport errors.** A revision
//!    conflict, an over-receipt or an unauthorised action is stored once with its
//!    reason, and the same operation identity always returns that same answer.
//!    Only an identity reused by another device/employee/generation — or reused
//!    for a different payload — raises `OperationConflict`.
//! 3. **Reads are bounded snapshots.** A single authenticated
//!    `/v1/purchasing/workspace` call carries suppliers, purchase orders,
//!    receipts, invoices, payments, returns and the catalogue, with a
//!    `generatedAt` stamp the phone shows while offline. No supplier or payables
//!    data is reachable on an unauthenticated path.
use crate::{
    identity::{self, Permission},
    purchasing::{
        CreatePurchaseOrder, DecidePurchaseOrder, PostGoodsReceipt, PostPurchaseReturn,
        PostSupplierPayment, SaveSupplier, TransitionPurchaseOrder, UpdatePurchaseOrder,
    },
    Store, StoreError,
};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// Bumped only when the mobile wire contract changes incompatibly.
pub const PROTOCOL_VERSION: i64 = 1;

/// Bounded so one phone read is never an unbounded export of the shop.
const MAX_SUPPLIERS: usize = 400;
const MAX_ORDERS: usize = 200;
const MAX_RECEIPTS: usize = 200;
const MAX_INVOICES: usize = 200;
const MAX_PAYMENTS: usize = 200;
const MAX_RETURNS: usize = 200;
/// The catalogue ceiling the desktop already enforces (`catalog::MAX_PRODUCTS`).
const MAX_PRODUCTS: i64 = 5_000;

fn digest(raw: &str) -> String {
    format!("{:x}", Sha256::digest(raw.as_bytes()))
}

fn now() -> Result<i64, StoreError> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| StoreError::AccessUnavailable)?
        .as_secs() as i64)
}

/// A refusal is a committed outcome: stored once, replayed by identity, so a
/// phone retrying after a lost acknowledgement converges on the same answer
/// instead of re-attempting the write against a stale revision guess.
fn refusal(reason: &str, revision: Option<i64>) -> Value {
    json!({"status":"refused","reason":reason,"revision":revision})
}

const KIND_SUPPLIER_SAVED: &str = "purchasing.supplier_saved";
const KIND_PO_CREATED: &str = "purchasing.purchase_order_created";
const KIND_PO_UPDATED: &str = "purchasing.purchase_order_updated";
const KIND_PO_SUBMITTED: &str = "purchasing.purchase_order_submitted";
const KIND_PO_DECIDED: &str = "purchasing.purchase_order_decided";
const KIND_PO_CANCELLED: &str = "purchasing.purchase_order_cancelled";
const KIND_PO_CLOSED: &str = "purchasing.purchase_order_closed";
const KIND_RECEIPT: &str = "purchasing.goods_received";
const KIND_PAYMENT: &str = "purchasing.supplier_payment";
const KIND_RETURN: &str = "purchasing.purchase_return";

pub const KINDS: [&str; 10] = [
    KIND_SUPPLIER_SAVED,
    KIND_PO_CREATED,
    KIND_PO_UPDATED,
    KIND_PO_SUBMITTED,
    KIND_PO_DECIDED,
    KIND_PO_CANCELLED,
    KIND_PO_CLOSED,
    KIND_RECEIPT,
    KIND_PAYMENT,
    KIND_RETURN,
];

/// The action matrix exactly as the native guard sees it. Derived from
/// `kitchen_staff::allows`, which itself delegates to `Role::allows`, so the
/// phone can never be shown an action the hub would refuse.
pub(crate) fn capabilities_for(
    db: &rusqlite::Connection,
    actor: &str,
) -> Result<Value, StoreError> {
    let p = identity::principal(db, actor)?;
    let can = |permission: Permission| -> Result<bool, StoreError> {
        crate::kitchen_staff::allows(db, &p, permission)
    };
    Ok(json!({
        "supplierRead": can(Permission::SupplierRead)?,
        "manageSuppliers": can(Permission::ManageSuppliers)?,
        "managePurchaseOrders": can(Permission::ManagePurchaseOrders)?,
        "approvePurchaseOrders": can(Permission::ApprovePurchaseOrder)?,
        "receiveStock": can(Permission::ReceiveStock)?,
        "paySuppliers": can(Permission::PaySuppliers)?,
        "correctPayables": can(Permission::CorrectPayables)?,
        "refund": can(Permission::Refund)?,
    }))
}

impl Store {
    /// One bounded, authenticated read of everything the mobile purchasing
    /// workspace shows. Requires `SupplierRead`, held by every role except a
    /// kitchen-only cashier.
    pub(crate) fn purchasing_workspace(&self) -> Result<Value, StoreError> {
        let s = self.1.as_ref().ok_or(StoreError::Locked)?;
        identity::verify(&self.0, s, Permission::SupplierRead)?;

        let mut suppliers = self.find_suppliers("", true)?;
        suppliers.truncate(MAX_SUPPLIERS);
        let mut orders = self.find_purchase_orders("", "", "")?;
        orders.truncate(MAX_ORDERS);

        let receipts = {
            let mut q = self.0.prepare(
                "SELECT r.id,r.order_id,o.number,r.supplier_id,r.reference,r.note,
                        r.goods_total_paise,r.damaged_total_paise,r.created_at
                 FROM local_goods_receipts r JOIN local_purchase_orders o ON o.id=r.order_id
                 ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?1",
            )?;
            let rows = q.query_map([MAX_RECEIPTS as i64], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "orderId": r.get::<_, String>(1)?,
                    "orderNumber": r.get::<_, i64>(2)?,
                    "supplierId": r.get::<_, String>(3)?,
                    "reference": r.get::<_, Option<String>>(4)?,
                    "note": r.get::<_, String>(5)?,
                    "goodsTotalPaise": r.get::<_, i64>(6)?,
                    "damagedTotalPaise": r.get::<_, i64>(7)?,
                    "createdAt": r.get::<_, String>(8)?,
                }))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let invoices = {
            let mut q = self.0.prepare(
                "SELECT i.id,i.supplier_id,i.receipt_id,i.reference,i.total_paise,i.due_on,i.created_at,
                        COALESCE((SELECT SUM(p.amount_paise) FROM local_supplier_payments p WHERE p.invoice_id=i.id),0)
                 FROM local_supplier_invoices i
                 ORDER BY i.created_at DESC, i.rowid DESC LIMIT ?1",
            )?;
            let rows = q.query_map([MAX_INVOICES as i64], |r| {
                let total: i64 = r.get(4)?;
                let paid: i64 = r.get(7)?;
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "supplierId": r.get::<_, String>(1)?,
                    "receiptId": r.get::<_, Option<String>>(2)?,
                    "reference": r.get::<_, String>(3)?,
                    "totalPaise": total,
                    "outstandingPaise": (total - paid).max(0),
                    "dueOn": r.get::<_, Option<String>>(5)?,
                    "createdAt": r.get::<_, String>(6)?,
                }))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let payments = {
            let mut q = self.0.prepare(
                "SELECT id,supplier_id,invoice_id,method,amount_paise,reference,paid_on,created_at
                 FROM local_supplier_payments ORDER BY created_at DESC, rowid DESC LIMIT ?1",
            )?;
            let rows = q.query_map([MAX_PAYMENTS as i64], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "supplierId": r.get::<_, String>(1)?,
                    "invoiceId": r.get::<_, Option<String>>(2)?,
                    "method": r.get::<_, String>(3)?,
                    "amountPaise": r.get::<_, i64>(4)?,
                    "reference": r.get::<_, String>(5)?,
                    "paidOn": r.get::<_, Option<String>>(6)?,
                    "createdAt": r.get::<_, String>(7)?,
                }))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let returns = {
            let mut q = self.0.prepare(
                "SELECT id,supplier_id,receipt_id,disposition,refund_method,total_paise,reason,created_at
                 FROM local_purchase_returns ORDER BY created_at DESC, rowid DESC LIMIT ?1",
            )?;
            let rows = q.query_map([MAX_RETURNS as i64], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "supplierId": r.get::<_, String>(1)?,
                    "receiptId": r.get::<_, String>(2)?,
                    "disposition": r.get::<_, String>(3)?,
                    "refundMethod": r.get::<_, Option<String>>(4)?,
                    "totalPaise": r.get::<_, i64>(5)?,
                    "reason": r.get::<_, String>(6)?,
                    "createdAt": r.get::<_, String>(7)?,
                }))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        // Catalogue for the purchase-order line picker. Sale price is not
        // purchasing data; the phone needs identity and unit only.
        let products = {
            let mut q = self.0.prepare(
                "SELECT id,name,sku,unit,revision FROM local_products
                 ORDER BY name COLLATE NOCASE, id LIMIT ?1",
            )?;
            let rows = q.query_map([MAX_PRODUCTS], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "sku": r.get::<_, String>(2)?,
                    "unit": r.get::<_, String>(3)?,
                    "revision": r.get::<_, i64>(4)?,
                }))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let generated_at: String =
            self.0
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                    r.get(0)
                })?;
        let capabilities = capabilities_for(&self.0, &s.actor_id)?;
        let actor = identity::principal(&self.0, &s.actor_id)?;
        Ok(json!({
            "version": PROTOCOL_VERSION,
            "businessId": s.scope.business_id,
            "generatedAt": generated_at,
            "actorId": actor.id,
            "displayName": actor.display_name,
            "role": actor.role.key(),
            "capabilities": capabilities,
            "suppliers": suppliers,
            "purchaseOrders": orders,
            "receipts": receipts,
            "invoices": invoices,
            "payments": payments,
            "returns": returns,
            "products": products,
        }))
    }

    /// A supplier statement with its running balance and aging buckets.
    pub(crate) fn purchasing_statement(
        &self,
        supplier_id: &str,
        after: i64,
        through: Option<i64>,
    ) -> Result<Value, StoreError> {
        if after < 0 || through.map(|t| t < 0).unwrap_or(false) {
            return Err(StoreError::InvalidSupplier);
        }
        let statement = self.supplier_statement(supplier_id, after, through)?;
        Ok(json!({"version": PROTOCOL_VERSION, "statement": statement}))
    }

    /// One purchase order with its receipts and returns, so the receiving screen
    /// can show ordered, already-received and returnable quantities without
    /// guessing from a summary row.
    pub(crate) fn purchasing_order(&self, id: &str) -> Result<Value, StoreError> {
        let order = self.get_purchase_order(id)?;
        let receipts = self.list_goods_receipts(id)?;
        let returns = {
            let mut q = self.0.prepare(
                "SELECT id,receipt_id,disposition,refund_method,total_paise,reason,created_at
                 FROM local_purchase_returns
                 WHERE receipt_id IN (SELECT id FROM local_goods_receipts WHERE order_id=?1)
                 ORDER BY created_at DESC LIMIT 100",
            )?;
            let rows = q.query_map([id], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "receiptId": r.get::<_, String>(1)?,
                    "disposition": r.get::<_, String>(2)?,
                    "refundMethod": r.get::<_, Option<String>>(3)?,
                    "totalPaise": r.get::<_, i64>(4)?,
                    "reason": r.get::<_, String>(5)?,
                    "createdAt": r.get::<_, String>(6)?,
                }))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        Ok(json!({
            "version": PROTOCOL_VERSION,
            "order": order,
            "receipts": receipts,
            "returns": returns,
        }))
    }

    /// Idempotent purchasing write.
    ///
    /// Exactly-once is owned by Phase 21A: every authoritative method records its
    /// operation id with the exact request and result in `local_supplier_ops`, and
    /// replays that stored answer instead of re-posting. This function therefore
    /// does not have to make the effect and the journal atomic, which it could not
    /// do anyway — the store methods open their own immediate transaction. It
    /// guarantees the two properties the phone depends on:
    ///
    /// 1. **A replayed identity never re-posts.** The journal is consulted first,
    ///    and the store method is idempotent by identity even when the journal has
    ///    no row yet (a crash between the commit and the journal insert).
    /// 2. **A refusal is a stored result.** Business refusals — stale revision,
    ///    over-receipt, unauthorised role — are written to the journal once and
    ///    replayed by identity. Only transaction-level failures return `Err`, so
    ///    the phone never adopts a truncated answer as a final one.
    pub(crate) fn purchasing_submit(
        &mut self,
        device: &str,
        operation_id: &str,
        body: &Value,
    ) -> Result<Value, StoreError> {
        if !crate::billing::valid_id(operation_id) {
            return Err(StoreError::InvalidIdentity);
        }
        let kind = body["kind"].as_str().ok_or(StoreError::InvalidDraft)?;
        if !KINDS.contains(&kind) {
            return Err(StoreError::InvalidDraft);
        }
        let request_value = body
            .get("request")
            .cloned()
            .ok_or(StoreError::InvalidDraft)?;
        // The digest covers the business request and the kind only: the envelope
        // fields are validated separately, so rewording the wrapper cannot
        // "change" a request and a replay stays a replay.
        let digest_source = format!("{kind}\n{}", serde_json::to_string(&request_value)?);
        let journal_request = json!({
            "kind": kind,
            "operationId": operation_id,
            "digest": digest(&digest_source),
            "request": request_value,
        })
        .to_string();
        let actor = self.1.as_ref().ok_or(StoreError::Locked)?.actor_id.clone();

        // Fast path: an already-decided identity answers from the journal and
        // touches no purchasing table at all.
        let existing = {
            let tx = self.0.unchecked_transaction()?;
            let stored = journal_lookup(&tx, device, operation_id, &actor, kind);
            tx.commit()?;
            stored?
        };
        if let Some(stored) = existing {
            return Ok(stored);
        }

        // The authoritative write. It is idempotent by operation id on its own, so
        // a retry here after a lost acknowledgement re-posts nothing.
        let outcome = self.purchasing_apply(kind, &request_value)?;
        let result = match outcome {
            Ok(value) => json!({"status":"accepted","kind":kind,"result":value}),
            Err((reason, revision)) => refusal(reason, revision),
        };

        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        // Re-check under the write lock: two concurrent submissions of one identity
        // must converge on one journal row. If the other submission won, its stored
        // answer is the answer, and the store method above already replayed rather
        // than re-posted.
        if let Some(stored) = journal_lookup(&tx, device, operation_id, &actor, kind)? {
            tx.commit()?;
            return Ok(stored);
        }
        let generation = tx
            .query_row(
                "SELECT generation FROM local_recovery_identity WHERE singleton=1",
                [],
                |r| r.get::<_, String>(0),
            )
            .map_err(|_| StoreError::Locked)?;
        tx.execute(
            "INSERT INTO local_hub_operations VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![
                operation_id,
                device,
                actor,
                generation,
                journal_request,
                result.to_string(),
                now()?
            ],
        )?;
        let principal = identity::principal(&tx, &actor)?;
        identity::audit(
            &tx,
            &identity::scope(&tx)?,
            Some(&principal),
            &format!("hub.{kind}"),
            Some(operation_id),
        )?;
        tx.execute(
            "UPDATE local_hub_devices SET last_seen=?1 WHERE id=?2",
            params![now()?, device],
        )?;
        tx.commit()?;
        Ok(result)
    }

    /// Delegates to the authoritative Phase 21A methods, then classifies the
    /// error into a durable refusal reason. Nothing is re-implemented here.
    fn purchasing_apply(
        &mut self,
        kind: &str,
        request: &Value,
    ) -> Result<Result<Value, (&'static str, Option<i64>)>, StoreError> {
        let ok = |value: Value| Ok(value);
        Ok(match kind {
            KIND_SUPPLIER_SAVED => {
                let r: SaveSupplier = serde_json::from_value(request.clone())?;
                match self.save_supplier(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(supplier_refusal(&e)),
                }
            }
            KIND_PO_CREATED => {
                let r: CreatePurchaseOrder = serde_json::from_value(request.clone())?;
                match self.create_purchase_order(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(order_refusal(&self.0, &e, None)),
                }
            }
            KIND_PO_UPDATED => {
                let r: UpdatePurchaseOrder = serde_json::from_value(request.clone())?;
                let id = r.id.clone();
                match self.update_purchase_order(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(order_refusal(&self.0, &e, Some(&id))),
                }
            }
            KIND_PO_SUBMITTED => {
                let r: TransitionPurchaseOrder = serde_json::from_value(request.clone())?;
                let id = r.id.clone();
                match self.submit_purchase_order(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(order_refusal(&self.0, &e, Some(&id))),
                }
            }
            KIND_PO_DECIDED => {
                let r: DecidePurchaseOrder = serde_json::from_value(request.clone())?;
                let id = r.id.clone();
                match self.decide_purchase_order(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(order_refusal(&self.0, &e, Some(&id))),
                }
            }
            KIND_PO_CANCELLED => {
                let r: TransitionPurchaseOrder = serde_json::from_value(request.clone())?;
                let id = r.id.clone();
                match self.cancel_purchase_order(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(order_refusal(&self.0, &e, Some(&id))),
                }
            }
            KIND_PO_CLOSED => {
                let r: TransitionPurchaseOrder = serde_json::from_value(request.clone())?;
                let id = r.id.clone();
                match self.close_purchase_order(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(order_refusal(&self.0, &e, Some(&id))),
                }
            }
            KIND_RECEIPT => {
                let r: PostGoodsReceipt = serde_json::from_value(request.clone())?;
                match self.post_goods_receipt(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(order_refusal(&self.0, &e, None)),
                }
            }
            KIND_PAYMENT => {
                let r: PostSupplierPayment = serde_json::from_value(request.clone())?;
                match self.post_supplier_payment(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(payable_refusal(&e)),
                }
            }
            KIND_RETURN => {
                let r: PostPurchaseReturn = serde_json::from_value(request.clone())?;
                match self.post_purchase_return(r) {
                    Ok(v) => ok(serde_json::to_value(v)?),
                    Err(e) => Err(return_refusal(&e)),
                }
            }
            _ => return Err(StoreError::InvalidDraft),
        })
    }
}

/// "The copy you have is out of date" refusals carry the current revision so the
/// phone can show exactly what changed instead of retrying blind.
fn order_refusal(
    db: &rusqlite::Connection,
    e: &StoreError,
    order_id: Option<&str>,
) -> (&'static str, Option<i64>) {
    let revision = order_id.and_then(|id| {
        db.query_row(
            "SELECT revision FROM local_purchase_orders WHERE id=?1",
            [id],
            |r| r.get::<_, i64>(0),
        )
        .optional()
        .ok()
        .flatten()
    });
    match e {
        StoreError::OrderState => ("order_state_refused", revision),
        StoreError::PurchaseOrderConflict => ("revision_conflict", revision),
        StoreError::PurchaseOrderMissing => ("order_missing", None),
        StoreError::SupplierMissing => ("supplier_missing", None),
        StoreError::SupplierConflict => ("supplier_revision_conflict", None),
        StoreError::InvalidPurchaseOrder => ("invalid_purchase_order", None),
        StoreError::InvalidReceipt => ("invalid_receipt", None),
        StoreError::InvalidReturn => ("invalid_return", None),
        StoreError::InvalidProduct | StoreError::ProductMissing => ("product_missing", None),
        StoreError::Forbidden => ("not_permitted", None),
        StoreError::WorkspaceMismatch => ("wrong_shop", None),
        StoreError::OperationConflict => ("operation_identity_conflict", None),
        _ => ("unknown_refusal", None),
    }
}

fn supplier_refusal(e: &StoreError) -> (&'static str, Option<i64>) {
    match e {
        StoreError::InvalidSupplier => ("invalid_supplier", None),
        StoreError::SupplierMissing => ("supplier_missing", None),
        StoreError::SupplierConflict => ("supplier_revision_conflict", None),
        StoreError::Forbidden => ("not_permitted", None),
        StoreError::OperationConflict => ("operation_identity_conflict", None),
        _ => ("unknown_refusal", None),
    }
}

fn payable_refusal(e: &StoreError) -> (&'static str, Option<i64>) {
    match e {
        StoreError::InvalidPayable => ("invalid_payable", None),
        StoreError::Overpayment => ("overpayment", None),
        StoreError::SupplierMissing => ("supplier_missing", None),
        StoreError::SupplierConflict => ("supplier_revision_conflict", None),
        StoreError::Forbidden => ("not_permitted", None),
        StoreError::OperationConflict => ("operation_identity_conflict", None),
        _ => ("unknown_refusal", None),
    }
}

fn return_refusal(e: &StoreError) -> (&'static str, Option<i64>) {
    match e {
        StoreError::InvalidReturn => ("invalid_return", None),
        StoreError::Forbidden => ("not_permitted", None),
        StoreError::OperationConflict => ("operation_identity_conflict", None),
        _ => ("unknown_refusal", None),
    }
}

/// Parsed view of one `local_hub_operations` row that a purchasing request wrote.
///
/// The journal is shared with the restaurant order routes, so ownership is the
/// tuple `(device, actor)` and the payload is itself the guard: the stored request
/// is our own `{kind, operationId, digest, request}` document, so a row written for
/// an order cannot be replayed as a purchasing operation, and the digest decides
/// whether a resend carries the same body.
struct JournalRow {
    device_id: String,
    actor_id: String,
    request: String,
    result: String,
}

fn journal_row(
    db: &rusqlite::Connection,
    operation_id: &str,
) -> Result<Option<JournalRow>, StoreError> {
    let row: Option<(String, String, String, String)> = db
        .query_row(
            "SELECT device_id,actor_id,request,result FROM local_hub_operations WHERE id=?1",
            [operation_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?;
    Ok(
        row.map(|(device_id, actor_id, request, result)| JournalRow {
            device_id,
            actor_id,
            request,
            result,
        }),
    )
}

/// Decides whether an existing journal row answers this request. `Ok(Some(_))` is
/// the replayed answer, `Ok(None)` means no row exists yet, and any other shape —
/// another device, another employee, another kind, or a non-purchasing operation
/// sharing the id space — is a conflict.
fn journal_lookup(
    db: &rusqlite::Connection,
    device: &str,
    operation_id: &str,
    actor: &str,
    kind: &str,
) -> Result<Option<Value>, StoreError> {
    let Some(row) = journal_row(db, operation_id)? else {
        return Ok(None);
    };
    if row.device_id != device || row.actor_id != actor {
        return Err(StoreError::OperationConflict);
    }
    let stored: Value = serde_json::from_str(&row.request)?;
    if stored["kind"].as_str() != Some(kind) {
        return Err(StoreError::OperationConflict);
    }
    Ok(Some(serde_json::from_str(&row.result)?))
}

/// Journal status for one purchasing operation identity, scoped to the device and
/// employee that wrote it.
///
/// `not_found` is only ever returned for an identity this hub has never recorded,
/// which is what tells the phone to resend the *same* immutable request rather
/// than mint a new one. An identity that belongs to an order — or to another
/// device — is a conflict, because handing back its result would leak or
/// misinterpret a committed outcome.
///
/// When the caller supplies the `kind` and `request` it believes the identity
/// refers to, they are hashed exactly as `purchasing_submit` hashes them and
/// compared with the recorded digest. A phone that lost its records, or restored
/// an old backup, could otherwise be handed a *different* operation's committed
/// result and report its own work as done. The payload is optional only so a
/// caller that genuinely has no record (and therefore nothing to claim) can ask.
pub(crate) fn operation_status(
    store: &Store,
    device: &str,
    body: &Value,
) -> Result<Value, StoreError> {
    let operation_id = body
        .get("operationId")
        .and_then(Value::as_str)
        .ok_or(StoreError::InvalidDraft)?;
    if !crate::billing::valid_id(operation_id) {
        return Err(StoreError::InvalidDraft);
    }
    let s = store.1.as_ref().ok_or(StoreError::Locked)?;
    let Some(row) = journal_row(&store.0, operation_id)? else {
        return Ok(json!({"status":"not_found"}));
    };
    if row.device_id != device || row.actor_id != s.actor_id {
        return Err(StoreError::OperationConflict);
    }
    let stored: Value = serde_json::from_str(&row.request)?;
    let Some(kind) = stored["kind"]
        .as_str()
        .filter(|k| k.starts_with("purchasing."))
    else {
        return Err(StoreError::OperationConflict);
    };
    if let Some(claimed_kind) = body.get("kind").and_then(Value::as_str) {
        if claimed_kind != kind {
            return Err(StoreError::OperationConflict);
        }
        // The request must be present: a caller that names a kind but no payload
        // is trying to look up an identity it cannot describe.
        let claimed_request = body.get("request").ok_or(StoreError::InvalidDraft)?;
        let digest_source = format!("{kind}\n{}", serde_json::to_string(claimed_request)?);
        if stored["digest"].as_str() != Some(digest(&digest_source).as_str()) {
            return Err(StoreError::OperationConflict);
        }
    }
    Ok(serde_json::from_str(&row.result)?)
}

/// Discovery capability. Adds no business data; the phone uses it to decide
/// whether a hub supports the purchasing protocol at all.
pub const CAPABILITY: &str = "purchasing.mobile.v1";

/// Validates the mobile envelope before the store sees it, so the router stays a
/// switch and the bounds are testable without a database.
pub(crate) fn envelope(value: &Value) -> Result<(), StoreError> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Envelope {
        version: i64,
    }
    let parsed: Envelope = serde_json::from_value(value.clone())?;
    if parsed.version != PROTOCOL_VERSION {
        return Err(StoreError::InvalidDraft);
    }
    Ok(())
}

#[cfg(test)]
#[path = "purchasing_hub_tests.rs"]
mod integration;
