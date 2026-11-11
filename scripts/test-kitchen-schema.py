"""Kitchen operational SQLite constraints; not a native Rust execution test."""
from pathlib import Path
import sqlite3
s=Path(__file__).resolve().parent.parent/'packages/local-store/src'
db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
db.executescript('CREATE TABLE local_principals(id TEXT PRIMARY KEY); CREATE TABLE local_restaurant_orders(id TEXT PRIMARY KEY);')
db.executescript((s/'kitchen-schema.sql').read_text())
db.executescript("INSERT INTO local_principals VALUES('cashier');INSERT INTO local_restaurant_orders VALUES('order');INSERT INTO local_kitchen_destinations VALUES('hot','Hot kitchen','80mm');INSERT INTO local_kitchen_corrections(id,order_id,actor_id,request,changes) VALUES('correction','order','cashier','same request','[]');INSERT INTO local_kitchen_print_jobs VALUES('job','correction','correction','hot','cashier','document','requested');")
def refused(sql):
 try:db.execute(sql)
 except sqlite3.IntegrityError:return
 raise AssertionError(sql)
refused("INSERT INTO local_kitchen_corrections(id,order_id,actor_id,request,changes) VALUES('correction','order','cashier','other request','[]')")
refused("UPDATE local_kitchen_corrections SET changes='changed'")
refused("DELETE FROM local_kitchen_corrections")
refused("UPDATE local_kitchen_print_jobs SET ticket_id='other'")
db.execute("UPDATE local_kitchen_print_jobs SET state='operator_confirmed' WHERE id='job'")
refused("UPDATE local_kitchen_print_jobs SET state='requested' WHERE id='job'")
assert db.execute('SELECT COUNT(*) FROM local_kitchen_corrections').fetchone()[0]==1
assert db.execute('SELECT COUNT(*) FROM local_kitchen_print_jobs').fetchone()[0]==1
print('Kitchen SQLite: duplicate correction IDs, immutable history/print identity and terminal operator confirmation guards passed.')
