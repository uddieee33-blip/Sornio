CREATE TABLE local_customers (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT,
 credit_limit_paise INTEGER CHECK(credit_limit_paise BETWEEN 0 AND 9000000000000),
 credit_days INTEGER NOT NULL CHECK(credit_days BETWEEN 0 AND 3650),
 revision INTEGER NOT NULL CHECK(revision>0)
);
CREATE TRIGGER customers_no_delete BEFORE DELETE ON local_customers BEGIN SELECT RAISE(ABORT,'Customer history must be retained'); END;
CREATE TRIGGER customers_id_immutable BEFORE UPDATE ON local_customers WHEN OLD.id<>NEW.id BEGIN SELECT RAISE(ABORT,'Customer identifiers are immutable'); END;
CREATE TABLE local_customer_ops (
 operation_id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, request TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE local_credit_entries (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL REFERENCES local_customers(id), kind TEXT NOT NULL CHECK(kind IN ('sale','repayment','opening_due','write_off','reversal','link_in','link_out')),
 amount_paise INTEGER NOT NULL CHECK(typeof(amount_paise)='integer' AND amount_paise<>0 AND amount_paise BETWEEN -9000000000000 AND 9000000000000),
 due_on TEXT, invoice_id TEXT REFERENCES local_invoices(id), reverse_of TEXT,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(operation_id,customer_id)
);
CREATE UNIQUE INDEX credit_sale_once ON local_credit_entries(invoice_id) WHERE kind='sale';
CREATE UNIQUE INDEX credit_reverse_once ON local_credit_entries(reverse_of) WHERE reverse_of IS NOT NULL;
CREATE INDEX customer_credit_history ON local_credit_entries(customer_id,sequence);
CREATE INDEX credit_invoice_links ON local_credit_entries(invoice_id,sequence);
CREATE TABLE local_customer_journal (
 operation_id TEXT NOT NULL REFERENCES local_customer_ops(operation_id), customer_id TEXT NOT NULL REFERENCES local_customers(id),
 account TEXT NOT NULL CHECK(account IN ('cash','receivables','opening_equity','bad_debt')),
 amount_paise INTEGER NOT NULL CHECK(typeof(amount_paise)='integer' AND amount_paise<>0 AND amount_paise BETWEEN -9000000000000 AND 9000000000000),
 PRIMARY KEY(operation_id,customer_id,account)
);
CREATE TABLE local_customer_outbox (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL UNIQUE REFERENCES local_customer_ops(operation_id), payload TEXT NOT NULL
);
CREATE TABLE local_customer_pending (
 actor_id TEXT PRIMARY KEY NOT NULL REFERENCES local_principals(id), operation_id TEXT NOT NULL UNIQUE, request TEXT NOT NULL
);
CREATE TABLE local_customer_canceled (operation_id TEXT PRIMARY KEY NOT NULL);
PRAGMA user_version=8;
