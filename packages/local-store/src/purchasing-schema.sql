CREATE TABLE local_suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  gstin TEXT,
  address TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK(payment_terms_days BETWEEN 0 AND 3650),
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  revision INTEGER NOT NULL CHECK(revision > 0)
);
CREATE INDEX supplier_name ON local_suppliers(name);
CREATE INDEX supplier_phone ON local_suppliers(phone);
CREATE INDEX supplier_gstin ON local_suppliers(gstin);
CREATE TRIGGER suppliers_id_immutable BEFORE UPDATE ON local_suppliers WHEN OLD.id <> NEW.id BEGIN SELECT RAISE(ABORT, 'Supplier identifiers are immutable'); END;
CREATE TRIGGER suppliers_no_delete BEFORE DELETE ON local_suppliers BEGIN SELECT RAISE(ABORT, 'Supplier history must be retained'); END;
CREATE TABLE local_supplier_ops (
  operation_id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, request TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE local_supplier_outbox (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE REFERENCES local_supplier_ops(operation_id), payload TEXT NOT NULL
);
CREATE TABLE local_supplier_pending (
  actor_id TEXT PRIMARY KEY NOT NULL REFERENCES local_principals(id),
  operation_id TEXT NOT NULL UNIQUE, request TEXT NOT NULL
);
CREATE TABLE local_supplier_canceled (operation_id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE local_supplier_entries (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  kind TEXT NOT NULL CHECK(kind IN ('opening_due','goods_received','invoice_variance','payment','return_credit','adjustment','reversal','supplier_invoice')),
  amount_paise INTEGER NOT NULL CHECK(typeof(amount_paise)='integer' AND amount_paise<>0 AND amount_paise BETWEEN -9000000000000 AND 9000000000000),
  due_on TEXT, reference TEXT, purchase_order_id TEXT, receipt_id TEXT, invoice_id TEXT, reverse_of TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX supplier_reverse_once ON local_supplier_entries(reverse_of) WHERE reverse_of IS NOT NULL;
CREATE INDEX supplier_entries_supplier ON local_supplier_entries(supplier_id, sequence);
CREATE INDEX supplier_entries_operation ON local_supplier_entries(operation_id, sequence);
CREATE INDEX supplier_entries_invoice ON local_supplier_entries(invoice_id, sequence);
CREATE INDEX supplier_entries_receipt ON local_supplier_entries(receipt_id, sequence);
CREATE TABLE local_supplier_journal (
  operation_id TEXT NOT NULL REFERENCES local_supplier_ops(operation_id), supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  account TEXT NOT NULL CHECK(account IN ('cash','bank','upi_clearing','payables','inventory','purchases','opening_equity')),
  amount_paise INTEGER NOT NULL CHECK(typeof(amount_paise)='integer' AND amount_paise<>0 AND amount_paise BETWEEN -9000000000000 AND 9000000000000),
  PRIMARY KEY(operation_id, supplier_id, account)
);
CREATE INDEX supplier_journal_supplier ON local_supplier_journal(supplier_id, operation_id);
CREATE TABLE local_purchase_orders (
  id TEXT PRIMARY KEY NOT NULL,
  number INTEGER NOT NULL UNIQUE CHECK(number > 0),
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  status TEXT NOT NULL CHECK(status IN ('draft','submitted','approved','rejected','cancelled','partial','received','closed')),
  note TEXT NOT NULL DEFAULT '',
  subtotal_paise INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_paise BETWEEN 0 AND 9000000000000),
  tax_paise INTEGER NOT NULL DEFAULT 0 CHECK(tax_paise BETWEEN 0 AND 9000000000000),
  total_paise INTEGER NOT NULL DEFAULT 0 CHECK(total_paise BETWEEN 0 AND 9000000000000),
  revision INTEGER NOT NULL CHECK(revision > 0),
  created_by TEXT, approved_by TEXT, approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX purchase_orders_supplier ON local_purchase_orders(supplier_id, number);
CREATE INDEX purchase_orders_status ON local_purchase_orders(status, number);
CREATE TRIGGER purchase_orders_no_delete BEFORE DELETE ON local_purchase_orders BEGIN SELECT RAISE(ABORT, 'Purchase order history must be retained'); END;
CREATE TABLE local_purchase_order_lines (
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  line_index INTEGER NOT NULL CHECK(line_index BETWEEN 0 AND 499),
  product_id TEXT NOT NULL REFERENCES local_products(id),
  name TEXT NOT NULL, sku TEXT NOT NULL, unit TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
  received_milli INTEGER NOT NULL DEFAULT 0 CHECK(received_milli >= 0 AND received_milli <= quantity_milli),
  unit_cost_paise INTEGER NOT NULL CHECK(unit_cost_paise BETWEEN 0 AND 9000000000000),
  tax_bps INTEGER NOT NULL DEFAULT 0 CHECK(tax_bps BETWEEN 0 AND 10000),
  line_subtotal_paise INTEGER NOT NULL CHECK(line_subtotal_paise BETWEEN 0 AND 9000000000000),
  tax_paise INTEGER NOT NULL CHECK(tax_paise BETWEEN 0 AND 9000000000000),
  line_total_paise INTEGER NOT NULL CHECK(line_total_paise BETWEEN 0 AND 9000000000000),
  PRIMARY KEY(order_id, line_index)
);
CREATE INDEX purchase_order_lines_product ON local_purchase_order_lines(product_id);
CREATE TRIGGER purchase_order_lines_no_delete BEFORE DELETE ON local_purchase_order_lines
  WHEN (SELECT status FROM local_purchase_orders WHERE id = OLD.order_id) <> 'draft'
  BEGIN SELECT RAISE(ABORT, 'Purchase order lines are retained once the order is submitted'); END;
CREATE TRIGGER purchase_order_lines_no_update BEFORE UPDATE ON local_purchase_order_lines
  WHEN OLD.product_id <> NEW.product_id OR OLD.quantity_milli <> NEW.quantity_milli OR OLD.unit_cost_paise <> NEW.unit_cost_paise OR OLD.tax_bps <> NEW.tax_bps
  BEGIN SELECT RAISE(ABORT, 'Purchase order terms are immutable once saved'); END;
CREATE TABLE local_goods_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  reference TEXT,
  note TEXT NOT NULL DEFAULT '',
  goods_total_paise INTEGER NOT NULL CHECK(goods_total_paise BETWEEN 0 AND 9000000000000),
  damaged_total_paise INTEGER NOT NULL DEFAULT 0 CHECK(damaged_total_paise BETWEEN 0 AND 9000000000000),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX goods_receipts_order ON local_goods_receipts(order_id, created_at);
CREATE INDEX goods_receipts_supplier ON local_goods_receipts(supplier_id, created_at);
CREATE TRIGGER goods_receipts_no_delete BEFORE DELETE ON local_goods_receipts BEGIN SELECT RAISE(ABORT, 'Goods receipts must be retained'); END;
CREATE TRIGGER goods_receipts_no_update BEFORE UPDATE ON local_goods_receipts BEGIN SELECT RAISE(ABORT, 'Goods receipts must be retained'); END;
CREATE TABLE local_goods_receipt_lines (
  receipt_id TEXT NOT NULL REFERENCES local_goods_receipts(id),
  line_index INTEGER NOT NULL CHECK(line_index BETWEEN 0 AND 499),
  product_id TEXT NOT NULL REFERENCES local_products(id),
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
  damaged_milli INTEGER NOT NULL DEFAULT 0 CHECK(damaged_milli >= 0 AND damaged_milli <= quantity_milli),
  unit_cost_paise INTEGER NOT NULL CHECK(unit_cost_paise BETWEEN 0 AND 9000000000000),
  line_total_paise INTEGER NOT NULL CHECK(line_total_paise BETWEEN 0 AND 9000000000000),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(receipt_id, line_index)
);
CREATE TRIGGER goods_receipt_lines_no_update BEFORE UPDATE ON local_goods_receipt_lines BEGIN SELECT RAISE(ABORT, 'Goods receipt lines must be retained'); END;
CREATE TRIGGER goods_receipt_lines_no_delete BEFORE DELETE ON local_goods_receipt_lines BEGIN SELECT RAISE(ABORT, 'Goods receipt lines must be retained'); END;
CREATE TABLE local_purchase_stock_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES local_products(id),
  kind TEXT NOT NULL CHECK(kind IN ('goods_received','purchase_return')),
  delta_milli INTEGER NOT NULL CHECK(delta_milli <> 0),
  receipt_id TEXT REFERENCES local_goods_receipts(id),
  return_id TEXT,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX purchase_stock_events_product ON local_purchase_stock_events(product_id, sequence);
CREATE INDEX purchase_stock_events_operation ON local_purchase_stock_events(operation_id);
CREATE TABLE local_supplier_invoices (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  receipt_id TEXT UNIQUE REFERENCES local_goods_receipts(id),
  reference TEXT NOT NULL,
  total_paise INTEGER NOT NULL CHECK(total_paise BETWEEN 1 AND 9000000000000),
  due_on TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(supplier_id, reference)
);
CREATE INDEX supplier_invoices_supplier ON local_supplier_invoices(supplier_id, created_at);
CREATE TABLE local_supplier_payments (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  invoice_id TEXT REFERENCES local_supplier_invoices(id),
  method TEXT NOT NULL CHECK(method IN ('cash','bank','upi')),
  amount_paise INTEGER NOT NULL CHECK(amount_paise BETWEEN 1 AND 9000000000000),
  reference TEXT NOT NULL,
  paid_on TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX supplier_payments_supplier ON local_supplier_payments(supplier_id, created_at);
CREATE INDEX supplier_payments_invoice ON local_supplier_payments(invoice_id);
CREATE TRIGGER supplier_invoices_no_update BEFORE UPDATE ON local_supplier_invoices BEGIN SELECT RAISE(ABORT, 'Supplier invoices must be retained'); END;
CREATE TRIGGER supplier_invoices_no_delete BEFORE DELETE ON local_supplier_invoices BEGIN SELECT RAISE(ABORT, 'Supplier invoices must be retained'); END;
CREATE TRIGGER supplier_payments_no_update BEFORE UPDATE ON local_supplier_payments BEGIN SELECT RAISE(ABORT, 'Supplier payments must be retained'); END;
CREATE TRIGGER supplier_payments_no_delete BEFORE DELETE ON local_supplier_payments BEGIN SELECT RAISE(ABORT, 'Supplier payments must be retained'); END;
CREATE TABLE local_purchase_returns (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  receipt_id TEXT NOT NULL REFERENCES local_goods_receipts(id),
  disposition TEXT NOT NULL CHECK(disposition IN ('supplier_credit','refund')),
  refund_method TEXT CHECK(refund_method IN ('cash','bank','upi')),
  total_paise INTEGER NOT NULL CHECK(total_paise BETWEEN 1 AND 9000000000000),
  reason TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX purchase_returns_receipt ON local_purchase_returns(receipt_id, created_at);
CREATE INDEX purchase_returns_supplier ON local_purchase_returns(supplier_id, created_at);
CREATE TRIGGER purchase_returns_no_update BEFORE UPDATE ON local_purchase_returns BEGIN SELECT RAISE(ABORT, 'Purchase returns must be retained'); END;
CREATE TRIGGER purchase_returns_no_delete BEFORE DELETE ON local_purchase_returns BEGIN SELECT RAISE(ABORT, 'Purchase returns must be retained'); END;
CREATE TABLE local_purchase_return_lines (
  return_id TEXT NOT NULL REFERENCES local_purchase_returns(id),
  receipt_line INTEGER NOT NULL CHECK(receipt_line BETWEEN 0 AND 499),
  product_id TEXT NOT NULL REFERENCES local_products(id),
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
  unit_cost_paise INTEGER NOT NULL CHECK(unit_cost_paise BETWEEN 0 AND 9000000000000),
  line_total_paise INTEGER NOT NULL CHECK(line_total_paise BETWEEN 0 AND 9000000000000),
  PRIMARY KEY(return_id, receipt_line)
);
CREATE TRIGGER purchase_return_lines_no_update BEFORE UPDATE ON local_purchase_return_lines BEGIN SELECT RAISE(ABORT, 'Purchase return lines must be retained'); END;
CREATE TRIGGER purchase_return_lines_no_delete BEFORE DELETE ON local_purchase_return_lines BEGIN SELECT RAISE(ABORT, 'Purchase return lines must be retained'); END;
CREATE TRIGGER supplier_ops_no_update BEFORE UPDATE ON local_supplier_ops BEGIN SELECT RAISE(ABORT, 'Purchasing operation history is append only'); END;
CREATE TRIGGER supplier_ops_no_delete BEFORE DELETE ON local_supplier_ops BEGIN SELECT RAISE(ABORT, 'Purchasing operation history is append only'); END;
CREATE TRIGGER supplier_entries_no_update BEFORE UPDATE ON local_supplier_entries BEGIN SELECT RAISE(ABORT, 'Payable entries are append only; reversals write new entries'); END;
CREATE TRIGGER supplier_entries_no_delete BEFORE DELETE ON local_supplier_entries BEGIN SELECT RAISE(ABORT, 'Payable entries are append only; reversals write new entries'); END;
CREATE TRIGGER supplier_journal_no_update BEFORE UPDATE ON local_supplier_journal BEGIN SELECT RAISE(ABORT, 'Purchasing journal is append only'); END;
CREATE TRIGGER supplier_journal_no_delete BEFORE DELETE ON local_supplier_journal BEGIN SELECT RAISE(ABORT, 'Purchasing journal is append only'); END;
CREATE TRIGGER supplier_outbox_no_update BEFORE UPDATE ON local_supplier_outbox BEGIN SELECT RAISE(ABORT, 'Outbox rows are immutable until replicated'); END;
CREATE TRIGGER supplier_outbox_no_delete BEFORE DELETE ON local_supplier_outbox BEGIN SELECT RAISE(ABORT, 'Outbox rows are immutable until replicated'); END;
CREATE TRIGGER supplier_canceled_no_update BEFORE UPDATE ON local_supplier_canceled BEGIN SELECT RAISE(ABORT, 'Cancellation records are append only'); END;
CREATE TRIGGER supplier_canceled_no_delete BEFORE DELETE ON local_supplier_canceled BEGIN SELECT RAISE(ABORT, 'Cancellation records are append only'); END;
CREATE TRIGGER purchase_stock_events_no_update BEFORE UPDATE ON local_purchase_stock_events BEGIN SELECT RAISE(ABORT, 'Stock events are append only'); END;
CREATE TRIGGER purchase_stock_events_no_delete BEFORE DELETE ON local_purchase_stock_events BEGIN SELECT RAISE(ABORT, 'Stock events are append only'); END;
PRAGMA user_version=13;
