use super::*;
use crate::checkout::{CashierState, LedgerBalances, PreparedCheckout};
fn client(db: &Connection) -> Result<Settings, StoreError> {
    settings(db)?
        .filter(|s| s.mode == "client" && s.enabled)
        .ok_or(StoreError::LanDenied)
}
fn active(db: &Connection) -> Result<Option<(String, String, bool, Option<String>)>, StoreError> {
    Ok(db
        .query_row(
            "SELECT operation_id,request,attempted,outcome FROM lan_client_queue WHERE active=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?)
}
fn terminal(db: &Connection, id: &str, outcome: &Outcome) -> Result<(), StoreError> {
    let raw = serde_json::to_string(outcome)?;
    let previous: Option<Option<String>> = db
        .query_row(
            "SELECT outcome FROM lan_client_queue WHERE operation_id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()?;
    match previous {
        Some(Some(old)) if old != raw => return Err(StoreError::OperationConflict),
        Some(None) => {
            db.execute(
                "UPDATE lan_client_queue SET outcome=?1 WHERE operation_id=?2 AND outcome IS NULL",
                params![raw, id],
            )?;
        }
        Some(Some(_)) => {}
        None => return Err(StoreError::OperationConflict),
    };
    Ok(())
}
fn receipt(outcome: Outcome) -> Result<Invoice, StoreError> {
    match outcome {
        Outcome::Receipt { invoice } => Ok(invoice),
        Outcome::Rejected { code, .. } => Err(match code.as_str() {
            "stock_conflict" => StoreError::StockConflict,
            "invalid_product" => StoreError::InvalidStock,
            "invalid_invoice" => StoreError::InvalidInvoice,
            "operation_conflict" => StoreError::OperationConflict,
            _ => StoreError::CheckoutActive,
        }),
        Outcome::Canceled => Err(StoreError::CheckoutActive),
    }
}
pub(crate) fn sync(store: &mut Store) -> Result<bool, StoreError> {
    let s = client(&store.0)?;
    let cursor: i64 = store.0.query_row(
        "SELECT cursor FROM lan_client_cache WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    let response = match transport::exchange(&s, Command::Sync { after: cursor }) {
        Ok(r) => r,
        Err(StoreError::HubUnavailable) => return Ok(false),
        Err(e) => return Err(e),
    };
    let Response::Sync {
        products,
        events,
        through,
        head,
    } = response
    else {
        return Err(StoreError::InvalidLan);
    };
    if products.len() > 5000
        || through < cursor
        || head < through
        || events.len() > 100
        || events
            .iter()
            .any(|e| e.record.sequence <= cursor || e.record.sequence > through)
    {
        return Err(StoreError::InvalidLan);
    }
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    // A delayed refresh can never move a newer local cursor/cache backwards.
    let current: i64 = tx.query_row(
        "SELECT cursor FROM lan_client_cache WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    if current != cursor {
        return Err(StoreError::Conflict);
    }
    for delivery in events {
        let event = delivery.record;
        let existing: Option<String> = tx
            .query_row(
                "SELECT payload FROM lan_client_events WHERE sequence=?1",
                [event.sequence],
                |r| r.get(0),
            )
            .optional()?;
        if existing.as_ref().is_some_and(|p| p != &event.payload) {
            return Err(StoreError::OperationConflict);
        }
        tx.execute(
            "INSERT OR IGNORE INTO lan_client_events VALUES(?1,?2,?3)",
            params![event.sequence, event.invoice_id, event.payload],
        )?;
        // Only an already queued local request can become a local receipt; an outbox copy never posts money/stock.
        let ours: Option<String> = tx
            .query_row(
                "SELECT request FROM lan_client_queue WHERE operation_id=?1",
                [&event.invoice_id],
                |r| r.get(0),
            )
            .optional()?;
        if let (Some(raw), Some(expected)) = (ours, delivery.own_request_hash) {
            if fingerprint(raw.as_bytes()) != expected {
                return Err(StoreError::OperationConflict);
            }
            let payload: serde_json::Value = serde_json::from_str(&event.payload)?;
            let invoice: Invoice = serde_json::from_value(payload["invoice"].clone())?;
            if invoice.id != event.invoice_id {
                return Err(StoreError::InvalidLan);
            }
            terminal(&tx, &event.invoice_id, &Outcome::Receipt { invoice })?;
        }
    }
    tx.execute(
        "UPDATE lan_client_cache SET products=?1,cursor=?2,through_head=?3 WHERE singleton=1",
        params![serde_json::to_string(&products)?, through, head],
    )?;
    tx.commit()?;
    Ok(true)
}
pub(crate) fn state(store: &mut Store) -> Result<CashierState, StoreError> {
    if settings(&store.0)?.is_some_and(|s| s.mode == "pairing") {
        return Ok(CashierState {
            products: vec![],
            checkout: None,
            balances: LedgerBalances {
                cash_paise: "0".into(),
                credit_paise: "0".into(),
            },
            lan: Some(crate::checkout::LanCheckout {
                online: false,
                hub_authority: true,
            }),
        });
    }
    let online = sync(store)?;
    let products: String = store.0.query_row(
        "SELECT products FROM lan_client_cache WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    let checkpoint = active(&store.0)?
        .map(|(_, raw, _, result)| -> Result<_, StoreError> {
            let request: PostInvoice = serde_json::from_str(&raw)?;
            let invoice = match result {
                Some(raw) => match serde_json::from_str::<Outcome>(&raw)? {
                    Outcome::Receipt { invoice } => Some(invoice),
                    _ => None,
                },
                None => None,
            };
            Ok(PreparedCheckout { request, invoice })
        })
        .transpose()?;
    let mut cash = 0i128;
    let mut credit = 0i128;
    let rows = store
        .0
        .prepare("SELECT outcome FROM lan_client_queue WHERE outcome IS NOT NULL")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    for raw in rows {
        if let Outcome::Receipt { invoice } = serde_json::from_str(&raw)? {
            match invoice.tender {
                crate::billing::Tender::Cash => {
                    cash = cash
                        .checked_add(invoice.total_paise as i128)
                        .ok_or(StoreError::InvalidInvoice)?
                }
                crate::billing::Tender::Credit => {
                    credit = credit
                        .checked_add(invoice.total_paise as i128)
                        .ok_or(StoreError::InvalidInvoice)?
                }
            }
        }
    }
    Ok(CashierState {
        products: serde_json::from_str(&products)?,
        checkout: checkpoint,
        balances: LedgerBalances {
            cash_paise: cash.to_string(),
            credit_paise: credit.to_string(),
        },
        lan: Some(crate::checkout::LanCheckout {
            online,
            hub_authority: true,
        }),
    })
}
pub(crate) fn prepare(store: &mut Store, request: PostInvoice) -> Result<(), StoreError> {
    let _ = client(&store.0)?;
    request.validate()?;
    let raw = serde_json::to_string(&request)?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let old: Option<(String, bool)> = tx
        .query_row(
            "SELECT request,active FROM lan_client_queue WHERE operation_id=?1",
            [&request.operation_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((old, active)) = old {
        return if old == raw && active {
            Ok(())
        } else {
            Err(StoreError::OperationConflict)
        };
    }
    if active(&tx)?.is_some() {
        return Err(StoreError::CheckoutActive);
    }
    tx.execute(
        "INSERT INTO lan_client_queue(operation_id,request) VALUES(?1,?2)",
        params![request.operation_id, raw],
    )?;
    audit(
        &tx,
        "local-cashier",
        "request.queued",
        serde_json::json!({"operationId":request.operation_id}),
    )?;
    tx.commit()?;
    Ok(())
}
pub(crate) fn post(store: &mut Store, request: PostInvoice) -> Result<Invoice, StoreError> {
    let s = client(&store.0)?;
    request.validate()?;
    let raw = serde_json::to_string(&request)?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (id, old, _, outcome) = active(&tx)?.ok_or(StoreError::CheckoutActive)?;
    if id != request.operation_id || old != raw {
        return Err(StoreError::OperationConflict);
    }
    if let Some(outcome) = outcome {
        return receipt(serde_json::from_str(&outcome)?);
    }
    tx.execute(
        "UPDATE lan_client_queue SET attempted=1 WHERE operation_id=?1",
        [&id],
    )?;
    tx.commit()?;
    // A transport/storage failure after this durable marker is uncertain, even if the hub did not receive it.
    let response =
        transport::exchange(&s, Command::Post { request }).map_err(|_| StoreError::LanUncertain)?;
    let Response::Outcome { outcome, .. } = response else {
        return Err(StoreError::LanUncertain);
    };
    (|| {
        let tx = store
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        terminal(&tx, &id, &outcome)?;
        audit(
            &tx,
            "local-cashier",
            "request.resolved",
            serde_json::json!({"operationId":id,"outcome":outcome}),
        )?;
        tx.commit()?;
        Ok::<_, StoreError>(())
    })()
    .map_err(|_| StoreError::LanUncertain)?;
    receipt(outcome)
}
pub(crate) fn clear(store: &mut Store, id: &str, saved: bool) -> Result<(), StoreError> {
    let s = client(&store.0)?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let entry: Option<(String, bool, Option<String>, bool)> = tx
        .query_row(
            "SELECT request,attempted,outcome,active FROM lan_client_queue WHERE operation_id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?;
    let (raw, attempted, outcome, is_active) = entry.ok_or(StoreError::CheckoutActive)?;
    if !is_active {
        return if saved
            == matches!(
                outcome
                    .as_ref()
                    .map(|r| serde_json::from_str::<Outcome>(r))
                    .transpose()?,
                Some(Outcome::Receipt { .. })
            ) {
            Ok(())
        } else {
            Err(StoreError::CheckoutActive)
        };
    }
    let mut outcome = outcome
        .map(|r| serde_json::from_str::<Outcome>(&r))
        .transpose()?;
    if outcome.is_none() {
        if saved {
            return Err(StoreError::CheckoutActive);
        }
        if !attempted {
            outcome = Some(Outcome::Canceled);
        } else {
            let response = transport::exchange(
                &s,
                Command::Cancel {
                    request: serde_json::from_str(&raw)?,
                },
            )
            .map_err(|_| StoreError::LanUncertain)?;
            let Response::Outcome {
                outcome: result, ..
            } = response
            else {
                return Err(StoreError::LanUncertain);
            };
            outcome = Some(result);
        }
    }
    let outcome = outcome.ok_or(StoreError::LanUncertain)?;
    terminal(&tx, id, &outcome)?;
    let committed = matches!(outcome, Outcome::Receipt { .. });
    // Even a cancellation that discovers a committed receipt must durably retain that receipt.
    if committed != saved {
        tx.commit()?;
        return Err(StoreError::CheckoutActive);
    }
    tx.execute(
        "UPDATE lan_client_queue SET active=0 WHERE operation_id=?1 AND active=1",
        [id],
    )?;
    audit(
        &tx,
        "local-cashier",
        "request.acknowledged",
        serde_json::json!({"operationId":id,"saved":saved}),
    )?;
    tx.commit()?;
    Ok(())
}
pub(crate) fn report(store: &mut Store, after: i64) -> Result<Vec<InvoiceRecord>, StoreError> {
    let s = client(&store.0)?;
    if after < 0 {
        return Err(StoreError::InvalidInvoice);
    }
    match transport::exchange(&s, Command::Report { after })? {
        Response::Report { invoices } => Ok(invoices),
        _ => Err(StoreError::LanDenied),
    }
}

pub(crate) fn cached_products(db: &Connection) -> Result<Vec<Product>, StoreError> {
    let raw: String = db
        .query_row(
            "SELECT products FROM lan_client_cache WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or_else(|| "[]".into());
    Ok(serde_json::from_str(&raw)?)
}
