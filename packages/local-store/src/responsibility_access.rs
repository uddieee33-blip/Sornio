use crate::StoreError;
use rusqlite::Transaction;
pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("responsibility_access-schema.sql"))?;
    Ok(())
}
