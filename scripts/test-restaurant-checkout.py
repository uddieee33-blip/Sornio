"""SQLite binding/release guards only; does not execute Rust financial code."""
import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'packages/local-store/src'
db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
db.executescript('CREATE TABLE local_invoices(id TEXT PRIMARY KEY); CREATE TABLE local_principals(id TEXT PRIMARY KEY); CREATE TABLE local_products(id TEXT PRIMARY KEY);')
db.executescript((root/'restaurant-schema.sql').read_text());db.executescript((root/'restaurant_checkout-schema.sql').read_text())
db.executescript("INSERT INTO local_principals VALUES('cashier'); INSERT INTO local_restaurant_tables VALUES('t','Table 1',1); INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('o','t','dine_in','pending_bill',1); INSERT INTO local_restaurant_bindings VALUES('o','invoice','cashier','request');")
def refuses(sql):
 try:db.execute(sql)
 except sqlite3.IntegrityError:return
 raise AssertionError(sql)
refuses("INSERT INTO local_restaurant_bindings VALUES('o','other','cashier','request')")
refuses("UPDATE local_restaurant_orders SET settled_invoice='invoice' WHERE id='o'")
refuses("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('second','t','dine_in','open',1)")
db.rollback()
db.execute('BEGIN');db.execute("INSERT INTO local_invoices VALUES('invoice')");db.execute("UPDATE local_restaurant_orders SET settled_invoice='invoice' WHERE id='o'");db.rollback()
assert db.execute("SELECT settled_invoice FROM local_restaurant_orders WHERE id='o'").fetchone()==(None,)
db.execute("INSERT INTO local_invoices VALUES('invoice')");db.execute("UPDATE local_restaurant_orders SET settled_invoice='invoice' WHERE id='o'");db.commit()
db.execute("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('second','t','dine_in','open',1)")
refuses("UPDATE local_restaurant_orders SET settled_invoice='invoice' WHERE id='o'")
print('Binding uniqueness, invoice-before-settlement, rollback and table-release SQLite guards passed.')
