"""Actual migration/CAS/history guards; does not execute Rust permissions."""
from pathlib import Path
import re,runpy,sqlite3
root=Path(__file__).resolve().parents[1];m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']();db=m['build']([s for label,ddl in groups if label not in {'kitchen_staff','assignment_recovery','responsibility_access','session_signout'} for s in ddl]);m['seed'](db)
assert db.execute('PRAGMA user_version').fetchone()[0]==18
db.execute("INSERT INTO local_restaurant_orders(id,kind,state,revision) VALUES('legacy','takeaway','open',1)")
db.execute("INSERT INTO local_restaurant_tickets VALUES('legacy-kot','legacy','[]','pending',1)")
db.executescript((root/'packages/local-store/src/kitchen_staff-schema.sql').read_text())
assert db.execute('PRAGMA user_version').fetchone()[0]==19
assert db.execute("SELECT state,revision FROM local_restaurant_tickets WHERE id='legacy-kot'").fetchone()==('pending',1)
db.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) SELECT 'cook',business_id,'cook','Cook','cashier',1,1,'synthetic' FROM local_identity")
db.execute("INSERT INTO local_kitchen_staff VALUES('cook','preparer')")
db.execute("INSERT INTO local_restaurant_orders(id,kind,state,revision) VALUES('order','takeaway','open',1)")
db.execute("INSERT INTO local_restaurant_tickets VALUES('kot','order','[]','pending',1)")
source=(root/'packages/local-store/src/kitchen_staff.rs').read_text();sql=re.search(r'"(UPDATE local_restaurant_tickets SET revision=revision\+1[^";]+)"',source).group(1)
financial=['local_invoices','local_billing_ledger','local_retail_payments','local_credit_entries','local_products','local_restaurant_orders'];before={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial}
assert db.execute(sql,('kot',1)).rowcount==1;assert db.execute(sql,('kot',1)).rowcount==0
db.execute("INSERT INTO local_kitchen_ticket_staff VALUES('kot','cook')")
db.execute("INSERT INTO local_kitchen_staff_events(id,actor_id,ticket_id,request,result) VALUES('op','p1','kot','request','result')")
for attack in ["UPDATE local_kitchen_staff_events SET result='rewritten'","DELETE FROM local_kitchen_staff_events","INSERT INTO local_kitchen_staff_events(id,actor_id,request,result) VALUES('op','p1','other','other')"]:
 try:db.execute(attack)
 except sqlite3.IntegrityError:pass
 else:raise AssertionError(attack)
assert before=={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial}
db.execute("UPDATE local_restaurant_tickets SET state='served' WHERE id='kot'");assert db.execute(sql,('kot',2)).rowcount==0
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('Kitchen staff SQL passed: migration, assignment revision CAS, terminal guard, immutable audit, duplicate IDs and unchanged financial/order records.')
