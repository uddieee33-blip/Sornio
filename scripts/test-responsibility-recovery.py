"""Run migration, actual responsibility CAS/session deletion and immutable receipts. Not Rust RBAC evidence."""
from pathlib import Path
import json,re,runpy
root=Path(__file__).resolve().parents[1];m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']();db=m['build']([s for label,ddl in groups if label not in {'responsibility_access','session_signout'} for s in ddl]);m['seed'](db);assert db.execute('PRAGMA user_version').fetchone()[0]==20
db.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) VALUES('cook','biz-test','cook','Cook','cashier',1,1,'synthetic')");db.execute("INSERT INTO local_kitchen_staff VALUES('cook','preparer')")
db.execute("INSERT INTO local_hub_devices(id,name,credential_hash,generation,state,actor_id,created,expires) VALUES('phone','Phone','hash','generation','approved','cook',0,9999999999)");db.execute("INSERT INTO local_hub_sessions VALUES('token','phone',1,'cook',1,'generation',9999999999)")
db.execute("INSERT INTO local_kitchen_assignment_ops(id,actor_id,generation,device,request,state) VALUES('existing-assignment','p1','old-generation','desktop','existing immutable payload','prepared')")
db.executescript((root/'packages/local-store/src/responsibility_access-schema.sql').read_text());assert db.execute('PRAGMA user_version').fetchone()[0]==21;assert db.execute('SELECT mode FROM local_kitchen_staff').fetchone()[0]=='preparer'
assert db.execute("SELECT request,state FROM local_kitchen_assignment_ops WHERE id='existing-assignment'").fetchone()==('existing immutable payload','prepared')
assert db.execute('SELECT count(*) FROM local_hub_sessions').fetchone()[0]==1
financial=['local_invoices','local_billing_ledger','local_retail_payments','local_credit_entries','local_products'];before={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial}
s=(root/'packages/local-store/src/kitchen_staff.rs').read_text();sql=re.search(r'"(UPDATE local_principals SET revision=revision\+1[^";]+)"',s).group(1);delete=re.search(r'"(DELETE FROM local_hub_sessions WHERE actor_id=\?1)"',s).group(1)
db.execute("INSERT INTO local_kitchen_assignment_ops(id,actor_id,generation,device,request,state) VALUES('change','p1','generation','desktop','original request','prepared')")
db.execute('SAVEPOINT interrupted');assert db.execute(sql,('cook',1,'biz-test')).rowcount==1;db.execute(delete,('cook',));db.execute('ROLLBACK TO interrupted');db.execute('RELEASE interrupted');assert db.execute('SELECT count(*) FROM local_hub_sessions').fetchone()[0]==1
assert db.execute(sql,('cook',1,'foreign')).rowcount==0;assert db.execute(sql,('cook',1,'biz-test')).rowcount==1;assert db.execute(sql,('cook',1,'biz-test')).rowcount==0
db.execute("UPDATE local_kitchen_staff SET mode='revoked' WHERE actor_id='cook'");db.execute(delete,('cook',));db.execute("UPDATE local_kitchen_assignment_ops SET state='accepted',result='recorded responsibility' WHERE id='change'");assert db.execute('SELECT count(*) FROM local_hub_sessions').fetchone()[0]==0
try:db.execute("UPDATE local_kitchen_assignment_ops SET result='other payload' WHERE id='change'")
except Exception:pass
else:raise AssertionError('Result rewrite accepted')
assert before=={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in financial};assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
# Recovery schema generation uses the exact canonical query and retains prior trusted schemas.
query="SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND NOT(type = 'table' AND name = 'sornio_backup_manifest') ORDER BY type,name"
for version,excluded in [(19,{'assignment_recovery','responsibility_access','session_signout'}),(20,{'responsibility_access','session_signout'})]:
 prior=m['build']([sql for label,ddl in groups if label not in excluded for sql in ddl]);rows=[list(row) for row in prior.execute(query)]
 if version==19:assert rows==json.loads((root/'packages/local-store/fixtures/recovery-v19-schema.json').read_text())
 else:assert rows==json.loads((root/'packages/local-store/fixtures/recovery-v20-schema.json').read_text())
print('Responsibility SQL passed: v20 upgrade, staff CAS/business scope, session invalidation, rollback/immutable result and unchanged financial records; trusted recovery control matched.')
