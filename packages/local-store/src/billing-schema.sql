CREATE TABLE local_invoices (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE, request TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE local_invoice_stock (
 invoice_id TEXT NOT NULL REFERENCES local_invoices(id),
 product_id TEXT NOT NULL REFERENCES local_products(id),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
 before_milli INTEGER NOT NULL CHECK(before_milli>=quantity_milli),
 after_milli INTEGER NOT NULL CHECK(after_milli=before_milli-quantity_milli),
 PRIMARY KEY(invoice_id,product_id)
);
CREATE TABLE local_billing_ledger (
 invoice_id TEXT NOT NULL REFERENCES local_invoices(id), account TEXT NOT NULL
 CHECK(account IN ('cash','receivables','revenue','tax_payable')),
 customer_id TEXT, amount_paise INTEGER NOT NULL CHECK(amount_paise<>0),
 PRIMARY KEY(invoice_id,account)
);
CREATE TABLE local_billing_audit (
 invoice_id TEXT PRIMARY KEY REFERENCES local_invoices(id), payload TEXT NOT NULL
);
CREATE TABLE local_billing_outbox (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 invoice_id TEXT NOT NULL UNIQUE REFERENCES local_invoices(id), payload TEXT NOT NULL
);
PRAGMA user_version=5;
