//! One durable, encrypted cashier checkpoint. Financial posting stays in billing.
use crate::{
    billing::{Invoice, PostInvoice},
    catalog::Product,
    Store, StoreError,
};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedCheckout {
    pub request: PostInvoice,
    pub invoice: Option<Invoice>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerBalances {
    // Decimal strings keep cumulative balances exact beyond JS safe integers.
    pub cash_paise: String,
    pub credit_paise: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashierState {
    pub products: Vec<Product>,
    pub checkout: Option<PreparedCheckout>,
    pub balances: LedgerBalances,
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(
        "CREATE TABLE local_checkout (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        operation_id TEXT NOT NULL UNIQUE,
        request TEXT NOT NULL
    );
    CREATE TABLE local_checkout_canceled (operation_id TEXT PRIMARY KEY NOT NULL);
    CREATE TRIGGER local_checkout_canceled_no_update BEFORE UPDATE ON local_checkout_canceled
        BEGIN SELECT RAISE(ABORT,'Canceled checkout IDs cannot be reused'); END;
    CREATE TRIGGER local_checkout_canceled_no_delete BEFORE DELETE ON local_checkout_canceled
        BEGIN SELECT RAISE(ABORT,'Canceled checkout IDs cannot be reused'); END;
    PRAGMA user_version=6;",
    )?;
    Ok(())
}
impl Store {
    pub fn prepare_checkout(&mut self, request: PostInvoice) -> Result<(), StoreError> {
        request.validate()?;
        let raw = serde_json::to_string(&request)?;
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let canceled: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_checkout_canceled WHERE operation_id=?1)",
            [&request.operation_id],
            |r| r.get(0),
        )?;
        if canceled {
            return Err(StoreError::CheckoutActive);
        }
        let posted: Option<String> = tx
            .query_row(
                "SELECT request FROM local_invoices WHERE id=?1",
                [&request.operation_id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(posted) = posted {
            return if posted == raw {
                Ok(())
            } else {
                Err(StoreError::OperationConflict)
            };
        }
        let existing: Option<String> = tx
            .query_row(
                "SELECT request FROM local_checkout WHERE singleton=1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(existing) = existing {
            return if existing == raw {
                Ok(())
            } else {
                Err(StoreError::CheckoutActive)
            };
        }
        let inserted = tx.execute(
            "INSERT INTO local_checkout(singleton,operation_id,request) VALUES(1,?1,?2)",
            params![request.operation_id, raw],
        )?;
        if inserted != 1 {
            return Err(StoreError::CheckoutActive);
        }
        tx.commit()?;
        Ok(())
    }
    /// Compare the caller's expected result while holding the same writer lock
    /// used by posting. A discarded checkpoint fences any late UI confirmation.
    pub fn clear_checkout(&mut self, operation_id: &str, saved: bool) -> Result<(), StoreError> {
        if !crate::billing::valid_id(operation_id) {
            return Err(StoreError::InvalidInvoice);
        }
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current: Option<String> = tx
            .query_row(
                "SELECT operation_id FROM local_checkout WHERE singleton=1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        let committed: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_invoices WHERE id=?1)",
            [operation_id],
            |r| r.get(0),
        )?;
        if current.is_none() {
            let canceled: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM local_checkout_canceled WHERE operation_id=?1)",
                [operation_id],
                |r| r.get(0),
            )?;
            if (saved && committed) || (!saved && !committed && canceled) {
                return Ok(()); // Repeating a lost acknowledgement is safe.
            }
        }
        if current.as_deref() != Some(operation_id) || committed != saved {
            return Err(StoreError::CheckoutActive);
        }
        if !saved
            && tx.execute(
                "INSERT INTO local_checkout_canceled(operation_id) VALUES(?1)",
                [operation_id],
            )? != 1
        {
            return Err(StoreError::CheckoutActive);
        }
        if tx.execute(
            "DELETE FROM local_checkout WHERE singleton=1 AND operation_id=?1",
            [operation_id],
        )? != 1
        {
            return Err(StoreError::CheckoutActive);
        }
        tx.commit()?;
        Ok(())
    }
    pub fn cashier_state(&self) -> Result<CashierState, StoreError> {
        // All three reads share one SQLite snapshot, including across processes.
        let tx = self.0.unchecked_transaction()?;
        let products = self.list_products()?;
        let pending: Option<String> = tx
            .query_row(
                "SELECT request FROM local_checkout WHERE singleton=1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        let checkout = if let Some(raw) = pending {
            let request: PostInvoice = serde_json::from_str(&raw)?;
            request.validate()?;
            let payload: Option<String> = tx
                .query_row(
                    "SELECT payload FROM local_invoices WHERE id=?1",
                    [&request.operation_id],
                    |r| r.get(0),
                )
                .optional()?;
            Some(PreparedCheckout {
                request,
                invoice: payload.map(|p| serde_json::from_str(&p)).transpose()?,
            })
        } else {
            None
        };
        let mut cash = 0i128;
        let mut credit = 0i128;
        {
            let mut statement = tx.prepare("SELECT account,amount_paise FROM local_billing_ledger WHERE account IN ('cash','receivables')")?;
            let rows =
                statement.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
            for row in rows {
                let (account, amount) = row?;
                let balance = if account == "cash" {
                    &mut cash
                } else {
                    &mut credit
                };
                *balance = balance
                    .checked_add(amount as i128)
                    .ok_or(StoreError::InvalidInvoice)?;
            }
        }
        tx.commit()?;
        Ok(CashierState {
            products,
            checkout,
            balances: LedgerBalances {
                cash_paise: cash.to_string(),
                credit_paise: credit.to_string(),
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        access::Workspace,
        billing::{BillLine, Tender},
        catalog::AddProduct,
    };
    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    fn request() -> PostInvoice {
        PostInvoice {
            operation_id: "checkout-1".into(),
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
    fn seed(path: &std::path::Path) -> Store {
        let mut s = Store::open(path, KEY).unwrap();
        s.add_product(AddProduct {
            operation_id: "rice".into(),
            name: "Rice".into(),
            sku: "RICE".into(),
            unit: "kg".into(),
            unit_price_paise: 4250,
            opening_stock_milli: 10000,
        })
        .unwrap();
        s
    }
    #[test]
    fn checkpoint_and_receipt_survive_restart_and_retry() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = seed(&path);
        s.prepare_checkout(request()).unwrap();
        drop(s);
        let mut s = Store::open(&path, KEY).unwrap();
        assert!(s
            .cashier_state()
            .unwrap()
            .checkout
            .unwrap()
            .invoice
            .is_none());
        s.prepare_checkout(request()).unwrap();
        let invoice = s.post_prepared_invoice(request()).unwrap();
        drop(s);
        let mut s = Store::open(&path, KEY).unwrap();
        let state = s.cashier_state().unwrap();
        assert_eq!(state.checkout.unwrap().invoice.unwrap(), invoice);
        assert_eq!(state.products[0].stock_milli, 8750);
        assert_eq!(state.balances.cash_paise, "5579");
        assert_eq!(state.balances.credit_paise, "0");
        assert_eq!(s.post_prepared_invoice(request()).unwrap(), invoice);
        assert!(matches!(
            s.clear_checkout("checkout-1", false),
            Err(StoreError::CheckoutActive)
        ));
        s.clear_checkout("checkout-1", true).unwrap();
        assert!(s.cashier_state().unwrap().checkout.is_none());
        assert_eq!(s.post_prepared_invoice(request()).unwrap(), invoice);
        assert_eq!(s.cashier_state().unwrap().products[0].stock_milli, 8750);
    }
    #[test]
    fn canceled_or_replaced_checkpoint_cannot_post_late() {
        let d = tempfile::tempdir().unwrap();
        let mut s = seed(&d.path().join("s.db"));
        assert!(matches!(
            s.post_prepared_invoice(request()),
            Err(StoreError::CheckoutActive)
        ));
        s.prepare_checkout(request()).unwrap();
        let mut changed = request();
        changed.lines[0].quantity_milli = 1000;
        assert!(matches!(
            s.prepare_checkout(changed),
            Err(StoreError::CheckoutActive)
        ));
        assert!(matches!(
            s.clear_checkout("another-id", false),
            Err(StoreError::CheckoutActive)
        ));
        s.clear_checkout("checkout-1", false).unwrap();
        s.clear_checkout("checkout-1", false).unwrap();
        assert!(matches!(
            s.prepare_checkout(request()),
            Err(StoreError::CheckoutActive)
        ));
        assert!(matches!(
            s.post_invoice(request()),
            Err(StoreError::CheckoutActive)
        ));
        assert!(matches!(
            s.post_prepared_invoice(request()),
            Err(StoreError::CheckoutActive)
        ));
        let mut other = request();
        other.operation_id = "next-sale".into();
        s.prepare_checkout(other).unwrap();
        assert!(matches!(
            s.post_prepared_invoice(request()),
            Err(StoreError::CheckoutActive)
        ));
        assert_eq!(s.cashier_state().unwrap().products[0].stock_milli, 10000);
        assert!(s.list_invoices(0).unwrap().is_empty());
    }
    #[test]
    fn checkpoint_commands_require_unlock_and_failed_writes_do_not_post() {
        let d = tempfile::tempdir().unwrap();
        let mut s = seed(&d.path().join("s.db"));
        s.0.pragma_update(None, "query_only", true).unwrap();
        assert!(s.prepare_checkout(request()).is_err());
        s.0.pragma_update(None, "query_only", false).unwrap();
        assert!(s.cashier_state().unwrap().checkout.is_none());
        let mut w = Workspace::new(s);
        assert!(matches!(
            w.prepare_checkout(request()),
            Err(StoreError::Locked)
        ));
        assert!(matches!(w.cashier_state(), Err(StoreError::Locked)));
        assert!(matches!(
            w.clear_checkout("checkout-1", false),
            Err(StoreError::Locked)
        ));
        assert!(matches!(
            w.post_prepared_invoice(request()),
            Err(StoreError::Locked)
        ));
        w.setup("Synthetic checkout password").unwrap();
        w.prepare_checkout(request()).unwrap();
        w.post_prepared_invoice(request()).unwrap();
        w.lock();
        assert!(matches!(w.cashier_state(), Err(StoreError::Locked)));
    }
    #[test]
    fn v5_migration_preserves_posted_invoice_and_large_exact_balances() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = seed(&path);
        let invoice = s.post_invoice(request()).unwrap();
        s.0.execute_batch(
            "DROP TABLE local_checkout_canceled; DROP TABLE local_checkout; PRAGMA user_version=5;",
        )
        .unwrap();
        drop(s);
        let mut s = Store::open(&path, KEY).unwrap();
        assert_eq!(s.list_invoices(0).unwrap()[0].invoice, invoice);
        assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "5579");
        // 1002 maximum-size cash sales exceed Number.MAX_SAFE_INTEGER.
        s.0.execute(
            "UPDATE local_products SET unit_price_paise=9000000000000,stock_milli=2000000",
            [],
        )
        .unwrap();
        for i in 0..1002 {
            let mut r = request();
            r.operation_id = format!("large-{i}");
            r.tax_basis_points = 0;
            r.lines[0].quantity_milli = 1000;
            r.lines[0].expected_revision = i + 2;
            s.post_invoice(r).unwrap();
        }
        assert_eq!(
            s.cashier_state().unwrap().balances.cash_paise,
            "9018000000005579"
        );
    }
    #[test]
    fn failed_post_retains_checkpoint_for_restart_retry() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = seed(&path);
        s.prepare_checkout(request()).unwrap();
        s.0.execute_batch("CREATE TRIGGER fail_outbox BEFORE INSERT ON local_billing_outbox BEGIN SELECT RAISE(ABORT,'write failure'); END;").unwrap();
        assert!(s.post_prepared_invoice(request()).is_err());
        drop(s);
        let mut s = Store::open(&path, KEY).unwrap();
        let state = s.cashier_state().unwrap();
        assert!(state.checkout.unwrap().invoice.is_none());
        assert_eq!(state.balances.cash_paise, "0");
        assert_eq!(state.products[0].stock_milli, 10000);
        s.0.execute_batch("DROP TRIGGER fail_outbox").unwrap();
        s.post_prepared_invoice(request()).unwrap();
        s.clear_checkout("checkout-1", true).unwrap();
        s.clear_checkout("checkout-1", true).unwrap();
        let mut next = request();
        next.operation_id = "next".into();
        next.lines[0].expected_revision = 2;
        s.prepare_checkout(next).unwrap();
        // Resolving an old successful request must not replace another checkout.
        s.prepare_checkout(request()).unwrap();
        s.post_prepared_invoice(request()).unwrap();
        assert_eq!(
            s.cashier_state()
                .unwrap()
                .checkout
                .unwrap()
                .request
                .operation_id,
            "next"
        );
        assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    }
    #[test]
    fn cancellation_and_confirmation_are_serialized_across_connections() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut a = seed(&path);
        a.prepare_checkout(request()).unwrap();
        let mut b = Store::open(&path, KEY).unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let other = barrier.clone();
        let worker = std::thread::spawn(move || {
            other.wait();
            a.post_prepared_invoice(request())
        });
        barrier.wait();
        let clear = b.clear_checkout("checkout-1", false);
        let post = worker.join().unwrap();
        match (post, clear) {
            (Ok(_), Err(StoreError::CheckoutActive)) => {
                assert_eq!(b.cashier_state().unwrap().products[0].stock_milli, 8750);
                assert_eq!(b.list_invoices(0).unwrap().len(), 1);
            }
            (Err(StoreError::CheckoutActive), Ok(())) => {
                assert_eq!(b.cashier_state().unwrap().products[0].stock_milli, 10000);
                assert!(b.list_invoices(0).unwrap().is_empty());
            }
            other => panic!("Invalid cancellation/post outcome: {other:?}"),
        }
    }
}
