"""Execute migration and recovery constraints, not Rust or SQLCipher authorization."""
from pathlib import Path
import runpy,sqlite3,json,re
root=Path(__file__).resolve().parents[1];m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']();db=m['build']([s for label,ddl in groups if label not in {'assignment_recovery','responsibility_access'} for s in ddl]);m['seed'](db);assert db.execute('PRAGMA user_version').fetchone()[0]==19
db.execute("INSERT INTO local_restaurant_orders(id,kind,state,revision) VALUES('order','takeaway','open',1)");db.execute("INSERT INTO local_restaurant_tickets VALUES('kot','order','[]','pending',1)");db.executescript((root/'packages/local-store/src/assignment_recovery-schema.sql').read_text());assert db.execute('PRAGMA user_version').fetchone()[0]==20
financial=['local_invoices','local_billing_ledger','local_retail_payments','local_credit_entries','local_products','local_restaurant_orders'];before={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial}
db.execute("INSERT INTO local_kitchen_assignment_ops(id,actor_id,generation,device,request,state) VALUES('op','p1','generation','desktop','immutable','prepared')");db.commit()
def refused(sql):
 try:db.execute(sql)
 except sqlite3.IntegrityError:pass
 else:raise AssertionError(sql)
refused("UPDATE local_kitchen_assignment_ops SET request='changed' WHERE id='op'")
refused("DELETE FROM local_kitchen_assignment_ops")
refused("UPDATE local_kitchen_assignment_ops SET acknowledged=1")
refused("INSERT INTO local_kitchen_assignment_ops(id,actor_id,generation,device,request,state) VALUES('another','p1','generation','desktop','other','prepared')")
# Actual assignment CAS is atomic with its recovery result; a crash rollback leaves prepared.
s=(root/'packages/local-store/src/kitchen_staff.rs').read_text();sql=re.search(r'"(UPDATE local_restaurant_tickets SET revision=revision\+1[^";]+)"',s).group(1)
db.execute('SAVEPOINT lost');assert db.execute(sql,('kot',1)).rowcount==1;db.execute("UPDATE local_kitchen_assignment_ops SET state='accepted',result='receipt' WHERE id='op'");db.execute('ROLLBACK TO lost');db.execute('RELEASE lost');assert db.execute("SELECT state FROM local_kitchen_assignment_ops").fetchone()[0]=='prepared';assert db.execute("SELECT revision FROM local_restaurant_tickets").fetchone()[0]==1
assert db.execute(sql,('kot',1)).rowcount==1;db.execute("UPDATE local_kitchen_assignment_ops SET state='accepted',result='receipt' WHERE id='op'");db.commit()
assert db.execute(sql,('kot',1)).rowcount==0
refused("UPDATE local_kitchen_assignment_ops SET result='different' WHERE id='op'")
refused("UPDATE local_kitchen_assignment_ops SET state='unknown',result=NULL WHERE id='op'")
db.execute("UPDATE local_kitchen_assignment_ops SET acknowledged=1 WHERE id='op'");refused("UPDATE local_kitchen_assignment_ops SET acknowledged=0 WHERE id='op'")
assert before=={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial}
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('Assignment recovery SQL passed: v19 migration, single pending scope, immutable identity/final result, rollback/replay CAS, final-only acknowledgement and unchanged financial/order records.')
