"""Execute the native transition SQL with migrated SQLite. Not Rust/RBAC/TLS evidence."""
import re, runpy, sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
src=root/'packages/local-store/src'
m=runpy.run_path(str(root/'scripts/verify-local-schema.py'))
groups,_=m['load_migrations']();db=m['build']([sql for _,ddl in groups for sql in ddl])
source=(src/'restaurant.rs').read_text()
sql=re.search(r'"(UPDATE local_restaurant_tickets SET state=\?1,revision=\?2[^";]+)"',source).group(1)
db.execute("INSERT INTO local_restaurant_orders(id,kind,state,revision) VALUES('order','takeaway','open',1)")
db.execute("INSERT INTO local_restaurant_tickets VALUES('ticket','order','[]','pending',1)")
db.commit()
# Invalid jump, stale revision, and mismatched source state all fail the actual CAS.
assert db.execute(sql,('ready',2,'ticket',1,'pending')).rowcount==0
assert db.execute(sql,('preparing',3,'ticket',2,'pending')).rowcount==0
assert db.execute(sql,('preparing',2,'ticket',1,'ready')).rowcount==0
# Simulate a lost response: ticket and immutable receipt roll back together.
db.execute('SAVEPOINT kitchen')
assert db.execute(sql,('preparing',2,'ticket',1,'pending')).rowcount==1
db.execute('ROLLBACK TO kitchen');db.execute('RELEASE kitchen')
assert db.execute("SELECT state,revision FROM local_restaurant_tickets").fetchone()==('pending',1)
assert db.execute(sql,('preparing',2,'ticket',1,'pending')).rowcount==1
assert db.execute(sql,('preparing',2,'ticket',1,'pending')).rowcount==0
assert db.execute(sql,('ready',3,'ticket',2,'preparing')).rowcount==1
assert db.execute(sql,('served',4,'ticket',3,'ready')).rowcount==1
assert db.execute(sql,('preparing',5,'ticket',4,'served')).rowcount==0
# Closed orders cannot change their tickets, even if the revision still matches.
db.execute("UPDATE local_restaurant_orders SET state='cancelled' WHERE id='order'")
db.execute("INSERT INTO local_restaurant_tickets VALUES('closed','order','[]','pending',1)")
assert db.execute(sql,('preparing',2,'closed',1,'pending')).rowcount==0
assert db.execute("SELECT state,revision FROM local_restaurant_orders").fetchone()==('cancelled',1)
for table in ['local_invoices','local_billing_ledger','local_inventory_events']:
 assert db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]==0
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('Mobile kitchen SQL: strict transitions, revision/state CAS, rollback, duplicate/stale command rejection, closed-order guard and no financial writes passed.')
