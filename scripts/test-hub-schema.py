"""Run real hub DDL guards. This does not execute Rust, TLS or native RBAC."""
import runpy,sqlite3
from pathlib import Path
src=Path(__file__).resolve().parents[1]/'packages/local-store/src'
db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA recursive_triggers=ON')
db.executescript('CREATE TABLE local_principals(id TEXT PRIMARY KEY);CREATE TABLE local_restaurant_orders(id TEXT PRIMARY KEY);')
db.executescript((src/'hub-schema.sql').read_text())
db.executescript("INSERT INTO local_principals VALUES('staff');INSERT INTO local_restaurant_orders VALUES('order');INSERT INTO local_hub_devices(id,name,credential_hash,generation,state,actor_id,created,expires) VALUES('phone','Phone','hash','generation','approved','staff',0,200);")
# Acceptance and its batch must commit together, in either insertion order.
db.execute("INSERT INTO local_hub_batches VALUES('op','order','accepted snapshot',NULL)")
db.execute("INSERT INTO local_hub_operations VALUES('op','phone','staff','generation','payload','accepted',1)");db.commit()
def refused(sql):
 try: db.execute(sql)
 except sqlite3.IntegrityError: return
 raise AssertionError(sql)
for sql in ["UPDATE local_hub_operations SET request='other'", "DELETE FROM local_hub_operations", "INSERT OR REPLACE INTO local_hub_operations VALUES('op','phone','staff','generation','other','accepted',2)","UPDATE local_hub_batches SET items='repriced'", "DELETE FROM local_hub_batches"]:refused(sql)
db.execute("UPDATE local_hub_batches SET ticket_id='one-ticket' WHERE id='op'")
refused("UPDATE local_hub_batches SET ticket_id='duplicate-ticket' WHERE id='op'")
db.execute("INSERT INTO local_hub_sessions VALUES('token','phone',1,'staff',1,'generation',100)")
query="SELECT count(*) FROM local_hub_sessions s JOIN local_hub_devices d ON d.id=s.device_id WHERE s.token_hash='token' AND s.expires>? AND d.expires>? AND d.state='approved' AND d.revision=s.device_revision AND d.generation=s.generation AND d.actor_id=s.actor_id"
assert db.execute(query,(50,50)).fetchone()[0]==1
assert db.execute(query,(101,101)).fetchone()[0]==0
db.execute("UPDATE local_hub_devices SET state='revoked',revision=2")
assert db.execute(query,(50,50)).fetchone()[0]==0
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
assert db.execute('SELECT count(*) FROM local_hub_operations').fetchone()[0]==1
print('Hub SQLite: immutable operation/batch identity, deferred atomic linkage, one KOT linkage, revoked/expired session predicates passed.')

# Execute the actual desktop open-order SQL against the full migrated schema.
import re
m=runpy.run_path(str(src.parents[2]/'scripts/verify-local-schema.py'))
groups,_=m['load_migrations']();full=m['build']([sql for _,ddl in groups for sql in ddl])
source=(src/'restaurant.rs').read_text();sql=re.search(r'"(INSERT INTO local_restaurant_orders[^";]+)"',source).group(1)
full.execute(sql,('schema-order',None,'takeaway'))
assert full.execute("SELECT settled_invoice FROM local_restaurant_orders WHERE id='schema-order'").fetchone()[0] is None
for table in ['local_invoices','local_billing_ledger','local_restaurant_tickets']:
 assert full.execute(f'SELECT count(*) FROM {table}').fetchone()[0]==0
print('Desktop open-order SQL works after settlement-column migration without posting a sale or KOT.')
