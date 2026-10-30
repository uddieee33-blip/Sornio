//! Native authority foundation only. No socket, listener, pairing UI or wire token.
//! A future audited TLS adapter must create VerifiedPeer from the authenticated
//! certificate, never from request fields. Its constructor is intentionally absent.
use crate::{
    billing::{Invoice, PostInvoice, Tender},
    identity::{self, Permission, Principal, Scope},
    Store, StoreError,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    cell::Cell,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    ReadOnly,
    Cashier,
}
impl Capability {
    fn key(self) -> &'static str {
        match self {
            Self::ReadOnly => "read_only",
            Self::Cashier => "cashier",
        }
    }
    fn parse(s: &str) -> Result<Self, StoreError> {
        match s {
            "read_only" => Ok(Self::ReadOnly),
            "cashier" => Ok(Self::Cashier),
            _ => Err(StoreError::AccessUnavailable),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Enrollment {
    pub id: String,
    pub name: String,
    pub certificate_hash: String,
    pub capability: Capability,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub certificate_hash: String,
    pub capability: Capability,
    pub enabled: bool,
    pub revision: i64,
}

/// Opaque transport evidence. No Deserialize, public fields or public constructor.
pub struct VerifiedPeer {
    certificate_hash: String,
}
/// Native-only, nonserializable session; never a renderer-supplied role or actor ID.
pub struct Session {
    human: identity::Session,
    device: Device,
    last_activity: Cell<Instant>,
}
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub sequence: i64,
    pub invoice: Invoice,
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("lan-authority-schema.sql"))?;
    Ok(())
}
fn device(
    db: &Connection,
    hash: &str,
    scope: &Scope,
    generation: &str,
) -> Result<Device, StoreError> {
    if &identity::scope(db)? != scope {
        return Err(StoreError::WorkspaceMismatch);
    }
    if crate::recovery::generation(db)? != generation {
        return Err(StoreError::Locked);
    }
    let row: Option<(String,String,String,String,bool,i64)> = db.query_row(
        "SELECT id,name,certificate_hash,capability,enabled,revision FROM local_lan_devices WHERE certificate_hash=?1 AND business_id=?2 AND workspace_id=?3 AND generation=?4",
        params![hash,scope.business_id,scope.workspace_id,generation],
        |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)),
    ).optional()?;
    let (id, name, certificate_hash, capability, enabled, revision) =
        row.ok_or(StoreError::Forbidden)?;
    if !enabled {
        return Err(StoreError::Forbidden);
    }
    Ok(Device {
        id,
        name,
        certificate_hash,
        capability: Capability::parse(&capability)?,
        enabled,
        revision,
    })
}
pub(crate) fn enroll(store: &mut Store, r: Enrollment) -> Result<Device, StoreError> {
    if !crate::billing::valid_id(&r.id)
        || !identity::text(&r.name, 80)
        || r.certificate_hash.len() != 64
        || !r
            .certificate_hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(StoreError::InvalidIdentity);
    }
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let session = store.1.as_ref().ok_or(StoreError::Locked)?;
    identity::verify(&tx, session, Permission::Staff)?;
    let scope = identity::scope(&tx)?;
    let generation = crate::recovery::generation(&tx)?;
    // An enrollment replay cannot re-enable a revoked device or change its grant.
    let old: Option<(String, String, String)> = tx
        .query_row(
            "SELECT name,certificate_hash,capability FROM local_lan_devices WHERE id=?1",
            [&r.id],
            |v| Ok((v.get(0)?, v.get(1)?, v.get(2)?)),
        )
        .optional()?;
    if let Some(old) = old {
        if old
            != (
                r.name,
                r.certificate_hash.clone(),
                r.capability.key().into(),
            )
        {
            return Err(StoreError::OperationConflict);
        }
        return device(&tx, &r.certificate_hash, &scope, &generation);
    }
    let count: i64 = tx.query_row("SELECT count(*) FROM local_lan_devices", [], |r| r.get(0))?;
    if count >= 100 {
        return Err(StoreError::InvalidIdentity);
    }
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_lan_devices WHERE certificate_hash=?1)",
        [&r.certificate_hash],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    if tx.execute(
        "INSERT INTO local_lan_devices VALUES(?1,?2,?3,?4,?5,?6,1,1,?7)",
        params![
            r.id,
            scope.business_id,
            scope.workspace_id,
            r.name,
            r.certificate_hash,
            r.capability.key(),
            generation
        ],
    )? != 1
    {
        return Err(StoreError::AccessUnavailable);
    }
    let result = device(&tx, &r.certificate_hash, &scope, &generation)?;
    identity::audit_details(
        &tx,
        session,
        "device.enrolled",
        &r.id,
        serde_json::json!({"device":result}),
    )?;
    tx.commit()?;
    Ok(result)
}
pub(crate) fn change(
    store: &mut Store,
    id: &str,
    revision: i64,
    enabled: bool,
    capability: Capability,
) -> Result<(), StoreError> {
    if !crate::billing::valid_id(id) || revision < 1 {
        return Err(StoreError::InvalidIdentity);
    }
    let next = revision.checked_add(1).ok_or(StoreError::InvalidIdentity)?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let session = store.1.as_ref().ok_or(StoreError::Locked)?;
    identity::verify(&tx, session, Permission::Staff)?;
    if tx.execute("UPDATE local_lan_devices SET enabled=?1,capability=?2,revision=?3,generation=?4 WHERE id=?5 AND revision=?6",params![enabled,capability.key(),next,crate::recovery::generation(&tx)?,id,revision])?!=1 { return Err(StoreError::Conflict); }
    identity::audit_details(
        &tx,
        session,
        "device.changed",
        id,
        serde_json::json!({"expectedRevision":revision,"revision":next,"enabled":enabled,"capability":capability}),
    )?;
    tx.commit()?;
    Ok(())
}
pub(crate) fn list(db: &Connection) -> Result<Vec<Device>, StoreError> {
    let rows=db.prepare("SELECT id,name,certificate_hash,capability,enabled,revision FROM local_lan_devices ORDER BY id LIMIT 100")?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,bool>(4)?,r.get::<_,i64>(5)?)))?.collect::<Result<Vec<_>,_>>()?;
    rows.into_iter()
        .map(|(id, name, certificate_hash, c, enabled, revision)| {
            Ok(Device {
                id,
                name,
                certificate_hash,
                capability: Capability::parse(&c)?,
                enabled,
                revision,
            })
        })
        .collect()
}
pub(crate) fn preauthenticate(
    db: &Connection,
    peer: &VerifiedPeer,
    scope: &Scope,
    generation: &str,
) -> Result<(), StoreError> {
    device(db, &peer.certificate_hash, scope, generation).map(|_| ())
}
pub(crate) fn bind(
    store: &mut Store,
    peer: &VerifiedPeer,
    scope: &Scope,
    generation: &str,
) -> Result<Session, StoreError> {
    let human = store.1.take().ok_or(StoreError::Locked)?;
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let p = identity::verify(&tx, &human, Permission::View)?;
    if &human.scope != scope || human.generation != generation {
        return Err(StoreError::WorkspaceMismatch);
    }
    let device = device(&tx, &peer.certificate_hash, scope, generation)?;
    identity::audit(
        &tx,
        scope,
        Some(&p),
        "device.session_started",
        Some(&device.id),
    )?;
    tx.commit()?;
    Ok(Session {
        human,
        device,
        last_activity: Cell::new(Instant::now()),
    })
}
fn authorize(
    db: &Connection,
    peer: &VerifiedPeer,
    session: &Session,
    scope: &Scope,
    generation: &str,
    permission: Permission,
) -> Result<(), StoreError> {
    if session.last_activity.get().elapsed() >= Duration::from_secs(15 * 60) {
        return Err(StoreError::Locked);
    }
    if scope != &session.human.scope || generation != session.human.generation {
        return Err(StoreError::WorkspaceMismatch);
    }
    if peer.certificate_hash != session.device.certificate_hash {
        return Err(StoreError::Forbidden);
    }
    let current = device(db, &peer.certificate_hash, scope, generation)?;
    if current.id != session.device.id || current.revision != session.device.revision {
        return Err(StoreError::Locked);
    }
    identity::verify(db, &session.human, permission)?;
    if permission != Permission::View
        && (permission != Permission::Sell || current.capability != Capability::Cashier)
    {
        return Err(StoreError::Forbidden);
    }
    Ok(())
}
pub(crate) fn products(
    store: &Store,
    peer: &VerifiedPeer,
    session: &Session,
    scope: &Scope,
    generation: &str,
) -> Result<Vec<crate::catalog::Product>, StoreError> {
    let tx = store.0.unchecked_transaction()?;
    authorize(&tx, peer, session, scope, generation, Permission::View)?;
    let products = store.list_products()?;
    tx.commit()?;
    Ok(products)
}
pub(crate) fn post(
    store: &mut Store,
    peer: &VerifiedPeer,
    session: &Session,
    scope: &Scope,
    generation: &str,
    request: PostInvoice,
) -> Result<Receipt, StoreError> {
    let tx = store
        .0
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    // Both identities are checked after the writer lock, even for exact retries.
    authorize(&tx, peer, session, scope, generation, Permission::Sell)?;
    request.validate()?;
    if request.tender != Tender::Cash {
        return Err(StoreError::InvalidPayment);
    }
    let raw = serde_json::to_string(&request)?;
    let old:Option<(i64,String,String,String,String)>=tx.query_row("SELECT sequence,device_id,actor_id,generation,request FROM local_lan_operations WHERE operation_id=?1",[&request.operation_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional()?;
    if let Some((sequence, device, actor, epoch, previous)) = old {
        if device != session.device.id
            || actor != session.human.actor_id
            || epoch != generation
            || previous != raw
        {
            return Err(StoreError::OperationConflict);
        }
        let payload: String = tx.query_row(
            "SELECT payload FROM local_invoices WHERE id=?1",
            [&request.operation_id],
            |r| r.get(0),
        )?;
        session.last_activity.set(Instant::now());
        return Ok(Receipt {
            sequence,
            invoice: serde_json::from_str(&payload)?,
        });
    }
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_invoices WHERE id=?1)",
        [&request.operation_id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(StoreError::OperationConflict);
    }
    let invoice =
        crate::billing::post_into(&tx, &Some(session.human.clone()), request, false, None)?;
    if tx.execute("INSERT INTO local_lan_operations(operation_id,device_id,actor_id,generation,request) VALUES(?1,?2,?3,?4,?5)",params![invoice.id,session.device.id,session.human.actor_id,generation,raw])?!=1 { return Err(StoreError::AccessUnavailable); }
    let sequence = tx.last_insert_rowid();
    let actor = identity::verify(&tx, &session.human, Permission::Sell)?;
    identity::audit(
        &tx,
        scope,
        Some(&actor),
        "device.sale_posted",
        Some(&session.device.id),
    )?;
    tx.commit()?;
    session.last_activity.set(Instant::now());
    Ok(Receipt { sequence, invoice })
}
pub(crate) fn disable_after_restore(
    tx: &Transaction<'_>,
    actor: &Principal,
) -> Result<(), StoreError> {
    for d in list(tx)? {
        let revision = d
            .revision
            .checked_add(1)
            .ok_or(StoreError::AccessUnavailable)?;
        if tx.execute(
            "UPDATE local_lan_devices SET enabled=0,revision=?1 WHERE id=?2",
            params![revision, d.id],
        )? != 1
        {
            return Err(StoreError::AccessUnavailable);
        }
        identity::audit(
            tx,
            &identity::scope(tx)?,
            Some(actor),
            "recovery.device_disabled",
            Some(&d.id),
        )?;
    }
    Ok(())
}
#[cfg(test)]
pub(crate) fn remove_fixture_tables(db: &Connection) {
    db.execute_batch("DROP TABLE local_lan_operations; DROP TABLE local_lan_devices;")
        .unwrap();
}
#[cfg(test)]
mod tests;
