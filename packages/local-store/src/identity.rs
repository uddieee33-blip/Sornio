//! Local authority only. Never treats a renderer role or a LAN peer as identity.
use crate::{billing::valid_id, StoreError};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Owner,
    Manager,
    AssistantManager,
    Cashier,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Permission {
    View,
    Reconcile,
    CustomerRead,
    ManageCustomers,
    CollectCredit,
    CreditPolicy,
    CorrectCredit,
    Sell,
    AddItem,
    CorrectStock,
    Reports,
    Refund,
    Settings,
    Staff,
    Outbox,
    Audit,
}
impl Role {
    pub fn allows(&self, permission: Permission) -> bool {
        use Permission::*;
        match self {
            Self::Owner => true,
            Self::Manager => matches!(
                permission,
                View | Sell
                    | AddItem
                    | CorrectStock
                    | Reports
                    | CustomerRead
                    | ManageCustomers
                    | CollectCredit
                    | CreditPolicy
                    | Reconcile
                    | Refund
            ),
            Self::AssistantManager => matches!(
                permission,
                View | Sell | AddItem | CustomerRead | ManageCustomers | CollectCredit
            ),
            Self::Cashier => matches!(permission, View | Sell | CustomerRead | CollectCredit),
        }
    }
    pub(crate) fn key(&self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Manager => "manager",
            Self::AssistantManager => "assistant_manager",
            Self::Cashier => "cashier",
        }
    }
    pub(crate) fn parse(value: &str) -> Result<Self, StoreError> {
        match value {
            "owner" => Ok(Self::Owner),
            "manager" => Ok(Self::Manager),
            "assistant_manager" => Ok(Self::AssistantManager),
            "cashier" => Ok(Self::Cashier),
            _ => Err(StoreError::AccessUnavailable),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub business_id: String,
    pub workspace_id: String,
}
#[derive(Clone)]
pub(crate) struct Session {
    pub scope: Scope,
    pub actor_id: String,
    pub revision: i64,
    pub expires: Instant,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Principal {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub enabled: bool,
    pub revision: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSession {
    pub scope: Scope,
    pub principal: Principal,
    pub business_name: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OwnerSetup {
    pub business_name: String,
    pub business_type: String,
    pub display_name: String,
    pub username: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StaffDetails {
    pub username: String,
    pub display_name: String,
    pub role: Role,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StaffChange {
    pub id: String,
    pub expected_revision: i64,
    pub role: Role,
    pub enabled: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub sequence: i64,
    pub actor_id: Option<String>,
    pub actor_role: Option<String>,
    pub action: String,
    pub target: Option<String>,
    pub details: String,
    pub created_at: String,
}

pub(crate) fn random_id() -> Result<String, StoreError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| StoreError::AccessUnavailable)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
pub(crate) fn text(value: &str, max: usize) -> bool {
    !value.trim().is_empty()
        && value.len() <= max * 4
        && value.chars().count() <= max
        && !value.chars().any(char::is_control)
}
pub(crate) fn username(value: &str) -> Result<String, StoreError> {
    if !valid_id(value) {
        return Err(StoreError::InvalidIdentity);
    }
    Ok(value.to_ascii_lowercase())
}
pub(crate) fn scope(db: &Connection) -> Result<Scope, StoreError> {
    db.query_row(
        "SELECT business_id,workspace_id FROM local_identity WHERE singleton=1",
        [],
        |r| {
            Ok(Scope {
                business_id: r.get(0)?,
                workspace_id: r.get(1)?,
            })
        },
    )
    .optional()?
    .ok_or(StoreError::AccessUnavailable)
}
pub(crate) fn principal(db: &Connection, id: &str) -> Result<Principal, StoreError> {
    let row: (String,String,String,String,bool,i64)=db.query_row("SELECT id,username,display_name,role,enabled,revision FROM local_principals WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))).optional()?.ok_or(StoreError::Locked)?;
    Ok(Principal {
        id: row.0,
        username: row.1,
        display_name: row.2,
        role: Role::parse(&row.3)?,
        enabled: row.4,
        revision: row.5,
    })
}
pub(crate) fn verify(
    db: &Connection,
    session: &Session,
    permission: Permission,
) -> Result<Principal, StoreError> {
    if Instant::now() >= session.expires {
        return Err(StoreError::Locked);
    }
    if scope(db)? != session.scope {
        return Err(StoreError::WorkspaceMismatch);
    }
    let p = principal(db, &session.actor_id)?;
    let business: String = db.query_row(
        "SELECT business_id FROM local_principals WHERE id=?1",
        [&p.id],
        |r| r.get(0),
    )?;
    if business != session.scope.business_id {
        return Err(StoreError::WorkspaceMismatch);
    }
    if !p.enabled || p.revision != session.revision {
        return Err(StoreError::Locked);
    }
    if !p.role.allows(permission) {
        return Err(StoreError::Forbidden);
    }
    Ok(p)
}
pub(crate) fn audit(
    db: &Connection,
    scope: &Scope,
    actor: Option<&Principal>,
    action: &str,
    target: Option<&str>,
) -> Result<(), StoreError> {
    let rows=db.execute("INSERT INTO local_identity_audit(business_id,workspace_id,actor_id,actor_role,action,target) VALUES(?1,?2,?3,?4,?5,?6)",params![scope.business_id,scope.workspace_id,actor.map(|p|p.id.as_str()),actor.map(|p|p.role.key()),action,target])?;
    if rows != 1 {
        return Err(StoreError::AccessUnavailable);
    }
    Ok(())
}
pub(crate) fn audit_details(
    db: &Connection,
    session: &Session,
    action: &str,
    target: &str,
    details: serde_json::Value,
) -> Result<(), StoreError> {
    let p = verify(db, session, Permission::Staff)?;
    if db.execute("INSERT INTO local_identity_audit(business_id,workspace_id,actor_id,actor_role,action,target,details) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![session.scope.business_id,session.scope.workspace_id,p.id,p.role.key(),action,target,details.to_string()])?!=1{return Err(StoreError::AccessUnavailable);}
    Ok(())
}
/// Called *after* the SQLite writer lock, in the transaction that mutates data.
/// Trusted storage tests can operate without a session; shipped IPC uses Workspace.
pub(crate) fn invoice_reader(
    db: &Connection,
    session: &Option<Session>,
    invoice_id: &str,
) -> Result<(), StoreError> {
    if let Some(s) = session {
        let p = verify(db, s, Permission::Sell)?;
        let actor: Option<String> = db
            .query_row(
                "SELECT actor_id FROM local_invoice_actors WHERE invoice_id=?1",
                [invoice_id],
                |r| r.get(0),
            )
            .optional()?
            .flatten();
        if actor.as_deref() != Some(p.id.as_str()) && !p.role.allows(Permission::Reports) {
            return Err(StoreError::Forbidden);
        }
    }
    Ok(())
}
pub(crate) fn checkout_actor(db: &Connection, session: &Option<Session>) -> Result<(), StoreError> {
    if let Some(s) = session {
        let p = verify(db, s, Permission::Sell)?;
        let actor: Option<Option<String>> = db
            .query_row(
                "SELECT actor_id FROM local_checkout WHERE singleton=1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(actor) = actor {
            if actor.as_deref() != Some(p.id.as_str()) && p.role != Role::Owner {
                return Err(StoreError::CheckoutActive);
            }
        }
    }
    Ok(())
}
pub(crate) fn guard(
    tx: &Transaction<'_>,
    session: &Option<Session>,
    permission: Permission,
    action: &str,
    target: Option<&str>,
) -> Result<(), StoreError> {
    if let Some(s) = session {
        let p = verify(tx, s, permission)?;
        audit(tx, &s.scope, Some(&p), action, target)?;
    }
    Ok(())
}
pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("identity-schema.sql"))?;
    let business = random_id()?;
    let workspace = random_id()?;
    let legacy: (Option<String>, i64, i64) = tx.query_row(
        "SELECT password_hash,failed_attempts,retry_after FROM workspace_access WHERE singleton=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let draft: Option<String> = tx
        .query_row(
            "SELECT payload FROM workspace_draft WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .optional()?;
    let draft = draft
        .map(|d| serde_json::from_str::<crate::Draft>(&d))
        .transpose()?;
    tx.execute(
        "INSERT INTO local_identity VALUES(1,?1,?2,?3,?4,?5)",
        params![
            business,
            workspace,
            draft
                .as_ref()
                .map(|d| d.business_name.as_str())
                .unwrap_or(""),
            draft
                .as_ref()
                .map(|d| d.business_type.as_str())
                .unwrap_or("general"),
            if legacy.0.is_some() { "legacy" } else { "new" }
        ],
    )?;
    if let Some(hash) = legacy.0 {
        let id = random_id()?;
        tx.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash,failed_attempts,retry_after) VALUES(?1,?2,'owner','Existing owner','owner',1,1,?3,?4,?5)",params![id,business,hash,legacy.1,legacy.2])?;
        audit(
            tx,
            &Scope {
                business_id: business,
                workspace_id: workspace,
            },
            None,
            "identity.migrated",
            Some(&id),
        )?;
    }
    Ok(())
}
pub(crate) fn session(scope: Scope, p: &Principal) -> Session {
    Session {
        scope,
        actor_id: p.id.clone(),
        revision: p.revision,
        expires: Instant::now() + Duration::from_secs(8 * 60 * 60),
    }
}
