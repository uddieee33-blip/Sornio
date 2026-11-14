"""SQLite migration/identity guards only; native financial/RBAC tests need Cargo."""
import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'packages/local-store/src'
db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
db.executescript('CREATE TABLE local_invoices(id TEXT PRIMARY KEY); CREATE TABLE local_principals(id TEXT PRIMARY KEY); CREATE TABLE local_products(id TEXT PRIMARY KEY);')
for f in ['restaurant-schema.sql','restaurant_checkout-schema.sql']:db.executescript((root/f).read_text())
db.executescript("INSERT INTO local_principals VALUES('old');INSERT INTO local_principals VALUES('new');INSERT INTO local_restaurant_tables VALUES('t','Table',1);INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('o','t','dine_in','pending_bill',1);INSERT INTO local_restaurant_bindings VALUES('o','parent','old','original payload');")
db.executescript((root/'restaurant_recovery-schema.sql').read_text())
assert db.execute('SELECT parent_id,attempt_id,phase FROM local_restaurant_control').fetchone()==('parent','parent','unknown')
def refused(sql):
 try:db.execute(sql)
 except sqlite3.IntegrityError:return
 raise AssertionError(sql)
refused("UPDATE local_restaurant_control SET phase='editable' WHERE order_id='o'")
refused("UPDATE local_restaurant_attempts SET request='changed' WHERE id='parent'")
refused("UPDATE local_restaurant_control SET parent_id='changed',revision=revision+1 WHERE order_id='o'")
db.execute("UPDATE local_restaurant_control SET phase='refused',revision=revision+1 WHERE order_id='o'")
db.execute("INSERT INTO local_restaurant_attempts VALUES('attempt2','o','parent','corrected payload')")
db.execute("UPDATE local_restaurant_control SET attempt_id='attempt2',phase='bound',actor_id='new',revision=revision+1 WHERE order_id='o'")
refused("UPDATE local_restaurant_orders SET settled_invoice='attempt2' WHERE id='o'")
db.execute("INSERT INTO local_invoices VALUES('parent')")
refused("UPDATE local_restaurant_orders SET settled_invoice='parent' WHERE id='o'")
db.execute("INSERT INTO local_invoices VALUES('attempt2')")
db.execute("UPDATE local_restaurant_orders SET settled_invoice='attempt2',revision=revision+1 WHERE id='o'")
db.execute("UPDATE local_restaurant_control SET phase='settled',revision=revision+1 WHERE order_id='o'")
refused("UPDATE local_restaurant_control SET phase='editable',revision=revision+1 WHERE order_id='o'")
db.execute("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('next','t','dine_in','open',1)")
print('SQLite recovery: conservative v15 migration, immutable attempt/parent identity, revision guards, current-attempt settlement and table release passed.')
