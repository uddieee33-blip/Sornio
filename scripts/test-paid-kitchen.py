"""Real migrated SQLite/read/transition SQL; not native Rust execution evidence."""
import json,re,runpy
from pathlib import Path
root=Path(__file__).resolve().parents[1];src=root/'packages/local-store/src';m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']();db=m['build']([sql for _,ddl in groups for sql in ddl]);m['seed'](db)
source=(src/'restaurant.rs').read_text()
read=re.search(r'"(SELECT t.id,t.order_id,o.kind,[^"]+)"',source).group(1)
transition=re.search(r'"(UPDATE local_restaurant_tickets SET state=\?1,revision=\?2[^";]+)"',source).group(1)
db.execute("INSERT INTO local_restaurant_tables VALUES('table','Table 1',1)")
db.execute("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('paid','table','dine_in','pending_bill',2)")
db.execute("INSERT INTO local_restaurant_tickets VALUES('kot','paid','[]','pending',1)")
assert db.execute(read).fetchall()==[]
# Use a real seeded invoice with valid linked attempt/control, preserving settlement triggers.
db.execute("INSERT INTO local_restaurant_attempts VALUES('op-sale-1','paid','op-sale-1','{}')")
db.execute("INSERT INTO local_restaurant_control VALUES('paid','op-sale-1','op-sale-1','p1',1,'unknown','')")
db.execute("UPDATE local_restaurant_orders SET settled_invoice='op-sale-1' WHERE id='paid'")
db.execute("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('new-guests','table','dine_in','open',1)")
assert db.execute(read).fetchone()[0]=='kot'
financial=['local_invoices','local_billing_ledger','local_retail_payments','local_credit_entries','local_invoice_stock','local_products','local_restaurant_orders','local_restaurant_control']
before={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial}
for n,(state,previous) in enumerate([('preparing','pending'),('ready','preparing'),('served','ready')],1):
 assert db.execute(transition,(state,n+1,'kot',n,previous)).rowcount==1
 assert db.execute(transition,(state,n+1,'kot',n,previous)).rowcount==0
assert db.execute(read).fetchall()==[]
assert before=={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial}
assert db.execute("SELECT id FROM local_restaurant_orders WHERE table_id='table' AND settled_invoice IS NULL").fetchall()==[('new-guests',)]
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('Paid kitchen SQL passed: authoritative invoice linkage, new table occupants, revision-safe preparation, served removal, unchanged invoices/payments/credit/stock/order/control rows.')
